// Contract sheet shared by Free Agents and Re-sign: a negotiation with the player's agent (his
// ask up top, your offer, his counter, his patience; see TalkPanel), or for a top free agent in the
// summer an offer weighed against other teams' (BidPanel). Its extension mode (the Office, the
// player page and Re-sign) is in ExtendBody.tsx.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Scale, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { Player, SigningRoute, TalkTerms } from '../../core/types';
import { FREE_AGENT } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { CAP_FOR, payroll, playerName, rosterMaxNow, shortName, standardRoster } from '../../core/league/helpers';
import {
  EXCEPTIONS,
  EXCEPTION_ORDER,
  type Exception,
  askingContract,
  exceptionAmount,
  exceptionRoom,
  birdTier,
  isException,
  makeContract,
  marketHolds,
  marketSalary,
  maxYearsWith,
  playerMax,
  raiseWith,
  resignLimit,
  signingRoute,
  teamAppeal,
} from '../../core/league/contracts';
import { SHEET_MAX_YEARS, SHEET_MIN_YEARS, deadlineLabel, matchDeadline, pendingSheets, sheetBlockedReason } from '../../core/league/rfa';
import {
  FA_YEARS,
  bidFloor,
  bidHolds,
  capHolds,
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
import { type OfferResult, type TalkKind, askFor, talkAsk, talkState } from '../../core/league/negotiation';
import { useLeague, useStore } from '../../state/store';
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
  // the user's restricted free agent is re-signed with Bird rights, from the free-agent list too
  const ownRfa = !!p && p.tid === FREE_AGENT && p.rfa?.tid === league.userTid;
  const m: OfferMode = mode === 'fa' && ownRfa ? 'resign' : mode;
  const valid = !!p && (m === 'fa' ? p.tid === FREE_AGENT : p.tid === league.userTid || (m === 'resign' && ownRfa));
  return (
    <Sheet
      open={valid}
      onClose={onClose}
      label={p ? `${m === 'fa' ? (p.rfa ? 'Offer sheet for' : 'Offer to') : m === 'extend' ? 'Extend' : 'Re-sign'} ${playerName(p)}` : undefined}
    >
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
  tmle: { label: 'Taxpayer mid-level', tone: 'info' },
  room: { label: 'Room exception', tone: 'info' },
  bae: { label: 'Bi-annual', tone: 'info' },
};

function OfferBody({ p, mode, onClose }: { p: Player; mode: Exclude<OfferMode, 'extend'>; onClose: () => void }) {
  const league = useLeague();
  const tid = league.userTid;
  const season = mode === 'resign' ? league.season + 1 : capSeason(league);
  const cap = CAP_FOR(league, season);
  // a top free agent in the summer weighs offers: the sheet opens on your pending one, and raising it replaces it
  const bidding = mode === 'fa' && marqueeFA(league, p);
  const bid = bidding ? pendingBid(league, p.pid) : undefined;
  // another team's restricted free agent signs an offer sheet it can match (2-4 years); the user's own is re-signed
  const sheet = mode === 'fa' && !!p.rfa;
  const ownRfa = mode === 'resign' && p.tid === FREE_AGENT;
  const kind: TalkKind = mode === 'resign' ? 'resign' : 'fa';
  const mine = mode === 'fa' ? counterpart(league, p) : null;
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
  const yearsMax = mode === 'resign' ? maxYearsWith(league, p, tid) : sheet ? SHEET_MAX_YEARS : FA_YEARS;
  const raise = mode === 'resign' ? raiseWith(league, p, tid) : 0.05;
  // (his minimum exactly when he asks it: a little more would no longer be a minimum deal)
  const [amount, setAmount] = useState(() => bid?.amount ?? (ask.amount <= minAmt + 1 ? minAmt : clamp(Math.ceil(ask.amount / STEP) * STEP, minAmt, maxAmt)));
  // an exception's deal is shorter: open on the longest the route allows
  const [years, setYears] = useState(() => {
    const route = mode === 'fa' ? offerRoute(league, p, amount, season) : null;
    return Math.max(sheet ? SHEET_MIN_YEARS : 1, bid?.years ?? (isException(route) ? Math.min(ask.years, EXCEPTIONS[route].years) : ask.years));
  });
  // an option on the final season: on a deal of two years or more, not on an offer sheet or a top free agent's bid
  const optionsOk = !bidding && !sheet;
  const [optChoice, setOptChoice] = useState<OptionChoice>('none');
  const option = optionsOk && years >= 2 && optChoice !== 'none' ? optChoice : undefined;
  // the exception to pay with when more than one covers the offer
  const [via, setVia] = useState<Exception | undefined>(undefined);
  const [reply, setReply] = useState<Reply | null>(null);
  const set = (v: number) => setAmount(clamp(v, minAmt, maxAmt));
  const busy = useBusy();

  const askAt = bidding ? Math.min(maxAmt, Math.ceil((ask.amount * (1 + Math.abs(years - ask.years) * 0.03)) / STEP) * STEP) : askFor(league, p, kind, years, option);
  // his ask on his own terms as it can be signed (in $50K steps): the figure up top and the "His ask" chip agree
  const askOwn = overRights ? wants : bidding ? Math.min(maxAmt, Math.ceil(ask.amount / STEP) * STEP) : askFor(league, p, kind, ask.years);
  const talks = bidding ? null : talkState(league, p, kind);
  const appeal = teamAppeal(league, tid, p);
  const ai = appealInfo(appeal);
  // his ask from you against a neutral team's: interest and the difficulty setting both move it
  const vsNeutral = Math.round((askingContract(league, p, tid).amount / askingContract(league, p).amount - 1) * 100);
  const market = marketSalary(league, p);
  // your other pending offers on cap space hold their room, and so do the summer market's holds:
  // your offer sheets and your restricted free agents' cap holds
  const holds = mode === 'fa' ? marketHolds(league, tid, season) : [];
  const heldRfa = holds.reduce((a, h) => a + (h.kind === 'rfa' ? h.amount : 0), 0);
  const heldOffers = (mode === 'fa' ? bidHolds(league, p.pid) : 0) + holds.reduce((a, h) => a + (h.kind === 'sheet' ? h.amount : 0), 0);
  const held = heldOffers + heldRfa;
  const pay = payroll(league, tid, season) + held;
  const space = cap.salaryCap - pay;
  const after = pay + amount;
  // re-signing him clears his own cap hold; the other expiring players still hold their room
  const otherHolds = mode === 'resign' ? capHolds(league, tid).reduce((a, h) => a + (h.p.pid === p.pid ? 0 : h.amount), 0) : 0;
  // re-signing counts next season's contracts: the other expiring deals are leaving or re-signing too
  const pendingN = mode === 'fa' ? (league.faBids ?? []).filter((b) => b.pid !== p.pid).length + pendingSheets(league, tid).filter((x) => x.pid !== p.pid).length : 0;
  const rosterN = mode === 'resign' ? resignRoster(league) : standardRoster(league, tid).length + pendingN;
  const rosterMax = rosterMaxNow(league);
  // signing windows: free agents in the preseason, regular season and free agency; own players in the
  // re-sign period, and a restricted free agent of yours in free agency until he signs an offer sheet
  const closed =
    mode === 'fa'
      ? (signingClosedReason(league) ?? (sheet ? sheetBlockedReason(league, p, Math.max(years, SHEET_MIN_YEARS)) : null))
      : ownRfa
        ? p.rfa?.sheet
          ? `${shortName(league, p)} has signed an offer sheet with the ${league.teams[p.rfa.sheet.tid].name}: match it or let him go.`
          : null
        : league.phase !== 'resign'
          ? 'Re-signing happens between the draft and free agency.'
          : null;
  const rosterBlocked = rosterN >= rosterMax;
  const route = mode === 'fa' ? offerRoute(league, p, amount, season, years, via) : signingRoute(league, tid, amount, season, p);
  // covered by an exception, but not for this long
  const tooLong = mode === 'fa' && !route && isException(offerRoute(league, p, amount, season)) ? offerBlockedReason(league, p, amount, years, via) : null;
  const capBlocked = mode === 'fa' && !route && !tooLong;
  // the exceptions that would pay for this offer (more than one: choose)
  const covering = mode === 'fa' && isException(route) ? EXCEPTION_ORDER.filter((k) => years <= EXCEPTIONS[k].years && amount <= userExceptionRoom(league, k, season, p.pid)) : [];
  const exceptionsOpen = EXCEPTION_ORDER.map((k) => ({ k, room: mode === 'fa' ? userExceptionRoom(league, k, season, p.pid) : exceptionRoom(league, tid, k, season) }))
    .filter((x) => x.room > cap.vetMin)
    // (the taxpayer mid-level only once the full one can't pay as much)
    .filter((x, _, all) => x.k !== 'tmle' || (all.find((y) => y.k === 'mle')?.room ?? 0) < x.room);
  const floor = bidding ? bidFloor(league, p, years) : 0;
  const talksOff = !!talks?.closed;
  const blocked = !!closed || rosterBlocked || capBlocked || !!tooLong || amount < floor || (sheet && years < SHEET_MIN_YEARS) || talksOff || overRights;
  // as signed: each season at least his minimum
  const contract = makeContract(league, amount, years, season, p.experience, { raise, max: maxAmt });
  const total = contract.salaries.reduce((a, b) => a + b, 0);
  // what this deal does to the luxury tax: the bill with him against the bill without
  const tax = taxLine(league, pay, after, season);

  /** Why his counter can't be signed as it stands (the window, the roster, the cap), or null. */
  const counterBlocked = (c: TalkTerms): string | null =>
    mode === 'fa'
      ? (signingClosedReason(league) ?? (sheet ? sheetBlockedReason(league, p, c.years) : null) ?? offerBlockedReason(league, p, c.amount, c.years, via))
      : (closed ?? (rosterBlocked ? `Your roster is full for next season (${rosterMax}).` : null));

  const submit = (terms: TalkTerms = { amount, years, option }) => {
    // a refused offer still counts in the talks (his patience): only the answer differs
    const res = settle<OfferResult>(
      mode === 'fa' ? (bidding ? 'Your offer' : sheet ? 'The offer sheet' : 'The signing') : 'The re-signing',
      (l) =>
        mode === 'fa'
          ? bidding
            ? userBid(l, p.pid, terms.amount, terms.years)
            : userOffer(l, p.pid, terms.amount, terms.years, { option: terms.option, via })
          : userResign(l, p.pid, terms.amount, terms.years, { option: terms.option }),
      'good',
      true,
    );
    if (!res) return;
    if (res.ok) {
      useStore.getState().toast(res.reason, 'good');
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
              s: `appeal ×${appeal.toFixed(2)}`,
            },
          ]}
        />
        <HelpSheet title="Interest in your team">
          <p>
            Players weigh your <b>winning</b>, team <b>hype</b>, <b>market size</b> and the <b>playing time</b> they'd get. Interested players give you a discount; lukewarm ones
            want a premium. A lowball costs some of his interest for the season.
          </p>
          <p>His price for you is {vsNeutral < 0 ? `${-vsNeutral}% below` : vsNeutral > 0 ? `${vsNeutral}% above` : 'about the same as'} what he'd ask a neutral team.</p>
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
          yearDisabled={(y) => sheet && y < SHEET_MIN_YEARS}
          yearsMax={yearsMax}
          yearsNote={
            <>
              Through {shortSeason(season + years - 1)}, {Math.round(raise * 100)}% raises. Each year off what he wants: about 3% on his price.
              {sheet ? ` Offer sheets run ${SHEET_MIN_YEARS}-${SHEET_MAX_YEARS} years, no options.` : ''}
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
            He wants {moneyExact(wants)}; your {birdTier(league, p) === 'early' ? 'Early Bird' : 'non-Bird'} rights allow {moneyExact(maxAmt)}.
          </b>{' '}
          {ownRfa
            ? 'No new deal can pay him that: you can still match an offer sheet he signs elsewhere.'
            : 'He walks in free agency unless you renounce him and bid with cap space or an exception.'}
          <div className="tiny dim">
            {birdTier(league, p) === 'early'
              ? 'Early Bird rights (two seasons with you) pay up to 175% of his salary or 105% of the league average, whichever is more.'
              : 'Non-Bird rights (a season with you) pay up to 120% of his salary.'}
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
          <div className="tiny dim">{years < 2 ? 'Options need two years or more.' : 'Player option (his call): about 4% off. Team option (yours): about 6% more.'}</div>
        </div>
      )}

      {closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>Signing is closed.</b> {closed}
        </Callout>
      )}
      {rosterBlocked && !closed && (
        <Callout tone="bad" icon={<Ban size={18} className="bad" />}>
          <b>Roster full ({rosterMax}).</b>{' '}
          {pendingN > 0 ? (
            `Counting ${pendingN} pending offer${pendingN > 1 ? 's' : ''}: withdraw one, or release or trade someone.`
          ) : (
            <>
              Release or trade someone first (
              <Link to="/team?view=contracts" onClick={onClose}>
                Team → Contracts
              </Link>
              ).
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
                The <b>soft cap</b> is {money(cap.salaryCap)}. A free agent signs to any contract that fits under it: you have <b>{money(Math.max(0, space))}</b> of room for{' '}
                {seasonLabel(season)}.
              </p>
              <p>
                Over the cap you can still add players on <b>minimum contracts</b> (his is {moneyExact(minAmt)} a season) with a roster spot.
              </p>
              <p>
                Over the cap, <b>exceptions</b> pay for one signing each: the <b>mid-level</b> (up to {money(exceptionAmount(league, 'mle', season))}, {EXCEPTIONS.mle.years} years,
                once a season, staying under the first apron, {money(cap.firstApron)}), past it the <b>taxpayer mid-level</b> (up to{' '}
                {money(exceptionAmount(league, 'tmle', season))}, {EXCEPTIONS.tmle.years} years, under the second apron, {money(cap.secondApron)}), the <b>bi-annual</b> (up to{' '}
                {money(exceptionAmount(league, 'bae', season))}, {EXCEPTIONS.bae.years} years, under the first apron, not two seasons running), and for a team that used its cap
                space the <b>room exception</b> in place of the mid-level (up to {money(exceptionAmount(league, 'room', season))}, {EXCEPTIONS.room.years} years). Each hard-caps
                you at its apron for the season: no trade can take you past it.
              </p>
              <p>To make space: trade salary away, let contracts expire, or release players (what they're owed still counts as dead money).</p>
            </HelpSheet>
          </div>
          <div className="small">{offerBlockedReason(league, p, amount, years, via) ?? `This offer puts you ${money(after - cap.salaryCap)} over the cap.`}</div>
          <div className="chips fo-callout-btns">
            {exceptionsOpen.map(({ k, room }) => (
              <button
                key={k}
                className="btn xs"
                onClick={() => (
                  set(Math.floor(Math.min(room, maxAmt) / STEP) * STEP),
                  setYears(Math.max(sheet ? SHEET_MIN_YEARS : 1, Math.min(years, EXCEPTIONS[k].years))),
                  setVia(k)
                )}
              >
                Use the {EXCEPTIONS[k].name} ({moneyExact(room)})
              </button>
            ))}
            <button className="btn xs" onClick={() => set(minAmt)}>
              Offer the minimum instead
            </button>
          </div>
          {ask.amount > minAmt && <div className="tiny dim">He asks {moneyExact(ask.amount)}: a minimum deal is unlikely.</div>}
        </Callout>
      )}

      {bidding && !closed && !rosterBlocked && !capBlocked && !tooLong && <BidPanel p={p} amount={amount} years={years} floor={floor} onAmount={set} />}

      {sheet && !closed && p.rfa && (
        <Callout icon={<ShieldCheck size={18} className="dim" />}>
          <b>Restricted: this is an offer sheet.</b> Signed, the {league.teams[p.rfa.tid].name} have until the end of {deadlineLabel(matchDeadline(league.faDay))} to match it on
          these terms. Until then it holds your {isException(route) ? EXCEPTIONS[route].name : 'cap room'} and a roster spot; unmatched, he's yours.
        </Callout>
      )}

      {/* (a player who takes the minimum on these terms has nothing to talk about) */}
      {!bidding && !closed && !overRights && (askAt > minAmt + 1 || !!reply || !!talks?.counter || !!talks?.closed) && (
        <TalkPanel p={p} kind={kind} season={season} amount={amount} years={years} option={option} reply={reply} counterBlocked={counterBlocked} onAcceptCounter={acceptCounter} />
      )}

      {mode === 'fa' ? (
        <section className="fo-capimpact" aria-label="Cap impact">
          <div className="fo-capimpact-h">
            <span className="over">Cap impact · {shortSeason(season)}</span>
            {route ? <span className={`tag ${ROUTE_TAG[route].tone}`}>{ROUTE_TAG[route].label}</span> : <span className="tag bad">Over the cap</span>}
          </div>
          {covering.length > 1 && (
            <div className="col">
              <div className="over">Pay with</div>
              <Segmented label="Exception to use" value={route as Exception} onChange={(k) => setVia(k)} options={covering.map((k) => ({ id: k, label: EXCEPTIONS[k].short }))} />
            </div>
          )}
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
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} aprons={{ first: cap.firstApron, second: cap.secondApron }} add={amount} addLabel="This offer" />
          <div className="tiny dim">
            {route === 'min' && after > cap.salaryCap
              ? `Minimum deals (up to ${moneyExact(minAmt)} for him) sign over the cap.`
              : route === 'space' && exceptionRoom(league, tid, 'mle', season) > 0
                ? `Signing with cap space trades your mid-level for the smaller room exception for ${shortSeason(season)}.`
                : route === 'mle'
                  ? `Your mid-level: once a season, up to ${EXCEPTIONS.mle.years} years; it hard-caps you at the first apron (${money(cap.firstApron)}) for ${shortSeason(season)}.`
                  : route === 'tmle'
                    ? `Your taxpayer mid-level: once a season, up to ${EXCEPTIONS.tmle.years} years; it hard-caps you at the second apron (${money(cap.secondApron)}).`
                    : route === 'room'
                      ? `Your room exception: once, after using cap space this season, up to ${EXCEPTIONS.room.years} years.`
                      : route === 'bae'
                        ? `Your bi-annual: up to ${EXCEPTIONS.bae.years} years, not again next season; it hard-caps you at the first apron (${money(cap.firstApron)}).`
                        : ''}
            {held > 0
              ? ` Counts ${money(held)} held for ${[heldOffers > 0 ? 'your other pending offers and sheets' : '', heldRfa > 0 ? "your restricted free agents' holds" : ''].filter(Boolean).join(' and ')}.`
              : ''}
          </div>
          {tax && <div className={`tiny num ${tax.tone}`}>{tax.text}</div>}
        </section>
      ) : overRights ? null : (
        <section className="fo-capimpact" aria-label={`${shortSeason(season)} payroll`}>
          <div className="fo-capimpact-h">
            <span className="over">{shortSeason(season)} payroll</span>
            <span className="tag info">Bird rights</span>
          </div>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} aprons={{ first: cap.firstApron, second: cap.secondApron }} add={amount} addLabel="This deal" />
          <div className="tiny dim">
            Over the cap is fine for your own players.{ownRfa && p.rfa ? ` His ${money(p.rfa.hold ?? p.rfa.qo)} cap hold gives way to this deal.` : ''}
            {tax ? (
              <span className={tax.tone}> {tax.text}.</span>
            ) : after + otherHolds > cap.salaryCap ? (
              ` Over the cap${otherHolds > 0 ? ' with your other holds' : ''}: in free agency, minimum deals or an exception only.`
            ) : (
              ` Leaves ${money(cap.salaryCap - after - otherHolds)} of cap space${otherHolds > 0 ? ` after ${money(otherHolds)} in other holds` : ''}.`
            )}
          </div>
        </section>
      )}

      <div className="fo-sheet-foot">
        <Link to={`/player/${p.pid}`} className="btn" onClick={onClose}>
          Profile
        </Link>
        <button className={`btn grow ${!blocked ? 'primary' : ''}`} disabled={blocked || busy} onClick={() => submit()}>
          {overRights
            ? 'No offer can re-sign him'
            : `${bidding ? (bid ? 'Update offer' : 'Submit offer') : sheet ? 'Offer sheet' : 'Make offer'} · ${yrs(years)} · ${money(total)}`}
        </button>
      </div>
    </div>
  );
}
