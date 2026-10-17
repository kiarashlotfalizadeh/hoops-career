// The Tactics Lab's worker client: a stopped worker's late error never stops a newer run.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLab, withLab } from '../labClient';

class FakeWorker extends EventTarget {
  static all: FakeWorker[] = [];
  terminated = false;
  constructor() {
    super();
    FakeWorker.all.push(this);
  }
  postMessage() {}
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  resetLab();
  FakeWorker.all = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('lab client', () => {
  it("a stopped worker's late error doesn't stop the run that replaced it", async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const never = () => new Promise<never>(() => {});
    // leaving the Lab mid-run stops its worker; the next visit starts another
    const first = withLab(never);
    resetLab();
    await expect(first).rejects.toThrow('The lab was stopped.');
    let failed: unknown = null;
    void withLab(never).catch((e: unknown) => (failed = e));
    const [old, cur] = FakeWorker.all;
    expect(cur).toBeDefined();
    old.dispatchEvent(Object.assign(new Event('error'), { message: 'late' }));
    old.dispatchEvent(new Event('messageerror'));
    await Promise.resolve();
    expect(cur.terminated).toBe(false);
    expect(failed).toBeNull();
    // its own crash still fails it
    cur.dispatchEvent(Object.assign(new Event('error'), { message: 'crashed' }));
    await Promise.resolve();
    expect(cur.terminated).toBe(true);
    expect((failed as Error | null)?.message).toBe('crashed');
  });

  it("a call that throws before it's sent fails, and its stall timer goes with it", async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.useFakeTimers();
    await expect(
      withLab(() => {
        throw new Error('bad request');
      }),
    ).rejects.toThrow('bad request');
    void withLab(() => new Promise<never>(() => {}), 60 * 60_000).catch(() => {});
    vi.advanceTimersByTime(10 * 60_000);
    expect(FakeWorker.all.at(-1)!.terminated).toBe(false);
  });
});
