// Office → Free agents: everyone you could sign, filtered and sorted, with your cap room on top
// and, while free agency runs, the market and its days. ?offer=pid opens a player's contract sheet
// (src/ui/office/ContractSheet).
import { fills, hurts, needCache, needMinutes, needMove, needOptions, needText, teamNeed } from '../../core/league/rosterNeed';
import { NeedNote } from '../office/NeedNote';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, SlidersHorizontal } from 'lucide-react';
import { FaHelp } from '../office/FaHelp';
import { FaDock, FaMarket } from '../office/FaMarket';
import { FaRow } from '../office/FaRow';
import type { Pos } from '../../core/types';
import { POSITIONS } from '../../core/types';
import { CAP_FOR, freeAgents, payroll, rosterMaxNow, standardRoster } from '../../core/league/helpers';
import { askingContract, teamAppeal, valueScore } from '../../core/league/contracts';
import { bidHolds, offerRoute, signingClosedReason, userMleRoom } from '../../core/league/freeAgency';
import { playerAge } from '../../core/playerGen';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Chips, Empty, PageHeader, Section, Sheet, Statline } from '../components/ui';
import { Fig } from '../office/motion';
import { Callout, capRoomFig, capSeason, floorText, rosterFig, shortSeason } from '../office/common';
import { Term } from '../components/Glossary';
import { FA_DAYS, faDayNumber } from '../../core/league/season';
import { ContractSheet } from '../office/ContractSheet';
import { FilterSelect } from '../trade/TradeFinder';
import { money, moneyExact } from '../../core/format';

type SortKey = 'value' | 'ovr' | 'pot' | 'ask' | 'age';

export default function FreeAgents() {
  const league = useLeague();
  const tid = league.userTid;
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const pay = payroll(league, tid, s);
  // the user's pending offers to top free agents on cap space hold their room
  const holds = bidHolds(league);
  const space = cap.salaryCap - pay - holds;
  // what the mid-level can still pay (none while a pending offer has it)
  const mle = userMleRoom(league, s);
  // the offseason allows 21 until opening night
  const n = standardRoster(league, tid).length;
  const max = rosterMaxNow(league);
  const closed = signingClosedReason(league);
  const [pos, setPos] = useState<'all' | Pos>('all');
  const [minOvr, setMinOvr] = useState(0);
  const [sort, setSort] = useState<SortKey>('value');
  // null: the screen's own pick (see `signableFirst` below); a tap on the chip makes it the user's
  const [signablePick, setOnlySignable] = useState<boolean | null>(null);
  const [limit, setLimit] = useState(40);
  // a player page's "Make an offer" opens his sheet here (?offer=pid)
  const [params, setParams] = useSearchParams();
  const linked = Number(params.get('offer'));
  const [sel, setSel] = useState<number | null>(() => (league.players[linked] ? linked : null));
  const closeSheet = () => {
    setSel(null);
    if (params.has('offer')) setParams({}, { replace: true });
  };
  const fa = league.phase === 'freeAgency';
  const room = capRoomFig(space);

  const all = useLeagueMemo(
    () =>
      freeAgents(league).map((p) => {
        const ask = askingContract(league, p, tid);
        return { p, ask, appeal: teamAppeal(league, tid, p), val: valueScore(league, p), age: playerAge(p, league.season), route: offerRoute(league, p, ask.amount, s) };
      }),
    [league, tid, s],
  );

  // what the user could actually do today: the window is open and there's a spot to fill
  const canAdd = !closed && n < max;
  const signable = (r: (typeof all)[number]) => canAdd && !!r.route;
  // over the cap (the best asks need room he hasn't got): the list opens on who he can sign, one tap
  // from everyone. With nobody he can sign (a full roster, the window shut) it shows everyone
  const signableFirst = (space <= 0 || n >= max) && all.some(signable);
  const onlySignable = signablePick ?? signableFirst;
  const rows = all
    .filter((r) => (pos === 'all' || r.p.pos === pos) && r.p.ovr >= minOvr && (!onlySignable || signable(r)))
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

  // the roster's need (Team → Tactics's weakest quality), and which of the rows in view would fill it
  const shownKey = rows
    .slice(0, limit)
    .map((r) => r.p.pid)
    .join(',');
  const needs = useLeagueMemo(() => {
    const shown = shownKey ? shownKey.split(',').map(Number) : [];
    const cache = needCache(league);
    const need = teamNeed(league, cache);
    const fill = new Map<number, { text: string; good: boolean }>();
    if (need)
      for (const pid of shown) {
        const m = needMove(league, need.id, [pid], [], cache);
        if (fills(m) || hurts(m)) fill.set(pid, { text: `${needText(m)}${needMinutes(m)}`, good: fills(m) });
      }
    return { need, fill, options: needOptions(league, cache) };
  }, [league, shownKey]);
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
        // (in free agency the deals are next season's: the day says more)
        sub={fa ? `Day ${faDayNumber(league)} of ${FA_DAYS} · ${all.length} available` : `${all.length} available · ${shortSeason(s)} deals`}
        back
        right={<FaHelp league={league} s={s} space={space} mle={mle} />}
      />

      {closed && (
        <Callout tone="warn" icon={<Lock size={16} className="warn" />}>
          {closed}
        </Callout>
      )}

      {/* the desk's poster: what you can spend, as big as it fits; the roster and the mid-level under the rule */}
      <section className="fo-room" aria-label="Your room">
        <div className="over">{room.k}</div>
        <div className="fo-room-v num">
          <Fig value={space} text={room.v} />
        </div>
        {/* (pending offers on cap space hold their room) */}
        <div className="fo-room-s">
          {holds > 0
            ? `after ${money(holds)} held for your offers`
            : space > 0
              ? 'to spend on free agents'
              : mle > 0
                ? 'sign for the minimum or with your mid-level'
                : 'sign for the minimum'}
        </div>
        {/* (under the salary floor the difference is paid at the season's end anyway: money to spend) */}
        {floorText(pay, cap) && <div className="fo-room-floor small">{floorText(pay, cap)}</div>}
        <Statline
          items={[
            // (in the offseason up to 21 can sign: past 15, cut down by opening night)
            rosterFig(league),
            mle > 0
              ? { k: <Term id="mle">Mid-level</Term>, v: money(mle), color: 'var(--good)', s: 'one signing a season' }
              : { k: <Term id="mle">Mid-level</Term>, v: 'Used', s: `minimum ${moneyExact(cap.vetMin)}` },
          ]}
        />
      </section>

      {fa && <FaMarket onOpen={setSel} />}

      {onlySignable && !canAdd && <div className="small warn">{closed ?? `Your roster is full at ${max}. Release or trade someone to sign one.`}</div>}

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

      <NeedNote league={league} need={needs.need} options={needs.options} />

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
                <FaRow key={p.pid} league={league} p={p} ask={ask} appeal={appeal} route={route} space={space} fill={needs.fill.get(p.pid)} onOpen={() => setSel(p.pid)} />
              ))}
            </div>
            {rows.length > limit && (
              <button className="btn ghost block fo-more-btn" onClick={() => setLimit(limit + 40)}>
                Show more · {rows.length - limit} left
              </button>
            )}
          </div>
        </Section>
      )}

      {fa && <FaDock />}

      <ContractSheet pid={sel} mode="fa" onClose={closeSheet} />
    </main>
  );
}
