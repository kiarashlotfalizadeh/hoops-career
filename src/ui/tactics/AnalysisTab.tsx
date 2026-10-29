// Tactics → Analysis: one section with two views behind its heading (the switch), not two walls stacked: the
// system report (strengths and weaknesses, then every grade) and the season (what your tactics won and
// gave up, how teams see you).
import type { SystemReport } from '../../core/analysis/system';
import { HeadSwitch } from './HeadSwitch';
import { ReportTab } from './ReportTab';
import { InsightsTab } from './InsightsTab';

export type AnalysisView = 'report' | 'season';
export const ANALYSIS_VIEWS: AnalysisView[] = ['report', 'season'];

export function AnalysisTab({ view, setView, report, was }: { view: AnalysisView; setView: (v: AnalysisView) => void; report: SystemReport; was?: SystemReport }) {
  return (
    <>
      <h3 className="sr-only">Analysis</h3>
      <HeadSwitch
        value={view}
        onChange={setView}
        label="Analysis"
        options={[
          { id: 'report', label: 'Report' },
          { id: 'season', label: 'Season' },
        ]}
      />
      {view === 'report' && <ReportTab report={report} was={was} />}
      {view === 'season' && <InsightsTab />}
    </>
  );
}
