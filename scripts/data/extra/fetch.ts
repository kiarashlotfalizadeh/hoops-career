// Downloads the opening-night extras (schedule, pick ownership, injuries, two-way contracts)
// into data/raw/extra/. Usage: npm run data:fetch-extra [-- --force] [-- --only injuries] [-- --strict]
// With --strict (the seed workflow), a required source that can't be downloaded fails the run
// instead of leaving that part of the seed as it was.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { EXTRA_FILES, EXTRA_RAW, extraPath } from './sources';

async function download(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // a stalled connection fails and retries instead of hanging the run
      const res = await fetch(url, { signal: AbortSignal.timeout(2 * 60_000), headers: { 'User-Agent': 'hoops-career seed builder' } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      console.log(`HTTP ${res.status}`);
      if (res.status < 500) return null;
    } catch (e) {
      console.warn(`network error (${(e as Error).message}), retrying`);
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  return null;
}

async function main() {
  const force = process.argv.includes('--force');
  const strict = process.argv.includes('--strict');
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;
  mkdirSync(EXTRA_RAW, { recursive: true });
  const missing: string[] = [];
  const stale: string[] = [];
  for (const f of EXTRA_FILES.filter((x) => !only || x.key.includes(only))) {
    const file = extraPath(f.key);
    if (!force && existsSync(file) && statSync(file).size > 1000) continue;
    process.stdout.write(`GET ${f.what}: ${f.url} ... `);
    const buf = await download(f.url);
    if (buf && buf.length > 1000) {
      writeFileSync(file, buf);
      console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
    } else {
      console.log(f.optional ? 'skipped' : 'FAILED');
      if (f.optional) continue;
      // a failed --force re-download leaves the copy already cached in use
      if (existsSync(file) && statSync(file).size > 1000) stale.push(f.key);
      else missing.push(f.key);
    }
  }
  if (stale.length) console.warn(`Could not re-download ${stale.join(', ')}; the cached copy is used.`);
  // the seed builds without these, so a failure only warns unless --strict
  if (missing.length) {
    console.warn(`Could not download ${missing.join(', ')}: npm run data:extras keeps the seed's current version of those parts, npm run data:build uses generated data.`);
    if (strict) process.exit(1);
  }
  console.log(`Done; cache at ${EXTRA_RAW}`);
}

if (process.argv[1]?.endsWith('fetch.ts')) void main();
