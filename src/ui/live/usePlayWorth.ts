// Choices in a live game, measured from where the game stands: each one's rest of the game played
// CHOICE_GAMES times on the same seeds against the first (state/liveWorth.ts), in the worker, while the
// sheet asking for it is up. Only the last minutes are played, so it takes a second or two.
//
// The late play call, measured at the last possession of close games (scratch
// round/gameday/late.mts, 2026-10-25: 287 spots in six teams' games, each option read on 400 games and
// again on 1,600 fresh ones): the closer's isolation, listed first, came out worth nothing against no
// call (−0.4 points of win chance), his best sets +3.9, the best set for one of the others +4.5;
// picking by the 400-game reading gained +5.1 (the best the 1,600 could pick: +5.7), and in 136 of
// the 287 spots the best reading was too close to call.
import { useEffect, useMemo, useState } from 'react';
import { cancelLive, measureLive, nextLiveId } from '../../state/simClient';
import { clearOf, type ChoiceWorth, type LiveChoice } from '../../state/liveWorth';
import type { LiveGame } from '../../state/live';
import { crunchTime } from '../../core/analysis/winProb';
import type { PlayOption } from './plays';

/** One choice's reading against the first: its win chance and margin, and whether it says anything. */
export interface PlayReading {
  /** Points of win chance (0-1) against the first choice. */
  win: number;
  winSe: number;
  pts: number;
  /** Clear of even (SAY_Z standard errors): inside it, too close to say. */
  clear: boolean;
}

/** The readings of `choices[1..]` against `choices[0]` from where `lg` stands, null while they're measured or with no `key` (nothing to measure). */
function useChoiceWorth(lg: LiveGame | null, choices: LiveChoice[], key: string): PlayReading[] | null {
  const [got, setGot] = useState<{ key: string; readings: PlayReading[] } | null>(null);
  useEffect(() => {
    if (!key || !lg) return;
    let live = true;
    const id = nextLiveId();
    measureLive(lg.sim, lg.userSide, choices, id)
      .then((r: ChoiceWorth[] | null) => {
        if (!live || !r) return;
        setGot({ key, readings: r.slice(1).map((x) => ({ win: x.win, winSe: x.winSe, pts: x.pts, clear: clearOf(x.win, x.winSe) })) });
      })
      .catch((e: unknown) => console.warn('The choice could not be measured:', e));
    return () => {
      live = false;
      cancelLive(id);
    };
    // (the key is the spot and the choices: the game object and the list are read with it)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => (got && got.key === key ? got.readings : null), [got, key]);
}

/** The late play call's options from where `lg` stands, against no call (in `plays` order), or null while they're measured or when `on` is false. */
export function usePlayWorth(lg: LiveGame | null, plays: PlayOption[], on: boolean): PlayReading[] | null {
  // (a spot: the possessions played, and the options on offer from it)
  const key = lg && on && plays.length ? `play:${lg.game.gid}:${lg.steps}:${plays.map((p) => `${p.id}-${p.pid}`).join(',')}` : '';
  const choices = useMemo((): LiveChoice[] => [{ kind: 'noPlay' }, ...plays.map((p): LiveChoice => ({ kind: 'play', set: p.id, pid: p.pid }))], [plays]);
  return useChoiceWorth(lg, choices, key);
}

/** Whether a sub is measured now (useSubWorth): crunch time in the game as it stands. */
export const measuresSubs = (lg: LiveGame | null) => !!lg && !lg.over && crunchTime(lg.sim.q, lg.sim.clock, lg.sim.T[0].score - lg.sim.T[1].score);

/**
 * Each sub for `pid` (one of yours on the floor) against keeping him in, from where `lg` stands, in
 * `ins` order: measured in crunch time only (the last six minutes of a game still in reach, when the
 * question is his legs or his fouls against the man who'd come in, and the rest of the game is a few
 * minutes of the closing five). Null otherwise, or while they're measured.
 */
export function useSubWorth(lg: LiveGame | null, pid: number, ins: number[], on: boolean): PlayReading[] | null {
  const key = lg && on && measuresSubs(lg) && ins.length ? `sub:${lg.game.gid}:${lg.steps}:${pid}:${ins.join(',')}` : '';
  const choices = useMemo((): LiveChoice[] => [{ kind: 'none' }, ...ins.map((x): LiveChoice => ({ kind: 'sub', out: pid, in: x }))], [pid, ins]);
  return useChoiceWorth(lg, choices, key);
}
