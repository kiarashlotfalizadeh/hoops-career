// A man standing off the ball with the play live doesn't stand on one spot: he slides a step or two along the arc
// round the basket to keep a lane to the ball open, stays there a while, and slides again; the man guarding him goes
// with him, a beat late and not all the way. The plan (choreo.ts) gives each man his spot; this is where he is round
// it, a function of who he is and how far into the possession it is: the same every time the possession is played.
import { hash } from './puppet';

/**
 * How long he keeps a spot before his next slide (the possession's ms; his own, from 0.8 to 1.25 of it), and the
 * share of that he spends getting to it: GO of it for the longest slide there is, less for a shorter one (never under
 * GO_LEAST of that), so he steps across at a shuffle and never at a walk: his own time is twice the possession's, and
 * the fastest of it is under 2.5 ft a second, where a man standing ready would break into a gait.
 */
const CELL_MS = 1400;
const GO = 0.85;
const GO_LEAST = 0.25;
/** How far a slide may take him off his spot: along the arc round the rim, and to or from it (ft). */
export const ALONG = 1.25;
export const OUT = 0.5;
/** Of his slides, this share are none: he stays where the last one left him. */
const STAY = 0.3;
/** Off his spot he comes over this long from the start of his wait, and is back on it this long before its end (the possession's ms). */
export const DRIFT_IN = 380;
export const DRIFT_OUT = 460;
/** The man guarding him goes this much of the way with him. */
export const SHADOW = 0.72;

const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/** Where his `k`th slide leaves him: [along the arc, out from the rim], ft. One that is none is where the one before left him. */
function knot(pid: number, seed: number, k: number, out: [number, number]): [number, number] {
  let at = k;
  for (let back = 0; back < 3 && hash(pid * 31 + seed, 9100 + at) < STAY; back++) at--;
  const a = hash(pid * 31 + seed, 9300 + at) * 2 - 1;
  const r = hash(pid * 31 + seed, 9500 + at) * 2 - 1;
  // (more often well to one side or the other than a shuffle on the spot)
  out[0] = Math.sign(a) * (0.35 + 0.65 * Math.abs(a)) * ALONG;
  out[1] = r * OUT;
  return out;
}

const A: [number, number] = [0, 0];
const B: [number, number] = [0, 0];

/**
 * Where `pid` is off his spot `t` ms into the possession `seed`: [along the arc round the rim, out from it], ft.
 * He is on a spot most of the time, and between two of them for the first part of each wait.
 */
export function slideAt(pid: number, seed: number, t: number, out: [number, number]): [number, number] {
  const cell = CELL_MS * (0.8 + 0.45 * hash(pid, 9001));
  const at = (t + cell * hash(pid * 31 + seed, 9002)) / cell;
  const k = Math.floor(at);
  knot(pid, seed, k - 1, A);
  knot(pid, seed, k, B);
  const far = Math.hypot(B[0] - A[0], B[1] - A[1]) / Math.hypot(2 * ALONG, 2 * OUT);
  const w = smooth(clamp01((at - k) / (GO * Math.max(GO_LEAST, far))));
  out[0] = A[0] + (B[0] - A[0]) * w;
  out[1] = A[1] + (B[1] - A[1]) * w;
  return out;
}

/** How much of his slide he has, `t` ms into the possession, waiting from `from` to `to`: none at either end of it. */
export function waitShare(t: number, from: number, to: number): number {
  return smooth(clamp01((t - from) / DRIFT_IN)) * smooth(clamp01((to - t) / DRIFT_OUT));
}
