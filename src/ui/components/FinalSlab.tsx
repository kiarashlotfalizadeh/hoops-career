// A game's result as a newspaper's game story, at the top of its report and of the live game's final
// card: the scoreboard in both teams' colours (the score, whether the user won: `GameBoard`, which
// the next game's screens share), then for his games the result as an event on the page: the
// headline and its dek, the player of the game's jersey and line, and what it means (the story from
// gameStory.ts), over the linescore. The first time a result
// shows, its score counts up and the headline rises in (under a second; reduced motion shows it still).
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { GameResult, League } from '../../core/types';
import type { GameStory } from '../../core/analysis/gameStory';
import { Avatar, CountUp } from './ui';
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

/** One side of a game board: the team, its big figure (points, a chance to win, a record) and a line under its name. */
export interface BoardSide {
  tid: number;
  fig: ReactNode;
  /** A short line under the abbreviation: a record, a rank. */
  sub?: ReactNode;
  /** The side that lost (or trails): its figure steps back. */
  lost?: boolean;
}

/**
 * A game's two teams side by side, away on the left and home on the right, each on a flat field of
 * its own colour: the scoreboard every game screen opens with (the next game's chances, the final's
 * points). `mid` names the figures ("Final", "To win"); `links` makes each side a tap to its team.
 */
export function GameBoard({
  league,
  away,
  home,
  over,
  mid,
  links = true,
  className = '',
  children,
}: {
  league: League;
  away: BoardSide;
  home: BoardSide;
  over: [ReactNode, ReactNode?];
  mid: ReactNode;
  links?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [h, a] = [league.teams[home.tid], league.teams[away.tid]];
  // (on a clash the away side wears its second colour, so the two halves never read as one)
  const [lh, la] = matchupLooks(h.colors, a.colors);
  const side = (s: BoardSide, isHome: boolean) => {
    const t = league.teams[s.tid];
    const body = (
      <>
        <span className="gd-bd-id">
          <TeamLogo tid={t.tid} size={34} decorative />
          <span className="gd-bd-ab">{t.abbrev}</span>
          {s.sub && <span className="gd-bd-sub num">{s.sub}</span>}
        </span>
        <span className="gd-bd-fig num">{s.fig}</span>
      </>
    );
    const cls = `gd-bd-team${isHome ? ' home' : ''}${s.lost ? ' lost' : ''}`;
    return links ? (
      <Link to={t.tid === league.userTid ? '/team' : `/teams/${t.tid}`} className={cls}>
        {body}
      </Link>
    ) : (
      <span className={cls}>{body}</span>
    );
  };
  return (
    <div className={`gd-board ${className}`} style={{ '--fa': la.slab, '--fh': lh.slab } as CSSProperties}>
      <div className="gd-bd-over">
        <span>{over[0]}</span>
        {over[1] && <span>{over[1]}</span>}
      </div>
      <div className="gd-bd-row">
        {side(away, false)}
        <div className="gd-bd-mid">{mid}</div>
        {side(home, true)}
      </div>
      {children}
    </div>
  );
}

/**
 * The result: the scoreboard in both teams' colours with whether the user won, the story and (with
 * `linescore`; the report keeps it on its Box) the linescore. `children` go under it (the final
 * card's buttons).
 */
export function FinalSlab({
  res,
  league,
  story,
  moment,
  linescore = false,
  children,
}: {
  res: GameResult;
  league: League;
  /** The user's game told as a story: its headline, hero and what it means. */
  story?: GameStory | null;
  /** The result showing for the first time: the score counts up. */
  moment?: boolean;
  /** The points by period under the story (off by default: the report has them on its Box). */
  linescore?: boolean;
  children?: ReactNode;
}) {
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  const us = res.home.tid === league.userTid ? res.home : res.away.tid === league.userTid ? res.away : null;
  const won = !!us && us.pts > (us === res.home ? res.away : res.home).pts;
  const fig = (pts: number) => (moment ? <CountUp value={String(pts)} ms={800} /> : pts);
  return (
    <section
      className={`gd-final${story ? ` gd-story w${story.weight}` : ''}${moment ? ' gd-moment' : ''}`}
      aria-label={`Final: ${away.name} ${res.away.pts}, ${home.name} ${res.home.pts}`}
    >
      <GameBoard
        league={league}
        away={{ tid: away.tid, fig: fig(res.away.pts), lost: res.away.pts < res.home.pts }}
        home={{ tid: home.tid, fig: fig(res.home.pts), lost: res.home.pts < res.away.pts }}
        over={[
          // (a regular-season night's occasion in place of "Regular season": a series, the play-in and the Cup say theirs)
          story?.kicker && res.type === 'regular' && !res.cup ? story.kicker : gameTypeLabel(league, res),
          `${fmtDate(res.season, res.day, { weekday: 'short', month: 'short', day: 'numeric' })}${res.att ? ` · Att ${res.att.toLocaleString()}` : ''}`,
        ]}
        mid={
          <>
            <span className="gd-bd-k">{res.ot ? finalLabel(res.ot) : 'Final'}</span>
            {us && <span className={`gd-bd-wl ${won ? 'w' : 'l'}`}>{won ? 'Win' : 'Loss'}</span>}
          </>
        }
      />
      {story && <StoryBlock league={league} story={story} moment={moment} />}
      {linescore && <QuarterTable g={res} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />}
      {children && <div className="gd-fs-actions">{children}</div>}
    </section>
  );
}

/** The result as the night's story: the headline and its dek, the hero's jersey and line, and what it means (the full story a tap away in the news). */
function StoryBlock({ league, story, moment }: { league: League; story: GameStory; moment?: boolean }) {
  const hero = story.hero !== undefined ? league.players[story.hero] : undefined;
  return (
    <div className="gd-sb">
      <h2 className={`gd-sb-head${moment ? ' rise' : ''}`}>{story.head}</h2>
      {story.dek && <p className="gd-sb-dek">{story.dek}</p>}
      {hero && story.heroLine && (
        <Link to={`/player/${hero.pid}`} className="gd-sb-hero">
          <Avatar p={hero} size="lg" />
          <span className="gd-sb-who">
            <span className="gd-sb-k">{story.won ? 'Player of the game' : 'Best of the night'}</span>
            <span className="gd-sb-name ellipsis">
              {hero.firstName} {hero.lastName}
            </span>
            <span className="gd-sb-line num">{story.heroLine}</span>
          </span>
        </Link>
      )}
      {story.means.length > 0 && (
        <ul className="gd-sb-means" aria-label="What it means">
          {story.means.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {story.newsId !== undefined && (
        <Link to={`/league/news?story=${story.newsId}`} className="gd-sb-read">
          The story <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
