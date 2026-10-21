import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
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
 * (`ticker`), a run, the sliver of each team's chance to win (`wpHome`, unless switched off) with
 * the momentum glowing on it, and the night's other scores under it; everything but the clock and
 * score as of the possession the court last finished drawing (`view`). In clutch time it says so.
 * The final is the final card's (FinalSlab).
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
  run: night,
  momentum = 0,
  clutch,
  onLeave,
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
  /** The run on now ("BOS 14-2"), as the night reads it; without it, the points unanswered. */
  run?: { abbrev: string; a: number; b: number } | null;
  /** Who's on top lately, −1 (away) .. 1 (home): it glows on the win-probability line. */
  momentum?: number;
  /** Clutch time: the last five minutes within five. */
  clutch?: boolean;
  /** A bottom line under it (the night's other scores). */
  children?: ReactNode;
  /** The way out: the game waits where it is, to be resumed from the Continue bar or its Matchup page. */
  onLeave?: () => void;
}) {
  const { clock, score } = useSyncExternalStore(ticker.subscribe, ticker.get);
  const qLabel = periodLabel(quarter);
  const brk = !!atBreak;
  const [h, a] = view.sides;
  // "in the bonus": the team that shoots free throws on every foul
  const bonus = [a.bonus ? away.abbrev : '', h.bonus ? home.abbrev : ''].filter(Boolean);
  const run = night ?? (h.run >= RUN_CHIP ? { abbrev: home.abbrev, a: h.run, b: 0 } : a.run >= RUN_CHIP ? { abbrev: away.abbrev, a: a.run, b: 0 } : null);
  // the side with the momentum, and how strongly (0 none, 1, 2 surging)
  const mo = Math.abs(momentum) >= 0.55 ? 2 : Math.abs(momentum) >= 0.3 ? 1 : 0;
  const moSide = momentum > 0 ? 'home' : 'away';
  const state = brk
    ? quarter === 2
      ? 'halftime'
      : `end of ${qLabel}`
    : `${qLabel} ${fmtClock(clock)}${clutch ? ', clutch time' : ''}${bonus.length ? `, ${bonus.join(' and ')} in the bonus` : ''}${run ? `, ${run.abbrev} on a ${run.a}-${run.b} run` : ''}${mo ? `, momentum ${moSide === 'home' ? home.abbrev : away.abbrev}` : ''}`;
  const wp = wpHome !== undefined ? wpHome : null;
  const [homeKit, awayKit] = matchupColors(home.colors, away.colors);
  // the two colour blocks never read as one: on a clash the away side wears its second colour
  const looks = matchupLooks(home.colors, away.colors);
  const pct = wpText;
  // each block says what its figures are: the timeouts left, and the team fouls this period ("Penalty"
  // once they put the other team in the bonus: it shoots on every foul from here)
  const side = (t: Team, s: Drawn['sides'][number], pts: number, penalty: boolean, isHome: boolean) => {
    const look = looks[isHome ? 0 : 1];
    // (the side behind reads a shade quieter, as a broadcast's bug has it)
    const behind = pts < (isHome ? score[1] : score[0]);
    return (
      <div className={`lv-lb-side${isHome ? ' home' : ''}`} style={{ '--lb-c': look.slab, '--lb-t': look.trim } as CSSProperties}>
        <div className="lv-lb-id">
          <span className="lv-lb-ab">{t.abbrev}</span>
          <span className="lv-lb-meta num">
            <span className="lv-lb-to">
              Timeouts <b>{s.timeouts}</b>
            </span>
            <span className={`lv-lb-tf${penalty ? ' on' : ''}`}>
              {penalty ? 'Penalty' : 'Fouls'} <b>{s.fouls}</b>
            </span>
          </span>
        </div>
        <span className={`lv-lb-score num${behind ? ' behind' : ''}`} aria-hidden="true">
          {pts}
        </span>
      </div>
    );
  };
  return (
    <div className={`lv-lb${clutch && !brk ? ' clutch' : ''}`}>
      {/* its top line: the way out on the left, what's at stake (or that it's live) in the middle */}
      {onLeave ? (
        <div className="lv-lb-ctx has-leave">
          <button type="button" className="lv-lb-leave" onClick={onLeave} aria-label="Leave the game. It waits here: resume it from Continue.">
            <ChevronLeft size={14} aria-hidden="true" /> Leave
          </button>
          <span className={`ellipsis${context ? '' : ' lv-lb-live'}`}>{context ?? 'Live'}</span>
        </div>
      ) : (
        context && <div className="lv-lb-ctx ellipsis">{context}</div>
      )}
      <div
        className="lv-lb-main live-bug"
        role="group"
        aria-label={`${away.abbrev} ${score[1]}, ${home.abbrev} ${score[0]}, ${state}${wp !== null ? `. Win probability: ${away.abbrev} ${pct(1 - wp)}, ${home.abbrev} ${pct(wp)}` : ''}`}
      >
        {side(away, a, score[1], h.bonus, false)}
        <div className="lv-lb-mid" aria-hidden="true">
          <span className="lv-lb-q">{brk ? (quarter === 2 ? 'Half' : `End ${qLabel}`) : clutch ? `${qLabel} · Clutch` : qLabel}</span>
          {!brk && <span className="lv-lb-clock num">{fmtClock(clock)}</span>}
          {run && (
            <span key={`${run.abbrev}-${run.a}`} className="lv-lb-run num">
              {run.abbrev} {run.a}-{run.b}
            </span>
          )}
        </div>
        {side(home, h, score[0], a.bonus, true)}
      </div>
      {wp !== null && (
        <div className="lv-lb-wp" aria-hidden="true">
          <span className="lv-lb-wp-k">To win</span>
          <span className="num">
            {away.abbrev} <b>{pct(1 - wp)}</b>
          </span>
          <span className={`lv-lb-wp-bar${mo ? ` mo-${mo} mo-${moSide}` : ''}`}>
            <span style={{ width: `${(1 - wp) * 100}%`, background: awayKit, '--mo-c': awayKit } as CSSProperties} />
            <span style={{ width: `${wp * 100}%`, background: homeKit, '--mo-c': homeKit } as CSSProperties} />
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
