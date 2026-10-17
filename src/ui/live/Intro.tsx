// Before the opening tip of a live game: the starting lineups on the court, as a broadcast
// introduces them (the arena, what's at stake, both fives with their numbers, positions and season
// lines), until the user tips it off or a few seconds pass.
import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { League, Team } from '../../core/types';
import { FRANCHISES } from '../../core/teams';
import { seasonTotals } from '../../core/league/helpers';
import { inkOn } from '../teamColors';

/** How long the lineups stay up before the tip at 1× (faster speeds shorten it). */
export const INTRO_MS = 9000;

/** A starter's line for the intro: this season's per game, or last season's (`last`) before his first game. */
export function introLine(league: League, pid: number): { text: string; last: boolean } {
  const p = league.players[pid];
  if (!p) return { text: '', last: false };
  for (const season of [league.season, league.season - 1]) {
    const s = seasonTotals(p, season);
    if (s && s.gp > 0) {
      const pg = (v: number) => (v / s.gp).toFixed(1);
      return { text: `${pg(s.pts)} pts · ${pg(s.orb + s.drb)} reb · ${pg(s.ast)} ast`, last: season !== league.season };
    }
  }
  return { text: p.experience === 0 ? 'Rookie' : '', last: false };
}

export function Intro({
  league,
  teams,
  fives,
  kits,
  names,
  context,
  neutral,
  speed,
  paused,
  onTip,
}: {
  league: League;
  /** [home, away]. */
  teams: [Team, Team];
  /** The fives on the floor for the tip, [home, away]. */
  fives: [number[], number[]];
  /** Jersey [fill, trim], [home, away]. */
  kits: [[string, string], [string, string]];
  names: (pid: number) => string;
  context?: string;
  /** On a neutral floor (the Cup final): not the home team's arena. */
  neutral?: boolean;
  speed: number;
  paused: boolean;
  onTip: () => void;
}) {
  const [home, away] = teams;
  // the lineups stay up a few seconds, unless paused, then the ball goes up
  const [left, setLeft] = useState(INTRO_MS);
  useEffect(() => {
    if (paused) return;
    const step = 250;
    const t = setInterval(() => setLeft((x) => x - step * speed), step);
    return () => clearInterval(t);
  }, [paused, speed]);
  useEffect(() => {
    if (left <= 0) onTip();
  }, [left, onTip]);
  const arena = neutral ? undefined : FRANCHISES[home.tid]?.arena;
  const lines = new Map([...fives[0], ...fives[1]].map((pid) => [pid, introLine(league, pid)]));
  // opening nights read last season's lines (said once, at the top); a starter yet to play this season says so on his line
  const withLines = [...lines.values()].filter((l) => l.text && l.text !== 'Rookie');
  const lastSeason = withLines.length > 0 && withLines.every((l) => l.last);
  const col = (side: 0 | 1) => {
    const t = teams[side];
    const kit = kits[side];
    return (
      <div className="live-intro-col">
        {/* the name alone, as a broadcast has it: "Oklahoma City Thunder" doesn't fit half a phone's court */}
        <div className="live-intro-team" style={{ borderColor: kit[0] }}>
          {t.name}
        </div>
        {fives[side].map((pid) => {
          const p = league.players[pid];
          return (
            <div key={pid} className="live-intro-row">
              <span className="live-intro-num" style={{ background: kit[0], color: inkOn(kit[0]), borderColor: kit[1] }}>
                {p?.jersey || '0'}
              </span>
              <span className="col" style={{ gap: 0, minWidth: 0 }}>
                <span className="ellipsis bold">
                  {names(pid)} <span className="live-intro-pos">{p?.pos}</span>
                </span>
                <span className="live-intro-line ellipsis">
                  {lines.get(pid)?.text}
                  {!lastSeason && lines.get(pid)?.last ? ' · last season' : ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    );
  };
  return (
    // (a region, not a dialog: it doesn't take the focus, and the playback buttons beside it stay in reach)
    <div className="live-intro fade-in" role="region" aria-label="Starting lineups">
      <div className="live-intro-head">
        <div className="live-intro-kicker">Starting lineups</div>
        <div className="live-intro-where ellipsis">{neutral ? 'Neutral floor' : `${arena ? `${arena} · ` : ''}${home.region}`}</div>
        {context && <div className="live-intro-where ellipsis">{context}</div>}
        {lastSeason && <div className="live-intro-where ellipsis">Per game, last season</div>}
      </div>
      <div className="live-intro-grid">
        {col(1)}
        {col(0)}
      </div>
      <button className="btn primary sm" onClick={onTip}>
        <Play size={15} fill="currentColor" /> Tip off
      </button>
      <span className="live-intro-bar" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, (left / INTRO_MS) * 100))}%` }} />
      </span>
      {/* (screen readers: who starts, before the court takes over) */}
      <span className="sr-only">
        {away.abbrev}: {fives[1].map(names).join(', ')}. {home.abbrev}: {fives[0].map(names).join(', ')}.
      </span>
    </div>
  );
}
