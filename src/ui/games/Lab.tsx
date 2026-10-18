// The Tactics Lab screen (/lab): real engine games before you commit. Project your plan against any
// team, or compare your tactics before and after an edit (Tactics and My playbooks hand it the
// "before"). The Lab itself is lab/LabPanel; each matchup page has it against that team.
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useLeague } from '../../state/store';
import type { Tactics } from '../../core/types';
import { Help, PageHeader } from '../components/ui';
import { clearLabBaseline, labBaselineName, takeLabBaseline } from '../screens/labBridge';
import { LabPanel } from './lab/LabPanel';
import { defaultOpponent } from './lab/sides';

export default function LabPage() {
  const league = useLeague();
  const [params] = useSearchParams();
  const asked = Number(params.get('opp') ?? NaN);
  const opp = Number.isInteger(asked) && league.teams[asked] && asked !== league.userTid ? asked : null;
  const [baseline] = useState<Tactics | null>(() => (params.get('compare') ? takeLabBaseline(league) : null));
  // a saved playbook (from Tactics' My playbooks) as the before side, instead of the tactics before an edit
  const [baselineName] = useState(() => (params.get('compare') ? labBaselineName(league) : null));
  useEffect(() => clearLabBaseline(), []);
  if (params.get('mode') === 'counters') return <Navigate to={`/games/${opp ?? defaultOpponent(league)}?tab=plan`} replace />;
  return (
    <main className="page">
      <PageHeader
        title="Tactics Lab"
        back
        backTo="/team/tactics"
        right={
          <Help title="Tactics Lab">
            <p>Real engine games, before you commit: both teams play as they would tonight, with both game plans, rest, wear and injuries.</p>
            <p>Project: your plan against any team. Compare: your tactics before and after an edit, through the same games.</p>
            <p>To test the staff&apos;s counters for one team, open its matchup page: Plan.</p>
          </Help>
        }
      />
      <LabPanel
        league={league}
        modes={['project', 'compare']}
        initialMode={baseline ? 'compare' : 'project'}
        initialOpp={opp ?? undefined}
        baseline={baseline}
        baselineName={baselineName}
      />
    </main>
  );
}
