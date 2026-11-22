// Contract sheet shared by Free Agents and Re-sign: a negotiation with the player's agent (his
// ask up top, your offer, his counter, his patience; see TalkPanel), or for a top free agent in the
// summer an offer weighed against other teams' (BidPanel). Its extension mode (the Office, the
// player page and Re-sign) is in ExtendBody.tsx.
import { fills, hurts, movedNeedText, needCache, needLead, needMinutes, needMove, teamNeed } from '../../core/league/rosterNeed';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Scale, TriangleAlert } from 'lucide-react';
import type { Player, SigningRoute, TalkTerms } from '../../core/types';
import { FREE_AGENT } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { CAP_FOR, payroll, playerName, rosterMaxNow, shortName, standardRoster } from '../../core/league/helpers';
import { CAP } from '../../core/constants';
import {
  EXCEPTIONS,
  askingContract,
  exceptionAmount,
  exceptionRoom,
  birdTier,
  isException,
  marketSalary,
  maxYearsWith,
  playerMax,
  raiseWith,
  resignLimit,
  signingRoute,
  teamAppeal,
} from '../../core/league/contracts';
import {
  FA_YEARS,
  bidFloor,
  bidHolds,
  marqueeFA,
  offerBlockedReason,
  offerRoute,
  pendingBid,
  resignRoster,
  signingClosedReason,
  userBid,
  userExceptionRoom,
  userOffer,
  userResign,
} from '../../core/league/freeAgency';
import { PLAYER_OPTION, TEAM_OPTION, YEAR_PREMIUM, type OfferResult, type TalkKind, askFor, talkAsk, talkSalaries, talkState } from '../../core/league/negotiation';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { Segmented, Sheet, Statline } from '../components/ui';
import { CapBar, Callout, HelpSheet, OvrPot, PlayerHead, appealInfo, capRoomFig, capSeason, forYears, shortSeason, taxLine } from './common';
import { OfferControls, STEP } from './OfferControls';
import { ExtendBody } from './ExtendBody';
import { BidPanel } from './BidPanel';
import { type Reply, TalkPanel } from './TalkPanel';
import { compareHref, counterpart } from '../compare';
import { money, moneyExact } from '../../core/format';

export type OfferMode = 'fa' | 'resign' | 'extend';

export function ContractSheet({ pid, mode, onClose }: { pid: number | null; mode: OfferMode; onClose: () => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  const valid = !!p && (mode === 'fa' ? p.tid === FREE_AGENT : p.tid === league.userTid);
  const m = mode;
  return (
    <Sheet open={valid} onClose={onClose} label={p ? `${m === 'fa' ? 'Offer to' : m === 'extend' ? 'Extend' : 'Re-sign'} ${playerName(p)}` : undefined}>
      {valid && p && (m === 'extend' ? <ExtendBody key={p.pid} p={p} onClose={onClose} /> : <OfferBody key={p.pid} p={p} mode={m} onClose={onClose} />)}
    </Sheet>
  );
}

const yrs = (n: number) => `${n} yr${n > 1 ? 's' : ''}`;
type OptionChoice = 'none' | 'player' | 'team';

/** The route tag on the cap card: how the signing is paid for. */
const ROUTE_TAG: Record<SigningRoute, { label: string; tone: string }> = {
  min: { label: 'Minimum deal', tone: 'good' },
  space: { label: 'Cap space', tone: '' },
  mle: { label: 'Mid-level', tone: 'info' },
};

function OfferBody({ p, mode, onClose }: { p: Player; mode: Exclude<OfferMode, 'extend'>; onClose: () => void }) {
  const league = useLeague();
  const tid = league.userTid;
  const season = mode === 'resign' ? league.season + 1 : capSeason(league);
  const cap = CAP_FOR(league, season);
  // a top free agent in the summer weighs offers: the sheet opens on your pending one, and raising it replaces it
  const bidding = mode === 'fa' && marqueeFA(league, p);
  const bid = bidding ? pendingBid(league, p.pid) : undefined;
  const kind: TalkKind = mode === 'resign' ? 'resign' : 'fa';
  const mine = mode === 'fa' ? counterpart(league, p) : null;
  // the roster's need, and what he'd do to it (a free agent only: your own are already counted)
  const need = useLeagueMemo(() => {
    if (mode !== 'fa') return null;
    const cache = needCache(league);
    const n = teamNeed(league, cache);
    return n ? { ...needMove(league, n.id, [p.pid], [], cache), by: n.by, active: n.staff ? n.grade : undefined } : null;
  }, [league, p.pid, mode]);
  // his ask on his own terms (up after re-sign talks broke down)
  const ask = bidding ? askingContract(league, p, tid) : talkAsk(league, p, kind);
  const minAmt = p.experience >= 3 ? cap.vetMin : cap.minContract;
  // re-signing, what his Bird rights allow (and a bigger max he has earned with you); a free agent, his max
  const limit = mode === 'resign' ? resignLimit(league, p, tid) : null;
  const maxAmt = limit ?? playerMax(league, p, season);
  // he asks more than his Early Bird or non-Bird rights allow: no offer can re-sign him (see userResign),
  // so the sheet says so and shows his real ask, never one cut down to the limit
  const wants = mode === 'resign' ? askingContract(league, p, tid).amount : 0;
  const overRights = limit !== null && wants > limit;
  const yearsMax = mode === 'resign' ? maxYearsWith(league, p, tid) : FA_YEARS;
  // his raises as the deal is written (8% re-signing on Bird rights, 5% otherwise: see talkSalaries)
  const raise = mode === 'resign' ? raiseWith(league, p, tid) : 0.05;
  // (his minimum exactly when he asks it: a little more would no longer be a minimum deal)
  const [amount, setAmount] = useState(() => bid?.amount ?? (ask.amount <= minAmt + 1 ? minAmt : clamp(Math.ceil(ask.amount / STEP) * STEP, minAmt, maxAmt)));
  // an exception's deal is shorter: open on the longest the route allows
  const [years, setYears] = useState(() => {
    const route = mode === 'fa' ? offerRoute(league, p, amount, season) : null;
    return Math.max(1, bid?.years ?? (isException(route) ? Math.min(ask.years, EXCEPTIONS[route].years) : ask.years));
  });
  // an option on the final season: on a deal of two years or more, not on a top free agent's bid
  const optionsOk = !bidding;
  const [optChoice, setOptChoice] = useState<OptionChoice>('none');
  const option = optionsOk && years >= 2 && optChoice !== 'none' ? optChoice : undefined;
  const [reply, setReply] = useState<Reply | null>(null);
  const set = (v: number) => setAmount(clamp(v, minAmt, maxAmt));
  const busy = useBusy();

  const askAt = bidding ? Math.min(maxAmt, Math.ceil((ask.amount * (1 + Math.abs(years - ask.years) * 0.03)) / STEP) * STEP) : askFor(league, p, kind, years, option);
  // his ask on his own terms as it can be signed (in $50K steps): the figure up top and the "His ask" chip agree
  const askOwn = overRights ? wants : bidding ? Math.min(maxAmt, Math.ceil(ask.amount / STEP) * STEP) : askFor(league, p, kind, ask.years);
  const talks = bidding ? null : talkState(league, p, kind);
  const appeal = teamAppeal(league, tid, p);
  const ai = appealInfo(appeal);
  // his ask from you against a neutral team's: his interest in the team moves it
  const vsNeutral = Math.round((askingContract(league, p, tid).amount / askingContract(league, p).amount - 1) * 100);
  const market = marketSalary(league, p);
  // your other pending offers on cap space hold their room
  const held = mode === 'fa' ? bidHolds(league, p.pid) : 0;
  const pay = payroll(league, tid, season) + held;
  const space = cap.salaryCap - pay;
  const after = pay + amount;
  // re-signing counts next season's contracts: the other expiring deals are leaving or re-signing too
  const pendingN = mode === 'fa' ? (league.faBids ?? []).filter((b) => b.pid !== p.pid).length : 0;
  const rosterN = mode === 'resign' ? resignRoster(league) : standardRoster(league, tid).length + pendingN;
  const rosterMax = rosterMaxNow(league);
  // signing windows: free agents in the preseason, regular season and free agency; own players in the re-sign period
  const closed = mode === 'fa' ? signingClosedReason(league) : league.phase !== 'resign' ? 'Re-signing happens between the draft and free agency.' : null;
  const rosterBlocked = rosterN >= rosterMax;
  const route = mode === 'fa' ? offerRoute(league, p, amount, season, years) : signingRoute(league, tid, amount, season, p);
  // covered by the mid-level, but not for this long
  const tooLong = mode === 'fa' && !route && isException(offerRoute(league, p, amount, season)) ? offerBlockedReason(league, p, amount, years) : null;
  const capBlocked = mode === 'fa' && !route && !tooLong;
  // what the mid-level can still pay him
  const mleOpen = mode === 'fa' ? userExceptionRoom(league, 'mle', season, p.pid) : exceptionRoom(league, tid, 'mle', season);
  const floor = bidding ? bidFloor(league, p, years) : 0;
  const talksOff = !!talks?.closed;
  const blocked = !!closed || rosterBlocked || capBlocked || !!tooLong || amount < floor || talksOff || overRights;
  // as signed: each season at least his minimum
  const total = talkSalaries(league, p, kind, amount, years).reduce((a, b) => a + b, 0);
  // what this deal does to the luxury tax: the bill with him against the bill without
  const tax = taxLine(league, pay, after, season);

  /** Why his counter can't be signed as it stands (the window, the roster, the cap), or null. */
  const counterBlocked = (c: TalkTerms): string | null =>
    mode === 'fa'
      ? (signingClosedReason(league) ?? offerBlockedReason(league, p, c.amount, c.years))
      : (closed ?? (rosterBlocked ? `Your offseason roster is full, at ${rosterMax}.` : null));

  /** His counter's payroll line on its own terms (the cap section below follows the slider's offer). */
  const counterImpact = (c: TalkTerms) =>
    taxLine(league, pay, pay + c.amount, season) ??
    (mode === 'fa'
      ? { text: `${cap.salaryCap - pay - c.amount >= 0 ? 'cap space' : 'over the cap by'} ${money(Math.abs(cap.salaryCap - pay - c.amount))} after`, tone: 'dim' }
      : { text: `${shortSeason(season)} payroll ${money(pay + c.amount)}`, tone: 'dim' });

  const submit = (terms: TalkTerms = { amount, years, option }) => {
    // a refused offer still counts in the talks (his patience): only the answer differs
    const res = settle<OfferResult>(
      mode === 'fa' ? (bidding ? 'Your offer' : 'The signing') : 'The re-signing',
      (l) =>
        mode === 'fa'
          ? bidding
            ? userBid(l, p.pid, terms.amount, terms.years)
            : userOffer(l, p.pid, terms.amount, terms.years, { option: terms.option })
          : userResign(l, p.pid, terms.amount, terms.years, { option: terms.option }),
      'good',
      true,
    );
    if (!res) return;
    if (res.ok) {
      const now = useStore.getState().league;
      useStore.getState().toast(`${res.reason}${now ? movedNeedText(now) : ''}`, 'good');
      onClose();
    } else if (bidding) useStore.getState().toast(res.reason, 'bad');
    else setReply({ text: res.reason, tone: res.counter ? 'warn' : 'bad' });
  };
  const acceptCounter = (c: TalkTerms) => {
    setAmount(c.amount);
    setYears(c.years);
    setOptChoice(c.option ?? 'none');
    submit(c);
  };

  return (
    <div className="col fo-sheet fo-contract">
      <PlayerHead league={league} p={p} right={<OvrPot p={p} />}>
        {/* a free agent weighed against your own player at his position */}
        {mode === 'fa' && (
          <Link to={compareHref(p.pid, mine?.pid)} className="btn xs fo-compare" onClick={onClose}>
            <Scale size={13} /> <span className="ellipsis">{mine ? `Compare with ${shortName(league, mine)}` : 'Compare'}</span>
          </Link>
        )}
      </PlayerHead>

      <div className="fo-ask">
        <Statline
          items={[
            { k: talks?.firm ? 'His ask · firm' : 'His ask', v: moneyExact(askOwn), s: `${forYears(ask.years)} · market ${money(market, 1)}` },
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
        <HelpSheet title="Interest in your team">
          <p>
            Players weigh your <b>winning</b>, team <b>hype</b>, <b>market size</b> and the <b>playing time</b> they&apos;d get. Interested players give you a discount. Lukewarm
            ones want a premium. A lowball costs some of his interest for the season.
          </p>
          <p>{vsNeutral < 0 ? "He'd take less to play for you." : vsNeutral > 0 ? "He'd want more to play for you." : "He'd ask you about what he'd ask anyone."}</p>
        </HelpSheet>
      </div>

      {!overRights && (
        <OfferControls
          amount={amount}
          total={total}
          set={set}
          minAmt={minAmt}
          maxAmt={maxAmt}
          askAt={askAt}
          years={years}
          setYears={setYears}
          wants={ask.years}
          firstSeason={season}
          overAsk={!bidding}
          yearsMax={yearsMax}
          yearsNote={
            <>
              Through {shortSeason(season + years - 1)}, {Math.round(raise * 100)}% raises. Each year off what he wants adds {Math.round(YEAR_PREMIUM * 100)}% to his price.
              {mode === 'resign' && birdTier(league, p) !== 'full'
                ? ` ${birdTier(league, p) === 'early' ? 'Early Bird rights' : 'Without full Bird rights'}: up to ${money(maxAmt)}, ${yearsMax} years.`
                : ''}
            </>
          }
        />
      )}

      {overRights && !closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>
            He wants {moneyExact(wants)}. Your {birdTier(league, p) === 'early' ? 'Early Bird' : 'non-Bird'} rights allow {moneyExact(maxAmt)}.
          </b>{' '}
          He goes to free agency, where cap space or your mid-level can still sign him.
          <div className="tiny dim">
            {birdTier(league, p) === 'early'
              ? 'Early Bird rights, after two seasons with you, pay up to 175% of his salary. Or 105% of the league average, if more.'
              : 'Non-Bird rights, after a season with you, pay up to 120% of his salary.'}
          </div>
        </Callout>
      )}

      {optionsOk && !overRights && (
        <div className="fo-years">
          <div className="over">Option on {years >= 2 ? shortSeason(season + years - 1) : 'the last season'}</div>
          <Segmented
            label="Option on the final season"
            value={years >= 2 ? optChoice : 'none'}
            onChange={setOptChoice}
            disabled={years < 2}
            options={[
              { id: 'none', label: 'None' },
              { id: 'player', label: 'Player option' },
              { id: 'team', label: 'Team option' },
            ]}
          />
          <div className="tiny dim">
            {years < 2
              ? 'Options need two years or more.'
              : `Player option, his call: ${Math.round(PLAYER_OPTION * 100)}% off his price. Team option, yours: ${Math.round(TEAM_OPTION * 100)}% more.`}
          </div>
        </div>
      )}

      {closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>Signing is closed.</b> {closed}
        </Callout>
      )}
      {rosterBlocked && !closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>{rosterMax > CAP.rosterMax ? `Offseason roster full at ${rosterMax}.` : `Roster full at ${rosterMax}.`}</b>{' '}
          {pendingN > 0 ? (
            `That counts ${pendingN} pending offer${pendingN > 1 ? 's' : ''}. Withdraw one, or release or trade someone.`
          ) : (
            <>
              Release or trade someone first:{' '}
              <Link to="/team?view=contracts" onClick={onClose}>
                Team → Contracts
              </Link>
            </>
          )}
        </Callout>
      )}
      {tooLong && !closed && !rosterBlocked && (
        <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
          <b>{tooLong}</b> Offer fewer years.
        </Callout>
      )}
      {capBlocked && !rosterBlocked && !closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <div className="row between">
            <b>This offer doesn't fit under the cap.</b>
            <HelpSheet title="Why can't I sign him?">
              <p>
                The <b>soft cap</b> is {money(cap.salaryCap)}. A free agent signs to any contract that fits under it. You have <b>{money(Math.max(0, space))}</b> of room for{' '}
                {seasonLabel(season)}.
              </p>
              <p>
                Over the cap, players still sign <b>minimum contracts</b> with a roster spot. His is {moneyExact(minAmt)} a season.
              </p>
              <p>
                Over the cap, your <b>mid-level exception</b> pays for one signing a season: up to {money(exceptionAmount(league, 'mle', season))} for {EXCEPTIONS.mle.years} years.
              </p>
              <p>To make space, trade salary away, let contracts expire, or release players. What they&apos;re owed still counts as dead money.</p>
            </HelpSheet>
          </div>
          <div className="small">{offerBlockedReason(league, p, amount, years) ?? `This offer puts you ${money(after - cap.salaryCap)} over the cap.`}</div>
          <div className="chips fo-callout-btns">
            {mleOpen > cap.vetMin && (
              <button className="btn xs" onClick={() => (set(Math.floor(Math.min(mleOpen, maxAmt) / STEP) * STEP), setYears(Math.max(1, Math.min(years, EXCEPTIONS.mle.years))))}>
                Use the mid-level · {moneyExact(mleOpen)}
              </button>
            )}
            <button className="btn xs" onClick={() => set(minAmt)}>
              Offer the minimum instead
            </button>
          </div>
          {ask.amount > minAmt && <div className="tiny dim">He asks {moneyExact(ask.amount)}: a minimum deal is unlikely.</div>}
        </Callout>
      )}

      {bidding && !closed && !rosterBlocked && !capBlocked && !tooLong && <BidPanel p={p} amount={amount} years={years} floor={floor} onAmount={set} />}

      {need && (
        <div className={`tiny ${fills(need) ? 'good' : hurts(need) ? 'warn' : 'dim'}`}>
          {needLead(need)}, {need.label.toLowerCase()}:{' '}
          {fills(need)
            ? `${need.from} → ${need.to} with him${needMinutes(need)} (staff's minutes).`
            : hurts(need)
              ? `${need.from} → ${need.to} with him${needMinutes(need)} (staff's minutes): he'd make it worse.`
              : `still ${need.to} with him${needMinutes(need)} (staff's minutes): he doesn't fill it.`}
          {need.active ? ` With your rotation now: ${need.active}.` : ''}
        </div>
      )}

      {/* (a player who takes the minimum on these terms has nothing to talk about) */}
      {!bidding && !closed && !overRights && (askAt > minAmt + 1 || !!reply || !!talks?.counter || !!talks?.closed) && (
        <TalkPanel
          p={p}
          kind={kind}
          amount={amount}
          years={years}
          option={option}
          reply={reply}
          counterBlocked={counterBlocked}
          impact={counterImpact}
          onAcceptCounter={acceptCounter}
        />
      )}

      {mode === 'fa' ? (
        <section className="fo-capimpact" aria-label="Cap impact">
          <div className="fo-capimpact-h">
            <span className="over">Cap impact · {shortSeason(season)}</span>
            {route ? <span className={`tag ${ROUTE_TAG[route].tone}`}>{ROUTE_TAG[route].label}</span> : <span className="tag bad">Over the cap</span>}
          </div>
          <Statline
            items={[
              { ...capRoomFig(space), k: space >= 0 ? 'Cap space now' : 'Over the cap now' },
              {
                k: `${cap.salaryCap - after >= 0 ? 'Cap space' : 'Over the cap'} ${bidding ? 'if he signs' : 'after'}`,
                v: money(Math.abs(cap.salaryCap - after)),
                // over the cap is only a problem when no exception covers the signing
                color: cap.salaryCap - after >= 0 ? 'var(--good)' : route === 'min' || isException(route) ? 'var(--warn)' : 'var(--bad)',
              },
            ]}
          />
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} addLabel="This offer" />
          <div className="tiny dim">
            {route === 'min' && after > cap.salaryCap
              ? `Minimum deals sign over the cap: up to ${moneyExact(minAmt)} for him.`
              : route === 'mle'
                ? `Your mid-level: one signing a season, up to ${EXCEPTIONS.mle.years} years.`
                : ''}
            {held > 0 ? ` Counts ${money(held)} held for your other pending offers.` : ''}
          </div>
          {tax && <div className={`tiny num ${tax.tone}`}>{tax.text}</div>}
        </section>
      ) : overRights ? null : (
        <section className="fo-capimpact" aria-label={`${shortSeason(season)} payroll`}>
          <div className="fo-capimpact-h">
            <span className="over">{shortSeason(season)} payroll</span>
            <span className="tag info">Bird rights</span>
          </div>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} addLabel="This deal" />
          <div className="tiny dim">
            Over the cap is fine for your own players.
            {tax ? (
              <span className={tax.tone}> {tax.text}.</span>
            ) : after > cap.salaryCap ? (
              ' Over the cap: in free agency, minimum deals or your mid-level only.'
            ) : (
              ` Leaves ${money(cap.salaryCap - after)} of cap space.`
            )}
          </div>
        </section>
      )}

      <div className="fo-sheet-foot">
        <Link to={`/player/${p.pid}`} className="btn" onClick={onClose}>
          Profile
        </Link>
        <button className={`btn grow ${!blocked ? 'primary' : ''}`} disabled={blocked || busy} onClick={() => submit()}>
          {overRights ? 'No offer can re-sign him' : `${bidding ? (bid ? 'Update offer' : 'Submit offer') : 'Make offer'} · ${yrs(years)} · ${money(total)}`}
        </button>
      </div>
    </div>
  );
}
