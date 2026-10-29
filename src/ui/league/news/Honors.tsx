// This season's weekly and monthly honors: Player of the Week by conference, and Player, Rookie and
// Coach of the Month. On the News front page (the latest) and in Awards (the season's).
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { League } from '../../../core/types';
import type { Honor } from '../../../core/league/media';
import { activeCoach } from '../../../core/league/coaches';
import { playerName } from '../../../core/league/helpers';
import { Avatar, keep } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { teamPath } from '../shared';
import { newsDate } from './Linked';
import './news.css';

export const HONOR_LABEL: Record<Honor['kind'], string> = {
  potw: 'Player of the Week',
  potm: 'Player of the Month',
  rotm: 'Rookie of the Month',
  cotm: 'Coach of the Month',
};

const confWord = (c?: 'E' | 'W') => (c === 'E' ? 'East' : c === 'W' ? 'West' : '');

/**
 * One honor: the jersey (a coach: his team's mark), who, and what for (`brief`: the front page's,
 * the line why waits in Awards → Honors). In the season's list the honor and its date head the
 * group, so a row is who, his conference and the line why.
 */
export function HonorRow({ league, h, brief, grouped }: { league: League; h: Honor; brief?: boolean; grouped?: boolean }) {
  const p = h.pid !== undefined ? league.players[h.pid] : undefined;
  const coach = h.pid === undefined ? (activeCoach(league, h.tid)?.name ?? league.teams[h.tid]?.coach.name) : undefined;
  const to = p ? `/player/${p.pid}` : teamPath(h.tid);
  return (
    <Link to={to} className={`listrow clickable lg-hon ${brief ? 'brief' : ''} ${h.tid === league.userTid ? 'me' : ''}`}>
      {p ? <Avatar p={p} /> : <TeamLogo tid={h.tid} size={36} decorative />}
      <span className="lg-hon-t">
        <span className="lr-name lg-hon-name">
          <span className="ellipsis">{p ? playerName(p) : coach}</span>
          {grouped && h.conf && <span className="tag">{confWord(h.conf)}</span>}
        </span>
        {!grouped && (
          <span className="lg-hon-what">
            {confWord(h.conf)} {HONOR_LABEL[h.kind].toLowerCase()} · {newsDate(league, h, false)}
          </span>
        )}
        {!brief && <span className="lr-meta lg-hon-line">{keep(h.line.charAt(0).toUpperCase() + h.line.slice(1))}</span>}
      </span>
    </Link>
  );
}

/** Honors as a list, newest first, each week's or month's under its name and date. */
export function HonorsList({ league, honors }: { league: League; honors: Honor[] }) {
  if (!honors.length) return <div className="card empty">No honors yet. The first players of the week come after the season&apos;s first week.</div>;
  let last = '';
  return (
    <div className="card flush list">
      {honors.map((h) => {
        const group = `${h.day}-${h.kind}`;
        const head = group !== last;
        last = group;
        return (
          <Fragment key={`${h.season}-${h.day}-${h.kind}-${h.conf}-${h.pid ?? h.tid}`}>
            {head && (
              <div className="list-divider">
                {HONOR_LABEL[h.kind]} · {newsDate(league, h, false)}
              </div>
            )}
            <HonorRow league={league} h={h} grouped />
          </Fragment>
        );
      })}
    </div>
  );
}

/** The latest of each kind, per conference: what the front page shows. */
export function latestHonors(honors: Honor[]): Honor[] {
  const seen = new Set<string>();
  const out: Honor[] = [];
  // newest first in, one per kind and conference
  for (const h of honors) {
    const k = `${h.kind}-${h.conf}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  const order: Honor['kind'][] = ['potw', 'potm', 'rotm', 'cotm'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.conf ?? '').localeCompare(b.conf ?? ''));
}
