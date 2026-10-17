import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Flame,
  Gavel,
  HeartPulse,
  Hourglass,
  ListOrdered,
  Megaphone,
  Newspaper,
  PenLine,
  Trophy,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import type { League, NewsItem } from '../../core/types';
import { fmtDate } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Empty } from '../components/ui';
import { shortName, useQueryParam } from './shared';

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
  discipline: { label: 'Discipline', icon: Gavel, color: 'var(--bad)' },
  retire: { label: 'Retirements', icon: Hourglass, color: 'var(--text-2)' },
  general: { label: 'General', icon: Newspaper, color: 'var(--text-2)' },
};

const ORDER: Kind[] = ['trade', 'rumor', 'signing', 'injury', 'discipline', 'award', 'draft', 'milestone', 'record', 'coach', 'release', 'retire', 'general'];
const PAGE = 50;

export function NewsTab({ league }: { league: League }) {
  const [kind, setKind] = useQueryParam<'all' | Kind>('kind', 'all', ['all', ...ORDER]);
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
      <div className="lg-hscroll">
        <button className={`chip ${mine === '1' ? 'on' : ''}`} aria-pressed={mine === '1'} onClick={() => setMine(mine === '1' ? '0' : '1')}>
          <TeamLogo tid={league.userTid} size={16} /> My team
        </button>
        <span className="lg-vsep" />
        <button className={`chip ${kind === 'all' ? 'on' : ''}`} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
          All
        </button>
        {ORDER.filter((k) => counts[k]).map((k) => {
          const M = NEWS_KIND[k];
          return (
            <button key={k} className={`chip ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              <M.icon size={14} style={{ color: M.color }} />
              {M.label}
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <Card>
          <Empty>{sorted.length ? 'No stories match this filter.' : 'No news yet. Trades, signings, injuries and big performances will show up here.'}</Empty>
        </Card>
      ) : (
        <Card className="flush lg-flat">
          {shown.map((n) => {
            const key = `${n.season}:${n.day}`;
            const header = key !== lastKey;
            lastKey = key;
            return (
              <Fragment key={n.id}>
                {header && (
                  <div className="lg-date-h">
                    {fmtDate(n.season, n.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                    {n.season !== league.season ? ` · ${seasonLabel(n.season)}` : ''}
                  </div>
                )}
                <NewsRow league={league} n={n} />
              </Fragment>
            );
          })}
          {filtered.length > shown.length && (
            <button className="lg-more" style={{ borderBottom: 'none', borderTop: '1px solid var(--line)' }} onClick={() => setLimit(limit + PAGE)}>
              <ChevronDown size={15} /> Show more ({filtered.length - shown.length})
            </button>
          )}
        </Card>
      )}
    </>
  );
}

export function NewsRow({ league, n }: { league: League; n: NewsItem }) {
  const M = NEWS_KIND[n.kind] ?? NEWS_KIND.general;
  const tids = [...new Set(n.tids)].filter((t) => league.teams[t]).slice(0, 4);
  const pids = [...new Set(n.pids)].filter((p) => league.players[p]);
  const showP = pids.slice(0, 3);
  return (
    <div className="lg-news">
      <span className="lg-ic" style={{ background: `color-mix(in srgb, ${M.color} 16%, var(--surface-3))`, color: M.color }}>
        <M.icon size={16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="lg-news-text">{n.text}</div>
        {(tids.length > 0 || showP.length > 0) && (
          <div className="lg-news-meta">
            {tids.map((t) => (
              <Link key={`t${t}`} to={`/team/${t}`} className="lg-pchip" style={{ paddingLeft: 3 }}>
                <TeamLogo tid={t} size={18} />
                <span>{league.teams[t].abbrev}</span>
              </Link>
            ))}
            {showP.map((pid) => (
              <Link key={`p${pid}`} to={`/player/${pid}`} className="lg-pchip">
                <span>{shortName(league.players[pid])}</span>
              </Link>
            ))}
            {pids.length > showP.length && <span className="tiny dim">+{pids.length - showP.length} more</span>}
          </div>
        )}
      </div>
    </div>
  );
}
