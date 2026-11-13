// Team colours: readable variants of a team's colours on the Hardwood paper, for identity surfaces
// (slabs, jerseys, floors, your rows) and, for your own team, links, switches and the play button;
// and each home team's building as the live game draws it (venueLook).

const DEFAULT_ACCENT = '#2f6fde';
/** --surface-2, the darkest paper surface team-coloured text sits on. */
const SURFACE_2 = '#e7e1d4';
/** --ink: text, and the dock's ground. */
const INK = '#121212';
/** --bg, the paper a switch or a fill sits on. */
const BG = '#f3efe7';

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function luminance(hex: string): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Text on a colour fill (a team mark, a jersey, an avatar, an accent button): white or near-black, whichever reads better. */
export const inkOn = (fill: string) => (contrast('#ffffff', fill) >= contrast(INK, fill) ? '#ffffff' : INK);

function mix(hex: string, toward: string, t: number): string {
  const a = rgb(hex);
  const b = rgb(toward);
  return `#${a
    .map((v, i) =>
      Math.round((v + (b[i] - v) * t) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** The most saturated team colour that is neither near-black nor near-white. */
export function teamAccent(colors: [string, string, string]): string {
  const info = (hex: string) => {
    const [r, g, b] = rgb(hex);
    return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, s: Math.max(r, g, b) - Math.min(r, g, b) };
  };
  const cands = colors.map((c) => ({ c, ...info(c) })).filter((x) => x.l > 0.12 && x.l < 0.8);
  cands.sort((a, b) => b.s - a.s);
  return cands[0]?.c ?? DEFAULT_ACCENT;
}

/** Straight-line RGB distance (0..441): under CLASH two team colours read as the same. */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) * 255;
}
const CLASH = 90;

/** How far apart two colours look (OKLab distance, 0 to about 1): hue counts, so a dark green and a navy stand apart where straight RGB calls them the same. */
export function lookDistance(a: string, b: string): number {
  const lab = (hex: string) => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [r, g, bl] = rgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2];
  };
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
/** Under this two teams' colours read as the same side by side (two reds, two navies; not green and navy). */
const SAME_LOOK = 0.12;

/** One readable colour per team for two-team charts, [home, away]: the colour each half of a game's board wears (deep enough to read on paper; `nightFill` it for ink), the away side switching when they clash. */
export function matchupColors(home: [string, string, string], away: [string, string, string]): [string, string] {
  const [h, a] = matchupLooks(home, away);
  return [h.slab, a.slab];
}

/**
 * A team as one game shows it, everywhere that game is on screen: the scorebug's block, the graphics,
 * the charts and the players on the floor all read from this, so a team is one colour all night.
 */
export interface MatchKit {
  /** The team's colour tonight (white text reads on it): its block, its graphics, its chart marks. */
  color: string;
  /** A second colour that stands apart from it: a pinstripe, an edge. */
  trim: string;
  /** The colour lifted to stand out on ink (the win bar, a dot on an ink plate). */
  night: string;
  /** The colour as text on the paper. */
  text: string;
  /** Wears the light kit on the floor (the home team, as on its own painted key). */
  light: boolean;
  /** A player on the court: the disc, its ring and his number. */
  token: { fill: string; ring: string; num: string };
}

/** Two markers on ink (the win bar's halves, the break board's bars) closer than this read as one team's. */
const NIGHT_APART = 0.16;

/** The light kit's cloth: a warm white that reads on the maple and on any painted key. */
const HOME_WHITE = '#fbf8f1';

/**
 * Tonight's two kits, [home, away]. The home team wears white trimmed in its colour (it stands on its
 * own paint), the visitors their colour solid: the two never look alike on the floor. Colours that read
 * as the same (matchupLooks) send the visitors to their next one, here and everywhere else.
 */
export function matchKits(home: [string, string, string], away: [string, string, string]): [MatchKit, MatchKit] {
  const [h, a] = matchupLooks(home, away);
  // on ink both are lifted toward white, which brings two dark colours together (a navy and a black):
  // the visitors' marker then takes the first of their other colours that stands apart (white last)
  const nights = [nightFill(h.slab), nightFill(a.slab)];
  if (lookDistance(nights[0], nights[1]) < NIGHT_APART) {
    const others = [a.trim, ...away, '#ffffff', '#9aa3ad'].map(nightFill);
    nights[1] = others.find((c) => lookDistance(c, nights[0]) >= NIGHT_APART) ?? others.sort((x, y) => lookDistance(y, nights[0]) - lookDistance(x, nights[0]))[0];
  }
  const kit = (l: TeamLook, light: boolean): MatchKit => ({
    color: l.slab,
    trim: l.trim,
    night: nights[light ? 0 : 1],
    text: onPaper(l.slab),
    light,
    token: light ? { fill: HOME_WHITE, ring: l.slab, num: l.slab } : { fill: l.slab, ring: contrast(l.trim, l.slab) >= 1.6 ? l.trim : '#ffffff', num: '#ffffff' },
  });
  return [kit(h, true), kit(a, false)];
}

/** A team's identity colours, for its slabs, its jersey badges and your rows. */
export interface TeamLook {
  /** The slab's base: the primary, darkened until white text reads on it (a near-white primary gives way to the darkest other). */
  slab: string;
  /** The trim along a slab and a jersey's neck and armholes: the next colour that stands apart from the slab. */
  trim: string;
  /** The colour it's known by (identityColor), darkened until it reads as text on the paper and its surfaces. */
  text: string;
}

/** --raised: card stock, the other ground team-coloured text sits on. */
const RAISED = '#ffffff';

export function teamLook(colors: [string, string, string]): TeamLook {
  const [p, ...rest] = colors;
  // a near-white primary (the Spurs' silver) makes a grey slab: the darkest other colour leads instead
  const base = luminance(p) > 0.45 ? ([...rest].sort((a, b) => luminance(a) - luminance(b))[0] ?? p) : p;
  let slab = base;
  // white text on the slab's lightest corner (the base with 8% white mixed in) keeps 4.5:1
  for (let t = 0.08; contrast('#ffffff', mix(slab, '#ffffff', 0.08)) < 4.5 && t <= 1; t += 0.08) slab = mix(base, '#000000', t);
  const trim = [...colors, '#ffffff'].find((c) => c.toLowerCase() !== base.toLowerCase() && colorDistance(c, slab) >= CLASH) ?? '#ffffff';
  // the primary, unless it's near-black or near-white (the Nets' black, the Spurs' silver): then the most vivid other
  return { slab, trim, text: onPaper(identityColor(colors)) };
}

/** A colour as text: darkened until it reads on the paper and its surfaces (4.5:1). */
function onPaper(color: string): string {
  let text = color;
  for (let t = 0.1; [SURFACE_2, RAISED, BG].some((g) => contrast(text, g) < 4.5) && t <= 1; t += 0.1) text = mix(color, '#000000', t);
  return text;
}

/** The colour a team is known by: its primary, unless that's too light to read as a colour on the paper (a black primary is printed as black). */
export function identityColor(colors: [string, string, string]): string {
  const l = luminance(colors[0]);
  return l < 0.45 ? colors[0] : teamAccent(colors);
}

/**
 * Two teams' looks side by side (a scorebug, a final, a pre-game slab): when their slabs would read as
 * the same colour, the away side leads with its second colour (then its third, then a neutral slate).
 */
export function matchupLooks(home: [string, string, string], away: [string, string, string]): [TeamLook, TeamLook] {
  const h = teamLook(home);
  const tries: [string, string, string][] = [away, [away[1], away[0], away[2]], [away[2], away[0], away[1]]];
  for (const c of tries) {
    const a = teamLook(c);
    if (lookDistance(a.slab, h.slab) >= SAME_LOOK) return [h, a];
  }
  return [h, { ...teamLook(away), slab: '#2a3441' }];
}

/** A slab in another team's colours: the custom properties `.slab` reads. */
export function slabVars(colors: [string, string, string]): Record<string, string> {
  const l = teamLook(colors);
  return { '--slab': l.slab, '--slab-2': l.trim };
}

/** A jersey badge's colours: its fill, the trim, and the number (in the trim when it stands out from the fill, else white or ink). */
export function jerseyKit(colors: [string, string, string]): { fill: string; trim: string; num: string } {
  const fill = colors[0];
  const trim = colors[1].toLowerCase() === fill.toLowerCase() ? colors[2] : colors[1];
  return { fill, trim, num: contrast(trim, fill) >= 3 ? trim : inkOn(fill) };
}

/** How far a colour is from grey (0..1): its brightest channel less its dimmest. */
function chroma(hex: string): number {
  const v = rgb(hex);
  return Math.max(...v) - Math.min(...v);
}
/** Under this a colour reads as a grey (black, silver, white): a switch or a play button in it looks switched off. */
const VIVID = 0.15;
/** A link this close to the body text (contrast with the ink) reads as plain text: navy on near-black. */
const APART = 1.5;

/** Your team's tokens: --team (its most vivid colour), --team-2 (the trim), --team-slab, --team-text / --team-link-line (links: the colour, underlined when there is none), --team-ink, --team-fill / --team-fill-ink (a switch, a fill on the paper) and --team-night / --team-night-ink (the play button on the ink dock). */
export function applyAccent(colors: [string, string, string] | null) {
  const root = document.documentElement.style;
  if (!colors) {
    for (const k of ['--team', '--team-2', '--team-ink', '--team-text', '--team-link-line', '--team-slab', '--team-fill', '--team-fill-ink', '--team-night', '--team-night-ink'])
      root.removeProperty(k);
    return;
  }
  const l = teamLook(colors);
  const team = identityColor(colors);
  root.setProperty('--team', team);
  root.setProperty('--team-2', l.trim);
  root.setProperty('--team-ink', inkOn(team));
  root.setProperty('--team-slab', l.slab);
  // links: the team's readable colour, unless it's grey or reads as the body text (navy); then its most
  // vivid readable colour that stands apart; a team with none (the Nets, the Spurs) gets ink, underlined
  const reads = (c: string) => chroma(c) >= VIVID && contrast(c, INK) >= APART;
  const link = reads(l.text)
    ? l.text
    : colors
        .map(onPaper)
        .filter(reads)
        .sort((a, b) => chroma(b) - chroma(a))[0];
  root.setProperty('--team-text', link ?? INK);
  root.setProperty('--team-link-line', link ? 'none' : 'underline');
  // a switch that's on: the team colour, or ink when it's a grey (the Spurs' silver would look switched off)
  const fill = chroma(accentFill(team)) >= VIVID ? accentFill(team) : INK;
  root.setProperty('--team-fill', fill);
  root.setProperty('--team-fill-ink', inkOn(fill));
  // the play button sits on the ink dock: the team's most vivid colour, lightened until it stands out there
  // (the Bulls' red, not their black trim); white when every colour is a grey (the Nets, the Spurs)
  const lit = colors.map(nightFill).sort((a, b) => chroma(b) - chroma(a))[0];
  const night = chroma(lit) >= VIVID ? lit : '#ffffff';
  root.setProperty('--team-night', night);
  root.setProperty('--team-night-ink', inkOn(night));
}

/** A team colour as a fill on the paper (a switch that's on, a progress bar): darkened until it stands out from the page (3:1). */
export function accentFill(color: string): string {
  let fill = color;
  for (let t = 0.08; contrast(fill, BG) < 3 && t <= 1; t += 0.08) fill = mix(color, '#000000', t);
  return fill;
}

/** A team colour as a fill on the ink dock (the play button): lightened until it stands out from the ink (3:1). */
export function nightFill(color: string): string {
  let fill = color;
  for (let t = 0.08; contrast(fill, INK) < 3 && t <= 1; t += 0.08) fill = mix(color, '#ffffff', t);
  return fill;
}

/**
 * A home team's building, as the live game's courts draw it (Court.tsx paints the floor, court3d/ the
 * stands round it): the maple's stain, how the keys, the apron and the centre circle are done, the words
 * round the floor, the seats by section, the walls' padded tops, the concrete and the house lights, and
 * what tells it from another from the broadcast's camera (its fascia, concourse, suites, aisles, crowd,
 * pads and boards). Each is picked from the team's own colours by a hash of its letters, so it is the
 * same building every night, and two teams in the same colours (two navies) still play in different
 * ones. No real arena's marks: shapes, colours and the team's own name.
 */
export interface Venue {
  /** The bare maple, its stain: a pale blonde to a deep honey. */
  wood: string;
  /** The keys: painted solid, or stained wood edged in the paint. */
  key: 'paint' | 'stain';
  /** The keys' paint (the home team's colour tonight, or a neutral floor's ink). */
  paint: string;
  /** Inside the three-point lines a stain of its own (a two-tone floor), or none. */
  arc: string | null;
  /** The apron round the floor, its letters, and the pinstripe where it meets the court. */
  apron: string;
  apronInk: string;
  pin: string;
  /** The centre circle: filled with the paint and the mark in it, wood ringed in the paint, or the mark big across it. */
  circle: 'paint' | 'ring' | 'big';
  /** The words along each baseline (far end first: the end the home side attacks second), and along the sidelines ('' for none). */
  baselines: [string, string];
  sideline: string;
  /** The stands' seats by section: the sides' lower rows, the ends', the rows high up (and the upper deck). */
  seats: [string, string, string];
  /** The walls' padded tops, the tunnels' heads, press row's cloth. */
  rail: string;
  /** The concourse's lit signs (the paint and the rail, lifted to read as light), and its section plates (the paint, deep). */
  signs: [string, string];
  plate: string;
  /** What the steps and walls are tinted (the concrete: warm, plain or cool), and the house lights' colour. */
  concrete: string;
  house: string;
  /** A number of the building's own (its partners' order on the boards). */
  seed: number;
  /**
   * What makes it a place of its own from the broadcast's camera, past its colours: the top of the lower bowl
   * right across the picture (a rail of glass, a wall in the rail's colour, or a ribbon of lamps); the
   * concourse's wall behind the walkway (dark, brick, pale stone, timber, or the paint's deep shade); the
   * suites' glass (its frames' colour, the light inside: 0 warm, 1 mixed, 2 cool; how many bays to a run);
   * how the seats' colours lie (by section, mixed seat by seat, or shading from one to the next up the rows);
   * the edges of its aisles' steps (amber, white, the rail's colour or plain concrete); how many of its crowd
   * come in its colours; the pads on the baskets' stanchions; and the boards' own look (0 or 1).
   */
  fascia: 'glass' | 'wall' | 'ribbon';
  concourse: 'dark' | 'brick' | 'stone' | 'timber' | 'paint';
  suites: { frame: string; light: 0 | 1 | 2; bays: number };
  /** How its stands are built (court3d/bowl.ts Stands): its aisles and tunnels, its corners, its upper levels. */
  stands: Stands;
  seatMix: 'sections' | 'confetti' | 'fade';
  aisles: string;
  crowd: number;
  pad: string;
  boards: 0 | 1;
  /** The letters the fans' signs carry (the team's abbreviation; none on a neutral floor). */
  letters: string;
  /** How its floor is drawn past its colours (see CourtLook). */
  court: CourtLook;
  /** Its roof, its catwalks and its scoreboard (see Roofing). */
  roof: Roofing;
}

/**
 * What is over the floor, the building's own (court3d/arena.ts Roof; what a camera looking up, or the broadcast's
 * wide one along the top of its picture, tells two buildings apart by): its roof (deep trusses of steel, a flat
 * ceiling with rings of lights let into it, or a dark open roof on arched ribs), where its catwalks run (along the
 * sides, a ring round the scoreboard, or across over the ends), and its scoreboard (a big four-sided one, a small
 * one in a halo of ribbon, a slim one of four flat panels, or a long one with screens on its ends) and how big (1
 * its usual size).
 */
export interface Roofing {
  kind: 'trusses' | 'ceiling' | 'open';
  catwalk: 'sides' | 'ring' | 'ends';
  board: 'four' | 'halo' | 'slim' | 'long';
  size: number;
}

/**
 * How a floor is drawn past its colours (Court.tsx paintFloor), the building's own every night: how its
 * boards are laid (in strips along the floor, or a parquet of squares with every other one turned); its
 * lanes' paint (plain, a band of the trim inside their lines, or a pinstripe of it a little in); centre
 * court (the mark alone, the mark with the name set round the circle, or the name in big letters across
 * it); its words (solid capitals, outlined, a leaning italic, or spaced wide); where the court meets the
 * apron (one pinstripe, two, or a band); and the trim its details are drawn in (it reads on the paint).
 */
export interface CourtLook {
  laying: 'strips' | 'parquet';
  lane: 'plain' | 'band' | 'pin';
  centre: 'mark' | 'ringed' | 'word';
  words: 'block' | 'outline' | 'italic' | 'wide';
  border: 'pin' | 'double' | 'band';
  trim: string;
}

/** The floors laid in parquet whatever the hash says: a famous one. */
const PARQUET = new Set(['BOS']);

/**
 * How a building's stands are built, past its colours (what tells two buildings apart from the broadcast's
 * camera when their colours are alike): how many seats between its aisles; the row its tunnels come up
 * through the lower bowl at (each four rows deep), and whether every aisle in reach has one or every other;
 * its corners' rows filled with seats or closed under a cover in its colour; and over the walkway, which rows
 * of the upper deck it has (of one slope: the first and the last; under the first a second ring of suites, a
 * club level, in front of the deck's first rows where they are missing).
 */
export interface Stands {
  aisle: number;
  vom: number;
  tunnels: 1 | 2;
  corners: 'seats' | 'covered';
  deck: [number, number];
}

/** The maple's stains, light to dark. */
const STAINS = ['#ebd1a6', '#e5c292', '#dcae76', '#cc9c68', '#bd8b5e'];
/** The house lights: a warm hall, a plain one, a cool one; and the concrete each is built of. */
const HOUSES = [
  { house: '#ffd6a6', concrete: '#f2d9bf' },
  { house: '#fff1dc', concrete: '#eae6df' },
  { house: '#dde8ff', concrete: '#cdd9ea' },
];
/** A dark seat with no team in it: charcoal. */
const CHARCOAL = '#2c2e33';

/** A steady number from a team's letters (FNV-1a): its building's picks. */
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The home team's building: `colors` its three, `paint` and `trim` its colour and second tonight (its
 * kit's), `abbrev` the key its picks are made by, `name` and `region` its words round the floor.
 */
export function venueLook(colors: [string, string, string], paint: string, trim: string, abbrev: string, name: string, region: string): Venue {
  const h = hashOf(abbrev.toUpperCase());
  /** The `salt`th pick of `n`: each pick its own run of the hash. */
  const pick = (n: number, salt: number) => (Math.imul(h ^ (salt * 0x9e3779b9), 0x85ebca6b) >>> 0) % n;
  /** The same, its bits stirred first: a pick of four is not the same pick of four as every other's (the floor's). */
  const deal = (n: number, salt: number) => {
    let x = Math.imul(h ^ Math.imul(salt, 0x9e3779b9), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) % n;
  };
  const wood = STAINS[pick(STAINS.length, 1)];
  // the team's second colour, if it is one that stands apart from the first and is deep enough for white letters
  // (the Bulls' black, the Celtics' gold no; the Pelicans' red yes): else the paint again
  const second = colors.find((c) => lookDistance(c, paint) >= 0.16 && contrast('#ffffff', c) >= 3 && chroma(c) > 0.04) ?? null;
  const deep = (c: string) => mix(c, '#000000', 0.18);
  const apronPick = pick(10, 2);
  const apron = apronPick < 4 ? paint : apronPick < 6 && second ? second : apronPick < 8 ? mix(wood, '#3a2210', 0.62) : '#1c1d20';
  const key = pick(3, 3) === 0 ? 'stain' : 'paint';
  const arcPick = pick(5, 4);
  const arc = arcPick === 0 ? mix(wood, '#ffffff', 0.18) : arcPick === 1 ? mix(wood, '#4a2a10', 0.14) : null;
  const circle = (['paint', 'paint', 'ring', 'big'] as const)[pick(4, 5)];
  const baselines: [string, string] = pick(2, 6) ? [name, name] : [region || name, name];
  const sideline = region && pick(3, 7) ? region : '';
  const seatPick = pick(4, 8);
  const alt = second ?? CHARCOAL;
  const seats: [string, string, string] =
    seatPick === 0 ? [paint, paint, deep(paint)] : seatPick === 1 ? [paint, alt, CHARCOAL] : seatPick === 2 ? [alt, paint, paint] : [paint, CHARCOAL, alt];
  const { house, concrete } = HOUSES[pick(HOUSES.length, 9)];
  const rail = pick(2, 10) && second ? second : paint;
  const fascia = (['glass', 'wall', 'ribbon'] as const)[pick(3, 11)];
  const concourse = (['dark', 'brick', 'stone', 'timber', 'paint'] as const)[pick(5, 12)];
  const framePick = pick(3, 13);
  const suites = { frame: framePick === 0 ? '#0b0c0e' : framePick === 1 ? '#8d9199' : mix(paint, '#000000', 0.45), light: pick(3, 14) as 0 | 1 | 2, bays: [6, 8, 10][pick(3, 15)] };
  const stands: Stands = {
    aisle: [15, 19, 23][pick(3, 21)],
    vom: [5, 8, 10][pick(3, 22)],
    tunnels: pick(3, 23) ? 1 : 2,
    corners: pick(3, 24) ? 'seats' : 'covered',
    deck: (
      [
        [0, 13],
        [0, 16],
        [4, 13],
        [0, 9],
      ] as [number, number][]
    )[pick(4, 25)],
  };
  const seatMix = (['sections', 'sections', 'confetti', 'fade'] as const)[pick(4, 16)];
  const aisles = ['#c9a13a', '#c8c4ba', rail, '#5a5c63'][pick(4, 19)];
  const crowd = [0.26, 0.36, 0.46, 0.6][pick(4, 20)];
  const padPick = pick(5, 17);
  const pad = padPick < 3 ? paint : padPick === 3 && second ? second : '#26282d';
  return {
    wood,
    key,
    paint,
    arc,
    apron,
    apronInk: apron === paint || apron === second ? (contrast(trim, apron) >= 3 ? trim : '#ffffff') : '#ffffff',
    pin: apron === paint ? (lookDistance(trim, paint) > 0.12 ? trim : '#ffffff') : paint,
    circle,
    baselines,
    sideline,
    seats,
    rail,
    signs: [nightFill(paint), nightFill(rail)],
    plate: mix(paint, '#000000', 0.58),
    concrete,
    house,
    seed: h,
    fascia,
    concourse,
    suites,
    stands,
    seatMix,
    aisles,
    crowd,
    pad,
    boards: pick(2, 18) as 0 | 1,
    letters: abbrev.toUpperCase(),
    court: {
      laying: PARQUET.has(abbrev.toUpperCase()) || deal(9, 30) === 0 ? 'parquet' : 'strips',
      lane: (['plain', 'band', 'pin'] as const)[deal(3, 31)],
      // (a big mark across the circle is its centre already)
      centre: circle === 'big' ? 'mark' : (['mark', 'ringed', 'word'] as const)[deal(3, 32)],
      words: (['block', 'outline', 'italic', 'wide'] as const)[deal(4, 33)],
      border: (['pin', 'double', 'band'] as const)[deal(3, 34)],
      trim: lookDistance(trim, paint) > 0.14 && contrast(trim, paint) >= 1.6 ? trim : second && contrast(second, paint) >= 1.6 ? second : '#ffffff',
    },
    roof: {
      kind: (['trusses', 'ceiling', 'open'] as const)[deal(3, 40)],
      catwalk: (['sides', 'ring', 'ends'] as const)[deal(3, 41)],
      board: (['four', 'halo', 'slim', 'long'] as const)[deal(4, 42)],
      size: [0.9, 1, 1.12][deal(3, 43)],
    },
  };
}

/** A neutral floor's building (the Cup final): classic maple, ink keys and apron, a gold pinstripe, charcoal and slate seats, plain lights. */
export function neutralVenue(name: string): Venue {
  return {
    wood: STAINS[2],
    key: 'paint',
    paint: INK,
    arc: null,
    apron: '#1c1d20',
    apronInk: '#c9a24a',
    pin: '#c9a24a',
    circle: 'paint',
    baselines: [name, name],
    sideline: '',
    seats: ['#3a3f48', CHARCOAL, '#4a4f58'],
    rail: '#8a7440',
    signs: ['#9aa0aa', '#d8b25a'],
    plate: '#1c1d20',
    concrete: HOUSES[1].concrete,
    house: HOUSES[1].house,
    seed: 0,
    fascia: 'glass',
    concourse: 'stone',
    suites: { frame: '#8d9199', light: 1, bays: 8 },
    stands: { aisle: 19, vom: 8, tunnels: 1, corners: 'seats', deck: [0, 13] },
    seatMix: 'sections',
    aisles: '#c8c4ba',
    crowd: 0.2,
    pad: '#26282d',
    boards: 1,
    letters: '',
    court: { laying: 'strips', lane: 'pin', centre: 'mark', words: 'wide', border: 'double', trim: '#c9a24a' },
    roof: { kind: 'trusses', catwalk: 'sides', board: 'four', size: 1 },
  };
}
