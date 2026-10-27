// The staff's week: each week of the regular season, the staff looks at what's at stake in it, measures
// what it would change in paired games (see counterWorth.ts) and makes its picks. A pick that's best on
// every measured count is the staff's to make: it goes in without a word and the digest says it
// (staffPicksSince). Only a week whose options win on different counts that the user has to weigh
// opens a card, and a sim stops for it. A call is a choice: one whose honest answer is always the same
// isn't one.
//
// What the staff looks at, planned on the week's first morning (planWeek):
// - the practice: tactical drills while the system is short (FAM_DRILL), recovery for a heavy week on
//   worn legs (WEAR_HEAVY). Drills build the system twice as fast as the everyday balance at no cost
//   to the legs (PREP_META), so on their own they go in without a word. They become a choice when the
//   week also has a big game (a billed night: a rivalry, Christmas, a revenge game...) whose best
//   counter measures as a gain on it: opponent prep drills the counter for that game (worth points
//   that night) while the system builds at a quarter of drills' pace (worth points in the games
//   after). Recovery against the system the same way: the legs in the week's last game against the
//   system in the first game after it. Both sides are measured, each on its own game, with the
//   familiarity and wear the practice and wear models give for each (projectFoci); the card opens only
//   when each side wins its own game by WORTH_MIN, else the side that does goes in. The big game's
//   counter is measured only in a drills week, where it can make that choice: on its own it's a
//   one-night pick worth about a tenth of a win a season (round-3 review: the billed nights' silent
//   counters were 40% of the staff's measuring), so a week with the system known leaves the night to
//   the user's plan (the Preview has the staff's counters, measured as it shows).
// - the young players, as an AI team's youth movement leans to them (see youthLean.ts): the minutes a
//   game the staff's rotation leaning to them for YOUTH_GAMES games adds, worked out from the rotation,
//   with its cost measured on the week's first game. Two horizons it can be for:
//   - the owner's minutes (a youth goal he's behind on): what it does to the goal from his grading;
//   - the draft (after the deadline, the postseason out of reach: odds under LOTTERY_OUT): what the
//     wins it costs do to his own first-round pick, as the forecast reads the standings
//     (lotteryOutlook).
//   Free (inside WORTH_MIN), it goes in; costing points, it's a card: the owner's goal or the pick
//   against the wins. (Minutes also count in development, but only through a season's average
//   crossing 15 or 25 a game for a player 25 or under: see progression.ts. A few weeks rarely moves
//   that, so it isn't counted.) A lean a card put in is measured again on the last of its games once
//   they're played, and the digest says what it came to (youthPayoff): a measurement, never the record.
// One card a week at most: the practice's, else the young players'. Unanswered by the morning after it
// opened, the staff goes with its lean (each card says which and why: the staff's read, not a
// measurement). The practice it put in comes out at the week's end; the young players' lean at its
// last game.
//
// The measuring runs before any sim decides to stop (simCore.ts's runSim: in the worker, on a budget,
// see callMeasure.ts), so long sims and short ones make the same picks and no card appears to vanish.
// Nothing here draws from the league's random stream.
//
// Not calls, because the engine says there's nothing to choose: resting a star on a back-to-back, a
// minutes cap, recovery in most weeks. Wear only costs over 40 (wearPerf), and over a simulated season
// a rotation's minutes-weighted wear stayed under 10 (its most-worn player under 40) for a contender,
// a middle team and a bad one, while a night off for a star measured about −9 points that night
// (Gilgeous-Alexander, 2027). A call whose honest answer is always "play him" isn't a choice. Nor is
// learning a change to the playbook: a coverage or a habit the staff changes plays about as well the
// first night as once it's drilled (24 of 24 of the staff's changes for a contender over a season,
// 2026-10: within a quarter of a point a game), so a change that measures as a gain is a gain tonight
// too, and the staff makes it (staffLever.ts).
import type { Familiarity, GamePlan, League, Player, PrepFocus, Rotation, ScheduledGame } from '../types';
import type { YouthLean } from './youthLean';
import { curTeamSeason, fmtDate, teamPlayers } from './helpers';
import { PREP_META, freshFamiliarity, practiceDay } from '../sim/familiarity';
import { systemFamiliarity } from './practice';
import { billingsFor } from '../analysis/gameStory';
import { itemGroup, planFor, planMade, setPlanItem } from './gamePlans';
import { guideOpen } from './agenda';
import { worthSig, type CallCard, type CallMeasure, type CallWorth } from './calls';
import { WORTH_MIN, type LeagueChange } from '../ai/counterWorth';
import { autoRotation } from '../ai/coachAI';
import { benchTwoWays, ensureRotation, youthLean } from './games';
import { currentGoals, goalResult, gradeGoal, YOUNG_AGE } from './ownerGoals';
import { playerAge } from '../playerGen';
import { winChance } from '../analysis/winProb';
import { lotteryMatrix, pct, pickProjection } from '../analysis/odds';
import { LOTTERY_ODDS } from './draft';
import { Rng, hashString } from '../random';

/** Days in a week of calls: week `w` of the regular season runs from day 7w to day 7w + 6. */
export const WEEK_DAYS = 7;
/**
 * System familiarity (the screens' figure) under which tactical drills for the week are the staff's
 * pick: below it the team plays a step slow on every possession (see FLUID in familiarity.ts), and a
 * week of drills moves it several points; above it, a week of drills moves it one or two.
 */
export const FAM_DRILL = 85;
/**
 * The rotation's wear (minutes-weighted, 0-100) at which a heavy week makes recovery worth weighing:
 * wear only costs over 40 (see wearPerf), and a recovery week takes about six points off every player.
 */
export const WEAR_HEAVY = 45;
/** The user's games left in a week (or a back-to-back in it) that make it heavy. */
export const HEAVY_GAMES = 4;
/** The week's big games the staff measures counters for (the biggest: a sim measures on a budget). */
export const WEEK_GAMES = 1;
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
/**
 * How many games the staff counts a better-drilled system for, against one night's prep or rest: the
 * gap a week of drills makes closes as the games teach the system (each closes about a tenth of what's
 * left, see GAME_GROW), so it pays for a couple of nights. Only the staff's lean reads it.
 */
const FAR_CARRY = 2;
/** What the staff did on its own kept, newest last. */
const PICKS_KEPT = 30;
/** A season's day as the staff's calls read it (the wear models' daily recovery and a game's wear a minute: see season.ts and games.ts). */
const DAILY_REST = 0.75;
const WEAR_A_MINUTE = 0.06;

export type WeekKind = 'game' | 'practice' | 'youth';
/** What the week's card is about, when it has one. */
export type WeekAsk = 'practice' | 'youth';

/** One of the week's big games: its id, the opponent, its billing tag, and whether the opponent is one of the league's best. */
export interface WeekGame {
  gid: number;
  opp: number;
  tag?: string;
  top?: boolean;
}

/** A practice put in for the week: each focus through its day, then `from` again. */
export interface PracticeHold {
  steps: [PrepFocus, number][];
  from: PrepFocus;
}

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
  /** The week's big game (at most WEEK_GAMES): its counter is measured. */
  games?: WeekGame[];
  /** The practice the staff would hold for the week: the focus, the one it replaces, why, and the week's last game. */
  focus?: { to: PrepFocus; from: PrepFocus; why: 'drills' | 'recovery'; gid: number; opp: number };
  /**
   * The young players' lean the staff would put in: the minutes a game it adds them, the game it's
   * measured on, its last day, and what it's for (the owner's youth goal; the draft once the
   * postseason is out of reach; a call planned before there was a draft one is the goal's).
   */
  youth?: { add: number; gid: number; opp: number; until: number; why?: 'goal' | 'draft' };
  /** The staff has made its picks: what's best on every count went in, and a choice left opened the card (`ask`). */
  decided?: boolean;
  /** What the card is about, and the day it opened. */
  ask?: WeekAsk;
  asked?: number;
  /** How the card was answered: the staff's option ('staff'), the other one ('kept'), the staff's lean unanswered ('auto'), or gone by ('lapsed'). */
  taken?: 'staff' | 'kept' | 'auto' | 'lapsed';
  /** The practice the staff put in (and how it goes on), to come out at the week's end. */
  hold?: PracticeHold;
  /** The practice focus in place from it now (one he changes is his). */
  set?: PrepFocus;
}

/** What the staff did with a call on its own (League.staffPicks): the digest's line for it. */
export interface StaffPick {
  season: number;
  day: number;
  text: string;
  /** A week's big game that was played before the staff could measure it (nothing changed): the digest counts these in one line. */
  lapsed?: boolean;
}

/** The week of the regular season `day` is in, or null outside the regular season. */
export function weekOf(league: League, day = league.day): number | null {
  return league.phase === 'regular' ? Math.floor(day / WEEK_DAYS) : null;
}

/** The week's call's id. */
export const weekId = (season: number, week: number) => `week:${season}:${week}`;
/** Whether a call id is a weekly call's. */
export const isWeekId = (id: string) => id.startsWith('week:');
/** The last day of a week. */
const weekEnd = (wc: Pick<WeekCall, 'week'>) => wc.week * WEEK_DAYS + WEEK_DAYS - 1;

/** The user's regular-season games still to play from `from` through `to`, in order. */
function gamesIn(league: League, from: number, to: number): ScheduledGame[] {
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.type === 'regular' && g.day >= from && g.day <= to && (g.home === me || g.away === me))
    .sort((a, b) => a.day - b.day || a.gid - b.gid);
}

const oppOf = (league: League, g: Pick<ScheduledGame, 'home' | 'away'>) => (g.home === league.userTid ? g.away : g.home);

/** A team's win share this season (an even 0.5 before it has five games). */
function winShare(league: League, tid: number): number {
  const ts = curTeamSeason(league, tid);
  const gp = ts.won + ts.lost;
  return gp >= 5 ? ts.won / gp : 0.5;
}

/** The rotation's wear, weighted by planned minutes (players planned 10 or more). */
function rotationWear(players: Pick<Player, 'pid' | 'wear'>[], minutes: Record<number, number>, wear?: Record<number, number>): number {
  let w = 0;
  let m = 0;
  for (const p of players) {
    const mins = minutes[p.pid] ?? 0;
    if (mins < 10) continue;
    w += mins * (wear?.[p.pid] ?? p.wear);
    m += mins;
  }
  return m ? w / m : 0;
}

/**
 * The week's big games, the biggest first: billed ones (a rivalry, a showdown, Christmas, a revenge
 * game), by their billing and then the opponent's record; only each opponent's next meeting (what its
 * counters are measured for); at most WEEK_GAMES. A week without a billed night has none: the staff's
 * plan for an ordinary night is its playbook. (Measuring every week's strongest opponent as well
 * doubled a season's sim time for about a third of a win.)
 */
function bigGames(league: League, games: ScheduledGame[]): WeekGame[] {
  const seen = new Set<number>();
  const order = league.teams.map((t) => t.tid).sort((a, b) => winShare(league, b) - winShare(league, a));
  const played = (tid: number) => curTeamSeason(league, tid).won + curTeamSeason(league, tid).lost;
  const top = new Set(order.slice(0, 6).filter((tid) => played(tid) >= 10));
  const ranked: { g: ScheduledGame; weight: number; tag?: string; share: number }[] = [];
  for (const g of games) {
    const opp = oppOf(league, g);
    if (seen.has(opp)) continue;
    seen.add(opp);
    const b = billingsFor(league, g)[0];
    const weight = b && b.weight >= 2 ? b.weight : 0;
    if (!weight) continue;
    ranked.push({ g, weight, tag: weight ? b!.tag : undefined, share: winShare(league, opp) });
  }
  return ranked
    .sort((a, b) => b.weight - a.weight || b.share - a.share || a.g.day - b.g.day)
    .slice(0, WEEK_GAMES)
    .map(({ g, tag }) => {
      const opp = oppOf(league, g);
      return { gid: g.gid, opp, ...(tag ? { tag } : {}), ...(top.has(opp) ? { top: true } : {}) };
    });
}

/**
 * The practice the staff would hold this week: tactical drills while the system is under FAM_DRILL;
 * recovery for a heavy week (HEAVY_GAMES or a back-to-back) on worn legs (WEAR_HEAVY); only in place
 * of the everyday balance (a focus he picked is his), and with a game left to measure it on.
 */
function weekPractice(league: League, games: ScheduledGame[]): WeekCall['focus'] | undefined {
  const last = games.at(-1);
  if (!last) return undefined;
  const me = league.userTid;
  const team = league.teams[me];
  const from = team.prep ?? 'balanced';
  if (from !== 'balanced') return undefined;
  const fam = systemFamiliarity(league, me).overall;
  const b2b = games.some((g, i) => i > 0 && g.day - games[i - 1].day === 1);
  const heavy = games.length >= HEAVY_GAMES || b2b;
  const worn = heavy && rotationWear(teamPlayers(league, me), team.rotation.minutes) >= WEAR_HEAVY;
  const to: PrepFocus | null = worn ? 'recovery' : fam < FAM_DRILL ? 'system' : null;
  if (!to) return undefined;
  return { to, from, why: to === 'system' ? 'drills' : 'recovery', gid: last.gid, opp: oppOf(league, last) };
}

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
 * on pace for with the rotation as it is and with the lean for YOUTH_GAMES games, and his grade on the
 * goal each way (−1..1); null without such a goal.
 */
export function youthOutlook(league: League, add: number) {
  const og = currentGoals(league);
  const g = og?.goals.find((x) => x.kind === 'youth');
  if (!og || !g) return null;
  const now = goalResult(league, og, g);
  const left = gamesLeft(league);
  const base = Math.round(now + youngPerGame(league, league.teams[league.userTid].rotation) * left);
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
  const focus = weekPractice(league, games);
  // (the big game's counter only where it can make the practice a choice: see the top of the file)
  const big = focus?.why === 'drills' ? bigGames(league, games) : [];
  const youth = weekYouth(league, games);
  if (big.length) call.games = big;
  if (focus) call.focus = focus;
  if (youth) call.youth = youth;
  call.kinds = [...(big.length ? (['game'] as const) : []), ...(focus ? (['practice'] as const) : []), ...(youth ? (['youth'] as const) : [])];
  return call;
}

/** This week's call: the one planned for it, else as the staff would plan it now (a screen before the week's first morning has passed in a sim). */
export function currentWeek(league: League): WeekCall | null {
  const w = weekOf(league);
  if (w === null || league.fired) return null;
  const wc = league.weekCall;
  return wc && wc.season === league.season && wc.week === w && wc.tid === league.userTid ? wc : planWeek(league, w);
}

/** Where the measurement for a part of the week's call is kept (see calls.ts's storeWorth): a game's by its id. */
export const weekWorthId = (wc: Pick<WeekCall, 'season' | 'week'>, kind: WeekKind | 'near' | 'far', gid?: number) =>
  `${weekId(wc.season, wc.week)}|${kind}${gid !== undefined ? `:${gid}` : ''}`;

/** The week's call stored for this week and this team (the one a sim works on), if it is. */
function storedWeek(league: League): WeekCall | null {
  const w = weekOf(league);
  const wc = league.weekCall;
  return w !== null && !league.fired && wc && wc.season === league.season && wc.week === w && wc.tid === league.userTid ? wc : null;
}

const done = (league: League, wc: WeekCall) => !!league.callsDone?.includes(weekId(wc.season, wc.week));

// ---------------------------------------------------------------- the practice, worked out

/**
 * The team as it will stand on the morning of day `to` with its practice at each step's focus through
 * that step's day (then `rest` after them): its familiarity and each player's wear.
 */
export function projectFoci(league: League, steps: [PrepFocus, number][], rest: PrepFocus, to: number): { fam: Familiarity; wear: Record<number, number> } {
  const me = league.userTid;
  const team = league.teams[me];
  const roster = teamPlayers(league, me);
  const t = { ...team, prep: rest, fam: structuredClone(team.fam ?? freshFamiliarity(team, roster)) };
  const wear: Record<number, number> = {};
  for (const p of roster) wear[p.pid] = p.wear;
  const playing = new Set(league.schedule.filter((g) => g.day >= league.day && g.day < to && (g.home === me || g.away === me)).map((g) => g.day));
  const load = team.practice === 'intense' ? 1.15 : team.practice === 'light' ? 0.9 : 1;
  for (let d = league.day; d < to; d++) {
    t.prep = steps.find(([, through]) => d <= through)?.[0] ?? rest;
    // a game day's minutes (the rotation's plan), else a practice at the day's focus; the focus's rest and the day's every day
    if (playing.has(d)) for (const p of roster) wear[p.pid] = Math.min(100, wear[p.pid] + (team.rotation.minutes[p.pid] ?? 0) * WEAR_A_MINUTE * load);
    else practiceDay(t, roster);
    for (const p of roster) wear[p.pid] = Math.max(0, wear[p.pid] - PREP_META[t.prep].rest - DAILY_REST);
  }
  return { fam: t.fam, wear };
}

/** The team as it stands on the morning of day `to` with `focus` held until then (the week's practice card's figures). */
export function projectPractice(league: League, focus: PrepFocus, to: number) {
  return projectFoci(league, [[focus, to]], focus, to);
}

/**
 * The week's practice choice when it is one to weigh: `near` wins the near game (opponent prep for the
 * week's big game, its counter drilled; or recovery for the week's last game), `far` the first game
 * after it (drills, or the everyday balance against recovery), each as steps through the week.
 */
export interface PracticeTrade {
  why: 'prep' | 'recovery';
  from: PrepFocus;
  near: PracticeHold;
  far: PracticeHold;
  gNear: ScheduledGame;
  oppNear: number;
  gFar: ScheduledGame;
  oppFar: number;
  /** The plan for the near game with the staff's counter in it (opponent prep drills it). */
  plan?: GamePlan;
}

function practiceTrade(league: League, wc: WeekCall): PracticeTrade | null {
  const f = wc.focus;
  if (!f) return null;
  const me = league.userTid;
  const end = weekEnd(wc);
  const after = (day: number) => gamesIn(league, day + 1, Infinity)[0];
  if (f.why === 'recovery') {
    const gNear = league.schedule.find((x) => x.gid === f.gid);
    const gFar = gNear && after(gNear.day);
    if (!gNear || gNear.played || !gFar) return null;
    const short = systemFamiliarity(league, me).overall < FAM_DRILL;
    return {
      why: 'recovery',
      from: f.from,
      near: { steps: [['recovery', end]], from: f.from },
      far: { steps: short ? [['system', end]] : [], from: f.from },
      gNear,
      oppNear: f.opp,
      gFar,
      oppFar: oppOf(league, gFar),
    };
  }
  // drills: a choice only against prep for a big game whose counter measured as a gain
  const wg = wc.games?.[0];
  const gNear = wg && league.schedule.find((x) => x.gid === wg.gid);
  const item = wg && league.callWorth?.[weekWorthId(wc, 'game', wg.gid)]?.items?.[0];
  const gFar = gNear && after(gNear.day);
  if (!wg || !gNear || gNear.played || !item || !gFar) return null;
  const plan = planFor(league, wg.opp, gNear);
  const items = [...(plan?.items ?? []).filter((x) => itemGroup(x) !== itemGroup(item)), item];
  return {
    why: 'prep',
    from: f.from,
    near: {
      steps: [
        ['opponent', gNear.day],
        ['system', end],
      ],
      from: f.from,
    },
    far: { steps: [['system', end]], from: f.from },
    gNear,
    oppNear: wg.opp,
    gFar,
    oppFar: oppOf(league, gFar),
    plan: { ...plan, oppTid: wg.opp, items, scope: plan?.scope ?? 'next' },
  };
}

/** A practice hold as a change for measureChanges: the team as it will stand on game `g`'s morning, its practice that day as the steps have it. */
function holdChange(league: League, h: PracticeHold, g: ScheduledGame, id: string, plan?: GamePlan, opp?: number): LeagueChange {
  const me = league.userTid;
  const p = projectFoci(league, h.steps, h.from, g.day);
  const prep = h.steps.find(([, through]) => g.day <= through)?.[0] ?? h.from;
  return {
    id,
    teams: { [me]: { fam: p.fam, prep } },
    players: Object.fromEntries(teamPlayers(league, me).map((x) => [x.pid, { wear: p.wear[x.pid] }])),
    ...(plan && opp !== undefined ? { gamePlans: { [opp]: plan } } : {}),
  };
}

/** The system's familiarity and the rotation's wear on game `g`'s morning under a hold (the card's figures). */
function holdFigures(league: League, h: PracticeHold, g: ScheduledGame) {
  const me = league.userTid;
  const p = projectFoci(league, h.steps, h.from, g.day);
  const team = league.teams[me];
  const fam = systemFamiliarity({ ...league, teams: league.teams.map((t) => (t.tid === me ? { ...t, fam: p.fam } : t)) }, me).overall;
  return { fam: Math.round(fam), wear: Math.round(rotationWear(teamPlayers(league, me), team.rotation.minutes, p.wear)) };
}

/** Put a practice in for the week (his answer or the staff's pick): today's step now, the rest each morning (stepPractice). */
function holdPractice(league: League, wc: WeekCall, h: PracticeHold) {
  wc.hold = h;
  const team = league.teams[league.userTid];
  const want = h.steps.find(([, through]) => league.day <= through)?.[0] ?? h.from;
  team.prep = want;
  wc.set = want;
}

/** The practice in place is the one the week's call put in (his answer or the staff's own pick), until it comes out at the week's end. */
export function weekHolds(league: League): boolean {
  const wc = storedWeek(league);
  return !!wc?.hold && !!wc.set && league.teams[league.userTid].prep === wc.set;
}

/** Each morning: the practice the staff put in moves to the day's step, unless he has changed it since (then it's his). */
function stepPractice(league: League, wc: WeekCall) {
  const team = league.teams[league.userTid];
  if (!wc.hold || !wc.set || team.prep !== wc.set) return;
  const want = wc.hold.steps.find(([, through]) => league.day <= through)?.[0] ?? wc.hold.from;
  if (want === wc.set) return;
  team.prep = want;
  wc.set = want;
}

// ---------------------------------------------------------------- what's still to measure, and the picks

/** A measurement stands for game `gid` (the week's are taken once: the staff decides on them that morning). */
const kept = (league: League, key: string, gid: number): CallWorth | null => {
  const w = league.callWorth?.[key];
  return w && w.gid === gid ? w : null;
};

/**
 * What the week's picks still wait on: the big game's counters first (opponent prep is only weighed
 * for a gain), then the practice's two sides, then the young players' lean. Empty once the week is
 * decided (or there's nothing to decide).
 */
export function weekNeeds(league: League): CallMeasure[] {
  const wc = storedWeek(league);
  if (!wc || wc.decided || wc.taken || done(league, wc)) return [];
  const me = league.userTid;
  const wg = wc.games?.[0];
  const g = wg && league.schedule.find((x) => x.gid === wg.gid);
  // (a plan he has for them already is his answer: the staff doesn't touch it)
  const his = wg && g ? planFor(league, wg.opp, g) : undefined;
  if (wg && g && !g.played && !(his && planMade(his))) {
    const key = weekWorthId(wc, 'game', wg.gid);
    if (!kept(league, key, g.gid)) return [{ kind: 'counters', key, opp: wg.opp, gid: g.gid, sig: worthSig(league, wg.opp, g), max: 1 }];
  }
  const out: CallMeasure[] = [];
  const tr = practiceTrade(league, wc);
  if (tr) {
    const near = weekWorthId(wc, 'near', tr.gNear.gid);
    const far = weekWorthId(wc, 'far', tr.gFar.gid);
    if (!kept(league, near, tr.gNear.gid))
      out.push({
        kind: 'change',
        key: near,
        opp: tr.oppNear,
        gid: tr.gNear.gid,
        sig: worthSig(league, tr.oppNear, tr.gNear, 'near'),
        base: holdChange(league, tr.far, tr.gNear, 'far', tr.plan, tr.oppNear),
        change: holdChange(league, tr.near, tr.gNear, 'near', tr.plan, tr.oppNear),
      });
    if (!kept(league, far, tr.gFar.gid))
      out.push({
        kind: 'change',
        key: far,
        opp: tr.oppFar,
        gid: tr.gFar.gid,
        sig: worthSig(league, tr.oppFar, tr.gFar, 'far'),
        base: holdChange(league, tr.near, tr.gFar, 'near'),
        change: holdChange(league, tr.far, tr.gFar, 'far'),
      });
  }
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

/** "+1.4", "−0.3". */
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;

/** A measured worth in a game as the cards say it: "+1.2 pts (≈ +4% to win)", or inside brackets "+1.2 pts, ≈ +4% to win". */
export function ptsWin(pts: number, inner = false): string {
  const w = Math.round((winChance(pts) - 0.5) * 100);
  const win = `≈ ${w > 0 ? '+' : '−'}${Math.abs(w)}% to win`;
  return `${signed(pts)} pts${w ? (inner ? `, ${win}` : ` (${win})`) : ''}`;
}

/** Wins over `games` games at `pts` a game: what a measured worth comes to. */
export const winsOf = (pts: number, games: number) => games * (winChance(pts) - 0.5);

/** The practice's two measured sides: what `near` wins its game by, and `far` its. */
function tradeWorth(league: League, wc: WeekCall, tr: PracticeTrade) {
  const near = kept(league, weekWorthId(wc, 'near', tr.gNear.gid), tr.gNear.gid)?.pts;
  const far = kept(league, weekWorthId(wc, 'far', tr.gFar.gid), tr.gFar.gid)?.pts;
  return near === undefined || far === undefined ? null : { near, far };
}

/** The practice the staff leans to when each side wins its own game: the near game's edge against the far one's, counted for FAR_CARRY games. */
const practiceLean = (w: { near: number; far: number }) => (w.near >= w.far * FAR_CARRY ? 'near' : 'far');

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

const label = (f: PrepFocus) => PREP_META[f].label;

/** Words for a practice put in: "Tactical drills through Sunday", "Opponent prep through Friday, then Tactical drills". */
function holdText(league: League, h: PracticeHold): string {
  const day = (d: number) => fmtDate(league.season, d, { weekday: 'long' });
  return h.steps.map(([f, through], i) => (i ? `then ${label(f)} through ${day(through)}` : `${label(f)} through ${day(through)}`)).join(', ');
}

/**
 * The staff's picks for the week, once what they wait on is measured (weekNeeds empty): the big game's
 * counter in if it measured as a gain; the practice side that wins (drills on their own); the young
 * players' lean if it costs nothing measurable. A practice whose sides each win their own game, or a
 * lean that costs points, is a choice: the card opens (one a week, the practice's first).
 */
export function weekDecide(league: League) {
  const wc = storedWeek(league);
  if (!wc || wc.decided || wc.taken || done(league, wc) || weekNeeds(league).length) return;
  wc.decided = true;
  const wg = wc.games?.[0];
  const g = wg && league.schedule.find((x) => x.gid === wg.gid);
  const item = wg && g && !g.played ? kept(league, weekWorthId(wc, 'game', wg.gid), g.gid)?.items?.[0] : undefined;
  if (wg && g && item) {
    // (the staff's own pick: not a plan of his, as the guide counts them)
    setPlanItem(league, wg.opp, { ...item, staff: true });
    notePick(
      league,
      `${wg.tag ? `${wg.tag} ` : ''}${vsAt(league, g)} ${whenText(league, g.day)}: the staff put in ${item.label}, ${ptsWin(item.pts ?? 0)} against them (measured).`,
    );
  }
  const tr = practiceTrade(league, wc);
  const tw = tr && tradeWorth(league, wc, tr);
  if (tr && tw && tw.near >= WORTH_MIN && tw.far >= WORTH_MIN) {
    wc.ask = 'practice';
  } else if (tr && tw && tw.near >= WORTH_MIN) {
    holdPractice(league, wc, tr.near);
    notePick(
      league,
      `Practice: ${holdText(league, tr.near)} (${ptsWin(tw.near, true)} ${vsAt(league, tr.gNear)} ${whenText(league, tr.gNear.day)}, measured; nothing measurable lost after it).`,
    );
  } else if (wc.focus?.why === 'drills' || (tr && tr.far.steps.length)) {
    // drills build the system twice as fast as the balance at no cost to the legs: the staff's to put in
    const h: PracticeHold = tr?.far.steps.length ? tr.far : { steps: [['system', weekEnd(wc)]], from: wc.focus!.from };
    const now = Math.round(systemFamiliarity(league, league.userTid).overall);
    holdPractice(league, wc, h);
    notePick(league, `Practice: ${holdText(league, h)} (the system at ${now}%, building twice as fast as at Balanced).`);
  }
  const y = wc.youth;
  const yw = y && kept(league, weekWorthId(wc, 'youth'), y.gid);
  // (for the draft, wins that don't move the pick buy nothing: the rotation as it is, and not asked again for a while)
  const draft = y?.why === 'draft' && yw && yw.pts !== undefined && yw.pts <= -WORTH_MIN;
  const lo = draft ? lotteryOutlook(league, leanLost(league, yw.pts!)) : null;
  const moves = !!lo && (lo.top4[1] - lo.top4[0] >= LOTTERY_MOVE || lo.pick[0] - lo.pick[1] >= LOTTERY_SLOTS);
  if (y && yw && yw.pts !== undefined) {
    if (draft && !moves) {
      putYouth(league, 'kept', wc);
      notePick(
        league,
        `The young players: the rotation kept. Their minutes measured ${ptsWin(yw.pts)}, about ${leanLost(league, yw.pts).toFixed(1)} wins, which leave your pick where it is as the forecast reads it${lo ? ` (a top-four pick ${pct(lo.top4[0])})` : ''}.`,
      );
    } else if (yw.pts <= -WORTH_MIN) {
      if (!wc.ask) wc.ask = 'youth';
    } else {
      // (read before the lean goes in: "without" is the rotation as it was)
      const o = youthOutlook(league, y.add);
      putYouth(league, 'auto', wc);
      const what =
        y.why === 'draft'
          ? ', the postseason out of reach'
          : `, for the owner's goal${o ? ` (on pace for ${o.lean.toLocaleString('en-US')} of his ${o.g.target.toLocaleString('en-US')} minutes, ${o.base.toLocaleString('en-US')} without)` : ''}`;
      notePick(
        league,
        `The young players: about ${y.add} more minutes a game until ${fmtDate(league.season, league.youthLean!.until)}${what}; ${yw.pts >= WORTH_MIN ? `it measured as a gain (${ptsWin(yw.pts, true)})` : `it costs nothing measurable (${ptsWin(yw.pts, true)})`}.`,
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
 * Once measured again, the digest's line for the lean: whose call it was, what it measured at then
 * and now, and the young players' minutes in its games (the box scores) against what the rotation
 * planned without it.
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
  const then = y.pts !== undefined ? `; ${signed(y.pts)} pts when it went in` : '';
  const planned = y.young !== undefined ? `, where the rotation without it planned about ${Math.round(y.young * games.length).toLocaleString('en-US')}` : '';
  notePick(
    league,
    `${who} on ${fmtDate(league.season, y.from)}, the young players' minutes${y.why === 'draft' ? ' for the draft' : " for the owner's goal"}: measured again on its last game (${vsAt(league, g)}), ${ptsWin(w.pts)}${then}. They played ${Math.round(mins).toLocaleString('en-US')} minutes in its ${games.length} games${planned}.`,
  );
  league.youthLean = { ...y, paid: true };
}

// ---------------------------------------------------------------- the card

/** "vs BOS", "@ BOS". */
export const vsAt = (league: League, g: Pick<ScheduledGame, 'home' | 'away'>) => `${g.home === league.userTid ? 'vs' : '@'} ${league.teams[oppOf(league, g)].abbrev}`;

/** "Friday", or "tonight". */
export const whenText = (league: League, day: number) => (day === league.day ? 'tonight' : `on ${fmtDate(league.season, day, { weekday: 'long' })}`);

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
  if (ask === 'practice') {
    const tr = practiceTrade(league, wc);
    const tw = tr && tradeWorth(league, wc, tr);
    if (!tr || !tw) return null;
    const nearF = holdFigures(league, tr.near, tr.gNear);
    const farF = holdFigures(league, tr.far, tr.gNear);
    const nearL = holdFigures(league, tr.near, tr.gFar);
    const farL = holdFigures(league, tr.far, tr.gFar);
    const them = league.teams[tr.oppNear].abbrev;
    const at = `${vsAt(league, tr.gNear)} ${whenText(league, tr.gNear.day)}`;
    const later = `${vsAt(league, tr.gFar)} ${whenText(league, tr.gFar.day)}`;
    const lean = practiceLean(tw);
    const near: CallCard['suggestion'] = { label: tr.why === 'prep' ? `Prep for ${them}` : 'Recovery this week', action: { kind: 'weekPrep', id, focus: tr.near.steps[0][0] } };
    const far: CallCard['suggestion'] = {
      label: tr.far.steps.length ? 'Drill the system' : `Keep ${label(tr.from)}`,
      action: tr.far.steps.length ? { kind: 'weekPrep', id, focus: tr.far.steps[0][0] } : { kind: 'settle', id },
    };
    const nearWhy =
      tr.why === 'prep' ? `Prep: ${ptsWin(tw.near)} ${at}, the staff's counter drilled.` : `Recovery: ${ptsWin(tw.near)} ${at}, the legs at ${nearF.wear} not ${farF.wear}.`;
    const farWhy = `${tr.far.steps.length ? 'Drills' : label(tr.from)}: ${ptsWin(tw.far)} ${later}, the system at ${farL.fam}% not ${nearL.fam}%.`;
    const why = lean === 'near' ? `its edge ${tr.why === 'prep' ? 'against them' : 'that night'} is the bigger one` : 'the system pays for more than one night';
    return {
      id,
      kind: 'week',
      title: tr.why === 'prep' ? `Prep for ${them}, or drill the system?` : 'Rest the legs, or build the system?',
      line: `${nearWhy} ${farWhy} Both measured. The staff leans ${lean === 'near' ? near.label.toLowerCase() : far.label.toLowerCase()}: ${why}. ${tomorrow}`,
      tone: 'info',
      to: '/team/tactics',
      suggestion: lean === 'near' ? near : far,
      choices: [lean === 'near' ? far : near],
    };
  }
  const y = wc.youth!;
  const yw = kept(league, weekWorthId(wc, 'youth'), y.gid);
  if (!yw || yw.pts === undefined) return null;
  const left = Math.min(YOUTH_GAMES, gamesLeft(league));
  const lost = leanLost(league, yw.pts);
  const leans = youthLeans(league, y, yw.pts);
  const play: CallCard['suggestion'] = { label: 'Play the young players', action: { kind: 'youthLean', id } };
  const keep: CallCard['suggestion'] = { label: 'Keep the rotation', action: { kind: 'settle', id } };
  const n = (x: number) => x.toLocaleString('en-US');
  const at = vsAt(
    league,
    league.schedule.find((x) => x.gid === y.gid)!,
  );
  const cost = `It costs ${Math.abs(yw.pts).toFixed(1)} pts a game (≈ −${Math.round((0.5 - winChance(yw.pts)) * 100)}% to win, measured ${at}): about ${lost.toFixed(1)} wins over ${left} games.`;
  let gain: string;
  let why: string;
  if (y.why === 'draft') {
    const lo = lotteryOutlook(league, lost);
    if (!lo) return null;
    // (the pick as the forecast reads it: its odds, not a measurement, and said so)
    gain = `Your own first, as the forecast reads the standings: a top-four pick ${pct(lo.top4[1])}, not ${pct(lo.top4[0])}; about No. ${Math.round(lo.pick[1])}, not No. ${Math.round(lo.pick[0])}.`;
    why = leans ? "play them: the owner's wins goal is out of reach either way" : 'keep it: the owner still counts these wins';
  } else {
    const o = youthOutlook(league, y.add);
    if (!o) return null;
    gain = `It adds ${n(o.lean - o.base)} of the owner's minutes: on pace for ${n(o.lean)} of his ${n(o.g.target)}, not ${n(o.base)}.`;
    why = leans ? 'play them: the owner counts the minutes for more' : 'keep it: the owner counts the wins for more';
  }
  return {
    id,
    kind: 'week',
    title: `${y.add} more minutes a game for the young players?`,
    line: `${cost} ${gain} The staff leans ${why}. ${tomorrow}`,
    tone: 'info',
    to: y.why === 'draft' ? '/office/draft' : '/office/owner',
    suggestion: leans ? play : keep,
    choices: [leans ? keep : play],
  };
}

/** The week's card answered (calls.ts's resolveCall): `focus` for a practice, `youth` for the young players' lean, nothing for things as they were. */
export function answerWeek(league: League, a: { focus?: PrepFocus; youth?: boolean }): { ok: boolean; text: string } {
  const wc = storedWeek(league);
  const ask = wc && weekKind(league, wc);
  if (!wc || !ask) return { ok: false, text: 'That week is over.' };
  if (ask === 'practice' && a.focus) {
    const tr = practiceTrade(league, wc);
    const h = tr && (tr.near.steps[0]?.[0] === a.focus ? tr.near : tr.far);
    if (!tr || !h) return { ok: false, text: 'That week is over.' };
    holdPractice(league, wc, h);
    wc.taken = practiceLean(tradeWorth(league, wc, tr) ?? { near: 0, far: 0 }) === (h === tr.near ? 'near' : 'far') ? 'staff' : 'kept';
    return { ok: true, text: `Practice: ${holdText(league, h)}.` };
  }
  if (ask === 'youth' && a.youth) {
    putYouth(league, 'staff', wc, true);
    wc.taken = 'staff';
    return { ok: true, text: `The young players get their minutes until ${fmtDate(league.season, league.youthLean!.until)}.` };
  }
  if (ask === 'youth') putYouth(league, 'kept', wc, true);
  wc.taken = 'kept';
  return { ok: true, text: '' };
}

/** The staff's lean on an open card, put in unanswered (weekDaily). */
function takeLean(league: League, wc: WeekCall) {
  if (wc.ask === 'practice') {
    const tr = practiceTrade(league, wc);
    const tw = tr && tradeWorth(league, wc, tr);
    if (tr && tw) {
      const h = practiceLean(tw) === 'near' ? tr.near : tr.far;
      if (h.steps.length) holdPractice(league, wc, h);
      notePick(
        league,
        `Practice: ${h.steps.length ? holdText(league, h) : `${label(tr.from)} kept`}, the staff's lean on a card you left (${ptsWin(practiceLean(tw) === 'near' ? tw.near : tw.far, true)} in its game, measured).`,
      );
    }
  } else if (wc.ask === 'youth' && wc.youth) {
    const yw = kept(league, weekWorthId(wc, 'youth'), wc.youth.gid);
    const leans = !!yw && yw.pts !== undefined && youthLeans(league, wc.youth, yw.pts);
    putYouth(league, leans ? 'auto' : 'kept', wc, true);
    notePick(
      league,
      leans
        ? `The young players: about ${wc.youth.add} more minutes a game until ${fmtDate(league.season, league.youthLean!.until)}, the staff's lean on a card you left.`
        : "The young players: the rotation kept, the staff's lean on a card you left.",
    );
  }
  wc.taken = 'auto';
}

// ---------------------------------------------------------------- each morning

/** Note something the staff did on its own (the digest says it). */
export function notePick(league: League, text: string, lapsed = false) {
  const picks = league.staffPicks ?? [];
  picks.push({ season: league.season, day: league.day, text, ...(lapsed ? { lapsed } : {}) });
  league.staffPicks = picks.slice(-PICKS_KEPT);
}

/**
 * Each morning of the season (callsDaily): a week that's over takes out the practice its call put in
 * (if it's still the focus) and the next week is planned; the practice put in moves to the day's step;
 * a card left unanswered past the morning after it opened is the staff's lean; a big game played
 * before the staff could measure it (a live game the morning the week began) is noted as gone by.
 * The picks themselves wait on the measuring (weekNeeds, weekDecide: a sim runs them each morning).
 */
export function weekDaily(league: League) {
  if (league.fired) return;
  const w = weekOf(league);
  const old = league.weekCall;
  if (old && (w === null || old.season !== league.season || old.week !== w || old.tid !== league.userTid)) {
    const team = league.teams[old.tid ?? league.userTid];
    if (old.set && team?.prep === old.set) team.prep = old.hold?.from ?? old.focus?.from ?? 'balanced';
    league.weekCall = undefined;
  }
  if (w === null) return;
  const wc = (league.weekCall ??= planWeek(league, w));
  stepPractice(league, wc);
  if (wc.taken || done(league, wc)) return;
  if (!wc.decided) {
    const wg = wc.games?.[0];
    const g = wg && league.schedule.find((x) => x.gid === wg.gid);
    if (wg && g?.played && !kept(league, weekWorthId(wc, 'game', wg.gid), g.gid)) {
      // (the rest of the week is still the staff's to decide: without the game, nothing waits on it)
      wc.games = [];
      notePick(league, vsAt(league, g), true);
    }
    return;
  }
  if (wc.ask && league.day > (wc.asked ?? wc.day)) takeLean(league, wc);
}

/**
 * What the staff did on its own in a sim that started on `day` of `season` (a digest's stretch), as
 * lines: each pick, then one line for the week's big games played before it could measure them. A
 * pick is made in a sim's mornings, so the one on the morning it started was the sim before's.
 */
export function staffPicksSince(league: League, season: number, day: number): string[] {
  const picks = (league.staffPicks ?? []).filter((p) => p.season > season || (p.season === season && p.day > day));
  const out = picks.filter((p) => !p.lapsed).map((p) => p.text);
  const lapsed = picks.filter((p) => p.lapsed);
  if (lapsed.length)
    out.push(
      `${lapsed.length === 1 ? `The week's big game (${lapsed[0].text}) was` : `${lapsed.length} weeks' big games (${lapsed.map((p) => p.text).join(', ')}) were`} played before the staff could measure ${lapsed.length === 1 ? 'it' : 'them'}, so your plan stood.`,
    );
  return out;
}
