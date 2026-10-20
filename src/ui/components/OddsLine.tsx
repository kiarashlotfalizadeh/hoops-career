import { Link } from 'react-router-dom';
import type { League } from '../../core/types';
import { pct } from '../../core/analysis/odds';
import { useForecast } from '../useForecast';

/**
 * A team's line from the season forecast (src/core/analysis/odds.ts), linking to the Odds view: its
 * projected record and playoff odds (for the user's team, with the change since a week ago on its
 * trail), or in the playoffs its chance in the series it's playing; the title odds once they mean
 * something. Nothing when there's no season left to forecast.
 */
export function OddsLine({ league, tid }: { league: League; tid: number }) {
  const f = useForecast(league);
  if (!f) return null;
  const t = f.teams[tid];
  const series = league.playoffs.find((s) => s.winner === undefined && (s.high === tid || s.low === tid));
  let main: string;
  if (series) {
    const opp = league.teams[series.high === tid ? series.low : series.high].abbrev;
    main = `Series vs ${opp}: ${pct(t.reach[series.round])} to win it`;
  } else if (t.out) main = league.phase === 'playoffs' || league.phase === 'playin' ? 'Season over' : 'Eliminated from the playoffs';
  else {
    const w = Math.round(t.w);
    const rec = league.phase === 'playin' ? '' : `Projected ${w}-${Math.round(t.w + t.l) - w} · `;
    main = `${rec}Playoff odds ${pct(t.reach[0], t.clinched)}`;
    // the change since a week ago, from the user's trail
    const tr = league.oddsTrail;
    const prev = tid === league.userTid && tr?.season === league.season && tr.tid === tid ? [...tr.pts].reverse().find((p) => p[0] <= league.day - 7) : undefined;
    if (prev && !t.clinched) {
      const d = Math.round(t.reach[0] * 100 - prev[1] / 10);
      if (d) main += ` (${d > 0 ? '+' : ''}${d} this week)`;
    }
  }
  const title = !t.out && t.reach[4] >= 0.01 ? ` · Title ${pct(t.reach[4])}` : '';
  return (
    <Link to="/league/standings?view=odds" className="small dim2" style={{ display: 'block', marginTop: 8 }}>
      {main}
      {title}
      {f.preseason ? ' (preseason forecast)' : ''}
    </Link>
  );
}
