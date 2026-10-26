// The guided first week on its step's screen: what the step asks, and one tap to keep what the staff
// set (keeping it is a choice too). Opening the screen ticks nothing: a change made here, or that tap,
// does (see guideDone).
import type { GuideStep } from '../../core/league/agenda';
import { GUIDE_STEPS, guideStepOpen } from '../../core/league/agenda';
import { useLeague, useStore } from '../../state/store';
import { runAgenda } from './Agenda';
import './agenda.css';

/**
 * `line`: what the step asks, said for this screen (else the guide's own words). `act`: the step's own
 * move, when the screen has one to offer (the staff's measured counter: "Add Ice coverage"), the strip's
 * button, with keeping things as they are beside it as a link (the screen's one primary stays the dock's).
 */
export function GuideStrip({ step, keep, line, act }: { step: GuideStep; keep: string; line?: string; act?: { label: string; run: () => void } }) {
  const league = useLeague();
  const simming = useStore((s) => !!s.sim);
  if (!guideStepOpen(league, step)) return null;
  const i = GUIDE_STEPS.findIndex((s) => s.step === step);
  const s = GUIDE_STEPS[i];
  return (
    <div className={`card guide-strip${act ? ' stacked' : ''}`} role="note" aria-label="First-week guide">
      <div className="grow">
        <div className="guide-k">
          First week · {i + 1} of {GUIDE_STEPS.length}
        </div>
        <div className="guide-t">{s.title}</div>
        <div className="guide-l">{line ?? s.line}</div>
      </div>
      {act ? (
        <div className="guide-acts">
          <button type="button" className="btn sm" disabled={simming} onClick={act.run}>
            {act.label}
          </button>
          <button type="button" className="btn sm text" disabled={simming} onClick={() => runAgenda(s.title, { kind: 'guide', step })}>
            {keep}
          </button>
        </div>
      ) : (
        <button type="button" className="btn sm" disabled={simming} onClick={() => runAgenda(s.title, { kind: 'guide', step })}>
          {keep}
        </button>
      )}
    </div>
  );
}
