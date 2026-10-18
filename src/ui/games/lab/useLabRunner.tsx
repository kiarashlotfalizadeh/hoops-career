// Runs lab work on the worker for a screen: whether it's busy, how many games are done of how many,
// Stop, and the bar that shows it. Leaving the screen mid-run stops the worker, so the next visit
// isn't queued behind stale sims.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../state/store';
import { progressCallback, resetLab, withLab } from '../../../state/labClient';
import { Spinner } from '../../components/ui';

type Worker = Parameters<Parameters<typeof withLab>[0]>[0];
/** A progress callback for one of a job's runs (runs that share the worker each report their own count; the bar shows the sum). */
type Track = (slot: number) => ReturnType<typeof progressCallback>;

export interface LabRunner {
  busy: boolean;
  progress: number;
  total: number;
  /** Runs `job` for `total` games; its result, or undefined when it was stopped, left or failed (a failure says so in a toast). */
  run: <T>(total: number, job: (w: Worker, track: Track) => Promise<T>) => Promise<T | undefined>;
  stop: () => void;
}

export function useLabRunner(): LabRunner {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(1);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // a run stopped with Stop fails as one stopped by leaving does
  const stopped = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (busyRef.current) resetLab();
    };
  }, []);
  const run = async <T,>(games: number, job: (w: Worker, track: Track) => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    stopped.current = false;
    setProgress(0);
    setTotal(games);
    const done: number[] = [];
    const track: Track = (slot) =>
      progressCallback((n) => {
        done[slot] = n;
        if (mounted.current) setProgress(done.reduce((a, x) => a + (x ?? 0), 0));
      });
    try {
      const out = await withLab((w) => job(w, track));
      return mounted.current ? out : undefined;
    } catch (e) {
      // (not a run stopped with Stop, or by leaving: nothing went wrong there)
      if (mounted.current && !stopped.current) {
        console.error(e);
        useStore.getState().toast(`The lab could not finish: ${e instanceof Error ? e.message : 'unknown error'}`, 'bad');
      }
      return undefined;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const stop = () => {
    stopped.current = true;
    resetLab();
  };
  return { busy, progress, total, run, stop };
}

/** The running job: what it's simulating, games done of all, and Stop. */
export function LabProgress({ lab, what }: { lab: LabRunner; what: string }) {
  const done = Math.min(lab.progress, lab.total);
  return (
    <div className="card lab-busy">
      <div className="row">
        <Spinner />
        <span className="small dim2 grow">Simulating {what}…</span>
        <span className="small num dim">
          {done}/{lab.total}
        </span>
        <button className="btn xs ghost" onClick={lab.stop}>
          Stop
        </button>
      </div>
      <div className="bar" role="progressbar" aria-label="Games simulated" aria-valuemin={0} aria-valuemax={lab.total} aria-valuenow={done}>
        <div className="lab-fill" style={{ width: `${Math.min(100, (lab.progress / Math.max(1, lab.total)) * 100)}%` }} />
      </div>
    </div>
  );
}
