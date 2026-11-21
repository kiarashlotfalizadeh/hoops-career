// The legs of a man going ahead: a walk, a jog, a run, a sprint.
//
// A planted foot is the puppet's own business: it stays where it was put on the floor he is actually crossing, and his
// body goes over it (Puppet.step). Everything else about a stride is a runner's, and is read here from strides that
// were measured off motion capture at the speeds they were run at (scripts/mocap/build.ts writes STRIDES): how long a
// foot is down, how far ahead of him it comes down, the path it swings through to get there (trailing behind him as
// the heel comes up, folded through under his hips, reaching and drawn back to meet the floor), how it is pitched, and
// how his hips ride over it. Each is on a clock of its own (a swing from 0 to 1, a stance from 0 to 1, a step from one
// foot coming down to the other), so the strides either side of his speed are mixed swing with swing and stance with
// stance: there is no speed at which a foot in the air is averaged with one on the floor.
//
// Everything is for the 6 ft 6 puppet; a bigger man's stride is the same one, longer and slower (see `scaled`).
import { STRIDES } from './mocap.gen';

const SW = STRIDES[0].z.length - 1;
const ST = STRIDES[0].stance.length - 1;
const HN = STRIDES[0].hip.length;

/** A stride at one speed: the two measured either side of it, and how far from the first to the second. */
export interface Stride {
  k: number;
  w: number;
}

/** The stride of a man going `v` ft a second (the puppet's: see `scaled`). */
export function strideAt(v: number, out: Stride): Stride {
  let k = 0;
  while (k < STRIDES.length - 2 && v > STRIDES[k + 1].v) k++;
  const u = Math.max(0, Math.min(1, (v - STRIDES[k].v) / (STRIDES[k + 1].v - STRIDES[k].v)));
  out.k = k;
  out.w = u;
  return out;
}

/**
 * A man `s` times the puppet's size going `v` goes as the puppet does at this speed: his legs are that much longer, so
 * the same stride takes him farther and takes longer (the square root of it, as a longer pendulum does).
 */
export const scaled = (v: number, s: number) => v / Math.sqrt(s);

const mix = (g: Stride, a: number, b: number) => a + (b - a) * g.w;

/** A curve read between its keys (`u` 0..1 over all of them). */
function read(c: readonly number[], u: number, n: number): number {
  const x = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return c[i] + (c[i + 1] - c[i]) * (x - i);
}

/** The same, round a loop of `n` keys. */
function loop(c: readonly number[], u: number, n: number): number {
  const x = (u - Math.floor(u)) * n;
  const i = Math.floor(x) % n;
  return c[i] + (c[(i + 1) % n] - c[i]) * (x - i);
}

/**
 * How much of the floor a foot is down over, from where it lands ahead of him to where it leaves behind (ft on the
 * puppet): each measured stride's time down at the speed it was run at. Between two it is this that is mixed, not the
 * time: a walker's foot is down three times as long as a jogger's and covers the same floor, and halfway between them
 * a foot down for the mean of their times would be left a yard behind him.
 */
const OVER = STRIDES.map((t) => t.tc * t.v);
export const downOver = (g: Stride) => mix(g, OVER[g.k], OVER[g.k + 1]);

/** How far ahead of him a foot's point on the floor comes down (ft on the puppet). */
export const landsAhead = (g: Stride) => mix(g, STRIDES[g.k].a, STRIDES[g.k + 1].a);

/**
 * A swinging foot's way along, `u` through its swing: 0 where it left the floor, 1 where it comes down, both measured
 * from him. Under 0 first (it trails on behind him as his heel comes up) and over 1 before the end (it reaches past
 * where it will land and is drawn back onto the floor).
 */
export const swingAlong = (g: Stride, u: number) => mix(g, read(STRIDES[g.k].z, u, SW), read(STRIDES[g.k + 1].z, u, SW));

/** How fast that goes at the swing's end (per unit of the swing): what the foot's own speed over the floor as it lands is worked from. */
export function swingEnds(g: Stride): number {
  const end = (c: readonly number[]) => (c[SW] - c[SW - 1]) * SW;
  return mix(g, end(STRIDES[g.k].z), end(STRIDES[g.k + 1].z));
}

/** How high its point is off the floor through its swing (ft on the puppet). */
export const swingUp = (g: Stride, u: number) => mix(g, read(STRIDES[g.k].up, u, SW), read(STRIDES[g.k + 1].up, u, SW));

/** How it is pitched through its swing (radians, toes down). */
export const swingPitch = (g: Stride, u: number) => mix(g, read(STRIDES[g.k].pitch, u, SW), read(STRIDES[g.k + 1].pitch, u, SW));

/** And through its time down (`w` 0 as it lands, 1 as it leaves): flat, or onto its heel first, then up onto its ball as he goes over it. */
export const stancePitch = (g: Stride, w: number) => mix(g, read(STRIDES[g.k].stance, w, ST), read(STRIDES[g.k + 1].stance, w, ST));

/** His hips (the pose's `hip`: ft above where he stands) `psi` through a step, 0 as a foot comes down, 1 as the other does. */
export const hipsOver = (g: Stride, psi: number) => mix(g, loop(STRIDES[g.k].hip, psi, HN), loop(STRIDES[g.k + 1].hip, psi, HN));

/** His hips through a step, on average. */
export function hipsMean(g: Stride): number {
  const mean = (c: readonly number[]) => c.reduce((t, v) => t + v, 0) / HN;
  return mix(g, mean(STRIDES[g.k].hip), mean(STRIDES[g.k + 1].hip));
}
