// Office → Trade: the builder (a partner, the deal, both sides' assets and their GM's live reaction
// in the dock), the finder, the trading block and the offers other teams make. This module holds the
// deal and the tabs; each part lives in src/ui/trade/. Deep links: ?with=tid, ?give/get(dp)=ids,
// ?proposal=id (an AI team's offer, in the builder), ?offer=id, ?tab=offers, ?tab=find&minOvr=N (the
// finder with its OVR floor set) and ?give=pid alone (that player on the trading block).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { playerName } from '../../core/league/helpers';
import { capSalary, evaluateTrade, pickLabel, swapSeasons, salaryMatchGap, validateTrade, type TradeOffer } from '../../core/league/trades';
import { counterOffers, makeItWork, type CounterOffer } from '../../core/league/tradeHelp';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act } from '../../state/actions';
import { makeTrade } from '../../state/actions/office';
import { PageHeader, Segmented, scrollBehavior } from '../components/ui';
import { Callout, capSeason, deadlineLabel } from '../office/common';
import { openProposals } from '../../core/league/proposals';
import { OffersTab } from '../office/OffersTab';
import { CounterSheet } from '../trade/CounterSheet';
import { ConfirmSheet, needsConfirm } from '../trade/ConfirmSheet';
import { protectable } from '../trade/Terms';
import { AskCallout, FINDER_DEFAULT, TradeFinder, type Ask, type FinderState } from '../trade/TradeFinder';
import { checkForceTrade, forceTrade } from '../../core/league/godMode';
import { continueDraft } from '../../core/league/season';
import { money, moneyExact } from '../../core/format';
import { EMPTY, selOf, type Sel } from '../trade/sel';
import { TradeHelp } from '../trade/TradeHelp';
import { PartnerSlab } from '../trade/Partner';
import { DealCard } from '../trade/DealCard';
import { AssetList } from '../trade/AssetList';
import { Dock } from '../trade/Dock';
import { TradingBlock } from '../trade/TradingBlock';

const ids = (s: string | null) =>
  s
    ? s
        .split(',')
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
    : [];

type Tab = 'build' | 'find' | 'block' | 'offers';

/** The finder's OVR floor from ?minOvr=N: the highest of its filter's steps at or under N. */
const minOvrOf = (params: URLSearchParams) => [85, 80, 75, 70].find((x) => x <= Number(params.get('minOvr'))) ?? 0;

function readParams(league: League, params: URLSearchParams): { partner: number; give: Sel; get: Sel; shop: number | null; tab: Tab; focus: number | null; minOvr: number } {
  const user = league.userTid;
  // an offer from the agenda (?offer=id): the Offers tab, that offer first
  const focus = params.get('offer') !== null ? Number(params.get('offer')) : null;
  // an AI team's offer (Review in the inbox) opens in the builder; once it's gone, the other offers show
  const pr = params.get('proposal');
  const offer = pr !== null ? openProposals(league).find((p) => p.id === Number(pr)) : undefined;
  if (offer)
    return {
      partner: offer.tid,
      give: { pids: [...offer.offer.a.pids], dpids: [...offer.offer.a.dpids] },
      get: { pids: [...offer.offer.b.pids], dpids: [...offer.offer.b.dpids] },
      shop: null,
      tab: 'build',
      focus: null,
      minOvr: 0,
    };
  const w = params.get('with');
  const wt = w !== null ? Number(w) : NaN;
  const fallback = league.teams.find((t) => t.tid !== user)!.tid;
  const partner = Number.isFinite(wt) && league.teams[wt] && wt !== user ? wt : fallback;
  const give: Sel = { pids: ids(params.get('give')), dpids: ids(params.get('givedp')) };
  const get: Sel = { pids: ids(params.get('get')), dpids: ids(params.get('getdp')) };
  // "Trade him" from the contracts list opens the trading block for that player
  const shop = w === null && give.pids.length === 1 && !give.dpids.length && !get.pids.length && !get.dpids.length ? give.pids[0] : null;
  const tab: Tab = pr !== null || focus !== null || params.get('tab') === 'offers' ? 'offers' : shop !== null ? 'block' : params.get('tab') === 'find' ? 'find' : 'build';
  return { partner, give, get, shop, focus, tab, minOvr: minOvrOf(params) };
}

export default function Trade() {
  const league = useLeague();
  const [params] = useSearchParams();
  const user = league.userTid;
  const init = useMemo(() => readParams(league, params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [partner, setPartner] = useState(init.partner);
  const [give, setGive] = useState<Sel>(init.give);
  const [get, setGet] = useState<Sel>(init.get);
  const [tab, setTab] = useState<Tab>(init.tab);
  const [shop, setShop] = useState<number | null>(init.shop);
  const [focus, setFocus] = useState<number | null>(init.focus);
  const [side, setSide] = useState<'theirs' | 'mine'>('theirs');
  // a turned-down deal and what they'd do instead; the finder's filters and the ask it last loaded
  const [counters, setCounters] = useState<{ base: TradeOffer; list: CounterOffer[] } | null>(null);
  const [finder, setFinder] = useState<FinderState>(() => ({ ...FINDER_DEFAULT, minOvr: init.minOvr }));
  const [ask, setAsk] = useState<Ask | null>(null);
  // a deal they'd take that you overpay for, or that moves a first, waits for a second tap
  const [confirm, setConfirm] = useState<TradeOffer | null>(null);

  // react to new deep links while already on the screen (e.g. from the inbox)
  const key = params.toString();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const r = readParams(useStore.getState().league!, params);
    setPartner(r.partner);
    setGive(r.give);
    setGet(r.get);
    setShop(r.shop);
    setFocus(r.focus);
    setTab(r.tab);
    if (r.tab === 'find') setFinder({ ...FINDER_DEFAULT, minOvr: r.minOvr });
    setAsk(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const s = capSeason(league);
  const pt = league.teams[partner];
  // drop anything that is no longer where it was (trades, releases, used picks), and terms that no
  // longer apply (a protection on a pick taken out, a swap the rules no longer allow)
  const clean = (sel: Sel, tid: number, other: number): Sel => {
    const dpids = sel.dpids.filter((d) => league.draftPicks.some((x) => x.dpid === d && x.tid === tid));
    const protect = Object.entries(sel.protect ?? {}).filter(([d, n]) => {
      const dp = league.draftPicks.find((x) => x.dpid === Number(d));
      return n > 0 && dp && dpids.includes(dp.dpid) && protectable(league, dp, tid);
    });
    const open = swapSeasons(league, tid, other);
    const swaps = (sel.swaps ?? []).filter((y) => open.includes(y));
    return {
      pids: sel.pids.filter((pid) => league.players[pid]?.tid === tid),
      dpids,
      ...(protect.length ? { protect: Object.fromEntries(protect) } : {}),
      ...(swaps.length ? { swaps } : {}),
      ...((sel.cash ?? 0) > 0 ? { cash: sel.cash } : {}),
    };
  };
  const cleanGive = clean(give, user, partner);
  const cleanGet = clean(get, partner, user);
  const offer: TradeOffer = { a: { tid: user, ...cleanGive }, b: { tid: partner, ...cleanGet } };
  const offerKey = JSON.stringify(offer);
  const count = (s: Sel) => s.pids.length + s.dpids.length + (s.swaps?.length ?? 0) + (s.cash ? 1 : 0);
  const empty = !count(cleanGive) && !count(cleanGet);
  // offerKey stands for the offer (a new object every render) and whether it is empty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ev = useLeagueMemo(() => (empty ? null : evaluateTrade(league, offer)), [league, offerKey]);
  const phaseErrs = useLeagueMemo(
    () => validateTrade(league, { a: { tid: user, pids: [], dpids: [] }, b: { tid: partner, pids: [], dpids: [] } }).filter((e) => !/empty/i.test(e)),
    [league, partner, user],
  );
  const closed = phaseErrs.length > 0;
  // god mode: what would stop this deal being forced through (only its shape and five players to dress)
  const god = !!league.settings.godMode;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const force = useLeagueMemo(() => (god && !empty ? checkForceTrade(league, offer) : null), [league, god, empty, offerKey]);
  const offers = openProposals(league).length;

  const pickPartner = (tid: number) => {
    if (tid === partner) return;
    setPartner(tid);
    setGet(EMPTY);
    // swap rights are given to one team
    setGive((g) => ({ ...g, swaps: undefined }));
    setSide('theirs');
  };

  const reset = () => {
    setGive(EMPTY);
    setGet(EMPTY);
  };

  /** Make a deal if they still take it (judging one changes nothing: only an accepted one is saved). */
  const execute = (o: TradeOffer): boolean => {
    if (!makeTrade(league, o)) return false;
    reset();
    setAsk(null);
    return true;
  };

  /** God mode: the deal goes through whatever their GM and the rules say. */
  const forceIt = () => {
    const abbrev = league.teams[offer.b.tid].abbrev;
    if (checkForceTrade(league, offer).errors.length) return;
    // all of it or none of it, as every god-mode edit
    const ok = act('The forced trade', (l) => {
      forceTrade(l, offer);
      if (l.phase === 'draft') continueDraft(l);
    });
    if (!ok) return;
    useStore.getState().toast(`Trade forced through with ${abbrev}.`, 'good');
    reset();
    setAsk(null);
  };

  /** A deal they'd take: made now, or shown for a second look first (see needsConfirm). */
  const take = (o: TradeOffer, r = evaluateTrade(league, o)) => {
    if (needsConfirm(league, o, r)) setConfirm(o);
    else execute(o);
  };

  const propose = () => {
    const r = evaluateTrade(league, offer);
    if (r.accept) {
      take(offer, r);
      return;
    }
    // turned down: the versions they would take instead (worked out only now: it takes a moment)
    const list = r.ok ? counterOffers(league, offer) : [];
    if (list.length) setCounters({ base: offer, list });
    // (with the main reason: how far apart the sides are, as a rule)
    else useStore.getState().toast(`${pt.abbrev}: ${r.message}${r.ok && r.notes.length ? ` ${r.notes[0].text}.` : ''}`, 'bad');
  };

  const loadDeal = (o: TradeOffer) => {
    setPartner(o.b.tid);
    setGive(selOf(o.a));
    setGet(selOf(o.b));
    setSide('theirs');
    setTab('build');
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  };

  // a player tapped in the finder: his team in the builder, and what they'd want for him
  const pickTarget = (pid: number) => {
    const p = league.players[pid];
    const want: TradeOffer = { a: { tid: user, pids: [], dpids: [] }, b: { tid: p.tid, pids: [pid], dpids: [] } };
    // (the ask that costs you least among the ways to match the salary: see makeItWork)
    const result = closed ? null : makeItWork(league, want, [], { best: true });
    loadDeal(result?.offer ?? want);
    setAsk({ tid: p.tid, pid, result });
  };

  const whatWorks = () => {
    // (a small gap can be closed with a little of your cash)
    const { offer: r, why } = makeItWork(league, offer, [], { cash: true, best: true });
    if (!r) {
      const gap = salaryMatchGap(league, offer, 'a');
      const out = offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
      useStore
        .getState()
        .toast(
          why === 'salary'
            ? `You need to send at least ${money(out + gap)} in salary, and no player (or pair) of yours makes that work.`
            : why === 'theirSalary'
              ? `${pt.abbrev} can't take back that much salary, and has no contract to send along that makes it work. Send less.`
              : `${pt.abbrev} can't find a version of this they'd take. Ask for less.`,
          'bad',
        );
      return;
    }
    // (their side may add a contract so they can take back your salary)
    const theirs = r.b.pids.filter((x) => !offer.b.pids.includes(x)).map((pid) => playerName(league.players[pid]));
    const addP = r.a.pids.filter((x) => !offer.a.pids.includes(x));
    const addD = r.a.dpids.filter((x) => !offer.a.dpids.includes(x));
    const addC = (r.a.cash ?? 0) - (offer.a.cash ?? 0);
    const names = [
      ...addP.map((pid) => playerName(league.players[pid])),
      ...addD.map((d) =>
        pickLabel(
          league,
          league.draftPicks.find((x) => x.dpid === d)!,
        ),
      ),
      ...(addC > 0 ? [`${moneyExact(addC)} in cash`] : []),
    ];
    setGive(selOf(r.a));
    setGet(selOf(r.b));
    const match = theirs.length ? `${theirs.join(' + ')} to match salary` : '';
    useStore
      .getState()
      .toast(
        names.length
          ? `${pt.abbrev} would do it if you add ${names.join(' + ')}${match ? `, sending ${match}` : ''}.`
          : match
            ? `${pt.abbrev} would do it sending ${match}.`
            : `${pt.abbrev} would accept this as is.`,
        'good',
      );
  };

  return (
    <main className="page fo-page">
      <PageHeader
        title="Trade"
        sub={[closed ? 'Closed' : deadlineLabel(league), s > league.season ? `${seasonLabel(s)} salaries` : ''].filter(Boolean).join(' · ') || undefined}
        back
        right={<TradeHelp league={league} season={s} />}
      />

      {closed && (
        <Callout tone="warn" icon={<Ban size={18} className="warn" />}>
          {phaseErrs[0]}
        </Callout>
      )}

      <Segmented
        tabs
        label="Trade tool"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'build', label: 'Build' },
          { id: 'find', label: 'Find' },
          {
            id: 'block',
            // "Block" fits the phone's row; its name stays the full one (it contains the visible word)
            label: (
              <>
                <span aria-hidden="true">Block</span>
                <span className="sr-only">Trading block</span>
              </>
            ),
          },
          { id: 'offers', label: offers ? `Offers · ${offers}` : 'Offers' },
        ]}
      />

      {tab === 'offers' && <OffersTab league={league} closed={closed} focus={focus} onReview={loadDeal} />}

      {tab === 'offers' ? null : tab === 'build' ? (
        <>
          <PartnerSlab league={league} tid={partner} season={s} onPick={pickPartner} />
          {ask && ask.tid === partner && <AskCallout league={league} ask={ask} onClose={() => setAsk(null)} />}
          <DealCard league={league} partner={partner} offer={offer} give={cleanGive} get={cleanGet} onGive={setGive} onGet={setGet} onReset={reset} />
          <div className="fo-only-sm">
            <Segmented
              label="Assets shown"
              value={side}
              onChange={setSide}
              options={[
                { id: 'theirs', label: `${pt.abbrev} assets${cleanGet.pids.length + cleanGet.dpids.length ? ` · ${cleanGet.pids.length + cleanGet.dpids.length}` : ''}` },
                { id: 'mine', label: `Your assets${cleanGive.pids.length + cleanGive.dpids.length ? ` · ${cleanGive.pids.length + cleanGive.dpids.length}` : ''}` },
              ]}
            />
          </div>
          <div className="fo-split">
            <div className={side === 'theirs' ? '' : 'fo-hide-sm'}>
              <AssetList league={league} tid={partner} offer={offer} season={s} sel={cleanGet} onChange={setGet} title={`${pt.abbrev} send`} />
            </div>
            <div className={side === 'mine' ? '' : 'fo-hide-sm'}>
              <AssetList league={league} tid={user} offer={offer} season={s} sel={cleanGive} onChange={setGive} title="You send" />
            </div>
          </div>
          {/* (keyed: a new deal or partner starts with the dock folded) */}
          <Dock
            key={empty ? 'none' : offer.b.tid}
            league={league}
            offer={offer}
            ev={ev}
            empty={empty}
            season={s}
            onPropose={propose}
            onWork={whatWorks}
            force={force}
            onForce={forceIt}
          />
        </>
      ) : tab === 'find' ? (
        <TradeFinder league={league} state={finder} onChange={setFinder} onPick={pickTarget} />
      ) : (
        <TradingBlock
          league={league}
          shop={shop}
          setShop={setShop}
          closed={closed}
          onLoad={(o) => {
            setPartner(o.b.tid);
            setGive(selOf(o.a));
            setGet(selOf(o.b));
            setSide('theirs');
            setTab('build');
            window.scrollTo({ top: 0, behavior: scrollBehavior() });
          }}
        />
      )}
      <CounterSheet
        league={league}
        base={counters?.base ?? null}
        counters={counters?.list ?? []}
        onClose={() => setCounters(null)}
        onAccept={(o) => {
          setCounters(null);
          take(o);
        }}
        onEdit={(o) => {
          setCounters(null);
          loadDeal(o);
        }}
      />
      <ConfirmSheet
        league={league}
        offer={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={(o) => {
          setConfirm(null);
          execute(o);
        }}
      />
    </main>
  );
}
