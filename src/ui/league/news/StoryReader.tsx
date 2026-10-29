// The story reader: a sheet over the News tab opened by /league/news?story=<newsId> (any screen links
// there), with the headline, the dek, the body, and the players and teams it is about.
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, NewsItem } from '../../../core/types';
import { storyById } from '../../../core/league/media';
import { Sheet } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { shortName, teamPath, useSetParams } from '../shared';
import { KIND_ONE } from './kinds';
import { linkedText, mentions, newsDate } from './Linked';
import './news.css';

/** The current search with `story` set: a story row's link, keeping the tab's filters. */
export function useStoryHref(): (id: number) => string {
  const [sp] = useSearchParams();
  return useCallback(
    (id: number) => {
      const n = new URLSearchParams(sp);
      n.set('story', String(id));
      return `?${n}`;
    },
    [sp],
  );
}

export function StoryReader({ league }: { league: League }) {
  const [sp] = useSearchParams();
  const setParams = useSetParams();
  const raw = sp.get('story');
  const id = raw !== null ? Number(raw) : NaN;
  const n = Number.isFinite(id) ? storyById(league, id) : undefined;
  return (
    <Sheet open={raw !== null} onClose={() => setParams({ story: null })} title={n ? (n.head ?? KIND_ONE[n.kind]) : 'Story'}>
      {n ? <Story league={league} n={n} /> : <div className="empty">This story is no longer on file. The news keeps about a season.</div>}
    </Sheet>
  );
}

function Story({ league, n }: { league: League; n: NewsItem }) {
  const tids = [...new Set(n.tids)].filter((t) => league.teams[t]);
  const pids = [...new Set(n.pids)].filter((p) => league.players[p]);
  // each player and team is linked once, at its first mention in the story
  const linked = new Set<string>();
  const dek = linkedText(n.text, mentions(league, n.text, pids, tids, linked));
  const paras = (n.body ?? '').split('\n\n').filter(Boolean);
  return (
    <article className="lg-story">
      <div className="lg-story-over over">
        {KIND_ONE[n.kind]} · {newsDate(league, n)}
      </div>
      <p className="lg-story-dek">{dek}</p>
      {paras.map((p, i) => (
        <p key={i} className="lg-story-p">
          {p.split('\n').map((line, j) => (
            <span key={j} className={p.includes('\n') ? 'lg-story-line' : undefined}>
              {linkedText(line, mentions(league, line, pids, tids, linked))}
            </span>
          ))}
        </p>
      ))}
      {!paras.length && n.head && <p className="lg-story-p dim">Only the headline is still on file.</p>}
      {n.kind === 'power' && (
        <Link to="/league/standings?view=power" className="card-link lg-story-more">
          All 30 teams <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
      {(tids.length > 0 || pids.length > 0) && (
        <div className="lg-story-about">
          <div className="over">In this story</div>
          <div className="lg-story-chips">
            {tids.map((t) => (
              <Link key={`t${t}`} to={teamPath(t)} className="lg-pchip team">
                <TeamLogo tid={t} size={18} decorative />
                <span>{league.teams[t].name}</span>
              </Link>
            ))}
            {pids.slice(0, 8).map((pid) => (
              <Link key={`p${pid}`} to={`/player/${pid}`} className="lg-pchip">
                <span>{shortName(league.players[pid])}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
