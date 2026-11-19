// The fine grain of his skin and of his kit, close up (figure.ts lays it on him: see Detail): three small pictures,
// made once a session, in a worker as the court's models come (models.ts) or here when the first court is built, so
// they cost the download nothing. Each repeats with no seam (its right edge runs on into its left, its top into its
// foot), and each texel holds the slope of its height across and up (128 level, 1 and 255 as steep as STEEP says), how
// much shade there is down in its hollows (255 none) and how steep it is at all (its slope squared, half of it: 255 as
// steep as STEEP both ways). Taken down to a
// smaller copy of itself, as the card does for a man further off, a picture's slopes average out and its slope squared
// doesn't: what is left of the one over the other is the grain too fine for the pixels, which roughs up a lamp's shine
// instead of drawing it. Nothing here is random but by a number of its own, and nothing here needs three.js.

/** Each picture is this many texels a side, and there are three: his skin's, a knit's, a rib's (in that order: see TILE_MM). */
export const TILE = 256;
export const LAYERS = 3;
/** How big each is on him (mm a side): his skin's grain repeats every 30 mm, a jersey's knit every 16 stitches (22.4 mm), a rib every 16 ribs (19.2 mm). */
export const TILE_MM = [30, 22.4, 19.2] as const;
/** How steep a slope of 1 or 255 is in each (mm up for a mm across): anything steeper is cut to it. */
export const STEEP = [0.5, 1.2, 1.2] as const;
/**
 * The size of the grain that shows longest in each (mm): his skin's little hills, a knit's stitch across, a rib's. Each
 * picture is gone (see figure.ts) once that is less than two pixels or so across.
 */
export const GRAIN_MM = [3, 1.4, 1.2] as const;

/** The three pictures, layer after layer (four bytes a texel: see above), and each one's slope squared, on average (as STEEP has it, 0..2). */
export interface Tiles {
  bytes: Uint8Array<ArrayBuffer>;
  meanSq: [number, number, number];
}

/** A number of a place's own, 0..1 (the same every time it's asked). */
function hash(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const wrap = (i: number, n: number) => ((i % n) + n) % n;
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * A texel's weights on the places round it (the one before its own, its own, the next two), `t` its way from its own
 * to the next: eased between those two (quickly: its rises and falls are all about the places), or a cubic B-spline's
 * (no place it passes through any likelier than another to be where it crosses nought, as eased numbers' crossings,
 * which line up on the places' rows, are).
 */
const EASED = (t: number) => [0, 1 - ease(t), ease(t), 0];
const SPLINE = (t: number) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];

/**
 * Numbers between places `gx` across the picture and `gy` up it, each a number of its own (-0.5..0.5; a B-spline's are
 * about -0.3..0.3), weighed as `weigh` says, for each texel, repeating as the picture does. Worked out along each row
 * of places first, then up.
 */
function smoothOf(gx: number, gy: number, k: number, weigh: (t: number) => number[]): Float32Array {
  const at = Float32Array.from({ length: gx * gy }, (_v, i) => hash(i % gx, Math.floor(i / gx), k) - 0.5);
  const rows = new Float32Array(gy * TILE);
  for (let x = 0; x < TILE; x++) {
    const f = ((x + 0.5) / TILE) * gx;
    const i = Math.floor(f);
    const w = weigh(f - i);
    for (let j = 0; j < gy; j++) {
      let sum = 0;
      for (let p = 0; p < 4; p++) sum += w[p] * at[j * gx + wrap(i - 1 + p, gx)];
      rows[j * TILE + x] = sum;
    }
  }
  const out = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) {
    const f = ((y + 0.5) / TILE) * gy;
    const j = Math.floor(f);
    const w = weigh(f - j);
    for (let q = 0; q < 4; q++) {
      const row = wrap(j - 1 + q, gy) * TILE;
      if (w[q]) for (let x = 0; x < TILE; x++) out[y * TILE + x] += w[q] * rows[row + x];
    }
  }
  return out;
}
/** Numbers eased between `g` places a side (EASED). */
const lumps = (g: number, k: number) => smoothOf(g, g, k, EASED);

/**
 * Pits over the picture, `nx` across it and `ny` up it, one about each of so many places (each almost anywhere in its
 * own square of them, so no grid shows through), and for each texel: how far it is from its nearest one (texels,
 * squared) and which one that is. Past the picture's edge each is the one on its other side, moved round: it repeats.
 */
function pitsOf(nx: number, ny: number, k: number) {
  const [cw, ch] = [TILE / nx, TILE / ny];
  const sx = Float32Array.from({ length: nx * ny }, (_v, c) => (0.05 + 0.9 * hash(c % nx, Math.floor(c / nx), k)) * cw);
  const sy = Float32Array.from({ length: nx * ny }, (_v, c) => (0.05 + 0.9 * hash(c % nx, Math.floor(c / nx), k + 1)) * ch);
  const mid = new Float32Array(TILE * TILE);
  const cell = new Int32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      const [i0, j0] = [Math.floor(px / cw), Math.floor(py / ch)];
      let best = Infinity;
      let b = 0;
      for (let j = j0 - 1; j <= j0 + 1; j++)
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const c = wrap(j, ny) * nx + wrap(i, nx);
          const d = (i * cw + sx[c] - px) ** 2 + (j * ch + sy[c] - py) ** 2;
          if (d < best) [best, b] = [d, c];
        }
      mid[y * TILE + x] = best;
      cell[y * TILE + x] = b;
    }
  return { mid, cell };
}

/**
 * Soft lines over the picture: for each texel, how far it is (texels) from where a B-spline's numbers (`gx` places
 * across and `gy` up: with fewer across than up, its lines run more across than up) cross nought. Lines that wander
 * and curve as a skin's do, never a cell's straight edge, and fade where they end.
 */
function linesOf(gx: number, gy: number, k: number): Float32Array {
  const n = smoothOf(gx, gy, k, SPLINE);
  const d = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gu = (n[y * TILE + ((x + 1) & (TILE - 1))] - n[y * TILE + ((x - 1) & (TILE - 1))]) / 2;
      const gv = (n[((y + 1) & (TILE - 1)) * TILE + x] - n[((y - 1) & (TILE - 1)) * TILE + x]) / 2;
      d[y * TILE + x] = Math.abs(n[y * TILE + x]) / Math.max(Math.hypot(gu, gv), 1e-6);
    }
  return d;
}

/**
 * His skin's heights (mm) and how deep each texel is in a furrow or a pore (mm). Its surface is a fine grain over
 * little hills a few millimetres across (what break a lamp's shine up on a shoulder), cut by soft furrows a millimetre
 * or two apart that wander and curve, most of them one way and fainter ones the other (LINES: places across, places
 * up, mm deep), and each one deeper in places and gone in others; and a pore in four of every ten little squares of it
 * (PITS), a fifth of a millimetre across. No furrow is deep or steep enough to draw a cell round a highlight: close
 * up, a lamp's shine on him breaks into grain and pores, as a living skin's does, not into the crazing on a glaze.
 */
const LINES = [
  [6, 16, 0.009],
  [22, 8, 0.0035],
] as const;
const PITS = [30, 34] as const;
function skinHeights(seed: number): [Float32Array, Float32Array] {
  const mm = TILE_MM[0] / TILE;
  const furrows = LINES.map(([gx, gy], i) => linesOf(gx, gy, seed * 16 + 1 + 3 * i));
  // (how deep each furrow is along it: eased, so it comes and goes)
  const deepest = LINES.map((_l, i) => lumps(7, seed * 16 + 2 + 3 * i));
  const pits = pitsOf(PITS[0], PITS[1], seed * 16 + 10);
  const [hill, lump, grain, fine] = [lumps(10, seed * 16 + 7), lumps(20, seed * 16 + 8), lumps(48, seed * 16 + 12), lumps(96, seed * 16 + 13)];
  const pored = Array.from({ length: PITS[0] * PITS[1] }, (_v, k) => hash(k, 0, seed * 16 + 9) < 0.4);
  const h = new Float32Array(TILE * TILE);
  const deep = new Float32Array(TILE * TILE);
  for (let i = 0; i < TILE * TILE; i++) {
    let furrow = 0;
    for (let k = 0; k < LINES.length; k++) {
      const along = Math.min(1, Math.max(0, 0.5 + 1.6 * deepest[k][i]));
      furrow += LINES[k][2] * (0.3 + 0.7 * along) * Math.exp(-(((furrows[k][i] * mm) / 0.12) ** 2));
    }
    const pore = pored[pits.cell[i]] ? 0.028 * Math.exp(-(pits.mid[i] * mm * mm) / 0.085 ** 2) : 0;
    h[i] = 0.05 * hill[i] + 0.02 * lump[i] + 0.014 * grain[i] + 0.006 * fine[i] - furrow - pore;
    deep[i] = furrow + pore;
  }
  return [h, deep];
}

/**
 * A knit's heights (mm): a stitch is a loop of yarn, its two legs seen as a V down each column of them (a wale), one
 * V over the next; each leg a round of yarn lying highest at its middle, where it crosses over the loop below it. `w`
 * wales and `c` courses to the picture's side, `mm` a wale and a course, `mid` where in a wale its V's middle is (a share
 * of it across) and `lift` how far up a course its stitches start (both so the picture's edges fall where it is like
 * anywhere else in it); `at`: where the legs of a stitch start at its top and end at its foot (a share of a wale out from
 * its middle, and up it), `r` how wide a leg is (mm, half), `up` how high it stands (mm) and `swell` how much of that is
 * at its middle only (where it crosses over the loop below); `purl`: in a rib, a column of the loops' backs between each
 * two of the V's, sunk (how high those stand, mm, and where the columns are: a share of a rib across). Each stitch a
 * little its own (a knit is never a print).
 */
function knitHeights(o: {
  w: number;
  c: number;
  mid: number;
  mm: [number, number];
  lift: number;
  at: [number, number, number, number];
  r: number;
  up: number;
  swell: number;
  purl?: [number, number];
  k: number;
}) {
  const h = new Float32Array(TILE * TILE);
  const [cw, cc] = [TILE / o.w, TILE / o.c];
  const [mw, mc] = o.mm;
  // (each stitch's own: how far off its column's middle it sits, how high it stands, how thick its yarn)
  const n = o.w * o.c;
  const [mid, tall, thick] = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let j = 0; j < o.c; j++)
    for (let i = 0; i < o.w; i++) {
      mid[j * o.w + i] = o.mid + 0.06 * (hash(i, j, o.k) - 0.5);
      tall[j * o.w + i] = o.up * (0.92 + 0.16 * hash(i, j, o.k + 1));
      thick[j * o.w + i] = o.r * (0.95 + 0.1 * hash(i, j, o.k + 2));
    }
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const u = (x + 0.5) / cw;
      const v = (y + 0.5) / cc + o.lift;
      const [px, py] = [u * mw, v * mc];
      const i0 = Math.floor(u);
      const j0 = Math.floor(v);
      let top = 0;
      for (let j = j0 - 1; j <= j0 + 1; j++)
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const k = wrap(j, o.c) * o.w + wrap(i, o.w);
          const r = thick[k];
          for (let s = -1; s <= 1; s += 2) {
            // (the leg from the stitch's top outside to its foot inside, in mm)
            const ax = (i + mid[k] + s * o.at[0]) * mw;
            const ay = (j + o.at[1]) * mc;
            const ex = (i + mid[k] + s * o.at[2]) * mw - ax;
            const ey = (j + o.at[3]) * mc - ay;
            const t = Math.min(1, Math.max(0, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)));
            const dx = px - ax - t * ex;
            const dy = py - ay - t * ey;
            const d = (dx * dx + dy * dy) / (r * r);
            if (d < 1) top = Math.max(top, tall[k] * (1 - d) * (1 - o.swell + o.swell * Math.sin(Math.PI * t)));
          }
          if (o.purl) {
            // (a loop's back, across the column between the V's: a little bar, sunk)
            const dx = (u - i - o.purl[1]) / 0.22;
            const dy = (v - j - 0.5) / 0.34;
            const q = dx * dx + dy * dy;
            if (q < 1) top = Math.max(top, o.purl[0] * (1 - q));
          }
        }
      h[y * TILE + x] = top;
    }
  return h;
}

/** A height blurred over a texel either way ([1, 2, 1], across and then up), in place, round past the picture's edges as it repeats. */
function smooth(h: Float32Array) {
  const t = new Float32Array(h.length);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) t[y * TILE + x] = (h[y * TILE + ((x - 1) & (TILE - 1))] + 2 * h[y * TILE + x] + h[y * TILE + ((x + 1) & (TILE - 1))]) * 0.25;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) h[y * TILE + x] = (t[((y - 1) & (TILE - 1)) * TILE + x] + 2 * t[y * TILE + x] + t[((y + 1) & (TILE - 1)) * TILE + x]) * 0.25;
}

/**
 * A picture from its heights (mm) and its shade (0..1, 1 none), into `out` at layer `k`: its slopes round past its
 * edges as it repeats. Gives back its slope squared, on average.
 */
function put(h: Float32Array, shade: (i: number) => number, k: number, out: Uint8Array): number {
  smooth(h);
  const by = 1 / (2 * (TILE_MM[k] / TILE) * STEEP[k]);
  const o = k * TILE * TILE * 4;
  let sum = 0;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const i = y * TILE + x;
      const du = Math.min(1, Math.max(-1, (h[y * TILE + ((x + 1) & (TILE - 1))] - h[y * TILE + ((x - 1) & (TILE - 1))]) * by));
      const dv = Math.min(1, Math.max(-1, (h[((y + 1) & (TILE - 1)) * TILE + x] - h[((y - 1) & (TILE - 1)) * TILE + x]) * by));
      const sq = (du * du + dv * dv) / 2;
      sum += 2 * sq;
      out[o + i * 4] = Math.round(128 + 127 * du);
      out[o + i * 4 + 1] = Math.round(128 + 127 * dv);
      out[o + i * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, shade(i))));
      out[o + i * 4 + 3] = Math.round(255 * sq);
    }
  return sum / (TILE * TILE);
}

/** His skin's picture (seed: whose grain it is: every man shares the one), into layer 0 of `out`. */
export function skinTile(out: Uint8Array, seed = 7): number {
  const [h, deep] = skinHeights(seed);
  // (the shade down a furrow or a pore: as dark as it is deep, to half)
  return put(h, (i) => 1 - 0.5 * Math.min(1, deep[i] / 0.04), 0, out);
}

/** A jersey's knit (its face: the V's of each wale, 1.4 mm apart), into layer 1 of `out`. */
export function knitTile(out: Uint8Array): number {
  const h = knitHeights({ w: 16, c: 20, mid: 0.6875, mm: [1.4, 1.12], lift: 0, at: [0.36, 1.0, 0.06, 0.05], r: 0.27, up: 0.12, swell: 0.38, k: 11 });
  // (and the dark of the little holes between the legs, where there is no yarn)
  return put(h, (i) => 0.2 + 0.8 * Math.min(1, h[i] / 0.07), 1, out);
}

/** A 1x1 rib (a column of V's, then a column of the loops' backs sunk between them: 1.2 mm a rib), into layer 2 of `out`. */
export function ribTile(out: Uint8Array): number {
  const h = knitHeights({ w: 16, c: 24, mid: 0.6125, mm: [1.2, 0.8], lift: 0.5, at: [0.2, 1.0, 0.035, 0.05], r: 0.2, up: 0.13, swell: 0.12, purl: [0.025, 1.1125], k: 23 });
  return put(h, (i) => 0.25 + 0.75 * Math.min(1, h[i] / 0.08), 2, out);
}

let made: Tiles | null = null;

/** The three pictures as a worker made them (models.ts): what tilesOf gives from now on. */
export function keepTiles(tiles: Tiles) {
  if (tiles.bytes.length === TILE * TILE * 4 * LAYERS) made ??= tiles;
}

/** The three pictures, made the first time they're asked for (here, if no worker made them) and the same bytes every time after (see Tiles). */
export function tilesOf(): Tiles {
  if (!made) {
    const bytes = new Uint8Array(TILE * TILE * 4 * LAYERS);
    made = { bytes, meanSq: [skinTile(bytes), knitTile(bytes), ribTile(bytes)] };
  }
  return made;
}
