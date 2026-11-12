// The dribbles as the ball's flight reads them (Puppet.dribble, Puppet.bounced), as numbers. For each way of
// dribbling and each hand, a puppet is run with the ball and its hand is watched against it: how long a bounce
// is in the air (the body's ms) and from how high, how far the palm is from the ball as it takes it and as it
// lets it go (ft: 0 is on it), how far the ball is inside the hand at worst while it flies, and the biggest
// jump the ball makes in a frame (ft: a pop).
//   tsx scripts/mocap/bounce.ts
import { BALL_R, bodyOf, J, Puppet, type Drive, type V3 } from '../../src/ui/live/court3d/puppet';

const PALM = BALL_R + 0.12;
const CASES: [string, (t: number) => Partial<Drive>][] = [
  ['standing', () => ({ act: 'dribble' })],
  ['walking 5', (t) => ({ act: 'dribble', z: t * 0.005 })],
  ['running 20', (t) => ({ act: 'dribble', z: t * 0.02 })],
  ['backing 5', (t) => ({ act: 'dribble', z: -t * 0.005 })],
  // (a drive from a stand: it opens with the crossover)
  ['drive', (t) => (t < 3000 ? { act: 'dribble' } : { act: 'drive', ms: (t - 3000) / 2, z: (t - 3000) * 0.012 })],
];
const f2 = (v: number) => v.toFixed(2);
interface Stat {
  flights: number[];
  tops: number[];
  meet: number;
  part: number;
  inside: number;
  pop: number;
}
for (const [name, plan] of CASES)
  for (const left of [false, true]) {
    const p = new Puppet(bodyOf(78, 215));
    p.lefty = left;
    const ball: V3 = { x: 0, y: 0, z: 0 };
    const was: V3 = { x: 0, y: 0, z: 0 };
    let phase = 1;
    let off = 0;
    let offClip = '';
    let px = 0;
    let pz = 0;
    const stats = new Map<string, Stat>();
    for (let t = 0; t < 8000; t += 1000 / 60) {
      const d = { x: 0, z: 0, yaw: 0, act: 'dribble', ms: t / 2, dur: 99999, ball: true, who: 7, ...plan(t) } as Drive;
      p.update(d, 1000 / 120, 1000 / 60);
      p.bounced(p.carry(ball));
      p.arms(ball);
      const dr = p.dribble;
      const now = dr?.phase ?? 1;
      if (t > 1500) {
        let st = stats.get(p.clip);
        if (!st) stats.set(p.clip, (st = { flights: [], tops: [], meet: 0, part: 0, inside: 0, pop: 0 }));
        const h = (dr?.hand ?? (p.lefty ? 1 : -1)) > 0 ? J.hl : J.hr;
        const hand = p.world(p.j[h * 3], p.j[h * 3 + 1], p.j[h * 3 + 2], { x: 0, y: 0, z: 0 });
        // (the palm sits PALM above the ball's middle when it is on it)
        const gap = Math.hypot(hand.x - ball.x, hand.y - PALM - ball.y, hand.z - ball.z);
        if (now < 1 && phase >= 1) {
          off = t;
          offClip = p.clip;
          st.tops.push(dr!.push.y);
          st.part = Math.max(st.part, gap);
        }
        if (now >= 1 && phase < 1 && offClip === p.clip) {
          st.flights.push(t - off);
          st.meet = Math.max(st.meet, gap);
        }
        if (now < 1) st.inside = Math.max(st.inside, BALL_R - Math.hypot(hand.x - ball.x, hand.y - ball.y, hand.z - ball.z));
        // (less how far he carried it with him)
        st.pop = Math.max(st.pop, Math.hypot(ball.x - was.x - (p.x - px), ball.y - was.y, ball.z - was.z - (p.z - pz)));
      }
      phase = now;
      was.x = ball.x;
      was.y = ball.y;
      was.z = ball.z;
      px = p.x;
      pz = p.z;
    }
    for (const [clip, st] of stats)
      console.log(
        `${name.padEnd(11)} ${left ? 'L' : 'R'} ${clip.padEnd(11)} ${String(st.flights.length).padStart(2)} bounces  ${st.flights.length ? `${Math.round(Math.min(...st.flights))}..${Math.round(Math.max(...st.flights))}` : '-'} ms from ${f2(st.tops.reduce((a, b) => a + b, 0) / Math.max(1, st.tops.length))} ft  meets ${f2(st.meet)}  parts ${f2(st.part)}  in hand ${f2(Math.max(0, st.inside))}  pop ${f2(st.pop)}`,
      );
  }
