// What a man looks like: his skin's tone, his hair and how he wears it, his beard, the shape of his
// face. All of it comes from his id, the same every night, and none of it from who he is: a real name
// gets a look as made up as anyone's. Plain data (no three.js), so the benches, the coaches and the
// referees can take theirs from here too.

export interface Look {
  /** His skin, one of SKINS. */
  skin: string;
  /** His hair's colour (one that goes with his skin, or now and then one he has dyed it). */
  hair: string;
  /** His brows' colour, and his beard's: his hair's own, whatever he has done to the hair on his head. */
  brows: string;
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
  /** How far his hairline has gone back at his temples, 0..1 (most men: none of the way). */
  recede: number;
  /** A notch shaved through the end of one eyebrow. */
  notch: boolean;
  /** Which side of him a part in his hair, or a notch in a brow, is on (1 his left). */
  side: 1 | -1;
  /** How his barber cuts it (0..1 each): how high the sides are taken down toward his skin, and how long it is left on top. */
  cut: { sides: number; top: number };
  /** A hairline his barber has squared off with a razor (short hair only): a crisp edge, square at the temples. */
  lineup: boolean;
  /** How much of what he feels shows on his face, 0..1: a stone face to a loud one (figure.ts's feel). */
  temper: number;
  /** How a basket of his shows: 0 he shouts, 1 he grins (a big one makes a shouter of most men). */
  grin: number;
  /** How lived-in his face is, 0..1: the lines a face makes as it moves (his brow raised, a frown, a grin) are deeper the more of it he has. */
  age: number;
  /** How readily he sweats (about 1: half as much to half as much again), and how red his face goes with it. */
  sweat: number;
  /** His lips' own colour, -1..1: paler and pinker than his skin would have them, to browner and darker. */
  lip: number;
  /**
   * His face's shape: how wide and how long his head is, his jaw's width and length, his nose's width and
   * how far it stands out (each about 1); then how heavy his brow's ridge is and how full his lips are
   * (0..1), how far his eyes' outer corners are tipped up and how wide open he holds them (about 1), and
   * which kind of head it is (an index into FACES). Then what shapes the face itself, each about 0 (-1..1): how
   * high and full his cheekbones are, how much flesh his cheeks have (round, or hollow under the bone), how far
   * his chin comes forward, how square his jaw's corners are, how deep his eyes are set, how broad his nose's wings.
   */
  face: {
    wide: number;
    long: number;
    jaw: number;
    chin: number;
    nose: number;
    bridge: number;
    ridge: number;
    lips: number;
    tilt: number;
    open: number;
    kind: number;
    cheeks: number;
    full: number;
    point: number;
    flare: number;
    deep: number;
    wings: number;
  };
}

/** Eight tones of skin, lightest to darkest (the middle ones a little less orange than paint would have them: the arena's lamps are warm). */
export const SKINS: readonly string[] = ['#e0b99a', '#d2aa8a', '#bf997c', '#ac8568', '#946d52', '#7b5741', '#66453a', '#503629'];

/**
 * How he may wear his hair (0 shaved). `piece` is hair that is a shape of its own on the model (figure.py), where a
 * style has one. (New ones go on the end: a man's style is an index into this.)
 */
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
  { name: 'waves', piece: null },
  { name: 'part', piece: null },
  { name: 'mohawk', piece: null },
  { name: 'taper', piece: null },
] as const;

/** His beard (0 none). */
export const BEARDS = ['none', 'stubble', 'goatee', 'beard', 'full', 'strap'] as const;

/**
 * The kinds of head there are, and what each is at heart (a man's own is that, a little off it every
 * way): how wide and long it is, its jaw's width and its chin's length, how heavy its brow, the width
 * of its nose and how full its lips; then the face's own shape (Look's cheeks, full, point, flare, deep).
 * A five drawn from six kinds, each off its kind, is five men.
 */
export const FACES = [
  { name: 'long', wide: 0.965, long: 1.035, jaw: 0.98, chin: 1.05, ridge: 0.4, nose: 0.95, lips: 0.45, cheeks: 0.2, full: -0.2, point: 0.4, flare: -0.2, deep: 0.2 },
  { name: 'broad', wide: 1.065, long: 0.965, jaw: 1.04, chin: 0.96, ridge: 0.5, nose: 1.06, lips: 0.55, cheeks: 0.5, full: 0.4, point: -0.2, flare: 0.5, deep: -0.2 },
  { name: 'square', wide: 1.02, long: 1.0, jaw: 1.11, chin: 1.03, ridge: 0.6, nose: 1.0, lips: 0.4, cheeks: 0.1, full: -0.1, point: 0.5, flare: 0.9, deep: 0.3 },
  { name: 'narrow', wide: 0.95, long: 1.0, jaw: 0.94, chin: 1.0, ridge: 0.3, nose: 0.92, lips: 0.5, cheeks: 0.55, full: -0.45, point: 0.1, flare: -0.4, deep: 0.4 },
  { name: 'heavy', wide: 1.01, long: 0.99, jaw: 1.04, chin: 1.0, ridge: 1.0, nose: 1.07, lips: 0.5, cheeks: 0.0, full: 0.3, point: 0.2, flare: 0.6, deep: 0.8 },
  { name: 'soft', wide: 1.0, long: 0.975, jaw: 0.94, chin: 0.9, ridge: 0.1, nose: 0.97, lips: 0.75, cheeks: -0.5, full: 0.8, point: -0.5, flare: -0.4, deep: -0.6 },
] as const;

/** Hair's natural colours, darkest first. */
const BLACK = '#17130f';
const SOFT_BLACK = '#221a14';
const DARK_BROWN = '#35241a';
const BROWN = '#553a25';
const LIGHT_BROWN = '#7a5a38';
const BLOND = '#a8875a';
const AUBURN = '#6a3520';
/** What some men dye theirs: bleached, or nearly white. */
const BLEACHED = '#b8925a';
const PLATINUM = '#cfc2a4';

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
// (spread wide: a starting five seldom has two men in the same cut, and a fade is a fade cut a man's own way)
const STRAIGHT = [0.07, 0.11, 0.12, 0.06, 0, 0, 0, 0.1, 0.09, 0, 0.02, 0.2, 0, 0, 0.12, 0.04, 0.07];
const CURLED = [0.07, 0.08, 0.09, 0.08, 0.06, 0.07, 0.08, 0.01, 0.03, 0.05, 0.07, 0, 0.09, 0.07, 0.04, 0.03, 0.1];
/** The styles a man may dye (short hair and curls: not hair worn long, which is its own colour). */
const DYED = ['buzz', 'fade', 'curls', 'twists', 'waves', 'mohawk', 'hightop', 'taper'];
/** The short cuts a barber may line up with a razor. */
const LINED = ['buzz', 'fade', 'waves', 'part', 'taper', 'hightop', 'curls', 'crop'];
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
  const own = hairs[Math.floor(r(3) * hairs.length) % hairs.length];
  // (one man in sixteen or so has dyed what he can: bleached, now and then nearly white)
  const dyed = DYED.includes(STYLES[style].name) && r(19) < 0.13 ? (r(20) < 0.7 ? BLEACHED : PLATINUM) : null;
  const kinds = Math.floor(r(14) * FACES.length) % FACES.length;
  const kind = FACES[kinds];
  // (a man's own, off his kind's by as much as a third of the way to either end)
  const off = (at: number, salt: number) => Math.min(1, Math.max(-1, at + span(salt, -0.35, 0.35)));
  return {
    skin: SKINS[tone],
    hair: dyed ?? own,
    brows: own,
    style,
    beard: pick(BEARD_SHARE, r(4)),
    tone,
    // (light eyes only with the lighter tones, and not often)
    eyes: EYES[tone < 2 && r(5) < 0.4 ? 4 + (r(6) < 0.5 ? 0 : 1) : Math.floor(r(6) * 4) % 4],
    brow: span(7, 0.35, 1),
    // (most men's hairline is where it was; one in eight or so has gone back at the temples, a few a long way)
    recede: r(21) < 0.12 ? span(22, 0.25, 0.8) : 0,
    notch: r(23) < 0.07,
    side: r(24) < 0.5 ? 1 : -1,
    cut: { sides: r(25), top: r(26) },
    lineup: LINED.includes(STYLES[style].name) && r(27) < 0.55,
    temper: span(34, 0.15, 1),
    grin: r(35),
    // (most men in the league are young: a face with lines in it is the veteran's)
    age: r(36) ** 1.6,
    sweat: span(37, 0.55, 1.45),
    lip: span(38, -1, 1),
    face: {
      wide: kind.wide + span(8, -0.03, 0.03),
      long: kind.long + span(9, -0.03, 0.03),
      jaw: kind.jaw + span(10, -0.04, 0.04),
      chin: kind.chin + span(11, -0.04, 0.05),
      // (a broader nose and fuller lips go with a darker tone, loosely)
      nose: kind.nose * span(12, 0.9, 1.08) + tone * 0.022,
      bridge: span(13, 0.86, 1.14),
      ridge: Math.min(1, Math.max(0, kind.ridge + span(15, -0.25, 0.25))),
      lips: Math.min(1, Math.max(0, kind.lips + span(16, -0.25, 0.25) + (tone - 3.5) * 0.04)),
      // (most men's outer corners a little higher than the inner ones, a few's level, a few's a good deal higher)
      tilt: span(17, 0.1, 1.4),
      open: span(18, 0.86, 1.08),
      kind: kinds,
      cheeks: off(kind.cheeks, 28),
      full: off(kind.full, 29),
      point: off(kind.point, 30),
      flare: off(kind.flare, 31),
      deep: off(kind.deep, 32),
      // (broader wings go with a darker tone, loosely)
      wings: Math.min(1, Math.max(-1, span(33, -0.7, 0.5) + (tone - 3.5) * 0.12)),
    },
  };
}
