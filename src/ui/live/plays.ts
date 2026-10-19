// Your sets in a live game, for the break's report and the player sheet: how far the other defense
// has read each one tonight, and your players as the sets weigh them.

import type { League, SetId, Tactics } from '../../core/types';
import { READ_ON_IT, fitPlayer, type FitPlayer } from '../../core/sim/sets';
import type { DrawnSide } from './drawn';

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
