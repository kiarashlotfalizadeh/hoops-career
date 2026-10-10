import * as Comlink from 'comlink';
import type { LabWorkerApi } from '../workers/lab.worker';

let remote: Comlink.Remote<LabWorkerApi> | null = null;

export function labWorker(): Comlink.Remote<LabWorkerApi> {
  if (!remote) {
    const w = new Worker(new URL('../workers/lab.worker.ts', import.meta.url), { type: 'module' });
    remote = Comlink.wrap<LabWorkerApi>(w);
  }
  return remote;
}
