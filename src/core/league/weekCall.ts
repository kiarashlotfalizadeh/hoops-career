// The staff's week: each week of the regular season, the staff looks at what's at stake in it, measures
// what it would change in paired games (see counterWorth.ts) and makes its pick. A pick that's best on
// every measured count is the staff's to make: it goes in without a word and the digest says it
// (staffPicksSince). Only a week whose options win on different counts that the user has to weigh
// opens a card, and a sim stops for it. A call is a choice: one whose honest answer is always the same
// isn't one.
//
// What the staff looks at, planned on the week's first morning (planWeek): the young players, as an
// AI team's youth movement leans to them (see youthLean.ts). The minutes a game the staff's rotation
// leaning to them for YOUTH_GAMES games adds, worked out from the rotation, with its cost measured on
// the week's first game. Two horizons it can be for:
// - the owner's minutes (a youth goal he's behind on): what it does to the goal from his grading;
// - the draft (after the deadline, the postseason out of reach: odds under LOTTERY_OUT): what the
//   wins it costs do to his own first-round pick, as the forecast reads the standings
//   (lotteryOutlook).
// Free (inside WORTH_MIN), it goes in; costing points, it's a card: the owner's goal or the pick
// against the wins. (Minutes also count in development, but only through a season's average crossing
// 15 or 25 a game for a player 25 or under: see progression.ts. A few weeks rarely moves that, so it
// isn't counted.) A lean a card put in is measured again on the last of its games once they're
// played, and the digest says what it came to (youthPayoff): a measurement, never the record.
// Unanswered by the morning after it opened, the staff goes with its lean (the card says which and
// why: the staff's read, not a measurement). The lean comes out at its last game.
//
// The measuring runs before any sim decides to stop (simCore.ts's runSim: in the worker, on a budget,
// see callMeasure.ts), so long sims and short ones make the same picks and no card appears to vanish.
// Nothing here draws from the league's random stream.
//
// Not calls, because the engine says there's nothing to choose: resting a star on a back-to-back, a
// minutes cap. Wear only costs over 40 (wearPerf), and over a simulated season a rotation's
// minutes-weighted wear stayed under 10 (its most-worn player under 40) for a contender, a middle
// team and a bad one, while a night off for a star measured about −9 points that night
// (Gilgeous-Alexander, 2027). A call whose honest answer is always "play him" isn't a choice.
import type { League, Rotation, ScheduledGame } from '../types';
import type { YouthLean } from './youthLean';
import { fmtDate, teamPlayers } from './helpers';
import { guideOpen } from './agenda';
import { worthSig, type CallCard, type CallMeasure, type CallWorth } from './calls';
import { WORTH_MIN } from '../ai/counterWorth';
import { autoRotation } from '../ai/coachAI';
import { benchTwoWays, ensureRotation, youthLean } from './games';
import { currentGoals, goalResult, gradeGoal, YOUNG_AGE, youthProjected } from './ownerGoals';
import { playerAge } from '../playerGen';
import { winChance } from '../analysis/winProb';
import { lotteryMatrix, pickProjection } from '../analysis/odds';
import { SINCE, leanOf } from '../analysis/staffWords';
import { LOTTERY_ODDS } from './draft';
import { Rng, hashString } from '../random';

/** Days in a week of calls: week `w` of the regular season runs from day 7w to day 7w + 6. */
export const WEEK_DAYS = 7;
/** How far the staff's rotation leans to the young players when he says so (an AI team's youth movement, 0 to 1: see games.ts). */
export const YOUTH_LEVEL = 0.75;
/** Minutes a game the lean has to add for the young players (YOUNG_AGE or under) to be worth asking about. */
export const YOUTH_ADD = 8;
/** His games the young players' lean holds; turned down, his games before the staff asks again. */
export const YOUTH_GAMES = 10;
/**
 * The postseason odds (tenths of a percent, the weekly trail's latest point) under which, after the
 * deadline, the young players' minutes are weighed against the draft: the season's out of reach.
 */
export const LOTTERY_OUT = 100;
/** Standings drawn for the pick's two readings (pickProjection's own count), each the same both ways. */
const LOTTERY_DRAWS = 400;
/**
 * How far the wins a lean costs have to move his pick for the draft to weigh against them: its
 * chance of the top four by this much (a share), or its expected slot by this many places. Less, and
 * the wins buy nothing in the draft: the rotation stays as it is.
 */
const LOTTERY_MOVE = 0.02;
const LOTTERY_SLOTS = 0.25;
/**
 * What the wins a lean costs may take off the owner's grade on his wins goal (−1..1, weighted as he
 * weighs it) for the staff to lean to the pick: under it the goal is out of reach (or made) either way.
 */
const LOTTERY_GRADE = 0.02;
/** What the staff did on its own kept, newest last. */
const PICKS_KEPT = 30;

export type WeekKind = 'youth';
/** What the week's card is about, when it has one. */
export type WeekAsk = 'youth';

/** The week's call, planned on its first morning (League.weekCall). */
export interface WeekCall {
  season: number;
  week: number;
  /** The user's team it was planned for (a coach who changes jobs mid-week starts the new team's week fresh). */
  tid: number;
  /** The day it was planned. */
  day: number;
  /** What the staff looks at this week. */
  kinds: WeekKind[];
  /**
   * The young players' lean the staff would put in: the minutes a game it adds them, the game it's
   * measured on, its last day, and what it's for (the owner's youth goal; the draft once the
   * postseason is out of reach; a call planned before there was a draft one is the goal's).
   */
  youth?: { add: number; gid: number; opp: number; until: number; why?: 'goal' | 'draft' };
  /** The staff has made its pick: what's best on every count went in, and a choice left opened the card (`ask`). */
  decided?: boolean;
  /** What the card is about, and the day it opened. */
  ask?: WeekAsk;
  asked?: number;
  /** How the card was answered: the staff's option ('staff'), the other one ('kept'), the staff's lean unanswered ('auto'), or gone by ('lapsed'). */
  taken?: 'staff' | 'kept' | 'auto' | 'lapsed';
}

/** What the staff did with a call on its own (League.staffPicks): the digest's line for it. */
export interface StaffPick {
  season: number;
  day: number;
  text: string;
}

/** The week of the regular season `day` is in, or null outside the regular season. */
export function weekOf(league: League, day = league.day): number | null {
  return league.phase === 'regular' ? Math.floor(day / WEEK_DAYS) : null;
}

/** The week's call's id. */
export const weekId = (season: number, week: number) => `week:${season}:${week}`;
/** Whether a call id is a weekly call's. */
export const isWeekId = (id: string) => id.startsWith('week:');
/** The user's regular-season games still to play from `from` through `to`, in order. */
function gamesIn(league: League, from: number, to: number): ScheduledGame[] {
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.type === 'regular' && g.day >= from && g.day <= to && (g.home === me || g.away === me))
    .sort((a, b) => a.day - b.day || a.gid - b.gid);
}

const oppOf = (league: League, g: Pick<ScheduledGame, 'home' | 'away'>) => (g.home === league.userTid ? g.away : g.home);

// ---------------------------------------------------------------- the young players

/** The user's healthy players, as his staff's rotation would plan them. */
const healthy = (league: League) => teamPlayers(league, league.userTid);

/** The staff's rotation for the user's team with the young players' lean at `level` (as games.ts's ensureRotation plans it). */
export function leanedRotation(league: League, level: number): Rotation {
  const players = healthy(league);
  const rot = autoRotation(players, league.teams[league.userTid].rotation, { lean: (p) => level * youthLean(playerAge(p, league.season)), maxMinutes: 38 - 8 * level });
  if (level < 1) benchTwoWays(rot, players);
  return rot;
}

/** Minutes a game a rotation gives the players the owner's youth goal counts (YOUNG_AGE or under). */
function youngPerGame(league: League, rot: Pick<Rotation, 'minutes'>): number {
  return healthy(league)
    .filter((p) => playerAge(p, league.season) <= YOUNG_AGE && !(p.injury && p.injury.gamesRemaining > 0))
    .reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
}

/** His regular-season games left. */
const gamesLeft = (league: League) => league.schedule.filter((g) => !g.played && g.type === 'regular' && (g.home === league.userTid || g.away === league.userTid)).length;

/**
 * The owner's youth goal as the young players' lean would move it: his minutes so far, where they're
 * on pace for as the Owner page projects them and with the lean for YOUTH_GAMES games, and his grade on the
 * goal each way (−1..1); null without such a goal.
 */
export function youthOutlook(league: League, add: number) {
  const og = currentGoals(league);
  const g = og?.goals.find((x) => x.kind === 'youth');
  if (!og || !g) return null;
  const now = goalResult(league, og, g);
  const left = gamesLeft(league);
  // (where the Owner page projects them: one projection, see youthProjected)
  const base = youthProjected(league, og, g);
  const lean = Math.round(base + add * Math.min(YOUTH_GAMES, left));
  return { og, g, now, base, lean, grade: [gradeGoal(league, og, g, base), gradeGoal(league, og, g, lean)] as const };
}

/** The postseason out of reach, after the deadline: the user's odds at the weekly trail's latest point under LOTTERY_OUT. */
function seasonOut(league: League): boolean {
  const t = league.oddsTrail;
  const last = t && t.season === league.season && t.tid === league.userTid ? t.pts.at(-1) : undefined;
  return league.phase === 'regular' && league.day > league.tradeDeadlineDay && !!last && last[1] < LOTTERY_OUT;
}

/**
 * The user's own first-round pick as the forecast reads the standings (pickProjection's projected
 * win% and spread for every team), as it stands and with `lost` fewer wins this season: its chance of
 * a top-four pick and its expected slot each way, on the same LOTTERY_DRAWS standings (each drawn
 * once, the user's lower by the wins: paired), through the lottery's odds. Null when the pick isn't
 * his or the projection is for another draft.
 */
export function lotteryOutlook(league: League, lost: number): { top4: [number, number]; pick: [number, number] } | null {
  const me = league.userTid;
  const own = league.draftPicks.some((d) => d.season === league.season && d.round === 1 && d.originalTid === me && d.tid === me);
  const pp = pickProjection(league);
  if (!own || pp.season !== league.season) return null;
  const n = league.teams.length;
  const m = Math.min(LOTTERY_ODDS.length, n);
  const lot = lotteryMatrix(m);
  const rng = new Rng(hashString(`${league.id}:${league.season}:${league.day}:lottery-lean`));
  const top4 = [0, 0];
  const pick = [0, 0];
  const at = new Float64Array(n);
  for (let d = 0; d < LOTTERY_DRAWS; d++) {
    for (let t = 0; t < n; t++) at[t] = pp.pct[t] + pp.sd[t] * rng.normal();
    for (const [i, shift] of [0, lost / 82].entries()) {
      const mine = at[me] - shift;
      // (worst first; a tie goes the user's way: the lottery splits it)
      let place = 0;
      for (let t = 0; t < n; t++) if (t !== me && at[t] < mine) place++;
      if (place < m) {
        const row = lot[place];
        top4[i] += row[0] + row[1] + row[2] + row[3];
        pick[i] += row.reduce((a, p, k) => a + p * (k + 1), 0);
      } else pick[i] += place + 1;
    }
  }
  return { top4: [top4[0] / LOTTERY_DRAWS, top4[1] / LOTTERY_DRAWS], pick: [pick[0] / LOTTERY_DRAWS, pick[1] / LOTTERY_DRAWS] };
}

/**
 * The young players' lean the staff would put in this week: with the staff running the rotation,
 * nothing leaning already and no "no" from him in the last YOUTH_GAMES games, when the lean adds
 * YOUTH_ADD minutes a game or more; for a team whose owner has a youth goal it's on pace to miss, or
 * one out of the postseason's reach after the deadline (the draft).
 */
function weekYouth(league: League, games: ScheduledGame[]): WeekCall['youth'] | undefined {
  const me = league.userTid;
  const first = games[0];
  if (!first || league.teams[me].rotation.manual) return undefined;
  const y = league.youthLean;
  if (y && y.season === league.season && y.tid === me && league.day <= y.until) return undefined;
  const add = Math.round(youngPerGame(league, leanedRotation(league, YOUTH_LEVEL)) - youngPerGame(league, league.teams[me].rotation));
  if (add < YOUTH_ADD) return undefined;
  const o = youthOutlook(league, add);
  const why = o && o.base < o.g.target ? 'goal' : seasonOut(league) && lotteryOutlook(league, 0) ? 'draft' : null;
  if (!why) return undefined;
  return { add, gid: first.gid, opp: oppOf(league, first), until: youthUntil(league), why };
}

/** The day of his YOUTH_GAMES-th game from today (or his last). */
function youthUntil(league: League): number {
  const ahead = gamesIn(league, league.day, Infinity);
  return (ahead[YOUTH_GAMES - 1] ?? ahead.at(-1))?.day ?? league.day;
}

/** Put the young players' lean in (his answer, or the staff's own pick), or note his "no" so it isn't asked again for a while. */
function putYouth(league: League, how: 'staff' | 'auto' | 'kept', wc?: WeekCall, card = false) {
  const until = youthUntil(league);
  const y = wc?.youth;
  const pts = y && kept(league, weekWorthId(wc, 'youth'), y.gid)?.pts;
  league.youthLean = {
    season: league.season,
    tid: league.userTid,
    from: league.day,
    until,
    level: how === 'kept' ? 0 : YOUTH_LEVEL,
    how,
    ...(y ? { why: y.why ?? 'goal', young: Math.round(youngPerGame(league, league.teams[league.userTid].rotation)) } : {}),
    ...(pts !== undefined ? { pts } : {}),
    ...(card ? { card: true as const } : {}),
  };
  // (in from tonight: the staff's rotation is otherwise planned again each morning)
  if (how !== 'kept' && !league.teams[league.userTid].rotation.manual) ensureRotation(league, league.userTid);
}

// ---------------------------------------------------------------- planning the week

/**
 * The week as the staff plans it on its first morning (pure: nothing stored). None in the first week
 * of a new coach's first season while the guide is open (its checklist plans the opener), or in a
 * week with no games of his left.
 */
export function planWeek(league: League, week: number): WeekCall {
  const call: WeekCall = { season: league.season, week, tid: league.userTid, day: league.day, kinds: [] };
  if (league.phase !== 'regular' || (week === 0 && guideOpen(league))) return call;
  const games = gamesIn(league, league.day, week * WEEK_DAYS + WEEK_DAYS - 1);
  if (!games.length) return call;
  const youth = weekYouth(league, games);
  if (youth) {
    call.youth = youth;
    call.kinds = ['youth'];
  }
  return call;
}

/** This week's call: the one planned for it, else as the staff would plan it now (a screen before the week's first morning has passed in a sim). */
export function currentWeek(league: League): WeekCall | null {
  const w = weekOf(league);
  if (w === null || league.fired) return null;
  const wc = league.weekCall;
  return wc && wc.season === league.season && wc.week === w && wc.tid === league.userTid ? wc : planWeek(league, w);
}

/** Where the measurement for the week's call is kept (see calls.ts's storeWorth). */
export const weekWorthId = (wc: Pick<WeekCall, 'season' | 'week'>, kind: WeekKind) => `${weekId(wc.season, wc.week)}|${kind}`;

/** The week's call stored for this week and this team (the one a sim works on), if it is. */
function storedWeek(league: League): WeekCall | null {
  const w = weekOf(league);
  const wc = league.weekCall;
  return w !== null && !league.fired && wc && wc.season === league.season && wc.week === w && wc.tid === league.userTid ? wc : null;
}

const done = (league: League, wc: WeekCall) => !!league.callsDone?.includes(weekId(wc.season, wc.week));

// ---------------------------------------------------------------- what's still to measure, and the picks

/** A measurement stands for game `gid` (the week's are taken once: the staff decides on them that morning). */
const kept = (league: League, key: string, gid: number): CallWorth | null => {
  const w = league.callWorth?.[key];
  return w && w.gid === gid ? w : null;
};

/** What the week's pick still waits on: the young players' lean, measured. Empty once the week is decided (or there's nothing to decide). */
export function weekNeeds(league: League): CallMeasure[] {
  const wc = storedWeek(league);
  if (!wc || wc.decided || wc.taken || done(league, wc)) return [];
  const me = league.userTid;
  const out: CallMeasure[] = [];
  const y = wc.youth;
  const yg = y && league.schedule.find((x) => x.gid === y.gid);
  if (y && yg && !yg.played && !kept(league, weekWorthId(wc, 'youth'), yg.gid))
    out.push({
      kind: 'change',
      key: weekWorthId(wc, 'youth'),
      opp: y.opp,
      gid: yg.gid,
      sig: worthSig(league, y.opp, yg, 'youth'),
      change: { id: 'youth', teams: { [me]: { rotation: leanedRotation(league, YOUTH_LEVEL) } } },
    });
  return out;
}

/** Wins over `games` games at `pts` a game: what a measured worth comes to. */
export const winsOf = (pts: number, games: number) => games * (winChance(pts) - 0.5);

/** The wins a lean measured at `pts` a game costs over its games. */
const leanLost = (league: League, pts: number) => -winsOf(pts, Math.min(YOUTH_GAMES, gamesLeft(league)));

/**
 * What the wins a lean costs take off the owner's grade on his wins goal where the forecast has the
 * season ending (weighted as he weighs it): about nothing when the goal is out of reach either way.
 */
function winsGradeCost(league: League, lost: number): number {
  const og = currentGoals(league);
  const wins = og?.goals.find((x) => x.kind === 'wins');
  if (!og || !wins) return 0;
  const w = pickProjection(league).pct[league.userTid] * 82;
  return (gradeGoal(league, og, wins, w) - gradeGoal(league, og, wins, w - lost)) * wins.weight;
}

/**
 * The young players' lean as the staff weighs it: for the owner's goal, what it adds on his youth goal
 * against what its cost in wins takes off his wins goal (weighted as he weighs them); for the draft,
 * the pick's when the wins it costs don't move his grade (LOTTERY_GRADE).
 */
function youthLeans(league: League, y: NonNullable<WeekCall['youth']>, pts: number): boolean {
  if (y.why === 'draft') return winsGradeCost(league, leanLost(league, pts)) < LOTTERY_GRADE;
  const add = y.add;
  const o = youthOutlook(league, add);
  if (!o) return false;
  const gain = (o.grade[1] - o.grade[0]) * o.g.weight;
  const wins = o.og.goals.find((x) => x.kind === 'wins');
  const lost = -winsOf(pts, Math.min(YOUTH_GAMES, gamesLeft(league)));
  const cost = wins ? (gradeGoal(league, o.og, wins, wins.target) - gradeGoal(league, o.og, wins, wins.target - lost)) * wins.weight : 0;
  return gain >= cost;
}

/**
 * The staff's pick for the week, once what it waits on is measured (weekNeeds empty): the young
 * players' lean if it costs nothing measurable. A lean that costs points is a choice: the card opens.
 */
export function weekDecide(league: League) {
  const wc = storedWeek(league);
  if (!wc || wc.decided || wc.taken || done(league, wc) || weekNeeds(league).length) return;
  wc.decided = true;
  const y = wc.youth;
  const yw = y && kept(league, weekWorthId(wc, 'youth'), y.gid);
  // (for the draft, wins that don't move the pick buy nothing: the rotation as it is, and not asked again for a while)
  const draft = y?.why === 'draft' && yw && yw.pts !== undefined && yw.pts <= -WORTH_MIN;
  const lo = draft ? lotteryOutlook(league, leanLost(league, yw.pts!)) : null;
  const moves = !!lo && (lo.top4[1] - lo.top4[0] >= LOTTERY_MOVE || lo.pick[0] - lo.pick[1] >= LOTTERY_SLOTS);
  if (y && yw && yw.pts !== undefined) {
    if (draft && !moves) {
      putYouth(league, 'kept', wc);
      notePick(league, "The rotation stays as it is. More minutes for the young players wouldn't move your pick.");
    } else if (yw.pts <= -WORTH_MIN) {
      wc.ask = 'youth';
    } else {
      putYouth(league, 'auto', wc);
      const what = y.why === 'draft' ? ', the postseason out of reach.' : ", for the owner's goal.";
      notePick(
        league,
        `About ${y.add} more minutes a game for the young players until ${fmtDate(league.season, league.youthLean!.until)}${what} ${yw.pts >= WORTH_MIN ? 'It should help.' : "It shouldn't cost you."}`,
      );
    }
  }
  if (wc.ask) wc.asked = league.day;
}

// ---------------------------------------------------------------- the young players' turn, measured again

/** Where the second measurement of a lean is kept. */
const payoffKey = (y: Pick<YouthLean, 'season' | 'from'>) => `youth:${y.season}:${y.from}|again`;

/** A lean a card put in (his answer, or the staff's lean on one he left) whose games have all been played, still to be measured again: it, and its games. */
function payoffDue(league: League): { y: YouthLean; games: ScheduledGame[] } | null {
  const y = league.youthLean;
  if (league.fired || !y || !y.card || y.how === 'kept' || y.paid || y.season !== league.season || y.tid !== league.userTid) return null;
  const me = league.userTid;
  const games = league.schedule
    .filter((g) => g.type === 'regular' && g.day >= y.from && g.day <= y.until && (g.home === me || g.away === me))
    .sort((a, b) => a.day - b.day || a.gid - b.gid);
  return games.length && games.every((g) => g.played) ? { y, games } : null;
}

/**
 * The lean measured again once its games are played (staffMorning runs it with the rest): on the last
 * of them, the rotation leaning as it did against the staff's as it plans now, with the rosters as
 * they stand. What the choice came to is a measurement, never the record.
 */
export function payoffNeeds(league: League): CallMeasure[] {
  const due = payoffDue(league);
  if (!due) return [];
  const g = due.games.at(-1)!;
  const key = payoffKey(due.y);
  if (league.callWorth?.[key]?.gid === g.gid) return [];
  const me = league.userTid;
  // (both rotations planned now: the morning after its last game the staff's may still be the leaned one)
  return [
    {
      kind: 'change',
      key,
      opp: oppOf(league, g),
      gid: g.gid,
      sig: worthSig(league, oppOf(league, g), g, 'again'),
      base: { id: 'base', teams: { [me]: { rotation: leanedRotation(league, 0) } } },
      change: { id: 'youth', teams: { [me]: { rotation: leanedRotation(league, due.y.level) } } },
    },
  ];
}

/**
 * Once measured again, the digest's line for the lean: whose call it was, what the staff makes of it
 * now in words, and the young players' minutes in its games (the box scores).
 */
export function youthPayoff(league: League) {
  const due = payoffDue(league);
  const g = due?.games.at(-1);
  const w = due && league.callWorth?.[payoffKey(due.y)];
  if (!due || !g || !w || w.gid !== g.gid || w.pts === undefined) return;
  const { y, games } = due;
  const me = league.userTid;
  let mins = 0;
  for (const r of league.games)
    if (r.season === league.season && games.some((x) => x.gid === r.gid))
      for (const b of (r.home.tid === me ? r.home : r.away).players) {
        const p = league.players[b.pid];
        if (p && playerAge(p, league.season) <= YOUNG_AGE) mins += b.min;
      }
  const who = y.how === 'staff' ? 'Your call' : "The staff's lean on a card you left";
  notePick(
    league,
    `The young players' minutes${y.why === 'draft' ? ' for the draft' : " for the owner's goal"}, ${who.charAt(0).toLowerCase()}${who.slice(1)} on ${fmtDate(league.season, y.from)}. ${SINCE[leanOf(w.pts)]}. They played ${Math.round(mins).toLocaleString('en-US')} minutes in its ${games.length} games.`,
  );
  league.youthLean = { ...y, paid: true };
}

// ---------------------------------------------------------------- the card

/** "vs BOS", "@ BOS". */
export const vsAt = (league: League, g: Pick<ScheduledGame, 'home' | 'away'>) => `${g.home === league.userTid ? 'vs' : '@'} ${league.teams[oppOf(league, g)].abbrev}`;

/** The week's card's id when it's open now (what a sim checks each day: cheap). */
export function openWeekId(league: League): string | null {
  const wc = storedWeek(league);
  return wc && wc.decided && wc.ask && !wc.taken && !done(league, wc) ? weekId(wc.season, wc.week) : null;
}

/** What the week's card is about, if it's open (staffCalls draws it). */
export function weekKind(league: League, wc: WeekCall | null = storedWeek(league)): WeekAsk | null {
  return wc && wc.decided && wc.ask && !wc.taken && !done(league, wc) ? wc.ask : null;
}

/** The week's card (calls.ts's staffCalls draws it with the rest), when it's open. */
export function weekCard(league: League): CallCard | null {
  const wc = storedWeek(league);
  const ask = wc && weekKind(league, wc);
  if (!wc || !ask) return null;
  const id = weekId(wc.season, wc.week);
  const tomorrow = 'Unanswered, the staff goes with its lean tomorrow.';
  const y = wc.youth!;
  const yw = kept(league, weekWorthId(wc, 'youth'), y.gid);
  if (!yw || yw.pts === undefined) return null;
  const lost = leanLost(league, yw.pts);
  const leans = youthLeans(league, y, yw.pts);
  const play: CallCard['suggestion'] = { label: 'Play the young players', action: { kind: 'youthLean', id } };
  const keep: CallCard['suggestion'] = { label: 'Keep the rotation', action: { kind: 'settle', id } };
  const n = (x: number) => x.toLocaleString('en-US');
  // the lean and what it turns on on the row, why and what it brings a tap down: all in words
  const cost = lost < 1 ? 'It should only cost a little.' : 'It could cost you wins.';
  let gain: string;
  let lead: string;
  let why: string;
  if (y.why === 'draft') {
    const lo = lotteryOutlook(league, lost);
    if (!lo) return null;
    lead = 'It should help your draft pick.';
    gain = 'Your own first should land higher with it.';
    why = leans ? "The owner's wins goal is out of reach either way." : 'The owner still counts these wins.';
  } else {
    const o = youthOutlook(league, y.add);
    if (!o) return null;
    lead = cost;
    gain =
      o.lean < o.g.target
        ? `You'd still fall short of his ${n(o.g.target)} minutes.`
        : o.base < o.g.target
          ? `It should get you to his ${n(o.g.target)} minutes.`
          : 'His minutes goal looks safe either way.';
    why = leans ? 'The owner counts the minutes for more.' : 'The owner counts the wins for more.';
  }
  return {
    id,
    kind: 'week',
    title: `${y.add} more minutes a game for the young players?`,
    line: `The staff leans ${leans ? 'to playing them' : 'to the rotation as it is'}. ${lead}`,
    detail: [why, ...(y.why === 'draft' ? [cost] : []), gain, tomorrow].join('\n'),
    tone: 'info',
    to: y.why === 'draft' ? '/office/draft' : '/office/owner',
    suggestion: leans ? play : keep,
    choices: [leans ? keep : play],
  };
}

/** The week's card answered (calls.ts's resolveCall): `youth` for the young players' lean, nothing for things as they were. */
export function answerWeek(league: League, a: { youth?: boolean }): { ok: boolean; text: string } {
  const wc = storedWeek(league);
  const ask = wc && weekKind(league, wc);
  if (!wc || !ask) return { ok: false, text: 'That week is over.' };
  if (a.youth) {
    putYouth(league, 'staff', wc, true);
    wc.taken = 'staff';
    return { ok: true, text: `The young players get their minutes until ${fmtDate(league.season, league.youthLean!.until)}.` };
  }
  putYouth(league, 'kept', wc, true);
  wc.taken = 'kept';
  return { ok: true, text: '' };
}

/** The staff's lean on an open card, put in unanswered (weekDaily). */
function takeLean(league: League, wc: WeekCall) {
  if (wc.ask === 'youth' && wc.youth) {
    const yw = kept(league, weekWorthId(wc, 'youth'), wc.youth.gid);
    const leans = !!yw && yw.pts !== undefined && youthLeans(league, wc.youth, yw.pts);
    putYouth(league, leans ? 'auto' : 'kept', wc, true);
    notePick(
      league,
      leans
        ? `About ${wc.youth.add} more minutes a game for the young players until ${fmtDate(league.season, league.youthLean!.until)}. The staff's lean on a card you left.`
        : "The rotation stays as it is, the staff's lean on a card you left.",
    );
  }
  wc.taken = 'auto';
}

// ---------------------------------------------------------------- each morning

/** How the staff's report on a measured change it didn't make starts (staffLever.ts): the digest keeps the latest. A mark in the store, not on screen (see reportText). */
export const STAFF_REPORT = 'Staff report:';

/**
 * Note something the staff did on its own (the digest says it, and a short sim's toast after "The
 * staff:"): plain sentences, none led by a label of its own.
 */
export function notePick(league: League, text: string) {
  const picks = league.staffPicks ?? [];
  picks.push({ season: league.season, day: league.day, text });
  league.staffPicks = picks.slice(-PICKS_KEPT);
}

/**
 * Each morning of the season (callsDaily): a week that's over makes way for the next one, planned;
 * a card left unanswered past the morning after it opened is the staff's lean. The pick itself waits
 * on the measuring (weekNeeds, weekDecide: a sim runs them each morning).
 */
export function weekDaily(league: League) {
  if (league.fired) return;
  const w = weekOf(league);
  const old = league.weekCall;
  if (old && (w === null || old.season !== league.season || old.week !== w || old.tid !== league.userTid)) league.weekCall = undefined;
  if (w === null) return;
  const wc = (league.weekCall ??= planWeek(league, w));
  if (wc.taken || done(league, wc) || !wc.decided) return;
  if (wc.ask && league.day > (wc.asked ?? wc.day)) takeLean(league, wc);
}

/**
 * What the staff did on its own in a sim that started on `day` of `season` (a digest's stretch), as
 * lines, one a pick. A pick is made in a sim's mornings, so the one on the morning it started was the
 * sim before's.
 */
export function staffPicksSince(league: League, season: number, day: number): string[] {
  const all = (league.staffPicks ?? []).filter((p) => p.season > season || (p.season === season && p.day > day));
  // (the staff's monthly readings (staffLever.ts) as one row: the latest, Analysis lists it too)
  const reports = all.filter((p) => p.text.startsWith(STAFF_REPORT));
  const picks = all.filter((p) => !reports.includes(p) || p === reports[reports.length - 1]);
  return picks.map((p) => (p.text.startsWith(STAFF_REPORT) ? `${reportText(p.text)}${reports.length > 1 ? ` The latest of ${reports.length} reports.` : ''}` : p.text));
}

/** A staff report as a screen says it: without its mark. */
function reportText(text: string): string {
  const rest = text.slice(STAFF_REPORT.length).trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
