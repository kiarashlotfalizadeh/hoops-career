// Office → Trade → 3 teams: one deal between you and two other teams. Each team's card holds what
// it sends, each thing with where it goes (a tap moves it to the deal's other team); under them,
// both other GMs' answers and what the rules say. A deal is its legs (core/league/trades.ts: TradeLeg):
// every team is judged, and its salary matched, on all it sends against all it gets, whoever from.
// Players and picks only: protections, swap rights and cash stay in the two-team builder. As there:
// "Make it work" adds what gets both other GMs to yes (core/league/tradeHelp.ts: makeDealWork), and
// god mode can force the deal through. An AI team's three-team offer opens here to be reworked.
import { useState } from 'react';
import { ArrowRight, ChevronDown, Handshake, Plus, RotateCcw, Sparkles, Ticket, X, Zap } from 'lucide-react';
import type { League } from '../../core/types';
import { teamPlayers, teamCity } from '../../core/league/helpers';
import { capSalary, evaluateDeal, pickLabel, untradeable, type TradeLeg } from '../../core/league/trades';
import { useLeagueMemo, useStore } from '../../state/store';
import { makeDeal } from '../../state/actions/office';
import { act } from '../../state/actions';
import { dealAddsText, makeDealWork, type DealAdd } from '../../core/league/tradeHelp';
import { checkForceDeal, forceDeal } from '../../core/league/godMode';
import { money } from '../../core/format';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Ovr, Section, Sheet } from '../components/ui';
import { rosterNames } from '../stats';
import { pickOrder, pickProjText, projectedSlot } from '../draft/common';
import { PickAsset, PlayerAsset } from './AssetList';
import { TeamSheet } from './Partner';

/** One thing in the deal: a player or a pick, who sends it and who gets it. */
export interface Move {
  k: 'p' | 'd';
  id: number;
  from: number;
  to: number;
}

/** A deal's legs as the builder's moves (an AI team's three-team offer, or what "Make it work" answered). */
export const movesOf = (legs: TradeLeg[]): Move[] =>
  legs.flatMap((l) => [...l.pids.map((id): Move => ({ k: 'p', id, from: l.tid, to: l.to })), ...l.dpids.map((id): Move => ({ k: 'd', id, from: l.tid, to: l.to }))]);

/** A deal to open the builder on: the two other teams and what moves. */
export interface ThreeInit {
  b: number;
  c: number;
  moves: Move[];
}

/** A three-team deal's legs as the builder opens them (null unless the user's team and two others are in it). */
export function threeInitOf(league: League, legs: TradeLeg[]): ThreeInit | null {
  const others = [...new Set(legs.flatMap((l) => [l.tid, l.to]))].filter((t) => t !== league.userTid);
  return others.length === 2 ? { b: others[0], c: others[1], moves: movesOf(legs) } : null;
}

/** The deal's moves as legs: one for each pair of teams something goes between. */
function legsOf(teams: number[], moves: Move[]): TradeLeg[] {
  const legs: TradeLeg[] = [];
  for (const from of teams)
    for (const to of teams) {
      if (from === to) continue;
      const mine = moves.filter((m) => m.from === from && m.to === to);
      // (a team with nothing either way still stands in the deal, so the rules can say so)
      legs.push({ tid: from, to, pids: mine.filter((m) => m.k === 'p').map((m) => m.id), dpids: mine.filter((m) => m.k === 'd').map((m) => m.id) });
    }
  return legs.filter((l, i) => l.pids.length || l.dpids.length || legs.findIndex((x) => x.tid === l.tid) === i);
}

export function ThreeTeam({ league, season, closed, partner, init }: { league: League; season: number; closed: boolean; partner: number; init?: ThreeInit | null }) {
  const user = league.userTid;
  const simming = useStore((s) => !!s.sim);
  const toast = useStore((s) => s.toast);
  const [b, setB] = useState(init?.b ?? partner);
  const [c, setC] = useState(() => init?.c ?? league.teams.find((t) => t.tid !== user && t.tid !== partner)!.tid);
  const [moves, setMoves] = useState<Move[]>(init?.moves ?? []);
  const [adding, setAdding] = useState<number | null>(null);
  const [picking, setPicking] = useState<'b' | 'c' | null>(null);
  const [work, setWork] = useState<{ legs: TradeLeg[]; added: DealAdd[] } | null>(null);
  const teams = [user, b, c];
  // drop anything that is no longer where it was (a trade, a release, a pick used), or that a team no longer in the deal held
  const live = moves.filter(
    (m) =>
      teams.includes(m.from) && teams.includes(m.to) && (m.k === 'p' ? league.players[m.id]?.tid === m.from : league.draftPicks.some((d) => d.dpid === m.id && d.tid === m.from)),
  );
  const legs = legsOf(teams, live);
  const key = JSON.stringify(legs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ev = useLeagueMemo(() => (live.length ? evaluateDeal(league, legs) : null), [league, key]);
  const proj = useLeagueMemo(() => projectedSlot(league), [league]);
  const ab = (tid: number) => league.teams[tid].abbrev;
  const others = (tid: number) => teams.filter((t) => t !== tid);
  const has = (k: Move['k'], id: number) => live.some((m) => m.k === k && m.id === id);
  const toggle = (k: Move['k'], id: number, from: number) =>
    setMoves((ms) => {
      if (ms.some((m) => m.k === k && m.id === id)) return ms.filter((m) => !(m.k === k && m.id === id));
      // yours go to the first partner, theirs come to you: a tap on the row sends it to the third team instead
      return [...ms, { k, id, from, to: from === user ? b : user }];
    });
  const reroute = (m: Move) => setMoves((ms) => ms.map((x) => (x.k === m.k && x.id === m.id ? { ...x, to: others(m.from).find((t) => t !== m.to)! } : x)));
  const swapTeam = (slot: 'b' | 'c', tid: number) => {
    const old = slot === 'b' ? b : c;
    if (tid === old) return;
    (slot === 'b' ? setB : setC)(tid);
    // what the team that left sent goes; what was headed to it goes to the team that took its place
    setMoves((ms) => ms.filter((m) => m.from !== old).map((m) => (m.to === old ? { ...m, to: tid } : m)));
  };
  const salary = (tid: number, dir: 'out' | 'in') =>
    live.filter((m) => m.k === 'p' && (dir === 'out' ? m.from === tid : m.to === tid)).reduce((a, m) => a + capSalary(league, m.id, season), 0);

  const card = (tid: number, slot: 'b' | 'c' | null) => {
    const t = league.teams[tid];
    const mine = live.filter((m) => m.from === tid);
    const nameOf = rosterNames(teamPlayers(league, tid));
    return (
      <section key={tid} className="card fo-tt-team" aria-label={`${t.region} ${t.name} send`}>
        <div className="fo-tt-h">
          <TeamLogo tid={tid} size={22} decorative />
          {slot ? (
            <button className="fo-tt-pick grow" onClick={() => setPicking(slot)} aria-haspopup="dialog" aria-label={`${t.region} ${t.name}. Change team`}>
              <span className="ellipsis">{teamCity(league, t)} sends</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          ) : (
            <h3 className="grow">You send</h3>
          )}
          {/* salary is matched on all a team sends against all it gets */}
          <span className="fo-tt-sal num">
            {money(salary(tid, 'out'))} out · {money(salary(tid, 'in'))} in
          </span>
        </div>
        {mine.length === 0 && <div className="fo-deal-none">Nothing yet</div>}
        {mine.map((m) => {
          const label =
            m.k === 'p'
              ? nameOf(m.id)
              : pickLabel(
                  league,
                  league.draftPicks.find((d) => d.dpid === m.id)!,
                );
          return (
            <div key={`${m.k}${m.id}`} className="fo-tt-row">
              {m.k === 'p' ? <Ovr v={league.players[m.id].ovr} size="sm" /> : <Ticket size={16} className="fo-pill-ic" aria-hidden="true" />}
              <span className="fo-tt-name grow">
                <span className="ellipsis">{label}</span>
                {m.k === 'p' && <span className="fo-tt-meta num">{money(capSalary(league, m.id, season))}</span>}
              </span>
              {/* where it goes: a tap sends it to the deal's other team */}
              <button className="fo-tt-to" onClick={() => reroute(m)} aria-label={`${label} goes to ${ab(m.to)}. Send to ${ab(others(tid).find((x) => x !== m.to)!)} instead`}>
                <ArrowRight size={14} aria-hidden="true" />
                <TeamLogo tid={m.to} size={18} decorative />
                <span>{m.to === user ? 'You' : ab(m.to)}</span>
              </button>
              <button className="fo-tt-x" aria-label={`Remove ${label}`} onClick={() => toggle(m.k, m.id, tid)}>
                <X size={15} />
              </button>
            </div>
          );
        })}
        <button className="btn sm fo-tt-add" onClick={() => setAdding(tid)} aria-haspopup="dialog">
          <Plus size={15} /> Players and picks
        </button>
      </section>
    );
  };

  const addT = adding === null ? null : league.teams[adding];
  const roster = adding === null ? [] : teamPlayers(league, adding).sort((x, y) => y.ovr - x.ovr);
  const tradable = roster.filter((p) => untradeable(league, p)?.kind !== 'expiring');
  const addName = rosterNames(roster, { initial: true });
  const picks = adding === null ? [] : league.draftPicks.filter((d) => d.tid === adding).sort(pickOrder(league, proj));
  const blocked = ev?.errors ?? [];
  const waiting = ev ? ev.teams.filter((t) => !t.accept) : [];
  // "Make it work": what you'd add for both GMs to say yes (asked on a tap: the search is not free)
  const whatWorks = () => {
    let res: ReturnType<typeof makeDealWork>;
    try {
      res = makeDealWork(league, legs);
    } catch (e) {
      // (never a tap that does nothing: the search failing says so)
      console.error('make it work failed', e);
      toast("The staff couldn't work this one out. Try changing the deal.", 'bad');
      return;
    }
    if (!res.legs) {
      toast(
        res.why === 'salary'
          ? 'No contract of yours makes the salary match.'
          : res.why === 'theirSalary'
            ? "They can't send back enough salary to match."
            : res.why === 'rules'
              ? 'The rules block this deal whatever you add.'
              : res.why === 'idle' && res.idle !== undefined
                ? `${ab(res.idle)} has no part in this deal. Send it something, or build it with two teams.`
                : 'Nothing you have gets both teams to yes. Try a different deal.',
        'bad',
      );
      return;
    }
    if (!res.added.length) {
      toast('They take it as it is.', 'good');
      return;
    }
    setWork({ legs: res.legs, added: res.added });
  };
  // god mode: only the deal's shape and five players to dress stop a forced deal
  const god = !!league.settings.godMode;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const force = useLeagueMemo(() => (god && live.length ? checkForceDeal(league, legs) : null), [league, god, key]);
  const forceIt = () => {
    if (!force || force.errors.length) return;
    const names = [b, c].map(ab).join(' and ');
    if (!act('The forced trade', (l) => forceDeal(l, legs))) return;
    setMoves([]);
    toast(`Trade forced through with ${names}.`, 'good');
  };
  return (
    <>
      <Section
        title="Three-team deal"
        right={
          <span className="row" style={{ gap: 4 }}>
            {live.length > 0 && (
              <button className="btn xs text" onClick={() => setMoves([])}>
                <RotateCcw size={13} /> Clear
              </button>
            )}
            <Help title="Three-team deals">
              <p>You and two other teams in one deal. Tap the arrow on a row to change where it goes.</p>
              <p>Every team must say yes. Each is judged, and its salary matched, on all it sends against all it gets.</p>
              <p>Make it work adds what gets both of them to yes. Players and picks only: protections, swaps and cash stay in the two-team builder.</p>
            </Help>
          </span>
        }
      >
        <div className="fo-tt">
          {card(user, null)}
          {card(b, 'b')}
          {card(c, 'c')}
        </div>
      </Section>

      {/* both other GMs' answers, then what the rules say, then the way to make it */}
      <Section title="Their answers">
        <div className="card fo-tt-verdict">
          {[b, c].map((tid) => {
            const v = ev?.teams.find((t) => t.tid === tid);
            return (
              <div key={tid} className="fo-tt-v">
                <TeamLogo tid={tid} size={26} decorative />
                <span className="fo-tt-v-n">{ab(tid)}</span>
                <span className={`fo-tt-v-m grow ${!v ? 'dim' : v.accept ? 'good' : 'warn'}`}>{v ? v.message : 'Waiting for a deal'}</span>
              </div>
            );
          })}
          {blocked.length > 0 && (
            <ul className="fo-notes">
              {blocked.slice(0, 4).map((e) => (
                <li key={e} className="warn" style={{ ['--note' as string]: 'var(--warn)' }}>
                  {e}
                </li>
              ))}
            </ul>
          )}
          <div className="fo-tt-btns">
            {/* (offered once a GM has said no, or the salary doesn't match: a deal they take needs no help) */}
            {ev && !ev.accept && (
              <button className="btn" disabled={closed || simming} onClick={whatWorks}>
                <Sparkles size={16} /> Make it work
              </button>
            )}
            <button className="btn primary" disabled={closed || simming || !ev || blocked.length > 0} onClick={() => makeDeal(league, legs) && setMoves([])}>
              <Handshake size={17} />
              {!ev ? 'Add to the deal' : blocked.length ? 'Blocked by the rules' : waiting.length ? `Propose anyway` : `Make the deal`}
            </button>
          </div>
          {force && (
            <div className="col fo-dock-force">
              <button className="btn sm block" disabled={force.errors.length > 0 || simming} onClick={forceIt}>
                <Zap size={16} /> Force this trade
              </button>
              {(force.errors.length > 0 || force.warnings.length > 0 || simming) && (
                <span className={`tiny ${force.errors.length ? 'bad' : 'warn'}`}>
                  {force.errors[0] ?? (simming ? 'The simulation is running: a forced trade waits for it to stop.' : force.warnings[0])}
                </span>
              )}
            </div>
          )}
        </div>
      </Section>

      <Sheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        title={addT ? (adding === user ? 'Your players and picks' : `${teamCity(league, addT)}: players and picks`) : ''}
      >
        {addT && (
          <div className="card flush fo-assets">
            <div className="list">
              {tradable.map((p) => (
                <PlayerAsset key={p.pid} league={league} p={p} name={addName(p.pid)} season={season} on={has('p', p.pid)} onToggle={() => toggle('p', p.pid, addT.tid)} />
              ))}
            </div>
            <div className="list-divider">Draft picks</div>
            {picks.length === 0 ? (
              <div className="fo-assets-empty">No draft picks.</div>
            ) : (
              <div className="list">
                {picks.map((dp) => (
                  <PickAsset key={dp.dpid} league={league} dp={dp} proj={pickProjText(league, dp)} on={has('d', dp.dpid)} onToggle={() => toggle('d', dp.dpid, addT.tid)} />
                ))}
              </div>
            )}
          </div>
        )}
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => setAdding(null)}>
          Done
        </button>
      </Sheet>
      <Sheet open={!!work} onClose={() => setWork(null)} title="What makes this work">
        {work && (
          <div className="col fo-sheet">
            <p className="fo-lede">Your current deal is unchanged. Both teams would accept if you add {dealAddsText(league, work.added)}.</p>
            <div className="row">
              <button type="button" className="btn grow" onClick={() => setWork(null)}>
                Keep my deal
              </button>
              <button
                type="button"
                className="btn primary grow"
                onClick={() => {
                  const next = work;
                  setWork(null);
                  setMoves(movesOf(next.legs));
                  toast(`Added ${dealAddsText(league, next.added)}.`, 'good');
                }}
              >
                Apply to builder
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <TeamSheet
        league={league}
        partner={picking === 'c' ? c : b}
        not={[picking === 'c' ? b : c]}
        open={picking !== null}
        onClose={() => setPicking(null)}
        onPick={(tid) => picking && swapTeam(picking, tid)}
        title={picking === 'c' ? 'Third team' : 'Second team'}
      />
    </>
  );
}
