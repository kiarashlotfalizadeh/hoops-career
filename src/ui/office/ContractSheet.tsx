// Contract sheet shared by Free Agents and Re-sign: a negotiation with the player's agent (his
// ask up top, your offer, his counter, his patience; see TalkPanel), or for a top free agent in the
// summer an offer weighed against other teams' (BidPanel). Its extension mode (the Office, the
// player page and Re-sign) is in ExtendBody.tsx.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Minus, Plus, Scale, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { Player, TalkTerms } from '../../core/types';
import { FREE_AGENT } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { clamp } from '../../core/random';
import { CAP_FOR, payroll, playerName, rosterMaxNow, standardRoster } from '../../core/league/helpers';
import {
  EXCEPTIONS,
  EXCEPTION_ORDER,
  type Exception,
  askingContract,
  exceptionAmount,
  exceptionRoom,
  isException,
  makeContract,
  marketHolds,
  marketSalary,
  signingRoute,
  teamAppeal,
} from '../../core/league/contracts';
import { SHEET_MIN_YEARS, deadlineLabel, matchDeadline, pendingSheets, sheetBlockedReason } from '../../core/league/rfa';
import {
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
import { Avatar, Help, Segmented, Sheet } from '../components/ui';
import { CapBar, Callout, MoodTag, OvrPot, Range, appealInfo, capSeason, fmtM, playerMeta, shortSeason } from './common';
import { ExtendBody } from './ExtendBody';
import { BidPanel } from './BidPanel';
import { type Reply, TalkPanel } from './TalkPanel';
import { compareHref, counterpart } from '../compare';

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

const STEP = 50;
const yrs = (n: number) => `${n} yr${n > 1 ? 's' : ''}`;
type OptionChoice = 'none' | 'player' | 'team';

/** The route tag on the cap card: how the signing is paid for. */
const ROUTE_TAG: Record<string, { label: string; tone: string }> = {
  min: { label: 'Minimum deal', tone: 'good' },
  space: { label: 'Uses cap space', tone: '' },
  mle: { label: 'Mid-level exception', tone: 'info' },
  room: { label: 'Room exception', tone: 'info' },
  bae: { label: 'Bi-annual exception', tone: 'info' },
};

function OfferBody({ p, mode, onClose }: { p: Player; mode: Exclude<OfferMode, 'extend'>; onClose: () => void }) {
  const league = useLeague();
  const tid = league.userTid;
  const season = mode === 'resign' ? league.season + 1 : capSeason(league);
  const cap = CAP_FOR(league, season);
  // a top free agent in the summer weighs offers: the sheet opens on your pending one, and raising it replaces it
  const bidding = mode === 'fa' && marqueeFA(league, p);
  const bid = bidding ? pendingBid(league, p.pid) : undefined;
  // another team's restricted free agent signs an offer sheet it can match (2-5 years); the user's own is re-signed
  const sheet = mode === 'fa' && !!p.rfa;
  const ownRfa = mode === 'resign' && p.tid === FREE_AGENT;
  const kind: TalkKind = mode === 'resign' ? 'resign' : 'fa';
  const mine = mode === 'fa' ? counterpart(league, p) : null;
  // his ask on his own terms (up after re-sign talks broke down)
  const ask = bidding ? askingContract(league, p, tid) : talkAsk(league, p, kind);
  const minAmt = p.experience >= 3 ? cap.vetMin : cap.minContract;
  const maxAmt = cap.maxContract(p.experience);
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

  const askAt = bidding ? Math.min(maxAmt, Math.ceil((ask.amount * (1 + Math.abs(years - ask.years) * 0.03)) / STEP) * STEP) : askFor(league, p, kind, years, option);
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
          ? `${p.lastName} has signed an offer sheet with the ${league.teams[p.rfa.sheet.tid].name}: match it or let him go.`
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
  const exceptionsOpen = EXCEPTION_ORDER.map((k) => ({ k, room: mode === 'fa' ? userExceptionRoom(league, k, season, p.pid) : exceptionRoom(league, tid, k, season) })).filter(
    (x) => x.room > cap.vetMin,
  );
  const floor = bidding ? bidFloor(league, p, years) : 0;
  const talksOff = !!talks?.closed;
  const blocked = !!closed || rosterBlocked || capBlocked || !!tooLong || amount < floor || (sheet && years < SHEET_MIN_YEARS) || talksOff;
  // as signed: each season at least his minimum
  const contract = makeContract(league, amount, years, season, p.experience);
  const total = contract.salaries.reduce((a, b) => a + b, 0);
  const taxBill = after > cap.luxuryTax ? (after - cap.luxuryTax) * CAP.taxRate : 0;

  /** Why his counter can't be signed as it stands (the window, the roster, the cap), or null. */
  const counterBlocked = (c: TalkTerms): string | null =>
    mode === 'fa'
      ? (signingClosedReason(league) ?? (sheet ? sheetBlockedReason(league, p, c.years) : null) ?? offerBlockedReason(league, p, c.amount, c.years, via))
      : (closed ?? (rosterBlocked ? `Your roster is full for next season (${rosterMax}).` : null));

  const submit = (terms: TalkTerms = { amount, years, option }) => {
    let res: OfferResult = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res =
        mode === 'fa'
          ? bidding
            ? userBid(l, p.pid, terms.amount, terms.years)
            : userOffer(l, p.pid, terms.amount, terms.years, { option: terms.option, via })
          : userResign(l, p.pid, terms.amount, terms.years, { option: terms.option });
    });
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
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 12 }}>
        <Avatar p={p} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="ellipsis" style={{ fontSize: 22 }}>
            {playerName(p)}
          </h2>
          <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
          {/* a free agent weighed against your own player at his position */}
          {mode === 'fa' && (
            <Link to={compareHref(p.pid, mine?.pid)} className="btn xs" style={{ marginTop: 8, maxWidth: '100%' }} onClick={onClose}>
              <Scale size={13} style={{ flex: 'none' }} /> <span className="ellipsis">{mine ? `Compare with ${mine.lastName}` : 'Compare'}</span>
            </Link>
          )}
        </div>
        <OvrPot p={p} />
      </div>

      <div className="grid2">
        <div className="kpi">
          <span className="k">{talks?.firm ? 'His ask (firm)' : "He's asking"}</span>
          <span className="v" style={{ fontSize: 21 }}>
            {fmtM(ask.amount, 2)}
          </span>
          <span className="tiny dim">
            {yrs(ask.years)} · market {fmtM(market, 2)}
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
                    you a discount; lukewarm ones want a premium. A lowball costs some of his interest in you for the season.
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
          {[1, 2, 3, 4, 5].map((y) => (
            <button key={y} className={`fo-yr ${years === y ? 'on' : ''}`} aria-pressed={years === y} disabled={sheet && y < SHEET_MIN_YEARS} onClick={() => setYears(y)}>
              {y}
              <small>{y === ask.years ? 'wants' : shortSeason(season + y - 1)}</small>
            </button>
          ))}
        </div>
        <div className="tiny dim">
          Runs through {seasonLabel(season + years - 1)} with 5% annual raises. Each year away from what he wants adds ~3% to his price.
          {sheet ? ` Offer sheets run ${SHEET_MIN_YEARS} to 5 years, with no options.` : ''}
        </div>
      </div>

      {optionsOk && (
        <div className="col" style={{ gap: 6 }}>
          <div className="tiny dim upper bold">Option on {years >= 2 ? seasonLabel(season + years - 1) : 'the last season'}</div>
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
              ? 'Options need a deal of two years or more.'
              : 'A player option (his call after the draft) takes about 4% off his price; a team option (yours) adds about 6%.'}
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
          <b>Your roster is full ({rosterMax}).</b>{' '}
          {pendingN > 0
            ? `Counting your ${pendingN} pending offer${pendingN > 1 ? 's' : ''}: withdraw one, or release or trade someone.`
            : 'Release or trade someone from the Office first.'}
        </Callout>
      )}
      {tooLong && !closed && !rosterBlocked && (
        <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
          <b>{tooLong}</b> Offer fewer years.
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
                Once you're over the cap you can still add players on <b>minimum contracts</b> (his is {fmtM(minAmt, 2)} per season), as long as you have a roster spot.
              </p>
              <p style={{ margin: 0 }}>
                Over the cap, <b>exceptions</b> pay for one signing each: the <b>mid-level</b> (up to {fmtM(exceptionAmount(league, 'mle', season))}, {EXCEPTIONS.mle.years} years,
                once a season, keeping you under the tax line), the <b>bi-annual</b> (up to {fmtM(exceptionAmount(league, 'bae', season))}, {EXCEPTIONS.bae.years} years, under the
                tax, not two seasons running), and for a team that used its cap space this season the <b>room exception</b> in place of the mid-level (up to{' '}
                {fmtM(exceptionAmount(league, 'room', season))}, {EXCEPTIONS.room.years} years). After the mid-level or the bi-annual, trades can't take you past the tax line that
                season.
              </p>
              <p style={{ margin: 0 }}>
                To create space: trade salary away, let contracts expire, or release players (their remaining salary still counts against the cap as dead money).
              </p>
            </Help>
          </div>
          <div className="small dim2" style={{ marginTop: 2 }}>
            {offerBlockedReason(league, p, amount, years, via) ?? `This offer would put you ${fmtM(after - cap.salaryCap)} over the cap.`}
          </div>
          <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
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
                Use the {EXCEPTIONS[k].name} ({fmtM(room, 2)})
              </button>
            ))}
            <button className="btn xs" onClick={() => set(minAmt)}>
              Offer the minimum instead
            </button>
          </div>
          {ask.amount > minAmt && (
            <div className="tiny dim" style={{ marginTop: 6 }}>
              He's asking {fmtM(ask.amount, 2)}, so he's unlikely to take a minimum deal.
            </div>
          )}
        </Callout>
      )}

      {bidding && !closed && !rosterBlocked && !capBlocked && !tooLong && <BidPanel p={p} amount={amount} years={years} floor={floor} onAmount={set} />}

      {sheet && !closed && p.rfa && (
        <Callout icon={<ShieldCheck size={18} />}>
          <b>Restricted free agent.</b> This is an offer sheet: when he signs it, the {league.teams[p.rfa.tid].name} have until the end of{' '}
          {deadlineLabel(matchDeadline(league.faDay))} to match it and keep him on exactly these terms. Until they decide it holds your{' '}
          {isException(route) ? EXCEPTIONS[route].name : 'cap room'} and a roster spot; not matched, he's yours.
        </Callout>
      )}

      {!bidding && !closed && (
        <TalkPanel p={p} kind={kind} season={season} amount={amount} years={years} option={option} reply={reply} counterBlocked={counterBlocked} onAcceptCounter={acceptCounter} />
      )}

      {mode === 'fa' ? (
        <div className="card tight col" style={{ gap: 8 }}>
          <div className="row between">
            <div className="small bold">Cap impact · {seasonLabel(season)}</div>
            {route ? <span className={`tag ${ROUTE_TAG[route].tone}`}>{ROUTE_TAG[route].label}</span> : <span className="tag bad">Over the cap</span>}
          </div>
          {covering.length > 1 && (
            <div className="col" style={{ gap: 4 }}>
              <div className="tiny dim upper bold">Pay with</div>
              <Segmented label="Exception to use" value={route as Exception} onChange={(k) => setVia(k)} options={covering.map((k) => ({ id: k, label: EXCEPTIONS[k].short }))} />
            </div>
          )}
          <div className="grid2">
            <div>
              <div className="tiny dim upper bold">Space now</div>
              <div className="fo-mid" style={{ color: space >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                {fmtM(space)}
              </div>
            </div>
            <div>
              <div className="tiny dim upper bold">{bidding ? 'If he signs' : 'After signing'}</div>
              {/* over the cap is only a problem when no exception covers the signing */}
              <div className="fo-mid" style={{ color: cap.salaryCap - after >= 0 ? 'var(--good)' : route === 'min' || isException(route) ? 'var(--warn)' : 'var(--bad)' }}>
                {fmtM(cap.salaryCap - after)}
              </div>
            </div>
          </div>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} />
          {route === 'min' && after > cap.salaryCap && <div className="tiny dim">Minimum deals (up to {fmtM(minAmt, 2)} for him) can be signed even when you're over the cap.</div>}
          {route === 'space' && exceptionRoom(league, tid, 'mle', season) > 0 && (
            <div className="tiny dim">Signing with cap space replaces your mid-level exception with the smaller room exception for the rest of {seasonLabel(season)}.</div>
          )}
          {route === 'mle' && (
            <div className="tiny dim">Uses your mid-level exception: once a season, up to {EXCEPTIONS.mle.years} years, and it keeps you under the tax line.</div>
          )}
          {route === 'room' && <div className="tiny dim">Uses your room exception: once, for a team that used its cap space this season, up to {EXCEPTIONS.room.years} years.</div>}
          {route === 'bae' && (
            <div className="tiny dim">Uses your bi-annual exception: up to {EXCEPTIONS.bae.years} years, keeping you under the tax line, and not again next season.</div>
          )}
          {held > 0 && (
            <div className="tiny dim">
              Counts {fmtM(held)} of cap space held for{' '}
              {[heldOffers > 0 ? 'your other pending offers and offer sheets' : '', heldRfa > 0 ? "your restricted free agents' cap holds" : ''].filter(Boolean).join(' and ')}.
            </div>
          )}
        </div>
      ) : (
        <div className="card tight col" style={{ gap: 8 }}>
          <div className="row between">
            <div className="small bold">{seasonLabel(season)} payroll</div>
            <span className="tag info">Bird rights</span>
          </div>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={amount} />
          <div className="tiny dim">
            You can go over the cap to keep your own players.{ownRfa && p.rfa ? ` His ${fmtM(p.rfa.hold ?? p.rfa.qo)} cap hold gives way to this contract.` : ''}
            {taxBill > 0 ? (
              <span className="bad">
                {' '}
                This puts you {fmtM(after - cap.luxuryTax)} over the tax line: about {fmtM(taxBill)} in luxury tax.
              </span>
            ) : after + otherHolds > cap.salaryCap ? (
              <>
                {' '}
                You'd be over the cap{otherHolds > 0 ? ' counting your other cap holds' : ''}, so in free agency you could only add players on minimum deals or with an exception.
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
        <button className={`btn grow ${!blocked ? 'primary' : ''}`} disabled={blocked} onClick={() => submit()}>
          {bidding ? (bid ? 'Update offer' : 'Submit offer') : sheet ? 'Offer sheet' : 'Make offer'} · {yrs(years)} · {fmtM(total)}
        </button>
      </div>
    </div>
  );
}
