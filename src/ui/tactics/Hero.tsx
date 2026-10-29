// Team → Tactics' hero: one card over every section, the style the team runs (its offensive
// playbook, the defensive identity, the mentality; a tap on Change opens the style sheet). On the
// Tactic section it also holds who runs it: the assistant's switch and the staff's measured change in
// force (StaffMoveNote, with Undo). Under the board there, the system's two strengths and two
// weaknesses from the system report (they move as you edit, so every lever shows what it buys and
// what it costs), a tap from every grade on Analysis. The style reads as the team plays it: a playbook
// whose settings have moved (by the user, or by the staff on a change it measured) is "Custom Drop",
// as Matchup → Plan names it.
import { useState } from 'react';
import { edit } from '../../state/actions';
import { useLeague, useLeagueMemo } from '../../state/store';
import { defenseLabel, offenseLabel } from '../../core/sim/playbooks';
import { QUALITY_META, type Grade, type Quality, type SystemReport } from '../../core/analysis/system';
import type { Mentality, Tactics } from '../../core/types';
import { ordinal } from '../stats';
import { Help, Levels, Section, Segmented, Sheet, Toggle } from '../components/ui';
import { MENTALITY_META } from '../../core/sim/tactics';
import { GradeBadge } from './SystemReport';
import { strengthsOf } from './formation';
import { handOverLine, userStaffTactics } from './fit';
import { StaffMoveNote } from './StaffMoveNote';
import { PresetPicker } from './PresetPicker';
import { tweak } from './edit';

const ORDER: Grade[] = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

/** The offense as the hero names it (no playbook at all: "Custom offense"). */
const offName = (t: Tactics) => (offenseLabel(t) === 'Custom' ? 'Custom offense' : offenseLabel(t));

/**
 * The card over every section: the style in use, Change (the style sheet); with `manage` (the Tactic
 * section), the assistant's switch and the staff's change in force under it.
 */
export function TacticsHero({ manage = false }: { manage?: boolean }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const [style, setStyle] = useState(false);
  return (
    <section className="card tx-hero" aria-label="Your tactic">
      <button className="tx-hero-pick" aria-haspopup="dialog" onClick={() => setStyle(true)}>
        <span className="grow tx-hero-text">
          <span className="tx-hero-line">
            <span className="sr-only">Your style: </span>
            <b>{offName(t)}</b> · {defenseLabel(t)}
          </span>
          <span className="tx-hero-sub">{MENTALITY_META[t.mentality ?? 0].label} mentality</span>
        </span>
        <span className="btn sm">Change</span>
      </button>
      {manage && <AssistantSwitch t={t} />}
      {manage && <StaffMoveNote />}
      <StyleSheet open={style} onClose={() => setStyle(false)} />
    </section>
  );
}

/** "Let the assistant manage": handing his own tactics back to the staff replaces them, so it asks first. */
function AssistantSwitch({ t }: { t: Tactics }) {
  const league = useLeague();
  const [handOver, setHandOver] = useState(false);
  const handOverText = useLeagueMemo(() => (handOver ? handOverLine(league, userStaffTactics(league)) : ''), [handOver, league]);
  return (
    <div className="tx-hero-auto">
      {/* (any edit on any section turns it off) */}
      <Toggle
        on={!t.manual}
        onChange={(on) => {
          if (on) setHandOver(true);
          else edit((l) => void (l.teams[l.userTid].tactics.manual = true));
        }}
        label="Let the assistant manage"
        help={!t.manual ? 'He refits the playbook, shape and roles as the roster changes. Your next edit takes over.' : 'You call it. Turn on to hand the tactics to the staff.'}
      />
      <Sheet open={handOver} onClose={() => setHandOver(false)} title="Hand the tactics to the staff?">
        <div className="col" style={{ gap: 12 }}>
          <p className="small">{handOverText}</p>
          <p className="small dim2">Their pick for this roster replaces yours.</p>
          <button
            className="btn primary block"
            onClick={() => {
              setHandOver(false);
              edit((l) => {
                l.teams[l.userTid].tactics = userStaffTactics(l);
              });
            }}
          >
            Hand over
          </button>
          <button className="btn block" onClick={() => setHandOver(false)}>
            Keep mine
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/** Under the board on the Tactic section: the system's two best and two worst grades, a tap from all of them. */
export function StrengthsCard({
  report,
  was,
  onAnalysis,
}: {
  report: SystemReport;
  /** The report as this visit found it: a grade that has moved since shows where it was. */
  was: SystemReport;
  /** Opens Analysis at the report. */
  onAnalysis: () => void;
}) {
  const { strengths, weaknesses } = strengthsOf(report);
  const before = new Map([...was.off, ...was.def].map((q) => [q.id, q.grade]));
  const grade = (q: Quality) => {
    const b = before.get(q.id);
    const dir = !b || b === q.grade ? '' : ORDER.indexOf(q.grade) > ORDER.indexOf(b) ? ' up' : ' down';
    return (
      // keyed by its grade, so a new grade flashes in afresh
      <span key={`${q.id}-${q.grade}`} className={`tx-sw-q${dir}`}>
        <GradeBadge g={q.grade} sm />
        <span className="tx-sw-n">{QUALITY_META[q.id].label}</span>
        <span className="sr-only">
          , {ordinal(q.rank)} of {q.of}
          {b && b !== q.grade ? `, was ${b}` : ''}
        </span>
      </span>
    );
  };
  return (
    <Section
      title="Grades"
      right={
        <button className="card-link" onClick={onAnalysis}>
          All {report.off.length + report.def.length}
        </button>
      }
    >
      <button className="card tx-sw" onClick={onAnalysis}>
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
    </Section>
  );
}

type StyleTab = 'off' | 'def' | 'ment';

/** FM's tactical style: an offensive playbook and a defensive identity, each with its fit for this roster, and the mentality over them. */
export function StyleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const [tab, setTab] = useState<StyleTab>('off');
  return (
    <Sheet open={open} onClose={onClose} title="Your style">
      <div className="col tx-style">
        <Segmented
          value={tab}
          onChange={setTab}
          label="Part of the style"
          options={[
            { id: 'off', label: 'Offense' },
            { id: 'def', label: 'Defense' },
            { id: 'ment', label: 'Mentality' },
          ]}
        />
        {tab === 'off' && <PresetPicker kind="off" />}
        {tab === 'def' && <PresetPicker kind="def" />}
        {tab === 'ment' && <MentalityDial t={t} />}
        <button className="btn block" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

/** The mentality dial: five steps from very cautious to very aggressive, nudging every setting. */
export function MentalityDial({ t }: { t: Tactics }) {
  const m = t.mentality ?? 0;
  const names = ([-2, -1, 0, 1, 2] as const).map((x) => MENTALITY_META[x].label) as unknown as readonly [string, string, string, string, string];
  return (
    <div className="tx-mentality">
      <Levels
        label="Mentality"
        value={(m + 2) * 25}
        names={names}
        mark={50}
        onChange={(x) =>
          tweak((tt) => {
            const v = Math.round(x / 25 - 2) as Mentality;
            if (v) tt.mentality = v;
            else delete tt.mentality;
          })
        }
        help={MENTALITY_META[m].help}
      />
      <Help title="Mentality">
        <p>How much risk your team takes, on top of every setting.</p>
        <p>Aggressive pushes, crashes and gets into the ball. Cautious protects the ball and gets back.</p>
      </Help>
    </div>
  );
}
