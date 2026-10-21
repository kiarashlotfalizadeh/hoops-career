// Team colours: readable variants of a team's colours on the Hardwood paper, for identity surfaces
// (slabs, jerseys, floors, your rows) and, for your own team, links, switches and the play button.

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

/** One readable colour per team for two-team charts, [home, away]: the colour each half of a game's board wears (deep enough to read on paper; `nightFill` it for ink), the away side switching when they clash. */
export function matchupColors(home: [string, string, string], away: [string, string, string]): [string, string] {
  const [h, a] = matchupLooks(home, away);
  return [h.slab, a.slab];
}

/** Jerseys on the live court, [home, away] as [fill, trim] (a trim matching its fill takes the third colour); on a clash the away side wears white. */
export function jerseyColors(home: [string, string, string], away: [string, string, string]): [[string, string], [string, string]] {
  const kit = (c: [string, string, string]): [string, string] => [c[0], c[1] === c[0] ? c[2] : c[1]];
  return [kit(home), colorDistance(home[0], away[0]) < CLASH ? ['#f1f1f1', away[0]] : kit(away)];
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
  const accent = identityColor(colors);
  let text = accent;
  for (let t = 0.1; [SURFACE_2, RAISED, BG].some((g) => contrast(text, g) < 4.5) && t <= 1; t += 0.1) text = mix(accent, '#000000', t);
  return { slab, trim, text };
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
    if (colorDistance(a.slab, h.slab) >= CLASH) return [h, a];
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

/** Your team's tokens: --team (its most vivid colour), --team-2 (the trim), --team-slab, --team-text, --team-ink, --team-fill / --team-fill-ink (a switch, a fill on the paper) and --team-night / --team-night-ink (the play button on the ink dock). */
export function applyAccent(colors: [string, string, string] | null) {
  const root = document.documentElement.style;
  if (!colors) {
    for (const k of ['--team', '--team-2', '--team-ink', '--team-text', '--team-slab', '--team-fill', '--team-fill-ink', '--team-night', '--team-night-ink'])
      root.removeProperty(k);
    return;
  }
  const l = teamLook(colors);
  const team = identityColor(colors);
  root.setProperty('--team', team);
  root.setProperty('--team-2', l.trim);
  root.setProperty('--team-ink', inkOn(team));
  root.setProperty('--team-text', l.text);
  root.setProperty('--team-slab', l.slab);
  const fill = accentFill(team);
  root.setProperty('--team-fill', fill);
  root.setProperty('--team-fill-ink', inkOn(fill));
  // the play button sits on the ink dock: the team's trim (its second colour), lightened until it stands out there
  const night = nightFill(l.trim);
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
