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

const api = {
  runLab(req: LabRequest, onProgress?: (games: number) => void) {
    return runLab(req, throttled(onProgress));
  },
  evaluate(a: LabSide, b: LabSide, candidates: Candidate[], games: number, seed: number, onProgress?: (games: number) => void) {
    return evaluateCandidates(a, b, candidates, games, seed, throttled(onProgress));
  },
};

export type LabWorkerApi = typeof api;
Comlink.expose(api);
