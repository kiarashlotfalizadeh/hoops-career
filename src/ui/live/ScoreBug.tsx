import { useSyncExternalStore } from 'react';
import type { League, ScheduledGame, Team } from '../../core/types';
import { cupLabel } from '../../core/league/cup';
import { TeamLogo } from '../components/TeamLogo';
import { shade } from '../components/ui';
import { finalLabel, fmtClock, periodLabel } from '../stats';
import { matchupColors } from '../teamColors';
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
 * The live scorebug: the clock and score as the court animates them (`ticker`), and timeouts,
 * team fouls, the bonus, runs and each team's chance to win (`wpHome`, unless switched off) as of
 * the possession the court last finished drawing (`view`).
 */
export function ScoreBug({
  ticker,
  view,
  home,
  away,
  quarter,
  over,
  ot,
  context,
  wpHome,
}: {
  ticker: Ticker;
  view: Drawn;
  home: Team;
  away: Team;
  quarter: number;
  over: boolean;
  ot: number;
  context?: string;
  /** The home team's win probability, from the drawn game (undefined: not shown). */
  wpHome?: number;
}) {
  const { clock, score } = useSyncExternalStore(ticker.subscribe, ticker.get);
  const qLabel = periodLabel(quarter);
  const [h, a] = view.sides;
  // "in the bonus": the team that shoots free throws on every foul
  const bonus = [a.bonus ? away.abbrev : '', h.bonus ? home.abbrev : ''].filter(Boolean);
  const run = over ? null : h.run >= RUN_CHIP ? { abbrev: home.abbrev, n: h.run } : a.run >= RUN_CHIP ? { abbrev: away.abbrev, n: a.run } : null;
  const state = over
    ? `final${ot ? ` in ${ot > 1 ? `${ot} overtimes` : 'overtime'}` : ''}`
    : `${qLabel} ${fmtClock(clock)}${bonus.length ? `, ${bonus.join(' and ')} in the bonus` : ''}${run ? `, ${run.abbrev} on a ${run.n}-0 run` : ''}`;
  const wp = !over && wpHome !== undefined ? wpHome : null;
  const [homeKit, awayKit] = matchupColors(home.colors, away.colors);
  const pct = wpText;
  // a team's fouls light up once they put the other team in the bonus
  const side = (t: Team, s: Drawn['sides'][number], penalty: boolean, right: boolean) => (
    <div className={right ? 'right' : ''} style={{ minWidth: 0 }}>
      <div className="bold">{t.abbrev}</div>
      <div className="tiny nowrap">
        <span className="dim">TO {s.timeouts}</span>
        {!over && (
          <>
            <span className="dim"> · </span>
            <span className={penalty ? 'warn bold' : 'dim'} title={penalty ? 'In the penalty' : undefined}>
              TF {s.fouls}
            </span>
          </>
        )}
      </div>
    </div>
  );
  return (
    <div
      className="card tight live-bugcard"
      // (on the page's own colour: on a phone the strip and the play-by-play scroll under it)
      style={{ background: `linear-gradient(90deg, ${shade(away.colors[0], -0.25)}cc, var(--surface) 40%, var(--surface) 60%, ${shade(home.colors[0], -0.25)}cc), var(--bg)` }}
    >
      {context && <div className="tiny dim2 center ellipsis live-context">{context}</div>}
      <div
        className="scorebug live-bug"
        role="group"
        aria-label={`${away.abbrev} ${score[1]}, ${home.abbrev} ${score[0]}, ${state}${wp !== null ? `. Win probability: ${away.abbrev} ${pct(1 - wp)}, ${home.abbrev} ${pct(wp)}` : ''}`}
      >
        <div className="row" style={{ gap: 6, minWidth: 0 }}>
          <TeamLogo tid={away.tid} size={28} decorative />
          {side(away, a, h.bonus, false)}
          <span className="score" style={{ marginLeft: 'auto' }}>
            {score[1]}
          </span>
        </div>
        <div className="col center" style={{ gap: 0, minWidth: 56 }}>
          <span className="display bold" style={{ fontSize: 15 }}>
            {over ? finalLabel(ot) : qLabel}
          </span>
          <span className="display num" style={{ fontSize: 20 }}>
            {over ? '' : fmtClock(clock)}
          </span>
          {run && (
            <span className="tiny warn bold nowrap" aria-hidden="true">
              {run.abbrev} {run.n}-0
            </span>
          )}
        </div>
        <div className="row" style={{ gap: 6, flexDirection: 'row-reverse', minWidth: 0 }}>
          <TeamLogo tid={home.tid} size={28} decorative />
          {side(home, h, a.bonus, true)}
          <span className="score" style={{ marginRight: 'auto' }}>
            {score[0]}
          </span>
        </div>
      </div>
      {wp !== null && (
        <div className="live-wp" aria-hidden="true" title="Win probability">
          <span className="tiny nowrap">
            <span className="dim">{away.abbrev}</span> <b className="num">{pct(1 - wp)}</b>
          </span>
          <span className="live-wp-bar">
            <span style={{ width: `${(1 - wp) * 100}%`, background: awayKit }} />
            <span style={{ width: `${wp * 100}%`, background: homeKit }} />
          </span>
          <span className="tiny nowrap">
            <b className="num">{pct(wp)}</b> <span className="dim">{home.abbrev}</span>
          </span>
        </div>
      )}
    </div>
  );
}
