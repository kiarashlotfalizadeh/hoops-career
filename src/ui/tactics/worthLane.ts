// One lane for the staff's measurements in the sim worker: a newer measurement there stops the one
// running (simClient), so the screen in front of the user goes first. The matchup page's counters
// hold the lane while they're measured; the staff's background measurements of the user's changes
// (editWatch.ts) wait for it to be free, and pick up again when it is.

let busy = 0;
const idle = new Set<() => void>();

/** Whether a measurement the user is waiting on holds the lane. */
export const laneBusy = () => busy > 0;

/** Hold the lane while `run` measures; the waiting ones are told when it's free. */
export async function inLane<T>(run: () => Promise<T>): Promise<T> {
  busy++;
  try {
    return await run();
  } finally {
    busy--;
    if (!busy) for (const f of [...idle]) f();
  }
}

/** Call `f` each time the lane comes free; returns the way to stop. */
export function onLaneIdle(f: () => void): () => void {
  idle.add(f);
  return () => void idle.delete(f);
}
