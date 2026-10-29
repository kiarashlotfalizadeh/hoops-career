import { currentGoals } from '../../core/league/ownerGoals';
import { seasonOutcome, useQueryParam } from '../league/shared';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import type { Team } from '../../core/types';
import { CAP, TAX_BRACKET_PCT } from '../../core/constants';
import { CAP_FOR, curTeamSeason, payroll, revenueScale, twoWayRoster } from '../../core/league/helpers';
import { salaryFor } from '../../core/playerGen';
import {
  NATIONAL_REVENUE,
  OPERATIONS_PER_SEASON,
  PLAYOFF_PRICE_MULT,
  REVENUE_SHARING,
  TAX_SHARE_TO_NON_TAXPAYERS,
  arenaCapacity,
  attendanceFor,
  budgetCostPerSeason,
  profit,
  seasonEndCash,
  referencePrice,
  taxRepeater,
  teamTaxBill,
} from '../../core/league/finances';
import { useLeague } from '../../state/store';
import { edit } from '../../state/actions';
import { Bar, More, PageHeader, Section, Segmented, Slider, StatTable, Statline, type Col } from '../components/ui';
import { Callout, HelpSheet, Line, PRACTICE, capSeason, isOffseason, ordinal, shortSeason } from '../office/common';
import { money, moneySigned, moneyExact, plural } from '../../core/format';
import { FROZEN_BUDGET, booksOf, booksOutlook } from '../../core/league/books';
import './finances.css';

type Tab = 'overview' | 'budget' | 'history';
type BudgetKey = 'coaching' | 'health' | 'facilities';

/** A budget level's effect as a verdict: "Faster player development", "A little slower injury recovery". */
function verdict(lvl: number, even: string, what: string, up: string, down: string): string {
  const d = lvl - 50;
  if (Math.abs(d) < 1) return even;
  const word = d > 0 ? up : down;
  return Math.abs(d) < 20 ? `A little ${word.toLowerCase()} ${what}` : Math.abs(d) >= 40 ? `Much ${word.toLowerCase()} ${what}` : `${word} ${what}`;
}

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
  const end = seasonEndCash(league, team.tid);
  // the owner's read of it: the tax he signed off on doesn't count against you (see sanctionedTax)
  const books = booksOutlook(league);
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
  const tax = teamTaxBill(league, team.tid, pay, s);
  const repeater = taxRepeater(league, team.tid, s);
  const shortfall = Math.max(0, cap.minPayroll - pay);
  // two-way deals sit outside the cap and the tax, but they are still paid
  const twoWayPay = twoWayRoster(league, team.tid).reduce((a, p) => a + salaryFor(p, s), 0);
  // the payroll every desk shows (the cap's: dead money in, two-ways out), then the two-way pay beside it
  const expenses = [
    { k: 'Payroll', v: pay, c: 'var(--accent)' },
    ...(twoWayPay > 0 ? [{ k: 'Two-way pay', v: twoWayPay, c: 'color-mix(in srgb, var(--accent) 55%, var(--surface-3))' }] : []),
    // (not the OVR tiers' colours: these are kinds of cost, not grades)
    { k: 'Staff & facilities budgets', v: budgets, c: 'var(--info)' },
    { k: 'Arena & operations', v: OPERATIONS_PER_SEASON * scale, c: 'var(--text-dim)' },
    ...(tax > 0 ? [{ k: repeater ? 'Luxury tax (repeater)' : 'Luxury tax', v: tax, c: 'var(--bad)' }] : []),
    ...(shortfall > 0 ? [{ k: 'Salary floor shortfall', v: shortfall, c: 'var(--warn)' }] : []),
  ];
  const totalExp = expenses.reduce((a, e) => a + e.v, 0);
  const seats = arenaCapacity(team);
  const full = Math.round((attShown / seats) * 100);
  return (
    <>
      <div className="fo-capsheet fo-statement">
        <div className="fo-pay fo-fin-hero">
          <div className="grow">
            <div className="over">Cash</div>
            <div className="fo-pay-v num" style={team.cash < 0 ? { color: 'var(--bad)' } : undefined}>
              {money(team.cash)}
            </div>
          </div>
          {/* where the regular season's books close, tax paid (bar what he signed off on): the one figure the owner's review reads (the playoff gates come after) */}
          {/* (on a phone it stacks under Cash: a long caption beside the giant figure once printed over it) */}
          {(end.left > 0 || ts.closeCash !== undefined) && (
            <div className="right fo-books">
              <div className="over fo-books-h">
                {isOffseason(league) ? `Books close ${shortSeason(league.season + 1)}` : end.left > 0 ? 'Books close' : 'Books closed'}
                {end.tax > 0 && books.sanctioned > 0 && (
                  <HelpSheet title="The tax he signed off on">
                    <p>
                      This season&apos;s tax is {money(end.tax)}. The owner signed off on {money(books.sanctioned)} of it. That part doesn&apos;t count against you in his review.
                    </p>
                  </HelpSheet>
                )}
              </div>
              <div className="fo-pay-v2" style={{ color: books.judged < 0 ? 'var(--bad)' : undefined }}>
                {money(books.judged)}
              </div>
              <div className="tiny dim">
                {end.left > 0 ? 'projected' : 'the owner reads this'}
                {end.tax > 0 ? ` · after ${money(end.tax)} tax` : ''}
                {/* the tax he signed off on is out of it (fixed on opening night, so a salary-neutral trade doesn't take it back): its "?" says so */}
              </div>
            </div>
          )}
        </div>
        {(games > 0 || ts.revenue > 0) && (
          <Statline
            items={[
              {
                k: `${pr >= 0 ? 'Profit' : 'Loss'} ${shortSeason(league.season)}`,
                v: games || pr ? money(Math.abs(pr)) : '—',
                color: games || pr ? (pr >= 0 ? 'var(--good)' : 'var(--bad)') : undefined,
                s: isOffseason(league) ? 'season over' : games ? `so far · ${plural(games, 'game')}` : 'not started',
              },
              { k: 'Revenue', v: games || ts.revenue ? money(ts.revenue) : '—', s: isOffseason(league) ? undefined : 'so far' },
              { k: 'Expenses', v: games || ts.expenses ? money(ts.expenses) : '—', s: isOffseason(league) ? undefined : 'so far' },
            ]}
          />
        )}
      </div>

      <Section
        title="Attendance"
        right={
          <HelpSheet title="What fills the arena">
            <p>Winning, hype, market size, facilities and ticket price fill the arena. A hyped visitor draws a bigger crowd too.</p>
            <p>Hype rises with wins and falls with losses. Playoff wins count double. Every offseason it drifts back toward average.</p>
          </HelpSheet>
        }
      >
        <div className="fo-att">
          <Statline
            items={[
              {
                k: homeGames ? 'Per home game' : 'Projected',
                v: Math.round(attShown).toLocaleString(),
                s: full >= 100 ? 'sold out' : `${full}% of ${seats.toLocaleString()} seats`,
              },
              { k: 'Hype', v: Math.round(team.hype * 100), s: 'of 100' },
            ]}
          />
          <Bar value={Math.min(100, full)} height={6} />
        </div>
      </Section>

      <Section title={`${shortSeason(s)} costs`} right={<span className="tiny dim">{s > league.season ? 'projected' : 'full season, projected'}</span>}>
        <div className="fo-ledger">
          <div className="fo-stack" role="img" aria-label={expenses.map((e) => `${e.k} ${money(e.v)}`).join(', ')}>
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
                {money(e.v)}
              </Line>
            ))}
            <Line k={<b>Total</b>}>{money(totalExp)}</Line>
          </div>
          <More label="League money">
            <div className="small dim2 fo-help">
              <p>National TV and league revenue pay every team about {money(NATIONAL_REVENUE * scale)} a season.</p>
              <p>
                Teams over the {money(cap.luxuryTax)} tax line pay at the end of the regular season. The first {money(cap.salaryCap * TAX_BRACKET_PCT)} over costs {CAP.taxRate}×,
                and each bracket after costs more. A repeater pays 1× more on every bracket. {Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}% of the pot goes to teams under the
                line.
              </p>
              <p>
                Past the aprons, {money(cap.firstApron)} and {money(cap.secondApron)}, a team loses tools in trades and signings. Teams under the {money(cap.minPayroll)} salary
                floor pay the shortfall to their players.
              </p>
              <p>
                Revenue sharing evens out market size. Local revenue is the gate, merchandise and local TV. Each team pays or gets {Math.round(REVENUE_SHARING * 100)}% of its gap
                to the league average.
              </p>
            </div>
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
              {r.stretched > 0 && <span className="tag warn">{r.stretched === r.total ? 'stretched' : `${money(r.stretched)} stretched`}</span>}
              <span className="fo-money-a num">{money(r.total)}</span>
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
  // the books in the red: the owner's step, and under a freeze the budgets go no higher than the standard
  const books = booksOf(league);
  const frozen = books?.stage === 'freeze' || books?.stage === 'final';
  const rank = (k: BudgetKey) => 1 + league.teams.filter((t) => t.budget[k] > team.budget[k]).length;
  const avg = (k: BudgetKey) => league.teams.reduce((a, t) => a + t.budget[k], 0) / league.teams.length;
  const cost = (lvl: number) => budgetCostPerSeason(league, lvl);
  // fan demand on a temporary copy of the team, through the real attendance model
  const withBudget = (b: Partial<Team['budget']>): Team => ({ ...team, budget: { ...team.budget, ...b } });
  const items: { k: BudgetKey; label: string; effect: (lvl: number) => string; help: string }[] = [
    {
      k: 'coaching',
      label: 'Coaching staff',
      // a verdict, not the engine's effect size (DESIGN: copy never quotes one)
      effect: (lvl) => verdict(lvl, 'League-average player development', 'player development', 'Faster', 'Slower'),
      help: 'Assistant coaches, skills trainers and analytics staff. Better coaching makes every skill grow a little faster, in the offseason and in season. Young players gain the most.',
    },
    {
      k: 'health',
      label: 'Medical & health',
      effect: (lvl) => verdict(lvl, 'League-average injury recovery', 'injury recovery', 'Faster', 'Slower'),
      help: 'Doctors, physios and sports science. A bigger budget shortens injuries. Above average, it sometimes clears a player a game early.',
    },
    {
      k: 'facilities',
      label: 'Facilities',
      effect: (lvl) => {
        const fans = attendanceFor(league, withBudget({ facilities: lvl })) - attendanceFor(league, withBudget({ facilities: 50 }));
        if (fans !== 0) return `${fans > 0 ? '+' : ''}${fans.toLocaleString()} fans a home game vs average, at your price`;
        const dollars = Math.round(referencePrice(league, withBudget({ facilities: lvl })) - referencePrice(league, withBudget({ facilities: 50 })));
        if (dollars === 0) return 'League-average fan demand';
        return `Fans value a ticket $${Math.abs(dollars)} ${dollars > 0 ? 'more' : 'less'} than at an average arena`;
      },
      help: 'Arena upgrades, the practice facility and fan experience. Better facilities raise ticket demand: bigger crowds, more gate revenue.',
    },
  ];
  // ticket price: attendance estimate on a temporary copy of the team; the range grows with league revenue
  const priceAt = (price: number) => attendanceFor(league, withBudget({ ticketPrice: price }));
  const price = team.budget.ticketPrice;
  const scale = revenueScale(league);
  const [minPrice, maxPrice] = [30, 250].map((x) => Math.max(5, Math.round((x * scale) / 5) * 5));
  const att = priceAt(price);
  const seats = arenaCapacity(team);
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
      {books && (
        <Callout tone="bad" icon={<TriangleAlert size={18} className="bad" />}>
          <b>{frozen ? 'The budget is frozen.' : books.stage === 'ultimatum' ? "The owner's ultimatum." : 'The books are heading into the red.'}</b>{' '}
          {frozen
            ? `Budgets stay at level ${FROZEN_BUDGET} or under until the books close in the black.`
            : books.stage === 'ultimatum'
              ? 'Back in the black when the next books close, or he freezes the budget.'
              : 'Still in the red when the books close, and he gives you an ultimatum.'}{' '}
          <Link to="/office/owner" className="bold accent-text">
            Owner
          </Link>
        </Callout>
      )}
      <Section title="Staff & facilities" right={<span className="fo-faday num">{money(totalBudget)}/season</span>}>
        <div className="tiny dim">Paid out of profit, per game.{profitGoal ? ` Profit is ${Math.round(profitGoal.weight * 100)}% of the owner's review.` : ''}</div>
        <div className="card flush list">
          {items.map((it) => {
            const lvl = team.budget[it.k];
            const a = avg(it.k);
            const tied = league.teams.filter((t) => t.budget[it.k] === lvl).length;
            return (
              <div key={it.k} className="fo-budget">
                <div className="fo-budget-h">
                  <h3 className="grow">{it.label}</h3>
                  <HelpSheet title={it.label}>
                    <p>{it.help}</p>
                    <p>
                      It costs {money(cost(1))} a season at level 1, up to {money(cost(100))} at 100. The league&apos;s average level is {Math.round(a)}.
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
                  max={frozen ? Math.max(lvl, FROZEN_BUDGET) : 100}
                  onChange={(x) => set((t) => (t.budget[it.k] = frozen ? Math.min(x, Math.max(t.budget[it.k], FROZEN_BUDGET)) : x))}
                  format={(x) => `${money(cost(x))}/season`}
                  disabled={fired}
                />
                <div className={`small ${lvl > 50 ? 'good' : lvl < 50 ? 'warn' : 'dim2'}`}>{it.effect(lvl)}</div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Ticket price">
        <div className="card fo-ticket">
          <Slider
            label="Average ticket"
            value={price}
            min={minPrice}
            max={Math.max(maxPrice, price)}
            step={5}
            onChange={(x) => set((t) => Object.assign(t.budget, { ticketPrice: x, priceSet: true }))}
            format={(x) => `$${x}`}
            left={`$${minPrice}`}
            right={`$${maxPrice}`}
            disabled={fired}
          />
          <Statline
            items={[
              {
                k: 'Est. crowd',
                v: att >= seats ? 'Sellout' : att.toLocaleString(),
                s: `${Math.round((att / seats) * 100)}% full`,
                color: att >= seats ? 'var(--good)' : undefined,
              },
              { k: 'Gate / game', v: moneyExact(gate) },
              { k: 'Season gate', v: money(gate * 41), s: '41 home games' },
            ]}
          />
          <div className="small dim2">
            Gate revenue peaks near <b className="num">${sweet.p}</b>: {money(sweet.g * 41)} a season.
          </div>
          <More>
            <div className="small dim2 fo-help">
              <p>Higher prices earn more per fan but thin the crowd. The peak is at today&apos;s demand.</p>
              {!team.budget.priceSet && <p>Until you set a price, the staff prices tickets at the peak each opening night.</p>}
              <p>Playoff games sell at a {Math.round((PLAYOFF_PRICE_MULT - 1) * 100)}% premium. Prices rise with league revenue each summer.</p>
            </div>
          </More>
        </div>
      </Section>

      <Section title="Practice intensity">
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
    { key: 'season', label: 'Season', left: true, sticky: true, get: (r) => r.season, fmt: (v) => <span className="bold">{shortSeason(Number(v))}</span> },
    { key: 'rec', label: 'W-L', get: (r) => r.won - r.lost, fmt: (_v, r) => `${r.won}-${r.lost}` },
    {
      key: 'po',
      label: 'Playoffs',
      left: true,
      get: (r) => r.playoffRound,
      // how the season ended, as on the team and history pages (a play-in loss isn't a plain miss)
      fmt: (_v, r) => {
        const o = seasonOutcome(league, team.tid, r);
        return o.short === 'In progress' ? '—' : o.short;
      },
    },
    { key: 'rev', label: 'Revenue', get: (r) => r.revenue, fmt: (v) => money(Number(v)) },
    { key: 'exp', label: 'Expenses', get: (r) => r.expenses, fmt: (v) => money(Number(v)) },
    {
      key: 'pro',
      label: 'Profit',
      get: (r) => r.revenue - r.expenses,
      fmt: (v) => <span className={Number(v) >= 0 ? 'good' : 'bad'}>{moneySigned(Number(v))}</span>,
    },
    {
      key: 'att',
      label: 'Att/G',
      get: (r) => (r.homeWon + r.homeLost ? r.attendance / (r.homeWon + r.homeLost) : 0),
      fmt: (v) => (Number(v) ? Math.round(Number(v)).toLocaleString() : '—'),
    },
    { key: 'pay', label: 'Payroll', get: (r) => r.payroll, fmt: (v) => (Number(v) ? money(Number(v)) : '—') },
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
              aria-label={chart.map((r) => `${shortSeason(r.season)} ${moneySigned(r.revenue - r.expenses)}`).join(', ')}
            >
              {chart.map((r) => {
                const pr = r.revenue - r.expenses;
                return (
                  <div key={r.season} className={`${pr >= 0 ? 'up' : 'down'} ${inProgress && r.season === league.season ? 'live' : ''}`}>
                    <span className="v num">{moneySigned(pr)}</span>
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
          {inProgress ? 'This season is still in progress. ' : ''}
          Payroll is taken at each regular season&apos;s end.
        </div>
      </Section>
    </>
  );
}
