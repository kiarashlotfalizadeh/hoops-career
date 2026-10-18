import { currentGoals } from '../../core/league/ownerGoals';
import { seasonOutcome, useQueryParam } from '../league/shared';
import { Link } from 'react-router-dom';
import { Building2, Dumbbell, GraduationCap, HeartPulse, Ticket, TriangleAlert } from 'lucide-react';
import type { Team } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, curTeamSeason, payroll, revenueScale, twoWayRoster } from '../../core/league/helpers';
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
import { useLeague } from '../../state/store';
import { edit } from '../../state/actions';
import { Bar, More, PageHeader, Section, Segmented, Slider, StatTable, Statline, type Col } from '../components/ui';
import { Callout, HelpSheet, Line, PRACTICE, capSeason, fmtM, fmtMs, isOffseason, ordinal, shortSeason } from '../office/common';

type Tab = 'overview' | 'budget' | 'history';
type BudgetKey = 'coaching' | 'health' | 'facilities';

export default function Finances() {
  const league = useLeague();
  const [tab, setTab] = useQueryParam<Tab>('tab', 'overview', ['overview', 'budget', 'history']);
  const team = league.teams[league.userTid];
  return (
    <main className="page fo-page">
      <PageHeader title="Finances" back backTo="/office" />
      <Segmented
        tabs
        label="Finances sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: 'overview', label: 'Overview' },
          { id: 'budget', label: 'Budget' },
          { id: 'history', label: 'History' },
        ]}
      />
      {tab === 'overview' && <Overview team={team} />}
      {tab === 'budget' && <BudgetTab team={team} />}
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
  // after the season the cost structure is next season's: the roster has moved on from the books just closed
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const pay = payroll(league, team.tid, s);
  const scale = revenueScale(league, s);
  const budgets = (['coaching', 'health', 'facilities'] as const).reduce((a, k) => a + budgetCostPerSeason(league, team.budget[k]), 0) * (scale / revenueScale(league));
  const tax = pay > cap.luxuryTax ? Math.round((pay - cap.luxuryTax) * CAP.taxRate) : 0;
  const shortfall = Math.max(0, cap.minPayroll - pay);
  // two-way deals sit outside the cap and the tax, but they are still paid
  const twoWayPay = twoWayRoster(league, team.tid).reduce((a, p) => a + salaryFor(p, s), 0);
  const expenses = [
    { k: twoWayPay > 0 ? 'Payroll (incl. two-way)' : 'Payroll', v: pay + twoWayPay, c: 'var(--accent)' },
    { k: 'Staff & facilities budgets', v: budgets, c: 'var(--tier-star)' },
    { k: 'Arena & operations', v: OPERATIONS_PER_SEASON * scale, c: 'var(--tier-low)' },
    ...(tax > 0 ? [{ k: 'Luxury tax', v: tax, c: 'var(--bad)' }] : []),
    ...(shortfall > 0 ? [{ k: 'Salary floor shortfall', v: shortfall, c: 'var(--warn)' }] : []),
  ];
  const totalExp = expenses.reduce((a, e) => a + e.v, 0);
  const full = Math.round((attShown / ARENA_CAPACITY) * 100);
  return (
    <>
      <div className="card fo-capsheet">
        <div className="fo-pay">
          <div className="grow">
            <div className="over">Cash</div>
            <div className="fo-pay-v num" style={team.cash < 0 ? { color: 'var(--bad)' } : undefined}>
              {fmtM(team.cash)}
            </div>
          </div>
        </div>
        {(games > 0 || ts.revenue > 0) && (
          <Statline
            items={[
              {
                k: `Profit ${shortSeason(league.season)}`,
                v: games || pr ? fmtMs(pr) : '—',
                color: games || pr ? (pr >= 0 ? 'var(--good)' : 'var(--bad)') : undefined,
                s: games ? `${games} games` : 'not started',
              },
              { k: 'Revenue', v: games || ts.revenue ? fmtM(ts.revenue) : '—' },
              { k: 'Expenses', v: games || ts.expenses ? fmtM(ts.expenses) : '—' },
            ]}
          />
        )}
      </div>

      <Section
        title="Attendance"
        right={
          <HelpSheet title="What fills the arena">
            <p>
              Winning, hype, market size, facilities and ticket price drive crowds. Hype rises with wins (playoff wins count double), falls with losses and drifts back toward
              average every offseason.
            </p>
          </HelpSheet>
        }
      >
        <div className="card fo-att">
          <Statline
            items={[
              { k: homeGames ? 'A home game' : 'Projected', v: Math.round(attShown).toLocaleString(), s: `${full}% of ${ARENA_CAPACITY.toLocaleString()}` },
              { k: 'Hype', v: Math.round(team.hype * 100), s: 'of 100' },
            ]}
          />
          <Bar value={Math.min(100, full)} height={6} />
        </div>
      </Section>

      <Section title="Season costs" right={<span className="tiny dim">{s > league.season ? `${seasonLabel(s)} projected` : 'full season'}</span>}>
        <div className="card">
          <div className="fo-stack" role="img" aria-label={expenses.map((e) => `${e.k} ${fmtM(e.v)}`).join(', ')}>
            {expenses.map((e) => (
              <div key={e.k} style={{ width: `${(e.v / totalExp) * 100}%`, background: e.c }} />
            ))}
          </div>
          <div className="fo-lines fo-legend-lines">
            {expenses.map((e) => (
              <Line
                key={e.k}
                k={
                  <>
                    <i className="fo-swatch" style={{ background: e.c }} />
                    {e.k}
                  </>
                }
              >
                {fmtM(e.v)}
              </Line>
            ))}
            <Line k={<b>Total</b>}>{fmtM(totalExp)}</Line>
          </div>
          <More label="League money">
            <p className="small dim2">
              National TV and league revenue pays every team about {fmtM(NATIONAL_REVENUE * scale)} a season. At the end of the regular season teams over the tax line pay{' '}
              {CAP.taxRate}× on every dollar above it ({Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}% of the pot goes to teams under the line), and teams under the{' '}
              {fmtM(cap.minPayroll)} salary floor pay the shortfall to their players. Revenue sharing evens out market size: each team pays or receives{' '}
              {Math.round(REVENUE_SHARING * 100)}% of the gap between its local revenue (gate, merchandise, local TV) and the league average.
            </p>
          </More>
        </div>
      </Section>

      <DeadMoney team={team} from={s} />
    </>
  );
}

/**
 * Dead money by season from the season the books are on: salary still owed to released players,
 * counted in the payroll above. A stretched release (the stretch provision) is labelled, and so are
 * its later seasons, which run past the usual horizon.
 */
function DeadMoney({ team, from }: { team: Team; from: number }) {
  const rows = new Map<number, { total: number; stretched: number; who: Set<string> }>();
  for (const d of team.deadMoney) {
    if (d.season < from) continue;
    const r = rows.get(d.season) ?? { total: 0, stretched: 0, who: new Set<string>() };
    r.total += d.amount;
    if (d.stretched) r.stretched += d.amount;
    r.who.add(d.name);
    rows.set(d.season, r);
  }
  if (!rows.size) return null;
  const seasons = [...rows.keys()].sort((a, b) => a - b);
  const any = seasons.some((s) => rows.get(s)!.stretched > 0);
  return (
    <Section title="Dead money" right={<span className="tiny dim">by season</span>}>
      <div className="card flush list">
        {seasons.map((s) => {
          const r = rows.get(s)!;
          return (
            <div key={s} className="fo-dead-row">
              <span className="fo-dead-s num">{shortSeason(s)}</span>
              <span className="grow fo-meta">{[...r.who].join(', ')}</span>
              {r.stretched > 0 && <span className="tag warn">{r.stretched === r.total ? 'stretched' : `${fmtM(r.stretched)} stretched`}</span>}
              <span className="fo-money-a num">{fmtM(r.total)}</span>
            </div>
          );
        })}
      </div>
      <div className="tiny dim">Owed to players you released: on the cap and paid like payroll.{any ? ' Stretched: spread over twice the seasons left, plus one.' : ''}</div>
    </Section>
  );
}

// ------------------------------------------------------------------ budget

function BudgetTab({ team }: { team: Team }) {
  const league = useLeague();
  // a fired coach's old team isn't his to run
  const fired = !!league.fired;
  const set = (fn: (t: Team) => void) => !fired && edit((l) => fn(l.teams[l.userTid]));
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
        return `Development ${d > 0 ? '+' : ''}${d.toFixed(2)} rating pts per skill a year vs average`;
      },
      help: 'Assistant coaches, skills trainers and analytics staff. Better coaching makes every skill rating improve a little faster each offseason and at in-season development check-ins. Young players gain the most, because they grow the most.',
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
      help: 'Doctors, physios and sports science. A bigger health budget shortens injury recovery and, above average, sometimes clears players a game early.',
    },
    {
      k: 'facilities',
      label: 'Facilities',
      icon: <Building2 size={18} />,
      effect: (lvl) => {
        const fans = attendanceFor(league, withBudget({ facilities: lvl })) - attendanceFor(league, withBudget({ facilities: 50 }));
        if (fans !== 0) return `${fans > 0 ? '+' : ''}${fans.toLocaleString()} fans a home game vs average, at your price`;
        const dollars = Math.round(referencePrice(league, withBudget({ facilities: lvl })) - referencePrice(league, withBudget({ facilities: 50 })));
        if (dollars === 0) return 'League-average fan demand';
        return `Fans value a ticket $${Math.abs(dollars)} ${dollars > 0 ? 'more' : 'less'} than at an average arena`;
      },
      help: 'Arena upgrades, practice facility and fan experience. Better facilities raise demand for tickets: bigger crowds and more gate revenue.',
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
  // what profit counts for in the owner's review this season (his money goal may be the payroll instead)
  const profitGoal = currentGoals(league)?.goals.find((g) => g.kind === 'profit');
  const cur = PRACTICE.find((p) => p.id === team.practice)!;
  return (
    <>
      {fired && (
        <Callout tone="bad" icon={<TriangleAlert size={18} className="bad" />}>
          <b>You were fired.</b> These aren't yours to set.{' '}
          <Link to="/office/career" className="bold accent-text">
            Find a new job
          </Link>
        </Callout>
      )}
      <Section title="Staff & facilities" right={<span className="fo-faday num">{fmtM(totalBudget)}/season</span>}>
        <div className="tiny dim">Out of profit, charged per game{profitGoal ? `: profit is ${Math.round(profitGoal.weight * 100)}% of the owner's review` : ''}.</div>
        <div className="card flush list">
          {items.map((it) => {
            const lvl = team.budget[it.k];
            const a = avg(it.k);
            const tied = league.teams.filter((t) => t.budget[it.k] === lvl).length;
            return (
              <div key={it.k} className="fo-budget">
                <div className="fo-budget-h">
                  <span className="fo-dept-ic" aria-hidden="true">
                    {it.icon}
                  </span>
                  <h3 className="grow">{it.label}</h3>
                  <HelpSheet title={it.label}>
                    <p>{it.help}</p>
                    <p>
                      Cost: {fmtM(cost(1))} a season at level 1, up to {fmtM(cost(100))} at 100. League average level: {Math.round(a)}.
                    </p>
                  </HelpSheet>
                  {Math.abs(lvl - a) < 1 && tied > 1 ? (
                    <span className="tag">League average</span>
                  ) : (
                    <span className={`tag ${lvl > a ? 'good' : 'warn'}`}>
                      {tied > 1 ? 'T-' : ''}
                      {ordinal(rank(it.k))} of {league.teams.length}
                    </span>
                  )}
                </div>
                <Slider
                  label={`Level ${lvl}`}
                  name={`${it.label} level`}
                  value={lvl}
                  min={1}
                  max={100}
                  onChange={(x) => set((t) => (t.budget[it.k] = x))}
                  format={(x) => `${fmtM(cost(x))}/season`}
                  disabled={fired}
                />
                <div className={`small ${lvl > 50 ? 'good' : lvl < 50 ? 'warn' : 'dim2'}`}>{it.effect(lvl)}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title={
          <h3>
            <Ticket size={13} /> Ticket price
          </h3>
        }
      >
        <div className="card fo-ticket">
          <Slider
            label="Average ticket"
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
          <Statline
            items={[
              {
                k: 'Est. crowd',
                v: att >= ARENA_CAPACITY ? 'Sellout' : att.toLocaleString(),
                s: `${Math.round((att / ARENA_CAPACITY) * 100)}% full`,
                color: att >= ARENA_CAPACITY ? 'var(--good)' : undefined,
              },
              { k: 'Gate / game', v: fmtM(gate, 2), s: 'ticket revenue' },
              { k: 'Season gate', v: fmtM(gate * 41), s: '41 home games' },
            ]}
          />
          <div className="small dim2">
            Gate revenue peaks near <b className="num">${sweet.p}</b> ({fmtM(sweet.g * 41)} a season) at today's demand.
          </div>
          <More>
            <p className="small dim2">
              Higher prices earn more per fan but thin the crowd. Playoff games sell at a {Math.round((PLAYOFF_PRICE_MULT - 1) * 100)}% premium. Prices rise with league revenue
              each summer.
            </p>
          </More>
        </div>
      </Section>

      <Section
        title={
          <h3>
            <Dumbbell size={13} /> Practice intensity
          </h3>
        }
      >
        <div className="card fo-ticket">
          <Segmented
            value={team.practice}
            onChange={(v) => set((t) => (t.practice = v))}
            label="Practice intensity"
            disabled={fired}
            options={PRACTICE.map((p) => ({ id: p.id, label: p.label }))}
          />
          <div className="fo-lines">
            <Line k={<span className="good">Development</span>}>
              <span className="fo-line-txt">{cur.dev}</span>
            </Line>
            <Line k={<span className={team.practice === 'intense' ? 'bad' : team.practice === 'light' ? 'good' : 'dim'}>Body</span>}>
              <span className="fo-line-txt">{cur.risk}</span>
            </Line>
          </div>
        </div>
      </Section>
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
      // how the season ended, as on the team and history pages (a play-in loss isn't a plain miss)
      fmt: (_v, r) => {
        const o = seasonOutcome(league, team.tid, r);
        return o.short === 'Ongoing' ? '—' : o.short;
      },
    },
    { key: 'rev', label: 'Revenue', get: (r) => r.revenue, fmt: (v) => fmtM(Number(v)) },
    { key: 'exp', label: 'Expenses', get: (r) => r.expenses, fmt: (v) => fmtM(Number(v)) },
    {
      key: 'pro',
      label: 'Profit',
      get: (r) => r.revenue - r.expenses,
      fmt: (v) => <span className={Number(v) >= 0 ? 'good' : 'bad'}>{fmtMs(Number(v))}</span>,
    },
    {
      key: 'att',
      label: 'Att/G',
      get: (r) => (r.homeWon + r.homeLost ? r.attendance / (r.homeWon + r.homeLost) : 0),
      fmt: (v) => (Number(v) ? Math.round(Number(v)).toLocaleString() : '—'),
    },
    { key: 'pay', label: 'Payroll', get: (r) => r.payroll, fmt: (v) => (Number(v) ? fmtM(Number(v)) : '—') },
  ];
  // after the playoffs this season's books are closed
  const inProgress = !isOffseason(league);
  const chart = [...rows].reverse().slice(-10);
  const maxAbs = Math.max(1, ...chart.map((r) => Math.abs(r.revenue - r.expenses)));
  // losses hang below a zero line (only drawn when there are any)
  const anyLoss = chart.some((r) => r.revenue - r.expenses < 0);
  const h = (x: number) => `${Math.max(3, (Math.abs(x) / maxAbs) * (anyLoss ? 40 : 60))}px`;
  return (
    <>
      <Section title="Profit by season">
        <div className="card">
          {chart.length === 0 ? (
            <div className="small dim">No seasons yet.</div>
          ) : (
            <div
              className={`fo-minichart ${anyLoss ? 'split' : ''}`}
              role="img"
              aria-label={chart.map((r) => `${seasonLabel(r.season)} ${fmtMs(r.revenue - r.expenses)}`).join(', ')}
            >
              {chart.map((r) => {
                const pr = r.revenue - r.expenses;
                return (
                  <div key={r.season} className={`${pr >= 0 ? 'up' : 'down'} ${inProgress && r.season === league.season ? 'live' : ''}`}>
                    <span className="v num">{fmtMs(pr, 0)}</span>
                    <div className="pos">{pr >= 0 && <div className="b" style={{ height: h(pr) }} />}</div>
                    {anyLoss && <div className="neg">{pr < 0 && <div className="b" style={{ height: h(pr) }} />}</div>}
                    <span className="s num">{shortSeason(r.season)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>
      <Section title="Season by season">
        <StatTable rows={rows} cols={cols} rowKey={(r) => r.season} highlight={(r) => r.season === league.season} />
        <div className="tiny dim">
          {inProgress ? 'The highlighted season is still in progress. ' : ''}
          Payroll is recorded at the end of each regular season.
        </div>
      </Section>
    </>
  );
}
