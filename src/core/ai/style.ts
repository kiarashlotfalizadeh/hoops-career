// Coaches' styles: how a coach's teams play whoever is on the roster. A real franchise's coach plays its
// real style: the tempo, shot profile, glass and mix of actions its real team played in 2024-26 (NBA.com
// Synergy play types and the box scores, src/data/realStyles.json, built by scripts/data/styles.ts),
// and the ball-screen coverage its personnel calls for. A coach of his own (a fictional league's, a new
// hire) gets a real team's style with some of his own on it, so the league's styles spread as real
// ones do. The AI staff fits the style to the roster it has (coachAI.ts); scouting names it by the
// playbook nearest it. Written in November 2026 (tactics v2): before, every coach's philosophy was a
// random draw of six, so the sim's teams played nothing like their real selves (the Warriors' card
// read "Runs Grit & Grind at a slow pace").

import type { ActionType, CoachProfile, CoachStyle, DefenseTactics, OffenseTactics, Player, PnrCoverage } from '../types';
import { ACTION_TYPES } from '../types';
import { composites } from '../ratings';
import { COVERAGE_META, DEF_PRESETS, OFF_PRESETS } from '../sim/tactics';
import { type Rng, clamp } from '../random';
import real from '../../data/realStyles.json';

type Kind = 'isolation' | 'transition' | 'pnrBH' | 'pnrRoll' | 'post' | 'spotup' | 'handoff' | 'cut' | 'offscreen' | 'putback';
interface RealLine {
  share: Record<Kind, number>;
  pace: number;
  tpaRate: number;
  ftaRate: number;
  orbPct: number;
  tovPerPoss: number;
  opp: { tpaRate: number; ftaRate: number; orbPct: number; tovPerPoss: number };
}
const TEAMS = (real as unknown as { teams: Record<string, { blend: RealLine }> }).teams;

/** The real franchises whose styles are known. */
export const REAL_STYLE_TEAMS = Object.keys(TEAMS);

/**
 * What the real numbers are read as: the action groups (a pick-and-roll is its handler's and its roll
 * man's plays; handoffs take off-ball screens with them; motion is its cuts and, less, its spot-ups),
 * each one's weight at the league's average (`base`) and how far it moves per standard deviation of
 * its real share (`per`, a log scale), and the settings' moves per standard deviation of their real
 * numbers. Sized so the sim's teams spread across play types about as real teams do (team-to-team SD
 * of isolation share 1.9 points, post-ups 1.6, cuts 1.25, off-screens 1.25: Synergy 2024-25).
 */
const READ = {
  base: { pnr: 60, iso: 51, post: 34, handoff: 26, motion: 56 } as Record<ActionType, number>,
  per: { pnr: 0.12, iso: 0.24, post: 0.36, handoff: 0.2, motion: 0.1 } as Record<ActionType, number>,
  pace: { at: 50, per: 15 },
  transition: { at: 50, per: 13 },
  threePoint: { at: 55, per: 5 },
  rimAttack: { at: 58, per: 9 },
  crash: { at: 50, per: 24 },
  pressure: { at: 52, per: 9 },
  help: { at: 55, per: 8 },
  physicality: { at: 50, per: 10 },
  getBack: { at: 58, per: 9 },
};

const lines = Object.values(TEAMS).map((t) => t.blend);
const group = (l: RealLine): Record<ActionType, number> => ({
  pnr: l.share.pnrBH + l.share.pnrRoll,
  iso: l.share.isolation,
  post: l.share.post,
  handoff: l.share.handoff + l.share.offscreen,
  motion: 0.6 * (l.share.cut / 0.0725) + 0.4 * (l.share.spotup / 0.2528),
});
function stats(xs: number[]) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1 };
}
const G = Object.fromEntries(ACTION_TYPES.map((a) => [a, stats(lines.map((l) => group(l)[a]))])) as Record<ActionType, { m: number; sd: number }>;
const S = {
  pace: stats(lines.map((l) => l.pace)),
  transition: stats(lines.map((l) => l.share.transition)),
  tpa: stats(lines.map((l) => l.tpaRate)),
  fta: stats(lines.map((l) => l.ftaRate)),
  orb: stats(lines.map((l) => l.orbPct)),
  oppTov: stats(lines.map((l) => l.opp.tovPerPoss)),
  oppTpa: stats(lines.map((l) => l.opp.tpaRate)),
  oppFta: stats(lines.map((l) => l.opp.ftaRate)),
};

/** A team's real numbers as standard deviations from the league's: the coordinates a style is built from (and a new coach's drawn around). */
export interface StyleZ {
  actions: Record<ActionType, number>;
  pace: number;
  transition: number;
  tpa: number;
  fta: number;
  orb: number;
  oppTov: number;
  oppTpa: number;
  oppFta: number;
  /** How hard he gets back (no real number reads it: 0 for a real team, his own for a new coach). */
  getBack?: number;
}

function zOf(l: RealLine): StyleZ {
  const g = group(l);
  const z = (x: number, s: { m: number; sd: number }) => (x - s.m) / s.sd;
  return {
    actions: Object.fromEntries(ACTION_TYPES.map((a) => [a, z(g[a], G[a])])) as Record<ActionType, number>,
    pace: z(l.pace, S.pace),
    transition: z(l.share.transition, S.transition),
    tpa: z(l.tpaRate, S.tpa),
    fta: z(l.ftaRate, S.fta),
    orb: z(l.orbPct, S.orb),
    oppTov: z(l.opp.tovPerPoss, S.oppTov),
    oppTpa: z(l.opp.tpaRate, S.oppTpa),
    oppFta: z(l.opp.ftaRate, S.oppFta),
  };
}

const at = (k: keyof typeof READ & string, z: number, lo = 10, hi = 92) => {
  const r = READ[k] as { at: number; per: number };
  return Math.round(clamp(r.at + r.per * z, lo, hi));
};

/** A style from its coordinates; the coverage (a lean the staff weighs with its personnel), small-screen switching and zone are its own. */
function styleOf(z: StyleZ, def: { coverage: PnrCoverage; smallSwitch: number; zone: number; zoneKind?: 'zone23' | 'zone32' }, from?: string): CoachStyle {
  const actions = Object.fromEntries(ACTION_TYPES.map((a) => [a, Math.round(clamp(READ.base[a] * Math.exp(READ.per[a] * z.actions[a]), 5, 95))])) as Record<ActionType, number>;
  return {
    pace: at('pace', z.pace),
    transition: at('transition', z.transition),
    threePoint: at('threePoint', z.tpa),
    rimAttack: at('rimAttack', z.fta, 30, 88),
    crash: at('crash', z.orb, 15, 88),
    actions,
    coverage: def.coverage,
    switchOffBall: def.coverage === 'switch',
    help: at('help', z.oppTpa, 25, 85),
    pressure: at('pressure', z.oppTov, 30, 85),
    physicality: at('physicality', z.oppFta, 25, 80),
    // (independent of his crashing: the NBA's hardest-crashing fifth gives up no more pushes than the rest)
    getBack: at('getBack', z.getBack ?? 0, 30, 88),
    smallSwitch: def.smallSwitch,
    zone: def.zone,
    zoneKind: def.zoneKind ?? 'zone23',
    ...(from ? { from } : {}),
  };
}

/**
 * Zone the real league's coaches are known to mix in, as a share of their half-court trips (Synergy
 * logs a few percent for most teams; Miami's for years the league's most). Every other coach mixes in
 * `rest`.
 */
const ZONE = { MIA: 0.12, rest: 0.025 } as Record<string, number> & { rest: number };

/**
 * A real franchise's style: its 2024-26 numbers, with the coverage its roster calls for (pass the
 * players; without them, drop), small screens switched at the league's habit, and its zone.
 */
export function realStyle(abbrev: string, players?: Player[]): CoachStyle | null {
  const t = TEAMS[abbrev];
  if (!t) return null;
  const z = zOf(t.blend);
  const s = styleOf(z, { coverage: 'drop', smallSwitch: 0.7, zone: ZONE[abbrev] ?? ZONE.rest }, abbrev);
  if (players?.length) s.coverage = coverageFor(players, s, true);
  s.switchOffBall = s.coverage === 'switch';
  s.smallSwitch = s.coverage === 'drop' || s.coverage === 'ice' ? 0.6 : 0.85;
  return s;
}

/**
 * A style for a coach of his own: a real team's, picked at random, with his own on it (each coordinate
 * moved by up to about half a standard deviation), a coverage lean drawn from the league's mix, his
 * habit for switching small screens, and a little zone (a few coaches more).
 */
export function randomStyle(rng: Rng): CoachStyle {
  const pick = REAL_STYLE_TEAMS[rng.int(0, REAL_STYLE_TEAMS.length - 1)];
  const z = zOf(TEAMS[pick].blend);
  const j = (x: number) => x * 0.75 + rng.normal(0, 0.45);
  const own: StyleZ = {
    actions: Object.fromEntries(ACTION_TYPES.map((a) => [a, j(z.actions[a])])) as Record<ActionType, number>,
    pace: j(z.pace),
    transition: j(z.transition),
    tpa: j(z.tpa),
    fta: j(z.fta),
    orb: j(z.orb),
    oppTov: j(z.oppTov),
    oppTpa: j(z.oppTpa),
    oppFta: j(z.oppFta),
    getBack: rng.normal(0, 0.7),
  };
  const r = rng.next();
  const coverage: PnrCoverage = r < 0.5 ? 'drop' : r < 0.68 ? 'switch' : r < 0.84 ? 'hedge' : r < 0.96 ? 'ice' : 'blitz';
  const zone = rng.chance(0.12) ? 0.06 + 0.1 * rng.next() : 0.01 + 0.03 * rng.next();
  return styleOf(own, {
    coverage,
    smallSwitch: Math.round((coverage === 'drop' || coverage === 'ice' ? 0.45 + 0.3 * rng.next() : 0.7 + 0.25 * rng.next()) * 100) / 100,
    zone: Math.round(zone * 1000) / 1000,
    zoneKind: rng.chance(0.85) ? 'zone23' : 'zone32',
  });
}

/** The style an old save's coach plays (one from before styles: his playbooks' values), or any coach without one. */
export function styleFromPhilosophy(off: string, def: string): CoachStyle {
  const o = (OFF_PRESETS.find((p) => p.id === off) ?? OFF_PRESETS[0]).values;
  const d = (DEF_PRESETS.find((p) => p.id === def) ?? DEF_PRESETS[0]).values;
  const coverage: PnrCoverage = d.scheme === 'man' ? d.pnr : 'drop';
  return {
    pace: o.pace,
    transition: o.transition,
    threePoint: o.threePoint,
    rimAttack: o.rimAttack,
    crash: o.crashBoards,
    actions: { ...o.actions },
    coverage,
    switchOffBall: coverage === 'switch',
    help: d.help,
    pressure: d.pressure,
    physicality: d.physicality,
    getBack: d.getBack,
    smallSwitch: coverage === 'drop' || coverage === 'ice' ? 0.6 : 0.85,
    zone: d.scheme === 'man' ? 0.025 : 0.2,
    zoneKind: d.scheme === 'zone32' ? 'zone32' : 'zone23',
  };
}

/** A coach's style: his own, or his playbooks' for a coach from before styles. */
export const coachStyle = (c: Pick<CoachProfile, 'style' | 'offPhilosophy' | 'defPhilosophy'>): CoachStyle => c.style ?? styleFromPhilosophy(c.offPhilosophy, c.defPhilosophy);

/**
 * The ball-screen coverage a staff plays with these players and this coach: drop with a big who
 * protects the rim and can't move his feet, show and recover (hedge) with a mobile big, switch with a
 * five of similar-sized, versatile defenders, trap (blitz) with quick hands and a pressing coach, ice
 * with a disciplined five that drops; the coach's own lean counts (`lean`: a real team's own read, no
 * lean). NBA (Second Spectrum, 2020-21): drop 58% of ball screens, switch 18% (and rising), blitz 3%.
 * The offsets were set (2026-11-10) against what each coverage measured for the real league's rosters:
 * the neutral read picked the measured best for 14 of 30 (Drop 18, Switch 6, Hedge 3, Ice 2, Blitz 1),
 * 0.21 a game short of it on average; before, Hedge 7 times where it measured best once (11 of 30, 0.29).
 */
export function coverageFor(players: Player[], style: Pick<CoachStyle, 'coverage' | 'pressure' | 'from'>, neutral = false): PnrCoverage {
  const top = [...players]
    .filter((p) => !p.injury || p.injury.gamesRemaining <= 5)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 8);
  if (top.length < 5) return style.coverage;
  const cs = top.map((p) => ({ p, c: composites(p.ratings) }));
  const bigs = cs.filter((x) => x.p.ratings.hgt >= 58).sort((a, b) => b.p.ovr - a.p.ovr);
  const big = bigs[0] ?? [...cs].sort((a, b) => b.p.ratings.hgt - a.p.ratings.hgt)[0];
  const six = cs.slice(0, 6);
  const hgts = six.map((x) => x.p.ratings.hgt);
  const spread = Math.max(...hgts) - Math.min(...hgts);
  const per6 = six.reduce((a, x) => a + x.c.perDef, 0) / six.length;
  const steals = cs.reduce((a, x) => a + x.c.steal, 0) / cs.length;
  const diq6 = six.reduce((a, x) => a + x.p.ratings.diq, 0) / six.length;
  const rim = big.c.rimProt;
  const spd = big.p.ratings.spd;
  const drop = 0.4 + (rim - 60) / 8 - (spd - 38) / 12;
  const score: Record<PnrCoverage, number> = {
    drop,
    hedge: Math.min(1.5, (spd - 44) / 6) + (big.p.ratings.diq - 50) / 15 - (rim - 60) / 12 - 1.2,
    // (capped: a fictional league's players rate higher on both ends, and read uncapped half its staffs switched)
    switch: Math.min(1.2, (per6 - 51.5) / 1.2) - (spread - 32) / 10 + Math.min(0.5, (spd - 40) / 20) - 0.2,
    ice: (diq6 - 52) / 3 + drop * 0.4 - 1.1,
    blitz: (steals - 54) / 2 + (style.pressure - 62) / 8 - 0.8,
  };
  // (a coach of his own leans harder on his habit: a fictional league's players rate higher on both
  // ends, and read alone its staffs switched twice as often as the real league's)
  if (!neutral) score[style.coverage] += style.from ? 0.9 : 2.8;
  return (Object.keys(score) as PnrCoverage[]).reduce((b, k) => (score[k] > score[b] ? k : b), 'drop');
}

/** The offensive playbook nearest a style (or offense tactics): its name on the scouting card and the coach pages. */
export function nearestOffPreset(o: Pick<OffenseTactics, 'pace' | 'transition' | 'threePoint' | 'actions'>): string {
  let best = OFF_PRESETS[0].id;
  let bd = Infinity;
  for (const p of OFF_PRESETS) {
    const v = p.values;
    let d = ((o.pace - v.pace) / 20) ** 2 + ((o.transition - v.transition) / 20) ** 2 + ((o.threePoint - v.threePoint) / 25) ** 2;
    const sum = (a: Record<ActionType, number>) => ACTION_TYPES.reduce((x, k) => x + a[k], 0);
    const so = sum(o.actions);
    const sv = sum(v.actions);
    for (const k of ACTION_TYPES) d += ((o.actions[k] / so - v.actions[k] / sv) / 0.05) ** 2;
    if (d < bd) [best, bd] = [p.id, d];
  }
  return best;
}

/** The defensive playbook a coverage reads as (a coach who mixes in a lot of zone reads as the 2-3). */
export function defPresetOf(coverage: PnrCoverage, zone = 0): string {
  if (zone >= 0.2) return 'zone';
  return coverage;
}

const ACT_WORD: Record<ActionType, string> = { pnr: 'Pick-and-roll', iso: 'Isolation', post: 'Post-up', handoff: 'Handoff', motion: 'Motion' };

/**
 * A style-run playbook in a few words, for the team pages and scouting: the action it leans on most
 * against the league's mix ("Isolation-heavy"; "Balanced" when none stands out), its tempo when it's
 * fast or slow, its coverage (and zone when he mixes in a fair amount), and the scouting report's
 * sentence ("Slow-paced, isolation-heavy offense with lots of threes.").
 */
export function styleIdentity(
  o: Pick<OffenseTactics, 'pace' | 'threePoint' | 'crashBoards' | 'actions'>,
  d: Pick<DefenseTactics, 'pnr'>,
  zone = 0,
): { off: string; def: string; line: string; defLine: string } {
  // (the lean is the action furthest above the league's mix, in its own spread: one deviation or more)
  const [top, z] = ACTION_TYPES.map((a) => [a, Math.log(Math.max(1, o.actions[a]) / READ.base[a]) / READ.per[a]] as const).sort((x, y) => y[1] - x[1])[0];
  const lean = z >= 1 ? `${ACT_WORD[top]}-heavy` : 'Balanced';
  const pace = o.pace >= 62 ? 'fast' : o.pace <= 38 ? 'slow' : '';
  const off = pace ? `${lean}, ${pace}` : lean;
  const cov = COVERAGE_META[d.pnr].label;
  const def = zone >= 0.08 ? `${cov} and zone` : cov;
  const threes = o.threePoint >= 62 ? ' with lots of threes' : o.threePoint <= 48 ? ' with few threes' : '';
  const kind = lean === 'Balanced' ? 'balanced' : lean.toLowerCase();
  const head = pace ? `${pace === 'fast' ? 'Fast' : 'Slow'}-paced, ${kind}` : kind.charAt(0).toUpperCase() + kind.slice(1);
  const defLine = `${COVERAGE_LINE[d.pnr]}${zone >= 0.08 ? ' Mixes in a zone.' : ''}`;
  return { off, def, line: `${head} offense${threes}.`, defLine };
}

const COVERAGE_LINE: Record<PnrCoverage, string> = {
  drop: 'Drops its big on ball screens.',
  switch: 'Switches ball screens.',
  hedge: 'Shows high on ball screens, then recovers.',
  ice: 'Ices side screens and drops on the middle ones.',
  blitz: 'Traps ball screens.',
};
