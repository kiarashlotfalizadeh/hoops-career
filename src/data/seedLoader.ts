import type { SeedData } from '../core/league/create';

let cache: Promise<SeedData> | null = null;

/** Lazily load the Basketball Reference seed (code-split so the shell loads fast). */
export function loadSeed(): Promise<SeedData> {
  if (!cache) cache = import('./seed.json').then((m) => (m.default ?? m) as unknown as SeedData);
  return cache;
}
