// A look at a take, as numbers: every `step` seconds, how fast the body is going, how high its
// hips, hands and feet are. Enough to find a stride, a dribble or a release without watching it.
//   tsx scripts/mocap/look.ts 124_05 [step=0.1] [from] [to]
import { readBvh } from './bvh';

const [id, stepArg, fromArg, toArg] = process.argv.slice(2);
const take = readBvh(`data/raw/mocap/${id}.bvh`);
const ix = take.index;
const rest = take.pos[0];
const floor = Math.min(rest[ix.LeftToeBase][1], rest[ix.RightToeBase][1]);
const k = 3.35 / (rest[ix.Hips][1] - floor);
const step = Number(stepArg ?? 0.1);
const n = Math.max(1, Math.round(step / take.dt));
const from = Math.round(Number(fromArg ?? 0) / take.dt) + 1;
const to = Math.min(take.frames, toArg ? Math.round(Number(toArg) / take.dt) + 1 : take.frames);
console.log(`${id}: ${(take.frames * take.dt).toFixed(1)} s, scale ${k.toFixed(3)}`);
console.log('    t  speed  head  hipY   LhY   RhY  LhZ  RhZ   LfY   RfY   Lf-Rf(fwd)');
const f1 = (v: number) => v.toFixed(1).padStart(5);
for (let f = from; f <= to; f += n) {
  const p = take.pos[f];
  const q = take.pos[Math.min(take.frames, f + n)];
  const h = p[ix.Hips];
  const sp = (Math.hypot(q[ix.Hips][0] - h[0], q[ix.Hips][2] - h[2]) * k) / (n * take.dt);
  // the way the hips face: across the two hip joints
  const lx = p[ix.LeftUpLeg][0] - p[ix.RightUpLeg][0];
  const lz = p[ix.LeftUpLeg][2] - p[ix.RightUpLeg][2];
  const yaw = Math.atan2(-lz, lx);
  const fwd = (j: number) => ((p[j][0] - h[0]) * Math.sin(yaw) + (p[j][2] - h[2]) * Math.cos(yaw)) * k;
  const y = (j: number) => (p[j][1] - floor) * k;
  console.log(
    `${((f - 1) * take.dt).toFixed(2).padStart(5)} ${f1(sp)} ${f1((yaw * 180) / Math.PI)} ${f1(y(ix.Hips))} ${f1(y(ix.LeftHand))} ${f1(y(ix.RightHand))} ${f1(fwd(ix.LeftHand))}${f1(fwd(ix.RightHand))} ${f1(y(ix.LeftFoot))} ${f1(y(ix.RightFoot))} ${f1(fwd(ix.LeftFoot) - fwd(ix.RightFoot))}`,
  );
}
