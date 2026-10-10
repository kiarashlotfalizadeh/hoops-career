import type { Tactics } from '../../core/types';

// Hands a "before" tactics snapshot from the Tactics screen to the Lab for comparison.
let baseline: Tactics | null = null;

export function setLabBaseline(t: Tactics | null) {
  baseline = t;
}

export function takeLabBaseline(): Tactics | null {
  return baseline;
}
