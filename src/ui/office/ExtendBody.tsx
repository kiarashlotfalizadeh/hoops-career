// The contract sheet's extension mode: extending one of your players in the final season of his
// deal. The new deal starts the season after it ends, so the cap card is that season's, and the
// talks are on his extension ask (see TalkPanel and negotiation.ts).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban } from 'lucide-react';
import type { Player, TalkTerms } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { CAP_FOR, payroll } from '../../core/league/helpers';
import { extensionBlockedReason, extensionMaxYears, extensionRefusal, makeContract, playerMax, teamAppeal } from '../../core/league/contracts';
import { teamTaxBill } from '../../core/league/finances';
import { YEAR_PREMIUM, type OfferResult, askFor, extensionFrozenReason, talkAsk, talkState, userExtend } from '../../core/league/negotiation';
import { contractExp, salaryFor } from '../../core/playerGen';
import { useLeague, useStore } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { Statline } from '../components/ui';
import { CapBar, Callout, HelpSheet, OvrPot, PlayerHead, appealInfo, forYears, salaryText, shortSeason } from './common';
import { OfferControls, STEP } from './OfferControls';
import { type Reply, TalkPanel } from './TalkPanel';
import { money, moneyExact } from '../../core/format';

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
  // (with the honors, his own team can pay him the Rose-rule max or the supermax: see playerMax)
  const maxAmt = playerMax(league, p, season, tid);
  const [amount, setAmount] = useState(() => (ask.amount <= minAmt + 1 ? minAmt : clamp(Math.ceil(ask.amount / STEP) * STEP, minAmt, maxAmt)));
  const [years, setYears] = useState(ask.years);
  const [reply, setReply] = useState<Reply | null>(null);
  const set = (v: number) => setAmount(clamp(v, minAmt, maxAmt));
  const busy = useBusy();

  const askAt = askFor(league, p, 'extend', years);
  const blocked = extensionBlockedReason(league, p);
  const refusal = extensionRefusal(league, p);
  // the owner's freeze: no raise on what he's paid now (past his minimum then)
  const frozenWhy = blocked || refusal ? null : extensionFrozenReason(league, p, amount);
  const frozenTop = Math.max(salaryFor(p, exp), minAmt);
  const off = !!talkState(league, p, 'extend').closed;
  const appeal = teamAppeal(league, tid, p);
  const ai = appealInfo(appeal);
  const pay = payroll(league, tid, season);
  const after = pay + amount;
  const taxBill = teamTaxBill(league, tid, after, season);
  // as signed: each season at least his minimum
  const total = makeContract(league, amount, years, season, p.experience, { raise: 0.08, max: maxAmt }).salaries.reduce((a, b) => a + b, 0);

  const submit = (terms: TalkTerms = { amount, years }) => {
    const res = settle<OfferResult>('The extension', (l) => userExtend(l, p.pid, terms.amount, terms.years), 'good', true);
    if (!res) return;
    if (res.ok) {
      useStore.getState().toast(res.reason, 'good');
      onClose();
    } else setReply({ text: res.reason, tone: res.counter ? 'warn' : 'bad' });
  };

  return (
    <div className="col fo-sheet fo-contract">
      <PlayerHead league={league} p={p} right={<OvrPot p={p} />}>
        <div className="fo-meta fo-wrap">
          {salaryText(league, salaryFor(p, exp))} in <span className="nowrap">{shortSeason(exp)}</span>, his last season · extension from{' '}
          <span className="nowrap">{shortSeason(season)}</span>
        </div>
      </PlayerHead>

      <div className="fo-ask">
        <Statline
          items={[
            {
              k: talkState(league, p, 'extend').firm ? 'His ask · firm' : 'His ask',
              v: moneyExact(askFor(league, p, 'extend', ask.years)),
              s: `${forYears(ask.years)} from ${shortSeason(season)}`,
            },
            {
              k: 'Interest',
              v: (
                <span className="fo-ask-word" style={{ color: ai.color }}>
                  {ai.label}
                </span>
              ),
            },
          ]}
        />
        <HelpSheet title="Extensions">
          <p>
            Extend a player in the final season of his deal, from the re-sign period through the regular season. The extension starts when his deal ends. Like a re-signing, it can
            take you over the cap.
          </p>
          <p>
            He asks about his market value in {seasonLabel(season)} money. Coming off his rookie deal or past 30, he asks a little less for the security. A young star asks a little
            more.
          </p>
          <p>His interest in your team moves his ask: the keener he is, the less he asks.</p>
          <p>A star on a team he doesn&apos;t fancy may want to test free agency. He gives the same answer until something changes.</p>
          <p>Offer his ask and he signs. He may take a little less, and below that he counters. Run out his patience and he won&apos;t talk extension for 30 days.</p>
          <p>Up to {maxYears} years, no options. Like any signing, he can't be traded for a while after.</p>
        </HelpSheet>
      </div>

      <OfferControls
        amount={amount}
        total={total}
        set={set}
        minAmt={minAmt}
        maxAmt={maxAmt}
        askAt={askAt}
        years={years}
        setYears={setYears}
        yearsMax={maxYears}
        wants={ask.years}
        firstSeason={season}
        yearsNote={`${shortSeason(season)} to ${shortSeason(season + years - 1)}, 8% raises. Each year off what he wants adds ${Math.round(YEAR_PREMIUM * 100)}% to his price.`}
      />

      {blocked ? (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>Can't extend him now.</b> {blocked}
        </Callout>
      ) : refusal ? (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>{refusal}</b> You keep his Bird rights. Re-sign him after his deal ends.
        </Callout>
      ) : (
        <TalkPanel
          p={p}
          kind="extend"
          season={season}
          amount={amount}
          years={years}
          reply={reply}
          counterBlocked={(c) => extensionFrozenReason(league, p, c.amount)}
          onAcceptCounter={(c) => (setAmount(c.amount), setYears(c.years), submit(c))}
        />
      )}

      {frozenWhy && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>{frozenWhy}</b>
          <div className="chips fo-callout-btns">
            <button className="btn xs" onClick={() => set(frozenTop)}>
              Offer {moneyExact(frozenTop)} instead
            </button>
          </div>
        </Callout>
      )}

      <section className="fo-capimpact" aria-label={`${shortSeason(season)} payroll`}>
        <div className="fo-capimpact-h">
          <span className="over">{shortSeason(season)} payroll</span>
          <span className="tag info">Extension</span>
        </div>
        <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} addLabel="This extension" />
        <div className="tiny dim">
          Committed for {shortSeason(season)} so far, plus his extension. Like a re-signing, it can go over the cap.
          {taxBill > 0 ? (
            <span className="bad">
              {' '}
              {money(after - cap.luxuryTax)} over the tax line: about {money(taxBill)} in tax as things stand.
            </span>
          ) : after > cap.salaryCap ? (
            ' Over the cap that season: free agents on minimum deals or an exception only.'
          ) : (
            ` Leaves ${money(cap.salaryCap - after)} of cap space for now.`
          )}
        </div>
      </section>

      <div className="fo-sheet-foot">
        <Link to={`/player/${p.pid}`} className="btn" onClick={onClose}>
          Profile
        </Link>
        <button
          className={`btn grow ${!blocked && !refusal && !off && !frozenWhy ? 'primary' : ''}`}
          disabled={!!blocked || !!refusal || off || !!frozenWhy || busy}
          onClick={() => submit()}
        >
          Make offer · {years} yr{years > 1 ? 's' : ''} · {money(total)}
        </button>
      </div>
    </div>
  );
}
