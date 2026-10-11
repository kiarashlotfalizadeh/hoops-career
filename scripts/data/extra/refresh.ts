// Refresh the opening-night extras (schedule, pick ownership, injuries, two-way contracts) in
// an existing src/data/seed.json without re-running the ratings pipeline.
// Usage: npm run data:fetch-extra -- --force && npm run data:extras
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedData } from '../../../src/core/league/create';
import { applyExtras } from './index';

const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');

async function main() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  await applyExtras(seed);
  writeFileSync(OUT, JSON.stringify(seed));
  console.log(`wrote ${OUT} (${(JSON.stringify(seed).length / 1e6).toFixed(2)} MB)`);
}

void main();
