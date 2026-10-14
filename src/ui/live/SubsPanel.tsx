import { useState } from 'react';
import type { GameSim } from '../../core/sim/engine';
import { useStore } from '../../state/store';
import { Tag, Toggle } from '../components/ui';
import { drawnPlayer, type Drawn } from './drawn';

/**
 * Substitutions: who's on and off comes from the game itself (a sub has to be possible now), the
 * energy and fouls from the possession the court last drew. `initialOut` arrives picked to come out.
 * The changes go through the live game (`substitute`, `setManualSubs`), which journals them.
 */
export function SubsPanel({
  sim,
  view,
  side,
  nameOf,
  initialOut,
  substitute,
  setManualSubs,
  onChange,
}: {
  sim: GameSim;
  view: Drawn;
  side: 0 | 1;
  nameOf: (pid: number) => string;
  initialOut?: number;
  /** Sub `inPid` in for `outPid`: false when that isn't possible right now. */
  substitute: (outPid: number, inPid: number) => boolean;
  setManualSubs: (on: boolean) => void;
  onChange: () => void;
}) {
  const t = sim.T[side];
  const [outPid, setOut] = useState<number | null>(initialOut !== undefined && t.on.some((p) => p.pid === initialOut) ? initialOut : null);
  const [, force] = useState(0);
  const bench = t.players.filter((p) => !p.on);
  const line = (pid: number) => {
    const d = drawnPlayer(view, pid);
    const sp = t.byId.get(pid)!;
    return { energy: Math.round((d?.energy ?? sp.energy) * 100), fouls: d?.fouls ?? sp.fouls, pts: d?.pts ?? sp.b.pts };
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <Toggle
        on={t.manualSubs}
        onChange={(v) => {
          setManualSubs(v);
          force((x) => x + 1);
          onChange();
        }}
        label="I'll handle substitutions"
        help="Off: your staff follows the rotation plan. On: lineups only change when you sub (injuries and foul-outs excepted), and the staff calls no timeouts to stop runs."
      />
      <div className="small dim">{outPid === null ? 'Tap a player on the floor, then a bench player.' : `${nameOf(outPid)} comes out: now pick who comes in.`}</div>
      <div className="col" style={{ gap: 6 }}>
        {t.on.map((p) => {
          const l = line(p.pid);
          return (
            <button key={p.pid} className={`card tight row ${outPid === p.pid ? 'accent' : ''}`} style={{ gap: 8 }} aria-pressed={outPid === p.pid} onClick={() => setOut(p.pid)}>
              <Tag tone="info">ON</Tag>
              <span className="bold grow" style={{ textAlign: 'left' }}>
                {nameOf(p.pid)}
              </span>
              <span className="small num">{l.energy}%</span>
              <span className="small dim num">
                {l.fouls}F · {l.pts}p · {(p.b.sec / 60).toFixed(0)}m
              </span>
            </button>
          );
        })}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {bench.map((p) => {
          const l = line(p.pid);
          return (
            <button
              key={p.pid}
              className="card tight row"
              style={{ gap: 8, opacity: p.out ? 0.45 : undefined }}
              disabled={!!p.out || outPid === null}
              onClick={() => {
                if (outPid === null) return;
                // the game plays on while this sheet is open: the staff may have made a change first
                if (!substitute(outPid, p.pid)) {
                  const why = !t.on.some((x) => x.pid === outPid)
                    ? `${nameOf(outPid)} is already on the bench.`
                    : p.on
                      ? `${nameOf(p.pid)} is already on the floor.`
                      : `${nameOf(p.pid)} can't come in right now.`;
                  useStore.getState().toast(why, 'bad');
                }
                setOut(null);
                onChange();
              }}
            >
              <Tag>{p.out === 1 ? 'FOULED OUT' : p.out === 2 ? (p.dnp === 'Rest' ? 'REST' : 'OUT') : 'BENCH'}</Tag>
              <span className="grow" style={{ textAlign: 'left' }}>
                {nameOf(p.pid)}
              </span>
              <span className="small num">{l.energy}%</span>
              <span className="small dim num">
                {l.fouls}F · {(p.b.sec / 60).toFixed(0)}m
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
