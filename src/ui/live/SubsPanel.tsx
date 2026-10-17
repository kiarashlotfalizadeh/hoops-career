import { useState } from 'react';
import type { GameSim } from '../../core/sim/engine';
import { useStore } from '../../state/store';
import { Tag, Toggle } from '../components/ui';
import { subsLine, type Drawn } from './drawn';

/**
 * Substitutions: who's on and off comes from the game itself (a sub has to be possible now); each
 * player's energy, fouls, points, minutes and whether he's out (fouled out, hurt, resting) from the
 * possession the court last drew (see subsLine), so a foul-out still being drawn isn't given away.
 * `initialOut` arrives picked to come out. The changes go through the live game (`substitute`,
 * `setManualSubs`), which journals them, and a sub the game can't make now says so.
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
  const line = (p: (typeof t.players)[number]) => subsLine(view, side, p);
  // the energy bar's colour, against the staff's sub-out mark
  const fat = t.t.manage.fatigueSub;
  const tone = (e: number) => (e / 100 < fat ? 'bad' : e / 100 < fat + 0.15 ? 'warn' : 'good');
  const head = (
    <div className="sp-head" aria-hidden="true">
      <span>Energy</span>
      <span>F</span>
      <span>Pts</span>
      <span>Min</span>
    </div>
  );
  return (
    <div className="sp">
      <Toggle
        on={t.manualSubs}
        onChange={(v) => {
          setManualSubs(v);
          force((x) => x + 1);
          onChange();
        }}
        label="I'll handle substitutions"
        help="On: only your subs change the lineup (injuries and foul-outs aside), and the staff calls no timeouts for runs. Off: the staff follows the rotation plan."
      />
      <div className={`sp-step${outPid === null ? '' : ' on'}`} role="status">
        {outPid === null ? 'Tap a player on the floor, then one from the bench.' : `${nameOf(outPid)} comes out: pick who comes in.`}
      </div>
      <section className="sec">
        <div className="sec-h">
          <h3>On the floor</h3>
          {head}
        </div>
        <div className="card flush list">
          {t.on.map((p) => {
            const l = line(p);
            return (
              <button key={p.pid} className={`sp-row${outPid === p.pid ? ' picked' : ''}`} aria-pressed={outPid === p.pid} onClick={() => setOut(p.pid)}>
                <span className="sp-name bold">{nameOf(p.pid)}</span>
                <span className="sp-e num">
                  <span className="sp-bar" aria-hidden="true">
                    <span className={tone(l.energy)} style={{ width: `${l.energy}%` }} />
                  </span>
                  {l.energy}%
                </span>
                <span className="sp-n num" aria-hidden="true">
                  {l.fouls}
                </span>
                <span className="sp-n num" aria-hidden="true">
                  {l.pts}
                </span>
                <span className="sp-n num" aria-hidden="true">
                  {l.min}
                </span>
                <span className="sr-only">
                  , {l.fouls} foul{l.fouls === 1 ? '' : 's'}, {l.pts} point{l.pts === 1 ? '' : 's'}, {l.min} minute{l.min === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="sec">
        <div className="sec-h">
          <h3>Bench</h3>
        </div>
        <div className="card flush list">
          {bench.map((p) => {
            const l = line(p);
            return (
              <button
                key={p.pid}
                className={`sp-row${l.out ? ' out' : ''}`}
                disabled={!!l.out || outPid === null}
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
                <span className="sp-name">
                  {nameOf(p.pid)}
                  {l.out ? (
                    <>
                      {' '}
                      <Tag tone={l.out === 1 ? 'bad' : undefined}>{l.out === 1 ? 'Fouled out' : p.dnp === 'Rest' ? 'Rest' : 'Out'}</Tag>
                    </>
                  ) : (
                    <span className="sr-only">, bench</span>
                  )}
                </span>
                <span className="sp-e num">
                  <span className="sp-bar" aria-hidden="true">
                    <span className={tone(l.energy)} style={{ width: `${l.energy}%` }} />
                  </span>
                  {l.energy}%
                </span>
                <span className="sp-n num" aria-hidden="true">
                  {l.fouls}
                </span>
                <span className="sp-n num" aria-hidden="true">
                  {l.pts}
                </span>
                <span className="sp-n num" aria-hidden="true">
                  {l.min}
                </span>
                <span className="sr-only">
                  , {l.fouls} foul{l.fouls === 1 ? '' : 's'}, {l.pts} point{l.pts === 1 ? '' : 's'}, {l.min} minute{l.min === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
