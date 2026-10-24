// Scoring in a real season: the last step of the calibration. calibrate.ts fits each player's
// usage per 36 minutes in games of its own (two roster contexts, the coaches' presets, nobody hurt
// or worn down), and in a season played the way the app plays it the shots split differently: the
// real league's top scorers came in 2-7 points a game under their 2025-26 lines (Jokić 23-25 for
// 27.7, Brown 20-22 for 28.7, Wembanyama 18-19 for 25.0) while bigs who finish what the stars give
// up scored far over theirs (Mobley 28 for 18, Holmgren 23 for 17). This plays whole regular seasons
// of the seed as the app would and moves each rotation player's usage tendency until his scoring rate
// is his real one, his teammates' shares settling with his.
import type { SeedData } from '../../src/core/league/create';
import { createLeague, defaultSettings } from '../../src/core/league/create';
import { startRegularSeason, simDay } from '../../src/core/league/season';
import { standardRoster } from '../../src/core/league/helpers';
import { releasePlayer } from '../../src/core/league/contracts';
import { CAP } from '../../src/core/constants';
import { clamp } from '../../src/core/random';

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
}

function realRates(seed: SeedData): Map<string, Rate> {
  const out = new Map<string, Rate>();
  for (const p of seed.players) {
    const rows = p.stats.filter((s) => s.real && s.season === seed.season - 1 && !s.playoffs);
    const r = rows.reduce((a, s) => ({ pts: a.pts + s.pts, min: a.min + s.min, gp: a.gp + s.gp }), { pts: 0, min: 0, gp: 0 });
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
    out.set(
      p.bbrefId,
      rows.reduce((a, s) => ({ pts: a.pts + s.pts, min: a.min + s.min, gp: a.gp + s.gp }), { pts: 0, min: 0, gp: 0 }),
    );
  }
  return out;
}

/** Fit the seed's usage tendencies to real scoring rates over whole simulated seasons (in place). */
export function tuneStarUsage(seed: SeedData, log = console.log) {
  const real = realRates(seed);
  const byId = new Map(seed.players.map((p) => [p.id, p]));
  let run = 0;
  PASSES.forEach((pass, i) => {
    const sim = new Map<string, Rate>();
    for (let s = 0; s < pass.seasons; s++)
      for (const [id, r] of playSeason(seed, 7 + run++)) {
        const a = sim.get(id) ?? { pts: 0, min: 0, gp: 0 };
        sim.set(id, { pts: a.pts + r.pts, min: a.min + r.min, gp: a.gp + r.gp });
      }
    let n = 0;
    let miss = 0;
    for (const [id, r] of real) {
      const p = byId.get(id);
      const s = sim.get(id);
      if (!p?.tend || !s || s.gp < SIM_GAMES * pass.seasons) continue;
      const want = r.pts / r.min;
      const got = s.pts / Math.max(1, s.min);
      n++;
      miss += Math.abs(got - want) * 36;
      p.tend.use = Math.round(clamp(p.tend.use * Math.pow((want + 0.01) / (got + 0.01), pass.gain), 0.1, 25) * 1000) / 1000;
    }
    log(`  season pass ${i + 1}: ${n} players · mean miss ${(miss / Math.max(1, n)).toFixed(2)} points per 36`);
  });
}
