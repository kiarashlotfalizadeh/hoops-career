// Team → Tactics' hero: the plan in use, all in one group. Your three tactics as a row of pills, the
// style the active one runs (its offensive playbook as the headline, the defensive identity under it,
// a tap from the picker), how well the team knows it as one figure, its two strengths and two
// weaknesses from the system report (they move as you edit, so every lever shows what it buys and
// what it costs), and the assistant's switch.
import { useState } from 'react';
import { edit } from '../../state/actions';
import { useLeague } from '../../state/store';
import { autoTactics } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { playbookLabel } from '../../core/sim/playbooks';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';
import { famLabel } from '../../core/sim/familiarity';
import { QUALITY_META, type Grade, type Quality, type SystemReport } from '../../core/analysis/system';
import { ordinal } from '../stats';
import { Help, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { SlotBar, StyleSheet } from './SlotBar';
import { GradeBadge } from './SystemReport';
import { famTone } from './formation';
import { strengthsOf } from './partners';

const ORDER: Grade[] = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

export function TacticsHero({
  report,
  was,
  fam,
  onAnalysis,
}: {
  report: SystemReport;
  /** The report as this visit found it: a grade that has moved since shows where it was. */
  was: SystemReport;
  /** How well the team knows the tactic it plays (overall). */
  fam: number;
  /** Opens Analysis at the report or the familiarity. */
  onAnalysis: (view: 'report' | 'familiarity') => void;
}) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const [style, setStyle] = useState(false);
  const off = OFF_PRESETS.find((p) => p.id === t.offPreset);
  const def = DEF_PRESETS.find((p) => p.id === t.defPreset);
  const { strengths, weaknesses } = strengthsOf(report);
  const before = new Map([...was.off, ...was.def].map((q) => [q.id, q.grade]));
  const grade = (q: Quality) => {
    const b = before.get(q.id);
    const dir = !b || b === q.grade ? '' : ORDER.indexOf(q.grade) > ORDER.indexOf(b) ? ' up' : ' down';
    return (
      // keyed by its grade, so a new grade flashes in afresh
      <span key={`${q.id}-${q.grade}`} className={`tx-sw-q${dir}`}>
        <GradeBadge g={q.grade} sm />
        <span className="tx-sw-n ellipsis">{QUALITY_META[q.id].label}</span>
        <span className="sr-only">
          , {ordinal(q.rank)} of {q.of}
          {b && b !== q.grade ? `, was ${b}` : ''}
        </span>
      </span>
    );
  };
  return (
    <section className="card tx-hero" aria-label="Your tactic">
      <SlotBar />
      <div className="tx-hero-style">
        <button className="tx-hero-pick" aria-haspopup="dialog" onClick={() => setStyle(true)}>
          <span className="grow">
            <span className="tx-hero-off">{off?.name ?? 'Custom offense'}</span>
            <span className="tx-hero-def">
              {def?.name ?? 'Custom'} on defense
              {t.manual && t.playbook ? ` · from ${t.playbook.name}` : ''}
            </span>
          </span>
          <span className="sr-only">Running {playbookLabel(t)}.</span>
          <span className="btn sm">Change</span>
        </button>
        <span className="tx-hero-r">
          <Help title="Your tactic">
            <p>
              <b>Style:</b> your offensive playbook (pace, shot profile and the actions you run) and defensive identity (scheme, coverage, help, pressure and press). Pick one to
              load its settings, then fine-tune them on Instructions. <Term id="fit">Fit</Term> scores how well your roster suits each.
            </p>
            <p>
              <b>Familiarity:</b> how well your team knows the tactic (<Term id="familiarity">familiarity</Term>). A new style costs it until it&apos;s drilled.
            </p>
            <p>
              <b>Strengths and weaknesses:</b> your system&apos;s two best and two worst grades against the league&apos;s systems. They move as you change a setting; Analysis has
              all fourteen and what each is made of.
            </p>
          </Help>
        </span>
      </div>
      <button className="tx-hero-fam" onClick={() => onAnalysis('familiarity')}>
        <span className="tx-hero-k">Familiarity</span>
        <span className="tx-fambar grow" aria-hidden="true">
          <i className={famTone(fam)} style={{ width: `${Math.round(fam)}%` }} />
        </span>
        <span className={`tx-hero-fv num ${famTone(fam)}`}>{Math.round(fam)}%</span>
        <span className="tx-hero-fl">{famLabel(fam)}</span>
        <span className="sr-only">. By phase on Analysis.</span>
      </button>
      <button className="tx-sw" onClick={() => onAnalysis('report')}>
        <span className="tx-sw-col">
          <span className="tx-hero-k">Strengths</span>
          {strengths.map(grade)}
        </span>
        <span className="tx-sw-col">
          <span className="tx-hero-k">Weaknesses</span>
          {weaknesses.map(grade)}
        </span>
        <span className="sr-only">All grades on Analysis.</span>
      </button>
      {/* the assistant's switch sits with what he runs (any edit on any tab turns it off) */}
      <div className="tx-hero-auto">
        <Toggle
          on={!t.manual}
          onChange={(on) =>
            edit((l) => {
              const tm = l.teams[l.userTid];
              if (on) {
                tm.tactics = autoTactics({ ...tm, tactics: { ...tm.tactics, manual: false } }, rosterSorted(l, l.userTid), false, { links: true });
                // his refits make it his playbook, not a saved one
                tm.tactics.playbook = null;
              } else tm.tactics.manual = true;
            })
          }
          label="Let the assistant manage"
          help={!t.manual ? 'He refits the playbook, shape and roles as the roster changes. Your next edit takes over.' : 'You call it. Turn on to hand back the clipboard.'}
        />
      </div>
      <StyleSheet open={style} onClose={() => setStyle(false)} />
    </section>
  );
}
