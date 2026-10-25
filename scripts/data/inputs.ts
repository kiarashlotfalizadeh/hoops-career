// Every file the seed is built from, pinned by content (data/seed-inputs.json): the game files (box
// scores and play-by-play), the Basketball Reference pages, the NBA.com matchup and college archives
// and the opening-night extras. data:build checks its inputs against the pins before it starts and fails on any
// file added, changed or missing, so a rebuild from the pinned files reproduces the seed exactly (the
// build is deterministic: seeded simulations, no clock). New inputs (a refetch, new game files)
// are taken on purpose: `npm run data:build -- --update-lock` pins what is there and builds from it.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface InputLock {
  season: number;
  /** When the inputs were pinned (the seed's `generated`). */
  pinned: string;
  /** Path (under its root's name) → SHA-256 of the file. */
  files: Record<string, string>;
}

/** The lock: data/seed-inputs.json, or seed-inputs.json inside HC_RAW_DIR for an offline fixture build. */
export const LOCK_PATH = process.env.HC_INPUT_LOCK ?? (process.env.HC_RAW_DIR ? join(process.env.HC_RAW_DIR, 'seed-inputs.json') : join(process.cwd(), 'data', 'seed-inputs.json'));

/** What the build writes next to its inputs (parsed caches, the profile kept for inspection), and the lock itself: not inputs. */
const NOT_INPUT = /^matchups_\d+\.json$|^cache_.+\.json$|^nba_profile\.json$|^seed-inputs\.json$|^\.DS_Store$/;

/** Each file under each root, as `${root name}/${path}` → its SHA-256 (a root nested in another is listed once, under its own name). */
export function hashInputs(roots: Record<string, string>): Record<string, string> {
  const dirs = new Map(Object.entries(roots).map(([name, dir]) => [resolve(dir), name]));
  const out: Record<string, string> = {};
  const walk = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) {
      const path = join(dir, f);
      if (statSync(path).isDirectory()) {
        if (!dirs.has(resolve(path))) walk(path, `${prefix}${f}/`);
      } else if (!NOT_INPUT.test(f)) out[`${prefix}${f}`] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  };
  for (const [dir, name] of dirs) walk(dir, `${name}/`);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** One hash for a set of pinned files: the seed records it, so a seed says exactly what it was built from. */
export const inputsId = (files: Record<string, string>) =>
  createHash('sha256')
    .update(
      Object.entries(files)
        .map(([k, v]) => `${k} ${v}`)
        .join('\n'),
    )
    .digest('hex')
    .slice(0, 16);

/** Files added, changed or missing against the lock. */
export function diffInputs(lock: Record<string, string>, now: Record<string, string>) {
  return {
    added: Object.keys(now).filter((k) => !(k in lock)),
    changed: Object.keys(now).filter((k) => k in lock && lock[k] !== now[k]),
    missing: Object.keys(lock).filter((k) => !(k in now)),
  };
}

/**
 * Check the inputs against the lock (or, with `update`, pin them, dated `today`) and return the
 * pins. Throws when there is no lock or the inputs differ from it, naming the files.
 */
export function pinInputs(roots: Record<string, string>, season: number, opts: { update: boolean; today: () => string; lockPath?: string }): InputLock & { id: string } {
  const path = opts.lockPath ?? LOCK_PATH;
  const files = hashInputs(roots);
  if (opts.update) {
    const lock: InputLock = { season, pinned: opts.today(), files };
    writeFileSync(path, `${JSON.stringify(lock, null, 1)}\n`);
    return { ...lock, id: inputsId(files) };
  }
  if (!existsSync(path)) throw new Error(`No input lock at ${path}: \`npm run data:build -- --update-lock\` pins the inputs there now and builds from them.`);
  const lock = JSON.parse(readFileSync(path, 'utf8')) as InputLock;
  const d = diffInputs(lock.files, files);
  const list = (label: string, ks: string[]) => (ks.length ? [`${label} (${ks.length}): ${ks.slice(0, 12).join(', ')}${ks.length > 12 ? ', …' : ''}`] : []);
  const problems = [
    ...(lock.season !== season ? [`pinned for season ${lock.season}, building ${season}`] : []),
    ...list('changed', d.changed),
    ...list('missing', d.missing),
    ...list('added', d.added),
  ];
  if (problems.length)
    throw new Error(
      `The inputs differ from the ones pinned in ${path} on ${lock.pinned}:\n  ${problems.join('\n  ')}\nRestore the pinned files to reproduce the seed, or build from these with \`npm run data:build -- --update-lock\`.`,
    );
  return { ...lock, id: inputsId(files) };
}
