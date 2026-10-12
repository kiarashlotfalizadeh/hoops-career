// Two-way contracts from SalarySwish (via nba-roster-builder's players.json). Basketball
// Reference's contracts table leaves most two-way players out, so matching seed players are
// marked (they don't count toward the 15-man roster), and seed players who are unsigned (or
// listed with another team, e.g. waived with salary still owed) join the team that signed
// them to the two-way deal (remembering where they were, so a later refresh starts from the
// contracts table again). Listed players missing from the seed are ignored.
import type { SeedPlayer } from '../../../src/core/league/create';
import { normName } from '../nba/crosswalk';
import { teamByCode } from './teams';

interface SalarySwishPlayer {
  name: string;
  team: string;
  contractType?: string | null;
  salary?: Record<string, number>;
  cashSalary?: Record<string, number>;
}

export interface TwoWayResult {
  marked: SeedPlayer[];
  /** Seed players whose team changed (was unsigned or listed elsewhere). */
  moved: string[];
  missing: string[];
}

/** A seed player moved onto his two-way team, with the team and contract he had before. */
type MovedPlayer = SeedPlayer & { twoWayFrom?: { team: string | null; contract: SeedPlayer['contract'] } };

export function markTwoWays(players: SeedPlayer[], rows: SalarySwishPlayer[], seasonLabel: string): TwoWayResult {
  // undo the last run's moves and flags first, so a refresh never leaves a stipend behind as a standard deal
  for (const p of players as MovedPlayer[]) {
    if (p.twoWayFrom) {
      p.team = p.twoWayFrom.team;
      p.contract = p.twoWayFrom.contract;
      delete p.twoWayFrom;
    }
    if (p.contract) delete p.contract.twoWay;
  }
  const byName = new Map<string, SeedPlayer[]>();
  for (const p of players) {
    const k = normName(`${p.first} ${p.last}`);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const res: TwoWayResult = { marked: [], moved: [], missing: [] };
  for (const r of rows) {
    if (r.contractType !== 'two-way') continue;
    const team = teamByCode(r.team);
    if (!team) continue;
    const cands = byName.get(normName(r.name)) ?? [];
    const p = cands.find((c) => c.team === team) ?? (cands.length === 1 ? cands[0] : undefined);
    if (!p) {
      res.missing.push(`${r.name} (${r.team})`);
      continue;
    }
    if (p.team !== team || !p.contract) {
      res.moved.push(`${r.name} (${p.team ?? 'FA'} → ${team})`);
      // two-way pay is a flat stipend (thousands of dollars)
      const pay = Math.round((r.cashSalary?.[seasonLabel] || r.salary?.[seasonLabel] || 680_985) / 1000);
      (p as MovedPlayer).twoWayFrom ??= { team: p.team, contract: p.contract };
      p.team = team;
      p.contract = { salaries: [pay], twoWay: true };
    } else p.contract = { ...p.contract, twoWay: true };
    res.marked.push(p);
  }
  return res;
}
