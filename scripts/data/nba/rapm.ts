// Regularized adjusted plus-minus from lineup stints. Every stint is a row: the five offensive
// players (+1 in their offense columns), the five defenders (+1 in their defense columns), home
// court, and the offense's points per 100 possessions as the target, weighted by possessions
// (and by season recency). Ridge regression shrinks each coefficient toward a prior (zero by
// default, or a box-score estimate), which is what makes RAPM stable enough to use.
import type { Stint } from './pbp';

export interface RapmResult {
  /** Points per 100 possessions added on offense (higher is better). */
  off: Record<number, number>;
  /** Points per 100 possessions prevented on defense (higher is better). */
  def: Record<number, number>;
  /** Weighted offensive and defensive possessions behind each estimate. */
  poss: Record<number, number>;
  home: number;
  intercept: number;
}

export interface RapmInput {
  stints: Stint[];
  weight: number; // season recency weight
}

export function rapm(seasons: RapmInput[], lambda: number, prior?: { off: Record<number, number>; def: Record<number, number> }): RapmResult {
  // index players
  const idx = new Map<number, number>();
  const ids: number[] = [];
  for (const s of seasons) for (const st of s.stints) for (const pid of [...st.off, ...st.def]) if (!idx.has(pid)) {
    idx.set(pid, ids.length);
    ids.push(pid);
  }
  const n = ids.length;
  const m = 2 * n + 1; // offense cols, defense cols, home
  const H = m - 1;
  // weighted mean target
  let sw = 0;
  let swy = 0;
  for (const s of seasons) for (const st of s.stints) {
    if (st.poss <= 0) continue;
    const w = st.poss * s.weight;
    sw += w;
    swy += w * ((100 * st.pts) / st.poss);
  }
  const mu = swy / sw;
  const A = new Float64Array(m * m);
  const b = new Float64Array(m);
  const poss = new Float64Array(n);
  const cols: number[] = [];
  for (const s of seasons) for (const st of s.stints) {
    if (st.poss <= 0) continue;
    const w = st.poss * s.weight;
    const y = (100 * st.pts) / st.poss - mu;
    cols.length = 0;
    for (const pid of st.off) cols.push(idx.get(pid)!);
    for (const pid of st.def) cols.push(n + idx.get(pid)!);
    if (st.home) cols.push(H);
    for (const i of cols) {
      b[i] += w * y;
      const row = i * m;
      for (const j of cols) A[row + j] += w;
    }
    for (const pid of st.off) poss[idx.get(pid)!] += w;
    for (const pid of st.def) poss[idx.get(pid)!] += w;
  }
  // ridge toward the prior (defense coefficients are "points allowed", so the prior flips sign)
  for (let i = 0; i < 2 * n; i++) {
    A[i * m + i] += lambda;
    if (prior) {
      const pid = ids[i % n];
      b[i] += lambda * (i < n ? prior.off[pid] ?? 0 : -(prior.def[pid] ?? 0));
    }
  }
  A[H * m + H] += 1e-6;
  const x = solveSpd(A, b, m);
  const res: RapmResult = { off: {}, def: {}, poss: {}, home: x[H], intercept: mu };
  ids.forEach((pid, i) => {
    res.off[pid] = x[i];
    res.def[pid] = -x[n + i];
    res.poss[pid] = poss[i];
  });
  return res;
}

/** Cholesky solve of a symmetric positive-definite system (row-major, in place). */
function solveSpd(A: Float64Array, b: Float64Array, n: number): Float64Array {
  for (let j = 0; j < n; j++) {
    const rj = j * n;
    let d = A[rj + j];
    for (let k = 0; k < j; k++) d -= A[rj + k] * A[rj + k];
    if (d <= 0) throw new Error(`matrix not positive definite at ${j}`);
    const ljj = Math.sqrt(d);
    A[rj + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      const ri = i * n;
      let s = A[ri + j];
      for (let k = 0; k < j; k++) s -= A[ri + k] * A[rj + k];
      A[ri + j] = s / ljj;
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    const ri = i * n;
    for (let k = 0; k < i; k++) s -= A[ri + k] * y[k];
    y[i] = s / A[ri + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= A[k * n + i] * x[k];
    x[i] = s / A[i * n + i];
  }
  return x;
}
