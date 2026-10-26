// The News tab's front page: the lead story (the biggest recent one, your team's first), the top
// stories (the first three in the headline cut, the rest as plain lines), the latest power rankings
// (the top five and your team) and the latest honors. The wire (every item, by day, as a plain list)
// follows it on the News tab.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, NewsItem } from '../../../core/types';
import { frontPage, latestPower, seasonHonors } from '../../../core/league/media';
import { useLeagueMemo } from '../../../state/store';
import { Section, keep } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { aboutUser } from '../../../core/league/media/voice';
import { KIND_ONE } from './kinds';
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
        <Section title="Top stories">
          <div className="lg-fp-hls">
            {headlines.map((n, i) => (
              <Headline key={n.id} league={league} n={n} to={href(n.id)} strong={i < 3} />
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
              <HonorRow key={`${h.kind}-${h.conf}`} league={league} h={h} brief />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

/** The lead: its kind and date (with the team it's about), the big headline, the dek. */
function Lead({ league, n, to }: { league: League; n: NewsItem; to: string }) {
  const tid = n.tids.find((t) => t === league.userTid) ?? n.tids[0];
  return (
    <Link to={to} className={`lg-fp-lead w${n.weight ?? 1}`}>
      <span className="lg-fp-over over">
        {tid !== undefined && league.teams[tid] && <TeamLogo tid={tid} size={20} decorative />}
        {KIND_ONE[n.kind]} · {newsDate(league, n)}
      </span>
      <span className="lg-fp-head">{n.head}</span>
      <span className="lg-fp-dek">{keep(n.text)}</span>
      <span className="lg-fp-read">
        Read <ChevronRight size={14} aria-hidden="true" />
      </span>
    </Link>
  );
}

/** A secondary story: its headline (the first few in the headline cut) over its kind, date and team. */
function Headline({ league, n, to, strong }: { league: League; n: NewsItem; to: string; strong: boolean }) {
  const tid = n.tids.find((t) => t === league.userTid) ?? n.tids[0];
  return (
    <Link to={to} className={`lg-fp-hl ${strong ? 'strong' : ''}`}>
      <span className="lg-fp-hl-head">{n.head}</span>
      <span className="lg-fp-hl-meta">
        {tid !== undefined && league.teams[tid] && <TeamLogo tid={tid} size={16} decorative />}
        {KIND_ONE[n.kind]} · {newsDate(league, n)}
      </span>
    </Link>
  );
}

/** The top five and your team, your row's line in full; the whole list, every line, is on Standings → Power. */
function PowerSection({ league }: { league: League }) {
  const p = league.media!.power!;
  const rows = p.rows.filter((r) => r.rank <= 5 || r.tid === league.userTid);
  return (
    <Section
      title="Power rankings"
      right={
        <Link to="/league/standings?view=power" className="card-link">
          Week {Math.max(1, Math.round(p.day / 7))} · all 30 <ChevronRight size={14} aria-hidden="true" />
        </Link>
      }
    >
      <PowerList league={league} rows={rows} blurbs={(r) => r.tid === league.userTid} />
    </Section>
  );
}
