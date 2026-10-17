// Team colours for identity surfaces (slabs, jerseys, floors, your rows): readable variants of a
// team's colours on the dark theme. The app's controls keep the brand accent whatever the team.

const DEFAULT_ACCENT = '#3b82f6';
/** --surface-2, the lightest neutral surface team-coloured text sits on. */
const SURFACE_2 = '#1a212b';
const INK = '#0b0f15';

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

/** One readable colour per team for two-team charts, with the away side switching when they clash. */
export function matchupColors(home: [string, string, string], away: [string, string, string]): [string, string] {
  const h = teamAccent(home);
  const a = [teamAccent(away), ...away, '#e8ecf3'].find((c) => luminance(c) > 0.03 && colorDistance(c, h) >= CLASH) ?? '#e8ecf3';
  return [h, a];
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
  /** The colour it's known by (identityColor), lightened until it reads as text on the dark theme's raised surfaces. */
  text: string;
}

/** --surface-2 and --raised: the grounds team-coloured text sits on (a row of yours is tinted toward --raised). */
const RAISED = '#0e1218';

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
  for (let t = 0.1; [SURFACE_2, RAISED].some((g) => contrast(text, g) < 4.5) && t <= 1; t += 0.1) text = mix(accent, '#ffffff', t);
  return { slab, trim, text };
}

/** The colour a team is known by: its primary, unless that's too dark or too light to read as a colour on the dark theme. */
export function identityColor(colors: [string, string, string]): string {
  const l = luminance(colors[0]);
  return l > 0.03 && l < 0.6 ? colors[0] : teamAccent(colors);
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

/** Your team's identity tokens: --team (its most vivid colour), --team-2 (the trim), --team-slab, --team-text and --team-ink. The brand accent stays put. */
export function applyAccent(colors: [string, string, string] | null) {
  const root = document.documentElement.style;
  if (!colors) {
    for (const k of ['--team', '--team-2', '--team-ink', '--team-text', '--team-slab']) root.removeProperty(k);
    return;
  }
  const l = teamLook(colors);
  const team = identityColor(colors);
  root.setProperty('--team', team);
  root.setProperty('--team-2', l.trim);
  root.setProperty('--team-ink', inkOn(team));
  root.setProperty('--team-text', l.text);
  root.setProperty('--team-slab', l.slab);
}
