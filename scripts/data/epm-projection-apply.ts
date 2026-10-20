// Apply the Dunks & Threes EPM projection (data/epm/projection/) to src/data/seed.json: the box
// line, impact ratings, OVR level and stamina of every player it lists (epm-projection.ts says how).
// Needs only the seed and the export. A seed that already took this season's projection is left
// alone: it moves ratings rather than deriving them, so applying it twice would move them twice.
// Usage: npm run data:epm-projection
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyProjection, loadProjection, projectionNote } from './epm-projection';
import type { SeedData } from '../../src/core/league/create';

const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');

function main() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  if (seed.source.includes(projectionNote(seed.season))) {
    console.log(`${OUT} already has the ${projectionNote(seed.season)}; nothing to do.`);
    return;
  }
  const rows = loadProjection(seed.season);
  if (!rows.length) process.exit(1);
  const rep = applyProjection(seed, rows);
  const name = (m: { sp: { first: string; last: string } }) => `${m.sp.first} ${m.sp.last}`;
  console.log(`Projection applied to ${rep.matched} players (${rep.rookies} without a real line to compare: rookies and short samples)`);
  console.log(`  OVR vs projected EPM (15+ projected minutes): r ${rep.r[0].toFixed(3)} → ${rep.r[1].toFixed(3)}`);
  const moves = [...rep.moves].filter((m) => m.sp.team).sort((a, b) => b.after - b.before - (a.after - a.before));
  const show = (list: typeof moves) => list.map((m) => `${name(m)} ${m.before}→${m.after} (${m.p.tot > 0 ? '+' : ''}${m.p.tot.toFixed(1)})`).join(', ');
  console.log(`  OVR up most: ${show(moves.slice(0, 10))}`);
  console.log(`  OVR down most: ${show(moves.slice(-10).reverse())}`);
  console.log(
    `  top 15 by OVR: ${[...rep.moves]
      .sort((a, b) => b.after - a.after)
      .slice(0, 15)
      .map((m) => `${name(m)} ${m.after}`)
      .join(', ')}`,
  );
  if (rep.teamDiffs.length) console.log(`  projected elsewhere (rosters unchanged): ${rep.teamDiffs.map((d) => `${name(d)} ${d.sp.team ?? 'FA'} → ${d.p.team}`).join(', ')}`);
  if (rep.unlisted.length) console.log(`  rostered but not projected (OVR kept): ${rep.unlisted.map((sp) => `${sp.first} ${sp.last}`).join(', ')}`);
  const json = JSON.stringify(seed);
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT} (${(json.length / 1e6).toFixed(2)} MB)`);
}

main();
