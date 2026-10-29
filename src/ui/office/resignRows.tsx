// The Re-sign desk's player rows: a player with his line of stats, and one you can extend now.
// As on the other desks' lists, the rating leads and the name links to his page.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { playerName, teamPlayers } from '../../core/league/helpers';
import { extensionAsk, extensionBlockedReason, extensionRefusal } from '../../core/league/contracts';
import { contractExp, playerAge, salaryFor } from '../../core/playerGen';
import { f1, latestLine, playerSeason } from '../stats';
import { OvrPot, forYears, salaryText, shortSeason } from './common';

/**
 * His per-game line this season (or his latest, its season named), as a roster row reads it: minutes,
 * points, rebounds, assists. The rest of his numbers are on his page, a tap on his name.
 */
export function StatLine({ league, p }: { league: League; p: Player }) {
  const pg = playerSeason(p, league.season);
  const line = pg && pg.gp > 0 ? { season: league.season, pg } : latestLine(league, p);
  if (!line) return <div className="tiny dim">No stats yet</div>;
  const s = line.pg;
  return (
    <div className="fo-statline">
      {line.season !== league.season && <span className="over">{shortSeason(line.season)}</span>}
      <span>
        <b>{f1(s.min)}</b> MIN
      </span>
      <span>
        <b>{f1(s.pts)}</b> PTS
      </span>
      <span>
        <b>{f1(s.reb)}</b> REB
      </span>
      <span>
        <b>{f1(s.ast)}</b> AST
      </span>
    </div>
  );
}

/** A player in a Re-sign list: his rating, name (to his page) and line of detail, with something on the right (his salary). */
export function PlayerTop({ league, p, pot = true, right }: { league: League; p: Player; pot?: boolean; right?: ReactNode }) {
  return (
    <div className="fo-rs-top">
      <OvrPot p={p} showPot={pot} />
      <div className="grow">
        <Link to={`/player/${p.pid}`} className="fo-name">
          {playerName(p)}
        </Link>
        <div className="fo-meta">
          {p.pos} · {playerAge(p, league.season)}
        </div>
      </div>
      {right}
    </div>
  );
}

/** The user's players who can be extended right now (in the final season of their deals), best first. */
export const extendablePlayers = (league: League) =>
  teamPlayers(league, league.userTid)
    .filter((p) => !extensionBlockedReason(league, p))
    .sort((a, b) => b.ovr - a.ovr);

/** A player who can be extended now, on one row: his salary and what an extension would cost (or that he won't talk), and the button. */
export function ExtendRow({ league, p, onExtend }: { league: League; p: Player; onExtend: (pid: number) => void }) {
  const exp = contractExp(p.contract);
  const ask = extensionAsk(league, p);
  return (
    <div className="fo-prow fo-rs-row">
      <OvrPot p={p} />
      <div className="grow">
        <Link to={`/player/${p.pid}`} className="fo-name">
          {playerName(p)}
        </Link>
        <div className="fo-meta">
          <span className="num">{salaryText(league, salaryFor(p, exp))}</span>
          {' · '}
          {extensionRefusal(league, p) ? (
            <span className="warn">won't extend now</span>
          ) : (
            <>
              {/* (from the season after his deal ends: the list's note says which, once) */}
              asks <b className="num fo-rs-askv">{salaryText(league, ask.amount)}</b> {forYears(ask.years)}
            </>
          )}
        </div>
      </div>
      {/* (no icon: the row's ask keeps its room) */}
      <button className="btn sm" aria-label={`Extend ${playerName(p)}`} onClick={() => onExtend(p.pid)}>
        Extend
      </button>
    </div>
  );
}
