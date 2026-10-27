// The staff's calls: the moments in a season that need the user's answer, each a Needs-you card on
// Today with the staff's call one tap away (see agenda.ts for how cards are drawn and settled). A
// star goes down for ten games or more (the call: a 10-day for cover, the staff's rotation, or a
// trade for a long absence before the deadline, with what he's worth measured and where his minutes
// go; no cover when he measures as no real loss); the playoff odds under 5% two weeks running for a team the owner expects in the postseason
// (the call: tell him it's a rebuild, before the deadline); a team on pace under the owner's win
// floor, now and three games ago (the call: chase it with a trade, or tell him it's a development
// year, before the deadline); the deadline's last five days (the call: the staff's best deal, buying
// or selling as the odds say, a look for one, or standing pat); the morning a playoff series or a
// play-in game of his starts, and each morning after a loss that has him behind in a series (the
// call: the staff's measured counters for it, a plan of his own, or the plan as it is); a losing
// skid that has gone on (eight straight, then ten, then every four more: the call, a trade while deals
// can be made, or riding it out, with what's behind it); the books: their close heading into the red
// in the weeks before the deadline, or a step the owner took on them at his review (the call: the
// budgets down to the league standard, tickets priced where the gate peaks, or salary shed while
// deals can be made); and the week's card, when the week poses a trade-off (see weekCall.ts). A
// reading that moves week to week (the odds, the pace) is a call only once two readings agree: one
// bad week isn't. A call is only a call with a real choice in it: one whose only answer is "OK"
// isn't opened (the digest has the news), and one whose honest answer is always the same is the
// staff's to make: a skid's first counters (four straight, or six of eight) and the adjustment each
// morning he's behind in a series go in without a card, measured, with what's behind the slide said
// in the digest's line (staffPicks), as the week's big game's counter does. The numbers a card needs
// are measured before a sim stops for it (simCore.ts's runSim, on a budget: callMeasure.ts), and
// otherwise as the card shows (src/ui/today/staffPlan.ts); storeWorth keeps them. A long sim stops
// the day a new one opens, once more for one still open as its due date nears (see openCallIds),
// and for nothing else that doesn't need an answer. A card is settled by its call or a choice; it is
// remembered (League.callsDone) so it doesn't come back. A star's injury card left unanswered for
// INJURY_AGE of his games is ridden out. Nothing here draws from the league's random stream.
import type { GamePlanItem, GameResult, League, PlayInGame, PlayoffSeries, Player, Pos, PrepFocus, ScheduledGame } from '../types';
import { FREE_AGENT } from '../types';
import { fmtDate, payroll, playerName, revenueScale, standardRoster } from './helpers';
import { confStandings } from './standings';
import { money, plural } from '../format';
import {
  currentGoals,
  concedeBlockedReason,
  concedeSeason,
  CONCEDE_COST,
  easeFloor,
  easeFloorBlockedReason,
  floorDanger,
  FLOOR_EASE,
  floorCap,
  gradeGoal,
  ownerProgress,
  patienceCap,
  YOUNG_AGE,
} from './ownerGoals';
import { frozenBooksOutlook, seasonWeight } from './jobSecurity';
import { tenDayBlockedReason, tenDayClosedReason, userTenDay, wantsTenDay } from './tenDay';
import { booksOf, booksOutlook, deeperText, frozen, FROZEN_BUDGET, warnWindow } from './books';
import { aiTicketPrice, attendanceFor, budgetCostPerSeason, seasonEndCash } from './finances';
import { filterTargets, maxTakeBack, tradeTargets } from './tradeFinder';
import { makeItWork } from './tradeHelp';
import { packageFor } from './tradePackages';
import { executeTrade, teamAccepts, tradingClosedReason, validateTrade, type TradeOffer } from './trades';
import { tradeValue } from './contracts';
import { assetText, cleanProposals } from './proposals';
import { ensureRotation, userGameOnDay } from './games';
import { seriesLabel } from './playoffs';
import { itemGroup, planFor, planMade, setPlanItem } from './gamePlans';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import { forecast, leagueForecast, pct, TRAIL_SIMS, type Forecast } from '../analysis/odds';
import { hashString } from '../random';
import { autoRotation } from '../ai/coachAI';
import { WORTH_MIN, withChange, worthCall, type CounterWorth, type LeagueChange } from '../ai/counterWorth';
import { counterCandidates } from '../ai/advisor';
import { buildGameReport, type Factor } from '../analysis/gameReport';
import { answerWeek, isWeekId, notePick, openWeekId, ptsWin, vsAt, weekCard, weekDaily, winsOf } from './weekCall';

/** A star: one of the team's three best players by OVR. */
export const STAR_RANK = 3;
/** Games out that make a star's injury a call. */
export const STAR_OUT = 10;
/** The playoff odds (tenths of a percent, as League.oddsTrail keeps them) under which the season is a call. */
export const ODDS_LOW = 50;
/**
 * Weekly points in a row under ODDS_LOW that make the odds a call. One week's point is noise: in six
 * simulated seasons (every team's weekly trail, 250 seasons a point as the trail takes it) the next
 * week read between a quarter and 2.3 times this one for a team at 2-20% (10th to 90th percentile),
 * and 7 of 18 first dips under 5% came back over 15% later. Two in a row: 2 such false alarms in
 * 14, and every one still opened 24 days or more before the deadline. (A collapse in the deadline's
 * last week is the deadline call's: it sells when the odds are low.)
 */
export const ODDS_WEEKS = 2;
/** ...for a team the owner expects in the postseason, or that was at least this likely to get there this season. */
export const ODDS_WAS = 250;
/**
 * Games the user plays in his first season before the odds can be a call: a 0-7 start is where a
 * newcomer is still learning the game, and a rebuild call then reads as the game giving up on him
 * (the first slump gets the staff's plain read instead: see firstSlump).
 */
export const ODDS_FIRST_GAMES = 15;
/**
 * The user's games back that the floor is read a second time from: on pace under it then and now,
 * so a team a game from the line isn't a call one night and gone the next. (The pace already blends
 * 20 games and more with the owner's read: in ten seasons of the weakest teams, the two that went
 * under stayed under to the deadline; the second reading only keeps a loss at the line from opening it.)
 */
export const FLOOR_AGO = 3;
/** Days before the deadline its call opens (and a long sim stops). */
export const DEADLINE_DAYS = 5;
/**
 * Days before its due date (the deadline, for the odds and the floor) that a call still open stops a
 * long sim once more: twice the deadline call's window, so the two are separate stops, with the
 * market's busiest stretch still ahead (AI offers come three times as often in the deadline's last
 * ten days).
 */
export const DUE_SOON = 10;
/** Games out that make a trade for cover a real answer to a star's injury (before the deadline). */
export const TRADE_OUT = 20;
/** The oldest a 10-day cover the staff calls for a rebuild (or an owner's youth goal) can be: an older one only takes the young players' minutes. */
export const YOUNG_COVER = 25;
/** Settled calls kept, newest last. */
const DONE_KEPT = 60;
/**
 * What pricing tickets where the gate peaks must bring over the home games left (first-season $K)
 * to be one of the books' calls: about a fifth of the owner's warning line.
 */
export const TICKET_GAIN = 1_000;

/**
 * A losing skid that's a call: this many straight losses, or SKID_LOST of the last SKID_OF, past his
 * record (SKID_EXCESS). One
 * game's margin has an SD of about 13, so a good team drops four in a row now and then (a .650 team
 * about once a season): a skid is when a coach is asked what he'll change, not proof that something's
 * wrong, which is why the call's number is measured on the next game, not read from the losses.
 */
export const SKID_STRAIGHT = 4;
export const SKID_LOST = 6;
export const SKID_OF = 8;
/** Games after a skid's call before another skid can be one (the same slide isn't asked about every night). */
export const SKID_GAP = 8;
/**
 * Straight losses at which a skid's call comes again, a step up (the first comes at SKID_STRAIGHT):
 * then every SKID_EVERY more. A slide that goes on gets a card from the second step (a trade, while
 * deals can be made), with what's behind it.
 */
export const SKID_STEPS = [8, 10] as const;
export const SKID_EVERY = 4;
/** His games a star's injury card stays open unanswered before the staff rides it out (the card's own call). */
export const INJURY_AGE = 3;
/**
 * Losses in the stretch over what his record says (the stretch's games at his loss rate, the record
 * blended with five wins and five losses so a 1-3 start isn't the norm) that make it a skid: a bad
 * team losing six of eight is having its season, not a skid. A .650 team's four straight is 2.4 over;
 * a .350 team's, 1.4. (Over a simulated season a 29-53 team opened seven calls on the bare counts.)
 */
export const SKID_EXCESS = 2;

export type CallKind = 'injury' | 'odds' | 'floor' | 'deadline' | 'series' | 'books' | 'skid' | 'week';

/** A losing skid's call (League.skidCall), worked out the morning it opened: about the next game. */
export interface SkidCall {
  season: number;
  /** The user's team then. */
  tid: number;
  /** His games played when it opened (the call's id). */
  gp: number;
  day: number;
  /** The next game and its opponent. */
  gid: number;
  opp: number;
  /** Lost `lost` of the last `of` (straight when equal). */
  lost: number;
  of: number;
  /** His average margin over them (absent when their results aren't kept). */
  margin?: number;
  /** Which step of the slide it is: 1 the first, 2 at SKID_STEPS[0] straight, and so on. */
  rung?: number;
  /** What's behind it, in words (the box scores' biggest edge against him, his stars out): the staff's read. */
  diag?: string;
  /** That biggest edge was shots that didn't fall (luck, not the plan), with none of his stars out: the call is to ride it out. */
  luck?: true;
  /** The staff's counters for the next game are measured and in (or measured as no gain), in words. */
  put?: string;
}

/**
 * What the staff measured for a call (League.callWorth, by call id: see storeWorth), over paired games
 * of one game (see counterWorth.ts): the staff's option against things as they stand. A reading is
 * for the user's tactics as they were then (`sig`): changed since, it's measured again.
 */
export interface CallWorth {
  gid: number;
  /** worthSig as it was measured. */
  sig: number;
  day: number;
  /** The option's worth in that game, points a game: shrunk toward even by its noise (shown), as read, and its standard error. Absent for counters: each item has its own. */
  pts?: number;
  raw?: number;
  se?: number;
  /** Counters: the ones that measured as gains, the best first (one per kind, at most the call's `max`), each with its worth. */
  items?: GamePlanItem[];
  /** Counters: the best of them when none was a gain (too close to say, or a cost), for a skid's "try it anyway". */
  best?: GamePlanItem;
}

/**
 * How a card's number is measured, in the sim worker as it shows (src/ui/today/staffPlan.ts runs it;
 * a script can too): the staff's counters for a game (counterWorth, the best `max` gains kept), or one
 * change over the league (measureChanges; `base` laid over it first, for a "this, not that").
 * `key` is where the result is kept (storeWorth).
 */
export type CallMeasure =
  | { kind: 'counters'; key: string; opp: number; gid: number; sig: number; max: number }
  | { kind: 'change'; key: string; opp: number; gid: number; sig: number; change: LeagueChange; base?: LeagueChange };

/** Calls' measurements kept (the open ones'). */
const WORTH_KEPT = 12;

/**
 * What a measurement for a game against `opp` stands on, of what the user decides: his plan for them,
 * and his tactics when he runs them himself (the staff retuning its own playbook as the roster changes
 * leaves a reading standing: it was measured on the team as it was), plus `extra`.
 */
export function worthSig(league: League, opp: number, g: Pick<ScheduledGame, 'seriesId'>, extra = ''): number {
  const t = league.teams[league.userTid].tactics;
  const plan = planFor(league, opp, g);
  return hashString(JSON.stringify([plan?.items.map((x) => x.id) ?? [], plan?.matchups ?? {}, t.manual ? t : 'staff']) + extra);
}

/** Whether a stored measurement still stands for game `g` against `opp`. */
export function worthFresh(league: League, w: CallWorth, opp: number, g: Pick<ScheduledGame, 'gid' | 'seriesId'>, extra = ''): boolean {
  return w.gid === g.gid && w.sig === worthSig(league, opp, g, extra);
}

/** Keep what the staff measured for a call (the screen that measured it calls this), newest last. */
export function storeWorth(league: League, key: string, w: CallWorth) {
  const all = { ...(league.callWorth ?? {}) };
  delete all[key];
  all[key] = w;
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - WORTH_KEPT))) delete all[k];
  league.callWorth = all;
}

/**
 * What a counters measurement comes to for a call (the screen or a script passes counterWorth's
 * readings): the gains, the best first and one per game-plan group, at most the call's `max`, the
 * groups his plan already settles left to it (as the Preview's "Use the staff's plan" makes it); and
 * the best reading when none is a gain.
 */
export function countersWorth(league: League, m: Extract<CallMeasure, { kind: 'counters' }>, worths: CounterWorth[]): CallWorth {
  const by = new Map(worths.map((w) => [w.id, w]));
  const cands = counterCandidates(league, league.userTid, m.opp).filter((c) => by.has(c.id));
  const g = league.schedule.find((x) => x.gid === m.gid);
  // (the groups a plan for them settles already are left to it: the staff's own picks never replace his)
  const taken = new Set((planFor(league, m.opp, g)?.items ?? []).map(itemGroup));
  const item = (c: (typeof cands)[number]): GamePlanItem => ({
    id: c.id,
    label: c.label,
    group: c.group,
    patch: c.patch,
    ...(c.evidence ? { evidence: c.evidence } : {}),
    pts: by.get(c.id)!.pts,
  });
  const ranked = [...cands].sort((a, b) => by.get(b.id)!.pts - by.get(a.id)!.pts || a.id.localeCompare(b.id));
  const items: GamePlanItem[] = [];
  for (const c of ranked) {
    if (items.length >= m.max || worthCall(by.get(c.id)!) !== 'gain' || taken.has(itemGroup(c))) continue;
    taken.add(itemGroup(c));
    items.push(item(c));
  }
  return { gid: m.gid, sig: m.sig, day: league.day, ...(items.length ? { items } : ranked[0] ? { best: item(ranked[0]) } : {}) };
}

/** What a change's measurement comes to for a call: its worth in the game, as shown (shrunk), as read and its standard error. */
export function changeWorth(league: League, m: Extract<CallMeasure, { kind: 'change' }>, w: CounterWorth): CallWorth {
  return { gid: m.gid, sig: m.sig, day: league.day, pts: w.pts, raw: w.raw, se: w.se };
}

/** "+1.4", "−0.3": a measured worth as the cards say it. */
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;

/** A measured worth in words: "about +1.4 a game", or "too close to say" inside WORTH_MIN (as the counters read). */
function worthWords(pts: number): string {
  return Math.abs(pts) >= WORTH_MIN ? `about ${signed(pts)} a game` : 'too close to say';
}

/** The staff's deadline call, worked out once when its card opens (League.deadlineCall). */
export interface DeadlineCall {
  season: number;
  mode: 'buy' | 'sell' | 'hold';
  /** The deal the staff would make (side a the user's), if one was found that the other team takes. */
  offer?: TradeOffer;
  /** The playoff odds then, tenths of a percent. */
  odds: number;
  /** What the deal adds to the postseason odds as the forecast reads the rosters with it (tenths of a percent; absent for no deal). */
  oddsGain?: number;
}

const settled = (league: League, id: string) => !!league.callsDone?.includes(id);

/** Remember a call as settled. */
export function settleCall(league: League, id: string) {
  const done = (league.callsDone ?? []).filter((x) => x !== id);
  done.push(id);
  league.callsDone = done.slice(-DONE_KEPT);
  if (league.callLook?.id === id) delete league.callLook;
}

/** A trade of his since he took call `id`'s look for one (League.callLook): it answers the call. */
function dealt(league: League, id: string): boolean {
  const look = league.callLook;
  return !!look && look.id === id && (league.transactions ?? []).some((t) => t.kind === 'trade' && t.user && t.id >= look.txn);
}

/**
 * Odds in tenths of a percent as the cards say them, as the screens' odds read (pct): "3%", "<1%"
 * and ">99%" at the ends, never a 100% or a 0% a simulated count can't promise. They count the
 * play-in too, so the cards call them the postseason odds.
 */
const oddsText = (tenths: number) => pct(tenths / 1000);

/**
 * The user's playoff odds as of the latest weekly point this season (tenths of a percent), how many
 * points in a row up to it are under ODDS_LOW, and the best point before those.
 */
function oddsNow(league: League): { now: number; low: number; best: number } | null {
  const t = league.oddsTrail;
  if (!t || t.season !== league.season || t.tid !== league.userTid || !t.pts.length) return null;
  const pts = t.pts.map((p) => p[1]);
  let low = 0;
  while (low < pts.length && pts[pts.length - 1 - low] < ODDS_LOW) low++;
  return { now: pts[pts.length - 1], low, best: Math.max(0, ...pts.slice(0, pts.length - low)) };
}

/**
 * The user's stars out for STAR_OUT games or more, each with the id of his call (one per injury). Not
 * one out past the regular season's end once the team's place is settled (clinched or eliminated):
 * there's nothing left for cover to win.
 */
function hurtStars(league: League): { p: Player; id: string }[] {
  const roster = standardRoster(league, league.userTid).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  const hurt = roster.slice(0, STAR_RANK).filter((p) => p.injury && p.injury.gamesTotal >= STAR_OUT && p.injury.gamesRemaining > 2);
  if (!hurt.length || league.phase !== 'regular' || league.day <= league.tradeDeadlineDay) return hurt.map((p) => ({ p, id: `injury:${p.pid}:${p.injuryCount}` }));
  const me = league.teams[league.userTid];
  const left = league.schedule.filter((g) => g.type === 'regular' && !g.played && (g.home === me.tid || g.away === me.tid)).length;
  const settledPlace = !!confStandings(league, me.conf).find((r) => r.tid === me.tid)?.clinched;
  return hurt.filter((p) => !(settledPlace && p.injury!.gamesRemaining >= left)).map((p) => ({ p, id: `injury:${p.pid}:${p.injuryCount}` }));
}

const oddsId = (league: League) => `odds:${league.season}`;
const floorId = (league: League) => `floor:${league.season}`;
const deadlineId = (league: League) => `deadline:${league.season}`;
const booksId = (league: League) => `books:${league.books!.season}:${league.books!.day}`;
/** A step from an earlier review the books' close still projects to repeat: its reminder in the weeks before the deadline. */
const booksDueId = (league: League) => `books:${league.season}:close`;

/** Whether the deadline's call is open: its last DEADLINE_DAYS days, deadline day included. */
const deadlineOpen = (league: League) => league.phase === 'regular' && league.day <= league.tradeDeadlineDay && league.tradeDeadlineDay - league.day <= DEADLINE_DAYS;

/** Whether the odds call stands: under ODDS_LOW for ODDS_WEEKS points running, for a team expected in the postseason, before the deadline. */
function oddsCall(league: League): { now: number } | null {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay) return null;
  if (league.season === league.startSeason) {
    const ts = league.teams[league.userTid].seasons.find((x) => x.season === league.season);
    if ((ts ? ts.won + ts.lost : 0) < ODDS_FIRST_GAMES) return null;
  }
  const o = oddsNow(league);
  if (!o || o.low < ODDS_WEEKS) return null;
  const expected = !!currentGoals(league)?.goals.some((g) => g.kind === 'postseason');
  return expected || o.best >= ODDS_WAS ? { now: o.now } : null;
}

/** The floor as the owner reads it with the user's record of `n` games ago (a shallow copy of the league: nothing in it changes). */
function floorAgo(league: League, n: number): ReturnType<typeof floorDanger> {
  const team = league.teams[league.userTid];
  const ts = team.seasons.find((s) => s.season === league.season);
  if (!ts || ts.lastTen.length < n) return null;
  const won = ts.lastTen.slice(-n).reduce((a, x) => a + x, 0);
  const then = { ...ts, won: ts.won - won, lost: ts.lost - (n - won) };
  const teams = league.teams.map((t) => (t === team ? { ...t, seasons: t.seasons.map((s) => (s === ts ? then : s)) } : t));
  return floorDanger({ ...league, teams });
}

/**
 * What the odds call's two answers come to in his standing with the owner, as his review grades the
 * season (the staff's read, from the forecast, the rest of the season alike either way): pushing on,
 * the postseason goal graded at each level by the forecast's chance of ending there, times its weight
 * and the season's weight in the standing (see seasonWeight); telling him now, CONCEDE_COST off at once
 * (the minutes the goal becomes taken as met: they grade 0 at best). `reach`: the forecast's chance of
 * meeting the goal. Null without a postseason goal or a forecast.
 */
export function concedeStanding(league: League): { push: number; concede: number; reach: number } | null {
  const og = currentGoals(league);
  const post = og?.goals.find((g) => g.kind === 'postseason');
  const f = leagueForecast(league)?.teams[league.userTid];
  if (!og || !post || !f) return null;
  // the chance of level L or better: 1 the play-in (a top-ten seed), 2 the playoffs, then each round won
  const atLeast = (L: number) => (L <= 0 ? 1 : L === 1 ? Math.max(f.top6 + f.playIn, f.reach[0]) : L <= 6 ? f.reach[L - 2] : 0);
  let e = 0;
  for (let L = 0; L <= 6; L++) e += (atLeast(L) - atLeast(L + 1)) * gradeGoal(league, og, post, L);
  return { push: seasonWeight(league) * post.weight * e, concede: -CONCEDE_COST, reach: atLeast(post.target) };
}

/**
 * The season's grade as his review would give it with the results where they project (the forecast's
 * record, as the job-security meter projects it: the goals graded at their projections, a development
 * year's part keeping the wins' miss, under the floor's cap, the rebuild clock's and the books').
 */
function projectedSeasonGrade(league: League, og: NonNullable<ReturnType<typeof currentGoals>>, fc: Forecast): number {
  const prog = ownerProgress(league, og, fc);
  const wins = prog.find((p) => p.goal.kind === 'wins');
  const wg = wins ? gradeGoal(league, og, wins.goal, wins.projected) : undefined;
  const sum = prog.reduce((a, p) => a + p.goal.weight * gradeGoal(league, og, p.goal, p.projected, wg), 0);
  const post = prog.find((p) => p.goal.kind === 'postseason');
  return Math.min(sum, wins ? floorCap(og, wins.projected, og.games) : 1, post ? patienceCap(og, post.projected) : 1, frozenBooksOutlook(league)?.cap ?? 1);
}

/**
 * What the floor call's two answers come to in his standing with the owner at his review (the staff's
 * read, from the forecast, the same record either way): chasing it, the season graded with the goals
 * as they stand; a development year, with the goals as easeFloor leaves them (a view: nothing here
 * changes), its concession's cost off in full. Each as the change from his standing now, the season
 * weighed as the review weighs it (see seasonWeight); and the wins the forecast projects. Null without
 * goals or a forecast.
 */
export function floorStanding(league: League): { chase: number; ease: number; wins: number } | null {
  const og = currentGoals(league);
  const fc = leagueForecast(league);
  if (!og || !fc) return null;
  const view: League = { ...league, ownerGoals: structuredClone(og), ownerMood: { ...league.ownerMood }, inbox: [...league.inbox] };
  easeFloor(view);
  const w = seasonWeight(league);
  const s = league.ownerMood.total;
  // (as the review sets it: the grade weighed in, what concessions cost kept off: see owner.ts)
  const review = (l: League) => {
    const o = currentGoals(l)!;
    const cost = o.cost ?? 0;
    return Math.max(-1, Math.min(1, projectedSeasonGrade(l, o, fc) * w + (l.ownerMood.total + cost) * (1 - w) - cost)) - s;
  };
  return { chase: review(league), ease: review(view), wins: Math.round(fc.teams[league.userTid].w) };
}

/** Standing as the cards say it, in points: "−4", "+2". */
const standingPts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}`;

/**
 * Whether the floor call stands: on pace under the owner's floor now and FLOOR_AGO games ago, before
 * the deadline, for a team the odds call isn't about.
 */
function floorCall(league: League): { projected: number; floorWins: number } | null {
  if (league.phase !== 'regular' || league.day > league.tradeDeadlineDay || oddsCall(league)) return null;
  const now = floorDanger(league);
  return now && floorAgo(league, FLOOR_AGO) ? now : null;
}

/**
 * A playoff series or play-in game of the user's that starts today: its first game on today's
 * calendar and not yet played (a series still 0-0), with the opponent.
 */
function seriesStart(league: League): { id: string; opp: number; g: ScheduledGame; series?: PlayoffSeries; playIn?: PlayInGame } | null {
  if (league.phase !== 'playin' && league.phase !== 'playoffs') return null;
  const g = userGameOnDay(league, league.day);
  if (!g?.seriesId || (g.type !== 'playin' && g.type !== 'playoffs')) return null;
  const opp = g.home === league.userTid ? g.away : g.home;
  const id = `series:${league.season}:${g.seriesId}`;
  if (g.type === 'playin') {
    const playIn = league.playIn.find((p) => p.id === g.seriesId);
    return playIn && playIn.winner === undefined ? { id, opp, g, playIn } : null;
  }
  const series = league.playoffs.find((s) => s.id === g.seriesId);
  return series && series.winner === undefined && series.highWins + series.lowWins === 0 ? { id, opp, g, series } : null;
}

/**
 * A plan set for this series (or play-in game) since it began: the series call's answer, so it
 * settles it. (A plan from before, for the next game or the season, still opens the call: its
 * answer is to keep or review it.) A series plan can only be made once the series is on.
 */
function planSet(league: League, start: NonNullable<ReturnType<typeof seriesStart>>): boolean {
  const made = planFor(league, start.opp, start.g);
  return !!made && planMade(made) && (made.scope === 'series' || !!start.playIn);
}

/**
 * A playoff game of the user's today with him behind in its series after a loss (0-1, 1-2, 1-3...):
 * the call is the staff's adjustment for it, each such morning once.
 */
function seriesBehind(league: League): { id: string; opp: number; g: ScheduledGame; series: PlayoffSeries; w: number; l: number } | null {
  if (league.phase !== 'playoffs') return null;
  const g = userGameOnDay(league, league.day);
  if (!g?.seriesId || g.type !== 'playoffs') return null;
  const series = league.playoffs.find((s) => s.id === g.seriesId);
  if (!series || series.winner !== undefined) return null;
  const high = series.high === league.userTid;
  const [w, l] = high ? [series.highWins, series.lowWins] : [series.lowWins, series.highWins];
  if (w >= l) return null;
  return { id: `series:${league.season}:${g.seriesId}:${w}-${l}`, opp: g.home === league.userTid ? g.away : g.home, g, series, w, l };
}

const skidId = (s: SkidCall) => `skid:${s.season}:${s.gp}`;

/** The skid's call while its game is still to play. */
function skidOpen(league: League): SkidCall | null {
  const s = league.skidCall;
  if (!s || s.season !== league.season || s.tid !== league.userTid || league.phase !== 'regular') return null;
  const g = league.schedule.find((x) => x.gid === s.gid);
  return g && !g.played ? s : null;
}

/** The step a run of `n` straight losses is at: 1 from SKID_STRAIGHT, 2 and 3 at SKID_STEPS, one more every SKID_EVERY after. */
export function skidRung(n: number): number {
  const [a, b] = SKID_STEPS;
  return n >= b ? 3 + Math.floor((n - b) / SKID_EVERY) : n >= a ? 2 : n >= SKID_STRAIGHT ? 1 : 0;
}

/** What each kind of edge in a game report is, in a skid's words (shots falling below their looks apart: that's luck). */
const CAUSE: Record<Factor['category'] | 'luck', string> = {
  tactics: 'the matchups',
  shooting: 'worse looks than theirs',
  luck: "shots that didn't fall (luck, not the plan)",
  turnovers: 'turnovers',
  rebounding: 'the glass',
  fouls: 'free throws',
  pace: 'the pace',
  fatigue: 'tired legs',
  stars: 'their stars',
};

/**
 * What's behind a run of the user's results, as the staff reads the box scores: his margin over them,
 * the kind of edge that went against him most (the game reports' factors added up by kind, shots
 * falling below their looks counted apart as the luck they are, a game's worth, when it's a point a
 * game or more), and his stars out now; in words, and whether it reads as luck alone (the biggest
 * edge the shots that didn't fall, none of his stars out). Not a measurement: the line says it's the staff's read.
 */
function slideRead(league: League, results: GameResult[]): { text: string; luck: boolean } {
  const me = league.userTid;
  const parts: string[] = [];
  let luck = false;
  if (results.length) {
    const margin = results.reduce((a, r) => a + (r.home.tid === me ? r.home.pts - r.away.pts : r.away.pts - r.home.pts), 0) / results.length;
    parts.push(margin < 0 ? `Outscored by ${(-margin).toFixed(1)} a game` : `Even on points (${signed(margin)} a game): the close ones went the other way`);
    const sum = new Map<keyof typeof CAUSE, number>();
    for (const r of results)
      for (const f of buildGameReport(league, r)?.factors ?? []) {
        const k = f.luck ? 'luck' : f.category;
        sum.set(k, (sum.get(k) ?? 0) + f.pts);
      }
    const worst = [...sum.entries()].sort((a, b) => a[1] - b[1])[0];
    if (worst && worst[1] / results.length <= -1) {
      parts.push(`the box scores point to ${CAUSE[worst[0]]} (${signed(worst[1] / results.length)} a game, the staff's read)`);
      luck = worst[0] === 'luck';
    }
  }
  const out = starsOut(league);
  if (out.length) parts.push(`${out.map((p) => playerName(p)).join(' and ')} ${out.length > 1 ? 'are' : 'is'} out`);
  return { text: parts.length ? `${capitalize(parts.join('; '))}.` : '', luck: luck && !out.length };
}

/** What's behind a run of the user's results, in words (see slideRead). */
export const slideDiagnosis = (league: League, results: GameResult[]) => slideRead(league, results).text;

/** The user's stars (his three best) out now. */
const starsOut = (league: League) =>
  standardRoster(league, league.userTid)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, STAR_RANK)
    .filter((p) => p.injury && p.injury.gamesRemaining > 0);

/** The user's last `n` regular-season results this season. */
const lastResults = (league: League, n: number) =>
  league.games.filter((r) => r.season === league.season && r.type === 'regular' && (r.home.tid === league.userTid || r.away.tid === league.userTid)).slice(-n);

/**
 * Each morning of the regular season: a losing skid (SKID_STRAIGHT straight, or SKID_LOST of the last
 * SKID_OF, SKID_EXCESS past his record) opens its call, about the next game, unless one opened in the
 * last SKID_GAP games; a run of straight losses that goes on opens it again at each step (skidRung).
 */
function skidDaily(league: League) {
  if (league.phase !== 'regular' || league.fired) return;
  const me = league.userTid;
  const ts = league.teams[me].seasons.find((x) => x.season === league.season);
  if (!ts) return;
  const gp = ts.won + ts.lost;
  const rate = (ts.lost + 5) / (gp + 10);
  const run = Math.max(0, -ts.streak);
  const straight = run >= SKID_STRAIGHT && run * (1 - rate) >= SKID_EXCESS;
  const lostOf = ts.lastTen.length >= SKID_OF ? ts.lastTen.slice(-SKID_OF).filter((x) => !x).length : 0;
  if (!straight && (lostOf < SKID_LOST || lostOf - SKID_OF * rate < SKID_EXCESS)) return;
  const rung = straight ? skidRung(run) : 1;
  const prev = league.skidCall;
  const mine = prev && prev.season === league.season && prev.tid === me;
  // (the same run of losses: only a step up opens it again; another slide waits SKID_GAP games)
  const sameRun = mine && straight && gp - prev.gp < run;
  if (sameRun ? rung <= (prev.rung ?? 1) : mine && gp - prev.gp < SKID_GAP) return;
  const next = league.schedule
    .filter((g) => !g.played && g.type === 'regular' && g.day >= league.day && (g.home === me || g.away === me))
    .reduce<ScheduledGame | undefined>((a, g) => (!a || g.day < a.day || (g.day === a.day && g.gid < a.gid) ? g : a), undefined);
  if (!next) return;
  const of = straight ? run : SKID_OF;
  const res = lastResults(league, of);
  const margin = res.length ? res.reduce((a, r) => a + (r.home.tid === me ? r.home.pts - r.away.pts : r.away.pts - r.home.pts), 0) / res.length : undefined;
  const read = slideRead(league, res);
  league.skidCall = {
    season: league.season,
    tid: me,
    gp,
    day: league.day,
    gid: next.gid,
    opp: next.home === me ? next.away : next.home,
    lost: straight ? of : lostOf,
    of,
    ...(margin !== undefined ? { margin } : {}),
    rung,
    diag: read.text,
    ...(read.luck ? { luck: true as const } : {}),
  };
}

/** A skid's title: "8 straight losses", "6 losses in 8". */
const skidTitle = (s: SkidCall) => (s.lost === s.of ? `${s.of} straight losses` : `${s.lost} losses in ${s.of}`);

/** Counters the staff measures for a skid's next game: one, two from its second step. */
const skidMax = (s: SkidCall) => ((s.rung ?? 1) > 1 ? 2 : 1);

/** Counters the staff puts in when he's behind in a series: one, two down two games, three facing elimination. */
const behindMax = (w: number, l: number) => (l === 3 ? 3 : l - w >= 2 ? 2 : 1);

/** A skid's card stands: its second step or later, its counters decided, while deals can still be made (a trade is the bigger change). */
function skidCard(league: League, s: SkidCall | null): s is SkidCall {
  return !!s && (s.rung ?? 1) > 1 && !!s.put && !tradingClosedReason(league);
}

/** The ids of the calls that may be open now, before asking whether each has a real choice in it. */
function candidateIds(league: League): string[] {
  if (league.fired) return [];
  const ids: string[] = [];
  const series = seriesStart(league);
  if (series && !planSet(league, series)) ids.push(series.id);
  if (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') for (const s of hurtStars(league)) ids.push(s.id);
  if (oddsCall(league)) ids.push(oddsId(league));
  if (floorCall(league)) ids.push(floorId(league));
  if (deadlineOpen(league)) ids.push(deadlineId(league));
  // the books: the step the owner took (its call, once), or in the weeks before the deadline a step
  // from an earlier review the close projects to repeat; none in the postseason, once they've closed
  const b = league.phase === 'playin' || league.phase === 'playoffs' ? undefined : booksOf(league);
  if (b && !settled(league, booksId(league))) ids.push(booksId(league));
  else if (b && b.stage !== 'warning' && b.season < league.season && warnWindow(league) && booksOutlook(league).judged < 0) ids.push(booksDueId(league));
  const skid = skidOpen(league);
  if (skidCard(league, skid)) ids.push(skidId(skid));
  // (last: what a sim says it stopped for is the first new one, and the week's is the least of them)
  const week = openWeekId(league);
  if (week) ids.push(week);
  return ids.filter((id) => !settled(league, id) && !dealt(league, id));
}

const DUE = '~due';
/** The id openCallIds gives a call still open within DUE_SOON days of its due date: new then, so a long sim stops for it once more. */
export const dueId = (id: string) => `${id}${DUE}`;

/**
 * What a long sim checks each day (nothing to work out on most days): the ids of the calls open now,
 * and dueId for each still open within DUE_SOON days of its due date.
 */
export function openCallIds(league: League): string[] {
  const ids = candidateIds(league);
  // (the week's call is known open without drawing its card: most days it's the only one)
  if (ids.every(isWeekId)) return ids;
  const week = ids.filter(isWeekId);
  return [...staffCalls(league, { skipWeek: true }).flatMap((c) => (c.dueDay !== undefined && c.dueDay - league.day <= DUE_SOON ? [c.id, dueId(c.id)] : [c.id])), ...week];
}

/**
 * The first call in `ids` (from openCallIds) not in `before`: the call a sim stopped for or passed,
 * and whether it's one still open as its due date nears rather than a new one.
 */
export function newCall(league: League, ids: readonly string[], before: ReadonlySet<string>): { card: CallCard; due: boolean } | null {
  const id = ids.find((x) => !before.has(x));
  if (id === undefined) return null;
  const due = id.endsWith(DUE);
  const card = staffCalls(league).find((c) => c.id === (due ? id.slice(0, -DUE.length) : id));
  return card ? { card, due } : null;
}

/** What cutting the user's budgets to the league standard saves over the rest of the season (between seasons, over next season), or 0 when none is over it. */
function budgetCutSaves(league: League): number {
  const t = league.teams[league.userTid];
  const year = (['coaching', 'health', 'facilities'] as const).reduce(
    (a, k) => a + Math.max(0, budgetCostPerSeason(league, t.budget[k]) - budgetCostPerSeason(league, Math.min(t.budget[k], FROZEN_BUDGET))),
    0,
  );
  return (year * (seasonEndCash(league, league.userTid).left || 82)) / 82;
}

/**
 * The ticket price where the user's gate peaks at today's demand (see aiTicketPrice), and what it
 * brings over his home games left (next season's 41 between seasons), or null when that's under
 * TICKET_GAIN (or the postseason is on: its prices follow).
 */
function ticketLever(league: League): { price: number; gain: number } | null {
  const t = league.teams[league.userTid];
  if (league.phase === 'playin' || league.phase === 'playoffs') return null;
  const ts = t.seasons.find((x) => x.season === league.season);
  const home = league.phase === 'regular' || league.phase === 'preseason' ? Math.max(0, 41 - (ts ? ts.homeWon + ts.homeLost : 0)) : 41;
  const price = aiTicketPrice(league, t);
  const gate = (x: number) => (attendanceFor(league, { ...t, budget: { ...t.budget, ticketPrice: x } }) * x) / 1000;
  const gain = home * (gate(price) - gate(t.budget.ticketPrice));
  return gain >= TICKET_GAIN * revenueScale(league) ? { price, gain } : null;
}

// ---------------------------------------------------------------- the deadline's call

/**
 * A deal as the user's team would play it (a view of the league: nothing in it changes): the players
 * moved and the staff's rotation for the roster it leaves him, against `base`, the staff's rotation
 * for the roster he has (a deal is measured against the staff's own plan, not a lean or a rotation
 * set by hand).
 */
export function dealChange(league: League, offer: TradeOffer): { change: LeagueChange; base: LeagueChange } {
  const me = league.userTid;
  const team = league.teams[me];
  const players: Record<number, Partial<Player>> = {};
  for (const pid of offer.a.pids) players[pid] = { tid: offer.b.tid };
  for (const pid of offer.b.pids) players[pid] = { tid: me };
  const roster = (moved: boolean) =>
    Object.values(league.players).flatMap((p) => {
      const tid = moved ? (players[p.pid]?.tid ?? p.tid) : p.tid;
      return tid === me ? [{ ...p, tid }] : [];
    });
  return {
    change: { id: 'deal', players, teams: { [me]: { rotation: autoRotation(roster(true), team.rotation) } } },
    base: { id: 'staff', teams: { [me]: { rotation: autoRotation(roster(false), team.rotation) } } },
  };
}

/** One of the owner's money or youth goals as a deal moves it: where it projects now and with the deal. */
export interface DealGoal {
  kind: 'profit' | 'payroll' | 'youth';
  target: number;
  now: number;
  with: number;
}

/** His regular-season games left. */
const gamesLeft = (league: League) => league.schedule.filter((g) => !g.played && g.type === 'regular' && (g.home === league.userTid || g.away === league.userTid)).length;

/**
 * What a deal does to the owner's money and youth goals this season: the profit as it projects with
 * the books' close moved by the deal (its salary for the games left, the tax), the payroll against his
 * line, and the young players' minutes as the staff's rotation hands them out with it over the games left.
 */
export function dealGoals(league: League, offer: TradeOffer): DealGoal[] {
  const og = currentGoals(league);
  if (!og || league.phase !== 'regular') return [];
  const me = league.userTid;
  const { change, base } = dealChange(league, offer);
  const view = withChange(league, change);
  const young = (l: League, c: LeagueChange) => {
    const rot = c.teams![me].rotation!;
    return Object.values(l.players)
      .filter((p) => p.tid === me && playerAge(p, l.season) <= YOUNG_AGE)
      .reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
  };
  const out: DealGoal[] = [];
  for (const p of ownerProgress(league, og)) {
    const g = p.goal;
    if (g.kind === 'profit') out.push({ kind: 'profit', target: g.target, now: p.projected, with: p.projected + seasonEndCash(view, me).end - seasonEndCash(league, me).end });
    else if (g.kind === 'payroll') out.push({ kind: 'payroll', target: g.target, now: p.now, with: payroll(view, me) });
    else if (g.kind === 'youth')
      out.push({ kind: 'youth', target: g.target, now: p.projected, with: Math.round(p.projected + (young(view, change) - young(league, base)) * gamesLeft(league)) });
  }
  return out;
}

/** The deal costs a goal: it ends under the target (a payroll: over the line) and worse than without it. */
const costsGoal = (d: DealGoal) => (d.kind === 'payroll' ? d.with > d.target && d.with > d.now : d.with < d.target && d.with < d.now);

/** A goal as a deal moves it, in words: "profit on pace for $12.0M, not $25.5M (his goal $25.5M)". */
function dealGoalText(d: DealGoal): string {
  const n = (x: number) => x.toLocaleString('en-US');
  const cash = (x: number) => (x < 0 ? `a ${money(-x)} loss` : money(x));
  return d.kind === 'profit'
    ? `profit on pace for ${cash(d.with)}, not ${cash(d.now)} (his goal ${cash(d.target)})`
    : d.kind === 'payroll'
      ? `payroll ${money(d.with)}, not ${money(d.now)} (his line ${money(d.target)})`
      : `young players' minutes on pace for ${n(d.with)}, not ${n(d.now)} (his goal ${n(d.target)})`;
}

/** A player a deal brings in, with what he costs: "James Harden: 37, $96.5M over 3 seasons (a player option on the last)". */
function contractText(league: League, p: Player): string {
  const s = league.season;
  const years = Math.max(1, contractExp(p.contract) - s + 1);
  const total = Array.from({ length: years }, (_, i) => salaryFor(p, s + i)).reduce((a, x) => a + x, 0);
  const option = p.contract.option && !p.contract.next ? ` (a ${p.contract.option} option on the last)` : '';
  return `${playerName(p)}: ${playerAge(p, s)}, ${years === 1 ? `${money(total)}, expiring` : `${money(total)} over ${years} seasons${option}`}`;
}

/**
 * The staff's deadline call (once a season, the day its card opens): buy with the playoffs likely
 * (the best player better than the team's fifth best that his team would move for what "make it
 * work" says, the team's two most valuable players kept, and with an owner's youth goal its young
 * players too; none that costs one of the owner's money or youth goals, see dealGoals), sell with them
 * unlikely or for a rebuilder (the best package a contender sends for one of the veterans, 28 or
 * older), hold otherwise or when nothing works. The deal's postseason odds are the forecast's read of
 * the rosters with it and without it (the same simulated seasons), its worth a game measured as the card opens.
 */
export function planDeadlineCall(league: League): DeadlineCall {
  const me = league.userTid;
  const odds = oddsNow(league)?.now ?? 500;
  const rebuild = league.teams[me].strategy === 'rebuild';
  const mode: DeadlineCall['mode'] = !rebuild && odds >= 500 ? 'buy' : rebuild || odds < 150 ? 'sell' : 'hold';
  const call: DeadlineCall = { season: league.season, mode, odds };
  const roster = standardRoster(league, me);
  const works = (o: TradeOffer | null) => !!o && !validateTrade(league, o).length && teamAccepts(league, o, o.b.tid);
  if (mode === 'buy') {
    const youth = !!currentGoals(league)?.goals.some((g) => g.kind === 'youth');
    const keep = [
      ...[...roster]
        .sort((a, b) => tradeValue(league, b) - tradeValue(league, a))
        .slice(0, 2)
        .map((p) => p.pid),
      ...(youth ? roster.filter((p) => playerAge(p, league.season) <= YOUNG_AGE).map((p) => p.pid) : []),
    ];
    const bar = [...roster].sort((a, b) => b.ovr - a.ovr)[4]?.ovr ?? 0;
    const targets = tradeTargets(league)
      .filter((t) => t.p.ovr > bar && t.avail !== 'franchise' && !t.p.injury)
      .sort((a, b) => Number(b.avail === 'block') - Number(a.avail === 'block') || b.p.ovr - a.p.ovr || a.p.pid - b.p.pid)
      .slice(0, 6);
    for (const t of targets) {
      const ask = makeItWork(league, { a: { tid: me, pids: [], dpids: [] }, b: { tid: t.p.tid, pids: [t.p.pid], dpids: [] } }, keep);
      if (works(ask.offer) && !dealGoals(league, ask.offer!).some(costsGoal)) {
        call.offer = ask.offer!;
        break;
      }
    }
  } else if (mode === 'sell') {
    const vets = roster
      .filter((p) => playerAge(p, league.season) >= 28 && p.ovr >= 70)
      .sort((a, b) => tradeValue(league, b) - tradeValue(league, a) || a.pid - b.pid)
      .slice(0, 3);
    const buyers = league.teams.filter((t) => t.tid !== me && t.strategy === 'contend').slice(0, 10);
    let best = 0;
    for (const v of vets)
      for (const t of buyers) {
        const pkg = packageFor(league, t.tid, { pids: [v.pid], dpids: [] });
        if (pkg && pkg.myValue - pkg.giveValue > best && works(pkg.offer)) {
          best = pkg.myValue - pkg.giveValue;
          call.offer = pkg.offer;
        }
      }
  }
  if (!call.offer) call.mode = mode === 'sell' || mode === 'buy' ? mode : 'hold';
  else if (league.phase === 'regular') {
    // (the same simulated seasons each way: the difference is the deal's, not the draw's)
    const reach = (l: League) => forecast(l, { sims: TRAIL_SIMS })?.teams[me].reach[0];
    const [without, withIt] = [reach(league), reach(withChange(league, dealChange(league, call.offer).change))];
    if (without !== undefined && withIt !== undefined) call.oddsGain = Math.round((withIt - without) * 1000);
  }
  return call;
}

/**
 * Each morning of the season: the week planned, what it put in taken out at its end, and the staff's
 * lean on a card left unanswered (see weekDaily); a losing skid's call opened (skidDaily); a star's
 * injury card left unanswered ridden out (ageInjuries); and the deadline's call worked out the day its
 * card opens. The picks that wait on measuring are made by staffDecide once it's done (callMeasure.ts).
 */
export function callsDaily(league: League) {
  if (league.fired) return;
  // (a trade made from a call's look answers it for good)
  if (league.callLook && dealt(league, league.callLook.id)) settleCall(league, league.callLook.id);
  weekDaily(league);
  skidDaily(league);
  ageInjuries(league);
  firstSlump(league);
  if (!deadlineOpen(league) || league.deadlineCall?.season === league.season) return;
  league.deadlineCall = planDeadlineCall(league);
}

/**
 * A star's injury card left unanswered for INJURY_AGE of his games: the staff rides it out (his
 * minutes are spread meanwhile), and says so; one that never opened (nothing to choose: see staffCalls)
 * was the staff's to make all along, and is said that way.
 */
function ageInjuries(league: League) {
  if (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return;
  let shown: Set<string> | null = null;
  for (const { p, id } of hurtStars(league)) {
    if (settled(league, id) || p.injury!.gamesTotal - p.injury!.gamesRemaining < INJURY_AGE) continue;
    // (read before the first is settled: a card with a real choice in it is one Needs you showed)
    shown ??= new Set(staffCalls(league, { skipWeek: true }).map((c) => c.id));
    const looked = league.callLook?.id === id;
    settleCall(league, id);
    notePick(
      league,
      shown.has(id)
        ? `${playerName(p)} out: ${looked ? 'no deal came of the look for a trade' : `the card went unanswered for ${INJURY_AGE} games`}, so the staff rode it out.`
        : `${playerName(p)} out: the staff spread his minutes (nothing else to choose).`,
    );
  }
}

/** A user's first season: the record that makes a start a slump the staff explains (at least this many games under .500), and the games it's read over. */
export const SLUMP_UNDER = 3;
export const SLUMP_GAMES: readonly [number, number] = [5, 20];

/**
 * The first slump of a user's first season (SLUMP_UNDER games under .500 within SLUMP_GAMES), once:
 * one plain line from the staff that pulls apart what the box scores put down to luck (shots falling
 * below their looks), the games his best players missed, and the rest (the matchups and the roster:
 * what a plan can change), with the wins the forecast, which counts all of it, still has him at.
 * The staff's read, in the digest.
 */
function firstSlump(league: League) {
  if (league.phase !== 'regular' || league.season !== league.startSeason) return;
  const id = `slump:${league.season}`;
  const ts = league.teams[league.userTid].seasons.find((x) => x.season === league.season);
  const gp = ts ? ts.won + ts.lost : 0;
  if (!ts || settled(league, id) || gp < SLUMP_GAMES[0] || gp > SLUMP_GAMES[1] || ts.lost - ts.won < SLUMP_UNDER) return;
  settleCall(league, id);
  const me = league.userTid;
  const res = lastResults(league, gp);
  if (!res.length) return;
  const margin = res.reduce((a, r) => a + (r.home.tid === me ? r.home.pts - r.away.pts : r.away.pts - r.home.pts), 0) / res.length;
  const luck = res.reduce((a, r) => a + (buildGameReport(league, r)?.factors ?? []).filter((f) => f.luck).reduce((b, f) => b + f.pts, 0), 0) / res.length;
  // the games his rotation (his eight best as the roster stands) sat out hurt
  const best = new Set(
    standardRoster(league, me)
      .sort((x, y) => y.ovr - x.ovr || x.pid - y.pid)
      .slice(0, 8)
      .map((p) => p.pid),
  );
  const out = new Map<number, number>();
  for (const r of res)
    for (const b of (r.home.tid === me ? r.home : r.away).players) if (best.has(b.pid) && b.dnp?.startsWith('Injured')) out.set(b.pid, (out.get(b.pid) ?? 0) + 1);
  const missed = [...out.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]);
  const names = missed.slice(0, 3).map(([pid]) => playerName(league.players[pid]));
  const hurt = missed.length
    ? `${names.join(missed.length > 3 ? ', ' : ' and ')}${missed.length > 3 ? ' and others' : ''} ${missed.length > 1 ? 'have' : 'has'} missed ${plural(
        missed.reduce((a, x) => a + x[1], 0),
        'game',
      )} hurt${missed.length > 1 ? ' between them' : ''}`
    : 'none of your rotation has missed a game hurt';
  // (what the luck doesn't account for: the roster, the matchups and the games missed)
  const rest = margin - Math.min(0, luck);
  const fc = leagueForecast(league)?.teams[me];
  notePick(
    league,
    `${ts.won}-${ts.lost}, as the staff reads it: ${margin < 0 ? `outscored by ${(-margin).toFixed(1)} a game` : `even on points (${signed(margin)} a game), the close ones gone the other way`}. ${
      luck <= -1 ? `About ${(-luck).toFixed(1)} a game of it is shots that didn't fall (luck, not the plan)` : 'The shots fell about as their looks were worth: not luck'
    }; ${hurt}; ${rest < -1 ? `the other ${(-rest).toFixed(1)} a game is the roster and the matchups, injuries included: that's what a plan or a move can change` : 'the rest is about even'}.${
      fc ? ` The forecast, which counts all of it, has you at about ${Math.round(fc.w)} wins.` : ''
    }`,
  );
}

// ---------------------------------------------------------------- the staff's own picks

/**
 * What the calls' picks still wait on, measured before a sim decides whether to stop (see
 * callMeasure.ts): a skid's counters for its next game, the adjustment for a series game he's behind
 * in, and the numbers on any card open now (a star's worth, a series' plan).
 */
export function callNeeds(league: League): CallMeasure[] {
  if (league.fired) return [];
  const out = new Map<string, CallMeasure>();
  const s = skidOpen(league);
  const sg = s && !s.put ? league.schedule.find((x) => x.gid === s.gid) : undefined;
  if (s && sg && !(league.callWorth?.[skidId(s)]?.gid === sg.gid)) out.set(skidId(s), countersFor(league, skidId(s), s.opp, sg, skidMax(s)).measure);
  const b = seriesBehind(league);
  if (b && !settled(league, b.id) && !(league.callWorth?.[b.id]?.gid === b.g.gid)) out.set(b.id, countersFor(league, b.id, b.opp, b.g, behindMax(b.w, b.l)).measure);
  if (candidateIds(league).some((id) => !isWeekId(id))) for (const c of staffCalls(league, { skipWeek: true })) if (c.measure) out.set(c.measure.key, c.measure);
  return [...out.values()];
}

/**
 * The calls whose honest answer is always the staff's, made once measured: a skid's counters for its
 * next game (and what's behind the slide said), and the adjustment each morning he's behind in a
 * series (one counter, two down two games, three facing elimination). In the digest's lines.
 */
export function callsDecide(league: League) {
  if (league.fired) return;
  const s = skidOpen(league);
  const sg = s && !s.put ? league.schedule.find((x) => x.gid === s.gid) : undefined;
  const sw = s && sg && league.callWorth?.[skidId(s)];
  if (s && sg && sw && sw.gid === sg.gid) {
    const items = sw.items ?? [];
    // (the staff's own picks: not a plan of his, as the guide counts them)
    for (const it of items) setPlanItem(league, s.opp, { ...it, staff: true });
    s.put = items.length
      ? `The staff put in ${items.map((x) => `${x.label} (${ptsWin(x.pts ?? 0, true)})`).join(' and ')} for ${gameText(league, sg)}, measured.`
      : `Nothing the staff measured for ${gameText(league, sg)} beats your plan.`;
    notePick(league, `${skidTitle(s)}: ${s.diag ? `${s.diag} ` : ''}${s.put}`);
  }
  const b = seriesBehind(league);
  const bw = b && !settled(league, b.id) ? league.callWorth?.[b.id] : undefined;
  if (b && bw && bw.gid === b.g.gid) {
    const items = bw.items ?? [];
    for (const it of items) setPlanItem(league, b.opp, { ...it, staff: true });
    settleCall(league, b.id);
    const games = league.games.filter((r) => r.season === league.season && r.type === 'playoffs' && r.seriesId === b.series.id);
    const diag = slideDiagnosis(league, games);
    const game = `Game ${b.w + b.l + 1}`;
    notePick(
      league,
      `${seriesLabel(b.series)}: down ${b.l}-${b.w} to ${league.teams[b.opp].abbrev}. ${diag ? `${diag} ` : ''}${
        items.length
          ? `The staff put in ${items.map((x) => `${x.label} (${ptsWin(x.pts ?? 0, true)})`).join(' and ')} for ${game}, measured.`
          : `Nothing the staff measured for ${game} beats your plan.`
      }`,
    );
  }
}

// ---------------------------------------------------------------- the cards

/** The card's shape, as agenda.ts draws it (kept structural here so agenda.ts can import this file). */
export interface CallCard {
  id: string;
  kind: CallKind;
  title: string;
  line: string;
  tone: 'bad' | 'warn' | 'info';
  to?: string;
  due?: string;
  /** The last day its answer can be made (the deadline, for the odds and the floor): within DUE_SOON days of it, a long sim stops once more. */
  dueDay?: number;
  pids?: number[];
  suggestion?: CallChoice;
  choices?: CallChoice[];
  /** How its number is measured (the screen runs it as the card shows: see CallMeasure). */
  measure?: CallMeasure;
  /** Its choice waits on that measuring: the card is open meanwhile, its buttons until the numbers are in. */
  measuring?: boolean;
}

export type CallAction =
  | { kind: 'settle'; id: string }
  /** A look at the screen with the answer (the plan): the call stays open until it's answered there. */
  | { kind: 'open'; id: string }
  /**
   * The staff's plan for a series: the counters it measured as gains against `opp` (the screen
   * measures them in the worker first and passes them in; none, or none passed: his playbook as it is).
   */
  | { kind: 'staffPlan'; id: string; opp: number; items?: GamePlanItem[] }
  | { kind: 'tenDay'; id: string; pid: number }
  | { kind: 'staffRotation'; id: string }
  | { kind: 'concede'; id: string }
  | { kind: 'easeFloor'; id: string }
  | { kind: 'trade'; id: string; offer: TradeOffer }
  | { kind: 'budgetCut'; id: string }
  | { kind: 'ticketPrice'; id: string; price: number }
  /** The week's practice: the side of its card whose first focus is `focus` (it comes out at the week's end: see weekCall.ts). */
  | { kind: 'weekPrep'; id: string; focus: PrepFocus }
  /** The week's card on the young players: the staff's rotation leans to them (see youthLean.ts). */
  | { kind: 'youthLean'; id: string }
  /**
   * A look for a trade on the screen `to` opens (Trade → Find filtered for the need, or the trading
   * block): the call stays open until a trade of his from it on (see dealt), or his other answer.
   */
  | { kind: 'look'; id: string };

export interface CallChoice {
  label: string;
  action: CallAction;
  /** The screen it opens once taken (a look for a trade): the answer is made there. */
  to?: string;
  blocked?: string;
  tone?: 'good' | 'bad';
  confirm?: string;
}

/** The OVR of the user's fifth best: the bar a player bought has to clear. */
const fifthBest = (league: League) => [...standardRoster(league, league.userTid)].sort((a, b) => b.ovr - a.ovr)[4]?.ovr ?? 0;

/**
 * A look on Trade → Find for a player over `minOvr` (at `pos`) whose salary the user can take back
 * now, labelled `label`: only while deals can be made and someone there fits (a blank builder, or a
 * list with nobody on it, isn't a choice). It doesn't settle its call: a trade of his from it on does.
 */
function findLook(league: League, id: string, label: string, minOvr: number, pos?: Pos): CallChoice | null {
  if (tradingClosedReason(league)) return null;
  const found = filterTargets(tradeTargets(league), { pos, minOvr, maxSalary: maxTakeBack(league, league.userTid) });
  return found.length ? { label, action: { kind: 'look', id }, to: `/office/trade?tab=find${pos ? `&pos=${pos}` : ''}&minOvr=${minOvr}` } : null;
}

/** A look at what the trading block brings for `p` (the screen asks every team): only while deals can be made. */
function blockLook(league: League, id: string, label: string, p: Player | undefined): CallChoice | null {
  return p && !tradingClosedReason(league) ? { label, action: { kind: 'look', id }, to: `/office/trade?give=${p.pid}` } : null;
}

/** The best free agent who'd take a 10-day contract now, for cover (null when none can be signed). */
function tenDayCover(league: League, pos: string): Player | null {
  if (tenDayClosedReason(league)) return null;
  const me = league.userTid;
  const pool = Object.values(league.players).filter((p) => p.tid === FREE_AGENT && !p.waivers && wantsTenDay(league, p, me));
  const same = (p: Player) => (p.pos === pos ? 1 : 0);
  return pool.sort((a, b) => b.ovr + 2 * same(b) - (a.ovr + 2 * same(a)) || a.pid - b.pid).find((p) => !tenDayBlockedReason(league, me, p)) ?? null;
}

/**
 * The staff's counters for game `g` against `opp` as a card measures them (the best `max` gains kept,
 * under `key`), and what's kept for them if it still stands (else the card measures them again).
 */
function countersFor(league: League, key: string, opp: number, g: ScheduledGame, max: number): { measure: CallMeasure; worth: CallWorth | null } {
  const sig = worthSig(league, opp, g);
  const w = league.callWorth?.[key];
  return { measure: { kind: 'counters', key, opp, gid: g.gid, sig, max }, worth: w && w.gid === g.gid && w.sig === sig ? w : null };
}

/** The user's next game from today (any opponent but `not`). */
function nextGame(league: League, not?: number): ScheduledGame | undefined {
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && g.type !== 'allstar' && (g.home === me || g.away === me) && g.home !== not && g.away !== not)
    .reduce<ScheduledGame | undefined>((a, g) => (!a || g.day < a.day || (g.day === a.day && g.gid < a.gid) ? g : a), undefined);
}

/**
 * Where a hurt player's minutes go while he's out, as the staff's rotation plans them: the two
 * players whose minutes rise most against the plan with him fit (none for a rotation set by hand:
 * his minutes are the user's to place), and that plan, for measuring him back.
 */
function minutesOf(league: League, pid: number): { to: Player[]; fit?: League['teams'][number]['rotation'] } {
  const team = league.teams[league.userTid];
  if (team.rotation.manual) return { to: [] };
  const roster = Object.values(league.players).filter((p) => p.tid === league.userTid);
  const fit = autoRotation(
    roster.map((p) => (p.pid === pid ? { ...p, injury: null } : p)),
    team.rotation,
  );
  const now = team.rotation.minutes;
  const to = roster
    .filter((p) => p.pid !== pid && (now[p.pid] ?? 0) - (fit.minutes[p.pid] ?? 0) >= 2)
    .sort((a, b) => (now[b.pid] ?? 0) - (fit.minutes[b.pid] ?? 0) - ((now[a.pid] ?? 0) - (fit.minutes[a.pid] ?? 0)) || a.pid - b.pid)
    .slice(0, 2);
  return { to, fit };
}

/** "Friday @ BOS", "tonight vs MIA". */
const gameText = (league: League, g: ScheduledGame) => `${g.day === league.day ? 'tonight' : fmtDate(league.season, g.day, { weekday: 'long' })} ${vsAt(league, g)}`;

/** The staff's calls open now, as cards. `skipWeek`: not the week's (a sim's daily look: openWeekId says whether it's open). */
export function staffCalls(league: League, opts: { skipWeek?: boolean } = {}): CallCard[] {
  const open = new Set(candidateIds(league));
  if (!open.size) return [];
  const cards: CallCard[] = [];
  const me = league.userTid;
  const team = league.teams[me];
  const byDeadline = `Decide by ${fmtDate(league.season, league.tradeDeadlineDay)}`;

  // (first: it's tonight)
  const start = seriesStart(league);
  if (start && open.has(start.id)) {
    const { id, opp, g, series, playIn } = start;
    const abbrev = league.teams[opp].abbrev;
    // a plan made for this opponent already holds (a series plan, or one for the season)
    const made = planFor(league, opp, g);
    const planned = !!made && planMade(made);
    const stakes = !playIn
      ? 'A plan set now holds for every game of the series.'
      : playIn.id.endsWith('-78')
        ? "Win and you're the 7th seed; lose and there's one more game for the 8th."
        : playIn.id.endsWith('-910')
          ? 'Win and you play for the 8th seed; lose and the season is over.'
          : "Win and you're the 8th seed; lose and the season is over.";
    // the staff's counters for Game 1, measured as the card shows: its plan is the gains, each with its number
    const { measure, worth } = countersFor(league, id, opp, g, 3);
    const items = worth?.items ?? [];
    const staff = !worth
      ? 'The staff is measuring its counters against them.'
      : items.length
        ? `The staff's plan: ${items.map((x) => `${x.label} (${signed(x.pts ?? 0)})`).join(', ')}, each measured on its own on tonight's game.`
        : `None of the staff's counters measures as a gain against them: ${planned ? 'your plan stands' : 'your playbook as it is, or a plan of your own'}.`;
    // (opening the plan doesn't answer the call: a plan set for the series does, see planSet)
    const plan: CallChoice = {
      label: planned ? 'Review the plan' : series ? 'Plan the series' : 'Plan the game',
      action: { kind: 'open', id },
      to: `/games/${opp}?tab=plan`,
    };
    cards.push({
      id,
      kind: 'series',
      title: series ? `${seriesLabel(series)} vs ${abbrev}: Game 1 tonight` : `Play-in vs ${abbrev} tonight`,
      // (the staff's numbers first: Today's row shows two lines)
      line: `${staff} ${planned ? 'Your plan against them is in place. ' : ''}${stakes}`,
      tone: 'info',
      to: `/games/${opp}`,
      suggestion: plan,
      // the staff's way: its plan, the counters its numbers back (the Preview's "Use the staff's plan")
      choices: [
        planned && !items.length
          ? { label: 'Keep it', action: { kind: 'settle', id } }
          : { label: 'Leave it to the staff', action: { kind: 'staffPlan', id, opp, ...(worth ? { items } : {}) } },
      ],
      ...(worth ? {} : { measure }),
    });
  }

  // a rebuild, or an owner who wants minutes for the young: cover is a young player, or none
  const young = team.strategy === 'rebuild' || !!currentGoals(league)?.goals.some((g) => g.kind === 'youth');
  for (const { p, id } of hurtStars(league)) {
    if (!open.has(id)) continue;
    // (measured once an injury: what he's worth doesn't turn on the night)
    const worth = league.callWorth?.[id] ?? null;
    // measured as no real loss: cover can't win back what isn't lost (the staff never calls for more than its own read)
    const missed = !worth || (worth.pts ?? 0) >= WORTH_MIN;
    const any = tenDayCover(league, p.pos);
    const cover = missed && any && (!young || playerAge(any, league.season) <= YOUNG_COVER) ? any : null;
    const manual = team.rotation.manual;
    const out = p.injury!.gamesRemaining;
    // a trade for cover is a real answer to a long absence while deals can still be made, for a star
    // measured as a real loss: a look on Find at his position, better than the fifth best, salary he can take back
    const look =
      out >= TRADE_OUT && missed && league.phase === 'regular' && league.day <= league.tradeDeadlineDay
        ? findLook(league, id, 'Look for a trade', fifthBest(league) + 1, p.pos)
        : null;
    const ride: CallChoice = { label: 'Ride it out', action: { kind: 'settle', id } };
    const suggestion: CallChoice = cover
      ? { label: `Sign ${playerName(cover)} to a 10-day`, action: { kind: 'tenDay', id, pid: cover.pid }, confirm: `${cover.pos} · ${cover.ovr} OVR, for ten days at the minimum.` }
      : manual
        ? { label: 'Let the staff redo the rotation', action: { kind: 'staffRotation', id } }
        : ride;
    // what he's worth, measured on the next game (him fit, the staff's rotation planned with him), and where his minutes go
    const mins = minutesOf(league, p.pid);
    const g = nextGame(league);
    const opp = g && (g.home === me ? g.away : g.home);
    const measure: CallMeasure | undefined =
      g && opp !== undefined && !worth
        ? {
            kind: 'change',
            key: id,
            opp,
            gid: g.gid,
            sig: worthSig(league, opp, g, `${p.pid}`),
            change: { id: 'back', players: { [p.pid]: { injury: null } }, ...(mins.fit ? { teams: { [me]: { rotation: mins.fit } } } : {}) },
          }
        : undefined;
    const on = worth && league.schedule.find((x) => x.gid === worth.gid);
    // (first: Today's row shows two lines)
    const value =
      worth && on
        ? `Without him: ${worthWords(-(worth.pts ?? 0))} (measured on ${on.day >= league.day ? gameText(league, on) : `${fmtDate(league.season, on.day)} ${vsAt(league, on)}`}). `
        : '';
    const to = mins.to.length ? `His minutes go to ${mins.to.map((x) => playerName(x)).join(' and ')}` : '';
    cards.push({
      id,
      kind: 'injury',
      title: `${playerName(p)} is out ${plural(out, 'game')}`,
      line:
        value +
        (cover
          ? `The staff's call: a 10-day for cover while he's out. ${manual ? 'Your rotation is set by hand: his minutes need a home.' : `${to || 'The staff spreads his minutes'} meanwhile.`}`
          : manual
            ? "The staff's call: hand them the rotation while he's out, so his minutes go where they should."
            : !missed
              ? `The staff's call: ride it out; the team measures about as well without him. ${to || 'His minutes go to the healthy players'}.`
              : young && any
                ? `The staff's call: ride it out. ${to || 'His minutes go to the healthy players'}: a veteran on a 10-day would only take them from the young players.`
                : `The staff's call: ride it out. ${to || 'His minutes go to the healthy players'}${look ? `; a trade is the other way (Find: a ${p.pos} better than your fifth best whose salary you can take back)` : ''}.`),
      tone: 'bad',
      to: look?.to ?? '/team',
      pids: [p.pid],
      suggestion,
      choices: [...(suggestion === ride ? [] : [ride]), ...(look ? [look] : [])],
      ...(measure ? { measure } : {}),
    });
  }

  const odds = oddsCall(league);
  if (odds && open.has(oddsId(league))) {
    const id = oddsId(league);
    const blocked = concedeBlockedReason(league);
    const concede: CallChoice = {
      label: "Tell the owner it's a rebuild",
      action: { kind: 'concede', id },
      blocked: blocked ?? undefined,
      confirm: `The postseason goal becomes a development goal that grades 0 at best: it spares you the miss but earns nothing on top. The season counts toward his rebuild limit, and your standing drops ${Math.round(CONCEDE_COST * 100)} points that stay off at his review.`,
    };
    const push: CallChoice = { label: 'Keep pushing', action: { kind: 'settle', id } };
    // (with the rebuild off the table, the answer is still buy or sell before the deadline)
    const look = findLook(league, id, 'Look for a deal', fifthBest(league) + 1);
    // the lean: whichever answer leaves his standing higher, as the forecast reads the season
    const st = blocked ? null : concedeStanding(league);
    const tell = !!st && st.concede > st.push;
    const read = st
      ? `Pushing on: ${standingPts(st.push)} to your standing with him, the forecast's read (${pct(st.reach)} to reach his goal); telling him now: ${standingPts(st.concede)} at once, and a season on his rebuild clock. `
      : '';
    cards.push({
      id,
      kind: 'odds',
      title: `Postseason odds down to ${oddsText(odds.now)}`,
      line: blocked
        ? `The staff's call: keep pushing. ${blocked}`
        : `${read}The staff's call: ${tell ? 'tell the owner now, play the young players and sell veterans before the deadline' : 'keep pushing: missing his goal costs you less than telling him'}.`,
      tone: 'warn',
      to: '/office/owner',
      due: byDeadline,
      dueDay: league.tradeDeadlineDay,
      ...(blocked ? { suggestion: push, choices: look ? [look] : [] } : tell ? { suggestion: concede, choices: [push] } : { suggestion: push, choices: [concede] }),
    });
  }

  const floor = floorCall(league);
  if (floor && open.has(floorId(league))) {
    const id = floorId(league);
    const blocked = easeFloorBlockedReason(league);
    const og = currentGoals(league)!;
    // (a buy before the deadline: Find, better than the fifth best; with nobody to find, the call is the development year or nothing)
    const chase = findLook(league, id, 'Chase the floor', fifthBest(league) + 1);
    const ease: CallChoice = {
      label: "Tell him it's a development year",
      action: { kind: 'easeFloor', id },
      blocked: blocked ?? undefined,
      confirm: `His floor drops to ${Math.ceil(Math.max(0, og.floor! - FLOOR_EASE) * og.games)} wins, part of the win goal becomes minutes for the young players, the season counts toward his rebuild limit, and your standing drops ${Math.round(CONCEDE_COST * 100)} points.`,
    };
    // the lean: whichever answer leaves his standing higher at the review, as the forecast reads the season
    const st = blocked ? null : floorStanding(league);
    const tell = !!st && st.ease > st.chase;
    const play: CallChoice = { label: 'Play it out', action: { kind: 'settle', id } };
    const read = st
      ? `Chasing it: ${standingPts(st.chase)} to your standing at his review; a development year: ${standingPts(st.ease)}, its cost included (the forecast's read: about ${st.wins} wins either way). `
      : '';
    cards.push({
      id,
      kind: 'floor',
      title: `On pace for ${floor.projected} wins: under the owner's floor`,
      line: `Under ${floor.floorWins} wins he calls it a failed season, whatever else goes right. ${
        blocked
          ? `The staff's call: chase it before the deadline. ${blocked}`
          : `${read}The staff's call: ${
              tell
                ? "tell him it's a development year and play the young players for the lottery"
                : chase
                  ? 'chase it: buy before the deadline to clear it'
                  : 'play it out: nobody the staff can find on the market clears it'
            }.`
      }`,
      tone: 'warn',
      to: '/office/owner',
      due: byDeadline,
      dueDay: league.tradeDeadlineDay,
      ...(blocked ? (chase ? { suggestion: chase } : {}) : tell ? { suggestion: ease, choices: chase ? [chase] : [play] } : { suggestion: chase ?? play, choices: [ease] }),
    });
  }

  if (open.has(deadlineId(league))) {
    const id = deadlineId(league);
    const call = league.deadlineCall?.season === league.season ? league.deadlineCall : null;
    const left = league.tradeDeadlineDay - league.day;
    const offer = call?.offer;
    const other = offer ? league.teams[offer.b.tid] : null;
    // (today's odds, as Today and the standings show them: not the reading the call was worked out from)
    const now = call ? leagueForecast(league)?.teams[me] : undefined;
    const odds = now ? `Postseason odds ${pct(now.reach[0], now.clinched)}. ` : call ? `Postseason odds ${oddsText(call.odds)}. ` : '';
    const stand: CallChoice = { label: 'Stand pat', action: { kind: 'settle', id } };
    // with no deal found, the need the staff was looking for: a player better than the fifth best
    // to buy (Trade → Find), the veteran a contender would pay most for to sell (the trading block)
    const roster = standardRoster(league, me);
    const bar = fifthBest(league);
    const vet = roster.filter((p) => playerAge(p, league.season) >= 28 && p.ovr >= 70).sort((x, y) => tradeValue(league, y) - tradeValue(league, x) || x.pid - y.pid)[0];
    const look = call?.mode === 'buy' ? findLook(league, id, 'Look for a deal', bar + 1) : call?.mode === 'sell' ? blockLook(league, id, 'Look for a deal', vet) : null;
    const none =
      call?.mode === 'buy'
        ? `buy a player better than your fifth best (${bar} OVR). Nobody the staff asked takes what you can send for one${look ? "; Find lists who's out there" : ''}.`
        : call?.mode === 'sell'
          ? `sell${vet ? ` ${playerName(vet)}` : ''}. No contender the staff asked bites yet${look ? '; the trading block shows who would' : ''}.`
          : 'stand pat. The team is where it is.';
    // the deal's numbers: its worth a game measured on his next game against someone else (once, as
    // its card opens), what the forecast reads it adds to the odds, what the players coming cost, and
    // what it does to the owner's money and youth goals
    const g = offer ? nextGame(league, offer.b.tid) : undefined;
    const opp = g && (g.home === me ? g.away : g.home);
    const worth = offer ? (league.callWorth?.[id] ?? null) : null;
    const measure: CallMeasure | undefined =
      offer && g && opp !== undefined && !worth
        ? { kind: 'change', key: id, opp, gid: g.gid, sig: worthSig(league, opp, g, `deal:${offer.a.pids.join(',')}:${offer.b.pids.join(',')}`), ...dealChange(league, offer) }
        : undefined;
    const on = worth && league.schedule.find((x) => x.gid === worth.gid);
    const games = gamesLeft(league);
    const pts = worth?.pts;
    const measured =
      pts !== undefined && on
        ? `With the deal: ${worthWords(pts)} (measured ${vsAt(league, on)})${Math.abs(pts) >= WORTH_MIN && games ? `, about ${signed(winsOf(pts, games))} wins over the ${games} games left` : ''}${
            now && call?.oddsGain !== undefined && !now.clinched
              ? `; postseason odds about ${pct(Math.min(1, Math.max(0, now.reach[0] + call.oddsGain / 1000)))} with it (the forecast's read)`
              : ''
          }. `
        : offer
          ? 'The staff is measuring the deal. '
          : '';
    const costs = offer ? offer.b.pids.map((pid) => contractText(league, league.players[pid])).join('; ') : '';
    const goals = offer
      ? dealGoals(league, offer)
          .filter((d) => Math.abs(d.with - d.now) >= (d.kind === 'youth' ? 50 : 100))
          .map(dealGoalText)
          .join('; ')
      : '';
    const numbers = `${measured}${costs ? `${costs}. ` : ''}${goals ? `The owner's goals: ${goals}.` : ''}`.trim();
    // a buy is the call only once it measures as a gain: one too close to say, or a cost, is his to take, not the staff's
    const flat = call?.mode === 'buy' && pts !== undefined && pts < WORTH_MIN;
    const deal: CallChoice | null =
      offer && other
        ? {
            label: call!.mode === 'buy' ? `Trade for ${playerName(league.players[offer.b.pids[0]])}` : `Sell to ${other.abbrev}`,
            action: { kind: 'trade', id, offer },
            confirm: `You send ${assetText(league, offer.a)}; the ${other.name} send ${assetText(league, offer.b)}. ${numbers}`.trim(),
          }
        : null;
    cards.push({
      id,
      kind: 'deadline',
      title: left === 0 ? 'Trade deadline: today' : `Trade deadline in ${plural(left, 'day')}`,
      line:
        deal && other
          ? `${odds}The staff's call: ${flat ? "stand pat; the best buy it found doesn't measure as a gain" : call!.mode === 'buy' ? 'buy' : 'sell'}. ${assetText(league, offer!.b)} from the ${other.name} for ${assetText(league, offer!.a)}. ${numbers}`.trim()
          : `${odds}The staff's call: ${none}`,
      tone: 'warn',
      to: '/office/trade',
      due: left === 0 ? 'Deals by the end of the day' : undefined,
      ...(deal ? (flat ? { suggestion: stand, choices: [deal] } : { suggestion: deal, choices: [stand] }) : { suggestion: stand, choices: look ? [look] : [] }),
      ...(measure ? { measure } : {}),
    });
  }

  const b = booksOf(league);
  const bid = b && (open.has(booksId(league)) ? booksId(league) : open.has(booksDueId(league)) ? booksDueId(league) : null);
  if (b && bid) {
    const id = bid;
    const p = seasonEndCash(league, me);
    // as the owner reads them: the tax and inherited salary he signed off on aren't held against the books (see booksOutlook)
    const o = booksOutlook(league);
    // where the close is heading: this season's in season, next season's between seasons (none in the postseason: it has closed)
    const between = !['preseason', 'regular', 'playin', 'playoffs'].includes(league.phase);
    const taxNote = p.tax <= 0 ? '' : o.sanctioned > 0 ? `, leaving out the ${money(o.sanctioned)} he signed off on` : `, after a ${money(p.tax)} luxury tax`;
    const heading =
      p.left > 0
        ? `${between ? "next season's books project" : 'projected'} ${money(Math.abs(o.judged))} in the ${o.judged < 0 ? 'red' : 'black'}${between ? '' : " when the regular season's books close"}${taxNote}`
        : '';
    const closed = money(-(b.close ?? team.cash));
    // the levers, each only when he can pull it now: the budgets (not under the freeze: it has cut
    // them), the ticket price, and salary out while deals can be made (the freeze allows those)
    const save = frozen(league) ? 0 : budgetCutSaves(league);
    const ticket = ticketLever(league);
    const cut: CallChoice | null =
      save > 0 ? { label: 'Cut the budgets', action: { kind: 'budgetCut', id }, confirm: `Coaching, health and facilities go to the league standard (${FROZEN_BUDGET}).` } : null;
    // (no second tap: a price can be changed back on Finances)
    const price: CallChoice | null = ticket ? { label: `Price tickets at $${ticket.price}`, action: { kind: 'ticketPrice', id, price: ticket.price } } : null;
    // (salary out: the trading block for his biggest contract outside his two most valuable players)
    const core = new Set(
      [...standardRoster(league, me)]
        .sort((x, y) => tradeValue(league, y) - tradeValue(league, x))
        .slice(0, 2)
        .map((x) => x.pid),
    );
    const dump = standardRoster(league, me)
      .filter((x) => !core.has(x.pid))
      .sort((x, y) => salaryFor(y, league.season) - salaryFor(x, league.season) || x.pid - y.pid)[0];
    const shed = blockLook(league, id, 'Shed salary', dump);
    const noted: CallChoice = { label: 'Not now', action: { kind: 'settle', id } };
    // the staff's call: whichever of the budgets and the tickets brings more, else salary out
    const levers = [
      { c: cut, v: save },
      { c: price, v: ticket?.gain ?? 0 },
    ]
      .filter((x): x is { c: CallChoice; v: number } => !!x.c)
      .sort((x, y) => y.v - x.v);
    const suggestion = levers[0]?.c ?? shed ?? noted;
    // the gap the next step turns on: to the black (the warning, the ultimatum), or under the freeze
    // to no deeper than the last close (else to the black); and how much of it the staff's call covers
    const floor = (b.stage === 'freeze' || b.stage === 'final') && b.close !== undefined && p.end < b.close ? b.close : 0;
    const gap = p.left > 0 ? Math.max(0, floor - p.end) : 0;
    const covers = levers[0] && suggestion === levers[0].c ? levers[0].v : 0;
    const share =
      gap > 0 && covers > 0
        ? covers >= gap
          ? `, enough to close the ${money(gap)} gap`
          : `. It closes ${money(covers)} of the ${money(gap)} gap: on its own it won't change what happens ${between ? "when next season's books close" : 'when the books close'}${shed ? ', so salary has to go too' : ', and no deals can be made now'}`
        : '';
    const call =
      suggestion === cut
        ? `cut the staff budgets to the league standard (saves ${money(save)}${between ? ' a season' : ' over the rest of the season'})${share}`
        : suggestion === price
          ? `price tickets at $${ticket!.price}, where the gate peaks (${money(ticket!.gain)} more over the home games left)${share}`
          : suggestion === shed
            ? `shed salary${league.phase === 'regular' ? ' before the deadline' : ''}${gap > 0 ? ` (${money(gap)} to find)` : ''}`
            : '';
    const next = between ? "when next season's books close" : 'when the books close';
    // what digging deeper brings, in the Owner page's words (past the debt limit, or in the grace years)
    const deeper = deeperText(league, between);
    const lines: Record<typeof b.stage, string> = {
      warning: `${capitalize(heading)}, and playoff money doesn't count. Still in the red then, and the owner gives you an ultimatum.`,
      ultimatum: `${id === booksDueId(league) ? capitalize(heading) : `The books closed ${closed} in the red${heading ? `; ${heading}` : ''}`}. Still in the red ${next}, and he freezes the budget.`,
      freeze: `Minimum deals only, no raises, no trade that takes on salary, until a season's books close in the black${heading ? `: ${heading}` : ''}. ${deeper}`,
      final: `${deeper.slice(0, -1)}${heading ? `: ${heading}` : ''}.`,
    };
    const titles: Record<typeof b.stage, string> = {
      warning: 'The books are heading into the red',
      ultimatum: "The owner's ultimatum: the books",
      freeze: 'The budget is frozen',
      final: "The owner's final warning: the books",
    };
    cards.push({
      id,
      kind: 'books',
      title: titles[b.stage],
      line: `${lines[b.stage]}${call ? ` The staff's call: ${call}.` : ''}`,
      tone: 'bad',
      to: '/office/finances',
      suggestion,
      choices: [levers[1]?.c, shed, noted].filter((x): x is CallChoice => !!x && x !== suggestion),
    });
  }
  // a skid that has gone on: what's behind it, the counters the staff put in, and a trade while deals can be made
  const skid = skidOpen(league);
  if (skidCard(league, skid) && open.has(skidId(skid))) {
    const id = skidId(skid);
    // the call follows what's behind it: shots that didn't fall ride it out (a trade doesn't fix luck);
    // the matchups, the looks, a star out, a trade (the measured counters are in already)
    const look = findLook(league, id, 'Look for a trade', fifthBest(league) + 1);
    const ride: CallChoice = { label: 'Ride it out', action: { kind: 'settle', id } };
    const deals = `Deals until ${fmtDate(league.season, league.tradeDeadlineDay)}.`;
    cards.push({
      id,
      kind: 'skid',
      title: skidTitle(skid),
      line: `${skid.diag ? `${skid.diag} ` : ''}${skid.put} The staff's call: ${
        skid.luck
          ? `ride it out; the box scores say the shots will come back, and a trade doesn't change that.${look ? ` ${deals}` : ''}`
          : look
            ? `look for a trade; counters alone haven't turned it. ${deals}`
            : 'ride it out; nobody the staff can find on the market is a fix.'
      }`,
      tone: 'warn',
      to: `/games/${skid.opp}?tab=plan`,
      ...(skid.luck || !look ? { suggestion: ride, choices: look ? [look] : [] } : { suggestion: look, choices: [ride] }),
    });
  }

  // the week's card: a trade-off the staff measured both sides of (see weekCall.ts)
  const week = opts.skipWeek ? null : weekCard(league);
  if (week && open.has(week.id)) cards.push(week);

  // a call is a choice: one whose only answer is to carry on isn't opened (one measuring its choice is,
  // meanwhile), nor is one whose other answer is a bare link (a look counts only where there's someone to find: see findLook)
  return cards.filter((c) => c.measuring || [c.suggestion, ...(c.choices ?? [])].some((x) => x && !x.blocked && x.action.kind !== 'settle'));
}

/** Carry out a call's choice (resolveAgenda passes it here); the card is settled when it goes through. */
export function resolveCall(league: League, a: CallAction): { ok: boolean; text: string } {
  let r: { ok: boolean; text: string };
  switch (a.kind) {
    case 'settle':
      // (the week's card answered with things as they were: see answerWeek)
      if (isWeekId(a.id)) answerWeek(league, {});
      r = { ok: true, text: '' };
      break;
    case 'open':
      // (nothing settled: the answer is made on the screen it opens)
      return { ok: true, text: '' };
    case 'look':
      // (nothing settled: a trade made from here on does, see dealt; the id logTxn gives the next one)
      league.callLook = { id: a.id, txn: league.nextTxnId ?? (league.transactions?.length ? league.transactions[league.transactions.length - 1].id + 1 : 1) };
      return { ok: true, text: '' };
    case 'staffPlan': {
      const abbrev = league.teams[a.opp].abbrev;
      for (const it of a.items ?? []) setPlanItem(league, a.opp, it);
      const items = a.items ?? [];
      r = {
        ok: true,
        text: items.length
          ? `The staff's plan vs ${abbrev}: ${items.map((x) => x.label).join(', ')}.`
          : `The staff plays ${abbrev} with your playbook as it is: none of its counters measured as a gain.`,
      };
      break;
    }
    case 'tenDay': {
      const t = userTenDay(league, a.pid);
      r = { ok: t.ok, text: t.reason };
      break;
    }
    case 'staffRotation':
      league.teams[league.userTid].rotation.manual = false;
      ensureRotation(league, league.userTid);
      r = { ok: true, text: 'The staff has the rotation.' };
      break;
    case 'easeFloor': {
      const why = easeFloorBlockedReason(league);
      if (!why) easeFloor(league);
      r = why ? { ok: false, text: why } : { ok: true, text: 'The owner knows: a development year.' };
      break;
    }
    case 'concede': {
      const why = concedeBlockedReason(league);
      if (!why) concedeSeason(league);
      r = why ? { ok: false, text: why } : { ok: true, text: 'The owner knows: a rebuilding season.' };
      break;
    }
    case 'trade': {
      const t = league.teams[a.offer.b.tid];
      const errors = validateTrade(league, a.offer);
      if (errors.length) r = { ok: false, text: errors[0] };
      else if (!teamAccepts(league, a.offer, t.tid)) r = { ok: false, text: `The ${t.name} have changed their mind.` };
      else {
        executeTrade(league, a.offer);
        // the deal can make open offers impossible (the same player, a full roster)
        cleanProposals(league);
        r = { ok: true, text: `Trade done with the ${t.region} ${t.name}.` };
      }
      break;
    }
    case 'budgetCut': {
      const budget = league.teams[league.userTid].budget;
      for (const k of ['coaching', 'health', 'facilities'] as const) budget[k] = Math.min(budget[k], FROZEN_BUDGET);
      r = { ok: true, text: 'Budgets cut to the league standard.' };
      break;
    }
    case 'ticketPrice':
      Object.assign(league.teams[league.userTid].budget, { ticketPrice: a.price, priceSet: true });
      r = { ok: true, text: `Tickets priced at $${a.price}.` };
      break;
    case 'weekPrep':
      r = answerWeek(league, { focus: a.focus });
      break;
    case 'youthLean':
      r = answerWeek(league, { youth: true });
      break;
  }
  if (r.ok) settleCall(league, a.id);
  return r;
}

const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
