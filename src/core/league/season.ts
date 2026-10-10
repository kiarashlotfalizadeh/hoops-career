// The season loop and phase machine.

import type { League, ScheduledGame } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../types';
import { CAP } from '../constants';
import { Rng, clamp } from '../random';
import { GameSim } from '../sim/engine';
import { autoRotation, autoTactics } from '../ai/coachAI';
import { makeTeam } from '../teamFactory';
import { playerAge } from '../playerGen';
import { CAP_FOR, addInbox, addNews, curTeamSeason, payroll, playerName, prospects, teamName, teamPlayers, teamSeason, winPct, withRng } from './helpers';
import { generateSchedule } from './schedule';
import { ensureRotation, gamesOnDay, playGame } from './games';
import { assessLuxuryTax, profit } from './finances';
import { updateMorale } from './morale';
import { annualProgression, inSeasonProgression, refreshDerived } from './progression';
import { computeRegularSeasonAwards, finalsMvp, selectAllStars } from './awards';
import { champion, playInDone, processPlayInResult, processPlayoffResult, schedulePlayoffDay, startPlayIn, startPlayoffs } from './playoffs';
import { draftUntilUser, ensureFuturePicks, finishDraft, generateDraftClass, nextPick, rankProspects, runLottery, draftPlayer } from './draft';
import { aiResign, expiringPlayers, faDay, fillRosters, releaseExpiring, trimRosters } from './freeAgency';
import { askingContract, releasePlayer, valueScore } from './contracts';
import { aiProposeToUser, aiToAiTrade, teamStrategyUpdate } from './trades';
import { ownerEvaluation } from './owner';

export interface DayReport {
  day: number;
  games: number;
  userGame?: number; // gid
  phaseChanged?: boolean;
  messages: string[];
}

export function regularGamesLeft(league: League) {
  return league.schedule.filter((g) => g.type === 'regular' && !g.played).length;
}

export function canStartRegularSeason(league: League): string[] {
  const errs: string[] = [];
  const n = teamPlayers(league, league.userTid).length;
  if (n > CAP.rosterMax) errs.push(`Your roster has ${n} players. Release or trade down to ${CAP.rosterMax}.`);
  if (n < CAP.rosterMin) errs.push(`Your roster has ${n} players. Sign at least ${CAP.rosterMin - n} more (minimum ${CAP.rosterMin}).`);
  return errs;
}

export function startRegularSeason(league: League): string[] {
  const errs = canStartRegularSeason(league);
  if (errs.length) return errs;
  withRng(league, (rng) => {
    trimRosters(league, (p) => releasePlayer(league, p, { news: false }));
    fillRosters(league, rng);
  });
  for (const t of league.teams) ensureRotation(league, t.tid);
  for (const t of league.teams) updateMorale(league, t.tid);
  league.phase = 'regular';
  league.day = 0;
  addInbox(league, {
    from: 'Assistant Coach',
    subject: 'Opening night',
    body: 'The regular season tips off. I will flag rotation and tactical issues as they come up, and scout every opponent before the game. Tap the next-game card on Home to see the scouting report.',
    tone: 'neutral',
    link: '/',
  });
  return [];
}

function periodic(league: League, rng: Rng) {
  const d = league.day;
  // wear recovery
  for (const p of Object.values(league.players)) if (p.tid >= 0 && p.wear > 0) p.wear = Math.max(0, p.wear - 0.75);
  if (d % 7 === 0) for (const t of league.teams) updateMorale(league, t.tid, true);
  if (d === 45 || d === 90 || d === 135) {
    const changes = inSeasonProgression(league, rng).filter((c) => league.players[c.pid].tid === league.userTid && c.delta !== 0);
    if (changes.length) {
      addInbox(league, {
        from: 'Player Development',
        subject: 'Development check-in',
        body: changes.map((c) => `${playerName(league.players[c.pid])}: ${c.delta > 0 ? '+' : ''}${c.delta} OVR`).join('\n'),
        tone: changes.reduce((a, c) => a + c.delta, 0) >= 0 ? 'good' : 'bad',
        link: '/roster',
      });
    }
  }
  if (d === league.tradeDeadlineDay - 3) {
    addInbox(league, { from: 'Assistant GM', subject: 'Trade deadline in 3 days', body: 'Any deals need to be done before the deadline. After that, only free agents can be added.', tone: 'alert', link: '/trade' });
  }
  if (d % 7 === 3) {
    faDay(league, rng, 0.25);
    fillRosters(league, rng);
  }
  aiToAiTrade(league, rng);
  aiProposeToUser(league, rng);
}

function playAllStarGame(league: League, rng: Rng) {
  const aw = league.awards.find((a) => a.season === league.season);
  if (!aw || !aw.allStars.E.length) return;
  const mk = (conf: 'E' | 'W', tidSlot: number) => {
    const team = makeTeam(tidSlot, league.season, rng);
    team.region = conf === 'E' ? 'Team' : 'Team';
    team.name = conf === 'E' ? 'East' : 'West';
    team.abbrev = conf === 'E' ? 'EAST' : 'WEST';
    const players = aw.allStars[conf].map((pid) => league.players[pid]).filter((p) => p && !p.injury);
    team.rotation = autoRotation(players);
    // spread minutes for an exhibition
    for (const p of players) team.rotation.minutes[p.pid] = 20;
    team.tactics = autoTactics(team, players, false);
    team.tactics.offense.pace = 92;
    team.tactics.defense.pressure = 15;
    team.tactics.defense.physicality = 10;
    return { team, players };
  };
  const east = mk('E', 0);
  const west = mk('W', 1);
  const sim = new GameSim(east, west, { rng, type: 'allstar', neutral: true, injuries: false });
  const res = sim.simToEnd();
  const mvpPid = res.pog;
  aw.allStarMvp = mvpPid;
  if (mvpPid !== undefined && league.players[mvpPid]) league.players[mvpPid].awards.push({ season: league.season, type: 'All-Star MVP' });
  const winner = res.home.pts > res.away.pts ? 'East' : 'West';
  addNews(league, {
    kind: 'award',
    text: `All-Star Game: ${winner} wins ${Math.max(res.home.pts, res.away.pts)}-${Math.min(res.home.pts, res.away.pts)}. MVP: ${mvpPid !== undefined ? playerName(league.players[mvpPid]) : '—'}.`,
    tids: [],
    pids: mvpPid !== undefined ? [mvpPid] : [],
  });
}

/**
 * Simulate one day. `skipGid` lets the UI play that game live and commit it separately.
 */
export function simDay(league: League, opts: { skipGid?: number; record?: boolean } = {}): DayReport {
  const report: DayReport = { day: league.day, games: 0, messages: [] };
  if (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') {
    if (league.phase === 'playoffs') schedulePlayoffDay(league);
    const games = gamesOnDay(league, league.day);
    for (const g of games) {
      if (g.gid === opts.skipGid) continue;
      const res = playGame(league, g, { record: opts.record && (g.home === league.userTid || g.away === league.userTid) });
      postGame(league, g, res.home.pts > res.away.pts);
      report.games++;
      if (g.home === league.userTid || g.away === league.userTid) report.userGame = g.gid;
    }
    if (opts.skipGid !== undefined && games.some((g) => g.gid === opts.skipGid && !g.played)) {
      // live game still pending: do not advance the day yet
      return report;
    }
    advanceDay(league, report);
  }
  return report;
}

/** Called after any game result (including live games) is committed. */
export function postGame(league: League, g: ScheduledGame, homeWon: boolean) {
  if (g.type === 'playin') processPlayInResult(league, g, homeWon);
  if (g.type === 'playoffs') processPlayoffResult(league, g, homeWon);
}

export function advanceDay(league: League, report?: DayReport) {
  withRng(league, (rng) => {
    if (league.phase === 'regular') {
      periodic(league, rng);
      if (league.day === league.allStarDay) {
        selectAllStars(league);
        playAllStarGame(league, rng);
      }
    }
  });
  league.day++;
  if (league.phase === 'regular' && regularGamesLeft(league) === 0) {
    endRegularSeason(league);
    if (report) report.phaseChanged = true;
  } else if (league.phase === 'playin' && playInDone(league)) {
    startPlayoffs(league);
    if (report) report.phaseChanged = true;
  } else if (league.phase === 'playoffs' && champion(league) !== undefined) {
    endPlayoffs(league);
    if (report) report.phaseChanged = true;
  }
}

function endRegularSeason(league: League) {
  computeRegularSeasonAwards(league);
  const bills = assessLuxuryTax(league);
  const mine = bills.find((b) => b.tid === league.userTid);
  if (mine) addInbox(league, { from: 'Owner', subject: 'Luxury tax bill', body: `We paid $${(mine.tax / 1000).toFixed(1)}M in luxury tax this season. Make it count in the playoffs.`, tone: 'bad', link: '/finances' });
  startPlayIn(league);
}

function retirements(league: League, rng: Rng) {
  const retiredNow: string[] = [];
  for (const p of Object.values(league.players)) {
    if (p.tid === RETIRED || p.tid === DRAFT_PROSPECT) continue;
    const a = playerAge(p, league.season);
    let prob = 0;
    if (a >= 34) prob = 1 / (1 + Math.exp(-((a - 37.5) * 0.9 + (72 - p.ovr) * 0.18)));
    else if (p.tid === FREE_AGENT && a >= 30 && p.ovr < 64) prob = 0.4;
    else if (p.tid === FREE_AGENT && p.ovr < 56) prob = 0.5;
    // players under contract rarely walk away
    if (p.tid >= 0 && p.contract.start + p.contract.salaries.length - 1 > league.season) prob *= 0.25;
    if (rng.chance(prob)) {
      const wasTid = p.tid;
      if (p.tid >= 0) {
        const t = league.teams[p.tid];
        t.rotation.order = t.rotation.order.filter((x) => x !== p.pid);
      }
      p.tid = RETIRED;
      p.retiredSeason = league.season;
      p.contract = { start: league.season + 1, salaries: [0] };
      // Hall of Fame: accolades-driven
      const score = p.awards.reduce((s, a) => s + (a.type === 'MVP' ? 12 : a.type.startsWith('All-NBA') ? 4 : a.type === 'All-Star' ? 2 : a.type === 'Champion' ? 1.5 : a.type === 'Finals MVP' ? 6 : a.type === 'Defensive Player of the Year' ? 4 : 0), 0);
      if (score >= 22) {
        p.hof = true;
        p.awards.push({ season: league.season, type: 'Hall of Fame' });
      }
      if (p.ovr >= 76 || p.hof || wasTid === league.userTid) retiredNow.push(`${playerName(p)}${p.hof ? ' (Hall of Fame)' : ''}`);
    }
  }
  if (retiredNow.length) addNews(league, { kind: 'retire', text: `Retirements: ${retiredNow.slice(0, 12).join(', ')}${retiredNow.length > 12 ? '…' : ''}.`, tids: [], pids: [] });
}

function endPlayoffs(league: League) {
  const champ = champion(league)!;
  const aw = league.awards.find((a) => a.season === league.season)!;
  aw.champion = champ;
  const finals = league.playoffs.find((s) => s.round === 4)!;
  aw.runnerUp = finals.high === champ ? finals.low : finals.high;
  aw.finalsMvp = finalsMvp(league, champ);
  if (aw.finalsMvp !== undefined) league.players[aw.finalsMvp].awards.push({ season: league.season, type: 'Finals MVP' });
  for (const p of teamPlayers(league, champ)) p.awards.push({ season: league.season, type: 'Champion' });
  addNews(league, { kind: 'award', text: `🏆 The ${teamName(league.teams[champ])} are ${league.season} NBA champions! Finals MVP: ${aw.finalsMvp !== undefined ? playerName(league.players[aw.finalsMvp]) : '—'}.`, tids: [champ], pids: aw.finalsMvp !== undefined ? [aw.finalsMvp] : [] });
  if (champ === league.userTid) {
    addInbox(league, { from: 'Owner', subject: 'CHAMPIONS!', body: 'You did it. The city is going to be partying for a week. Enjoy it, then let\'s do it again.', tone: 'good', link: '/history' });
  }
  ownerEvaluation(league);
  withRng(league, (rng) => {
    retirements(league, rng);
    league.phase = 'draftLottery';
    runLottery(league, rng);
  });
}

// ---------------------------------------------------------------- draft & offseason

export function startDraft(league: League) {
  league.phase = 'draft';
  withRng(league, (rng) => draftUntilUser(league, rng));
}

export function userDraftPick(league: League, pid: number): string | null {
  const dp = nextPick(league);
  if (!dp || dp.tid !== league.userTid) return 'It is not your pick.';
  draftPlayer(league, dp, pid);
  withRng(league, (rng) => draftUntilUser(league, rng));
  return null;
}

export function autoDraftUserPick(league: League) {
  withRng(league, (rng) => {
    const dp = nextPick(league);
    if (dp && dp.tid === league.userTid) draftUntilUser(league, rng, true);
  });
}

export function finishDraftPhase(league: League) {
  withRng(league, (rng) => draftUntilUser(league, rng, true));
  finishDraft(league);
  league.phase = 'resign';
  const exp = expiringPlayers(league, league.userTid);
  for (const p of exp) {
    p.asking = askingContract(league, p, league.userTid);
  }
  addInbox(league, {
    from: 'Assistant GM',
    subject: 'Re-signing period',
    body: exp.length
      ? `You have ${exp.length} expiring contract${exp.length > 1 ? 's' : ''}: ${exp.map((p) => `${playerName(p)} (${p.ovr})`).join(', ')}. Negotiate in Re-sign Players before free agency opens, or they hit the market.`
      : 'No expiring contracts this summer. Free agency opens next.',
    tone: 'neutral',
    link: '/resign',
  });
}

export function startFreeAgency(league: League) {
  withRng(league, (rng) => {
    aiResign(league, rng);
    releaseExpiring(league);
    league.phase = 'freeAgency';
    league.faDay = 0;
    faDay(league, rng, 1.2);
  });
  const cap = CAP_FOR(league, league.season + 1);
  const space = cap.salaryCap - payroll(league, league.userTid, league.season + 1);
  addInbox(league, {
    from: 'Assistant GM',
    subject: 'Free agency is open',
    body: `You have ${space > 0 ? `$${(space / 1000).toFixed(1)}M in cap space` : 'no cap space (minimum contracts only)'} for next season. Top free agents sign quickly; offers at or above a player's asking price are accepted immediately.`,
    tone: 'neutral',
    link: '/free-agents',
  });
}

export function faAdvance(league: League, days = 1) {
  withRng(league, (rng) => {
    for (let i = 0; i < days; i++) {
      faDay(league, rng);
      league.faDay++;
    }
  });
}

export function newSeason(league: League) {
  // finish free agency quickly
  if (league.faDay < 30) faAdvance(league, 30 - league.faDay);
  const prevSeason = league.season;
  league.season++;
  league.phase = 'preseason';
  league.day = 0;
  league.games = league.games.filter((g) => g.season === prevSeason && (g.home.tid === league.userTid || g.away.tid === league.userTid)).map((g) => ({ ...g, pbp: undefined, shots: undefined, lineups: undefined, flow: undefined }));
  league.playIn = [];
  league.playoffs = [];
  league.schedule = [];
  for (const t of league.teams) {
    const prev = t.seasons.find((s) => s.season === prevSeason);
    t.hype = clamp(t.hype * 0.85 + 0.075, 0.05, 1);
    teamSeason(t, league.season);
    void prev;
    t.deadMoney = t.deadMoney.filter((d) => d.season >= league.season);
  }
  withRng(league, (rng) => {
    // players age a year: development & experience
    for (const p of Object.values(league.players)) {
      if (p.tid >= 0) p.experience++;
      p.wear = 0;
      p.restedGames = 0;
      if (p.injury) {
        p.injury.gamesRemaining -= 35;
        if (p.injury.gamesRemaining <= 0) p.injury = null;
      }
      p.mood.score *= 0.5;
      p.mood.tradeRequest = false;
    }
    const prog = annualProgression(league, rng);
    const mine = prog.filter((x) => league.players[x.pid]?.tid === league.userTid).sort((a, b) => b.delta - a.delta);
    if (mine.length) {
      const fmt = (x: { pid: number; delta: number }) => `${playerName(league.players[x.pid])} ${x.delta > 0 ? '+' : ''}${x.delta} (now ${league.players[x.pid].ovr})`;
      addInbox(league, {
        from: 'Player Development',
        subject: 'Training camp report',
        body: `Biggest risers: ${mine.slice(0, 3).map(fmt).join(', ')}.\nBiggest drops: ${mine.slice(-3).reverse().map(fmt).join(', ')}.`,
        tone: 'neutral',
        link: '/roster',
      });
    }
    ensureFuturePicks(league, league.season + 4);
    generateDraftClass(league, league.season, rng);
    fillRosters(league, rng);
    teamStrategyUpdate(league);
    const sched = generateSchedule(league.teams, league.season, rng, league.nextGid);
    league.schedule = sched.games;
    league.nextGid += sched.games.length;
    league.regularSeasonDays = sched.lastDay;
    league.allStarDay = sched.allStarDay;
    league.tradeDeadlineDay = sched.tradeDeadlineDay;
  });
  for (const t of league.teams) {
    t.rotation.order = t.rotation.order.filter((pid) => league.players[pid]?.tid === t.tid);
    ensureRotation(league, t.tid);
  }
  // remaining unsigned prospects from older classes are cleaned up
  for (const p of prospects(league)) if (p.draft.year < league.season) delete league.players[p.pid];
  for (const p of Object.values(league.players)) refreshDerived(league, p);
}

export function seasonSummary(league: League, tid: number) {
  const ts = curTeamSeason(league, tid);
  return { won: ts.won, lost: ts.lost, pct: winPct(ts), profit: profit(league, tid), value: valueScore };
}

export { rankProspects };
