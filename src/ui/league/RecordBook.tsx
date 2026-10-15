// History → Records: the league's and each franchise's record book. Single games come from the book
// kept as games are played (League.records); single seasons and careers from the stats every
// player and team keeps for good. Only seasons played in this league count.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { fmtDate } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import {
  CAREER_LABEL,
  KEEP,
  REC_LABEL,
  REC_STATS,
  SEASON_STAT_LABEL,
  TEAM_REC_LABEL,
  TEAM_REC_STATS,
  TEAM_SEASON_LABEL,
  careerLeaders,
  seasonRecords,
  teamSeasonRecords,
  type CareerStat,
  type GameMark,
  type RecStat,
  type SeasonStat,
  type TeamMark,
  type TeamRecStat,
  type TeamSeasonStat,
} from '../../core/league/records';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Chips, Empty, Segmented } from '../components/ui';
import { f1, p1 } from '../stats';
import { SectionLabel, shortName, useQueryParam } from './shared';

type Part = 'game' | 'season' | 'career';
type GameKey = RecStat | `team-${TeamRecStat}`;

const SEASON_STATS: SeasonStat[] = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'pts', 'tpm', 'fg', 'tp', 'ft'];
const SEASON_SHORT: Record<SeasonStat, string> = { ppg: 'PPG', rpg: 'RPG', apg: 'APG', spg: 'SPG', bpg: 'BPG', pts: 'Points', tpm: '3PM', fg: 'FG%', tp: '3P%', ft: 'FT%' };
const TEAM_SEASON_STATS: TeamSeasonStat[] = ['wins', 'losses', 'net', 'ortg', 'drtg', 'ppg'];
const CAREER_STATS: CareerStat[] = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'gp'];
const GAME_SHORT: Record<GameKey, string> = {
  pts: 'Points',
  reb: 'Rebounds',
  ast: 'Assists',
  stl: 'Steals',
  blk: 'Blocks',
  tpm: 'Threes',
  'team-pts': 'Team points',
  'team-margin': 'Biggest win',
  'team-tpm': 'Team threes',
};
const GAME_KEYS: GameKey[] = [...REC_STATS, ...TEAM_REC_STATS.map((s) => `team-${s}` as const)];

export function RecordBook({ league }: { league: League }) {
  const [scope, setScope] = useQueryParam<string>('rec', 'league');
  const [part, setPart] = useQueryParam<Part>('part', 'game', ['game', 'season', 'career']);
  const [post, setPost] = useQueryParam<'reg' | 'post'>('book', 'reg', ['reg', 'post']);
  const [gameKey, setGameKey] = useQueryParam<GameKey>('stat', 'pts', GAME_KEYS);
  const [seasonStat, setSeasonStat] = useQueryParam<SeasonStat>('sstat', 'ppg', SEASON_STATS);
  const [teamStat, setTeamStat] = useQueryParam<TeamSeasonStat>('tstat', 'wins', TEAM_SEASON_STATS);
  const [careerStat, setCareerStat] = useQueryParam<CareerStat>('cstat', 'pts', CAREER_STATS);
  const tid = scope !== 'league' && league.teams[Number(scope)] ? Number(scope) : undefined;
  const team = tid !== undefined ? league.teams[tid] : undefined;
  const book = league.records;
  const since = book?.since ?? league.startSeason;
  const playoffs = post === 'post';

  return (
    <>
      <div className="row" style={{ gap: 10 }}>
        <BookOpen size={20} className="dim" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">{team ? `${team.region} ${team.name}` : 'League records'}</div>
          <div className="tiny dim ellipsis">Since {seasonLabel(since)} · seasons played in this league</div>
        </div>
        <select className="lg-select" value={tid ?? 'league'} onChange={(e) => setScope(e.target.value)} aria-label="Record book" style={{ maxWidth: 110 }}>
          <option value="league">League</option>
          {[...league.teams]
            .sort((a, b) => a.abbrev.localeCompare(b.abbrev))
            .map((t) => (
              <option key={t.tid} value={t.tid}>
                {t.abbrev}
              </option>
            ))}
        </select>
      </div>
      <Segmented
        label="Records"
        value={part}
        onChange={setPart}
        options={[
          { id: 'game', label: 'Single game' },
          { id: 'season', label: 'Season' },
          { id: 'career', label: 'Career' },
        ]}
      />
      <Chips
        value={post}
        onChange={setPost}
        options={[
          { id: 'reg', label: 'Regular season' },
          { id: 'post', label: 'Playoffs' },
        ]}
      />
      {part === 'game' && <GameRecords league={league} tid={tid} kind={post} stat={gameKey} setStat={setGameKey} />}
      {part === 'season' && <SeasonRecords league={league} tid={tid} playoffs={playoffs} stat={seasonStat} setStat={setSeasonStat} teamStat={teamStat} setTeamStat={setTeamStat} />}
      {part === 'career' && <CareerRecords league={league} tid={tid} playoffs={playoffs} stat={careerStat} setStat={setCareerStat} />}
    </>
  );
}

function PlayerName({ league, pid, name }: { league: League; pid: number; name?: string }) {
  const p = league.players[pid];
  const label = p ? shortName(p) : (name ?? 'Unknown');
  return p ? (
    <Link to={`/player/${pid}`} className="bold ellipsis">
      {label}
    </Link>
  ) : (
    <span className="bold ellipsis">{label}</span>
  );
}

function When({ league, m }: { league: League; m: { season: number; day: number; gid: number; opp: number } }) {
  const stored = league.games.some((g) => g.gid === m.gid && g.season === m.season);
  const text = `vs ${league.teams[m.opp]?.abbrev ?? '?'} · ${fmtDate(m.season, m.day, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return stored ? (
    <Link to={`/game/${m.gid}`} className="tiny dim ellipsis">
      {text}
    </Link>
  ) : (
    <span className="tiny dim ellipsis">{text}</span>
  );
}

function Row({ i, children, value }: { i: number; children: ReactNode; value: ReactNode }) {
  return (
    <div className="lg-rec-row">
      <span className="tiny dim bold" style={{ textAlign: 'right' }}>
        {i + 1}
      </span>
      <span className="col" style={{ minWidth: 0, gap: 1 }}>
        {children}
      </span>
      <span className="num bold">{value}</span>
    </div>
  );
}

function GameRecords({ league, tid, kind, stat, setStat }: { league: League; tid?: number; kind: 'reg' | 'post'; stat: GameKey; setStat: (s: GameKey) => void }) {
  const book = league.records;
  const shelf = book ? (tid !== undefined ? book.teams[tid]?.[kind] : book.league[kind]) : undefined;
  const isTeam = stat.startsWith('team-');
  const list: (GameMark | TeamMark)[] = (isTeam ? shelf?.teams[stat.slice(5) as TeamRecStat] : shelf?.players[stat as RecStat]) ?? [];
  const keep = tid !== undefined ? KEEP.team[kind] : KEEP.league[kind];
  return (
    <>
      <Chips value={stat} onChange={setStat} options={GAME_KEYS.map((k) => ({ id: k, label: GAME_SHORT[k] }))} />
      <SectionLabel right={<span className="tiny dim">top {keep}</span>}>
        {isTeam ? TEAM_REC_LABEL[stat.slice(5) as TeamRecStat] : REC_LABEL[stat as RecStat][0]} in a game
      </SectionLabel>
      <Card>
        {list.length === 0 ? (
          <Empty>No games in the book yet: records are set as games are played.</Empty>
        ) : (
          <div className="lg-team5">
            {list.map((m, i) =>
              'pid' in m ? (
                <Row key={`${m.gid}-${m.pid}`} i={i} value={m.v}>
                  <span className="row" style={{ gap: 6, minWidth: 0 }}>
                    <TeamLogo tid={m.tid} size={16} />
                    <PlayerName league={league} pid={m.pid} name={m.name} />
                  </span>
                  <When league={league} m={m} />
                </Row>
              ) : (
                <Row key={`${m.gid}-${m.tid}`} i={i} value={stat === 'team-margin' ? `+${m.v}` : m.v}>
                  <span className="row" style={{ gap: 6, minWidth: 0 }}>
                    <TeamLogo tid={m.tid} size={16} />
                    <span className="bold ellipsis">
                      {league.teams[m.tid]?.abbrev ?? '?'} {m.score[0]}-{m.score[1]}
                    </span>
                  </span>
                  <When league={league} m={m} />
                </Row>
              ),
            )}
          </div>
        )}
      </Card>
    </>
  );
}

const fmtSeason = (stat: SeasonStat, v: number) => (stat === 'fg' || stat === 'tp' || stat === 'ft' ? p1(v) : stat === 'pts' || stat === 'tpm' ? String(Math.round(v)) : f1(v));
const fmtTeam = (stat: TeamSeasonStat, v: number) => (stat === 'wins' || stat === 'losses' ? '' : stat === 'net' ? `${v > 0 ? '+' : ''}${f1(v)}` : f1(v));

function SeasonRecords({
  league,
  tid,
  playoffs,
  stat,
  setStat,
  teamStat,
  setTeamStat,
}: {
  league: League;
  tid?: number;
  playoffs: boolean;
  stat: SeasonStat;
  setStat: (s: SeasonStat) => void;
  teamStat: TeamSeasonStat;
  setTeamStat: (s: TeamSeasonStat) => void;
}) {
  const rows = useLeagueMemo(() => seasonRecords(league, stat, { tid, playoffs }), [league, stat, tid, playoffs]);
  const teamRows = useLeagueMemo(() => (playoffs ? [] : teamSeasonRecords(league, teamStat, { tid })), [league, teamStat, tid, playoffs]);
  return (
    <>
      <Chips value={stat} onChange={setStat} options={SEASON_STATS.map((k) => ({ id: k, label: SEASON_SHORT[k] }))} />
      <SectionLabel>{SEASON_STAT_LABEL[stat]}</SectionLabel>
      <Card>
        {rows.length === 0 ? (
          <Empty>No qualifying seasons yet. Per-game and percentage records need 70% of the team's games (and 300 field goals, 82 threes or 125 free throws made).</Empty>
        ) : (
          <div className="lg-team5">
            {rows.map((r, i) => {
              const p = league.players[r.pid];
              return (
                <Row key={`${r.pid}-${r.season}`} i={i} value={fmtSeason(stat, r.v)}>
                  <span className="row" style={{ gap: 6, minWidth: 0 }}>
                    <TeamLogo tid={r.tid} size={16} />
                    {p ? (
                      <Link to={`/player/${p.pid}`} className="bold ellipsis">
                        {shortName(p)}
                      </Link>
                    ) : (
                      <span className="bold ellipsis">Unknown</span>
                    )}
                  </span>
                  <span className="tiny dim ellipsis">
                    {seasonLabel(r.season)} · {r.gp} games{r.teams ? ` · ${r.teams.map((t) => league.teams[t]?.abbrev ?? '?').join('/')}` : ''}
                  </span>
                </Row>
              );
            })}
          </div>
        )}
      </Card>
      {!playoffs && (
        <>
          <Chips value={teamStat} onChange={setTeamStat} options={TEAM_SEASON_STATS.map((k) => ({ id: k, label: TEAM_SEASON_LABEL[k] }))} />
          <SectionLabel>Team seasons · {TEAM_SEASON_LABEL[teamStat].toLowerCase()}</SectionLabel>
          <Card>
            {teamRows.length === 0 ? (
              <Empty>Team season records start when the first regular season is over.</Empty>
            ) : (
              <div className="lg-team5">
                {teamRows.map((r, i) => (
                  <Row key={`${r.tid}-${r.season}`} i={i} value={fmtTeam(teamStat, r.v) || `${r.won}-${r.lost}`}>
                    <span className="row" style={{ gap: 6, minWidth: 0 }}>
                      <TeamLogo tid={r.tid} size={16} />
                      <Link to={`/team/${r.tid}`} className="bold ellipsis">
                        {league.teams[r.tid].region} {league.teams[r.tid].name}
                      </Link>
                    </span>
                    <span className="tiny dim ellipsis">
                      {seasonLabel(r.season)}
                      {fmtTeam(teamStat, r.v) ? ` · ${r.won}-${r.lost}` : ''}
                    </span>
                  </Row>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function CareerRecords({ league, tid, playoffs, stat, setStat }: { league: League; tid?: number; playoffs: boolean; stat: CareerStat; setStat: (s: CareerStat) => void }) {
  const rows = useLeagueMemo(() => careerLeaders(league, stat, { tid, playoffs }), [league, stat, tid, playoffs]);
  return (
    <>
      <Chips value={stat} onChange={setStat} options={CAREER_STATS.map((k) => ({ id: k, label: CAREER_LABEL[k] }))} />
      <SectionLabel>
        {tid !== undefined ? 'Franchise' : 'Career'} leaders · {CAREER_LABEL[stat].toLowerCase()}
      </SectionLabel>
      <Card>
        {rows.length === 0 ? (
          <Empty>No games recorded yet.</Empty>
        ) : (
          <div className="lg-team5">
            {rows.map((r, i) => {
              const p = league.players[r.pid];
              return (
                <Row key={r.pid} i={i} value={Math.round(r.v).toLocaleString('en-US')}>
                  {p ? (
                    <Link to={`/player/${p.pid}`} className="bold ellipsis">
                      {shortName(p)}
                    </Link>
                  ) : (
                    <span className="bold ellipsis">Unknown</span>
                  )}
                  <span className="tiny dim ellipsis">
                    {r.seasons} season{r.seasons === 1 ? '' : 's'}
                    {r.active ? '' : ' · retired'}
                  </span>
                </Row>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
