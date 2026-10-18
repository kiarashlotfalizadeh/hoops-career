// How a season series, a streak and a team's last ten read, the same on every screen that shows
// them (the Games hub's next game, the Matchup slab, a team's page): "1-0 · 2 left · last W 115-106",
// "W3", "6-4 in last 10".
import type { League } from '../../core/types';

export interface SeasonSeries {
  won: number;
  lost: number;
  /** Regular-season meetings still to play. */
  left: number;
  /** Regular-season meetings this season, played or not. */
  total: number;
  /** The latest meeting played, from `us`'s side. */
  last?: { gid: number; won: boolean; us: number; them: number };
}

/** This season's regular-season meetings of `us` (the user's team by default) with `opp`, from `us`'s side. */
export function seasonSeries(league: League, opp: number, us = league.userTid): SeasonSeries {
  const vs = (h: number, a: number) => (h === us && a === opp) || (h === opp && a === us);
  let won = 0;
  let lost = 0;
  let last: SeasonSeries['last'];
  let lastAt = -1;
  for (const g of league.games) {
    if (g.season !== league.season || g.type !== 'regular' || !vs(g.home.tid, g.away.tid)) continue;
    const [mine, theirs] = g.home.tid === us ? [g.home.pts, g.away.pts] : [g.away.pts, g.home.pts];
    if (mine > theirs) won++;
    else lost++;
    if (g.day > lastAt || (g.day === lastAt && last && g.gid > last.gid)) {
      lastAt = g.day;
      last = { gid: g.gid, won: mine > theirs, us: mine, them: theirs };
    }
  }
  const all = league.schedule.filter((g) => g.type === 'regular' && vs(g.home, g.away));
  return { won, lost, left: all.filter((g) => !g.played).length, total: all.length, ...(last ? { last } : {}) };
}

/**
 * The series in its parts, for a line that links the last game: the record ("1-0", or "No meetings
 * yet" before the first), what's left ("2 left") and the last result ("W 115-106").
 */
export function seriesParts(s: SeasonSeries): { record: string; left: string; last: string } {
  return {
    record: s.won + s.lost ? `${s.won}-${s.lost}` : 'No meetings yet',
    left: s.left ? `${s.left} left` : '',
    last: s.last ? `${s.last.won ? 'W' : 'L'} ${s.last.us}-${s.last.them}` : '',
  };
}

/** "1-0 · 2 left · last W 115-106", "No meetings yet · 3 left", "2-1 · last L 99-104"; '' when they don't meet in the regular season. */
export function seriesText(s: SeasonSeries): string {
  if (!s.total) return '';
  const p = seriesParts(s);
  return [p.record, p.left, p.last && `last ${p.last}`].filter(Boolean).join(' · ');
}

/** A streak as a standings table writes it: "W3", "L2" ('' for none). */
export const streakText = (streak: number) => (streak > 0 ? `W${streak}` : streak < 0 ? `L${-streak}` : '');

/** "6-4 in last 10" from a team's last results (1 a win, 0 a loss); '' before any. */
export function lastTenText(results: readonly number[]): string {
  if (!results.length) return '';
  const w = results.filter((x) => x === 1).length;
  return `${w}-${results.length - w} in last ${results.length}`;
}
