// The building's boards and what they show: the LED front of the scorer's table, the boards behind each
// basket and along the far side, the ribbon round the bowl, the scoreboard's four screens and its ring
// over centre court, and the clocks on top of each backboard. Each is a small canvas, painted again only
// when what it shows changes (a new scene, the clock's next second), and drawn unlit, as lamps: what
// moves all the time (a band of light going along it, the ribbon's crawl, a pulse) is its shader, not a
// new picture. Close to, a board is rows of lamps; far off, the picture they make.
// They show tonight's game as the court has played it (`SceneProps.game`) and what just happened in it,
// read off the stage (House): a three, a dunk, an and-one, the home side on defence, a timeout, the end
// of a quarter, the final. It is the home team's building: the boards make a noise for its own and go
// back to the score for the visitors'. Words on them are the plain ones a building uses.
import {
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  type Material,
} from 'three';
import { BASKET, COURT_LEN, toWorld, type Script } from '../choreo';
import type { GameInfo, Stage } from '../Court';
import type { MatchKit } from '../../teamColors';
import { ShotClock, shotText } from '../shotClock';

type Keep = <T extends { dispose(): void }>(o: T) => T;

// ---------------------------------------------------------------------------------------------------
// what the building knows of the game

/** What the building makes a noise about (or, a timeout, only says). */
export type Call = 'three' | 'dunk' | 'andOne' | 'block' | 'steal' | 'buzzer' | 'winner' | 'basket' | 'free' | 'timeout';
/** The calls that take the boards over (the home side's) and bring the building up. */
export const BIG: ReadonlySet<Call> = new Set(['three', 'dunk', 'andOne', 'block', 'steal', 'buzzer', 'winner']);

export interface Moment {
  call: Call;
  /** Whose it was (null: a timeout the boards can't put a team to). */
  side: 0 | 1 | null;
  /** How long ago (ms of the clock's real time). */
  ms: number;
}

/**
 * The game as the building sees it, read off the stage each frame: the score and clock (from the page),
 * whose ball it is, a man at the line, the shot clock, and the last thing worth a board. Frames are read
 * as the court reaches them, so nothing is known before it has been played.
 */
export class House {
  game: GameInfo | null = null;
  final: 0 | 1 | undefined = undefined;
  clutch = false;
  moment: Moment | null = null;
  /** Whose ball it is while a play runs (null between possessions). */
  off: 0 | 1 | null = null;
  /** A man at the line: from the walk there to his last shot landing. */
  line = false;
  /** The end the play is at, as the scene's x goes (-1 the low end). */
  end: -1 | 1 = -1;
  /** Seconds on the shot clock; null when it is off. */
  shot: number | null = null;
  /** The last shot that missed: whose it was, how long ago (ms of the clock's real time), and whether it was a free throw. */
  miss: { side: 0 | 1; ms: number; line: boolean } | null = null;
  private script: Script | null = null;
  private seen = 0;
  private score: [number, number] | null = null;
  // the shot clock (the scorebug keeps one of its own off the same stage: the two always agree)
  private readonly clock = new ShotClock();
  /** Who made the last basket, for which side, and what he has now; and every scorer's points so far (as the court has played them). */
  star: { pid: number; side: 0 | 1; pts: number } | null = null;
  private readonly points = new Map<number, { side: 0 | 1; pts: number }>();
  /** What to take as the play while none is running (the scene lab's stills). */
  pretend: { off: 0 | 1; line: boolean; end: -1 | 1; shot: number | null } | null = null;

  read(stage: Stage, game: GameInfo | undefined, final: 0 | 1 | undefined, clutch: boolean, real: number) {
    this.game = game ?? null;
    this.final = final;
    this.clutch = clutch;
    if (this.moment) this.moment.ms += real;
    if (this.miss) this.miss.ms += real;
    const sc = stage.script;
    const play = stage.play;
    if (!sc || !play) {
      const fake = this.pretend;
      this.off = fake?.off ?? null;
      this.line = fake?.line ?? false;
      this.end = fake?.end ?? this.end;
      this.shot = fake?.shot ?? null;
      return;
    }
    if (sc !== this.script) {
      // (a new game: nobody has scored)
      if (game && game.q === 1 && game.score[0] + game.score[1] === 0) {
        this.points.clear();
        this.star = null;
      }
      this.script = sc;
      this.seen = 0;
      this.score = game ? [game.score[0], game.score[1]] : null;
    }
    this.off = sc.off;
    this.end = toWorld(BASKET, sc.dir).y < COURT_LEN / 2 ? -1 : 1;
    // (the frames before the move it is in have been reached)
    const reached = Math.min(play.i, sc.frames.length);
    for (; this.seen < reached; this.seen++) this.saw(sc, this.seen);
    this.shot = this.clock.read(sc, play);
    this.line = this.clock.line;
  }

  /** A side's top scorer so far (null: nobody has scored for it). */
  leader(side: 0 | 1): { pid: number; side: 0 | 1; pts: number } | null {
    let best: { pid: number; side: 0 | 1; pts: number } | null = null;
    for (const [pid, v] of this.points) if (v.side === side && (!best || v.pts > best.pts)) best = { pid, ...v };
    return best;
  }

  private saw(sc: Script, k: number) {
    const f = sc.frames[k];
    const text = f.flash?.text ?? '';
    const call = (c: Call, side: 0 | 1 | null) => void (this.moment = { call: c, side, ms: 0 });
    const def = (1 - sc.off) as 0 | 1;
    if (f.fx === 'make' && f.score) {
      const pts = this.score ? f.score[sc.off] - this.score[sc.off] : Number(/^\+(\d)/.exec(text)?.[1] ?? 2);
      const dunk = !!sc.frames[k - 1]?.act.includes('dunk');
      // (whose it was: the man who had the ball before it went in)
      const pid = [...sc.oPids, ...sc.dPids][sc.frames[k - 1]?.hold ?? -1];
      if (pid !== undefined && pts > 0) {
        const had = this.points.get(pid)?.pts ?? 0;
        this.points.set(pid, { side: sc.off, pts: had + pts });
        this.star = { pid, side: sc.off, pts: had + pts };
      }
      call(text === 'Game winner' ? 'winner' : text === 'Buzzer beater' ? 'buzzer' : text.endsWith('FT') ? 'free' : dunk ? 'dunk' : pts === 3 ? 'three' : 'basket', sc.off);
    } else if (text === 'And one!') call('andOne', sc.off);
    else if (f.flash?.kind === 'block') call('block', def);
    else if (text === 'Steal') call('steal', def);
    else if (f.fx === 'miss') this.miss = { side: sc.off, ms: 0, line: this.clock.line };
    else if (text.startsWith('Timeout')) {
      const ab = this.game?.abbrevs;
      call('timeout', ab && text === `Timeout ${ab[0]}` ? 0 : ab && text === `Timeout ${ab[1]}` ? 1 : null);
    }
    if (f.score) this.score = [f.score[0], f.score[1]];
  }
}

// ---------------------------------------------------------------------------------------------------
// the lamps

/**
 * A board's surface: unlit, its picture as rows of lamps. Each texel of the canvas is one lamp, a round
 * dot with black between, until a lamp is smaller than a pixel (then only the picture is left: the dots
 * would shimmer). On top, what moves without a new picture: a band of light going along it now and then
 * (`uSweep`), the picture crawling along (`uCrawl`, in its own widths), a slow pulse (`uPulse`).
 */
const LED_HEAD = /* glsl */ `
  uniform vec2 uCells;
  uniform float uTime;
  uniform float uSweep;
  uniform float uCrawl;
  uniform float uPulse;`;
const LED_MAP = /* glsl */ `
  #ifdef USE_MAP
  {
    vec2 at = vec2(vMapUv.x + uCrawl, vMapUv.y);
    vec3 lit = texture2D(map, at).rgb;
    vec2 cell = at * uCells;
    float px = max(length(dFdx(cell)), length(dFdy(cell)));
    float lamp = smoothstep(0.5, 0.26, length(fract(cell) - 0.5));
    // (the dots' light, spread over the black between, comes to the picture's: about half a lamp is lit)
    lit *= mix(0.08 + 1.8 * lamp, 1.0, smoothstep(0.45, 1.2, px));
    float band = abs(fract(vMapUv.x * 0.5 - vMapUv.y * 0.03 - uTime * 0.07) - 0.5);
    lit *= 1.0 + uSweep * 1.3 * exp(-band * band * 900.0) - uPulse * 0.38 * (0.5 + 0.5 * cos(uTime * 6.3));
    diffuseColor.rgb *= lit;
  }
  #endif`;

/** How bright the lamps are against the floor's light (a lit sign reads brighter than a painted one). */
const GLOW = 1.15;
/** A board behind a close-up keeps this much of its light: the picture is the player. */
const BOARD_DIM = 0.4;

class Lamps {
  readonly cv = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  readonly tex: CanvasTexture;
  readonly time: { value: number };
  readonly sweep = { value: 0 };
  readonly crawl = { value: 0 };
  readonly pulse = { value: 0 };
  readonly cells: { value: Vector2 };
  /** What it shows, and what of that the picture last painted was of. */
  show: Show | null = null;
  key = '';
  /** A wipe from the last scene to this one: the scene going, and how far through (0..1; 1: none). */
  prev: Show | null = null;
  wipe = 1;
  painted = -Infinity;

  constructor(
    keep: Keep,
    readonly kind: Kind,
    w: number,
    h: number,
    time: { value: number },
    crawl = false,
  ) {
    this.cv.width = w;
    this.cv.height = h;
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.fillStyle = BLACK;
    this.ctx.fillRect(0, 0, w, h);
    this.tex = keep(new CanvasTexture(this.cv));
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.magFilter = NearestFilter;
    this.tex.minFilter = LinearMipmapLinearFilter;
    this.tex.anisotropy = 4;
    this.tex.wrapS = crawl ? RepeatWrapping : ClampToEdgeWrapping;
    this.time = time;
    this.cells = { value: new Vector2(w, h) };
  }

  /** A surface of this board (each its own brightness; all share the lamps' program): a new one, or one made elsewhere taken over. */
  material(keep: Keep, glow = GLOW, m = keep(new MeshBasicMaterial())): MeshBasicMaterial {
    m.map = this.tex;
    m.color.setScalar(glow);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uCells: this.cells, uTime: this.time, uSweep: this.sweep, uCrawl: this.crawl, uPulse: this.pulse });
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${LED_HEAD}`).replace('#include <map_fragment>', LED_MAP);
    };
    m.customProgramCacheKey = () => 'lamps';
    return m;
  }
}

// ---------------------------------------------------------------------------------------------------
// what a board shows

type Kind = 'table' | 'end' | 'ribbon' | 'far' | 'screen' | 'clock';
type Show =
  | { kind: 'home' }
  | { kind: 'score' }
  | { kind: 'defense' }
  | { kind: 'word'; text: string }
  | { kind: 'timeout'; side: 0 | 1 | null }
  | { kind: 'break'; text: string }
  | { kind: 'final' }
  | { kind: 'stat'; side: 0 | 1; name: string; num: string; pts: number; head: string }
  | { kind: 'noise' }
  | { kind: 'replay' }
  | { kind: 'ad'; i: number }
  | { kind: 'clock' };

/** One team on the boards: its letters, its colour, a second colour for stripes, the colour darkened for a field. */
interface Side {
  abbr: string;
  fill: string;
  trim: string;
  deep: string;
}
interface Look {
  home: Side;
  away: Side;
  game: GameInfo | null;
  shot: number | null;
  final: 0 | 1 | undefined;
  /** How loud the building is (0 to 1), and a count that goes up a few times a second (a noise meter's bars move on it). */
  noise: number;
  tick: number;
  /** The building's own look for its boards (Venue.boards): the far side's and the ribbon's runs of colour done one way or the other. */
  style: 0 | 1;
}

/** A big moment holds the boards this long (ms); a timeout a little longer. */
const TAKEOVER_MS = 3600;
const TIMEOUT_MS = 5200;
/** A board's turn between the home side's defence and what else it shows (s each). */
const DEFENSE_LOOP = [5, 6];
/** The ribbon crawls along at this many ft a second; its picture is this long (ft) before it comes round again. */
const CRAWL_FT_S = 2.6;
const RIBBON_FT = 61;
/** How often (ms) a board may be painted again: 15 a second at most. */
const PAINT_MS = 66;
/** A wipe from one scene to the next takes this long (ms). */
const WIPE_MS = 380;

const BLACK = '#040506';
const WHITE = '#f6f3ec';
const AMBER = '#ffb53a';
const RED = '#ff2d1f';
/** An unlit segment of a clock's figures: there, if you look. */
const GHOST = 'rgba(255, 60, 40, 0.07)';

/** After a big moment's word: the scorer's card on the screens and the table, REPLAY behind the baskets, for this long (ms). */
const CARD_MS = 4200;
/** The boards' turns while nothing takes them over (s each): the table's score, colours and a partner; the ends' colours and a partner; the ribbon's; a dead ball's on the screens (score, a scorer, a partner). */
const TABLE_TURNS = [9, 5, 6];
const END_TURNS = [9, 7];
const RIBBON_TURNS = [16, 9];
const SCREEN_TURNS = [4, 5, 4];
/**
 * The building's partners, as its boards carry them between plays: invented names, each a field, a
 * lettering colour, a second colour and one of four plain marks. None is a real company.
 */
const ADS = [
  { name: 'HALVERN', tag: 'PRIVATE BANK', bg: '#0d3b3a', fg: '#e9e2cf', hi: '#d9a441', mark: 0 },
  { name: 'TORRIN', tag: 'ELECTRIC MOTORS', bg: '#15171c', fg: '#f2f2f2', hi: '#e0452f', mark: 1 },
  { name: 'QUILLFIRE', tag: 'SPARKLING COLA', bg: '#7a1420', fg: '#fff3e2', hi: '#ffd24a', mark: 2 },
  { name: 'MERIDEW', tag: 'AIRWAYS', bg: '#123a6b', fg: '#f4f8ff', hi: '#7fd0ff', mark: 3 },
  { name: 'BRACKWATER', tag: 'INSURANCE', bg: '#2a2f24', fg: '#eef0e4', hi: '#a8c64a', mark: 0 },
  { name: 'LUMACORE', tag: 'HOME ENERGY', bg: '#3a2a0c', fg: '#fff6dc', hi: '#ffb53a', mark: 1 },
] as const;

const WORDS: Partial<Record<Call, string>> = { three: 'THREE', dunk: 'DUNK', andOne: 'AND ONE', block: 'BLOCK', steal: 'STEAL', buzzer: 'BUZZER BEATER', winner: 'GAME WINNER' };

/** The game clock as a board writes it: 11:45 over a minute, 45.3 under one (or 0:46, on a board that has no tenths). */
export function clockText(s: number, tenths = true): string {
  if (s >= 60 || (!tenths && s > 0)) {
    const whole = Math.ceil(s - 1e-6);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  return (Math.floor(Math.max(0, s) * 10) / 10).toFixed(1);
}
const period = (q: number) => (q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`);

// ---------------------------------------------------------------------------------------------------
// painting

/** The app's face, condensed and heavy, as a board's lettering. */
function face(ctx: CanvasRenderingContext2D, px: number, weight = 800) {
  // (an engine that doesn't take the width keyword in the shorthand keeps the first line; the property says it again where there is one)
  ctx.font = `${weight} ${px}px "Archivo Variable", system-ui, sans-serif`;
  ctx.font = `${weight} condensed ${px}px "Archivo Variable", system-ui, sans-serif`;
  if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'condensed';
}

/** Words at (x, y) (y their middle), squeezed across to fit `most` px; `slant` leans them forward. */
function write(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, most: number, color: string, align: CanvasTextAlign = 'center', slant = 0) {
  if (!text) return;
  face(ctx, px);
  const w = ctx.measureText(text).width;
  const k = w > most ? most / w : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(k, 0, -slant, 1, 0, 0);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  // (cap height sits a little high of the middle in most faces)
  ctx.fillText(text, 0, px * 0.04);
  ctx.restore();
}

/** Chevrons pointing `dir` (1 right, -1 left) from x0 to x1, filling the height between y0 and y1. */
function chevrons(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, dir: 1 | -1, color: string, alpha = 1) {
  const h = y1 - y0;
  const step = h * 0.62;
  const t = h * 0.2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = x0; x + step <= x1 + 0.5; x += step) {
    const a = dir > 0 ? x : x + step;
    const tip = a + dir * h * 0.42;
    ctx.moveTo(a, y0);
    ctx.lineTo(a + dir * t, y0);
    ctx.lineTo(tip + dir * t, y0 + h / 2);
    ctx.lineTo(a + dir * t, y1);
    ctx.lineTo(a, y1);
    ctx.lineTo(tip, y0 + h / 2);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** Stripes leaning forward, `w` wide and `gap` apart, from x0 to x1. */
function stripes(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, color: string, w: number, gap: number) {
  const lean = (y1 - y0) * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = x0 - lean; x < x1; x += w + gap) {
    ctx.moveTo(x + lean, y0);
    ctx.lineTo(x + lean + w, y0);
    ctx.lineTo(x + w, y1);
    ctx.lineTo(x, y1);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** A fence (the building's sign for defence): posts and two rails. */
function fence(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, color: string) {
  const h = y1 - y0;
  const post = Math.max(2, h * 0.12);
  const gap = h * 0.42;
  ctx.fillStyle = color;
  for (let x = x0; x + post <= x1; x += post + gap) {
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y0 + post);
    ctx.lineTo(x + post / 2, y0);
    ctx.lineTo(x + post, y0 + post);
    ctx.lineTo(x + post, y1);
    ctx.fill();
  }
  ctx.fillRect(x0, y0 + h * 0.3, x1 - x0, post * 0.8);
  ctx.fillRect(x0, y0 + h * 0.7, x1 - x0, post * 0.8);
}

/** Seven-segment figures (a clock's own), which segments each lights: bit 0 the top (a), round to f, g the middle. */
const SEGS: Record<string, number> = { '0': 0x3f, '1': 0x06, '2': 0x5b, '3': 0x4f, '4': 0x66, '5': 0x6d, '6': 0x7d, '7': 0x07, '8': 0x7f, '9': 0x6f, '-': 0x40, ' ': 0 };

/** Clock figures `h` px tall, their middle at (cx, cy): lit segments in `on`, the rest a ghost. Returns how wide they were. */
function seven(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, h: number, on: string, ghost = GHOST, measure = false): number {
  const w = h * 0.52;
  const gap = h * 0.16;
  const t = h * 0.13;
  const narrow = h * 0.22;
  const width = [...text].reduce((s, ch) => s + (ch === ':' || ch === '.' ? narrow : w + gap), -gap);
  if (measure) return width;
  let x = cx - width / 2;
  const y = cy - h / 2;
  const lean = h * 0.08;
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    // (pointed at both ends, a hair short of its neighbours; leaning forward like the clocks')
    const k = (yy: number) => (cy - yy) * (lean / h) * 2;
    const g = t * 0.22;
    if (ay === by) {
      const p = [
        [ax + g, ay],
        [ax + g + t / 2, ay - t / 2],
        [bx - g - t / 2, ay - t / 2],
        [bx - g, ay],
        [bx - g - t / 2, ay + t / 2],
        [ax + g + t / 2, ay + t / 2],
      ];
      ctx.beginPath();
      p.forEach(([px, py], i) => (i ? ctx.lineTo(px + k(py), py) : ctx.moveTo(px + k(py), py)));
      ctx.fill();
    } else {
      const p = [
        [ax, ay + g],
        [ax + t / 2, ay + g + t / 2],
        [ax + t / 2, by - g - t / 2],
        [ax, by - g],
        [ax - t / 2, by - g - t / 2],
        [ax - t / 2, ay + g + t / 2],
      ];
      ctx.beginPath();
      p.forEach(([px, py], i) => (i ? ctx.lineTo(px + k(py), py) : ctx.moveTo(px + k(py), py)));
      ctx.fill();
    }
  };
  for (const ch of text) {
    if (ch === ':' || ch === '.') {
      ctx.fillStyle = on;
      const s = t * 1.05;
      const dx = x + narrow / 2 - s / 2 - (ch === '.' ? 0 : -lean * 0.3);
      if (ch === ':') {
        ctx.fillRect(dx + lean * 0.5, y + h * 0.3 - s / 2, s, s);
        ctx.fillRect(dx - lean * 0.5, y + h * 0.7 - s / 2, s, s);
      } else ctx.fillRect(dx - lean, y + h - s, s, s);
      x += narrow;
      continue;
    }
    const bits = SEGS[ch] ?? 0;
    const l = x + t / 2;
    const r = x + w - t / 2;
    const top = y + t / 2;
    const mid = y + h / 2;
    const bot = y + h - t / 2;
    const segs: [number, number, number, number][] = [
      [l, top, r, top],
      [r, top, r, mid],
      [r, mid, r, bot],
      [l, bot, r, bot],
      [l, mid, l, bot],
      [l, top, l, mid],
      [l, mid, r, mid],
    ];
    segs.forEach((s, i) => {
      ctx.fillStyle = bits & (1 << i) ? on : ghost;
      seg(...s);
    });
    x += w + gap;
  }
  return width;
}

/** A partner's mark, r across, in one colour: a ring and its dot, two peaks, a diamond in a diamond, three leaning bars. */
function mark(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.26);
  ctx.beginPath();
  if (kind === 0) {
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 1) {
    for (const o of [-0.45, 0.35]) {
      ctx.moveTo(cx + (o - 0.55) * r, cy + r * 0.8);
      ctx.lineTo(cx + o * r, cy - r * (o < 0 ? 0.5 : 0.9));
      ctx.lineTo(cx + (o + 0.55) * r, cy + r * 0.8);
    }
    ctx.fill();
  } else if (kind === 2) {
    for (const k of [1, 0.45]) {
      ctx.moveTo(cx, cy - r * k);
      ctx.lineTo(cx + r * 0.7 * k, cy);
      ctx.lineTo(cx, cy + r * k);
      ctx.lineTo(cx - r * 0.7 * k, cy);
      ctx.closePath();
    }
    ctx.fill('evenodd');
  } else {
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(cx + i * r * 0.62 - r * 0.38, cy + r * 0.85);
      ctx.lineTo(cx + i * r * 0.62 - r * 0.02, cy + r * 0.85);
      ctx.lineTo(cx + i * r * 0.62 + r * 0.38, cy - r * 0.85);
      ctx.lineTo(cx + i * r * 0.62 + r * 0.02, cy - r * 0.85);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

/** A noise meter: bars from x0 to x1 rising left to right (or falling: `dir` -1), lit as far as `level` (0 to 1) says, green to amber to red; the top lit ones flicker on `tick`. */
function meter(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, level: number, tick: number, dir: 1 | -1 = 1, n = 12) {
  const bw = (x1 - x0) / n;
  const lit = Math.round(level * n + (((tick * 7) % 3) - 1) * 0.8);
  for (let i = 0; i < n; i++) {
    const k = dir > 0 ? i : n - 1 - i;
    const h = (y1 - y0) * (0.3 + (0.7 * (k + 1)) / n);
    ctx.fillStyle = k < lit ? (k < n * 0.5 ? '#3fd06a' : k < n * 0.8 ? AMBER : RED) : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x0 + i * bw + bw * 0.14, y1 - h, bw * 0.72, h);
  }
}

/** A team's block: its colour, its letters, and its score if there is one. */
function block(ctx: CanvasRenderingContext2D, side: Side, score: number | null, x: number, y: number, w: number, h: number, lead = true) {
  ctx.fillStyle = side.fill;
  ctx.fillRect(x, y, w, h);
  // (a thin edge in its second colour)
  ctx.fillStyle = side.trim;
  ctx.fillRect(x, y + h - Math.max(2, h * 0.07), w, Math.max(2, h * 0.07));
  if (score === null) {
    write(ctx, side.abbr, x + w / 2, y + h * 0.47, h * 0.78, w * 0.86, WHITE);
    return;
  }
  write(ctx, side.abbr, x + w * 0.06, y + h * 0.47, h * 0.66, w * 0.44, WHITE, 'left');
  // (the side behind is a shade less bright)
  write(ctx, String(score), x + w * 0.95, y + h * 0.47, h * 0.84, w * 0.44, lead ? WHITE : '#d9d6cf', 'right');
}

/** "Q2  4:31", in the clock's amber, its middle at x (whole seconds: only the clocks and the screens show tenths). */
function clockLine(ctx: CanvasRenderingContext2D, g: GameInfo, x: number, y: number, h: number) {
  const c = clockText(g.clock, false);
  const cw = seven(ctx, c, 0, 0, h * 0.66, AMBER, GHOST, true);
  const pw = h * 0.9;
  const left = x - (cw + pw + h * 0.3) / 2;
  write(ctx, period(g.q), left + pw / 2, y, h * 0.62, pw, AMBER);
  seven(ctx, c, left + pw + h * 0.3 + cw / 2, y, h * 0.66, AMBER);
}

/** What the boards say at the end of a quarter (null while one is on). */
function breakText(g: GameInfo | null): string | null {
  if (!g || g.clock > 0) return null;
  return g.q === 2 ? 'HALFTIME' : g.q < 4 ? `END OF Q${g.q}` : g.q === 4 ? 'END OF Q4' : 'END OF OT';
}

/** The long boards (the table, those behind the baskets, a run of ribbon): one scene across w x h. */
function strip(ctx: CanvasRenderingContext2D, w: number, h: number, show: Show, look: Look, kind: Kind) {
  const { home, away, game } = look;
  const ribbon = kind === 'ribbon' || kind === 'far';
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, w, h);
  const pad = h * 0.12;
  const score = (x: number, bw: number) => {
    // away, the clock, home: the order a building's boards go in
    if (!game) return;
    const bh = h - pad * 2;
    block(ctx, away, game.score[1], x, pad, bw * 0.36, bh, game.score[1] >= game.score[0]);
    clockLine(ctx, game, x + bw / 2, h / 2, bh);
    block(ctx, home, game.score[0], x + bw * 0.64, pad, bw * 0.36, bh, game.score[0] >= game.score[1]);
  };
  switch (show.kind) {
    case 'home':
    case 'score': {
      if (kind === 'far' && look.style === 1) {
        // (another building's: its colour all along, white letters, a pinstripe of its second colour top and foot)
        const field = ctx.createLinearGradient(0, 0, 0, h);
        field.addColorStop(0, home.deep);
        field.addColorStop(0.5, home.fill);
        field.addColorStop(1, home.deep);
        ctx.fillStyle = field;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = home.trim;
        ctx.fillRect(0, h * 0.1, w, Math.max(1, h * 0.05));
        ctx.fillRect(0, h * 0.85, w, Math.max(1, h * 0.05));
        for (let i = 0; i < 4; i++) if (home.abbr) write(ctx, home.abbr, (w / 4) * (i + 0.5), h / 2, h * 0.6, w * 0.08, WHITE, 'center', 0.12);
        break;
      }
      if (kind === 'far') {
        // behind the benches, kept quiet: the home side's letters in its colour now and then, a thin line of it top and foot
        ctx.fillStyle = home.deep;
        ctx.fillRect(0, 0, w, Math.max(2, h * 0.08));
        ctx.fillRect(0, h - Math.max(2, h * 0.08), w, Math.max(2, h * 0.08));
        for (let i = 0; i < 3; i++) {
          const cx = (w / 3) * (i + 0.5);
          if (home.abbr) write(ctx, home.abbr, cx, h / 2, h * 0.66, w * 0.1, home.fill, 'center', 0.12);
          chevrons(ctx, cx + w * 0.06, cx + w * 0.12, pad * 2, h - pad * 2, 1, home.trim, 0.55);
          chevrons(ctx, cx - w * 0.12, cx - w * 0.06, pad * 2, h - pad * 2, -1, home.trim, 0.55);
        }
        break;
      }
      if (ribbon && look.style === 1 && !game) {
        // (another building's run: its letters spaced along a dark field between rules of its colour)
        ctx.fillStyle = home.fill;
        ctx.fillRect(0, 0, w, Math.max(2, h * 0.14));
        ctx.fillRect(0, h - Math.max(2, h * 0.14), w, Math.max(2, h * 0.14));
        for (let i = 0; i < 3; i++) {
          write(ctx, home.abbr, (w / 3) * (i + 0.5), h / 2, h * 0.62, w * 0.18, WHITE, 'center', 0.12);
          stripes(ctx, (w / 3) * (i + 0.82), (w / 3) * (i + 0.98), h * 0.24, h * 0.76, home.trim, h * 0.12, h * 0.16);
        }
        break;
      }
      if (ribbon && look.style === 1) {
        // (with a game on: the score on a dark field, its colour in rules top and foot, its letters either side)
        ctx.fillStyle = home.fill;
        ctx.fillRect(0, 0, w, Math.max(2, h * 0.12));
        ctx.fillRect(0, h - Math.max(2, h * 0.12), w, Math.max(2, h * 0.12));
        write(ctx, home.abbr, w * 0.12, h / 2, h * 0.62, w * 0.2, WHITE, 'center', 0.12);
        score(w * 0.3, w * 0.42);
        stripes(ctx, w * 0.78, w * 0.98, h * 0.22, h * 0.78, home.trim, h * 0.14, h * 0.18);
        break;
      }
      if (ribbon) {
        // a run of ribbon: the home side's block, its stripes, the score, chevrons; then round again
        const deep = ctx.createLinearGradient(0, 0, 0, h);
        deep.addColorStop(0, home.deep);
        deep.addColorStop(0.5, home.fill);
        deep.addColorStop(1, home.deep);
        ctx.fillStyle = deep;
        ctx.fillRect(0, 0, w * 0.3, h);
        write(ctx, home.abbr, w * 0.15, h / 2, h * 0.8, w * 0.26, WHITE, 'center', 0.12);
        stripes(ctx, w * 0.3, w * 0.42, 0, h, home.trim, h * 0.22, h * 0.22);
        if (game) score(w * 0.45, w * 0.42);
        else write(ctx, home.abbr, w * 0.66, h / 2, h * 0.7, w * 0.4, home.fill);
        chevrons(ctx, w * 0.89, w * 0.995, pad, h - pad, 1, home.fill);
        break;
      }
      if (show.kind === 'score' && game) {
        // the score in the middle, the home side's chevrons out to the ends
        const bw = kind === 'table' ? w * 0.54 : w * 0.6;
        score((w - bw) / 2, bw);
        chevrons(ctx, pad, (w - bw) / 2 - pad * 2, pad * 1.6, h - pad * 1.6, -1, home.fill, 0.85);
        chevrons(ctx, (w + bw) / 2 + pad * 2, w - pad, pad * 1.6, h - pad * 1.6, 1, home.fill, 0.85);
        break;
      }
      // the home side's colours: its letters over and over, chevrons between pointing in to the middle
      const field = ctx.createLinearGradient(0, 0, 0, h);
      field.addColorStop(0, home.deep);
      field.addColorStop(0.5, home.fill);
      field.addColorStop(1, home.deep);
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, w, h);
      const n = kind === 'table' ? 3 : 4;
      const cell = w / n;
      for (let i = 0; i < n; i++) {
        const cx = cell * (i + 0.5);
        if (home.abbr) write(ctx, home.abbr, cx, h / 2, h * (i === 1 && n === 3 ? 0.86 : 0.74), cell * 0.4, WHITE, 'center', 0.12);
        else stripes(ctx, cx - cell * 0.2, cx + cell * 0.2, pad * 2, h - pad * 2, WHITE, h * 0.16, h * 0.3);
        const left = cx < w / 2;
        chevrons(ctx, cx + cell * 0.24, cx + cell * 0.5 - pad, pad * 1.4, h - pad * 1.4, left ? 1 : -1, home.trim, 0.9);
        chevrons(ctx, cx - cell * 0.5 + pad, cx - cell * 0.24, pad * 1.4, h - pad * 1.4, left ? 1 : -1, home.trim, 0.9);
      }
      break;
    }
    case 'defense': {
      ctx.fillStyle = home.deep;
      ctx.fillRect(0, 0, w, h);
      const n = ribbon ? 2 : kind === 'table' ? 3 : 4;
      const cell = w / n;
      for (let i = 0; i < n; i++) {
        const cx = cell * (i + 0.5);
        write(ctx, 'DEFENSE', cx, h / 2, h * 0.8, cell * 0.5, WHITE, 'center', 0.1);
        fence(ctx, cx - cell * 0.5 + pad, cx - cell * 0.3, pad * 1.5, h - pad * 1.5, home.trim);
        fence(ctx, cx + cell * 0.3, cx + cell * 0.5 - pad, pad * 1.5, h - pad * 1.5, home.trim);
      }
      break;
    }
    case 'word': {
      ctx.fillStyle = home.fill;
      ctx.fillRect(0, 0, w, h);
      stripes(ctx, 0, w, 0, h, home.deep, h * 0.3, h * 0.9);
      const n = ribbon ? 2 : kind === 'table' ? 3 : 4;
      const cell = w / n;
      for (let i = 0; i < n; i++) {
        const cx = cell * (i + 0.5);
        // (a shadow in its second colour, down and back, as a building's big words have)
        write(ctx, show.text, cx + h * 0.05, h / 2 + h * 0.05, h * 0.86, cell * 0.66, home.trim, 'center', 0.16);
        write(ctx, show.text, cx, h / 2, h * 0.86, cell * 0.66, WHITE, 'center', 0.16);
        chevrons(ctx, cx + cell * 0.36, cx + cell * 0.5 - pad, pad, h - pad, 1, WHITE, 0.85);
        chevrons(ctx, cx - cell * 0.5 + pad, cx - cell * 0.36, pad, h - pad, -1, WHITE, 0.85);
      }
      break;
    }
    case 'stat': {
      // a scorer's card: his number in his side's colour, his name, what he has tonight
      const who = show.side === 0 ? home : away;
      const n = ribbon ? 2 : kind === 'table' ? 1 : 2;
      const cell = w / n;
      ctx.fillStyle = who.deep;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const x = cell * i;
        ctx.fillStyle = who.fill;
        ctx.fillRect(x + cell * 0.08, pad, cell * 0.16, h - pad * 2);
        ctx.fillStyle = who.trim;
        ctx.fillRect(x + cell * 0.24, pad, Math.max(2, cell * 0.006), h - pad * 2);
        write(ctx, `#${show.num}`, x + cell * 0.16, h / 2, h * 0.7, cell * 0.14, WHITE, 'center', 0.1);
        write(ctx, show.name.toUpperCase(), x + cell * 0.27, h / 2, h * 0.62, cell * 0.3, WHITE, 'left');
        write(ctx, String(show.pts), x + cell * 0.74, h / 2, h * 0.86, cell * 0.12, WHITE, 'right', 0.1);
        write(ctx, 'PTS', x + cell * 0.755, h * 0.58, h * 0.42, cell * 0.1, who.trim === who.fill ? WHITE : who.trim, 'left');
        chevrons(ctx, x + cell * 0.88, x + cell - pad, pad * 1.6, h - pad * 1.6, 1, who.fill, 0.9);
        chevrons(ctx, x + pad, x + cell * 0.07, pad * 1.6, h - pad * 1.6, 1, who.fill, 0.9);
      }
      break;
    }
    case 'noise': {
      ctx.fillStyle = home.deep;
      ctx.fillRect(0, 0, w, h);
      const n = ribbon ? 2 : kind === 'table' ? 1 : 2;
      const cell = w / n;
      for (let i = 0; i < n; i++) {
        const cx = cell * (i + 0.5);
        write(ctx, 'MAKE SOME NOISE', cx, h / 2, h * 0.74, cell * 0.44, WHITE, 'center', 0.12);
        meter(ctx, cx - cell * 0.48, cx - cell * 0.26, pad, h - pad, look.noise, look.tick + i, -1);
        meter(ctx, cx + cell * 0.26, cx + cell * 0.48, pad, h - pad, look.noise, look.tick + i + 1, 1);
      }
      break;
    }
    case 'replay': {
      stripes(ctx, 0, w, 0, h, home.deep, h * 0.5, h * 1.4);
      const n = ribbon ? 2 : kind === 'table' ? 2 : 3;
      const cell = w / n;
      for (let i = 0; i < n; i++) {
        const cx = cell * (i + 0.5);
        write(ctx, 'REPLAY', cx, h / 2, h * 0.76, cell * 0.36, WHITE, 'center', 0.14);
        chevrons(ctx, cx - cell * 0.42, cx - cell * 0.24, pad * 1.4, h - pad * 1.4, -1, home.trim === home.fill ? WHITE : home.trim);
        chevrons(ctx, cx + cell * 0.24, cx + cell * 0.42, pad * 1.4, h - pad * 1.4, -1, home.trim === home.fill ? WHITE : home.trim);
      }
      break;
    }
    case 'ad': {
      // a partner's panel: its field, its mark, its name spaced wide, what it is in small letters; over and over along the board
      const ad = ADS[show.i % ADS.length];
      ctx.fillStyle = ad.bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = ad.hi;
      ctx.fillRect(0, h - Math.max(2, h * 0.07), w, Math.max(2, h * 0.07));
      const n = ribbon ? 3 : kind === 'table' ? 2 : 3;
      const cell = w / n;
      for (let i = 0; i < n; i++) {
        const x = cell * i;
        mark(ctx, ad.mark, x + cell * 0.13, h * 0.46, h * 0.32, ad.hi);
        write(ctx, ad.name.split('').join(' '), x + cell * 0.22, h * 0.4, h * 0.54, cell * 0.6, ad.fg, 'left');
        write(ctx, ad.tag, x + cell * 0.225, h * 0.76, h * 0.22, cell * 0.5, ad.hi, 'left');
      }
      break;
    }
    case 'timeout': {
      const who = show.side === null ? null : show.side === 0 ? home : away;
      const n = ribbon ? 2 : 1;
      const cell = w / n;
      for (let i = 0; i < n; i++) {
        const cx = cell * (i + 0.5);
        write(ctx, 'TIMEOUT', cx, h / 2, h * 0.76, cell * 0.3, WHITE);
        if (who) {
          block(ctx, who, null, cx - cell * 0.32, pad, cell * 0.12, h - pad * 2);
          block(ctx, who, null, cx + cell * 0.2, pad, cell * 0.12, h - pad * 2);
        }
      }
      break;
    }
    case 'break':
    case 'final': {
      const text = show.kind === 'final' ? 'FINAL' : show.text;
      const cell = ribbon ? w / 2 : w;
      for (let i = 0; i < (ribbon ? 2 : 1); i++) {
        const cx = cell * (i + 0.5);
        write(ctx, text, cx, h / 2, h * 0.74, cell * 0.2, WHITE);
        if (game) {
          const bh = h - pad * 2;
          block(ctx, away, game.score[1], cx - cell * 0.36, pad, cell * 0.22, bh, game.score[1] >= game.score[0]);
          block(ctx, home, game.score[0], cx + cell * 0.14, pad, cell * 0.22, bh, game.score[0] >= game.score[1]);
        }
      }
      break;
    }
    default:
      break;
  }
}

/** The scoreboard's screens: the score and the clocks, or a big moment over all of it. */
function screen(ctx: CanvasRenderingContext2D, w: number, h: number, show: Show, look: Look) {
  const { home, away, game, shot } = look;
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, w, h);
  // (the screen's lowest rows are what the screen under the scoreboard shows: the home colour)
  const foot = 3;
  const H = h - foot;
  ctx.fillStyle = home.fill;
  ctx.fillRect(0, H, w, foot);
  /** The score along the bottom, under a big word. */
  const under = () => {
    if (!game) return;
    const y = H * 0.8;
    const bh = H * 0.16;
    block(ctx, away, game.score[1], w * 0.08, y, w * 0.28, bh, game.score[1] >= game.score[0]);
    clockLine(ctx, game, w / 2, y + bh / 2, bh);
    block(ctx, home, game.score[0], w * 0.64, y, w * 0.28, bh, game.score[0] >= game.score[1]);
  };
  const big = (text: string, fill: string, deep: string, trim: string) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, deep);
    g.addColorStop(0.45, fill);
    g.addColorStop(0.75, deep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, H * 0.76);
    stripes(ctx, 0, w, H * 0.68, H * 0.74, trim, H * 0.04, H * 0.04);
    write(ctx, text, w / 2 + H * 0.012, H * 0.36 + H * 0.012, H * 0.44, w * 0.88, trim, 'center', 0.14);
    write(ctx, text, w / 2, H * 0.36, H * 0.44, w * 0.88, WHITE, 'center', 0.14);
    under();
  };
  switch (show.kind) {
    case 'home':
    case 'score': {
      if (!game) {
        big(home.abbr, home.fill, home.deep, home.trim);
        break;
      }
      // two panels, the visitors' on the left; the clocks between
      const pw = w * 0.36;
      const panel = (s: Side, pts: number, x: number, ahead: boolean) => {
        ctx.fillStyle = s.fill;
        ctx.fillRect(x, H * 0.04, pw, H * 0.24);
        ctx.fillStyle = s.trim;
        ctx.fillRect(x, H * 0.27, pw, H * 0.015);
        write(ctx, s.abbr, x + pw / 2, H * 0.16, H * 0.2, pw * 0.8, WHITE);
        write(ctx, String(pts), x + pw / 2, H * 0.62, H * 0.5, pw * 0.92, ahead ? WHITE : '#d9d6cf');
      };
      panel(away, game.score[1], w * 0.03, game.score[1] >= game.score[0]);
      panel(home, game.score[0], w - w * 0.03 - pw, game.score[0] >= game.score[1]);
      write(ctx, period(game.q), w / 2, H * 0.14, H * 0.16, w * 0.2, AMBER);
      seven(ctx, clockText(game.clock), w / 2, H * 0.44, H * 0.22, AMBER);
      if (shot !== null) seven(ctx, shotText(shot), w / 2, H * 0.78, H * 0.2, RED);
      break;
    }
    case 'defense': {
      ctx.fillStyle = home.deep;
      ctx.fillRect(0, 0, w, H * 0.76);
      write(ctx, 'DEFENSE', w / 2, H * 0.3, H * 0.36, w * 0.86, WHITE, 'center', 0.12);
      fence(ctx, w * 0.1, w * 0.9, H * 0.52, H * 0.7, home.trim);
      under();
      break;
    }
    case 'word':
      big(show.text, home.fill, home.deep, home.trim);
      break;
    case 'stat': {
      // a scorer's card: his number on his side's colour, his name, what he has tonight; the score under it
      const who = show.side === 0 ? home : away;
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, who.fill);
      g.addColorStop(0.36, who.fill);
      g.addColorStop(0.361, who.deep);
      g.addColorStop(1, BLACK);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, H * 0.76);
      stripes(ctx, w * 0.3, w * 0.36, 0, H * 0.76, who.trim, H * 0.05, H * 0.05);
      write(ctx, `#${show.num}`, w * 0.15, H * 0.38, H * 0.5, w * 0.26, WHITE, 'center', 0.1);
      write(ctx, show.head, w * 0.4, H * 0.1, H * 0.1, w * 0.5, who.trim === who.fill ? WHITE : who.trim, 'left');
      write(ctx, show.name.toUpperCase(), w * 0.4, H * 0.26, H * 0.2, w * 0.56, WHITE, 'left');
      write(ctx, String(show.pts), w * 0.4, H * 0.54, H * 0.36, w * 0.24, WHITE, 'left', 0.1);
      face(ctx, H * 0.36);
      const pw = Math.min(w * 0.24, ctx.measureText(String(show.pts)).width);
      write(ctx, 'PTS', w * 0.42 + pw, H * 0.6, H * 0.18, w * 0.2, AMBER, 'left');
      under();
      break;
    }
    case 'noise': {
      ctx.fillStyle = home.deep;
      ctx.fillRect(0, 0, w, H * 0.76);
      write(ctx, 'MAKE SOME NOISE', w / 2, H * 0.16, H * 0.24, w * 0.9, WHITE, 'center', 0.12);
      meter(ctx, w * 0.08, w * 0.92, H * 0.3, H * 0.72, look.noise, look.tick, 1, 20);
      under();
      break;
    }
    case 'ad': {
      const ad = ADS[show.i % ADS.length];
      ctx.fillStyle = ad.bg;
      ctx.fillRect(0, 0, w, H * 0.76);
      ctx.fillStyle = ad.hi;
      ctx.fillRect(0, H * 0.73, w, H * 0.03);
      mark(ctx, ad.mark, w * 0.5, H * 0.2, H * 0.14, ad.hi);
      write(ctx, ad.name.split('').join(' '), w / 2, H * 0.46, H * 0.2, w * 0.84, ad.fg);
      write(ctx, ad.tag, w / 2, H * 0.63, H * 0.08, w * 0.6, ad.hi);
      under();
      break;
    }
    case 'timeout': {
      const who = show.side === null ? null : show.side === 0 ? home : away;
      if (who) big(`${who.abbr} TIMEOUT`.trim(), who.fill, who.deep, who.trim);
      else {
        write(ctx, 'TIMEOUT', w / 2, H * 0.36, H * 0.4, w * 0.8, WHITE);
        under();
      }
      break;
    }
    case 'break':
    case 'final': {
      write(ctx, show.kind === 'final' ? 'FINAL' : show.text, w / 2, H * 0.17, H * 0.2, w * 0.8, WHITE);
      if (game) {
        const pw = w * 0.4;
        const one = (s: Side, pts: number, x: number, ahead: boolean) => {
          ctx.fillStyle = s.fill;
          ctx.fillRect(x, H * 0.34, pw, H * 0.6);
          write(ctx, s.abbr, x + pw / 2, H * 0.46, H * 0.16, pw * 0.8, WHITE);
          write(ctx, String(pts), x + pw / 2, H * 0.72, H * 0.34, pw * 0.86, ahead ? WHITE : '#d9d6cf');
        };
        one(away, game.score[1], w * 0.06, game.score[1] > game.score[0]);
        one(home, game.score[0], w * 0.54, game.score[0] > game.score[1]);
      }
      break;
    }
    default:
      break;
  }
}

/** The clocks on top of a backboard: the shot clock big and red, the game clock under it. */
function clocks(ctx: CanvasRenderingContext2D, w: number, h: number, look: Look) {
  ctx.fillStyle = BLACK;
  ctx.fillRect(0, 0, w, h);
  const { shot, game } = look;
  seven(ctx, shot === null ? '  ' : shotText(shot).padStart(2, ' '), w / 2, h * 0.33, h * 0.5, RED);
  seven(ctx, game ? clockText(game.clock) : ' :  ', w / 2, h * 0.79, h * 0.26, AMBER, 'rgba(255, 180, 60, 0.06)');
}

// ---------------------------------------------------------------------------------------------------
// the boards

/** A flat face of lamps: where its middle is, how wide and tall (ft), which way it faces (turned about y from +z), the part of the picture it shows. */
interface Face {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  turn: number;
  u: [number, number];
}

/** The boards behind each basket, along the far side and round the bowl, as one shape each (a draw for each of them). */
function faces(list: Face[]): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  for (const f of list) {
    const c = Math.cos(f.turn);
    const s = Math.sin(f.turn);
    const at = (a: number, b: number) => [f.x + a * c, f.y + b, f.z - a * s];
    const [l, r] = [-f.w / 2, f.w / 2];
    const [d, t] = [-f.h / 2, f.h / 2];
    pos.push(...at(l, d), ...at(r, d), ...at(r, t), ...at(l, d), ...at(r, t), ...at(l, t));
    uv.push(f.u[0], 0, f.u[1], 0, f.u[1], 1, f.u[0], 0, f.u[1], 1, f.u[0], 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  // (the boards are lamps and need none; the banners are cloth, lit)
  geo.computeVertexNormals();
  return geo;
}

export class Boards {
  readonly group = new Group();
  readonly house = new House();
  private readonly time = { value: 0 };
  private readonly table: Lamps;
  private readonly ends: Lamps;
  private readonly ribbons: Lamps;
  private readonly far: Lamps;
  private readonly screens: Lamps;
  private readonly clock: Lamps;
  private readonly all: Lamps[];
  /** The surfaces and how bright each is at full light (the far side's boards are kept down: the benches are in front of them). */
  private readonly lit: { mat: MeshBasicMaterial; glow: number }[] = [];
  private readonly endFaces: Face[] = [];
  private readonly ribbonFaces: Face[] = [];
  private readonly farFaces: Face[] = [];
  private readonly keep: Keep;
  private kits: [MatchKit, MatchKit] | null = null;
  private board = '';
  /** The first of the partners this building carries, and its boards' own look (its own: see paint). */
  private adFrom = 0;
  private style: 0 | 1 = 0;
  /** The building's own number (Venue.seed): which banners it hangs (see flags). */
  private seed = 0;
  private ms = 0;
  private fontsIn = false;
  private dimTo = 1;
  private bench = 1;
  private up = 1;
  private loud = 0;
  private names: ((pid: number) => string) | null = null;
  private numbers: ((pid: number) => string) | null = null;
  /** Painted at half the rate on a device that can't keep up. */
  private slow = false;
  // the banners in the roof: their picture (four of them side by side), what it was painted for
  private flags: { cv: HTMLCanvasElement; tex: CanvasTexture } | null = null;
  private flagKey = '';

  constructor(keep: Keep) {
    this.keep = keep;
    // (lamps about a third of an inch to an inch apart, as such boards have: a texel each)
    this.table = new Lamps(keep, 'table', 1088, 74, this.time);
    this.ends = new Lamps(keep, 'end', 1056, 64, this.time);
    this.ribbons = new Lamps(keep, 'ribbon', 1024, 40, this.time, true);
    this.far = new Lamps(keep, 'far', 1024, 40, this.time, true);
    this.screens = new Lamps(keep, 'screen', 576, 243, this.time);
    this.clock = new Lamps(keep, 'clock', 96, 60, this.time);
    this.all = [this.table, this.ends, this.ribbons, this.far, this.screens, this.clock];
    document.fonts?.ready.then(() => void (this.fontsIn = true));
  }

  private surface(l: Lamps, glow = GLOW, into?: MeshBasicMaterial): MeshBasicMaterial {
    const mat = l.material(this.keep, glow, into);
    this.lit.push({ mat, glow });
    return mat;
  }

  /** The scorer's table's LED front. */
  tableFace(): Material {
    return this.surface(this.table);
  }
  /** The scoreboard's screens, and its ring (a run of ribbon). */
  screenFace(): Material {
    return this.surface(this.screens);
  }
  ringFace(): Material {
    return this.surface(this.ribbons);
  }
  /** The clocks over the backboards (both show the same, as a building's do): the baskets' own material for their faces, lit. */
  clockFace(mat: MeshBasicMaterial) {
    this.surface(this.clock, GLOW, mat);
  }

  /** A board behind a basket: its face toward the floor, `w` ft along the baseline. */
  end(x: number, y: number, w: number, h: number, facing: -1 | 1) {
    this.endFaces.push({ x, y, z: 0, w, h, turn: (facing * Math.PI) / 2, u: [0, 1] });
  }
  /** A run of ribbon, `w` ft long, its middle at (x, y, z), facing +z turned `turn` about y. */
  ribbon(x: number, y: number, z: number, w: number, h: number, turn: number) {
    this.ribbonFaces.push({ x, y, z, w, h, turn, u: [0, w / RIBBON_FT] });
  }
  /** The boards along the far side, behind the benches: kept down, and quiet but for a big moment. */
  farSide(x: number, y: number, z: number, w: number, h: number) {
    this.farFaces.push({ x, y, z, w, h, turn: 0, u: [0, (w / RIBBON_FT) * (2.4 / h)] });
  }

  /**
   * Banners hanging in the roof (each its middle at x, y, z, `w` by `h` ft, facing +z), in the home side's colours: each
   * its own picture (see flags), so a building hangs as many as it has and its own. No years, no titles: the game knows
   * of none.
   */
  banners(list: { x: number; y: number; z: number; w: number; h: number }[]): Mesh | null {
    if (!list.length) return null;
    const cv = document.createElement('canvas');
    cv.width = list.length * FLAG_PX[0];
    cv.height = FLAG_PX[1];
    const tex = this.keep(new CanvasTexture(cv));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    this.flags = { cv, tex };
    const geo = faces(list.map((b, i) => ({ ...b, turn: 0, u: [i / list.length, (i + 1) / list.length] as [number, number] })));
    const mat = this.keep(new MeshLambertMaterial({ map: tex, side: DoubleSide, alphaTest: 0.5 }));
    const m = new Mesh(this.keep(geo), mat);
    this.group.add(m);
    return m;
  }

  /**
   * A ribbon of lamps along the wall at the top of the lower bowl (bowl.ts fasciaRuns), in a building that has
   * one: the ribbon's own picture, as one shape. Given back hidden: the building shows it (Arena.paint).
   */
  fascia(list: { x: number; y: number; z: number; w: number; h: number; turn: number }[]): Mesh {
    const m = new Mesh(this.keep(faces(list.map((r) => ({ ...r, u: [0, r.w / RIBBON_FT] as [number, number] })))), this.surface(this.ribbons, FASCIA_GLOW));
    m.visible = false;
    this.group.add(m);
    return m;
  }

  /** The faces asked for, made: call once, after them. */
  build() {
    const mesh = (list: Face[], mat: Material) => {
      if (!list.length) return;
      const m = new Mesh(this.keep(faces(list)), mat);
      this.group.add(m);
    };
    mesh(this.endFaces, this.surface(this.ends));
    mesh(this.ribbonFaces, this.surface(this.ribbons));
    mesh(this.farFaces, this.surface(this.far, FAR_GLOW));
  }

  /** Tonight's teams (their colours on the boards), and the building's colour (not the home side's: a neutral floor). */
  dress(kits: [MatchKit, MatchKit]) {
    this.kits = kits;
    this.stale();
  }
  /** The building's colour, and (`seed`: its own number) which of the partners it carries first; `style` its boards' own look (Venue.boards). */
  paint(board: string, seed = 0, style: 0 | 1 = 0) {
    if (board === this.board && seed === this.seed && style === this.style) return;
    this.board = board;
    this.adFrom = seed % ADS.length;
    this.seed = seed;
    this.style = style;
    this.stale();
  }
  private stale() {
    for (const l of this.all) l.key = '';
  }

  /** How much of their light the boards keep (1: all; a close-up's dim), and the benches' (the far side's boards with them). */
  dim(to: number, bench = to) {
    this.dimTo = to;
    this.bench = bench;
  }

  /** A device that can't keep up: the boards are painted half as often. */
  lite(on: boolean) {
    this.slow = on;
  }

  /** Who a player is to the boards: his name and his number (the page's own; none in a highlight). */
  cast(names?: (pid: number) => string, numbers?: (pid: number) => string) {
    this.names = names ?? null;
    this.numbers = numbers ?? null;
  }

  /** How loud the building is (0 to 1): a noise meter shows it. */
  hear(level: number) {
    this.loud = level;
  }

  /** The house lights are down (the picture's exposure with them): the boards are this much brighter, to stay as they were. */
  boost(by: number) {
    this.up = by;
  }

  /** A big moment, as if the court had just played it (the scene lab's stills). */
  shout(call: Call, side: 0 | 1 | null = 0) {
    this.house.moment = { call, side, ms: 0 };
  }

  update(real: number, calm: boolean) {
    const kits = this.kits;
    if (!kits) return;
    this.ms += real;
    if (!calm) this.time.value += real / 1000;
    const h = this.house;
    const game = h.game;
    const side = (k: MatchKit, abbr: string): Side => {
      const trim = k.trim.toLowerCase() === k.color.toLowerCase() ? WHITE : k.trim;
      return { abbr, fill: k.color, trim, deep: darker(k.color, 0.42) };
    };
    // (on a neutral floor nobody's building is cheering: the boards show the game and no more)
    const neutral = this.board.toLowerCase() !== kits[0].color.toLowerCase();
    // (a highlight has no game: the boards show the home side's colours and no letters)
    const look: Look = {
      home: side(kits[0], game?.abbrevs[0] ?? ''),
      away: side(kits[1], game?.abbrevs[1] ?? ''),
      game,
      shot: h.shot,
      final: h.final,
      noise: this.loud,
      tick: Math.floor(this.ms / 170),
      style: this.style,
    };

    // a big moment over everything; or the end of a quarter; or each board's own turn
    const m = h.moment;
    let take: Show | null = null;
    if (h.final !== undefined && game) take = { kind: 'final' };
    else if (m && m.call === 'timeout' && m.ms < TIMEOUT_MS) take = { kind: 'timeout', side: m.side };
    else if (m && m.side === 0 && !neutral && BIG.has(m.call) && m.ms < TAKEOVER_MS) take = { kind: 'word', text: WORDS[m.call] ?? '' };
    else {
      const text = h.off === null ? breakText(game) : null;
      if (text) take = { kind: 'break', text };
    }
    const late = !!game && game.q >= 4 && game.clock <= 120;
    const defending = !neutral && h.off === 1 && !h.line;
    const urgent = defending && (h.clutch || late);
    const turn = (loop: number[], a: Show, b: Show): Show => ((this.ms / 1000) % (loop[0] + loop[1]) < loop[0] ? a : b);
    const score: Show = { kind: 'score' };
    const home: Show = neutral ? score : { kind: 'home' };
    const defense: Show = { kind: 'defense' };
    // a scorer's card: his name and number as the page knows them, what he has as the court has played it
    const card = (who: { pid: number; side: 0 | 1; pts: number } | null, head: string): Show | null => {
      const name = who && this.names?.(who.pid);
      return who && name ? { kind: 'stat', side: who.side, name, num: this.numbers?.(who.pid) ?? '', pts: who.pts, head } : null;
    };
    // (after a big home basket's word: the man who made it, and REPLAY behind the baskets)
    const after = !!m && m.side === 0 && !neutral && BIG.has(m.call) && m.ms >= TAKEOVER_MS && m.ms < TAKEOVER_MS + CARD_MS && h.star?.side === 0;
    const scorer = after ? card(h.star, 'TONIGHT') : null;
    // (late in a close one with the ball: the building is asked for noise)
    const noisy = !neutral && (h.clutch || late) && h.off === 0 && !h.line && h.final === undefined;
    const noise: Show = { kind: 'noise' };
    // (a dead ball: the screens go round the score, a side's top scorer and a partner)
    const dead = !!game && h.off === null && h.final === undefined;
    const secs = this.ms / 1000;
    const cycle = (turns: number[], shows: (Show | null)[], off = 0): Show => {
      const all = turns.reduce((a, b) => a + b, 0);
      let t = (secs + off) % all;
      for (let i = 0; i < turns.length; i++) {
        if (t < turns[i]) return shows[i] ?? shows[0]!;
        t -= turns[i];
      }
      return shows[0]!;
    };
    /** The partner whose turn it is on a board that changes every `every` s (each board `off` along from the others). */
    const ad = (every: number, off: number): Show => ({ kind: 'ad', i: Math.floor(secs / every) + off + this.adFrom });
    const want = (l: Lamps): Show => {
      if (l.kind === 'clock') return { kind: 'clock' };
      if (take) return take;
      switch (l.kind) {
        case 'table':
          if (scorer) return scorer;
          return urgent ? defense : noisy ? noise : defending ? turn(DEFENSE_LOOP, defense, score) : game ? cycle(TABLE_TURNS, [score, home, neutral ? score : ad(20, 0)]) : home;
        case 'end':
          if (after) return { kind: 'replay' };
          return urgent ? defense : noisy ? noise : defending ? turn(DEFENSE_LOOP, defense, home) : cycle(END_TURNS, [home, ad(16, 2)], 3);
        case 'ribbon':
          return urgent ? defense : noisy ? noise : cycle(RIBBON_TURNS, [home, ad(25, 4)]);
        case 'far':
          return urgent ? defense : home;
        default:
          if (scorer) return scorer;
          if (urgent) return defense;
          if (noisy) return turn([4, 5], noise, score);
          return dead ? cycle(SCREEN_TURNS, [score, card(h.leader(Math.floor(secs / 13) % 2 ? 1 : 0), 'LEADING SCORER'), ad(13, 1)]) : score;
      }
    };

    const flagKey = `${look.home.abbr}|${look.home.fill}|${look.home.trim}|${this.seed}|${this.fontsIn}`;
    if (this.flags && flagKey !== this.flagKey) {
      this.flagKey = flagKey;
      flags(this.flags.cv, look.home, this.seed);
      this.flags.tex.needsUpdate = true;
    }
    const gap = this.slow ? PAINT_MS * 2 : PAINT_MS;
    for (const l of this.all) {
      const show = want(l);
      const key = `${JSON.stringify(show)}|${keyOf(show, look, l.kind)}|${this.fontsIn}`;
      if (l.show && show.kind !== l.show.kind && !calm) {
        l.prev = l.show;
        l.wipe = 0;
      }
      if (calm) l.wipe = 1;
      l.show = show;
      if (l.wipe < 1) l.wipe = Math.min(1, l.wipe + real / WIPE_MS);
      const wiping = l.prev !== null;
      if ((key !== l.key || wiping) && this.ms - l.painted >= gap) {
        this.draw(l, look);
        l.key = key;
        l.painted = this.ms;
        if (l.wipe >= 1) l.prev = null;
      }
      // what moves without a new picture: a band of light over a team's colours, the defence's pulse, the ribbon's crawl
      const k = l.show.kind;
      l.sweep.value = calm ? 0 : k === 'home' || k === 'word' || k === 'ad' || k === 'stat' ? 0.7 : k === 'score' ? 0.2 : 0;
      l.pulse.value = calm ? 0 : k === 'defense' || k === 'noise' ? 1 : k === 'word' || k === 'replay' ? 0.45 : 0;
    }
    if (!calm) this.far.crawl.value = this.ribbons.crawl.value = (this.ribbons.crawl.value + ((real / 1000) * CRAWL_FT_S) / RIBBON_FT) % 1;
    for (const { mat, glow } of this.lit) {
      const far = glow === FAR_GLOW;
      mat.color.setScalar(this.up * glow * (far ? 0.45 + 0.55 * this.bench : BOARD_DIM + (1 - BOARD_DIM) * clamp01((this.dimTo - 0.18) / 0.82)));
    }
  }

  /** A board's picture: its scene, and while a wipe runs the last one beyond its edge. */
  private draw(l: Lamps, look: Look) {
    const { ctx } = l;
    const { width: w, height: h } = l.cv;
    const one = (s: Show) => {
      if (l.kind === 'clock') clocks(ctx, w, h, look);
      else if (l.kind === 'screen') screen(ctx, w, h, s, look);
      else strip(ctx, w, h, s, look, l.kind);
    };
    one(l.show!);
    if (l.prev && l.wipe < 1) {
      // the new scene comes in from the left behind a bright edge
      const x = Math.round(w * l.wipe * l.wipe * (3 - 2 * l.wipe));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, w - x, h);
      ctx.clip();
      one(l.prev);
      ctx.restore();
      ctx.fillStyle = WHITE;
      ctx.fillRect(x - 2, 0, 3, h);
    }
    l.tex.needsUpdate = true;
  }
}

/** A banner's picture, px across and down (it hangs a little over twice as long as it is wide). */
const FLAG_PX = [128, 282];

/** Numbers a building may have retired (numbers only: nobody's name, and no years). */
const RETIRED = ['33', '6', '23', '32', '1', '11', '34', '21', '3', '8', '10', '13', '15', '24', '44', '50', '7', '12', '5', '42'];
/** The fewest banners a building hangs (the roof has places for more: the rest are left empty), and the most of them numbers. */
const FLAGS_LEAST = 3;
const FLAGS_NUMBERS = 3;

/**
 * The banners, one picture each side by side: as many as the building hangs (by its own number, `seed`:
 * Venue.seed), from the middle places out, the rest left clear; each one of four looks in its colours with its
 * letters, or a number it has retired (big, in white, over its letters and a band), together at one end. Each
 * is cut to a point or a swallowtail at its foot (clear there).
 */
function flags(cv: HTMLCanvasElement, side: Side, seed: number) {
  const ctx = cv.getContext('2d')!;
  const [w, h] = FLAG_PX;
  const n = Math.round(cv.width / w);
  const pick = (k: number, of: number) => (Math.imul(seed ^ Math.imul(k, 0x9e3779b9), 0x85ebca6b) >>> 0) % of;
  const hung = Math.min(n, FLAGS_LEAST + pick(1, Math.max(1, n - FLAGS_LEAST + 1)));
  const numbers = pick(2, FLAGS_NUMBERS + 1);
  const left = pick(4, 2) === 0;
  const places = [...Array(n).keys()]
    .sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b)
    .slice(0, hung)
    .sort((a, b) => a - b);
  ctx.clearRect(0, 0, cv.width, cv.height);
  places.forEach((at, j) => {
    const k = (j + pick(3, 4)) % 4;
    const number = left ? j < numbers : j >= hung - numbers;
    ctx.save();
    ctx.translate(at * w, 0);
    // the cloth's outline: straight down, then a point (or a swallowtail) at the foot
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h * 0.86);
    if (k % 2) {
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h * 0.86);
    } else {
      ctx.lineTo(w, h);
      ctx.lineTo(w / 2, h * 0.9);
      ctx.lineTo(0, h);
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = k === 2 && !number ? side.deep : side.fill;
    ctx.fillRect(0, 0, w, h);
    const band = (y: number, t: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, y, w, t);
    };
    if (number) {
      // a retired number: its letters small at the top, the number big, a band under it
      band(h * 0.05, h * 0.02, side.trim);
      write(ctx, side.abbr, w / 2, h * 0.13, w * 0.24, w * 0.6, WHITE);
      write(ctx, RETIRED[(pick(5, RETIRED.length) + j * 7) % RETIRED.length], w / 2, h * 0.43, w * 0.66, w * 0.86, WHITE);
      band(h * 0.66, h * 0.035, side.trim);
      band(h * 0.71, h * 0.012, WHITE);
    } else
      switch (k) {
        case 0:
          band(h * 0.06, h * 0.03, side.trim);
          band(h * 0.1, h * 0.012, WHITE);
          band(h * 0.66, h * 0.04, side.trim);
          band(h * 0.72, h * 0.04, WHITE);
          band(h * 0.78, h * 0.04, side.trim);
          write(ctx, side.abbr, w / 2, h * 0.38, w * 0.5, w * 0.84, WHITE);
          break;
        case 1:
          ctx.fillStyle = side.trim;
          for (const x of [0.2, 0.5, 0.8]) ctx.fillRect(w * x - w * 0.05, h * 0.36, w * 0.1, h * 0.6);
          band(h * 0.08, h * 0.2, WHITE);
          write(ctx, side.abbr, w / 2, h * 0.18, w * 0.36, w * 0.8, side.fill);
          break;
        case 2:
          ctx.strokeStyle = side.fill;
          ctx.lineWidth = w * 0.08;
          ctx.strokeRect(w * 0.04, w * 0.04, w * 0.92, h * 1.2);
          write(ctx, side.abbr, w / 2, h * 0.3, w * 0.42, w * 0.76, WHITE);
          chevrons(ctx, w * 0.22, w * 0.8, h * 0.5, h * 0.64, 1, side.trim);
          break;
        default:
          ctx.fillStyle = side.trim;
          ctx.beginPath();
          ctx.moveTo(0, h * 0.42);
          ctx.lineTo(w, h * 0.3);
          ctx.lineTo(w, h * 0.4);
          ctx.lineTo(0, h * 0.52);
          ctx.fill();
          write(ctx, side.abbr, w / 2, h * 0.16, w * 0.4, w * 0.8, WHITE);
          band(h * 0.7, h * 0.025, WHITE);
          break;
      }
    // (cloth: lighter where it bellies, darker at its edges and in its folds)
    const fold = ctx.createLinearGradient(0, 0, w, 0);
    fold.addColorStop(0, 'rgba(0,0,0,0.35)');
    fold.addColorStop(0.3, 'rgba(255,255,255,0.06)');
    fold.addColorStop(0.55, 'rgba(0,0,0,0.12)');
    fold.addColorStop(0.8, 'rgba(255,255,255,0.05)');
    fold.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = fold;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });
}

/** The ribbon along the top of the lower bowl at full light: under the others (it runs right across the broadcast's picture). */
const FASCIA_GLOW = 0.75;
/** The far side's boards at full light: under the others (the benches sit in front of them). */
const FAR_GLOW = 0.62;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A colour darkened toward black (`k` of it kept), as a canvas style. */
function darker(hex: string, k: number): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = (v: number) => Math.round(((n >> v) & 255) * k);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/** What of the game a scene shows, so a board is painted again when that changes and not otherwise. */
function keyOf(show: Show, look: Look, kind: Kind): string {
  const g = look.game;
  const names = `${look.home.abbr}${look.home.fill}${look.home.trim}${look.away.abbr}${look.away.fill}`;
  if (show.kind === 'clock') return `${look.shot === null ? '' : shotText(look.shot)}|${g ? clockText(g.clock) : ''}`;
  const scored = g ? `${g.score[0]}-${g.score[1]}` : '';
  const timed = g ? `${period(g.q)} ${clockText(g.clock, kind === 'screen')}` : '';
  switch (show.kind) {
    case 'score':
      return `${names}|${scored}|${timed}|${kind === 'screen' && look.shot !== null ? shotText(look.shot) : ''}`;
    case 'home':
      // (the ribbon's run of it carries the score; the screens show the score for it)
      return kind === 'ribbon' || kind === 'screen' ? `${names}|${scored}|${timed}|${kind === 'screen' && look.shot !== null ? shotText(look.shot) : ''}` : names;
    case 'noise':
      return `${names}|${Math.round(look.noise * 20)}|${look.tick}|${kind === 'screen' ? `${scored}|${timed}` : ''}`;
    case 'defense':
    case 'word':
    case 'timeout':
    case 'stat':
    case 'replay':
    case 'ad':
      return kind === 'screen' ? `${names}|${scored}|${timed}` : names;
    default:
      return `${names}|${scored}`;
  }
}
