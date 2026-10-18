import type { GameSim } from '../../core/sim/engine';
import { plural } from '../../core/format';
import { Tag, Toggle } from '../components/ui';
import { inkOn } from '../teamColors';
import { subsLine, type Drawn } from './drawn';
import { OnCourt, type SideInfo } from './OnCourt';

/**
 * The Clipboard's Lineup tab: both fives on the floor (energy, fouls, points, hot or cold), your
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
        label="I'll handle substitutions"
        help="On: only your subs change the lineup (injuries and foul-outs aside), and the staff calls no timeouts for runs. Off: the staff follows the rotation plan."
      />
    </div>
  );
}

/**
 * Your five in one row, for a phone too short to dock the clipboard under the court: number, points,
 * energy and foul trouble at a glance. Tap one for his sheet.
 */
export function MiniFive({
  view,
  side,
  five,
  kit,
  fatigue,
  nameOf,
  jersey,
  onTap,
}: {
  view: Drawn;
  side: 0 | 1;
  five: number[];
  /** Your jersey [fill, trim]. */
  kit: [string, string];
  /** The staff's sub-out mark (0..1). */
  fatigue: number;
  nameOf: (pid: number) => string;
  jersey: (pid: number) => string;
  onTap: (pid: number) => void;
}) {
  const ds = view.sides[side];
  return (
    <div className="lv-mf" role="group" aria-label="Your five">
      {five.map((pid) => {
        const p = ds.players.find((x) => x.pid === pid);
        if (!p) return null;
        const e = Math.round(p.energy * 100);
        const tone = p.energy < fatigue ? 'bad' : p.energy < fatigue + 0.15 ? 'warn' : 'good';
        return (
          <button key={pid} className="lv-mf-p" onClick={() => onTap(pid)} aria-haspopup="dialog">
            <span className="lv-mf-top">
              <span className="lv-oc-num" style={{ background: kit[0], color: inkOn(kit[0]), borderColor: kit[1] }} aria-hidden="true">
                {jersey(pid)}
              </span>
              <span className="lv-mf-pts num" aria-hidden="true">
                {p.pts}
              </span>
            </span>
            <span className="lv-mf-name ellipsis">{nameOf(pid)}</span>
            <span className="lv-lu-bar lv-mf-bar" aria-hidden="true">
              <span className={tone} style={{ width: `${e}%` }} />
            </span>
            <span className="sr-only">
              : {plural(p.pts, 'point')}, {e}% energy, {plural(p.fouls, 'foul')}
            </span>
            {p.fouls >= 3 && (
              <span className={`lv-mf-f num ${p.fouls >= 5 ? 'bad' : 'warn'}`} aria-hidden="true">
                {p.fouls} PF
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
