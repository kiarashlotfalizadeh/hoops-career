import { ClipboardList, Lightbulb, Route, Timer, Users, X } from 'lucide-react';

/** The assistant's top fix, as the quick actions offer it. */
export interface QuickFix {
  label: string;
  /** What it's about, for screen readers ("SAS on an 8-0 run"). */
  about: string;
  run: () => void;
  dismiss: () => void;
}

/**
 * The quick actions under the court (in the tab bar's place on a phone held upright; under the
 * scorebug held sideways): a timeout (the scorebug counts the ones left), the lineup and its subs, the play calls
 * (lit in the late game), the assistant's single top fix as a pill, and the Clipboard.
 */
export function QuickBar({
  timeouts,
  timeout,
  canTimeout,
  toPending,
  toState,
  onSubs,
  onCall,
  called,
  late,
  fix,
  clipOpen,
  onClip,
}: {
  timeouts: number;
  timeout: () => void;
  canTimeout: boolean;
  /** A timeout is called and waiting for the court (or the next dead ball). */
  toPending: boolean;
  /** Why a timeout can't be called now, or that one is waiting, for screen readers. */
  toState: string;
  onSubs: () => void;
  onCall: () => void;
  /** A call is waiting for its possession. */
  called: boolean;
  /** The late-game window is open. */
  late: boolean;
  fix?: QuickFix | null;
  clipOpen: boolean;
  onClip: () => void;
}) {
  return (
    <div className={`lq${fix ? ' has-fix' : ''}`} role="group" aria-label="Coaching">
      <button className={`lq-btn${toPending ? ' on' : ''}`} disabled={!canTimeout} onClick={timeout}>
        {/* named by what it shows, then the state: "Timeout, 7 left: call one" (the scorebug shows the 7) */}
        <span className="lq-ic" aria-hidden="true">
          <Timer size={20} />
        </span>
        <span className="lq-l">Timeout</span>
        <span className="sr-only">
          , {timeouts}
          {toState}
        </span>
      </button>
      <button className="lq-btn" onClick={onSubs}>
        <span className="lq-ic" aria-hidden="true">
          <Users size={20} />
        </span>
        <span className="lq-l">Subs</span>
      </button>
      <button
        className={`lq-btn${late ? ' late' : ''}${called ? ' on' : ''}`}
        onClick={onCall}
        aria-label={`Call${late ? ': late game' : ''}${called ? ': a call is waiting' : ''}`}
      >
        <span className="lq-ic" aria-hidden="true">
          <Route size={20} />
          {(called || late) && <span className="lq-dot" />}
        </span>
        <span className="lq-l">Call</span>
      </button>
      {fix && (
        <div className="lq-fix" key={fix.label}>
          <button className="lq-fix-go" onClick={fix.run}>
            <Lightbulb size={16} aria-hidden="true" />
            <span className="lq-fix-l">{fix.label}</span>
            <span className="sr-only">: your staff&apos;s fix for {fix.about}</span>
          </button>
          <button className="lq-fix-x" onClick={fix.dismiss} aria-label={`Not now: ${fix.label}`}>
            <X size={15} />
          </button>
        </div>
      )}
      <button className={`lq-btn${clipOpen ? ' on' : ''}`} onClick={onClip} aria-expanded={clipOpen} aria-haspopup="dialog">
        <span className="lq-ic" aria-hidden="true">
          <ClipboardList size={20} />
        </span>
        <span className="lq-l">Clipboard</span>
      </button>
    </div>
  );
}
