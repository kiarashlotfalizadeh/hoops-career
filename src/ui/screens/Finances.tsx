import { OWNER_PROFIT_RANGE, OWNER_PROFIT_TARGET, seasonsInCharge } from '../../core/league/owner';
import { useQueryParam } from '../league/shared';
import { useLocation } from 'react-router-dom';
import { Building2, Dumbbell, GraduationCap, HeartPulse, Ticket, TriangleAlert, Users } from 'lucide-react';
import type { Team } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, curTeamSeason, payroll, revenueScale, twoWayRoster, winPct } from '../../core/league/helpers';
import { salaryFor } from '../../core/playerGen';
import {
  ARENA_CAPACITY,
  NATIONAL_REVENUE,
  OPERATIONS_PER_SEASON,
  PLAYOFF_PRICE_MULT,
  REVENUE_SHARING,
  TAX_SHARE_TO_NON_TAXPAYERS,
  attendanceFor,
  budgetCostPerSeason,
  profit,
  referencePrice,
} from '../../core/league/finances';
import { useLeague, useStore } from '../../state/store';
import { Card, Help, Kpi, PageHeader, Segmented, Slider, StatTable, Toggle, type Col } from '../components/ui';
import { CenterBar, Gauge, PLAYOFF_LABEL, SecTitle, fmtM, fmtMs, ordinal, ownerVerdict } from '../office/common';

type Tab = 'overview' | 'budget' | 'owner' | 'history';
type BudgetKey = 'coaching' | 'health' | 'facilities';

const PRACTICE: { id: Team['practice']; label: string; dev: string; risk: string }[] = [
  { id: 'light', label: 'Light', dev: 'Slower skill growth (about −0.35 rating points per skill each year)', risk: 'Fresher legs: least wear and injury risk' },
  { id: 'normal', label: 'Normal', dev: 'Standard development', risk: 'Standard wear and injury risk' },
  { id: 'intense', label: 'Intense', dev: 'Faster skill growth (about +0.45 rating points per skill each year)', risk: 'Heavier legs: more wear and injury risk' },
];

export default function Finances() {
  const league = useLeague();
  const loc = useLocation();
  const [tab, setTab] = useQueryParam<Tab>('tab', loc.pathname === '/owner' ? 'owner' : 'overview', ['overview', 'budget', 'owner', 'history']);
  const team = league.teams[league.userTid];
  return (
    <main className="page">
      <PageHeader title={tab === 'owner' ? 'Owner' : 'Finances'} sub={`${team.region} ${team.name} · ${seasonLabel(league.season)}`} back />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'overview', label: 'Overview' },
          { id: 'budget', label: 'Budget' },
          { id: 'owner', label: 'Owner' },
          { id: 'history', label: 'History' },
        ]}
      />
      {tab === 'overview' && <Overview team={team} />}
      {tab === 'budget' && <BudgetTab team={team} />}
      {tab === 'owner' && <OwnerTab />}
      {tab === 'history' && <HistoryTab team={team} />}
    </main>
  );
}

// ------------------------------------------------------------------ overview

function Overview({ team }: { team: Team }) {
  const league = useLeague();
  const ts = curTeamSeason(league, team.tid);
  const pr = profit(league, team.tid);
  const games = ts.won + ts.lost;
  const homeGames = ts.homeWon + ts.homeLost;
  const attAvg = homeGames ? ts.attendance / homeGames : 0;
  const attShown = homeGames ? attAvg : attendanceFor(league, team);
  const cap = CAP_FOR(league);
  const pay = payroll(league, team.tid);
  const scale = revenueScale(league);
  const budgets = (['coaching', 'health', 'facilities'] as const).reduce((a, k) => a + budgetCostPerSeason(league, team.budget[k]), 0);
  const tax = pay > cap.luxuryTax ? Math.round((pay - cap.luxuryTax) * CAP.taxRate) : 0;
  const shortfall = Math.max(0, cap.minPayroll - pay);
  // two-way deals sit outside the cap and the tax, but they are still paid
  const twoWayPay = twoWayRoster(league, team.tid).reduce((a, p) => a + salaryFor(p, league.season), 0);
  const expenses = [
    { k: twoWayPay > 0 ? 'Payroll (incl. two-way)' : 'Payroll', v: pay + twoWayPay, c: 'var(--accent)' },
    { k: 'Staff & facilities budgets', v: budgets, c: 'var(--tier-star)' },
    { k: 'Arena & operations', v: OPERATIONS_PER_SEASON * scale, c: 'var(--tier-low)' },
    ...(tax > 0 ? [{ k: 'Luxury tax', v: tax, c: 'var(--bad)' }] : []),
    ...(shortfall > 0 ? [{ k: 'Salary floor shortfall', v: shortfall, c: 'var(--warn)' }] : []),
  ];
  const totalExp = expenses.reduce((a, e) => a + e.v, 0);
  return (
    <>
      <div className="grid2">
        <Kpi k="Cash" v={fmtM(team.cash)} color={team.cash < 0 ? 'var(--bad)' : undefined} sub="Bank balance" />
        <Kpi
          k={`Profit ${seasonLabel(league.season).slice(-5)}`}
          v={games || pr ? fmtMs(pr) : '—'}
          color={pr >= 0 ? 'var(--good)' : 'var(--bad)'}
          sub={games ? `after ${games} games` : 'season not started'}
        />
        <Kpi k="Revenue" v={games || ts.revenue ? fmtM(ts.revenue) : '—'} sub="Gate, merch, media" />
        <Kpi k="Expenses" v={games || ts.expenses ? fmtM(ts.expenses) : '—'} sub="Payroll, staff, arena" />
      </div>

      <Card title="Attendance" right={<Users size={16} className="dim" />}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="fo-big">{Math.round(attShown).toLocaleString()}</div>
            <div className="tiny dim">
              {homeGames ? 'per home game' : 'projected per game'} · capacity {ARENA_CAPACITY.toLocaleString()}
            </div>
          </div>
          <div className="right">
            <div className="fo-mid">{Math.round((attShown / ARENA_CAPACITY) * 100)}%</div>
            <div className="tiny dim">full</div>
          </div>
        </div>
        <div className="bar" style={{ marginTop: 10, height: 8 }}>
          <div style={{ width: `${Math.min(100, (attShown / ARENA_CAPACITY) * 100)}%` }} />
        </div>
        <div className="row between small" style={{ marginTop: 10 }}>
          <span className="dim">Hype</span>
          <span className="bold num">{Math.round(team.hype * 100)}</span>
        </div>
        <div className="bar" style={{ marginTop: 4 }}>
          <div style={{ width: `${team.hype * 100}%`, background: 'var(--accent-2)' }} />
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>
          Winning, hype, market size, facilities and ticket price drive crowds. Hype rises with wins (playoff wins count double), falls with losses and drifts back toward average
          every offseason.
        </div>
      </Card>

      <Card title="Season cost structure" right={<span className="tiny dim">full-season</span>}>
        <div className="row" style={{ height: 14, borderRadius: 7, overflow: 'hidden', gap: 2 }}>
          {expenses.map((e) => (
            <div key={e.k} style={{ width: `${(e.v / totalExp) * 100}%`, background: e.c, height: '100%' }} />
          ))}
        </div>
        <div className="col" style={{ gap: 6, marginTop: 10 }}>
          {expenses.map((e) => (
            <div key={e.k} className="row small">
              <span className="fo-dot" style={{ background: e.c, borderRadius: 2 }} />
              <span className="grow dim2">{e.k}</span>
              <span className="num bold">{fmtM(e.v)}</span>
            </div>
          ))}
          <div className="divider" />
          <div className="row small">
            <span className="grow bold">Total</span>
            <span className="num bold">{fmtM(totalExp)}</span>
          </div>
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>
          National TV and league revenue pays every team about {fmtM(NATIONAL_REVENUE * scale)} a season. At the end of the regular season teams over the tax line pay {CAP.taxRate}
          × on every dollar above it ({Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}% of the pot is shared among teams under the line), and teams under the {fmtM(cap.minPayroll)}{' '}
          salary floor pay the shortfall to their players. Revenue sharing evens out market size: each team pays or receives {Math.round(REVENUE_SHARING * 100)}% of the gap between
          its local revenue (gate, merchandise, local TV) and the league average.
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ budget

function BudgetTab({ team }: { team: Team }) {
  const league = useLeague();
  // a fired coach's old team isn't his to run
  const fired = !!league.fired;
  const set = (fn: (t: Team) => void) => !fired && useStore.getState().mutate((l) => fn(l.teams[l.userTid]));
  const rank = (k: BudgetKey) => 1 + league.teams.filter((t) => t.budget[k] > team.budget[k]).length;
  const avg = (k: BudgetKey) => league.teams.reduce((a, t) => a + t.budget[k], 0) / league.teams.length;
  const cost = (lvl: number) => budgetCostPerSeason(league, lvl);
  // fan demand on a temporary copy of the team, through the real attendance model
  const withBudget = (b: Partial<Team['budget']>): Team => ({ ...team, budget: { ...team.budget, ...b } });
  const items: { k: BudgetKey; label: string; icon: JSX.Element; effect: (lvl: number) => string; help: string }[] = [
    {
      k: 'coaching',
      label: 'Coaching staff',
      icon: <GraduationCap size={18} />,
      effect: (lvl) => {
        const d = ((lvl - 50) / 50) * 0.5;
        if (Math.abs(d) < 0.005) return 'League-average player development';
        return `Player development ${d > 0 ? '+' : ''}${d.toFixed(2)} rating pts per skill / year vs average`;
      },
      help: 'Assistant coaches, skills trainers and analytics staff. Better coaching makes every skill rating improve a little faster each offseason and during in-season development check-ins. Young players benefit most because they grow the most.',
    },
    {
      k: 'health',
      label: 'Medical & health',
      icon: <HeartPulse size={18} />,
      effect: (lvl) => {
        const f = (1.12 - 0.25 * (lvl / 100)) / (1.12 - 0.25 * 0.5) - 1;
        if (Math.round(f * 100) === 0) return 'League-average injury recovery';
        return `Injuries last ${Math.abs(Math.round(f * 100))}% ${f < 0 ? 'shorter' : 'longer'} than average`;
      },
      help: 'Doctors, physios and sports science. A bigger health budget shortens injury recovery times and, above average, sometimes clears players a game early.',
    },
    {
      k: 'facilities',
      label: 'Facilities',
      icon: <Building2 size={18} />,
      effect: (lvl) => {
        const fans = attendanceFor(league, withBudget({ facilities: lvl })) - attendanceFor(league, withBudget({ facilities: 50 }));
        if (fans !== 0) return `${fans > 0 ? '+' : ''}${fans.toLocaleString()} fans per home game vs average, at your ticket price`;
        const dollars = Math.round(referencePrice(league, withBudget({ facilities: lvl })) - referencePrice(league, withBudget({ facilities: 50 })));
        if (dollars === 0) return 'League-average fan demand';
        return `Fans value a ticket $${Math.abs(dollars)} ${dollars > 0 ? 'more' : 'less'} than at an average arena`;
      },
      help: 'Arena upgrades, practice facility and fan experience. Better facilities raise demand for tickets, which means bigger crowds and more gate revenue.',
    },
  ];
  // ticket price: attendance estimate on a temporary copy of the team; the range grows with league revenue
  const priceAt = (price: number) => attendanceFor(league, withBudget({ ticketPrice: price }));
  const price = team.budget.ticketPrice;
  const scale = revenueScale(league);
  const [minPrice, maxPrice] = [30, 250].map((x) => Math.max(5, Math.round((x * scale) / 5) * 5));
  const att = priceAt(price);
  const gate = (att * price) / 1000;
  const sweet = (() => {
    let best = { p: price, g: 0 };
    for (let p = minPrice; p <= maxPrice; p += 5) {
      const g = (priceAt(p) * p) / 1000;
      if (g > best.g) best = { p, g };
    }
    return best;
  })();
  const totalBudget = items.reduce((a, it) => a + cost(team.budget[it.k]), 0);
  return (
    <>
      {fired && (
        <div className="fo-callout bad">
          <TriangleAlert size={18} className="bad" />
          <div>
            <b>You've been fired.</b> Budgets, ticket prices and practice are no longer yours to set. Take over another team from Settings to keep your career going.
          </div>
        </div>
      )}
      <div className="small dim2">
        Spending comes straight out of profit, which is 20% of how the owner judges you. Budgets are charged per game across the season, so changes take effect immediately.
      </div>
      {items.map((it) => {
        const lvl = team.budget[it.k];
        return (
          <Card key={it.k}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ color: 'var(--accent-text)' }}>{it.icon}</span>
                <h3 style={{ fontSize: 15 }}>{it.label}</h3>
                <Help title={it.label}>
                  <p style={{ margin: 0 }}>{it.help}</p>
                  <p style={{ margin: 0 }}>
                    Cost: {fmtM(cost(1))} per season at level 1 up to {fmtM(cost(100))} at level 100. League average level: {Math.round(avg(it.k))}.
                  </p>
                </Help>
              </div>
              {(() => {
                const a = avg(it.k);
                const tied = league.teams.filter((t) => t.budget[it.k] === lvl).length;
                return Math.abs(lvl - a) < 1 && tied > 1 ? (
                  <span className="tag">League average</span>
                ) : (
                  <span className={`tag ${lvl > a ? 'good' : 'warn'}`}>
                    {tied > 1 ? 'T-' : ''}
                    {ordinal(rank(it.k))} of 30
                  </span>
                );
              })()}
            </div>
            <Slider
              label={<span className="dim2">Level {lvl}</span>}
              value={lvl}
              min={1}
              max={100}
              onChange={(x) => set((t) => (t.budget[it.k] = x))}
              format={(x) => `${fmtM(cost(x))}/season`}
              left="Bare bones"
              right="Best in league"
              disabled={fired}
            />
            <div className="small" style={{ marginTop: 6, color: lvl > 50 ? 'var(--good)' : lvl < 50 ? 'var(--warn)' : 'var(--text-2)' }}>
              {it.effect(lvl)}
            </div>
          </Card>
        );
      })}
      <div className="row between small" style={{ padding: '0 4px' }}>
        <span className="dim">Total staff & facilities spend</span>
        <span className="bold num">{fmtM(totalBudget)} / season</span>
      </div>

      <Card
        title={
          <h3>
            <Ticket size={14} style={{ verticalAlign: -2 }} /> Ticket price
          </h3>
        }
      >
        <Slider
          label={<span className="dim2">Average ticket</span>}
          value={price}
          min={minPrice}
          max={Math.max(maxPrice, price)}
          step={5}
          onChange={(x) => set((t) => (t.budget.ticketPrice = x))}
          format={(x) => `$${x}`}
          left={`$${minPrice}`}
          right={`$${maxPrice}`}
          disabled={fired}
        />
        <div className="grid3" style={{ marginTop: 10 }}>
          <Kpi
            k="Est. crowd"
            v={att >= ARENA_CAPACITY ? 'Sellout' : att.toLocaleString()}
            sub={`${Math.round((att / ARENA_CAPACITY) * 100)}% full`}
            color={att >= ARENA_CAPACITY ? 'var(--good)' : undefined}
          />
          <Kpi k="Gate / game" v={fmtM(gate, 2)} sub="ticket revenue" />
          <Kpi k="Season gate" v={fmtM(gate * 41)} sub="41 home games" />
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>
          Higher prices earn more per fan but thin the crowd. At today's demand, gate revenue peaks around <b className="dim2">${sweet.p}</b> ({fmtM(sweet.g * 41)} a season).
          Playoff games sell at a {Math.round((PLAYOFF_PRICE_MULT - 1) * 100)}% premium. Prices rise with league revenue each summer.
        </div>
      </Card>

      <Card
        title={
          <h3>
            <Dumbbell size={14} style={{ verticalAlign: -2 }} /> Practice intensity
          </h3>
        }
      >
        <Segmented
          value={team.practice}
          onChange={(v) => set((t) => (t.practice = v))}
          label="Practice intensity"
          disabled={fired}
          options={PRACTICE.map((p) => ({ id: p.id, label: p.label }))}
        />
        {(() => {
          const cur = PRACTICE.find((p) => p.id === team.practice)!;
          return (
            <div className="col" style={{ gap: 4, marginTop: 10 }}>
              <div className="small">
                <span className="good">Development:</span> <span className="dim2">{cur.dev}</span>
              </div>
              <div className="small">
                <span className={team.practice === 'intense' ? 'bad' : team.practice === 'light' ? 'good' : 'dim'}>Body:</span> <span className="dim2">{cur.risk}</span>
              </div>
            </div>
          );
        })()}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ owner

function OwnerTab() {
  const league = useLeague();
  const om = league.ownerMood;
  const verdict = ownerVerdict(om.total);
  const seasonsIn = seasonsInCharge(league);
  const ts = curTeamSeason(league, league.userTid);
  const games = ts.won + ts.lost;
  // the owner's profit target and range grow with league revenue
  const scale = revenueScale(league);
  const [target, range] = [OWNER_PROFIT_TARGET * scale, OWNER_PROFIT_RANGE * scale];
  const rows: { k: string; w: string; v: number; how: string }[] = [
    {
      k: 'Wins',
      w: '40%',
      v: om.wins,
      how: 'Regular-season win % against .500: each win above 41 adds about +3, each win below costs about 3. It maxes out around a 74-win pace.',
    },
    { k: 'Playoffs', w: '40%', v: om.playoffs, how: 'Missing the playoffs −25 · first round 0 · second round +20 · conference finals +45 · Finals +70 · title +100.' },
    {
      k: 'Finances',
      w: '20%',
      v: om.money,
      how: `Season profit against his ${fmtM(target)} target: every ${fmtM(range / 10)} above it is +10 and every ${fmtM(range / 10)} short costs 10, maxing out at ${fmtMs(target + range)} (or ${fmtMs(target - range)}). The target rises with league revenue.`,
    },
  ];
  return (
    <>
      {league.fired && (
        <div className="fo-callout bad">
          <TriangleAlert size={18} className="bad" />
          <div>
            <b>You've been fired.</b> Take over another team from Settings to keep your career going.
          </div>
        </div>
      )}
      <Card className="fo-hero">
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <Gauge value={om.total} size={220} />
          <div className="fo-big" style={{ color: verdict.color }}>
            {om.total >= 0 ? '+' : ''}
            {Math.round(om.total * 100)}
          </div>
          <div className="small dim">Overall standing (−100 to +100)</div>
        </div>
      </Card>

      <Card title="How the owner grades you">
        <div className="col" style={{ gap: 14 }}>
          {rows.map((r) => (
            <div key={r.k} className="col" style={{ gap: 5 }}>
              <div className="row between">
                <span className="bold">
                  {r.k} <span className="tiny dim">· {r.w}</span>
                </span>
                <span className="num bold" style={{ color: r.v >= 0.1 ? 'var(--good)' : r.v <= -0.1 ? 'var(--bad)' : 'var(--warn)' }}>
                  {r.v >= 0 ? '+' : ''}
                  {Math.round(r.v * 100)}
                </span>
              </div>
              <CenterBar value={r.v} />
              <div className="tiny dim">{r.how}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Review schedule">
        <div className="col small dim2" style={{ gap: 8 }}>
          <div>
            The owner reviews your work <b>after every season's playoffs</b>. Your first season sets the baseline; after that each new season counts for 40% and your track record
            for 60%, so one bad year won't sink you, but a pattern will.
          </div>
          <div>
            This is season {seasonsIn} of your tenure.{' '}
            {seasonsIn <= 2 ? <span className="good">You're in your grace period: you can't be fired before the end of your third season.</span> : 'Your grace period is over.'}
          </div>
          {games > 0 && (
            <div>
              This season so far: {ts.won}-{ts.lost} ({Math.round(winPct(ts) * 100)}%), {fmtMs(profit(league, league.userTid))} profit
              {ts.playoffRound >= 0 ? `, ${PLAYOFF_LABEL(ts.playoffRound)}` : ''}.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <Toggle
          on={league.settings.jobSecurity}
          onChange={(on) => useStore.getState().mutate((l) => (l.settings.jobSecurity = on))}
          label="Job security"
          help={league.settings.jobSecurity ? 'On: an overall standing below −50 after your grace period gets you fired.' : 'Off: the owner grumbles but never fires you.'}
        />
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ history

function HistoryTab({ team }: { team: Team }) {
  const league = useLeague();
  const rows = [...team.seasons].filter((s) => s.season <= league.season).sort((a, b) => b.season - a.season);
  const cols: Col<(typeof rows)[number]>[] = [
    { key: 'season', label: 'Season', left: true, sticky: true, get: (r) => r.season, fmt: (v) => <span className="bold">{seasonLabel(Number(v))}</span> },
    { key: 'rec', label: 'W-L', get: (r) => r.won - r.lost, fmt: (_v, r) => `${r.won}-${r.lost}` },
    {
      key: 'po',
      label: 'Playoffs',
      left: true,
      get: (r) => r.playoffRound,
      fmt: (_v, r) => (r.season === league.season && (league.phase === 'regular' || league.phase === 'preseason') ? '—' : PLAYOFF_LABEL(r.playoffRound)),
    },
    { key: 'rev', label: 'Revenue', get: (r) => r.revenue, fmt: (v) => fmtM(Number(v)) },
    { key: 'exp', label: 'Expenses', get: (r) => r.expenses, fmt: (v) => fmtM(Number(v)) },
    {
      key: 'pro',
      label: 'Profit',
      get: (r) => r.revenue - r.expenses,
      fmt: (v) => <span style={{ color: Number(v) >= 0 ? 'var(--good)' : 'var(--bad)' }}>{fmtMs(Number(v))}</span>,
    },
    {
      key: 'att',
      label: 'Att/G',
      get: (r) => (r.homeWon + r.homeLost ? r.attendance / (r.homeWon + r.homeLost) : 0),
      fmt: (v) => (Number(v) ? Math.round(Number(v)).toLocaleString() : '—'),
    },
    { key: 'pay', label: 'Payroll', get: (r) => r.payroll, fmt: (v) => (Number(v) ? fmtM(Number(v)) : '—') },
  ];
  const chart = [...rows].reverse().slice(-10);
  const maxAbs = Math.max(1, ...chart.map((r) => Math.abs(r.revenue - r.expenses)));
  return (
    <>
      <Card title="Profit by season">
        {chart.length === 0 ? (
          <div className="small dim">No seasons yet.</div>
        ) : (
          <div className="fo-minichart">
            {chart.map((r) => {
              const pr = r.revenue - r.expenses;
              return (
                <div key={r.season}>
                  <span className="tiny num" style={{ color: pr >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                    {fmtMs(pr, 0)}
                  </span>
                  <div
                    className="b"
                    style={{
                      height: `${Math.max(4, (Math.abs(pr) / maxAbs) * 52)}px`,
                      background: pr >= 0 ? 'var(--good)' : 'var(--bad)',
                      opacity: r.season === league.season ? 0.55 : 0.9,
                    }}
                  />
                  <span className="tiny dim">{seasonLabel(r.season).slice(-5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <SecTitle>Season by season</SecTitle>
      <StatTable rows={rows} cols={cols} rowKey={(r) => r.season} highlight={(r) => r.season === league.season} />
      <div className="tiny dim" style={{ marginTop: -6 }}>
        {league.phase === 'preseason' || league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs'
          ? 'The highlighted season is still in progress. '
          : ''}
        Payroll is recorded at the end of each regular season.
      </div>
    </>
  );
}
