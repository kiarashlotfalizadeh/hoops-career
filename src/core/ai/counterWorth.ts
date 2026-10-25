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
//
// Since the big decisions were made to matter (2026-10: see K.matchup), a counter aimed right is worth
// two points a game and more against the opponent it's for, and a wrong one costs as much (over the
// real league each big decision's true worth spreads about ±1.2 a game from one opponent to the next),
// so a reading is mostly the counter and partly noise. A counter that reads promising is still played
// again on fresh seeds, and every reading is shrunk toward even by how much of it can be noise
// (WORTH_SPREAD against its standard error) before it's shown, called a gain or counted in the
// projection. (Before, the knobs were small, true worth spread ±0.4, and most readings were noise.) The seeds are the season's for this opponent, not the
// day's: measured again with nothing changed, it reads the same; with something changed, the same
// games show what the change did.
// Pure: reads the league.

import type { GamePlan, League, Player, ScheduledGame, Team } from '../types';
import { GameSim } from '../sim/engine';
import { Rng, hashString } from '../random';
import { buildSimInput, neutralSite } from '../league/games';
import { itemGroup, planFor } from '../league/gamePlans';
import { counterCandidates, type Candidate } from './advisor';

/** Games each configuration is played (the plan as it stands, and each counter). */
export const WORTH_GAMES = 240;
/** Counters measured: the first the rules draft (the ones the numbers back first). */
export const WORTH_MAX = 5;
/** How far counters' true worth spreads either side of even, in points a game (what a reading is shrunk toward even by). */
export const WORTH_SPREAD = 1.2;
/** A first reading this many standard errors from even is played again on fresh seeds before it's believed. */
export const WORTH_RECHECK_Z = 1.2;
/**
 * Points a game a counter's shrunk worth must reach to read as a gain (or a cost): with a reading's
 * noise at about ±0.45 (shrunk by about a seventh), a counter worth nothing gets there about one time
 * in a hundred, one worth a point a game nearly always, and "Even" is the honest word for the rest.
 */
export const WORTH_MIN = 0.5;

export interface CounterWorth {
  id: string;
  /** Points a game it adds to the margin (under 0: costs), shrunk toward even by its noise: what's shown and counted. */
  pts: number;
  /** The reading as measured, before the shrinking. */
  raw: number;
  /** The reading's standard error. */
  se: number;
}

/** A reading `raw` with standard error `se`, shrunk toward even by the share of it that can be noise. */
export const shrinkWorth = (raw: number, se: number) => (raw * WORTH_SPREAD ** 2) / (WORTH_SPREAD ** 2 + se ** 2);

/**
 * One change measured over several games (each game's reading from measureChanges, weighted `w`, the
 * weights adding to 1: a game's share of the stretch): the readings' weighted mean and its standard
 * error, shrunk toward even as one reading. So five games of 60 paired games each read about as
 * close as one of 240, and the number is about the stretch, not one opponent.
 */
export function poolWorth(id: string, parts: { w: number; raw: number; se: number }[]): CounterWorth {
  const raw = parts.reduce((a, p) => a + p.w * p.raw, 0);
  const se = Math.sqrt(parts.reduce((a, p) => a + (p.w * p.se) ** 2, 0));
  return { id, pts: Math.round(shrinkWorth(raw, se) * 10) / 10, raw: Math.round(raw * 100) / 100, se: Math.round(se * 100) / 100 };
}

/** What a measured counter reads as: a gain, a cost, or too close to even to say (its shrunk worth against WORTH_MIN). */
export const worthCall = (w: Pick<CounterWorth, 'pts'>): 'gain' | 'cost' | 'even' => (w.pts >= WORTH_MIN ? 'gain' : w.pts <= -WORTH_MIN ? 'cost' : 'even');

/**
 * A game's margin for the user's side by its shot value: expected points from the field (every shot
 * the defense fouled included, made or not: an and-one's chance counts whether it fell) plus free
 * throws made. Without the fouled misses, a change that draws fouls read as a cost: the assistant's
 * adjustments at the breaks measured −0.6 a game that way and −0.1 ± 0.1 in points (round/gameday).
 */
function xMargin(sim: GameSim, side: 0 | 1): number {
  const r = sim.simToEnd();
  const x = r.xShots;
  const f = sim.xFouledMiss;
  const v = x ? [x[0].pts + f[0] + r.home.t.ftm, x[1].pts + f[1] + r.away.t.ftm] : [r.home.pts, r.away.pts];
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
 * A change to measure, as a patch over the league: teams' and players' fields to replace (a team's
 * tactics or rotation, a player kept out with `injury`) and game plans to put in. Plain data, so a
 * measurement can run in the worker.
 */
export interface LeagueChange {
  id: string;
  teams?: Record<number, Partial<Team>>;
  players?: Record<number, Partial<Player>>;
  gamePlans?: Record<number, GamePlan>;
}

/** The league with `c` laid over it (a view: the league itself isn't changed). */
export function withChange(league: League, c: LeagueChange): League {
  const teams = c.teams ? league.teams.map((t) => (c.teams![t.tid] ? { ...t, ...c.teams![t.tid] } : t)) : league.teams;
  let players = league.players;
  if (c.players) {
    players = { ...league.players };
    for (const [pid, patch] of Object.entries(c.players)) players[+pid] = { ...players[+pid], ...patch };
  }
  const gamePlans = c.gamePlans ? { ...league.gamePlans, ...c.gamePlans } : league.gamePlans;
  return { ...league, teams, players, gamePlans };
}

type WorthGame = Pick<ScheduledGame, 'home' | 'away' | 'day' | 'type' | 'seriesId' | 'cup'> & Partial<Pick<ScheduledGame, 'gid'>>;

/**
 * What each change is worth to the user's next game against `opp` (`game`, else a home game on
 * today's date), measured over paired games: the game as it stands and with the change, game for game
 * on the same seeds (the season's for this opponent), in points a game by shot value. Only the user's
 * side is rebuilt with a change; the opponent plays as it would. A reading past WORTH_RECHECK_Z is
 * played again on fresh seeds, and every reading is shrunk toward even (shrinkWorth). The tool behind
 * every number the staff shows before a choice: counters, a tactics edit, a rest night.
 */
export async function measureChanges(league: League, opp: number, changes: LeagueChange[], game?: WorthGame, opts: WorthOpts = {}): Promise<CounterWorth[] | null> {
  const games = opts.games ?? WORTH_GAMES;
  const user = league.userTid;
  if (!changes.length) return [];
  const g = game ?? { home: user, away: opp, day: league.day, type: 'regular' as const, seriesId: undefined, cup: undefined };
  const side: 0 | 1 = g.home === user ? 0 : 1;
  const mine = buildSimInput(league, user, g.day, g.type, opp, g);
  const theirs = buildSimInput(league, opp, g.day, g.type, user, g);
  // (the season's seeds for this opponent: the same games every time it's measured)
  const seed = hashString(`${league.id}:${league.season}:${opp}:counter-worth`);
  let total = changes.length + 1;
  let done = 0;
  const play = async (a: typeof mine, batch = 0) => {
    if (done) await opts.between?.();
    if (opts.cancelled?.()) return null;
    const out = Array.from({ length: games }, (_, i) => {
      const rng = new Rng((seed + Math.imul(batch * games + i + 1, 2654435761)) >>> 0);
      const sides = side === 0 ? [a, theirs] : [theirs, a];
      return xMargin(new GameSim(sides[0], sides[1], { rng, type: g.type, injuries: false, neutral: neutralSite(g) }), side);
    });
    opts.onProgress?.(++done, total);
    return out;
  };
  const base = await play(mine);
  if (!base) return null;
  let base2: number[] | null = null;
  const reading = (d: number[]) => {
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, d.length - 1));
    return { mean, se: sd / Math.sqrt(d.length) };
  };
  const out: CounterWorth[] = [];
  for (const c of changes) {
    const input = buildSimInput(withChange(league, c), user, g.day, g.type, opp, g);
    const alt = await play(input);
    if (!alt) return null;
    let d = alt.map((x, i) => x - base[i]);
    let r = reading(d);
    // promising either way: played again on fresh seeds, the two batches together (a reading that only ran high falls back)
    if (Math.abs(r.mean) > WORTH_RECHECK_Z * r.se) {
      total += base2 ? 1 : 2;
      base2 ??= await play(mine, 1);
      if (!base2) return null;
      const alt2 = await play(input, 1);
      if (!alt2) return null;
      d = [...d, ...alt2.map((x, i) => x - base2![i])];
      r = reading(d);
    }
    const se = Math.round(r.se * 100) / 100;
    out.push({ id: c.id, pts: Math.round(shrinkWorth(r.mean, r.se) * 10) / 10, raw: Math.round(r.mean * 10) / 10, se });
  }
  return out;
}

/**
 * The staff's counters against `opp` (the first WORTH_MAX the rules draft), each measured over paired
 * games of the user's next game against them (`game`, else a home game on today's date): its points
 * a game over the plan as it stands.
 */
export async function counterWorth(league: League, opp: number, game?: WorthGame, opts: WorthOpts = {}): Promise<CounterWorth[] | null> {
  const user = league.userTid;
  const g = game ?? { home: user, away: opp, day: league.day, type: 'regular' as const, seriesId: undefined, cup: undefined };
  const cands: Candidate[] = counterCandidates(league, user, opp).slice(0, WORTH_MAX);
  // each counter in tonight's plan, in place of the plan's item in its group (as Add puts it there)
  const plan = planFor(league, opp, g);
  const changes = cands.map((c): LeagueChange => {
    const items = [...(plan?.items ?? []).filter((x) => itemGroup(x) !== itemGroup(c)), { id: c.id, label: c.label, group: c.group, patch: c.patch }];
    return { id: c.id, gamePlans: { [opp]: { ...plan, oppTid: opp, items, scope: plan?.scope ?? 'next' } } };
  });
  return measureChanges(league, opp, changes, g, opts);
}
