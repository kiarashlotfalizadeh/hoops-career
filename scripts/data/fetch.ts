// Polite fetcher for Basketball Reference pages (they rate-limit at ~20 requests/minute).
// Pages are cached in data/raw/ so re-runs only fetch what's missing.
// Usage: npm run data:fetch [-- --force] [-- --only per_game]
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { allSources } from './sources';

const RAW = join(process.cwd(), 'data', 'raw');
const force = process.argv.includes('--force');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;
const DELAY_MS = 3700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<{ status: number; body: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (hoops-career seed builder; personal, non-commercial; polite 1 req/3.7s)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after') ?? '60') * 1000;
        console.warn(`429 rate limited, waiting ${wait / 1000}s`);
        await sleep(Math.max(wait, 60_000));
        continue;
      }
      if (res.status >= 500) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      return { status: res.status, body: await res.text() };
    } catch (e) {
      console.warn(`network error (${(e as Error).message}), retrying`);
      await sleep(2000 * 2 ** attempt);
    }
  }
  return { status: 0, body: '' };
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  const sources = allSources().filter((s) => !only || s.key.includes(only));
  let fetched = 0;
  for (const s of sources) {
    const file = join(RAW, `${s.key}.html`);
    if (!force && existsSync(file) && statSync(file).size > 5000) continue;
    if (fetched > 0) await sleep(DELAY_MS);
    process.stdout.write(`GET ${s.url} ... `);
    const { status, body } = await get(s.url);
    fetched++;
    if (status === 200 && body.length > 5000) {
      writeFileSync(file, body);
      console.log(`ok (${(body.length / 1024).toFixed(0)} KB)`);
    } else if (s.optional) {
      console.log(`skipped (HTTP ${status})`);
    } else {
      console.log(`FAILED (HTTP ${status})`);
      if (status === 0 || status === 403) {
        console.error('\nCould not reach basketball-reference.com. If you are in a sandboxed environment, allow the domain in its network settings.');
        process.exit(1);
      }
    }
  }
  console.log(`Done. ${fetched} request(s) made; cache at ${RAW}`);
}

void main();
