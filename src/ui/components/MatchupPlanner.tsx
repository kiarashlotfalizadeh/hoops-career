// Who guards whom against one opponent, and how: their projected top eight, the staff's defender for
// each at tip-off or the plan's own (setPlanMatchup), and a guarding instruction for each
// (setPlanPlayerD), with the staff's suggestion and the numbers behind it. One row per player of
// theirs; a tap opens both choices.
import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { League, Player, PlayerDefense } from '../../core/types';
import { PLAYER_DEFENSES } from '../../core/types';
import { previewMatchups, matchupNotes } from '../../core/analysis/matchupPreview';
import { guardingPlan, type GuardAdvice } from '../../core/analysis/guarding';
import { effectiveTactics, setPlanMatchup, setPlanPlayerD } from '../../core/league/gamePlans';
import { PLAYER_D_META } from '../../core/sim/tactics';
import { fmtHeight } from '../../core/ratings';
import { edit } from '../../state/actions';
import { useLeagueMemo, useStore } from '../../state/store';
import { rosterNames } from '../stats';
import { Avatar, Chips, Help, Ovr, Section, Sheet, Tag } from './ui';
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

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** His shooting as a short line: "34.1% 3P on 5.2 a game · 71.0% FT" from his games, else nothing. */
function shootingLine(a: GuardAdvice | undefined): string {
  const l = a?.line;
  if (!l || l.source === 'ratings') return '';
  const parts = [Number.isFinite(l.tpPct) && l.tpa >= 0.5 ? `${pct1(l.tpPct)} 3P on ${l.tpa.toFixed(1)}` : `${l.tpa.toFixed(1)} 3PA`];
  if (Number.isFinite(l.ftPct) && l.fta >= 1) parts.push(`${pct1(l.ftPct)} FT`);
  return `${parts.join(' · ')} a game${l.source === 'last' ? ' (last season)' : ''}`;
}

export function MatchupPlanner({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const pv = useLeagueMemo(() => previewMatchups(league, opp), [league, opp]);
  const advice = useLeagueMemo(() => new Map(guardingPlan(league, opp).map((a) => [a.pid, a])), [league, opp]);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const [pick, setPick] = useState<number | null>(null);
  const short = rosterNames([...pv.theirs, ...pv.mine]);
  // (a planned defender from deep on the bench isn't among your top ten)
  const names = (pid: number) => short(pid) || league.players[pid]?.lastName || '';
  const how = eff.defense.playerD ?? {};
  const planned = pv.rows.filter((r) => r.planned !== null).length + Object.keys(how).length;
  const setGuard = (theirs: number, mine: number | null) => edit((l) => setPlanMatchup(l, opp, theirs, mine));
  const setHow = (theirs: number, d: PlayerDefense | null) => edit((l) => setPlanPlayerD(l, opp, theirs, d));
  const row = pick !== null ? pv.rows.find((r) => r.pid === pick) : undefined;
  const them = row ? league.players[row.pid] : undefined;
  const adv = row ? advice.get(row.pid) : undefined;
  const cur = row ? (how[row.pid] ?? null) : null;
  return (
    <Section
      title="At the tip"
      right={
        <Help title="Matchups">
          <p>
            Their projected top eight against your top ten, as the staff would match them at tip-off: starters on starters, bench on bench. The staff matches size and puts its best
            defenders on the players their offense runs through. A planned matchup holds whenever both players are on the floor.
          </p>
          {PLAYER_DEFENSES.map((d) => (
            <p key={d}>
              <b>{PLAYER_D_META[d].label}:</b> {PLAYER_D_META[d].help}
            </p>
          ))}
          <p>Each instruction is for this opponent only. ★ is the staff&apos;s suggestion, from his games when there are enough, his ratings otherwise.</p>
        </Help>
      }
    >
      {!pv.rows.length ? (
        <div className="mu-note">Their rotation isn&apos;t set yet.</div>
      ) : (
        <>
          <div className="card flush list">
            {pv.rows.map((r) => {
              const p = league.players[r.pid];
              const def = r.planned ?? r.auto;
              const d = def !== null ? league.players[def] : undefined;
              const h = how[r.pid];
              return (
                <button key={r.pid} className="gp-match" onClick={() => setPick(r.pid)} aria-haspopup="dialog">
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
                    {h ? <Tag tone="info">{PLAYER_D_META[h].short}</Tag> : r.planned !== null ? <Tag tone="info">Planned</Tag> : <span className="tiny dim">Staff</span>}
                  </span>
                  <ChevronRight size={16} className="dim gp-chev" aria-hidden="true" />
                  {d && <Notes them={p} me={d} />}
                </button>
              );
            })}
          </div>
          <div className="mu-note">Tap a player to set who guards him and how{planned ? ` · ${planned} planned` : ''}.</div>
        </>
      )}
      <Sheet open={!!them && !!row} onClose={() => setPick(null)} title={them ? names(them.pid) : ''}>
        {them && row && (
          <div className="col" style={{ gap: 16 }}>
            <div className="col" style={{ gap: 8 }}>
              <div className="over">How to guard him</div>
              <Chips
                label={`How to guard ${names(them.pid)}`}
                value={cur ?? ('' as PlayerDefense)}
                disabled={simming}
                onChange={(d: PlayerDefense) => setHow(them.pid, d === cur ? null : d)}
                options={PLAYER_DEFENSES.map((d) => ({ id: d, label: `${PLAYER_D_META[d].short}${d === adv?.suggest ? ' ★' : ''}` }))}
              />
              <div className="mu-note">
                {cur ? PLAYER_D_META[cur].label : 'Straight up'}
                {adv?.suggest && adv.why ? ` · ★ ${PLAYER_D_META[adv.suggest].short}: ${adv.why}` : ''}
                {shootingLine(adv) ? ` · ${shootingLine(adv)}` : ''}
              </div>
            </div>
            <div className="col" style={{ gap: 8 }}>
              <div className="over">Who guards him</div>
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
