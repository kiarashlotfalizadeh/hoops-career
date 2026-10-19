// The season loop and phase machine.

import type { League, Player, ScheduledGame } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../types';
import { CAP } from '../constants';
import { Rng, clamp } from '../random';
import { GameSim } from '../sim/engine';
import { autoRotation, autoTactics } from '../ai/coachAI';
import { makeTeam } from '../teamFactory';
import { blankMood, contractExp, playerAge } from '../playerGen';
import {
  OFFSEASON_ROSTER_MAX,
  TWO_WAY_MAX,
  addInbox,
  addNews,
  andList,
  dateToDay,
  playerName,
  prospects,
  standardRoster,
  teamName,
  teamPlayers,
  teamSeason,
  twoWayRoster,
  withRng,
} from './helpers';
import { generateSchedule } from './schedule';
import { advanceCup, cupState } from './cup';
import { ensureRotation, gamesOnDay, playGame } from './games';
import { freezeRecordNames, holdsSeasonRecord } from './records';
import { TAX_SHARE_TO_NON_TAXPAYERS, aiTicketPrice, assessLuxuryTax, shareRevenue } from './finances';
import { resolvePromises, settleExpiringPromises, updateMorale } from './morale';
import { annualProgression, inSeasonProgression, refreshDerived } from './progression';
import { computeRegularSeasonAwards, finalsMvp, gameScore, missesAllStarGame, selectAllStars } from './awards';
import { allStarSaturday } from './allStarSaturday';
import { champion, playInDone, processPlayInResult, processPlayoffResult, schedulePlayoffDay, startPlayIn, startPlayoffs } from './playoffs';
import { confStandings } from './standings';
import { aiChoose, draftUntilUser, ensureFuturePicks, finishDraft, generateDraftClass, nextPick, runLottery, draftPlayer } from './draft';
import { FA_DAYS, aiExtensions, aiResign, expiringPlayers, faDay, fillRosters, releaseExpiring, resolveBids, trimRosters } from './freeAgency';
import { MATCH_DAYS, acceptQualifyingOffers, resolveOfferSheets, restrictedFreeAgents } from './rfa';
import {
  FIRED_REASON,
  aiBuyouts,
  askingContract,
  capSpace,
  extensionAsk,
  extensionBlockedReason,
  extensionRefusal,
  leaveTeam,
  releasePlayer,
  resolveOptions,
  resolveWaivers,
} from './contracts';
import { healOneGame } from './injuries';
import { bookTradedCash } from './trades';
import { aiToAiTrade, teamStrategyUpdate } from './aiTrades';
import { aiProposals, cleanProposals, draftProposals, freeAgencyProposals, openingProposal } from './proposals';
import { tenDayDaily } from './tenDay';
import { deadlineDay } from './deadline';
import { ownerEvaluation } from './owner';
import { ownerCheckIn, setOwnerGoals } from './ownerGoals';
import { coachingCarousel } from './coaches';
import { makeJobOffers } from './jobs';
import { clearAllPlans } from './gamePlans';
import { pruneTransactions } from './transactions';
import { retireNumbers } from './jerseys';
import { recordTrail } from '../analysis/odds';
import { realCareerOnRecord } from '../analysis/milestones';
import { money } from '../format';

export function regularGamesLeft(league: League) {
  return league.schedule.filter((g) => g.type === 'regular' && !g.played).length;
}

export function canStartRegularSeason(league: League): string[] {
  if (league.phase !== 'preseason') return ['The regular season starts from the preseason.'];
  if (league.fired) return [FIRED_REASON];
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
  aiExtensions(league);
  league.phase = 'regular';
  league.day = 0;
  // a trade promised over the summer is due by opening night
  resolvePromises(league);
  // (no "the season tips off" mail: Today says it, and the staff's advice comes through its feed)
  // the owner sets the season's goals from the roster the team opens with (frozen for the season)
  setOwnerGoals(league);
  cleanProposals(league);
  openingProposal(league);
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
        link: '/team',
      });
    }
  }
  // (the deadline has one mail, its deadline-day briefing (deadline.ts); the Office counts the days down)
  if (d % 7 === 3) {
    faDay(league, rng, 0.25);
    fillRosters(league, rng);
  }
  // front offices reassess as the record takes shape: a contender at 10-30 starts selling
  if (d === 30 || d === 60 || d === league.tradeDeadlineDay - 5) teamStrategyUpdate(league);
  // the day after the deadline, rebuilders let some veterans go to contenders
  if (d === league.tradeDeadlineDay + 1) aiBuyouts(league);
  aiToAiTrade(league, rng);
  // (offers to the user draw on their own random stream)
  aiProposals(league);
  // the user's playoff and title odds, once a week (the forecast draws on a stream of its own)
  if (d % 7 === 6) recordTrail(league);
  // the owner's word when the team falls off pace, and his check-in at the All-Star break
  ownerCheckIn(league);
}

function playAllStarGame(league: League, rng: Rng) {
  const aw = league.awards.find((a) => a.season === league.season);
  if (!aw || !aw.allStars.E.length) return;
  const mk = (conf: 'E' | 'W', tidSlot: number) => {
    const team = makeTeam(tidSlot, league.season, rng);
    team.region = 'Team';
    team.name = conf === 'E' ? 'East' : 'West';
    team.abbrev = conf === 'E' ? 'EAST' : 'WEST';
    const players = aw.allStars[conf].map((pid) => league.players[pid]).filter((p) => p && !missesAllStarGame(p));
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
export function simDay(league: League, opts: { skipGid?: number } = {}) {
  if (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') {
    if (league.phase === 'playoffs') schedulePlayoffDay(league);
    const games = gamesOnDay(league, league.day);
    for (const g of games) {
      if (g.gid === opts.skipGid) continue;
      const res = playGame(league, g);
      postGame(league, g, res.home.pts > res.away.pts);
    }
    if (opts.skipGid !== undefined && games.some((g) => g.gid === opts.skipGid && !g.played)) {
      // live game still pending: do not advance the day yet
      return;
    }
    advanceDay(league);
  }
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

export function advanceDay(league: League) {
  withRng(league, (rng) => {
    if (league.phase === 'regular') {
      advanceCup(league, rng);
      periodic(league, rng);
      if (league.day === league.allStarDay) {
        selectAllStars(league);
        // a knock short enough to keep an All-Star his place heals over the break, for everyone
        for (const p of Object.values(league.players)) if (p.tid >= 0 && p.injury && !missesAllStarGame(p)) while (p.injury) healOneGame(league, p, rng);
        // the Three-Point and Slam Dunk Contests, on a random stream of their own
        allStarSaturday(league);
        playAllStarGame(league, rng);
      }
    }
    healIdle(league, rng);
  });
  // wear recovery, every day of the season and postseason (a player waived worn down recovers too)
  for (const p of Object.values(league.players)) if (p.tid >= FREE_AGENT && p.wear > 0) p.wear = Math.max(0, p.wear - 0.75);
  // an assistant-run rotation follows today's injuries and recoveries now, not at the next game:
  // the Rotation screen and the assistant's advice read it in between (a star just cleared read
  // "only playing 0 minutes", with a starting five he wasn't in)
  if (!league.teams[league.userTid].rotation.manual) ensureRotation(league, league.userTid);
  league.day++;
  // game-time decisions for a game whose day has passed (or that is gone) are over
  const gt = league.gameTime;
  if (gt && !league.schedule.some((g) => g.gid === gt.gid && !g.played && g.day >= league.day)) delete league.gameTime;
  // released players whose days on waivers are up are claimed or clear to free agency
  resolveWaivers(league);
  // promises to the user's players that are due (a bigger role, a trade by the deadline, patience)
  resolvePromises(league);
  // 10-day contracts that are up end, and AI teams short of healthy players sign them
  tenDayDaily(league);
  if (league.phase === 'regular' && regularGamesLeft(league) === 0) endRegularSeason(league);
  else if (league.phase === 'playin' && playInDone(league)) startPlayoffs(league);
  else if (league.phase === 'playoffs' && champion(league) !== undefined) endPlayoffs(league);
  // trade offers that expired or stopped being valid go, then the deadline's rumors, briefing and recap
  cleanProposals(league);
  deadlineDay(league);
}

function endRegularSeason(league: League) {
  computeRegularSeasonAwards(league);
  // revenue sharing first: the tax pot is shared on top of it
  const shared = shareRevenue(league).get(league.userTid) ?? 0;
  const bills = assessLuxuryTax(league);
  seasonBooksMail(league, shared, bills);
  startPlayIn(league);
}

/**
 * The regular season's books in one mail: what revenue sharing paid or cost, the luxury tax paid
 * (with the owner's word on it, by where the team finished) or the share of the league's tax pot
 * received, and a payroll short of the salary floor. Nothing when none of it moved $0.5M.
 */
function seasonBooksMail(league: League, shared: number, bills: ReturnType<typeof assessLuxuryTax>) {
  const mine = bills.find((b) => b.tid === league.userTid);
  const taxpayers = bills.filter((b) => b.tax > 0);
  // the pot's share each team under the tax line received (see assessLuxuryTax)
  const share = mine?.tax ? 0 : (taxpayers.reduce((a, b) => a + b.tax, 0) * TAX_SHARE_TO_NON_TAXPAYERS) / Math.max(1, league.teams.length - taxpayers.length);
  const lines: string[] = [];
  if (Math.abs(shared) >= 500)
    lines.push(
      shared > 0
        ? `Revenue sharing paid us ${money(shared)}: our local revenue (gate, merchandise, local TV) came in below the league average.`
        : `We paid ${money(-shared)} into revenue sharing: our local revenue (gate, merchandise, local TV) beat the league average.`,
    );
  if (mine?.tax) {
    // the seeds are final: in the top six, in the play-in or out
    const rank = confStandings(league, league.teams[league.userTid].conf).findIndex((r) => r.tid === league.userTid) + 1;
    const word =
      rank <= 6
        ? 'Make it count in the playoffs.'
        : rank <= 10
          ? 'We still have to get through the play-in. Make it count.'
          : "For a team that missed the postseason. That can't happen again.";
    lines.push(`We paid ${money(mine.tax)} in luxury tax. The owner: "${word}"`);
  } else if (share >= 500) lines.push(`Our share of the league's luxury tax: ${money(share)}.`);
  if (mine?.shortfall)
    lines.push(`Our payroll finished ${money(mine.shortfall)} under the salary floor, so we paid the difference to the players anyway. Spend it on talent next year.`);
  if (!lines.length) return;
  addInbox(league, {
    from: 'Front Office',
    subject: "The season's books",
    body: lines.join('\n'),
    tone: mine?.tax || mine?.shortfall ? 'bad' : shared + share > 0 ? 'good' : 'neutral',
    link: '/office/finances',
  });
}

/** Hall of Fame points per award won in this league; 22 gets a player in. */
const HOF_POINTS: Record<string, number> = { MVP: 12, 'Finals MVP': 6, 'Defensive Player of the Year': 4, 'All-Star': 2, Champion: 1.5 };
const HOF_LINE = 22;

/**
 * Credit for a real player's career before the league began, which his awards here don't cover.
 * With his whole career on record (a league seeded with every season since 2003-04): each real
 * season's game score per game above a replacement-level 6, discounted below 41 games, squared and
 * summed, so a peak counts for more than a long run of solid seasons. LeBron James is worth about
 * three Hall of Fame lines; Durant, Harden, Giannis, Jokic, Davis and Curry one and a half or more;
 * Doncic, Embiid, Lillard, Westbrook, Butler, Gilgeous-Alexander and Leonard one (14 in all); Irving,
 * Towns and DeRozan just short; a long-serving role player next to nothing. With only his last three seasons on
 * record (a league seeded with those alone): their production, raised with age since a 37-year-old's
 * numbers understate his prime, squared, times the seasons he had played.
 */
export function preLeagueLegacy(league: League, p: Player): number {
  const real = p.stats.filter((s) => s.real && !s.playoffs);
  const gp = real.reduce((a, s) => a + s.gp, 0);
  if (!gp) return 0;
  if (realCareerOnRecord(league, p)) {
    // a season split between teams counts whole
    const seasons = new Map<number, { gp: number; gmsc: number }>();
    for (const s of real) {
      const x = seasons.get(s.season) ?? { gp: 0, gmsc: 0 };
      x.gp += s.gp;
      x.gmsc += gameScore(s);
      seasons.set(s.season, x);
    }
    let sum = 0;
    for (const x of seasons.values()) if (x.gp) sum += (Math.max(0, x.gmsc / x.gp - 6) * Math.min(1, x.gp / 41)) ** 2;
    return sum / 86;
  }
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
    if (p.tid >= 0 && contractExp(p.contract) > league.season) prob *= 0.25;
    if (rng.chance(prob)) {
      const wasTid = p.tid;
      if (p.tid >= 0) leaveTeam(league.teams[p.tid], p.pid);
      p.tid = RETIRED;
      p.retiredSeason = league.season;
      p.contract = { start: league.season + 1, salaries: [0] };
      const score = hallOfFameScore(league, p);
      if (score >= HOF_LINE) {
        p.hof = true;
        p.awards.push({ season: league.season, type: 'Hall of Fame' });
      }
      // the franchises he was a legend for retire his number
      retireNumbers(league, p);
      // news: still a good player, or a decorated career (a few All-Star or All-NBA nods)
      if (p.ovr >= 76 || score >= 8 || wasTid === league.userTid) retiredNow.push(`${playerName(p)}${p.hof ? ' (Hall of Fame)' : ''}`);
    }
  }
  if (retiredNow.length)
    addNews(league, {
      kind: 'retire',
      text: `Retirements: ${retiredNow.slice(0, 12).join(', ')}${retiredNow.length > 12 ? `, and ${retiredNow.length - 12} more` : ''}.`,
      tids: [],
      pids: [],
    });
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
  addNews(league, {
    kind: 'award',
    text: `🏆 The ${teamName(league.teams[champ])} are ${league.season} NBA champions! Finals MVP: ${aw.finalsMvp !== undefined ? playerName(league.players[aw.finalsMvp]) : '—'}.`,
    tids: [champ],
    pids: aw.finalsMvp !== undefined ? [aw.finalsMvp] : [],
  });
  if (champ === league.userTid) {
    addInbox(league, {
      from: 'Owner',
      subject: 'CHAMPIONS!',
      body: "You did it. The city is going to be partying for a week. Enjoy it, then let's do it again.",
      tone: 'good',
      link: '/league/history',
    });
  }
  // a promise that can't run its games before his deal is up ends with the season
  settleExpiringPromises(league);
  ownerEvaluation(league);
  // AI owners review their coaches too (on a random stream of their own), and the teams that changed look at the user
  makeJobOffers(league, coachingCarousel(league));
  withRng(league, (rng) => {
    retirements(league, rng);
    league.phase = 'draftLottery';
    runLottery(league, rng);
  });
}

// ---------------------------------------------------------------- draft & offseason

// Phase transitions no-op (returning false) outside their phase, so a double tap or a stale
// dispatch can't skip a draft, a free agency or a whole season, and while the coach is fired: the
// league waits until he takes over another team. The summer has dates too, so offseason news and
// mail carry the draft's and free agency's dates rather than Finals night.

/**
 * After a pick (or a trade) on draft night: the AI picks run until the user is on the clock again,
 * unless the user stops the draft before every pick (settings.draftPause); then teams that want
 * the user's first-rounder call.
 */
export function continueDraft(league: League) {
  if (league.phase !== 'draft' || league.fired) return;
  if (!league.settings.draftPause) withRng(league, (rng) => draftUntilUser(league, rng));
  draftProposals(league);
}

export function startDraft(league: League): boolean {
  if (league.phase !== 'draftLottery' || league.fired) return false;
  league.phase = 'draft';
  // the summer's job offers go with the draft
  delete league.jobOffers;
  // draft night: late June, or the day after a late Finals
  league.day = Math.max(league.day + 1, dateToDay(league.season, 5, 25));
  cleanProposals(league);
  continueDraft(league);
  return true;
}

export function userDraftPick(league: League, pid: number): string | null {
  if (league.phase !== 'draft') return 'The draft is not on.';
  if (league.fired) return FIRED_REASON;
  const dp = nextPick(league);
  if (!dp || dp.tid !== league.userTid) return 'It is not your pick.';
  // (a stale board or a double tap can name a player who has just been taken)
  const p = league.players[pid];
  if (p?.tid !== DRAFT_PROSPECT || p.draft.year !== league.season) return `${p ? playerName(p) : 'That player'} is no longer on the board.`;
  draftPlayer(league, dp, pid);
  continueDraft(league);
  return null;
}

/** Let the staff make the user's current pick, then run AI picks until the user's next turn (or the next pick, with the draft paused). */
export function autoDraftUserPick(league: League) {
  if (league.phase !== 'draft' || league.fired) return;
  const dp = nextPick(league);
  if (!dp || dp.tid !== league.userTid) return;
  withRng(league, (rng) => {
    const choice = aiChoose(league, dp.tid, rng);
    if (choice) draftPlayer(league, dp, choice.pid);
  });
  continueDraft(league);
}

/** The AI team on the clock makes its pick: exactly one (false when it's the user's pick, or no draft is on). */
export function draftNextPick(league: League): boolean {
  if (league.phase !== 'draft' || league.fired) return false;
  const dp = nextPick(league);
  if (!dp || dp.tid === league.userTid) return false;
  withRng(league, (rng) => {
    const choice = aiChoose(league, dp.tid, rng);
    if (choice) draftPlayer(league, dp, choice.pid);
    else league.draftPicks = league.draftPicks.filter((d) => d.dpid !== dp.dpid);
  });
  draftProposals(league);
  return true;
}

export function finishDraftPhase(league: League): boolean {
  if (league.phase !== 'draft' || league.fired) return false;
  withRng(league, (rng) => {
    draftUntilUser(league, rng, true);
    finishDraft(league);
    // option years are settled before re-signing: opt-outs and declines join the expiring list
    resolveOptions(league, rng);
  });
  league.phase = 'resign';
  league.day++;
  cleanProposals(league);
  const exp = expiringPlayers(league, league.userTid);
  for (const p of exp) {
    p.asking = askingContract(league, p, league.userTid);
  }
  addInbox(league, {
    from: 'Assistant GM',
    subject: 'Re-signing period',
    body: exp.length
      ? `You have ${exp.length} expiring contract${exp.length > 1 ? 's' : ''}: ${exp.map((p) => `${playerName(p)} (${p.ovr})`).join(', ')}. Negotiate in Re-sign Players before free agency opens, or ${exp.length > 1 ? 'they hit' : 'he hits'} the market.`
      : 'No expiring contracts this summer. Free agency opens next.',
    tone: 'neutral',
    link: '/office/resign',
  });
  return true;
}

export function startFreeAgency(league: League): boolean {
  if (league.phase !== 'resign' || league.fired) return false;
  withRng(league, (rng) => {
    // team options the user left open get the staff's default
    resolveOptions(league, rng, true);
    aiResign(league, rng);
    releaseExpiring(league);
    // pick-rich teams can come out of the draft above the offseason limit
    trimRosters(league, (p) => releasePlayer(league, p, { news: false }), OFFSEASON_ROSTER_MAX);
    league.phase = 'freeAgency';
    league.faDay = 0;
    // the market opens on June 30: the user gets the first look, and AI teams move from day 2
    league.day = Math.max(league.day + 1, dateToDay(league.season, 5, 30));
  });
  // (net of the cap holds the user's restricted free agents keep through free agency)
  const space = capSpace(league, league.userTid, league.season + 1);
  const rfas = restrictedFreeAgents(league, league.userTid);
  addInbox(league, {
    from: 'Assistant GM',
    subject: 'Free agency is open',
    body: `You have ${space > 0 ? `${money(space)} in cap space` : 'no cap space (minimum contracts only)'} for next season${rfas.length > 1 ? " after your restricted free agents' cap holds" : rfas.length ? " after your restricted free agent's cap hold" : ''}. You get the first look: AI teams start signing tomorrow. Top free agents weigh competing offers for a day or two; anyone else accepts an offer at or above his asking price on the spot. Restricted free agents sign offer sheets their team can match within ${MATCH_DAYS} days.${
      rfas.length
        ? `\nYour restricted free agent${rfas.length > 1 ? 's' : ''}: ${andList(rfas.map(playerName))}. Re-sign ${rfas.length > 1 ? 'them' : 'him'} with Bird rights any time before an offer sheet comes in, or match one; unsigned when the market closes, ${rfas.length > 1 ? 'each takes his' : 'he takes his'} qualifying offer.`
        : ''
    }`,
    tone: 'neutral',
    link: '/office/free-agents',
  });
  cleanProposals(league);
  // with room under the cap, taxpayers call to dump salary (with picks attached)
  freeAgencyProposals(league);
  return true;
}

export { FA_DAYS };
/** The free-agency day the market is on, 1 to FA_DAYS. */
export const faDayNumber = (league: League) => Math.min(FA_DAYS, league.faDay + 1);
/** Whether free agency has reached its last day (no more days to advance). */
export const faOver = (league: League) => league.faDay >= FA_DAYS - 1;

/**
 * Advance free agency `days` days ("advance a week" near the end stops on the last day). While an
 * offer sheet on one of the user's restricted free agents waits for his call (signed on the day just
 * played, or still pending from before), it goes one day at a time: only he can match it, and a run
 * of days would go through his last day to match it without a stop. Leaving it unanswered, day by
 * day, still lets him go when its time runs out.
 */
export function faAdvance(league: League, days = 1) {
  if (league.phase !== 'freeAgency') return;
  const n = Math.max(0, Math.min(days, FA_DAYS - 1 - league.faDay));
  withRng(league, (rng) => {
    for (let i = 0; i < n; i++) {
      if (i > 0 && newSeasonBlockedReason(league)) break;
      league.day++;
      // the opening rush comes the day after the user's first look
      faDay(league, rng, league.faDay === 0 ? 1.2 : 1);
      league.faDay++;
    }
  });
  cleanProposals(league);
}

/** Why the new season can't start yet, or null: an offer sheet on one of the user's restricted free agents waits for his call. */
export function newSeasonBlockedReason(league: League): string | null {
  if (league.phase !== 'freeAgency' || league.fired) return null;
  const p = restrictedFreeAgents(league, league.userTid).find((x) => x.rfa!.sheet);
  return p ? `${league.teams[p.rfa!.sheet!.tid].abbrev} signed ${playerName(p)} to an offer sheet: match it or let him go first.` : null;
}

export function newSeason(league: League): boolean {
  if (league.phase !== 'freeAgency' || league.fired || newSeasonBlockedReason(league)) return false;
  // finish free agency quickly (it stops for an offer sheet on one of the user's restricted free agents)
  if (!faOver(league)) faAdvance(league, FA_DAYS);
  if (!faOver(league) || newSeasonBlockedReason(league)) return false;
  // offers made on the last day are decided as the market closes, then the offer sheets still
  // pending, and the restricted free agents left take their qualifying offers
  resolveBids(league);
  delete league.faBids;
  resolveOfferSheets(league);
  acceptQualifyingOffers(league);
  const prevSeason = league.season;
  league.season++;
  league.phase = 'preseason';
  league.day = 0;
  // extensions start: the new deal replaces the one that ran out (no rookie scale, no option)
  for (const p of Object.values(league.players)) {
    const c = p.contract;
    if (c.next && c.start + c.salaries.length <= league.season) p.contract = { start: c.start + c.salaries.length, salaries: c.next.salaries };
  }
  league.games = league.games
    .filter((g) => g.season === prevSeason && (g.home.tid === league.userTid || g.away.tid === league.userTid))
    // (lineups stay, about 1.4 KB a game: the lineup screen looks back a season)
    .map((g) => ({ ...g, pbp: undefined, shots: undefined, flow: undefined, flowPeriods: undefined, flowT: undefined, flowPoss: undefined }));
  league.playIn = [];
  league.playoffs = [];
  league.schedule = [];
  // game plans were for last season's opponents as they were
  clearAllPlans(league);
  pruneTransactions(league);
  for (const t of league.teams) {
    t.hype = clamp(t.hype * 0.85 + 0.075, 0.05, 1);
    // ticket prices keep pace with league revenue (AI teams reprice at opening night)
    t.budget.ticketPrice = Math.round(t.budget.ticketPrice * (1 + CAP.growth));
    teamSeason(t, league.season);
    t.deadMoney = t.deadMoney.filter((d) => d.season >= league.season);
  }
  // cash traded over the summer goes on the new season's books
  bookTradedCash(league);
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
      // last season's contract talks with the user and 10-day count are over (the summer's talks are about this season)
      if (p.talks && p.talks.season < league.season) delete p.talks;
      if (p.tenDays && p.tenDays.season < league.season) delete p.tenDays;
    }
    const prog = annualProgression(league, rng);
    const mine = prog.filter((x) => league.players[x.pid]?.tid === league.userTid).sort((a, b) => b.delta - a.delta);
    const up = mine.filter((x) => x.delta > 0).slice(0, 3);
    const down = mine
      .filter((x) => x.delta < 0)
      .slice(-3)
      .reverse();
    if (up.length || down.length) {
      const fmt = (x: { pid: number; delta: number }) => `${playerName(league.players[x.pid])} ${x.delta > 0 ? '+' : ''}${x.delta} (now ${league.players[x.pid].ovr})`;
      const line = (label: string, xs: typeof mine) => (xs.length ? `${label}${xs.length > 1 ? 's' : ''}: ${xs.map(fmt).join(', ')}.` : '');
      addInbox(league, {
        from: 'Player Development',
        subject: 'Training camp report',
        body: [line('Biggest riser', up), line('Biggest drop', down)].filter(Boolean).join('\n'),
        tone: 'neutral',
        link: '/team',
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
  extensionCandidatesMail(league);
  // last season's offers are over
  cleanProposals(league);
  return true;
}

/** Preseason mail: the user's players in the final season of their deals who can be extended now, and what each asks. */
function extensionCandidatesMail(league: League) {
  const list = teamPlayers(league, league.userTid)
    .filter((p) => !extensionBlockedReason(league, p))
    .sort((a, b) => b.ovr - a.ovr);
  if (!list.length) return;
  const line = (p: Player) => {
    const ask = extensionAsk(league, p);
    return extensionRefusal(league, p) ?? `${playerName(p)} (${p.ovr}) asks about ${money(ask.amount)} × ${ask.years} year${ask.years === 1 ? '' : 's'}.`;
  };
  addInbox(league, {
    from: 'Assistant GM',
    subject: 'Extension candidates',
    body: `${list.length === 1 ? `${playerName(list[0])} is in the final season of his deal. Extend him` : `${list.length} of your players are in the final season of their deals. Extend them`} any time until the end of the regular season, before they reach free agency next summer:\n${list
      .slice(0, 6)
      .map(line)
      .join('\n')}${list.length > 6 ? `\nand ${list.length - 6} more.` : ''}`,
    tone: 'neutral',
    link: '/office/resign',
  });
}

/**
 * Retirees stay for history and the Hall of Fame, but after two seasons only as career records:
 * those who never played a game go, the rest lose sim-only detail (ratings snapshots beyond peak
 * and final, tendencies, scouting, mood, on-court and shot-zone context in their stat lines).
 * Five seasons on, fringe careers without an award (under 100 games) leave too, unless a season of
 * theirs stands in the single-season record lists (see holdsSeasonRecord). Without this the
 * save grows by every retiree's full record.
 */
function compactRetired(league: League) {
  for (const p of Object.values(league.players)) {
    if (p.tid !== RETIRED || p.retiredSeason === undefined || league.season - p.retiredSeason <= 2) continue;
    const games = p.stats.reduce((a, s) => a + (s.playoffs ? 0 : s.gp), 0);
    // (a season that can stand in the single-season record lists keeps him: they're read from the players kept)
    if (!p.awards.length && (!p.stats.some((s) => s.gp > 0) || (games < 100 && league.season - p.retiredSeason >= 5 && !holdsSeasonRecord(league, p)))) {
      // a night of his in the record book keeps his name
      freezeRecordNames(league, p);
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
