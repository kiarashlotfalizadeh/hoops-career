// Your picks in this draft (and yours that other teams hold), and after the draft its results.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { Empty, Section, Segmented } from '../components/ui';
import { PROJECTION_NOTE, pickProjection } from '../league/shared';
import { PickRow } from '../league/PicksList';
import { draftedThisYear, pickOrder } from './common';
import { SelectionRow } from './rows';

export function MyPicks({ league }: { league: League }) {
  const user = league.userTid;
  // picks without a slot yet, projected as on the team page
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  // this draft's picks in the order every pick list uses (the later ones live with the moves log: Office → Picks & moves)
  const order = pickOrder(league, proj);
  const owned = league.draftPicks.filter((d) => d.tid === user && d.season === league.season).sort(order);
  const owed = league.draftPicks.filter((d) => d.originalTid === user && d.tid !== user && d.season === league.season).sort(order);
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
              <PickRow key={d.dpid} league={league} d={d} proj={proj(d)} />
            ))}
          </div>
        )}
        {owned.some((d) => proj(d) !== undefined) && <div className="tiny dim">{PROJECTION_NOTE}</div>}
      </Section>
      {owed.length > 0 && (
        <Section title={`Owed to others · ${owed.length}`}>
          <div className="card flush list">
            {owed.map((d) => (
              <PickRow key={d.dpid} league={league} d={d} proj={proj(d)} owner />
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
          { id: '1', label: '1st round' },
          { id: '2', label: '2nd round' },
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
