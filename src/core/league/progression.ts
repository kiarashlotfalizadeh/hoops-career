// Player development: age curves per attribute group, personal growth tendency,
// training focus, coaching quality, practice intensity and playing time.

import type { League, Player, RatingKey, TrainingFocus } from '../types';
import { FREE_AGENT, RETIRED } from '../types';
import { Rng, clamp, hashString } from '../random';
import { OVR_ANCHORS, RATING_KEYS, ovrRaw, ovrWeights, toDisplay } from '../ratings';
import { followTendencies, playerAge, refreshPlayerDerived } from '../playerGen';
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
 * Spread of a summer (the shared part, see SUMMER_SKILLS) through 25 and after. A player's OVR moves
 * about ±3.5-4.5 a year at 20-24 and ±2.5-3 in his prime: some years a breakout, some a step back.
 * At ±2.3 and ±1.4 almost nobody's level changed but by age, so a team's talent was its roster's
 * ages: the contenders, the older teams, gave back about a fifth of their edge every summer, and over
 * twelve simulated seasons the spread of team wins fell from 11 to about 9.5. Holding the league's
 * spread against it (anchorRatings) costs the established a little each year.
 */
const SUMMER_SD = { young: 3.7, prime: 2.6 };

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
  perimeterD: { label: 'Perimeter defense', help: 'On-ball defense, steals and rotations.' },
  interiorD: { label: 'Interior defense', help: 'Post defense, shot blocking and rotations.' },
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
  /** League-wide mean of each attribute (ratingMeans): with it, a strong attribute fades faster with age than a weak one. */
  means?: Partial<Record<RatingKey, number>>;
  /** His hidden development arc through 25 (see trajectory): z-score, 0 without one. */
  trajectory?: number;
}

/**
 * Summer-to-summer pull of a young player's hidden arc (DevContext.trajectory) at 19-25: it fades
 * out by 26. POT reads only his growth, so the arc is what scouting can't see. With every young
 * player's course in his POT, the draft went to form: over 27 simulated classes the best player by
 * his fourth season was a top-ten pick every time, picks after the tenth reached 85 by then once and
 * one top-three pick in 80 fell short of 75. With the arc, picks 11-20 reach 85 about one class in four,
 * the best of a class now and then comes from outside the top ten, and a top-three pick misses one
 * time in twenty (still kinder than the NBA's lottery).
 */
const TRAJECTORY = [1.1, 1.1, 1.1, 1, 0.8, 0.5, 0.25];

/**
 * How far his arc can take him by where he was drafted: scouts read a late pick less well, so more of
 * his course is hidden. 1 through the 14th pick, up to 1.19 for the 30th, 1.3 for a second-rounder
 * or an undrafted player. With every arc the same size (and smaller summers, see SUMMER_SD), a
 * second-round pick reached 85 about once in thirteen classes over eight simulated leagues (the NBA's
 * Jokić and Brunson come along every few drafts); now two classes in five have one.
 */
export const arcScale = (p: Pick<Player, 'draft'>) => (p.draft.round === 1 ? 1 + Math.max(0, p.draft.pick - 14) * 0.012 : 1.3);

/** A player's hidden development arc in a league: a z-score from a stream of his own, the same every summer. */
export const trajectory = (league: Pick<League, 'id'>, pid: number) => new Rng(hashString(`${league.id}:arc:${pid}`)).normal(0, 1);

/**
 * How much faster a strong attribute fades past his peak than an average one: (rating / league
 * mean)^0.7, within 0.6-1.6. Athleticism and skill a player has more of have more to lose; with the
 * same decline for everyone, a 95 lost about half the OVR a 75 did at 30-34 (the display scale's top
 * is stretched), so stars held MVP form to 34-36 and the real league's MVPs averaged 31.
 */
const fadeScale = (rating: number, mean?: number) => (mean && mean > 0 ? clamp(Math.pow(rating / mean, 0.7), 0.6, 1.6) : 1);

/** Apply `frac` of a year's development. Returns OVR change. */
export function develop(p: Player, season: number, ctx: DevContext, rng: Rng, frac = 1, scale?: League['ovrScale']): number {
  const a = playerAge(p, season);
  const before = scale ? toDisplay(ovrRaw(p.ratings), scale) : 0;
  const young = a <= 25;
  // a good or bad summer moves all skills together
  const arc = young ? (ctx.trajectory ?? 0) * TRAJECTORY[clamp(a - 19, 0, 6)] : 0;
  const summer = rng.normal(young ? p.growth * 1.1 + arc : p.growth * 0.4, young ? SUMMER_SD.young : SUMMER_SD.prime);
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
    if (d < 0) d *= fadeScale(p.ratings[k], ctx.means?.[k]);
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

/** OVR, potential and archetype for the league's season and scale. */
export function refreshDerived(league: League, p: Player) {
  refreshPlayerDerived(p, league.season, league.ovrScale);
}

/** `statsSeason` is the season whose minutes count: the one just finished in the offseason, the current one in season. */
function devContext(league: League, p: Player, statsSeason: number, means: DevContext['means']): DevContext {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const st = seasonTotals(p, statsSeason);
  const mpg = st && st.gp ? st.min / st.gp : 0;
  return {
    coachDev: team ? team.coach.development : 45,
    coachingBudget: team ? team.budget.coaching : 40,
    practice: team ? team.practice : 'normal',
    mpg,
    means,
    trajectory: playerAge(p, league.season) <= 25 ? trajectory(league, p.pid) * arcScale(p) : 0,
  };
}

/**
 * The players the league's anchors measure (see anchorRatings): each team's 15 best standard players
 * by raw OVR and its two-way players, the opening-night league the anchors were set on at creation.
 * Measured on everyone under contract in the summer, camp bodies and draftees made the league look
 * weaker than it was, so every summer lifted everyone: by opening night the league's median player
 * had gained two OVR in a decade and the players rated 80 or more went from 115 to 150 while the
 * stars stayed as many. Deep rosters everywhere flattened the standings and soaked up the payroll
 * stars would have been paid.
 */
export function anchorPopulation(league: League): Player[] {
  const byTeam = new Map<number, Player[]>();
  for (const p of Object.values(league.players)) {
    if (p.tid < 0) continue;
    let ps = byTeam.get(p.tid);
    if (!ps) byTeam.set(p.tid, (ps = []));
    ps.push(p);
  }
  const out: Player[] = [];
  for (const ps of byTeam.values()) {
    for (const p of ps) if (p.contract.twoWay) out.push(p);
    const standard = ps.filter((p) => !p.contract.twoWay).map((p) => ({ p, raw: ovrRaw(p.ratings) }));
    standard.sort((a, b) => b.raw - a.raw || a.p.pid - b.p.pid);
    for (const x of standard.slice(0, 15)) out.push(x.p);
  }
  return out;
}

/** Mean of each attribute among `rostered` (by default every player on a team). */
export function ratingMeans(league: League, rostered = Object.values(league.players).filter((p) => p.tid >= 0)): Partial<Record<RatingKey, number>> {
  const out: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) out[k] = rostered.reduce((a, p) => a + p.ratings[k], 0) / Math.max(1, rostered.length);
  return out;
}

/** Standard deviation of each attribute among `rostered` (by default every player on a team). */
export function ratingSpreads(league: League, rostered = Object.values(league.players).filter((p) => p.tid >= 0)): Partial<Record<RatingKey, number>> {
  const means = ratingMeans(league, rostered);
  const out: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) {
    const m = means[k]!;
    out[k] = Math.sqrt(rostered.reduce((a, p) => a + (p.ratings[k] - m) ** 2, 0) / Math.max(1, rostered.length));
  }
  return out;
}

/**
 * Hold the league's talent distribution steady: after a year of development (young players rise,
 * veterans fade, rookies arrive, retirees leave), map every attribute back so its mean among the
 * opening-night league (anchorPopulation) matches the anchor set when the league was created, and pull its spread
 * halfway back toward the original each year (otherwise stars drift upward and 90+ OVR players
 * pile up). Individual arcs are kept relative to the league; scoring, OVR meaning and salaries
 * stay stable for decades.
 */
export function anchorRatings(league: League) {
  const pop = anchorPopulation(league);
  league.ratingAnchors ??= ratingMeans(league, pop);
  league.ratingSpreads ??= ratingSpreads(league, pop);
  const now = ratingMeans(league, pop);
  const sd = ratingSpreads(league, pop);
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
  anchorOverallSpread(league, anchorPopulation(league));
}

/** Quantiles of the raw-OVR distribution held to the league's creation (see anchorOverallSpread): OVR_ANCHORS' but the ends. */
const SHAPE_QS = [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.93, 0.975];

/**
 * Good and bad summers move a player's skills together, so over the years good players become
 * good at everything and the OVR spread widens even with every attribute's own spread held (more
 * stars and more sub-60 players), while the top can thin out as stars age. Pull each stretch of the
 * raw-OVR distribution between neighbouring SHAPE_QS halfway back to its width when the display
 * scale was built at league creation, around the median: each player moves along all his
 * attributes at once, by where he stands (past the 97.5th percentile, as the stretch below it
 * moves). Held by its two halves alone (median to 97.5th, 5th to median), the shape inside them
 * drifted: the band of 80-84 players filled up while the 85+ stars thinned out.
 */
function anchorOverallSpread(league: League, pop: Player[]) {
  const raws = pop.map((p) => ovrRaw(p.ratings)).sort((a, b) => a - b);
  if (raws.length < 40) return;
  const now = SHAPE_QS.map((f) => raws[Math.round(f * (raws.length - 1))]);
  const then = SHAPE_QS.map((f) => league.ovrScale.raw[OVR_ANCHORS.findIndex(([q]) => q === f)]);
  // where each quantile goes: every stretch's width halfway back to its width at creation, out from the median
  const mid = SHAPE_QS.indexOf(0.5);
  const to = [...now];
  for (let i = mid + 1; i < now.length; i++) to[i] = to[i - 1] + (now[i] - now[i - 1] + then[i] - then[i - 1]) / 2;
  for (let i = mid - 1; i >= 0; i--) to[i] = to[i + 1] - (now[i + 1] - now[i] + then[i + 1] - then[i]) / 2;
  const target = (raw: number) => {
    let i = 0;
    while (i < now.length - 2 && raw > now[i + 1]) i++;
    return to[i] + ((raw - now[i]) * (to[i + 1] - to[i])) / Math.max(1e-6, now[i + 1] - now[i]);
  };
  for (const p of Object.values(league.players)) {
    if (p.tid === RETIRED) continue;
    const w = ovrWeights(p.ratings);
    const weight = RATING_KEYS.reduce((t, k) => t + (k === 'hgt' ? 0 : w[k]), 0);
    const raw = ovrRaw(p.ratings);
    const shift = (target(raw) - raw) / weight;
    if (Math.abs(shift) < 0.05) continue;
    for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] = clamp(Math.round((p.ratings[k] + shift) * 10) / 10, 1, 100);
  }
}

/** Offseason development for everyone (run at the start of a new season). */
export function annualProgression(league: League, rng: Rng): { pid: number; delta: number }[] {
  const out: { pid: number; delta: number }[] = [];
  const before = new Map(Object.values(league.players).map((p) => [p.pid, p.ovr]));
  // (this summer's prospects are drafted or gone by now; next year's class arrives after this)
  const means = ratingMeans(league);
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT) continue;
    develop(p, league.season, devContext(league, p, league.season - 1, means), rng, 0.8);
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
    develop(p, league.season, devContext(league, p, league.season, undefined), rng, 0.07);
    refreshDerived(league, p);
    if (p.ovr !== before) out.push({ pid: p.pid, delta: p.ovr - before });
  }
  return out;
}
