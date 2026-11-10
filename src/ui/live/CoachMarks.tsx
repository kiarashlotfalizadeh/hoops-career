// The first live game's coach marks: four short cards, one at a time along the court's edge (never
// its middle), each naming a part of the screen that wears a ring while the card is up: the scorebug,
// the call bar (playback's way in), the court, the bench bar. A tap or a few seconds takes one down.
// With teaching on, once on this device, in the first quarter of the first live game: after the last
// (or past that quarter), never again.
import { useEffect, useRef } from 'react';

const SEEN_KEY = 'hc:live-tips';

/**
 * The cards. `at`: the parts each points at, as the page's `data-tip` words ("bug", "call", "court",
 * and the bench bar's "timeout", "lineup", "staff"): Live.tsx puts them on the page while the card is
 * up and the styles ring them. `edge`: the court's edge the card sits along, nearest what it names.
 */
export const COACH_MARKS: { text: string; at: string[]; edge: 'top' | 'foot' }[] = [
  { text: 'Score, clock, fouls and timeouts are in the scorebug.', at: ['bug'], edge: 'top' },
  { text: 'Tap the pause button, or the court, for playback.', at: ['call'], edge: 'top' },
  { text: 'The whole floor. The player with the ball wears his name.', at: ['court'], edge: 'foot' },
  { text: 'Timeout stops play. Players has subs, Now has staff calls.', at: ['timeout', 'lineup', 'staff'], edge: 'foot' },
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

/** How long a card stays up before the next takes its place (real time it's up: taken down and put back, it starts again). */
export const TIP_MS = 7000;

export function CoachMark({ step, onNext }: { step: number; onNext: () => void }) {
  const mark = COACH_MARKS[step];
  const last = step === COACH_MARKS.length - 1;
  const next = useRef(onNext);
  next.current = onNext;
  useEffect(() => {
    const t = setTimeout(() => next.current(), TIP_MS);
    return () => clearTimeout(t);
  }, [step]);
  if (!mark) return null;
  return (
    <button type="button" key={step} className={`lv-tip at-${mark.edge}`} onClick={onNext} aria-live="polite">
      <span className="lv-tip-n" aria-hidden="true">
        {step + 1}/{COACH_MARKS.length}
      </span>
      <span className="lv-tip-t">{mark.text}</span>
      <span className="lv-tip-go">{last ? 'Got it' : 'Next'}</span>
    </button>
  );
}
