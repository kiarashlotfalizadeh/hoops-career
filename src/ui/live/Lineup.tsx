import type { GameSim } from '../../core/sim/engine';
import { plural } from '../../core/format';
import { Tag, Toggle } from '../components/ui';
import { subsLine, type Drawn } from './drawn';
import { OnCourt, type SideInfo } from './OnCourt';

/**
 * The console's Lineup view: both fives on the floor (energy, fouls, points, hot or cold), your
 * bench under them, and who makes the substitutions. Tap any player for his sheet: subs, his orders,
 * his matchups, a Hack-a-player. Who's on and off comes from the game itself (a sub has to be possible now);
 * the numbers from the possession the court last drew (see subsLine).
 */
export function Lineup({
  sim,
  view,
  side,
  fives,
  info,
  nameOf,
  jersey,
  onTap,
  setManualSubs,
}: {
  sim: GameSim;
  view: Drawn;
  side: 0 | 1;
  /** [home, away] as the court draws them. */
  fives: [number[], number[]];
  /** [home, away]. */
  info: [SideInfo, SideInfo];
  nameOf: (pid: number) => string;
  jersey: (pid: number) => string;
  onTap: (pid: number, mine: boolean) => void;
  setManualSubs: (on: boolean) => void;
}) {
  const t = sim.T[side];
  const bench = t.players.filter((p) => !p.on);
  // the energy bar's colour, against the staff's sub-out mark
  const fat = t.t.manage.fatigueSub;
  const tone = (e: number) => (e / 100 < fat ? 'bad' : e / 100 < fat + 0.15 ? 'warn' : 'good');
  return (
    <div className="lv-lu">
      <OnCourt view={view} fives={fives} side={side} info={info} names={nameOf} jersey={jersey} onTap={onTap} />
      <section className="sec">
        <div className="sec-h">
          <h3>Bench</h3>
          {/* energy first (what a sub is decided on), then the box score's own order */}
          <div className="lv-lu-head" aria-hidden="true">
            <span>Energy</span>
            <span>MIN</span>
            <span>PTS</span>
            <span>PF</span>
          </div>
        </div>
        <div className="card flush list">
          {bench.map((p) => {
            const l = subsLine(view, side, p);
            return (
              <button key={p.pid} className={`lv-lu-row${l.out ? ' out' : ''}`} onClick={() => onTap(p.pid, true)} aria-haspopup="dialog">
                <span className="lv-lu-name">
                  <span className="ellipsis">{nameOf(p.pid)}</span>
                  {l.out ? <Tag tone={l.out === 1 ? 'bad' : undefined}>{l.out === 1 ? 'Fouled out' : p.dnp === 'Rest' ? 'Rest' : 'Out'}</Tag> : null}
                </span>
                <span className="lv-lu-e num">
                  <span className="lv-lu-bar" aria-hidden="true">
                    <span className={tone(l.energy)} style={{ width: `${l.energy}%` }} />
                  </span>
                  {l.energy}%
                </span>
                <span className="lv-lu-n num" aria-hidden="true">
                  {l.min}
                </span>
                <span className="lv-lu-n num" aria-hidden="true">
                  {l.pts}
                </span>
                <span className="lv-lu-n num" aria-hidden="true">
                  {l.fouls}
                </span>
                <span className="sr-only">
                  , {plural(l.min, 'minute')}, {plural(l.pts, 'point')}, {plural(l.fouls, 'foul')}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <Toggle
        on={t.manualSubs}
        onChange={setManualSubs}
        label="Make the subs yourself"
        help="On: only your subs change the lineup, apart from injuries and foul-outs. The staff calls no timeouts for runs."
      />
    </div>
  );
}
