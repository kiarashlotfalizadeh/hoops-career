// The contract sheet's extension mode: extending one of your players in the final season of his
// deal. The new deal starts the season after it ends, so the cap card is that season's, and the
// talks are on his extension ask (see TalkPanel and negotiation.ts).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Minus, Plus } from 'lucide-react';
import type { Player, TalkTerms } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { CAP_FOR, payroll, playerName } from '../../core/league/helpers';
import { extensionBlockedReason, extensionMaxYears, extensionRefusal, makeContract } from '../../core/league/contracts';
import { luxuryTaxBill, taxRepeater } from '../../core/league/finances';
import { type OfferResult, askFor, talkAsk, talkState, userExtend } from '../../core/league/negotiation';
import { contractExp, salaryFor } from '../../core/playerGen';
import { useLeague, useStore } from '../../state/store';
import { Avatar, Help } from '../components/ui';
import { CapBar, Callout, MoodTag, OvrPot, Range, fmtM, playerMeta, shortSeason } from './common';
import { type Reply, TalkPanel } from './TalkPanel';

const STEP = 50;

export function ExtendBody({ p, onClose }: { p: Player; onClose: () => void }) {
  const league = useLeague();
  const tid = league.userTid;
  const exp = contractExp(p.contract);
  // the extension's first season
  const season = exp + 1;
  const cap = CAP_FOR(league, season);
  const ask = talkAsk(league, p, 'extend');
  const maxYears = extensionMaxYears(p);
  const minAmt = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const maxAmt = cap.maxContract(p.experience);
  const [amount, setAmount] = useState(() => (ask.amount <= minAmt + 1 ? minAmt : clamp(Math.ceil(ask.amount / STEP) * STEP, minAmt, maxAmt)));
  const [years, setYears] = useState(ask.years);
  const [reply, setReply] = useState<Reply | null>(null);
  const set = (v: number) => setAmount(clamp(v, minAmt, maxAmt));

  const askAt = askFor(league, p, 'extend', years);
  const blocked = extensionBlockedReason(league, p);
  const refusal = extensionRefusal(league, p);
  const off = !!talkState(league, p, 'extend').closed;
  const pay = payroll(league, tid, season);
  const after = pay + amount;
  // by the luxury tax's brackets (at the repeater rates if the team would pay them that season)
  const taxBill = luxuryTaxBill(league, tid, after, season);
  const repeater = taxRepeater(league, tid, season);
  // as signed: each season at least his minimum
  const total = makeContract(league, amount, years, season, p.experience).salaries.reduce((a, b) => a + b, 0);

  const submit = (terms: TalkTerms = { amount, years }) => {
    let res: OfferResult = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = userExtend(l, p.pid, terms.amount, terms.years);
    });
    if (res.ok) {
      useStore.getState().toast(res.reason, 'good');
      onClose();
    } else setReply({ text: res.reason, tone: res.counter ? 'warn' : 'bad' });
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
              <p style={{ margin: 0 }}>
                Offer his ask and he signs; he may take a little less, and below that he counters. Run out his patience and he won't discuss an extension for 30 days.
              </p>
              <p style={{ margin: 0 }}>Up to {maxYears} years, no options. Like any signing, he can't be traded for a while afterwards.</p>
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
            <div className="tiny dim upper bold">Your offer · per season</div>
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
          <button className={`chip ${amount === askAt ? 'on' : ''}`} onClick={() => set(askAt)}>
            His ask {fmtM(askAt, 2)}
          </button>
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
      ) : (
        <TalkPanel
          p={p}
          kind="extend"
          season={season}
          amount={amount}
          years={years}
          reply={reply}
          counterBlocked={() => null}
          onAcceptCounter={(c) => (setAmount(c.amount), setYears(c.years), submit(c))}
        />
      )}

      <div className="card tight col" style={{ gap: 8 }}>
        <div className="row between">
          <div className="small bold">{seasonLabel(season)} payroll</div>
          <span className="tag info">Extension</span>
        </div>
        <CapBar pay={pay} lines={cap} add={amount} />
        <div className="tiny dim">
          What's committed for {seasonLabel(season)} so far, plus his extension against that season's cap. Like a re-signing, it can take you over the cap.
          {taxBill > 0 ? (
            <span className="bad">
              {' '}
              It puts you {fmtM(after - cap.luxuryTax)} over the tax line{after > cap.apron2 ? ' and past the second apron' : after > cap.apron1 ? ' and past the first apron' : ''}
              : about {fmtM(taxBill)} in luxury tax{repeater ? ' at repeater rates' : ''} as things stand.
            </span>
          ) : after > cap.salaryCap ? (
            ' You would be over the cap that season, so free agents only on minimum deals or with an exception.'
          ) : (
            ` That leaves ${fmtM(cap.salaryCap - after)} of cap space for now.`
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <Link to={`/player/${p.pid}`} className="btn" onClick={onClose}>
          Profile
        </Link>
        <button className={`btn grow ${!blocked && !refusal && !off ? 'primary' : ''}`} disabled={!!blocked || !!refusal || off} onClick={() => submit()}>
          Make offer · {years} yr{years > 1 ? 's' : ''} · {fmtM(total)}
        </button>
      </div>
    </div>
  );
}
