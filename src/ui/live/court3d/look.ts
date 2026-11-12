// What a man looks like: his skin's tone, his hair and how he wears it, his beard, the shape of his
// face. All of it comes from his id, the same every night, and none of it from who he is: a real name
// gets a look as made up as anyone's. Plain data (no three.js), so the benches, the coaches and the
// referees can take theirs from here too.

export interface Look {
  /** His skin, one of SKINS. */
  skin: string;
  /** His hair's colour (one that goes with his skin). */
  hair: string;
  /** How he wears it: an index into STYLES (0 is a shaved head). */
  style: number;
  /** His beard: an index into BEARDS (0 is none). */
  beard: number;
  /** Which of SKINS his skin is (0 the lightest). */
  tone: number;
  /** His eyes' colour. */
  eyes: string;
  /** How heavy his eyebrows are, 0..1. */
  brow: number;
  /**
   * His face's shape: how wide and how long his head is, his jaw's width and length, his nose's width and
   * how far it stands out (each about 1); then how heavy his brow's ridge is and how full his lips are
   * (0..1), how far his eyes' outer corners are tipped up and how wide open he holds them (about 1), and
   * which kind of head it is (an index into FACES).
   */
  face: { wide: number; long: number; jaw: number; chin: number; nose: number; bridge: number; ridge: number; lips: number; tilt: number; open: number; kind: number };
}

/** Eight tones of skin, lightest to darkest. */
export const SKINS: readonly string[] = ['#e2b998', '#d6a986', '#c59876', '#b28462', '#986c4e', '#7e563e', '#66453a', '#503629'];

/** How he may wear his hair (0 shaved). `piece` is hair that is a shape of its own on the model (figure.py), where a style has one. */
export const STYLES = [
  { name: 'shaved', piece: null },
  { name: 'buzz', piece: null },
  { name: 'fade', piece: null },
  { name: 'curls', piece: 'curls' },
  { name: 'afro', piece: 'afro' },
  { name: 'cornrows', piece: null },
  { name: 'twists', piece: 'twists' },
  { name: 'tied', piece: 'tail' },
  { name: 'bun', piece: 'bun' },
  { name: 'hightop', piece: 'hightop' },
  { name: 'braids', piece: 'braids' },
  { name: 'crop', piece: null },
  { name: 'locs', piece: 'locs' },
] as const;

/** His beard (0 none). */
export const BEARDS = ['none', 'stubble', 'goatee', 'beard', 'full', 'strap'] as const;

/**
 * The kinds of head there are, and what each is at heart (a man's own is that, a little off it every
 * way): how wide and long it is, its jaw's width and its chin's length, how heavy its brow, the width
 * of its nose and how full its lips. A five drawn from six kinds, each off its kind, is five men.
 */
export const FACES = [
  { name: 'long', wide: 0.955, long: 1.055, jaw: 0.97, chin: 1.08, ridge: 0.4, nose: 0.95, lips: 0.45 },
  { name: 'broad', wide: 1.065, long: 0.965, jaw: 1.04, chin: 0.96, ridge: 0.5, nose: 1.06, lips: 0.55 },
  { name: 'square', wide: 1.02, long: 1.0, jaw: 1.11, chin: 1.03, ridge: 0.6, nose: 1.0, lips: 0.4 },
  { name: 'narrow', wide: 0.935, long: 1.01, jaw: 0.9, chin: 1.0, ridge: 0.3, nose: 0.9, lips: 0.5 },
  { name: 'heavy', wide: 1.01, long: 0.99, jaw: 1.04, chin: 1.0, ridge: 1.0, nose: 1.07, lips: 0.5 },
  { name: 'soft', wide: 1.0, long: 0.975, jaw: 0.94, chin: 0.9, ridge: 0.1, nose: 0.97, lips: 0.75 },
] as const;

/** Hair's natural colours, darkest first. */
const BLACK = '#17130f';
const SOFT_BLACK = '#221a14';
const DARK_BROWN = '#35241a';
const BROWN = '#553a25';
const LIGHT_BROWN = '#7a5a38';
const BLOND = '#a8875a';
const AUBURN = '#6a3520';

/** Which colours of hair go with a tone of skin (the commoner ones more than once). */
const HAIRS: readonly (readonly string[])[] = [
  [DARK_BROWN, BROWN, LIGHT_BROWN, BLOND, AUBURN, SOFT_BLACK],
  [DARK_BROWN, BROWN, LIGHT_BROWN, SOFT_BLACK, BLACK, AUBURN],
  [BLACK, SOFT_BLACK, DARK_BROWN, BROWN],
  [BLACK, SOFT_BLACK, DARK_BROWN],
  [BLACK, SOFT_BLACK, DARK_BROWN],
  [BLACK, SOFT_BLACK],
  [BLACK, SOFT_BLACK],
  [BLACK, SOFT_BLACK],
];

/** How often each tone turns up (a share each; they add up to 1). */
const TONE_SHARE = [0.08, 0.09, 0.1, 0.13, 0.16, 0.17, 0.15, 0.12];

/**
 * How likely each style is (in STYLES' order), for straighter hair (the lighter tones) and for
 * tightly curled hair (the darker ones); the tones between mix the two.
 */
const STRAIGHT = [0.07, 0.17, 0.22, 0.04, 0, 0, 0, 0.09, 0.09, 0, 0.02, 0.3, 0];
const CURLED = [0.08, 0.15, 0.2, 0.12, 0.06, 0.07, 0.08, 0.01, 0.03, 0.05, 0.06, 0, 0.09];
const BEARD_SHARE = [0.28, 0.2, 0.17, 0.17, 0.1, 0.08];
const EYES = ['#3b2516', '#2e1c11', '#4a2f1a', '#5b4426', '#56664a', '#4f6a80'];

/** Numbers that look random and are a man's own: the same id, the same run (each `salt` a run of its own). */
function hash(pid: number, salt: number): number {
  let x = (Math.imul(pid | 0, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** The one of these shares a roll in 0..1 lands in. */
function pick(shares: readonly number[], roll: number): number {
  const total = shares.reduce((a, b) => a + b, 0);
  let at = roll * total;
  for (let i = 0; i < shares.length; i++) {
    at -= shares[i];
    if (at < 0) return i;
  }
  return shares.length - 1;
}

/** A man's look, from his id: the same every time, and well spread over any roster. */
export function lookOf(pid: number): Look {
  const r = (salt: number) => hash(pid, salt);
  const tone = pick(TONE_SHARE, r(0));
  // (how tightly his hair curls goes with his tone, loosely: the middle tones have both kinds)
  const curl = Math.min(1, Math.max(0, (tone - 1.5) / 2.5 + (r(1) - 0.5) * 0.5));
  const style = pick(
    STRAIGHT.map((s, i) => s * (1 - curl) + CURLED[i] * curl),
    r(2),
  );
  const hairs = HAIRS[tone];
  const span = (salt: number, lo: number, hi: number) => lo + (hi - lo) * r(salt);
  const kinds = Math.floor(r(14) * FACES.length) % FACES.length;
  const kind = FACES[kinds];
  return {
    skin: SKINS[tone],
    hair: hairs[Math.floor(r(3) * hairs.length) % hairs.length],
    style,
    beard: pick(BEARD_SHARE, r(4)),
    tone,
    // (light eyes only with the lighter tones, and not often)
    eyes: EYES[tone < 2 && r(5) < 0.4 ? 4 + (r(6) < 0.5 ? 0 : 1) : Math.floor(r(6) * 4) % 4],
    brow: span(7, 0.35, 1),
    face: {
      wide: kind.wide + span(8, -0.02, 0.02),
      long: kind.long + span(9, -0.02, 0.02),
      jaw: kind.jaw + span(10, -0.03, 0.03),
      chin: kind.chin + span(11, -0.04, 0.05),
      // (a broader nose and fuller lips go with a darker tone, loosely)
      nose: kind.nose * span(12, 0.9, 1.08) + tone * 0.022,
      bridge: span(13, 0.86, 1.14),
      ridge: Math.min(1, Math.max(0, kind.ridge + span(15, -0.25, 0.25))),
      lips: Math.min(1, Math.max(0, kind.lips + span(16, -0.25, 0.25) + (tone - 3.5) * 0.04)),
      tilt: span(17, 0.3, 1.9),
      open: span(18, 0.86, 1.08),
      kind: kinds,
    },
  };
}
