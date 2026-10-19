// Apply the seasons before the stat seasons (back to 2003-04) to an existing src/data/seed.json built
// without them, without rebuilding it: each player's real seasons get his career before them and his
// numbers at franchises he has left, as data:build now writes them (careers.ts), and a player the
// seed has no draft for gets his from the draft pages now cached (LeBron James's 2003). Nothing else
// moves: history never reaches the ratings, so the seed stays as calibrated. A seed that already has
// careers is left alone: rebuild it with data:build.
// Needs the Basketball Reference pages data:fetch caches (no NBA.com data).
// Usage: npm run data:history
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRAFT_YEARS, FIRST_SEASON, HISTORY_SEASONS, STAT_SEASONS, SEED_SEASON } from './sources';
import { parseDraft, parseRoster, seedDraft, type DraftRow, type RosterRow } from './parse';
import { byId, formerNumbers, historyLines, loadSeasons } from './careers';
import { seasonLabel } from '../../src/core/constants';
import type { SeedData } from '../../src/core/league/create';

const RAW = process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw');
const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');
const read = (key: string) => {
  const f = join(RAW, `${key}.html`);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};

function main() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  if (seed.careersFrom !== undefined) {
    console.log(`${OUT} already has careers from ${seasonLabel(seed.careersFrom)}; rebuild it with npm run data:build to take new pages in.`);
    return;
  }
  const history = loadSeasons(read, HISTORY_SEASONS);
  const recent = loadSeasons(read, STAT_SEASONS);
  const missing = [...history.missing, ...recent.missing];
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in ${RAW}. Run \`npm run data:fetch\` first.`);
    process.exit(1);
  }
  const histById = byId(history.perGame);
  const histAdvById = byId(history.adv);
  const recentById = byId(recent.perGame);
  const pages = new Map<string, RosterRow[]>();
  const rosterRow = (id: string, team: string, season: number) => {
    const key = `roster_${team}_${season}`;
    if (!pages.has(key)) {
      const html = read(key);
      pages.set(key, html ? parseRoster(html, team, season) : []);
    }
    return pages.get(key)!.find((r) => r.id === id);
  };
  const drafts = new Map<string, DraftRow>();
  for (const y of DRAFT_YEARS) {
    const html = read(`draft_${y}`);
    if (html) for (const d of parseDraft(html, y)) drafts.set(d.id, d);
  }

  let withHistory = 0;
  let lines = 0;
  const numbered: string[] = [];
  const drafted: string[] = [];
  for (const sp of seed.players) {
    const past = histById.get(sp.id) ?? [];
    const before = historyLines(past, histAdvById.get(sp.id) ?? []);
    if (before.length) withHistory++;
    lines += before.length;
    sp.stats = [...before, ...sp.stats];
    const jerseys = formerNumbers([...past, ...(recentById.get(sp.id) ?? [])], sp.team, (team, season) => rosterRow(sp.id, team, season));
    if (Object.keys(jerseys).length) {
      sp.jerseys = jerseys;
      numbered.push(
        `${sp.first} ${sp.last} ${Object.entries(jerseys)
          .map(([t, j]) => `${t} #${j}`)
          .join(', ')}`,
      );
    }
    // the build takes a draft row over everything else
    const dr = drafts.get(sp.id);
    if (dr && !sp.draft?.round) {
      sp.draft = seedDraft(dr, undefined);
      drafted.push(`${sp.first} ${sp.last} (${dr.year})`);
    }
  }
  seed.careersFrom = FIRST_SEASON;
  seed.source = seed.source.replace(
    /^Basketball Reference: [^;]*;/,
    `Basketball Reference: ${seasonLabel(FIRST_SEASON)} to ${seasonLabel(SEED_SEASON - 1)} per-game & advanced (ratings from ${seasonLabel(STAT_SEASONS[0])});`,
  );
  console.log(`careers: ${lines} seasons before ${seasonLabel(STAT_SEASONS[0])} for ${withHistory} players`);
  console.log(`numbers at former franchises for ${numbered.length}: ${numbered.join('; ')}`);
  if (drafted.length) console.log(`drafts now on record: ${drafted.join(', ')}`);
  const json = JSON.stringify(seed);
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT} (${(json.length / 1e6).toFixed(2)} MB)`);
}

main();
