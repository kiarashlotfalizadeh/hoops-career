// A roster in four views, one switch apart, the same for your team (Team → Roster, ?view=) and any
// other (/teams/:tid → Roster, ?rv=): Players (rows in groups), Ratings, Stats and Contracts.
import type { League } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { rosterSorted } from '../../core/league/helpers';
import { Chips } from '../components/ui';
import { useQueryParam } from '../league/shared';
import { RosterList } from './RosterList';
import { RosterContracts, RosterRatings, RosterStats } from './RosterTables';

export type RosterView = 'players' | 'ratings' | 'stats' | 'contracts';
const VIEWS: RosterView[] = ['players', 'ratings', 'stats', 'contracts'];
const LABEL: Record<RosterView, string> = { players: 'Players', ratings: 'Ratings', stats: 'Stats', contracts: 'Contracts' };

export function RosterViews({ league, tid, param }: { league: League; tid: number; param: 'view' | 'rv' }) {
  const [view, setView] = useQueryParam<RosterView>(param, 'players', VIEWS);
  const roster = useLeagueMemo(() => rosterSorted(league, tid), [league, tid]);
  return (
    <>
      {/* a light row of chips, not another boxed switch under the page's tabs */}
      <div className="tm-views">
        <Chips value={view} onChange={setView} label="Roster view" options={VIEWS.map((id) => ({ id, label: LABEL[id] }))} />
      </div>
      {view === 'players' && <RosterList league={league} roster={roster} />}
      {view === 'ratings' && <RosterRatings league={league} roster={roster} />}
      {view === 'stats' && <RosterStats league={league} roster={roster} />}
      {view === 'contracts' && <RosterContracts league={league} tid={tid} roster={roster} />}
    </>
  );
}
