// Tactics → Instructions: every team instruction, by phase of play as Football Manager groups them
// (in possession, in transition, out of possession, defensive transition). Each phase is a pill with
// how well the team knows that part of the system; under the chosen one, the playbook or identity
// its settings start from, then its controls, each saying what it costs against what's drilled.
import type { Player, Tactics } from '../../core/types';
import { FAM_DIMS, famLabel } from '../../core/sim/familiarity';
import type { SystemFamiliarity } from '../../core/league/practice';
import { Help } from '../components/ui';
import { Term } from '../components/Glossary';
import { PlaybookLine } from './PlaybookLine';
import { InPossession, InTransition } from './OffenseTab';
import { DefTransition, OutOfPossession } from './DefenseTab';
import { famTone } from './formation';
import { PHASES, phaseFam, type Phase } from './fam';
import { useFam } from './useFam';

export function InstructionsTab({ t, players, sys, phase, setPhase }: { t: Tactics; players: Player[]; sys: SystemFamiliarity; phase: Phase; setPhase: (p: Phase) => void }) {
  const fam = useFam();
  const cur = PHASES.find((p) => p.id === phase)!;
  return (
    <>
      <div className="tx-phases" role="radiogroup" aria-label="Phase of play">
        {PHASES.map((p) => {
          const v = phaseFam(sys.dims, p.id);
          const on = p.id === phase;
          return (
            <button key={p.id} role="radio" aria-checked={on} className={`tx-phase ${on ? 'on' : ''}`} onClick={() => setPhase(p.id)}>
              <span className="tx-phase-n">{p.short}</span>
              <span className="tx-phase-v">
                <span className={`num ${famTone(v)}`}>{Math.round(v)}%</span>
                <span className="sr-only"> {famLabel(v)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="tx-phase-dims">
        {cur.dims.map((d) => (
          <span key={d}>
            {FAM_DIMS.find((x) => x.id === d)!.label} <b className={famTone(sys.dims[d])}>{Math.round(sys.dims[d])}%</b>
          </span>
        ))}
        <Help title="Familiarity by phase">
          <p>
            How well your team knows this phase of the system (<Term id="familiarity">familiarity</Term>). Below 95 it&apos;s played a step slow: worse shots and more turnovers on
            offense, more open shots given up on defense.
          </p>
          <p>
            A setting moved off what the team has drilled costs familiarity until practice and games drill it again, and every scheme, coverage and press shows how well they know
            it: the cost of a switch, before you switch.
          </p>
        </Help>
      </div>
      <PlaybookLine kind={cur.end} />
      {phase === 'inPoss' && <InPossession t={t} fam={fam} players={players} />}
      {phase === 'inTrans' && <InTransition t={t} fam={fam} players={players} />}
      {phase === 'outPoss' && <OutOfPossession t={t} fam={fam} />}
      {phase === 'defTrans' && <DefTransition t={t} fam={fam} />}
    </>
  );
}
