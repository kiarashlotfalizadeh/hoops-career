// Who guards whom against one opponent: their projected top eight, starters then bench, the staff's
// defender for each at tip-off or the plan's own (setPlanMatchup). One row per player of theirs: his
// name and your defender, then the pairing's sharpest note (or his position and height); a tap opens
// the choice, every note beside each defender.
import { Fragment, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { previewMatchups, matchupNotes } from '../../core/analysis/matchupPreview';
import { guardingPlan, type GuardLine } from '../../core/analysis/guarding';
import { setPlanMatchup } from '../../core/league/gamePlans';
import { fmtHeight } from '../../core/ratings';
import { edit } from '../../state/actions';
import { useLeagueMemo, useStore } from '../../state/store';
import { rosterNames } from '../stats';
import { teamPlayers } from '../../core/league/helpers';
import { Avatar, Help, Ovr, Section, Sheet, Tag } from './ui';
import './scouting.css';

/** A pairing's notes, the sharpest first (a mismatch to fix, then one worth watching, then your edge); `one`: that one alone. */
function Notes({ them, me, one }: { them: Player; me: Player; one?: boolean }) {
  const rank = { bad: 0, warn: 1, good: 2 } as const;
  const all = [...matchupNotes(them, me)].sort((a, b) => rank[a.tone] - rank[b.tone]);
  const notes = one ? all.slice(0, 1) : all;
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

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** His shooting as a short line: "34.1% 3P on 5.2 a game · 71.0% FT" from his games, else nothing. */
function shootingLine(l: GuardLine | undefined): string {
  if (!l || l.source === 'ratings') return '';
  const parts = [Number.isFinite(l.tpPct) && l.tpa >= 0.5 ? `${pct1(l.tpPct)} 3P on ${l.tpa.toFixed(1)}` : `${l.tpa.toFixed(1)} 3PA`];
  if (Number.isFinite(l.ftPct) && l.fta >= 1) parts.push(`${pct1(l.ftPct)} FT`);
  return `${parts.join(' · ')} a game${l.source === 'last' ? ' · last season' : ''}`;
}

export function MatchupPlanner({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const pv = useLeagueMemo(() => previewMatchups(league, opp), [league, opp]);
  const lines = useLeagueMemo(() => new Map(guardingPlan(league, opp).map((a) => [a.pid, a])), [league, opp]);
  const [pick, setPick] = useState<number | null>(null);
  // each side's players told apart from their own teammates (the injured too), as the Preview's starting fives do
  const theirNames = useLeagueMemo(() => rosterNames(teamPlayers(league, opp)), [league, opp]);
  const myNames = useLeagueMemo(() => rosterNames(teamPlayers(league, league.userTid)), [league]);
  const names = (pid: number) => (league.players[pid]?.tid === opp ? theirNames(pid) : myNames(pid)) || league.players[pid]?.lastName || '';
  const planned = pv.rows.filter((r) => r.planned !== null).length;
  const setGuard = (theirs: number, mine: number | null) => edit((l) => setPlanMatchup(l, opp, theirs, mine));
  const row = pick !== null ? pv.rows.find((r) => r.pid === pick) : undefined;
  const them = row ? league.players[row.pid] : undefined;
  const shooting = row ? shootingLine(lines.get(row.pid)) : '';
  return (
    <Section
      title="Who guards whom"
      right={
        <Help title="Matchups">
          <p>The staff matches size and puts its best defenders on their creators. Under a pairing, green is your edge and red a mismatch to fix.</p>
        </Help>
      }
    >
      {!pv.rows.length ? (
        <div className="mu-note">Their rotation isn&apos;t set yet.</div>
      ) : (
        <>
          <div className="card flush list">
            {[true, false].map((starters) => {
              const group = pv.rows.filter((r) => r.starter === starters);
              if (!group.length) return null;
              return (
                <Fragment key={String(starters)}>
                  <div className="list-divider list-h">
                    <span>{starters ? 'Starters' : 'Bench'}</span>
                    <span>Your defender</span>
                  </div>
                  {group.map((r) => {
                    const p = league.players[r.pid];
                    const def = r.planned ?? r.auto;
                    const d = def !== null ? league.players[def] : undefined;
                    const note = d && matchupNotes(p, d).length > 0;
                    return (
                      <button key={r.pid} className="gp-match" onClick={() => setPick(r.pid)} aria-haspopup="dialog">
                        <Avatar p={p} />
                        <span className="gp-match-p">
                          <span className="gp-match-n">
                            <span className="lr-name ellipsis">{names(r.pid)}</span>
                            <Ovr v={p.ovr} size="sm" />
                          </span>
                          {!note && (
                            <span className="lr-meta">
                              {p.pos} · {fmtHeight(p.heightIn)}
                            </span>
                          )}
                        </span>
                        <span className="gp-match-d">
                          <span className="sr-only">{d ? ', guarded by ' : ', guarded by nobody yet'}</span>
                          <span className="gp-match-dn ellipsis">{d ? names(d.pid) : <span aria-hidden="true">—</span>}</span>
                          {r.planned !== null && <Tag tone="info">Planned</Tag>}
                        </span>
                        <ChevronRight size={16} className="dim gp-chev" aria-hidden="true" />
                        {d && note && <Notes them={p} me={d} one />}
                      </button>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
          <div className="mu-note">Tap a player to set who guards him{planned ? ` · ${planned} planned` : ''}.</div>
        </>
      )}
      <Sheet open={!!them && !!row} onClose={() => setPick(null)} title={them ? names(them.pid) : ''}>
        {them && row && (
          <div className="col" style={{ gap: 16 }}>
            <div className="col" style={{ gap: 8 }}>
              <div className="over">Who guards him</div>
              {shooting && <div className="mu-note">{shooting}</div>}
              <div className="card flush list">
                <button className={`gp-opt ${row.planned === null ? 'on' : ''}`} aria-pressed={row.planned === null} disabled={simming} onClick={() => setGuard(row.pid, null)}>
                  <span className="grow">
                    <span className="gp-opt-l">Staff&apos;s choice</span>
                    <span className="gp-opt-s">
                      {row.auto !== null ? `${names(row.auto)} at tip-off, re-matched with every lineup change.` : 'Re-matched with every lineup change.'}
                    </span>
                  </span>
                  {row.planned === null && <Check size={18} className="gp-opt-c" aria-hidden="true" />}
                </button>
                {pv.mine.map((m) => {
                  const on = row.planned === m.pid;
                  const guarding = pv.rows.find((x) => x.planned === m.pid && x.pid !== row.pid);
                  return (
                    <button key={m.pid} className={`gp-opt ${on ? 'on' : ''}`} aria-pressed={on} disabled={simming} onClick={() => setGuard(row.pid, m.pid)}>
                      <Avatar p={m} />
                      <span className="grow">
                        <span className="gp-opt-l">
                          {names(m.pid)}{' '}
                          <span className="gp-opt-s inline">
                            {m.pos} · {fmtHeight(m.heightIn)}
                          </span>
                        </span>
                        <Notes them={them} me={m} />
                        {guarding && <span className="gp-opt-s">On {names(guarding.pid)} now: picking him moves him.</span>}
                      </span>
                      {on && <Check size={18} className="gp-opt-c" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </Section>
  );
}
