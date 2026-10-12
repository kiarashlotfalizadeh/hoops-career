// Player development: age curves per attribute group, personal growth tendency,
// training focus, coaching quality, practice intensity and playing time.

import type { League, Player, RatingKey, TrainingFocus } from '../types';
import { FREE_AGENT, RETIRED } from '../types';
import { Rng, clamp } from '../random';
import { OVR_ANCHORS, RATING_KEYS, ovrRaw, ovrWeights, potential, toDisplay, archetype } from '../ratings';
import { followTendencies, playerAge } from '../playerGen';
import { seasonTotals } from './helpers';

type Group = 'athletic' | 'end' | 'str' | 'shooting' | 'skill' | 'iq' | 'perim' | 'interior' | 'reb' | 'hgt';

const GROUP_OF: Record<RatingKey, Group> = {
  hgt: 'hgt',
  spd: 'athletic',
  ath: 'athletic',
  end: 'end',
  str: 'str',
  tp: 'shooting',
  mid: 'shooting',
  ft: 'shooting',
  hnd: 'skill',
  pas: 'skill',
  post: 'skill',
  ins: 'skill',
  drw: 'skill',
  oiq: 'iq',
  diq: 'iq',
  perD: 'perim',
  stl: 'perim',
  intD: 'interior',
  blk: 'interior',
  oreb: 'reb',
  dreb: 'reb',
};

// Mean change per year for ages 19..35+, relative to the league: anchorRatings holds each
// attribute's league mean, so a typical roster's changes (with training, coaching and playing time
// added) average out to about zero and the anchor only corrects drift. A uniform cut there used to
// shift the whole age curve down, so players peaked at 24-25 and fell 3-4 OVR a year after 30.
// Young players climb about 2 OVR a year, skills and IQ hold into the late 20s and athleticism
// fades first: players peak around 26-27, slip slowly to 30, then lose 1-2 OVR a year, and more
// each year after 35.
const CURVES: Record<Group, number[]> = {
  athletic: [1.3, 0.9, 0.5, 0.4, 0.2, 0.1, 0.1, -0.1, -0.2, -0.4, -0.7, -1, -1.3, -1.7, -2.1, -2.6, -3],
  end: [0.7, 0.7, 0.5, 0.4, 0.2, -0.1, -0.3, -0.3, -0.2, -0.3, -0.4, -0.6, -0.9, -1.3, -1.7, -2, -2.4],
  str: [1.2, 0.8, 0.5, 0.4, 0.2, -0.1, -0.4, -0.5, -0.6, -0.5, -0.3, -0.4, -0.6, -0.9, -1.3, -1.6, -2],
  shooting: [0.9, 0.6, 0.4, 0.3, 0.1, 0, -0.2, -0.1, -0.4, -0.7, -0.9, -0.9, -1, -1.1, -1.3, -1.4, -1.5],
  skill: [0.8, 0.6, 0.4, 0.3, 0.1, 0, -0.2, -0.1, -0.4, -0.6, -0.7, -0.8, -1, -1.3, -1.6, -1.9, -2.2],
  iq: [1.2, 0.8, 0.4, 0.3, 0.1, 0.1, -0.1, -0.2, -0.4, -0.7, -1, -1.1, -1.1, -1.3, -1.5, -1.8, -2.1],
  perim: [0.8, 0.5, 0.3, 0.3, 0.2, 0.1, 0, -0.2, -0.3, -0.5, -0.8, -1.1, -1.3, -1.7, -2.1, -2.6, -3],
  interior: [0.7, 0.4, 0.2, 0.2, 0.1, 0, -0.1, -0.2, -0.3, -0.4, -0.7, -0.9, -1.1, -1.5, -1.9, -2.4, -2.8],
  reb: [0.3, 0.1, 0, 0, -0.1, -0.2, -0.3, -0.2, -0.3, -0.3, -0.4, -0.6, -0.8, -1.1, -1.4, -1.7, -2],
  hgt: [0.6, 0.3, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
/**
 * Share of a good or bad summer that reaches the skills and the body. A shared summer moves skills
 * together, and correlated skills widen the OVR spread over the years, so most of each
 * attribute's year is its own noise.
 */
const SUMMER_SKILLS = 0.6;
const SUMMER_BODY = 0.25;
const OWN_NOISE = 1.6;

/**
 * Training: balanced adds a little to every attribute. A focus is OVR-neutral against it: the
 * other attributes add less, and the focused ones get what they give up, sized by how much they
 * count in this player's OVR (a guard's rebounding focus gains more rebounding than a center's).
 */
const BALANCED_GAIN = 0.25;
const OFF_FOCUS_GAIN = 0.05;

const FOCUS_KEYS: Record<TrainingFocus, RatingKey[]> = {
  balanced: [],
  shooting: ['tp', 'mid', 'ft'],
  finishing: ['ins', 'drw', 'post'],
  playmaking: ['pas', 'hnd', 'oiq'],
  perimeterD: ['perD', 'stl', 'diq'],
  interiorD: ['intD', 'blk', 'diq'],
  rebounding: ['oreb', 'dreb', 'str'],
  conditioning: ['end', 'str', 'spd'],
};

export const FOCUS_META: Record<TrainingFocus, { label: string; help: string }> = {
  balanced: { label: 'Balanced', help: 'Small gains spread across every skill.' },
  shooting: { label: 'Shooting', help: 'Three-point, mid-range and free throws.' },
  finishing: { label: 'Finishing', help: 'Rim finishing, drawing fouls and post moves.' },
  playmaking: { label: 'Playmaking', help: 'Passing, handling and offensive feel.' },
  perimeterD: { label: 'Perimeter D', help: 'On-ball defense, steals and rotations.' },
  interiorD: { label: 'Interior D', help: 'Post defense, shot blocking and rotations.' },
  rebounding: { label: 'Rebounding', help: 'Both glass and functional strength.' },
  conditioning: { label: 'Conditioning', help: 'Stamina, strength and speed. Slows athletic decline for veterans.' },
};

/** Past 35 the decline keeps speeding up (x1.25 at 36 to x2 from 39): very few play into their 40s. */
function curve(g: Group, a: number) {
  const idx = clamp(a - 19, 0, 16);
  return CURVES[g][idx] * (a > 35 ? Math.min(2, 1 + 0.25 * (a - 35)) : 1);
}

export interface DevContext {
  coachDev: number; // 0..100
  coachingBudget: number; // 0..100
  practice: 'light' | 'normal' | 'intense';
  mpg: number;
}

/** Apply `frac` of a year's development. Returns OVR change. */
export function develop(p: Player, season: number, ctx: DevContext, rng: Rng, frac = 1, scale?: League['ovrScale']): number {
  const a = playerAge(p, season);
  const before = scale ? toDisplay(ovrRaw(p.ratings), scale) : 0;
  const young = a <= 25;
  // a good or bad summer moves all skills together
  const summer = rng.normal(young ? p.growth * 1.1 : p.growth * 0.4, young ? 1.7 : 1.2);
  const coaching = ((ctx.coachDev - 50) / 50) * 0.7 + ((ctx.coachingBudget - 50) / 50) * 0.5;
  const practice = ctx.practice === 'intense' ? 0.45 : ctx.practice === 'light' ? -0.35 : 0;
  const minutes = young ? (ctx.mpg >= 25 ? 0.6 : ctx.mpg >= 15 ? 0.25 : ctx.mpg <= 6 ? -0.3 : 0) : 0;
  const focus = FOCUS_KEYS[p.training];
  let focusGain = BALANCED_GAIN;
  if (focus.length) {
    const w = ovrWeights(p.ratings);
    const all = RATING_KEYS.reduce((t, k) => t + (k === 'hgt' ? 0 : w[k]), 0);
    const focused = focus.reduce((t, k) => t + w[k], 0);
    focusGain = (BALANCED_GAIN * all - OFF_FOCUS_GAIN * (all - focused)) / focused;
  }
  for (const k of RATING_KEYS) {
    const g = GROUP_OF[k];
    let d = curve(g, a);
    if (g !== 'hgt') {
      const isSkill = g !== 'athletic' && g !== 'end' && g !== 'str';
      d += summer * (isSkill ? SUMMER_SKILLS : SUMMER_BODY) + rng.normal(0, OWN_NOISE);
      if (isSkill) d += coaching + practice + minutes;
      d += !focus.length || focus.includes(k) ? focusGain : OFF_FOCUS_GAIN;
      if (p.training === 'conditioning' && g === 'athletic' && d < 0) d *= 0.75;
    }
    p.ratings[k] = clamp(Math.round((p.ratings[k] + d * frac) * 10) / 10, 1, 100);
  }
  if (!scale) return 0;
  const after = toDisplay(ovrRaw(p.ratings), scale);
  return after - before;
}

export function refreshDerived(league: League, p: Player) {
  p.ovr = toDisplay(ovrRaw(p.ratings), league.ovrScale);
  p.pot = potential(p.ovr, playerAge(p, league.season), p.growth);
  p.archetype = archetype(p.ratings).label;
}

/** `statsSeason` is the season whose minutes count: the one just finished in the offseason, the current one in season. */
function devContext(league: League, p: Player, statsSeason: number): DevContext {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const st = seasonTotals(p, statsSeason);
  const mpg = st && st.gp ? st.min / st.gp : 0;
  return {
    coachDev: team ? team.coach.development : 45,
    coachingBudget: team ? team.budget.coaching : 40,
    practice: team ? team.practice : 'normal',
    mpg,
  };
}

/** League-wide mean of each attribute among rostered players. */
export function ratingMeans(league: League): Partial<Record<RatingKey, number>> {
  const rostered = Object.values(league.players).filter((p) => p.tid >= 0);
  const out: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) out[k] = rostered.reduce((a, p) => a + p.ratings[k], 0) / Math.max(1, rostered.length);
  return out;
}

/** Standard deviation per attribute among rostered players. */
export function ratingSpreads(league: League): Partial<Record<RatingKey, number>> {
  const rostered = Object.values(league.players).filter((p) => p.tid >= 0);
  const means = ratingMeans(league);
  const out: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) {
    const m = means[k]!;
    out[k] = Math.sqrt(rostered.reduce((a, p) => a + (p.ratings[k] - m) ** 2, 0) / Math.max(1, rostered.length));
  }
  return out;
}

/**
 * Hold the league's talent distribution steady: after a year of development (young players rise,
 * veterans fade, rookies arrive, retirees leave), map every attribute back so its league-wide mean
 * among rostered players matches the anchor set when the league was created, and pull its spread
 * halfway back toward the original each year (otherwise stars drift upward and 90+ OVR players
 * pile up). Individual arcs are kept relative to the league; scoring, OVR meaning and salaries
 * stay stable for decades.
 */
export function anchorRatings(league: League) {
  league.ratingAnchors ??= ratingMeans(league);
  league.ratingSpreads ??= ratingSpreads(league);
  const now = ratingMeans(league);
  const sd = ratingSpreads(league);
  for (const k of RATING_KEYS) {
    if (k === 'hgt') continue;
    const target = league.ratingAnchors[k] ?? now[k]!;
    const ratio = sd[k]! > 0.5 ? (league.ratingSpreads[k] ?? sd[k]!) / sd[k]! : 1;
    const scale = 1 + (ratio - 1) * 0.5;
    if (Math.abs(target - now[k]!) < 0.05 && Math.abs(scale - 1) < 0.002) continue;
    for (const p of Object.values(league.players)) {
      if (p.tid === RETIRED) continue;
      p.ratings[k] = clamp(Math.round((target + (p.ratings[k] - now[k]!) * scale) * 10) / 10, 1, 100);
    }
  }
  anchorOverallSpread(league);
}

/**
 * Good and bad summers move a player's skills together, so over the years good players become
 * good at everything and the OVR spread widens even with every attribute's own spread held (more
 * stars and more sub-60 players), while the top can thin out as stars age. Pull each half of the
 * raw-OVR distribution halfway back to the shape the display scale was built on at league creation
 * (median to 97.5th percentile above, 5th percentile to median below): each player moves along all
 * his attributes at once, toward or away from the median.
 */
function anchorOverallSpread(league: League) {
  const raws = Object.values(league.players)
    .filter((p) => p.tid >= 0)
    .map((p) => ovrRaw(p.ratings))
    .sort((a, b) => a - b);
  if (raws.length < 40) return;
  const now = (f: number) => raws[Math.round(f * (raws.length - 1))];
  const then = (f: number) => league.ovrScale.raw[OVR_ANCHORS.findIndex(([q]) => q === f)];
  const pull = (lo: number, hi: number) => 0.5 * (1 - (then(hi) - then(lo)) / (now(hi) - now(lo)));
  const [up, down] = [pull(0.5, 0.975), pull(0.05, 0.5)];
  const median = now(0.5);
  for (const p of Object.values(league.players)) {
    if (p.tid === RETIRED) continue;
    const w = ovrWeights(p.ratings);
    const weight = RATING_KEYS.reduce((t, k) => t + (k === 'hgt' ? 0 : w[k]), 0);
    const dev = ovrRaw(p.ratings) - median;
    const shift = (-(dev > 0 ? up : down) * dev) / weight;
    if (Math.abs(shift) < 0.05) continue;
    for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] = clamp(Math.round((p.ratings[k] + shift) * 10) / 10, 1, 100);
  }
}

/** Offseason development for everyone (run at the start of a new season). */
export function annualProgression(league: League, rng: Rng): { pid: number; delta: number }[] {
  const out: { pid: number; delta: number }[] = [];
  const before = new Map(Object.values(league.players).map((p) => [p.pid, p.ovr]));
  // (this summer's prospects are drafted or gone by now; next year's class arrives after this)
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT) continue;
    develop(p, league.season, devContext(league, p, league.season - 1), rng, 0.8);
  }
  anchorRatings(league);
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT) continue;
    refreshDerived(league, p);
    // tendencies follow the year's change in level: from the OVR of his latest snapshot, which they
    // were set for (in-season development and injuries since count too), or for a draftee without
    // one, from before this summer's development
    followTendencies(p, p.ratingsHistory[p.ratingsHistory.length - 1]?.ovr ?? before.get(p.pid) ?? p.ovr, rng);
    p.ratingsHistory.push({ season: league.season, ovr: p.ovr, pot: p.pot, r: { ...p.ratings } });
    if (p.ratingsHistory.length > 25) p.ratingsHistory.shift();
    // older snapshots only chart OVR: full ratings on every one grew the save by a few hundred KB a season
    for (const h of p.ratingsHistory.slice(0, -2)) delete h.r;
    out.push({ pid: p.pid, delta: p.ovr - (before.get(p.pid) ?? p.ovr) });
  }
  return out;
}

/** Small in-season development for young players (three checkpoints a season). */
export function inSeasonProgression(league: League, rng: Rng): { pid: number; delta: number }[] {
  const out: { pid: number; delta: number }[] = [];
  for (const p of Object.values(league.players)) {
    if (p.tid < 0) continue;
    const a = playerAge(p, league.season);
    if (a > 26) continue;
    const before = p.ovr;
    develop(p, league.season, devContext(league, p, league.season), rng, 0.07);
    refreshDerived(league, p);
    if (p.ovr !== before) out.push({ pid: p.pid, delta: p.ovr - before });
  }
  return out;
}
