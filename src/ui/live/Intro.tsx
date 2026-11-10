// Before the opening tip of a live game: the broadcast's first frame. The night's billing over the
// dimmed court ("Rivalry night at Madison Square Garden") and the two starting fives side by side,
// each under its team's colour tonight (the kit: the same colour as its scorebug block and its discs
// on the floor), until a few seconds pass or the user skips the rest. It fits the court it's on: the
// tall court adds each starter's line; the wide short one keeps names and numbers, with Skip in view.
import { useEffect, useState, type CSSProperties } from 'react';
import { SkipForward } from 'lucide-react';
import type { League, Team } from '../../core/types';
import { FRANCHISES } from '../../core/teams';
import { seasonTotals } from '../../core/league/helpers';
import type { MatchKit } from '../teamColors';
import { useLeagueMemo } from '../../state/store';
import { arenaOf, billingFor } from '../../core/analysis/gameStory';
import { billingTitle } from '../games/occasion';

/** How long the lineups stay up before the tip at 1× (faster speeds shorten it). */
export const INTRO_MS = 9000;

/**
 * A starter's line for the intro: this season's per game, or last season's (`last`) before his first game.
 * `short` rounds to whole numbers, the units between them, for a narrow column (to the tenth, the
 * assists were cut off).
 */
export function introLine(league: League, pid: number): { text: string; short: string; last: boolean } {
  const p = league.players[pid];
  if (!p) return { text: '', short: '', last: false };
  for (const season of [league.season, league.season - 1]) {
    const s = seasonTotals(p, season);
    if (s && s.gp > 0) {
      const line = (digits: number, sep: string) => {
        const pg = (v: number) => (v / s.gp).toFixed(digits);
        return `${pg(s.pts)} pts${sep}${pg(s.orb + s.drb)} reb${sep}${pg(s.ast)} ast`;
      };
      return { text: line(1, ' · '), short: line(0, ' '), last: season !== league.season };
    }
  }
  const text = p.experience === 0 ? 'Rookie' : '';
  return { text, short: text, last: false };
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
  /** Tonight's kits, [home, away]. */
  kits: [MatchKit, MatchKit];
  names: (pid: number) => string;
  /** What's at stake ("Game 3 · series tied 1-1"), when the billing doesn't already say. */
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
  // the night's billing, as the broadcast opens: "Rivalry night at Madison Square Garden"
  const bill = useLeagueMemo(() => {
    const g = league.schedule.find((x) => !x.played && x.day === league.day && x.home === home.tid && x.away === away.tid);
    return g ? billingFor(league, g) : null;
  }, [league, home.tid, away.tid]);
  const billAt = neutral ? 'in Las Vegas' : arenaOf(home) ? `at ${arenaOf(home)}` : `in ${home.region}`;
  const lines = new Map([...fives[0], ...fives[1]].map((pid) => [pid, introLine(league, pid)]));
  // opening nights read last season's lines (said once, at the top); a starter yet to play this season says so on his line
  const withLines = [...lines.values()].filter((l) => l.text && l.text !== 'Rookie');
  const lastSeason = withLines.length > 0 && withLines.every((l) => l.last);
  const perGame = withLines.length > 0 ? `per game, ${lastSeason ? 'last' : 'this'} season` : '';
  // the headline: the billing, or the plain thing this is; under it one line (the billing's reason unless
  // it only names the arena again, or where the game is, or what's at stake)
  const title = bill ? billingTitle(bill, billAt) : 'Starting lineups';
  const where = neutral ? 'Neutral floor' : `${arena ? `${arena} · ` : ''}${home.region}`;
  const sub = bill ? (arena && bill.line.includes(arena) ? context : bill.line) : (context ?? where);
  const col = (side: 0 | 1) => {
    const t = teams[side];
    const kit = kits[side];
    return (
      <div className="lv-in-col">
        {/* the name alone, as a broadcast has it: "Oklahoma City Thunder" doesn't fit half a phone's court */}
        <div className="lv-in-team" style={{ '--in-c': kit.color, '--in-t': kit.trim } as CSSProperties}>
          {t.name}
        </div>
        {fives[side].map((pid) => {
          const p = league.players[pid];
          const line = lines.get(pid);
          return (
            <div key={pid} className="lv-in-row">
              <span className="lv-in-num" style={{ background: kit.token.fill, color: kit.token.num, borderColor: kit.token.ring }}>
                {p?.jersey || '0'}
              </span>
              <span className="lv-in-who">
                <span className="lv-in-name">
                  {names(pid)} <span className="lv-in-pos">{p?.pos}</span>
                </span>
                {line?.text && (
                  <span className="lv-in-line">
                    <span className="lv-in-dec">{line.text}</span>
                    <span className="lv-in-whole">{line.short}</span>
                    {!lastSeason && line.last ? ' · last season' : ''}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  };
  return (
    // (a region, not a dialog: it doesn't take the focus)
    <div className="lv-intro" role="region" aria-label="Starting lineups">
      <div className="lv-in">
        <div className="lv-in-head">
          <div className="lv-in-bill">{title}</div>
          {sub && <div className="lv-in-sub">{sub}</div>}
          {/* (one quiet line where the figures show: what they are) */}
          {perGame && (
            <div className="lv-in-note">
              {bill ? 'Starting lineups · ' : ''}
              {bill ? perGame : perGame.charAt(0).toUpperCase() + perGame.slice(1)}
            </div>
          )}
        </div>
        <div className="lv-in-fives">
          {col(1)}
          {col(0)}
        </div>
        {/* (the game tips off by itself when the rule runs out: this only skips the wait, so it isn't a second "Tip off") */}
        <button type="button" className="lv-in-skip" onClick={onTip}>
          <SkipForward size={15} aria-hidden="true" /> Skip intro
        </button>
      </div>
      <span className="lv-in-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, left / INTRO_MS))})` }} />
      </span>
      {/* (screen readers: who starts, before the court takes over) */}
      <span className="sr-only">
        {away.abbrev}: {fives[1].map(names).join(', ')}. {home.abbrev}: {fives[0].map(names).join(', ')}.
      </span>
    </div>
  );
}
