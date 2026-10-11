// Player development: age curves per attribute group, personal growth tendency,
// training focus, coaching quality, practice intensity and playing time.

import type { League, Player, RatingKey, TrainingFocus } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../types';
import { Rng, clamp } from '../random';
import { RATING_KEYS, ovrRaw, potential, toDisplay, archetype } from '../ratings';
import { playerAge } from '../playerGen';
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

// mean change per year for ages 19..35+
const CURVES: Record<Group, number[]> = {
  athletic: [2, 1.5, 1, 0.5, 0, 0, -0.3, -0.6, -1, -1.4, -1.8, -2.3, -2.8, -3.3, -3.8, -4.4, -5],
  end: [2, 2, 1.5, 1, 0.5, 0, 0, 0, -0.5, -0.8, -1, -1.5, -2, -2.5, -3, -3.5, -4],
  str: [3, 2.5, 2, 1.5, 1, 0.5, 0.3, 0, 0, 0, 0, -0.5, -1, -1.5, -2, -2.5, -3],
  shooting: [3.4, 3, 2.6, 2.1, 1.7, 1.3, 0.9, 0.6, 0.3, 0, 0, -0.3, -0.5, -0.8, -1, -1.3, -1.6],
  skill: [3, 2.6, 2.2, 1.8, 1.3, 0.9, 0.5, 0.2, 0, -0.2, -0.4, -0.8, -1.2, -1.6, -2, -2.5, -3],
  iq: [4, 3.5, 3, 2.5, 2, 1.5, 1.2, 0.9, 0.6, 0.4, 0.2, 0, -0.3, -0.6, -1, -1.5, -2],
  perim: [2.5, 2, 1.8, 1.5, 1, 0.6, 0.3, 0, -0.4, -0.8, -1.2, -1.6, -2, -2.5, -3, -3.5, -4],
  interior: [2.5, 2, 1.8, 1.5, 1, 0.6, 0.3, 0, -0.2, -0.5, -0.9, -1.3, -1.8, -2.3, -2.8, -3.3, -3.8],
  reb: [2, 1.8, 1.5, 1.2, 0.8, 0.5, 0.3, 0, 0, -0.3, -0.6, -1, -1.4, -1.8, -2.2, -2.6, -3],
  hgt: [0.6, 0.3, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

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

function curve(g: Group, a: number) {
  const idx = clamp(a - 19, 0, 16);
  return CURVES[g][idx];
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
  for (const k of RATING_KEYS) {
    const g = GROUP_OF[k];
    let d = curve(g, a);
    if (g !== 'hgt') {
      const isSkill = g !== 'athletic' && g !== 'end' && g !== 'str';
      d += (isSkill ? summer : summer * 0.4) + rng.normal(0, 1.4);
      if (isSkill) d += coaching + practice + minutes;
      if (p.training === 'balanced') d += 0.25;
      else if (focus.includes(k)) d += 1.6;
      else d -= 0.35;
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

function devContext(league: League, p: Player): DevContext {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const st = seasonTotals(p, league.season - 1) ?? seasonTotals(p, league.season);
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
}

/** Offseason development for everyone (run at the start of a new season). */
export function annualProgression(league: League, rng: Rng): { pid: number; delta: number }[] {
  const out: { pid: number; delta: number }[] = [];
  const before = new Map(Object.values(league.players).map((p) => [p.pid, p.ovr]));
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT && p.tid !== DRAFT_PROSPECT) continue;
    develop(p, league.season, devContext(league, p), rng, p.tid === DRAFT_PROSPECT ? 0.5 : 0.8);
  }
  anchorRatings(league);
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT && p.tid !== DRAFT_PROSPECT) continue;
    refreshDerived(league, p);
    p.ratingsHistory.push({ season: league.season, ovr: p.ovr, pot: p.pot, r: { ...p.ratings } });
    if (p.ratingsHistory.length > 25) p.ratingsHistory.shift();
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
    develop(p, league.season, devContext(league, p), rng, 0.07);
    refreshDerived(league, p);
    if (p.ovr !== before) out.push({ pid: p.pid, delta: p.ovr - before });
  }
  return out;
}
