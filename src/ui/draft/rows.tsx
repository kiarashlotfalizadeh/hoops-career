// The draft's two kinds of rows: a prospect on the board (with his projection and, on the clock, a
// Draft button) and a pick that was made.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { userNextSlot, type MockDraft } from '../../core/league/mockDraft';
import { fmtHeight } from '../../core/ratings';
import { playerAge } from '../../core/playerGen';
import { TeamLogo } from '../components/TeamLogo';
import { Empty } from '../components/ui';
import { OvrPot } from '../office/common';
import { overallPick } from '../league/shared';
import { OvrKey } from '../components/OvrKey';

export function SelectionRow({ league, p }: { league: League; p: Player }) {
  const mine = p.draft.tid === league.userTid;
  return (
    <Link to={`/player/${p.pid}`} className={`listrow fo-sel ${mine ? 'me' : ''}`}>
      <span className="fo-rank">{overallPick(league, p.draft.round, p.draft.pick)}</span>
      <TeamLogo tid={p.draft.tid ?? 0} size={28} decorative />
      <div className="grow">
        <div className="fo-name">{playerName(p)}</div>
        <div className="fo-meta">
          {league.teams[p.draft.tid ?? 0]?.abbrev} · {p.pos} · {fmtHeight(p.heightIn)} · {p.college || p.country}
        </div>
      </div>
      <OvrPot p={p} />
    </Link>
  );
}

export function BoardList({
  league,
  list,
  mock,
  onOpen,
  onDraft,
}: {
  league: League;
  list: Player[];
  mock?: MockDraft | null;
  onOpen: (pid: number) => void;
  onDraft?: (pid: number) => void;
}) {
  const [limit, setLimit] = useState(30);
  if (!list.length) return <Empty>No prospects left on the board.</Empty>;
  // the mock's read of where each goes, and whether he'll still be there at the user's next pick
  const mine = mock ? userNextSlot(league, mock) : undefined;
  const projection = (p: Player) => {
    const r = mock?.range.get(p.pid);
    if (!mock || !r) return null;
    const where = r.med > 2 * league.teams.length ? 'Undrafted in most mocks' : r.lo === r.hi ? `Proj. #${r.med}` : `Proj. #${r.lo}-${r.hi > 2 * league.teams.length ? '' : r.hi}`;
    const gone = mine ? mock.goneBefore(p.pid, mine.overall) : null;
    return { where: where.replace(/-$/, '+'), gone: gone !== null && gone >= 0.05 && gone <= 0.95 ? `${Math.round(gone * 100)}% gone by your #${mine!.overall}` : null };
  };
  return (
    <div className="card flush">
      {/* what each column is: the consensus rank, the prospect with the mocks' range for him, his rating now and the ceiling scouts see */}
      <div className="fo-board-h" aria-hidden="true">
        <span className="fo-rank">#</span>
        <span className="grow">Prospect · mock range</span>
        <span>OVR ▲POT</span>
      </div>
      <div className="list wide2">
        {list.slice(0, limit).map((p) => {
          const pr = projection(p);
          return (
            // the scouting report and the Draft button sit side by side: a button inside a button is announced as one
            <div key={p.pid} className={`fo-board-row ${onDraft ? 'can' : ''}`}>
              <button className="fo-prow grow" onClick={() => onOpen(p.pid)}>
                <span className="fo-rank">
                  <span className="sr-only">Board rank </span>
                  {p.prospect?.rank ?? '—'}
                </span>
                <div className="grow">
                  <div className="fo-name">{playerName(p)}</div>
                  <div className="fo-meta">
                    {p.pos} · {playerAge(p, league.season)} · {fmtHeight(p.heightIn)} · {p.college || p.country}
                  </div>
                  {/* wraps on a phone rather than cut off the chance he's gone before your pick */}
                  <div className="fo-board-proj">
                    {p.archetype}
                    {pr ? <span className="fo-proj"> · {pr.where}</span> : null}
                    {pr?.gone ? <span className="warn"> · {pr.gone}</span> : null}
                  </div>
                </div>
                <OvrPot p={p} />
              </button>
              {onDraft && (
                <button className="btn sm good" aria-label={`Draft ${playerName(p)}`} onClick={() => onDraft(p.pid)}>
                  Draft
                </button>
              )}
            </div>
          );
        })}
      </div>
      {list.length > limit && (
        <button className="btn ghost block fo-more-btn" onClick={() => setLimit(limit + 30)}>
          Show more ({list.length - limit} left)
        </button>
      )}
      <div className="fo-board-foot">
        <OvrKey />
      </div>
    </div>
  );
}
