// Downloads the NBA.com play-by-play / matchup archives and college stats into data/raw/nba/.
// Usage: npm run data:fetch-nba [-- --force]
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nbaFiles } from './sources';

// follows HC_RAW_DIR (the offline fixture build) unless HC_NBA_DIR says otherwise
export const NBA_RAW = process.env.HC_NBA_DIR ?? join(process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw'), 'nba');

async function main() {
  const force = process.argv.includes('--force');
  mkdirSync(NBA_RAW, { recursive: true });
  for (const f of nbaFiles()) {
    const file = join(NBA_RAW, f.key);
    if (!force && existsSync(file) && statSync(file).size > 10_000) continue;
    process.stdout.write(`GET ${f.url} ... `);
    let ok = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        // archives run to tens of MB: generous, but a stalled download still fails and retries
        const res = await fetch(f.url, { signal: AbortSignal.timeout(5 * 60_000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(file, buf);
          console.log(`ok (${(buf.length / 1e6).toFixed(1)} MB)`);
          ok = true;
          break;
        }
        console.log(`HTTP ${res.status}`);
        // server errors are often brief: retry those
        if (res.status < 500) break;
      } catch (e) {
        console.warn(`network error (${(e as Error).message}), retrying`);
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
    if (!ok && f.kind !== 'college') {
      console.error(`Could not download ${f.url}`);
      process.exit(1);
    }
  }
  console.log(`Done; cache at ${NBA_RAW}`);
}

if (process.argv[1]?.endsWith('fetch.ts')) void main();
