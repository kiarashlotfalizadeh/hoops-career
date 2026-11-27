// Posters to share: a player's card, a game's result and a title, each drawn straight onto a canvas
// as a 1080 x 1350 picture (four by five: whole in a feed, a chat and a story) and handed over as a
// PNG. Hardwood's own print: the team's colour as a solid block with the court's white lines, the
// name in the expanded black cut, the one big figure condensed, the box score in mono, a paper foot.
// Nothing here reads the league: a spec is plain words, figures and colours (share/specs.ts builds
// them), so a poster is the same picture wherever it is drawn. No real marks: a team is its letters
// and its colours.
import { contrast, matchupLooks, teamLook } from '../teamColors';

export const POSTER_W = 1080;
export const POSTER_H = 1350;

type Colors = [string, string, string];

export interface PlayerPoster {
  kind: 'player';
  colors: Colors;
  /** "SG · Oklahoma City Thunder". */
  over: string;
  first: string;
  last: string;
  /** His number, or nothing. */
  jersey?: string;
  ovr: number;
  /** "POT 97", or what else stands under the big figure. */
  under?: string;
  /** Up to four figures across the foot: PTS 32.1 ... */
  figs: { k: string; v: string }[];
  /** What the figures are: "2026-27 per game". */
  note: string;
}

export interface GamePoster {
  kind: 'game';
  /** Away, then home, as a final has them left to right. */
  sides: [{ abbrev: string; name: string; colors: Colors; score: number }, { abbrev: string; name: string; colors: Colors; score: number }];
  /** "Final · Tue, Feb 9". */
  over: string;
  head: string;
  /** The player of the game and his line. */
  hero?: { name: string; line: string };
  /** What it means, two short lines at most. */
  means: string[];
}

export interface TitlePoster {
  kind: 'title';
  colors: Colors;
  /** "2026-27 champions". */
  over: string;
  region: string;
  name: string;
  /** "4-2" and "def. Boston Celtics in the Finals". */
  fig?: string;
  figLabel?: string;
  /** Lines under it: the record, the Finals MVP, the coach. */
  lines: string[];
}

export type PosterSpec = PlayerPoster | GamePoster | TitlePoster;

const PAPER = '#f3efe7';
const INK = '#121212';
const HEAD = "'Archivo Variable', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

type Ctx = CanvasRenderingContext2D;

/** The family's three cuts: the expanded headline, the condensed figure, the text. */
const head = (px: number, w = 900) => `${w} expanded ${px}px ${HEAD}`;
const fig = (px: number) => `900 extra-condensed ${px}px ${HEAD}`;
const text = (px: number, w = 600) => `${w} ${px}px ${HEAD}`;
const mono = (px: number, w = 500) => `${w} ${px}px ${MONO}`;

function tracking(ctx: Ctx, em: number, px: number) {
  // (letter-spacing on a canvas is newer than the rest: without it the words are a hair looser)
  (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${(em * px).toFixed(2)}px`;
}

/** Draw `s` no wider than `max`, in `font(px)` at the biggest size up to `px` that fits; returns the size used. */
function fit(ctx: Ctx, s: string, x: number, y: number, max: number, px: number, font: (px: number) => string, em = 0, min = 28): number {
  let size = px;
  for (; size > min; size -= 2) {
    ctx.font = font(size);
    tracking(ctx, em, size);
    if (ctx.measureText(s).width <= max) break;
  }
  ctx.font = font(size);
  tracking(ctx, em, size);
  ctx.fillText(s, x, y);
  return size;
}

/** `s` broken into lines no wider than `max` in the font now set (at most `most` lines, the last one cut with an ellipsis). */
function wrap(ctx: Ctx, s: string, max: number, most: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= max || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= most) return lines;
  const kept = lines.slice(0, most);
  let last = kept[most - 1];
  while (last && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
  kept[most - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Half a court's lines in white under a block's content, anchored to the block's foot (as a slab has them). */
function courtLines(ctx: Ctx, x: number, y: number, w: number, h: number, alpha = 0.16) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 5;
  const cx = x + w / 2;
  const base = y + h;
  // the key, the free-throw circle, the arc and the restricted area, the baseline at the foot
  const u = w / 100;
  ctx.strokeRect(cx - 16 * u, base - 38 * u, 32 * u, 38 * u + 10);
  ctx.beginPath();
  ctx.arc(cx, base - 38 * u, 12 * u, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 44 * u, base);
  ctx.lineTo(cx - 44 * u, base - 28 * u);
  ctx.arc(cx, base - 10 * u, 47.5 * u, Math.PI + 0.39, -0.39);
  ctx.lineTo(cx + 44 * u, base);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, base - 10.5 * u, 8 * u, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
}

/** The paper strip along a poster's foot: the game's name and what the poster is of. */
function foot(ctx: Ctx, label: string, ground = PAPER, ink = INK) {
  const h = 96;
  ctx.fillStyle = ground;
  ctx.fillRect(0, POSTER_H - h, POSTER_W, h);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = head(30);
  tracking(ctx, -0.04, 30);
  ctx.fillText('Clipboard GM', 64, POSTER_H - h / 2 + 2);
  ctx.textAlign = 'right';
  ctx.font = mono(24);
  tracking(ctx, -0.01, 24);
  ctx.fillText(label, POSTER_W - 64, POSTER_H - h / 2 + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function playerPoster(ctx: Ctx, p: PlayerPoster) {
  const look = teamLook(p.colors);
  const M = 64;
  ctx.fillStyle = look.slab;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  courtLines(ctx, 0, 0, POSTER_W, POSTER_H - 96);
  ctx.fillStyle = '#fff';
  ctx.font = mono(30);
  tracking(ctx, -0.01, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  fit(ctx, p.over, M, 112, POSTER_W - M * 2, 30, (px) => mono(px), -0.01, 20);
  // the two giant figures: his number in the trim where it stands off the slab, his OVR on white card stock
  const trim = contrast(look.trim, look.slab) >= 3 ? look.trim : '#ffffff';
  if (p.jersey) {
    ctx.fillStyle = trim;
    ctx.font = fig(430);
    tracking(ctx, -0.03, 430);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.jersey, M - 8, 520);
  }
  const cw = 330;
  const ch = 330;
  const cx = POSTER_W - M - cw;
  const cy = 190;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 44);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = fig(250);
  tracking(ctx, -0.03, 250);
  ctx.fillText(String(p.ovr), cx + cw / 2, cy + 232);
  ctx.font = mono(28, 600);
  tracking(ctx, -0.01, 28);
  ctx.fillText(p.under ? `OVR · ${p.under}` : 'OVR', cx + cw / 2, cy + 290);
  ctx.textAlign = 'left';
  // the name: the first quieter, the last as big as the poster is wide
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = head(56, 760);
  tracking(ctx, -0.03, 56);
  fit(ctx, p.first, M, 700, POSTER_W - M * 2, 56, (px) => head(px, 760), -0.03);
  ctx.fillStyle = '#ffffff';
  fit(ctx, p.last, M - 4, 850, POSTER_W - M * 2, 170, (px) => head(px), -0.045, 60);
  // the box score across the foot, under a white rule
  const top = 928;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(M, top, POSTER_W - M * 2, 5);
  const n = Math.max(1, p.figs.length);
  const colW = (POSTER_W - M * 2) / n;
  p.figs.forEach((f, i) => {
    const x = M + colW * i;
    ctx.fillStyle = '#ffffff';
    ctx.font = mono(76, 600);
    tracking(ctx, -0.05, 76);
    ctx.fillText(f.v, x, top + 104);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = mono(26);
    tracking(ctx, 0, 26);
    ctx.fillText(f.k, x, top + 146);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = mono(26);
  ctx.fillText(p.note, M, top + 208);
  foot(ctx, 'Player card');
}

function gamePoster(ctx: Ctx, g: GamePoster) {
  const M = 64;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  ctx.fillStyle = '#645f55';
  ctx.font = mono(30);
  tracking(ctx, -0.01, 30);
  fit(ctx, g.over, M, 112, POSTER_W - M * 2, 30, (px) => mono(px), -0.01, 20);
  // the headline, three lines at most
  ctx.fillStyle = INK;
  let size = 92;
  let lines: string[] = [];
  for (; size >= 40; size -= 4) {
    ctx.font = head(size);
    tracking(ctx, -0.04, size);
    lines = wrap(ctx, g.head, POSTER_W - M * 2, 3);
    // (whole, and no one word wider than the poster: "Gilgeous-Alexander's" at full size)
    if (!lines[lines.length - 1].endsWith('…') && lines.every((l) => ctx.measureText(l).width <= POSTER_W - M * 2)) break;
  }
  lines.forEach((l, i) => ctx.fillText(l, M - 2, 216 + i * size * 1.02));
  // the board: two team blocks side by side, the court across them, the scores as big as they come
  const by = 216 + lines.length * size * 1.02 + 20;
  const bh = 520;
  const bw = (POSTER_W - M * 2) / 2;
  const win = g.sides[0].score > g.sides[1].score ? 0 : 1;
  // (two teams whose colours read alike: the away side wears its next colour, as a final's board has it)
  const [homeLook, awayLook] = matchupLooks(g.sides[1].colors, g.sides[0].colors);
  const fills = [awayLook.slab, homeLook.slab];
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(M, by, bw * 2, bh, 44);
  ctx.clip();
  fills.forEach((fill, i) => {
    ctx.fillStyle = fill;
    ctx.fillRect(M + bw * i, by, bw, bh);
  });
  // the court's centre line and circle across the seam
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(M + bw, by);
  ctx.lineTo(M + bw, by + bh);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(M + bw, by + bh / 2, 130, 0, Math.PI * 2);
  ctx.stroke();
  g.sides.forEach((s, i) => {
    const x = M + bw * i;
    ctx.textAlign = 'center';
    ctx.fillStyle = i === win ? '#ffffff' : 'rgba(255,255,255,0.74)';
    ctx.font = fig(290);
    tracking(ctx, -0.03, 290);
    ctx.fillText(String(s.score), x + bw / 2, by + 330);
    ctx.fillStyle = '#ffffff';
    ctx.font = head(54);
    tracking(ctx, -0.04, 54);
    ctx.fillText(s.abbrev, x + bw / 2, by + 422);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = mono(24);
    tracking(ctx, -0.01, 24);
    fit(ctx, s.name, x + bw / 2, by + 466, bw - 40, 24, (px) => mono(px), -0.01, 16);
  });
  ctx.restore();
  // "Final" on the seam, a white pill
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(M + bw - 62, by + 26, 124, 50, 25);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = text(26, 760);
  tracking(ctx, 0, 26);
  ctx.fillText('Final', M + bw, by + 60);
  ctx.textAlign = 'left';
  // the player of the game under a 2px ink rule, then what it means
  let y = by + bh + 70;
  if (g.hero) {
    ctx.fillStyle = INK;
    ctx.fillRect(M, y - 44, POSTER_W - M * 2, 4);
    ctx.font = head(44);
    tracking(ctx, -0.035, 44);
    fit(ctx, g.hero.name, M, y + 20, POSTER_W - M * 2, 44, (px) => head(px), -0.035);
    ctx.fillStyle = '#3b3833';
    fit(ctx, g.hero.line, M, y + 66, POSTER_W - M * 2, 30, (px) => mono(px), -0.03, 18);
    y += 128;
  }
  ctx.fillStyle = '#3b3833';
  ctx.font = text(32, 560);
  tracking(ctx, -0.01, 32);
  for (const m of g.means.slice(0, 2)) {
    if (y > POSTER_H - 96 - 30) break;
    fit(ctx, m, M, y, POSTER_W - M * 2, 32, (px) => text(px, 560), -0.01, 20);
    y += 46;
  }
  foot(ctx, 'Final', INK, '#ffffff');
}

function titlePoster(ctx: Ctx, t: TitlePoster) {
  const look = teamLook(t.colors);
  const M = 64;
  ctx.fillStyle = look.slab;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  courtLines(ctx, 0, 0, POSTER_W, POSTER_H - 96, 0.14);
  const trim = contrast(look.trim, look.slab) >= 3 ? look.trim : '#ffffff';
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  fit(ctx, t.over, M, 112, POSTER_W - M * 2, 30, (px) => mono(px), -0.01, 20);
  // the cup, in the team's trim: a bowl, two handles, a stem and a foot
  const cx = POSTER_W / 2;
  ctx.fillStyle = trim;
  ctx.strokeStyle = trim;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(cx - 130, 190);
  ctx.lineTo(cx + 130, 190);
  ctx.bezierCurveTo(cx + 130, 370, cx + 70, 430, cx, 440);
  ctx.bezierCurveTo(cx - 70, 430, cx - 130, 370, cx - 130, 190);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + s * 148, 268, 54, s > 0 ? -Math.PI / 2 : Math.PI / 2, s > 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
    ctx.stroke();
  }
  ctx.fillRect(cx - 18, 430, 36, 70);
  ctx.beginPath();
  ctx.roundRect(cx - 96, 494, 192, 34, 10);
  ctx.fill();
  // "Champions", the team under it
  ctx.fillStyle = '#ffffff';
  fit(ctx, 'Champions', M - 4, 690, POSTER_W - M * 2, 150, (px) => head(px), -0.045, 60);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  fit(ctx, t.region, M, 772, POSTER_W - M * 2, 52, (px) => head(px, 760), -0.03);
  ctx.fillStyle = '#ffffff';
  fit(ctx, t.name, M - 2, 868, POSTER_W - M * 2, 96, (px) => head(px), -0.04, 44);
  // the Finals under a white rule: the series as the one figure, what it was beside it
  const top = 916;
  ctx.fillRect(M, top, POSTER_W - M * 2, 5);
  let x = M;
  if (t.fig) {
    ctx.font = fig(170);
    tracking(ctx, -0.02, 170);
    ctx.fillText(t.fig, M - 2, top + 160);
    x = M + ctx.measureText(t.fig).width + 36;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  let y = top + 62;
  ctx.font = text(32, 640);
  tracking(ctx, -0.01, 32);
  for (const l of [t.figLabel, ...t.lines].filter((s): s is string => !!s).slice(0, 4)) {
    fit(ctx, l, x, y, POSTER_W - M - x, 32, (px) => text(px, 640), -0.01, 18);
    y += 46;
  }
  foot(ctx, 'Champions');
}

/** Draw a poster on a canvas of POSTER_W by POSTER_H. */
export function drawPoster(ctx: Ctx, spec: PosterSpec) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (spec.kind === 'player') playerPoster(ctx, spec);
  else if (spec.kind === 'game') gamePoster(ctx, spec);
  else titlePoster(ctx, spec);
}

/** A poster as a PNG, once the fonts it is set in are in. */
export async function posterBlob(spec: PosterSpec): Promise<Blob> {
  // (the cuts a canvas asks for load only when something asks: ask, then draw)
  await Promise.all([head(60), fig(60), text(30), mono(30), mono(30, 600)].map((f) => document.fonts.load(f).catch(() => [])));
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device could not draw the poster.');
  drawPoster(ctx, spec);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The poster could not be made.'))), 'image/png'));
}
