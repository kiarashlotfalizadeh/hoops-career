// Win probability: the chance the home team wins from a game state (the score, the time left, who
// has the ball) and what the game was expected to be at tip-off (the projected home margin,
// GameResult.edge). What's left of a game is modeled as a normal margin. Its mean is the lead now,
// less the part of it that comes back on average (engine games give back about 15% of a lead with
// 19 minutes or more to go: benches finish blowouts and leaders slow down), plus the projection's
// share for the time left and the ball's worth. Its spread grows with the time left, a little
// faster near the end than a random walk's (fouls, threes and free throws), and never quite goes
// to zero while time is left. A tie at the end of regulation or an overtime goes to another
// overtime, which the projection shades a little. Fitted to 1,231 engine games and checked on
// 1,231 others (log loss 0.459 against 0.501 for the margin alone, every 10% bucket within 2
// points); winProb.test.ts keeps it honest on a smaller sample.

import { GAME } from '../constants';
import { clamp } from '../random';
import type { GameResult, PbpEntry } from '../types';
import { HOME_EDGE, phi } from './projection';

/** The model's constants, fitted to engine games (winProb.test.ts checks the fit holds). */
export const WP = {
  /** Spread of the remaining margin over a full 48 minutes. */
  sd: 15,
  /** It grows with the time left to this power. */
  alpha: 0.9,
  /** Share of a lead that comes back on average with `full` of the game or more left (benches finish blowouts, leaders slow down), less near the end. */
  revert: 0.15,
  full: 0.4,
  /** Points having the ball is worth: one more trip than the other team about half the time. */
  ball: 0.55,
  /** Spread that never goes away while time is left (a last possession can still be worth three or a foul). */
  floor: 1.5,
};

export type WpParams = typeof WP;

const REG = 4 * GAME.quarterSec;

export interface WpState {
  /** Home score minus away score. */
  margin: number;
  /** Period: 1-4, then 5, 6... for overtimes. */
  q: number;
  /** Seconds left in the period (0: it's over). */
  clock: number;
  /** The side with the ball next (0 home, 1 away), or null when it isn't known (between periods, an older game). */
  ball: 0 | 1 | null;
  /** Projected home margin at tip-off, home court included. */
  edge: number;
}

/** Seconds left in the game as it stands (an overtime counts only itself). */
export function secondsLeft(q: number, clock: number) {
  return q <= 4 ? (4 - q) * GAME.quarterSec + Math.max(0, clock) : Math.max(0, clock);
}

/** Game seconds played at the start of period `q`. */
export function periodStart(q: number) {
  return q <= 4 ? (q - 1) * GAME.quarterSec : REG + (q - 5) * GAME.otSec;
}

/** Chance the home team wins an overtime (and any after it), from the projection's edge over five minutes. */
export function overtimeWin(edge: number, k: WpParams = WP) {
  const share = GAME.otSec / REG;
  return phi((edge * share) / Math.sqrt(k.sd * k.sd * Math.pow(share, k.alpha) + k.floor * k.floor));
}

/** The least chance a game still being played is given either way. */
const UNDECIDED = 1e-4;

/** The chance the home team wins from this state: 1 or 0 once the game is decided. */
export function winProb(s: WpState, k: WpParams = WP): number {
  const left = secondsLeft(s.q, s.clock);
  const ot = overtimeWin(s.edge, k);
  if (left <= 0) {
    // a period over: a lead in the fourth quarter or an overtime is the result, a tie plays on
    if (s.q >= 4) return s.margin > 0 ? 1 : s.margin < 0 ? 0 : ot;
  }
  const share = left / REG;
  const ball = s.ball === null ? 0 : s.ball === 0 ? k.ball : -k.ball;
  const mean = s.margin * (1 - k.revert * Math.min(1, share / k.full)) + s.edge * share + ball;
  const sd = Math.sqrt(k.sd * k.sd * Math.pow(share, k.alpha) + k.floor * k.floor);
  // whole points: ahead by half a point or more wins, within half a point is a tie (overtime)
  const lose = phi((-0.5 - mean) / sd);
  const notWin = phi((0.5 - mean) / sd);
  // (the normal's tail underflows in a late blowout: still a chance, never a certainty, until it's over)
  return clamp(1 - notWin + (notWin - lose) * ot, UNDECIDED, 1 - UNDECIDED);
}

/**
 * The chance of winning a game projected at `margin` points, before tip-off: where its win
 * probability starts (a tie to start, the projection's whole edge to come), so a pre-game screen and
 * the live game's first number are the same one.
 */
export const winChance = (margin: number, k: WpParams = WP) => winProb({ q: 1, clock: GAME.quarterSec, margin: 0, ball: null, edge: margin }, k);

/** One point of a game's win-probability line. */
export interface WpPoint {
  /** Index into the game's flow (-1: tip-off). */
  i: number;
  /** Game seconds played. */
  t: number;
  q: number;
  /** Seconds left in the period. */
  clock: number;
  /** Home margin. */
  margin: number;
  /** The home team's chance to win. */
  wp: number;
}

/**
 * A finished (or drawn-so-far) game's win probability after every possession, from tip-off. Games
 * stored before win probability have no flowT (their possessions are spread evenly over each period)
 * or flowPoss (the ball isn't counted) or edge (the home court is: the projection between two equal
 * teams). Null without a flow.
 */
export function wpSeries(
  g: Pick<GameResult, 'flow' | 'flowPeriods' | 'flowT' | 'flowPoss' | 'edge' | 'type' | 'cup'>,
  k: WpParams = WP,
  /** A game in progress: the clock after its latest possession (its period isn't over unless that's 0). */
  live?: { clock: number },
): WpPoint[] | null {
  const flow = g.flow;
  if (!flow?.length) return null;
  const starts = g.flowPeriods?.length ? g.flowPeriods : [0];
  const edge = g.edge ?? (g.type === 'allstar' || g.cup === 'final' ? 0 : HOME_EDGE);
  const times = g.flowT?.length === flow.length ? g.flowT : null;
  const poss = g.flowPoss?.length === starts.length ? g.flowPoss : null;
  const out: WpPoint[] = [{ i: -1, t: 0, q: 1, clock: GAME.quarterSec, margin: 0, wp: winProb({ margin: 0, q: 1, clock: GAME.quarterSec, ball: poss?.[0] ?? null, edge }, k) }];
  for (let p = 0; p < starts.length; p++) {
    const from = starts[p];
    const to = p + 1 < starts.length ? starts[p + 1] : flow.length;
    const q = p + 1;
    const len = q <= 4 ? GAME.quarterSec : GAME.otSec;
    const t0 = periodStart(q);
    for (let i = from; i < to && i < flow.length; i++) {
      // the latest possession of a game in progress: its clock is known exactly
      const now = live && i === flow.length - 1 ? live.clock : null;
      const t = now !== null ? t0 + len - now : times ? times[i] : t0 + ((i - from + 1) / Math.max(1, to - from)) * len;
      // the last possession of a period ends it: no time is left in it after
      const last = now !== null ? now <= 0.05 : i === to - 1;
      const clock = last ? 0 : Math.max(0, Math.min(len, t0 + len - t));
      // possessions alternate within a period: the side that didn't just have it has the ball
      const off = poss ? (((poss[p] + (i - from)) % 2) as 0 | 1) : null;
      const ball = last || off === null ? null : ((1 - off) as 0 | 1);
      out.push({ i, t: Math.min(t0 + len, Math.max(t0, t)), q, clock, margin: flow[i], wp: winProb({ margin: flow[i], q, clock, ball, edge }, k) });
    }
  }
  return out;
}

/** A change of win probability over one possession, from the home side. */
export interface WpSwing {
  /** The point after it (its index in the series). */
  at: number;
  /** Home win probability before and after. */
  from: number;
  to: number;
}

/**
 * The biggest swings either way, largest first: at most `n`, each at least `min` (a share of 1) and
 * `gap` game seconds from a bigger one, so one wild minute doesn't take all the places.
 */
export function biggestSwings(series: WpPoint[], n = 3, min = 0.05, gap = 120): WpSwing[] {
  const swings: WpSwing[] = [];
  for (let j = 1; j < series.length; j++) swings.push({ at: j, from: series[j - 1].wp, to: series[j].wp });
  const out: WpSwing[] = [];
  for (const s of swings.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))) {
    if (out.length >= n || Math.abs(s.to - s.from) < min) break;
    if (out.some((o) => Math.abs(series[o.at].t - series[s.at].t) < gap)) continue;
    out.push(s);
  }
  return out;
}

/** A winner's chance that moved this little on its best possession: the game was never in doubt, so no turning point is named. */
export const TURN_MIN = 0.1;
/** A winner whose chance fell this low came back (from the loser's side, a lead let slip). */
export const COMEBACK_WP = 0.15;

/** What win probability says about how a game went for its winner. */
export interface WpStory {
  /** The winner: 0 home, 1 away. */
  winner: 0 | 1;
  /** The possession that raised the winner's chance the most: its point and the one before, and the winner's chance before and after. */
  turn: { point: WpPoint; prev: WpPoint; from: number; to: number };
  /** The winner's lowest chance while the game was on, and where: a comeback when it was low (a collapse from the loser's side). */
  low: { wp: number; point: WpPoint };
}

export function wpStory(g: Pick<GameResult, 'flow' | 'flowPeriods' | 'flowT' | 'flowPoss' | 'edge' | 'type' | 'cup' | 'home' | 'away'>, k: WpParams = WP): WpStory | null {
  const series = wpSeries(g, k);
  if (!series || series.length < 3 || g.home.pts === g.away.pts) return null;
  const winner: 0 | 1 = g.home.pts > g.away.pts ? 0 : 1;
  const mine = (p: WpPoint) => (winner === 0 ? p.wp : 1 - p.wp);
  let at = 1;
  for (let j = 2; j < series.length; j++) if (mine(series[j]) - mine(series[j - 1]) > mine(series[at]) - mine(series[at - 1])) at = j;
  // (the final point is the result, not a chance)
  let low = series[0];
  for (const p of series.slice(0, -1)) if (mine(p) < mine(low)) low = p;
  return { winner, turn: { point: series[at], prev: series[at - 1], from: mine(series[at - 1]), to: mine(series[at]) }, low: { wp: mine(low), point: low } };
}

/**
 * The play-by-play line that ended the possession a point closes (its last basket or free throw
 * when it scored, else the miss or turnover), when the game's play-by-play and possession clock are
 * stored (the play-by-play is kept for the user's latest few games).
 */
export function playAt(g: Pick<GameResult, 'pbp' | 'flow' | 'flowT' | 'flowPeriods' | 'flowPoss'>, point: WpPoint): PbpEntry | null {
  const { pbp, flow, flowT } = g;
  if (!pbp?.length || !flow || flowT?.length !== flow.length || point.i < 0) return null;
  const q = point.q;
  const end = periodStart(q) + (q <= 4 ? GAME.quarterSec : GAME.otSec);
  const first = (g.flowPeriods ?? [0])[q - 1] ?? 0;
  const from = point.i > first ? flowT[point.i - 1] : periodStart(q);
  // the possession ran from `from` to flowT[i] (whole seconds, so half a second of slack each way)
  const hi = end - from + 0.6;
  const lo = end - flowT[point.i] - 0.6;
  // the side that had the ball (possessions alternate within a period, from the one that started it):
  // the slack must not pick up the other side's last miss on a trip that only ran out the clock
  const start = g.flowPoss?.[q - 1];
  const off = start === undefined ? null : (start + point.i - first) % 2;
  const inWindow = pbp.filter((e) => e.q === q && e.clock <= hi && e.clock >= lo && (off === null || e.t === off));
  const before = point.i > 0 ? flow[point.i - 1] : 0;
  const scored = flow[point.i] !== before;
  const pick = [...inWindow].reverse().find((e) => (scored ? (e.kind === 'make' || e.kind === 'ft') && e.hs - e.as === flow[point.i] : e.kind === 'miss' || e.kind === 'to'));
  return pick ?? null;
}

/** A chance as a broadcast prints it: whole percents, but ">99%" and "<1%" until the game is decided. */
export function wpText(v: number): string {
  return v >= 1 ? '100%' : v <= 0 ? '0%' : v >= 0.995 ? '>99%' : v < 0.005 ? '<1%' : `${Math.round(v * 100)}%`;
}

/** "NYK up 5", "tied": the score from one side (`margin`: that side's). */
export const marginWords = (abbrev: string, margin: number) => (margin === 0 ? 'tied' : `${abbrev} ${margin > 0 ? 'up' : 'down'} ${Math.abs(margin)}`);

/** What a possession did to the score, from one team's side (`before`/`after`: its margin): "took the lead", "tied it", "cut it to 3"... */
export function swingWords(before: number, after: number): string {
  if (after === before) return after > 0 ? `held a ${after}-point lead` : after < 0 ? `got a stop down ${-after}` : 'got a stop in a tie game';
  if (after > before) {
    if (after > 0 && before <= 0) return `took a ${after}-point lead`;
    if (after === 0) return 'tied it';
    if (after < 0) return `cut it to ${-after}`;
    return `stretched the lead to ${after}`;
  }
  if (after < 0 && before >= 0) return `fell behind by ${-after}`;
  if (after === 0) return 'were tied';
  if (after > 0) return `saw the lead cut to ${after}`;
  return `fell ${-after} behind`;
}
