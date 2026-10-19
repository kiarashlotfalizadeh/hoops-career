// The Re-sign desk's player rows: a player with his line of stats, and one you can extend now.
// As on the other desks' lists, the rating leads and the name links to his page.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { playerName, teamPlayers } from '../../core/league/helpers';
import { extensionAsk, extensionBlockedReason, extensionRefusal } from '../../core/league/contracts';
import { contractExp, salaryFor } from '../../core/playerGen';
import { f1, latestLine, p1, playerSeason } from '../stats';
import { OvrPot, forYears, playerMeta, salaryText, shortSeason } from './common';

/** His per-game line this season (or his latest): points, rebounds, assists, minutes, true shooting, games. */
export function StatLine({ league, p }: { league: League; p: Player }) {
  const pg = playerSeason(p, league.season);
  const line = pg && pg.gp > 0 ? { season: league.season, pg } : latestLine(league, p);
  if (!line) return <div className="tiny dim">No stats yet</div>;
  const s = line.pg;
  return (
    <div className="fo-statline">
      <span className="over">{shortSeason(line.season)}</span>
      <span>
        <b>{f1(s.pts)}</b> pts
      </span>
      <span>
        <b>{f1(s.reb)}</b> reb
      </span>
      <span>
        <b>{f1(s.ast)}</b> ast
      </span>
      <span>
        <b>{f1(s.min)}</b> min
      </span>
      <span>
        <b>{p1(s.tsPct)}</b> TS
      </span>
      <span>
        <b>{s.gp}</b> gp
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
        <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
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

/** A player who can be extended now: his salary (the section says when it ends), what an extension would cost (or that he won't talk), and the button. */
export function ExtendRow({ league, p, onExtend }: { league: League; p: Player; onExtend: (pid: number) => void }) {
  const exp = contractExp(p.contract);
  const ask = extensionAsk(league, p);
  return (
    <div className="fo-rs">
      <PlayerTop
        league={league}
        p={p}
        right={
          <div className="fo-money">
            <div className="a">{salaryText(league, salaryFor(p, exp))}</div>
          </div>
        }
      />
      <div className="fo-rs-act">
        <div className="grow">
          <div className="small dim2 fo-rs-ext">
            {extensionRefusal(league, p) ? (
              <span className="warn">Won't extend now</span>
            ) : (
              <>
                {/* (from the season after his deal ends: the list's note says which, once) */}
                Extension ask <b className="num">{salaryText(league, ask.amount)}</b> {forYears(ask.years)}
              </>
            )}
          </div>
        </div>
        <button className="btn sm primary" aria-label={`Extend ${playerName(p)}`} onClick={() => onExtend(p.pid)}>
          <PenLine size={15} /> Extend
        </button>
      </div>
    </div>
  );
}
