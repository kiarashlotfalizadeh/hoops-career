import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { League, NewsItem } from '../../core/types';
import { aboutUser } from '../../core/league/media/voice';
import { useLeagueMemo } from '../../state/store';
import { Section } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { shortName, teamPath, useQueryParam } from './shared';
import { LeagueMoves } from './MovesTab';
import { NEWS_KIND, type Kind } from './news/kinds';
import { FrontPage } from './news/FrontPage';
import { StoryReader, useStoryHref } from './news/StoryReader';
import { linkedText, mentions, newsDate } from './news/Linked';
import './news/news.css';

export { NEWS_KIND };

const ORDER: Kind[] = [
  'game',
  'power',
  'honor',
  'column',
  'preview',
  'trade',
  'rumor',
  'signing',
  'injury',
  'award',
  'draft',
  'milestone',
  'record',
  'coach',
  'release',
  'retire',
  'general',
];
const PAGE = 50;

/**
 * The league's news. All opens on the front page (the lead story, the headlines, the power rankings
 * and the honors) over the wire, every item by day; the chips filter the wire by kind, My team to
 * your team's, and Transactions is the whole league's moves log. A story opens in the reader
 * (?story=<id>).
 */
export function NewsTab({ league }: { league: League }) {
  const [kind, setKind] = useQueryParam<'all' | 'moves' | Kind>('kind', 'all', ['all', 'moves', ...ORDER]);
  const [mine, setMine] = useQueryParam<'0' | '1'>('mynews', '0', ['0', '1']);
  const [limit, setLimit] = useState(PAGE);
  const sorted = useLeagueMemo(() => [...league.news].sort((a, b) => b.season - a.season || b.day - a.day || b.id - a.id), [league]);
  const counts = useMemo(() => {
    const c: Partial<Record<Kind, number>> = {};
    for (const n of sorted) c[n.kind] = (c[n.kind] ?? 0) + 1;
    return c;
  }, [sorted]);
  const filtered = sorted.filter((n) => (kind === 'all' || n.kind === kind) && (mine === '0' || aboutUser(league, n)));
  const shown = filtered.slice(0, limit);
  const front = kind === 'all';

  let lastKey = '';
  const wire =
    shown.length === 0 ? (
      <div className="card empty">{sorted.length ? 'No stories match this filter.' : 'No news yet: trades, signings, injuries and big games land here.'}</div>
    ) : (
      <div className="lg-wire">
        {shown.map((n) => {
          const key = `${n.season}:${n.day}`;
          const header = key !== lastKey;
          lastKey = key;
          return (
            <Fragment key={n.id}>
              {/* a date outside this season carries its year (last summer's "Jul 29" is 2038's, not 2037-38's) */}
              {header && <div className="lg-wire-day">{newsDate(league, n)}</div>}
              <NewsRow league={league} n={n} />
            </Fragment>
          );
        })}
        {filtered.length > shown.length && (
          <button className="lg-more" onClick={() => setLimit(limit + PAGE)}>
            <ChevronDown size={15} /> Show more ({filtered.length - shown.length})
          </button>
        )}
      </div>
    );

  return (
    <>
      <div className="lg-views">
        <div className="lg-views-row" role="group" aria-label="Filter news">
          <button className={`chip lg-minechip ${mine === '1' ? 'on' : ''}`} aria-pressed={mine === '1'} onClick={() => setMine(mine === '1' ? '0' : '1')}>
            <TeamLogo tid={league.userTid} size={16} decorative /> My team
          </button>
          <span className="lg-vsep" />
          <button className={`chip ${kind === 'all' ? 'on' : ''}`} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
            All
          </button>
          <button className={`chip ${kind === 'moves' ? 'on' : ''}`} aria-pressed={kind === 'moves'} onClick={() => setKind('moves')}>
            Transactions
          </button>
          {ORDER.filter((k) => counts[k]).map((k) => (
            <button key={k} className={`chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {NEWS_KIND[k].label}
            </button>
          ))}
        </div>
      </div>
      {kind === 'moves' ? (
        <LeagueMoves league={league} mine={mine === '1'} />
      ) : front ? (
        <>
          <FrontPage league={league} mine={mine === '1'} />
          {sorted.length > 0 ? <Section title="Latest">{wire}</Section> : wire}
        </>
      ) : (
        wire
      )}
      <StoryReader league={league} />
    </>
  );
}

/**
 * One item on the wire: its sentence with the players and teams it names as links (any it doesn't
 * name follow as chips). A story leads with its headline, which opens it.
 */
export function NewsRow({ league, n }: { league: League; n: NewsItem }) {
  const href = useStoryHref();
  const tids = [...new Set(n.tids)].filter((t) => league.teams[t]);
  const pids = [...new Set(n.pids)].filter((p) => league.players[p]);
  const ms = mentions(league, n.text, pids, tids);
  const named = new Set(ms.map((m) => m.id));
  const restT = tids.filter((t) => !named.has(`t${t}`)).slice(0, 3);
  const restP = pids.filter((p) => !named.has(`p${p}`));
  const showP = restP.slice(0, 3);
  return (
    <div className={`lg-news ${n.head ? 'story' : ''} ${(n.weight ?? 1) >= 3 ? 'big' : ''}`}>
      <div className="lg-news-body">
        {n.head && (
          <Link to={href(n.id)} className="lg-news-head">
            {n.head}
          </Link>
        )}
        <span className={n.head ? 'lg-news-dek' : 'lg-news-text'}>{linkedText(n.text, ms)}</span>
        {!n.head && (restT.length > 0 || showP.length > 0) && (
          <span className="lg-news-meta">
            {restT.map((t) => (
              <Link key={`t${t}`} to={teamPath(t)} className="lg-pchip team">
                <TeamLogo tid={t} size={18} decorative />
                <span>{league.teams[t].abbrev}</span>
              </Link>
            ))}
            {showP.map((pid) => (
              <Link key={`p${pid}`} to={`/player/${pid}`} className="lg-pchip">
                <span>{shortName(league.players[pid])}</span>
              </Link>
            ))}
            {restP.length > showP.length && <span className="lg-news-more">+{restP.length - showP.length} more</span>}
          </span>
        )}
      </div>
    </div>
  );
}
