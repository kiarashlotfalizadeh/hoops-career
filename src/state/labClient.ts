import * as Comlink from 'comlink';
import type { LabWorkerApi } from '../workers/lab.worker';

type Lab = Comlink.Remote<LabWorkerApi>;

let worker: Worker | null = null;
let remote: Lab | null = null;
const pending = new Set<(e: Error) => void>();

function ensure(): Lab {
  if (!worker || !remote) {
    const w = new Worker(new URL('../workers/lab.worker.ts', import.meta.url), { type: 'module' });
    const crash = (msg: string) => {
      const waiting = [...pending];
      resetLab();
      for (const f of waiting) f(new Error(msg));
    };
    w.addEventListener('error', (e) => crash(e.message || 'The lab worker crashed.'));
    w.addEventListener('messageerror', () => crash('The lab worker sent an unreadable message.'));
    worker = w;
    remote = Comlink.wrap<LabWorkerApi>(w);
  }
  return remote;
}

/** Stop any running lab sims (navigating away, a crash or a timeout) and start fresh next time. */
export function resetLab() {
  worker?.terminate();
  worker = null;
  remote = null;
  pending.clear();
}

/** Run lab work in the worker; rejects instead of hanging if the worker dies or stalls. */
export function withLab<T>(fn: (lab: Lab) => Promise<T>, timeoutMs = 6 * 60_000): Promise<T> {
  const lab = ensure();
  return new Promise<T>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      pending.delete(fail);
    };
    const fail = (e: Error) => {
      done();
      reject(e);
    };
    const timer = setTimeout(() => {
      resetLab();
      fail(new Error('The lab timed out.'));
    }, timeoutMs);
    pending.add(fail);
    fn(lab).then(
      (v) => {
        done();
        resolve(v);
      },
      (e: unknown) => fail(e instanceof Error ? e : new Error(String(e))),
    );
  });
}
