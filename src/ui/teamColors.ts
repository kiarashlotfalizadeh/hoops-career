// Team accent colours for the UI shell: pick the most vivid readable team colour, then derive
// an ink that stays legible on it and a text variant that stays legible on the dark theme.

const DEFAULT_ACCENT = '#3b82f6';
const BG = '#06080c';

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

function mix(hex: string, toward: string, t: number): string {
  const a = rgb(hex);
  const b = rgb(toward);
  return `#${a.map((v, i) => Math.round((v + (b[i] - v) * t) * 255).toString(16).padStart(2, '0')).join('')}`;
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

/** Straight-line RGB distance (0..441): under ~90 two team colours read as the same. */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) * 255;
}

/** One readable colour per team for two-team charts, with the away side switching when they clash. */
export function matchupColors(home: [string, string, string], away: [string, string, string]): [string, string] {
  const h = teamAccent(home);
  const a = [teamAccent(away), ...away, '#e8ecf3'].find((c) => luminance(c) > 0.03 && colorDistance(c, h) >= 90) ?? '#e8ecf3';
  return [h, a];
}

/** Set --accent, --accent-ink (text on accent fills) and --accent-text (accent-coloured text). */
export function applyAccent(colors: [string, string, string] | null) {
  const accent = colors ? teamAccent(colors) : DEFAULT_ACCENT;
  const ink = contrast('#ffffff', accent) >= contrast('#0b0f15', accent) ? '#ffffff' : '#0b0f15';
  let text = accent;
  for (let t = 0.1; contrast(text, BG) < 4.5 && t <= 1; t += 0.1) text = mix(accent, '#ffffff', t);
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-ink', ink);
  root.setProperty('--accent-text', text);
}
