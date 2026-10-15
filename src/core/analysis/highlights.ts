// The night's highlights, picked from the possession logs of a live game: the plays a broadcast
// would cut to (dunks, threes, and-ones, blocks and steals, worth more late in a close game, and
// the shot that won it most of all), a few of the other team's among them, shown in the order they
// happened.

import type { PossLog } from '../sim/log';

export interface Highlight {
  /** Index into the game's logs. */
  i: number;
  /** How much the play is worth showing. */
  score: number;
  /** The side that made the play (0 home, 1 away). */
  side: 0 | 1;
}

/** Most plays in a reel. */
export const REEL_MAX = 8;

/** A dunk or an alley-oop, as the play-by-play called it. */
const isDunk = (d?: string) => !!d && /dunk|alley-oop/.test(d);

/**
 * How much one possession is worth showing (0: nothing to show), for the side that made the play:
 * the scoring team on a make, the defense on a block or a steal. `before` is the score it started from.
 */
export function playValue(log: PossLog, before: [number, number]): { score: number; side: 0 | 1 } {
  const off = log.off;
  const def = (1 - off) as 0 | 1;
  let best = { score: 0, side: off as 0 | 1 };
  const take = (score: number, side: 0 | 1) => {
    if (score > best.score) best = { score, side };
  };
  const shots = log.steps.filter((s) => s.k === 'shot');
  const last = shots[shots.length - 1];
  for (let j = 0; j < log.steps.length; j++) {
    const st = log.steps[j];
    if (st.k === 'shot' && st.made) {
      let v = st.v === 3 ? 2 : isDunk(st.d) ? 2.4 : 1;
      if (st.d && /step-back|alley-oop|reverse/.test(st.d)) v += 0.6;
      // and one
      if (log.steps[j + 1]?.k === 'foul') v += 1.4;
      take(v, off);
    } else if (st.k === 'block') take(2, def);
    else if (st.k === 'steal') take(1.6, def);
  }
  if (best.score === 0) return best;
  const margin = before[0] - before[1];
  const lead = off === 0 ? margin : -margin;
  const close = Math.abs(margin) <= 6;
  const late = log.q >= 4 && log.clockEnd <= 120;
  // late in a close game every play counts double; a shot at the buzzer, and one that wins it, most of all
  if (late && close) best.score *= 2;
  if (last?.made && log.clockEnd <= 0.05) best.score += log.q >= 4 && lead <= 0 && lead + log.pts > 0 ? 12 : 5;
  else if (late && last?.made && lead <= 0 && lead + log.pts > 0) best.score += 3;
  return best;
}

/**
 * The night's reel: up to `max` plays, at most three a period, the user's team favoured (its plays
 * count 30% more) but the other team's big ones in it too, in the order they happened.
 */
export function pickHighlights(logs: PossLog[], userSide: 0 | 1, max = REEL_MAX): Highlight[] {
  const all: Highlight[] = [];
  let before: [number, number] = [0, 0];
  logs.forEach((log, i) => {
    const v = playValue(log, before);
    if (v.score > 0) all.push({ i, score: v.score * (v.side === userSide ? 1.3 : 1), side: v.side });
    before = log.score;
  });
  const perQ = new Map<number, number>();
  const picked: Highlight[] = [];
  for (const h of [...all].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (picked.length >= max) break;
    const q = logs[h.i].q;
    if ((perQ.get(q) ?? 0) >= 3) continue;
    perQ.set(q, (perQ.get(q) ?? 0) + 1);
    picked.push(h);
  }
  return picked.sort((a, b) => a.i - b.i);
}

/**
 * The reel of a game played live, to keep in the save (League.reel): its highlights with the score
 * each started from, without their play-by-play lines (the court doesn't read them).
 */
export function reelOf(gid: number, logs: PossLog[], userSide: 0 | 1): { gid: number; plays: { log: PossLog; before: [number, number] }[] } {
  return {
    gid,
    plays: pickHighlights(logs, userSide).map((h) => ({ log: { ...logs[h.i], lines: [] }, before: h.i > 0 ? ([...logs[h.i - 1].score] as [number, number]) : [0, 0] })),
  };
}
