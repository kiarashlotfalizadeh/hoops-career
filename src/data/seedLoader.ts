import type { SeedData } from '../core/league/create';
import type { HistoryData } from '../core/league/media/past';
import type { RecordsData } from '../core/league/records';

let cache: Promise<SeedData> | null = null;

/** Lazily load the Basketball Reference seed (code-split so the shell loads fast). */
export function loadSeed(): Promise<SeedData> {
  // a failed load (offline, or a chunk replaced by a new deploy) is retried next time instead of failing for good
  // (with the NBA's past beside it: its Finals, MVPs and the players' real honours, see media/past.ts,
  // and the record book's single games since 1996-97, see records.ts)
  cache ??= Promise.all([import('./seed.json'), import('./history.json'), import('./records.json')]).then(
    ([m, h, r]) => ({
      ...((m.default ?? m) as unknown as SeedData),
      history: { ...((h.default ?? h) as unknown as HistoryData), records: (r.default ?? r) as unknown as RecordsData },
    }),
    (e) => {
      cache = null;
      throw e;
    },
  );
  return cache;
}
