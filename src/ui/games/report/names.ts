// Names in a game's box score: current players by their record, anyone else (since retired, or gone
// from the league file) by the name kept with the game, teammates who share a last name told apart.
import type { League, TeamBox } from '../../../core/types';
import { rosterNames } from '../../stats';

/** Collision-aware names for one side of a box score; `initial` gives everyone a first initial ("S. Castle"). */
export function boxNames(league: League, box: TeamBox, initial = false) {
  return rosterNames(
    box.players.map((b) => {
      const p = league.players[b.pid];
      const [first, ...rest] = b.name.split(' ');
      return { pid: b.pid, firstName: p ? p.firstName : rest.length ? first : '', lastName: p ? p.lastName : rest.length ? rest.join(' ') : first };
    }),
    { initial },
  );
}
