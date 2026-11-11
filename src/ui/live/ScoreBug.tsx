// The live scorebug, the broadcast's ink bar over the court. Its top line has the way out and what's
// at stake; under it each team's block in its colour for the night (its name, the ball beside the team
// that has it, timeouts left and team fouls, both labelled), the scores in the condensed black cut,
// and between them the period and the clock on their plate with the run on now under it; then the
// sliver of each team's chance to win, and the night's other scores (`children`). The clock and the
// score follow the court as it animates them (`ticker`); everything else is as of the possession the
// court last finished drawing (`view`). A basket pops its team's figure; clutch time turns the clock's
// plate to the brand's red and says so. Every team colour is the kit's (teamColors.matchKits).
import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, Zap } from 'lucide-react';
import type { League, ScheduledGame, Team } from '../../core/types';
import { cupLabel } from '../../core/league/cup';
import { keepFigures } from '../../core/format';
import { oddsWord } from '../../core/analysis/staffWords';
import { fmtClock, periodLabel } from '../stats';
import type { MatchKit } from '../teamColors';
import type { Drawn } from './drawn';
import type { Ticker } from './ticker';
import { useChanged } from '../motion';

/** A run this long gets a line under the clock. */
const RUN_CHIP = 6;
/** The most one trip scores (a four-point play): a bigger jump is a skip ahead, not a basket to pop. */
const MAX_TRIP = 4;

/**
 * What's at stake beyond the regular season, for the scorebug's top line: "Playoffs · R1 G5 ·
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

/** The ball, beside the team that has it: white on the team's block, so it reads on every kit. */
function Ball() {
  return (
    <svg className="lv-lb-ball" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 1v14M1 8h14M3.2 3.2c2.4 2.6 2.4 7 0 9.6M12.8 3.2c-2.4 2.6-2.4 7 0 9.6" fill="none" stroke="var(--lb-c)" strokeWidth="1.1" />
    </svg>
  );
}

/**
 * A team's score: the figure pops when a basket goes in and the points just scored rise beside it
 * (nothing around it moves). A jump bigger than one trip's (a skip ahead) just lands.
 */
function Score({ pts, behind, bonus }: { pts: number; behind: boolean; bonus: boolean }) {
  const [last, setLast] = useState(pts);
  // (counts the baskets: a new one restarts the pop; `by` is what it was worth)
  const [pop, setPop] = useState({ n: 0, by: 0 });
  if (pts !== last) {
    const by = pts - last;
    setLast(pts);
    if (by > 0 && by <= MAX_TRIP) setPop({ n: pop.n + 1, by });
  }
  return (
    <div className="lv-lb-pts">
      {/* (the side behind reads a shade quieter, as a broadcast's bug has it) */}
      <span className={`lv-lb-score num${behind ? ' behind' : ''}${pts >= 100 ? ' wide' : ''}`} aria-hidden="true">
        <span key={pop.n} className={`lv-lb-fig${pop.n ? ' pop' : ''}`}>
          {pts}
        </span>
      </span>
      <span className="lv-lb-under">
        <span className={`lv-lb-bonus${bonus ? ' on' : ''}`}>Bonus</span>
        {pop.n > 0 && (
          <span key={pop.n} className="lv-lb-by num" aria-hidden="true">
            +{pop.by}
          </span>
        )}
      </span>
    </div>
  );
}

/** A figure on a team's block (timeouts left, team fouls): it ticks the way it moved when it changes. */
function Fig({ v }: { v: number }) {
  const { key, dir } = useChanged(v);
  return (
    <b key={key} className={`num${key ? (dir < 0 ? ' lv-lb-tick down' : ' lv-lb-tick') : ''}`}>
      {v}
    </b>
  );
}

export function ScoreBug({
  ticker,
  view,
  home,
  away,
  kits,
  quarter,
  atBreak,
  ball = null,
  context,
  wpHome,
  run: night,
  momentum = 0,
  clutch,
  keyPlays,
  onLeave,
  children,
}: {
  ticker: Ticker;
  view: Drawn;
  home: Team;
  away: Team;
  /** Tonight's kits, [home, away]: the blocks, the ball's seams and the win bar all wear them. */
  kits: [MatchKit, MatchKit];
  quarter: number;
  /** Stopped at the buzzer between periods: the end of `quarter` (halftime after the 2nd), not a clock at 0.0. */
  atBreak?: boolean;
  /** The side with the ball as the court shows it (0 home, 1 away; null: nobody's, a jump ball or a break). */
  ball?: 0 | 1 | null;
  context?: string;
  /** The home team's win probability, from the drawn game (undefined: not shown). */
  wpHome?: number;
  /** The run on now ("BOS 14-2"), as the night reads it; without it, the points unanswered. */
  run?: { abbrev: string; a: number; b: number } | null;
  /** Who's on top lately, −1 (away) .. 1 (home): its side of the win bar stands thicker. */
  momentum?: number;
  /** Clutch time: the last five minutes within five. */
  clutch?: boolean;
  /** Key plays on: the court fast-forwards to the next key play. */
  keyPlays?: boolean;
  /** A bottom line under it (the night's other scores). */
  children?: ReactNode;
  /** The way out: the game waits where it is, to be resumed from the Continue bar or its Matchup page. */
  onLeave?: () => void;
}) {
  const { clock, score } = useSyncExternalStore(ticker.subscribe, ticker.get);
  const qLabel = periodLabel(quarter);
  const brk = !!atBreak;
  const tight = !!clutch && !brk;
  // a period's first possession: the drawn view still holds the period before's team fouls, and they
  // don't carry over, so the new period starts at none and out of the bonus
  const fresh = !brk && quarter > view.q;
  const sideNow = (s: Drawn['sides'][number]) => (fresh ? { ...s, fouls: 0, bonus: false } : s);
  const [h, a] = [sideNow(view.sides[0]), sideNow(view.sides[1])];
  // "in the bonus": the team that shoots free throws on every foul
  const bonus = [a.bonus ? away.abbrev : '', h.bonus ? home.abbrev : ''].filter(Boolean);
  const run = night ?? (h.run >= RUN_CHIP ? { abbrev: home.abbrev, a: h.run, b: 0 } : a.run >= RUN_CHIP ? { abbrev: away.abbrev, a: a.run, b: 0 } : null);
  // a run that has ended leaves (its last words fade out) instead of blinking off
  const lastRun = useRef(run);
  if (run) lastRun.current = run;
  const runShown = brk ? null : (run ?? lastRun.current);
  // the side with the momentum, and how strongly (0 none, 1, 2 surging)
  const mo = Math.abs(momentum) >= 0.55 ? 2 : Math.abs(momentum) >= 0.3 ? 1 : 0;
  const moHome = momentum > 0;
  const has = brk ? null : ball;
  const state = brk
    ? quarter === 2
      ? 'halftime'
      : `end of ${qLabel}`
    : `${qLabel} ${fmtClock(clock)}${tight ? ', clutch time' : ''}${has !== null ? `, ${(has === 0 ? home : away).abbrev} ball` : ''}${bonus.length ? `, ${bonus.join(' and ')} in the bonus` : ''}${run ? `, ${run.abbrev} on a ${run.a}-${run.b} run` : ''}${mo ? `, momentum ${moHome ? home.abbrev : away.abbrev}` : ''}`;
  const wp = wpHome !== undefined ? Math.min(1, Math.max(0, wpHome)) : null;

  // a team's half: its block (name, the ball, timeouts left, team fouls this period), then its score on
  // the ink with "Bonus" under it when it shoots free throws on every foul from here
  const side = (t: Team, s: Drawn['sides'][number], i: 0 | 1) => {
    const pts = score[i];
    return (
      <div className={`lv-lb-side${i === 0 ? ' home' : ''}`} style={{ '--lb-c': kits[i].color, '--lb-t': kits[i].trim } as CSSProperties}>
        <div className="lv-lb-id">
          <span className="lv-lb-who">
            <span className="lv-lb-ab">{t.abbrev}</span>
            <span className={`lv-lb-poss${has === i ? ' on' : ''}`}>
              <Ball />
            </span>
          </span>
          <span className="lv-lb-meta">
            <span>
              Timeouts <Fig v={s.timeouts} />
            </span>
            <span title="Team fouls this period">
              Fouls <Fig v={s.fouls} />
            </span>
          </span>
        </div>
        <Score pts={pts} behind={pts < score[1 - i]} bonus={s.bonus} />
      </div>
    );
  };

  return (
    <div className={`lv-lb${tight ? ' clutch' : ''}${brk ? ' brk' : ''}`}>
      {/* its top line: the way out on the left, what's at stake (or that it's live) in the middle */}
      {onLeave ? (
        <div className="lv-lb-top has-leave">
          <button type="button" className="lv-lb-leave" onClick={onLeave} aria-label="Leave the game. It waits here: resume it from Continue.">
            <ChevronLeft size={15} aria-hidden="true" /> Leave
          </button>
          <span className={`lv-lb-ctx ellipsis${context ? '' : ' live'}`}>{context ?? 'Live'}</span>
          {keyPlays && (
            <span className="lv-lb-kp">
              <Zap size={12} aria-hidden="true" /> Key plays
            </span>
          )}
        </div>
      ) : (
        context && (
          <div className="lv-lb-top">
            <span className="lv-lb-ctx ellipsis">{context}</span>
          </div>
        )
      )}
      <div
        className="lv-lb-main live-bug"
        role="group"
        aria-label={`${away.abbrev} ${score[1]}, ${home.abbrev} ${score[0]}, ${state}${wp !== null ? `. ${home.abbrev}: ${oddsWord(wp)}` : ''}`}
      >
        {side(away, a, 1)}
        <div className="lv-lb-mid" aria-hidden="true">
          <span className="lv-lb-q">
            {brk ? 'Break' : qLabel}
            {tight && <span className="lv-lb-clutch">Clutch</span>}
          </span>
          <span className="lv-lb-plate num">{brk ? (quarter === 2 ? 'Half' : `End ${qLabel}`) : fmtClock(clock)}</span>
          <span className="lv-lb-run num">
            {runShown && (
              <span key={`${runShown.abbrev}-${runShown.a}`} className={run ? undefined : 'out'}>
                {keepFigures(`${runShown.abbrev} ${runShown.a}-${runShown.b} run`)}
              </span>
            )}
          </span>
        </div>
        {side(home, h, 0)}
      </div>
      {wp !== null && (
        <div className="lv-lb-wp" aria-hidden="true">
          <span className="lv-lb-wp-k">To win</span>
          <span className="lv-lb-wp-ab num">{away.abbrev}</span>
          <span className={`lv-lb-wp-bar${mo ? ` mo-${mo} ${moHome ? 'mo-home' : 'mo-away'}` : ''}`}>
            <i className="away" style={{ '--wp': 1 - wp, background: kits[1].night } as CSSProperties} />
            <i className="home" style={{ '--wp': wp, background: kits[0].night } as CSSProperties} />
          </span>
          <span className="lv-lb-wp-ab num">{home.abbrev}</span>
        </div>
      )}
      {children}
    </div>
  );
}
