// The locker room's pulse on Team → Roster (core/league/pulse.ts): one row saying how tight the
// core is and whether anyone is short of his minutes, opening a sheet with the group and each
// player who isn't content. Signals only: nothing to talk through, nothing to promise. A trade
// request is also a decision, so it comes to Needs you; here it stands until it is settled.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { pulseRead, type RoleRead } from '../../core/league/pulse';
import { teamPlayers } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { Bar, Sheet } from '../components/ui';
import { rosterNames } from '../stats';

const TONE: Record<RoleRead['tone'], string> = { good: 'good', warn: 'warn', bad: 'bad' };

export function LockerRoom({ league }: { league: League }) {
  const [open, setOpen] = useState(false);
  const read = useLeagueMemo(() => pulseRead(league), [league]);
  // (before the first read, ten games in, there is nothing to say)
  if (!league.pulse || !read.core.length) return null;
  const nameOf = rosterNames(teamPlayers(league, league.userTid));
  const alarm = read.roles.some((r) => r.asked) ? 'bad' : read.roles.length ? 'warn' : '';
  return (
    <>
      <button className="card tm-pulse" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="grow">
          <span className="tm-pulse-t">
            Locker room · <b>{read.word}</b>
          </span>
          <span className={`tm-pulse-l ${alarm}`}>{read.line}</span>
        </span>
        <ChevronRight size={18} className="dim" aria-hidden="true" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Locker room">
        <div className="col" style={{ gap: 14 }}>
          <div className="card col" style={{ gap: 8 }}>
            <div className="row between">
              <b>{read.word}</b>
              <span className="tm-pulse-k">Your five who play most</span>
            </div>
            <Bar value={read.cohesion * 100} />
            <div className="small dim2">{read.core.map((pid) => nameOf(pid)).join(' · ')}</div>
            <div className="small dim2">A core grows tighter the longer it plays and wins together. Trade one of the five and it starts again.</div>
          </div>
          {read.roles.length > 0 ? (
            <div className="card flush">
              <div className="list">
                {read.roles.map((r) => (
                  <Link key={r.pid} to={`/player/${r.pid}`} className="listrow clickable" onClick={() => setOpen(false)}>
                    <span className="grow tm-pulse-who">
                      <span className="lr-name">{nameOf(r.pid)}</span>
                      <span className="lr-meta">
                        Expects {r.expects} a game · plays {r.plays}
                      </span>
                    </span>
                    <span className={`tag ${TONE[r.tone]}`}>{r.word}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty">Everyone who expects minutes is getting them.</div>
          )}
          <div className="small dim2">
            A star short of his minutes for three weeks asks for a trade. He won't sign a new deal until he has them back. A tight, winning group is slower to complain.
          </div>
          <Link to="/team/rotation" className="btn block" onClick={() => setOpen(false)}>
            Set the rotation
          </Link>
        </div>
      </Sheet>
    </>
  );
}
