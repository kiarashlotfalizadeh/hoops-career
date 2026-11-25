// The Team Instructions' measured figures (core/analysis/outlook.ts): a tenth of a second of games,
// played in slices between frames a beat after the last edit, kept by what decides them so a setting
// put back reads at once. While a new reading is on its way the last one stays up, marked stale.
import { useEffect, useState } from 'react';
import type { League, Tactics } from '../../core/types';
import { outlookKey, outlookRun, type Outlook } from '../../core/analysis/outlook';

const KEEP = 40;
const kept = new Map<string, Outlook>();
/** Games a slice plays before the page gets a frame. */
const SLICE = 5;
/** The wait after an edit before measuring (a run of taps measures once). */
const WAIT_MS = 140;

export interface OutlookState {
  /** The latest reading (the last one while a new one is measured; none before the first). */
  out: Outlook | null;
  /** The reading shown is of earlier settings. */
  stale: boolean;
}

export function useOutlook(league: League, t: Tactics, on = true): OutlookState {
  const key = outlookKey(league, t);
  const [state, setState] = useState<{ key: string; out: Outlook } | null>(() => (kept.has(key) ? { key, out: kept.get(key)! } : null));
  useEffect(() => {
    if (!on) return;
    const have = kept.get(key);
    if (have) {
      setState({ key, out: have });
      return;
    }
    let gone = false;
    let timer: ReturnType<typeof setTimeout>;
    const start = () => {
      const run = outlookRun(league, t);
      const slice = () => {
        if (gone) return;
        if (run.step(SLICE)) timer = setTimeout(slice, 0);
        else {
          const out = run.result();
          kept.set(key, out);
          if (kept.size > KEEP) kept.delete(kept.keys().next().value!);
          setState({ key, out });
        }
      };
      slice();
    };
    timer = setTimeout(start, WAIT_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
    // (the key stands for the league and the tactics)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on]);
  return { out: state?.out ?? null, stale: !state || state.key !== key };
}
