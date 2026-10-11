// Downloads the NBA.com play-by-play / matchup archives and college stats into data/raw/nba/.
// Usage: npm run data:fetch-nba [-- --force]
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nbaFiles } from './sources';

export const NBA_RAW = join(process.cwd(), 'data', 'raw', 'nba');

async function main() {
  const force = process.argv.includes('--force');
  mkdirSync(NBA_RAW, { recursive: true });
  for (const f of nbaFiles()) {
    const file = join(NBA_RAW, f.key);
    if (!force && existsSync(file) && statSync(file).size > 10_000) continue;
    process.stdout.write(`GET ${f.url} ... `);
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const res = await fetch(f.url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(file, buf);
          console.log(`ok (${(buf.length / 1e6).toFixed(1)} MB)`);
          ok = true;
        } else {
          console.log(`HTTP ${res.status}`);
          break;
        }
      } catch (e) {
        console.warn(`network error (${(e as Error).message}), retrying`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
    if (!ok && f.kind !== 'college') {
      console.error(`Could not download ${f.url}`);
      process.exit(1);
    }
  }
  console.log(`Done; cache at ${NBA_RAW}`);
}

if (process.argv[1]?.endsWith('fetch.ts')) void main();
