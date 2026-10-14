// Who guards whom against one opponent: their projected top eight, the staff's choice for each at
// tip-off, and the plan's own assignments (stored in the game plan, see setPlanMatchup).
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { previewMatchups, matchupNotes } from '../../core/analysis/matchupPreview';
import { setPlanMatchup } from '../../core/league/gamePlans';
import { fmtHeight } from '../../core/ratings';
import { useLeagueMemo, useStore } from '../../state/store';
import { rosterNames } from '../stats';
import { Ovr, Sheet, Tag } from './ui';
import './scouting.css';

function Notes({ them, me }: { them: Player; me: Player }) {
  const notes = matchupNotes(them, me);
  if (!notes.length) return null;
  return (
    <div className="gp-notes">
      {notes.map((n) => (
        <span key={n.text} className={`gp-note ${n.tone}`}>
          {n.text}
        </span>
      ))}
    </div>
  );
}

export function MatchupPlanner({ league, opp }: { league: League; opp: number }) {
  const pv = useLeagueMemo(() => previewMatchups(league, opp), [league, opp]);
  const [pick, setPick] = useState<number | null>(null);
  const short = rosterNames([...pv.theirs, ...pv.mine]);
  // (a planned defender from deep on the bench isn't among your top ten)
  const names = (pid: number) => short(pid) || league.players[pid]?.lastName || '';
  const planned = pv.rows.filter((r) => r.planned !== null).length;
  const set = (theirs: number, mine: number | null) => {
    useStore.getState().mutate((l) => setPlanMatchup(l, opp, theirs, mine));
    setPick(null);
  };
  const row = pick !== null ? pv.rows.find((r) => r.pid === pick) : undefined;
  const them = row ? league.players[row.pid] : undefined;
  if (!pv.rows.length) return <div className="small dim">Their rotation isn't set yet.</div>;
  return (
    <>
      <div className="small dim2" style={{ marginBottom: 10 }}>
        The staff matches size and puts its best defenders on the players their offense runs through. Tap a player to assign your own defender
        {planned ? ` (${planned} planned)` : ''}; it holds whenever both are on the floor.
      </div>
      <div className="col" style={{ gap: 10 }}>
        {pv.rows.map((r) => {
          const p = league.players[r.pid];
          const def = r.planned ?? r.auto;
          const d = def !== null ? league.players[def] : undefined;
          return (
            <button
              key={r.pid}
              className="gp-match"
              onClick={() => setPick(r.pid)}
              aria-label={`${names(r.pid)}: guarded by ${d ? names(d.pid) : 'nobody yet'}${r.planned !== null ? ', planned' : ", the staff's choice"}. Change`}
            >
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                <Ovr v={p.ovr} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <div className="bold ellipsis">{names(r.pid)}</div>
                  <div className="tiny dim2">
                    {p.pos} · {fmtHeight(p.heightIn)} · {r.starter ? 'Starter' : 'Bench'}
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="small bold">{d ? names(d.pid) : '—'}</div>
                  {r.planned !== null ? <Tag tone="info">Planned</Tag> : <span className="tiny dim">Staff</span>}
                </div>
                <ChevronRight size={16} className="dim" />
              </div>
              {d && <Notes them={p} me={d} />}
            </button>
          );
        })}
      </div>
      <Sheet open={!!them && !!row} onClose={() => setPick(null)} title={them ? `Who guards ${names(them.pid)}?` : ''}>
        {them && row && (
          <div className="col" style={{ gap: 8 }}>
            <button
              className="card tight"
              style={{ textAlign: 'left', borderColor: row.planned === null ? 'var(--accent)' : undefined }}
              aria-pressed={row.planned === null}
              onClick={() => set(row.pid, null)}
            >
              <div className="bold">Staff's choice</div>
              <div className="small dim2">{row.auto !== null ? `${names(row.auto)} at tip-off, re-matched with every lineup change.` : 'Re-matched with every lineup change.'}</div>
            </button>
            {pv.mine.map((m) => {
              const on = row.planned === m.pid;
              const guarding = pv.rows.find((x) => x.planned === m.pid && x.pid !== row.pid);
              return (
                <button
                  key={m.pid}
                  className="card tight"
                  style={{ textAlign: 'left', borderColor: on ? 'var(--accent)' : undefined }}
                  aria-pressed={on}
                  onClick={() => set(row.pid, m.pid)}
                >
                  <div className="row between" style={{ gap: 8 }}>
                    <span className="bold">{names(m.pid)}</span>
                    <span className="tiny dim2">
                      {m.pos} · {fmtHeight(m.heightIn)}
                    </span>
                  </div>
                  <Notes them={them} me={m} />
                  {guarding && <div className="tiny dim">Planned on {names(guarding.pid)}: picking him here moves him.</div>}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}
