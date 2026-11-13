// What the end of a game is, for the 3D picture's celebration (court3d/scene.ts, sideline.ts, arena.ts):
// a win, a late winner (the lead taken for good in the last seconds), a playoff win, a series won, a
// title (the Finals, or the Cup final). Read from what the live screen knows once the game is over: its
// type, its series as the league has it then (the result counted), and the possessions as played. Pure.
import type { League, ScheduledGame } from '../../core/types';
import type { PossLog } from '../../core/sim/log';

export type Occasion = 'win' | 'late' | 'playoff' | 'clinch' | 'title';

/** A lead taken for good with this little left (game seconds) in the last period is a late winner. */
export const LATE_WINNER_S = 10;

/** The end of the game `g`, won by `winner` (0 the home side): its possessions `logs` as played. */
export function occasionOf(league: Pick<League, 'playoffs'>, g: Pick<ScheduledGame, 'type' | 'seriesId' | 'cup'>, logs: readonly PossLog[], winner: 0 | 1): Occasion {
  if (g.cup === 'final') return 'title';
  const series = g.type === 'playoffs' ? league.playoffs.find((s) => s.id === g.seriesId) : undefined;
  // (a series is counted once the game is over, and no game is played after one is won: so a winner now is this game's)
  if (series && series.winner !== undefined) return series.round === 4 ? 'title' : 'clinch';
  // the last time the winners went from level or behind to ahead (they kept it from there)
  let at: PossLog | undefined;
  let ahead = false;
  for (const l of logs) {
    const now = l.score[winner] > l.score[1 - winner];
    if (now && !ahead) at = l;
    ahead = now;
  }
  const last = logs[logs.length - 1];
  if (at && last && at.q === last.q && at.q >= 4 && at.clockEnd <= LATE_WINNER_S) return 'late';
  return g.type === 'playoffs' || g.type === 'playin' ? 'playoff' : 'win';
}
