// The system report on Team → Tactics → Analysis: your system's grade at seven things at each end,
// against the league's other systems, each a tap from what it's made of (the players who carry it,
// then what each setting adds or takes away). The grades move as you change a setting.
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { QUALITY_META, gradeTone, type Grade, type Quality, type SystemReport } from '../../core/analysis/system';
import { Help, Section } from '../components/ui';

const ORDER: Grade[] = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

/** A grade as a badge in its colour. */
export function GradeBadge({ g, sm }: { g: Grade; sm?: boolean }) {
  return <span className={`tx-grade ${gradeTone(g)}${sm ? ' sm' : ''}`}>{g}</span>;
}

/** One quality: its name, grade and a bar for where it sits; open, what it's made of. */
function QualityRow({ q, was }: { q: Quality; was?: Quality }) {
  const [open, setOpen] = useState(false);
  const moved = was && was.grade !== q.grade ? (ORDER.indexOf(q.grade) > ORDER.indexOf(was.grade) ? 'up' : 'down') : null;
  const pct = 1 - (q.rank - 1) / Math.max(1, q.of - 1);
  return (
    <div className={`tx-q${open ? ' open' : ''}`}>
      <button className="tx-q-top" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        <span className="tx-q-n grow">{QUALITY_META[q.id].label}</span>
        {moved && was && <span className={`tx-q-was ${moved === 'up' ? 'good' : 'bad'}`}>{was.grade} →</span>}
        <GradeBadge g={q.grade} />
        {open ? <ChevronUp size={15} className="dim" aria-hidden="true" /> : <ChevronDown size={15} className="dim" aria-hidden="true" />}
      </button>
      <div className="tx-q-bar" aria-hidden="true">
        <span className={gradeTone(q.grade)} style={{ width: `${Math.round(8 + pct * 92)}%` }} />
      </div>
      {open && (
        <div className="tx-q-parts">
          <div className="small dim2">{QUALITY_META[q.id].help}</div>
          {q.parts.map((p, i) => (
            <div key={i} className="tx-q-part small">
              <span className="grow">{p.text}</span>
              {i > 0 && <span className={`bold ${p.v > 0 ? 'good' : 'bad'}`}>{p.v > 0 ? 'Helps' : 'Hurts'}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The whole report: offense and defense side by side (stacked on a phone). `was` shows what changed since. */
export function SystemReportCard({ report, was }: { report: SystemReport; was?: SystemReport }) {
  return (
    <Section
      title="All grades"
      right={
        <Help title="All grades">
          <p>What your system should be good at, from your rotation and your settings. A+ is the league&apos;s top tenth, F its bottom tenth.</p>
          <p>Tap a grade for what it&apos;s made of. Change a setting and the grades move.</p>
        </Help>
      }
    >
      <div className="tx-sys">
        {(['off', 'def'] as const).map((end) => (
          <div key={end} className="tx-sys-col">
            <div className="over">{end === 'off' ? 'Offense' : 'Defense'}</div>
            <div className="card flush list">
              {report[end].map((q, i) => (
                <QualityRow key={q.id} q={q} was={was?.[end][i]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
