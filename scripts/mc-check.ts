// Monte Carlo check: times the measurements that play games out many times (the staff's live calls,
// the huddle's play-call options, the night's moves after the final, the counters before a game; see
// mc-scenes.ts) and hashes every number they read, so a speed-up can be proven to change none of them.
// In one thread (Node has no Web Workers): scripts/mc-pool-bench.ts plays the same over the browser's
// worker pool and checks it reads the same.
// Usage: npx tsx scripts/mc-check.ts [--quick]   (prints each part's hash and time, then the total hash)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { playHere } from '../src/core/sim/rollouts';
import { forkSim, playOut } from '../src/state/liveWorth';
import { scenes } from './mc-scenes';

const quick = process.argv.includes('--quick');
const seed = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
const total = createHash('sha256');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const part = (name: string, ms: number, data: unknown) => {
  const h = sha(JSON.stringify(data));
  total.update(`${name}:${h}\n`);
  console.log(`${h.slice(0, 16)}  ${(ms / 1000).toFixed(2).padStart(7)} s  ${name}`);
};

const { scenes: all, liveGame, playTo } = scenes(seed, quick);

// continuations from one spot: what a copy costs, and a copy played out
{
  const sim = playTo(liveGame(101), (s) => s.q === 2 && s.clock < 400);
  const n = quick ? 100 : 400;
  let t0 = performance.now();
  for (let i = 0; i < n; i++) forkSim(sim, i);
  const forkMs = performance.now() - t0;
  t0 = performance.now();
  const ends = Array.from({ length: n }, (_, i) => playOut(forkSim(sim, i), 0));
  const ms = performance.now() - t0;
  console.log(`  fork ${((1000 * forkMs) / n).toFixed(0)} µs, fork + play out ${(ms / n).toFixed(2)} ms (${n} from Q2 ${Math.round(sim.clock)}s)`);
  part('play outs', ms, ends);
}

for (const s of all) {
  const t0 = performance.now();
  const r = await s.run(playHere);
  part(s.name, performance.now() - t0, r);
}
console.log(`mc ${total.digest('hex')}`);
