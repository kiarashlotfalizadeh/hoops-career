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
import { GRACE, ULTIMATUM_ODDS, seasonWeight, seatHeat, type JobSecurity, type SeatHeat } from '../../core/league/jobSecurity';
import { preset } from '../../core/league/difficulty';
import { BLEED_GRADE, DEBT_LIMIT, FREEZE_GRADE, booksOf, booksOutlook, deeperText } from '../../core/league/books';
import { seasonEndCash } from '../../core/league/finances';
import {
  CONCEDE_COST,
  FLOOR_EASE,
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
          {review && (
            <div className="tiny dim">
              Each goal is graded −100 to +100 against its target (0: met exactly); weighted, they make the season&apos;s grade, which moves your job security.
            </div>
          )}
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
            goalsWhy(shown).map((line) => (
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
                            {g.title}: {resultText(g, g.result)} ({fmtGrade(g.grade)})
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
      ? ` · he can't fire you ${left === 1 ? (done ? 'next season' : 'this season') : `for ${done ? 'the next ' : ''}${left} seasons`}${sets ? ', but this one sets your standing' : ''}`
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
            Standing {fmtGrade(js.standing)} now ({meter(js.standing)} on the meter); this season projects it to {fmtGrade(js.projected)} ({meter(js.projected)}).
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
  patience: 'Past his rebuild allowance and out of the postseason: nothing else could lift this grade.',
  books: 'The books closed in the red under the freeze: no result, a title included, could lift this grade past that.',
  debt: "The books closed past his debt limit: a title couldn't lift this grade.",
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
  const tax = o.tax > 0 ? `, after a ${money(o.tax)} luxury tax${o.sanctioned > 0 ? ` (the ${money(o.sanctioned)} he signed off on doesn't count against you)` : ''}` : '';
  const proj =
    left === 0 && !between
      ? `The regular season's books closed ${redOrBlack(o.judged)}${tax}: the review reads that, not the playoff gates.`
      : between
        ? `Next season's books project ${redOrBlack(o.judged)}${tax}.`
        : `Projected when the regular season's books close: ${redOrBlack(o.judged)}${tax}.`;
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
            ? "Where the regular season's books are heading, luxury tax included (bar what he signed off on); playoff money doesn't count. Still in the red when they close, and he gives you an ultimatum."
            : "You inherited this payroll, so it's a warning this time. Still in the red when next season's books close, and he gives you an ultimatum."
          : b.stage === 'ultimatum'
            ? "Back in the black when the next season's books close, or he freezes the budget."
            : b.stage === 'freeze'
              ? `Minimum deals only, no raises (re-signing, extending, qualifying or matching), no trade that takes on salary or sends cash, the staff budgets at the league standard, until a season's books close in the black. Closed in the red, a frozen season grades ${fmtGrade(FREEZE_GRADE)} at best, a title or not. ${deeper}`
              : `The freeze stands. ${deeper}`}{' '}
        {(b.stage !== 'warning' || b.close !== undefined) && proj}
      </div>
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
  const grace = GRACE[league.settings.difficulty];
  // what a season counts once the first one has set the standing (see seasonWeight)
  const weight = Math.round(Math.min(0.6, Math.max(0.2, 0.4 * preset(league).ownerPressure)) * 100);
  const rows: { k: string; how: string }[] = [
    { k: 'Wins', how: `Each win above or below his target counts ${Math.round(100 / WIN_SCALE)} (±100 at ${WIN_SCALE} wins either way).` },
    { k: 'Postseason', how: 'Reaching his goal is +30 and each round beyond it 30 more; each round short costs 35 (the play-in counts as one).' },
    {
      k: 'Profit',
      how: `Every ${money((PROFIT_SCALE * scale) / 10)} above or below his target counts 10 (±100 at ${money(PROFIT_SCALE * scale)}). What staff and facilities budgets under the league standard save doesn't count.`,
    },
    {
      k: 'Payroll',
      how: `Under his line is +15 (up to +30 with room to spare); over it costs 25, down to −100 at ${money(PAYROLL_SCALE * cap.luxuryTax)} over.`,
    },
    {
      k: 'Development',
      how: `Minutes for players ${YOUNG_AGE} or under against his target: −100 at half of it short; past it, +${Math.round(YOUTH_TOP * 100)} at most (the minutes are yours to hand out).`,
    },
  ];
  return (
    <HelpSheet title="How the owner judges you">
      <p>
        On opening night he sets three or four goals from your roster: a win total (his read of the roster is the season forecast&apos;s), a postseason goal (never a round the
        forecast gives less than a {Math.round(POSTSEASON_ODDS * 100)}% chance; for a rebuild, minutes for the young players instead) and a money goal (a profit target from the
        league&apos;s standard ticket price and budgets). After the playoffs each is graded from −100 to +100; their weights make the season&apos;s grade.
      </p>
      {rows.map((r) => (
        <p key={r.k}>
          <b>{r.k}.</b> {r.how}
        </p>
      ))}
      <p>
        <b>Standing.</b> Your first season sets it; after that each season counts about {weight}%, and so does your first with a new team, against the reputation you bring. The
        meter reads where this season would leave it as it projects now: 0 to 100, the firing line at {Math.round(50 + 50 * FIRING_LINE)}.
      </p>
      <p>
        <b>Grace.</b> On this difficulty he waits {grace} season{grace === 1 ? '' : 's'} before a review can fire you; a season played on another difficulty uses up its own share
        of the wait. Below the line after that, you&apos;re out.
      </p>
      <p>
        <b>Ultimatum.</b> On the hot seat at the All-Star break, he names one thing the season can still deliver: one the forecast gives at least a{' '}
        {Math.round(ULTIMATUM_ODDS * 100)}% chance. Meet it and you win back some standing; miss it and you&apos;re fired.
      </p>
      <p>
        <b>Payroll and the floor.</b> After your first season, a payroll of your own in the league&apos;s top half raises the win target toward what a team paid like it should win,
        by {PAY_RAISE} wins at most. Outside a rebuild the target falls at most {WIN_SLIDE} wins a season under last season&apos;s, but never sits more than {HOLD_OVER_READ} over
        his read. Whatever the plan, under a .{Math.round(preset(league).winFloor * 1000)} pace is a failed season (never closer than {FLOOR_MARGIN} wins under his read): it grades
        Poor or worse, whatever else went right.
      </p>
      <p>
        <b>Rebuilds.</b> On this difficulty he accepts {preset(league).rebuildSeasons} season{preset(league).rebuildSeasons === 1 ? '' : 's'} in a row without the postseason (a
        rebuild, or a season that missed). After that he wants the play-in at least, the floor rises to .{Math.round((preset(league).winFloor + REBUILD_OVER_FLOOR) * 1000)}, and a
        season that misses the postseason anyway grades {fmtGrade(FLOOR_GRADE)} at best, {Math.round(PATIENCE_STEP * 100)} lower each season it goes on. Only reaching the
        postseason (the play-in counts) resets the clock. With the playoffs gone before the deadline, you can tell him it&apos;s a rebuild: it costs you{' '}
        {Math.round(CONCEDE_COST * 100)} points of standing, counts as one, and the postseason goal&apos;s weight goes to the young players&apos; minutes, where it can spare you
        the miss but earns nothing on top. Heading under his floor, you can tell him it&apos;s a development year: the floor drops {Math.round(FLOOR_EASE * 82)} wins for the same
        cost, and part of the win goal goes to the young players&apos; minutes, still graded on the win goal&apos;s miss.
      </p>
      <p>
        <b>The books.</b> The luxury tax and every loss come out of the franchise&apos;s cash, and he judges it the day the regular season&apos;s books close, tax paid: the playoff
        gates come after, his bonus rather than your cover. Heading into the red in the three weeks before the deadline, he warns you. Closed in the red at the review: an
        ultimatum; at the next, he freezes the budget: minimum deals only, no raises, no trade that takes on salary, the staff budgets at the league standard. A frozen season
        closed in the red grades {fmtGrade(FREEZE_GRADE)} at best, a title or not; deeper in the red than the season before, a final warning ({fmtGrade(BLEED_GRADE)} at best), and
        deeper again gets you fired. Past {money(DEBT_LIMIT * scale)} in the red no title lifts a season&apos;s grade; a close past it and deeper than the season before goes
        straight to the freeze, and under the freeze it gets you fired.
      </p>
      <p>
        A win-now owner weighs the playoffs more and lets a contender pay some tax (up to the first apron); a builder cares about the young players; a frugal one wants more profit.
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
