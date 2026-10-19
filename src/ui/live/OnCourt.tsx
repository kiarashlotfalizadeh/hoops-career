import { memo, type CSSProperties } from 'react';
import { Flame, Snowflake } from 'lucide-react';
import type { GameManagement } from '../../core/types';
import { madeAtt, plural } from '../../core/format';
import { inkOn } from '../teamColors';
import { foulLimit } from './alerts';
import type { Drawn, DrawnPlayer } from './drawn';

/** Made shots in a row that light the flame (the engine's Hot hand feeds a shooter from three). */
export const HOT_STREAK = 3;

/** Cold: six shots or more, a quarter of them or fewer in. */
export const isCold = (p: Pick<DrawnPlayer, 'fgm' | 'fga'>) => p.fga >= 6 && p.fgm / p.fga <= 0.25;

export interface SideInfo {
  abbrev: string;
  /** Jersey [fill, trim]. */
  kit: [string, string];
  /** The team's colour as text on the dark theme (its edge over the column). */
  edge: string;
  manage: GameManagement;
}

/**
 * Both fives on the floor, at the top of the console's Lineup view (yours first): points, the energy bar
 * (against the staff's sub-out mark), personal fouls (lit at the foul-trouble limit), and who's hot or
 * cold. Tap one of yours for his sheet (the sub, his orders, a play for him), one of
 * theirs for the ways to stop him and a Hack-a-player. `fives` are [home, away] as the court draws them.
 */
export const OnCourt = memo(function OnCourt({
  view,
  fives,
  side,
  info,
  names,
  jersey,
  onTap,
}: {
  view: Drawn;
  fives: [number[], number[]];
  side: 0 | 1;
  /** [home, away]. */
  info: [SideInfo, SideInfo];
  names: (pid: number) => string;
  jersey: (pid: number) => string;
  onTap: (pid: number, mine: boolean) => void;
}) {
  const col = (s: 0 | 1) => {
    const mine = s === side;
    const ds = view.sides[s];
    const limit = foulLimit(view.q, info[s].manage.foulTrouble);
    return (
      <div className={`lv-oc-col${mine ? ' mine' : ''}`} style={{ '--oc-edge': info[s].edge } as CSSProperties}>
        <div className="lv-oc-head">
          <span>{info[s].abbrev}</span>
          {mine && <span className="lv-oc-you">You</span>}
          <span className="lv-oc-head-pts" aria-hidden="true">
            Pts
          </span>
        </div>
        {fives[s].map((pid) => {
          const p = ds.players.find((x) => x.pid === pid);
          if (!p) return null;
          const e = Math.round(p.energy * 100);
          const fat = info[s].manage.fatigueSub;
          const hot = p.streak >= HOT_STREAK;
          const cold = !hot && isCold(p);
          const what = hot ? `, ${p.streak} straight makes` : cold ? `, ${p.fgm} of ${p.fga} from the field` : '';
          // named by what it shows, number and name first ("7 Holmgren"), then the rest for a screen reader
          const more = `: ${e}% energy, ${plural(p.fouls, 'foul')}, ${plural(p.pts, 'point')}${what}. ${mine ? 'Subs and orders' : 'Stop him, guard him, Hack-a-player'}`;
          const tone = p.energy < fat ? 'bad' : p.energy < fat + 0.15 ? 'warn' : 'good';
          return (
            <button
              key={pid}
              className="lv-oc-row"
              onClick={() => onTap(pid, mine)}
              aria-haspopup="dialog"
              title={hot ? `${p.streak} straight makes` : cold ? `${madeAtt(p.fgm, p.fga)} FG` : undefined}
            >
              <span className="lv-oc-num" style={{ background: info[s].kit[0], color: inkOn(info[s].kit[0]), borderColor: info[s].kit[1] }}>
                {jersey(pid)}
              </span>{' '}
              <span className="lv-oc-name">
                <span className="ellipsis">{names(pid)}</span>
                <span className="sr-only">{more}</span>
                {hot && (
                  <span className="lv-oc-mark hot" aria-hidden="true">
                    <Flame size={12} />
                    {p.streak}
                  </span>
                )}
                {cold && (
                  <span className="lv-oc-mark cold" aria-hidden="true">
                    <Snowflake size={12} />
                  </span>
                )}
              </span>
              <span className="lv-oc-pts num" aria-hidden="true">
                {p.pts}
              </span>
              <span className="lv-oc-energy num" aria-hidden="true">
                <span className="lv-oc-meter">
                  <span className={tone} style={{ width: `${e}%` }} />
                </span>
                {e}%
              </span>
              <span className={`lv-oc-pf num${p.fouls >= 5 ? ' bad' : p.fouls >= limit ? ' warn' : ''}`} aria-hidden="true">
                {p.fouls} PF
              </span>
            </button>
          );
        })}
      </div>
    );
  };
  return (
    <div className="lv-oc-grid" role="group" aria-label="On the floor">
      {col(side)}
      {col((1 - side) as 0 | 1)}
    </div>
  );
});
