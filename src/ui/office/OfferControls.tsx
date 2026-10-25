// The offer as the contract and extension sheets build it: the amount in scoreboard type with its
// total, a slider with steppers, the quick amounts (the minimum, his ask, the max), then the years.
// Against a stray drag: the slider stops at 1.5× his ask until widened, and an offer more than 10%
// over his ask says what he'd sign for.
import { useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Range, shortSeason } from './common';
import { money, moneyExact } from '../../core/format';

/** The salary steps the controls move in ($50K). */
export const STEP = 50;

export function OfferControls({
  amount,
  total,
  set,
  minAmt,
  maxAmt,
  askAt,
  years,
  setYears,
  yearsMax = 5,
  wants,
  firstSeason,
  yearDisabled,
  yearsNote,
  overAsk = true,
}: {
  amount: number;
  total: number;
  set: (v: number) => void;
  minAmt: number;
  maxAmt: number;
  askAt: number;
  years: number;
  setYears: (y: number) => void;
  yearsMax?: number;
  /** The length he wants. */
  wants: number;
  firstSeason: number;
  yearDisabled?: (y: number) => boolean;
  yearsNote: ReactNode;
  /** Warn when the offer runs more than 10% over his ask (off where paying more can win him: a top free agent's bid). */
  overAsk?: boolean;
}) {
  const [wide, setWide] = useState(false);
  const top = Math.floor(maxAmt / STEP) * STEP;
  // (a deliberate step past it, a quick amount or a figure from elsewhere widens it too)
  const near = Math.max(Math.ceil(minAmt / STEP) * STEP, Math.ceil((askAt * 1.5) / STEP) * STEP);
  const capped = !wide && near < top && amount <= near;
  const over = amount - askAt;
  return (
    <>
      <div className="fo-offer-amt">
        <div className="fo-offer-top">
          <div>
            <div className="over">Your offer · per season</div>
            <div className="fo-offer-v num">{moneyExact(amount)}</div>
          </div>
          <div className="right">
            <div className="over">Total</div>
            <div className="fo-offer-t num">{money(total)}</div>
          </div>
        </div>
        <div className="fo-offer-slide">
          <button className="fo-stepper" aria-label="Lower by $50K" onClick={() => set(amount - STEP)}>
            <Minus size={16} />
          </button>
          <div className="grow">
            <Range label="Salary per season" value={amount} min={Math.floor(minAmt / STEP) * STEP} max={capped ? near : top} step={STEP} onChange={set} />
          </div>
          <button className="fo-stepper" aria-label="Raise by $50K" onClick={() => set(amount + STEP)}>
            <Plus size={16} />
          </button>
        </div>
        <div className="fo-quick">
          <button className={`chip ${amount === minAmt ? 'on' : ''}`} onClick={() => set(minAmt)}>
            Min {moneyExact(minAmt)}
          </button>
          <button className={`chip ${amount === askAt ? 'on' : ''}`} onClick={() => set(askAt)}>
            His ask {moneyExact(askAt)}
          </button>
          <button className={`chip ${amount === maxAmt ? 'on' : ''}`} onClick={() => set(maxAmt)}>
            Max {moneyExact(maxAmt)}
          </button>
        </div>
        {overAsk && over > askAt * 0.1 ? (
          <div className="tiny warn num">
            {moneyExact(over)} over his ask: he&apos;d sign for {moneyExact(askAt)}.
          </div>
        ) : capped ? (
          <button className="btn text tiny" onClick={() => setWide(true)}>
            The slider stops at {moneyExact(near)}, 1.5× his ask: widen it
          </button>
        ) : null}
      </div>
      <div className="fo-years">
        <div className="over">Years</div>
        <div className="fo-yrs">
          {Array.from({ length: yearsMax }, (_, i) => i + 1).map((y) => (
            <button key={y} className={`fo-yr ${years === y ? 'on' : ''}`} aria-pressed={years === y} disabled={yearDisabled?.(y)} onClick={() => setYears(y)}>
              {y}
              <small>{y === wants ? 'wants' : shortSeason(firstSeason + y - 1)}</small>
            </button>
          ))}
        </div>
        <div className="tiny dim">{yearsNote}</div>
      </div>
    </>
  );
}
