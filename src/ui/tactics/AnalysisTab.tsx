// Tactics → Season Analysis, one page top to bottom: what your recent changes measured ("Since you
// changed it"), the season (the engine's tally of what your tactics won and gave up, how teams see
// you), then all fourteen grades of the system, each a tap from what it's made of.
import type { SystemReport } from '../../core/analysis/system';
import { useLeague } from '../../state/store';
import { SinceYouChanged } from './EditLedger';
import { InsightsTab } from './InsightsTab';
import { SystemReportCard } from './SystemReport';

export function AnalysisTab({ report, was }: { report: SystemReport; was?: SystemReport }) {
  const league = useLeague();
  return (
    <>
      {/* what your changes measured, as made and on the games since (tactics/EditLedger) */}
      <SinceYouChanged league={league} />
      <InsightsTab />
      <SystemReportCard report={report} was={was} />
    </>
  );
}
