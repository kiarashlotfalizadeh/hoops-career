// Your career (Office → Career) as a coach's profile: the record on a slab with where it ranks among
// the league's head coaches and how the job stands, the teams that want you (take the job or turn it
// down), then three tabs: Profile (the latest season's review, the honors cabinet, signature wins, the
// record by team and in the playoffs, past reviews), Milestones (the career's timeline) and Jobs
// (taking over any other team; your jobs are the Profile's record by team). ?review=<season> opens that season's review in place (SeasonReview).
// A fired coach lands here, on Jobs: the agenda's "Find a new job" and the flow both point to it,
// and the league waits until he takes one.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Award, ChevronRight, Crown, Flame, Landmark, Medal, Sparkles, Trophy } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { curTeamSeason, fmtDate, payroll } from '../../core/league/helpers';
import { coachCareer, coyWinners, userCoach, type CoachCareer } from '../../core/league/coaches';
import { seasonsInCharge } from '../../core/league/owner';
import { cabinet, coachRanks, gmLegacy, legacyOf, reviewPath, type Milestone, type SignatureWin, type Trophy as TrophyT } from '../../core/league/legacy';
import { endText, gradeWord, type SeasonReview } from '../../core/league/legacyReview';
import { DIFFICULTY } from '../../core/league/difficulty';
import { agenda } from '../../core/league/agenda';
import type { JobOffer } from '../../core/league/jobs';
import { useLeague, useLeagueMemo } from '../../state/store';
import { takeTeam, turnDownJob, useBusy } from '../../state/actions/office';
import { AgendaRow } from '../components/Agenda';
import { TeamLogo } from '../components/TeamLogo';
import { More, PageHeader, Section, Segmented, Statline } from '../components/ui';
import { TabBar, useQueryParam } from '../league/shared';
import { slabVars } from '../teamColors';
import { STRATEGY_META, capSeason, fmtGrade, shortSeason } from './common';
import { SeasonReviewView } from './SeasonReview';
import { usePulse, TrendMark } from './Pulse';
import { seatOf } from './seat';
import '../screens/start.css';
import './office.css';
import './legacy.css';
import { money, ordinal, plural } from '../../core/format';
import { seasonCoachingRead } from '../../core/analysis/debrief';

const pct = (w: number, l: number) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '—');

type Tab = 'profile' | 'milestones' | 'jobs';
const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'jobs', label: 'Jobs' },
];

export default function Career() {
  const league = useLeague();
  const [review] = useQueryParam<string>('review', '');
  if (review && Number.isFinite(Number(review))) return <SeasonReviewView league={league} season={Number(review)} />;
  return <Profile league={league} />;
}

function Profile({ league }: { league: League }) {
  const nav = useNavigate();
  const me = userCoach(league);
  const k = useLeagueMemo(() => (me ? coachCareer(league, me, coyWinners(league)) : null), [league, me]);
  const fired = useMemo(() => agenda(league).find((i) => i.kind === 'fired'), [league]);
  const [tab, setTab] = useQueryParam<Tab>('tab', league.fired ? 'jobs' : 'profile', ['profile', 'milestones', 'jobs']);
  // the record's poster on the first tab; on the others it's one line, so the tab starts on the first screen
  const full = tab === (league.fired ? 'jobs' : 'profile');
  const offers = league.jobOffers?.season === league.season ? league.jobOffers.offers : [];
  const team = league.teams[league.userTid];
  const seasonsIn = seasonsInCharge(league);
  const done = (ok: boolean) => ok && nav('/');
  const ranks = useLeagueMemo(() => coachRanks(league), [league]);

  return (
    <main className="page fo-page fo-career">
      <PageHeader title="Career" sub={league.coachName} back backTo="/office" />

      {/* (its own screen is this one: the row doesn't link) */}
      {fired && (
        <div className="card flush ag-list" role="alert">
          <AgendaRow item={{ ...fired, to: undefined }} />
        </div>
      )}

      <section className={`slab fo-career-slab${full ? '' : ' compact no-court'}`} aria-label="Your record">
        <div className="row between">
          <span className="over">
            {league.fired ? `Last job: the ${team.name}` : seasonsIn < 1 ? `${team.name} · from next season` : `${team.name} · season ${seasonsIn}`} ·{' '}
            {DIFFICULTY[league.settings.difficulty].label}
          </span>
          {me && k && k.seasons > 0 && (
            <Link to={`/league/history?view=coaches&coach=${me.id}`} className="card-link">
              Season by season
            </Link>
          )}
        </div>
        {/* the poster's figure: the career record, as big as it fits */}
        {k && (
          <div className="fo-career-rec">
            <span className="fo-career-rec-v num">
              {k.won}-{k.lost}
            </span>
            <span className="fo-career-rec-k">
              Career record · <span className="num">{pct(k.won, k.lost)}</span>
            </span>
          </div>
        )}
        {ranks && k && k.won + k.lost > 0 && (
          <div className="fo-lc-rank small">
            {ordinal(ranks.wins)} in wins of {ranks.of} head coaches{ranks.pct !== null ? ` · ${ordinal(ranks.pct)} by win% of ${ranks.pctOf}` : ''}
          </div>
        )}
        {k && <CareerLine k={k} />}
      </section>

      {!league.fired && full && <JobLine league={league} />}

      {offers.length > 0 && (
        <Section title={league.fired ? 'Teams that want you' : 'Teams calling'} right={<span className="tiny dim">Until the draft</span>}>
          <div className="card flush list">
            {offers.map((o) => (
              <OfferRow key={o.tid} league={league} o={o} onTake={() => done(takeTeam(league, o.tid))} onTurnDown={() => turnDownJob(league, o.tid)} />
            ))}
          </div>
        </Section>
      )}

      <TabBar value={tab} onChange={setTab} options={TABS} label="Career" />

      {tab === 'profile' && k && <ProfileTab league={league} k={k} />}
      {tab === 'milestones' && <Milestones league={league} />}
      {tab === 'jobs' &&
        (league.settings.godMode || (league.fired && !offers.length) ? (
          <TakeOver league={league} onTaken={() => nav('/')} />
        ) : (
          <div className="card empty">
            {offers.length
              ? `${offers.length > 1 ? 'Those offers are' : 'That offer is'} your way to another job.`
              : 'Jobs come to you: after the playoffs, teams that change coaches call when they rate you above their hire.'}{' '}
            Your reputation comes with you: part of where you stand with this owner. God mode (Settings) can put you anywhere.
          </div>
        ))}
    </main>
  );
}

/** A career's figures in a row under the record: seasons, playoff runs and titles. */
function CareerLine({ k }: { k: CoachCareer }) {
  return (
    <Statline
      items={[
        { k: 'Seasons', v: k.seasons },
        { k: 'Playoffs', v: k.playoffs },
        { k: 'Titles', v: k.titles, s: k.coy.length ? `COY ×${k.coy.length}` : undefined, color: k.titles ? 'var(--tier-elite)' : undefined },
      ]}
    />
  );
}

/** The job as it stands, in one row: the owner's meter and the fans, to Office → Owner. */
function JobLine({ league }: { league: League }) {
  const js = useLeagueMemo(() => seatOf(league), [league]);
  const p = usePulse(league);
  return (
    <Link to="/office/owner" className={`card fo-lc-job tone-${js.heat}`}>
      <span className="fo-lc-job-v num">{js.score}</span>
      <span className="grow fo-min0">
        <span className="bold">Job security · {js.label}</span>
        <span className="tiny dim fo-lc-job-l">
          Owner <TrendMark trend={p.owner.trend} /> · Fans {p.fans.word} <TrendMark trend={p.fans.trend} />
        </span>
      </span>
      <ChevronRight size={16} className="dim" aria-hidden="true" />
    </Link>
  );
}

// ---------------------------------------------------------------- profile

function ProfileTab({ league, k }: { league: League; k: CoachCareer }) {
  const lg = legacyOf(league);
  const trophies = useLeagueMemo(() => cabinet(league, k), [league, k]);
  const latest = lg.reviews[lg.reviews.length - 1];
  const verdict = latest && league.ownerReviews?.find((r) => r.season === latest.season && r.tid === latest.tid);
  // the series behind the playoff runs: a round reached is a series won for each round before it
  const series = k.lines.reduce((a, l) => (l.round !== undefined && l.round >= 1 ? [a[0] + l.round - 1, a[1] + (l.round < 5 ? 1 : 0)] : a), [0, 0]);
  const post = lg.post;
  const firstCoached = k.lines[0]?.season;
  // what his live coaching was worth this season, measured game by game after each final (debrief.ts)
  const live = useLeagueMemo(() => seasonCoachingRead(league), [league]);
  return (
    <>
      {latest && (
        <Link to={reviewPath(latest.season)} className="card clickable fo-lc-review">
          <span className="over">{seasonLabel(latest.season)} in review</span>
          <span className="fo-lc-review-h">{latest.fired ? 'Fired' : endText(latest)}</span>
          <span className="small">
            {latest.won}-{latest.lost}
            {verdict ? ` · owner's grade ${fmtGrade(verdict.grade)}, ${gradeWord(verdict.grade).toLowerCase()}` : ''}
            {playedOn(latest) && ` · ${playedOn(latest)}`}
          </span>
          <ChevronRight size={18} className="fo-lc-review-go" aria-hidden="true" />
        </Link>
      )}

      <Section title="Honors" right={trophies.length ? <span className="tiny dim">{plural(trophies.length, 'honor')}</span> : undefined}>
        {trophies.length ? (
          <div className="fo-cab">
            {trophies.map((t) => (
              <TrophyTile key={`${t.kind}-${t.season}-${t.label}`} league={league} t={t} />
            ))}
          </div>
        ) : (
          <div className="card empty">Titles, Coach of the Year and Coach of the Month go in the cabinet.</div>
        )}
      </Section>

      <YourPlayers league={league} k={k} />

      <Section title="Signature wins">
        {lg.wins.length ? (
          <div className="card flush list">
            {lg.wins.slice(0, 6).map((w) => (
              <WinRow key={`${w.season}-${w.gid}`} league={league} w={w} />
            ))}
          </div>
        ) : (
          <div className="card empty">Upsets, closeouts and titles land here as you win them.</div>
        )}
      </Section>

      <Section title="Record">
        <div className="card flush list">
          {[...k.stints].reverse().map((j, i) => {
            const first = j.lines[0]?.season ?? j.stint.from;
            const last = j.lines[j.lines.length - 1]?.season ?? first;
            return (
              <div key={i} className="listrow">
                <TeamLogo tid={j.stint.tid} size={30} decorative />
                <div className="grow fo-min0">
                  <div className="lr-name ellipsis">
                    {league.teams[j.stint.tid].region} {league.teams[j.stint.tid].name}
                  </div>
                  <div className="lr-meta">
                    {!j.stint.to ? `since ${seasonLabel(first)}` : first === last ? seasonLabel(first) : `${shortSeason(first)} to ${shortSeason(last)}`}
                    {j.titles ? ` · ${plural(j.titles, 'title')}` : j.playoffs ? ` · ${plural(j.playoffs, 'playoff run')}` : ''}
                  </div>
                </div>
                <span className="fo-lc-rec">
                  <span className="num bold">
                    {j.won}-{j.lost}
                  </span>
                  <span className="tiny dim num">{pct(j.won, j.lost)}</span>
                </span>
              </div>
            );
          })}
          <div className="listrow">
            <Trophy size={20} className="fo-lc-ic" aria-hidden="true" />
            <div className="grow fo-min0">
              <div className="lr-name">Playoffs</div>
              <div className="lr-meta">
                {plural(k.playoffs, 'trip')} · series {series[0]}-{series[1]}
                {post && post[0] + post[1] > 0
                  ? ` · games ${post[0]}-${post[1]}${firstCoached !== undefined && lg.since > firstCoached ? ` since ${seasonLabel(lg.since)}` : ''}`
                  : ''}
              </div>
            </div>
            <span className="num bold">{k.best >= 1 ? bestText(k.best) : '—'}</span>
          </div>
          {live && (
            <div className="listrow">
              <Sparkles size={20} className="fo-lc-ic" aria-hidden="true" />
              <div className="grow fo-min0">
                <div className="lr-name">Live coaching, this season</div>
                <div className="lr-meta">
                  {plural(live.games, 'game')} coached live, measured (about {live.pm})
                </div>
              </div>
              <span className="num bold">{live.clear ? live.worth : 'Too close'}</span>
            </div>
          )}
        </div>
      </Section>

      {lg.reviews.length > 1 && (
        <Section title="Season reviews">
          <div className="card flush list">
            {[...lg.reviews]
              .reverse()
              .slice(1)
              .map((r) => {
                const v = league.ownerReviews?.find((x) => x.season === r.season && x.tid === r.tid);
                return (
                  <Link key={r.season} to={reviewPath(r.season)} className="listrow">
                    <TeamLogo tid={r.tid} size={26} decorative />
                    <div className="grow fo-min0">
                      <div className="lr-name">{seasonLabel(r.season)}</div>
                      <div className="lr-meta">
                        {r.won}-{r.lost} · {r.fired ? (r.round === 5 ? 'won the title · fired' : 'fired') : endText(r).toLowerCase()}
                        {playedOn(r) && ` · ${playedOn(r)}`}
                      </div>
                    </div>
                    {v && <span className="num bold">{fmtGrade(v.grade)}</span>}
                    <ChevronRight size={16} className="dim" aria-hidden="true" />
                  </Link>
                );
              })}
          </div>
        </Section>
      )}
    </>
  );
}

/**
 * The GM's side of the career (legacy.ts gmLegacy): his Hall of Fame case as the press reads it, the
 * teams that won his titles, the players he drafted and what they became, his best and worst trades
 * graded by what each side's players produced since, and the honours his players won with him.
 */
function YourPlayers({ league, k }: { league: League; k: CoachCareer }) {
  const gm = useLeagueMemo(() => gmLegacy(league, k), [league, k]);
  const best = gm.trades.find((t) => t.verdict === 'won');
  const worst = [...gm.trades].reverse().find((t) => t.verdict === 'lost');
  const c = gm.coached;
  const honours = [c.mvp && `${c.mvp}× MVP`, c.fmvp && `${c.fmvp}× Finals MVP`, c.allNba && `${c.allNba}× All-NBA`, c.allStar && `${c.allStar}× All-Star`]
    .filter(Boolean)
    .join(', ');
  const any = gm.drafted.length || gm.trades.length || gm.titles.length || honours;
  return (
    <Section title="Your legacy">
      <div className="card flush list">
        {k.seasons > 0 && (
          <div className="listrow">
            <Landmark size={20} className="fo-lc-ic" aria-hidden="true" />
            <div className="grow fo-min0">
              <div className="lr-name">Hall of Fame case</div>
              <div className="lr-meta">{gm.hof.line}</div>
            </div>
            <span className={`tag ${gm.hof.status === 'in' ? 'good' : gm.hof.status === 'building' ? 'info' : ''}`}>
              {gm.hof.status === 'in' ? 'In' : gm.hof.status === 'building' ? 'Building' : 'Not yet'}
            </span>
          </div>
        )}
        {gm.titles.slice(0, 3).map((t) => (
          <div key={t.season} className="listrow">
            <TeamLogo tid={t.tid} size={26} decorative />
            <div className="grow fo-min0">
              <div className="lr-name">{seasonLabel(t.season)} champions</div>
              <div className="lr-meta">{[t.fmvp && `${t.fmvp} (Finals MVP)`, ...t.core].filter(Boolean).join(', ')}</div>
            </div>
          </div>
        ))}
        {gm.drafted.slice(0, 3).map((d) => (
          <Link key={d.pid} to={`/player/${d.pid}`} className="listrow">
            <Medal size={20} className="fo-lc-ic" aria-hidden="true" />
            <div className="grow fo-min0">
              <div className="lr-name ellipsis">{d.name}</div>
              <div className="lr-meta">
                Drafted {d.pick} in {d.season}
                {d.honours ? ` · ${d.honours}` : ''} · {d.now}
              </div>
            </div>
            {d.peak !== undefined && (
              <span className="fo-lc-rec">
                <span className="num bold">{d.peak}</span>
                <span className="tiny dim">peak</span>
              </span>
            )}
          </Link>
        ))}
        {[best, worst].map(
          (t) =>
            t && (
              <div key={t.id} className="listrow">
                <ArrowLeftRight size={20} className="fo-lc-ic" aria-hidden="true" />
                <div className="grow fo-min0">
                  <div className="lr-name">
                    {t.verdict === 'won' ? 'Best trade' : 'Worst trade'}: {tradeText(t.got, t.gotPicks)} for {tradeText(t.gave, t.gavePicks)}
                  </div>
                  <div className="lr-meta">
                    {seasonLabel(t.season)} · since: {t.gotPts.toLocaleString('en-US')} pts in {t.gotGames} games for you, {t.gavePts.toLocaleString('en-US')} in {t.gaveGames} for
                    them
                  </div>
                </div>
                <span className={`tag ${t.verdict === 'won' ? 'good' : 'bad'}`}>{t.verdict === 'won' ? 'Won it' : 'Lost it'}</span>
              </div>
            ),
        )}
        {honours && (
          <div className="listrow">
            <Award size={20} className="fo-lc-ic" aria-hidden="true" />
            <div className="grow fo-min0">
              <div className="lr-name">Your players' honours</div>
              <div className="lr-meta">
                {honours}
                {c.names.length ? ` · ${c.names.join(', ')}` : ''}
              </div>
            </div>
          </div>
        )}
        {!any && (
          <div className="listrow">
            <div className="lr-meta">The players you draft and trade for, and what they become, land here.</div>
          </div>
        )}
      </div>
    </Section>
  );
}

/** "Mikal Bridges and 2 picks": one side of a trade in a line. */
const tradeText = (names: string[], picks: number) => {
  const parts = [...names.slice(0, 2), ...(names.length > 2 ? [`${names.length - 2} more`] : []), ...(picks ? [plural(picks, 'pick')] : [])];
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? 'nothing');
};

/** The difficulty a season was played on, as the career records it ("Hard", "Easy, job security off"); empty for a season from before it was kept. */
const playedOn = (r: SeasonReview) => (r.difficulty ? `${DIFFICULTY[r.difficulty].label}${r.jobSecurity === false ? ', job security off' : ''}` : '');

const bestText = (round: number) => (round === 5 ? 'Champion' : round === 4 ? 'Finals' : round === 3 ? 'Conf. finals' : round === 2 ? '2nd round' : '1st round');

const TROPHY: Record<TrophyT['kind'], { icon: typeof Trophy; cls: string; name: string }> = {
  title: { icon: Trophy, cls: 'gold', name: 'Champions' },
  cup: { icon: Trophy, cls: 'cup', name: 'NBA Cup' },
  conf: { icon: Crown, cls: 'conf', name: 'Conference title' },
  coy: { icon: Award, cls: 'coy', name: 'Coach of the Year' },
  cotm: { icon: Medal, cls: 'cotm', name: 'Coach of the Month' },
};

/** A piece of the cabinet: its icon in its colour (gold for a title), what it is, when, with which team. */
function TrophyTile({ league, t }: { league: League; t: TrophyT }) {
  const m = TROPHY[t.kind];
  const Icon = m.icon;
  const when = t.kind === 'cotm' ? `${t.n ? 'latest ' : ''}${t.label.replace('Coach of the Month · ', '')}` : seasonLabel(t.season);
  return (
    <div className={`fo-cab-t ${m.cls}`}>
      <Icon size={t.kind === 'title' ? 30 : 24} aria-hidden="true" />
      <span className="fo-cab-n">{t.n ? `${t.n}× ${m.name}` : m.name}</span>
      <span className="fo-cab-s num">
        {when} · {league.teams[t.tid]?.abbrev}
      </span>
    </div>
  );
}

/** A signature win: what it was, when and how big an underdog he was. */
function WinRow({ league, w }: { league: League; w: SignatureWin }) {
  const kept = league.games.some((g) => g.gid === w.gid && g.season === w.season);
  const Icon = w.kind === 'title' ? Trophy : w.kind === 'upset' ? Flame : Sparkles;
  const body = (
    <>
      <Icon size={18} className={`fo-lc-ic ${w.kind}`} aria-hidden="true" />
      <div className="grow fo-min0">
        <div className="lr-name">{w.line}</div>
        <div className="lr-meta">
          {fmtDate(w.season, w.day, { month: 'short', day: 'numeric', year: 'numeric' })}
          {w.p !== undefined ? ` · ${w.p}% to win at tip-off` : ''}
        </div>
      </div>
    </>
  );
  return kept ? (
    <Link to={`/game/${w.gid}`} className="listrow">
      {body}
    </Link>
  ) : (
    <div className="listrow">{body}</div>
  );
}

// ---------------------------------------------------------------- milestones

/** The career's milestones, newest first, by season; the front pages stand out. */
function Milestones({ league }: { league: League }) {
  const lg = legacyOf(league);
  const ms = [...lg.milestones].reverse();
  if (!ms.length) return <div className="card empty">Your first win, career wins, streaks, playoff runs and titles go on this timeline as they happen.</div>;
  const seasons = [...new Set(ms.map((m) => m.season))];
  return (
    <>
      {seasons.map((s) => (
        <Section key={s} title={seasonLabel(s)}>
          <ol className="card flush list fo-tl">
            {ms
              .filter((m) => m.season === s)
              .map((m) => (
                <MilestoneRow key={m.key} league={league} m={m} />
              ))}
          </ol>
        </Section>
      ))}
      {lg.since > league.startSeason && <div className="tiny dim">Milestones are kept from {seasonLabel(lg.since)}.</div>}
    </>
  );
}

function MilestoneRow({ league, m }: { league: League; m: Milestone }) {
  return (
    <li className={`fo-tl-row ${m.big ? 'big' : ''}`}>
      <span className="fo-tl-dot" aria-hidden="true" />
      <div className="grow fo-min0">
        <div className="fo-tl-when tiny dim">
          {fmtDate(m.season, m.day)} · {league.teams[m.tid]?.abbrev}
        </div>
        <div className="fo-tl-head">{m.head}</div>
        <div className="small dim2">{m.text}</div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- jobs

/** One team's offer: who they are and where they stand, the job, and Take / Turn down. */
function OfferRow({ league, o, onTake, onTurnDown }: { league: League; o: JobOffer; onTake: () => void; onTurnDown: () => void }) {
  const t = league.teams[o.tid];
  const busy = useBusy();
  const ts = curTeamSeason(league, t.tid);
  const books = capSeason(league);
  return (
    <div className="ag-row tone-good">
      <div className="ag-head">
        <TeamLogo tid={t.tid} size={34} decorative />
        <div className="grow">
          <div className="ag-title">
            {t.region} {t.name}
          </div>
          <div className="ag-line">
            <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>{' '}
            <span className="num">
              {ts.won}-{ts.lost} · {money(payroll(league, t.tid, books))} payroll{books > league.season ? ` ${shortSeason(books)}` : ''}
            </span>
          </div>
        </div>
      </div>
      <div className="small dim2">{o.note}</div>
      <div className="ag-acts">
        <button className="btn xs primary" disabled={busy} onClick={onTake}>
          Take the job
        </button>
        <button className="btn xs" disabled={busy} onClick={onTurnDown}>
          Turn down
        </button>
      </div>
    </div>
  );
}

/** Any team in the league: by conference, each with its record; the pick's strategy and books, and the move. */
function TakeOver({ league, onTaken }: { league: League; onTaken: () => void }) {
  const cur = league.teams[league.userTid];
  const [conf, setConf] = useState<'E' | 'W'>(cur.conf);
  const [pick, setPick] = useState<number | null>(null);
  const busy = useBusy();
  const t = pick !== null && pick !== league.userTid ? league.teams[pick] : null;
  const books = capSeason(league);
  return (
    <Section title={league.settings.godMode ? 'Take over any team (god mode)' : 'Take over a team'}>
      <div className="small dim2">
        {league.fired ? (league.settings.godMode ? 'God mode puts you anywhere.' : 'No offers on file: pick a team.') : `The ${cur.name} go back to the AI staff.`}{' '}
        <More label="What carries over">
          <div className="small dim2">
            Part of your standing with this owner comes with you, and the new owner sets his goals: in season from that day (in the playoffs, the next round), otherwise on opening
            night. Your coaching ratings come with you; the season, finances and league history carry on.
          </div>
        </More>
      </div>
      <Segmented
        value={conf}
        onChange={setConf}
        label="Conference"
        options={[
          { id: 'E', label: 'East' },
          { id: 'W', label: 'West' },
        ]}
      />
      <div className="nl-grid">
        {league.teams
          .filter((x) => x.conf === conf)
          .map((x) => {
            const ts = curTeamSeason(league, x.tid);
            const me = x.tid === league.userTid;
            const on = pick === x.tid && !me;
            return (
              <button
                key={x.tid}
                className={`nl-team ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={me}
                style={on ? slabVars(x.colors) : me ? { opacity: 0.45 } : undefined}
                onClick={() => setPick(x.tid)}
              >
                <TeamLogo tid={x.tid} size={28} decorative />
                <span className="nl-team-name">{x.name}</span>
                <span className="nl-team-sub num">{me ? (league.fired ? 'Fired' : 'Yours') : `${ts.won}-${ts.lost}`}</span>
              </button>
            );
          })}
      </div>
      {t && (
        <div className="dockbar fo-career-dock" role="region" aria-label="Take over">
          <TeamLogo tid={t.tid} size={34} decorative />
          <div className="grow fo-min0">
            <div className="bold ellipsis">
              {t.region} {t.name}
            </div>
            <div className="tiny dim ellipsis">
              <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>{' '}
              {/* the books he'd inherit: next season's after this one ends, as on the Office cap sheet */}
              <span className="num">
                {money(payroll(league, t.tid, books))}
                {books > league.season ? ` in ${shortSeason(books)}` : ''}
              </span>
            </div>
          </div>
          <button className="btn primary" disabled={busy} onClick={() => takeTeam(league, t.tid) && onTaken()}>
            Take over {t.abbrev}
          </button>
        </div>
      )}
    </Section>
  );
}
