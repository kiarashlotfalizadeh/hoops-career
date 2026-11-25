// "Coach it or sim it?": the question a decisive playoff game is owed (calls.ts bigGameTonight), asked
// once a game: when a long sim stops on its morning, and when a sim is started on it. Until it's
// answered the sim that would play the game waits; "Sim it" lets that sim go on.
import { useSyncExternalStore } from 'react';
import type { League } from '../../core/types';
import { bigGameTonight, type BigGame } from '../../core/league/calls';
import type { FlowAction } from '../flow';

export interface BigGameAsk {
  big: BigGame;
  /** The sim that was asked for on the game's morning: "Sim it" runs it (none: the sim had stopped here, and "Sim it" plays the day). */
  then?: FlowAction;
}

let cur: BigGameAsk | null = null;
const listeners = new Set<() => void>();
/** The games already asked about and answered this session, by league and game. */
const answered = new Set<string>();

const tell = () => listeners.forEach((f) => f());
const keyOf = (l: League, gid: number) => `${l.id}:${l.season}:${gid}`;

/**
 * Raise the question for tonight's game, if it's a decisive one that hasn't been answered. True when
 * it was raised (the caller's sim waits for the answer).
 */
export function askBigGame(league: League, then?: FlowAction): boolean {
  const big = bigGameTonight(league);
  if (!big || answered.has(keyOf(league, big.gid))) return false;
  cur = { big, ...(then ? { then } : {}) };
  tell();
  return true;
}

/** The question is answered (either way) or put off: put off, it's asked again at the next sim. */
export function closeBigGame(league: League | null, answer: boolean) {
  if (cur && league && answer) answered.add(keyOf(league, cur.big.gid));
  cur = null;
  tell();
}

export const useBigGameAsk = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => void listeners.delete(f);
    },
    () => cur,
  );
