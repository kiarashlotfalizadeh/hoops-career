// A franchise's retired numbers as banners in its colours, oldest first: the number, the legend and
// the season it went up, linking to his page while the save still has him. History's Franchise view
// shows them full size under the championship banners; a team page's History tab, small.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { shade } from '../components/ui';
import { inkOn } from '../teamColors';

export function RetiredBanners({ league, tid, small }: { league: League; tid: number; small?: boolean }) {
  const team = league.teams[tid];
  const list = team?.retired ?? [];
  if (!list.length) return null;
  const [c1, c2] = team.colors;
  // the ink is read against the middle of the banner's gradient, as on an avatar
  const style = { '--bn': c1, '--bn-low': shade(c1, -0.4), '--bn-trim': c2, color: inkOn(shade(c1, -0.2)) } as CSSProperties;
  return (
    <div className={`lg-banners${small ? ' sm' : ''}`}>
      {list.map((r) => {
        const p = league.players[r.pid];
        const label = `No. ${r.jersey}, ${r.name}, retired ${seasonLabel(r.season)}`;
        const body = (
          <>
            <span className="no">{r.jersey}</span>
            <span className="nm">{small ? (p?.lastName ?? r.name.split(' ').slice(-1)[0]) : r.name}</span>
            {!small && <span className="yr">{seasonLabel(r.season)}</span>}
          </>
        );
        return p ? (
          <Link key={`${r.pid}-${r.jersey}`} to={`/player/${r.pid}`} className="lg-banner" style={style} aria-label={label}>
            {body}
          </Link>
        ) : (
          <div key={`${r.pid}-${r.jersey}`} className="lg-banner" style={style} aria-label={label} role="img">
            {body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A franchise's titles from before the league (a real league's past: League.past), as the banners
 * over the court: the year, and the name it won under when that was another ("1979 SuperSonics").
 */
export function PastTitleBanners({ league, tid }: { league: League; tid: number }) {
  const won = (league.past?.finals ?? []).filter((f) => f[1] === tid);
  if (!won.length) return null;
  return (
    <div className="chips" aria-label={`${won.length} titles before this league`}>
      {won.map((f) => (
        <span key={f[0]} className="tag lg-gold lg-title-yr">
          {f[0]}
          {f[6] ? ` ${f[6].split(' ').slice(-1)[0]}` : ''}
        </span>
      ))}
    </div>
  );
}
