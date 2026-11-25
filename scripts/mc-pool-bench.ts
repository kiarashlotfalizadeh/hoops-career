// The Monte Carlo measurements (mc-scenes.ts) in a browser: each played in one thread and over the
// rollout pool (state/simPool.ts), timed, and checked to read exactly the same. Run from the dev
// server's page console:
//   const m = await import('/scripts/mc-pool-bench.ts'); console.table(await m.bench());
import { loadSeed } from '../src/data/seedLoader';
import { playHere } from '../src/core/sim/rollouts';
import { playPooled, poolSize, warmPool } from '../src/state/simPool';
import { scenes } from './mc-scenes';

export async function bench(quick = false) {
  const seed = await loadSeed();
  const { scenes: all } = scenes(seed, quick);
  warmPool();
  const rows: { scene: string; oneThread: string; pool: string; speedup: string; same: boolean }[] = [];
  for (const s of all) {
    let t0 = performance.now();
    const a = JSON.stringify(await s.run(playHere));
    const one = performance.now() - t0;
    t0 = performance.now();
    const b = JSON.stringify(await s.run(playPooled));
    const pool = performance.now() - t0;
    rows.push({ scene: s.name, oneThread: `${(one / 1000).toFixed(2)} s`, pool: `${(pool / 1000).toFixed(2)} s`, speedup: `${(one / pool).toFixed(1)}×`, same: a === b });
  }
  return { workers: poolSize(), cores: navigator.hardwareConcurrency, rows };
}
