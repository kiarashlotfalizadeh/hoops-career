// Tactics → Analysis: one section with three views behind its heading (the switch), not three walls stacked: the
// system report (strengths and weaknesses, then every grade), familiarity (by phase, the practice
// focus, the players) and the season (what your tactics won and gave up, how teams see you).
import type { Player } from '../../core/types';
import type { SystemReport } from '../../core/analysis/system';
import type { SystemFamiliarity } from '../../core/league/practice';
import { HeadSwitch } from './HeadSwitch';
import { ReportTab } from './ReportTab';
import { FamiliarityTab } from './FamiliarityTab';
import { InsightsTab } from './InsightsTab';

export type AnalysisView = 'report' | 'familiarity' | 'season';
export const ANALYSIS_VIEWS: AnalysisView[] = ['report', 'familiarity', 'season'];

export function AnalysisTab({
  view,
  setView,
  report,
  was,
  sys,
  players,
}: {
  view: AnalysisView;
  setView: (v: AnalysisView) => void;
  report: SystemReport;
  was?: SystemReport;
  sys: SystemFamiliarity;
  players: Player[];
}) {
  return (
    <>
      <h3 className="sr-only">Analysis</h3>
      <HeadSwitch
        value={view}
        onChange={setView}
        label="Analysis"
        options={[
          { id: 'report', label: 'Report' },
          { id: 'familiarity', label: 'Familiarity' },
          { id: 'season', label: 'Season' },
        ]}
      />
      {view === 'report' && <ReportTab report={report} was={was} />}
      {view === 'familiarity' && <FamiliarityTab sys={sys} players={players} />}
      {view === 'season' && <InsightsTab />}
    </>
  );
}
