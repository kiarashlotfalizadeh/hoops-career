// The News tab's front page: the lead story (the biggest recent one, your team's first), the next
// headlines, the latest power rankings (the top five and your team) and the latest honors. The wire
// (every item, by day) follows it on the News tab.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, NewsItem } from '../../../core/types';
import { frontPage, latestPower, seasonHonors } from '../../../core/league/media';
import { useLeagueMemo } from '../../../state/store';
import { Section } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { aboutUser } from '../../../core/league/media/voice';
import { KIND_ONE, NEWS_KIND } from './kinds';
import { HonorRow, latestHonors } from './Honors';
import { newsDate } from './Linked';
import { PowerList } from './PowerList';
import { useStoryHref } from './StoryReader';
import './news.css';

export function FrontPage({ league, mine }: { league: League; mine: boolean }) {
  const href = useStoryHref();
  const { lead, headlines } = useLeagueMemo(() => frontPage(league, 6, mine ? (n) => aboutUser(league, n) : undefined), [league, mine]);
  const power = latestPower(league);
  const honors = useLeagueMemo(() => latestHonors(seasonHonors(league)).filter((h) => h.kind === 'potw' || h.kind === 'potm'), [league]);
  if (!lead && !power && !honors.length) return null;
  return (
    <>
      {lead && <Lead league={league} n={lead} to={href(lead.id)} />}
      {headlines.length > 0 && (
        <Section title="Headlines">
          <div className="card flush list">
            {headlines.map((n) => (
              <Headline key={n.id} league={league} n={n} to={href(n.id)} />
            ))}
          </div>
        </Section>
      )}
      {power && !mine && <PowerSection league={league} />}
      {honors.length > 0 && !mine && (
        <Section
          title="Honors"
          right={
            <Link to="/league/awards?av=honors" className="card-link">
              This season <ChevronRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          <div className="card flush list">
            {honors.map((h) => (
              <HonorRow key={`${h.kind}-${h.conf}`} league={league} h={h} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/** The lead: its kind and date, a display headline, the dek, and the team it's about. */
function Lead({ league, n, to }: { league: League; n: NewsItem; to: string }) {
  const M = NEWS_KIND[n.kind] ?? NEWS_KIND.general;
  const tid = n.tids.find((t) => t === league.userTid) ?? n.tids[0];
  return (
    <Link to={to} className={`card lg-fp-lead w${n.weight ?? 1}`}>
      <span className="lg-fp-over over">
        <M.icon size={13} aria-hidden="true" style={{ color: M.color }} /> {KIND_ONE[n.kind]} · {newsDate(league, n)}
      </span>
      <span className="lg-fp-main">
        <span className="lg-fp-head">{n.head}</span>
        {tid !== undefined && league.teams[tid] && <TeamLogo tid={tid} size={44} decorative />}
      </span>
      <span className="lg-fp-dek">{n.text}</span>
      <span className="lg-fp-read">
        Read <ChevronRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}

function Headline({ league, n, to }: { league: League; n: NewsItem; to: string }) {
  const M = NEWS_KIND[n.kind] ?? NEWS_KIND.general;
  const tid = n.tids.find((t) => t === league.userTid) ?? n.tids[0];
  return (
    <Link to={to} className="listrow clickable lg-fp-hl">
      {tid !== undefined && league.teams[tid] ? <TeamLogo tid={tid} size={30} decorative /> : <M.icon size={18} aria-hidden="true" />}
      <span className="lg-fp-hl-t">
        <span className="lg-fp-hl-head">{n.head}</span>
        <span className="lr-meta">
          {KIND_ONE[n.kind]} · {newsDate(league, n)}
        </span>
      </span>
    </Link>
  );
}

/** The top five and your team, your row's line in full; the whole list is on Standings → Power. */
function PowerSection({ league }: { league: League }) {
  const p = league.media!.power!;
  const rows = p.rows.filter((r) => r.rank <= 5 || r.tid === league.userTid);
  return (
    <Section
      title={`Power rankings · week ${Math.max(1, Math.round(p.day / 7))}`}
      right={
        <Link to="/league/standings?view=power" className="card-link">
          All 30 <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <PowerList league={league} rows={rows} blurbs={(r) => r.tid === league.userTid || r.rank === 1} />
    </Section>
  );
}
