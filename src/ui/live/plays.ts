// Play calls in a live game, shared by the Clipboard's Calls tab, the timeout huddle and the player
// sheet: what a call is called, whether the court has drawn the possession that ran it
// yet, and how far the other defense has read each of your sets tonight.

import { useState } from 'react';
import type { League, SetId, Tactics } from '../../core/types';
import type { PlayCall, PossLog } from '../../core/sim/log';
import { CLEAR_OUT, READ_ON_IT, SETS, fitPlayer, setFit, type FitPlayer } from '../../core/sim/sets';
import type { DrawnSide } from './drawn';

const CALL_LABEL: Record<Exclude<PlayCall['kind'], 'iso' | 'set'>, string> = { three: 'Go for 3', two: 'Quick 2', hold: 'Run clock / last shot', foul: 'Foul now' };

/** "Go for 3", "Iso: Brunson", "Floppy: Curry", "Floppy (best fit)". */
export function callLabel(c: PlayCall, nameOf: (pid: number) => string): string {
  if (c.kind === 'iso') return `${CLEAR_OUT.short}: ${nameOf(c.pid)}`;
  if (c.kind === 'set') return c.pid !== undefined ? `${SETS[c.set].short}: ${nameOf(c.pid)}` : `${SETS[c.set].short} (best fit)`;
  return CALL_LABEL[c.kind];
}

/** A call made from the bench: the game, the period it was made in, and how many possessions the sim had played by then. */
export interface Called {
  gid: number;
  call: PlayCall;
  q: number;
  from: number;
}

/** The call still waiting for its possession, as the court shows it: it clears once a possession that ran it (or a new period) comes up. */
export function stillPending(called: Called | null, logs: PossLog[], side: 0 | 1, gid: number): PlayCall | null {
  if (!called || called.gid !== gid) return null;
  return logs.slice(called.from).some((l) => l.call?.t === side || l.q !== called.q) ? null : called.call;
}

/**
 * The live game's play calls: the one waiting (starting from the game's own when the screen opens on
 * a game picked up after the app was closed), and making or cancelling one through the game, which
 * journals it. `quarter` is the period the court shows.
 */
export function useCalls(opts: { gid: number; side: 0 | 1; logs: PossLog[]; quarter: number; initial: PlayCall | null; call: (c: PlayCall) => boolean; cancel: () => void }) {
  const { gid, side, logs, quarter } = opts;
  const [called, setCalled] = useState<Called | null>(() => (opts.initial ? { gid, call: opts.initial, q: quarter, from: logs.length } : null));
  // a game picked up later (another one in this screen) starts from its own waiting call
  const [seen, setSeen] = useState(gid);
  if (seen !== gid) {
    setSeen(gid);
    setCalled(opts.initial ? { gid, call: opts.initial, q: quarter, from: logs.length } : null);
  }
  const pending = stillPending(called, logs, side, gid);
  return {
    pending,
    /** Call a play: false (and nothing changes) when it can't be run. */
    call: (c: PlayCall) => {
      if (!opts.call(c)) return false;
      setCalled({ gid, call: c, q: quarter, from: logs.length });
      return true;
    },
    cancel: () => {
      opts.cancel();
      setCalled(null);
    },
  };
}

export type Calls = ReturnType<typeof useCalls>;

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

/** The sets a player fits, best first (those he fits at least `min`). */
export function setsFor(p: FitPlayer, min = 50): SetId[] {
  return (Object.keys(SETS) as SetId[])
    .map((id) => ({ id, fit: setFit(id, p) }))
    .filter((x) => x.fit >= min)
    .sort((a, b) => b.fit - a.fit)
    .map((x) => x.id);
}
