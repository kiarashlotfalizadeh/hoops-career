import * as Comlink from 'comlink';
import { evaluateCandidates, runLab, type Candidate, type LabRequest, type LabSide } from '../core/ai/lab';

const api = {
  runLab(req: LabRequest) {
    return runLab(req);
  },
  evaluate(a: LabSide, b: LabSide, candidates: Candidate[], games: number, seed: number) {
    return evaluateCandidates(a, b, candidates, games, seed);
  },
};

export type LabWorkerApi = typeof api;
Comlink.expose(api);
