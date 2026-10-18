// The rows the Stats views read: every player's season line (per game, with his PER and win
// shares where the season has them), the games that set the qualifying bar, and the one rule for
// who qualifies.
import type { League, Player, PlayerStats } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { advancedView, perGame, seasonLine, type AdvView, type PerGame } from '../../stats';
import { statTid } from '../shared';

export interface StatRow {
  p: Player;
  s: PlayerStats;
  pg: PerGame;
  tid: number | null;
  /** PER and win shares: an imported season's own, or worked out for a regular season played here (see advancedView). */
  adv: AdvView | null;
}

/** Per-game rows for every player with stats in a season (regular season or playoffs). */
export function useSeasonRows(league: League, season: number, playoffs: boolean): StatRow[] {
  return useLeagueMemo(() => {
    const out: StatRow[] = [];
    for (const p of Object.values(league.players)) {
      // a player traded during an imported season keeps his usage and advanced numbers
      const s = seasonLine(p, season, playoffs);
      if (!s || s.gp === 0) continue;
      const pg = perGame(s);
      if (!pg) continue;
      out.push({ p, s, pg, tid: statTid(league, s), adv: advancedView(league, p, s) });
    }
    return out;
  }, [league, season, playoffs]);
}

/** Games played by the busiest team that season (82 for imported seasons). */
function teamGames(league: League, season: number, rows: StatRow[], playoffs: boolean) {
  if (playoffs) return rows.reduce((m, r) => Math.max(m, r.s.gp), 0);
  let mx = 0;
  for (const t of league.teams) {
    const ts = t.seasons.find((x) => x.season === season);
    if (ts) mx = Math.max(mx, ts.won + ts.lost);
  }
  return mx || rows.reduce((m, r) => Math.max(m, r.s.gp), 0);
}

/**
 * Who qualifies for the leaders, and for the players table's "Qualified only": half his team's
 * games (30% in the playoffs) at 15 minutes a game (10). One rule, so a leaderboard and the table it
 * opens rank the same players.
 */
export function qualifier(league: League, season: number, rows: StatRow[], playoffs: boolean) {
  const games = teamGames(league, season, rows, playoffs);
  const minGp = Math.max(1, Math.ceil(games * (playoffs ? 0.3 : 0.5)));
  const minMin = playoffs ? 10 : 15;
  return { minGp, minMin, ok: (r: StatRow) => r.s.gp >= minGp && r.pg.min >= minMin, label: `${minGp}+ games, ${minMin}+ min` };
}

export const pctCell = (v: number | string) => (typeof v === 'number' && v >= 0 ? (v * 100).toFixed(1) : '—');
