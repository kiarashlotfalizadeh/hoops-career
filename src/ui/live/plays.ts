// Your plays in a live game: the late play call (built around your closer: his isolation, the sets he
// fits best, then one for someone else), how far the other defense has read each set tonight, and your
// players as the sets weigh them.

import type { CallId, League, SetId, Tactics } from '../../core/types';
import { READ_ON_IT, SET_IDS, SET_K, fitPlayer, setFit, type FitPlayer } from '../../core/sim/sets';
import type { DrawnSide } from './drawn';

/** A play the late call offers: a set or the clear-out isolation, and the player it's for. */
export interface PlayOption {
  id: CallId;
  pid: number;
}

/** Sets the late call offers for the player it's built around, after his isolation. */
const STAR_SETS = 2;

/**
 * The plays you can call late, built around `star` (your go-to while he's on the floor, else the one
 * the ball finds at the end: GameSim.closer): his clear-out isolation first, then the sets he fits
 * best (SET_K.fit and up, in your package or not: a call runs whatever you call), then the best set
 * for one of the other four that isn't one of his. Each runs on your next trip up the floor.
 */
export function playOptions(league: League, five: number[], t: Tactics, star: number): PlayOption[] {
  const fp = fitPlayers(league, five, t);
  const me = fp.find((p) => p.pid === star);
  if (fp.length < 5 || !me) return [];
  const fits = (p: FitPlayer) => SET_IDS.map((id) => ({ id, pid: p.pid, fit: setFit(id, p) })).filter((x) => x.fit >= SET_K.fit);
  const mine = fits(me)
    .sort((a, b) => b.fit - a.fit)
    .slice(0, STAR_SETS);
  const other = fp
    .filter((p) => p !== me)
    .flatMap(fits)
    .filter((x) => !mine.some((m) => m.id === x.id))
    .sort((a, b) => b.fit - a.fit || a.pid - b.pid)[0];
  return [{ id: 'iso', pid: star }, ...[...mine, ...(other ? [other] : [])].map(({ id, pid }) => ({ id, pid }))];
}

/** How far the defense has read a set tonight, from the court's drawn game: its runs, and a few words on it. */
export function readStatus(side: Pick<DrawnSide, 'sets'>, id: SetId): { runs: number; read: number; onIt: boolean; text: string } {
  const r = side.sets.find((x) => x.id === id);
  if (!r?.runs) return { runs: 0, read: 0, onIt: false, text: 'Not run yet' };
  const onIt = r.read >= READ_ON_IT;
  return { runs: r.runs, read: r.read, onIt, text: `Run ${r.runs}×${onIt ? ", they're on it" : r.read > 0 ? ", they've seen it" : ''}` };
}

/** Your players as the sets weigh them: skills, the role your tactics give them, size. */
export function fitPlayers(league: League, pids: number[], t: Tactics): FitPlayer[] {
  return pids.flatMap((pid) => (league.players[pid] ? [fitPlayer(league.players[pid], t)] : []));
}
