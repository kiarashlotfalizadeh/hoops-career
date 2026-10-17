import { FIRING_LINE, seasonsInCharge } from '../../core/league/owner';
import {
  ON_TRACK,
  PAYROLL_SCALE,
  PERSONALITY,
  PROFIT_SCALE,
  WIN_SCALE,
  YOUNG_AGE,
  currentGoals,
  ownerPersonality,
  ownerProgress,
  planOwnerGoals,
  resultText,
  type GoalStatus,
} from '../../core/league/ownerGoals';
import { seasonOutcome, useQueryParam } from '../league/shared';
import { leagueForecast } from '../../core/analysis/odds';
import { useLocation } from 'react-router-dom';
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
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { Bar, More, PageHeader, Section, Segmented, Slider, StatTable, Statline, Tag, Toggle, type Col } from '../components/ui';
import { Callout, CenterBar, Gauge, HelpSheet, Line, PRACTICE, capSeason, fmtGrade, fmtM, fmtMs, isOffseason, ordinal, ownerVerdict, shortSeason } from '../office/common';

type Tab = 'overview' | 'budget' | 'owner' | 'history';
type BudgetKey = 'coaching' | 'health' | 'facilities';

export default function Finances() {
  const league = useLeague();
  const loc = useLocation();
  const [tab, setTab] = useQueryParam<Tab>('tab', loc.pathname === '/owner' ? 'owner' : 'overview', ['overview', 'budget', 'owner', 'history']);
  const team = league.teams[league.userTid];
  return (
    <main className="page fo-page">
      <PageHeader title={tab === 'owner' ? 'Owner' : 'Finances'} sub={`${team.region} ${team.name} · ${seasonLabel(league.season)}`} back />
      <Segmented
        tabs
        label="Finances sections"
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
        <div className="fo-figs fo-figs-top">
          <Statline
            items={[
              { k: 'Cash', v: fmtM(team.cash), color: team.cash < 0 ? 'var(--bad)' : undefined, s: 'in the bank' },
              {
                k: `Profit ${shortSeason(league.season)}`,
                v: games || pr ? fmtMs(pr) : '—',
                color: games || pr ? (pr >= 0 ? 'var(--good)' : 'var(--bad)') : undefined,
                s: games ? `after ${games} games` : 'season not started',
              },
            ]}
          />
          <Statline
            items={[
              { k: 'Revenue', v: games || ts.revenue ? fmtM(ts.revenue) : '—', s: 'gate, merch, media' },
              { k: 'Expenses', v: games || ts.expenses ? fmtM(ts.expenses) : '—', s: 'payroll, staff, arena' },
            ]}
          />
        </div>
      </div>

      <Section title="Attendance">
        <div className="card fo-att">
          <div className="fo-pay">
            <div className="grow">
              <div className="fo-pay-v num">{Math.round(attShown).toLocaleString()}</div>
              <div className="tiny dim">
                {homeGames ? 'a home game' : 'projected a game'} · capacity {ARENA_CAPACITY.toLocaleString()}
              </div>
            </div>
            <div className="right">
              <div className="fo-pay-v2 num">{full}%</div>
              <div className="tiny dim">full</div>
            </div>
          </div>
          <Bar value={Math.min(100, full)} height={8} />
          <div className="fo-att-hype">
            <span className="over">Hype</span>
            <div className="grow">
              <Bar value={team.hype * 100} color="var(--accent-2)" />
            </div>
            <span className="num bold">{Math.round(team.hype * 100)}</span>
          </div>
          <More label="What fills the arena">
            <p className="small dim2">
              Winning, hype, market size, facilities and ticket price drive crowds. Hype rises with wins (playoff wins count double), falls with losses and drifts back toward
              average every offseason.
            </p>
          </More>
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
      <div className="tiny dim">
        Still owed to players you released: it counts against the cap and is paid like payroll until it runs out.
        {any ? ' Stretched money is spread over twice the seasons left, plus one.' : ''}
      </div>
    </Section>
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
          <b>You've been fired.</b> Budgets, ticket prices and practice are no longer yours. Take over another team from Settings to keep your career going.
        </Callout>
      )}
      <Section title="Staff & facilities" right={<span className="fo-faday num">{fmtM(totalBudget)}/season</span>}>
        <p className="fo-lede small">
          Spending comes straight out of profit{profitGoal ? `, ${Math.round(profitGoal.weight * 100)}% of the owner's review this season` : ''}. Charged per game, so changes count
          at once.
        </p>
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
                  left="Bare bones"
                  right="Best in league"
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

// ------------------------------------------------------------------ owner

function OwnerTab() {
  const league = useLeague();
  const om = league.ownerMood;
  const verdict = ownerVerdict(om.total);
  const seasonsIn = seasonsInCharge(league);
  const tid = league.userTid;
  const who = PERSONALITY[ownerPersonality(league, tid)];
  const og = currentGoals(league);
  // before opening night: the goals the owner would set with today's roster
  const provisional = useLeagueMemo(() => (!og && !league.fired && league.phase === 'preseason' ? planOwnerGoals(league, tid) : null), [league, og, tid]);
  const shown = og ?? provisional ?? undefined;
  // the wins projected as Home's odds line projects them
  const progress = useLeagueMemo(() => ownerProgress(league, shown, og ? leagueForecast(league) : null), [league, shown, og]);
  const reviews = [...(league.ownerReviews ?? [])].reverse();
  // after the playoffs the season's review stands in for its progress
  const review = og ? reviews.find((r) => r.season === og.season && r.tid === og.tid && r.goals.length) : undefined;
  const past = reviews.filter((r) => r !== review);
  const onTrack = progress.filter((p) => ON_TRACK.has(p.status)).length;
  const scale = revenueScale(league);
  const cap = CAP_FOR(league);
  const rows: { k: string; how: string }[] = [
    { k: 'Wins', how: `Each win above or below his target counts ${Math.round(100 / WIN_SCALE)} (±100 at ${WIN_SCALE} wins either way).` },
    { k: 'Postseason', how: 'Reaching his goal is +30 and each round beyond it 30 more; each round short costs 35 (the play-in counts as one).' },
    {
      k: 'Profit',
      how: `Every ${fmtM((PROFIT_SCALE * scale) / 10)} above or below his target counts 10 (±100 at ${fmtM(PROFIT_SCALE * scale)}). His budget is the season's revenue and costs at today's prices and payroll (and any shortfall under the salary floor), a little more for a roster that should win.`,
    },
    {
      k: 'Payroll',
      how: `Keeping it under his line is +15 (up to +30 with room to spare); going over costs 25, down to −100 at ${fmtM(PAYROLL_SCALE * cap.luxuryTax)} over.`,
    },
    { k: 'Development', how: `Minutes for players ${YOUNG_AGE} or under against his target: ±100 at half of it either way.` },
  ];
  return (
    <>
      {league.fired && (
        <Callout tone="bad" icon={<TriangleAlert size={18} className="bad" />}>
          <b>You've been fired.</b> Take over another team from Settings to keep your career going.
        </Callout>
      )}
      <section className="card fo-ownerhero" aria-label="The owner">
        <Gauge value={om.total} size={200} />
        <div className="fo-ownerhero-v num" style={{ color: verdict.color }}>
          {fmtGrade(om.total)}
        </div>
        <div className="over">Standing · −100 to +100</div>
        {!league.fired && (
          <div className="small dim2 center">
            <b>{who.label}</b> owner · {who.blurb}
          </div>
        )}
        <div className="fo-owner-parts">
          {([['Wins', om.wins], ['Playoffs', om.playoffs], ['Money', om.money], ...(om.youth !== undefined ? [['Youth', om.youth] as const] : [])] as const).map(([k, val]) => (
            <div key={k} className="fo-owner-row">
              <span className="over">{k}</span>
              <CenterBar value={val} />
              <span className="num">{fmtGrade(val)}</span>
            </div>
          ))}
        </div>
      </section>

      {shown && (
        <Section
          title={review ? `${seasonLabel(shown.season)} review` : `${seasonLabel(shown.season)} goals`}
          right={
            review ? (
              <Tag tone={review.grade >= 0.1 ? 'good' : review.grade <= -0.1 ? 'bad' : 'warn'}>Season {fmtGrade(review.grade)}</Tag>
            ) : provisional ? (
              <Tag tone="info">Provisional</Tag>
            ) : (
              <Tag tone={onTrack === progress.length ? 'good' : onTrack * 2 >= progress.length ? 'info' : 'warn'}>
                {onTrack} of {progress.length} on track
              </Tag>
            )
          }
        >
          {provisional && <p className="fo-lede small">Set on opening night from the roster you open with: these are the goals he'd set with today's.</p>}
          {shown.from && !review && (
            <p className="fo-lede small">
              Set when you took over: only the {shown.from.won + shown.from.lost > 0 ? `games after ${shown.from.won}-${shown.from.lost}` : 'rest of the season'} count.
            </p>
          )}
          <div className="card flush list">
            {review
              ? review.goals.map((g) => (
                  <div key={g.kind} className="fo-goal">
                    <div className="fo-goal-h">
                      <span className="bold grow">{g.title}</span>
                      <span className="fo-goal-v num" style={{ color: gradeColor(g.grade) }}>
                        {fmtGrade(g.grade)}
                      </span>
                    </div>
                    <CenterBar value={g.grade} />
                    <div className="tiny dim">
                      {capitalize(resultText(g, g.result))} · {Math.round(g.weight * 100)}% of the review
                    </div>
                  </div>
                ))
              : progress.map((p) => (
                  <div key={p.goal.kind} className="fo-goal">
                    <div className="fo-goal-h">
                      <span className="bold grow">{p.goal.title}</span>
                      {!provisional && <Tag tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Tag>}
                    </div>
                    {/* (no bar before opening night: nothing has happened yet) */}
                    {!provisional && (
                      <div aria-hidden="true">
                        <Bar value={p.fill} max={1} color={`var(--${STATUS_TONE[p.status]})`} />
                      </div>
                    )}
                    <div className="tiny dim">
                      {p.text} · {Math.round(p.goal.weight * 100)}% of the review
                    </div>
                  </div>
                ))}
          </div>
          {review && <div className="tiny dim">Next season's goals are set on opening night.</div>}
        </Section>
      )}
      {!shown && !league.fired && (
        <Section title="Goals">
          <div className="card small dim2">
            {isOffseason(league) || seasonsIn < 1
              ? "The owner sets next season's goals on opening night."
              : league.phase === 'regular'
                ? 'The owner sets his goals for the rest of the season tomorrow.'
                : 'This season is graded on wins, the playoffs and profit. His goals start on opening night.'}
          </div>
        </Section>
      )}

      <Section
        title="Your tenure"
        right={
          <HelpSheet title="How the owner grades you">
            <p>
              On opening night he sets three or four goals from the roster you open with: a win total (what its talent should win against the league&apos;s), a postseason goal from
              where that projects you in the conference (or, for a rebuild, minutes for the young players), and a money goal. After the playoffs each goal is graded from −100 to
              +100 by how far you beat or missed it, and their weights make the season&apos;s grade.
            </p>
            {rows.map((r) => (
              <p key={r.k}>
                <b>{r.k}.</b> {r.how}
              </p>
            ))}
            <p>
              Your first season sets your standing; after that each new season counts 40% and your track record 60%, so one bad year won&apos;t sink you, but a pattern will. A
              win-now owner asks for a couple more wins and weighs the playoffs more; a builder asks for a win less and cares about the young players; a frugal one wants more
              profit and weighs money more.
            </p>
          </HelpSheet>
        }
      >
        <div className="card fo-tenure">
          <div className="small">
            {/* a team taken over after the season is his from the next one */}
            {seasonsIn < 1 ? 'Your tenure starts next season.' : `Season ${seasonsIn} of your tenure.`}{' '}
            {seasonsIn <= 2 ? (
              <span className="good">Grace period: you can't be fired before the end of your third season.</span>
            ) : (
              <span className="dim2">Your grace period is over.</span>
            )}
          </div>
          <Toggle
            on={league.settings.jobSecurity}
            onChange={(on) => useStore.getState().mutate((l) => (l.settings.jobSecurity = on))}
            label="Job security"
            help={
              league.settings.jobSecurity
                ? `On: a standing below ${Math.round(FIRING_LINE * 100)} after your grace period gets you fired.`
                : 'Off: the owner grumbles but never fires you.'
            }
          />
        </div>
      </Section>

      {past.length > 0 && (
        <Section title="Past reviews">
          <div className="card flush list">
            {past.map((r, i) => (
              <div key={r.season} className="fo-goal">
                <div className="fo-goal-h">
                  <span className="bold grow">
                    {seasonLabel(r.season)}
                    {r.tid !== tid ? ` · ${league.teams[r.tid].abbrev}` : ''}
                    {r.fired ? ' · fired' : ''}
                  </span>
                  <span className="small num">
                    <span className="bold" style={{ color: gradeColor(r.grade) }}>
                      {fmtGrade(r.grade)}
                    </span>
                    <span className="dim"> · standing {fmtGrade(r.total)}</span>
                  </span>
                </div>
                {/* the latest three goal by goal, older seasons by their grades */}
                {i < 3 && (
                  <div className="tiny dim">
                    {r.goals.length
                      ? r.goals.map((g) => (
                          <div key={g.kind}>
                            {g.title}: {resultText(g, g.result)} ({fmtGrade(g.grade)})
                          </div>
                        ))
                      : 'Graded on wins, the playoffs and profit (before goals).'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

const STATUS_LABEL: Record<GoalStatus, string> = { ahead: 'Ahead', 'on track': 'On track', behind: 'Behind', met: 'Met', missed: 'Missed' };
const STATUS_TONE: Record<GoalStatus, 'good' | 'info' | 'warn' | 'bad'> = { ahead: 'good', 'on track': 'info', behind: 'warn', met: 'good', missed: 'bad' };
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const gradeColor = (x: number) => (x >= 0.1 ? 'var(--good)' : x <= -0.1 ? 'var(--bad)' : 'var(--warn)');

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
