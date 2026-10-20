// Tactics → Report: the system report (your system's grades at both ends against the league's, each
// a tap from what it's made of), then what the season says your tactics won and gave up, and how
// teams scout you.
import type { SystemReport } from '../../core/analysis/system';
import { SystemReportCard } from './SystemReport';
import { InsightsTab } from './InsightsTab';

export function ReportTab({ report, was }: { report: SystemReport; was?: SystemReport }) {
  return (
    <>
      <SystemReportCard report={report} was={was} />
      <InsightsTab />
    </>
  );
}
