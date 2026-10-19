// The system report on Team → Tactics: your system's grade at seven things at each end, against the
// league's other systems, each a tap from what it's made of (the players who carry it, then what each
// setting adds or takes away), and the strip of the same grades over the Offense and Defense tabs,
// which moves as you change a setting so you see what each lever buys and what it costs.
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { QUALITY_META, gradeTone, type Grade, type Quality, type QualityId, type SystemReport } from '../../core/analysis/system';
import { ordinal } from '../stats';
import { Help, Section } from '../components/ui';

const ORDER: Grade[] = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

/** A grade as a badge in its colour. */
export function GradeBadge({ g, sm }: { g: Grade; sm?: boolean }) {
  return <span className={`tx-grade ${gradeTone(g)}${sm ? ' sm' : ''}`}>{g}</span>;
}

/** One quality: its name, grade, rank and a bar for where it sits; open, what it's made of. */
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
        <span className="tx-q-rank tiny dim num">{ordinal(q.rank)}</span>
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
              {i > 0 && <span className={`num bold ${p.v > 0 ? 'good' : 'bad'}`}>{`${p.v > 0 ? '+' : '−'}${Math.abs(p.v).toFixed(1)}`}</span>}
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
      title="System report"
      right={
        <Help title="System report">
          <p>
            What your system should be good and bad at, from the players who play its minutes (your rotation) and the settings you give them, graded against the other 29
            teams&apos; systems: A+ is the top tenth of the league, F the bottom tenth.
          </p>
          <p>Tap a line to see what it&apos;s made of: who carries it, and what each setting adds or takes away. Change a setting and the grades move with it.</p>
          <p>It&apos;s a projection to tinker against; Insights shows what your tactics actually won and gave up this season.</p>
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

/**
 * The grades a tab's settings move, in a strip over it: each lights up as it changes from what this
 * visit found, so every setting shows what it buys and what it costs.
 */
export function GradeStrip({ report, was, end }: { report: SystemReport; was: SystemReport; end: 'off' | 'def' | 'both' }) {
  const ids: QualityId[] = end === 'both' ? [...report.off, ...report.def].map((q) => q.id) : report[end].map((q) => q.id);
  const all = [...report.off, ...report.def];
  const before = [...was.off, ...was.def];
  // a change on one end can move the other (crashing the glass costs transition defense): those show too
  const moved = all.filter((q, i) => q.grade !== before[i].grade && !ids.includes(q.id));
  const show = [...all.filter((q) => ids.includes(q.id)), ...moved];
  return (
    <div className="tx-strip" role="list" aria-label="Your system's grades">
      {show.map((q) => {
        const b = before[all.indexOf(q)];
        const up = ORDER.indexOf(q.grade) > ORDER.indexOf(b.grade);
        const changed = q.grade !== b.grade;
        return (
          <div key={q.id} role="listitem" className={`tx-strip-q${changed ? (up ? ' up' : ' down') : ''}`}>
            <span className="tx-strip-n">{QUALITY_META[q.id].label}</span>
            <span className="tx-strip-g">
              {changed && <span className="tx-strip-was">{b.grade}→</span>}
              <GradeBadge g={q.grade} sm />
            </span>
          </div>
        );
      })}
    </div>
  );
}
