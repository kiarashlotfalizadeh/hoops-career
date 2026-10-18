// Season-level aggregation of the user's stored games: lineups, play types, tactical effects.
import type { League } from '../core/types';

export { seasonPlayTypes, type PlayTypeAgg } from '../core/analysis/playTypes';
export { seasonLineups, type LineupAgg } from '../core/analysis/lineups';

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
