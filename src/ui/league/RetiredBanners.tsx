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
 * A franchise's championship banners, oldest first: the titles from before the league (a real
 * league's past: League.past; the name it won under when that was another, "1979 SuperSonics"), then
 * this league's (`seasons`). Gold cloth, the year in the big cut: the rafters over the court.
 */
export function TitleBanners({ league, tid, seasons = [] }: { league: League; tid: number; seasons?: number[] }) {
  const past = (league.past?.finals ?? []).filter((f) => f[1] === tid);
  if (!past.length && !seasons.length) return null;
  const list = [
    ...past.map((f) => ({ key: `p${f[0]}`, yr: String(f[0]), as: f[6] ? f[6].split(' ').slice(-1)[0] : '' })),
    ...[...seasons].sort((a, b) => a - b).map((y) => ({ key: `s${y}`, yr: seasonLabel(y), as: '' })),
  ];
  return (
    <div className="lg-banners sm lg-titles" role="list" aria-label={`${list.length} championship ${list.length === 1 ? 'banner' : 'banners'}`}>
      {list.map((b) => (
        <div key={b.key} className="lg-banner title" role="listitem">
          <span className={`no${b.yr.length > 4 ? ' long' : ''}`}>{b.yr}</span>
          <span className="nm">{b.as || 'Champions'}</span>
        </div>
      ))}
    </div>
  );
}
