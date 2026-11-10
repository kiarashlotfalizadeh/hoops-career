// A pool of lab worker processes (worker.ts, forked with this process's tsx loader). Each job is one
// runLab call, self-contained (the worker builds the lab league once and fresh sides for every job), so
// the results don't depend on how many workers there are or which one ran what.
import { fork, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import type { LabSummary, TacticsPatch } from '../../src/core/ai/lab';
import { LAB_DIR } from './common';

export interface LabJob {
  /** Side A and side B by tid in the lab league; the patch is applied to side A. */
  a: number;
  b: number;
  games: number;
  seed: number;
  patch?: TacticsPatch;
}

interface Pending {
  job: LabJob;
  resolve: (r: LabSummary) => void;
  reject: (e: Error) => void;
}

interface Worker {
  proc: ChildProcess;
  busy: Pending | null;
}

export class Pool {
  private workers: Worker[] = [];
  private queue: Pending[] = [];
  private closed = false;

  constructor(readonly size: number) {
    for (let i = 0; i < size; i++) this.spawn();
  }

  private spawn() {
    // (the forked process inherits this one's exec flags: tsx's loader, so it runs TypeScript)
    const proc = fork(join(LAB_DIR, 'worker.ts'), [], { serialization: 'advanced', stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const w: Worker = { proc, busy: null };
    proc.on('message', (msg: { ok: boolean; result?: LabSummary; error?: string }) => {
      const p = w.busy;
      w.busy = null;
      if (p) {
        if (msg.ok) p.resolve(msg.result!);
        else p.reject(new Error(msg.error));
      }
      this.pump();
    });
    proc.on('exit', (code) => {
      this.workers = this.workers.filter((x) => x !== w);
      if (w.busy) w.busy.reject(new Error(`lab worker exited (code ${code}) during a job`));
      w.busy = null;
      if (!this.closed) {
        this.spawn();
        this.pump();
      }
    });
    this.workers.push(w);
  }

  private pump() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue;
      const p = this.queue.shift()!;
      w.busy = p;
      w.proc.send({ job: p.job });
    }
  }

  run(job: LabJob): Promise<LabSummary> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }

  close() {
    this.closed = true;
    for (const w of this.workers) w.proc.kill();
    this.workers = [];
  }
}

/** Runs every job on the pool (or on a pool of `workers` made for the purpose), in order of the results. Failed jobs come back as Errors. */
export async function runJobs(jobs: LabJob[], opts: { pool?: Pool; workers: number; onDone?: () => void }): Promise<(LabSummary | Error)[]> {
  const pool = opts.pool ?? new Pool(Math.min(opts.workers, Math.max(1, jobs.length)));
  try {
    return await Promise.all(
      jobs.map((j) =>
        pool.run(j).then(
          (r) => {
            opts.onDone?.();
            return r;
          },
          (e: Error) => {
            opts.onDone?.();
            return e;
          },
        ),
      ),
    );
  } finally {
    if (!opts.pool) pool.close();
  }
}
