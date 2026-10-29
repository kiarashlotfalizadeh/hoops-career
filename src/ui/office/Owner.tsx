// The owner: the one place for him (Office → Owner). Job security as one meter (see
// core/league/jobSecurity.ts), his ultimatum when there is one, the pulse (his mood and the fans'
// through the season, see Pulse.tsx), the season's goals and how each stands, the kind of owner he
// is, and his past reviews, each opening its season's review (Career). How he grades is behind the "?".
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { CAP_FOR, curTeamSeason, revenueScale } from '../../core/league/helpers';
import { FIRING_LINE, seasonsInCharge } from '../../core/league/owner';
import { GRACE, SEASON_WEIGHT, ULTIMATUM_ODDS, seasonWeight, seatHeat, type JobSecurity, type SeatHeat } from '../../core/league/jobSecurity';
import { BLEED_GRADE, DEBT_LIMIT, FREEZE_GRADE, booksOf, booksOutlook, deeperText } from '../../core/league/books';
import { seasonEndCash } from '../../core/league/finances';
import {
  CONCEDE_COST,
  FLOOR_GRADE,
  FLOOR_MARGIN,
  HOLD_OVER_READ,
  ON_TRACK,
  PAY_RAISE,
  PATIENCE_STEP,
  PAYROLL_SCALE,
  personalityLine,
  POSTSEASON,
  POSTSEASON_ODDS,
  PROFIT_SCALE,
  REBUILD_OVER_FLOOR,
  REBUILD_SEASONS,
  WIN_FLOOR,
  WIN_SCALE,
  WIN_SLIDE,
  YOUNG_AGE,
  YOUTH_TOP,
  currentGoals,
  goalsWhy,
  ownerPersonality,
  ownerProgress,
  planOwnerGoals,
  postseasonLevel,
  previewTitle,
  resultText,
  type GoalStatus,
} from '../../core/league/ownerGoals';
import { forecastFor, seatOf } from './seat';
import { PulseSection } from './Pulse';
import { reviewPath, seasonReviewOf } from '../../core/league/legacy';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Bar, More, PageHeader, Section, Tag } from '../components/ui';
import { CenterBar, HelpSheet, fmtGrade } from './common';
import './office.css';
import { keepFigures, money } from '../../core/format';

export default function Owner() {
  const league = useLeague();
  const tid = league.userTid;
  const js = useLeagueMemo(() => seatOf(league), [league]);
  const og = currentGoals(league);
  // before opening night: the goals the owner would set with today's roster
  const provisional = useLeagueMemo(() => (!og && !league.fired && league.phase === 'preseason' ? planOwnerGoals(league, tid) : null), [league, og, tid]);
  const shown = og ?? provisional ?? undefined;
  const progress = useLeagueMemo(() => ownerProgress(league, shown, og ? forecastFor(league) : null), [league, shown, og]);
  const reviews = [...(league.ownerReviews ?? [])].reverse();
  // after the playoffs the season's review stands in for its progress
  const review = og ? reviews.find((r) => r.season === og.season && r.tid === og.tid && r.goals.length) : undefined;
  const past = reviews.filter((r) => r !== review);
  const onTrack = progress.filter((p) => ON_TRACK.has(p.status)).length;
  const seasonsIn = seasonsInCharge(league);

  return (
    <main className="page fo-page">
      <PageHeader
        title="Owner"
        sub={league.fired ? undefined : personalityLine(ownerPersonality(league, tid), shown)}
        back
        backTo="/office"
        right={<GradingHelp league={league} />}
      />

      <Seat league={league} js={js} seasonsIn={seasonsIn} />

      {js.ultimatum && og && !review && <UltimatumCard league={league} js={js} />}

      {booksOf(league) && <BooksCard league={league} />}

      <PulseSection league={league} />

      {shown && (
        <Section
          title={review ? `${seasonLabel(shown.season)} review` : `${seasonLabel(shown.season)} goals`}
          right={
            review ? (
              <Tag tone={review.grade >= 0.1 ? 'good' : review.grade <= -0.1 ? 'bad' : 'warn'}>Season grade {fmtGrade(review.grade)}</Tag>
            ) : provisional ? (
              <Tag tone="info">Final on opening night</Tag>
            ) : (
              <Tag tone={onTrack === progress.length ? 'good' : onTrack * 2 >= progress.length ? 'info' : 'warn'}>
                {onTrack} of {progress.length} on track
              </Tag>
            )
          }
        >
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
                      {capitalize(resultText(g, g.result))} · weight {Math.round(g.weight * 100)}%
                    </div>
                  </div>
                ))
              : progress.map((p) => (
                  <div key={p.goal.kind} className="fo-goal">
                    <div className="fo-goal-h">
                      <span className="bold grow">{provisional ? previewTitle(p.goal) : p.goal.title}</span>
                      {!provisional && <Tag tone={STATUS_TONE[p.status]}>{p.before && p.status === 'behind' ? 'Behind his read' : STATUS_LABEL[p.status]}</Tag>}
                    </div>
                    {/* (no bar before opening night: nothing has happened yet) */}
                    {!provisional && (
                      <div aria-hidden="true">
                        <Bar value={p.fill} max={1} color={`var(--${STATUS_TONE[p.status]})`} />
                      </div>
                    )}
                    <div className="tiny dim">
                      {p.text} · weight {Math.round(p.goal.weight * 100)}%
                    </div>
                  </div>
                ))}
          </div>
          {review?.held && <div className="small dim2">{HELD[review.held]}</div>}
          {review && <div className="tiny dim">Graded −100 to +100. 0 is a goal met exactly.</div>}
          {review && seasonReviewOf(league, review.season) && (
            <Link to={reviewPath(review.season)} className="card-link">
              The season in review
            </Link>
          )}
          {shown.from && !review && (
            <div className="tiny dim">
              Set when you took over: only the {shown.from.won + shown.from.lost > 0 ? keepFigures(`games after ${shown.from.won}-${shown.from.lost}`) : 'rest of the season'}{' '}
              count.
            </div>
          )}
          {/* his reasons: what he pays for, the rebuild clock, the floor */}
          {!review &&
            goalsWhy(shown, 'screen').map((line) => (
              <div key={line} className="tiny dim">
                {line}
              </div>
            ))}
        </Section>
      )}
      {!shown && !league.fired && (
        <Section title="Goals">
          <div className="empty">
            {isOff(league) || seasonsIn < 1
              ? "He sets next season's goals on opening night."
              : league.phase === 'regular'
                ? 'He sets his goals for the rest of the season tomorrow.'
                : 'This season is graded on wins, the playoffs and profit.'}
          </div>
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past reviews">
          <div className="card flush list">
            {past.map((r, i) => (
              <PastReview key={`${r.season}-${r.tid}`} league={league} season={r.season}>
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
                    <span className="dim"> grade · standing {fmtGrade(r.total)}</span>
                  </span>
                </div>
                {/* the latest three goal by goal, older seasons by their grades */}
                {i < 3 && (
                  <div className="tiny dim">
                    {r.goals.length
                      ? r.goals.map((g) => (
                          <div key={g.kind}>
                            {g.title}: {resultText(g, g.result)} · {fmtGrade(g.grade)}
                          </div>
                        ))
                      : 'Graded on wins, the playoffs and profit.'}
                  </div>
                )}
              </PastReview>
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}

/** A past review's row: a link to that season's review in Career when one was kept. */
function PastReview({ league, season, children }: { league: League; season: number; children: ReactNode }) {
  return seasonReviewOf(league, season) ? (
    <Link to={reviewPath(season)} className="fo-goal fo-goal-link">
      {children}
    </Link>
  ) : (
    <div className="fo-goal">{children}</div>
  );
}

const isOff = (l: League) => ['draftLottery', 'draft', 'resign', 'freeAgency'].includes(l.phase);

const HEAT_TONE: Record<SeatHeat, 'good' | 'info' | 'warn' | 'bad'> = { secure: 'good', steady: 'info', warm: 'warn', hot: 'bad' };

/** The meter: his standing on 0..100 (where the season projects), the heat, its line, and the parts behind it. */
function Seat({ league, js, seasonsIn }: { league: League; js: JobSecurity; seasonsIn: number }) {
  const om = league.ownerMood;
  const tone = league.fired ? 'bad' : js.off ? 'info' : HEAT_TONE[js.heat];
  // (js.line names the grace period itself when the seat is warm)
  // after the season's review the grace left starts with next season
  const done = isOff(league);
  const left = js.left;
  const graceSaid = !js.off && left > 0 && (js.heat === 'warm' || js.heat === 'hot');
  // (a new career's first season sets the standing outright: the grace isn't a free season, see seasonWeight)
  const sets = !done && seasonWeight(league) >= 1;
  const graceText =
    left > 0
      ? ` · safe ${left === 1 ? (done ? 'next season' : 'this season') : `for ${done ? 'the next ' : ''}${left} seasons`}${sets ? ' · this one sets your standing' : ''}`
      : ' · no grace left';
  const tenure = league.fired
    ? null
    : seasonsIn < 1
      ? 'Your tenure starts next season'
      : `Season ${seasonsIn} ${done ? 'done' : 'in charge'}${!js.off && !graceSaid ? graceText : ''}`;
  return (
    <section className={`fo-seat tone-${tone}`} aria-label={`Job security: ${js.label}, ${js.score} of 100`}>
      <div className="fo-seat-top">
        {!league.fired && <span className="fo-seat-v num">{js.score}</span>}
        <div className="grow">
          <div className="fo-seat-l">{js.label}</div>
          {/* (fired, there's no figure for it to describe) */}
          <div className="over">{league.fired ? 'Job security' : 'Job security · out of 100'}</div>
        </div>
      </div>
      {/* the sack on the way whatever the standing (a live ultimatum has its own card below) */}
      {js.danger && !js.ultimatum && <p className="fo-seat-danger bold">{js.danger}</p>}
      {!league.fired && <SeatMeter score={js.score} />}
      {!js.ultimatum && !js.danger && (
        <p className="fo-seat-line">
          {js.line}
          {league.fired && (
            <>
              {' '}
              <Link to="/office/career" className="bold accent-text">
                Find a new job
              </Link>
            </>
          )}
        </p>
      )}
      {js.off && (
        <Link to="/settings" className="card-link">
          Settings
        </Link>
      )}
      {tenure && <div className="tiny dim">{tenure}</div>}
      {!league.fired && (
        <More label="Standing by part">
          <div className="fo-owner-parts">
            {([['Wins', om.wins], ['Playoffs', om.playoffs], ['Money', om.money], ...(om.youth !== undefined ? [['Youth', om.youth] as const] : [])] as const).map(([k, val]) => (
              <div key={k} className="fo-owner-row">
                <span className="over">{k}</span>
                <CenterBar value={val} />
                <span className="num">{fmtGrade(val)}</span>
              </div>
            ))}
          </div>
          <div className="tiny dim">
            Standing now: {fmtGrade(js.standing)}, {meter(js.standing)} on the meter. This season projects it to {fmtGrade(js.projected)}, {meter(js.projected)}.
          </div>
        </More>
      )}
    </section>
  );
}

/** A track from the hot seat to secure, the firing line marked, and where he stands. */
function SeatMeter({ score }: { score: number }) {
  const line = Math.round(50 + 50 * FIRING_LINE);
  return (
    <div className="fo-meterbar" aria-hidden="true">
      <div className="fo-meterbar-track">
        <i className="z hot" style={{ flexGrow: 32 }} />
        <i className="z warm" style={{ flexGrow: 13 }} />
        <i className="z steady" style={{ flexGrow: 20 }} />
        <i className="z secure" style={{ flexGrow: 35 }} />
      </div>
      {/* the scale, so a number reads against the goals below: the firing line over the track, goals met exactly (50) under it */}
      <span className="fo-meterbar-line" style={{ left: `${line}%` }}>
        <span>Fired under {line}</span>
      </span>
      <span className="fo-meterbar-mid">
        <span>50: goals met</span>
      </span>
      {/* the two ends named in the ladder's words, so the zones read without their colours (the hot seat is hatched too) */}
      <span className="fo-meterbar-end lo">{seatHeat(0).label}</span>
      <span className="fo-meterbar-end hi">{seatHeat(100).label}</span>
      <span className="fo-meterbar-pin" style={{ left: `${Math.max(1, Math.min(99, score))}%` }} />
    </div>
  );
}

/** The ultimatum: what he asked for at the All-Star break, and how it stands. */
function UltimatumCard({ league, js }: { league: League; js: JobSecurity }) {
  const u = js.ultimatum!;
  const og = currentGoals(league)!;
  const ts = curTeamSeason(league, og.tid);
  const now = u.kind === 'wins' ? ts.won - (og.from?.won ?? 0) : postseasonLevel(ts);
  const met = now >= u.target;
  return (
    <section className="card fo-ultimatum" aria-label="The owner's ultimatum">
      <div className="row">
        <TriangleAlert size={18} className={met ? 'good' : 'bad'} aria-hidden="true" />
        <span className="over grow">Ultimatum</span>
        {met && <Tag tone="good">Met</Tag>}
      </div>
      <h2>{u.text}</h2>
      <div className="small dim2">
        {u.kind === 'wins' ? `${now} of ${u.target} so far.` : `So far: ${POSTSEASON[Math.max(0, now)].result}.`} Miss it and you're fired, whatever else goes right.
      </div>
      {u.kind === 'wins' && <Bar value={now} max={u.target} color={met ? 'var(--good)' : 'var(--bad)'} />}
    </section>
  );
}

const BOOKS_LABEL = { warning: 'Warning', ultimatum: 'Ultimatum', freeze: 'Budget frozen', final: 'Final warning' } as const;

/** What held a reviewed season's grade down, in a line (see OwnerReview.held). */
const HELD = {
  floor: 'Under his floor: nothing else could lift this grade.',
  patience: 'Past his rebuild allowance and out of the postseason. Nothing else could lift this grade.',
  books: 'The books closed in the red under the freeze. Not even a title could lift this grade.',
  debt: "The books closed past his debt limit. A title couldn't lift this grade.",
} as const;

const redOrBlack = (x: number) => `${money(Math.abs(x))} in the ${x < 0 ? 'red' : 'black'}`;

/**
 * The books in the red: the step he has taken, what it means, and the one figure he judges: where
 * the regular season's books close (projected in season, the close itself in the postseason, next
 * season's between seasons), the luxury tax he signed off on not counted against the coach (see
 * sanctionedTax).
 */
function BooksCard({ league }: { league: League }) {
  const b = booksOf(league)!;
  const o = booksOutlook(league);
  const left = seasonEndCash(league, league.userTid).left;
  const between = isOff(league);
  const closed = b.close ?? league.teams[league.userTid].cash;
  const tax = o.tax > 0 ? `, after ${money(o.tax)} in luxury tax` : '';
  const signed = o.tax > 0 && o.sanctioned > 0 ? ` The ${money(o.sanctioned)} he signed off on doesn't count.` : '';
  const proj =
    left === 0 && !between
      ? `The regular season's books closed ${redOrBlack(o.judged)}${tax}. The review reads that, not the playoff gates.${signed}`
      : between
        ? `Next season's books project ${redOrBlack(o.judged)}${tax}.${signed}`
        : `Projected at the regular season's close: ${redOrBlack(o.judged)}${tax}.${signed}`;
  // what closing deeper in the red brings, as the review will read it (the final warning, or past the debt limit the sack)
  const deeper = deeperText(league, between);
  return (
    <section className="card fo-ultimatum" aria-label="The books">
      <div className="row">
        <TriangleAlert size={18} className="bad" aria-hidden="true" />
        <span className="over grow">The books</span>
        <Tag tone="bad">{BOOKS_LABEL[b.stage]}</Tag>
      </div>
      <h2>{b.stage === 'warning' && b.close === undefined ? `${money(-Math.min(0, o.judged))} in the red when the books close` : `Closed ${money(-closed)} in the red`}</h2>
      <div className="small dim2">
        {b.stage === 'warning'
          ? b.close === undefined
            ? `Luxury tax in, playoff money out. Still in the red at the close, and he gives you an ultimatum.${signed}`
            : "You inherited this payroll, so it's a warning this time. Still in the red next season, and he gives you an ultimatum."
          : b.stage === 'ultimatum'
            ? 'Back in the black when the next books close, or he freezes the budget.'
            : b.stage === 'freeze'
              ? 'Minimum deals only, no raises, no trade that adds salary. It lasts until a season closes in the black.'
              : `The freeze stands. ${deeper}`}{' '}
        {(b.stage !== 'warning' || b.close !== undefined) && proj}
      </div>
      {b.stage === 'freeze' && (
        <More label="What the freeze means">
          <div className="small dim2 fo-help">
            <p>No raises means no re-signing, extending, qualifying or matching above what he&apos;s paid. No trade may send cash. Staff budgets stay at the league standard.</p>
            <p>A frozen season closed in the red grades {fmtGrade(FREEZE_GRADE)} at best, title or not.</p>
            {deeper && <p>{deeper}</p>}
          </div>
        </More>
      )}
      <Link to="/office/finances" className="card-link">
        Finances
      </Link>
    </section>
  );
}

/** How the owner grades the season and decides, in full. */
function GradingHelp({ league }: { league: League }) {
  const scale = revenueScale(league);
  const cap = CAP_FOR(league);
  // what a season counts once the first one has set the standing (see seasonWeight)
  const weight = Math.round(SEASON_WEIGHT * 100);
  const rows: { k: string; how: string }[] = [
    { k: 'Wins', how: `Each win above or below his target counts ${Math.round(100 / WIN_SCALE)}. It reaches ±100 at ${WIN_SCALE} wins either way.` },
    { k: 'Postseason', how: 'Reaching his goal is +30, and each round beyond it 30 more. Each round short costs 35. The play-in counts as a round.' },
    {
      k: 'Profit',
      how: `Every ${money((PROFIT_SCALE * scale) / 10)} above or below his target counts 10, up to ±100 at ${money(PROFIT_SCALE * scale)}. Savings from budgets under the league standard don't count.`,
    },
    {
      k: 'Payroll',
      how: `Under his line is +15, up to +30 with room to spare. Over it costs 25, down to −100 at ${money(PAYROLL_SCALE * cap.luxuryTax)} over.`,
    },
    {
      k: 'Development',
      how: `Minutes for players ${YOUNG_AGE} or under, against his target. Half the target short is −100. Past it, +${Math.round(YOUTH_TOP * 100)} at most.`,
    },
  ];
  return (
    <HelpSheet title="How the owner judges you">
      <p>
        On opening night he sets three or four goals from your roster. The win total is the season forecast&apos;s read. The postseason goal never asks for a round the forecast
        gives under a {Math.round(POSTSEASON_ODDS * 100)}% chance. For a rebuild, minutes for the young players replace it. The money goal is a profit target at the league&apos;s
        standard prices and budgets.
      </p>
      <p>After the playoffs each goal is graded −100 to +100. Their weights make the season&apos;s grade.</p>
      {rows.map((r) => (
        <p key={r.k}>
          <b>{r.k}.</b> {r.how}
        </p>
      ))}
      <p>
        <b>Standing.</b> Your first season sets it. After that each season counts about {weight}%. So does your first with a new team, against the reputation you bring. The meter
        shows where this season would leave it: 0 to 100, the firing line at {Math.round(50 + 50 * FIRING_LINE)}.
      </p>
      <p>
        <b>Grace.</b> He waits {GRACE} seasons before a review can fire you. Below the line after that, you&apos;re out.
      </p>
      <p>
        <b>Ultimatum.</b> On the hot seat at the All-Star break, he names one thing the season can still deliver. The forecast gives it at least a{' '}
        {Math.round(ULTIMATUM_ODDS * 100)}% chance. Meet it and you win back some standing. Miss it and you&apos;re fired.
      </p>
      <p>
        <b>Payroll.</b> After your first season, a top-half payroll of your own raises the win target. It rises toward what a team paid like that should win, by {PAY_RAISE} wins at
        most.
      </p>
      <p>
        <b>The bar.</b> Outside a rebuild, the win target falls at most {WIN_SLIDE} wins from last season&apos;s. It never sits more than {HOLD_OVER_READ} over his read.
      </p>
      <p>
        <b>The floor.</b> Whatever the plan, under a .{Math.round(WIN_FLOOR * 1000)} pace is a failed season. It grades Poor or worse, whatever else went right. The floor never
        sits closer than {FLOOR_MARGIN} wins under his read.
      </p>
      <p>
        <b>Rebuilds.</b> He accepts {REBUILD_SEASONS} seasons in a row without the postseason. After that he wants the play-in at least, and the floor rises to .
        {Math.round((WIN_FLOOR + REBUILD_OVER_FLOOR) * 1000)}. A season that still misses grades {fmtGrade(FLOOR_GRADE)} at best, {Math.round(PATIENCE_STEP * 100)} lower each
        season it goes on. Only reaching the postseason resets the clock. The play-in counts.
      </p>
      <p>
        <b>Calling a rebuild.</b> With the playoffs gone before the deadline, tell him it&apos;s a rebuild. It costs {Math.round(CONCEDE_COST * 100)} points of standing and counts
        on the clock. The postseason goal&apos;s weight moves to the young players&apos; minutes. That can spare you the miss, but earns nothing on top.
      </p>
      <p>
        <b>A development year.</b> Heading under his floor, tell him it&apos;s a development year, for the same cost. The floor stays. A season that ends under it grades high
        enough to win the cost back, and a little more. One that clears the floor just pays it. Part of the win goal moves to the young players&apos; minutes.
      </p>
      <p>
        <b>The books.</b> The luxury tax and every loss come out of the franchise&apos;s cash. He judges it the day the regular season&apos;s books close, tax paid. The playoff
        gates come after: his bonus, not your cover.
      </p>
      <p>
        <b>In the red.</b> Heading into the red in the three weeks before the deadline, he warns you. Closed in the red at the review, he gives an ultimatum. At the next, he
        freezes the budget. Then it&apos;s minimum deals only, no raises, no trade that adds salary, and staff budgets at the league standard.
      </p>
      <p>
        <b>The freeze.</b> A frozen season closed in the red grades {fmtGrade(FREEZE_GRADE)} at best, title or not. Deeper in the red than the season before brings a final warning,{' '}
        {fmtGrade(BLEED_GRADE)} at best. Deeper again gets you fired.
      </p>
      <p>
        <b>Debt.</b> Past {money(DEBT_LIMIT * scale)} in the red, no title lifts a season&apos;s grade. A close past it, deeper than the season before, goes straight to the freeze.
        Under the freeze, it gets you fired.
      </p>
      <p>
        <b>Owners.</b> A win-now owner weighs the playoffs more. He lets a contender pay some tax, up to the first apron. A builder cares about the young players. A frugal one
        wants more profit.
      </p>
    </HelpSheet>
  );
}

const STATUS_LABEL: Record<GoalStatus, string> = { ahead: 'Ahead', 'on track': 'On track', behind: 'Behind', met: 'Met', missed: 'Missed' };
const STATUS_TONE: Record<GoalStatus, 'good' | 'info' | 'warn' | 'bad'> = { ahead: 'good', 'on track': 'info', behind: 'warn', met: 'good', missed: 'bad' };
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A standing (−1..1) on the job-security meter's 0..100. */
const meter = (x: number) => Math.round(Math.max(0, Math.min(100, 50 + 50 * x)));
const gradeColor = (x: number) => (x >= 0.1 ? 'var(--good)' : x <= -0.1 ? 'var(--bad)' : 'var(--warn)');
