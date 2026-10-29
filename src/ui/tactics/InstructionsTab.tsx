// Tactics → Instructions, as Football Manager 26 groups them: the three phases of play (in possession,
// in transition, out of possession) as the section's heading, which is its switch (the mentality,
// played on top of all three, is the tactic's own: the hero's). Under the chosen phase, the style it
// starts from, its three headline decisions, and Fine-tune with the rest.
import type { Player, Tactics } from '../../core/types';
import { PlaybookLine } from './PlaybookLine';
import { IN_POSS_FINE, IN_TRANS_FINE, InPossession, InPossessionFine, InPossessionHelp, InTransition, InTransitionFine, InTransitionHelp } from './OffenseTab';
import { OUT_POSS_FINE, OutOfPossession, OutOfPossessionFine, OutOfPossessionHelp } from './DefenseTab';
import { Disclosure } from './Disclosure';
import { HeadSwitch } from './HeadSwitch';
import { PHASES, type Phase } from './phases';

export function InstructionsTab({ t, players, phase, setPhase }: { t: Tactics; players: Player[]; phase: Phase; setPhase: (p: Phase) => void }) {
  return (
    <div className="col tx-phasebody">
      <h3 className="sr-only">Instructions</h3>
      <HeadSwitch label="Phase of play" value={phase} onChange={setPhase} options={PHASES.map((p) => ({ id: p.id, label: p.short }))} />
      <PlaybookLine phase={phase} help={phase === 'inPoss' ? <InPossessionHelp /> : phase === 'inTrans' ? <InTransitionHelp /> : <OutOfPossessionHelp />} />
      {phase === 'inPoss' && <InPossession t={t} />}
      {phase === 'inTrans' && <InTransition t={t} />}
      {phase === 'outPoss' && <OutOfPossession t={t} />}
      <Disclosure key={phase} label="Fine-tune" meta={phase === 'inPoss' ? IN_POSS_FINE : phase === 'inTrans' ? IN_TRANS_FINE : OUT_POSS_FINE}>
        <div className="col tx-group tx-fine-pad">
          {phase === 'inPoss' && <InPossessionFine t={t} />}
          {phase === 'inTrans' && <InTransitionFine t={t} players={players} />}
          {phase === 'outPoss' && <OutOfPossessionFine t={t} />}
        </div>
      </Disclosure>
    </div>
  );
}
