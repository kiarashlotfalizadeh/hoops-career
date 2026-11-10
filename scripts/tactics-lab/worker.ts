// A lab worker (see pool.ts): builds the lab league once, then plays each job it is sent with runLab and
// sends the summary back.
import { runLab } from '../../src/core/ai/lab';
import type { League } from '../../src/core/types';
import { labLeague, labSide } from './common';
import type { LabJob } from './pool';

let L: League | null = null;

process.on('message', (msg: { job: LabJob }) => {
  const { job } = msg;
  try {
    L ??= labLeague();
    const result = runLab({ a: labSide(L, job.a), b: labSide(L, job.b), games: job.games, seed: job.seed, ...(job.patch ? { patch: job.patch } : {}) });
    process.send!({ ok: true, result });
  } catch (e) {
    process.send!({ ok: false, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
});
// (the parent closing the channel ends the worker)
process.on('disconnect', () => process.exit(0));
