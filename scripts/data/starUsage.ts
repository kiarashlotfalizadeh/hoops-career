// Scoring in a real season: the last step of the calibration. calibrate.ts fits each player's
// usage per 36 minutes in games of its own (two roster contexts, the coaches' presets, nobody hurt
// or worn down), and in a season played the way the app plays it the shots split differently: the
// real league's top scorers came in 2-7 points a game under their 2025-26 lines (Jokić 23-25 for
// 27.7, Brown 20-22 for 28.7, Wembanyama 18-19 for 25.0) while bigs who finish what the stars give
// up scored far over theirs (Mobley 28 for 18, Holmgren 23 for 17). This plays whole regular seasons
// of the seed as the app would and moves each rotation player's usage tendency until his scoring rate
// is his real one, his teammates' shares settling with his, and his three-point tendency until he takes his
// real threes a minute. Then the league's level: everyone's three-point tendency (but those already at
// their real threes) by one factor until the league takes the real league's threes a minute (with the
// ratings' volume trade-off, calibrate.ts VOLUME_TRADE, the best shooters reach their points on fewer
// shots, and the league fell 7-9% short of its threes), and everyone's drawing fouls by the same few
// points until it goes to the line as often as the real one.
import type { SeedData } from '../../src/core/league/create';
import { createLeague, defaultSettings } from '../../src/core/league/create';
import { startRegularSeason, simDay } from '../../src/core/league/season';
import { standardRoster } from '../../src/core/league/helpers';
import { releasePlayer } from '../../src/core/league/contracts';
import { CAP, TARGETS } from '../../src/core/constants';
import { clamp } from '../../src/core/random';
import { THREE_TEND_MAX } from './calibrate';

/** Players fitted: a 2025-26 rotation player (40+ games at 15+ minutes) with 20+ games in the simulated season. */
const MIN_GAMES = 40;
const MIN_MPG = 15;
const SIM_GAMES = 20;
/**
 * Seasons per pass, and each pass's step: the exponent on his real-to-simulated scoring ratio. His
 * scoring answers his tendency sublinearly (his share levels off past K.useLevel, and his teammates
 * give up less as he takes more), so a step goes further than the miss.
 */
const PASSES = [
  { seasons: 2, gain: 1.6 },
  { seasons: 2, gain: 1.3 },
  { seasons: 3, gain: 1 },
  { seasons: 3, gain: 0.8 },
];

/** Points per minute: from the seed's 2025-26 line, and simulated over a pass's seasons. */
interface Rate {
  pts: number;
  min: number;
  gp: number;
  fga: number;
  tpa: number;
  fta: number;
  stl: number;
  blk: number;
}
const ZERO: Rate = { pts: 0, min: 0, gp: 0, fga: 0, tpa: 0, fta: 0, stl: 0, blk: 0 };
const add = (a: Rate, s: Rate): Rate => ({
  pts: a.pts + s.pts,
  min: a.min + s.min,
  gp: a.gp + s.gp,
  fga: a.fga + s.fga,
  tpa: a.tpa + s.tpa,
  fta: a.fta + s.fta,
  stl: a.stl + s.stl,
  blk: a.blk + s.blk,
});
/** Rating points of drawing fouls per unit of log free-throw rate missed (calibrate.ts steps it the same way). */
const DRW_GAIN = 16;

function realRates(seed: SeedData): Map<string, Rate> {
  const out = new Map<string, Rate>();
  for (const p of seed.players) {
    const rows = p.stats.filter((s) => s.real && s.season === seed.season - 1 && !s.playoffs);
    const r = rows.reduce(add, ZERO);
    if (r.gp >= MIN_GAMES && r.min / r.gp >= MIN_MPG) out.set(p.id, r);
  }
  return out;
}

/** One regular season of the seed, played as the app plays it; every seed player's scoring by his id. */
function playSeason(seed: SeedData, rngSeed: number): Map<string, Rate> {
  const league = createLeague({ name: 'usage', userTid: 0, coachName: 'x', settings: defaultSettings(), seed, rngSeed });
  // AI teams cut to 15 at creation, the user's team doesn't: release its lowest-rated standard deals
  const roster = standardRoster(league, 0).sort((a, b) => a.ovr - b.ovr);
  while (standardRoster(league, 0).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
  const errs = startRegularSeason(league);
  if (errs.length) throw new Error(errs.join('; '));
  while (league.phase === 'regular') simDay(league);
  const out = new Map<string, Rate>();
  for (const p of Object.values(league.players)) {
    if (!p.bbrefId) continue;
    const rows = p.stats.filter((s) => s.season === league.season && !s.playoffs);
    out.set(p.bbrefId, rows.reduce(add, ZERO));
  }
  return out;
}

/** The league's threes and free throws a minute in a set of seasons' lines (every player's). */
function leagueRates(lines: Iterable<Rate>) {
  const t = [...lines].reduce(add, ZERO);
  const m = Math.max(1, t.min);
  return { tpa: t.tpa / m, fta: t.fta / m, stl: t.stl / m, blk: t.blk / m };
}

/**
 * How far one pass moves everyone's three-point tendency, as a power of the league's real-to-simulated
 * threes: the league's threes answer the tendency at about 0.4 of its change (the rest goes to the
 * shots the tendency competes with), so a step goes further than the miss.
 */
const THREE_GAIN = 2.2;

/** Fit the seed's usage tendencies to real scoring rates over whole simulated seasons (in place). */
export function tuneStarUsage(seed: SeedData, log = console.log) {
  const real = realRates(seed);
  const byId = new Map(seed.players.map((p) => [p.id, p]));
  // (the real league's rates real-check holds the engine to, a minute: TARGETS is per team game. The seed's own
  // 2025-26 lines go to the line 23.5 times a game, against TARGETS' 21.8)
  const realLeague = { tpa: TARGETS.tpa / 240, fta: TARGETS.fta / 240, stl: TARGETS.stl / 240, blk: TARGETS.blk / 240 };
  let run = 0;
  PASSES.forEach((pass, i) => {
    const sim = new Map<string, Rate>();
    for (let s = 0; s < pass.seasons; s++) for (const [id, r] of playSeason(seed, 7 + run++)) sim.set(id, add(sim.get(id) ?? ZERO, r));
    let n = 0;
    let miss = 0;
    let miss3 = 0;
    // (players at or over their real threes a minute: the league's factor below doesn't lift them)
    const atThrees = new Set<string>();
    for (const [id, r] of real) {
      const p = byId.get(id);
      const s = sim.get(id);
      if (!p?.tend || !s || s.gp < SIM_GAMES * pass.seasons) continue;
      const want = r.pts / r.min;
      const got = s.pts / Math.max(1, s.min);
      n++;
      miss += Math.abs(got - want) * 36;
      p.tend.use = Math.round(clamp(p.tend.use * Math.pow((want + 0.01) / (got + 0.01), pass.gain), 0.1, 25) * 1000) / 1000;
      // his threes a minute: the volume trade-off makes the best shooters a little more accurate than their
      // percentages, so on points alone they reach their scoring on fewer threes than they take
      const want3 = r.tpa / r.min;
      const got3 = s.tpa / Math.max(1, s.min);
      miss3 += Math.abs(got3 - want3) * 36;
      if (got3 >= want3) atThrees.add(id);
      if (r.tpa >= 40) p.tend.three = Math.round(clamp(p.tend.three * Math.pow((want3 + 0.005) / (got3 + 0.005), pass.gain * 0.8), 0.02, THREE_TEND_MAX) * 1000) / 1000;
    }
    // the league's threes and trips to the line: everyone's three-point tendency by the same factor and
    // drawing fouls by the same step, so each player's share and the ratings' order stay as calibrated
    const lg = leagueRates(sim.values());
    const three = clamp(Math.pow(realLeague.tpa / Math.max(1e-4, lg.tpa), THREE_GAIN * pass.gain), 0.85, 1.25);
    const drwStep = clamp(DRW_GAIN * Math.log(realLeague.fta / Math.max(1e-4, lg.fta)) * pass.gain * 0.8, -4, 4);
    // (and the league's steals and blocks, by everyone's tendencies for them: the engine's defense moves
    // with its tactics, and the calibration games play its presets, not a season's)
    const event = (k: 'stl' | 'blk') => clamp(Math.pow(realLeague[k] / Math.max(1e-5, lg[k]), pass.gain * 0.8), 0.92, 1.08);
    const [stl, blk] = [event('stl'), event('blk')];
    for (const p of seed.players) {
      if (p.tend && !(three > 1 && atThrees.has(p.id))) p.tend.three = Math.round(clamp(p.tend.three * three, 0.02, THREE_TEND_MAX) * 1000) / 1000;
      p.ratings.drw = Math.round(clamp(p.ratings.drw + drwStep, 1, 100) * 10) / 10;
      // (within the calibration's bounds, which the game's tendencies keep: playerGen.ts TEND_MODEL)
      if (p.tend?.stl !== undefined) p.tend.stl = Math.round(clamp(p.tend.stl * stl, 0.2, 5) * 1000) / 1000;
      if (p.tend?.blk !== undefined) p.tend.blk = Math.round(clamp(p.tend.blk * blk, 0.15, 6) * 1000) / 1000;
    }
    const pct = (x: number, y: number) => `${x >= y ? '+' : ''}${((x / y - 1) * 100).toFixed(1)}%`;
    log(
      `  season pass ${i + 1}: ${n} players · mean miss ${(miss / Math.max(1, n)).toFixed(2)} points per 36, ${(miss3 / Math.max(1, n)).toFixed(2)} threes per 36; league threes ${pct(lg.tpa, realLeague.tpa)} (tendencies ×${three.toFixed(3)}), free throws ${pct(lg.fta, realLeague.fta)} (drawing fouls ${drwStep >= 0 ? '+' : ''}${drwStep.toFixed(1)}), steals ${pct(lg.stl, realLeague.stl)}, blocks ${pct(lg.blk, realLeague.blk)}`,
    );
  });
}
