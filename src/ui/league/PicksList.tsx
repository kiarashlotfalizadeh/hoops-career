// A team's draft picks: the ones it owns (its own and others', with their protections and where
// this season's would land today) and its own that other teams hold. Any team's, the user's too:
// another team's page shows it, and so does the Office for the user's own.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { DraftPick, League } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { teamName } from '../../core/league/helpers';
import { pickLabel, pickTermsNote } from '../../core/league/trades';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Section, Statline } from '../components/ui';
import { PROJECTION_NOTE, pickProjection, teamPath } from './shared';

export function PicksList({ league, tid }: { league: League; tid: number }) {
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  // a pick whose slot is set carries its number in its name
  const slotTag = (d: DraftPick) => {
    const p = proj(d);
    if (p !== undefined) return { text: `Proj. #${p}`, tone: d.round === 1 && p <= 14 ? 'warn' : 'info' };
    const yrs = d.season - league.season;
    return { text: yrs <= 0 ? 'This draft' : `In ${yrs} yr${yrs === 1 ? '' : 's'}`, tone: d.pick ? 'good' : '' };
  };
  const owned = league.draftPicks.filter((d) => d.tid === tid).sort((a, b) => a.season - b.season || a.round - b.round || a.originalTid - b.originalTid);
  const away = league.draftPicks.filter((d) => d.originalTid === tid && d.tid !== tid).sort((a, b) => a.season - b.season || a.round - b.round);
  const firsts = owned.filter((d) => d.round === 1).length;
  return (
    <>
      <div className="card lg-strip">
        <Statline
          items={[
            { k: 'Owned', v: owned.length },
            { k: '1st round', v: firsts },
            { k: 'Owed away', v: away.length, color: away.length ? 'var(--warn)' : undefined },
          ]}
        />
      </div>
      <Section title="Picks owned" right={owned.some((d) => proj(d) !== undefined) ? <Help title="Projected picks">{PROJECTION_NOTE}</Help> : undefined}>
        <div className="card flush list">
          {owned.length === 0 ? (
            <div className="empty">No draft picks.</div>
          ) : (
            owned.map((d) => {
              const t = slotTag(d);
              const terms = pickTermsNote(league, d);
              return (
                <div key={d.dpid} className="lg-pick">
                  <TeamLogo tid={d.originalTid} size={28} decorative />
                  <span className="lg-pick-t">
                    <span className="lr-name">{pickLabel(league, d)}</span>
                    <span className="lr-meta">
                      {d.originalTid !== tid ? `From the ${teamName(league.teams[d.originalTid])}` : 'Own pick'}
                      {/* its protection and any swap on it, in words */}
                      {terms ? `. ${terms}` : ''}
                    </span>
                  </span>
                  <span className={`tag ${t.tone}`}>{t.text}</span>
                </div>
              );
            })
          )}
        </div>
      </Section>
      {away.length > 0 && (
        <Section title="Owed to other teams">
          <div className="card flush list">
            {away.map((d) => {
              const terms = pickTermsNote(league, d);
              return (
                <Link key={d.dpid} to={teamPath(d.tid)} className="lg-pick">
                  <TeamLogo tid={d.tid} size={28} decorative />
                  <span className="lg-pick-t">
                    <span className="lr-name">{pickLabel(league, d)}</span>
                    <span className="lr-meta">
                      Owned by the {teamName(league.teams[d.tid])}
                      {terms ? `. ${terms}` : ''}
                    </span>
                  </span>
                  <ChevronRight size={16} className="dim" />
                </Link>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}
