import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Flame,
  HeartPulse,
  Hourglass,
  ListChecks,
  ListOrdered,
  Megaphone,
  Newspaper,
  PenLine,
  Trophy,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import type { League, NewsItem } from '../../core/types';
import { fmtDate, playerName } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { shortName, teamPath, useQueryParam } from './shared';
import { LeagueMoves } from './MovesTab';

type Kind = NewsItem['kind'];

export const NEWS_KIND: Record<Kind, { label: string; icon: LucideIcon; color: string }> = {
  trade: { label: 'Trades', icon: ArrowLeftRight, color: 'var(--info)' },
  rumor: { label: 'Rumors', icon: Megaphone, color: 'var(--warn)' },
  signing: { label: 'Signings', icon: PenLine, color: 'var(--good)' },
  release: { label: 'Releases', icon: UserMinus, color: 'var(--text-2)' },
  injury: { label: 'Injuries', icon: HeartPulse, color: 'var(--bad)' },
  award: { label: 'Awards', icon: Trophy, color: 'var(--tier-elite)' },
  draft: { label: 'Draft', icon: ListOrdered, color: 'var(--tier-star)' },
  milestone: { label: 'Milestones', icon: Flame, color: 'var(--warn)' },
  record: { label: 'Records', icon: BookOpen, color: 'var(--tier-elite)' },
  coach: { label: 'Coaches', icon: ClipboardList, color: 'var(--info)' },
  retire: { label: 'Retirements', icon: Hourglass, color: 'var(--text-2)' },
  general: { label: 'General', icon: Newspaper, color: 'var(--text-2)' },
};

const ORDER: Kind[] = ['trade', 'rumor', 'signing', 'injury', 'award', 'draft', 'milestone', 'record', 'coach', 'release', 'retire', 'general'];
const PAGE = 50;

/** The league's news, by kind; Transactions is the whole league's moves log. */
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
  const filtered = sorted.filter(
    (n) => (kind === 'all' || n.kind === kind) && (mine === '0' || n.tids.includes(league.userTid) || n.pids.some((pid) => league.players[pid]?.tid === league.userTid)),
  );
  const shown = filtered.slice(0, limit);

  let lastKey = '';
  return (
    <>
      <div className="lg-hscroll" role="group" aria-label="Filter news">
        <button className={`chip ${mine === '1' ? 'on' : ''}`} aria-pressed={mine === '1'} onClick={() => setMine(mine === '1' ? '0' : '1')}>
          <TeamLogo tid={league.userTid} size={16} /> My team
        </button>
        <span className="lg-vsep" />
        <button className={`chip ${kind === 'all' ? 'on' : ''}`} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
          All
        </button>
        <button className={`chip ${kind === 'moves' ? 'on' : ''}`} aria-pressed={kind === 'moves'} onClick={() => setKind('moves')}>
          <ListChecks size={14} className="lg-kind" style={{ ['--k' as string]: 'var(--text-2)' }} />
          Transactions
        </button>
        {ORDER.filter((k) => counts[k]).map((k) => {
          const M = NEWS_KIND[k];
          return (
            <button key={k} className={`chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              <M.icon size={14} className="lg-kind" style={{ ['--k' as string]: M.color }} />
              {M.label}
            </button>
          );
        })}
      </div>
      {kind === 'moves' ? (
        <LeagueMoves league={league} mine={mine === '1'} />
      ) : shown.length === 0 ? (
        <div className="card empty">{sorted.length ? 'No stories match this filter.' : 'No news yet: trades, signings, injuries and big games land here.'}</div>
      ) : (
        <div className="card flush">
          {shown.map((n) => {
            const key = `${n.season}:${n.day}`;
            const header = key !== lastKey;
            lastKey = key;
            return (
              <Fragment key={n.id}>
                {header && (
                  <div className="list-divider">
                    {/* a date outside this season carries its year (last summer's "Jul 29" is 2038's, not 2037-38's) */}
                    {fmtDate(n.season, n.day, { weekday: 'short', month: 'short', day: 'numeric', ...(n.season !== league.season ? { year: 'numeric' } : {}) })}
                  </div>
                )}
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
      )}
    </>
  );
}

/** Where a name sits in a story's text, and where its link goes. */
interface Mention {
  at: number;
  end: number;
  to: string;
  /** The player or team it names (each linked once). */
  id: string;
}

/** Every place the text names one of the story's players or teams (as a whole word), each player and team linked at its first mention. */
function mentions(league: League, text: string, pids: number[], tids: number[]): Mention[] {
  const names: { name: string; to: string; id: string }[] = [];
  for (const pid of pids) names.push({ name: playerName(league.players[pid]), to: `/player/${pid}`, id: `p${pid}` });
  for (const tid of tids) {
    const t = league.teams[tid];
    for (const name of [`${t.region} ${t.name}`, t.name, t.abbrev]) names.push({ name, to: teamPath(tid), id: `t${tid}` });
  }
  const word = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
  const found: Mention[] = [];
  for (const m of names) {
    if (!m.name) continue;
    for (let at = text.indexOf(m.name); at >= 0; at = text.indexOf(m.name, at + 1)) {
      const end = at + m.name.length;
      if (!word(text[at - 1]) && !word(text[end])) found.push({ at, end, to: m.to, id: m.id });
    }
  }
  // the longest name wins where two overlap ("Los Angeles Lakers" over "Lakers"); then each one once
  found.sort((a, b) => a.at - b.at || b.end - a.end);
  const out: Mention[] = [];
  const linked = new Set<string>();
  for (const m of found) {
    if (out.length && m.at < out[out.length - 1].end) continue;
    if (linked.has(m.id)) continue;
    linked.add(m.id);
    out.push(m);
  }
  return out;
}

/** A story: its kind's icon, then its sentence with the players and teams it names as links (any it doesn't name follow as chips). */
export function NewsRow({ league, n }: { league: League; n: NewsItem }) {
  const M = NEWS_KIND[n.kind] ?? NEWS_KIND.general;
  const tids = [...new Set(n.tids)].filter((t) => league.teams[t]);
  const pids = [...new Set(n.pids)].filter((p) => league.players[p]);
  const ms = mentions(league, n.text, pids, tids);
  const named = new Set(ms.map((m) => m.id));
  const restT = tids.filter((t) => !named.has(`t${t}`)).slice(0, 3);
  const restP = pids.filter((p) => !named.has(`p${p}`));
  const showP = restP.slice(0, 3);
  const parts: ReactNode[] = [];
  let from = 0;
  for (const m of ms) {
    if (m.at > from) parts.push(n.text.slice(from, m.at));
    parts.push(
      <Link key={m.at} to={m.to} className="lg-news-link">
        {n.text.slice(m.at, m.end)}
      </Link>,
    );
    from = m.end;
  }
  parts.push(n.text.slice(from));
  return (
    <div className="lg-news">
      <span className="lg-ic" style={{ ['--k' as string]: M.color }} aria-hidden="true">
        <M.icon size={15} />
      </span>
      <div className="lg-news-body">
        <span className="lg-news-text">{parts}</span>
        {(restT.length > 0 || showP.length > 0) && (
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
