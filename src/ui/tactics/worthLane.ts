// One lane for the staff's measurements in the sim worker: they run one at a time, in turn. Two in the
// worker at once stop each other (a newer one stops the one running, simClient), and the matchup
// page's counters and a staff call's numbers stopped each other that way until the page gave up,
// still reading "Staff still looking…" (the playtest, 2026-11-25). A measurement whose turn comes
// after it stopped being wanted (`wanted`) is skipped. The staff's background measurements of the
// user's changes (editWatch.ts) wait for the lane to be free, and pick up again when it is.

let busy = 0;
let tail: Promise<void> = Promise.resolve();
const idle = new Set<() => void>();

/** Whether a measurement the user is waiting on holds the lane (or waits for it). */
export const laneBusy = () => busy > 0;

/**
 * Hold the lane while `run` measures, once the measurements before it are done; the waiting ones are
 * told when it's free. `wanted` is asked when its turn comes: false, and it's skipped (null).
 */
export async function inLane<T>(run: () => Promise<T>, wanted: () => boolean = () => true): Promise<T | null> {
  busy++;
  const before = tail;
  let free!: () => void;
  tail = new Promise<void>((res) => (free = res));
  try {
    await before;
    return wanted() ? await run() : null;
  } finally {
    free();
    busy--;
    if (!busy) for (const f of [...idle]) f();
  }
}

/** Call `f` each time the lane comes free; returns the way to stop. */
export function onLaneIdle(f: () => void): () => void {
  idle.add(f);
  return () => void idle.delete(f);
}
