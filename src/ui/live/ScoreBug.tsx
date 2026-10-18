import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { League, ScheduledGame, Team } from '../../core/types';
import { cupLabel } from '../../core/league/cup';
import { fmtClock, periodLabel } from '../stats';
import { matchupColors, matchupLooks } from '../teamColors';
import { wpText } from '../../core/analysis/winProb';
import type { Drawn } from './drawn';
import type { Ticker } from './ticker';

/** A run this long gets a chip under the clock. */
const RUN_CHIP = 6;

/**
 * What's at stake beyond the regular season, for the scorebug's subtitle: "Playoffs · R1 G5 ·
 * Series tied 2-2", "Play-In", "NBA Cup · East A". `gameNo` is the game's number in its series.
 */
export function gameContext(league: League, g: ScheduledGame, gameNo?: number): string | undefined {
  if (g.type === 'playin') return 'Play-In';
  if (g.type === 'playoffs') {
    const s = league.playoffs.find((x) => x.id === g.seriesId);
    if (!s) return 'Playoffs';
    const round = s.round === 4 ? 'Finals' : s.round === 3 ? 'Conf. Finals' : `R${s.round}`;
    const state =
      s.highWins === s.lowWins
        ? `Series tied ${s.highWins}-${s.lowWins}`
        : `${league.teams[s.highWins > s.lowWins ? s.high : s.low].abbrev} ${s.winner !== undefined ? 'wins' : 'leads'} ${Math.max(s.highWins, s.lowWins)}-${Math.min(s.highWins, s.lowWins)}`;
    return `Playoffs · ${round} G${gameNo ?? s.highWins + s.lowWins + 1} · ${state}`;
  }
  return cupLabel(league, { cup: g.cup, home: g.home }) ?? undefined;
}

/**
 * The live scorebug, slim, as a broadcast has it over the court: each team's colour block (its name,
 * timeouts left and team fouls, both labelled), the scores, the period and the clock as the court animates them
 * (`ticker`), a run, the sliver of each team's chance to win (`wpHome`, unless switched off) and the
 * night's other scores under it; everything but the clock and score as of the possession the court
 * last finished drawing (`view`). The final is the final card's (FinalSlab).
 */
export function ScoreBug({
  ticker,
  view,
  home,
  away,
  quarter,
  atBreak,
  context,
  wpHome,
  children,
}: {
  ticker: Ticker;
  view: Drawn;
  home: Team;
  away: Team;
  quarter: number;
  /** Stopped at the buzzer between periods: the end of `quarter` (halftime after the 2nd), not a clock at 0.0. */
  atBreak?: boolean;
  context?: string;
  /** The home team's win probability, from the drawn game (undefined: not shown). */
  wpHome?: number;
  /** A bottom line under it (the night's other scores). */
  children?: ReactNode;
}) {
  const { clock, score } = useSyncExternalStore(ticker.subscribe, ticker.get);
  const qLabel = periodLabel(quarter);
  const brk = !!atBreak;
  const [h, a] = view.sides;
  // "in the bonus": the team that shoots free throws on every foul
  const bonus = [a.bonus ? away.abbrev : '', h.bonus ? home.abbrev : ''].filter(Boolean);
  const run = h.run >= RUN_CHIP ? { abbrev: home.abbrev, n: h.run } : a.run >= RUN_CHIP ? { abbrev: away.abbrev, n: a.run } : null;
  const state = brk
    ? quarter === 2
      ? 'halftime'
      : `end of ${qLabel}`
    : `${qLabel} ${fmtClock(clock)}${bonus.length ? `, ${bonus.join(' and ')} in the bonus` : ''}${run ? `, ${run.abbrev} on a ${run.n}-0 run` : ''}`;
  const wp = wpHome !== undefined ? wpHome : null;
  const [homeKit, awayKit] = matchupColors(home.colors, away.colors);
  // the two colour blocks never read as one: on a clash the away side wears its second colour
  const looks = matchupLooks(home.colors, away.colors);
  const pct = wpText;
  // each block says what its figures are: the timeouts left, and the team fouls this period ("Penalty"
  // once they put the other team in the bonus: it shoots on every foul from here)
  const side = (t: Team, s: Drawn['sides'][number], pts: number, penalty: boolean, isHome: boolean) => {
    const look = looks[isHome ? 0 : 1];
    return (
      <div className={`lb-side${isHome ? ' home' : ''}`} style={{ '--lb-c': look.slab, '--lb-t': look.trim } as CSSProperties}>
        <div className="lb-id">
          <span className="lb-ab">{t.abbrev}</span>
          <span className="lb-meta num">
            <span className="lb-to">
              Timeouts <b>{s.timeouts}</b>
            </span>
            <span className={`lb-tf${penalty ? ' on' : ''}`}>
              {penalty ? 'Penalty' : 'Fouls'} <b>{s.fouls}</b>
            </span>
          </span>
        </div>
        <span className="lb-score num" aria-hidden="true">
          {pts}
        </span>
      </div>
    );
  };
  return (
    <div className="lb">
      {context && <div className="lb-ctx ellipsis">{context}</div>}
      <div
        className="lb-main live-bug"
        role="group"
        aria-label={`${away.abbrev} ${score[1]}, ${home.abbrev} ${score[0]}, ${state}${wp !== null ? `. Win probability: ${away.abbrev} ${pct(1 - wp)}, ${home.abbrev} ${pct(wp)}` : ''}`}
      >
        {side(away, a, score[1], h.bonus, false)}
        <div className="lb-mid" aria-hidden="true">
          <span className="lb-q">{brk ? (quarter === 2 ? 'Half' : `End ${qLabel}`) : qLabel}</span>
          {!brk && <span className="lb-clock num">{fmtClock(clock)}</span>}
          {run && (
            <span className="lb-run num">
              {run.abbrev} {run.n}-0
            </span>
          )}
        </div>
        {side(home, h, score[0], a.bonus, true)}
      </div>
      {wp !== null && (
        <div className="lb-wp" aria-hidden="true">
          <span className="lb-wp-k">To win</span>
          <span className="num">
            {away.abbrev} <b>{pct(1 - wp)}</b>
          </span>
          <span className="lb-wp-bar">
            <span style={{ width: `${(1 - wp) * 100}%`, background: awayKit }} />
            <span style={{ width: `${wp * 100}%`, background: homeKit }} />
          </span>
          <span className="num">
            <b>{pct(wp)}</b> {home.abbrev}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
