import type { SeedData } from '../core/league/create';

let cache: Promise<SeedData> | null = null;

/** Lazily load the Basketball Reference seed (code-split so the shell loads fast). */
export function loadSeed(): Promise<SeedData> {
  // a failed load (offline, or a chunk replaced by a new deploy) is retried next time instead of failing for good
  cache ??= import('./seed.json').then(
    (m) => (m.default ?? m) as unknown as SeedData,
    (e) => {
      cache = null;
      throw e;
    },
  );
  return cache;
}
