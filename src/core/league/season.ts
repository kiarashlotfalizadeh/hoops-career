// The season loop and phase machine.

import type { League, Player, ScheduledGame } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../types';
import { CAP } from '../constants';
import { Rng, clamp } from '../random';
import { GameSim } from '../sim/engine';
import { autoRotation, autoTactics } from '../ai/coachAI';
import { makeTeam } from '../teamFactory';
import { blankMood, playerAge } from '../playerGen';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, TWO_WAY_MAX, addInbox, addNews, curTeamSeason, payroll, playerName, prospects, standardRoster, teamName, teamPlayers, teamSeason, twoWayRoster, winPct, withRng } from './helpers';
import { generateSchedule } from './schedule';
import { advanceCup, cupState } from './cup';
import { ensureRotation, gamesOnDay, playGame } from './games';
import { aiTicketPrice, assessLuxuryTax, profit } from './finances';
import { updateMorale } from './morale';
import { annualProgression, inSeasonProgression, refreshDerived } from './progression';
import { computeRegularSeasonAwards, finalsMvp, gameScore, selectAllStars } from './awards';
import { champion, playInDone, processPlayInResult, processPlayoffResult, schedulePlayoffDay, startPlayIn, startPlayoffs } from './playoffs';
import { aiChoose, draftUntilUser, ensureFuturePicks, finishDraft, generateDraftClass, nextPick, rankProspects, runLottery, draftPlayer } from './draft';
import { aiResign, expiringPlayers, faDay, fillRosters, releaseExpiring, trimRosters } from './freeAgency';
import { askingContract, releasePlayer, resolveOptions, valueScore } from './contracts';
import { healOneGame } from './injuries';
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
  if (league.phase !== 'preseason') return ['The regular season starts from the preseason.'];
  const errs: string[] = [];
  // two-way players don't take one of the 15 spots or count toward the 13-man minimum
  const n = standardRoster(league, league.userTid).length;
  if (n > CAP.rosterMax) errs.push(`Your roster has ${n} players. Release or trade down to ${CAP.rosterMax}.`);
  if (n < CAP.rosterMin) errs.push(`Your roster has ${n} players. Sign at least ${CAP.rosterMin - n} more (minimum ${CAP.rosterMin}).`);
  const tw = twoWayRoster(league, league.userTid).length;
  if (tw > TWO_WAY_MAX) errs.push(`You have ${tw} two-way players (max ${TWO_WAY_MAX}). Release or convert ${tw - TWO_WAY_MAX}.`);
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
  for (const t of league.teams) if (t.tid !== league.userTid) t.budget.ticketPrice = aiTicketPrice(league, t);
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
  if (d % 7 === 0) {
    for (const t of league.teams) {
      updateMorale(league, t.tid, true);
      // assistant-managed teams re-fit their playbook to the healthy roster weekly
      if (!t.tactics.manual) t.tactics = autoTactics(t, teamPlayers(league, t.tid), true);
    }
  }
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

/**
 * Injuries heal one game per team game; players with no games to miss (free agents, and teams
 * idle in the postseason) recover by the calendar instead, about a game every other day. A team
 * mid-series (a game today or yesterday) heals through its games.
 */
function healIdle(league: League, rng: Rng) {
  if (league.day % 2 !== 0) return;
  const playing = new Set<number>();
  for (const g of league.schedule) if (g.day === league.day || g.day === league.day - 1) playing.add(g.home).add(g.away);
  for (const p of Object.values(league.players)) {
    if (!p.injury) continue;
    if (p.tid === FREE_AGENT || (p.tid >= 0 && league.phase !== 'regular' && !playing.has(p.tid))) healOneGame(league, p, rng);
  }
}

/** Called after any game result (including live games) is committed. */
export function postGame(league: League, g: ScheduledGame, homeWon: boolean) {
  if (g.type === 'playin') processPlayInResult(league, g, homeWon);
  if (g.type === 'playoffs') processPlayoffResult(league, g, homeWon);
}

export function advanceDay(league: League, report?: DayReport) {
  withRng(league, (rng) => {
    if (league.phase === 'regular') {
      advanceCup(league, rng);
      periodic(league, rng);
      if (league.day === league.allStarDay) {
        selectAllStars(league);
        playAllStarGame(league, rng);
      }
    }
    healIdle(league, rng);
  });
  // wear recovery, every day of the season and postseason
  for (const p of Object.values(league.players)) if (p.tid >= 0 && p.wear > 0) p.wear = Math.max(0, p.wear - 0.75);
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
  if (mine?.tax) addInbox(league, { from: 'Owner', subject: 'Luxury tax bill', body: `We paid $${(mine.tax / 1000).toFixed(1)}M in luxury tax this season. Make it count in the playoffs.`, tone: 'bad', link: '/finances' });
  if (mine?.shortfall) addInbox(league, { from: 'Owner', subject: 'Under the salary floor', body: `Our payroll finished $${(mine.shortfall / 1000).toFixed(1)}M under the salary floor, so we paid the difference to the players anyway. Spend it on talent next year.`, tone: 'bad', link: '/finances' });
  startPlayIn(league);
}

/** Hall of Fame points per award won in this league; 22 gets a player in. */
const HOF_POINTS: Record<string, number> = { MVP: 12, 'Finals MVP': 6, 'Defensive Player of the Year': 4, 'All-Star': 2, Champion: 1.5 };
const HOF_LINE = 22;

/**
 * Credit for a real player's career before the league began, which his awards here don't cover:
 * his production in the real seasons the seed carries (game score per game, raised with age since
 * a 37-year-old's numbers understate his prime, less a replacement-level 6) squared, times the
 * seasons he had played. LeBron James is worth almost three Hall of Fame lines; Durant, Curry,
 * Harden, Giannis, Kawhi and Davis one or more; a long-serving role player next to nothing.
 */
export function preLeagueLegacy(league: League, p: Player): number {
  const real = p.stats.filter((s) => s.real && !s.playoffs);
  const gp = real.reduce((a, s) => a + s.gp, 0);
  if (!gp) return 0;
  const age = playerAge(p, league.startSeason);
  const seasons = p.draft.year > 0 ? league.startSeason - 1 - p.draft.year : Math.max(0, age - 21);
  const gmsc = real.reduce((a, s) => a + gameScore(s), 0) / gp;
  // a short sample (injuries, a late arrival) counts for less
  const q = Math.max(0, gmsc * (1 + 0.05 * Math.max(0, age - 29)) - 6) * Math.min(1, gp / 100);
  return (seasons * q * q) / 260;
}

/** Hall of Fame score: awards won in the league plus a real player's earlier career. */
export function hallOfFameScore(league: League, p: Player): number {
  const awards = p.awards.reduce((s, a) => s + (HOF_POINTS[a.type] ?? (a.type.startsWith('All-NBA') ? 4 : 0)), 0);
  return awards + preLeagueLegacy(league, p);
}

function retirements(league: League, rng: Rng) {
  const retiredNow: string[] = [];
  for (const p of Object.values(league.players)) {
    if (p.tid === RETIRED || p.tid === DRAFT_PROSPECT) continue;
    const a = playerAge(p, league.season);
    let prob = 0;
    if (a >= 34) prob = 1 / (1 + Math.exp(-((a - 37.5) * 0.9 + (72 - p.ovr) * 0.18)));
    else if (p.tid === FREE_AGENT) {
      // nobody wanted him: unsigned veterans and fringe players move on
      const playedThisSeason = p.stats.some((s) => s.season === league.season && s.gp > 0);
      if (a >= 30 && p.ovr < 68) prob = 0.5;
      else if (p.ovr < 60) prob = 0.6;
      else if (!playedThisSeason && p.ovr < 70) prob = 0.45;
      else if (!playedThisSeason && a >= 27) prob = 0.25;
    }
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
      const score = hallOfFameScore(league, p);
      if (score >= HOF_LINE) {
        p.hof = true;
        p.awards.push({ season: league.season, type: 'Hall of Fame' });
      }
      // news: still a good player, or a decorated career (a few All-Star or All-NBA nods)
      if (p.ovr >= 76 || score >= 8 || wasTid === league.userTid) retiredNow.push(`${playerName(p)}${p.hof ? ' (Hall of Fame)' : ''}`);
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

// Phase transitions no-op (returning false) outside their phase, so a double tap or a stale
// dispatch can't skip a draft, a free agency or a whole season.

export function startDraft(league: League): boolean {
  if (league.phase !== 'draftLottery') return false;
  league.phase = 'draft';
  withRng(league, (rng) => draftUntilUser(league, rng));
  return true;
}

export function userDraftPick(league: League, pid: number): string | null {
  if (league.phase !== 'draft') return 'The draft is not on.';
  const dp = nextPick(league);
  if (!dp || dp.tid !== league.userTid) return 'It is not your pick.';
  draftPlayer(league, dp, pid);
  withRng(league, (rng) => draftUntilUser(league, rng));
  return null;
}

/** Let the staff make the user's current pick, then run AI picks until the user's next turn. */
export function autoDraftUserPick(league: League) {
  if (league.phase !== 'draft') return;
  withRng(league, (rng) => {
    const dp = nextPick(league);
    if (!dp || dp.tid !== league.userTid) return;
    const choice = aiChoose(league, dp.tid, rng);
    if (choice) draftPlayer(league, dp, choice.pid);
    draftUntilUser(league, rng);
  });
}

export function finishDraftPhase(league: League): boolean {
  if (league.phase !== 'draft') return false;
  withRng(league, (rng) => {
    draftUntilUser(league, rng, true);
    finishDraft(league);
    // option years are settled before re-signing: opt-outs and declines join the expiring list
    resolveOptions(league, rng);
  });
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
  return true;
}

export function startFreeAgency(league: League): boolean {
  if (league.phase !== 'resign') return false;
  withRng(league, (rng) => {
    // team options the user left open get the staff's default
    resolveOptions(league, rng, true);
    aiResign(league, rng);
    releaseExpiring(league);
    // pick-rich teams can come out of the draft above the offseason limit
    trimRosters(league, (p) => releasePlayer(league, p, { news: false }), OFFSEASON_ROSTER_MAX);
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
  return true;
}

export function faAdvance(league: League, days = 1) {
  if (league.phase !== 'freeAgency') return;
  // free agency lasts 30 days: "advance a week" near the end stops on the last day
  const n = Math.min(days, 30 - league.faDay);
  withRng(league, (rng) => {
    for (let i = 0; i < n; i++) {
      faDay(league, rng);
      league.faDay++;
    }
  });
}

export function newSeason(league: League): boolean {
  if (league.phase !== 'freeAgency') return false;
  // finish free agency quickly
  if (league.faDay < 30) faAdvance(league, 30 - league.faDay);
  const prevSeason = league.season;
  league.season++;
  league.phase = 'preseason';
  league.day = 0;
  league.games = league.games.filter((g) => g.season === prevSeason && (g.home.tid === league.userTid || g.away.tid === league.userTid)).map((g) => ({ ...g, pbp: undefined, shots: undefined, lineups: undefined, flow: undefined, flowPeriods: undefined }));
  league.playIn = [];
  league.playoffs = [];
  league.schedule = [];
  for (const t of league.teams) {
    const prev = t.seasons.find((s) => s.season === prevSeason);
    t.hype = clamp(t.hype * 0.85 + 0.075, 0.05, 1);
    // ticket prices keep pace with league revenue (AI teams reprice at opening night)
    t.budget.ticketPrice = Math.round(t.budget.ticketPrice * (1 + CAP.growth));
    teamSeason(t, league.season);
    void prev;
    t.deadMoney = t.deadMoney.filter((d) => d.season >= league.season);
  }
  withRng(league, (rng) => {
    // players age a year: development & experience (a season counts if he played in it, wherever
    // he is now; this summer's draftees start at 0)
    for (const p of Object.values(league.players)) {
      if (p.stats.some((s) => s.season === prevSeason && !s.playoffs && !s.real && s.gp > 0)) p.experience++;
      p.wear = 0;
      p.restedGames = 0;
      if (p.injury) {
        p.injury.gamesRemaining -= 35;
        if (p.injury.gamesRemaining <= 0) p.injury = null;
      }
      p.mood.score *= 0.5;
      // a request stands while he's still unhappy on a roster (opening night re-evaluates it)
      p.mood.tradeRequest &&= p.tid >= 0 && p.mood.score <= -2;
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
    league.cup = sched.cup ? cupState(sched.cup, league.season) : null;
  });
  for (const t of league.teams) {
    t.rotation.order = t.rotation.order.filter((pid) => league.players[pid]?.tid === t.tid);
    ensureRotation(league, t.tid);
  }
  // remaining unsigned prospects from older classes are cleaned up
  for (const p of prospects(league)) if (p.draft.year < league.season) delete league.players[p.pid];
  compactRetired(league);
  for (const p of Object.values(league.players)) refreshDerived(league, p);
  return true;
}

/**
 * Retirees stay for history and the Hall of Fame, but after two seasons only as career records:
 * those who never played a game go, the rest lose sim-only detail (ratings snapshots beyond peak
 * and final, tendencies, scouting, mood, on-court and shot-zone context in their stat lines).
 * Five seasons on, fringe careers without an award (under 100 games) leave too. Without this the
 * save grows by every retiree's full record.
 */
function compactRetired(league: League) {
  for (const p of Object.values(league.players)) {
    if (p.tid !== RETIRED || p.retiredSeason === undefined || league.season - p.retiredSeason <= 2) continue;
    const games = p.stats.reduce((a, s) => a + (s.playoffs ? 0 : s.gp), 0);
    if (!p.awards.length && (!p.stats.some((s) => s.gp > 0) || (games < 100 && league.season - p.retiredSeason >= 5))) {
      delete league.players[p.pid];
      continue;
    }
    const hist = p.ratingsHistory;
    if (hist.length > 2) {
      const peak = hist.reduce((a, h) => (h.ovr > a.ovr ? h : a));
      const last = hist[hist.length - 1];
      p.ratingsHistory = peak === last ? [last] : [peak, last];
    }
    // career tables still need team usage (USG) and plus-minus; on/off and shot zones only feed live seasons
    for (const s of p.stats) {
      s.onPoss = s.onPtsFor = s.onPtsAgainst = 0;
      s.rimM = s.rimA = s.midM = s.midA = 0;
      s.min = Math.round(s.min * 10) / 10;
    }
    delete p.tend;
    delete p.prospect;
    delete p.asking;
    delete p.faDays;
    p.injury = null;
    p.mood = blankMood();
  }
}

export function seasonSummary(league: League, tid: number) {
  const ts = curTeamSeason(league, tid);
  return { won: ts.won, lost: ts.lost, pct: winPct(ts), profit: profit(league, tid), value: valueScore };
}

export { rankProspects };
