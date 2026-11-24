// Player development: age curves per attribute group, a young player's summers, his growth tendency
// and hidden arc, playing time, training focus, the head coach's development rating and the staff's
// development priority (the user's one lever, PRIORITY); the league's anchors, and the bands a year's
// change is held to (YEAR_BANDS). scripts/dev-check.ts measures all of it.

import { keepPeak, peakSummer, scaleTop, volumeRoom } from './legends';
import type { League, Player, RatingKey, TrainingFocus } from '../types';
import { FREE_AGENT, RETIRED } from '../types';
import { Rng, clamp, hashString } from '../random';
import { OVR_ANCHORS, RATING_KEYS, ovrRaw, ovrWeights, toDisplay } from '../ratings';
import { REBOUND_SHARE, YOUNG_TO, followTendencies, playerAge, refreshPlayerDerived, yearShortfall } from '../playerGen';
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
// Skills and IQ hold into the late 20s and athleticism fades first. What a player's OVR does with
// them, the young player's summers (YOUTH) and the anchors together, a year (dev-check, six leagues'
// later summers, everyone in the league both preseasons): +1.4 to +1.5 at 22 or under, +0.4 at 23-26,
// -1.3 at 27-31, -2.5 at 32-35 and -4.4 from 36.
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
 * Spread of a summer (the shared part, see SUMMER_SKILLS) through 25 and after: some years a breakout,
 * some a step back. At ±2.3 and ±1.4 almost nobody's level changed but by age, so a team's talent was
 * its roster's ages: the contenders, the older teams, gave back about a fifth of their edge every
 * summer, and over twelve simulated seasons the spread of team wins fell from 11 to about 9.5. Holding
 * the league's spread against it (anchorRatings) costs the established a little each year. The young
 * player's was 3.7 until 2026-11-23, with all of a bad summer taken (YOUNG_DOWN): a year of +5 or more
 * came to one second-round pick in six (ten such years a class, the testers' "#60 pick up 7 a year"),
 * now one in twenty (two or three a class); a late pick who hits does it on his arc, year after year
 * (arcScale), not on one summer's draw. With it and the year's bands (YEAR_BANDS), a year moves a
 * player of 22 or under -2 to +6 (the 5th and 95th percentiles), 23-26 -3 to +4, 27-31 -4 to +2.
 */
const SUMMER_SD = { young: 3.0, prime: 2.6 };
/**
 * The share of a bad summer a young player (through 25) takes: a developing player's poor summer is
 * mostly a year he stands still, and a year he goes backwards is the rare one. With the whole of it,
 * one player in six of 22 or under lost three OVR or more in a year (dev-check, six leagues: the 5th
 * percentile -6, the worst -14 to -18), top-ten picks among them.
 */
const YOUNG_DOWN = 0.5;
/**
 * What a young player's summers add by age (19 to 25), on the summer's own scale (one point is about
 * 0.75 OVR a year for a player in the middle of the display scale). The curves above are relative to
 * a league whose anchors take about half an OVR off everyone a year (its arrivals are better than the
 * players they push out): without this, players of 22 and under gained +0.1 to +0.3 OVR a year in
 * dev-check's leagues where POT promised them 1.5, and top-ten picks +0.4 (a real league) to +1.2 a
 * summer through 23, a third of them lower after three summers than on draft night. With it, the
 * minutes' share of it (BENCH) and the staff's priority: +1.4 to +1.5 at 22 and under (POT holds: it
 * drifts +0.1 a year), top-ten picks +2.0 to +2.5 a summer through 23 (one in fifteen lower after
 * three summers), picks 11-30 +1.3 to +1.7 and second-rounders +0.4 to +0.5. The league pays for it
 * where it always has, in what everyone gives the anchors: 27 to 31 lose 1.3 a year (1.2 before).
 */
const YOUTH = [1.6, 1.6, 1.4, 1.1, 0.6, 0.3, 0.1];
/**
 * The share of it a young player gets by his minutes a game: all of it from BENCH.plays, less on the
 * bench, least under BENCH.sits (on top of develop()'s minutes term for his skills). A draftee's first
 * summer (no season yet) gets all of it. Growth goes to the young players who play.
 */
const BENCH = { plays: 15, sits: 6, some: 0.75, none: 0.4 };

/**
 * Development priority, the one lever the user has on who grows: his staff's extra time goes to the
 * players he names (PRIORITY.slots at most, PRIORITY.maxAge or under), and comes out of his other
 * young players' (the rest of the roster of PRIORITY.maxAge or under). `gain`: rating points a year on
 * each of a priority player's skills (about +1.2 OVR a year in the middle of the scale; priorityEffect
 * gives a player's own figure); `cost`: what each priority player takes off every skill of each other
 * young player on the roster (about -0.25 OVR a year each: with four other young players, two
 * priorities cost about what they add). Every AI team's staff pick their own two (staffPriority), and
 * the user's do until he chooses: nobody starts behind.
 */
export const PRIORITY = { slots: 2, maxAge: 25, gain: 1.05, cost: 0.2 };

/**
 * A young player (through 25) makes up part of a down year the next: a year that fell short of what
 * his age has him add (playerGen's yearShortfall) adds REBOUND_SHARE of the shortfall to the next
 * year's growth, and his POT counts on it (refreshPlayerDerived), so a bad year takes less off his
 * POT than off his OVR. Without it a 20-year-old's -2 took 3.5 off his POT.
 */
/** OVR a point of a young player's summer is worth over a year, in the middle of the display scale (the summer's share of his skills and body, their OVR weights, the scale's middle slope): turns a rebound in OVR into the summer's units. */
const SUMMER_OVR = 0.75;

/**
 * Training: balanced adds a little to every attribute. A focus is OVR-neutral against it: the
 * other attributes add less, and the focused ones get what they give up, sized by how much they
 * count in this player's OVR (a guard's rebounding focus gains more rebounding than a center's).
 */
const BALANCED_GAIN = 0.25;
const OFF_FOCUS_GAIN = 0.05;

export const FOCUS_KEYS: Record<TrainingFocus, RatingKey[]> = {
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
  /** His minutes a game in the season that counts; null when he had no season to play in (a draftee's first summer): minutes then neither help nor hurt. */
  mpg: number | null;
  /** League-wide mean of each attribute (ratingMeans): with it, a strong attribute fades faster with age than a weak one. */
  means?: Partial<Record<RatingKey, number>>;
  /** His hidden development arc through 25 (see trajectory): z-score, 0 without one. */
  trajectory?: number;
  /** The staff's development priority, rating points a year on each skill: PRIORITY.gain for a priority player, minus PRIORITY.cost for each priority teammate for another young player, 0 past PRIORITY.maxAge. */
  staff?: number;
  /** OVR a young player makes up this year after a down one (REBOUND times last year's shortfall). */
  rebound?: number;
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

/**
 * Stars fade harder from 33: every attribute's decline is this much steeper for a player rated 90
 * or more (ramping in from 87), and the summer can't lift him back. With the league's decline alone,
 * the display scale's top is so stretched that a 98 lost a point a year at 33-35 and the anchors
 * gave it back: Gilgeous-Alexander was still 96 at 37 and the opening night's top five held the
 * top for a decade. Each year past 33 adds STAR_FADE_STEP, up to STAR_FADE_MAX.
 */
const STAR_FADE_FROM = 33;
const STAR_FADE = 0.8;
const STAR_FADE_STEP = 0.2;
const STAR_FADE_MAX = 1.6;
const starFade = (ovr: number, a: number) => (a < STAR_FADE_FROM ? 0 : clamp((ovr - 87) / 3, 0, 1) * Math.min(STAR_FADE_MAX, STAR_FADE + STAR_FADE_STEP * (a - STAR_FADE_FROM)));
/**
 * ...and the least OVR such a star gives up in a summer at 33, 34, 35, 36 and 37+ (give or take a
 * point): the display scale tops out at 99, so ratings that ran past it could fall for years
 * without a 99 moving. A 97 at 32 is about 95 at 33, 90 at 35 and 83 at 37.
 */
const STAR_DROP = [2, 2.5, 3, 3.5, 4];
function starDrop(ovr: number, a: number, rng: Rng) {
  const star = a < STAR_FADE_FROM ? 0 : clamp((ovr - 87) / 3, 0, 1);
  return star && star * Math.max(1, STAR_DROP[Math.min(a - STAR_FADE_FROM, 4)] + rng.normal(0, 0.7));
}

/**
 * The shot holds longest: a decline in three-point and free-throw shooting runs at this share of
 * the shooting group's, however good the shooter (none of a strong attribute's faster fade or a
 * star's), while his volume falls (LATE_VOLUME). Real shooters keep their percentages into their late
 * thirties (Curry 38.9% from three at 37, Korver and Allen theirs at 38) and take fewer of them; with
 * every skill fading alike, a good shooter's three-point rating fell 2-5 points a summer at 35 and his
 * usage not at all.
 */
const SHOT_HOLDS: Partial<Record<RatingKey, number>> = { tp: 0.5, ft: 0.5 };

/**
 * Past LATE_FROM a player's share of his team's offense falls each summer, whatever his ratings
 * say: he uses fewer possessions (`use`), creates less of his own (`create`), gets to the rim less
 * (`drive`) and takes fewer threes (`three`, which his level's model otherwise raises as his OVR falls,
 * see followTendencies: an aging shooter turned into more of a spot-up gunner every year), by these
 * factors a summer (usage and creation settle back toward his level's a quarter a year, so they level
 * off about a fifth lower). His minutes fall with his stamina and the coaches' veteran ceiling
 * (coachAI's veteranCeiling). Over 48 seasons (four real leagues of twelve) players 36 or older led
 * the league in threes 7 times (Thompson at 37, Hardaway at 36, Porter at 36 with 13 attempts a game
 * in 19 minutes); with this and the engine's three-point volume (K.threeUse) 5 in points or threes: a
 * 38-year-old Curry in two leagues' first season (4.8-5.1 a game; his 4.4 led the league at 37), two
 * specialists at 36 and 37 (4.7-5.2) and Irving at 36 (28.0 points).
 */
const LATE_FROM = 33;
const LATE_VOLUME = { use: 0.95, create: 0.93, drive: 0.92, three: 0.94 } as const;
function lateVolume(p: Player, age: number) {
  if (age <= LATE_FROM || !p.tend) return;
  for (const k of Object.keys(LATE_VOLUME) as (keyof typeof LATE_VOLUME)[]) {
    const v = p.tend[k];
    if (v !== undefined) p.tend[k] = Math.round(Math.max(0.1, v * LATE_VOLUME[k]) * 1000) / 1000;
  }
}

/**
 * A season's three-point volume past THREE_SHARE of his team's shots while he was on the floor
 * brings his three-point tendency down for the next, by (THREE_SHARE / share)^THREE_EXP (about what
 * takes the share back to it). In the seed's 1,354 real seasons of 1,500+ minutes since 2004 only
 * Harden (0.201) and Curry (0.200) passed 0.19, the 99th percentile is 0.170 and the specialists top
 * out at 0.177 (Clarkson, Robinson, Hield). The sim's specialists went past it as the years went
 * on: a low-usage shooter's usage settles toward his level's (followTendencies) while his tendency
 * for threes, fitted for his old role, stays, and a young shooter's volume grows with his skill on a
 * tendency fitted for a worse one (Hauser at 0.20 by 33, Dëmin 12.3 a game by 24): role players led
 * the league in threes on 5.2-5.9 a game.
 */
const THREE_SHARE = 0.18;
const THREE_EXP = 1.5;
function threeVolume(p: Player, statsSeason: number, room = 0) {
  const st = seasonTotals(p, statsSeason);
  if (!st || !p.tend || st.teamFga < 400) return;
  const share = st.tpa / st.teamFga;
  // (`room`: more of it for the rare player past the league's ceilings, see legends.ts)
  const line = THREE_SHARE + room;
  if (share > line) p.tend.three = Math.round(Math.max(0.02, p.tend.three * Math.pow(line / share, THREE_EXP)) * 1000) / 1000;
}

/**
 * A season using more than USE_SHARE of his team's possessions while he was on the floor (shots, a
 * share of free throws, turnovers) brings his usage tendency down for the next, by (USE_SHARE /
 * share)^USE_EXP (his share answers his tendency well under one for one, see starUsage.ts). In the
 * seed's 1,354 real seasons of 1,500+ minutes since 2004 the 99th percentile is 0.36 and the 99.5th
 * 0.374 (Dončić 0.377 in 2025-26; only Westbrook's 0.408 and Harden's 0.406 past 0.39), and the top
 * scorers' seasons ran to 36.1 (Harden) and otherwise 34.3 at most. The sim's stars climbed past it as
 * their real teammates gave way to generated ones (whose usage is their level's, while theirs was
 * fitted against the real ones): Edwards 0.32 at 25 to 0.39 from 28 and Mitchell 0.33 to 0.42 at 32,
 * with seasons of 35-39 points a game (over 64 seasons, eight leagues of eight: two leagues with 4
 * and 2 seasons of a 35-point scorer; with this at 0.37 and squared, 3 and 4, Edwards at 35-37 on
 * 36-37%; at 0.35 and cubed, one league with 2 and none elsewhere). The first season, played on the
 * real lines, is untouched.
 */
// (0.35 and cubed until 2026-11-21: the tails were opened on purpose, see legends.ts)
const USE_SHARE = 0.37;
const USE_EXP = 2;
function usageVolume(p: Player, statsSeason: number, room = 0) {
  const st = seasonTotals(p, statsSeason);
  const team = st ? st.teamFga + 0.44 * st.teamFta + st.teamTov : 0;
  if (!st || !p.tend || team < 1000) return;
  const share = (st.fga + 0.44 * st.fta + st.tov) / team;
  const line = USE_SHARE + room;
  if (share > line) p.tend.use = Math.round(Math.max(0.1, p.tend.use * Math.pow(line / share, USE_EXP)) * 1000) / 1000;
}

/**
 * Share of a year's gain an attribute still takes near the top of the scale: all of it up to
 * CEILING_FROM, then less the closer it is to 100 (a fifth at most from 96 up).
 */
const CEILING_FROM = 80;
const ceilingRoom = (r: number) => (r <= CEILING_FROM ? 1 : Math.max(0.2, (100 - r) / (100 - CEILING_FROM)));

/**
 * The most a player's OVR moves from one preseason to the next, by his age in the new season (the
 * summer's development, the league's anchors and an aging star's drop together; an injury's lasting
 * damage is its own, see injuries.ts).
 */
export const YEAR_BANDS: readonly { to: number; down: number; up: number }[] = [
  { to: 22, down: -2, up: 8 },
  { to: 26, down: -3, up: 6 },
  { to: 31, down: -4, up: 4 },
  { to: 35, down: -5, up: 2 },
  { to: Infinity, down: -7, up: 1 },
];
export const yearBand = (age: number) => YEAR_BANDS.find((b) => age <= b.to)!;

/** Apply `frac` of a year's development. Returns OVR change. */
export function develop(p: Player, season: number, ctx: DevContext, rng: Rng, frac = 1, scale?: League['ovrScale']): number {
  const a = playerAge(p, season);
  const before = scale ? toDisplay(ovrRaw(p.ratings), scale) : 0;
  const young = a <= 25;
  const fade = starFade(p.ovr, a);
  // a good or bad summer moves all skills together (an aging star's only down)
  const arc = young ? (ctx.trajectory ?? 0) * TRAJECTORY[clamp(a - 19, 0, 6)] : 0;
  // (one draw, as before the young player's bad summers were halved: the league's stream runs as it did)
  const swing = rng.normal(0, young ? SUMMER_SD.young : SUMMER_SD.prime);
  const played = ctx.mpg === null || ctx.mpg >= BENCH.plays ? 1 : ctx.mpg > BENCH.sits ? BENCH.some : BENCH.none;
  let summer = young
    ? p.growth * 1.1 + arc + YOUTH[clamp(a - 19, 0, 6)] * played + (ctx.rebound ?? 0) / SUMMER_OVR + (swing < 0 ? swing * YOUNG_DOWN : swing)
    : p.growth * 0.4 + swing;
  if (fade > 0) summer = Math.min(0, summer);
  const coaching = ((ctx.coachDev - 50) / 50) * 0.7 + ((ctx.coachingBudget - 50) / 50) * 0.5;
  const practice = ctx.practice === 'intense' ? 0.45 : ctx.practice === 'light' ? -0.35 : 0;
  const minutes = young && ctx.mpg !== null ? (ctx.mpg >= 25 ? 0.6 : ctx.mpg >= 15 ? 0.25 : ctx.mpg <= 6 ? -0.3 : 0) : 0;
  const staff = ctx.staff ?? 0;
  const w = ovrWeights(p.ratings);
  const focus = FOCUS_KEYS[p.training];
  let focusGain = BALANCED_GAIN;
  if (focus.length) {
    const all = RATING_KEYS.reduce((t, k) => t + (k === 'hgt' ? 0 : w[k]), 0);
    const focused = focus.reduce((t, k) => t + w[k], 0);
    focusGain = (BALANCED_GAIN * all - OFF_FOCUS_GAIN * (all - focused)) / focused;
  }
  // what the staff's priority did to his raw OVR this step (the year's total goes on his next snapshot)
  let staffRaw = 0;
  for (const k of RATING_KEYS) {
    const g = GROUP_OF[k];
    let d = curve(g, a);
    if (d < 0) d *= SHOT_HOLDS[k] ?? fadeScale(p.ratings[k], ctx.means?.[k]) * (1 + fade);
    const isSkill = g !== 'hgt' && g !== 'athletic' && g !== 'end' && g !== 'str';
    if (g !== 'hgt') {
      d += summer * (isSkill ? SUMMER_SKILLS : SUMMER_BODY) + rng.normal(0, OWN_NOISE);
      if (isSkill) d += coaching + practice + minutes + staff;
      d += !focus.length || focus.includes(k) ? focusGain : OFF_FOCUS_GAIN;
      if (p.training === 'conditioning' && g === 'athletic' && d < 0) d *= 0.75;
    }
    // the last points are the hardest: a gain slows as the attribute nears the top of the scale
    const room = d > 0 && g !== 'hgt' ? ceilingRoom(p.ratings[k]) : 1;
    if (isSkill && staff) staffRaw += w[k] * staff * room * frac;
    p.ratings[k] = clamp(Math.round((p.ratings[k] + d * room * frac) * 10) / 10, 1, 100);
  }
  if (staffRaw) p.devStaff = Math.round(((p.devStaff ?? 0) + staffRaw) * 1000) / 1000;
  if (!scale) return 0;
  const after = toDisplay(ovrRaw(p.ratings), scale);
  return after - before;
}

/** OVR, potential and archetype for the league's season and scale. */
export function refreshDerived(league: League, p: Player) {
  refreshPlayerDerived(p, league.season, league.ovrScale);
}

/** `statsSeason` is the season whose minutes count: the one just finished in the offseason, the current one in season. */
function devContext(league: League, p: Player, statsSeason: number, means: DevContext['means'], priority: Map<number, number[]>): DevContext {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const st = seasonTotals(p, statsSeason);
  // (a draftee's first summer: the season that would count was played before he was picked. Read as no
  // minutes, it cost every rookie the benchwarmer's 0.3 a skill before he had a game to play in)
  const mpg = st && st.gp ? st.min / st.gp : p.draft.year >= statsSeason ? null : 0;
  const young = playerAge(p, league.season) <= YOUNG_TO;
  const list = team ? (priority.get(team.tid) ?? []) : [];
  return {
    coachDev: team ? team.coach.development : 45,
    coachingBudget: team ? team.budget.coaching : 40,
    practice: team ? team.practice : 'normal',
    mpg,
    means,
    trajectory: young ? trajectory(league, p.pid) * arcScale(p) : 0,
    staff: list.includes(p.pid) ? PRIORITY.gain : young ? -PRIORITY.cost * list.length : 0,
    // the year behind him: the one that ended at his latest preseason snapshot
    rebound: young ? -REBOUND_SHARE * yearShortfall(p, p.ratingsHistory[p.ratingsHistory.length - 1]?.season ?? league.season) : 0,
  };
}

// ---------------------------------------------------------------- development priority

const priorityAge = (league: Pick<League, 'season'>, p: Player) => playerAge(p, league.season) <= PRIORITY.maxAge;

/** The staff's own pick for a team's development priority: its PRIORITY.slots players of PRIORITY.maxAge or under with the most ahead of them (POT, then OVR), those with room to grow. */
export function staffPriority(league: League, tid: number): number[] {
  const out: Player[] = [];
  for (const p of Object.values(league.players)) if (p.tid === tid && priorityAge(league, p) && p.pot > p.ovr) out.push(p);
  return out
    .sort((a, b) => b.pot - a.pot || b.ovr - a.ovr || a.pid - b.pid)
    .slice(0, PRIORITY.slots)
    .map((p) => p.pid);
}

/** Whether the user has chosen his team's development priority himself (else his staff pick, as an AI team's do). */
export const priorityChosen = (league: League) => league.teams[league.userTid]?.devPriority !== undefined;

/** A team's development priority now: the user's choice where he made one (those still on his roster and young enough), the staff's pick else. */
export function devPriority(league: League, tid: number): number[] {
  const own = tid === league.userTid ? league.teams[tid]?.devPriority : undefined;
  if (!own) return staffPriority(league, tid);
  return own.filter((pid) => league.players[pid]?.tid === tid && priorityAge(league, league.players[pid])).slice(0, PRIORITY.slots);
}

const priorityMap = (league: League) => new Map(league.teams.map((t) => [t.tid, devPriority(league, t.tid)]));

/**
 * Give one of the user's players the staff's priority, or take it back. The first choice starts from
 * the staff's pick, so naming one player doesn't drop the other. Null when done, else why not.
 */
export function toggleDevPriority(league: League, pid: number): string | null {
  const p = league.players[pid];
  const team = league.teams[league.userTid];
  if (!p || !team || p.tid !== team.tid) return 'He is not on your roster.';
  const list = devPriority(league, team.tid);
  if (list.includes(pid)) {
    team.devPriority = list.filter((x) => x !== pid);
    return null;
  }
  if (!priorityAge(league, p)) return `Priority is for players ${PRIORITY.maxAge} or under.`;
  if (list.length >= PRIORITY.slots) return `Both priority places are taken. Free one first.`;
  team.devPriority = [...list, pid];
  return null;
}

/** Hand the choice back to the staff (their pick, kept up to date as the roster changes). */
export function staffPicksPriority(league: League) {
  delete league.teams[league.userTid]?.devPriority;
}

/** The display scale without rounding or its 40 and 99 ends (toDisplay's own lines), and the raw OVR a display value stands for. */
function dispExact(raw: number, scale: League['ovrScale']): number {
  const { raw: xs, disp: ys } = scale;
  const n = xs.length;
  if (raw <= xs[0]) return ys[0] + ((raw - xs[0]) * (ys[1] - ys[0])) / (xs[1] - xs[0]);
  if (raw >= xs[n - 1]) return ys[n - 1] + ((raw - xs[n - 1]) * (ys[n - 1] - ys[n - 2]) * 0.6) / (xs[n - 1] - xs[n - 2]);
  let i = 1;
  while (raw > xs[i]) i++;
  return ys[i - 1] + ((raw - xs[i - 1]) * (ys[i] - ys[i - 1])) / (xs[i] - xs[i - 1]);
}
function rawAt(disp: number, scale: League['ovrScale']): number {
  const { raw: xs, disp: ys } = scale;
  const n = xs.length;
  if (disp <= ys[0]) return xs[0] + ((disp - ys[0]) * (xs[1] - xs[0])) / (ys[1] - ys[0]);
  if (disp >= ys[n - 1]) return xs[n - 1] + ((disp - ys[n - 1]) * (xs[n - 1] - xs[n - 2])) / ((ys[n - 1] - ys[n - 2]) * 0.6);
  let i = 1;
  while (disp > ys[i]) i++;
  return xs[i - 1] + ((disp - ys[i - 1]) * (xs[i] - xs[i - 1])) / (ys[i] - ys[i - 1]);
}
/** OVR a raw point is worth in the middle of the display scale: between its 30th and 70th percentiles (70 and 78). */
function midSlope(scale: League['ovrScale']): number {
  const lo = OVR_ANCHORS.findIndex(([q]) => q === 0.3);
  const hi = OVR_ANCHORS.findIndex(([q]) => q === 0.7);
  return (scale.disp[hi] - scale.disp[lo]) / Math.max(1e-6, scale.raw[hi] - scale.raw[lo]);
}

/**
 * What a year of the staff's priority is worth to a player in OVR, on average: PRIORITY.gain on each
 * skill (less where a skill is near the top of the scale, see ceilingRoom) by its weight in his OVR,
 * at his place on the display scale. The figure the screens show before the user commits; what it
 * did is on his next snapshot (RatingsSnapshot.staff).
 */
export function priorityEffect(league: Pick<League, 'ovrScale' | 'season'>, p: Player, points = PRIORITY.gain): number {
  const w = ovrWeights(p.ratings);
  let raw = 0;
  for (const k of RATING_KEYS) {
    const g = GROUP_OF[k];
    if (g === 'hgt' || g === 'athletic' || g === 'end' || g === 'str') continue;
    raw += w[k] * points * (points > 0 ? ceilingRoom(p.ratings[k]) : 1);
  }
  // (a player past 26 develops in the summer alone: develop's 0.8 of a year; the younger at the check-ins too)
  raw *= playerAge(p, league.season) > 26 ? 0.8 : 0.8 + 3 * 0.07;
  return worth(league.ovrScale, ovrRaw(p.ratings), raw);
}

/** What a change of `raw` points from a raw OVR of `from` is worth in OVR: the display scale's own lines, a raw point worth at most what it is in the middle of the scale (as a year's change is counted: see heldYear). */
function worth(scale: League['ovrScale'], from: number, raw: number): number {
  const own = dispExact(from + raw, scale) - dispExact(from, scale);
  const mid = raw * midSlope(scale);
  return Math.abs(own) > Math.abs(mid) ? mid : own;
}

/** What `priorities` priority teammates cost another young player a year, in OVR (negative; 0 past PRIORITY.maxAge): PRIORITY.cost each on every skill. */
export const priorityCost = (league: Pick<League, 'ovrScale' | 'season'>, p: Player, priorities: number) =>
  priorities && priorityAge(league, p) ? priorityEffect(league, p, -PRIORITY.cost * priorities) : 0;

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
    const standard = ps.map((p) => ({ p, raw: ovrRaw(p.ratings) }));
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

/** The raw-OVR quantiles the league's shape is held by (SHAPE_QS), among `pop`: a player past the scale isn't part of the shape the others are held to. */
function shapeOf(league: League, pop: Player[]): number[] | null {
  const top = scaleTop(league);
  const raws = pop
    .map((p) => ovrRaw(p.ratings))
    .filter((raw, i) => !pop[i].peak || raw <= top)
    .sort((a, b) => a - b);
  return raws.length < 40 ? null : SHAPE_QS.map((f) => raws[Math.round(f * (raws.length - 1))]);
}

/**
 * Set what anchorRatings holds the league to, on the league as it stands: each attribute's mean and
 * spread and the raw-OVR shape of the opening-night league (anchorPopulation). Call once the league
 * is made and its rosters are cut to opening night's. Set on everyone under contract before the
 * preseason cuts (as until 2026-11-23), a real league's anchors described a weaker and flatter league
 * than the one its first summer measured (its camp deals pulled the 15th percentile from 46.1 raw to
 * 45.2 and each attribute's mean 0.3 down), so the first summer moved every player to it: the anchor
 * alone took 0.75 OVR off the average rostered player and the 85+ players went from 48 to 41, before
 * anyone had developed (dev-check, three leagues: the first summer's mean change -1.60 against -0.68
 * in later ones; a generated league, whose anchors and first summer measured the same 14 a team,
 * -1.10 against -0.91).
 */
export function setAnchors(league: League) {
  const pop = anchorPopulation(league);
  league.ratingAnchors = ratingMeans(league, pop);
  league.ratingSpreads = ratingSpreads(league, pop);
  const shape = shapeOf(league, pop);
  if (shape) league.ovrShape = shape.map((x) => Math.round(x * 1000) / 1000);
}

/**
 * Hold the league's talent distribution steady: after a year of development (young players rise,
 * veterans fade, rookies arrive, retirees leave), map every attribute back so its mean among the
 * opening-night league (anchorPopulation) matches the anchor set when the league was created
 * (setAnchors), and pull its spread halfway back toward the original each year (otherwise stars
 * drift upward and 90+ OVR players pile up). Individual arcs are kept relative to the league;
 * scoring, OVR meaning and salaries stay stable for decades.
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

/**
 * Quantiles of the raw-OVR distribution held to the league's creation (see anchorOverallSpread,
 * League.ovrShape): OVR_ANCHORS' but the bottom end. The 99.3rd (the league's 3rd or 4th best player) and the best
 * player hold the stars' band too: with the top held from the 97.5th alone, the ten or so players
 * past it could run up the scale together (some leagues had six rated 99 by their fifth season), and
 * with the 99.3rd alone the best one or two could still run away from everyone, their ratings far
 * past the display's 99: leaders used 43-46% of their teams' possessions and scored 41-49 a game.
 */
const SHAPE_QS = [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.93, 0.975, 0.993, 1];

/**
 * Good and bad summers move a player's skills together, so over the years good players become
 * good at everything and the OVR spread widens even with every attribute's own spread held (more
 * stars and more sub-60 players), while the top can thin out as stars age. Pull each stretch of the
 * raw-OVR distribution between neighbouring SHAPE_QS halfway back to its width on the league's
 * opening night (League.ovrShape, see setAnchors), around the median: each player moves along all his
 * attributes at once, by where he stands. Held by its two halves alone (median to 97.5th, 5th to
 * median), the shape inside them drifted: the band of 80-84 players filled up while the 85+ stars
 * thinned out.
 */
/** The share of its own width the top stretch of the overall distribution keeps each summer (the others: half). */
const TOP_OWN = 0.75;

function anchorOverallSpread(league: League, pop: Player[]) {
  const now = shapeOf(league, pop);
  if (!now) return;
  // (a league from before setAnchors keeps the shape it has been held to since its first summer: its display scale's quantiles)
  const then = league.ovrShape?.length === SHAPE_QS.length ? league.ovrShape : SHAPE_QS.map((f) => league.ovrScale.raw[OVR_ANCHORS.findIndex(([q]) => q === f)]);
  // where each quantile goes: every stretch's width halfway back to its width at creation, out from the median
  const mid = SHAPE_QS.indexOf(0.5);
  const to = [...now];
  // (the last stretch, the league's best player over its third or fourth best, keeps three quarters of its own
  // width: one great player may stand further clear of the rest than the opening night's best did)
  for (let i = mid + 1; i < now.length; i++) {
    const own = i === now.length - 1 ? TOP_OWN : 0.5;
    to[i] = to[i - 1] + own * (now[i] - now[i - 1]) + (1 - own) * (then[i] - then[i - 1]);
  }
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
    // (the rare player with room past the league's best is held to the shape only as far as his peak: legends.ts)
    const shift = (keepPeak(league, p, raw, target(raw)) - raw) / weight;
    if (Math.abs(shift) < 0.05) continue;
    for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] = clamp(Math.round((p.ratings[k] + shift) * 10) / 10, 1, 100);
  }
}

/**
 * Where the bands start to hold a year's change (a share of the way to the bound): up to here it
 * stands as it came, past it less and less of it does, and none past the bound. A soft edge: the
 * years near a band's end thin out rather than pile up on it.
 */
const BAND_KNEE = 0.5;
const soften = (x: number, bound: number) => {
  const knee = bound * BAND_KNEE;
  return x <= knee ? x : knee + (bound - knee) * (1 - Math.exp(-(x - knee) / (bound - knee)));
};

/** Move a player's level (every attribute but his height, together) so his raw OVR is `to`. */
function levelTo(p: Player, to: number) {
  for (let pass = 0; pass < 2; pass++) {
    const w = ovrWeights(p.ratings);
    const weight = RATING_KEYS.reduce((t, k) => t + (k === 'hgt' ? 0 : w[k]), 0);
    const step = (to - ovrRaw(p.ratings)) / weight;
    if (Math.abs(step) < 0.02) return;
    for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] = clamp(Math.round((p.ratings[k] + step) * 10) / 10, 1, 100);
  }
}

/** A player's change in level since his raw OVR was `raw0`, in OVR on the display scale (unrounded), a raw point worth at most what it is in the middle of the scale (see heldYear). */
const evenMove = (league: League, p: Player, raw0: number) => worth(league.ovrScale, raw0, ovrRaw(p.ratings) - raw0);

/**
 * What a summer leaves of a player's change in level (his development and the league's anchors
 * together), as his OVR on the display scale, unrounded. Two things hold it:
 * - The display scale's steep stretches don't multiply it: a raw point is worth at most what it is in
 *   the middle of the scale (midSlope, about 2 OVR). A real league's 62 and 66 are 0.6 raw points
 *   apart and its 52 and 62 are 2.6, so an ordinary summer moved a player at the end of a bench 6 to
 *   10 OVR (a first-round pick from 68 to 54, a second-rounder up 7), and the anchors' half a raw point
 *   a year took two or three OVR off the young players there and under one off a starter.
 * - The year's band for his age (YEAR_BANDS), softly (BAND_KNEE): measured from his last preseason, so
 *   what the season's check-ins added counts toward it, and what an injury took doesn't count against
 *   his floor. A generational player's climb has no ceiling (legends.ts).
 * Before both, over six leagues' five summers (dev-check): 256 of 1,577 years at 22 or under ran past
 * -2..+8 (the worst -18), 334 of 2,877 at 23-26 past -3..+6, 159 of 2,715 at 27-31 past -4..+4, 112 of
 * 1,153 at 32-35 past -5..+2 and 31 of 200 at 36 or more past -7..+1 (the worst -15); three of those
 * 892 followed an injury.
 */
function heldYear(league: League, p: Player, raw0: number, was: number, age: number): number {
  const d0 = dispExact(raw0, league.ovrScale);
  const move = evenMove(league, p, raw0);
  const band = yearBand(age);
  // the season behind him: what the check-ins added (or an injury took) since his last preseason
  const season = was - (p.ratingsHistory[p.ratingsHistory.length - 1]?.ovr ?? was);
  const up = Math.max(1, band.up - season);
  const down = Math.min(-1, band.down - Math.max(0, season));
  return d0 + (move >= 0 ? (p.peak ? move : soften(move, up)) : -soften(-move, -down));
}

/** Offseason development for everyone (run at the start of a new season). */
export function annualProgression(league: League, rng: Rng): { pid: number; delta: number }[] {
  const out: { pid: number; delta: number }[] = [];
  const before = new Map(Object.values(league.players).map((p) => [p.pid, p.ovr]));
  const raw0 = new Map(Object.values(league.players).map((p) => [p.pid, ovrRaw(p.ratings)]));
  // (this summer's prospects are drafted or gone by now; next year's class arrives after this)
  const means = ratingMeans(league);
  const priority = priorityMap(league);
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT) continue;
    develop(p, league.season, devContext(league, p, league.season - 1, means, priority), rng, 0.8);
  }
  anchorRatings(league);
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT) continue;
    const was = before.get(p.pid) ?? p.ovr;
    const age = playerAge(p, league.season);
    // the year's change in level, held to what a summer may do (heldYear)
    let to = heldYear(league, p, raw0.get(p.pid) ?? ovrRaw(p.ratings), was, age);
    // an aging star's decline shows on his OVR, however far past the top of the scale his ratings ran
    // (never past his age's band)
    const drop = starDrop(was, age, rng);
    if (drop > 0) to = Math.max(Math.min(to, was - drop), was + yearBand(age).down);
    if (Math.abs(to - dispExact(ovrRaw(p.ratings), league.ovrScale)) > 0.05) levelTo(p, rawAt(to, league.ovrScale));
    // a generational player's climb past the scale, while he's young (legends.ts)
    peakSummer(league, p);
    refreshDerived(league, p);
    // tendencies follow the year's change in level: from the OVR of his latest snapshot, which they
    // were set for (in-season development and injuries since count too), or for a draftee without
    // one, from before this summer's development
    followTendencies(p, p.ratingsHistory[p.ratingsHistory.length - 1]?.ovr ?? before.get(p.pid) ?? p.ovr, rng);
    lateVolume(p, age);
    const more = volumeRoom(league, p);
    threeVolume(p, league.season - 1, more.three);
    usageVolume(p, league.season - 1, more.use);
    // what the staff's priority did over the year (the check-ins and the summer), in OVR at his place on the scale
    const at = ovrRaw(p.ratings);
    const staff = p.devStaff ? Math.round(worth(league.ovrScale, at - p.devStaff, p.devStaff) * 10) / 10 : 0;
    delete p.devStaff;
    p.ratingsHistory.push({
      season: league.season,
      ovr: p.ovr,
      pot: p.pot,
      r: { ...p.ratings },
      ...(p.training !== 'balanced' ? { focus: p.training } : {}),
      ...(staff ? { staff } : {}),
    });
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
  const priority = priorityMap(league);
  for (const p of Object.values(league.players)) {
    if (p.tid < 0) continue;
    const a = playerAge(p, league.season);
    if (a > 26) continue;
    const before = p.ovr;
    const raw0 = ovrRaw(p.ratings);
    develop(p, league.season, devContext(league, p, league.season, undefined, priority), rng, 0.07);
    // (the scale's steep stretches don't multiply a check-in's step either: see heldYear)
    const to = dispExact(raw0, league.ovrScale) + evenMove(league, p, raw0);
    if (Math.abs(to - dispExact(ovrRaw(p.ratings), league.ovrScale)) > 0.05) levelTo(p, rawAt(to, league.ovrScale));
    refreshDerived(league, p);
    if (p.ovr !== before) out.push({ pid: p.pid, delta: p.ovr - before });
  }
  return out;
}
