// Downloads the opening-night extras (schedule, pick ownership, injuries, two-way contracts)
// into data/raw/extra/. Usage: npm run data:fetch-extra [-- --force] [-- --only injuries]
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
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;
  mkdirSync(EXTRA_RAW, { recursive: true });
  let failed = 0;
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
      if (!f.optional) failed++;
    }
  }
  // the seed builds without these (it falls back to generated data), so a failure only warns
  if (failed) console.warn(`${failed} extra source(s) could not be downloaded; the seed will fall back to generated data for them.`);
  console.log(`Done; cache at ${EXTRA_RAW}`);
}

if (process.argv[1]?.endsWith('fetch.ts')) void main();
