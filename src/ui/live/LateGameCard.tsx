import { useState, useSyncExternalStore } from 'react';
import { ClipboardList, Flag, X } from 'lucide-react';
import type { PlayCall, PossLog } from '../../core/sim/log';
import { callLabel, type Calls } from './plays';

/** The clock and score as the court shows them (the Live screen's ticker). */
interface Shown {
  get(): { clock: number; score: [number, number] };
  subscribe(fn: () => void): () => void;
}

/**
 * Play calls from the bench in the last two minutes of a close 4th quarter or overtime (as the court
 * shows it): an offensive call for the next trip, "foul now" for the next defensive one, with a
 * timeout first if wanted. A call changes what the team looks for, not how well it plays. Everything
 * shown comes from the court's clock and score and the possessions it has drawn (the last of `logs`
 * while `drawing`), never from the sim running ahead of it. The call waiting is the live game's
 * (`calls`): the Plays sheet and the huddle share it.
 */
export function LateGameCard({
  side,
  shown,
  quarter,
  logs,
  drawing,
  nameOf,
  timeout,
  calls,
  onSets,
}: {
  side: 0 | 1;
  shown: Shown;
  quarter: number;
  logs: PossLog[];
  drawing: boolean;
  nameOf: (pid: number) => string;
  /** Calls the user's timeout, as the TO button does. */
  timeout: () => void;
  calls: Calls;
  /** Opens the Plays sheet with the sets (from Advanced depth). */
  onSets?: () => void;
}) {
  const { clock, score } = useSyncExternalStore(shown.subscribe, shown.get);
  const [withTimeout, setWithTimeout] = useState(false);
  const margin = score[side] - score[1 - side];
  // between periods there is nothing to call (a call never outlives its period), and the card is for close games only
  if (quarter < 4 || clock > 120 || clock <= 0.05 || Math.abs(margin) > 8) return null;
  const drawn = drawing ? logs[logs.length - 1] : undefined;
  const pending = calls.pending;
  const five = drawn?.on[side] ?? logs[logs.length - 1]?.on[side] ?? [];
  const call = (c: PlayCall) => {
    if (withTimeout) timeout();
    setWithTimeout(false);
    calls.call(c);
  };
  const sit = drawn?.sit?.[side];
  return (
    <section className="card lgc fade-in" role="group" aria-label="Late-game play calls">
      <div className="lgc-h">
        <Flag size={15} className="accent-text" aria-hidden="true" />
        <span className="lgc-t">Late game</span>
        <span className="grow" />
        {sit && <span className="tag info">Plan: {sit}</span>}
        <button className={`chip ${withTimeout ? 'on' : ''}`} aria-pressed={withTimeout} onClick={() => setWithTimeout((x) => !x)}>
          Timeout + play
        </button>
      </div>
      {pending && (
        <div className="lgc-called">
          <span className="pill" role="status">
            Called: {callLabel(pending, nameOf)}
          </span>
          <button className="btn xs ghost" aria-label="Cancel the call" onClick={calls.cancel}>
            <X size={14} /> Cancel
          </button>
        </div>
      )}
      <div className="lgc-blk">
        <span className="over">On offense · your next trip</span>
        <div className="chips">
          <button className="chip" onClick={() => call({ kind: 'three' })}>
            Go for 3
          </button>
          <button className="chip" onClick={() => call({ kind: 'two' })}>
            Quick 2
          </button>
          <button className="chip" onClick={() => call({ kind: 'hold' })}>
            Run clock / last shot
          </button>
          {onSets && (
            <button className="chip" onClick={onSets}>
              <ClipboardList size={14} aria-hidden="true" /> Sets
            </button>
          )}
        </div>
        {five.length > 0 && (
          <div className="chips" role="group" aria-label="Isolation for">
            {five.map((pid) => (
              <button key={pid} className="chip" aria-label={`Isolation for ${nameOf(pid)}`} onClick={() => call({ kind: 'iso', pid })}>
                Iso: {nameOf(pid)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="lgc-blk">
        <span className="over">On defense · their next trip</span>
        <div className="chips">
          <button className="chip" onClick={() => call({ kind: 'foul' })}>
            Foul now
          </button>
        </div>
      </div>
      <div className="tiny dim">A call lasts until it&apos;s run or the period ends.</div>
    </section>
  );
}
