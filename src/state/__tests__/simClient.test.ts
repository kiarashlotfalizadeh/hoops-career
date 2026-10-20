// The sim worker's client when the worker can't do its job: one whose code never loads (an update
// replaced it on the server, a browser that refuses it) hands the run to this thread instead of
// failing every sim; one that dies mid-run fails that run, and the next starts a fresh worker.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { simLeague, simLocally, taskLeague } from '../simClient';
import { testLeague } from './fixtures';

/** A Worker whose script never loads: it reports an error and never answers. */
class DeadWorker extends EventTarget {
  static made = 0;
  constructor() {
    super();
    DeadWorker.made++;
    setTimeout(() => this.dispatchEvent(new Event('error')), 5);
  }
  postMessage() {}
  terminate() {}
}

const hooks = { progress: () => {}, checkpoint: () => {} };

afterEach(() => {
  vi.unstubAllGlobals();
  simLocally(true);
  vi.restoreAllMocks();
});

describe('a sim worker that cannot start', () => {
  it('runs the sim in this thread instead, and so do later runs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    DeadWorker.made = 0;
    vi.stubGlobal('Worker', DeadWorker);
    simLocally(false);
    const l = testLeague('dead worker');
    const day = l.day;
    const out = await simLeague(l, { kind: 'days', n: 2 }, hooks);
    expect(out.league.day).toBe(day + 2);
    // the league handed in is never changed
    expect(l.day).toBe(day);
    const t = await taskLeague(out.league, { kind: 'faAdvance', days: 1 });
    expect(t.result).toEqual({ done: true });
    // one try at a worker, then this thread for good
    expect(DeadWorker.made).toBe(1);
  });
});
