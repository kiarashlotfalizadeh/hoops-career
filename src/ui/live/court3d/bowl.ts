// The bowl the crowd sits in, as a building: a lower bowl of stepped rows on all four sides (mitred at
// the corners), aisles with their half steps, tunnels out through the stands with the concourse's light
// in their mouths, a wall and a rail at the front and the back of it, a walkway round the top with
// people standing at the rail and the concourse's stands lit behind them, a level of suites with lit
// windows over that, an upper deck of people too far off to be more than a picture, and the walls up to
// the roof. The near side is the broadcast's: its lower bowl runs under the cameras, and its upper
// levels are set back behind where they stand. Everything of one kind is one shape (a draw), built here
// from flat faces; the pictures on the lit faces are painted here too. Where each seat is comes from
// here (the crowd, crowd.ts, sits in them).
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { COURT_LEN } from '../choreo';
import { END, HALF_W, SIDE } from '../Court';
import type { Stands, Venue } from '../../teamColors';
import { unshadowed } from './rig';

type Keep = <T extends { dispose(): void }>(o: T) => T;
type V3 = [number, number, number];

const MID = COURT_LEN / 2;
/** Where the seats start: behind the far boards, behind each basket's boards, and (further back: the cameras work that side) on the near side. */
export const FAR = HALF_W + SIDE + 7.5;
export const ENDX = MID + END + 9.5;
export const NEAR = 36.5;
/** A row of seats: how deep, how much higher than the one in front, a seat's width; how many rows, and how high the first is. */
export const DEEP = 2.6;
export const RISE = 1.5;
export const SEAT = 1.9;
export const ROWS = 18;
const Y0 = 1.2;
/** The top of the lower bowl: how far back, how high. */
export const TOP = ROWS * DEEP;
export const TOP_Y = Y0 + ROWS * RISE;
/** Behind it (ft back from the front row): the walkway to the concourse's wall, the suites' front over it, and how far back the near side's upper levels are set (behind the cameras). */
const WALL = 54;
const FASCIA = 49;
const SET = 24;
/** How high a building's wall along the top of the lower bowl stands over the top row's step, where it has one (Venue.fascia). */
const FASCIA_UP = 3.6;
/** Up it (ft): the suites' soffit, the top of their windows, the top of the band the ribbon is on, where the glass over it ends. */
const SOFFIT = 37.2;
const SILL = 43.7;
const BAND = 47.4;
/** The ribbon's middle. */
export const RIBBON_Y = 45.5;
/**
 * The upper deck: a row's depth and rise (every building's is of the one slope: Venue.stands says which of its
 * rows it has), and the rows every building's has (cameras go off in them: Bowl.high).
 */
const UP_DEEP = 2.7;
const UP_RISE = 2.0;
const UP_ALL = [4, 9];
/** A building that closes its corners' high rows (Venue.stands): the first of them, and how tall a band of the name printed on the cover is (ft). */
const COVER_ROW = 11;
const COVER_BAND = 4.5;
/** Where a building with a short upper deck has a ring of lit windows on the wall over it (ft over its last row, and how tall). */
const CLERESTORY = [7, 5.5];
/** How tall a row of its people's picture stands (ft): someone on his feet with his arms up fills it. */
const UP_TALL = 4.4;
/** How many seats one turn of that picture is across (two runs of twenty-one, each with an aisle: no row repeats inside 80 ft). */
const UP_SEATS = 42;
/** How high the walls go (the roof's deck). */
export const ROOF_TOP = 106;
/** A tunnel out through the stands: how many rows it takes (its floor is the first's step, its roof the step after the last: the first is the building's, Venue.stands), and half its width. */
const VOM_ROWS = 5;
const VOM_HALF = 2.5 * SEAT;
/** The players' tunnels, out under each end's stands by the far corners: the rows one takes, half its width, how far its middle is from the corner. */
const GATE_ROWS = 5;
const GATE_HALF = 4.6;
const GATE_IN = 9.4;
/** Press row: the far side's first row is a desk this far either side of its middle. */
const PRESS = 27;
/** The broadcast's platform in the near stands (under where its main camera looks from): the rows it takes, and half its width. */
const DECK_ROWS = [14, 16];
const DECK_HALF = 8.5;
/**
 * A building's stands before its own are known (Venue.stands): an aisle every nineteen seats (the first half
 * that from a side's middle), tunnels from the eighth row in every aisle that has room for one, seats round
 * the corners, the upper deck's fourteen rows.
 */
const STANDS: Stands = { aisle: 19, vom: 8, tunnels: 1, corners: 'seats', deck: [0, 13] };
/** How many of an aisle's steps have someone stood on them (the top row's share: fewer by the floor). */
const AISLE_STAND = 0.06;
/** The row of chairs on the floor along the near side, and in the far corners past the benches. */
const COURT_Z = 34.6;
/** How many ft of each lit picture one turn of it covers. */
const DECK_FT = 80;
const SUITE_FT = 96;
const SHOP_FT = 128;

/** The lower bowl's rows from this one up are its high section (their seats in the building's third colour: Venue.seats). */
const HIGH_ROWS = 12;

/** A seat, or a place to stand: where (y is the step it is on), which way it faces, its row, its side (0 far, 1 the low end, 2 the high end, 3 near), and how much of the bowl's light gets to it. */
export interface Seat {
  x: number;
  y: number;
  z: number;
  turn: number;
  row: number;
  side: 0 | 1 | 2 | 3;
  kind: 'seat' | 'court' | 'stand';
  lit: number;
  /** A seat of the stands (the crowd draws it); a chair on the floor is the benches' kind. */
  stall: boolean;
}

/** Which section a seat of the lower bowl is in, for its colour (Venue.seats): the sides' lower rows, the ends', the rows high up. */
export const section = (s: Seat): 0 | 1 | 2 => (s.row >= HIGH_ROWS ? 2 : s.side === 1 || s.side === 2 ? 1 : 0);

/**
 * One side of the bowl: the middle of its front wall, which way its seats face (about y), half its
 * length at the front (it grows a foot a side for each foot back: the corners are mitred), how far its
 * upper levels are set back, and how much longer they are at each end to meet a neighbour's that are.
 */
interface Side {
  k: 0 | 1 | 2 | 3;
  cx: number;
  cz: number;
  turn: number;
  half: number;
  set: number;
  lo: number;
  hi: number;
}
const ZC = (NEAR - FAR) / 2;
const SIDES: Side[] = [
  { k: 0, cx: 0, cz: -FAR, turn: 0, half: ENDX, set: 0, lo: 0, hi: 0 },
  { k: 1, cx: -ENDX, cz: ZC, turn: Math.PI / 2, half: (FAR + NEAR) / 2, set: 0, lo: SET, hi: 0 },
  { k: 2, cx: ENDX, cz: ZC, turn: -Math.PI / 2, half: (FAR + NEAR) / 2, set: 0, lo: 0, hi: SET },
  { k: 3, cx: 0, cz: NEAR, turn: Math.PI, half: ENDX, set: SET, lo: 0, hi: 0 },
];
/** A point of a side: `u` ft along it from its middle (toward the left of someone sat in it), `y` up, `d` back from its front wall. */
const P = (s: Side, u: number, y: number, d: number): V3 => {
  const c = Math.cos(s.turn);
  const n = Math.sin(s.turn);
  return [s.cx + u * c - d * n, y, s.cz - u * n - d * c];
};
/**
 * How much of the floor's light reaches a row. The lamps are aimed at the floor and a camera is exposed for
 * it: the rows by the floor sit in their spill, most of a stop under the floor, and it falls away up the
 * bowl to two stops under by the walkway (the upper deck's picture and the lit fronts over it go on down
 * from there: DECK_GLOW and the rest). The steps, the seats and the people in them all take this one number,
 * so they darken together.
 */
const LIT_FRONT = 0.66;
const LIT_BACK = 0.27;
export const lit = (row: number) => LIT_BACK + (LIT_FRONT - LIT_BACK) * (1 - Math.min(1, row / (ROWS - 1))) ** 1.25;
/** Those stood at the rail behind the top row, the upper deck's picture at its front row, and the lit fronts behind and over the walkway: under the lower bowl's, not over it. */
const RAIL_LIT = 0.3;
const DECK_GLOW = 0.36;
const SUITE_GLOW = 0.5;
const SHOP_GLOW = 0.42;
const DOOR_GLOW = 0.55;
const SIGN_GLOW = 0.8;
/** The building's colour on its walls' padded tops and its seats' picture: this far toward grey, and this much of it (paint under a dimmed house is not a lit sign). */
const TRIM_GREY = 0.3;
const TRIM_TONE = 0.5;
/** The plain building's house lights (the lit faces are painted for them: teamColors.ts HOUSES). */
const HOUSE_PLAIN = '#fff1dc';
/** The near side's people are between the cameras and the floor: seen from behind and against it, they are this much darker past the first rows. */
const NEAR_LIT = 0.6;

/** Flat faces gathered into one shape: each with a colour (a shade a corner if asked) and, for a picture, where on it each corner is. */
class Soup {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly uv: number[] = [];
  private readonly c = new Color();

  quad(a: V3, b: V3, c: V3, d: V3, color: string, shade: number | number[] = 1, uv?: [number, number, number, number]) {
    const k = this.c.set(color);
    const s = typeof shade === 'number' ? [shade, shade, shade, shade] : shade;
    const at = [a, b, c, a, c, d];
    const sh = [s[0], s[1], s[2], s[0], s[2], s[3]];
    // (a picture: a is its bottom left, b its bottom right, c its top right, d its top left)
    const uvs = uv ? [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[1], uv[2], uv[3], uv[0], uv[3]] : null;
    for (let i = 0; i < 6; i++) {
      this.pos.push(...at[i]);
      this.col.push(k.r * sh[i], k.g * sh[i], k.b * sh[i]);
      if (uvs) this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      else this.uv.push(0, 0);
    }
  }

  /** A bar from a to b, `w` across and `h` deep (its four long faces). */
  bar(a: V3, b: V3, w: number, h: number, color: string, shade = 1) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const up: V3 = Math.abs(d[1]) / len > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = (p: number[], q: number[]): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const unit = (p: V3, to: number): V3 => {
      const l = Math.hypot(p[0], p[1], p[2]) || 1;
      return [(p[0] / l) * to, (p[1] / l) * to, (p[2] / l) * to];
    };
    const side = unit(cross(d, up), w / 2);
    const top = unit(cross(side, d), h / 2);
    const corner = (p: V3, i: number, j: number): V3 => [p[0] + side[0] * i + top[0] * j, p[1] + side[1] * i + top[1] * j, p[2] + side[2] * i + top[2] * j];
    const ring: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (let i = 0; i < 4; i++) {
      const [p, q] = [ring[i], ring[(i + 1) % 4]];
      this.quad(corner(a, p[0], p[1]), corner(a, q[0], q[1]), corner(b, q[0], q[1]), corner(b, p[0], p[1]), color, shade);
    }
  }

  get empty() {
    return !this.pos.length;
  }

  geo(keep: Keep): BufferGeometry {
    const g = keep(new BufferGeometry());
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

function texture(keep: Keep, w: number, h: number, paint: (cv: HTMLCanvasElement) => void, wrap = true): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paint(cv);
  const tex = keep(new CanvasTexture(cv));
  tex.colorSpace = SRGBColorSpace;
  if (wrap) tex.wrapS = RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** A crowd's colours for a picture of one (the upper deck's). */
const FAR_WEAR = ['#2b2d34', '#3a3d47', '#4a463f', '#262b36', '#5a564e', '#6b665f', '#9b978f', '#c9c5bc', '#6e3a3d', '#2c4460', '#39543f', '#7a6f58', '#b0aca4'];

/**
 * The upper deck's picture: one row of its people as a crowd looks from across a building, twice: sat
 * (the lower half: a seat back, shoulders and a head over it; a few seats empty, in the building's
 * colour, `seat`, which nearly half the people wear too) and on their feet with their arms up (the upper
 * half). Clear between and over them, so a row's top edge is heads, and clear where an aisle comes through.
 */
function paintDeck(cv: HTMLCanvasElement, seat: string) {
  const ctx = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  ctx.clearRect(0, 0, w, h);
  let n = 7;
  const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
  const sw = w / UP_SEATS;
  const half = h / 2;
  const tone = (hex: string, k: number) => `#${new Color(hex).multiplyScalar(k).getHexString()}`;
  for (let i = 0; i < UP_SEATS; i++) {
    // (an aisle every twenty-one seats)
    if (i % 21 === 10) continue;
    const x = i * sw;
    const r = [rnd(), rnd(), rnd(), rnd(), rnd()];
    const wear = r[0] < 0.45 ? tone(seat, 1.2 + r[1] * 0.9) : FAR_WEAR[Math.floor(r[1] * FAR_WEAR.length)];
    const skin = ['#d2a585', '#b98a6a', '#8a6248', '#5e4130'][Math.floor(r[2] * 4)];
    const hair = r[3] < 0.6 ? '#151210' : r[3] < 0.85 ? '#3a2a1c' : '#8a7a5a';
    const cx = x + sw * (0.5 + (r[4] - 0.5) * 0.12);
    for (const up of [false, true]) {
      // (the canvas's top half is the picture's upper: those on their feet)
      const foot = up ? half : h;
      ctx.fillStyle = tone(seat, 0.55);
      ctx.beginPath();
      ctx.roundRect(x + sw * 0.08, foot - half * 0.5, sw * 0.84, half * 0.5, sw * 0.12);
      ctx.fill();
      if (r[0] > 0.93) continue;
      const tall = up ? 0.84 : 0.66;
      const head = foot - half * tall;
      ctx.fillStyle = wear;
      ctx.beginPath();
      ctx.roundRect(cx - sw * 0.36, head + half * 0.15, sw * 0.72, half * (tall - 0.15), sw * 0.2);
      ctx.fill();
      if (up) {
        // (arms up: a sleeve and a hand each side of the head)
        ctx.lineCap = 'round';
        for (const e of [-1, 1]) {
          ctx.strokeStyle = wear;
          ctx.lineWidth = sw * 0.17;
          ctx.beginPath();
          ctx.moveTo(cx + e * sw * 0.3, head + half * 0.22);
          ctx.lineTo(cx + e * sw * 0.4, head - half * 0.02);
          ctx.stroke();
          ctx.strokeStyle = skin;
          ctx.beginPath();
          ctx.moveTo(cx + e * sw * 0.4, head - half * 0.02);
          ctx.lineTo(cx + e * sw * 0.36, head - half * 0.1);
          ctx.stroke();
        }
      }
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(cx, head + half * 0.1, sw * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(cx, head + half * 0.075, sw * 0.205, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
    }
  }
}

/**
 * The suites' front: bays of glass between piers, each lit its own way (warm and low, a screen's blue, one or
 * two dark), people at the rail inside, a counter's lamps behind them. The building's own (Venue.suites): how
 * many bays to a run, the frames' colour (black, steel or its own colour), and how warm the light inside is.
 */
function paintSuites(cv: HTMLCanvasElement, look: Venue['suites'] = { frame: '#08090a', light: 0, bays: 8 }) {
  const ctx = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  const pier = new Color(look.frame).multiplyScalar(0.55);
  ctx.fillStyle = `#${pier.getHexString()}`;
  ctx.fillRect(0, 0, w, h);
  let n = 23 + look.bays;
  const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
  const bays = look.bays;
  const bw = w / bays;
  // (how many of the bays are lit warm: a hall of lamps, half and half, or screens and cool white)
  const warmth = [0.85, 0.55, 0.2][look.light];
  for (let b = 0; b < bays; b++) {
    const x = b * bw + bw * 0.04;
    const gw = bw * 0.92;
    const dark = rnd() < 0.14;
    const warm = rnd() * (0.7 / warmth);
    const g = ctx.createLinearGradient(0, h * 0.08, 0, h * 0.94);
    if (dark) {
      g.addColorStop(0, '#15171b');
      g.addColorStop(1, '#1d2026');
    } else {
      g.addColorStop(0, warm < 0.7 ? '#7c5a34' : '#56606e');
      g.addColorStop(0.55, warm < 0.7 ? '#4a3420' : '#333b46');
      g.addColorStop(1, warm < 0.7 ? '#2a1e14' : '#20252c');
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, h * 0.08, gw, h * 0.86);
    if (!dark) {
      // (lamps over a counter at the back, a screen on a wall, the people in it against the light)
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(255,214,150,0.85)';
        ctx.beginPath();
        ctx.arc(x + gw * (0.14 + 0.24 * i), h * 0.2, h * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rnd() < 0.7) {
        ctx.fillStyle = rnd() < 0.5 ? '#9fc4e8' : '#c9d8a0';
        ctx.fillRect(x + gw * (0.1 + rnd() * 0.55), h * 0.3, gw * 0.2, h * 0.16);
      }
      const people = 2 + Math.floor(rnd() * 5);
      for (let i = 0; i < people; i++) {
        const px = x + gw * (0.08 + 0.84 * rnd());
        const ph = h * (0.36 + rnd() * 0.1);
        ctx.fillStyle = rnd() < 0.5 ? '#16110d' : '#221a14';
        ctx.beginPath();
        ctx.roundRect(px - gw * 0.045, h * 0.94 - ph * 0.72, gw * 0.09, ph * 0.72, gw * 0.03);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, h * 0.94 - ph * 0.86, gw * 0.028, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // (the glass's posts, and the rail along its foot)
    ctx.fillStyle = look.frame;
    const posts = bays > 8 ? 3 : 4;
    for (let i = 1; i < posts; i++) ctx.fillRect(x + (gw * i) / posts - 1, h * 0.08, 2, h * 0.86);
    ctx.fillStyle = `#${pier.clone().multiplyScalar(1.6).getHexString()}`;
    ctx.fillRect(x, h * 0.8, gw, h * 0.025);
    ctx.fillRect(x, h * 0.06, gw, h * 0.02);
  }
}

/** The concourse's signs with no building of its own: amber, red, blue, white light. */
const SIGNS = ['#e8b04a', '#d8574a', '#5aa0d8', '#e9e2cf'];

/**
 * The concourse's wall behind the walkway: counters under lit signs (bars of light, no words, in `signs`:
 * the building's colours), doorways, plain wall with a section's number between them on a plate (`plate`),
 * people walking past against the light. `seed` lays out the building's own run of them; `wall` is what the
 * wall is made of (Venue.concourse: dark, brick, pale stone, timber, or `paint` deep).
 */
function paintShops(cv: HTMLCanvasElement, signs = SIGNS, plate = '#3a332c', seed = 0, wall: Venue['concourse'] = 'dark', paint = '#3a332c') {
  const ctx = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  ctx.fillStyle = { dark: '#211c18', brick: '#4a2519', stone: '#6a645a', timber: '#5e3d22', paint: `#${new Color(paint).multiplyScalar(0.42).getHexString()}` }[wall];
  ctx.fillRect(0, 0, w, h);
  // (the wall's own face: courses of brick, blocks of stone, boards of timber; a painted one has a line along its foot)
  if (wall === 'brick') {
    ctx.fillStyle = 'rgba(20, 10, 6, 0.55)';
    const c = h / 14;
    for (let y = 0, row = 0; y < h; y += c, row++) {
      ctx.fillRect(0, y, w, 1);
      for (let x = (row % 2) * c; x < w; x += c * 2) ctx.fillRect(x, y, 1, c);
    }
  } else if (wall === 'stone') {
    ctx.fillStyle = 'rgba(30, 26, 20, 0.45)';
    for (let y = h / 3; y < h; y += h / 3) ctx.fillRect(0, y, w, 1);
    for (let x = 0, k = 0; x < w; x += h * 0.9, k++) ctx.fillRect(x + (k % 2) * h * 0.45, 0, 1, h);
  } else if (wall === 'timber') {
    for (let x = 0, k = 0; x < w; x += 6, k++) {
      ctx.fillStyle = k % 3 === 0 ? 'rgba(255, 210, 160, 0.08)' : k % 3 === 1 ? 'rgba(20, 10, 4, 0.25)' : 'rgba(0, 0, 0, 0)';
      ctx.fillRect(x, 0, 4, h);
    }
  } else if (wall === 'paint') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(0, h * 0.92, w, h * 0.03);
  }
  let n = 41 + (seed % 9973);
  const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
  const bays = 8;
  const bw = w / bays;
  for (let b = 0; b < bays; b++) {
    const x = b * bw;
    const kind = (b + seed) % 4;
    if (kind === 1) {
      // a doorway through to the rest of the building
      const g = ctx.createLinearGradient(0, h * 0.2, 0, h);
      g.addColorStop(0, '#6e5230');
      g.addColorStop(1, '#d8a055');
      ctx.fillStyle = g;
      ctx.fillRect(x + bw * 0.3, h * 0.22, bw * 0.4, h * 0.78);
      ctx.fillStyle = '#39d27a';
      ctx.fillRect(x + bw * 0.42, h * 0.1, bw * 0.16, h * 0.07);
    } else if (kind === 3) {
      ctx.fillStyle = plate;
      ctx.fillRect(x + bw * 0.06, h * 0.1, bw * 0.88, h * 0.9);
      ctx.fillStyle = '#d9d2c4';
      ctx.font = `700 ${Math.round(h * 0.26)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(101 + b * 3), x + bw * 0.5, h * 0.44);
    } else {
      // a counter: its opening lit from inside, a run of sign over it in some colour of light
      const g = ctx.createLinearGradient(0, h * 0.34, 0, h * 0.9);
      g.addColorStop(0, '#f3d49a');
      g.addColorStop(1, '#8a6436');
      ctx.fillStyle = g;
      ctx.fillRect(x + bw * 0.05, h * 0.36, bw * 0.9, h * 0.4);
      ctx.fillStyle = '#17120e';
      ctx.fillRect(x + bw * 0.05, h * 0.76, bw * 0.9, h * 0.24);
      const sign = signs[Math.floor(rnd() * signs.length)];
      ctx.fillStyle = sign;
      ctx.fillRect(x + bw * 0.08, h * 0.1, bw * 0.84, h * 0.19);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 0; i < 5; i++) ctx.fillRect(x + bw * (0.13 + 0.16 * i), h * 0.14, bw * (0.06 + 0.05 * rnd()), h * 0.11);
    }
  }
  for (let i = 0; i < 26; i++) {
    const px = rnd() * w;
    const ph = h * (0.56 + rnd() * 0.1);
    ctx.fillStyle = ['#120e0b', '#1b1511', '#241c16'][i % 3];
    ctx.beginPath();
    ctx.roundRect(px - h * 0.07, h - ph * 0.84, h * 0.14, ph * 0.84, h * 0.04);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, h - ph * 0.92, h * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A tunnel's mouth: the concourse's light, brightest at head height, the floor catching it, a couple of people coming or going against it. */
function paintDoor(cv: HTMLCanvasElement) {
  const ctx = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5a3f22');
  g.addColorStop(0.3, '#f0c488');
  g.addColorStop(0.75, '#c08a4a');
  g.addColorStop(1, '#8a6032');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fbe6bf';
  for (let i = 0; i < 3; i++) ctx.fillRect(w * (0.14 + 0.3 * i), h * 0.1, w * 0.14, h * 0.05);
  for (const [x, tall] of [
    [0.3, 0.6],
    [0.68, 0.66],
  ]) {
    ctx.fillStyle = '#2a1d12';
    ctx.beginPath();
    ctx.roundRect(w * (x - 0.07), h * (1 - tall * 0.84), w * 0.14, h * tall * 0.84, w * 0.04);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * x, h * (1 - tall * 0.92), w * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  const edge = ctx.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, 'rgba(20,14,8,0.7)');
  edge.addColorStop(0.12, 'rgba(20,14,8,0)');
  edge.addColorStop(0.88, 'rgba(20,14,8,0)');
  edge.addColorStop(1, 'rgba(20,14,8,0.7)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
}

/** How many ft of the wall along the top of the lower bowl one turn of its picture covers, and how much of its light it keeps (paint under a dimmed house). */
const BAND_FT = 72;
const BAND_TONE = 0.55;

/** That wall's picture: its colour (a shade toward grey), a pinstripe top and foot, and the team's name along it twice a turn (light letters on a dark wall, dark on a light one). */
function paintBand(cv: HTMLCanvasElement, color: string, name: string) {
  const ctx = cv.getContext('2d')!;
  const { width: w, height: h } = cv;
  const c = new Color(color);
  const grey = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  c.lerp(new Color(grey, grey, grey), 0.25);
  ctx.fillStyle = `#${c.getHexString()}`;
  ctx.fillRect(0, 0, w, h);
  const ink = grey > 0.4 ? '#1c1d20' : '#ece7dc';
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(0, h * 0.1, w, Math.max(1, h * 0.04));
  ctx.fillRect(0, h * 0.86, w, Math.max(1, h * 0.04));
  ctx.globalAlpha = 0.9;
  if (name) {
    ctx.font = `800 ${Math.round(h * 0.56)}px "Archivo Variable", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = name.toUpperCase().split('').join(String.fromCharCode(8202));
    for (const x of [0.25, 0.75]) ctx.fillText(text, w * x, h * 0.52, w * 0.36);
  }
  ctx.globalAlpha = 1;
}

function paintExit(cv: HTMLCanvasElement) {
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#0f7a3e';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#eafff2';
  ctx.font = `800 ${Math.round(cv.height * 0.62)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', cv.width / 2, cv.height * 0.54);
}

export class Bowl {
  readonly group = new Group();
  /** Every seat and standing place, for the crowd. */
  readonly seats: Seat[] = [];
  /** Where the chairs on the floor are (the benches' kind of chair, with people in them). */
  readonly chairs: { x: number; y: number; z: number; turn: number }[] = [];
  /** Where a ribbon board goes on each side's fascia: its middle, its length, which way it faces. */
  readonly ribbons: { x: number; y: number; z: number; w: number; turn: number }[] = [];
  /** Points up in the upper deck (cameras go off there too). */
  readonly high: number[] = [];
  /** Where a ribbon of lamps runs along the wall at the top of the lower bowl, in a building that has one (the boards make it). */
  readonly fasciaRuns: { x: number; y: number; z: number; w: number; h: number; turn: number }[] = [];
  /** That wall (shown in a building that has one: see fascia). */
  private band: Mesh | null = null;
  private readonly bandMat: MeshLambertMaterial;
  private readonly bandTex: CanvasTexture;
  private readonly suiteTex: CanvasTexture;
  private readonly deck: CanvasTexture;
  private readonly shops: CanvasTexture;
  private readonly up = { value: 0 };
  private readonly trim: MeshLambertMaterial;
  private readonly concrete: MeshLambertMaterial;
  /** The walls' tops' colour with all its light, and how much of it the stands have now (see dim). */
  private readonly trimTone = new Color(1, 1, 1);
  /** The edges of the aisles' steps, and their colour with all its light (Venue.aisles). */
  private readonly steps: MeshLambertMaterial;
  private readonly stepTone = new Color(0.45, 0.44, 0.38);
  private stands = 1;
  private lightTo = 1;
  /** The building's concrete (warm, plain or cool) and its house lights, as a tint on what is lit (the plain building's: none). */
  private readonly concreteTone = new Color(1, 1, 1);
  private readonly houseTone = new Color(1, 1, 1);
  private readonly apron: MeshLambertMaterial;
  private readonly glowFloor: MeshBasicMaterial;
  /** The lit pictures and how bright each is at full light. */
  private readonly lit: { mat: MeshBasicMaterial; glow: number }[] = [];
  /** What a slow device gives up: the glass and rails and the light spilt on steps (1), the upper levels' pictures left as they are. */
  private readonly fine: Object3D[] = [];
  private board = '';

  /** The building's faces as built for its stands (see build: built again for another building's), and its stands then. */
  private built: Mesh[] = [];
  private shape = '';
  /** The pictures' and the fine parts' materials (made once, for every building). */
  private readonly mats: { rows: Material; suites: Material; shops: Material; doors: Material; signs: Material; pane: Material; rail: Material; spilt: Material };
  /** The step a slow device is on (see shed), and whether the wall along the top of the lower bowl is up (see paint). */
  private level: 0 | 1 | 2 = 0;
  private banded = false;

  constructor(private readonly keep: Keep) {
    const picture = (tex: CanvasTexture | null, glow: number) => {
      const mat = keep(new MeshBasicMaterial({ map: tex, vertexColors: true, side: DoubleSide }));
      this.lit.push({ mat, glow });
      return mat;
    };
    this.concrete = keep(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    this.concrete.onBeforeCompile = unshadowed;
    this.trim = keep(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    this.trim.onBeforeCompile = unshadowed;
    this.bandTex = texture(keep, 1024, 64, (cv) => paintBand(cv, '#3a3c42', ''));
    this.bandMat = keep(new MeshLambertMaterial({ map: this.bandTex, vertexColors: true, side: DoubleSide }));
    this.bandMat.onBeforeCompile = unshadowed;
    this.steps = keep(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    this.steps.onBeforeCompile = unshadowed;
    this.deck = texture(keep, 2048, 256, (cv) => paintDeck(cv, '#2a2c33'));
    const rows = picture(this.deck, DECK_GLOW);
    rows.alphaTest = 0.5;
    // (each seat's person is drawn sat, the picture's lower half, or on his feet, its upper: the more of them the
    // more the building cheers, each at his own moment)
    rows.onBeforeCompile = (sh) => {
      sh.uniforms.uUp = this.up;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uUp;').replace(
        '#include <map_fragment>',
        `{
          float seat = floor(vMapUv.x * ${UP_SEATS}.0);
          float keen = fract(sin(seat * 12.9898) * 43758.5453);
          vec2 at = vec2(vMapUv.x, vMapUv.y + 0.5 * step(keen, uUp * 1.3 - 0.15));
          diffuseColor *= textureGrad(map, at, dFdx(vMapUv), dFdy(vMapUv));
        }`,
      );
    };
    rows.customProgramCacheKey = () => 'upperRows';
    this.suiteTex = texture(keep, 1024, 96, (cv) => paintSuites(cv));
    this.shops = texture(keep, 1024, 96, (cv) => paintShops(cv));
    const spilt = keep(new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.lit.push({ mat: spilt, glow: 1 });
    this.mats = {
      rows,
      suites: picture(this.suiteTex, SUITE_GLOW),
      shops: picture(this.shops, SHOP_GLOW),
      doors: picture(texture(keep, 128, 96, paintDoor, false), DOOR_GLOW),
      signs: picture(texture(keep, 64, 24, paintExit, false), SIGN_GLOW),
      // (glass: mostly what is behind it, and the building's lights on its face)
      pane: keep(
        new MeshStandardMaterial({ color: 0xcfe0ea, roughness: 0.08, metalness: 0, envMapIntensity: 0.35, transparent: true, opacity: 0.14, side: DoubleSide, depthWrite: false }),
      ),
      rail: keep(new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 })),
      spilt,
    };
    this.apron = keep(new MeshLambertMaterial({ color: 0x1d1e22 }));
    this.glowFloor = keep(new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    // the chairs on the floor: along the near side (not where the opening's camera starts from), and in the far corners past the benches
    for (let x = -47; x <= 47; x += 2.35) {
      if (x > -12 && x < -1) continue;
      this.chairs.push({ x, y: 0, z: COURT_Z, turn: Math.PI });
    }
    for (const e of [-1, 1]) for (let i = 0; i < 6; i++) this.chairs.push({ x: e * (42.5 + i * 2.35), y: 0, z: -(HALF_W + SIDE + 3.6), turn: 0 });
    this.build(STANDS);
  }

  /**
   * The building's faces for its stands (Venue.stands), and every seat and standing place in them: made again
   * when a building with other stands is painted (its seats with them: the crowd sits again, crowd.ts). The
   * ribbon's and the fascia's runs and the upper deck's points are where they are in every building.
   */
  private build(st: Stands) {
    const keep = this.keep;
    for (const m of this.built) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.built = [];
    this.fine.length = 0;
    this.seats.length = 0;
    this.ribbons.length = 0;
    this.high.length = 0;
    this.fasciaRuns.length = 0;
    this.shape = JSON.stringify(st);
    const vom = [st.vom, st.vom + VOM_ROWS - 1];
    const every = st.aisle;
    const first = Math.floor(every / 2);
    const [deck0, deck1] = st.deck;
    const concrete = new Soup();
    const trim = new Soup();
    const glass = new Soup();
    const rail = new Soup();
    const spill = new Soup();
    const nosing = new Soup();
    const doors = new Soup();
    const signs = new Soup();
    const suites = new Soup();
    const shops = new Soup();
    const deck = new Soup();
    const band = new Soup();
    const cover = new Soup();
    let n = 97;
    const rnd = () => ((n = (n * 16807) % 2147483647) & 0xffff) / 0xffff;
    const WARM = '#ffb060';

    for (const s of SIDES) {
      const aisles: number[] = [];
      for (let k = first; (k + 0.5) * SEAT < s.half + TOP; k += every) aisles.push((k + 0.5) * SEAT, -(k + 0.5) * SEAT);
      // (a tunnel where an aisle is well inside the side at the tunnel's rows, not across a corner: in every such aisle, or every other)
      const tunnels = aisles.filter(
        (u, i) => Math.floor(i / 2) % st.tunnels === 0 && Math.abs(u) + VOM_HALF + 6 < s.half + vom[0] * DEEP && (s.k === 0 || s.k === 3 || Math.abs(u) < 30),
      );
      // (the players' tunnel: under the end stands, by the far corner)
      const gates = s.k === 1 ? [s.half - GATE_IN] : s.k === 2 ? [-(s.half - GATE_IN)] : [];
      /** What comes through a row: each a middle and half a width. */
      const holes = (row: number): [number, number][] =>
        [
          ...(row >= vom[0] && row <= vom[1] ? tunnels.map((t): [number, number] => [t, VOM_HALF]) : []),
          ...(row < GATE_ROWS ? gates.map((t): [number, number] => [t, GATE_HALF]) : []),
        ].sort((a, b) => a[0] - b[0]);
      const inTunnel = (row: number, u: number) =>
        holes(row).some(([t, half]) => Math.abs(u - t) < half) ||
        // (press row along the far side's first row; the broadcast's platform in the near stands)
        (s.k === 0 && row === 0 && Math.abs(u) < PRESS) ||
        (s.k === 3 && row >= DECK_ROWS[0] && row <= DECK_ROWS[1] && Math.abs(u) < DECK_HALF);
      // (the near side: the timeout's camera stands in its first rows, off to one side)
      const well = (row: number, u: number) => s.k === 3 && row < 3 && u > 22 && u < 40;

      // the front wall, its padded top in the building's colour (open where the players' tunnel comes out)
      {
        let from = -s.half;
        for (const to of [...gates.map((t) => t - GATE_HALF), s.half]) {
          concrete.quad(P(s, from, 0, 0), P(s, to, 0, 0), P(s, to, Y0 + 1, 0), P(s, from, Y0 + 1, 0), '#34363c');
          trim.quad(P(s, from, Y0 + 0.74, -0.03), P(s, to, Y0 + 0.74, -0.03), P(s, to, Y0 + 1.06, -0.03), P(s, from, Y0 + 1.06, -0.03), '#ffffff');
          trim.quad(P(s, from, Y0 + 1.06, -0.03), P(s, to, Y0 + 1.06, -0.03), P(s, to, Y0 + 1.06, 0.35), P(s, from, Y0 + 1.06, 0.35), '#ffffff', 0.8);
          from = to + 2 * GATE_HALF;
        }
      }

      // the rows: each a step and the rise to the next (left out where a tunnel comes through), and its seats
      for (let i = 0; i < ROWS; i++) {
        const d0 = i * DEEP;
        const d1 = d0 + DEEP;
        const y = Y0 + i * RISE;
        const l = lit(i);
        let from = -Infinity;
        for (const [cut, wide] of [...holes(i), [Infinity, 0]]) {
          const to = cut === Infinity ? Infinity : cut - wide;
          const a0 = from === -Infinity ? -(s.half + d0) : from;
          const a1 = from === -Infinity ? -(s.half + d1) : from;
          const b0 = to === Infinity ? s.half + d0 : to;
          const b1 = to === Infinity ? s.half + d1 : to;
          concrete.quad(P(s, a0, y, d0), P(s, b0, y, d0), P(s, b1, y, d1), P(s, a1, y, d1), '#3a3c42', l);
          concrete.quad(P(s, a1, y, d1), P(s, b1, y, d1), P(s, b1, y + RISE, d1), P(s, a1, y + RISE, d1), '#2a2c31', l);
          from = cut + wide;
        }
        const d = d0 + 1.3;
        for (let k = -Math.ceil((s.half + d) / SEAT); (k + 0.5) * SEAT < s.half + d - 0.5; k++) {
          const u = (k + 0.5) * SEAT;
          if (u < -(s.half + d) + 0.5) continue;
          const aisle = (k >= 0 ? k : -k - 1) % every === first;
          if (inTunnel(i, u) || well(i, u)) continue;
          // (a building that closes its corners' high rows: nobody in them, under the cover)
          if (st.corners === 'covered' && i >= COVER_ROW && Math.abs(u) > s.half - SEAT / 2) continue;
          if (aisle) {
            // an aisle: a half step in each row, its edges marked (in the building's own: Venue.aisles)
            const [a, b] = [u - SEAT / 2, u + SEAT / 2];
            const half = d0 + DEEP / 2;
            concrete.quad(P(s, a, y + RISE / 2, half), P(s, b, y + RISE / 2, half), P(s, b, y + RISE / 2, d1), P(s, a, y + RISE / 2, d1), '#5a5c63', l);
            nosing.quad(P(s, a, y, half), P(s, b, y, half), P(s, b, y + RISE / 2, half), P(s, a, y + RISE / 2, half), '#ffffff', l * 0.8);
            nosing.quad(
              P(s, a, y + RISE / 2 + 0.01, half),
              P(s, b, y + RISE / 2 + 0.01, half),
              P(s, b, y + RISE / 2 + 0.01, half + 0.3),
              P(s, a, y + RISE / 2 + 0.01, half + 0.3),
              '#ffffff',
              l,
            );
            nosing.quad(P(s, a, y + 0.08, d0), P(s, b, y + 0.08, d0), P(s, b, y + 0.08, d0 + 0.3), P(s, a, y + 0.08, d0 + 0.3), '#ffffff', l);
            concrete.quad(P(s, a, y + 0.07, d0), P(s, b, y + 0.07, d0), P(s, b, y + 0.07, half), P(s, a, y + 0.07, half), '#5a5c63', l);
            // (now and then someone stood on it: on his way to his seat, or watching from there; more of them higher up)
            if (Math.abs(Math.sin(i * 12.9898 + k * 78.233 + s.k * 37.719) * 43758.5453) % 1 < AISLE_STAND * (0.4 + i / ROWS)) {
              const [x, , z] = P(s, u, 0, half + DEEP * 0.2);
              this.seats.push({ x, y: y + RISE / 2, z, turn: s.turn + (((i * 7 + k) % 5) - 2) * 0.35, row: i, side: s.k, kind: 'stand', lit: l, stall: false });
            }
            continue;
          }
          const [x, , z] = P(s, u, 0, d);
          this.seats.push({ x, y, z, turn: s.turn, row: i, side: s.k, kind: 'seat', lit: s.k === 3 ? l * (NEAR_LIT + (1 - NEAR_LIT) * Math.max(0, 1 - i / 3)) : l, stall: true });
        }
      }

      // the tunnels: a landing at the first row's level (the players': the ground), walls up to the roof of it, the
      // concourse's light in its mouth
      const mouths = [
        ...tunnels.map((t) => ({ t, half: VOM_HALF, r0: vom[0], r1: vom[1], y0: Y0 + vom[0] * RISE })),
        ...gates.map((t) => ({ t, half: GATE_HALF, r0: 0, r1: GATE_ROWS - 1, y0: 0 })),
      ];
      for (const { t, half, r0, r1, y0 } of mouths) {
        const [a, b] = [t - half, t + half];
        const d0 = r0 * DEEP;
        const d1 = (r1 + 1) * DEEP;
        // (the stands' line over it, at its mouth and at its door)
        const ys = Y0 + r0 * RISE;
        const y1 = Y0 + (r1 + 1) * RISE;
        const l = lit(r0);
        concrete.quad(P(s, a, y0 + 0.01, d0), P(s, b, y0 + 0.01, d0), P(s, b, y0 + 0.01, d1), P(s, a, y0 + 0.01, d1), '#4c483f', [l * 0.7, l * 0.7, l * 1.1, l * 1.1]);
        spill.quad(P(s, a, y0 + 0.05, d0), P(s, b, y0 + 0.05, d0), P(s, b, y0 + 0.05, d1), P(s, a, y0 + 0.05, d1), WARM, [0, 0, 0.16, 0.16]);
        for (const u of [a, b]) {
          // (the wall: under the stands' line inside, and a parapet over it)
          concrete.quad(P(s, u, y0, d0), P(s, u, y0, d1), P(s, u, y1, d1), P(s, u, ys, d0), '#4a463c', [l * 0.6, l * 1.1, l * 0.9, l * 0.6]);
          concrete.quad(P(s, u, ys, d0), P(s, u, y1, d1), P(s, u, y1 + 1.5, d1), P(s, u, ys + 1.5, d0), '#3a3c42', l);
          trim.quad(P(s, u - 0.12, ys + 1.5, d0), P(s, u - 0.12, y1 + 1.5, d1), P(s, u + 0.12, y1 + 1.5, d1), P(s, u + 0.12, ys + 1.5, d0), '#ffffff', 0.8);
        }
        doors.quad(P(s, a + 0.8, y0, d1), P(s, b - 0.8, y0, d1), P(s, b - 0.8, y1 - 0.5, d1), P(s, a + 0.8, y1 - 0.5, d1), '#ffffff', 1, [0, 0, 1, 1]);
        for (const [p, q] of [
          [a, a + 0.8],
          [b - 0.8, b],
        ])
          concrete.quad(P(s, p, y0, d1 - 0.02), P(s, q, y0, d1 - 0.02), P(s, q, y1 - 0.5, d1 - 0.02), P(s, p, y1 - 0.5, d1 - 0.02), '#34363c', l);
        concrete.quad(P(s, a, y1 - 0.5, d1 - 0.02), P(s, b, y1 - 0.5, d1 - 0.02), P(s, b, y1 + 1.5, d1 - 0.02), P(s, a, y1 + 1.5, d1 - 0.02), '#34363c', l);
        trim.quad(P(s, a, y1 + 1.5, d1 - 0.2), P(s, b, y1 + 1.5, d1 - 0.2), P(s, b, y1 + 1.5, d1 + 0.2), P(s, a, y1 + 1.5, d1 + 0.2), '#ffffff', 0.8);
        signs.quad(
          P(s, t - 1.5, y1 - 0.2, d1 - 0.06),
          P(s, t + 1.5, y1 - 0.2, d1 - 0.06),
          P(s, t + 1.5, y1 + 0.9, d1 - 0.06),
          P(s, t - 1.5, y1 + 0.9, d1 - 0.06),
          '#ffffff',
          1,
          [0, 0, 1, 1],
        );
        if (!r0) {
          // (the players' tunnel: its light out on the ground in front of it, and the building's colour over its mouth)
          spill.quad(P(s, t - half - 2, 0.03, -9), P(s, t + half + 2, 0.03, -9), P(s, b, 0.03, 0), P(s, a, 0.03, 0), WARM, [0, 0, 0.14, 0.14]);
          trim.quad(P(s, a, ys + 1.5, d0 - 0.04), P(s, b, ys + 1.5, d0 - 0.04), P(s, b, ys + 2.6, d0 - 0.04), P(s, a, ys + 2.6, d0 - 0.04), '#ffffff', 0.9);
          continue;
        }
        // (its light on the steps of the aisle below, and on the people either side of them)
        const back = 3.4 * DEEP;
        spill.quad(
          P(s, t - 3.4, y0 - (back / DEEP) * RISE + 1.1, d0 - back),
          P(s, t + 3.4, y0 - (back / DEEP) * RISE + 1.1, d0 - back),
          P(s, t + 3, y0 + 1.1, d0),
          P(s, t - 3, y0 + 1.1, d0),
          WARM,
          [0, 0, 0.1, 0.1],
        );
      }

      // (a building that closes its corners' high rows: a cover over them, its name printed along it in bands,
      // clear of the steps under it)
      if (st.corners === 'covered') {
        const [d0, y0] = [COVER_ROW * DEEP, Y0 + COVER_ROW * RISE + 1.6];
        const [a, b] = [s.half, s.half + d0];
        const [c, d] = [s.half + TOP, s.half];
        const v = Math.hypot(TOP - d0, TOP_Y - Y0 - COVER_ROW * RISE) / COVER_BAND;
        cover.quad(P(s, -b, y0, d0), P(s, -a, y0, d0), P(s, -d, TOP_Y + 1.6, TOP), P(s, -c, TOP_Y + 1.6, TOP), '#ffffff', [0.7, 0.7, 1, 1], [-b / BAND_FT, 0, -a / BAND_FT, v]);
        cover.quad(P(s, a, y0, d0), P(s, b, y0, d0), P(s, c, TOP_Y + 1.6, TOP), P(s, d, TOP_Y + 1.6, TOP), '#ffffff', [0.7, 0.7, 1, 1], [a / BAND_FT, 0, b / BAND_FT, v]);
      }

      // the top of the bowl: a rail of glass behind the last row, the walkway, people standing at the rail
      {
        const e = s.half + TOP;
        const wall = WALL + s.set;
        concrete.quad(
          P(s, -e, TOP_Y, TOP),
          P(s, e, TOP_Y, TOP),
          P(s, s.half + WALL + s.hi, TOP_Y, wall),
          P(s, -(s.half + WALL + s.lo), TOP_Y, wall),
          '#4a4640',
          [0.7, 0.7, 1.15, 1.15],
        );
        concrete.quad(P(s, -e, TOP_Y, TOP + 0.3), P(s, e, TOP_Y, TOP + 0.3), P(s, e, TOP_Y + 1.1, TOP + 0.3), P(s, -e, TOP_Y + 1.1, TOP + 0.3), '#34363c', 0.75);
        glass.quad(P(s, -e, TOP_Y + 1.1, TOP + 0.3), P(s, e, TOP_Y + 1.1, TOP + 0.3), P(s, e, TOP_Y + 3.5, TOP + 0.3), P(s, -e, TOP_Y + 3.5, TOP + 0.3), '#ffffff');
        rail.bar(P(s, -e, TOP_Y + 3.55, TOP + 0.3), P(s, e, TOP_Y + 3.55, TOP + 0.3), 0.16, 0.16, '#8d9199');
        // (in a building that has one, a wall in front of that glass in the rail's colour, darker at its foot, a cap
        // along its top; a ribbon of lamps along it in some: Venue.fascia)
        {
          const [y0, y1, d, f] = [TOP_Y - 0.2, TOP_Y + FASCIA_UP, TOP + 0.2, e + 0.2];
          band.quad(P(s, -f, y0, d), P(s, f, y0, d), P(s, f, y1, d), P(s, -f, y1, d), '#ffffff', [0.7, 0.7, 1, 1], [-f / BAND_FT, 0, f / BAND_FT, 1]);
          band.quad(P(s, -f, y1, d), P(s, f, y1, d), P(s, f, y1, d + 0.45), P(s, -f, y1, d + 0.45), '#ffffff', 0.72, [0.01, 0.5, 0.02, 0.5]);
          const mid = P(s, 0, TOP_Y + FASCIA_UP / 2, d - 0.04);
          this.fasciaRuns.push({ x: mid[0], y: mid[1], z: mid[2], w: 2 * f, h: FASCIA_UP - 1, turn: s.turn });
        }
        for (let u = -e + 3; u < e - 3; u += 2.3) {
          if (rnd() > 0.42) continue;
          const [x, , z] = P(s, u + (rnd() - 0.5) * 0.8, 0, TOP + 1.9 + rnd() * 0.8);
          this.seats.push({ x, y: TOP_Y, z, turn: s.turn, row: ROWS, side: s.k, kind: 'stand', lit: RAIL_LIT, stall: false });
        }
        // (the near side's terrace: people about on it, behind the rail)
        if (s.set)
          for (let i = 0; i < 90; i++) {
            const [x, , z] = P(s, (rnd() - 0.5) * 2 * (e - 4), 0, TOP + 5 + rnd() * (s.set - 4));
            this.seats.push({ x, y: TOP_Y, z, turn: s.turn + (rnd() - 0.5) * 1.2, row: ROWS, side: s.k, kind: 'stand', lit: RAIL_LIT * 0.9, stall: false });
          }

        // the concourse's wall under the suites, the suites' soffit and their windows, the band the ribbon is on
        const [lo, hi] = [-(s.half + WALL + s.lo), s.half + WALL + s.hi];
        shops.quad(P(s, lo, TOP_Y, wall), P(s, hi, TOP_Y, wall), P(s, hi, SOFFIT, wall), P(s, lo, SOFFIT, wall), '#ffffff', 1, [lo / SHOP_FT, 0, hi / SHOP_FT, 1]);
        const f = FASCIA + s.set;
        const [flo, fhi] = [-(s.half + FASCIA + s.lo), s.half + FASCIA + s.hi];
        concrete.quad(P(s, flo, SOFFIT, f), P(s, fhi, SOFFIT, f), P(s, hi, SOFFIT, wall), P(s, lo, SOFFIT, wall), '#3a352e', [0.5, 0.5, 1, 1]);
        suites.quad(P(s, flo, SOFFIT, f), P(s, fhi, SOFFIT, f), P(s, fhi, SILL, f), P(s, flo, SILL, f), '#ffffff', 1, [flo / SUITE_FT, 0, fhi / SUITE_FT, 1]);
        concrete.quad(P(s, flo, SILL, f - 0.3), P(s, fhi, SILL, f - 0.3), P(s, fhi, BAND, f - 0.3), P(s, flo, BAND, f - 0.3), '#202226');
        concrete.quad(P(s, flo, SILL, f - 0.3), P(s, fhi, SILL, f - 0.3), P(s, fhi, SILL, f), P(s, flo, SILL, f), '#202226', 0.6);
        const mid = P(s, (s.hi - s.lo) / 2, RIBBON_Y, f - 0.33);
        this.ribbons.push({ x: mid[0], y: mid[1], z: mid[2], w: fhi - flo - 1, turn: s.turn });

        // the upper deck: the rows of its slope the building has (Venue.stands), glass along the front of the first;
        // in front of them, where its first rows are missing, a second ring of suites (a club level) on the
        // suites' face and its floor back to them; its rows (a picture); the wall behind up to the roof, a ring of
        // lit windows along it over a short deck
        const u0 = f + 0.4;
        const [a0, a1] = [deck0 * UP_DEEP, (deck1 + 1) * UP_DEEP];
        const [y0, top] = [BAND + deck0 * UP_RISE, BAND + (deck1 + 1) * UP_RISE];
        const u1 = u0 + a1;
        if (deck0) {
          suites.quad(P(s, flo, BAND, f), P(s, fhi, BAND, f), P(s, fhi, y0 - 1.2, f), P(s, flo, y0 - 1.2, f), '#ffffff', 0.85, [
            flo / SUITE_FT + 0.37,
            0,
            fhi / SUITE_FT + 0.37,
            1,
          ]);
          concrete.quad(P(s, flo, y0 - 1.2, f - 0.3), P(s, fhi, y0 - 1.2, f - 0.3), P(s, fhi, y0, f - 0.3), P(s, flo, y0, f - 0.3), '#202226');
          concrete.quad(P(s, flo, y0, f - 0.3), P(s, fhi, y0, f - 0.3), P(s, fhi + a0, y0, u0 + a0), P(s, flo - a0, y0, u0 + a0), '#26282d', 0.7);
        }
        const [glo, ghi] = [flo - a0, fhi + a0];
        const gz = deck0 ? u0 + a0 - 0.2 : f - 0.2;
        glass.quad(P(s, glo, y0, gz), P(s, ghi, y0, gz), P(s, ghi, y0 + 2.6, gz), P(s, glo, y0 + 2.6, gz), '#ffffff');
        rail.bar(P(s, glo, y0 + 2.65, gz), P(s, ghi, y0 + 2.65, gz), 0.16, 0.16, '#8d9199');
        const [dlo, dhi] = [flo - a1, fhi + a1];
        concrete.quad(P(s, glo, y0, u0 + a0), P(s, ghi, y0, u0 + a0), P(s, dhi, top, u1), P(s, dlo, top, u1), '#1d1e22', [0.9, 0.9, 0.5, 0.5]);
        for (let r = deck0; r <= deck1; r++) {
          // (a row: its people's picture stood up along the back of its step, each row's run of it begun somewhere else)
          const back = r * UP_DEEP + 1.3;
          const y = BAND + r * UP_RISE + 0.75;
          const off = Math.floor(rnd() * UP_SEATS) / UP_SEATS + r * 3;
          const light = 0.95 - 0.5 * (r / 13);
          deck.quad(
            P(s, flo - back, y, u0 + back),
            P(s, fhi + back, y, u0 + back),
            P(s, fhi + back, y + UP_TALL, u0 + back),
            P(s, flo - back, y + UP_TALL, u0 + back),
            '#ffffff',
            light,
            [(flo - back) / DECK_FT + off, 0, (fhi + back) / DECK_FT + off, 0.5],
          );
        }
        concrete.quad(P(s, dlo, top, u1), P(s, dhi, top, u1), P(s, dhi, ROOF_TOP, u1), P(s, dlo, ROOF_TOP, u1), '#26282d', [0.9, 0.9, 0.35, 0.35]);
        if (deck1 < 13) {
          const [w0, w1] = [top + CLERESTORY[0], top + CLERESTORY[0] + CLERESTORY[1]];
          suites.quad(P(s, dlo, w0, u1 - 0.05), P(s, dhi, w0, u1 - 0.05), P(s, dhi, w1, u1 - 0.05), P(s, dlo, w1, u1 - 0.05), '#ffffff', 0.55, [
            dlo / SUITE_FT,
            0,
            dhi / SUITE_FT,
            1,
          ]);
        }
        for (let u = -Math.floor((fhi - 20) / 60) * 60; u < fhi - 20; u += 60)
          signs.quad(
            P(s, u - 1.5, top + 3, u1 - 0.1),
            P(s, u + 1.5, top + 3, u1 - 0.1),
            P(s, u + 1.5, top + 4.1, u1 - 0.1),
            P(s, u - 1.5, top + 4.1, u1 - 0.1),
            '#ffffff',
            1,
            [0, 0, 1, 1],
          );
        // (points up in the rows every building's deck has: the cameras going off there)
        for (let i = 0; i < (fhi - flo) * 0.5; i++) {
          const r = UP_ALL[0] + (UP_ALL[1] + 0.5 - UP_ALL[0]) * rnd();
          const span = fhi - flo + 2 * r * UP_DEEP;
          this.high.push(...P(s, flo - r * UP_DEEP + rnd() * span, BAND + r * UP_RISE + 4, u0 + r * UP_DEEP));
        }
      }
    }

    // the chairs on the floor (see the constructor), and the people in them
    for (const c of this.chairs) this.seats.push({ x: c.x, y: 0.12, z: c.z, turn: c.turn, row: 0, side: c.turn ? 3 : 0, kind: 'court', lit: 0.85, stall: false });

    // --- what stands about on the ground and in the stands: the broadcast's cameras, press row, cables, the corners ---
    /** A box by its middle and its sizes (its top and four sides). */
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, shade = 1) => {
      const [x0, x1, y0, y1, z0, z1] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2, z - d / 2, z + d / 2];
      concrete.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, shade);
      concrete.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, shade * 0.8);
      concrete.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, shade * 0.8);
      concrete.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, shade * 0.65);
      concrete.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, shade * 0.65);
    };
    /** A broadcast camera on its tripod, stood at (x, y, z) and looking at the middle of the floor: three legs, a head, the body, a long lens, a viewfinder, and a mat under it on the ground. */
    const camera = (x: number, y: number, z: number) => {
      const to = Math.hypot(x, z) || 1;
      const [fx, fz] = [-x / to, -z / to];
      const top: V3 = [x, y + 4.4, z];
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 + 0.5;
        rail.bar(top, [x + Math.cos(a) * 1.5, y, z + Math.sin(a) * 1.5], 0.14, 0.14, '#3a3c42');
      }
      rail.bar([x, y + 4.4, z], [x, y + 4.9, z], 0.3, 0.3, '#2a2c30');
      rail.bar([x - fx * 1.1, y + 5.35, z - fz * 1.1], [x + fx * 0.7, y + 5.35, z + fz * 0.7], 0.75, 0.95, '#1c1d21');
      rail.bar([x + fx * 0.7, y + 5.35, z + fz * 0.7], [x + fx * 2.3, y + 5.3, z + fz * 2.3], 0.5, 0.5, '#111214');
      rail.bar([x - fx * 1.1, y + 5.95, z - fz * 1.1], [x - fx * 0.4, y + 5.95, z - fz * 0.4], 0.5, 0.36, '#16171a');
      if (y < 0.5) concrete.quad([x - 2.4, 0.015, z + 2.4], [x + 2.4, 0.015, z + 2.4], [x + 2.4, 0.015, z - 2.4], [x - 2.4, 0.015, z - 2.4], '#101114');
    };
    // on the ground: one by each baseline on the far half (the near half is the replays' own), one in each near corner
    const baseX = MID + END + 4.3;
    for (const e of [-1, 1]) {
      camera(e * baseX, 0, -12.5);
      camera(e * (MID + END + 2.5), 0, HALF_W + SIDE + 4.2);
      // (their cables: off along the boards to the corner, and a run of them along the near side under the chairs' feet)
      concrete.quad(
        [e * (baseX + 1.4), 0.012, -12.5],
        [e * (baseX + 1.8), 0.012, -12.5],
        [e * (baseX + 1.8), 0.012, -(FAR - 2.4)],
        [e * (baseX + 1.4), 0.012, -(FAR - 2.4)],
        '#0a0a0c',
      );
      concrete.quad(
        [e * 4, 0.012, COURT_Z - 2.9],
        [e * (MID + END + 2.5), 0.012, COURT_Z - 2.9],
        [e * (MID + END + 2.5), 0.012, COURT_Z - 2.6],
        [e * 4, 0.012, COURT_Z - 2.6],
        '#0a0a0c',
      );
    }
    // the broadcast's platform in the near stands: a deck over three rows, a rail round it: where the main camera stands
    {
      const s = SIDES[3];
      const [d0, d1] = [DECK_ROWS[0] * DEEP, (DECK_ROWS[1] + 1) * DEEP];
      const y = Y0 + DECK_ROWS[1] * RISE + 0.1;
      const l = lit(DECK_ROWS[0]) * NEAR_LIT;
      concrete.quad(P(s, -DECK_HALF, y, d0), P(s, DECK_HALF, y, d0), P(s, DECK_HALF, y, d1), P(s, -DECK_HALF, y, d1), '#2c2e33', l);
      concrete.quad(P(s, -DECK_HALF, y - RISE - 0.1, d0), P(s, DECK_HALF, y - RISE - 0.1, d0), P(s, DECK_HALF, y, d0), P(s, -DECK_HALF, y, d0), '#202226', l);
      for (const u of [-DECK_HALF, DECK_HALF]) {
        concrete.quad(P(s, u, y - RISE - 0.1, d0), P(s, u, y - 0.1, d0 + DEEP), P(s, u, y, d0 + DEEP), P(s, u, y, d0), '#202226', l);
        rail.bar(P(s, u, y + 3.2, d0), P(s, u, y + 3.2, d1), 0.14, 0.14, '#8d9199');
      }
      rail.bar(P(s, -DECK_HALF, y + 3.2, d0), P(s, DECK_HALF, y + 3.2, d0), 0.14, 0.14, '#8d9199');
      for (let u = -DECK_HALF; u <= DECK_HALF; u += DECK_HALF / 2) rail.bar(P(s, u, y, d0), P(s, u, y + 3.2, d0), 0.12, 0.12, '#8d9199');
      // (the main camera itself stands here, cameras.ts `mount`: nothing on the deck is in its way)
    }
    // press row: a long desk along the far side's first row, a cloth in the building's colour down its front, screens and lamps on it
    {
      const y = Y0 + 2.45;
      const z = -(FAR + 1.25);
      box(0, Y0 + 1.25, z, 2 * PRESS, 2.5, 1.9, '#26282d');
      trim.quad([-PRESS, Y0 + 1.1, z + 0.97], [PRESS, Y0 + 1.1, z + 0.97], [PRESS, y + 0.02, z + 0.97], [-PRESS, y + 0.02, z + 0.97], '#ffffff', 0.7);
      for (let x = -PRESS + 2.2; x < PRESS - 1; x += 3.8) {
        box(x, y + 0.5, z + 0.25, 1.5, 0.95, 0.12, '#131416');
        box(x + 1.7, y + 0.06, z - 0.1, 0.9, 0.08, 0.7, '#3c3e44');
        spill.quad([x - 0.7, y + 0.06, z + 0.17], [x + 0.7, y + 0.06, z + 0.17], [x + 0.7, y + 0.94, z + 0.17], [x - 0.7, y + 0.94, z + 0.17], '#9fc4e8', 0.5);
      }
    }
    // the corners: where two front walls meet, a splayed wall across the corner and a level behind it (no bare mitre)
    for (const [cx, cz, gate] of [
      [-ENDX, -FAR, true],
      [ENDX, -FAR, true],
      [-ENDX, NEAR, false],
      [ENDX, NEAR, false],
    ] as const) {
      const leg = gate ? 4.2 : 7;
      const [ix, iz] = [-Math.sign(cx), -Math.sign(cz)];
      const a: V3 = [cx + ix * leg, 0, cz];
      const b: V3 = [cx, 0, cz + iz * leg];
      const up = (v: V3, y: number): V3 => [v[0], y, v[2]];
      concrete.quad(a, b, up(b, Y0 + 2.4), up(a, Y0 + 2.4), '#2e3036');
      concrete.quad(up(a, Y0 + 2.4), up(b, Y0 + 2.4), [cx, Y0 + 2.4, cz], up(a, Y0 + 2.4), '#3a3c42');
      trim.quad(up(a, Y0 + 1.9), up(b, Y0 + 1.9), up(b, Y0 + 2.42), up(a, Y0 + 2.42), '#ffffff', 0.9);
      trim.quad(
        [a[0] + ix * 0.03, Y0 + 1.9, a[2] + iz * 0.03],
        [b[0] + ix * 0.03, Y0 + 1.9, b[2] + iz * 0.03],
        [b[0] + ix * 0.03, Y0 + 2.42, b[2] + iz * 0.03],
        [a[0] + ix * 0.03, Y0 + 2.42, a[2] + iz * 0.03],
        '#ffffff',
        0.9,
      );
    }

    // made: each kind of face one shape, in what it is made of (the materials are the building's for good: see the constructor)
    const add = (soup: Soup, mat: Material, order = 0) => {
      const mesh = new Mesh(soup.geo(keep), mat);
      mesh.renderOrder = order;
      this.group.add(mesh);
      this.built.push(mesh);
      return mesh;
    };
    add(concrete, this.concrete);
    add(trim, this.trim);
    this.band = add(band, this.bandMat);
    this.band.visible = this.banded;
    add(cover, this.bandMat);
    this.fine.push(add(nosing, this.steps));
    add(deck, this.mats.rows);
    add(suites, this.mats.suites);
    add(shops, this.mats.shops);
    add(doors, this.mats.doors);
    add(signs, this.mats.signs);
    this.fine.push(add(glass, this.mats.pane, 1));
    this.fine.push(add(rail, this.mats.rail));
    this.fine.push(add(spill, this.mats.spilt, 1));

    // the ground round the floor, out to the stands: dark, a little of the building's colour in it; and on it
    // the light the boards behind the baskets and along the far side throw (the building's colour, as they are)
    const ground = new Soup();
    const [gx, gf, gn] = [ENDX + 0.5, -(FAR + 0.5), NEAR + 0.5];
    ground.quad([-gx, -0.012, gn], [gx, -0.012, gn], [gx, -0.012, gf], [-gx, -0.012, gf], '#ffffff');
    add(ground, this.apron);
    const glow = new Soup();
    const ex = MID + END + 6.1;
    for (const e of [-1, 1]) glow.quad([e * ex, 0.02, 22], [e * ex, 0.02, -22], [e * (ex - 7.5), 0.02, -22], [e * (ex - 7.5), 0.02, 22], '#ffffff', [0.3, 0.3, 0, 0]);
    const fz = -(FAR - 1.9);
    glow.quad([-ENDX, 0.02, fz], [ENDX, 0.02, fz], [ENDX, 0.02, fz + 5.5], [-ENDX, 0.02, fz + 5.5], '#ffffff', [0.2, 0.2, 0, 0]);
    this.fine.push(add(glow, this.glowFloor, 1));
    this.shed(this.level);
  }

  /**
   * The building's colour: the ground round the floor, the boards' light on the ground; and its own
   * (`venue`: the home team's building) the walls' padded tops, the empty seats of the upper deck's
   * picture, the concrete's tone and the house lights' colour on what is lit, what its concourse's wall is
   * made of, its suites' glass, and the wall along the top of its lower bowl if it has one. A building whose
   * stands are built otherwise than the last's (Venue.stands) is built again first: its seats with it.
   */
  paint(board: string, venue?: Venue) {
    const stands = venue?.stands ?? STANDS;
    if (JSON.stringify(stands) !== this.shape) this.build(stands);
    const key = venue
      ? `${board}|${venue.seed}|${venue.rail}|${venue.seats[2]}|${venue.concrete}|${venue.house}|${venue.fascia}|${venue.concourse}|${JSON.stringify(venue.suites)}|${venue.paint}|${venue.aisles}`
      : board;
    if (key === this.board) return;
    this.board = key;
    const c = this.trimTone.set(venue?.rail ?? board);
    const grey = Math.max(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 0.02);
    c.lerp(new Color(grey, grey, grey), TRIM_GREY).multiplyScalar(TRIM_TONE);
    this.trim.color.copy(c).multiplyScalar(this.stands);
    this.apron.color.set('#1d1e22').lerp(new Color(board), 0.12);
    this.glowFloor.color.set(board).lerp(new Color('#ffffff'), 0.35);
    const seat = new Color(venue?.seats[2] ?? board);
    const seatGrey = Math.max(0.2126 * seat.r + 0.7152 * seat.g + 0.0722 * seat.b, 0.02);
    seat.lerp(new Color(seatGrey, seatGrey, seatGrey), TRIM_GREY).multiplyScalar(0.6);
    paintDeck(this.deck.image as HTMLCanvasElement, `#${seat.getHexString()}`);
    this.deck.needsUpdate = true;
    // (the concourse's signs in its colours, lit, and white; its section plates in its colour, deep)
    paintShops(this.shops.image as HTMLCanvasElement, venue ? [...venue.signs, '#e9e2cf'] : SIGNS, venue?.plate, venue?.seed, venue?.concourse, venue?.paint);
    this.shops.needsUpdate = true;
    // (its suites, and the wall along the top of its lower bowl if it has one)
    paintSuites(this.suiteTex.image as HTMLCanvasElement, venue?.suites);
    this.suiteTex.needsUpdate = true;
    this.banded = !!venue && venue.fascia !== 'glass';
    if (this.band) this.band.visible = this.banded;
    paintBand(this.bandTex.image as HTMLCanvasElement, venue?.rail ?? board, venue?.baselines[1] ?? '');
    this.bandTex.needsUpdate = true;
    const step = this.stepTone.set(venue?.aisles ?? '#8f8a72');
    const stepGrey = Math.max(0.2126 * step.r + 0.7152 * step.g + 0.0722 * step.b, 0.02);
    step.lerp(new Color(stepGrey, stepGrey, stepGrey), 0.2).multiplyScalar(0.62);
    this.concreteTone.set(venue?.concrete ?? '#ffffff');
    // (the lit faces are painted under the plain building's lights: a warm or a cool house is that much off it)
    const plain = new Color(HOUSE_PLAIN);
    const house = new Color(venue?.house ?? HOUSE_PLAIN);
    this.houseTone.setRGB(house.r / plain.r, house.g / plain.g, house.b / plain.b);
    this.dim(this.lightTo, this.stands);
  }

  /** How much of the upper deck is on its feet (0 to 1). */
  cheer(up: number) {
    this.up.value = up;
  }

  /** How much of their light the lit faces keep (1: all of it), and the steps and the walls with the people on them (`stands`). */
  dim(to: number, stands = to) {
    this.lightTo = to;
    for (const { mat, glow } of this.lit) mat.color.copy(this.houseTone).multiplyScalar(glow * to);
    this.stands = stands;
    this.concrete.color.copy(this.concreteTone).multiplyScalar(stands);
    this.trim.color.copy(this.trimTone).multiplyScalar(stands);
    this.bandMat.color.setScalar(BAND_TONE * stands);
    this.steps.color.copy(this.stepTone).multiplyScalar(stands);
  }

  /** A device that can't keep up: no glass, rails, nor light spilt on the steps and the ground, nor the aisles' marked edges. */
  shed(level: 0 | 1 | 2) {
    this.level = level;
    for (const o of this.fine) o.visible = level < 1;
  }
}
