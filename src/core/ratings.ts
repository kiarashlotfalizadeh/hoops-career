import type { OffRole, Pos, RatingKey, Ratings } from './types';
import { clamp } from './random';

export interface RatingMeta {
  key: RatingKey;
  /** The rating's one name, sentence case and full words, on every screen (prose uses it lower-case). */
  label: string;
  /** Its column header in a ratings table. */
  short: string;
  group: 'Physical' | 'Scoring' | 'Playmaking' | 'Defense' | 'Rebounding';
  help: string;
}

export const RATING_META: RatingMeta[] = [
  { key: 'hgt', label: 'Size', short: 'SIZ', group: 'Physical', help: 'Height and length. Drives finishing over defenders, contesting, rebounding and rim protection.' },
  {
    key: 'spd',
    label: 'Speed',
    short: 'SPD',
    group: 'Physical',
    help: 'Quickness with and without the ball. Beating a defender off the bounce, staying in front, running the floor.',
  },
  { key: 'ath', label: 'Explosiveness', short: 'EXP', group: 'Physical', help: 'Vertical pop. Finishing above the rim, lobs, blocks and offensive boards.' },
  { key: 'str', label: 'Strength', short: 'STR', group: 'Physical', help: 'Holding position in the post, finishing through contact, screening.' },
  { key: 'end', label: 'Stamina', short: 'STA', group: 'Physical', help: 'How long he can play before fatigue erodes his performance. Fatigue also raises injury risk.' },
  { key: 'ins', label: 'Finishing', short: 'FIN', group: 'Scoring', help: 'Converting at the rim, volume counted: layups, dunks, finishing through contests.' },
  { key: 'mid', label: 'Mid-range', short: 'MID', group: 'Scoring', help: 'Pull-ups, floaters and mid-range jumpers. Key against drop coverage.' },
  {
    key: 'tp',
    label: 'Three-point',
    short: '3P',
    group: 'Scoring',
    help: 'Three-point shooting, volume counted: 40% on 11 a game beats 45% on three. Shooters also open driving lanes for teammates.',
  },
  { key: 'ft', label: 'Free throws', short: 'FT', group: 'Scoring', help: 'Free throw accuracy. Low values invite intentional fouls late in games.' },
  { key: 'drw', label: 'Drawing fouls', short: 'DRW', group: 'Scoring', help: 'Getting to the line on drives and post-ups.' },
  { key: 'post', label: 'Post play', short: 'PST', group: 'Scoring', help: 'Back-to-basket scoring and footwork. Feasts on smaller switched defenders.' },
  { key: 'hnd', label: 'Ball handling', short: 'HND', group: 'Playmaking', help: 'Creating off the dribble and protecting the ball against pressure, traps and presses.' },
  { key: 'pas', label: 'Passing', short: 'PAS', group: 'Playmaking', help: 'Vision and accuracy. Punishes blitzes, double teams and over-help with open looks for teammates.' },
  { key: 'oiq', label: 'Offensive IQ', short: 'OIQ', group: 'Playmaking', help: 'Shot selection, reads and feel. Improves every offensive action slightly and reduces turnovers.' },
  { key: 'perD', label: 'Perimeter defense', short: 'PERD', group: 'Defense', help: 'On-ball defense against guards and wings. Key in switching schemes and against isolations.' },
  { key: 'intD', label: 'Interior defense', short: 'INTD', group: 'Defense', help: 'Post defense and walling off drives in the paint.' },
  { key: 'blk', label: 'Shot blocking', short: 'BLK', group: 'Defense', help: 'Altering and blocking shots at the rim. The anchor of drop coverage and zones.' },
  { key: 'stl', label: 'Steals', short: 'STL', group: 'Defense', help: 'Active hands and passing-lane reads. Pairs with pressure and blitz schemes.' },
  { key: 'diq', label: 'Defensive IQ', short: 'DIQ', group: 'Defense', help: 'Rotations, help timing and positioning. Makes complex schemes (zones, blitzes) work.' },
  { key: 'oreb', label: 'Offensive rebounding', short: 'ORB', group: 'Rebounding', help: 'Crashing the offensive glass for second chances.' },
  { key: 'dreb', label: 'Defensive rebounding', short: 'DRB', group: 'Rebounding', help: 'Finishing defensive possessions by securing the board.' },
];

export const RATING_KEYS: RatingKey[] = RATING_META.map((m) => m.key);

/** Attributes are stored 0-100 (league median ≈ 47); shown on the same 40-99 scale as OVR. */
export const attrDisplay = (v: number) => Math.round(40 + 0.59 * clamp(v, 0, 100));

export const heightToRating = (inches: number) => clamp(50 + (inches - 79.5) * 4.3, 0, 100);

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
    // (finishing is not in it: a finisher's trips to the line come with his shots at the rim, so the
    // rating that says how often he gets there is drawing fouls)
    foulDraw: 0.75 * r.drw + 0.25 * r.str,
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

// OVR weights, fitted (non-negative, a ridge toward the previous weights: scripts/data/ovrFit.ts) so
// that real players' calibrated ratings predict what fans read in an overall: a blend of his projected
// impact (points per 100 his team gains with him on the floor), his production (box creation a game)
// and his role (the minutes coaches gave him), see scripts/data/reputation.ts OVR_TARGET. Impact alone
// crowned efficient low-usage shooters (Kennard an 87 "All-Star") and sank high-usage stars (Jaylen
// Brown and LeBron 81). Guards are judged mostly on feel, creation, size and defense; bigs on feel,
// passing, rim protection, team defense and the glass (a big's blocks, interior and team defense and
// defensive boards held at fans' floor, reputation.ts OVR_BIG_FLOOR: fitted alone they gave Gobert 77).
const OVR_GUARD: Ratings = {
  hgt: 0.132,
  spd: 0.065,
  ath: 0.051,
  str: 0.061,
  end: 0.122,
  ins: 0.017,
  mid: 0.014,
  tp: 0.026,
  ft: 0.05,
  drw: 0,
  post: 0,
  hnd: 0.102,
  pas: 0.034,
  oiq: 0.122,
  perD: 0.061,
  intD: 0.01,
  blk: 0.014,
  stl: 0.008,
  diq: 0.017,
  oreb: 0.022,
  dreb: 0.03,
};
const OVR_BIG: Ratings = {
  hgt: 0.071,
  spd: 0.051,
  ath: 0.017,
  str: 0.027,
  end: 0.065,
  ins: 0.025,
  mid: 0.013,
  tp: 0.025,
  ft: 0.019,
  drw: 0.017,
  post: 0.039,
  hnd: 0.061,
  pas: 0.057,
  oiq: 0.113,
  perD: 0.04,
  intD: 0.07,
  blk: 0.06,
  stl: 0,
  diq: 0.07,
  oreb: 0,
  dreb: 0.07,
};

/** Per-attribute OVR weights for this body type (the guard/big blend ovrRaw uses). */
export function ovrWeights(r: Ratings): Ratings {
  const big = clamp((r.hgt - 40) / 40, 0, 1);
  const w = {} as Ratings;
  for (const k of RATING_KEYS) w[k] = ((1 - big) * OVR_GUARD[k] + big * OVR_BIG[k]) / 0.94;
  return w;
}

/** Size-aware blend of the guard and big weightings. */
export function ovrRaw(r: Ratings): number {
  const big = clamp((r.hgt - 40) / 40, 0, 1);
  let s = 0;
  for (const k of RATING_KEYS) s += r[k] * ((1 - big) * OVR_GUARD[k] + big * OVR_BIG[k]);
  return s / 0.94;
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

/** Learned skills: everything but size and the physical tools. */
export const SKILL_KEYS: RatingKey[] = ['ins', 'mid', 'tp', 'ft', 'drw', 'post', 'hnd', 'pas', 'oiq', 'perD', 'intD', 'blk', 'stl', 'diq', 'oreb', 'dreb'];

/** Shift skill ratings uniformly (physical tools untouched) until display OVR reaches `target`. */
export function shiftToOvr(r: Ratings, target: number, scale: OvrScale): Ratings {
  const at = (d: number) => {
    const t = { ...r };
    for (const k of SKILL_KEYS) t[k] = clamp(r[k] + d, 1, 100);
    return t;
  };
  let lo = -45;
  let hi = 45;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (toDisplay(ovrRaw(at(mid)), scale) < target) lo = mid;
    else hi = mid;
  }
  const out = at(hi);
  for (const k of SKILL_KEYS) out[k] = Math.round(out[k] * 10) / 10;
  return out;
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

/**
 * The OVR ladder, best first: each band's badge colour (the --tier-* tokens) and the tier names
 * inside it, so a badge's colour and a player's tier name always agree. Sized to the real league:
 * ~6 superstars (the MVP field), ~18 All-NBA or better, an All-Star tier about the NBA's 24, ~1-2
 * quality starters a team. All-Star starts at 86, where the reputation check
 * (scripts/data/reputation.ts) puts every 25-point scorer: at 87 Curry and Jaylen Brown wore
 * "Quality Starter".
 */
export const OVR_TIERS: readonly { min: number; tone: 'elite' | 'star' | 'good' | 'avg' | 'low' | 'bad'; names: readonly (readonly [number, string])[] }[] = [
  {
    min: 89,
    tone: 'elite',
    names: [
      [93, 'Superstar'],
      [89, 'All-NBA'],
    ],
  },
  {
    min: 82,
    tone: 'star',
    names: [
      [86, 'All-Star'],
      [82, 'Quality Starter'],
    ],
  },
  { min: 78, tone: 'good', names: [[78, 'Starter']] },
  { min: 72, tone: 'avg', names: [[72, 'Rotation']] },
  { min: 67, tone: 'low', names: [[67, 'Bench']] },
  { min: -Infinity, tone: 'bad', names: [[-Infinity, 'Fringe']] },
];

/** The band of the ladder an OVR falls in. */
export const ovrTier = (ovr: number) => OVR_TIERS.find((t) => ovr >= t.min) ?? OVR_TIERS[OVR_TIERS.length - 1];

export function tierLabel(ovr: number): string {
  return ovrTier(ovr).names.find(([min]) => ovr >= min)?.[1] ?? 'Fringe';
}

export function ovrColor(ovr: number): string {
  return `var(--tier-${ovrTier(ovr).tone})`;
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
  creator: { label: 'Primary Creator', help: 'Offense runs through him: most pick-and-rolls and isolations, highest usage.' },
  scorer: { label: 'Secondary Scorer', help: 'Second option who attacks closeouts, runs pick-and-rolls and gets isolations.' },
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

/**
 * Position of a generated player: his size, less how much more he handles and passes than he does
 * everything else (talent lifts every skill alike, so it's that difference that makes a lead guard
 * or a point forward play smaller). The cut-offs give draft classes the real league's shares of
 * each position, and on the real players it agrees with their box-score positions three times in
 * five (nearly all the rest one position off). The size cut-offs it replaced made 31% of real
 * players point guards and 8% power forwards (18% and 19% are): draft classes came out with half
 * the real share of power forwards and centers, and a dozen seasons into a career only a quarter
 * of the league were bigs (two in five are).
 */
export function inferPos(r: Ratings): Pos {
  const skills = SKILL_KEYS.reduce((a, k) => a + r[k], 0) / SKILL_KEYS.length;
  const size = r.hgt - 0.7 * ((r.hnd + r.pas) / 2 - skills);
  return size <= 24.5 ? 'PG' : size <= 40.5 ? 'SG' : size <= 50.5 ? 'SF' : size <= 64 ? 'PF' : 'C';
}

export function emptyRatings(): Ratings {
  return {
    hgt: 50,
    spd: 50,
    ath: 50,
    str: 50,
    end: 50,
    ins: 50,
    mid: 50,
    tp: 50,
    ft: 50,
    hnd: 50,
    pas: 50,
    oiq: 50,
    drw: 50,
    post: 50,
    perD: 50,
    intD: 50,
    stl: 50,
    blk: 50,
    diq: 50,
    oreb: 50,
    dreb: 50,
  };
}

export function clampRatings(r: Ratings): Ratings {
  for (const k of RATING_KEYS) r[k] = clamp(Math.round(r[k] * 10) / 10, 1, 100);
  return r;
}
