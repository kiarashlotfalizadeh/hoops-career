// The first live game's coach marks: three short cards, one at a time over the foot of the court
// (never the scorebug), each gone at a tap: where speed and Skip ahead are, what Lineup and Staff
// hold, and what a timeout does. With teaching on, once on this device: after the last, never again.

const SEEN_KEY = 'hc:live-tips';

/** The cards, and the bench bar's controls each points at (Live.tsx rings them while it's up). */
export const COACH_MARKS: { text: string; at: string[] }[] = [
  { text: 'Tap the court for speed and Skip ahead.', at: [] },
  { text: 'Lineup: your subs. Staff: your assistant’s read and his calls.', at: ['lineup', 'staff'] },
  { text: 'Timeout: stops play so you can sub and change the plan.', at: ['timeout'] },
];

/** Whether this device has been through the cards (a storage it can't read counts as yes: no card every game). */
export function coachMarksSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markCoachMarksSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // (private browsing: they come up again next time)
  }
}

export function CoachMark({ step, onNext }: { step: number; onNext: () => void }) {
  const last = step === COACH_MARKS.length - 1;
  return (
    <button type="button" className="lv-tip" onClick={onNext} aria-live="polite">
      <span className="lv-tip-n num" aria-hidden="true">
        {step + 1}/{COACH_MARKS.length}
      </span>
      <span className="lv-tip-t">{COACH_MARKS[step].text}</span>
      <span className="lv-tip-go">{last ? 'Got it' : 'Next'}</span>
    </button>
  );
}
