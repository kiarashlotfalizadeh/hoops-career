import type { CSSProperties } from 'react';
import { Flame, Snowflake } from 'lucide-react';
import type { GameSim } from '../../core/sim/engine';
import type { GameManagement } from '../../core/types';
import { madeAtt, plural } from '../../core/format';
import { Ovr, Section, Tag, Toggle } from '../components/ui';
import { inkOn } from '../teamColors';
import { foulLimit } from './alerts';
import { subsLine, type Drawn, type DrawnPlayer } from './drawn';

/** Made shots in a row that light the flame (the engine's Hot hand feeds a shooter from three). */
export const HOT_STREAK = 3;

/** Cold: six shots or more, a quarter of them or fewer in. */
export const isCold = (p: Pick<DrawnPlayer, 'fgm' | 'fga'>) => p.fga >= 6 && p.fgm / p.fga <= 0.25;

export interface SideInfo {
  abbrev: string;
  /** Jersey [fill, trim]. */
  kit: [string, string];
  manage: GameManagement;
}

/** Energy in a word, against the staff's sub-out mark. */
const ENERGY = { good: 'Fresh', warn: 'Tiring', bad: 'Tired' } as const;

/** The columns' names, once over a list, in the rows' own grid. */
function RowHead() {
  return (
    <div className="lv-pl lv-pl-h" aria-hidden="true">
      <span />
      <span />
      <span>OVR</span>
      <span>MIN</span>
      <span>PTS</span>
      <span>PF</span>
    </div>
  );
}

/**
 * The console's Players view, one list a question: your five (who's tired, who's in foul trouble), your
 * bench (who can come in), their five. The same row everywhere, so the eye compares down one set of
 * columns: his number, name and energy in a word, then OVR, minutes, points and fouls. Tap any player
 * for his sheet: subs, his orders, his matchups, a Hack-a-player. Who's on and off comes from the game
 * itself (a sub has to be possible now); the numbers from the possession the court last drew (subsLine).
 */
export function Lineup({
  sim,
  view,
  side,
  fives,
  info,
  nameOf,
  jersey,
  ovr,
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
  ovr: (pid: number) => number | undefined;
  onTap: (pid: number, mine: boolean) => void;
  setManualSubs: (on: boolean) => void;
}) {
  const t = sim.T[side];
  const other = (1 - side) as 0 | 1;
  const row = (pid: number, s: 0 | 1) => {
    const sp = sim.T[s].byId.get(pid);
    if (!sp) return null;
    const mine = s === side;
    const l = subsLine(view, s, sp);
    const p = view.sides[s].players.find((x) => x.pid === pid);
    const fat = info[s].manage.fatigueSub * 100;
    const tone = l.energy < fat ? 'bad' : l.energy < fat + 15 ? 'warn' : 'good';
    const limit = foulLimit(view.q, info[s].manage.foulTrouble);
    const hot = !!p && p.streak >= HOT_STREAK;
    const cold = !!p && !hot && isCold(p);
    const rating = ovr(pid);
    const more = `: ${ENERGY[tone]}, ${plural(l.min, 'minute')}, ${plural(l.pts, 'point')}, ${plural(l.fouls, 'foul')}. ${mine ? 'Subs and orders' : 'Stop him, guard him, Hack-a-player'}`;
    return (
      <button
        key={pid}
        className={`lv-pl${l.out ? ' out' : ''}`}
        onClick={() => onTap(pid, mine)}
        aria-haspopup="dialog"
        title={hot ? `${p.streak} straight makes` : cold ? `${madeAtt(p.fgm, p.fga)} FG` : undefined}
      >
        <span className="lv-pl-num" style={{ background: info[s].kit[0], color: inkOn(info[s].kit[0]), borderColor: info[s].kit[1] } as CSSProperties}>
          {jersey(pid)}
        </span>
        <span className="lv-pl-who">
          <span className="lv-pl-name">
            <span className="ellipsis">{nameOf(pid)}</span>
            <span className="sr-only">{more}</span>
            {hot && (
              <span className="lv-pl-mark hot" aria-hidden="true">
                <Flame size={12} />
                {p.streak}
              </span>
            )}
            {cold && (
              <span className="lv-pl-mark cold" aria-hidden="true">
                <Snowflake size={12} />
              </span>
            )}
          </span>
          {l.out ? (
            <Tag tone={l.out === 1 ? 'bad' : undefined}>{l.out === 1 ? 'Fouled out' : sp.dnp === 'Rest' ? 'Rest' : 'Out'}</Tag>
          ) : (
            <span className={`lv-pl-energy ${tone}`} aria-hidden="true">
              <span className="lv-pl-bar">
                <span style={{ width: `${l.energy}%` }} />
              </span>
              {ENERGY[tone]}
            </span>
          )}
        </span>
        <span className="lv-pl-ovr" aria-hidden="true">
          {rating !== undefined && <Ovr v={rating} size="sm" />}
        </span>
        <span className="lv-pl-n num" aria-hidden="true">
          {l.min}
        </span>
        <span className="lv-pl-n strong num" aria-hidden="true">
          {l.pts}
        </span>
        <span className={`lv-pl-n num${l.fouls >= 5 ? ' bad' : l.fouls >= limit ? ' warn' : ''}`} aria-hidden="true">
          {l.fouls}
        </span>
      </button>
    );
  };
  return (
    <div className="lv-lu">
      <Section title="On the floor" right={<span className="tiny dim">Tap a player to sub</span>}>
        <div className="card flush list" role="group" aria-label="On the floor">
          <RowHead />
          {fives[side].map((pid) => row(pid, side))}
        </div>
      </Section>
      <Section title="Bench">
        <div className="card flush list" role="group" aria-label="Bench">
          <RowHead />
          {t.players.filter((p) => !p.on).map((p) => row(p.pid, side))}
        </div>
      </Section>
      <Section title={`${info[other].abbrev} on the floor`}>
        <div className="card flush list" role="group" aria-label={`${info[other].abbrev} on the floor`}>
          <RowHead />
          {fives[other].map((pid) => row(pid, other))}
        </div>
      </Section>
      <Toggle
        on={t.manualSubs}
        onChange={setManualSubs}
        label="Make the subs yourself"
        help="On: only your subs change the lineup, apart from injuries and foul-outs. The staff calls no timeouts for runs."
      />
    </div>
  );
}
