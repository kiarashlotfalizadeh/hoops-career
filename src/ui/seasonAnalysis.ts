// Season-level aggregation of the user's stored games: lineups, play types, tactical effects.
import type { League, Settings } from '../core/types';

export { seasonPlayTypes, type PlayTypeAgg } from '../core/analysis/playTypes';

export interface LineupAgg {
  key: string;
  pids: number[];
  min: number;
  poss: number;
  ptsFor: number;
  ptsAgainst: number;
  net: number;
}

export function seasonLineups(league: League, tid = league.userTid): LineupAgg[] {
  const m = new Map<string, LineupAgg>();
  for (const g of league.games) {
    if (g.season !== league.season || !g.lineups) continue;
    const side = g.home.tid === tid ? 0 : g.away.tid === tid ? 1 : -1;
    if (side < 0) continue;
    for (const l of g.lineups) {
      if (l.t !== side) continue;
      const key = [...l.pids].sort((a, b) => a - b).join('-');
      const e = m.get(key) ?? { key, pids: [...l.pids], min: 0, poss: 0, ptsFor: 0, ptsAgainst: 0, net: 0 };
      e.min += l.sec / 60;
      e.poss += l.poss;
      e.ptsFor += l.ptsFor;
      e.ptsAgainst += l.ptsAgainst;
      m.set(key, e);
    }
  }
  const out = [...m.values()];
  for (const e of out) e.net = e.poss ? ((e.ptsFor - e.ptsAgainst) / e.poss) * 100 : 0;
  return out.sort((a, b) => b.min - a.min);
}

/**
 * Expected points per game from each tracked tactical effect, split by who benefited, over the
 * games that tracked them: the user's own (a team taken over mid-season has none from before).
 */
export function seasonImpacts(league: League, tid = league.userTid): { games: number; effects: { key: string; forUser: boolean; perGame: number }[] } {
  const m = new Map<string, number>();
  let games = 0;
  for (const g of league.games) {
    if (g.season !== league.season || !g.impacts) continue;
    const side = g.home.tid === tid ? 0 : g.away.tid === tid ? 1 : -1;
    if (side < 0) continue;
    games++;
    for (const im of g.impacts) {
      const k = `${im.key}|${im.t === side ? 1 : 0}`;
      m.set(k, (m.get(k) ?? 0) + im.pts);
    }
  }
  const effects = [...m.entries()]
    .map(([k, v]) => {
      const [key, f] = k.split('|');
      return { key, forUser: f === '1', perGame: v / games };
    })
    .sort((a, b) => b.perGame - a.perGame);
  return { games, effects };
}

/**
 * Advice names Tactics tabs as Expert mode lays them out: point at what the user's coaching depth
 * shows instead (roles are set from a player's page; Simple has no Offense or Defense tab, and only
 * Expert has Game Mgmt).
 */
export function adviceFor(text: string, complexity: Settings['complexity']): string {
  if (complexity === 'expert') return text;
  const out = text.replace(/\(Tactics > Roles\)/g, "(Set role, on the player's page)");
  const noExpert = out.replace(/ \(Game Mgmt( > [^)]*)?\)/g, '');
  const bare = complexity === 'simple' ? noExpert.replace(/ \((Offense|Defense)( > [^)]*)?\)/g, '') : noExpert;
  return bare === out ? out : `${bare} (Needs ${noExpert !== out ? 'Expert' : 'Advanced'} coaching depth, in Settings.)`;
}
