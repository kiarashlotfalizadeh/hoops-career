// What a player is worth on the floor in simulated games: the points per 100 possessions his team
// scores and keeps off the board with him on it, adjusted for the other nine on the floor (ridge-
// regressed plus-minus, RAPM, which Dunks & Threes' EPM is built on). calibrate.ts fits it against
// his projected EPM.
import type { Stint } from '../../src/core/sim/engine';

/** A player's simulated on-court value, points per 100 possessions above the league's, at each end (defense: points kept off). */
export interface OnCourt {
  off: number;
  def: number;
  /** Possessions he played (offense and defense). */
  poss: number;
}

/**
 * Ridge penalty, in possessions: a player with this many is pulled halfway to average. Simulated
 * players see tens of thousands, so it only parts the few who always share the floor.
 */
export const RAPM_LAMBDA = 1500;

/** Solve (A + λI) x = b for a symmetric positive-definite A (Cholesky); the last row and column, the intercept, go unpenalized. */
function ridgeSolve(a: Float64Array, b: Float64Array, n: number, lambda: number): Float64Array {
  for (let i = 0; i < n - 1; i++) a[i * n + i] += lambda;
  // (a token penalty keeps the system definite with no rows)
  a[(n - 1) * n + n - 1] += 1e-6;
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j];
      for (let k = 0; k < j; k++) s -= l[i * n + k] * l[j * n + k];
      l[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / l[j * n + j];
    }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= l[i * n + k] * y[k];
    y[i] = s / l[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k];
    x[i] = s / l[i * n + i];
  }
  return x;
}

/**
 * Each player's offensive and defensive RAPM over `stints` (each weighted by its possessions times
 * `w`, so older batches can count for less): the points per 100 possessions an offense scores as the
 * league's rate plus its five's offensive values minus the defending five's defensive values.
 */
export function rapm(batches: { stints: Stint[]; w: number }[], lambda = RAPM_LAMBDA): Map<number, OnCourt> {
  const ids = [...new Set(batches.flatMap((b) => b.stints.flatMap((s) => [...s.off, ...s.def])))].sort((a, b) => a - b);
  const col = new Map(ids.map((pid, i) => [pid, i]));
  const m = ids.length;
  const n = 2 * m + 1;
  const poss = new Float64Array(m);
  const xtx = new Float64Array(n * n);
  const xty = new Float64Array(n);
  const cs = new Int32Array(11);
  for (const { stints, w: bw } of batches)
    for (const s of stints) {
      if (s.poss <= 0) continue;
      const w = s.poss * bw;
      const y = (100 * s.pts) / s.poss;
      let c = 0;
      for (const p of s.off) cs[c++] = col.get(p)!;
      for (const p of s.def) cs[c++] = m + col.get(p)!;
      cs[c++] = n - 1;
      for (let i = 0; i < c; i++) {
        const ci = cs[i];
        if (ci < n - 1) poss[ci % m] += w;
        xty[ci] += w * y;
        for (let j = 0; j < c; j++) xtx[ci * n + cs[j]] += w;
      }
    }
  const x = ridgeSolve(xtx, xty, n, lambda);
  return new Map(ids.map((pid, i) => [pid, { off: x[i], def: -x[m + i], poss: poss[i] }]));
}
