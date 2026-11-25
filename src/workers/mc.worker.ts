import * as Comlink from 'comlink';
import { fromWire, playRollouts, type Rollouts, type WireRollouts } from '../core/sim/rollouts';

// One of the rollout pool's workers (state/simPool.ts): it is sent a batch once (the game it plays from,
// as plain data) and then plays the shares of it it's handed, by index, until the batch is closed.

const batches = new Map<number, Rollouts>();

const api = {
  open(id: number, r: WireRollouts) {
    batches.set(id, fromWire(r));
  },
  run(id: number, from: number, to: number): Float64Array {
    const r = batches.get(id);
    if (!r) throw new Error(`rollout batch ${id} isn't open`);
    const rows = playRollouts(r, from, to);
    return Comlink.transfer(rows, [rows.buffer]);
  },
  close(id: number) {
    batches.delete(id);
  },
};

export type McWorkerApi = typeof api;
Comlink.expose(api);
