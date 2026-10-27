// Tactics → Instructions, as Football Manager 26 groups them: the three phases of play (in possession,
// in transition, out of possession) as the section's heading, which is its switch, each with how well the team
// knows it (the mentality, played on top of all three, is the tactic's own: the hero's). Under the chosen phase, the style it starts from, its three headline decisions, and
// Fine-tune with the rest; in possession, the set package as its own card. Each control says what it
// costs against what's drilled.
import type { Player, Tactics } from '../../core/types';
import { famLabel } from '../../core/sim/familiarity';
import type { SystemFamiliarity } from '../../core/league/practice';
import { PlaybookLine } from './PlaybookLine';
import { IN_POSS_FINE, IN_TRANS_FINE, InPossession, InPossessionFine, InPossessionHelp, InTransition, InTransitionFine, InTransitionHelp } from './OffenseTab';
import { OUT_POSS_FINE, OutOfPossession, OutOfPossessionFine, OutOfPossessionHelp } from './DefenseTab';
import { SetPackageCard } from './SetPackageCard';
import { Disclosure } from './Disclosure';
import { HeadSwitch } from './HeadSwitch';
import { famTone } from './formation';
import { PHASES, phaseFam, type Phase } from './fam';
import { tweak } from './edit';
import { useFam } from './useFam';

export function InstructionsTab({ t, players, sys, phase, setPhase }: { t: Tactics; players: Player[]; sys: SystemFamiliarity; phase: Phase; setPhase: (p: Phase) => void }) {
  const fam = useFam();
  return (
    <>
      <div className="col tx-phasebody">
        <h3 className="sr-only">Instructions</h3>
        <HeadSwitch
          label="Phase of play"
          value={phase}
          onChange={setPhase}
          options={PHASES.map((p) => {
            const v = phaseFam(sys.dims, p.id);
            return {
              id: p.id,
              label: p.short,
              sub: (
                <span className={famTone(v)}>
                  {Math.round(v)}% known<span className="sr-only">, {famLabel(v).toLowerCase()}</span>
                </span>
              ),
            };
          })}
        />
        <PlaybookLine phase={phase} help={phase === 'inPoss' ? <InPossessionHelp /> : phase === 'inTrans' ? <InTransitionHelp /> : <OutOfPossessionHelp />} />
        {phase === 'inPoss' && <InPossession t={t} fam={fam} />}
        {phase === 'inTrans' && <InTransition t={t} fam={fam} />}
        {phase === 'outPoss' && <OutOfPossession t={t} fam={fam} />}
        <Disclosure key={phase} label="Fine-tune" meta={phase === 'inPoss' ? IN_POSS_FINE : phase === 'inTrans' ? IN_TRANS_FINE : OUT_POSS_FINE}>
          <div className="col tx-group tx-fine-pad">
            {phase === 'inPoss' && <InPossessionFine t={t} fam={fam} />}
            {phase === 'inTrans' && <InTransitionFine t={t} fam={fam} players={players} />}
            {phase === 'outPoss' && <OutOfPossessionFine t={t} fam={fam} />}
          </div>
        </Disclosure>
      </div>
      {phase === 'inPoss' && <SetPackageCard t={t} edit={tweak} players={players} />}
    </>
  );
}
