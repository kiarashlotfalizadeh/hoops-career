import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FastForward, Gavel, Lock, SkipForward } from 'lucide-react';
import type { Player, Pos } from '../../core/types';
import { FREE_AGENT, POSITIONS } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, TWO_WAY_MAX, freeAgents, payroll, playerName, rosterMaxNow, standardRoster, twoWayRoster } from '../../core/league/helpers';
import {
  EXCEPTIONS,
  EXCEPTION_ORDER,
  WAIVER_DAYS,
  askingContract,
  claimBlockedReason,
  exceptionAmount,
  onWaivers,
  teamAppeal,
  twoWaySalary,
  twoWayYears,
  userClaim,
  valueScore,
  waiverOrder,
  waiverSalary,
  wantsOut,
  wantsTwoWay,
} from '../../core/league/contracts';
import { bidHolds, capPayroll, offerRoute, signingClosedReason, userExceptionRoom, userTwoWayOffer, withdrawBid } from '../../core/league/freeAgency';
import { FA_DAYS, faDayNumber, faOver } from '../../core/league/season';
import { COOL_FA, COOL_SEASON, LOWBALL } from '../../core/league/negotiation';
import { HARDSHIP_OUT, TEN_DAYS, hardship, tenDayClosedReason, tenDayPay, tenDayUntil, wantsTenDay } from '../../core/league/tenDay';
import { contractExp, playerAge } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { Bar, Chips, Empty, PageHeader, Section, Sheet, Statline } from '../components/ui';
import { Callout, HelpSheet, Line, OvrPot, PlayerHead, appealInfo, capSeason, fmtM, playerMeta, shortSeason } from '../office/common';
import { ContractSheet } from '../office/ContractSheet';
import { MyRfas, MySheets, rfaTag } from '../office/RfaPanel';
import { TenDaySheet } from '../office/TenDayPanel';
import { FilterSelect } from '../trade/TradeFinder';
import { MATCH_DAYS, SHEET_MIN_YEARS, pendingSheets, restrictedFreeAgents } from '../../core/league/rfa';

type SortKey = 'value' | 'ovr' | 'pot' | 'ask' | 'age';

export default function FreeAgents() {
  const league = useLeague();
  const tid = league.userTid;
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const pay = payroll(league, tid, s);
  // until free agency opens, the user's own expiring players hold cap room (as on the Office cap sheet),
  // and in free agency so do the user's pending offers to top free agents
  const bids = league.faBids ?? [];
  // (in free agency capPayroll counts the market's holds: your restricted free agents' and your offer sheets')
  const holds = capPayroll(league, tid, s) - pay + bidHolds(league);
  const sheetsOut = pendingSheets(league, tid);
  const space = cap.salaryCap - pay - holds;
  // the exceptions open to a signing now, largest first (each net of the pending offers that lean on them)
  const exceptions = EXCEPTION_ORDER.map((k) => ({ k, room: userExceptionRoom(league, k, s) }))
    .filter((x) => x.room > 0)
    .sort((a, b) => b.room - a.room);
  // two-way players don't use one of the 15 standard spots; the offseason allows 21 until opening night
  const n = standardRoster(league, tid).length;
  const max = rosterMaxNow(league);
  const tw = twoWayRoster(league, tid).length;
  const closed = signingClosedReason(league);
  // 10-day contracts: January 5 to the end of the regular season, with hardship spots beyond 15
  const tenDayOpen = !tenDayClosedReason(league);
  const hs = hardship(league, tid);
  const [pos, setPos] = useState<'all' | Pos>('all');
  const [minOvr, setMinOvr] = useState(0);
  const [sort, setSort] = useState<SortKey>('value');
  const [onlySignable, setOnlySignable] = useState(false);
  const [twoWayMode, setTwoWayMode] = useState(false);
  const [tenDayMode, setTenDayMode] = useState(false);
  const tenDays = tenDayMode && tenDayOpen;
  const [tenDaySel, setTenDaySel] = useState<number | null>(null);
  const [limit, setLimit] = useState(40);
  // a player page's "Make an offer" opens his sheet here (?offer=pid)
  const [params, setParams] = useSearchParams();
  const linked = Number(params.get('offer'));
  const [sel, setSel] = useState<number | null>(() => (league.players[linked] && !league.players[linked].waivers ? linked : null));
  const [twoWaySel, setTwoWaySel] = useState<number | null>(null);
  const [waiverSel, setWaiverSel] = useState<number | null>(() => (league.players[linked]?.waivers ? linked : null));
  const closeSheet = () => {
    setSel(null);
    setWaiverSel(null);
    if (params.has('offer')) setParams({}, { replace: true });
  };
  const withdraw = (pid: number) => {
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = withdrawBid(l, pid);
    });
    useStore.getState().toast(res.reason, res.ok ? 'neutral' : 'bad');
  };
  const fa = league.phase === 'freeAgency';

  const all = useLeagueMemo(
    () =>
      // players on waivers are listed too: they can be claimed, not signed
      [...freeAgents(league), ...onWaivers(league)].map((p) => {
        const ask = askingContract(league, p, tid);
        return {
          p,
          ask,
          appeal: teamAppeal(league, tid, p),
          val: valueScore(league, p),
          age: playerAge(p, league.season),
          route: p.waivers ? null : offerRoute(league, p, ask.amount, s),
          twoWay: !p.waivers && wantsTwoWay(league, p, tid),
          tenDay: wantsTenDay(league, p, tid),
        };
      }),
    [league, tid, s],
  );

  // what the user could actually do today: the window is open and there's a spot to fill (a hardship one for a 10-day)
  const canAdd = !closed && (twoWayMode ? tw < TWO_WAY_MAX : tenDays ? n < max + hs.spots : n < max);
  const rows = all
    .filter(
      (r) =>
        (pos === 'all' || r.p.pos === pos) &&
        r.p.ovr >= minOvr &&
        (!twoWayMode || r.twoWay) &&
        (!tenDays || r.tenDay) &&
        // (your own restricted free agent re-signs with Bird rights; one who signed an offer sheet waits on it)
        (!onlySignable || (!r.p.waivers && !r.p.rfa?.sheet && canAdd && (twoWayMode || tenDays || r.route || (r.p.rfa?.tid === tid && !wantsOut(r.p))))),
    )
    .sort((a, b) => {
      switch (sort) {
        case 'ovr':
          return b.p.ovr - a.p.ovr || b.val - a.val;
        case 'pot':
          return b.p.pot - a.p.pot || b.val - a.val;
        case 'ask':
          return b.ask.amount - a.ask.amount;
        case 'age':
          return a.age - b.age || b.val - a.val;
        default:
          return b.val - a.val;
      }
    });

  const busy = useStore((st) => !!st.sim);
  const over = faOver(league);
  const advance = async (days: number) => {
    const before = freeAgents(league).map((p) => p.pid);
    const offered = bids.map((b) => b.pid);
    const sheeted = sheetsOut.map((p) => p.pid);
    const from = faDayNumber(league) + 1;
    // behind the progress bar, like the Play menu's: a second tap while it runs is a no-op
    if (!(await useStore.getState().task('Free agency', { kind: 'faAdvance', days }))) return;
    const l = useStore.getState().league!;
    const signed = before
      .map((pid) => l.players[pid])
      .filter((p) => p && p.tid >= 0 && p.tid !== l.userTid)
      .sort((a, b) => b.ovr - a.ovr);
    const day = faDayNumber(l);
    const when = day > from ? `Days ${from}-${day}` : `Day ${day}`;
    // the players who decided on your offers lead (the details are in the inbox)
    const decided = offered.filter((pid) => !l.faBids?.some((b) => b.pid === pid)).map((pid) => l.players[pid]);
    // your offer sheets that were decided, and sheets on your restricted free agents that came in (the market stops for those)
    const settled = sheeted.map((pid) => l.players[pid]).filter((p) => p && !p.rfa?.sheet);
    const incoming = restrictedFreeAgents(l, l.userTid).filter((p) => p.rfa!.sheet?.day === l.faDay);
    const won = decided.some((p) => p?.tid === l.userTid) || settled.some((p) => p.tid === l.userTid);
    const verdicts = [
      ...decided
        .filter(Boolean)
        .map((p) => (p.tid === l.userTid ? `${p.lastName} chose you!` : p.tid >= 0 ? `${p.lastName} chose ${l.teams[p.tid].abbrev}.` : `${p.lastName} passed on your offer.`)),
      ...settled.map((p) => (p.tid === l.userTid ? `${p.lastName}'s offer sheet wasn't matched: he's yours!` : `${l.teams[p.tid].abbrev} matched ${p.lastName}'s offer sheet.`)),
      ...incoming.map((p) => `${l.teams[p.rfa!.sheet!.tid].abbrev} signed ${p.lastName} to an offer sheet: match it or let him go.`),
    ].join(' ');
    useStore.getState().toast(
      `${verdicts ? `${verdicts} ` : ''}${
        signed.length
          ? `${when}: ${signed.length} signing${signed.length > 1 ? 's' : ''}. ${signed
              .slice(0, 2)
              .map((p) => `${p.lastName} (${p.ovr}) → ${l.teams[p.tid].abbrev}`)
              .join(', ')}${signed.length > 2 ? '…' : ''}`
          : `${when}: ${day > from ? (day - from >= 6 ? 'a quiet week' : 'a few quiet days') : 'a quiet day'} on the market.`
      }`,
      won ? 'good' : incoming.length ? 'bad' : 'neutral',
    );
  };

  const recent = fa
    ? league.news
        .filter((x) => x.kind === 'signing' && x.season === league.season)
        .slice(-4)
        .reverse()
    : [];
  const sheetWaiting = restrictedFreeAgents(league, tid).some((p) => p.rfa!.sheet);

  return (
    <main className="page fo-page">
      <PageHeader
        title="Free Agents"
        sub={`${all.length} available · deals from ${seasonLabel(s)}`}
        back
        right={
          <HelpSheet title="How free agency works">
            <p>
              <b>Cap space.</b> Sign anyone whose deal fits under the {fmtM(cap.salaryCap)} cap. You have <b>{fmtM(Math.max(0, space))}</b> of room for {seasonLabel(s)}.
            </p>
            <p>
              <b>Minimum deals.</b> Over the cap, players still sign for their minimum: {fmtM(cap.minContract, 2)} in a player's first three seasons, {fmtM(cap.vetMin, 2)} after. A
              minimum deal for the coming season isn't guaranteed until opening night.
            </p>
            <p>
              <b>Exceptions.</b> Over the cap, each pays for one signing a season. The <b>mid-level</b>: up to {fmtM(exceptionAmount(league, 'mle', s))} for up to{' '}
              {EXCEPTIONS.mle.years} years, if the signing keeps you under the tax line ({fmtM(cap.luxuryTax)}). The <b>bi-annual</b>: up to{' '}
              {fmtM(exceptionAmount(league, 'bae', s))} for up to {EXCEPTIONS.bae.years} years, under the tax line too, and not two seasons running. After either, trades can't take
              you past the tax line that season. Sign anyone with <b>cap space</b> and the mid-level is gone for the season: the <b>room exception</b> replaces it, up to{' '}
              {fmtM(exceptionAmount(league, 'room', s))} for up to {EXCEPTIONS.room.years} years (a team uses the room exception or the bi-annual in a season, not both).{' '}
              {exceptions.length ? `Open to you now: ${exceptions.map((x) => `${EXCEPTIONS[x.k].name} up to ${fmtM(x.room)}`).join(', ')}.` : 'None is open to you now.'}
            </p>
            <p>
              <b>Negotiating.</b> His ask is open: offer it on his terms (the years he wants, no option) and he signs on the spot. He'd take a little less, how much he keeps to
              himself; below that he counters, and he only hears so many offers. A lowball (under {Math.round(LOWBALL * 100)}% of his ask) counts twice and costs some of his
              interest. If talks break down he won't take your calls for {COOL_FA} days in free agency (the rest of the summer after two lowballs), or {COOL_SEASON} days in season.
              A player option takes a little off his price, a team option adds to it. His interest in your team (winning, hype, market, playing time, each weighed by what matters
              to him) moves his ask.
            </p>
            <p>
              <b>Top free agents.</b> In the summer, players worth 78+ or asking 8% of the cap or more weigh offers: submit one (at least 90% of his ask) and a day or two later he
              picks between yours and other teams' by the money against his ask of each, how much he likes each team, and the years. Pending offers hold their cap space, mid-level
              and roster spot until he decides; raise or withdraw them any time.
            </p>
            <p>
              <b>Restricted free agents.</b> A young player whose team qualified him signs only offer sheets: {SHEET_MIN_YEARS} to 5 years, no options, at his ask, paid with cap
              space, the mid-level or the minimum. His team has {MATCH_DAYS} days to match on exactly those terms; until then the sheet holds your room (or mid-level) and a roster
              spot. Your own restricted free agents re-sign with Bird rights until they sign a sheet, their holds stay on your books meanwhile, and the market stops when another
              team signs one so you can match or let him go. Unsigned at the close, a restricted free agent plays a season on his qualifying offer.
            </p>
            <p>
              <b>Timing.</b> The summer market lasts {FA_DAYS} days and you get the first look: AI teams start signing on day 2, and stars go fast. Unsigned players cut their price
              every few days, and stay available in season.
            </p>
            <p>
              <b>Waivers.</b> A player released in season with guaranteed money left spends {WAIVER_DAYS} days on waivers. Teams can claim him, worst record first, and take over
              his contract (with a roster spot, and cap space for this season's salary unless it's a minimum deal), which takes his dead money off his old team's books.
            </p>
            <p>
              <b>Roster.</b> Up to {OFFSEASON_ROSTER_MAX} players in the offseason, {CAP.rosterMax} from opening night, plus up to {TWO_WAY_MAX} on two-way deals.
            </p>
            <p>
              <b>Two-way deals.</b> Players with three seasons or fewer who'd sign for the minimum can take a two-way slot at {fmtM(twoWaySalary(league, s), 2)}. They don't use a
              roster spot or count on the cap, and sit at the end of the bench unless you run short.
            </p>
            <p>
              <b>10-day contracts.</b> From January 5 to the end of the regular season, a free agent who'd sign for the minimum takes a {TEN_DAYS}-day deal: his minimum prorated,
              paid at signing, on a roster spot. It ends by itself, with no dead money. Two with one team a season at most; then the rest of the season, or he leaves. With{' '}
              {HARDSHIP_OUT}+ players out for three or more games (the <b>hardship exception</b>), you can carry 10-day players beyond {CAP.rosterMax}, one for each player out past
              three.
            </p>
            <p>
              <b>Window.</b> Signings are open in the preseason, through the end of the regular season, and in free agency.
            </p>
          </HelpSheet>
        }
      />

      {closed && (
        <Callout tone="warn" icon={<Lock size={16} className="warn" />}>
          {closed}
        </Callout>
      )}

      <div className="card fo-figs-card">
        <Statline
          items={[
            {
              k: 'Cap space',
              v: fmtM(space),
              color: space > 0 ? 'var(--good)' : 'var(--warn)',
              s:
                bids.some((b) => b.route === 'space') || sheetsOut.length
                  ? 'after pending offers'
                  : holds > 0
                    ? 'after cap holds'
                    : space > 0
                      ? 'to spend'
                      : exceptions.length
                        ? 'min or an exception'
                        : 'min deals only',
            },
            {
              k: 'Roster',
              v: `${n}/${max}`,
              color: n >= max ? 'var(--bad)' : n > CAP.rosterMax ? 'var(--warn)' : undefined,
              s: `${n >= max ? 'full' : n > CAP.rosterMax ? `${n - CAP.rosterMax} to cut` : `${max - n} open`} · ${tw}/${TWO_WAY_MAX} 2W`,
            },
            {
              k: 'Exception',
              v: exceptions.length ? fmtM(exceptions[0].room) : '—',
              color: exceptions.length ? 'var(--good)' : undefined,
              s: exceptions.length ? exceptions.map((x) => EXCEPTIONS[x.k].short).join(' · ') : `min ${fmtM(cap.vetMin, 2)}`,
            },
          ]}
        />
      </div>

      {fa && (
        <Section
          title="Free agency"
          right={
            <span className="fo-faday num">
              Day {faDayNumber(league)}/{FA_DAYS}
            </span>
          }
        >
          <div className="card fo-market">
            <Bar value={faDayNumber(league)} max={FA_DAYS} />
            <div className="small dim2">
              {over ? (
                'The market is winding down. Start the new season from the Play button when your roster is set.'
              ) : sheetWaiting ? (
                <span className="warn">An offer sheet on your restricted free agent waits for your call: the market moves a day at a time until then.</span>
              ) : (
                'AI teams make offers daily. Players who wait may lower their price.'
              )}
            </div>
            <div className="row">
              <button className="btn sm grow" disabled={over || busy} onClick={() => void advance(1)}>
                <SkipForward size={16} /> Next day
              </button>
              <button className="btn sm grow" disabled={over || busy} onClick={() => void advance(7)}>
                <FastForward size={16} /> Advance a week
              </button>
            </div>
            <MySheets onOpen={setSel} />
            {bids.length > 0 && (
              <div className="fo-pending">
                <div className="over">
                  <Gavel size={12} /> Your pending offers
                </div>
                {bids.map((b) => {
                  const bp = league.players[b.pid];
                  return (
                    <div key={b.pid} className="fo-pending-item">
                      <button className="fo-pending-row grow" aria-haspopup="dialog" onClick={() => setSel(b.pid)}>
                        <b>{playerName(bp)}</b> · {b.years} yr{b.years > 1 ? 's' : ''} · {fmtM(b.amount)}
                        <span className="dim"> · {b.decideDay > league.faDay ? `decides day ${b.decideDay + 1}` : 'decides at the close'}</span>
                      </button>
                      <button className="btn xs" aria-label={`Withdraw your offer to ${playerName(bp)}`} onClick={() => withdraw(b.pid)}>
                        Withdraw
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {recent.length > 0 && (
              <div className="fo-pending">
                <div className="over">Latest signings</div>
                <ul className="fo-notes">
                  {recent.map((x) => (
                    <li key={x.id}>{x.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      <MyRfas onResign={setSel} />

      <div className="fo-filters">
        <div className="hscroll">
          <Chips
            label="Position"
            value={pos}
            onChange={(x) => (setPos(x), setLimit(40))}
            options={[{ id: 'all' as const, label: 'All' }, ...POSITIONS.map((p) => ({ id: p, label: p }))]}
          />
        </div>
        <div className="fo-selects">
          <FilterSelect
            label="Minimum OVR"
            value={minOvr}
            onChange={(x) => (setMinOvr(x), setLimit(40))}
            options={[
              [0, 'Any OVR'],
              [60, '60+ OVR'],
              [65, '65+ OVR'],
              [70, '70+ OVR'],
              [75, '75+ OVR'],
            ]}
          />
          <FilterSelect
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              ['value', 'Sort: best'],
              ['ovr', 'Sort: OVR'],
              ['pot', 'Sort: POT'],
              ['ask', 'Sort: ask'],
              ['age', 'Sort: youngest'],
            ]}
          />
        </div>
        <div className="hscroll">
          <div className="chips fo-nowrap">
            <button className={`chip ${onlySignable ? 'on' : ''}`} aria-pressed={onlySignable} onClick={() => setOnlySignable(!onlySignable)}>
              Can sign now
            </button>
            <button className={`chip ${twoWayMode ? 'on' : ''}`} aria-pressed={twoWayMode} onClick={() => (setTwoWayMode(!twoWayMode), setTenDayMode(false), setLimit(40))}>
              Two-way offers ({tw}/{TWO_WAY_MAX})
            </button>
            {tenDayOpen && (
              <button className={`chip ${tenDays ? 'on' : ''}`} aria-pressed={tenDays} onClick={() => (setTenDayMode(!tenDayMode), setTwoWayMode(false), setLimit(40))}>
                10-day contracts
              </button>
            )}
          </div>
        </div>
        {onlySignable && !canAdd && (
          <div className="small warn">
            {closed ??
              (twoWayMode
                ? `All ${TWO_WAY_MAX} two-way slots are taken.`
                : tenDays
                  ? `Your roster is full (${max}${hs.spots ? ` and ${hs.spots} hardship` : ''}).`
                  : `Your roster is full (${max}). Release or trade someone to sign a free agent.`)}
          </div>
        )}
        {twoWayMode && <div className="tiny dim">Three seasons or fewer, would sign for the minimum. Two-way pays {fmtM(twoWaySalary(league, s), 2)}, off the cap.</div>}
        {tenDays && (
          <div className="tiny dim">
            Would sign for the minimum: prorated for {TEN_DAYS} days, ends by itself.{' '}
            {hs.out >= HARDSHIP_OUT
              ? `${hs.out} players out 3+ games: ${hs.spots} hardship spot${hs.spots === 1 ? '' : 's'} beyond ${CAP.rosterMax}.`
              : `Roster ${n}/${CAP.rosterMax}: hardship spots come from ${HARDSHIP_OUT} players out (${hs.out} now).`}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty>{all.length === 0 ? 'No free agents on the market right now.' : 'No free agents match these filters.'}</Empty>
      ) : (
        <div className="card flush">
          <div className="list wide2">
            {rows.slice(0, limit).map(({ p, ask, appeal, route }) => {
              const ai = appealInfo(appeal);
              const bid = bids.find((b) => b.pid === p.pid);
              const w = p.waivers;
              // days until he clears, as the waiver sheet and the claim's answer count them
              const wDays = w ? w.until - league.day : 0;
              const rfa = rfaTag(league, p);
              const own = p.rfa?.tid === tid;
              return (
                <button
                  key={p.pid}
                  className="fo-prow"
                  onClick={() => (w ? setWaiverSel(p.pid) : twoWayMode ? setTwoWaySel(p.pid) : tenDays ? setTenDaySel(p.pid) : setSel(p.pid))}
                >
                  <OvrPot p={p} />
                  <div className="grow">
                    <div className="fo-prow-name">
                      <span className="fo-name">{playerName(p)}</span>
                      {p.injury && <span className="fo-flag bad">INJ</span>}
                    </div>
                    {(bid || w || rfa) && (
                      <div className="fo-prow-tags">
                        {rfa && <span className={`tag ${rfa.tone}`}>{rfa.label}</span>}
                        {bid && <span className="tag info">Bidding · {bid.decideDay > league.faDay ? `decides day ${bid.decideDay + 1}` : 'decides at the close'}</span>}
                        {w && <span className="tag warn">On waivers · clears {wDays > 1 ? `in ${wDays} days` : wDays === 1 ? 'tomorrow' : 'today'}</span>}
                        {w?.claim && <span className="tag good">Your claim is in</span>}
                      </div>
                    )}
                    <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
                    <div className="fo-prow-status">
                      {/* (a claim takes over his contract: what he thinks of your team doesn't matter) */}
                      {!w && (
                        <span className="fo-interest" style={{ ['--note' as string]: ai.color }}>
                          {ai.label}
                        </span>
                      )}
                      {w ? (
                        <span className="dim">Claim his contract</span>
                      ) : p.rfa?.sheet ? (
                        <span className="dim">Waiting on his team</span>
                      ) : own ? (
                        <span className="good">Bird rights</span>
                      ) : twoWayMode ? (
                        <span className="good">Two-way</span>
                      ) : tenDays ? (
                        <span className="good">10-day</span>
                      ) : route === 'min' ? (
                        <span className="good">Min deal</span>
                      ) : route === 'space' ? (
                        <span className="good">Fits your space</span>
                      ) : route === 'mle' || route === 'room' || route === 'bae' ? (
                        <span className="good">{EXCEPTIONS[route].short}</span>
                      ) : space > 0 ? (
                        <span className="warn">More than your space</span>
                      ) : (
                        <span className="dim">Needs cap space</span>
                      )}
                    </div>
                  </div>
                  {w ? (
                    <div className="fo-money">
                      <div className="a">{fmtM(waiverSalary(league, p))}</div>
                      <div className="b">thru {shortSeason(contractExp(w.contract))}</div>
                    </div>
                  ) : twoWayMode ? (
                    <div className="fo-money">
                      <div className="a">{fmtM(twoWaySalary(league, s), 2)}</div>
                      <div className="b">
                        two-way · {twoWayYears(p)} yr{twoWayYears(p) > 1 ? 's' : ''}
                      </div>
                    </div>
                  ) : tenDays ? (
                    <div className="fo-money">
                      <div className="a">{fmtM(tenDayPay(league, p, tenDayUntil(league) - league.day), 2)}</div>
                      <div className="b">
                        {tenDayUntil(league) - league.day} day{tenDayUntil(league) - league.day === 1 ? '' : 's'}
                      </div>
                    </div>
                  ) : (
                    <div className="fo-money">
                      <div className="a">{fmtM(ask.amount)}</div>
                      <div className="b">
                        {ask.years} yr{ask.years > 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {rows.length > limit && (
            <button className="btn ghost block fo-more-btn" onClick={() => setLimit(limit + 40)}>
              Show more ({rows.length - limit} left)
            </button>
          )}
        </div>
      )}

      <ContractSheet pid={sel} mode="fa" onClose={closeSheet} />
      <TwoWaySheet p={twoWaySel !== null ? league.players[twoWaySel] : undefined} onClose={() => setTwoWaySel(null)} />
      <TenDaySheet p={tenDaySel !== null ? league.players[tenDaySel] : undefined} onClose={() => setTenDaySel(null)} />
      <WaiverSheet p={waiverSel !== null ? league.players[waiverSel] : undefined} onClose={closeSheet} />
    </main>
  );
}

/** Fixed-terms two-way offer: no negotiation, he takes it if he's a minimum-level player. */
function TwoWaySheet({ p, onClose }: { p: Player | undefined; onClose: () => void }) {
  const league = useLeague();
  const open = !!p && p.tid === FREE_AGENT;
  const s = capSeason(league);
  const used = twoWayRoster(league, league.userTid).length;
  const blocked = !p
    ? null
    : (signingClosedReason(league) ??
      (used >= TWO_WAY_MAX ? `All ${TWO_WAY_MAX} two-way slots are taken.` : !wantsTwoWay(league, p, league.userTid) ? `${p.lastName} wants a standard contract.` : null));
  const offer = () => {
    if (!p) return;
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = userTwoWayOffer(l, p.pid);
    });
    useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
    if (res.ok) onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Two-way offer">
      {open && p && (
        <div className="col fo-sheet">
          <PlayerHead league={league} p={p} right={<OvrPot p={p} />} />
          <div className="fo-lines">
            <Line k="Pay a season">{fmtM(twoWaySalary(league, s), 2)}</Line>
            <Line k="Seasons">
              {twoWayYears(p)} from {seasonLabel(s)}
            </Line>
            <Line k="Two-way slots used">
              {used}/{TWO_WAY_MAX}
            </Line>
          </div>
          <p className="fo-lede small">
            No roster spot or cap room needed. He sits at the end of the bench unless you run short, and can move to a standard minimum deal when a spot opens.
          </p>
          {blocked && <div className="small warn">{blocked}</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary grow" disabled={!!blocked} onClick={offer}>
              Offer two-way deal
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** A player on waivers: his contract, when he clears, where you stand in the waiver order, and your claim. */
function WaiverSheet({ p, onClose }: { p: Player | undefined; onClose: () => void }) {
  const league = useLeague();
  const w = p?.waivers;
  const open = !!p && !!w && p.tid === FREE_AGENT;
  const tid = league.userTid;
  const blocked = open ? claimBlockedReason(league, tid, p) : null;
  const order = waiverOrder(league).filter((t) => t.tid !== w?.from);
  const rank = order.findIndex((t) => t.tid === tid) + 1;
  const days = w ? Math.max(0, w.until - league.day) : 0;
  const claim = (on: boolean) => {
    if (!p) return;
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = userClaim(l, p.pid, on);
    });
    useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Waiver claim">
      {open && p && w && (
        <div className="col fo-sheet">
          <PlayerHead league={league} p={p} right={<OvrPot p={p} />} />
          <p className="fo-lede small">
            Released by the {league.teams[w.from].region} {league.teams[w.from].name}. Clears {days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : 'today'}; until then any
            team can claim him and take over his contract, worst record first. Unclaimed, he's a free agent.
          </p>
          <div className="fo-lines">
            {w.contract.salaries.map((amt, i) => {
              const season = w.contract.start + i;
              return season < league.season ? null : (
                <Line key={season} k={seasonLabel(season)}>
                  {fmtM(amt, 2)}
                </Line>
              );
            })}
            {/* (none when you released him: the order skips his old team) */}
            {rank > 0 && (
              <Line k="Your place in the waiver order">
                #{rank} of {order.length}
              </Line>
            )}
          </div>
          {blocked && !w.claim && <div className="small warn">{blocked}</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Close
            </button>
            {w.claim ? (
              <button className="btn grow" onClick={() => claim(false)}>
                Withdraw claim
              </button>
            ) : (
              <button className="btn primary grow" disabled={!!blocked} onClick={() => claim(true)}>
                Put in a claim
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
