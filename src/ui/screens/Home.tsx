import { Link } from 'react-router-dom';
import { useMemo, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, ClipboardList, Eye, FlaskConical, Handshake, Lightbulb, Mail, Target } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { liveInProgress } from '../../state/live';
import { CAP_FOR, age, curTeamSeason, fmtDate, payroll, sentence, teamPlayers } from '../../core/league/helpers';
import { normalizeLink } from '../league/shared';
import { inAppPath } from '../nav';
import { userGameOnDay } from '../../core/league/games';
import { cupLabel } from '../../core/league/cup';
import { confStandings } from '../../core/league/standings';
import { openProposals } from '../../core/league/proposals';
import { scoutTeam, teamAlerts } from '../../core/ai/advisor';
import { TeamLogo } from '../components/TeamLogo';
import { OddsLine } from '../components/OddsLine';
import { Avatar, Ovr, Section, Statline } from '../components/ui';
import { flowActions } from '../flow';
import { useFlowRunner } from '../useFlow';
import { f1, ordinal, playerSeason, rosterNames, signed, teamRatings } from '../stats';
import { PHASE_LABEL, seasonLabel } from '../../core/constants';
import type { League } from '../../core/types';
import { clearPlan, planFor } from '../../core/league/gamePlans';
import { countdownLabel, matchupPreview } from '../../core/analysis/preview';
import { storylines } from '../../core/analysis/storylines';
import { ON_TRACK, currentGoals, goalMet, ownerProgress } from '../../core/league/ownerGoals';
import { leagueForecast } from '../../core/analysis/odds';
import { fmtM } from '../office/common';
import './home.css';

/** The phase slab's overline and headline: offseason events are named by the year they happen in. */
function phaseTitle(league: League): [string, string] {
  switch (league.phase) {
    case 'draftLottery':
      return [`${league.season} offseason`, 'Draft lottery'];
    case 'draft':
      return [`${league.season} offseason`, 'NBA Draft'];
    case 'resign':
      return [`${league.season} offseason`, 'Re-sign period'];
    case 'freeAgency':
      return [`${league.season} offseason`, 'Free agency'];
    default:
      return [seasonLabel(league.season), PHASE_LABEL[league.phase] ?? ''];
  }
}

/** A message's lines run together for a one-line preview: one that doesn't end a sentence gets its period. */
function previewText(body: string): string {
  return body
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.endsWith(':') ? x : sentence(x)))
    .join(' ');
}

function nextUserGame(league: League) {
  const today = userGameOnDay(league, league.day);
  if (today) return today;
  return league.schedule.filter((g) => !g.played && g.day >= league.day && (g.home === league.userTid || g.away === league.userTid)).sort((a, b) => a.day - b.day)[0];
}

const lastName = (league: League, pid: number, fallback: string) => league.players[pid]?.lastName ?? fallback;

export default function Home() {
  const league = useLeague();
  const run = useFlowRunner();
  const simming = useStore((s) => !!s.sim);
  const team = league.teams[league.userTid];
  const ts = curTeamSeason(league, league.userTid);
  const inSeason = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const next = inSeason ? nextUserGame(league) : undefined;
  const oppTid = next ? (next.home === league.userTid ? next.away : next.home) : undefined;
  const scout = useLeagueMemo(() => (oppTid !== undefined ? scoutTeam(league, oppTid) : null), [league, oppTid]);
  const plan = oppTid !== undefined && next ? planFor(league, oppTid, next) : null;
  // countdown, back-to-backs, who's out, the season series and the playoff stakes (no lineups needed: the rotations aren't refreshed here)
  const pv = useLeagueMemo(() => (next ? matchupPreview(league, next.gid) : null), [league, next]);
  // tonight's lead storyline (players who won't play are left out of them)
  const story = useLeagueMemo(() => {
    if (!next || !pv) return undefined;
    const out = new Set([pv.us, pv.them].flatMap((s) => [...s.out, ...s.resting, ...s.questionable.filter((q) => !q.cleared)].map((p) => p.pid)));
    return storylines(league, next, out)[0];
  }, [league, next, pv]);
  const alerts = useLeagueMemo(() => teamAlerts(league, league.userTid), [league]);
  const actions = flowActions(league);
  const unread = league.inbox.filter((m) => !m.read).slice(0, 3);
  // AI teams' open trade offers (each also in the inbox)
  const offers = openProposals(league).length;
  const conf = useLeagueMemo(() => confStandings(league, team.conf), [league, team.conf]);
  const myRank = conf.findIndex((r) => r.tid === league.userTid);
  const nearby = conf.slice(Math.max(0, Math.min(myRank - 3, conf.length - 7)), Math.max(7, Math.min(conf.length, myRank + 4)));
  const roster = useLeagueMemo(() => teamPlayers(league, league.userTid), [league]);
  const nameOf = useMemo(() => rosterNames(roster), [roster]);
  const leaders = useLeagueMemo(
    () =>
      (['pts', 'reb', 'ast'] as const).map((k) => {
        let best: { name: string; v: number; pid: number } | null = null;
        for (const p of roster) {
          const pg = playerSeason(p, league.season);
          if (!pg || pg.gp < 1) continue;
          const val = pg[k];
          if (!best || val > best.v) best = { name: nameOf(p.pid), v: val, pid: p.pid };
        }
        return { k, best };
      }),
    [league, roster, nameOf],
  );
  const recent = league.games
    .filter((g) => g.season === league.season && (g.home.tid === league.userTid || g.away.tid === league.userTid))
    .slice(-5)
    .reverse();
  const tr = teamRatings(ts);
  const played = ts.won + ts.lost > 0;
  const primary = actions.find((a) => a.primary);
  const live = next ? liveInProgress(league) : null;
  const inProgress = !!live && live.gid === next?.gid;
  const cup = next ? cupLabel(league, next) : null;
  const confName = team.conf === 'E' ? 'East' : 'West';

  return (
    <main className="page">
      {league.fired && (
        <div className="card row" role="alert" style={{ borderColor: 'color-mix(in srgb, var(--bad) 45%, var(--line))' }}>
          <AlertTriangle className="bad" size={20} />
          <div className="grow">
            <div className="bold">You were fired</div>
            <div className="small dim">Take over another team to keep your career going.</div>
          </div>
        </div>
      )}

      {!league.settings.onboarded && <Onboarding />}

      {next && oppTid !== undefined ? (
        <section className="slab hm-hero" aria-label="Next game">
          <span className="slab-mark">
            <TeamLogo tid={league.userTid} size={210} decorative />
          </span>
          <div className="hm-over">
            <span>
              {pv?.playoff
                ? pv.playoff.tag
                : next.type === 'playoffs'
                  ? 'Playoffs'
                  : next.type === 'playin'
                    ? 'Play-In'
                    : next.cup === 'final'
                      ? cup
                      : `Game ${ts.won + ts.lost + 1}${cup ? ` · ${cup}` : ''}`}
            </span>
            <span>{fmtDate(league.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
          <div className="hm-match">
            {[next.away, next.home].map((tid, i) => (
              <Link key={tid} to={tid === league.userTid ? '/roster' : `/team/${tid}`} className={`hm-side ${i ? 'home' : ''}`}>
                <TeamLogo tid={tid} size={58} decorative />
                <span className="hm-ab">{league.teams[tid].abbrev}</span>
                <span className="hm-rec num">
                  {curTeamSeason(league, tid).won}-{curTeamSeason(league, tid).lost}
                </span>
              </Link>
            ))}
            <div className="hm-mid">
              <span className="hm-at">{next.home === league.userTid ? 'vs' : '@'}</span>
              {pv && <span className="hm-when">{inProgress ? 'Live' : countdownLabel(pv.days)}</span>}
            </div>
          </div>
          {pv && (pv.playoff?.elimination || pv.playIn?.elimination || pv.playoff?.clinch || pv.us.b2b || pv.them.b2b) && (
            <div className="chips hm-chips">
              {(pv.playoff?.elimination || pv.playIn?.elimination) && <span className="tag bad">Elimination game</span>}
              {pv.playoff?.clinch && <span className="tag good">A win takes the series</span>}
              {pv.us.b2b && <span className="tag">{team.abbrev} on a back-to-back</span>}
              {pv.them.b2b && <span className="tag">{league.teams[oppTid].abbrev} on a back-to-back</span>}
            </div>
          )}
          {pv && (
            <dl className="hm-facts">
              {next.seriesId &&
                (() => {
                  const s = league.playoffs.find((x) => x.id === next.seriesId);
                  return s ? (
                    <Fact k="Series">
                      {league.teams[s.high].abbrev} {s.highWins}-{s.lowWins} {league.teams[s.low].abbrev}
                    </Fact>
                  ) : null;
                })()}
              {pv.them.won + pv.them.lost > 0 && (
                <Fact k="Form">
                  {league.teams[oppTid].abbrev}{' '}
                  {Math.abs(pv.them.streak) > 1
                    ? `${pv.them.streak > 0 ? 'won' : 'lost'} ${Math.abs(pv.them.streak)} straight`
                    : `${pv.them.streak > 0 ? 'won' : 'lost'} last game`}{' '}
                  · {pv.them.lastTen} in last {Math.min(10, pv.them.won + pv.them.lost)}
                </Fact>
              )}
              {pv.series.games.length > 0 && !next.seriesId && (
                <Fact k="Meetings">
                  {pv.series.won}-{pv.series.lost} this season · last{' '}
                  <Link to={`/game/${pv.series.games[pv.series.games.length - 1].gid}`} className="bold hm-link">
                    {pv.series.games[pv.series.games.length - 1].won ? 'W' : 'L'} {pv.series.games[pv.series.games.length - 1].us}-
                    {pv.series.games[pv.series.games.length - 1].them}
                  </Link>
                </Fact>
              )}
              {[pv.us, pv.them].map((side) => {
                const parts = [
                  ...side.out.map((p) => `${lastName(league, p.pid, p.name)} ${p.games}g`),
                  ...side.resting.map((p) => `${lastName(league, p.pid, p.name)} (rest)`),
                  ...side.questionable.map((p) => `${lastName(league, p.pid, p.name)} (${p.cleared ? 'cleared' : 'questionable'})`),
                ];
                return parts.length ? (
                  <Fact key={side.tid} k={`${league.teams[side.tid].abbrev} out`}>
                    {parts.join(', ')}
                  </Fact>
                ) : null;
              })}
            </dl>
          )}
          {story && <p className="hm-story">{story.text}</p>}
          <div className="hm-actions">
            <Link to={`/preview/${next.gid}`} className="btn sm">
              <Eye size={15} /> Preview
            </Link>
            <Link to={`/gameplan/${oppTid}`} className="btn sm">
              <ClipboardList size={15} /> Game plan
            </Link>
            <Link to={`/lab?opp=${oppTid}`} className="btn sm">
              <FlaskConical size={15} /> Lab
            </Link>
          </div>
        </section>
      ) : (
        <section className="slab hm-hero hm-phase" aria-label={phaseTitle(league).join(' ')}>
          <span className="slab-mark">
            <TeamLogo tid={league.userTid} size={210} decorative />
          </span>
          {/* (the slab's colours and mark say whose it is) */}
          <div className="hm-over">
            <span>{phaseTitle(league)[0]}</span>
          </div>
          <h2 className="hm-phase-title">{phaseTitle(league)[1]}</h2>
          {primary && <p className="hm-phase-sub">{primary.disabled ?? primary.sub ?? `Next: ${primary.label}.`}</p>}
          {actions.some((a) => !a.primary) && (
            <div className="hm-actions">
              {actions
                .filter((a) => !a.primary)
                .map((a) => (
                  <button key={a.id} className="btn sm" disabled={!!a.disabled || simming} onClick={() => void run(a)}>
                    {a.label}
                  </button>
                ))}
            </div>
          )}
        </section>
      )}

      {scout && oppTid !== undefined && (
        <Section
          title={`Scouting · ${league.teams[oppTid].abbrev}`}
          right={
            <Link className="card-link" to={`/team/${oppTid}?tab=scouting`}>
              Report <ChevronRight size={14} />
            </Link>
          }
        >
          <div className="card hm-scout">
            {scout.threats[0] && (
              <div className="hm-sline">
                <span className="tag bad">Threat</span>
                <span className="grow">
                  <b>{scout.threats[0].name}</b>. {scout.threats[0].why}
                </span>
              </div>
            )}
            {scout.weaknesses[0] && (
              <div className="hm-sline">
                <span className="tag good">Attack</span>
                <span className="grow">{scout.weaknesses[0]}</span>
              </div>
            )}
            <div className="hm-plan">
              {plan ? (
                <>
                  <div className="row between">
                    <span className="over">Your plan{plan.scope === 'series' ? ' · this series' : plan.scope === 'season' ? ' · all season' : ''}</span>
                    <button className="btn xs ghost" onClick={() => useStore.getState().mutate((l) => clearPlan(l, oppTid))}>
                      Clear
                    </button>
                  </div>
                  <div className="chips">
                    {plan.matchups && Object.keys(plan.matchups).length > 0 && <span className="tag info">Planned matchups</span>}
                    {plan.items.map((it) => (
                      <span key={it.id} className="tag info">
                        {it.label}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <Link to={`/gameplan/${oppTid}`} className="row between hm-noplan">
                  <span className="small dim2">No game plan for {league.teams[oppTid].abbrev} yet</span>
                  <span className="card-link">
                    Make one <ChevronRight size={14} />
                  </span>
                </Link>
              )}
            </div>
          </div>
        </Section>
      )}

      {inSeason && (
        <div className="card hm-strip">
          <Statline
            items={[
              { k: 'Record', v: `${ts.won}-${ts.lost}`, s: myRank >= 0 ? `${ordinal(myRank + 1)} ${confName}` : '' },
              { k: 'Off', v: played ? f1(tr.ortg) : '—' },
              { k: 'Def', v: played ? f1(tr.drtg) : '—' },
              { k: 'Net', v: played ? signed(tr.net) : '—', color: !played ? undefined : tr.net >= 0 ? 'var(--good)' : 'var(--bad)' },
            ]}
          />
        </div>
      )}

      <NeedsYou league={league} offers={offers} alerts={alerts} />

      <div className="md-grid2">
        <Section
          title={`${confName} standings`}
          right={
            <Link className="card-link" to="/league" aria-label="Full standings">
              Full <ChevronRight size={14} />
            </Link>
          }
        >
          <div className="card flush">
            <div className="list">
              {nearby.map((r) => (
                <Link key={r.tid} to={`/team/${r.tid}`} className={`hm-st ${r.tid === league.userTid ? 'me' : ''}`}>
                  {/* no ranks before anyone has played, as on the Standings tab */}
                  <span className="num hm-st-rank">{r.won + r.lost === 0 ? '—' : r.confRank}</span>
                  <TeamLogo tid={r.tid} size={24} decorative />
                  <span className="grow ellipsis">{league.teams[r.tid].name}</span>
                  <span className="num hm-st-rec">
                    {r.won}-{r.lost}
                  </span>
                  <span className="num hm-st-gb">{r.gb === 0 ? '—' : r.gb.toFixed(1)}</span>
                </Link>
              ))}
            </div>
            <div className="hm-st-foot">
              <OddsLine league={league} tid={league.userTid} />
              {inSeason && <div className="tiny dim">Top 6 make the playoffs; 7-10 the play-in.</div>}
            </div>
          </div>
        </Section>

        <Section
          title={
            <h3>
              <Mail size={13} /> Inbox
            </h3>
          }
          right={
            <Link className="card-link" to="/inbox" aria-label="All inbox messages">
              All <ChevronRight size={14} />
            </Link>
          }
        >
          {unread.length === 0 ? (
            <div className="card small dim">No new messages.</div>
          ) : (
            <div className="card flush list">
              {unread.map((m) => (
                <Link
                  key={m.id}
                  className="hm-msg"
                  to={inAppPath(m.link ? normalizeLink(m.link) : '', '/inbox')}
                  onClick={() =>
                    useStore.getState().mutate((l) => {
                      const x = l.inbox.find((y) => y.id === m.id);
                      if (x) x.read = true;
                    })
                  }
                >
                  <span className="hm-msg-dot" aria-hidden="true" />
                  <span className="grow">
                    <span className="hm-msg-from">{m.from}</span>
                    <span className="hm-msg-subj ellipsis">{m.subject}</span>
                    <span className="hm-msg-body ellipsis">{previewText(m.body)}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>

      {recent.length === 0 ? (
        <SeasonOutlook league={league} />
      ) : (
        <div className="md-grid2">
          <Section title="Team leaders">
            <div className="card hm-strip">
              {leaders.every((l) => !l.best) ? (
                <div className="small dim">No games played yet.</div>
              ) : (
                <div className="statline">
                  {leaders.map(({ k, best }) => (
                    <Link key={k} to={best ? `/player/${best.pid}` : '/roster'}>
                      <div className="k">{k}</div>
                      <div className="v">{best ? f1(best.v) : '—'}</div>
                      <div className="s">{best?.name ?? ''}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Section>
          <Section
            title="Recent games"
            right={
              <Link className="card-link" to={`/team/${league.userTid}?tab=schedule`}>
                Schedule <ChevronRight size={14} />
              </Link>
            }
          >
            <div className="card flush list">
              {recent.map((g) => {
                const home = g.home.tid === league.userTid;
                const us = home ? g.home : g.away;
                const them = home ? g.away : g.home;
                const won = us.pts > them.pts;
                return (
                  <Link key={g.gid} to={`/game/${g.gid}`} className="hm-game">
                    <span className={`hm-wl ${won ? 'w' : 'l'}`}>{won ? 'W' : 'L'}</span>
                    <span className="small dim hm-ha">{home ? 'vs' : '@'}</span>
                    <TeamLogo tid={them.tid} size={22} decorative />
                    <span className="grow ellipsis">{league.teams[them.tid].name}</span>
                    <span className="num bold">
                      {us.pts}-{them.pts}
                    </span>
                    <ChevronRight size={16} className="dim" />
                  </Link>
                );
              })}
            </div>
          </Section>
        </div>
      )}

      <Section
        title="Top of the roster"
        right={
          <Link className="card-link" to="/roster">
            Roster <ChevronRight size={14} />
          </Link>
        }
      >
        <div className="hscroll">
          {[...roster]
            .sort((a, b) => b.ovr - a.ovr)
            .slice(0, 8)
            .map((p) => (
              <Link key={p.pid} to={`/player/${p.pid}`} className="hm-tile">
                <div className="row between">
                  <Avatar p={p} />
                  <Ovr v={p.ovr} size="sm" />
                </div>
                <span className="hm-tile-name ellipsis">{nameOf(p.pid)}</span>
                <span className="tiny dim ellipsis">
                  {p.pos} · {p.archetype}
                </span>
              </Link>
            ))}
        </div>
      </Section>
    </main>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="hm-fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** What wants the coach's attention: trade offers waiting, the assistant's issues and tips, and the owner's goals. */
function NeedsYou({ league, offers, alerts }: { league: League; offers: number; alerts: ReturnType<typeof teamAlerts> }) {
  const owner = useOwnerLine(league);
  if (!offers && !alerts.length && !owner) return null;
  return (
    <Section title="Needs you">
      <div className="card flush list">
        {offers > 0 && (
          <NeedRow
            to="/trade?tab=offers"
            icon={<Handshake size={18} />}
            tone="brand"
            title={`${offers} trade offer${offers > 1 ? 's' : ''} waiting`}
            sub="Other teams want to deal"
          />
        )}
        {alerts.slice(0, 4).map((a) => (
          <NeedRow
            key={a.id}
            to={a.link ?? '/'}
            icon={a.tone === 'bad' ? <AlertTriangle size={18} /> : <Lightbulb size={18} />}
            tone={a.tone === 'bad' ? 'bad' : a.tone === 'alert' ? 'warn' : 'info'}
            title={a.title}
            sub={a.body}
          />
        ))}
        {owner && <NeedRow to="/owner" icon={<Target size={18} />} tone="dim" title={owner.title} sub={owner.sub} />}
      </div>
    </Section>
  );
}

function NeedRow({ to, icon, tone, title, sub }: { to: string; icon: ReactNode; tone: 'brand' | 'bad' | 'warn' | 'info' | 'dim'; title: string; sub: string }) {
  return (
    <Link to={to} className="hm-need">
      <span className={`hm-need-ic ${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span className="grow">
        <span className="hm-need-t">{title}</span>
        <span className="hm-need-s clamp2">{sub}</span>
      </span>
      <ChevronRight size={16} className="dim" />
    </Link>
  );
}

/**
 * The owner's goals at a glance, linking to the Owner tab: how many are on track and the one most
 * behind (after the playoffs, how many were met and the season's grade; before opening night, when
 * he sets them).
 */
function useOwnerLine(league: League): { title: string; sub: string } | null {
  const og = currentGoals(league);
  // the wins projected as the odds line projects them (the forecast is shared, worked out once)
  const progress = useLeagueMemo(() => (og ? ownerProgress(league, og, leagueForecast(league)) : []), [league, og]);
  if (league.fired) return null;
  const review = og && league.ownerReviews?.find((r) => r.season === og.season && r.tid === og.tid && r.goals.length);
  const signedPts = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;
  if (review)
    return {
      title: `Owner's review: ${review.goals.filter((g) => goalMet(g, g.result)).length} of ${review.goals.length} goals met`,
      sub: `Season grade ${signedPts(review.grade)} · overall ${signedPts(review.total)}`,
    };
  if (og && progress.length) {
    const worst = progress.find((p) => p.status === 'missed') ?? progress.find((p) => p.status === 'behind') ?? progress[0];
    return { title: `Owner's goals: ${progress.filter((p) => ON_TRACK.has(p.status)).length} of ${progress.length} on track`, sub: `${worst.goal.title}: ${worst.text}` };
  }
  if (league.phase === 'preseason') return { title: "Owner's goals: set on opening night", sub: 'See what he expects from this roster' };
  return null;
}

/** Before the first game: where the roster stacks up, by the same talent measure as Power rankings. */
function SeasonOutlook({ league }: { league: League }) {
  const team = league.teams[league.userTid];
  // every team's top eight: one pass over the players per league change, not per render
  const { leagueRank, confRank } = useLeagueMemo(() => {
    const ovrs: Record<number, number[]> = {};
    for (const p of Object.values(league.players)) if (p.tid >= 0) (ovrs[p.tid] ??= []).push(p.ovr);
    const talent = (tid: number) => {
      const top8 = (ovrs[tid] ?? []).sort((a, b) => b - a).slice(0, 8);
      return top8.reduce((a, x) => a + x, 0) / Math.max(1, top8.length);
    };
    const ranked = league.teams.map((t) => ({ tid: t.tid, conf: t.conf, v: talent(t.tid) })).sort((a, b) => b.v - a.v);
    return {
      leagueRank: ranked.findIndex((x) => x.tid === team.tid) + 1,
      confRank: ranked.filter((x) => x.conf === team.conf).findIndex((x) => x.tid === team.tid) + 1,
    };
  }, [league, team.tid, team.conf]);
  const roster = useLeagueMemo(() => teamPlayers(league, team.tid), [league, team.tid]);
  // counted as the Roster screen counts them: two-way deals apart from the 15 standard spots
  const twoWays = roster.filter((p) => p.contract.twoWay).length;
  const avgAge = roster.reduce((a, p) => a + age(league, p), 0) / Math.max(1, roster.length);
  const pay = payroll(league, team.tid);
  const cap = CAP_FOR(league);
  const outlook =
    confRank <= 4
      ? 'Contender: the talent to host a playoff series.'
      : confRank <= 6
        ? 'A playoff team on paper, with little margin.'
        : confRank <= 10
          ? 'Play-in range: coaching and health decide it.'
          : 'Long shot: development and the draft matter most.';
  return (
    <Section
      title="Season outlook"
      right={
        <Link className="card-link" to="/league?tab=standings&view=power" aria-label="Power rankings">
          Power <ChevronRight size={14} />
        </Link>
      }
    >
      <div className="card hm-strip">
        <Statline
          items={[
            { k: 'Talent', v: `#${leagueRank}`, s: `${ordinal(confRank)} in ${team.conf === 'E' ? 'East' : 'West'}` },
            {
              k: 'Payroll',
              v: fmtM(pay),
              s: pay > cap.luxuryTax ? 'Taxpayer' : pay > cap.salaryCap ? 'Over the cap' : 'Under the cap',
              color: pay > cap.luxuryTax ? 'var(--bad)' : undefined,
            },
            { k: 'Avg age', v: avgAge.toFixed(1), s: `${roster.length - twoWays} players${twoWays ? ` + ${twoWays} 2-way` : ''}` },
          ]}
        />
        <div className="small dim2 hm-outlook">{outlook}</div>
      </div>
    </Section>
  );
}

function Onboarding() {
  const steps = [
    { to: '/tactics', title: 'Pick a game plan', body: 'A playbook and a defense that fit your roster.' },
    { to: '/rotation', title: 'Set the rotation', body: 'Depth chart and minutes, with the stint plan.' },
    { to: '/lab', title: 'Test it in the Lab', body: 'Sim games against anyone before you commit.' },
    { title: 'Coach games live', body: 'Timeouts, subs and coverages, then "Why" after.' },
  ];
  return (
    <section className="card accent hm-onb" aria-label="Welcome, coach">
      <div className="row between">
        <h2>Welcome, coach</h2>
        <button className="btn xs ghost" onClick={() => useStore.getState().mutate((l) => void (l.settings.onboarded = true))}>
          Got it
        </button>
      </div>
      <ol className="hm-steps">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className="hm-step-n">{i + 1}</span>
              <span className="grow">
                <span className="hm-step-t">{s.title}</span>
                <span className="hm-step-b">{s.body}</span>
              </span>
              {s.to && <ChevronRight size={16} className="dim" />}
            </>
          );
          // games are coached from here (the Continue bar on game day): no link to the page you're on
          return <li key={s.title}>{s.to ? <Link to={s.to}>{body}</Link> : <div>{body}</div>}</li>;
        })}
      </ol>
    </section>
  );
}
