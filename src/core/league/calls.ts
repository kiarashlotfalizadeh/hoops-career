// The staff's calls: the moments in a season that need the user's answer, each a Needs-you card on
// Today with the staff's call one tap away (see agenda.ts for how cards are drawn and settled). A
// star goes down for ten games or more (the call: a 10-day for cover, the staff's rotation, or a
// trade for a long absence before the deadline, with what he's worth measured and where his minutes
// go); the playoff odds under 5% two weeks running for a team the owner expects in the postseason
// (the call: tell him it's a rebuild, before the deadline); a team on pace under the owner's win
// floor, now and three games ago (the call: chase it with a trade, or tell him it's a development
// year, before the deadline); the deadline's last five days (the call: the staff's best deal, buying
// or selling as the odds say, a look for one, or standing pat); the morning a playoff series or a
// play-in game of his starts, and each morning after a loss that has him behind in a series (the
// call: the staff's measured counters for it, a plan of his own, or the plan as it is); a losing
// skid, four straight or six of eight, for any team (the call: the staff's measured counter for the
// next game, or riding it out); the books: their close heading into the red in the weeks before the
// deadline, or a step the owner took on them at his review (the call: the budgets down to the league
// standard, tickets priced where the gate peaks, or salary shed while deals can be made); and each
// week of the regular season, the week's call (see weekCall.ts: its big game or its practice). A
// reading that moves week to week (the odds, the pace) is a call only once two readings agree: one
// bad week isn't. A call is only a call with a real choice in it: one whose only answer is "OK"
// isn't opened (the digest has the news); one whose choice waits on the staff's measuring (`measure`:
// the screen runs it in the sim worker as the card shows, and storeWorth keeps the numbers) is open
// while it measures. A long sim stops the day a new one opens (the week's call only stops a week's
// sim: see runSim), and once more for one still open as its due date nears (see openCallIds), and
// for nothing else that doesn't need an answer. A card is settled by its call or a choice; it is
// remembered (League.callsDone) so it doesn't come back. Nothing here draws from the league's random
// stream.
import type { GamePlanItem, League, PlayInGame, PlayoffSeries, Player, PrepFocus, ScheduledGame } from '../types';
import { FREE_AGENT } from '../types';
import { fmtDate, playerName, revenueScale, standardRoster } from './helpers';
import { confStandings } from './standings';
import { money, plural } from '../format';
import { currentGoals, concedeBlockedReason, concedeSeason, CONCEDE_COST, easeFloor, easeFloorBlockedReason, floorDanger, FLOOR_EASE } from './ownerGoals';
import { tenDayBlockedReason, tenDayClosedReason, userTenDay, wantsTenDay } from './tenDay';
import { booksOf, booksOutlook, deeperText, frozen, FROZEN_BUDGET, warnWindow } from './books';
import { aiTicketPrice, attendanceFor, budgetCostPerSeason, seasonEndCash } from './finances';
import { tradeTargets } from './tradeFinder';
import { makeItWork } from './tradeHelp';
import { packageFor } from './tradePackages';
import { executeTrade, teamAccepts, tradingClosedReason, validateTrade, type TradeOffer } from './trades';
import { tradeValue } from './contracts';
import { assetText, cleanProposals } from './proposals';
import { ensureRotation, userGameOnDay } from './games';
import { seriesLabel } from './playoffs';
import { itemGroup, planFor, planMade, setPlanItem } from './gamePlans';
import { playerAge } from '../playerGen';
import { leagueForecast, pct } from '../analysis/odds';
import { hashString } from '../random';
import { autoRotation } from '../ai/coachAI';
import { WORTH_MIN, worthCall, type CounterWorth, type LeagueChange } from '../ai/counterWorth';
import { counterCandidates } from '../ai/advisor';
import { PREP_META } from '../sim/familiarity';
import {
  answerWeek,
  currentWeek,
  holdPractice,
  isWeekId,
  openWeekId,
  practiceOutlook,
  vsAt,
  weekDaily,
  weekGame,
  weekId,
  weekKind,
  weekWorthId,
  whenText,
  WEEK_DAYS,
} from './weekCall';

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
 * readings): the gains, the best first and one per game-plan group, at most the call's `max` (with
 * more than one, a series' plan, the groups his plan already settles left to it, as the Preview's
 * "Use the staff's plan" makes it); and the best reading when none is a gain.
 */
export function countersWorth(league: League, m: Extract<CallMeasure, { kind: 'counters' }>, worths: CounterWorth[]): CallWorth {
  const by = new Map(worths.map((w) => [w.id, w]));
  const cands = counterCandidates(league, league.userTid, m.opp).filter((c) => by.has(c.id));
  const g = league.schedule.find((x) => x.gid === m.gid);
  const taken = new Set(m.max > 1 ? (planFor(league, m.opp, g)?.items ?? []).map(itemGroup) : []);
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
}

const settled = (league: League, id: string) => !!league.callsDone?.includes(id);

/** Remember a call as settled. */
export function settleCall(league: League, id: string) {
  const done = (league.callsDone ?? []).filter((x) => x !== id);
  done.push(id);
  league.callsDone = done.slice(-DONE_KEPT);
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

/**
 * Each morning of the regular season: a losing skid (SKID_STRAIGHT straight, or SKID_LOST of the last
 * SKID_OF, SKID_EXCESS past his record) opens its call, about the next game, unless one opened in the
 * last SKID_GAP games.
 */
function skidDaily(league: League) {
  if (league.phase !== 'regular' || league.fired) return;
  const me = league.userTid;
  const ts = league.teams[me].seasons.find((x) => x.season === league.season);
  if (!ts) return;
  const gp = ts.won + ts.lost;
  const rate = (ts.lost + 5) / (gp + 10);
  const straight = -ts.streak >= SKID_STRAIGHT && -ts.streak * (1 - rate) >= SKID_EXCESS;
  const lostOf = ts.lastTen.length >= SKID_OF ? ts.lastTen.slice(-SKID_OF).filter((x) => !x).length : 0;
  if (!straight && (lostOf < SKID_LOST || lostOf - SKID_OF * rate < SKID_EXCESS)) return;
  const prev = league.skidCall;
  if (prev && prev.season === league.season && prev.tid === me && gp - prev.gp < SKID_GAP) return;
  const next = league.schedule
    .filter((g) => !g.played && g.type === 'regular' && g.day >= league.day && (g.home === me || g.away === me))
    .reduce<ScheduledGame | undefined>((a, g) => (!a || g.day < a.day || (g.day === a.day && g.gid < a.gid) ? g : a), undefined);
  if (!next) return;
  const of = straight ? -ts.streak : SKID_OF;
  const res = league.games.filter((r) => r.season === league.season && r.type === 'regular' && (r.home.tid === me || r.away.tid === me)).slice(-of);
  const margin = res.length ? res.reduce((a, r) => a + (r.home.tid === me ? r.home.pts - r.away.pts : r.away.pts - r.home.pts), 0) / res.length : undefined;
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
  };
}

/** The ids of the calls that may be open now, before asking whether each has a real choice in it. */
function candidateIds(league: League): string[] {
  if (league.fired) return [];
  const ids: string[] = [];
  const series = seriesStart(league);
  if (series && !planSet(league, series)) ids.push(series.id);
  const behind = seriesBehind(league);
  if (behind) ids.push(behind.id);
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
  if (skid) ids.push(skidId(skid));
  // (last: what a sim says it stopped for is the first new one, and the week's is the least of them)
  const week = openWeekId(league);
  if (week) ids.push(week);
  return ids.filter((id) => !settled(league, id));
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
 * The staff's deadline call (once a season, the day its card opens): buy with the playoffs likely
 * (the best player better than the team's fifth best that his team would move for what "make it
 * work" says, the team's two most valuable players kept), sell with them unlikely or for a rebuilder
 * (the best package a contender sends for one of the veterans, 28 or older), hold otherwise or when
 * nothing works.
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
    const keep = [...roster]
      .sort((a, b) => tradeValue(league, b) - tradeValue(league, a))
      .slice(0, 2)
      .map((p) => p.pid);
    const bar = [...roster].sort((a, b) => b.ovr - a.ovr)[4]?.ovr ?? 0;
    const targets = tradeTargets(league)
      .filter((t) => t.p.ovr > bar && t.avail !== 'franchise' && !t.p.injury)
      .sort((a, b) => Number(b.avail === 'block') - Number(a.avail === 'block') || b.p.ovr - a.p.ovr || a.p.pid - b.p.pid)
      .slice(0, 6);
    for (const t of targets) {
      const ask = makeItWork(league, { a: { tid: me, pids: [], dpids: [] }, b: { tid: t.p.tid, pids: [t.p.pid], dpids: [] } }, keep);
      if (works(ask.offer)) {
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
  return call;
}

/**
 * Each morning of the season: the week's call planned, what it put in taken out at its end, and the
 * staff's own pick made for one unanswered when it matters (see weekDaily); a losing skid's call
 * opened (skidDaily); and the deadline's call worked out the day its card opens.
 */
export function callsDaily(league: League) {
  if (league.fired) return;
  weekDaily(league);
  skidDaily(league);
  if (!deadlineOpen(league) || league.deadlineCall?.season === league.season) return;
  league.deadlineCall = planDeadlineCall(league);
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
  /** The week's practice: `focus` until the week's end (it comes out then: see weekDaily). */
  | { kind: 'weekPrep'; id: string; focus: PrepFocus };

export interface CallChoice {
  label: string;
  action: CallAction;
  /** The screen it opens once taken (a look for a trade): the answer is made there. */
  to?: string;
  blocked?: string;
  tone?: 'good' | 'bad';
  confirm?: string;
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

/** The user's next game from today (any opponent). */
function nextGame(league: League): ScheduledGame | undefined {
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && g.type !== 'allstar' && (g.home === me || g.away === me))
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

  // behind in a series after a loss: the staff's adjustment for tonight, measured
  const behind = seriesBehind(league);
  if (behind && open.has(behind.id)) {
    const { id, opp, g, series, w, l } = behind;
    const abbrev = league.teams[opp].abbrev;
    const { measure, worth } = countersFor(league, id, opp, g, 1);
    const best = worth?.items?.[0];
    const plan: CallChoice = { label: 'Plan the game', action: { kind: 'open', id }, to: `/games/${opp}?tab=plan` };
    const keep: CallChoice = { label: 'Keep the plan', action: { kind: 'settle', id } };
    cards.push({
      id,
      kind: 'series',
      title: `${seriesLabel(series)}: down ${l}-${w} to ${abbrev}`,
      line: `Game ${w + l + 1} tonight${l === 3 ? ': a loss ends the season' : ''}. ${
        !worth
          ? 'The staff is measuring its counters against them for it.'
          : best
            ? `The staff's adjustment: ${best.label}, ${worthWords(best.pts ?? 0)} against them (measured on tonight's game).`
            : 'Nothing the staff measured beats your plan against them: keep it, or plan your own.'
      }`,
      tone: l === 3 ? 'bad' : 'warn',
      to: `/games/${opp}`,
      suggestion: best ? { label: 'Make the adjustment', action: { kind: 'staffPlan', id, opp, items: [best] } } : plan,
      choices: best ? [plan, keep] : [keep],
      ...(worth ? {} : { measure }),
    });
  }

  // a rebuild, or an owner who wants minutes for the young: cover is a young player, or none
  const young = team.strategy === 'rebuild' || !!currentGoals(league)?.goals.some((g) => g.kind === 'youth');
  for (const { p, id } of hurtStars(league)) {
    if (!open.has(id)) continue;
    const any = tenDayCover(league, p.pos);
    const cover = any && (!young || playerAge(any, league.season) <= YOUNG_COVER) ? any : null;
    const manual = team.rotation.manual;
    const out = p.injury!.gamesRemaining;
    // a trade for cover is a real answer to a long absence while deals can still be made
    const trade = out >= TRADE_OUT && league.phase === 'regular' && league.day <= league.tradeDeadlineDay;
    const ride: CallChoice = { label: 'Ride it out', action: { kind: 'settle', id } };
    const look: CallChoice = { label: 'Look for a trade', action: { kind: 'settle', id }, to: '/office/trade' };
    const suggestion: CallChoice = cover
      ? { label: `Sign ${playerName(cover)} to a 10-day`, action: { kind: 'tenDay', id, pid: cover.pid }, confirm: `${cover.pos} · ${cover.ovr} OVR, for ten days at the minimum.` }
      : manual
        ? { label: 'Let the staff redo the rotation', action: { kind: 'staffRotation', id } }
        : ride;
    // what he's worth, measured on the next game (him fit, the staff's rotation planned with him), and where his minutes go
    const mins = minutesOf(league, p.pid);
    const g = nextGame(league);
    const opp = g && (g.home === me ? g.away : g.home);
    // (measured once an injury: what he's worth doesn't turn on the night)
    const worth = league.callWorth?.[id] ?? null;
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
            : young && any
              ? `The staff's call: ride it out. ${to || 'His minutes go to the healthy players'}: a veteran on a 10-day would only take them from the young players.`
              : `The staff's call: ride it out. ${to || 'His minutes go to the healthy players'}; a trade is the other way.`),
      tone: 'bad',
      to: trade ? '/office/trade' : '/team',
      pids: [p.pid],
      suggestion,
      choices: [...(suggestion === ride ? [] : [ride]), ...(trade ? [look] : [])],
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
    const look: CallChoice = { label: 'Look for a deal', action: { kind: 'settle', id }, to: '/office/trade' };
    cards.push({
      id,
      kind: 'odds',
      title: `Postseason odds down to ${oddsText(odds.now)}`,
      line: blocked
        ? `The staff's call: keep pushing. ${blocked}`
        : "The staff's call: tell the owner now, play the young players and sell veterans before the deadline, rather than miss his playoff goal.",
      tone: 'warn',
      to: '/office/owner',
      due: byDeadline,
      dueDay: league.tradeDeadlineDay,
      ...(blocked ? { suggestion: push, choices: [look] } : { suggestion: concede, choices: [push] }),
    });
  }

  const floor = floorCall(league);
  if (floor && open.has(floorId(league))) {
    const id = floorId(league);
    const blocked = easeFloorBlockedReason(league);
    const og = currentGoals(league)!;
    const chase: CallChoice = { label: 'Chase the floor', action: { kind: 'settle', id }, to: '/office/trade' };
    const ease: CallChoice = {
      label: "Tell him it's a development year",
      action: { kind: 'easeFloor', id },
      blocked: blocked ?? undefined,
      confirm: `His floor drops to ${Math.ceil(Math.max(0, og.floor! - FLOOR_EASE) * og.games)} wins, part of the win goal becomes minutes for the young players, the season counts toward his rebuild limit, and your standing drops ${Math.round(CONCEDE_COST * 100)} points.`,
    };
    cards.push({
      id,
      kind: 'floor',
      title: `On pace for ${floor.projected} wins: under the owner's floor`,
      line: `Under ${floor.floorWins} wins he calls it a failed season, whatever else goes right. ${
        blocked
          ? `The staff's call: chase it before the deadline. ${blocked}`
          : "The staff's call: decide now. Buy before the deadline to clear it, or tell him it's a development year and play the young players for the lottery."
      }`,
      tone: 'warn',
      to: '/office/owner',
      due: byDeadline,
      dueDay: league.tradeDeadlineDay,
      ...(blocked ? { suggestion: chase } : { suggestion: chase, choices: [ease] }),
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
    const bar = [...roster].sort((x, y) => y.ovr - x.ovr)[4]?.ovr ?? 0;
    const vet = roster.filter((p) => playerAge(p, league.season) >= 28 && p.ovr >= 70).sort((x, y) => tradeValue(league, y) - tradeValue(league, x) || x.pid - y.pid)[0];
    const lookTo = call?.mode === 'buy' ? `/office/trade?tab=find&minOvr=${bar + 1}` : call?.mode === 'sell' && vet ? `/office/trade?give=${vet.pid}` : '/office/trade';
    const look: CallChoice = { label: 'Look for a deal', action: { kind: 'settle', id }, to: lookTo };
    const none =
      call?.mode === 'buy'
        ? `buy a player better than your fifth best (${bar} OVR). Nobody the staff asked takes what you can send for one; Find lists who's out there.`
        : call?.mode === 'sell'
          ? `sell${vet ? ` ${playerName(vet)}` : ''}. No contender the staff asked bites yet; the trading block shows who would.`
          : 'stand pat. The team is where it is.';
    const deal: CallChoice | null =
      offer && other
        ? {
            label: call!.mode === 'buy' ? `Trade for ${playerName(league.players[offer.b.pids[0]])}` : `Sell to ${other.abbrev}`,
            action: { kind: 'trade', id, offer },
            confirm: `You send ${assetText(league, offer.a)}; the ${other.name} send ${assetText(league, offer.b)}.`,
          }
        : null;
    cards.push({
      id,
      kind: 'deadline',
      title: left === 0 ? 'Trade deadline: today' : `Trade deadline in ${plural(left, 'day')}`,
      line:
        deal && other
          ? `${odds}The staff's call: ${call!.mode === 'buy' ? 'buy' : 'sell'}. ${assetText(league, offer!.b)} from the ${other.name} for ${assetText(league, offer!.a)}.`
          : `${odds}The staff's call: ${none}`,
      tone: 'warn',
      to: '/office/trade',
      due: left === 0 ? 'Deals by the end of the day' : undefined,
      ...(deal ? { suggestion: deal, choices: [stand] } : { suggestion: stand, choices: [look] }),
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
    const shed: CallChoice | null = tradingClosedReason(league) ? null : { label: 'Shed salary', action: { kind: 'settle', id }, to: '/office/trade' };
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
  // a losing skid: the staff's measured change for the next game, or riding it out
  const skid = skidOpen(league);
  let skidCard: CallCard | null = null;
  if (skid && open.has(skidId(skid))) {
    const id = skidId(skid);
    const g = league.schedule.find((x) => x.gid === skid.gid)!;
    const { measure, worth } = countersFor(league, id, skid.opp, g, 1);
    const best = worth?.items?.[0];
    const near = !best && worth?.best && worthCall({ pts: worth.best.pts ?? 0 }) !== 'cost' ? worth.best : undefined;
    const ride: CallChoice = { label: 'Ride it out', action: { kind: 'settle', id } };
    const how =
      skid.margin === undefined
        ? ''
        : skid.margin < 0
          ? `Outscored by ${(-skid.margin).toFixed(1)} a game in them. `
          : `Even on points in them (${signed(skid.margin)} a game): the close ones went the other way. `;
    skidCard = {
      id,
      kind: 'skid',
      title: skid.lost === skid.of ? `${skid.of} straight losses` : `${skid.lost} losses in ${skid.of}`,
      line: `${
        !worth
          ? `The staff is measuring its counters for ${gameText(league, g)}.`
          : best
            ? `The staff's change for ${gameText(league, g)}: ${best.label}, ${worthWords(best.pts ?? 0)} against them (measured).`
            : `Nothing the staff measured for ${gameText(league, g)} is a clear fix${near ? ` (its best, ${near.label}, is too close to say)` : ''}: its call is to ride it out.`
      }${how ? ` ${how.trim()}` : ''}`,
      tone: 'warn',
      to: `/games/${skid.opp}?tab=plan`,
      ...(best
        ? { suggestion: { label: 'Make the change', action: { kind: 'staffPlan', id, opp: skid.opp, items: [best] } }, choices: [ride] }
        : { suggestion: ride, choices: near ? [{ label: `Try ${near.label}`, action: { kind: 'staffPlan', id, opp: skid.opp, items: [near] } }] : [] }),
      ...(worth ? {} : { measure, measuring: true }),
    };
    cards.push(skidCard);
  }

  // the week's call: its big game's counter, or its practice
  const wc = opts.skipWeek ? null : currentWeek(league);
  const wid = wc && weekId(wc.season, wc.week);
  const kind = wc && wid && open.has(wid) ? weekKind(league, wc) : null;
  const gm = wc && kind === 'game' ? weekGame(league, wc) : null;
  if (wc && wid && gm && !(skidCard && skid?.gid === gm.gid)) {
    const g = league.schedule.find((x) => x.gid === gm.gid)!;
    const them = league.teams[gm.opp];
    const { measure, worth } = countersFor(league, weekWorthId(wc, 'game', gm.gid), gm.opp, g, 1);
    const best = worth?.items?.[0];
    const where = `${vsAt(league, g)} ${whenText(league, g.day)}`;
    // a bigger game before it whose counters measured as no gain: said, so the card's change of subject reads
    const passed = (wc.games ?? []).slice(0, (wc.games ?? []).indexOf(gm)).map((x) => league.teams[x.opp].abbrev);
    const before = passed.length ? ` (Against ${passed.join(' and ')}, nothing it measured beats your plan.)` : '';
    cards.push({
      id: wid,
      kind: 'week',
      title: gm.tag ? `${gm.tag}: ${where}` : gm.top ? `The week's big one: ${where}` : `This week: ${where}`,
      // (unanswered, the staff puts it in on game day's morning: a game today has had its morning)
      line: best
        ? `The staff's counter: ${best.label}, ${worthWords(best.pts ?? 0)} against them (measured).${g.day > league.day && g.day > wc.day ? ' Unanswered, the staff puts it in on game day.' : ''}${before}`
        : `The staff is measuring its counters against the ${them.name}.${before}`,
      tone: 'info',
      to: `/games/${gm.opp}?tab=plan`,
      ...(best ? { suggestion: { label: 'Put it in', action: { kind: 'staffPlan', id: wid, opp: gm.opp, items: [best] } } } : {}),
      choices: [{ label: 'Keep your plan', action: { kind: 'settle', id: wid } }],
      ...(worth ? {} : { measure, measuring: true }),
    });
  } else if (wc && wid && kind === 'practice') {
    const f = wc.focus!;
    const o = practiceOutlook(league, f);
    const sig = worthSig(league, f.opp, o.g, `${league.day}:${f.to}`);
    const stored = league.callWorth?.[weekWorthId(wc, 'practice')];
    const worth = stored && stored.gid === f.gid && stored.sig === sig ? stored : null;
    const until = fmtDate(league.season, wc.week * WEEK_DAYS + WEEK_DAYS - 1, { weekday: 'long' });
    const label = PREP_META[f.to].label;
    const at = gameText(league, o.g);
    const games = league.schedule.filter((x) => !x.played && x.type === 'regular' && x.day >= league.day && x.day <= o.g.day && (x.home === me || x.away === me));
    const nights = o.g.day - league.day + 1;
    const facts =
      f.why === 'drills'
        ? `the system ${Math.round(o.fam[1])}% with drills, ${Math.round(o.fam[0])}% at ${PREP_META[f.from].label}`
        : `the rotation's wear ${Math.round(o.wear[1])} with recovery, ${Math.round(o.wear[0])} at ${PREP_META[f.from].label} (${Math.round(o.wearNow)} now), the system ${Math.round(o.fam[1])}% against ${Math.round(o.fam[0])}%`;
    cards.push({
      id: wid,
      kind: 'week',
      title: f.why === 'drills' ? `The system is at ${Math.round(o.now)}%` : `${plural(games.length, 'game')} in ${nights} nights`,
      line: `The staff's call: ${label} until ${until}, ${worth ? `${worthWords(worth.pts ?? 0)} ${at} (measured)` : `its worth ${at} being measured`}. By then ${facts}. Unanswered, the staff sets it tomorrow.`,
      tone: 'info',
      to: '/team/tactics',
      suggestion: { label: `${label} this week`, action: { kind: 'weekPrep', id: wid, focus: f.to } },
      choices: [{ label: `Keep ${PREP_META[f.from].label}`, action: { kind: 'settle', id: wid } }],
      ...(worth ? {} : { measure: { kind: 'change', key: weekWorthId(wc, 'practice'), opp: f.opp, gid: f.gid, sig, base: o.base, change: o.change } }),
    });
  }

  // a call is a choice: one whose only answer is to carry on isn't opened (one measuring its choice is, meanwhile)
  return cards.filter((c) => c.measuring || [c.suggestion, ...(c.choices ?? [])].some((x) => x && !x.blocked && (x.action.kind !== 'settle' || x.to)));
}

/** Carry out a call's choice (resolveAgenda passes it here); the card is settled when it goes through. */
export function resolveCall(league: League, a: CallAction): { ok: boolean; text: string } {
  let r: { ok: boolean; text: string };
  switch (a.kind) {
    case 'settle':
      r = { ok: true, text: '' };
      break;
    case 'open':
      // (nothing settled: the answer is made on the screen it opens)
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
    case 'weekPrep': {
      const wc = currentWeek(league);
      if (!wc?.focus || weekId(wc.season, wc.week) !== a.id) {
        r = { ok: false, text: 'That week is over.' };
        break;
      }
      league.weekCall = wc;
      holdPractice(league, wc);
      r = { ok: true, text: `Practice: ${PREP_META[a.focus].label} until ${fmtDate(league.season, wc.week * WEEK_DAYS + WEEK_DAYS - 1, { weekday: 'long' })}.` };
      break;
    }
  }
  if (r.ok) {
    settleCall(league, a.id);
    // the week's call answered (or a skid's about the same game: its card stood in for it)
    const wc = currentWeek(league);
    const sk = league.skidCall;
    const same = a.id.startsWith('skid:') && !!sk && skidId(sk) === a.id && !!wc && weekKind(league, wc) === 'game' && weekGame(league, wc)?.gid === sk.gid;
    if (wc && (isWeekId(a.id) || same)) {
      answerWeek(league, a.kind === 'settle' ? 'kept' : 'staff');
      if (same) settleCall(league, weekId(wc.season, wc.week));
    }
  }
  return r;
}

const capitalize = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
