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
import { type OfferResult, askFor, talkAsk, talkState, userExtend } from '../../core/league/negotiation';
import { contractExp, salaryFor } from '../../core/playerGen';
import { useLeague, useStore } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { Statline } from '../components/ui';
import { CapBar, Callout, HelpSheet, OvrPot, PlayerHead, appealInfo, forYears, salaryText, shortSeason } from './common';
import { OfferControls, STEP } from './OfferControls';
import { type Reply, TalkPanel } from './TalkPanel';
import { money } from '../../core/format';

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
          {salaryText(league, salaryFor(p, exp))} in {shortSeason(exp)}, his last season · extension from {shortSeason(season)}
        </div>
      </PlayerHead>

      <div className="fo-ask">
        <Statline
          items={[
            {
              k: talkState(league, p, 'extend').firm ? 'His ask · firm' : 'His ask',
              v: money(askFor(league, p, 'extend', ask.years), 2),
              s: `${forYears(ask.years)} from ${shortSeason(season)}`,
            },
            {
              k: 'Interest',
              v: (
                <span className="fo-ask-word" style={{ color: ai.color }}>
                  {ai.label}
                </span>
              ),
              s: `appeal ×${appeal.toFixed(2)}`,
            },
          ]}
        />
        <HelpSheet title="Extensions">
          <p>
            In the final season of a player's deal you can extend him, from the re-sign period through the regular season. The extension starts when his deal ends and, like a
            re-signing, can take you over the cap.
          </p>
          <p>
            He asks about his market value in {seasonLabel(season)} money: a little less coming off his rookie deal or past 30 (security now), a little more as a young star. A star
            on a team he doesn't fancy may want to test free agency: he gives the same answer until something changes.
          </p>
          <p>Offer his ask and he signs; he may take a little less, and below that he counters. Run out his patience and he won't discuss an extension for 30 days.</p>
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
        yearsNote={`${shortSeason(season)} to ${shortSeason(season + years - 1)}, 8% raises. Each year off what he wants: about 3% on his price.`}
      />

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
        <button className={`btn grow ${!blocked && !refusal && !off ? 'primary' : ''}`} disabled={!!blocked || !!refusal || off || busy} onClick={() => submit()}>
          Make offer · {years} yr{years > 1 ? 's' : ''} · {money(total)}
        </button>
      </div>
    </div>
  );
}
