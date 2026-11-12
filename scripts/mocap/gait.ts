// A puppet run in a straight line at a speed, as numbers: each frame's clip, how its trunk sits and where its
// feet and hands are in his own frame. For checking a gait without watching it.
//   tsx scripts/mocap/gait.ts [ft a second=10] [every ms=50]
import { I } from '../../src/ui/live/court3d/clips';
import { bodyOf, J, Puppet } from '../../src/ui/live/court3d/puppet';

const sp = Number(process.argv[2] ?? 10);
const every = Number(process.argv[3] ?? 50);
const p = new Puppet(bodyOf(78, 215));
const f2 = (v: number) => v.toFixed(2).padStart(6);
console.log('    t clip     lean  twist   nod    hipY chestZ headZ |  Lz    Ly    Rz    Ry  | flZ   flY  frZ   frY  pitch');
for (let t = 0; t < 2400; t += 10) {
  p.update({ x: 0, z: (t * sp) / 1000, yaw: 0, act: 'move', ms: t, dur: 2400, ball: false, who: 7 }, 10);
  p.arms(null);
  const j = p.j;
  if (t >= 1500 && t % every === 0)
    console.log(
      `${String(t).padStart(5)} ${p.clip.padEnd(7)} ${f2(p.pose[I.lean])} ${f2(p.pose[I.twist])} ${f2(p.pose[I.nod])}  ${f2(j[J.hips * 3 + 1])} ${f2(j[J.chest * 3 + 2])} ${f2(j[J.head * 3 + 2])} | ${f2(j[J.hl * 3 + 2])}${f2(j[J.hl * 3 + 1])}${f2(j[J.hr * 3 + 2])}${f2(j[J.hr * 3 + 1])} | ${f2(j[J.fl * 3 + 2])}${f2(j[J.fl * 3 + 1])}${f2(j[J.fr * 3 + 2])}${f2(j[J.fr * 3 + 1])} ${f2(p.feet[0].pitch)}`,
    );
}
