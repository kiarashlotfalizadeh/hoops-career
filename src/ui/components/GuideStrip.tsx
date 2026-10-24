// The guided first week on its step's screen: what the step asks, and one tap to keep what the staff
// set (keeping it is a choice too). Opening the screen ticks nothing: a change made here, or that tap,
// does (see guideDone).
import type { GuideStep } from '../../core/league/agenda';
import { GUIDE_STEPS, guideStepOpen } from '../../core/league/agenda';
import { useLeague, useStore } from '../../state/store';
import { runAgenda } from './Agenda';
import './agenda.css';

export function GuideStrip({ step, keep }: { step: GuideStep; keep: string }) {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  if (!guideStepOpen(league, step)) return null;
  const i = GUIDE_STEPS.findIndex((s) => s.step === step);
  const s = GUIDE_STEPS[i];
  return (
    <div className="card guide-strip" role="note" aria-label="First-week guide">
      <div className="grow">
        <div className="guide-k">
          First week · {i + 1} of {GUIDE_STEPS.length}
        </div>
        <div className="guide-t">{s.title}</div>
        <div className="guide-l">{s.line}</div>
      </div>
      <button type="button" className="btn sm" disabled={simming} onClick={() => runAgenda(s.title, { kind: 'guide', step })}>
        {keep}
      </button>
    </div>
  );
}
