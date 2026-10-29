import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player, SeasonAwards } from '../../core/types';
import { curTeamSeason, fmtDate, playerName } from '../../core/league/helpers';
import { awardRaces, type Cand as AwardCand } from '../../core/league/awards';
import { seasonLabel } from '../../core/constants';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Help, Section } from '../components/ui';
import { ViewChips } from './Views';
import { f1, playerSeason } from '../stats';
import { AllStarSaturday } from './AllStarSaturday';
import { seasonHonors } from '../../core/league/media';
import { keepFigures } from '../../core/format';
import { HonorsList } from './news/Honors';
import { Poster, PosterSlab, seasonTeam, shortName, statTid, teamAbbrev, teamPath, useQueryParam } from './shared';

/** A ladder's one figure or two: points, or steals and blocks. */
function raceLine(p: Player, season: number, kind: 'off' | 'def') {
  const pg = playerSeason(p, season, false);
  if (!pg) return '';
  return kind === 'def' ? `${f1(pg.stl)}\u00a0STL · ${f1(pg.blk)}\u00a0BLK` : `${f1(pg.pts)}\u00a0PTS`;
}

function statLine(p: Player, season: number, kind: 'off' | 'def' = 'off', playoffs = false) {
  const pg = playerSeason(p, season, playoffs);
  if (!pg) return '';
  // per game (the tab's foot says so), each figure kept with its stat where a line wraps
  return kind === 'def' ? `${f1(pg.stl)}\u00a0STL · ${f1(pg.blk)}\u00a0BLK · ${f1(pg.reb)}\u00a0REB` : `${f1(pg.pts)}\u00a0PTS · ${f1(pg.reb)}\u00a0REB · ${f1(pg.ast)}\u00a0AST`;
}

export function AwardsTab({ league }: { league: League }) {
  const seasons = useLeagueMemo(() => [...new Set([league.season, ...league.awards.map((a) => a.season)])].sort((a, b) => b - a), [league]);
  // before opening night there is no race yet: open on the last season's winners
  const started = league.games.some((g) => g.season === league.season && g.type === 'regular');
  const last = league.awards.filter((a) => a.season < league.season && a.mvp !== undefined).sort((a, b) => b.season - a.season)[0];
  const fallback = !started && last ? last.season : league.season;
  const [seasonStr, setSeasonStr] = useQueryParam<string>('aseason', String(fallback));
  const season = seasons.includes(Number(seasonStr)) ? Number(seasonStr) : fallback;
  const aw = league.awards.find((a) => a.season === season);
  const decided = aw?.mvp !== undefined;
  const isCurrent = season === league.season;
  let status = '';
  if (decided) status = isCurrent && (league.phase === 'playin' || league.phase === 'playoffs') ? 'Finals MVP to come' : 'Final';
  else if (isCurrent) status = started ? 'Award races so far' : 'Season not started';
  // the season's weekly and monthly honors (this season's and last, as the press keeps them)
  const honors = useLeagueMemo(() => seasonHonors(league, season), [league, season]);
  // the season's awards, its All-NBA (and Defense, Rookie) teams once named, its All-Star weekend once picked
  const views: { id: AwardsView; label: string }[] = [
    { id: 'awards', label: 'Awards' },
    ...(honors.length ? [{ id: 'honors' as const, label: 'Honors' }] : []),
    ...(decided && aw ? [{ id: 'teams' as const, label: 'All-NBA' }] : []),
    ...(aw && (aw.allStars.E.length > 0 || aw.saturday) ? [{ id: 'allstar' as const, label: 'All-Star' }] : []),
  ];
  const [raw, setView] = useQueryParam<AwardsView>('av', 'awards', ['awards', 'honors', 'teams', 'allstar']);
  const view = views.some((v) => v.id === raw) ? raw : 'awards';
  const seasonSel = (
    <select className="lg-select" value={season} onChange={(e) => setSeasonStr(e.target.value)} aria-label="Season">
      {seasons.map((s) => (
        <option key={s} value={s}>
          {seasonLabel(s)}
        </option>
      ))}
    </select>
  );

  return (
    <>
      {/* the views, and the season they read on their right */}
      <div className="lg-awards-top">
        {views.length > 1 ? <ViewChips label="Awards view" value={view} onChange={setView} options={views} right={seasonSel} /> : <div className="lg-views">{seasonSel}</div>}
      </div>

      {view === 'awards' && (
        <>
          {decided && aw?.mvp !== undefined && league.players[aw.mvp] && (
            <MvpSlab league={league} p={league.players[aw.mvp]} season={season} over={`Most Valuable Player · ${seasonLabel(season)}`} />
          )}
          {/* (mid-season the race is the story: a Cup won so far has its own tab until the season's awards are in) */}
          {decided && aw && (aw.champion !== undefined || aw.cupWinner !== undefined) && <Champions league={league} aw={aw} />}
          {!decided && isCurrent && <AwardRace league={league} />}
          {!decided && !isCurrent && <div className="card empty">No awards recorded for {seasonLabel(season)}.</div>}
          {decided && aw && <MajorAwards league={league} aw={aw} />}
          {(decided || (isCurrent && started)) && (
            // (the All-Star MVP's row reads as his night: "East won 150-141 · 31 PTS")
            <div className="lg-note">
              {status ? `${status} · per game` : 'Per game'}
              {decided && aw?.finalsMvp !== undefined ? ' · Finals MVP in the playoffs' : ''}
            </div>
          )}
        </>
      )}
      {/* (each line says "a game" itself) */}
      {view === 'honors' && <HonorsList league={league} honors={honors} />}
      {view === 'teams' && aw && (
        <>
          <Teams league={league} aw={aw} />
          <div className="lg-note">Per game</div>
        </>
      )}
      {view === 'allstar' && aw && (
        <>
          {aw.allStarGame && (
            <Poster
              over={`All-Star Game · ${seasonLabel(aw.season)}`}
              head={`The ${aw.allStarGame.east > aw.allStarGame.west ? 'East' : 'West'} win the All-Star Game`}
              dek={aw.allStarMvp !== undefined && league.players[aw.allStarMvp] ? `MVP ${playerName(league.players[aw.allStarMvp])}` : undefined}
              fig={{ v: `${Math.max(aw.allStarGame.east, aw.allStarGame.west)}-${Math.min(aw.allStarGame.east, aw.allStarGame.west)}`, k: 'final' }}
            />
          )}
          {aw.allStars.E.length > 0 && (
            <>
              <AllStars league={league} aw={aw} />
              <div className="lg-note">Per game this season</div>
            </>
          )}
          {aw.saturday && <AllStarSaturday league={league} aw={aw} />}
        </>
      )}
    </>
  );
}

type AwardsView = 'awards' | 'honors' | 'teams' | 'allstar';

// ---------------------------------------------------------------- winners

/** The season's two titles: the champions and the NBA Cup's winners, with whom they beat and the Cup's MVP. */
function Champions({ league, aw }: { league: League; aw: SeasonAwards }) {
  const final = league.cup?.season === aw.season ? league.cup.bracket.find((t) => t.round === 'final') : undefined;
  const score = final?.highPts !== undefined && final.lowPts !== undefined ? ` ${Math.max(final.highPts, final.lowPts)}-${Math.min(final.highPts, final.lowPts)}` : '';
  const mvp = aw.cupMvp !== undefined ? league.players[aw.cupMvp] : undefined;
  return (
    <Section title="Titles">
      <div className="card flush list">
        {aw.champion !== undefined && (
          <Link to={teamPath(aw.champion)} className="lg-award">
            <TeamLogo tid={aw.champion} size={40} decorative />
            <span className="lg-award-t">
              <span className="lg-award-lb">Champions</span>
              <span className="nm ellipsis">
                {league.teams[aw.champion].region} {league.teams[aw.champion].name}
              </span>
              {aw.runnerUp !== undefined && (
                <span className="sub ellipsis">
                  def. {league.teams[aw.runnerUp].region} {league.teams[aw.runnerUp].name}
                </span>
              )}
            </span>
            <span />
          </Link>
        )}
        {aw.cupWinner !== undefined && (
          <div className="lg-award">
            <TeamLogo tid={aw.cupWinner} size={40} decorative />
            <span className="lg-award-t">
              <span className="lg-award-lb">NBA Cup</span>
              <Link to={teamPath(aw.cupWinner)} className="nm ellipsis">
                {league.teams[aw.cupWinner].region} {league.teams[aw.cupWinner].name}
              </Link>
              <span className="sub">
                {aw.cupRunnerUp !== undefined && (
                  <>
                    def. {league.teams[aw.cupRunnerUp].name}
                    {score}
                  </>
                )}
                {mvp && (
                  <>
                    {aw.cupRunnerUp !== undefined ? ' · ' : ''}
                    <span className="nowrap">
                      MVP{' '}
                      <Link to={`/player/${mvp.pid}`} className="lg-name-link">
                        {playerName(mvp)}
                      </Link>
                    </span>
                  </>
                )}
              </span>
            </span>
            <span />
          </div>
        )}
      </div>
    </Section>
  );
}

function AwardRow({ children, to }: { children: ReactNode; to?: string }) {
  return to ? (
    <Link to={to} className="lg-award">
      {children}
    </Link>
  ) : (
    <div className="lg-award">{children}</div>
  );
}

function PlayerAward({
  league,
  pid,
  season,
  label,
  kind = 'off',
  playoffs = false,
  line,
}: {
  league: League;
  pid?: number;
  season: number;
  label: string;
  kind?: 'off' | 'def';
  playoffs?: boolean;
  /** The figures to show in place of his season's per-game line (one game's). */
  line?: string;
}) {
  const p = pid !== undefined ? league.players[pid] : undefined;
  if (!p) return null;
  const tid = seasonTeam(league, p, season);
  return (
    <AwardRow to={`/player/${p.pid}`}>
      <Avatar p={{ ...p, tid: tid ?? -1 }} />
      <span className="lg-award-t">
        <span className="lg-award-lb">{label}</span>
        <span className="nm ellipsis">
          {p.firstName} {p.lastName}
        </span>
        <span className="sub ellipsis">
          {tid !== null ? `${teamAbbrev(league, tid)} · ` : ''}
          {line ?? statLine(p, season, kind, playoffs)}
        </span>
      </span>
      <span />
    </AwardRow>
  );
}

function MajorAwards({ league, aw }: { league: League; aw: SeasonAwards }) {
  const s = aw.season;
  const coyTeam = aw.coy !== undefined ? league.teams[aw.coy] : undefined;
  const coyTs = coyTeam?.seasons.find((x) => x.season === s);
  return (
    <Section title="Season awards">
      <div className="card flush list">
        {/* (the MVP is the tab's poster, over this list) */}
        <PlayerAward league={league} pid={aw.finalsMvp} season={s} label="Finals MVP" playoffs />
        <PlayerAward league={league} pid={aw.dpoy} season={s} label="Defensive Player of the Year" kind="def" />
        <PlayerAward league={league} pid={aw.roy} season={s} label="Rookie of the Year" />
        <PlayerAward league={league} pid={aw.smoy} season={s} label="Sixth Man of the Year" />
        <PlayerAward league={league} pid={aw.mip} season={s} label="Most Improved Player" />
        {coyTeam && (
          <AwardRow to={teamPath(coyTeam.tid)}>
            <TeamLogo tid={coyTeam.tid} size={40} decorative />
            <span className="lg-award-t">
              <span className="lg-award-lb">Coach of the Year</span>
              <span className="nm ellipsis">{aw.coyCoach ?? (coyTeam.tid === league.userTid ? league.coachName : coyTeam.coach.name)}</span>
              <span className="sub ellipsis">
                {coyTeam.region} {coyTeam.name}
                {coyTs ? keepFigures(` · ${coyTs.won}-${coyTs.lost}`) : ''}
              </span>
            </span>
            <span />
          </AwardRow>
        )}
        <PlayerAward
          league={league}
          pid={aw.allStarMvp}
          season={s}

          label="All-Star Game MVP"
          // his night, not his season: the game's figures and its final
          line={
            aw.allStarGame?.mvp
              ? keepFigures(
                  `${aw.allStarGame.east > aw.allStarGame.west ? 'East' : 'West'} won ${Math.max(aw.allStarGame.east, aw.allStarGame.west)}-${Math.min(aw.allStarGame.east, aw.allStarGame.west)} · ${aw.allStarGame.mvp.pts} PTS · ${aw.allStarGame.mvp.reb} REB`,
                )
              : undefined
          }
        />
      </div>
    </Section>
  );
}

/** One or more fives in a panel, each under its name: the All-NBA teams, the All-Defensive teams, the All-Rookie teams. */
function Fives({ league, title, teams, season, kind = 'off' }: { league: League; title: string; teams: { name: string; pids: number[] }[]; season: number; kind?: 'off' | 'def' }) {
  const shown = teams.filter((t) => t.pids.length);
  if (!shown.length) return null;
  return (
    <Section title={title}>
      <div className="card flush">
        {shown.map((t) => (
          <Fragment key={t.name}>
            {shown.length > 1 && <div className="list-divider">{t.name}</div>}
            <div className="lg-five">
              {t.pids.map((pid) => {
                const p = league.players[pid];
                if (!p) return null;
                const tid = seasonTeam(league, p, season);
                return <FiveRow key={pid} league={league} p={p} tid={tid} line={statLine(p, season, kind)} />;
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </Section>
  );
}

function FiveRow({ league, p, tid, line, mvp }: { league: League; p: Player; tid: number | null; line: string; mvp?: boolean }) {
  return (
    <Link to={`/player/${p.pid}`} className={`lg-five-row ${tid === league.userTid ? 'me' : ''}`}>
      {tid !== null ? <TeamLogo tid={tid} size={22} /> : <span />}
      {/* his name and position, his line under them (a long name wraps rather than lose its end) */}
      <span className="lg-five-t">
        <span>
          <span className="bold">{shortName(p)}</span> <span className="tiny dim">{p.pos}</span>
          {mvp && <span className="tag lg-gold lg-mvp">MVP</span>}
        </span>
        <span className="lg-five-line">{line}</span>
      </span>
    </Link>
  );
}

function Teams({ league, aw }: { league: League; aw: SeasonAwards }) {
  const nth = ['1st', '2nd', '3rd'];
  const rookies =
    aw.allRookie.length > 5
      ? [
          { name: 'All-Rookie 1st Team', pids: aw.allRookie.slice(0, 5) },
          { name: 'All-Rookie 2nd Team', pids: aw.allRookie.slice(5) },
        ]
      : [{ name: 'All-Rookie Team', pids: aw.allRookie }];
  return (
    <div className="md-grid2">
      <Fives league={league} title="All-NBA" teams={aw.allNba.map((pids, i) => ({ name: `All-NBA ${nth[i]} Team`, pids }))} season={aw.season} />
      <div className="col lg-stack">
        <Fives league={league} title="All-Defensive" teams={aw.allDefense.map((pids, i) => ({ name: `All-Defensive ${nth[i]} Team`, pids }))} season={aw.season} kind="def" />
        <Fives league={league} title={rookies.length > 1 ? 'All-Rookie' : 'All-Rookie Team'} teams={rookies} season={aw.season} />
      </div>
    </div>
  );
}

function AllStars({ league, aw }: { league: League; aw: SeasonAwards }) {
  return (
    <Section title="All-Stars">
      <div className="card flush lg-allstars">
        {(['E', 'W'] as const).map((c) => (
          <div key={c}>
            <div className="list-divider">{c === 'E' ? 'East' : 'West'}</div>
            <div className="lg-five">
              {aw.allStars[c].map((pid) => {
                const p = league.players[pid];
                if (!p) return null;
                return <FiveRow key={pid} league={league} p={p} tid={seasonTeam(league, p, aw.season)} line={statLine(p, aw.season)} mvp={pid === aw.allStarMvp} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- race

type Cand = AwardCand & { tid: number | null };

function AwardRace({ league }: { league: League }) {
  const race = useLeagueMemo(() => {
    const played = Math.max(0, ...league.teams.map((t) => curTeamSeason(league, t.tid).won + curTeamSeason(league, t.tid).lost));
    // the voters' own eligibility and formulas, with the team each player last played for
    const withTeam = (list: { c: AwardCand; score: number }[]) => list.map(({ c, score }) => ({ c: { ...c, tid: statTid(league, c.s) }, score }));
    const r = awardRaces(league, 5);
    return { played, mvp: withTeam(r.mvp), dpoy: withTeam(r.dpoy), roy: withTeam(r.roy), smoy: withTeam(r.smoy) };
  }, [league]);

  if (race.played === 0) return <div className="card empty">The award races start once games are played.</div>;
  const lead = race.mvp[0]?.c;
  return (
    <>
      {lead && <MvpSlab league={league} p={lead.p} season={league.season} tid={lead.tid} over={`MVP race · leader on ${fmtDate(league.season, league.day)}`} />}
      <div className="md-grid2">
        <RaceCard
          league={league}
          title="MVP ladder"
          list={race.mvp}
          right={
            <Help title="Award races">
              <p className="lg-p">The ladders update daily with the voters&apos; own formulas and eligibility rules.</p>
              <p className="lg-p">They weigh production, games played and team success. Winners are named when the regular season ends.</p>
              <p className="lg-p">The score puts the leader at 100.</p>
            </Help>
          }
        />
        <RaceCard league={league} title="Defensive Player of the Year" list={race.dpoy} kind="def" />
        <RaceCard league={league} title="Rookie of the Year" list={race.roy} />
        <RaceCard league={league} title="Sixth Man of the Year" list={race.smoy} />
      </div>
    </>
  );
}

/** The MVP (or the race's leader) as the tab's poster: in his team's colours, his scoring the giant figure. */
function MvpSlab({ league, p, season, over, tid: given }: { league: League; p: Player; season: number; over: string; tid?: number | null }) {
  const tid = given ?? seasonTeam(league, p, season);
  const pg = playerSeason(p, season, false);
  const t = tid !== null && tid !== undefined ? league.teams[tid] : undefined;
  return (
    <PosterSlab
      colors={(t ?? league.teams[league.userTid]).colors}
      over={over}
      mark={t ? <TeamLogo tid={t.tid} size={44} decorative /> : undefined}
      region={`${t ? `${t.region} ${t.name}` : 'Free agent'} · ${p.pos}`}
      name={
        <Link to={`/player/${p.pid}`} className="lg-title-link">
          {p.firstName} {p.lastName}
        </Link>
      }
      fig={pg ? f1(pg.pts) : undefined}
      // (each figure kept with its stat where the line wraps)
      figLabel={pg ? `PTS a game · ${f1(pg.reb)}\u00a0REB · ${f1(pg.ast)}\u00a0AST` : undefined}
    />
  );
}

function RaceCard({ league, title, list, kind = 'off', right }: { league: League; title: string; list: { c: Cand; score: number }[]; kind?: 'off' | 'def'; right?: ReactNode }) {
  const top = list[0]?.score ?? 1;
  const low = Math.min(0, ...list.map((x) => x.score));
  // the voters' score on a scale where the leader is 100: how close the race is, in one figure
  // (only the leader shows 100: a close second rounds down to 99, not up to a tie that isn't one)
  const rel = (score: number, i: number) => {
    const v = Math.round(((score - low) / Math.max(0.01, top - low)) * 100);
    return i > 0 && score < top ? Math.min(99, v) : v;
  };
  return (
    <Section
      title={title}
      // the scale is named once, on the first ladder, with its Help
      right={right ? <span className="lg-race-key">Leader = 100{right}</span> : undefined}
    >
      <div className="card flush list">
        {list.length === 0 ? (
          <div className="lg-lead-none">Nobody qualifies yet.</div>
        ) : (
          list.map(({ c, score }, i) => {
            const ts = c.tid !== null ? curTeamSeason(league, c.tid) : undefined;
            return (
              <Link key={c.p.pid} to={`/player/${c.p.pid}`} className={`lg-race-row ${i === 0 ? 'first' : ''} ${c.tid === league.userTid ? 'me' : ''}`}>
                <span className="rank">{i + 1}</span>
                <Avatar p={{ ...c.p, tid: c.tid ?? -1 }} />
                <span className="lg-race-t">
                  <span className="nm ellipsis">
                    {c.p.firstName} {c.p.lastName}
                  </span>
                  {/* one line: the team, its record (for the MVP's team success) or his defence, and his scoring; the rest on his page */}
                  <span className="sub ellipsis">
                    {teamAbbrev(league, c.tid)}
                    {kind === 'off' && ts ? keepFigures(`\u00a0${ts.won}-${ts.lost}`) : ''} · {raceLine(c.p, league.season, kind)}
                  </span>
                </span>
                <span className="lg-race-v num">
                  {rel(score, i)}
                  <span className="sr-only"> of 100</span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </Section>
  );
}
