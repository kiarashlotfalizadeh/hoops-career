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

/** Each team's opening payroll in the seed, as createLeague books it (two-way deals don't count). */
function seedPayrolls(seed: SeedData): Record<number, number> {
  const pay: Record<number, number> = {};
  for (const p of seed.players) {
    const t = p.team ? BBREF_TO_TID[p.team] : undefined;
    if (t === undefined || p.contract?.twoWay) continue;
    pay[t] = (pay[t] ?? 0) + (p.contract?.salaries?.[0] ?? 0);
  }
  return pay;
}

/**
 * The team step's pick before the user makes one: the team ranked nearest the middle (`rank`: each
 * roster's strength rank) whose roster is legal on opening night and whose payroll is under the tax
 * line, so a newcomer's first hour isn't cuts, an apron goal and a contender's demands. Null when none
 * qualifies (the step asks for a pick).
 */
export function defaultTeam(seed: SeedData, rank: Record<number, number>): number | null {
  const size = seedRosterSizes(seed);
  const pay = seedPayrolls(seed);
  const n = Object.keys(rank).length;
  const fits = Object.keys(rank)
    .map(Number)
    .filter((t) => size[t] >= CAP.rosterMin && size[t] <= CAP.rosterMax && (pay[t] ?? 0) < CAP.luxuryTax)
    .sort((a, b) => Math.abs(rank[a] - (n + 1) / 2) - Math.abs(rank[b] - (n + 1) / 2) || rank[a] - rank[b]);
  return fits[0] ?? null;
}
