import * as Comlink from 'comlink';
import { evaluateCandidates, runLab, type Candidate, type LabRequest, type LabSide } from '../core/ai/lab';

/** Progress callbacks arrive as Comlink proxies; report every few games to keep messages cheap. */
const throttled = (onProgress?: (games: number) => void) => {
  if (!onProgress) return undefined;
  let n = 0;
  return () => {
    n++;
    if (n % 4 === 0) void onProgress(n);
  };
};

/** Each proxy keeps a message port open on both threads until it's released. */
const release = (onProgress?: (games: number) => void) => (onProgress as Comlink.Remote<(games: number) => void> | undefined)?.[Comlink.releaseProxy]();

const api = {
  runLab(req: LabRequest, onProgress?: (games: number) => void) {
    try {
      return runLab(req, throttled(onProgress));
    } finally {
      release(onProgress);
    }
  },
  evaluate(a: LabSide, b: LabSide, candidates: Candidate[], games: number, seed: number, onProgress?: (games: number) => void) {
    try {
      return evaluateCandidates(a, b, candidates, games, seed, throttled(onProgress));
    } finally {
      release(onProgress);
    }
  },
};

export type LabWorkerApi = typeof api;
Comlink.expose(api);
