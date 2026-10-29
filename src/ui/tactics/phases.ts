// Instructions' phases of play, FM26's way: in possession (the half court), in transition (both ways:
// pushing after a stop, what happens when a shot goes up, the press) and out of possession. The old
// fourth phase's id ('defTrans') reads as in transition.

export type Phase = 'inPoss' | 'inTrans' | 'outPoss';
export const PHASES: { id: Phase; label: string; short: string }[] = [
  { id: 'inPoss', label: 'In possession', short: 'In possession' },
  { id: 'inTrans', label: 'In transition', short: 'Transition' },
  { id: 'outPoss', label: 'Out of possession', short: 'Out of possession' },
];
/** A phase id from a link, the old fourth phase included. */
export const phaseId = (s: string | null | undefined): Phase => (s === 'defTrans' ? 'inTrans' : PHASES.some((p) => p.id === s) ? (s as Phase) : 'inPoss');
