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
import { Avatar, CountUp, Statline } from './ui';
import { madeAtt } from '../../core/format';
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
 * The two teams' colours as the board wears them, [home, away]: for a game's charts on the paper (the
 * shot charts, win probability, the margin), so each team reads in the colour its half of the poster
 * has, deep enough to read on paper.
 */
export function boardColors(league: League, g: { home: { tid: number }; away: { tid: number } }): [string, string] {
  const [h, a] = matchupLooks(league.teams[g.home.tid].colors, league.teams[g.away.tid].colors);
  return [h.slab, a.slab];
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
  className = '',
  children,
}: {
  league: League;
  away: BoardSide;
  home: BoardSide;
  over: [ReactNode, ReactNode?];
  mid?: ReactNode;
  links?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [h, a] = [league.teams[home.tid], league.teams[away.tid]];
  // (on a clash the away side wears its second colour, so the two halves never read as one)
  const [lh, la] = matchupLooks(h.colors, a.colors);
  const side = (s: BoardSide, isHome: boolean) => {
    const t = league.teams[s.tid];
    const cls = `gd-bd-team${isHome ? ' home' : ''}${s.lost ? ' lost' : ''}`;
    const id = (
      <>
        <TeamLogo tid={t.tid} size={24} decorative />
        <span className="gd-bd-who">
          {/* (a long name gives way to its abbreviation on a phone) */}
          <span className={`gd-bd-nm${t.name.length > 9 ? ' long' : ''}`}>{t.name}</span>
          {t.name.length > 9 && <span className="gd-bd-nm short">{t.abbrev}</span>}
          {s.sub && <span className="gd-bd-sub num">{s.sub}</span>}
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
    <div className={`gd-board ${className}`} style={{ '--fa': la.slab, '--fh': lh.slab } as CSSProperties}>
      <div className="gd-bd-over">
        <span>{over[0]}</span>
        {over[1] && <span>{over[1]}</span>}
      </div>
      <div className="gd-bd-row">
        {sa.fig}
        {sh.fig}
      </div>
      <div className="gd-bd-ids">
        {sa.id}
        <span className="gd-bd-mid">{mid}</span>
        {sh.id}
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
  const by = Math.abs(res.home.pts - res.away.pts);
  const fig = (pts: number) => (moment ? <CountUp value={String(pts)} ms={800} /> : pts);
  // the occasion over the board: a regular-season night's own (opening night, a rivalry) or the attendance; a series, the play-in and the Cup say theirs
  const kind = gameTypeLabel(league, res);
  const occasion = story?.kicker && res.type === 'regular' && !res.cup ? story.kicker : kind !== 'Regular season' ? kind : res.att ? `Att ${res.att.toLocaleString()}` : '';
  return (
    <section
      className={`gd-final${story ? ` gd-story w${story.weight}` : ''}${moment ? ' gd-moment' : ''}`}
      aria-label={`Final: ${away.name} ${res.away.pts}, ${home.name} ${res.home.pts}`}
    >
      <GameBoard
        league={league}
        away={{ tid: away.tid, fig: fig(res.away.pts), lost: res.away.pts < res.home.pts }}
        home={{ tid: home.tid, fig: fig(res.home.pts), lost: res.home.pts < res.away.pts }}
        over={[`${res.ot ? finalLabel(res.ot) : 'Final'} · ${fmtDate(res.season, res.day, { weekday: 'short', month: 'short', day: 'numeric' })}`, occasion]}
        mid={
          us ? (
            <span className={`gd-bd-pill ${won ? 'w' : 'l'}`}>
              {won ? 'Won' : 'Lost'} by {by}
            </span>
          ) : (
            <span className="gd-bd-pill">
              {(res.home.pts > res.away.pts ? home : away).abbrev} by {by}
            </span>
          )
        }
      />
      {story && <StoryBlock league={league} res={res} story={story} moment={moment} />}
      {linescore && <QuarterTable g={res} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />}
      {children && <div className="gd-fs-actions">{children}</div>}
    </section>
  );
}

/**
 * The result as the night's story, printed under the board: the headline and its dek, the player of
 * the game with his line as a box score's figures, and what it means (the full story a tap away in
 * the news).
 */
function StoryBlock({ league, res, story, moment }: { league: League; res: GameResult; story: GameStory; moment?: boolean }) {
  const hero = story.hero !== undefined ? league.players[story.hero] : undefined;
  const line = hero ? [...res.home.players, ...res.away.players].find((b) => b.pid === hero.pid) : undefined;
  const figs = line
    ? [
        { k: 'PTS', v: String(line.pts) },
        { k: 'REB', v: String(line.orb + line.drb) },
        { k: 'AST', v: String(line.ast) },
        ...(line.stl >= 4 ? [{ k: 'STL', v: String(line.stl) }] : []),
        ...(line.blk >= 4 ? [{ k: 'BLK', v: String(line.blk) }] : []),
        { k: 'FG', v: madeAtt(line.fgm, line.fga) },
      ]
    : [];
  return (
    <div className="gd-sb">
      <h2 className={`gd-sb-head${moment ? ' rise' : ''}`}>{story.head}</h2>
      {story.dek && <p className="gd-sb-dek">{story.dek}</p>}
      {hero && (line || story.heroLine) && (
        <div className="gd-sb-pog">
          <Link to={`/player/${hero.pid}`} className="gd-sb-hero">
            <Avatar p={hero} />
            <span className="gd-sb-who">
              <span className="over">{story.won ? 'Player of the game' : 'Best of the night'}</span>
              <span className="gd-sb-name ellipsis">
                {hero.firstName} {hero.lastName}
              </span>
            </span>
            <ChevronRight size={16} className="gd-sb-chev" aria-hidden="true" />
          </Link>
          {line ? <Statline items={figs} /> : <span className="gd-sb-line num">{story.heroLine}</span>}
        </div>
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
