// Polite fetcher for Basketball Reference pages (they rate-limit at ~20 requests/minute).
// Pages are cached in data/raw/ so re-runs only fetch what's missing; --refresh also re-fetches
// the ones that change through the offseason (contracts, current rosters).
// Usage: npm run data:fetch [-- --force] [-- --refresh] [-- --only per_game]
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { allSources } from './sources';

const RAW = process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw');
const force = process.argv.includes('--force');
const refresh = process.argv.includes('--refresh');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;
const DELAY_MS = 3700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry-After as seconds or an HTTP date; 60 s when missing or unreadable. */
function retryAfterMs(header: string | null): number {
  if (header && /^\d+$/.test(header.trim())) return Number(header) * 1000;
  const at = header ? Date.parse(header) : NaN;
  return Number.isNaN(at) ? 60_000 : at - Date.now();
}

async function get(url: string): Promise<{ status: number; body: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        // a stalled connection would otherwise hang the run until the CI job times out
        signal: AbortSignal.timeout(60_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (hoops-career seed builder; personal, non-commercial; polite 1 req/3.7s)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.status === 429) {
        const wait = Math.max(retryAfterMs(res.headers.get('retry-after')), 60_000);
        // a longer ban (Basketball Reference's lasts an hour) would outlast the run: give up now
        if (wait > 5 * 60_000) break;
        console.warn(`429 rate limited, waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
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
    if (!force && !(refresh && s.volatile) && existsSync(file) && statSync(file).size > 5000) continue;
    if (fetched > 0) await sleep(DELAY_MS);
    process.stdout.write(`GET ${s.url} ... `);
    const { status, body } = await get(s.url);
    fetched++;
    if (status === 200 && body.length > 5000) {
      writeFileSync(file, body);
      console.log(`ok (${(body.length / 1024).toFixed(0)} KB)`);
    } else if (status === 0) {
      // out of retries (still rate limited, or unreachable), optional page or not: stop now, so a CI
      // run archives the pages that did arrive instead of timing out on the rest
      console.log('FAILED');
      console.error(
        '\nCould not reach basketball-reference.com, or it is still rate limiting: the pages fetched so far are cached, so run again later. If you are in a sandboxed environment, allow the domain in its network settings.',
      );
      process.exit(1);
    } else if (s.optional) {
      console.log(`skipped (HTTP ${status})`);
    } else {
      console.log(`FAILED (HTTP ${status})`);
      if (status === 403) {
        console.error('\nCould not reach basketball-reference.com. If you are in a sandboxed environment, allow the domain in its network settings.');
        process.exit(1);
      }
    }
  }
  console.log(`Done. ${fetched} request(s) made; cache at ${RAW}`);
}

void main();
