// Team → Roster: the roster decisions the league waits on (cuts on opening night) at the top,
// settled in place, then your players in four views (src/ui/team/RosterViews): Players (tonight's
// five, the bench, the two-way deals, with health and mood marked where they matter), Ratings,
// Stats and Contracts, the app's one contracts table (Office links here with ?view=contracts).
import { useLeague, useLeagueMemo } from '../../state/store';
import { agenda } from '../../core/league/agenda';
import { AgendaRow } from '../components/Agenda';
import { RosterViews } from '../team/RosterViews';
import './team.css';

export default function Roster() {
  const league = useLeague();
  // the roster decisions the league waits on (opening night's limits): here, where they're made
  const decisions = useLeagueMemo(() => agenda(league).filter((i) => i.kind === 'cuts' || i.kind === 'twoWays'), [league]);
  return (
    <>
      {decisions.length > 0 && (
        <div className="card flush ag-list" role="list" aria-label="Roster decisions">
          {decisions.map((i) => (
            <div role="listitem" key={i.id}>
              <AgendaRow item={i} />
            </div>
          ))}
        </div>
      )}
      <RosterViews league={league} tid={league.userTid} param="view" />
    </>
  );
}
