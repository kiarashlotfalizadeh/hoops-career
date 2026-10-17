import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ban, Banknote, Check, Handshake, Info, Lock, LockKeyhole, Repeat, RotateCcw, Ticket, X, Zap } from 'lucide-react';
import type { DraftPick, League, Player } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, TWO_WAY_MAX, curTeamSeason, payroll, playerName, rosterMaxNow, teamPlayers, winPct } from '../../core/league/helpers';
import { capPayroll, withHoldsMemo } from '../../core/league/freeAgency';
import {
  MAX_FIRSTS_OUT,
  availability,
  canMakeWork,
  capSalary,
  cashRoom,
  counterOffers,
  evaluateTrade,
  executeTrade,
  fmtCash,
  makeItWork,
  pickLabel,
  swapSeasons,
  salaryMatchGap,
  tradeRoster,
  untradeable,
  validateTrade,
  valueTier,
  valueVerdict,
  type CounterOffer,
  type TradeEval,
  type TradeOffer,
  type TradeSide,
} from '../../core/league/trades';
import { playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Empty, Help, Ovr, PageHeader, Segmented, scrollBehavior } from '../components/ui';
import { STRATEGY_META, Callout, capSeason, contractYearsLabel, deadlineLabel, fmtM, fmtMs } from '../office/common';
import { blockOffers } from '../office/tradeBlock';
import { isUntouchable, openProposals } from '../../core/league/proposals';
import { OffersTab } from '../office/OffersTab';
import { UntouchableToggle } from '../office/Untouchable';
import { rosterNames } from '../stats';
import { TierLine, TradeNotes } from '../trade/common';
import { CounterSheet } from '../trade/CounterSheet';
import { CashControl, ProtectSelect, SwapChips, TermsList, protectable } from '../trade/Terms';
import { AskCallout, FINDER_DEFAULT, TradeFinder, type Ask, type FinderState } from '../trade/TradeFinder';
import { RecentDeals } from '../league/MovesTab';
import { continueDraft } from '../../core/league/season';
import { checkForceTrade, forceTrade, type EditCheck } from '../../core/league/godMode';

interface Sel {
  pids: number[];
  dpids: number[];
  /** Protections on the team's own firsts it sends: dpid -> top-N. */
  protect?: Record<number, number>;
  /** Drafts in which it gives the other team the right to swap firsts. */
  swaps?: number[];
  /** Cash it sends ($K). */
  cash?: number;
}
const EMPTY: Sel = { pids: [], dpids: [] };
/** A side of an offer as the builder holds it. */
const selOf = (s: TradeSide): Sel => ({ pids: s.pids, dpids: s.dpids, protect: s.protect, swaps: s.swaps, cash: s.cash });
const ids = (s: string | null) =>
  s
    ? s
        .split(',')
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
    : [];
const toggle = (arr: number[], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

type Tab = 'build' | 'find' | 'block' | 'offers';

function readParams(league: League, params: URLSearchParams): { partner: number; give: Sel; get: Sel; shop: number | null; tab: Tab } {
  const user = league.userTid;
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
    };
  const w = params.get('with');
  const wt = w !== null ? Number(w) : NaN;
  const fallback = league.teams.find((t) => t.tid !== user)!.tid;
  const partner = Number.isFinite(wt) && league.teams[wt] && wt !== user ? wt : fallback;
  const give: Sel = { pids: ids(params.get('give')), dpids: ids(params.get('givedp')) };
  const get: Sel = { pids: ids(params.get('get')), dpids: ids(params.get('getdp')) };
  // "Trade him" from the contracts list opens the trading block for that player
  const shop = w === null && give.pids.length === 1 && !give.dpids.length && !get.pids.length && !get.dpids.length ? give.pids[0] : null;
  return { partner, give, get, shop, tab: pr !== null || params.get('tab') === 'offers' ? 'offers' : shop !== null ? 'block' : 'build' };
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
  const [side, setSide] = useState<'theirs' | 'mine'>('theirs');
  // a turned-down deal and what they'd do instead; the finder's filters and the ask it last loaded
  const [counters, setCounters] = useState<{ base: TradeOffer; list: CounterOffer[] } | null>(null);
  const [finder, setFinder] = useState<FinderState>(FINDER_DEFAULT);
  const [ask, setAsk] = useState<Ask | null>(null);

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
    setTab(r.tab);
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
    const abbrev = league.teams[o.b.tid].abbrev;
    const r = evaluateTrade(league, o);
    if (!r.accept) {
      useStore.getState().toast(`${abbrev}: ${r.message}`, 'bad');
      return false;
    }
    useStore.getState().mutate((l) => {
      executeTrade(l, o);
      // a pick traded on draft night: the draft moves on to the next team that picks (or yours)
      if (l.phase === 'draft') continueDraft(l);
    });
    const names = o.b.pids.map((pid) => league.players[pid].lastName);
    const picks = o.b.dpids.length;
    const arrive = names.length ? ` Welcome ${names.join(', ')}: ${names.length === 1 ? 'he joins' : 'they join'} the end of your rotation.` : '';
    const got = picks ? ` You${names.length ? ' also' : ''} get ${picks === 1 ? 'a draft pick' : `${picks} draft picks`}.` : '';
    useStore.getState().toast(`Trade done with ${abbrev}!${arrive}${got}`, 'good');
    reset();
    setAsk(null);
    return true;
  };

  /** God mode: the deal goes through whatever their GM and the rules say. */
  const forceIt = () => {
    const abbrev = league.teams[offer.b.tid].abbrev;
    if (checkForceTrade(league, offer).errors.length) return;
    useStore.getState().mutate((l) => {
      forceTrade(l, offer);
      if (l.phase === 'draft') continueDraft(l);
    });
    useStore.getState().toast(`Trade forced through with ${abbrev}.`, 'good');
    reset();
    setAsk(null);
  };

  const propose = () => {
    const r = evaluateTrade(league, offer);
    if (r.accept) {
      execute(offer);
      return;
    }
    // turned down: the versions they would take instead (worked out only now: it takes a moment)
    const list = r.ok ? counterOffers(league, offer) : [];
    if (list.length) setCounters({ base: offer, list });
    else useStore.getState().toast(`${pt.abbrev}: ${r.message}`, 'bad');
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
    const result = closed ? null : makeItWork(league, want);
    loadDeal(result?.offer ?? want);
    setAsk({ tid: p.tid, pid, result });
  };

  const whatWorks = () => {
    // (a small gap can be closed with a little of your cash)
    const { offer: r, why } = makeItWork(league, offer, [], { cash: true });
    if (!r) {
      const gap = salaryMatchGap(league, offer, 'a');
      const out = offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, s), 0);
      useStore
        .getState()
        .toast(
          why === 'salary'
            ? `You need to send at least ${fmtM(out + gap)} in salary, and no player (or pair) of yours makes that work.`
            : `${pt.abbrev} can't find a version of this they'd take. Ask for less.`,
          'bad',
        );
      return;
    }
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
      ...(addC > 0 ? [`${fmtCash(addC)} in cash`] : []),
    ];
    setGive(selOf(r.a));
    useStore.getState().toast(names.length ? `${pt.abbrev} would do it if you add ${names.join(' + ')}.` : `${pt.abbrev} would accept this as is.`, 'good');
  };

  return (
    <main className="page">
      <PageHeader
        title="Trade"
        sub={!closed && deadlineLabel(league) ? `${deadlineLabel(league)} · salaries for ${seasonLabel(s)}` : `Salaries for ${seasonLabel(s)}`}
        back
        right={
          <Help title="Trade rules">
            <p style={{ margin: 0 }}>
              <b>Salary matching.</b> If a team is over the cap ({fmtM(CAP_FOR(league, s).salaryCap)}) after the trade, it can take back at most 125% of the salary it sends out,
              plus $0.1M. Teams under the cap can absorb salary freely. A team that used its mid-level exception this season can't take on salary past the tax line (
              {fmtM(CAP_FOR(league, s).luxuryTax)}).
            </p>
            <p style={{ margin: 0 }}>
              <b>Rosters.</b> A team taking in more players than it sends can't go over {CAP.rosterMax} during the season ({OFFSEASON_ROSTER_MAX} in the offseason), and in season
              no team can drop below {CAP.rosterMin}. Two-way players don't count, but each team has only {TWO_WAY_MAX} two-way slots.
            </p>
            <p style={{ margin: 0 }}>
              <b>Expiring contracts.</b> After the season, players whose contracts are up can only be re-signed or let go, not traded, and a player with a player option on next
              season can't be traded until he decides after the draft. Until free agency opens, each team's own expiring players it plans to keep count against its cap at about
              their asking price (cap holds).
            </p>
            <p style={{ margin: 0 }}>
              <b>No trade-backs.</b> A team can't reacquire a player or pick it traded away until the next season.
            </p>
            <p style={{ margin: 0 }}>
              <b>Draft picks.</b> No team can be left without a first-round pick in two drafts in a row, and no AI team gives up more than {MAX_FIRSTS_OUT} firsts in one deal.
            </p>
            <p style={{ margin: 0 }}>
              <b>Protections.</b> A team can protect its own first as it trades it (top 4, 8, 10, 14 or 20): if the pick lands in those slots it stays home and nothing more is
              owed. It's worth less to the team getting it. A pick already protected, or one acquired from another team, keeps its terms, and a pick in a swap can't be protected.
            </p>
            <p style={{ margin: 0 }}>
              <b>Pick swaps.</b> A team can give another the right to swap firsts in a future draft when each holds its own, unprotected first of that draft. When the lottery sets
              the order, the team holding the right takes the other first instead of its own if that one landed higher. The right goes with the pick that carries it if that pick is
              traded, and each first can be in one swap. AI GMs value the right by how likely the swap is and what it would gain, on the projection they value picks with.
            </p>
            <p style={{ margin: 0 }}>
              <b>Cash.</b> Each team can send, and receive, up to {fmtCash(cashRoom(league, user).limit)} in cash in trades a season (about 5% of the cap). Cash isn't salary: it
              doesn't match or count against the cap. It comes out of the sender's profit and goes onto the receiver's. AI GMs value $2-3M about like a typical second-round pick,
              rebuilders a little more and contenders less.
            </p>
            <p style={{ margin: 0 }}>
              <b>Timing.</b> No trades after the deadline or during the postseason. Trading reopens after the playoffs, with the draft lottery.
            </p>
            <p style={{ margin: 0 }}>
              <b>How AI GMs judge deals.</b> They value ability, age, potential and contract: a bad contract counts against a package, and taking on salary over the tax costs them.
              Contenders want help now; rebuilders pay more for youth and picks and less for veterans. A star is worth more than several lesser players, and players they'd have to
              waive to fit the roster count for nothing.
              {league.settings.difficulty === 'casual' ? ' On casual they take a little less than fair value, but not for players or picks you got in a trade this season.' : ''}
            </p>
            <p style={{ margin: 0 }}>
              <b>Negotiating.</b> Under the meter they tell you their main reasons, and warn you when you'd give up far more value than you get. When they say no to a proposal,
              they offer the versions they would take: something more from you, one of their pieces left out, or one of their bad contracts for you to absorb.
            </p>
          </Help>
        }
      />

      {closed && (
        <Callout tone="warn" icon={<Ban size={18} className="warn" />}>
          <b>Trading is closed.</b> {phaseErrs[0]} You can still browse rosters and plan.
        </Callout>
      )}

      <Segmented
        label="Trade tool"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'build', label: 'Build' },
          { id: 'find', label: 'Find' },
          { id: 'block', label: 'Trading block' },
          { id: 'offers', label: `Offers${openProposals(league).length ? ` · ${openProposals(league).length}` : ''}` },
        ]}
      />

      {tab === 'offers' && (
        <OffersTab
          league={league}
          closed={closed}
          onCounter={(o) => {
            setPartner(o.b.tid);
            setGive(selOf(o.a));
            setGet(selOf(o.b));
            setSide('theirs');
            setTab('build');
            window.scrollTo({ top: 0, behavior: scrollBehavior() });
          }}
        />
      )}

      {tab === 'offers' ? null : tab === 'build' ? (
        <>
          <TeamPicker league={league} partner={partner} onPick={pickPartner} />
          <PartnerCard league={league} tid={partner} season={s} />
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
              <AssetList league={league} tid={partner} offer={offer} season={s} sel={cleanGet} onChange={setGet} title={`${pt.region} ${pt.name} send`} />
            </div>
            <div className={side === 'mine' ? '' : 'fo-hide-sm'}>
              <AssetList league={league} tid={user} offer={offer} season={s} sel={cleanGive} onChange={setGive} title="You send" />
            </div>
          </div>
          <Dock league={league} offer={offer} ev={ev} empty={empty} season={s} onPropose={propose} onWork={whatWorks} force={force} onForce={forceIt} />
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
          execute(o);
        }}
        onEdit={(o) => {
          setCounters(null);
          loadDeal(o);
        }}
      />
    </main>
  );
}

// ------------------------------------------------------------------ partner picker

function TeamPicker({ league, partner, onPick }: { league: League; partner: number; onPick: (tid: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.fo-team.on');
    const box = ref.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: scrollBehavior() });
  }, [partner]);
  const teams = league.teams.filter((t) => t.tid !== league.userTid).sort((a, b) => a.abbrev.localeCompare(b.abbrev));
  return (
    <div className="fo-teams" ref={ref} role="group" aria-label="Trade partner">
      {teams.map((t) => (
        <button key={t.tid} aria-pressed={t.tid === partner} className={`fo-team ${t.tid === partner ? 'on' : ''}`} onClick={() => onPick(t.tid)}>
          <TeamLogo tid={t.tid} size={32} />
          {t.abbrev}
        </button>
      ))}
    </div>
  );
}

function PartnerCard({ league, tid, season }: { league: League; tid: number; season: number }) {
  const t = league.teams[tid];
  const ts = curTeamSeason(league, tid);
  const prev = t.seasons.find((x) => x.season === league.season - 1);
  const rec = ts.won + ts.lost > 0 ? `${ts.won}-${ts.lost}` : prev ? `${prev.won}-${prev.lost} last season` : '0-0';
  const pay = capPayroll(league, tid, season);
  const holds = pay - payroll(league, tid, season);
  const cap = CAP_FOR(league, season);
  const st = STRATEGY_META[t.strategy];
  // standard contracts the deal counts, as the dock does: two-way deals sit outside the 15, and after the season expiring ones are leaving
  const n = tradeRoster(league, tid).length;
  return (
    <Card className="tight">
      <div className="row" style={{ gap: 10 }}>
        <TeamLogo tid={tid} size={42} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">
            {t.region} {t.name}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 2 }}>
            <span className={`tag ${st.tone}`}>{st.label}</span>
            <span className="tiny dim num">
              {rec} · {n} players
            </span>
          </div>
        </div>
        <div className="fo-money">
          <div className="a" style={{ color: pay > cap.luxuryTax ? 'var(--bad)' : pay > cap.salaryCap ? 'var(--warn)' : 'var(--good)' }}>
            {pay > cap.salaryCap ? `${fmtM(pay - cap.salaryCap)} over` : `${fmtM(cap.salaryCap - pay)} space`}
          </div>
          <div className="b">payroll {fmtM(pay)}</div>
        </div>
      </div>
      <div className="tiny dim" style={{ marginTop: 8 }}>
        {st.help}
        {ts.won + ts.lost >= 10 ? ` Winning ${Math.round(winPct(ts) * 100)}% this season.` : ''}
        {holds > 0 ? ` Payroll includes ${fmtM(holds)} in cap holds for players they plan to re-sign.` : ''}
      </div>
      <RecentDeals league={league} tid={tid} />
    </Card>
  );
}

// ------------------------------------------------------------------ deal summary (selected assets)

function DealCard({
  league,
  partner,
  offer,
  give,
  get,
  onGive,
  onGet,
  onReset,
}: {
  league: League;
  partner: number;
  offer: TradeOffer;
  give: Sel;
  get: Sel;
  onGive: (s: Sel) => void;
  onGet: (s: Sel) => void;
  onReset: () => void;
}) {
  const size = (s: Sel) => s.pids.length + s.dpids.length + (s.swaps?.length ?? 0) + (s.cash ? 1 : 0);
  const any = size(give) + size(get) > 0;
  const protect = (sel: Sel, set: (s: Sel) => void, d: number, n: number) => {
    const next = { ...sel.protect };
    if (n) next[d] = n;
    else delete next[d];
    set({ ...sel, protect: next });
  };
  const col = (title: string, tid: number, sel: Sel, set: (s: Sel) => void) => (
    <div className="col" style={{ gap: 6, minWidth: 0 }}>
      <div className="row" style={{ gap: 6 }}>
        <TeamLogo tid={tid} size={18} />
        <span className="tiny upper bold dim">{title}</span>
      </div>
      {size(sel) === 0 && <div className="small dim">Nothing yet</div>}
      {sel.pids.map((pid) => {
        const p = league.players[pid];
        return (
          <span key={pid} className="fo-pill">
            <Ovr v={p.ovr} size="sm" />
            <span className="ellipsis grow">{p.lastName}</span>
            <button className="x" aria-label={`Remove ${p.lastName}`} onClick={() => set({ ...sel, pids: sel.pids.filter((x) => x !== pid) })}>
              <X size={14} />
            </button>
          </span>
        );
      })}
      {sel.dpids.map((d) => {
        const dp = league.draftPicks.find((x) => x.dpid === d)!;
        // a protection being set shows in its drop-down, one it already carries in its name
        const open = protectable(league, dp, tid);
        const label = pickLabel(league, dp);
        return (
          <div key={d} className="col" style={{ gap: 4, minWidth: 0 }}>
            <span className="fo-pill">
              <Ticket size={16} style={{ marginLeft: 4 }} className="dim" />
              <span className="ellipsis grow">{label}</span>
              <button className="x" aria-label={`Remove ${label}`} onClick={() => set({ ...sel, dpids: sel.dpids.filter((x) => x !== d) })}>
                <X size={14} />
              </button>
            </span>
            {/* a team's own first can go out protected */}
            {open && <ProtectSelect dp={dp} value={sel.protect?.[d] ?? 0} onChange={(n) => protect(sel, set, d, n)} />}
          </div>
        );
      })}
      {(sel.swaps ?? []).map((y) => (
        <span key={`s${y}`} className="fo-pill">
          <Repeat size={15} style={{ marginLeft: 4 }} className="dim" />
          <span className="ellipsis grow">{y} swap right</span>
          <button className="x" aria-label={`Remove the ${y} swap right`} onClick={() => set({ ...sel, swaps: sel.swaps!.filter((x) => x !== y) })}>
            <X size={14} />
          </button>
        </span>
      ))}
      {(sel.cash ?? 0) > 0 && (
        <span className="fo-pill">
          <Banknote size={16} style={{ marginLeft: 4 }} className="dim" />
          <span className="ellipsis grow">{fmtCash(sel.cash!)} cash</span>
          <button className="x" aria-label="Remove the cash" onClick={() => set({ ...sel, cash: 0 })}>
            <X size={14} />
          </button>
        </span>
      )}
    </div>
  );
  return (
    <Card
      className="tight"
      title={<h3>The deal</h3>}
      right={
        any ? (
          <button className="btn xs ghost" onClick={onReset}>
            <RotateCcw size={13} /> Clear
          </button>
        ) : undefined
      }
    >
      <div className="grid2" style={{ alignItems: 'start' }}>
        {col('You send', league.userTid, give, onGive)}
        {col('You get', partner, get, onGet)}
      </div>
      <TermsList league={league} offer={offer} />
    </Card>
  );
}

// ------------------------------------------------------------------ asset lists

function AssetList({
  league,
  tid,
  offer,
  season,
  sel,
  onChange,
  title,
}: {
  league: League;
  tid: number;
  offer: TradeOffer;
  season: number;
  sel: Sel;
  onChange: (s: Sel) => void;
  title: string;
}) {
  const other = offer.a.tid === tid ? offer.b : offer.a;
  // a draft can't be swapped both ways, nor while either team's own first of it is moving in the deal
  const moving = new Set([...offer.a.dpids, ...offer.b.dpids]);
  const taken = [
    ...(other.swaps ?? []),
    ...league.draftPicks.filter((d) => d.round === 1 && moving.has(d.dpid) && (d.originalTid === tid || d.originalTid === other.tid)).map((d) => d.season),
  ];
  const players = teamPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
  const tw = players.filter((p) => p.contract.twoWay).length;
  const nameOf = rosterNames(players, { initial: true });
  const picks = league.draftPicks.filter((d) => d.tid === tid).sort((a, b) => a.season - b.season || a.round - b.round || (a.pick ?? 99) - (b.pick ?? 99));
  return (
    <Card className="flush">
      <div className="row between" style={{ padding: '12px 12px 6px' }}>
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <TeamLogo tid={tid} size={22} />
          <h3 className="ellipsis" style={{ fontSize: 14, color: 'var(--text-2)' }}>
            {title}
          </h3>
        </div>
        <span className="tiny dim">
          {players.length - tw} players{tw ? ` + ${tw} two-way` : ''}
        </span>
      </div>
      <div className="list">
        {players.map((p) => (
          <PlayerAsset
            key={p.pid}
            league={league}
            p={p}
            name={nameOf(p.pid)}
            season={season}
            on={sel.pids.includes(p.pid)}
            onToggle={() => onChange({ ...sel, pids: toggle(sel.pids, p.pid) })}
          />
        ))}
      </div>
      <div className="fo-sec" style={{ margin: '10px 12px 4px' }}>
        Draft picks
      </div>
      {picks.length === 0 ? (
        <div className="small dim" style={{ padding: '6px 12px 12px' }}>
          No draft picks.
        </div>
      ) : (
        <div className="list">
          {picks.map((dp) => (
            <PickAsset key={dp.dpid} league={league} dp={dp} on={sel.dpids.includes(dp.dpid)} onToggle={() => onChange({ ...sel, dpids: toggle(sel.dpids, dp.dpid) })} />
          ))}
        </div>
      )}
      <div className="fo-sec" style={{ margin: '10px 12px 6px' }}>
        Swap rights
      </div>
      <SwapChips league={league} giver={tid} taker={other.tid} value={sel.swaps ?? []} taken={taken} onChange={(swaps) => onChange({ ...sel, swaps })} />
      <div className="fo-sec" style={{ margin: '4px 12px 6px' }}>
        Cash
      </div>
      <CashControl league={league} from={tid} to={other.tid} value={sel.cash ?? 0} blocked={(other.cash ?? 0) > 0} onChange={(cash) => onChange({ ...sel, cash })} />
    </Card>
  );
}

function PlayerAsset({ league, p, name, season, on, onToggle }: { league: League; p: Player; name: string; season: number; on: boolean; onToggle: () => void }) {
  const locked = untradeable(league, p);
  return (
    <button className={`fo-asset ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="fo-check">
        <Check size={14} strokeWidth={3} />
      </span>
      <Ovr v={p.ovr} size="sm" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 5 }}>
          <span className="fo-name small">{name}</span>
          {p.injury && (
            <span className="tag bad" style={{ height: 16, fontSize: 10, padding: '0 4px' }}>
              INJ
            </span>
          )}
          {p.contract.twoWay && (
            <span className="tag" style={{ height: 16, fontSize: 10, padding: '0 4px' }}>
              Two-way
            </span>
          )}
          {locked && (
            <span className="tag bad" style={{ height: 16, fontSize: 10, padding: '0 4px' }}>
              {{ expiring: 'Expiring', option: 'Option', signed: 'Signed' }[locked.kind]}
            </span>
          )}
        </div>
        <div className="fo-meta tiny">
          {/* the name line has no room for it: it leads the details instead */}
          {p.mood.tradeRequest && (
            <span className="warn" style={{ fontWeight: 700 }}>
              {/* you told him you'd move him */}
              {p.promise?.kind === 'trade' ? 'Promised a trade' : 'Wants a trade'} ·{' '}
            </span>
          )}
          {p.pos} · {playerAge(p, league.season)} · {p.archetype}
          {p.pot > p.ovr + 2 ? ` · POT ${p.pot}` : ''}
        </div>
        <TierLine tier={valueTier(league, p)} avail={availability(league, p)} />
      </div>
      <div className="fo-money">
        <div className="a">{fmtM(salaryFor(p, season))}</div>
        <div className="b">{contractYearsLabel(league, p, season)}</div>
      </div>
    </button>
  );
}

function PickAsset({ league, dp, on, onToggle }: { league: League; dp: DraftPick; on: boolean; onToggle: () => void }) {
  const own = dp.originalTid === dp.tid;
  return (
    <button className={`fo-asset ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on} style={{ minHeight: 48 }}>
      <span className="fo-check">
        <Check size={14} strokeWidth={3} />
      </span>
      <TeamLogo tid={dp.originalTid} size={26} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small bold ellipsis">{pickLabel(league, dp)}</div>
        <div className="tiny dim">{own ? 'Own pick' : `Acquired from ${league.teams[dp.originalTid].abbrev}`}</div>
      </div>
      <span className={`tag ${dp.round === 1 ? 'info' : ''}`}>R{dp.round}</span>
    </button>
  );
}

// ------------------------------------------------------------------ sticky summary dock

function reaction(ev: TradeEval): { pct: number; label: string; color: string } {
  if (ev.accept) return { pct: 100, label: ev.message, color: 'var(--good)' };
  // the AI's own verdict on how far the value is from enough
  const { gap: rel, label } = valueVerdict(ev);
  const pct = Math.max(4, Math.min(94, (1 - rel) * 100));
  // value is there but something else blocks it: the rules, or too many first-round picks
  if (ev.delta >= 0) return ev.ok ? { pct: 94, label: ev.message, color: 'var(--warn)' } : { pct: 100, label: 'They would take it', color: 'var(--good)' };
  return { pct, label, color: rel > 0.6 ? 'var(--bad)' : rel > 0.25 ? 'var(--warn)' : 'var(--tier-elite)' };
}

function Dock({
  league,
  offer,
  ev,
  empty,
  season,
  onPropose,
  onWork,
  force,
  onForce,
}: {
  league: League;
  offer: TradeOffer;
  ev: TradeEval | null;
  empty: boolean;
  season: number;
  onPropose: () => void;
  onWork: () => void;
  /** God mode is on: what stops the deal being forced (null when it's off). */
  force: EditCheck | null;
  onForce: () => void;
}) {
  const user = league.userTid;
  const cap = CAP_FOR(league, season);
  const key = JSON.stringify(offer);
  // in the summer each team's cap holds replay its re-signing plan: work them out once per offer, not every render
  const money = useLeagueMemo(
    () =>
      withHoldsMemo(() => ({
        capPay: capPayroll(league, user, season),
        theyreOver: !empty && salaryMatchGap(league, offer, 'b') > 0,
        workable: !empty && canMakeWork(league, offer),
      })),
    // key stands for the offer (a new object every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, user, season, empty, key],
  );
  // two-way pay sits outside the cap: it neither counts nor matches
  const out = offer.a.pids.reduce((a, pid) => a + capSalary(league, pid, season), 0);
  const inc = offer.b.pids.reduce((a, pid) => a + capSalary(league, pid, season), 0);
  // between the season and free agency your payroll counts the cap holds of the players you'd re-sign
  const holds = money.capPay - payroll(league, user, season);
  const after = money.capPay - out + inc;
  // standard roster spots (two-way players don't count)
  const std = (pids: number[]) => pids.filter((pid) => !league.players[pid]?.contract.twoWay).length;
  // after the season, only next season's contracts count (expiring deals are leaving)
  const rosterAfter = tradeRoster(league, user).length - std(offer.a.pids) + std(offer.b.pids);
  const theirAfter = tradeRoster(league, offer.b.tid).length - std(offer.b.pids) + std(offer.a.pids);
  const maxSize = rosterMaxNow(league);
  if (empty || !ev) {
    return (
      <div className="fo-dock">
        <div className="row" style={{ gap: 8 }}>
          <Info size={16} className="dim" />
          <span className="small dim2">Tap players or picks on either side to build a deal. The AI GM reacts live.</span>
        </div>
      </div>
    );
  }
  const r = reaction(ev);
  const ruleErrors = ev.errors.filter((e) => !/empty/i.test(e));
  // the helper can fix our side's salary matching, a full roster and the value, nothing else
  const theyreOver = money.theyreOver;
  const fixable = !ev.accept && money.workable;
  return (
    <div className="fo-dock">
      <div className="row between" style={{ gap: 8, marginBottom: 6 }}>
        <span className="small bold" style={{ color: r.color }}>
          {league.teams[offer.b.tid].abbrev}: {r.label}
        </span>
        <span className="tiny dim num">{ev.accept ? '✓' : `${Math.round(r.pct)}%`}</span>
      </div>
      <div className="fo-meter">
        <i style={{ width: `${r.pct}%`, background: r.color }} />
      </div>
      <div className="fo-meter-ticks">
        <span>Not close</span>
        <span>Add value</span>
        <span>Close</span>
        <span>Deal!</span>
      </div>
      {ev.notes.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {/* their two main reasons (one when a rule problem already needs the room) */}
          <TradeNotes notes={ev.notes.slice(0, ruleErrors.length ? 1 : 2)} />
        </div>
      )}
      {/* what each protection, swap and sum of cash does, a line each */}
      <TermsList league={league} offer={offer} short />
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 0.8fr', gap: 6 }}>
        <div>
          <div className="tiny dim upper bold">Salary</div>
          <div className="small num">
            Out <b>{fmtM(out)}</b>
          </div>
          <div className="small num">
            In <b>{fmtM(inc)}</b>
          </div>
        </div>
        <div>
          <div className="tiny dim upper bold">Payroll after</div>
          <div className="small num bold" style={{ color: after > cap.luxuryTax ? 'var(--bad)' : after > cap.salaryCap ? 'var(--warn)' : 'var(--good)' }}>
            {fmtM(after)}
          </div>
          <div className="tiny dim num">{after > cap.salaryCap ? `${fmtMs(after - cap.salaryCap)} vs cap` : `${fmtM(cap.salaryCap - after)} under`}</div>
          {holds > 0 && <div className="tiny dim num">incl. {fmtM(holds)} cap holds</div>}
        </div>
        <div>
          <div className="tiny dim upper bold">Rosters</div>
          <div className="small num bold" style={{ color: rosterAfter > maxSize || theirAfter > maxSize ? 'var(--bad)' : undefined }}>
            {rosterAfter} / {theirAfter}
          </div>
          <div className="tiny dim">you / them</div>
        </div>
      </div>
      {ruleErrors.length > 0 && (
        <div className="row top small" style={{ marginTop: 8, gap: 6 }}>
          <span className="tag bad" style={{ flex: 'none' }}>
            Not allowed
          </span>
          <span className="bad">
            {ruleErrors[0]}
            {ruleErrors.length > 1 ? ` (+${ruleErrors.length - 1} more)` : ''}
          </span>
        </div>
      )}
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn sm grow" style={{ paddingInline: 8 }} disabled={!fixable} onClick={onWork}>
          {theyreOver ? "They can't absorb that salary" : 'What would make this work?'}
        </button>
        <button className={`btn sm ${ev.accept ? 'good' : 'primary'}`} disabled={!ev.ok} onClick={onPropose}>
          <Handshake size={16} /> Propose
        </button>
      </div>
      {force && (
        <div className="col" style={{ marginTop: 8, gap: 4 }}>
          <button className="btn sm block" disabled={force.errors.length > 0} onClick={onForce}>
            <Zap size={16} /> Force this trade
          </button>
          <span className={`tiny ${force.errors.length ? 'bad' : force.warnings.length ? 'warn' : 'dim'}`}>
            {force.errors[0] ?? force.warnings[0] ?? 'God mode: it goes through whatever their GM and the trade rules say.'}
          </span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ trading block

function TradingBlock({
  league,
  shop,
  setShop,
  closed,
  onLoad,
}: {
  league: League;
  shop: number | null;
  setShop: (pid: number) => void;
  closed: boolean;
  onLoad: (o: TradeOffer) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const mine = teamPlayers(league, league.userTid).sort((a, b) => b.ovr - a.ovr);
  const pid = shop !== null && league.players[shop]?.tid === league.userTid ? shop : null;
  const target = pid !== null ? league.players[pid] : null;
  // expiring, option and recently signed players can't be moved at all: say so instead of shopping them
  const locked = target ? untradeable(league, target) : null;
  const isLocked = !!locked;
  const offers = useLeagueMemo(() => (pid !== null && !closed && !isLocked ? blockOffers(league, pid) : []), [league, pid, closed, isLocked]);
  return (
    <>
      <Card title={<h3>Shop a player</h3>} right={<span className="tiny dim">{mine.length} on roster</span>}>
        <div className="small dim2" style={{ marginBottom: 10 }}>
          Pick one of your players and see the best package every team would give you for him right now.
        </div>
        <div className="hscroll">
          {mine.map((p) => {
            const lock = untradeable(league, p);
            return (
              <button
                key={p.pid}
                className={`chip ${pid === p.pid ? 'on' : ''}`}
                style={{ flex: 'none', paddingLeft: 4, opacity: lock && pid !== p.pid ? 0.55 : undefined }}
                aria-pressed={pid === p.pid}
                onClick={() => setShop(p.pid)}
              >
                <Ovr v={p.ovr} size="sm" />
                {p.lastName}
                {lock && <Lock size={12} role="img" aria-label="can't be traded now" />}
                {isUntouchable(league, p.pid) && <LockKeyhole size={12} role="img" aria-label="untouchable" style={{ color: 'var(--accent-text)' }} />}
              </button>
            );
          })}
        </div>
        {target && (
          <div style={{ marginTop: 10 }}>
            <UntouchableToggle league={league} p={target} />
          </div>
        )}
      </Card>
      {closed ? (
        <Empty>Teams aren't taking calls until trading reopens.</Empty>
      ) : !target ? (
        <Empty>Choose a player above to see offers.</Empty>
      ) : locked ? (
        <Empty>{locked.why}</Empty>
      ) : offers.length === 0 ? (
        <Empty>Nobody has a package that works for {target.lastName} right now (value or salary matching).</Empty>
      ) : (
        <>
          <div className="fo-sec">
            {offers.length} team{offers.length > 1 ? 's' : ''} would deal for {target.lastName}
          </div>
          {(showAll ? offers : offers.slice(0, 8)).map((o) => {
            const t = league.teams[o.tid];
            // a player worth less than nothing to you (a bad contract): any taker is a salary dump, not a share of his value
            const dump = o.targetValue <= 0;
            const ratio = dump ? 0 : o.myValue / o.targetValue;
            const tone = dump
              ? { l: 'Salary dump', c: 'var(--good)' }
              : ratio >= 1.1
                ? { l: 'Overpay', c: 'var(--good)' }
                : ratio >= 0.9
                  ? { l: 'Fair value', c: 'var(--info)' }
                  : ratio >= 0.7
                    ? { l: 'Below value', c: 'var(--warn)' }
                    : { l: 'Lowball', c: 'var(--bad)' };
            const inSal = o.offer.b.pids.reduce((a, x) => a + capSalary(league, x), 0);
            return (
              <Card key={o.tid} className="tight">
                <div className="row" style={{ gap: 10 }}>
                  <TeamLogo tid={o.tid} size={34} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="bold ellipsis">
                      {t.region} {t.name}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>
                      <span className="tiny dim">{inSal > 0 ? `${fmtM(inSal)} back` : 'No salary back'}</span>
                    </div>
                  </div>
                  <div className="right">
                    <div className="small bold" style={{ color: tone.c }}>
                      {tone.l}
                    </div>
                    {!dump && <div className="tiny dim num">{Math.round(ratio * 100)}% of his value</div>}
                  </div>
                </div>
                <div className="col" style={{ gap: 6, marginTop: 10 }}>
                  {o.offer.b.pids.map((x) => {
                    const p = league.players[x];
                    return (
                      <div key={x} className="row" style={{ gap: 8 }}>
                        <Ovr v={p.ovr} size="sm" />
                        <Link to={`/player/${p.pid}`} className="small bold ellipsis grow">
                          {playerName(p)}
                        </Link>
                        <span className="tiny dim">
                          {p.pos} · {playerAge(p, league.season)}
                        </span>
                        <span className="small num">{fmtM(salaryFor(p, capSeason(league)))}</span>
                      </div>
                    );
                  })}
                  {o.offer.b.dpids.map((d) => {
                    const dp = league.draftPicks.find((x) => x.dpid === d)!;
                    return (
                      <div key={d} className="row" style={{ gap: 8 }}>
                        <Ticket size={18} className="dim" style={{ width: 28 }} />
                        <span className="small bold grow">{pickLabel(league, dp)}</span>
                      </div>
                    );
                  })}
                </div>
                <button className="btn sm block" style={{ marginTop: 10 }} onClick={() => onLoad(o.offer)}>
                  Open in trade builder
                </button>
              </Card>
            );
          })}
          {offers.length > 8 && !showAll && (
            <button className="btn ghost block" onClick={() => setShowAll(true)}>
              Show all {offers.length} offers
            </button>
          )}
        </>
      )}
    </>
  );
}
