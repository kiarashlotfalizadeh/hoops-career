import type { OffRole, Pos, RatingKey, Ratings } from './types';
import { clamp } from './random';

export interface RatingMeta {
  key: RatingKey;
  label: string;
  short: string;
  group: 'Physical' | 'Scoring' | 'Playmaking' | 'Defense' | 'Rebounding';
  help: string;
}

export const RATING_META: RatingMeta[] = [
  { key: 'hgt', label: 'Size', short: 'SIZ', group: 'Physical', help: 'Height and length. Drives finishing over defenders, contesting, rebounding and rim protection.' },
  { key: 'spd', label: 'Speed', short: 'SPD', group: 'Physical', help: 'Quickness with and without the ball. Beating a defender off the bounce, staying in front, running the floor.' },
  { key: 'ath', label: 'Explosiveness', short: 'EXP', group: 'Physical', help: 'Vertical pop. Finishing above the rim, lobs, blocks and offensive boards.' },
  { key: 'str', label: 'Strength', short: 'STR', group: 'Physical', help: 'Holding position in the post, finishing through contact, screening.' },
  { key: 'end', label: 'Stamina', short: 'STA', group: 'Physical', help: 'How long he can play before fatigue erodes his performance. Fatigue also raises injury risk.' },
  { key: 'ins', label: 'Finishing', short: 'FIN', group: 'Scoring', help: 'Converting at the rim: layups, dunks, finishing through contests.' },
  { key: 'mid', label: 'Mid-Range', short: 'MID', group: 'Scoring', help: 'Pull-ups, floaters and mid-range jumpers. Key against drop coverage.' },
  { key: 'tp', label: 'Three Point', short: '3PT', group: 'Scoring', help: 'Three-point accuracy. Shooters also create spacing that opens driving lanes for teammates.' },
  { key: 'ft', label: 'Free Throw', short: 'FT', group: 'Scoring', help: 'Free throw accuracy. Low values invite intentional fouls late in games.' },
  { key: 'drw', label: 'Draw Foul', short: 'DRW', group: 'Scoring', help: 'Getting to the line on drives and post-ups.' },
  { key: 'post', label: 'Post Play', short: 'PST', group: 'Scoring', help: 'Back-to-basket scoring and footwork. Feasts on smaller switched defenders.' },
  { key: 'hnd', label: 'Ball Handling', short: 'HND', group: 'Playmaking', help: 'Creating off the dribble and protecting the ball against pressure, traps and presses.' },
  { key: 'pas', label: 'Passing', short: 'PAS', group: 'Playmaking', help: 'Vision and accuracy. Punishes blitzes, double teams and over-help with open looks for teammates.' },
  { key: 'oiq', label: 'Offensive IQ', short: 'OIQ', group: 'Playmaking', help: 'Shot selection, reads and feel. Improves every offensive action slightly and reduces turnovers.' },
  { key: 'perD', label: 'Perimeter D', short: 'PER', group: 'Defense', help: 'On-ball defense against guards and wings. Key in switching schemes and against isolations.' },
  { key: 'intD', label: 'Interior D', short: 'INT', group: 'Defense', help: 'Post defense and walling off drives in the paint.' },
  { key: 'blk', label: 'Shot Blocking', short: 'BLK', group: 'Defense', help: 'Altering and blocking shots at the rim. The anchor of drop coverage and zones.' },
  { key: 'stl', label: 'Steals', short: 'STL', group: 'Defense', help: 'Active hands and passing-lane reads. Pairs with pressure and blitz schemes.' },
  { key: 'diq', label: 'Defensive IQ', short: 'DIQ', group: 'Defense', help: 'Rotations, help timing and positioning. Makes complex schemes (zones, blitzes) work.' },
  { key: 'oreb', label: 'Off. Rebound', short: 'ORB', group: 'Rebounding', help: 'Crashing the offensive glass for second chances.' },
  { key: 'dreb', label: 'Def. Rebound', short: 'DRB', group: 'Rebounding', help: 'Finishing defensive possessions by securing the board.' },
];

export const RATING_KEYS: RatingKey[] = RATING_META.map((m) => m.key);

export const heightToRating = (inches: number) => clamp(50 + (inches - 79.5) * 4.3, 0, 100);
export const ratingToHeight = (h: number) => 79.5 + (h - 50) / 4.3;

export const fmtHeight = (inches: number) => {
  const i = Math.round(inches);
  return `${Math.floor(i / 12)}'${i % 12}"`;
};

// ---------------------------------------------------------------- composites
// Skill composites shared by the engine, AI coach and UI (so explanations match the math).

export interface Composites {
  rim: number; // finishing at rim
  close: number; // floaters / short paint shots
  midShot: number; // mid-range & pull-up 2
  c3: number; // catch-and-shoot three
  pu3: number; // pull-up three
  create: number; // beat a defender off the dribble
  pnrHandle: number; // run the pick and roll
  roll: number; // screen & roll threat
  pop: number; // pick-and-pop threat
  postScore: number;
  cut: number; // off-ball cutting / movement
  offBall: number; // running off screens
  passing: number;
  ballSec: number; // turnover avoidance
  foulDraw: number;
  perDef: number;
  intDef: number;
  rimProt: number;
  steal: number;
  helpD: number; // team defense / rotations
  orb: number;
  drb: number;
  spacing: number; // gravity from shooting (0-100)
  ft: number;
}

export function composites(r: Ratings): Composites {
  return {
    rim: 0.45 * r.ins + 0.18 * r.ath + 0.17 * r.hgt + 0.1 * r.str + 0.1 * r.oiq,
    close: 0.45 * r.ins + 0.3 * r.mid + 0.15 * r.oiq + 0.1 * r.hgt,
    midShot: 0.72 * r.mid + 0.13 * r.oiq + 0.15 * r.ft,
    c3: 0.88 * r.tp + 0.07 * r.oiq + 0.05 * r.ft,
    pu3: 0.72 * r.tp + 0.15 * r.hnd + 0.13 * r.oiq,
    create: 0.33 * r.hnd + 0.25 * r.spd + 0.2 * r.oiq + 0.12 * r.ath + 0.1 * r.str,
    pnrHandle: 0.32 * r.hnd + 0.26 * r.pas + 0.2 * r.oiq + 0.12 * r.mid + 0.1 * r.spd,
    roll: 0.3 * r.ins + 0.2 * r.ath + 0.2 * r.hgt + 0.15 * r.str + 0.15 * r.oiq,
    pop: 0.75 * r.tp + 0.15 * r.oiq + 0.1 * r.hgt,
    postScore: 0.42 * r.post + 0.2 * r.str + 0.18 * r.hgt + 0.1 * r.ins + 0.1 * r.oiq,
    cut: 0.32 * r.oiq + 0.28 * r.ins + 0.2 * r.spd + 0.2 * r.ath,
    offBall: 0.5 * r.tp + 0.25 * r.spd + 0.25 * r.oiq,
    passing: 0.62 * r.pas + 0.25 * r.oiq + 0.13 * r.hnd,
    ballSec: 0.45 * r.hnd + 0.35 * r.oiq + 0.2 * r.pas,
    foulDraw: 0.6 * r.drw + 0.2 * r.str + 0.2 * r.ins,
    perDef: 0.45 * r.perD + 0.22 * r.spd + 0.15 * r.diq + 0.1 * r.hgt + 0.08 * r.ath,
    intDef: 0.38 * r.intD + 0.25 * r.hgt + 0.17 * r.str + 0.12 * r.diq + 0.08 * r.ath,
    rimProt: 0.42 * r.blk + 0.28 * r.hgt + 0.15 * r.ath + 0.15 * r.intD,
    steal: 0.75 * r.stl + 0.15 * r.diq + 0.1 * r.spd,
    helpD: 0.6 * r.diq + 0.15 * r.spd + 0.15 * r.hgt + 0.1 * r.blk,
    orb: 0.45 * r.oreb + 0.25 * r.hgt + 0.15 * r.ath + 0.15 * r.str,
    drb: 0.45 * r.dreb + 0.3 * r.hgt + 0.1 * r.ath + 0.15 * r.str,
    spacing: clamp((r.tp - 25) * 1.45, 0, 100),
    ft: r.ft,
  };
}

// ---------------------------------------------------------------- overall

/** Size-aware blend: guards are judged on creation and shooting, bigs on finishing and protection. */
export function ovrRaw(r: Ratings): number {
  const big = clamp((r.hgt - 40) / 40, 0, 1);
  const shared =
    0.1 * r.oiq + 0.07 * r.diq + 0.05 * r.ath + 0.03 * r.end + 0.03 * r.str + 0.02 * r.ft + 0.03 * r.drw;
  const guard =
    0.1 * r.tp + 0.09 * r.hnd + 0.09 * r.pas + 0.07 * r.spd + 0.06 * r.mid + 0.06 * r.ins + 0.07 * r.perD +
    0.03 * r.stl + 0.03 * r.dreb + 0.03 * r.hgt;
  const bigF =
    0.1 * r.ins + 0.08 * r.hgt + 0.07 * r.blk + 0.07 * r.intD + 0.05 * r.oreb + 0.07 * r.dreb + 0.04 * r.str +
    0.03 * r.post + 0.04 * r.tp + 0.03 * r.pas + 0.03 * r.spd + 0.02 * r.perD;
  // shared ~0.33, guard ~0.63, big ~0.63
  return (shared + (1 - big) * guard + big * bigF) / 0.96;
}

export interface OvrScale {
  raw: number[];
  disp: number[];
}

/** Display mapping anchors (quantile of rostered players -> display rating). */
export const OVR_ANCHORS: [number, number][] = [
  [0, 52],
  [0.05, 62],
  [0.15, 66],
  [0.3, 70],
  [0.5, 74],
  [0.7, 78],
  [0.85, 82],
  [0.93, 86],
  [0.975, 90],
  [0.993, 94],
  [1, 97],
];

export function buildOvrScale(raws: number[]): OvrScale {
  const sorted = [...raws].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const raw: number[] = [];
  const disp: number[] = [];
  for (const [p, d] of OVR_ANCHORS) {
    let v = q(p);
    if (raw.length && v <= raw[raw.length - 1]) v = raw[raw.length - 1] + 0.01;
    raw.push(v);
    disp.push(d);
  }
  return { raw, disp };
}

export function toDisplay(raw: number, scale: OvrScale): number {
  const { raw: xs, disp: ys } = scale;
  const n = xs.length;
  if (raw <= xs[0]) {
    // extend below with the slope of the first segment, floor at 40
    const slope = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    return clamp(Math.round(ys[0] + (raw - xs[0]) * slope), 40, 99);
  }
  if (raw >= xs[n - 1]) {
    const slope = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
    return clamp(Math.round(ys[n - 1] + (raw - xs[n - 1]) * slope * 0.6), 40, 99);
  }
  for (let i = 1; i < n; i++) {
    if (raw <= xs[i]) {
      const t = (raw - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return clamp(Math.round(ys[i - 1] + t * (ys[i] - ys[i - 1])), 40, 99);
    }
  }
  return 99;
}

/** Inverse mapping: display rating -> raw composite (for generating players at a target level). */
export function fromDisplay(disp: number, scale: OvrScale): number {
  const { raw: xs, disp: ys } = scale;
  const n = xs.length;
  if (disp <= ys[0]) return xs[0] - (ys[0] - disp) * ((xs[1] - xs[0]) / (ys[1] - ys[0]));
  if (disp >= ys[n - 1]) return xs[n - 1] + (disp - ys[n - 1]) * ((xs[n - 1] - xs[n - 2]) / (ys[n - 1] - ys[n - 2]));
  for (let i = 1; i < n; i++) {
    if (disp <= ys[i]) {
      const t = (disp - ys[i - 1]) / (ys[i] - ys[i - 1]);
      return xs[i - 1] + t * (xs[i] - xs[i - 1]);
    }
  }
  return xs[n - 1];
}

/** Expected display-point growth remaining by age (mean path). */
export function expectedGrowth(age: number): number {
  if (age <= 19) return 10;
  if (age >= 29) return 0;
  const table: Record<number, number> = { 20: 8.5, 21: 7, 22: 5.5, 23: 4, 24: 2.7, 25: 1.6, 26: 0.8, 27: 0.3, 28: 0 };
  return table[age] ?? 0;
}

export function potential(ovr: number, age: number, growth: number): number {
  const g = expectedGrowth(age) + (age < 26 ? growth * 3 : 0);
  return clamp(Math.round(Math.max(ovr, ovr + g)), 40, 99);
}

export function tierLabel(ovr: number): string {
  if (ovr >= 92) return 'MVP Candidate';
  if (ovr >= 86) return 'All-NBA';
  if (ovr >= 81) return 'All-Star';
  if (ovr >= 77) return 'Quality Starter';
  if (ovr >= 73) return 'Starter';
  if (ovr >= 69) return 'Rotation';
  if (ovr >= 64) return 'Bench';
  return 'Fringe';
}

export function ovrColor(ovr: number): string {
  if (ovr >= 90) return 'var(--tier-elite)';
  if (ovr >= 82) return 'var(--tier-star)';
  if (ovr >= 76) return 'var(--tier-good)';
  if (ovr >= 70) return 'var(--tier-avg)';
  if (ovr >= 64) return 'var(--tier-low)';
  return 'var(--tier-bad)';
}

// ---------------------------------------------------------------- archetypes & roles

export interface ArchetypeInfo {
  label: string;
  role: OffRole;
}

export function archetype(r: Ratings): ArchetypeInfo {
  const c = composites(r);
  const big = r.hgt >= 60;
  const wing = r.hgt >= 42 && r.hgt < 60;
  const scoreCreate = (c.create + c.pnrHandle) / 2;
  const shooting = (c.c3 + c.pu3) / 2;
  const defense = (c.perDef + c.intDef + c.rimProt) / 3;

  if (big) {
    if (c.passing >= 62 && r.oiq >= 62) return { label: 'Playmaking Hub', role: 'hub' };
    if (c.postScore >= 64 && r.post >= 62) return { label: 'Post Scorer', role: 'post' };
    if (r.tp >= 55) return { label: c.rimProt >= 58 ? 'Stretch Anchor' : 'Stretch Big', role: 'stretch' };
    if (c.rimProt >= 64) return { label: 'Rim Protector', role: 'roller' };
    if (c.roll >= 58) return { label: 'Rim Runner', role: 'roller' };
    if (c.orb >= 62) return { label: 'Glass Cleaner', role: 'roller' };
    return { label: 'Traditional Big', role: 'roller' };
  }
  if (scoreCreate >= 66 && r.oiq >= 64 && c.passing >= 60) return { label: 'Heliocentric Creator', role: 'creator' };
  if (scoreCreate >= 62 && shooting >= 58 && c.midShot >= 58) return { label: 'Three-Level Scorer', role: 'scorer' };
  if (c.passing >= 64 && r.hnd >= 58) return { label: wing ? 'Point Forward' : 'Floor General', role: 'playmaker' };
  if (c.create >= 60 && c.rim >= 58 && r.tp < 50) return { label: 'Slasher', role: 'slasher' };
  if (shooting >= 62 && defense >= 52) return { label: '3&D Wing', role: 'glue' };
  if (shooting >= 64) return { label: c.offBall >= 62 ? 'Movement Shooter' : 'Spot-Up Shooter', role: 'shooter' };
  if (scoreCreate >= 58) return { label: 'Shot Creator', role: 'scorer' };
  if (defense >= 56) return { label: wing ? 'Wing Stopper' : 'Point-of-Attack Defender', role: 'glue' };
  if (c.cut >= 56) return { label: 'Slashing Cutter', role: 'slasher' };
  return { label: wing ? 'Utility Wing' : 'Combo Guard', role: wing ? 'glue' : 'playmaker' };
}

export const ROLE_META: Record<OffRole, { label: string; help: string }> = {
  creator: { label: 'Primary Creator', help: 'Offense runs through him: most PnRs and isolations, highest usage.' },
  scorer: { label: 'Secondary Scorer', help: 'Second option who attacks closeouts, runs PnR and gets isolations.' },
  playmaker: { label: 'Playmaker', help: 'Initiates sets and looks to pass first. Moderate usage, high assists.' },
  shooter: { label: 'Movement Shooter', help: 'Runs off screens and handoffs for catch-and-shoot threes. Spaces the floor.' },
  slasher: { label: 'Slasher', help: 'Cuts and attacks closeouts toward the rim.' },
  roller: { label: 'Rim Runner', help: 'Screens, rolls hard and finishes lobs. Crashes the glass.' },
  stretch: { label: 'Stretch Big', help: 'Screens and pops for threes, pulling the rim protector away.' },
  post: { label: 'Post Hub', help: 'Gets post touches to score or pass out of doubles.' },
  hub: { label: 'Playmaking Hub', help: 'Big who runs handoffs and finds cutters from the elbow.' },
  glue: { label: 'Glue Guy', help: 'Low usage. Spot-ups, extra passes, defense and hustle.' },
};

/** Base usage weight multiplier per role (how often the offense looks for him). */
export const ROLE_USAGE: Record<OffRole, number> = {
  creator: 1.45,
  scorer: 1.2,
  playmaker: 1.0,
  shooter: 0.85,
  slasher: 0.85,
  roller: 0.7,
  stretch: 0.75,
  post: 1.05,
  hub: 1.0,
  glue: 0.6,
};

export function inferPos(r: Ratings): Pos {
  const guardScore = r.hnd * 0.5 + r.pas * 0.5;
  if (r.hgt >= 68) return 'C';
  if (r.hgt >= 57) return guardScore > 60 ? 'SF' : r.hgt >= 63 ? 'C' : 'PF';
  if (r.hgt >= 47) return guardScore > 62 ? 'SG' : 'SF';
  if (r.hgt >= 36) return guardScore > 58 ? 'PG' : 'SG';
  return 'PG';
}

export function emptyRatings(): Ratings {
  return {
    hgt: 50, spd: 50, ath: 50, str: 50, end: 50, ins: 50, mid: 50, tp: 50, ft: 50, hnd: 50, pas: 50,
    oiq: 50, drw: 50, post: 50, perD: 50, intD: 50, stl: 50, blk: 50, diq: 50, oreb: 50, dreb: 50,
  };
}

export function clampRatings(r: Ratings): Ratings {
  for (const k of RATING_KEYS) r[k] = clamp(Math.round(r[k] * 10) / 10, 1, 100);
  return r;
}
