// The Re-sign desk's player rows: a player with his line of stats, and one you can extend now.
import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { playerName, teamPlayers } from '../../core/league/helpers';
import { extensionAsk, extensionBlockedReason, extensionRefusal } from '../../core/league/contracts';
import { contractExp, salaryFor } from '../../core/playerGen';
import { Avatar } from '../components/ui';
import { f1, latestLine, p1, playerSeason } from '../stats';
import { MoodTag, OvrPot, playerMeta, shortSeason } from './common';
import { money } from '../../core/format';

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

/** A player in a Re-sign list: his jersey, name (to his page), line of detail and rating. */
export function PlayerTop({ league, p, pot = true }: { league: League; p: Player; pot?: boolean }) {
  return (
    <div className="fo-rs-top">
      <Avatar p={p} />
      <div className="grow">
        <Link to={`/player/${p.pid}`} className="fo-name">
          {playerName(p)}
        </Link>
        <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
      </div>
      <OvrPot p={p} showPot={pot} />
    </div>
  );
}

/** The user's players who can be extended right now (in the final season of their deals), best first. */
export const extendablePlayers = (league: League) =>
  teamPlayers(league, league.userTid)
    .filter((p) => !extensionBlockedReason(league, p))
    .sort((a, b) => b.ovr - a.ovr);

/** A player who can be extended now: his salary, what an extension would cost (or that he won't talk), and the button. */
export function ExtendRow({ league, p, onExtend }: { league: League; p: Player; onExtend: (pid: number) => void }) {
  const exp = contractExp(p.contract);
  const ask = extensionAsk(league, p);
  return (
    <div className="fo-rs">
      <div className="fo-rs-top">
        <Avatar p={p} />
        <div className="grow">
          <Link to={`/player/${p.pid}`} className="fo-name">
            {playerName(p)}
          </Link>
          <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
        </div>
        <div className="fo-money">
          <div className="a">{money(salaryFor(p, exp))}</div>
          <div className="b">thru {shortSeason(exp)}</div>
        </div>
      </div>
      <div className="fo-rs-act">
        <div className="grow">
          <MoodTag p={p} />
          <div className="small dim2 fo-rs-ext">
            {extensionRefusal(league, p) ? (
              <span className="warn">Won't extend now</span>
            ) : (
              <>
                Extension: asks <b className="num">{money(ask.amount)}</b> × {ask.years} yr{ask.years > 1 ? 's' : ''}
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
