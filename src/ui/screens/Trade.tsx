import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ban, Check, Handshake, Info, Lock, RotateCcw, Ticket, X } from 'lucide-react';
import type { DraftPick, League, Player } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, TWO_WAY_MAX, curTeamSeason, payroll, playerName, rosterMaxNow, teamPlayers, winPct } from '../../core/league/helpers';
import { capPayroll, withHoldsMemo } from '../../core/league/freeAgency';
import {
  MAX_FIRSTS_OUT,
  canMakeWork,
  capSalary,
  evaluateTrade,
  executeTrade,
  makeItWork,
  pickLabel,
  salaryMatchGap,
  tradeRoster,
  untradeable,
  validateTrade,
  type TradeEval,
  type TradeOffer,
} from '../../core/league/trades';
import { playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Empty, Help, Ovr, PageHeader, Segmented, scrollBehavior } from '../components/ui';
import { STRATEGY_META, Callout, capSeason, contractYearsLabel, fmtM, fmtMs } from '../office/common';
import { blockOffers } from '../office/tradeBlock';
import { rosterNames } from '../stats';

interface Sel {
  pids: number[];
  dpids: number[];
}
const EMPTY: Sel = { pids: [], dpids: [] };
const ids = (s: string | null) =>
  s
    ? s
        .split(',')
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
    : [];
const toggle = (arr: number[], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

function readParams(league: League, params: URLSearchParams) {
  const user = league.userTid;
  const w = params.get('with');
  const wt = w !== null ? Number(w) : NaN;
  const fallback = league.teams.find((t) => t.tid !== user)!.tid;
  const partner = Number.isFinite(wt) && league.teams[wt] && wt !== user ? wt : fallback;
  const give = ids(params.get('give'));
  const get = ids(params.get('get'));
  // "Trade him" from the contracts list opens the trading block for that player
  const shop = w === null && give.length === 1 && !get.length ? give[0] : null;
  return { partner, give: { pids: give, dpids: [] }, get: { pids: get, dpids: [] }, shop };
}

export default function Trade() {
  const league = useLeague();
  const [params] = useSearchParams();
  const user = league.userTid;
  const init = useMemo(() => readParams(league, params), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [partner, setPartner] = useState(init.partner);
  const [give, setGive] = useState<Sel>(init.give);
  const [get, setGet] = useState<Sel>(init.get);
  const [tab, setTab] = useState<'build' | 'block'>(init.shop !== null ? 'block' : 'build');
  const [shop, setShop] = useState<number | null>(init.shop);
  const [side, setSide] = useState<'theirs' | 'mine'>('theirs');

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
    setTab(r.shop !== null ? 'block' : 'build');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const s = capSeason(league);
  const pt = league.teams[partner];
  // drop anything that is no longer where it was (trades, releases, used picks)
  const cleanGive: Sel = {
    pids: give.pids.filter((pid) => league.players[pid]?.tid === user),
    dpids: give.dpids.filter((d) => league.draftPicks.some((x) => x.dpid === d && x.tid === user)),
  };
  const cleanGet: Sel = {
    pids: get.pids.filter((pid) => league.players[pid]?.tid === partner),
    dpids: get.dpids.filter((d) => league.draftPicks.some((x) => x.dpid === d && x.tid === partner)),
  };
  const offer: TradeOffer = { a: { tid: user, ...cleanGive }, b: { tid: partner, ...cleanGet } };
  const offerKey = JSON.stringify(offer);
  const empty = !cleanGive.pids.length && !cleanGive.dpids.length && !cleanGet.pids.length && !cleanGet.dpids.length;
  // offerKey stands for the offer (a new object every render) and whether it is empty
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ev = useLeagueMemo(() => (empty ? null : evaluateTrade(league, offer)), [league, offerKey]);
  const phaseErrs = useLeagueMemo(
    () => validateTrade(league, { a: { tid: user, pids: [], dpids: [] }, b: { tid: partner, pids: [], dpids: [] } }).filter((e) => !/empty/i.test(e)),
    [league, partner, user],
  );
  const closed = phaseErrs.length > 0;

  const pickPartner = (tid: number) => {
    if (tid === partner) return;
    setPartner(tid);
    setGet(EMPTY);
    setSide('theirs');
  };

  const reset = () => {
    setGive(EMPTY);
    setGet(EMPTY);
  };

  const propose = () => {
    // judging a deal changes nothing: only an accepted one is saved
    const r = evaluateTrade(league, offer);
    if (!r.accept) {
      useStore.getState().toast(`${pt.abbrev}: ${r.message}`, 'bad');
      return;
    }
    useStore.getState().mutate((l) => executeTrade(l, offer));
    const names = cleanGet.pids.map((pid) => league.players[pid].lastName);
    const picks = cleanGet.dpids.length;
    const arrive = names.length ? ` Welcome ${names.join(', ')}: ${names.length === 1 ? 'he joins' : 'they join'} the end of your rotation.` : '';
    const got = picks ? ` You${names.length ? ' also' : ''} get ${picks === 1 ? 'a draft pick' : `${picks} draft picks`}.` : '';
    useStore.getState().toast(`Trade done with ${pt.abbrev}!${arrive}${got}`, 'good');
    reset();
  };

  const whatWorks = () => {
    const { offer: r, why } = makeItWork(league, offer);
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
    const names = [
      ...addP.map((pid) => playerName(league.players[pid])),
      ...addD.map((d) =>
        pickLabel(
          league,
          league.draftPicks.find((x) => x.dpid === d)!,
        ),
      ),
    ];
    setGive({ pids: r.a.pids, dpids: r.a.dpids });
    useStore.getState().toast(names.length ? `${pt.abbrev} would do it if you add ${names.join(' + ')}.` : `${pt.abbrev} would accept this as is.`, 'good');
  };

  return (
    <main className="page">
      <PageHeader
        title="Trade"
        sub={league.phase === 'regular' && !closed ? `${deadlineLabel(league.tradeDeadlineDay - league.day)} · salaries for ${seasonLabel(s)}` : `Salaries for ${seasonLabel(s)}`}
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
              <b>Timing.</b> No trades after the deadline or during the postseason. Trading reopens after the playoffs, with the draft lottery.
            </p>
            <p style={{ margin: 0 }}>
              <b>How AI GMs judge deals.</b> They value ability, age, potential and contract: a bad contract counts against a package, and taking on salary over the tax costs them.
              Contenders want help now; rebuilders pay more for youth and picks and less for veterans. A star is worth more than several lesser players, and players they'd have to
              waive to fit the roster count for nothing.
              {league.settings.difficulty === 'casual' ? ' On casual they take a little less than fair value, but not for players or picks you got in a trade this season.' : ''}
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
        value={tab}
        onChange={setTab}
        options={[
          { id: 'build', label: 'Trade builder' },
          { id: 'block', label: 'Trading block' },
        ]}
      />

      {tab === 'build' ? (
        <>
          <TeamPicker league={league} partner={partner} onPick={pickPartner} />
          <PartnerCard league={league} tid={partner} season={s} />
          <DealCard league={league} partner={partner} give={cleanGive} get={cleanGet} onGive={setGive} onGet={setGet} onReset={reset} />
          <div className="fo-only-sm">
            <Segmented
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
              <AssetList league={league} tid={partner} season={s} sel={cleanGet} onChange={setGet} title={`${pt.region} ${pt.name} send`} />
            </div>
            <div className={side === 'mine' ? '' : 'fo-hide-sm'}>
              <AssetList league={league} tid={user} season={s} sel={cleanGive} onChange={setGive} title="You send" />
            </div>
          </div>
          <Dock league={league} offer={offer} ev={ev} empty={empty} season={s} onPropose={propose} onWork={whatWorks} />
        </>
      ) : (
        <TradingBlock
          league={league}
          shop={shop}
          setShop={setShop}
          closed={closed}
          onLoad={(o) => {
            setPartner(o.b.tid);
            setGive({ pids: o.a.pids, dpids: o.a.dpids });
            setGet({ pids: o.b.pids, dpids: o.b.dpids });
            setSide('theirs');
            setTab('build');
            window.scrollTo({ top: 0, behavior: scrollBehavior() });
          }}
        />
      )}
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
    <div className="fo-teams" ref={ref} role="tablist" aria-label="Trade partner">
      {teams.map((t) => (
        <button key={t.tid} role="tab" aria-selected={t.tid === partner} className={`fo-team ${t.tid === partner ? 'on' : ''}`} onClick={() => onPick(t.tid)}>
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
    </Card>
  );
}

// ------------------------------------------------------------------ deal summary (selected assets)

function DealCard({
  league,
  partner,
  give,
  get,
  onGive,
  onGet,
  onReset,
}: {
  league: League;
  partner: number;
  give: Sel;
  get: Sel;
  onGive: (s: Sel) => void;
  onGet: (s: Sel) => void;
  onReset: () => void;
}) {
  const any = give.pids.length + give.dpids.length + get.pids.length + get.dpids.length > 0;
  const col = (title: string, tid: number, sel: Sel, set: (s: Sel) => void) => (
    <div className="col" style={{ gap: 6, minWidth: 0 }}>
      <div className="row" style={{ gap: 6 }}>
        <TeamLogo tid={tid} size={18} />
        <span className="tiny upper bold dim">{title}</span>
      </div>
      {sel.pids.length + sel.dpids.length === 0 && <div className="small dim">Nothing yet</div>}
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
        return (
          <span key={d} className="fo-pill">
            <Ticket size={16} style={{ marginLeft: 4 }} className="dim" />
            <span className="ellipsis grow">{pickLabel(league, dp)}</span>
            <button className="x" aria-label="Remove pick" onClick={() => set({ ...sel, dpids: sel.dpids.filter((x) => x !== d) })}>
              <X size={14} />
            </button>
          </span>
        );
      })}
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
    </Card>
  );
}

// ------------------------------------------------------------------ asset lists

function AssetList({ league, tid, season, sel, onChange, title }: { league: League; tid: number; season: number; sel: Sel; onChange: (s: Sel) => void; title: string }) {
  const players = teamPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
  const tw = players.filter((p) => p.contract.twoWay).length;
  const nameOf = rosterNames(players, { initial: true });
  const picks = league.draftPicks.filter((d) => d.tid === tid).sort((a, b) => a.season - b.season || a.round - b.round || (a.pick ?? 99) - (b.pick ?? 99));
  return (
    <Card className="flush" title={undefined}>
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
          {p.mood.tradeRequest && (
            <span className="tag warn" style={{ height: 16, fontSize: 10, padding: '0 4px' }}>
              REQ
            </span>
          )}
          {p.contract.twoWay && (
            <span className="tag" style={{ height: 16, fontSize: 10, padding: '0 4px' }}>
              2-WAY
            </span>
          )}
          {locked && (
            <span className="tag bad" style={{ height: 16, fontSize: 10, padding: '0 4px' }}>
              {{ expiring: 'EXPIRING', option: 'OPTION', signed: 'SIGNED' }[locked.kind]}
            </span>
          )}
        </div>
        <div className="fo-meta tiny">
          {p.pos} · {playerAge(p, league.season)} · {p.archetype}
          {p.pot > p.ovr + 2 ? ` · POT ${p.pot}` : ''}
        </div>
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

const deadlineLabel = (days: number) => (days < 0 ? 'Deadline passed' : days === 0 ? 'Deadline today' : `Deadline in ${days} day${days === 1 ? '' : 's'}`);

function reaction(ev: TradeEval): { pct: number; label: string; color: string } {
  if (ev.accept) return { pct: 100, label: ev.message, color: 'var(--good)' };
  const gap = -ev.delta;
  const rel = ev.valueOut > 0 ? gap / ev.valueOut : gap > 0 ? 1 : 0;
  const pct = Math.max(4, Math.min(94, (1 - rel) * 100));
  // value is there but something else blocks it: the rules, or too many first-round picks
  if (ev.delta >= 0) return ev.ok ? { pct: 94, label: ev.message, color: 'var(--warn)' } : { pct: 100, label: 'They would take it', color: 'var(--good)' };
  if (rel > 0.6) return { pct, label: 'Not even close', color: 'var(--bad)' };
  if (rel > 0.25) return { pct, label: 'You need to add significant value', color: 'var(--warn)' };
  return { pct, label: 'Close — add a little more', color: 'var(--tier-elite)' };
}

function Dock({
  league,
  offer,
  ev,
  empty,
  season,
  onPropose,
  onWork,
}: {
  league: League;
  offer: TradeOffer;
  ev: TradeEval | null;
  empty: boolean;
  season: number;
  onPropose: () => void;
  onWork: () => void;
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
              </button>
            );
          })}
        </div>
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
