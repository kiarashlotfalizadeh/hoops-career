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
  /** His face's shape: how wide and how long his head is, his jaw's width and length, his nose's width and how far it stands out (each about 1). */
  face: { wide: number; long: number; jaw: number; chin: number; nose: number; bridge: number };
}

/** Eight tones of skin, lightest to darkest. */
export const SKINS: readonly string[] = ['#e2b998', '#d6a986', '#c59876', '#b28462', '#986c4e', '#7e563e', '#644231', '#4a3026'];

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
export const BEARDS = ['none', 'stubble', 'goatee', 'beard', 'full'] as const;

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
const BEARD_SHARE = [0.3, 0.22, 0.18, 0.2, 0.1];
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
      wide: span(8, 0.95, 1.06),
      long: span(9, 0.96, 1.05),
      jaw: span(10, 0.92, 1.07),
      chin: span(11, 0.92, 1.1),
      nose: span(12, 0.85, 1.1) + tone * 0.022,
      bridge: span(13, 0.85, 1.15),
    },
  };
}
