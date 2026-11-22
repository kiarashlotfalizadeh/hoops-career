// A game's result at the top of its report and of the live game's final card: the scoreboard in
// both teams' colours (the score, whether the user won: `GameBoard`, which the next game's screens
// share), with the linescore under it when asked. The first time a result shows, its score counts up
// (under a second; reduced motion shows it still).
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameResult, League } from '../../core/types';
import { CountUp, keep } from './ui';
import { cupLabel } from '../../core/league/cup';
import { fmtDate, teamCity } from '../../core/league/helpers';
import { matchupColors, matchupLooks } from '../teamColors';
import { finalLabel } from '../stats';
import { TeamLogo } from './TeamLogo';
import { QuarterTable } from './gameBlocks';
import './gameday.css';
import './gameBoard.css';

/** "In-Season Cup · Final", "West R1 · Game 3", "Finals · Game 7", "Playoffs" (an older season's), "Play-In", "Regular season". */
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
    const round = s.round === 4 ? 'Finals' : s.round === 3 ? `${conf} Finals` : s.round === 2 ? `${conf} Semis` : `${conf} R1`;
    return `${round} · Game ${Math.max(1, n)}`;
  }
  return g.type === 'playin' ? 'Play-In' : 'Regular season';
}

/**
 * The two teams' colours as the board wears them, [home, away]: for a game's charts on the paper (the
 * shot charts, win probability, the margin), so each team reads in the colour its half of the poster
 * has, deep enough to read on paper.
 */
export function boardColors(league: League, g: { home: { tid: number }; away: { tid: number } }): [string, string] {
  return matchupColors(league.teams[g.home.tid].colors, league.teams[g.away.tid].colors);
}

/** One side of a game board: the team, its big figure (points, a chance to win, a record) and a line under its name. */
export interface BoardSide {
  tid: number;
  fig: ReactNode;
  /** A short line under the abbreviation: a record, a rank. */
  sub?: ReactNode;
  /** The side that lost (or trails): its figure is lighter and a size down, in the same white (the winner leads by weight, not by fading the other). */
  lost?: boolean;
}

/**
 * A game's two teams side by side, away on the left and home on the right: the poster every game
 * screen opens with (the next game's chances, the final's points). Each team is one solid block of its
 * colour, a full court's white lines across both (the half line on the seam), the figures in the
 * condensed black cut as big as they fit, each team's mark and name under its figure. `mid` is the
 * pill on the seam under the figures ("Won by 18", "To win"); `links` makes each side a tap to its team.
 */
export function GameBoard({
  league,
  away,
  home,
  over,
  mid,
  links = true,
  compact = false,
  className = '',
  children,
}: {
  league: League;
  away: BoardSide;
  home: BoardSide;
  over: [ReactNode, ReactNode?];
  mid?: ReactNode;
  links?: boolean;
  /** One line (a screen's section below it is the page now): mark, figure, the pill, figure, mark. */
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [h, a] = [league.teams[home.tid], league.teams[away.tid]];
  // (on a clash the away side wears its second colour, so the two halves never read as one)
  const [lh, la] = matchupLooks(h.colors, a.colors);
  const side = (s: BoardSide, isHome: boolean) => {
    const t = league.teams[s.tid];
    const nm = teamCity(league, t);
    const cls = `gd-bd-team${isHome ? ' home' : ''}${s.lost ? ' lost' : ''}`;
    const id = (
      <>
        <TeamLogo tid={t.tid} size={24} decorative />
        <span className="gd-bd-who">
          {/* (a long name gives way to its abbreviation on a phone) */}
          {compact ? (
            <span className="gd-bd-nm">{t.abbrev}</span>
          ) : (
            <>
              {/* (a long name gives way below 600px, a middling one ("Boston", "Milwaukee") below 380px) */}
              <span className={`gd-bd-nm${nm.length > 9 ? ' long' : nm.length > 5 ? ' mid' : ''}`}>{nm}</span>
              {nm.length > 5 && <span className={`gd-bd-nm short${nm.length > 9 ? '' : ' of-mid'}`}>{t.abbrev}</span>}
            </>
          )}
          {s.sub && <span className="gd-bd-sub num">{keep(s.sub)}</span>}
        </span>
      </>
    );
    return {
      fig: (
        <span className={`${cls} gd-bd-figc`}>
          <span className="gd-bd-fig num">{s.fig}</span>
        </span>
      ),
      id: links ? (
        <Link to={t.tid === league.userTid ? '/team' : `/teams/${t.tid}`} className={`${cls} gd-bd-id`}>
          {id}
        </Link>
      ) : (
        <span className={`${cls} gd-bd-id`}>{id}</span>
      ),
    };
  };
  const [sa, sh] = [side(away, false), side(home, true)];
  return (
    <div className={`gd-board${compact ? ' compact' : ''} ${className}`} style={{ '--fa': la.slab, '--fh': lh.slab } as CSSProperties}>
      {!compact && (
        <div className="gd-bd-over">
          <span>{over[0]}</span>
          {over[1] && <span>{over[1]}</span>}
        </div>
      )}
      <div className="gd-bd-row">
        {sa.fig}
        {sh.fig}
      </div>
      <div className="gd-bd-ids">
        {sa.id}
        <span className="gd-bd-mid">{mid}</span>
        {sh.id}
      </div>
      {!compact && children}
    </div>
  );
}

/**
 * The result: the scoreboard in both teams' colours with whether the user won and (with `linescore`;
 * the report keeps it on its Box) the linescore. `children` go under it (the final card's buttons).
 */
export function FinalSlab({
  res,
  league,
  moment,
  linescore = false,
  compact = false,
  children,
}: {
  res: GameResult;
  league: League;
  /** The result showing for the first time: the score counts up. */
  moment?: boolean;
  /** The points by period under the board (off by default: the report has them on its Box). */
  linescore?: boolean;
  /** Just the board, on one line: a report's tab other than its first leads with its own content. */
  compact?: boolean;
  children?: ReactNode;
}) {
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  const us = res.home.tid === league.userTid ? res.home : res.away.tid === league.userTid ? res.away : null;
  const won = !!us && us.pts > (us === res.home ? res.away : res.home).pts;
  const by = Math.abs(res.home.pts - res.away.pts);
  const fig = (pts: number) => (moment ? <CountUp value={String(pts)} ms={800} /> : pts);
  // what kind of game it was, over the board: a series, the play-in and the Cup say theirs
  const kind = gameTypeLabel(league, res);
  const occasion = kind !== 'Regular season' ? kind : '';
  return (
    <section className={`gd-final${moment ? ' gd-moment' : ''}`} aria-label={`Final: ${teamCity(league, away)} ${res.away.pts}, ${teamCity(league, home)} ${res.home.pts}`}>
      <GameBoard
        league={league}
        compact={compact}
        away={{ tid: away.tid, fig: fig(res.away.pts), lost: res.away.pts < res.home.pts }}
        home={{ tid: home.tid, fig: fig(res.home.pts), lost: res.home.pts < res.away.pts }}
        over={[`${res.ot ? finalLabel(res.ot) : 'Final'} · ${fmtDate(res.season, res.day, { weekday: 'short', month: 'short', day: 'numeric' })}`, occasion]}
        mid={
          // (a one-line board has no room for "Won by 24" beside both teams: it reads "W +24", the box score's way)
          us ? (
            <span className={`gd-bd-pill ${won ? 'w' : 'l'}`} aria-label={`${won ? 'Won' : 'Lost'} by ${by}`}>
              {compact ? `${won ? 'W +' : 'L −'}${by}` : `${won ? 'Won' : 'Lost'} by ${by}`}
            </span>
          ) : (
            <span className="gd-bd-pill">{`${(res.home.pts > res.away.pts ? home : away).abbrev} ${compact ? '+' : 'by '}${by}`}</span>
          )
        }
      />
      {linescore && <QuarterTable g={res} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />}
      {children && <div className="gd-fs-actions">{children}</div>}
    </section>
  );
}
