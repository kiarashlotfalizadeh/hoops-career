// Office → Free agents: everyone you could sign (and claim off waivers), filtered and sorted, with
// your cap room on top and, while free agency runs, the market and its days. The sheets live in
// src/ui/office/ (ContractSheet, FaSheets, TenDayPanel); ?offer=pid opens a player's.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, SlidersHorizontal } from 'lucide-react';
import { FaHelp } from '../office/FaHelp';
import { FaDock, FaMarket } from '../office/FaMarket';
import { FaRow, type FaListMode } from '../office/FaRow';
import { TwoWaySheet, WaiverSheet } from '../office/FaSheets';
import type { Pos } from '../../core/types';
import { POSITIONS } from '../../core/types';
import { CAP } from '../../core/constants';
import { CAP_FOR, TWO_WAY_MAX, freeAgents, payroll, rosterMaxNow, standardRoster, twoWayRoster } from '../../core/league/helpers';
import { EXCEPTIONS, EXCEPTION_ORDER, askingContract, onWaivers, teamAppeal, twoWaySalary, valueScore, wantsTwoWay } from '../../core/league/contracts';
import { bidHolds, capPayroll, offerRoute, signingClosedReason, userExceptionRoom } from '../../core/league/freeAgency';
import { HARDSHIP_OUT, TEN_DAYS, hardship, tenDayClosedReason, wantsTenDay } from '../../core/league/tenDay';
import { playerAge } from '../../core/playerGen';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Chips, Empty, PageHeader, Section, Segmented, Sheet, Statline } from '../components/ui';
import { Callout, capRoomFig, capSeason, rosterFig, shortSeason } from '../office/common';
import { Term } from '../components/Glossary';
import { FA_DAYS, faDayNumber } from '../../core/league/season';
import { ContractSheet } from '../office/ContractSheet';
import { MyRfas } from '../office/RfaPanel';
import { TenDaySheet } from '../office/TenDayPanel';
import { FilterSelect } from '../trade/TradeFinder';
import { money, moneyExact } from '../../core/format';

type SortKey = 'value' | 'ovr' | 'pot' | 'ask' | 'age';

export default function FreeAgents() {
  const league = useLeague();
  const tid = league.userTid;
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const pay = payroll(league, tid, s);
  // until free agency opens, the user's own expiring players hold cap room (as on the Office cap sheet),
  // and in free agency so do the user's pending offers to top free agents
  // (in free agency capPayroll counts the market's holds: your restricted free agents' and your offer sheets')
  const holds = capPayroll(league, tid, s) - pay + bidHolds(league);
  const space = cap.salaryCap - pay - holds;
  // the exceptions open to a signing now, largest first (each net of the pending offers that lean on them)
  const exceptions = EXCEPTION_ORDER.map((k) => ({ k, room: userExceptionRoom(league, k, s) }))
    .filter((x) => x.room > 0)
    // (the taxpayer mid-level only once the full one can't pay as much)
    .filter((x, _, all) => x.k !== 'tmle' || (all.find((y) => y.k === 'mle')?.room ?? 0) < x.room)
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
  // null: the screen's own pick (see `signableFirst` below); a tap on the chip makes it the user's
  const [signablePick, setOnlySignable] = useState<boolean | null>(null);
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
  // (your own restricted free agent re-signs with Bird rights; one who signed an offer sheet waits on it)
  const signable = (r: (typeof all)[number]) => !r.p.waivers && !r.p.rfa?.sheet && canAdd && (twoWayMode || tenDays || !!r.route || r.p.rfa?.tid === tid);
  // over the cap (the best asks need room he hasn't got): the list opens on who he can sign, one tap
  // from everyone. With nobody he can sign (a full roster, the window shut) it shows everyone
  const signableFirst = (space <= 0 || n >= max) && all.some(signable);
  const onlySignable = signablePick ?? signableFirst;
  const rows = all
    .filter((r) => (pos === 'all' || r.p.pos === pos) && r.p.ovr >= minOvr && (!twoWayMode || r.twoWay) && (!tenDays || r.tenDay) && (!onlySignable || signable(r)))
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

  const mode: FaListMode = twoWayMode ? 'twoWay' : tenDays ? 'tenDay' : 'standard';
  // position, OVR and the order live in a sheet: its button counts the ones changed (and "Can sign now", which names the list)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtered = [pos !== 'all', minOvr !== 0, sort !== 'value'].filter(Boolean).length;
  const filterBtn = (
    <button className={`btn sm ${filtered ? 'fo-filter-on' : ''}`} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
      <SlidersHorizontal size={15} aria-hidden="true" /> Filters{filtered ? ` · ${filtered}` : ''}
    </button>
  );
  const listTitle = `${rows.length} ${onlySignable ? 'you can sign' : rows.length === 1 ? 'player' : 'players'}${pos !== 'all' ? ` · ${pos}` : ''}`;

  return (
    <main className="page fo-page">
      <PageHeader
        title="Free agents"
        sub={`${fa ? `Day ${faDayNumber(league)} of ${FA_DAYS} · ` : ''}${all.length} available · ${shortSeason(s)} deals`}
        back
        right={<FaHelp league={league} s={s} space={space} exceptions={exceptions} />}
      />

      {closed && (
        <Callout tone="warn" icon={<Lock size={16} className="warn" />}>
          {closed}
        </Callout>
      )}

      <div className="fo-figs-card">
        <Statline
          items={[
            {
              ...capRoomFig(space),
              // (the holds said with their amount, as on the Office's cap sheet: pending offers and sheets hold room too)
              s: holds > 0 ? `after ${money(holds)} in holds` : space > 0 ? 'to spend' : 'min or exception',
            },
            // (in the offseason up to 21 can sign: past 15, cut down by opening night)
            rosterFig(league),
            exceptions.length
              ? {
                  k: 'Best exception',
                  v: money(exceptions[0].room),
                  color: 'var(--good)',
                  s: `${EXCEPTIONS[exceptions[0].k].short}${exceptions.length > 1 ? ` +${exceptions.length - 1} more` : ''}`,
                }
              : { k: <Term id="exception">Exceptions</Term>, v: 'None', s: `minimum ${moneyExact(cap.vetMin)}` },
          ]}
        />
      </div>

      {fa && <FaMarket onOpen={setSel} />}

      <MyRfas onResign={setSel} />

      {/* the list's kind: free agents' own asks, two-way offers, 10-day contracts */}
      <Segmented
        label="Contracts shown"
        value={mode}
        onChange={(m) => (setTwoWayMode(m === 'twoWay'), setTenDayMode(m === 'tenDay'), setLimit(40))}
        options={[
          { id: 'standard' as const, label: 'Free agents' },
          { id: 'twoWay' as const, label: `Two-way · ${tw}/${TWO_WAY_MAX}` },
          ...(tenDayOpen ? [{ id: 'tenDay' as const, label: '10-day' }] : []),
        ]}
      />
      {(twoWayMode || tenDays || (onlySignable && !canAdd)) && (
        <div className="col fo-fa-notes">
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
          {twoWayMode && <div className="tiny dim">Three seasons or fewer, would sign for the minimum. Two-way pays {moneyExact(twoWaySalary(league, s))}, off the cap.</div>}
          {tenDays && (
            <div className="tiny dim">
              Would sign for the minimum: prorated for {TEN_DAYS} days, ends by itself.{' '}
              {hs.out >= HARDSHIP_OUT
                ? `${hs.out} players out 3+ games: ${hs.spots} hardship spot${hs.spots === 1 ? '' : 's'} beyond ${CAP.rosterMax}.`
                : `Roster ${n}/${CAP.rosterMax}: hardship spots come from ${HARDSHIP_OUT} players out (${hs.out} now).`}
            </div>
          )}
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="col fo-filter-sheet">
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
                ['value', 'Sort: value'],
                ['ovr', 'Sort: OVR'],
                ['pot', 'Sort: POT'],
                ['ask', 'Sort: ask'],
                ['age', 'Sort: youngest'],
              ]}
            />
          </div>
          <div className="chips">
            <button className={`chip ${onlySignable ? 'on' : ''}`} aria-pressed={onlySignable} onClick={() => setOnlySignable(!onlySignable)}>
              Can sign now
            </button>
          </div>
          <div className="row fo-filter-foot">
            <button className="btn text" disabled={!filtered} onClick={() => (setPos('all'), setMinOvr(0), setSort('value'), setLimit(40))}>
              Reset
            </button>
            <button className="btn primary grow" onClick={() => setFiltersOpen(false)}>
              Show {rows.length} player{rows.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </Sheet>

      {rows.length === 0 ? (
        <>
          {all.length > 0 && <div className="row between">{filterBtn}</div>}
          <Empty>
            {all.length === 0 ? (
              'No free agents on the market right now.'
            ) : onlySignable ? (
              <>
                No one you can sign right now matches.{' '}
                <button className="btn sm ghost" onClick={() => setOnlySignable(false)}>
                  Show everyone
                </button>
              </>
            ) : (
              'No free agents match these filters.'
            )}
          </Empty>
        </>
      ) : (
        <Section title={listTitle} right={filterBtn}>
          <div className="card flush">
            <div className="list wide2">
              {rows.slice(0, limit).map(({ p, ask, appeal, route }) => (
                <FaRow
                  key={p.pid}
                  league={league}
                  p={p}
                  ask={ask}
                  appeal={appeal}
                  route={route}
                  mode={mode}
                  s={s}
                  space={space}
                  onOpen={() => (p.waivers ? setWaiverSel(p.pid) : twoWayMode ? setTwoWaySel(p.pid) : tenDays ? setTenDaySel(p.pid) : setSel(p.pid))}
                />
              ))}
            </div>
            {rows.length > limit && (
              <button className="btn ghost block fo-more-btn" onClick={() => setLimit(limit + 40)}>
                Show more ({rows.length - limit} left)
              </button>
            )}
          </div>
        </Section>
      )}

      {fa && <FaDock />}

      <ContractSheet pid={sel} mode="fa" onClose={closeSheet} />
      <TwoWaySheet p={twoWaySel !== null ? league.players[twoWaySel] : undefined} onClose={() => setTwoWaySel(null)} />
      <TenDaySheet p={tenDaySel !== null ? league.players[tenDaySel] : undefined} onClose={() => setTenDaySel(null)} />
      <WaiverSheet p={waiverSel !== null ? league.players[waiverSel] : undefined} onClose={closeSheet} />
    </main>
  );
}
