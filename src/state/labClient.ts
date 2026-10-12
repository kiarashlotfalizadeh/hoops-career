import * as Comlink from 'comlink';
import type { LabWorkerApi } from '../workers/lab.worker';

type Lab = Comlink.Remote<LabWorkerApi>;

let worker: Worker | null = null;
let remote: Lab | null = null;
/** Lab calls in flight: how to fail each one, and its stall timer. */
const pending = new Map<(e: Error) => void, ReturnType<typeof setTimeout>>();

function ensure(): Lab {
  if (!worker || !remote) {
    const w = new Worker(new URL('../workers/lab.worker.ts', import.meta.url), { type: 'module' });
    // a worker already stopped (left mid-run) can still report an error: it mustn't kill a newer run's worker
    w.addEventListener('error', (e) => worker === w && resetLab(new Error(e.message || 'The lab worker crashed.')));
    w.addEventListener('messageerror', () => worker === w && resetLab(new Error('The lab worker sent an unreadable message.')));
    worker = w;
    remote = Comlink.wrap<LabWorkerApi>(w);
  }
  return remote;
}

/** Wrap a progress callback so the worker can call it across the thread boundary (the worker releases it when done). */
export const progressCallback = (fn: (games: number) => void) => Comlink.proxy(fn);

/** Stop any running lab sims (navigating away, a crash or a timeout) and start fresh next time; calls in flight fail with `reason`. */
export function resetLab(reason = new Error('The lab was stopped.')) {
  worker?.terminate();
  worker = null;
  remote = null;
  // their stall timers go too, so an old run's timeout can't kill a newer run's worker
  const waiting = [...pending.keys()];
  for (const timer of pending.values()) clearTimeout(timer);
  pending.clear();
  for (const fail of waiting) fail(reason);
}

/** Run lab work in the worker; rejects instead of hanging if the worker dies or stalls. */
export function withLab<T>(fn: (lab: Lab) => Promise<T>, timeoutMs = 6 * 60_000): Promise<T> {
  const lab = ensure();
  return new Promise<T>((resolve, reject) => {
    const done = () => {
      clearTimeout(pending.get(fail));
      pending.delete(fail);
    };
    const fail = (e: Error) => {
      done();
      reject(e);
    };
    pending.set(
      fail,
      setTimeout(() => resetLab(new Error('The lab timed out.')), timeoutMs),
    );
    fn(lab).then(
      (v) => {
        done();
        resolve(v);
      },
      (e: unknown) => fail(e instanceof Error ? e : new Error(String(e))),
    );
  });
}
