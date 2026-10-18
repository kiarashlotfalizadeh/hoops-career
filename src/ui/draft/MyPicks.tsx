// Your picks in this draft (and yours that other teams hold), and after the draft its results.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Ticket } from 'lucide-react';
import type { DraftPick, League } from '../../core/types';
import { teamName } from '../../core/league/helpers';
import { pickLabel, pickTermsNote } from '../../core/league/trades';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, Section, Segmented } from '../components/ui';
import { PROJECTION_NOTE, overallPick, pickProjection } from '../league/shared';
import { draftedThisYear } from './common';
import { SelectionRow } from './rows';

export function MyPicks({ league }: { league: League }) {
  const user = league.userTid;
  // picks without a slot yet, projected as on the team page
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  // this season's picks in draft order: by their slot once it is set, by the projection until then
  const slot = (d: DraftPick) => (d.pick ? overallPick(league, d.round, d.pick) : (proj(d) ?? 99));
  // this draft's picks: the later ones live with the moves log (Office → Picks & moves)
  const owned = league.draftPicks.filter((d) => d.tid === user && d.season === league.season).sort((a, b) => a.round - b.round || slot(a) - slot(b));
  const owed = league.draftPicks.filter((d) => d.originalTid === user && d.tid !== user && d.season === league.season).sort((a, b) => a.round - b.round);
  const drafted = draftedThisYear(league).filter((p) => p.draft.tid === user);
  return (
    <>
      {drafted.length > 0 && (
        <Section title="Drafted this year">
          <div className="card flush list">
            {drafted.map((p) => (
              <SelectionRow key={p.pid} league={league} p={p} />
            ))}
          </div>
        </Section>
      )}
      <Section
        title={`Your ${league.season} picks · ${owned.length}`}
        right={
          <Link to="/office/assets" className="card-link">
            Future picks <ChevronRight size={14} />
          </Link>
        }
      >
        {owned.length === 0 ? (
          <Empty>No picks left in this draft.</Empty>
        ) : (
          <div className="card flush list">
            {owned.map((d) => (
              <div key={d.dpid} className="listrow">
                <TeamLogo tid={d.originalTid} size={30} decorative />
                <div className="grow fo-min0">
                  <div className="fo-name">{pickLabel(league, d)}</div>
                  <div className="fo-meta fo-wrap">
                    {d.originalTid === user ? 'Own pick' : `From the ${teamName(league.teams[d.originalTid])}`}
                    {/* its protection and any swap on it, in words */}
                    {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                  </div>
                </div>
                {/* the label carries the overall number once the order is set */}
                {proj(d) !== undefined ? (
                  <span className="tag">Proj. #{proj(d)}</span>
                ) : (
                  <span className={`tag ${d.pick ? 'info' : ''}`}>
                    <Ticket size={11} /> R{d.round}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {owned.some((d) => proj(d) !== undefined) && <div className="tiny dim">{PROJECTION_NOTE}</div>}
      </Section>
      {owed.length > 0 && (
        <Section title={`Yours, owed to others · ${owed.length}`}>
          <div className="card flush list">
            {owed.map((d) => (
              <div key={d.dpid} className="listrow">
                <TeamLogo tid={d.tid} size={30} decorative />
                <div className="grow fo-min0">
                  <div className="fo-name">{pickLabel(league, d)}</div>
                  <div className="fo-meta fo-wrap">
                    Owned by the {teamName(league.teams[d.tid])}
                    {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                  </div>
                </div>
                <span className={`tag ${d.round === 1 ? 'info' : ''}`}>R{d.round}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ results (after the draft)

export function Results({ league }: { league: League }) {
  const list = useLeagueMemo(() => draftedThisYear(league), [league]);
  const [round, setRound] = useState<1 | 2>(1);
  if (!list.length) return <Empty>No draft results yet.</Empty>;
  return (
    <>
      <Segmented
        label="Round"
        value={String(round) as '1' | '2'}
        onChange={(x) => setRound(Number(x) as 1 | 2)}
        options={[
          { id: '1', label: 'Round 1' },
          { id: '2', label: 'Round 2' },
        ]}
      />
      <div className="card flush list">
        {list
          .filter((p) => p.draft.round === round)
          .map((p) => (
            <SelectionRow key={p.pid} league={league} p={p} />
          ))}
      </div>
    </>
  );
}
