// A survey of takes, a line every `step` seconds: speed ahead and aside (ft a second, by the way the
// hips face), how fast he turns (degrees a second), his hips, each hand and each foot (ft off the floor).
// Enough to say what a take is and where its moves are.
//   tsx scripts/mocap/survey.ts 102_13 102_14 [step=0.25]
import { readBvh } from './bvh';

const args = process.argv.slice(2);
const step = Number(args.find((a) => a.startsWith('step='))?.slice(5) ?? 0.25);
for (const id of args.filter((a) => !a.includes('='))) {
  const take = readBvh(`data/raw/mocap/${id}.bvh`);
  const ix = take.index;
  const rest = take.pos[0];
  const floor = Math.min(rest[ix.LeftToeBase][1], rest[ix.RightToeBase][1]);
  const k = 3.35 / (rest[ix.Hips][1] - floor);
  const n = Math.max(1, Math.round(step / take.dt));
  const rows: string[] = [];
  for (let f = 1; f + n <= take.frames; f += n) {
    const p = take.pos[f];
    const q = take.pos[f + n];
    const yaw = (r: typeof p) => Math.atan2(-(r[ix.LeftUpLeg][2] - r[ix.RightUpLeg][2]), r[ix.LeftUpLeg][0] - r[ix.RightUpLeg][0]);
    const y0 = yaw(p);
    const dx = ((q[ix.Hips][0] - p[ix.Hips][0]) * k) / (n * take.dt);
    const dz = ((q[ix.Hips][2] - p[ix.Hips][2]) * k) / (n * take.dt);
    const vf = dx * Math.sin(y0) + dz * Math.cos(y0);
    const vs = dx * Math.cos(y0) - dz * Math.sin(y0);
    let dy = yaw(q) - y0;
    dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
    const y = (j: number) => ((p[j][1] - floor) * k).toFixed(1);
    rows.push(
      `${((f - 1) * take.dt).toFixed(2)}:${vf.toFixed(0)}/${vs.toFixed(0)} t${((dy * 57.3) / (n * take.dt)).toFixed(0)} h${y(ix.Hips)} L${y(ix.LeftHand)} R${y(ix.RightHand)} f${y(ix.LeftFoot)}/${y(ix.RightFoot)}`,
    );
  }
  console.log(`${id} ${(take.frames * take.dt).toFixed(1)}s\n  ${rows.join(' | ')}`);
}
