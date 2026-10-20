// A game's result as a broadcast's final graphic, at the top of its report and of the live game's
// final card: both teams in their colours, the score, the linescore, and whether the user won.
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameResult, League } from '../../core/types';
import { cupLabel } from '../../core/league/cup';
import { fmtDate } from '../../core/league/helpers';
import { matchupLooks } from '../teamColors';
import { finalLabel } from '../stats';
import { TeamLogo } from './TeamLogo';
import { QuarterTable } from './gameBlocks';
import './gameday.css';

/** "NBA Cup · Final", "West R1 · Game 3", "NBA Finals · Game 7", "Playoffs" (an older season's), "Play-In", "Regular season". */
export function gameTypeLabel(league: League, g: GameResult): string {
  const cup = cupLabel(league, { cup: g.cup, home: g.home.tid, season: g.season });
  if (cup) return cup;
  if (g.type === 'playoffs') {
    const s = g.season === league.season && g.seriesId ? league.playoffs.find((x) => x.id === g.seriesId) : undefined;
    if (!s) return 'Playoffs';
    // (its number in the series: the series' games up to this one)
    const n = league.games.filter(
      (x) => x.season === g.season && x.type === 'playoffs' && x.seriesId === g.seriesId && (x.day < g.day || (x.day === g.day && x.gid <= g.gid)),
    ).length;
    // (short enough to share the slab's top line with the date and the crowd on a phone)
    const conf = s.conf === 'E' ? 'East' : 'West';
    const round = s.round === 4 ? 'NBA Finals' : s.round === 3 ? `${conf} Finals` : s.round === 2 ? `${conf} Semis` : `${conf} R1`;
    return `${round} · Game ${Math.max(1, n)}`;
  }
  return g.type === 'playin' ? 'Play-In' : 'Regular season';
}

/**
 * The result as a broadcast's final: both teams in their colours, the score, the linescore, and
 * whether the user won. `children` go under it (the final card's buttons).
 */
export function FinalSlab({ res, league, children }: { res: GameResult; league: League; children?: ReactNode }) {
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  // (on a clash the away side wears its second colour, so the two halves never read as one)
  const [lh, la] = matchupLooks(home.colors, away.colors);
  const us = res.home.tid === league.userTid ? res.home : res.away.tid === league.userTid ? res.away : null;
  const won = !!us && us.pts > (us === res.home ? res.away : res.home).pts;
  const side = (t: typeof home, pts: number, win: boolean, isHome: boolean) => (
    <Link to={t.tid === league.userTid ? '/team' : `/teams/${t.tid}`} className={`gd-fs-team${isHome ? ' home' : ''}${win ? '' : ' lost'}`}>
      <TeamLogo tid={t.tid} size={40} decorative />
      <span className="gd-fs-ab">{t.abbrev}</span>
      <span className="gd-fs-pts num">{pts}</span>
    </Link>
  );
  return (
    <section
      className="slab gd-final"
      aria-label={`Final: ${away.name} ${res.away.pts}, ${home.name} ${res.home.pts}`}
      style={{ '--fa': la.slab, '--fh': lh.slab, '--ta': la.trim, '--th': lh.trim } as CSSProperties}
    >
      <div className="gd-fs-over">
        <span>{gameTypeLabel(league, res)}</span>
        <span>
          {fmtDate(res.season, res.day, { weekday: 'short', month: 'short', day: 'numeric' })}
          {res.att ? ` · Att ${res.att.toLocaleString()}` : ''}
        </span>
      </div>
      <div className="gd-fs-row">
        {side(away, res.away.pts, res.away.pts > res.home.pts, false)}
        <div className="gd-fs-mid">
          <span className="gd-fs-final">{finalLabel(res.ot)}</span>
          {us && <span className={`gd-fs-wl ${won ? 'w' : 'l'}`}>{won ? 'Win' : 'Loss'}</span>}
        </div>
        {side(home, res.home.pts, res.home.pts > res.away.pts, true)}
      </div>
      <QuarterTable g={res} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
      {children && <div className="gd-fs-actions">{children}</div>}
    </section>
  );
}
