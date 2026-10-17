// Who guards whom against one opponent: their projected top eight, the staff's choice for each at
// tip-off, and the plan's own assignments (stored in the game plan, see setPlanMatchup).
import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { previewMatchups, matchupNotes } from '../../core/analysis/matchupPreview';
import { setPlanMatchup } from '../../core/league/gamePlans';
import { fmtHeight } from '../../core/ratings';
import { useLeagueMemo, useStore } from '../../state/store';
import { rosterNames } from '../stats';
import { Avatar, Ovr, Sheet, Tag } from './ui';
import './scouting.css';
import '../screens/tactics.css';

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
  if (!pv.rows.length) return <div className="card tx-empty">Their rotation isn&apos;t set yet.</div>;
  return (
    <>
      <div className="card flush list">
        {pv.rows.map((r) => {
          const p = league.players[r.pid];
          const def = r.planned ?? r.auto;
          const d = def !== null ? league.players[def] : undefined;
          return (
            <button
              key={r.pid}
              className="gp-match"
              onClick={() => setPick(r.pid)}
              // named by what it shows: "Maxey 88 PG · 6'2" · Starter, guarded by Mitchell Staff"
              aria-haspopup="dialog"
            >
              <Avatar p={p} />
              <span className="gp-match-p">
                <span className="gp-match-n">
                  <span className="lr-name ellipsis">{names(r.pid)}</span>
                  <Ovr v={p.ovr} size="sm" />
                </span>
                <span className="lr-meta">
                  {p.pos} · {fmtHeight(p.heightIn)} · {r.starter ? 'Starter' : 'Bench'}
                </span>
              </span>
              <span className="gp-match-d">
                <span className="sr-only">{d ? ', guarded by ' : ', guarded by nobody yet'}</span>
                <span className="gp-match-dn ellipsis">{d ? names(d.pid) : <span aria-hidden="true">—</span>}</span>
                {r.planned !== null ? <Tag tone="info">Planned</Tag> : <span className="tiny dim">Staff</span>}
              </span>
              <ChevronRight size={16} className="dim tx-chev" />
              {d && <Notes them={p} me={d} />}
            </button>
          );
        })}
      </div>
      <div className="tx-note">Tap a player to pick his defender{planned ? ` · ${planned} planned` : ''}. A planned matchup holds whenever both are on the floor.</div>
      <Sheet open={!!them && !!row} onClose={() => setPick(null)} title={them ? `Who guards ${names(them.pid)}?` : ''}>
        {them && row && (
          <div className="card flush list">
            <button className={`tx-opt ${row.planned === null ? 'on' : ''}`} aria-pressed={row.planned === null} onClick={() => set(row.pid, null)}>
              <span className="grow">
                <span className="tx-opt-l">Staff&apos;s choice</span>
                <span className="tx-opt-s">
                  {row.auto !== null ? `${names(row.auto)} at tip-off, re-matched with every lineup change.` : 'Re-matched with every lineup change.'}
                </span>
              </span>
              {row.planned === null && <Check size={18} className="tx-opt-c" aria-hidden="true" />}
            </button>
            {pv.mine.map((m) => {
              const on = row.planned === m.pid;
              const guarding = pv.rows.find((x) => x.planned === m.pid && x.pid !== row.pid);
              return (
                <button key={m.pid} className={`tx-opt ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set(row.pid, m.pid)}>
                  <Avatar p={m} />
                  <span className="grow">
                    <span className="tx-opt-l">
                      {names(m.pid)}{' '}
                      <span className="tx-opt-s inline">
                        {m.pos} · {fmtHeight(m.heightIn)}
                      </span>
                    </span>
                    <Notes them={them} me={m} />
                    {guarding && <span className="tx-opt-s">Planned on {names(guarding.pid)}: picking him here moves him.</span>}
                  </span>
                  {on && <Check size={18} className="tx-opt-c" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}
