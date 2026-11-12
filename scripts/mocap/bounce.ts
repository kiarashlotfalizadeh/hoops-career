// The dribbles as the ball's flight will read them (Puppet.dribble): each clip's bounces, how long each is in
// the air (ms of the body's time, a one-off's at the 3D court's half pace) and how high the hand lets it go (ft).
//   tsx scripts/mocap/bounce.ts
import { bounces, CLIPS, I, N, sample } from '../../src/ui/live/court3d/clips';

const P = new Float32Array(N);
for (const id of ['dribble', 'dribbleWalk', 'dribbleRun', 'dribbleBack', 'crossover', 'hesi'] as const) {
  const c = CLIPS[id];
  const k = c.kind === 'shot' ? 2 : c.dur;
  const rows = bounces(c).map((b) => `${Math.round((b.on - b.off) * k)} ms from ${sample(c, b.off, P)[I.by].toFixed(1)} ft${b.cross ? ' (across)' : ''}`);
  console.log(`${id.padEnd(12)} ${c.kind === 'shot' ? '' : `${c.dur} ms loop: `}${rows.join(', ')}`);
}
