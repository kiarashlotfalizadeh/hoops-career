// Reads a motion-capture file (BVH) and works out where every joint is in each frame.
// The files are the CMU Motion Capture Database's (mocap.cs.cmu.edu), y up, the body facing +z
// in its first frame (a T-pose the converter added), so +x is the body's left: the puppet's frame.
import { readFileSync } from 'node:fs';

export type V = [number, number, number];
export type M3 = [number, number, number, number, number, number, number, number, number];

interface Joint {
  name: string;
  parent: number;
  offset: V;
  /** Where this joint's numbers start in a frame's row, and which they are. */
  at: number;
  chan: string[];
}

export interface Take {
  joints: string[];
  parent: number[];
  /** Seconds a frame. */
  dt: number;
  frames: number;
  /** World positions: `pos[frame][joint]`. */
  pos: V[][];
  /** World turns, row by row: `rot[frame][joint]`. */
  rot: M3[][];
  index: Record<string, number>;
}

const mul = (a: M3, b: M3): M3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
  a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
  a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
  a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
  a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
  a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
  a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const rot = (axis: string, deg: number): M3 => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return axis === 'X' ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 'Y' ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
};
const apply = (m: M3, v: V): V => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

/** `every`: keep one frame in this many (the files are 120 a second). */
export function readBvh(path: string, every = 4): Take {
  const text = readFileSync(path, 'utf8');
  const [head, body] = text.split('MOTION');
  const joints: Joint[] = [];
  const stack: number[] = [];
  let at = 0;
  let ends = 0;
  const tok = head.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tok.length; i++) {
    const t = tok[i];
    if (t === 'ROOT' || t === 'JOINT') {
      joints.push({ name: tok[++i], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], at: 0, chan: [] });
    } else if (t === 'End') {
      // (an end site: a joint with no numbers of its own, named after its parent)
      const p = stack[stack.length - 1];
      joints.push({ name: `${joints[p].name}End`, parent: p, offset: [0, 0, 0], at: 0, chan: [] });
      i++;
      ends++;
    } else if (t === '{') stack.push(joints.length - 1);
    else if (t === '}') stack.pop();
    else if (t === 'OFFSET') {
      joints[joints.length - 1].offset = [Number(tok[i + 1]), Number(tok[i + 2]), Number(tok[i + 3])];
      i += 3;
    } else if (t === 'CHANNELS') {
      const n = Number(tok[++i]);
      const j = joints[joints.length - 1];
      j.at = at;
      j.chan = tok.slice(i + 1, i + 1 + n);
      at += n;
      i += n;
    }
  }
  void ends;
  const lines = body.trim().split('\n');
  const dt = Number(lines[1].split(':')[1]);
  const rows = lines.slice(2);
  const pos: V[][] = [];
  const rots: M3[][] = [];
  // (frame 0 is the added T-pose: it's kept, as the body's measure)
  for (let f = 0; f < rows.length; f += f === 0 ? 1 : every) {
    const v = rows[f].trim().split(/\s+/).map(Number);
    const world: V[] = [];
    const mats: M3[] = [];
    joints.forEach((j, k) => {
      let m: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      let t: V = [...j.offset];
      j.chan.forEach((c, n) => {
        const x = v[j.at + n];
        if (c.endsWith('position')) t = c[0] === 'X' ? [x, t[1], t[2]] : c[0] === 'Y' ? [t[0], x, t[2]] : [t[0], t[1], x];
        else m = mul(m, rot(c[0], x));
      });
      if (j.parent < 0) {
        mats[k] = m;
        world[k] = t;
      } else {
        const p = apply(mats[j.parent], t);
        const w = world[j.parent];
        world[k] = [w[0] + p[0], w[1] + p[1], w[2] + p[2]];
        mats[k] = mul(mats[j.parent], m);
      }
    });
    pos.push(world);
    rots.push(mats);
  }
  return {
    joints: joints.map((j) => j.name),
    parent: joints.map((j) => j.parent),
    dt: dt * every,
    frames: pos.length - 1,
    pos,
    rot: rots,
    index: Object.fromEntries(joints.map((j, k) => [j.name, k])),
  };
}
