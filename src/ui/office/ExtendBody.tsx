// The contract sheet's extension mode: extending one of your players in the final season of his
// deal. The new deal starts the season after it ends, so the cap card is that season's, and his
// ask and his answer are the extension's (see contracts.ts).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CircleCheck, Minus, Plus, TriangleAlert } from 'lucide-react';
import type { Player } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { CAP_FOR, payroll, playerName } from '../../core/league/helpers';
import { extensionAsk, extensionBlockedReason, extensionMaxYears, extensionRefusal, makeContract, userExtend, willExtend } from '../../core/league/contracts';
import { contractExp, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { Avatar, Help } from '../components/ui';
import { CapBar, Callout, MoodTag, OvrPot, Range, fmtM, playerMeta, shortSeason } from './common';

const STEP = 50;

export function ExtendBody({ p, onClose }: { p: Player; onClose: () => void }) {
  const league = useLeague();
  const tid = league.userTid;
  const exp = contractExp(p.contract);
  // the extension's first season
  const season = exp + 1;
  const cap = CAP_FOR(league, season);
  const ask = extensionAsk(league, p);
  const maxYears = extensionMaxYears(p);
  const minAmt = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const maxAmt = cap.maxContract(p.experience);
  const [amount, setAmount] = useState(() => clamp(Math.ceil(ask.amount / STEP) * STEP, minAmt, maxAmt));
  const [years, setYears] = useState(ask.years);
  const set = (v: number) => setAmount(clamp(v, minAmt, maxAmt));

  // smallest amount he accepts for the chosen length (binary search over willExtend, which is monotone in amount)
  const needed = useLeagueMemo(() => {
    if (!willExtend(league, p, maxAmt, years).ok) return null;
    let lo = minAmt;
    let hi = maxAmt;
    if (willExtend(league, p, lo, years).ok) return lo;
    while (hi - lo > STEP) {
      const mid = Math.round((lo + hi) / 2 / STEP) * STEP;
      if (mid <= lo || mid >= hi) break;
      if (willExtend(league, p, mid, years).ok) hi = mid;
      else lo = mid;
    }
    return hi;
  }, [league, p, years, minAmt, maxAmt]);

  const blocked = extensionBlockedReason(league, p);
  const refusal = extensionRefusal(league, p);
  const verdict = willExtend(league, p, amount, years);
  const pay = payroll(league, tid, season);
  const after = pay + amount;
  const taxBill = after > cap.luxuryTax ? (after - cap.luxuryTax) * CAP.taxRate : 0;
  // as signed: each season at least his minimum
  const total = makeContract(league, amount, years, season, p.experience).salaries.reduce((a, b) => a + b, 0);

  const submit = () => {
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = userExtend(l, p.pid, amount, years);
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
      <div className="small dim2">
        Signed through {seasonLabel(exp)} at {fmtM(salaryFor(p, exp), 2)}. An extension starts in {seasonLabel(season)}.
      </div>

      <div className="grid2">
        <div className="kpi">
          <span className="k">He's asking</span>
          <span className="v" style={{ fontSize: 21 }}>
            {fmtM(ask.amount, 2)}
          </span>
          <span className="tiny dim">
            {ask.years} yr{ask.years > 1 ? 's' : ''} from {shortSeason(season)}
          </span>
        </div>
        <div className="kpi">
          <span className="k row" style={{ gap: 4 }}>
            Mood
            <Help title="Extensions">
              <p style={{ margin: 0 }}>
                In the final season of a player's deal you can extend him, any time from the re-sign period through the regular season. The extension starts when his current deal
                ends and, like a re-signing, can take you over the cap.
              </p>
              <p style={{ margin: 0 }}>
                He asks about his market value in {seasonLabel(season)} money: a little less coming off his rookie-scale deal or past 30 (security now), a little more as a young
                star. Happy players give a hometown discount. Unhappy ones won't talk, and a star on a team he doesn't fancy may want to test free agency instead: ask again and he
                gives the same answer until something changes.
              </p>
              <p style={{ margin: 0 }}>Up to {maxYears} years. Like any signing, he can't be traded for a while afterwards.</p>
            </Help>
          </span>
          <span style={{ marginTop: 4 }}>
            <MoodTag p={p} />
          </span>
          <span className="tiny dim">{p.mood.notes[0] ?? 'No complaints'}</span>
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
          {Array.from({ length: maxYears }, (_, i) => i + 1).map((y) => (
            <button key={y} className={`fo-yr ${years === y ? 'on' : ''}`} aria-pressed={years === y} onClick={() => setYears(y)}>
              {y}
              <small>{y === ask.years ? 'wants' : shortSeason(season + y - 1)}</small>
            </button>
          ))}
        </div>
        <div className="tiny dim">
          Runs {seasonLabel(season)} through {seasonLabel(season + years - 1)} with 5% annual raises. Each year away from what he wants adds ~3% to his price.
        </div>
      </div>

      {blocked ? (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>Can't extend him now.</b> {blocked}
        </Callout>
      ) : refusal ? (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>{refusal}</b> You keep his Bird rights: re-sign him in the re-sign period after his deal ends.
        </Callout>
      ) : verdict.ok ? (
        <Callout tone="good" icon={<CircleCheck size={18} className="good" />}>
          <b>He'll extend at this number.</b>
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
      )}

      <div className="card tight col" style={{ gap: 8 }}>
        <div className="row between">
          <div className="small bold">{seasonLabel(season)} payroll</div>
          <span className="tag info">Extension</span>
        </div>
        <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} />
        <div className="tiny dim">
          What's committed for {seasonLabel(season)} so far, plus his extension against that season's cap. Like a re-signing, it can take you over the cap.
          {taxBill > 0 ? (
            <span className="bad">
              {' '}
              It puts you {fmtM(after - cap.luxuryTax)} over the tax line: about {fmtM(taxBill)} in luxury tax as things stand.
            </span>
          ) : after > cap.salaryCap ? (
            ' You would be over the cap that season, so free agents only on minimum deals or with the mid-level exception.'
          ) : (
            ` That leaves ${fmtM(cap.salaryCap - after)} of cap space for now.`
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <Link to={`/player/${p.pid}`} className="btn" onClick={onClose}>
          Profile
        </Link>
        <button className={`btn grow ${verdict.ok && !blocked ? 'primary' : ''}`} disabled={!!blocked || !!refusal} onClick={submit}>
          Extend {years} yr{years > 1 ? 's' : ''} · {fmtM(total)}
        </button>
      </div>
    </div>
  );
}
