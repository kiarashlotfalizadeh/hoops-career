// The press's power rankings: rank, the week's move, the team and its record, and the press's line
// on it. In full on Standings → Power; the News front page shows the top five and your team.
import { keepFigures } from '../../../core/format';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { League } from '../../../core/types';
import type { PowerRow } from '../../../core/league/media';
import { TeamLogo } from '../../components/TeamLogo';
import { keep } from '../../components/ui';
import { teamPath } from '../shared';
import './news.css';
import { teamCity } from '../../../core/league/helpers';

/** "▲ 3" in green, "▼ 2" in red, "–" for no move, "new" without last week's. */
export function PowerMove({ r }: { r: PowerRow }) {
  if (r.prev === undefined) return <span className="lg-pw-mv dim">–</span>;
  const d = r.prev - r.rank;
  if (d === 0)
    return (
      <span className="lg-pw-mv dim" aria-label="No change">
        –
      </span>
    );
  return (
    <span className={`lg-pw-mv ${d > 0 ? 'good' : 'bad'}`} aria-label={d > 0 ? `Up ${d}` : `Down ${-d}`}>
      {d > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
      {Math.abs(d)}
    </span>
  );
}

/** `blurbs`: every row's line, none, or the rows a test picks (the front page: No. 1 and yours). */
export function PowerList({ league, rows, blurbs = true }: { league: League; rows: PowerRow[]; blurbs?: boolean | ((r: PowerRow) => boolean) }) {
  return (
    <div className="card flush list lg-pw">
      {rows.map((r, i) => {
        const t = league.teams[r.tid];
        // the record the line was written on (older rankings: today's, read, never created in a render)
        const now = t.seasons.find((x) => x.season === league.season) ?? { won: 0, lost: 0 };
        const ts = r.w !== undefined && r.l !== undefined ? { won: r.w, lost: r.l } : now;
        // (the record today beside it when games were played since: never a stale record read as the final)
        const since = r.w !== undefined && now.won + now.lost > ts.won + ts.lost ? now : null;
        const gap = i > 0 && rows[i - 1].rank !== r.rank - 1;
        return (
          <Link key={r.tid} to={teamPath(r.tid)} className={`lg-pw-row ${r.tid === league.userTid ? 'me' : ''} ${gap ? 'gap' : ''}`}>
            <span className="lg-pw-rank num">{r.rank}</span>
            <PowerMove r={r} />
            <TeamLogo tid={r.tid} size={28} decorative />
            <span className="lg-pw-t">
              {/* the team's name, as the standings print it: its city ("Oklahoma City", never "Oklahoma City Twis…") */}
              <span className="lg-pw-name">
                <span className="ellipsis">{teamCity(league, t)}</span>
                <span className="lg-pw-rec num">
                  {since ? keepFigures(`${since.won}-${since.lost}`) : keepFigures(`${ts.won}-${ts.lost}`)}
                  {since && <span className="dim"> · {keepFigures(`${ts.won}-${ts.lost}`)} when ranked</span>}
                </span>
              </span>
              {(typeof blurbs === 'function' ? blurbs(r) : blurbs) && <span className="lg-pw-blurb">{keep(r.blurb)}</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
