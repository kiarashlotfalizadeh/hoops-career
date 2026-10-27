// Team → Tactics' hero, in two parts. Over every section, one line: your three tactics behind the
// active one's letter, the style it runs (its offensive playbook, the defensive identity, the
// mentality; a tap opens the picker) and how well the team knows it as one figure, so the section
// leads the page. On the Tactic section, under the board, the rest of the plan as one card: the
// staff's measured change to it, the mentality, its two strengths and two weaknesses from the system
// report (they move as you edit, so every lever shows what it buys and what it costs) and the
// assistant's switch. The style reads as the team plays it: a playbook whose settings have moved (by
// the user, or by the staff on a change it measured, which StaffMoveNote names with Undo) is
// "Custom (Drop base)", as Matchup → Plan names it.
import { useState } from 'react';
import { edit } from '../../state/actions';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { defenseLabel, offenseLabel, playbookNameError, savePlaybook } from '../../core/sim/playbooks';
import { famLabel } from '../../core/sim/familiarity';
import { SLOT_LETTERS, activeSlot, slotName } from '../../core/sim/slots';
import { QUALITY_META, type Grade, type Quality, type SystemReport } from '../../core/analysis/system';
import { ordinal } from '../stats';
import { Help, Section, Sheet, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { MentalityDial, SlotBar, StyleSheet } from './SlotBar';
import { MENTALITY_META } from '../../core/sim/tactics';
import { ChevronRight } from 'lucide-react';
import { GradeBadge } from './SystemReport';
import { famTone } from './formation';
import { strengthsOf } from './partners';
import { handOverLine, userStaffTactics } from './fit';
import { StaffMoveNote } from './StaffMoveNote';

const ORDER: Grade[] = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];

/** The line over every section: the tactic in use, its style and how well it's known; a tap opens the style picker. */
export function TacticsHero({ fam }: { fam: number }) {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const t = team.tactics;
  const [style, setStyle] = useState(false);
  const slot = activeSlot(team);
  // (moved off its playbook's settings: "Custom (Five-Out base)", as Plan names it)
  const offName = offenseLabel(t) === 'Custom' ? 'Custom offense' : offenseLabel(t);
  return (
    <section className="card tx-hero compact" aria-label="Your tactic">
      <SlotBar />
      <button className="tx-hero-pick" aria-haspopup="dialog" onClick={() => setStyle(true)}>
        <span className="tx-hero-line">
          <span className="sr-only">
            Tactic {SLOT_LETTERS[slot]}, {slotName(team, slot)}:{' '}
          </span>
          <b>{offName}</b> · {defenseLabel(t)} on defense{t.mentality ? ` · ${MENTALITY_META[t.mentality].label}` : ''}
          {t.manual && t.playbook ? ` · from ${t.playbook.name}` : ''}
        </span>
        <span className={`tx-hero-fv num ${famTone(fam)}`}>
          <span className="sr-only">Familiarity </span>
          {Math.round(fam)}%<span className="sr-only">, {famLabel(fam).toLowerCase()}</span>
        </span>
        <span className="btn sm">Change</span>
      </button>
      <StyleSheet open={style} onClose={() => setStyle(false)} />
    </section>
  );
}

/** The rest of the plan, under the board on the Tactic section. */
export function TacticCard({
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
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const [ment, setMent] = useState(false);
  // handing his own tactics back to the staff replaces them: asked first, with a way to keep them
  const [handOver, setHandOver] = useState(false);
  const toStaff = (keep = false) =>
    edit((l) => {
      const tm = l.teams[l.userTid];
      if (keep) {
        // "My tactics", "My tactics 2"...: the first name free; a full library keeps them as they are
        let n = 1;
        const name = () => (n === 1 ? 'My tactics' : `My tactics ${n}`);
        while (playbookNameError(l, name()) && n < 20) n++;
        const err = savePlaybook(l, name());
        if (err) return void useStore.getState().toast(err, 'bad');
      }
      tm.tactics = userStaffTactics(l);
      // his refits make it his playbook, not a saved one
      tm.tactics.playbook = null;
    });
  // (moved off its playbook's settings: "Custom (Five-Out base)", as Plan names it)
  const offName = offenseLabel(t) === 'Custom' ? 'Custom offense' : offenseLabel(t);
  const defName = defenseLabel(t);
  const handOverText = useLeagueMemo(() => (handOver ? handOverLine(league, userStaffTactics(league)) : ''), [handOver, league]);
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
    <Section
      title="Your tactic"
      right={
        <Help title="Your tactic">
          <p>
            <b>Style:</b> your offensive playbook (pace, shot profile and the actions you run) and defensive identity (scheme, coverage, help, pressure and press), on the line at
            the top with your three tactics (A, B, C) beside it. Pick one to load its settings, then fine-tune them on Instructions. The staff&apos;s read (
            <Term id="fit">fit</Term>) says what each is worth a game for your roster against yours; make a change and they measure it on your next games.
          </p>
          <p>
            Yours: <Term id={`pb-${t.offPreset}`}>{offenseLabel(t) === 'Custom' ? 'your offense' : offName}</Term> and <Term id={`pb-${t.defPreset}`}>{defName}</Term>
            {offName.startsWith('Custom') || defName.startsWith('Custom') ? (
              <>
                {' '}
                (<Term id="custom">custom</Term>: moved from the playbook&apos;s settings)
              </>
            ) : null}
            .
          </p>
          <p>
            <b>Familiarity:</b> the figure beside the style is how well your team knows the tactic (<Term id="familiarity">familiarity</Term>); Analysis has it by phase. A new
            style costs it until it&apos;s drilled.
          </p>
          <p>
            <b>Mentality:</b> how much risk your team plays with on top of every setting (<Term id="mentality">mentality</Term>).
          </p>
          <p>
            <b>Strengths and weaknesses:</b> your system&apos;s two best and two worst grades against the league&apos;s systems. They move as you change a setting; Analysis has all
            fourteen and what each is made of.
          </p>
        </Help>
      }
    >
      <div className="card tx-hero">
        {/* the staff's measured change to the playbook it runs, named with its author, date and Undo */}
        <StaffMoveNote />
        {/* the mentality plays on top of every setting: the tactic's own, so it sits with the style (its dial a tap away) */}
        <button className="tx-hero-fam tx-hero-ment" aria-haspopup="dialog" onClick={() => setMent(true)}>
          <span className="tx-hero-k">Mentality</span>
          <span className="grow tx-hero-mv">{MENTALITY_META[t.mentality ?? 0].label}</span>
          <ChevronRight size={16} className="dim" aria-hidden="true" />
        </button>
        <Sheet open={ment} onClose={() => setMent(false)} title="Mentality">
          <div className="col" style={{ gap: 16 }}>
            <MentalityDial t={t} />
            <button className="btn block" onClick={() => setMent(false)}>
              Done
            </button>
          </div>
        </Sheet>
        <button className="tx-sw" onClick={onAnalysis}>
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
            onChange={(on) => {
              // (tactics of his own not kept in a playbook: ask before the staff's replace them)
              if (on && !t.playbook) setHandOver(true);
              else if (on) toStaff();
              else edit((l) => void (l.teams[l.userTid].tactics.manual = true));
            }}
            label="Let the assistant manage"
            help={!t.manual ? 'He refits the playbook, shape and roles as the roster changes. Your next edit takes over.' : 'You call it. Turn on to hand back the clipboard.'}
          />
        </div>
        <Sheet open={handOver} onClose={() => setHandOver(false)} title="Hand the tactics to the staff?">
          <div className="col" style={{ gap: 12 }}>
            <p className="small">{handOverText}</p>
            <p className="small dim2">They put in their pick for this roster in place of yours. Keep yours as a playbook and you can load them back from My playbooks.</p>
            <button
              className="btn primary block"
              onClick={() => {
                setHandOver(false);
                toStaff(true);
              }}
            >
              Keep mine as a playbook, then hand over
            </button>
            <button
              className="btn block"
              onClick={() => {
                setHandOver(false);
                toStaff();
              }}
            >
              Hand over
            </button>
          </div>
        </Sheet>
      </div>
    </Section>
  );
}
