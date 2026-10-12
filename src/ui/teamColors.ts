// Team accent colours for the UI shell: pick the most vivid readable team colour, then derive
// an ink that stays legible on it and a text variant that stays legible on the dark theme.

const DEFAULT_ACCENT = '#3b82f6';
/** --surface-2, the lightest neutral surface accent-coloured text sits on. */
const SURFACE_2 = '#161d28';
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

/** Set --accent, --accent-ink (text on accent fills) and --accent-text (accent-coloured text). */
export function applyAccent(colors: [string, string, string] | null) {
  const accent = colors ? teamAccent(colors) : DEFAULT_ACCENT;
  const ink = inkOn(accent);
  // accent-coloured text is drawn on the page, raised surfaces and accent-tinted cards (.card.accent mixes
  // 22% of the accent into --surface-2): lighten it until it reads on the lightest of them
  const grounds = [SURFACE_2, mix(accent, SURFACE_2, 0.78)];
  let text = accent;
  for (let t = 0.1; grounds.some((g) => contrast(text, g) < 4.5) && t <= 1; t += 0.1) text = mix(accent, '#ffffff', t);
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-ink', ink);
  root.setProperty('--accent-text', text);
}
