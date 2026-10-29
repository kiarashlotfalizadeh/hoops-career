// Tactics → Analysis → Report: what your recent changes measured ("Since you changed it"), then all
// fourteen grades, each a tap from what it's made of. The two best and two worst are on Tactic.
import type { SystemReport } from '../../core/analysis/system';
import { SystemReportCard } from './SystemReport';
import { SinceYouChanged } from './EditLedger';
import { useLeague } from '../../state/store';

export function ReportTab({ report, was }: { report: SystemReport; was?: SystemReport }) {
  const league = useLeague();
  return (
    <>
      {/* what your changes measured, as made and on the games since (tactics/EditLedger) */}
      <SinceYouChanged league={league} />
      <SystemReportCard report={report} was={was} />
    </>
  );
}
