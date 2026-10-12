// Contract offer / re-sign negotiation bottom sheet shared by Free Agents and Re-sign.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CircleCheck, Minus, Plus, TriangleAlert } from 'lucide-react';
import type { Player } from '../../core/types';
import { FREE_AGENT } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { CAP_FOR, payroll, playerName, rosterMaxNow, standardRoster } from '../../core/league/helpers';
import { MLE_YEARS, askingContract, makeContract, marketSalary, mleRoom, signingRoute, teamAppeal, willSign } from '../../core/league/contracts';
import { capHolds, signingClosedReason, userOffer, userResign } from '../../core/league/freeAgency';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { Avatar, Help, Sheet } from '../components/ui';
import { CapBar, Callout, MoodTag, OvrPot, Range, appealInfo, capSeason, fmtM, playerMeta, shortSeason } from './common';

export type OfferMode = 'fa' | 'resign';

export function ContractSheet({ pid, mode, onClose }: { pid: number | null; mode: OfferMode; onClose: () => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  const valid = !!p && (mode === 'fa' ? p.tid === FREE_AGENT : p.tid === league.userTid);
  return (
    <Sheet open={valid} onClose={onClose} label={p ? `${mode === 'fa' ? 'Offer to' : 'Re-sign'} ${playerName(p)}` : undefined}>
      {valid && p && <OfferBody key={p.pid} p={p} mode={mode} onClose={onClose} />}
    </Sheet>
  );
}

const STEP = 50;

function OfferBody({ p, mode, onClose }: { p: Player; mode: OfferMode; onClose: () => void }) {
  const league = useLeague();
  const tid = league.userTid;
  const season = mode === 'resign' ? league.season + 1 : capSeason(league);
  const cap = CAP_FOR(league, season);
  const ask = askingContract(league, p, tid);
  const minAmt = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const maxAmt = cap.maxContract(p.experience);
  const [amount, setAmount] = useState(() => clamp(Math.ceil(ask.amount / STEP) * STEP, minAmt, maxAmt));
  // a mid-level offer can run 4 years at most
  const [years, setYears] = useState(() => (mode === 'fa' && signingRoute(league, tid, amount, season, p) === 'mle' ? Math.min(ask.years, MLE_YEARS) : ask.years));
  const set = (v: number) => setAmount(clamp(v, minAmt, maxAmt));

  // smallest amount he accepts for the chosen length (binary search over willSign, which is monotone in amount);
  // his price moves with the league (interest, mood, price cuts), as the verdict below does
  const needed = useLeagueMemo(() => {
    if (!willSign(league, p, tid, maxAmt, years).ok) return null;
    let lo = minAmt;
    let hi = maxAmt;
    if (willSign(league, p, tid, lo, years).ok) return lo;
    while (hi - lo > STEP) {
      const mid = Math.round((lo + hi) / 2 / STEP) * STEP;
      if (mid <= lo || mid >= hi) break;
      if (willSign(league, p, tid, mid, years).ok) hi = mid;
      else lo = mid;
    }
    return hi;
  }, [league, p, tid, years, minAmt, maxAmt]);

  const verdict = willSign(league, p, tid, amount, years);
  const appeal = teamAppeal(league, tid, p);
  const ai = appealInfo(appeal);
  // his ask from you against a neutral team's: interest and the difficulty setting both move it
  const vsNeutral = Math.round((ask.amount / askingContract(league, p).amount - 1) * 100);
  const market = marketSalary(league, p);
  const pay = payroll(league, tid, season);
  const space = cap.salaryCap - pay;
  const isMin = amount <= cap.vetMin + 1;
  const after = pay + amount;
  // re-signing him clears his own cap hold; the other expiring players still hold their room
  const otherHolds = mode === 'resign' ? capHolds(league, tid).reduce((a, h) => a + (h.p.pid === p.pid ? 0 : h.amount), 0) : 0;
  const rosterN = standardRoster(league, tid).length;
  const rosterMax = rosterMaxNow(league);
  // signing windows: free agents in the preseason, regular season and free agency; own players in the re-sign period
  const closed = mode === 'fa' ? signingClosedReason(league) : league.phase !== 'resign' ? 'Re-signing happens between the draft and free agency.' : null;
  const rosterBlocked = mode === 'fa' && rosterN >= rosterMax;
  const route = signingRoute(league, tid, amount, season, p);
  const mle = mleRoom(league, tid, season);
  const capBlocked = mode === 'fa' && !route;
  const mleTooLong = mode === 'fa' && route === 'mle' && years > MLE_YEARS;
  const blocked = !!closed || rosterBlocked || capBlocked || mleTooLong;
  const contract = makeContract(league, amount, years, season);
  const total = contract.salaries.reduce((a, b) => a + b, 0);
  const taxBill = after > cap.luxuryTax ? (after - cap.luxuryTax) * CAP.taxRate : 0;

  const submit = () => {
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = mode === 'fa' ? userOffer(l, p.pid, amount, years) : userResign(l, p.pid, amount, years);
    });
    useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
    if (res.ok) onClose();
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 12 }}>
        <Avatar p={p} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="ellipsis" style={{ fontSize: 22 }}>
            {playerName(p)}
          </h2>
          <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
        </div>
        <OvrPot p={p} />
      </div>

      <div className="grid2">
        <div className="kpi">
          <span className="k">He's asking</span>
          <span className="v" style={{ fontSize: 21 }}>
            {fmtM(ask.amount, 2)}
          </span>
          <span className="tiny dim">
            {ask.years} yr{ask.years > 1 ? 's' : ''} · market {fmtM(market, 2)}
          </span>
        </div>
        <div className="kpi">
          <span className="k row" style={{ gap: 4 }}>
            {mode === 'fa' ? 'Interest' : 'Mood'}
            <Help title={mode === 'fa' ? 'Interest in your team' : 'Player mood'}>
              {mode === 'fa' ? (
                <>
                  <p style={{ margin: 0 }}>
                    Free agents weigh your <b>winning</b>, team <b>hype</b>, <b>market size</b> and how much <b>playing time</b> they'd get on your roster. Interested players give
                    you a discount; lukewarm ones want a premium.
                  </p>
                  <p style={{ margin: 0 }}>
                    Right now his price for you is {vsNeutral < 0 ? `${-vsNeutral}% below` : vsNeutral > 0 ? `${vsNeutral}% above` : 'about the same as'} what he'd ask a neutral
                    team.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}>
                    Mood reflects playing time vs. expectations, winning, his role and whether he feels fairly paid. Happy players give a hometown discount; unhappy ones want more.
                  </p>
                  <p style={{ margin: 0 }}>A player who has requested a trade will not re-sign.</p>
                </>
              )}
            </Help>
          </span>
          {mode === 'fa' ? (
            <span className="v" style={{ fontSize: 19, color: ai.color }}>
              {ai.label}
            </span>
          ) : (
            <span style={{ marginTop: 4 }}>
              <MoodTag p={p} />
            </span>
          )}
          <span className="tiny dim">{mode === 'fa' ? `Appeal ×${appeal.toFixed(2)}` : (p.mood.notes[0] ?? 'No complaints')}</span>
        </div>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="tiny dim upper bold">Per season</div>
            <div className="fo-big">{fmtM(amount, 2)}</div>
          </div>
          <div className="right">
            <div className="tiny dim upper bold">Total</div>
            <div className="fo-mid">{fmtM(total)}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="fo-stepper" aria-label="Lower by $50K" onClick={() => set(amount - STEP)}>
            <Minus size={16} />
          </button>
          <div className="grow">
            <Range label="Salary per season" value={amount} min={Math.floor(minAmt / STEP) * STEP} max={Math.floor(maxAmt / STEP) * STEP} step={STEP} onChange={set} />
          </div>
          <button className="fo-stepper" aria-label="Raise by $50K" onClick={() => set(amount + STEP)}>
            <Plus size={16} />
          </button>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={`chip ${amount === minAmt ? 'on' : ''}`} onClick={() => set(minAmt)}>
            Min {fmtM(minAmt, 2)}
          </button>
          {needed !== null && (
            <button className={`chip ${amount === needed ? 'on' : ''}`} onClick={() => set(needed)}>
              His price {fmtM(needed, 2)}
            </button>
          )}
          <button className={`chip ${amount === maxAmt ? 'on' : ''}`} onClick={() => set(maxAmt)}>
            Max {fmtM(maxAmt, 2)}
          </button>
        </div>
      </div>

      <div className="col" style={{ gap: 6 }}>
        <div className="tiny dim upper bold">Years</div>
        <div className="row" style={{ gap: 6 }}>
          {[1, 2, 3, 4, 5].map((y) => (
            <button key={y} className={`fo-yr ${years === y ? 'on' : ''}`} aria-pressed={years === y} onClick={() => setYears(y)}>
              {y}
              <small>{y === ask.years ? 'wants' : shortSeason(season + y - 1)}</small>
            </button>
          ))}
        </div>
        <div className="tiny dim">Runs through {seasonLabel(season + years - 1)} with 5% annual raises. Each year away from what he wants adds ~3% to his price.</div>
      </div>

      {closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>Signing is closed.</b> {closed}
        </Callout>
      )}
      {rosterBlocked && !closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>Your roster is full ({rosterMax}).</b> Release or trade someone from the Office first.
        </Callout>
      )}
      {mleTooLong && !closed && !rosterBlocked && (
        <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
          <b>Mid-level deals run {MLE_YEARS} years at most.</b> Offer {MLE_YEARS} years or fewer.
        </Callout>
      )}
      {capBlocked && !rosterBlocked && !closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <div className="row between" style={{ gap: 8 }}>
            <b>Not enough cap space.</b>
            <Help title="Why can't I sign him?">
              <p style={{ margin: 0 }}>
                The league uses a <b>soft cap</b> of {fmtM(cap.salaryCap)}. You can sign a free agent to any contract that fits under the cap: you have{' '}
                <b>{fmtM(Math.max(0, space))}</b> of room for {seasonLabel(season)}.
              </p>
              <p style={{ margin: 0 }}>
                Once you're over the cap you can still add players on <b>minimum contracts</b> (up to {fmtM(cap.vetMin, 2)} per season), as long as you have a roster spot.
              </p>
              <p style={{ margin: 0 }}>
                Once a season you can also use the <b>mid-level exception</b>: one signing over the cap, up to {MLE_YEARS} years, as long as it keeps you under the tax line (
                {fmtM(cap.luxuryTax)}), and for the rest of that season trades can't take you past it.{' '}
                {mle > 0 ? `You can offer up to ${fmtM(mle, 2)} with it now.` : "It isn't available to you right now."}
              </p>
              <p style={{ margin: 0 }}>
                To create space: trade salary away, let contracts expire, or release players (their remaining salary still counts against the cap as dead money).
              </p>
            </Help>
          </div>
          <div className="small dim2" style={{ marginTop: 2 }}>
            This offer would put you {fmtM(after - cap.salaryCap)} over the cap. Over the cap you can offer the minimum ({fmtM(minAmt, 2)})
            {mle > 0 ? ` or up to ${fmtM(mle, 2)} with your mid-level exception` : ''}.
          </div>
          <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
            {mle > cap.vetMin && (
              <button className="btn xs" onClick={() => (set(Math.floor(Math.min(mle, maxAmt) / STEP) * STEP), setYears(Math.min(years, MLE_YEARS)))}>
                Use the mid-level ({fmtM(mle, 2)})
              </button>
            )}
            <button className="btn xs" onClick={() => set(minAmt)}>
              Offer the minimum instead
            </button>
          </div>
          {ask.amount > cap.vetMin && (
            <div className="tiny dim" style={{ marginTop: 6 }}>
              He's asking {fmtM(ask.amount, 2)}, so he's unlikely to take a minimum deal.
            </div>
          )}
        </Callout>
      )}

      {!blocked &&
        (verdict.ok ? (
          <Callout tone="good" icon={<CircleCheck size={18} className="good" />}>
            <b>He'll sign at this number.</b>
            {needed !== null && amount > needed + 2 * STEP && <span className="dim2"> You could go as low as {fmtM(needed, 2)}.</span>}
          </Callout>
        ) : (
          <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
            {needed === null ? (
              <b>{verdict.reason}</b>
            ) : (
              <>
                <b>Not enough.</b> For {years} year{years > 1 ? 's' : ''} he wants at least <b>{fmtM(needed, 2)}</b> per season.
              </>
            )}
          </Callout>
        ))}

      {mode === 'fa' ? (
        <div className="card tight col" style={{ gap: 8 }}>
          <div className="row between">
            <div className="small bold">Cap impact · {seasonLabel(season)}</div>
            {isMin ? (
              <span className="tag good">Minimum deal</span>
            ) : route === 'mle' ? (
              <span className="tag info">Mid-level exception</span>
            ) : route === 'space' ? (
              <span className="tag">Uses cap space</span>
            ) : (
              <span className="tag bad">Over the cap</span>
            )}
          </div>
          <div className="grid2">
            <div>
              <div className="tiny dim upper bold">Space now</div>
              <div className="fo-mid" style={{ color: space >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                {fmtM(space)}
              </div>
            </div>
            <div>
              <div className="tiny dim upper bold">After signing</div>
              {/* over the cap is only a problem when no exception covers the signing */}
              <div className="fo-mid" style={{ color: cap.salaryCap - after >= 0 ? 'var(--good)' : isMin || route === 'mle' ? 'var(--warn)' : 'var(--bad)' }}>
                {fmtM(cap.salaryCap - after)}
              </div>
            </div>
          </div>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} />
          {isMin && after > cap.salaryCap && <div className="tiny dim">Minimum contracts (up to {fmtM(cap.vetMin, 2)}) can be signed even when you're over the cap.</div>}
          {route === 'mle' && <div className="tiny dim">Uses your mid-level exception: once a season, up to {MLE_YEARS} years, and it keeps you under the tax line.</div>}
        </div>
      ) : (
        <div className="card tight col" style={{ gap: 8 }}>
          <div className="row between">
            <div className="small bold">{seasonLabel(season)} payroll</div>
            <span className="tag info">Bird rights</span>
          </div>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} />
          <div className="tiny dim">
            You can go over the cap to keep your own players.
            {taxBill > 0 ? (
              <span className="bad">
                {' '}
                This puts you {fmtM(after - cap.luxuryTax)} over the tax line: about {fmtM(taxBill)} in luxury tax.
              </span>
            ) : after + otherHolds > cap.salaryCap ? (
              <>
                {' '}
                You'd be over the cap{otherHolds > 0 ? ' counting your other cap holds' : ''}, so in free agency you could only add players on minimum deals or with the mid-level
                exception.
              </>
            ) : (
              <>
                {' '}
                You'd still have {fmtM(cap.salaryCap - after - otherHolds)} of cap space{otherHolds > 0 ? ` after ${fmtM(otherHolds)} in other cap holds` : ''}.
              </>
            )}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <Link to={`/player/${p.pid}`} className="btn" onClick={onClose}>
          Profile
        </Link>
        <button className={`btn grow ${verdict.ok && !blocked ? 'primary' : ''}`} disabled={blocked} onClick={submit}>
          {mode === 'fa' ? 'Offer' : 'Re-sign'} {years} yr{years > 1 ? 's' : ''} · {fmtM(total)}
        </button>
      </div>
    </div>
  );
}
