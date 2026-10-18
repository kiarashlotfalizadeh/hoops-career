// New League's roster facts, read from the seed before the league exists, so the team step can say
// where a roster stands without building a league.
import type { SeedData } from '../core/league/create';
import { CAP } from '../core/constants';
import { BBREF_TO_TID } from '../core/teams';

/**
 * Standard contracts each team opens camp with, as createLeague builds them: two-way deals don't
 * count, and a deal under the minimum is a waived player's dead money, not a roster spot.
 */
export function seedRosterSizes(seed: SeedData): Record<number, number> {
  const n: Record<number, number> = {};
  for (const p of seed.players) {
    const t = p.team ? BBREF_TO_TID[p.team] : undefined;
    if (t === undefined || p.contract?.twoWay || (p.contract?.salaries?.[0] ?? 0) < CAP.minContract) continue;
    n[t] = (n[t] ?? 0) + 1;
  }
  return n;
}

/** Where a roster stands against opening night's limits: "16 players · 1 to cut before opening night". */
export function rosterLine(n: number): string {
  if (n > CAP.rosterMax) return `${n} players · ${n - CAP.rosterMax} to cut before opening night`;
  if (n < CAP.rosterMin) return `${n} players · ${CAP.rosterMin - n} to sign before opening night`;
  const open = CAP.rosterMax - n;
  return open ? `${n} players · ${open} open spot${open === 1 ? '' : 's'}` : `${n} players`;
}
