import { memo } from 'react';
import { Flame, Snowflake } from 'lucide-react';
import type { GameManagement } from '../../core/types';
import { inkOn } from '../teamColors';
import { foulLimit } from './alerts';
import type { Drawn, DrawnPlayer } from './drawn';

/** Made shots in a row that light the flame (the engine's Hot hand feeds a shooter from three). */
export const HOT_STREAK = 3;

/** Cold: six shots or more, a quarter of them or fewer in. */
export const isCold = (p: Pick<DrawnPlayer, 'fgm' | 'fga'>) => p.fga >= 6 && p.fgm / p.fga <= 0.25;

interface SideInfo {
  abbrev: string;
  /** Jersey [fill, trim]. */
  kit: [string, string];
  manage: GameManagement;
}

/**
 * Both fives on the floor, right under the court (yours first): energy, fouls, points, and who's
 * hot or cold. Tap one of yours to sub him out, one of theirs for his free throws and a Hack-a.
 * `fives` are [home, away] as the court draws them.
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
      <div className="col oc-col" style={{ gap: 4, minWidth: 0 }}>
        <div className="tiny dim upper bold">{mine ? `${info[s].abbrev} · You` : info[s].abbrev}</div>
        {fives[s].map((pid) => {
          const p = ds.players.find((x) => x.pid === pid);
          if (!p) return null;
          const e = Math.round(p.energy * 100);
          const fat = info[s].manage.fatigueSub;
          const hot = p.streak >= HOT_STREAK;
          const cold = !hot && isCold(p);
          const what = hot ? `, ${p.streak} straight makes` : cold ? `, ${p.fgm} of ${p.fga} from the field` : '';
          const label = `${names(pid)}: ${e}% energy, ${p.fouls} foul${p.fouls === 1 ? '' : 's'}, ${p.pts} point${p.pts === 1 ? '' : 's'}${what}. ${mine ? 'Substitute him' : 'Free throws and Hack-a'}`;
          return (
            <button
              key={pid}
              className="oc-row"
              onClick={() => onTap(pid, mine)}
              aria-label={label}
              title={hot ? `${p.streak} straight makes` : cold ? `${p.fgm}/${p.fga} FG` : undefined}
            >
              <span className="oc-num" style={{ background: info[s].kit[0], color: inkOn(info[s].kit[0]), borderColor: info[s].kit[1] }}>
                {jersey(pid)}
              </span>
              <span className="oc-name">
                <span className="ellipsis">{names(pid)}</span>
                {hot && (
                  <span className="warn oc-mark" aria-hidden="true">
                    <Flame size={12} />
                    {p.streak}
                  </span>
                )}
                {cold && (
                  <span className="oc-mark" style={{ color: 'var(--info)' }} aria-hidden="true">
                    <Snowflake size={12} />
                  </span>
                )}
              </span>
              <span className="oc-pts num" aria-hidden="true">
                {p.pts}
              </span>
              <span className="bar oc-meter" aria-hidden="true">
                <span style={{ width: `${e}%`, background: p.energy < fat ? 'var(--bad)' : p.energy < fat + 0.15 ? 'var(--warn)' : 'var(--good)' }} />
              </span>
              <span className="oc-pips" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className={i < p.fouls ? (p.fouls >= 5 ? 'bad' : p.fouls >= limit ? 'warn' : 'on') : ''} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    );
  };
  return (
    <div className="oc-grid" role="group" aria-label="On the floor">
      {col(side)}
      {col((1 - side) as 0 | 1)}
    </div>
  );
});
