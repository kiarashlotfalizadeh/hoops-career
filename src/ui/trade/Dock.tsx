// The dock: their GM's live reaction to the deal (the verdict, how much of the value they give up
// you cover, his reasons), what it does to your cap and both rosters, always in view, and the
// buttons (make it work, propose, force in god mode).
import { useState } from 'react';
import { ChevronDown, Handshake, Zap } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP_FOR, inSeason, payroll, rosterMaxNow } from '../../core/league/helpers';
import { capPayroll, withHoldsMemo } from '../../core/league/freeAgency';
import { TRADE_WAIVE_MAX, capSalary, salaryMatchGap, tradeRoster, valueVerdict, type TradeEval, type TradeOffer } from '../../core/league/trades';
import { canMakeWork } from '../../core/league/tradeHelp';
import { brokenLinks } from '../../core/analysis/system';
import { LINK_META } from '../../core/sim/links';
import { useLeagueMemo, useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Term } from '../components/Glossary';
import { TradeNotes } from './common';
import { useDockHeight } from '../office/common';
import { TermsList } from './Terms';
import { type EditCheck } from '../../core/league/godMode';
import { money } from '../../core/format';

/**
 * Their reaction as the meter shows it: how much of the value they'd give up your side covers
 * (`pct`), and the words for it. Value that's there but blocked (the rules, too many firsts) fills
 * the meter short of a deal.
 */
function reaction(ev: TradeEval): { pct: number; label: string; color: string; figure: string } {
  if (ev.accept) return { pct: 100, label: ev.delta > Math.abs(ev.valueOut) * 0.25 ? "They'd jump at it" : "They'd take it", color: 'var(--good)', figure: 'Deal' };
  // the AI's own verdict on how far the value is from enough
  const { gap: rel, label } = valueVerdict(ev);
  const pct = Math.max(4, Math.min(94, (1 - rel) * 100));
  if (ev.delta >= 0)
    return ev.ok
      ? { pct: 94, label: ev.message, color: 'var(--warn)', figure: 'Value there' }
      : // the value works for them, but a rule stops the deal (the reason is under the figures)
        { pct: 100, label: 'The value works for them', color: 'var(--warn)', figure: 'Blocked' };
  return { pct, label, color: rel > 0.6 ? 'var(--bad)' : rel > 0.25 ? 'var(--warn)' : 'var(--tier-elite)', figure: `${Math.round(pct)}% of ask` };
}

/** Whether the dock's details are folded away (kept for the session, across deals and partners); folded until it's first tapped: the verdict and the buttons are what it's for. */
let folded: boolean | null = null;

export function Dock({
  league,
  offer,
  ev,
  empty,
  season,
  onPropose,
  onWork,
  force,
  onForce,
}: {
  league: League;
  offer: TradeOffer;
  ev: TradeEval | null;
  empty: boolean;
  season: number;
  onPropose: () => void;
  onWork: () => void;
  /** God mode is on: what stops the deal being forced (null when it's off). */
  force: EditCheck | null;
  onForce: () => void;
}) {
  const user = league.userTid;
  // god-mode edits wait while a sim runs, a forced trade too
  const simming = useStore((s) => !!s.sim);
  const cap = CAP_FOR(league, season);
  const key = JSON.stringify(offer);
  // in the summer each team's cap holds replay its re-signing plan: work them out once per offer, not every render
  const capView = useLeagueMemo(
    () =>
      withHoldsMemo(() => ({
        capPay: capPayroll(league, user, season),
        theyreOver: !empty && salaryMatchGap(league, offer, 'b') > 0,
        workable: !empty && canMakeWork(league, offer),
        // the partnerships your rotation loses with the players going out (see sim/links.ts)
        broken: empty ? [] : brokenLinks(league, user, offer.a.pids).slice(0, 2),
      })),
    // key stands for the offer (a new object every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, user, season, empty, key],
  );
  // two-way pay sits outside the cap: it neither counts nor matches
  const out = offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, season), 0);
  const inc = offer.b.pids.reduce((a, pid) => a + capSalary(league, pid, season), 0);
  // between the season and free agency your payroll counts the cap holds of the players you'd re-sign
  const holds = capView.capPay - payroll(league, user, season);
  const after = capView.capPay - out + inc;
  // standard roster spots (two-way players don't count)
  const std = (pids: number[]) => pids.filter((pid) => !league.players[pid]?.contract.twoWay).length;
  // after the season, only next season's contracts count (expiring deals are leaving)
  const rosterAfter = tradeRoster(league, user).length - std(offer.a.pids) + std(offer.b.pids);
  const theirAfter = tradeRoster(league, offer.b.tid).length - std(offer.b.pids) + std(offer.a.pids);
  const maxSize = rosterMaxNow(league);
  const [fold, setFold] = useState(() => folded ?? true);
  const [ruleOpen, setRuleOpen] = useState(false);
  // the dock's height, for toasts to rise above it rather than cover its verdict
  const ref = useDockHeight<HTMLDivElement>(!empty && !!ev);
  const waives = inSeason(league) && theirAfter - maxSize <= TRADE_WAIVE_MAX;
  // (an empty deal says how to start one itself: the dock arrives with the first asset)
  if (empty || !ev) return null;
  const r = reaction(ev);
  const ruleErrors = ev.errors.filter((e) => !/empty/i.test(e));
  // the helper can fix either side's salary matching, a full roster and the value, nothing else
  const theyreOver = capView.theyreOver;
  const fixable = !ev.accept && capView.workable;
  const abbrev = league.teams[offer.b.tid].abbrev;
  return (
    <div ref={ref} className={`fo-dock ${fold ? 'folded' : ''}`} style={{ ['--react' as string]: r.color }}>
      <button
        className="fo-dock-top"
        aria-expanded={!fold}
        onClick={() => {
          folded = !fold;
          setFold(!fold);
        }}
      >
        <TeamLogo tid={offer.b.tid} size={22} decorative />
        {/* (keyed: a new verdict fades in, their GM reacting) */}
        <span className="fo-dock-says" aria-live="polite">
          <span className="fo-react" key={r.label}>
            <span className="sr-only">{abbrev}: </span>
            {r.label}
          </span>
        </span>
        <span className="fo-dock-pct num">
          <span className="fo-react" key={r.figure}>
            {r.figure}
          </span>
        </span>
        <ChevronDown size={16} className="fo-dock-fold" aria-hidden="true" />
        <span className="sr-only">{fold ? 'Show the details' : 'Hide the details'}</span>
      </button>
      <div className="fo-meter" aria-hidden="true">
        <i style={{ width: `${r.pct}%` }} />
      </div>
      {!fold && (
        <>
          {/* their two main reasons (one when a rule problem already needs the room) */}
          {ev.notes.length > 0 && <TradeNotes notes={ev.notes.slice(0, ruleErrors.length ? 1 : 2)} />}
          {/* what each protection and swap does, a line each (the cash shows in its own control) */}
          <TermsList league={league} offer={offer} short />
          {capView.broken.length > 0 && (
            <div className="fo-dock-links tiny">
              <Term id="partnership">Breaks</Term>{' '}
              {capView.broken.map((l, i) => (
                <span key={`${l.id}-${l.a}-${l.b}`}>
                  {i > 0 && ', '}
                  {league.players[l.a]?.lastName} → {league.players[l.b]?.lastName} ({LINK_META[l.id].label.toLowerCase()})
                </span>
              ))}
            </div>
          )}
          <div className="statline fo-dock-figs">
            <div>
              <div className="k">
                <Term id="matching">Salary out · in</Term>
              </div>
              <div className="v num">
                {money(out)} · {money(inc)}
              </div>
            </div>
            <div>
              <div className="k">Payroll after</div>
              <div className="v num" style={{ color: after > cap.luxuryTax ? 'var(--bad)' : after > cap.salaryCap ? 'var(--warn)' : 'var(--good)' }}>
                {money(after)}
              </div>
              <div className="s num">
                {after > cap.secondApron
                  ? `${money(after - cap.secondApron)} over the 2nd apron`
                  : after > cap.firstApron
                    ? `${money(after - cap.firstApron)} over the 1st apron`
                    : after > cap.luxuryTax
                      ? `${money(after - cap.luxuryTax)} over the tax`
                      : after > cap.salaryCap
                        ? `${money(after - cap.salaryCap)} over the cap`
                        : `${money(cap.salaryCap - after)} cap space`}
                {holds > 0 ? `, incl. ${money(holds)} holds` : ''}
              </div>
            </div>
            <div>
              <div className="k">Rosters</div>
              <div className="v num" style={{ color: rosterAfter > maxSize || (theirAfter > maxSize && !waives) ? 'var(--bad)' : undefined }}>
                {rosterAfter} · {theirAfter}
              </div>
              {/* (in season an AI team waives its end of the bench to make room) */}
              <div className="s">{waives && theirAfter > maxSize ? `${abbrev} would waive ${theirAfter - maxSize}` : `you · ${abbrev}`}</div>
            </div>
          </div>
        </>
      )}
      {ruleErrors.length > 0 && (
        // the first rule the deal breaks, cut to two lines until tapped (then every one)
        <button className={`fo-dock-rule ${ruleOpen ? 'open' : ''}`} aria-expanded={ruleOpen} onClick={() => setRuleOpen(!ruleOpen)}>
          <span className="tag bad">Not allowed</span>
          {ruleOpen ? (
            <span className="col">
              {ruleErrors.map((e) => (
                <span key={e}>{e}</span>
              ))}
            </span>
          ) : (
            <span className="fo-dock-rule-t">
              {ruleErrors[0]}
              {ruleErrors.length > 1 ? ` (+${ruleErrors.length - 1} more)` : ''}
            </span>
          )}
        </button>
      )}
      <div className="fo-dock-btns">
        <button className="btn sm grow" disabled={!fixable} onClick={onWork}>
          {theyreOver && !fixable ? "They can't absorb that salary" : 'What would make this work?'}
        </button>
        <button className={`btn sm ${ev.accept ? 'good' : 'primary'}`} disabled={!ev.ok} onClick={onPropose}>
          <Handshake size={16} /> Propose
        </button>
      </div>
      {force && (
        <div className="col fo-dock-force">
          <button className="btn sm block" disabled={force.errors.length > 0 || simming} onClick={onForce}>
            <Zap size={16} /> Force this trade
          </button>
          {/* (the plain explanation stays in the help: only an error, a warning or a wait shows here) */}
          {(force.errors.length > 0 || force.warnings.length > 0 || simming) && (
            <span className={`tiny ${force.errors.length ? 'bad' : 'warn'}`}>
              {force.errors[0] ?? (simming ? 'The simulation is running: a forced trade waits for it to stop.' : force.warnings[0])}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
