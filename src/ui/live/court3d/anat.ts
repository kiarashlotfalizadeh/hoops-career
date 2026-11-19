// His skin's anatomy as his material reads it (figure.ts Maps), from the heights scripts/blender/anatomy.py baked
// (skin-anat.png: muscle and tendon in its first channel, his veins in its second): their slopes, a texel's step at a
// time, and the shade down in their hollows. Worked out once a session, when the models are read (models.ts), and
// kept as those bytes and nothing else: each court built after that (a game's, or one built again when its context
// came back) only puts them on the card. Nothing here needs three.js.
import { decodePng, type Picture } from './png';

/** How tall the map's heights run (mm): its first channel is 128 ± 127 for ± the first, of muscle and tendon; its second 0 to 255 for up to the second, of vein (anatomy.py's own, as anat.json says). */
export const ANAT_MM = [4, 1.5] as const;
/**
 * The shade in a hollow of his anatomy: so much darker for each millimetre it lies below the skin round it (that,
 * blurred over this many texels of a map 1024 across: a centimetre or so of his forearm), and never darker than the last.
 */
const ANAT_CAV = [0.2, 3, 0.8] as const;

/**
 * His skin's anatomy, worked out (see figure.ts Maps for how it is read): `slopes`, four bytes a texel, `size` texels a
 * side (muscle and tendon across and up, then his veins: 128 level, 1 and 255 as steep as `scale` says, ft a texel, one
 * for each pair); `shade`, one byte a texel at half the size (255 none).
 */
export interface Anat {
  size: number;
  slopes: Uint8Array<ArrayBuffer>;
  shade: Uint8Array<ArrayBuffer>;
  scale: [number, number];
}

/** A height blurred over a texel either way ([1, 2, 1], across and then up), in place (`t` its scratch, as long): a texel's own stair is no slope of his. */
function smooth3(h: Float32Array, t: Float32Array, n: number) {
  for (let o = 0; o < n * n; o += n) {
    const end = o + n - 1;
    t[o] = (h[o] + 2 * h[o] + h[o + 1]) * 0.25;
    for (let i = o + 1; i < end; i++) t[i] = (h[i - 1] + 2 * h[i] + h[i + 1]) * 0.25;
    t[end] = (h[end - 1] + 2 * h[end] + h[end]) * 0.25;
  }
  for (let y = 0; y < n; y++) {
    const [a, o, b] = [(y > 0 ? y - 1 : y) * n, y * n, (y < n - 1 ? y + 1 : y) * n];
    for (let x = 0; x < n; x++) h[o + x] = (t[a + x] + 2 * t[o + x] + t[b + x]) * 0.25;
  }
}

/** A height blurred over `r` texels either way, three times across and up (as near a bell as boxes come: a σ of about √(r(r+1))). */
function blurBox(h: Float32Array, n: number, r: number): Float32Array {
  const a = new Float32Array(h);
  const b = new Float32Array(h.length);
  const k = 1 / (2 * r + 1);
  const sums = new Float32Array(n);
  for (let pass = 0; pass < 3; pass++) {
    // (across: a sum along the row, a texel in and one out at each step; past the edge is the edge)
    for (let y = 0, o = 0; y < n; y++, o += n) {
      let sum = a[o] * (r + 1);
      for (let j = 1; j <= r; j++) sum += a[o + Math.min(n - 1, j)];
      for (let x = 0; x < n; x++) {
        b[o + x] = sum * k;
        sum += a[o + Math.min(n - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    // (and up: each column's sum, a row in and one out at each step)
    for (let x = 0; x < n; x++) sums[x] = b[x] * (r + 1);
    for (let j = 1; j <= r; j++) for (let x = 0, o = Math.min(n - 1, j) * n; x < n; x++) sums[x] += b[o + x];
    for (let y = 0; y < n; y++) {
      const [o, inn, out] = [y * n, Math.min(n - 1, y + r + 1) * n, Math.max(0, y - r) * n];
      for (let x = 0; x < n; x++) {
        a[o + x] = sums[x] * k;
        sums[x] += b[inn + x] - b[out + x];
      }
    }
  }
  return a;
}

/**
 * A height's slopes across and up (ft a texel), into two of `out`'s four channels from `k` (128 level, 1 and 255 as
 * steep as the one it gives back: all but the steepest thousandth of them, which are cut to it). `top`: as steep as a
 * texel's step can be.
 */
function slopesOf(h: Float32Array, n: number, top: number, out: Uint8Array, k: number): number {
  // (how many are how steep, counted on every other row and texel: plenty to tell the thousandth by)
  const BINS = 4096;
  const count = new Uint32Array(BINS);
  const per = BINS / top;
  let seen = 0;
  for (let y = 1; y < n - 1; y += 2)
    for (let x = 1, i = y * n + 1; x < n - 1; x += 2, i += 2) {
      const du = Math.abs(h[i + 1] - h[i - 1]) * 0.5;
      const dv = Math.abs(h[i + n] - h[i - n]) * 0.5;
      if (du > 0) count[Math.min(BINS - 1, (du * per) | 0)]++;
      if (dv > 0) count[Math.min(BINS - 1, (dv * per) | 0)]++;
    }
  for (const c of count) seen += c;
  let steep = 1e-9;
  for (let bin = 0, sum = 0; bin < BINS && seen; bin++)
    if ((sum += count[bin]) >= 0.999 * seen) {
      steep = ((bin + 1) / BINS) * top;
      break;
    }
  // (then each put down against it; level where nothing changes, which is most of the map)
  const by = 0.5 * (127 / steep);
  for (let y = 0; y < n; y++) {
    const [a, o, b] = [(y > 0 ? y - 1 : y) * n, y * n, (y < n - 1 ? y + 1 : y) * n];
    for (let x = 0; x < n; x++) {
      const i = o + x;
      const du = (h[x < n - 1 ? i + 1 : i] - h[x > 0 ? i - 1 : i]) * by;
      const dv = (h[b + x] - h[a + x]) * by;
      if (du === 0 && dv === 0) continue;
      out[i * 4 + k] = Math.round(128 + (du > 127 ? 127 : du < -127 ? -127 : du));
      out[i * 4 + k + 1] = Math.round(128 + (dv > 127 ? 127 : dv < -127 ? -127 : dv));
    }
  }
  return steep;
}

/**
 * His skin's anatomy, from the heights anatomy.py baked (a picture: its first channel muscle and tendon, its second his
 * veins; square, at whatever size it was baked: a phone's file is half the desktop's).
 */
export function anatOf(pic: Picture): Anat {
  if (pic.w !== pic.h || pic.channels < 2) throw new Error(`skin-anat.png: ${pic.w} by ${pic.h}, ${pic.channels} channels (a square, two of them)`);
  const [n, c, src] = [pic.w, pic.channels, pic.data];
  // (in feet, as every height his material works with is)
  const [toForm, toVein] = [ANAT_MM[0] / 127 / 304.8, ANAT_MM[1] / 255 / 304.8];
  const form = new Float32Array(n * n);
  const vein = new Float32Array(n * n);
  for (let i = 0, j = 0; i < n * n; i++, j += c) {
    form[i] = (src[j] - 128) * toForm;
    vein[i] = src[j + 1] * toVein;
  }
  const t = new Float32Array(n * n);
  smooth3(form, t, n);
  smooth3(vein, t, n);
  const slopes = new Uint8Array(n * n * 4).fill(128);
  const scale: [number, number] = [slopesOf(form, n, ANAT_MM[0] / 304.8, slopes, 0), slopesOf(vein, n, ANAT_MM[1] / 304.8, slopes, 2)];
  // (the shade in a hollow: how far it lies below his skin round it. A shade is soft: worked out, and kept, at half the size)
  const m = n >> 1;
  const low = new Float32Array(m * m);
  for (let y = 0; y < m; y++) for (let x = 0, i = 2 * y * n; x < m; x++, i += 2) low[y * m + x] = (form[i] + form[i + 1] + form[i + n] + form[i + n + 1]) * 0.25;
  const sigma = (ANAT_CAV[1] * m) / 1024;
  const near = blurBox(low, m, Math.max(1, Math.round(Math.sqrt(sigma * sigma + 0.25) - 0.5)));
  // (and that softened a little: a hollow's shade is the light kept out of it, never a line drawn along it)
  for (let i = 0; i < m * m; i++) near[i] = Math.max(0, near[i] - low[i]) * 304.8;
  smooth3(near, t, m);
  smooth3(near, t, m);
  const shade = new Uint8Array(m * m);
  for (let i = 0; i < m * m; i++) shade[i] = Math.round(255 * Math.min(1, Math.max(ANAT_CAV[2], 1 - ANAT_CAV[0] * near[i])));
  return { size: n, slopes, shade, scale };
}

/** His skin's anatomy, from skin-anat.png's bytes as fetched (see anatOf; a file that is no picture of these throws). */
export async function readAnat(bytes: ArrayBuffer): Promise<Anat> {
  return anatOf(await decodePng(bytes));
}
