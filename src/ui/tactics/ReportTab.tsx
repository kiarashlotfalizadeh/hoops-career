// Tactics → Analysis → Report: what your recent changes measured ("Since you changed it"), then your
// system's strengths and weaknesses (the two best and two worst grades, each with who carries it and
// the setting that moves it most), then all fourteen grades, each a tap from what it's made of.
import type { Quality, SystemReport } from '../../core/analysis/system';
import { QUALITY_META } from '../../core/analysis/system';
import { ordinal } from '../stats';
import { Section } from '../components/ui';
import { GradeBadge, SystemReportCard } from './SystemReport';
import { strengthsOf } from './partners';
import { SinceYouChanged } from './EditLedger';
import { useLeague } from '../../state/store';

/** What a grade is made of in a line: who carries it, and the setting that adds or takes away the most. */
function why(q: Quality): string {
  const [who, ...mods] = q.parts;
  const big = [...mods].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  return big ? `${who.text} · ${big.text}` : who.text;
}

function Row({ q }: { q: Quality }) {
  return (
    <div className="listrow tx-swrow">
      <GradeBadge g={q.grade} />
      <span className="grow tx-swrow-m">
        <span className="lr-name ellipsis">{QUALITY_META[q.id].label}</span>
        <span className="lr-meta ellipsis">{why(q)}</span>
      </span>
      <span className="tiny dim num">
        {ordinal(q.rank)}
        <span className="sr-only"> of {q.of}</span>
      </span>
    </div>
  );
}

export function ReportTab({ report, was }: { report: SystemReport; was?: SystemReport }) {
  const league = useLeague();
  const { strengths, weaknesses } = strengthsOf(report);
  return (
    <>
      {/* what your changes measured, as made and on the games since (tactics/EditLedger) */}
      <SinceYouChanged league={league} />
      <Section title="Strengths and weaknesses">
        <div className="card flush list">
          <div className="list-divider list-h" aria-hidden="true">
            <span>Strengths</span>
            <span>Rank</span>
          </div>
          {strengths.map((q) => (
            <Row key={q.id} q={q} />
          ))}
          <div className="list-divider list-h" aria-hidden="true">
            <span>Weaknesses</span>
            <span>Rank</span>
          </div>
          {weaknesses.map((q) => (
            <Row key={q.id} q={q} />
          ))}
        </div>
      </Section>
      <SystemReportCard report={report} was={was} />
    </>
  );
}
