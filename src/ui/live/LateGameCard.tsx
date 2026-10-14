import { useState, useSyncExternalStore } from 'react';
import { Flag, X } from 'lucide-react';
import type { PlayCall, PossLog } from '../../core/sim/log';

/** The clock and score as the court shows them (the Live screen's ticker). */
interface Shown {
  get(): { clock: number; score: [number, number] };
  subscribe(fn: () => void): () => void;
}

const CALL_LABEL: Record<PlayCall['kind'], string> = { three: 'Go for 3', two: 'Quick 2', hold: 'Run clock / last shot', iso: 'Iso', foul: 'Foul now' };

/**
 * Play calls from the bench in the last two minutes of a close 4th quarter or overtime (as the court
 * shows it): an offensive call for the next trip, "foul now" for the next defensive one, with a
 * timeout first if wanted. A call changes what the team looks for, not how well it plays. Everything
 * shown comes from the court's clock and score and the possessions it has drawn (the last of `logs`
 * while `drawing`), never from the sim running ahead of it.
 */
export function LateGameCard({
  side,
  shown,
  quarter,
  logs,
  drawing,
  nameOf,
  timeout,
  initialCall,
  callPlay,
  cancelPlay,
}: {
  side: 0 | 1;
  shown: Shown;
  quarter: number;
  logs: PossLog[];
  drawing: boolean;
  nameOf: (pid: number) => string;
  /** Calls the user's timeout, as the TO button does. */
  timeout: () => void;
  /** A call still waiting for its possession when the card comes up (a game picked up after the app was closed). */
  initialCall?: PlayCall | null;
  /** Call a play, or cancel it, through the live game (which journals it): false when the call can't be run. */
  callPlay: (call: PlayCall) => boolean;
  cancelPlay: () => void;
}) {
  const { clock, score } = useSyncExternalStore(shown.subscribe, shown.get);
  // the call, its period, and how many possessions the court had drawn when it was made
  const [called, setCalled] = useState<{ call: PlayCall; q: number; from: number } | null>(() => (initialCall ? { call: initialCall, q: quarter, from: logs.length } : null));
  const [withTimeout, setWithTimeout] = useState(false);
  const margin = score[side] - score[1 - side];
  // between periods there is nothing to call (a call never outlives its period), and the card is for close games only
  if (quarter < 4 || clock > 120 || clock <= 0.05 || Math.abs(margin) > 8) return null;
  const drawn = drawing ? logs[logs.length - 1] : undefined;
  // the chip clears once the court draws the possession that ran the call, or a new period
  const since = called ? logs.slice(called.from) : [];
  const pending = called && !since.some((l) => l.call?.t === side || l.q !== called.q) ? called : null;
  const five = drawn?.on[side] ?? logs[logs.length - 1]?.on[side] ?? [];
  const call = (c: PlayCall) => {
    if (withTimeout) timeout();
    setWithTimeout(false);
    if (callPlay(c)) setCalled({ call: c, q: quarter, from: logs.length });
  };
  const cancel = () => {
    cancelPlay();
    setCalled(null);
  };
  const sit = drawn?.sit?.[side];
  const label = pending && (pending.call.kind === 'iso' ? `Iso: ${nameOf(pending.call.pid)}` : CALL_LABEL[pending.call.kind]);
  return (
    <div className="card tight fade-in" role="group" aria-label="Late-game play calls">
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 6 }}>
          <Flag size={16} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
          <span className="bold small">Late game</span>
        </div>
        {sit && <span className="tag info">Plan: {sit}</span>}
      </div>
      {pending && (
        <div className="row" style={{ gap: 6, marginTop: 8 }}>
          <span className="pill" role="status">
            Called: {label}
          </span>
          <button className="btn xs ghost" aria-label="Cancel the call" onClick={cancel}>
            <X size={14} /> Cancel
          </button>
        </div>
      )}
      <div className="tiny dim upper bold" style={{ marginTop: 10, marginBottom: 6 }}>
        On offense
      </div>
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
      </div>
      {five.length > 0 && (
        <div className="chips" role="group" aria-label="Isolation for" style={{ marginTop: 6 }}>
          {five.map((pid) => (
            <button key={pid} className="chip" aria-label={`Isolation for ${nameOf(pid)}`} onClick={() => call({ kind: 'iso', pid })}>
              Iso: {nameOf(pid)}
            </button>
          ))}
        </div>
      )}
      <div className="row between" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="col" style={{ gap: 6 }}>
          <span className="tiny dim upper bold">On defense</span>
          <button className="chip" onClick={() => call({ kind: 'foul' })}>
            Foul now
          </button>
        </div>
        <button className={`chip ${withTimeout ? 'on' : ''}`} aria-pressed={withTimeout} onClick={() => setWithTimeout((x) => !x)}>
          Timeout + play
        </button>
      </div>
      <div className="tiny dim" style={{ marginTop: 8 }}>
        Offensive calls run on your next trip, Foul now on theirs. A call lasts until it is run or the period ends.
      </div>
    </div>
  );
}
