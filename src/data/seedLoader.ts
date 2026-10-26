import type { SeedData } from '../core/league/create';
import type { HistoryData } from '../core/league/media/past';

let cache: Promise<SeedData> | null = null;

/** Lazily load the Basketball Reference seed (code-split so the shell loads fast). */
export function loadSeed(): Promise<SeedData> {
  // a failed load (offline, or a chunk replaced by a new deploy) is retried next time instead of failing for good
  // (with the NBA's past beside it: its Finals, MVPs and the players' real honours, see media/past.ts)
  cache ??= Promise.all([import('./seed.json'), import('./history.json')]).then(
    ([m, h]) => ({ ...((m.default ?? m) as unknown as SeedData), history: (h.default ?? h) as unknown as HistoryData }),
    (e) => {
      cache = null;
      throw e;
    },
  );
  return cache;
}
