// What the staff's counters are worth against one opponent, measured before they're proposed: the
// user's next game against them played many times as it stands and with each counter in the plan,
// game for game on the same seeds, in points a game. The rules that draft the counters (advisor.ts)
// only say where to look: over the real league a staff plan picked by them alone came out worth about
// nothing (+0.1 a 100 possessions over six opponents, most single counters below zero), so a counter
// shows the number, and the staff proposes only the ones that measure as a gain.
//
// Each game is scored by its shot value (every attempt as likely to fall, plus the free throws made)
// rather than the points: a counter changes the looks, and whether this one look fell is noise it
// can't move. Paired that way, 240 games pin a counter to about ±0.45 a game (the points alone: ±0.6).
// Pure: reads the league.

import type { League, ScheduledGame } from '../types';
import { GameSim } from '../sim/engine';
import { Rng, hashString } from '../random';
import { buildSimInput, neutralSite } from '../league/games';
import { itemGroup, planFor } from '../league/gamePlans';
import { counterCandidates, type Candidate } from './advisor';

/** Games each configuration is played (the plan as it stands, and each counter). */
export const WORTH_GAMES = 240;
/** Counters measured: the first the rules draft (the ones the numbers back first). */
export const WORTH_MAX = 5;
/**
 * A counter reads as a gain (or a cost) once it's this many standard errors from even: at about ±0.45,
 * a counter worth a point a game reads as one most of the time, one worth nothing about one time in 14.
 */
export const WORTH_Z = 1.5;

export interface CounterWorth {
  id: string;
  /** Points a game it adds to the margin (under 0: costs). */
  pts: number;
  se: number;
}

/** What a measured counter reads as: a gain, a cost, or too close to even to say. */
export const worthCall = (w: Pick<CounterWorth, 'pts' | 'se'>): 'gain' | 'cost' | 'even' => (w.pts > WORTH_Z * w.se ? 'gain' : w.pts < -WORTH_Z * w.se ? 'cost' : 'even');

/** A game's margin for the user's side by its shot value: expected points from the field plus free throws made. */
function xMargin(sim: GameSim, side: 0 | 1): number {
  const r = sim.simToEnd();
  const x = r.xShots;
  const v = x ? [x[0].pts + r.home.t.ftm, x[1].pts + r.away.t.ftm] : [r.home.pts, r.away.pts];
  return side === 0 ? v[0] - v[1] : v[1] - v[0];
}

/** How a measurement runs: its games, progress, a pause between configurations (for a sim to get in) and a way to give up. */
export interface WorthOpts {
  games?: number;
  /** Configurations played so far, of all of them (the plan as it stands, then each counter). */
  onProgress?: (done: number, total: number) => void;
  between?: () => Promise<void> | void;
  /** Checked between configurations: true stops it (and it comes back null). */
  cancelled?: () => boolean;
}

/**
 * The staff's counters against `opp` (the first WORTH_MAX the rules draft), each measured over paired
 * games of the user's next game against them (`game`, else a home game on today's date): its points
 * a game over the plan as it stands.
 */
export async function counterWorth(
  league: League,
  opp: number,
  game?: Pick<ScheduledGame, 'home' | 'away' | 'day' | 'type' | 'seriesId' | 'cup'> & Partial<Pick<ScheduledGame, 'gid'>>,
  opts: WorthOpts = {},
): Promise<CounterWorth[] | null> {
  const games = opts.games ?? WORTH_GAMES;
  const user = league.userTid;
  const g = game ?? { home: user, away: opp, day: league.day, type: 'regular' as const, seriesId: undefined, cup: undefined };
  const cands: Candidate[] = counterCandidates(league, user, opp).slice(0, WORTH_MAX);
  if (!cands.length) return [];
  const side: 0 | 1 = g.home === user ? 0 : 1;
  const mine = buildSimInput(league, user, g.day, g.type, opp, g);
  const theirs = buildSimInput(league, opp, g.day, g.type, user, g);
  const seed = hashString(`${league.id}:${league.season}:${g.day}:${opp}:counter-worth`);
  const total = cands.length + 1;
  let done = 0;
  const play = async (a: typeof mine) => {
    if (done) await opts.between?.();
    if (opts.cancelled?.()) return null;
    const out = Array.from({ length: games }, (_, i) => {
      const rng = new Rng((seed + Math.imul(i + 1, 2654435761)) >>> 0);
      const sides = side === 0 ? [a, theirs] : [theirs, a];
      return xMargin(new GameSim(sides[0], sides[1], { rng, type: g.type, injuries: false, neutral: neutralSite(g) }), side);
    });
    opts.onProgress?.(++done, total);
    return out;
  };
  const base = await play(mine);
  if (!base) return null;
  const out: CounterWorth[] = [];
  for (const c of cands) {
    // the counter in tonight's plan, in place of the plan's item in its group (as Add puts it there)
    const plan = planFor(league, opp, g);
    const items = [...(plan?.items ?? []).filter((x) => itemGroup(x) !== itemGroup(c)), { id: c.id, label: c.label, group: c.group, patch: c.patch }];
    const view: League = { ...league, gamePlans: { ...league.gamePlans, [opp]: { ...plan, oppTid: opp, items, scope: plan?.scope ?? 'next' } } };
    const alt = await play(buildSimInput(view, user, g.day, g.type, opp, g));
    if (!alt) return null;
    const d = alt.map((x, i) => x - base[i]);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, d.length - 1));
    out.push({ id: c.id, pts: Math.round(mean * 10) / 10, se: Math.round((sd / Math.sqrt(d.length)) * 100) / 100 });
  }
  return out;
}
