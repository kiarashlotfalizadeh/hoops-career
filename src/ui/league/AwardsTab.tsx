import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Award, Crown, Medal, Shield, Sparkles, Star, TrendingUp, Trophy, Users } from 'lucide-react';
import type { League, Player, SeasonAwards } from '../../core/types';
import { curTeamSeason, playerName } from '../../core/league/helpers';
import { awardRaces, type Cand as AwardCand } from '../../core/league/awards';
import { seasonLabel } from '../../core/constants';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Help, Section, Segmented } from '../components/ui';
import { f1, playerSeason } from '../stats';
import { AllStarSaturday } from './AllStarSaturday';
import { seasonTeam, shortName, statTid, teamAbbrev, teamPath, useQueryParam } from './shared';

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
  // the season's awards, its All-NBA (and Defense, Rookie) teams once named, its All-Star weekend once picked
  const views: { id: AwardsView; label: string }[] = [
    { id: 'awards', label: 'Awards' },
    ...(decided && aw ? [{ id: 'teams' as const, label: 'All-NBA' }] : []),
    ...(aw && (aw.allStars.E.length > 0 || aw.saturday) ? [{ id: 'allstar' as const, label: 'All-Star' }] : []),
  ];
  const [raw, setView] = useQueryParam<AwardsView>('av', 'awards', ['awards', 'teams', 'allstar']);
  const view = views.some((v) => v.id === raw) ? raw : 'awards';

  return (
    <>
      <div className="lg-sub">
        <select className="lg-select" value={season} onChange={(e) => setSeasonStr(e.target.value)} aria-label="Season">
          {seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
            </option>
          ))}
        </select>
        <span className="lg-bar-l">{status}</span>
      </div>
      {views.length > 1 && <Segmented label="Awards view" value={view} onChange={setView} options={views} />}

      {view === 'awards' && (
        <>
          {aw && (aw.champion !== undefined || aw.cupWinner !== undefined) && <Champions league={league} aw={aw} />}
          {!decided && isCurrent && <AwardRace league={league} />}
          {!decided && !isCurrent && <div className="card empty">No awards recorded for {seasonLabel(season)}.</div>}
          {decided && aw && <MajorAwards league={league} aw={aw} />}
          {(decided || (isCurrent && started)) && (
            <div className="lg-note">
              Figures per game{decided && aw?.finalsMvp !== undefined ? '; the Finals MVP’s in the playoffs' : ''}
              {decided && aw?.allStarGame?.mvp ? '; the All-Star MVP’s in the game' : ''}.
            </div>
          )}
        </>
      )}
      {view === 'teams' && aw && (
        <>
          <Teams league={league} aw={aw} />
          <div className="lg-note">Figures per game.</div>
        </>
      )}
      {view === 'allstar' && aw && (
        <>
          {aw.allStars.E.length > 0 && (
            <>
              <AllStars league={league} aw={aw} />
              <div className="lg-note">Figures per game this season.</div>
            </>
          )}
          {aw.saturday && <AllStarSaturday league={league} aw={aw} />}
        </>
      )}
    </>
  );
}

type AwardsView = 'awards' | 'teams' | 'allstar';

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
            <span className="ic">
              <Trophy size={18} />
            </span>
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
            <span className="ic">
              <Trophy size={18} />
            </span>
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

function AwardRow({ icon, children, to }: { icon: ReactNode; children: ReactNode; to?: string }) {
  const inner = (
    <>
      <span className="ic">{icon}</span>
      {children}
    </>
  );
  return to ? (
    <Link to={to} className="lg-award">
      {inner}
    </Link>
  ) : (
    <div className="lg-award">{inner}</div>
  );
}

function PlayerAward({
  league,
  pid,
  season,
  icon,
  label,
  kind = 'off',
  playoffs = false,
  line,
}: {
  league: League;
  pid?: number;
  season: number;
  icon: ReactNode;
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
    <AwardRow icon={icon} to={`/player/${p.pid}`}>
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
        <PlayerAward league={league} pid={aw.mvp} season={s} icon={<Crown size={18} />} label="Most Valuable Player" />
        <PlayerAward league={league} pid={aw.finalsMvp} season={s} icon={<Trophy size={18} />} label="Finals MVP" playoffs />
        <PlayerAward league={league} pid={aw.dpoy} season={s} icon={<Shield size={18} />} label="Defensive Player of the Year" kind="def" />
        <PlayerAward league={league} pid={aw.roy} season={s} icon={<Sparkles size={18} />} label="Rookie of the Year" />
        <PlayerAward league={league} pid={aw.smoy} season={s} icon={<Users size={18} />} label="Sixth Man of the Year" />
        <PlayerAward league={league} pid={aw.mip} season={s} icon={<TrendingUp size={18} />} label="Most Improved Player" />
        {coyTeam && (
          <AwardRow icon={<Award size={18} />} to={teamPath(coyTeam.tid)}>
            <TeamLogo tid={coyTeam.tid} size={40} decorative />
            <span className="lg-award-t">
              <span className="lg-award-lb">Coach of the Year</span>
              <span className="nm ellipsis">{aw.coyCoach ?? (coyTeam.tid === league.userTid ? league.coachName : coyTeam.coach.name)}</span>
              <span className="sub ellipsis">
                {coyTeam.region} {coyTeam.name}
                {coyTs ? ` · ${coyTs.won}-${coyTs.lost}` : ''}
              </span>
            </span>
            <span />
          </AwardRow>
        )}
        <PlayerAward
          league={league}
          pid={aw.allStarMvp}
          season={s}
          icon={<Star size={18} />}
          label="All-Star Game MVP"
          // his night, not his season: the game's figures and its final
          line={
            aw.allStarGame?.mvp
              ? `${aw.allStarGame.east > aw.allStarGame.west ? 'East' : 'West'} won ${Math.max(aw.allStarGame.east, aw.allStarGame.west)}-${Math.min(aw.allStarGame.east, aw.allStarGame.west)} · ${aw.allStarGame.mvp.pts} PTS · ${aw.allStarGame.mvp.reb} REB`
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
      {/* (a long name wraps rather than lose its end and the position) */}
      <span>
        <span className="bold">{shortName(p)}</span> <span className="tiny dim">{p.pos}</span>
        {mvp && <span className="tag lg-gold lg-mvp">MVP</span>}
      </span>
      <span className="tiny dim num">{line}</span>
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
    <Section
      title={
        <h3>
          <Medal size={13} aria-hidden="true" /> All-Stars
        </h3>
      }
    >
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
  return (
    <div className="md-grid2">
      <RaceCard
        league={league}
        title="MVP ladder"
        icon={<Crown size={13} />}
        list={race.mvp}
        right={
          <Help title="Award races">
            <p className="lg-p">
              The ladders update daily and use the same formulas as the voters: production, availability and team success, with the same eligibility rules. Winners are announced at
              the end of the regular season.
            </p>
          </Help>
        }
      />
      <RaceCard league={league} title="Defensive Player of the Year" icon={<Shield size={13} />} list={race.dpoy} kind="def" />
      <RaceCard league={league} title="Rookie of the Year" icon={<Sparkles size={13} />} list={race.roy} />
      <RaceCard league={league} title="Sixth Man of the Year" icon={<Users size={13} />} list={race.smoy} />
    </div>
  );
}

function RaceCard({
  league,
  title,
  icon,
  list,
  kind = 'off',
  right,
}: {
  league: League;
  title: string;
  icon: ReactNode;
  list: { c: Cand; score: number }[];
  kind?: 'off' | 'def';
  right?: ReactNode;
}) {
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
      title={
        <h3>
          {icon} {title}
        </h3>
      }
      // the scale is named once, on the first ladder, with its Help
      right={right ? <span className="lg-race-key">Score, #1 = 100{right}</span> : undefined}
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
                  {/* (wraps: on a narrow phone the last number was cut off) */}
                  <span className="sub">
                    {teamAbbrev(league, c.tid)}
                    {ts ? `\u00a0${ts.won}-${ts.lost}` : ''} · {statLine(c.p, league.season, kind)}
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
