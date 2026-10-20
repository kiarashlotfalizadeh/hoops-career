// The owner: the one place for him (Office → Owner). Job security as one meter (see
// core/league/jobSecurity.ts), his ultimatum when there is one, the season's goals and how each
// stands, the kind of owner he is, and his past reviews. How he grades is behind the "?".
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { CAP_FOR, curTeamSeason, revenueScale } from '../../core/league/helpers';
import { FIRING_LINE, seasonsInCharge } from '../../core/league/owner';
import { GRACE, type JobSecurity, type SeatHeat } from '../../core/league/jobSecurity';
import { preset } from '../../core/league/difficulty';
import {
  ON_TRACK,
  PAYROLL_SCALE,
  PERSONALITY,
  POSTSEASON,
  PROFIT_SCALE,
  WIN_SCALE,
  YOUNG_AGE,
  currentGoals,
  ownerPersonality,
  ownerProgress,
  planOwnerGoals,
  postseasonLevel,
  resultText,
  type GoalStatus,
} from '../../core/league/ownerGoals';
import { forecastFor, seatOf } from './seat';
import { useLeague, useLeagueMemo } from '../../state/store';
import { Bar, More, PageHeader, Section, Tag } from '../components/ui';
import { CenterBar, HelpSheet, fmtGrade } from './common';
import './office.css';
import { money } from '../../core/format';

export default function Owner() {
  const league = useLeague();
  const tid = league.userTid;
  const js = useLeagueMemo(() => seatOf(league), [league]);
  const who = PERSONALITY[ownerPersonality(league, tid)];
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
      <PageHeader title="Owner" sub={league.fired ? undefined : `${who.label} · ${who.blurb}`} back backTo="/office" right={<GradingHelp league={league} />} />

      <Seat league={league} js={js} seasonsIn={seasonsIn} />

      {js.ultimatum && og && !review && <UltimatumCard league={league} js={js} />}

      {shown && (
        <Section
          title={review ? `${seasonLabel(shown.season)} review` : `${seasonLabel(shown.season)} goals`}
          right={
            review ? (
              <Tag tone={review.grade >= 0.1 ? 'good' : review.grade <= -0.1 ? 'bad' : 'warn'}>Season grade {fmtGrade(review.grade)}</Tag>
            ) : provisional ? (
              <Tag tone="info">Set on opening night</Tag>
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
                      {p.text} · weight {Math.round(p.goal.weight * 100)}%
                    </div>
                  </div>
                ))}
          </div>
          {review && (
            <div className="tiny dim">
              Each goal is graded −100 to +100 against its target (0: met exactly); weighted, they make the season&apos;s grade, which moves your job security.
            </div>
          )}
          {shown.from && !review && (
            <div className="tiny dim">
              Set when you took over: only the {shown.from.won + shown.from.lost > 0 ? `games after ${shown.from.won}-${shown.from.lost}` : 'rest of the season'} count.
            </div>
          )}
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
              <div key={`${r.season}-${r.tid}`} className="fo-goal">
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
              </div>
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}

const isOff = (l: League) => ['draftLottery', 'draft', 'resign', 'freeAgency'].includes(l.phase);

const HEAT_TONE: Record<SeatHeat, 'good' | 'info' | 'warn' | 'bad'> = { secure: 'good', steady: 'info', warm: 'warn', hot: 'bad' };

/** The meter: his standing on 0..100 (where the season projects), the heat, its line, and the parts behind it. */
function Seat({ league, js, seasonsIn }: { league: League; js: JobSecurity; seasonsIn: number }) {
  const om = league.ownerMood;
  const tone = league.fired ? 'bad' : js.off ? 'info' : HEAT_TONE[js.heat];
  // (js.line names the grace period itself when the seat is warm)
  const graceSaid = !js.off && js.grace > 0 && (js.heat === 'warm' || js.heat === 'hot');
  const tenure = league.fired
    ? null
    : seasonsIn < 1
      ? 'Your tenure starts next season'
      : `Season ${seasonsIn} in charge${!js.off && !graceSaid ? (js.grace > 0 ? ` · he can't fire you ${js.grace === 1 ? 'this season' : `for ${js.grace} seasons`}` : ' · no grace left') : ''}`;
  return (
    <section className={`card fo-seat tone-${tone}`} aria-label={`Job security: ${js.label}, ${js.score} of 100`}>
      <div className="fo-seat-top">
        {!league.fired && <span className="fo-seat-v num">{js.score}</span>}
        <div className="grow">
          <div className="fo-seat-l">{js.label}</div>
          <div className="over">Job security · out of 100</div>
        </div>
      </div>
      {!league.fired && <SeatMeter score={js.score} />}
      {!js.ultimatum && (
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
      how: `Every ${money((PROFIT_SCALE * scale) / 10)} above or below his target counts 10 (±100 at ${money(PROFIT_SCALE * scale)}).`,
    },
    {
      k: 'Payroll',
      how: `Under his line is +15 (up to +30 with room to spare); over it costs 25, down to −100 at ${money(PAYROLL_SCALE * cap.luxuryTax)} over.`,
    },
    { k: 'Development', how: `Minutes for players ${YOUNG_AGE} or under against his target: ±100 at half of it either way.` },
  ];
  return (
    <HelpSheet title="How the owner judges you">
      <p>
        On opening night he sets three or four goals from your roster: a win total, a postseason goal (or, for a rebuild, minutes for the young players) and a money goal. After the
        playoffs each is graded from −100 to +100; their weights make the season&apos;s grade.
      </p>
      {rows.map((r) => (
        <p key={r.k}>
          <b>{r.k}.</b> {r.how}
        </p>
      ))}
      <p>
        <b>Standing.</b> Your first season sets it; after that each season counts about {weight}%. The meter reads where this season would leave it as it projects now: 0 to 100,
        the firing line at {Math.round(50 + 50 * FIRING_LINE)}.
      </p>
      <p>
        <b>Grace.</b> On this difficulty he waits {grace} season{grace === 1 ? '' : 's'} before a review can fire you. Below the line after that, you&apos;re out.
      </p>
      <p>
        <b>Ultimatum.</b> On the hot seat at the All-Star break, he names one thing the season can still deliver. Meet it and you win back some standing; miss it and you&apos;re
        fired.
      </p>
      <p>A win-now owner weighs the playoffs more; a builder cares about the young players; a frugal one wants more profit.</p>
    </HelpSheet>
  );
}

const STATUS_LABEL: Record<GoalStatus, string> = { ahead: 'Ahead', 'on track': 'On track', behind: 'Behind', met: 'Met', missed: 'Missed' };
const STATUS_TONE: Record<GoalStatus, 'good' | 'info' | 'warn' | 'bad'> = { ahead: 'good', 'on track': 'info', behind: 'warn', met: 'good', missed: 'bad' };
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A standing (−1..1) on the job-security meter's 0..100. */
const meter = (x: number) => Math.round(Math.max(0, Math.min(100, 50 + 50 * x)));
const gradeColor = (x: number) => (x >= 0.1 ? 'var(--good)' : x <= -0.1 ? 'var(--bad)' : 'var(--warn)');
