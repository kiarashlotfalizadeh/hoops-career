// A game's result as a newspaper's game story, at the top of its report and of the live game's final
// card: the scoreboard in both teams' colours (the score, whether the user won), then for his games
// the result as an event on the page: the headline in the serif and its dek, the player of the
// game's jersey and line, and what it means (the story from gameStory.ts), over the linescore. The first time a result
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

/**
 * The result: the scoreboard in both teams' colours with whether the user won, the story, the
 * linescore. `children` go under it (the final card's buttons).
 */
export function FinalSlab({
  res,
  league,
  story,
  moment,
  children,
}: {
  res: GameResult;
  league: League;
  /** The user's game told as a story: its headline, hero and what it means. */
  story?: GameStory | null;
  /** The result showing for the first time: the score counts up. */
  moment?: boolean;
  children?: ReactNode;
}) {
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  // (on a clash the away side wears its second colour, so the two halves never read as one)
  const [lh, la] = matchupLooks(home.colors, away.colors);
  const us = res.home.tid === league.userTid ? res.home : res.away.tid === league.userTid ? res.away : null;
  const won = !!us && us.pts > (us === res.home ? res.away : res.home).pts;
  const side = (t: typeof home, pts: number, win: boolean, isHome: boolean) => (
    <Link to={t.tid === league.userTid ? '/team' : `/teams/${t.tid}`} className={`gd-fs-team${isHome ? ' home' : ''}${win ? '' : ' lost'}`}>
      <span className="gd-fs-id">
        <TeamLogo tid={t.tid} size={36} decorative />
        <span className="gd-fs-ab">{t.abbrev}</span>
      </span>
      <span className="gd-fs-pts num">{moment ? <CountUp value={String(pts)} ms={800} /> : pts}</span>
    </Link>
  );
  return (
    <section
      className={`gd-final${story ? ` gd-story w${story.weight}` : ''}${moment ? ' gd-moment' : ''}`}
      aria-label={`Final: ${away.name} ${res.away.pts}, ${home.name} ${res.home.pts}`}
      style={{ '--fa': la.slab, '--fh': lh.slab, '--ta': la.trim, '--th': lh.trim } as CSSProperties}
    >
      <div className="gd-fs-board">
        <div className="gd-fs-over">
          {/* (a regular-season night's occasion in place of "Regular season": a series, the play-in and the Cup say theirs) */}
          <span>{story?.kicker && res.type === 'regular' && !res.cup ? story.kicker : gameTypeLabel(league, res)}</span>
          <span>
            {fmtDate(res.season, res.day, { weekday: 'short', month: 'short', day: 'numeric' })}
            {res.att ? ` · Att ${res.att.toLocaleString()}` : ''}
          </span>
        </div>
        <div className="gd-fs-row">
          {side(away, res.away.pts, res.away.pts > res.home.pts, false)}
          <div className="gd-fs-mid">
            <span className="gd-fs-final">{res.ot ? finalLabel(res.ot) : 'Final'}</span>
            {us && <span className={`gd-fs-wl ${won ? 'w' : 'l'}`}>{won ? 'Win' : 'Loss'}</span>}
          </div>
          {side(home, res.home.pts, res.home.pts > res.away.pts, true)}
        </div>
      </div>
      {story && <StoryBlock league={league} story={story} moment={moment} />}
      <QuarterTable g={res} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
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
