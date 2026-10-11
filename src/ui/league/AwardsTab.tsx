import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Award, Crown, Medal, Shield, Sparkles, Star, TrendingUp, Trophy, Users } from 'lucide-react';
import type { League, Player, SeasonAwards } from '../../core/types';
import { curTeamSeason, seasonTotals, winPct } from '../../core/league/helpers';
import { defContext, dpoyScore, gameScore, mvpScore } from '../../core/league/awards';
import { seasonLabel } from '../../core/constants';
import { useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Bar, Card, Empty } from '../components/ui';
import { f1, playerSeason } from '../stats';
import { CupBanner } from './CupTab';
import { SectionLabel, seasonTeam, shortName, statTid, teamAbbrev, useQueryParam } from './shared';

function statLine(p: Player, season: number, kind: 'off' | 'def' = 'off', playoffs = false) {
  const pg = playerSeason(p, season, playoffs);
  if (!pg) return '';
  return kind === 'def' ? `${f1(pg.stl)} stl · ${f1(pg.blk)} blk · ${f1(pg.reb)} reb` : `${f1(pg.pts)} pts · ${f1(pg.reb)} reb · ${f1(pg.ast)} ast`;
}

export function AwardsTab({ league }: { league: League }) {
  const v = useStore((s) => s.v);
  const seasons = useMemo(
    () => [...new Set([league.season, ...league.awards.map((a) => a.season)])].sort((a, b) => b - a),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, v],
  );
  const [seasonStr, setSeasonStr] = useQueryParam<string>('aseason', String(league.season));
  const season = seasons.includes(Number(seasonStr)) ? Number(seasonStr) : league.season;
  const aw = league.awards.find((a) => a.season === season);
  const decided = aw?.mvp !== undefined;
  const isCurrent = season === league.season;

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
        <span className="small dim">{decided ? 'Final results' : isCurrent ? 'Season in progress' : ''}</span>
      </div>

      {aw?.champion !== undefined && (
        <div className="lg-champ">
          <div className="row" style={{ gap: 14 }}>
            <TeamLogo tid={aw.champion} size={54} />
            <div className="grow">
              <div className="kicker">
                <Trophy size={12} style={{ verticalAlign: -1 }} /> Champions
              </div>
              <div className="display bold" style={{ fontSize: 24, textTransform: 'uppercase', lineHeight: 1.05 }}>
                {league.teams[aw.champion].region} {league.teams[aw.champion].name}
              </div>
              {aw.runnerUp !== undefined && (
                <div className="small dim2">
                  def. {league.teams[aw.runnerUp].region} {league.teams[aw.runnerUp].name}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {aw?.cupWinner !== undefined && (
        <CupBanner
          league={league}
          season={season}
          tid={aw.cupWinner}
          runnerUp={aw.cupRunnerUp}
          mvp={aw.cupMvp}
          final={league.cup?.season === season ? league.cup.bracket.find((t) => t.round === 'final') : undefined}
        />
      )}

      {!decided && isCurrent && <AwardRace league={league} />}
      {!decided && !isCurrent && !aw?.allStars.E.length && (
        <Card>
          <Empty>No awards recorded for {seasonLabel(season)}.</Empty>
        </Card>
      )}

      {decided && aw && <MajorAwards league={league} aw={aw} />}
      {decided && aw && <Teams league={league} aw={aw} />}
      {aw && aw.allStars.E.length > 0 && <AllStars league={league} aw={aw} />}
    </>
  );
}

// ---------------------------------------------------------------- winners

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
}: {
  league: League;
  pid?: number;
  season: number;
  icon: ReactNode;
  label: string;
  kind?: 'off' | 'def';
  playoffs?: boolean;
}) {
  const p = pid !== undefined ? league.players[pid] : undefined;
  if (!p) return null;
  const tid = seasonTeam(league, p, season);
  return (
    <AwardRow icon={icon} to={`/player/${p.pid}`}>
      <Avatar p={{ ...p, tid: tid ?? -1 }} />
      <div style={{ minWidth: 0 }}>
        <div className="lb">{label}</div>
        <div className="bold ellipsis">
          {p.firstName} {p.lastName}
        </div>
        <div className="tiny dim ellipsis">{statLine(p, season, kind, playoffs)}</div>
      </div>
      {tid !== null ? <TeamLogo tid={tid} size={28} /> : <span />}
    </AwardRow>
  );
}

function MajorAwards({ league, aw }: { league: League; aw: SeasonAwards }) {
  const s = aw.season;
  const coyTeam = aw.coy !== undefined ? league.teams[aw.coy] : undefined;
  const coyTs = coyTeam?.seasons.find((x) => x.season === s);
  return (
    <Card className="flush">
      <div style={{ padding: '12px 12px 0' }}>
        <SectionLabel>Season awards</SectionLabel>
      </div>
      <PlayerAward league={league} pid={aw.mvp} season={s} icon={<Crown size={18} />} label="Most Valuable Player" />
      <PlayerAward league={league} pid={aw.finalsMvp} season={s} icon={<Trophy size={18} />} label="Finals MVP · playoff stats" playoffs />
      <PlayerAward league={league} pid={aw.dpoy} season={s} icon={<Shield size={18} />} label="Defensive Player" kind="def" />
      <PlayerAward league={league} pid={aw.roy} season={s} icon={<Sparkles size={18} />} label="Rookie of the Year" />
      <PlayerAward league={league} pid={aw.smoy} season={s} icon={<Users size={18} />} label="Sixth Man" />
      <PlayerAward league={league} pid={aw.mip} season={s} icon={<TrendingUp size={18} />} label="Most Improved" />
      {coyTeam && (
        <AwardRow icon={<Award size={18} />} to={`/team/${coyTeam.tid}`}>
          <TeamLogo tid={coyTeam.tid} size={40} />
          <div style={{ minWidth: 0 }}>
            <div className="lb">Coach of the Year</div>
            <div className="bold ellipsis">{coyTeam.tid === league.userTid ? league.coachName : coyTeam.coach.name}</div>
            <div className="tiny dim ellipsis">
              {coyTeam.region} {coyTeam.name}
              {coyTs ? ` · ${coyTs.won}-${coyTs.lost}` : ''}
            </div>
          </div>
          <span />
        </AwardRow>
      )}
      <PlayerAward league={league} pid={aw.allStarMvp} season={s} icon={<Star size={18} />} label="All-Star Game MVP" />
    </Card>
  );
}

function TeamList({ league, title, pids, season, kind = 'off' }: { league: League; title: string; pids: number[]; season: number; kind?: 'off' | 'def' }) {
  if (!pids.length) return null;
  return (
    <Card title={title}>
      <div className="lg-team5">
        {pids.map((pid) => {
          const p = league.players[pid];
          if (!p) return null;
          const tid = seasonTeam(league, p, season);
          return (
            <Link key={pid} to={`/player/${pid}`} className="row5">
              {tid !== null ? <TeamLogo tid={tid} size={22} /> : <span />}
              <span className="ellipsis">
                <span className="bold">{shortName(p)}</span> <span className="tiny dim">{p.pos}</span>
              </span>
              <span className="tiny dim num">{statLine(p, season, kind)}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function Teams({ league, aw }: { league: League; aw: SeasonAwards }) {
  return (
    <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
      {aw.allNba.map((t, i) => (
        <TeamList key={`n${i}`} league={league} title={`All-NBA ${['1st', '2nd', '3rd'][i]} Team`} pids={t} season={aw.season} />
      ))}
      {aw.allDefense.map((t, i) => (
        <TeamList key={`d${i}`} league={league} title={`All-Defensive ${['1st', '2nd'][i]} Team`} pids={t} season={aw.season} kind="def" />
      ))}
      {aw.allRookie.length > 5 ? (
        <>
          <TeamList league={league} title="All-Rookie 1st Team" pids={aw.allRookie.slice(0, 5)} season={aw.season} />
          <TeamList league={league} title="All-Rookie 2nd Team" pids={aw.allRookie.slice(5)} season={aw.season} />
        </>
      ) : (
        <TeamList league={league} title="All-Rookie Team" pids={aw.allRookie} season={aw.season} />
      )}
    </div>
  );
}

function AllStars({ league, aw }: { league: League; aw: SeasonAwards }) {
  return (
    <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
      {(['E', 'W'] as const).map((c) => (
        <Card key={c} title={`${c === 'E' ? 'East' : 'West'} All-Stars`} right={<Medal size={16} className="dim" />}>
          <div className="lg-team5">
            {aw.allStars[c].map((pid) => {
              const p = league.players[pid];
              if (!p) return null;
              const tid = seasonTeam(league, p, aw.season);
              return (
                <Link key={pid} to={`/player/${pid}`} className="row5">
                  {tid !== null ? <TeamLogo tid={tid} size={22} /> : <span />}
                  <span className="ellipsis">
                    <span className="bold">{shortName(p)}</span> <span className="tiny dim">{p.pos}</span>
                    {pid === aw.allStarMvp && (
                      <span className="tag lg-gold" style={{ marginLeft: 6 }}>
                        MVP
                      </span>
                    )}
                  </span>
                  <span className="tiny dim num">{statLine(p, aw.season)}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- race

interface Cand {
  p: Player;
  s: NonNullable<ReturnType<typeof seasonTotals>>;
  gp: number;
  mpg: number;
  gmsc: number;
  winPct: number;
  pmPerGame: number;
  tid: number | null;
}

function AwardRace({ league }: { league: League }) {
  const v = useStore((s) => s.v);
  const race = useMemo(() => {
    const season = league.season;
    const played = Math.max(0, ...league.teams.map((t) => curTeamSeason(league, t.tid).won + curTeamSeason(league, t.tid).lost));
    const all: Cand[] = [];
    for (const p of Object.values(league.players)) {
      const s = seasonTotals(p, season, false);
      if (!s || s.gp === 0) continue;
      const tid = statTid(league, s);
      const ts = tid !== null ? league.teams[tid].seasons.find((x) => x.season === season) : undefined;
      all.push({ p, s, gp: s.gp, mpg: s.min / s.gp, gmsc: gameScore(s) / s.gp, winPct: ts ? winPct(ts) : 0.5, pmPerGame: s.pm / s.gp, tid });
    }
    const minG = Math.max(1, Math.round(played * 0.6));
    const eligible = all.filter((c) => c.gp >= minG && c.mpg >= 20);
    const rank = (arr: Cand[], f: (c: Cand) => number) =>
      arr
        .map((c) => ({ c, score: f(c) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    const rookies = all.filter((c) => c.p.draft.year === season - 1 && c.gp >= Math.max(1, Math.round(played * 0.5)));
    // same team-defense context the real vote uses
    const dctx = defContext(league, season);
    return {
      played,
      mvp: rank(eligible, mvpScore),
      dpoy: rank(eligible, (c) => dpoyScore(c, dctx)),
      roy: rank(rookies, (c) => c.gmsc * Math.pow(Math.min(1, c.gp / 70), 0.5) + c.mpg * 0.05),
      smoy: rank(
        eligible.filter((c) => c.s.gs <= c.gp / 2),
        (c) => c.gmsc + c.pmPerGame * 0.2,
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, v]);

  if (race.played === 0) {
    return (
      <Card>
        <Empty>The award races start once games are played.</Empty>
      </Card>
    );
  }
  return (
    <>
      <div className="lg-note">
        Ladders update daily and use the same formulas as the voters: production, availability and team success. Winners are announced at the end of the regular season.
      </div>
      <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
        <RaceCard league={league} title="MVP ladder" icon={<Crown size={15} />} list={race.mvp} />
        <RaceCard league={league} title="Defensive Player" icon={<Shield size={15} />} list={race.dpoy} kind="def" />
        <RaceCard league={league} title="Rookie of the Year" icon={<Sparkles size={15} />} list={race.roy} />
        <RaceCard league={league} title="Sixth Man" icon={<Users size={15} />} list={race.smoy} />
      </div>
    </>
  );
}

function RaceCard({ league, title, icon, list, kind = 'off' }: { league: League; title: string; icon: ReactNode; list: { c: Cand; score: number }[]; kind?: 'off' | 'def' }) {
  const top = list[0]?.score ?? 1;
  const low = Math.min(0, ...list.map((x) => x.score));
  return (
    <Card
      title={
        <h3>
          {icon} {title}
        </h3>
      }
    >
      {list.length === 0 ? (
        <div className="small dim">Nobody qualifies yet.</div>
      ) : (
        list.map(({ c, score }, i) => {
          const ts = c.tid !== null ? curTeamSeason(league, c.tid) : undefined;
          return (
            <Link key={c.p.pid} to={`/player/${c.p.pid}`} className={`lg-race-row ${i === 0 ? 'first' : ''}`}>
              <span className="rank">{i + 1}</span>
              <Avatar p={{ ...c.p, tid: c.tid ?? -1 }} />
              <div style={{ minWidth: 0 }}>
                <div className="bold ellipsis" style={{ color: c.tid === league.userTid ? 'var(--accent)' : undefined }}>
                  {c.p.firstName} {c.p.lastName}
                </div>
                <div className="tiny dim ellipsis">
                  {teamAbbrev(league, c.tid)}
                  {ts ? ` (${ts.won}-${ts.lost})` : ''} · {statLine(c.p, league.season, kind)}
                </div>
                <div style={{ marginTop: 5 }}>
                  <Bar value={score - low} max={Math.max(0.01, top - low)} height={4} color={i === 0 ? 'var(--tier-elite)' : undefined} />
                </div>
              </div>
              {c.tid !== null ? <TeamLogo tid={c.tid} size={24} /> : <span />}
            </Link>
          );
        })
      )}
    </Card>
  );
}
