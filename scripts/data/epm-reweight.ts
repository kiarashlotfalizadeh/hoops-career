// Move an existing src/data/seed.json from the EPM blend its impact ratings were derived at to the
// one derive.ts uses now (EPM_BLEND), without a rebuild: the committed seed can't be rebuilt without
// the raw pages (data/raw is not committed), and this needs only the seed and the EPM exports in
// data/epm/.
//
// A derived impact rating is its base plus a scale k times its terms, EPM's a weight times its z-score
// (see EpmBlend in derive.ts), so a player derived with the new blend differs from the same player
// derived with the old one by exactly the change of scale on his rating's distance from its base plus
// the new scale times the change in weight times his z-score, in each impact rating, shrunk as the
// build blends a sample under 400 minutes with its prior (reweightShift in epm.ts). The z-scores are taken as derive.ts takes them: his recency- and
// minutes-weighted EPM over the stat seasons (aggregateEpm), against the same population (the seed's
// players with 500+ minutes, weighted by the square root of their weighted minutes: moments, as
// popStats does) and regressed by the same reliability (weighted minutes / (weighted minutes + 500)).
// Minutes come from the seed's own lines for the stat seasons (one per team, totals rounded to the
// minute, where the build read Basketball Reference's combined row), so a z-score can differ from the
// build's in the third decimal. Players derived without the NBA.com play-by-play (none with EPM in the
// current seed) read EPM in all four impact ratings at weights that haven't changed.
//
// Calibration never touches the impact ratings, so the moved players' other ratings stay as
// calibrated. The players it doesn't move (rookies and others without an NBA sample or EPM) keep their
// OVR: the build levels them to a target from their draft slot, reputation or college production, a
// display OVR, which EPM never enters; as the players around them move, the display scale moves under
// them, so their skills are shifted together until they show the OVR they had, as the build's leveling
// does (they aren't calibrated players). What a rebuild would do besides is not redone here: calibrate
// the shooting ratings around the new impact ratings, and level the moved players again (which shrinks
// a short sample's OVR toward the level of his minutes per game, by minutes / (minutes + 500)).
//
// The seed's `source` records the blend (`Dunks & Threes EPM (impact weights oiq 10, ...; scale ...)`;
// a seed that took EPM before it did was derived at EPM_BLEND_V1), so applying this twice changes nothing,
// and it refuses a seed whose EPM seasons no longer match the exports (rebuild that one instead).
// Usage: npm run data:epm-reweight
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAT_SEASONS } from './sources';
import { EPM_BLEND, POP_MIN, SEASON_WEIGHT, moments, reliability, zScore, type EpmBlend } from './derive';
import { aggregateEpm, epmByBbref, epmFields, epmSourceNote, loadEpm, matchEpm, reweightShift, seedEpmBlend, withEpmNote, type EpmAgg } from './epm';
import { buildOvrScale, clampRatings, ovrRaw, shiftToOvr, toDisplay } from '../../src/core/ratings';
import { FRANCHISES } from '../../src/core/teams';
import type { SeedData, SeedPlayer } from '../../src/core/league/create';
import type { Ratings } from '../../src/core/types';

const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');

/** A seed player's minutes over the stat seasons: raw, and weighted by recency as aggregate() weights them. */
function seedMinutes(sp: SeedPlayer): { rawMin: number; wMin: number } {
  let rawMin = 0;
  let wMin = 0;
  for (const s of sp.stats) {
    if (!s.real || s.playoffs || !STAT_SEASONS.includes(s.season)) continue;
    rawMin += s.min;
    wMin += s.min * (SEASON_WEIGHT[s.season] ?? 0.2);
  }
  return { rawMin, wMin };
}

const same = (a: EpmBlend, b: EpmBlend) => epmSourceNote(a) === epmSourceNote(b);
const fmt = (b: EpmBlend) => epmSourceNote(b).replace('Dunks & Threes EPM ', '');
/** The display scale as the build's leveling sees it: the seed's players with a team. */
const scaleOf = (players: SeedPlayer[]) => buildOvrScale(players.filter((p) => p.team).map((p) => ovrRaw(p.ratings)));

function pearson(x: number[], y: number[]) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

function main() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  const from = seedEpmBlend(seed.source);
  if (!from) {
    console.error(`${OUT} has no EPM: apply it with npm run data:epm (or rebuild with data:build).`);
    process.exit(1);
  }
  if (same(from, EPM_BLEND)) {
    console.log(`${OUT} is already at the EPM blend ${fmt(EPM_BLEND)}; nothing to do.`);
    return;
  }
  const rows = loadEpm();
  if (!rows.length) process.exit(1);

  // match the exports to the seed's players as the build did: the NBA.com id the play-by-play gave
  // him, else name and team (each stat season's line under its team's Basketball Reference code)
  const known = new Map<number, string>(seed.players.flatMap((sp) => (sp.nbaId ? [[sp.nbaId, sp.id] as [number, string]] : [])));
  const bbref = seed.players.flatMap((sp) =>
    sp.stats
      .filter((s) => s.real && STAT_SEASONS.includes(s.season) && FRANCHISES[s.tid])
      .map((s) => ({ id: sp.id, name: `${sp.first} ${sp.last}`.trim(), season: s.season, team: FRANCHISES[s.tid].bbref })),
  );
  const epmById = epmByBbref(rows, matchEpm(rows, bbref, known));

  // the seed's EPM seasons must be the exports' (else its ratings were derived from other numbers)
  const drift: string[] = [];
  for (const sp of seed.players) {
    const seasons = epmById.get(sp.id);
    for (const s of sp.stats) {
      if (!s.real || !STAT_SEASONS.includes(s.season)) continue;
      const e = seasons?.get(s.season);
      const want = e ? epmFields(e) : undefined;
      const has = s.adv?.epm !== undefined;
      if (!!want !== has || (want && (want.oepm !== s.adv!.oepm || want.depm !== s.adv!.depm))) drift.push(`${sp.first} ${sp.last} ${s.season}`);
    }
  }
  if (drift.length) {
    const list = [...new Set(drift)];
    console.error(`The EPM exports no longer match the seed's EPM seasons (${list.slice(0, 8).join(', ')}${list.length > 8 ? '…' : ''}): rebuild with npm run data:build.`);
    process.exit(1);
  }

  const ins = seed.players.map((sp) => ({ sp, ...seedMinutes(sp), epm: aggregateEpm([...(epmById.get(sp.id)?.values() ?? [])]) as EpmAgg | undefined }));
  const pop = moments(ins.filter((p) => p.rawMin >= POP_MIN).map((p) => ({ f: { epmO: p.epm?.off ?? NaN, epmD: p.epm?.def ?? NaN }, w: Math.sqrt(p.wMin) })));
  console.log(
    `EPM population (${ins.filter((p) => p.rawMin >= POP_MIN && p.epm).length} players, ${POP_MIN}+ minutes): offense ${pop.mean.epmO.toFixed(2)} ± ${pop.sd.epmO.toFixed(2)}, defense ${pop.mean.epmD.toFixed(2)} ± ${pop.sd.epmD.toFixed(2)}`,
  );

  const before = scaleOf(seed.players);
  const ovrBefore = new Map(seed.players.map((sp) => [sp.id, toDisplay(ovrRaw(sp.ratings), before)]));

  const moved = new Set<string>();
  const big: string[] = [];
  for (const p of ins) {
    // derived with the play-by-play: an NBA.com profile (the seed's nbaId) with 60+ weighted minutes
    if (!p.epm || !p.sp.nbaId || p.wMin < 60) continue;
    const rel = reliability(p.wMin);
    const z = { off: zScore(p.epm.off, pop.mean.epmO, pop.sd.epmO, rel), def: zScore(p.epm.def, pop.mean.epmD, pop.sd.epmD, rel) };
    const r0 = p.sp.ratings;
    const d = reweightShift({ oiq: r0.oiq, diq: r0.diq, perD: r0.perD, intD: r0.intD }, z, p.rawMin, from, EPM_BLEND);
    if (!Object.keys(d).length) continue;
    const r = { ...p.sp.ratings };
    for (const [k, v] of Object.entries(d)) r[k as keyof Ratings] += v;
    // clamped and rounded to 0.1 like every rating the build writes
    p.sp.ratings = clampRatings(r);
    moved.add(p.sp.id);
    if (Object.values(d).some((v) => Math.abs(v) >= 12))
      big.push(
        `${p.sp.first} ${p.sp.last} (${Object.entries(d)
          .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v.toFixed(1)}`)
          .join(', ')})`,
      );
  }

  // the players it didn't move keep the OVR the build leveled them to (three passes, as levelPlayers)
  const held = seed.players.filter((sp) => !moved.has(sp.id));
  let still = 0;
  for (let pass = 0; pass < 3; pass++) {
    const scale = scaleOf(seed.players);
    still = 0;
    for (const sp of held) {
      const t = ovrBefore.get(sp.id)!;
      if (toDisplay(ovrRaw(sp.ratings), scale) === t) continue;
      sp.ratings = shiftToOvr(sp.ratings, t, scale);
      still++;
    }
  }
  seed.source = withEpmNote(seed.source, EPM_BLEND);

  const after = scaleOf(seed.players);
  const rated = ins.filter((p) => p.epm && p.rawMin >= 1500);
  const corr = (ovr: (sp: SeedPlayer) => number) =>
    pearson(
      rated.map((p) => ovr(p.sp)),
      rated.map((p) => p.epm!.tot),
    ).toFixed(3);
  console.log(`EPM blend ${fmt(from)} → ${fmt(EPM_BLEND)}: impact ratings moved for ${moved.size} players`);
  console.log(`  ${held.length} players without a move keep their OVR (${still} still a point off after the last pass)`);
  console.log(
    `  OVR vs three-season EPM (${rated.length} players, 1,500+ minutes): r ${corr((sp) => ovrBefore.get(sp.id)!)} → ${corr((sp) => toDisplay(ovrRaw(sp.ratings), after))}`,
  );
  if (big.length) console.log(`  moves of 12 or more: ${big.join('; ')}`);
  const movers = seed.players
    .filter((sp) => sp.team)
    .map((sp) => ({ n: `${sp.first} ${sp.last}`, a: ovrBefore.get(sp.id)!, b: toDisplay(ovrRaw(sp.ratings), after) }))
    .sort((x, y) => y.b - y.a - (x.b - x.a));
  const show = (list: typeof movers) => list.map((m) => `${m.n} ${m.a}→${m.b}`).join(', ');
  console.log(`  OVR up most: ${show(movers.slice(0, 8))}`);
  console.log(`  OVR down most: ${show(movers.slice(-8).reverse())}`);
  const json = JSON.stringify(seed);
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT} (${(json.length / 1e6).toFixed(2)} MB)`);
}

main();
