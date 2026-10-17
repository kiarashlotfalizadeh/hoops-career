// History → Records: the league's and each franchise's record book. Single games come from the book
// kept as games are played (League.records); single seasons and careers from the stats every
// player and team keeps for good. Only seasons played in this league count.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import type { League, Player } from '../../core/types';
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
  gameMark,
  seasonRecords,
  teamMark,
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
import { Chips, Section, Segmented } from '../components/ui';
import { f1, p1, rosterNames } from '../stats';
import { useQueryParam } from './shared';

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
      <div className="lg-book-h">
        {team ? <TeamLogo tid={team.tid} size={32} decorative /> : <BookOpen size={22} className="dim" aria-hidden="true" />}
        <div className="grow">
          <div className="lg-book-t ellipsis">{team ? `${team.region} ${team.name}` : 'League records'}</div>
          <div className="lg-book-s ellipsis">Since {seasonLabel(since)} · this league&apos;s seasons only</div>
        </div>
        <select className="lg-select" value={tid ?? 'league'} onChange={(e) => setScope(e.target.value)} aria-label="Record book">
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
        label="Season type"
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

/** A record's stat picker: one line of chips that scrolls sideways. */
function StatChips<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="lg-hscroll" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} className={`chip ${value === o.id ? 'on' : ''}`} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Names for the players a list shows ("S. Gilgeous-Alexander"), with as much of the first name as it
 * takes to tell two of them apart ("Jal. Williams", "Jay. Williams"), as on the roster. A player
 * gone from the save keeps the name the book froze for him.
 */
function listNames(league: League, pids: number[]): (pid: number, frozen?: string) => string {
  const name = rosterNames(
    pids.map((pid) => league.players[pid]).filter((p): p is Player => !!p),
    { initial: true },
  );
  return (pid, frozen) => (league.players[pid] ? name(pid) : (frozen ?? 'Unknown'));
}

function When({ league, m }: { league: League; m: { season: number; day: number; opp: number } }) {
  return (
    <span className="sub ellipsis">
      vs {league.teams[m.opp]?.abbrev ?? '?'} · {fmtDate(m.season, m.day, { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  );
}

/** One line of the book; the whole line is the link (to the player, or the team for a team's mark). */
function Row({ i, to, children, value }: { i: number; to?: string; children: ReactNode; value: ReactNode }) {
  const cells = (
    <>
      <span className="rk">{i + 1}</span>
      <span className="who">{children}</span>
      <span className="v num">{value}</span>
    </>
  );
  return to ? (
    <Link to={to} className="lg-book-row">
      {cells}
    </Link>
  ) : (
    <div className="lg-book-row">{cells}</div>
  );
}

/** A list of the book's lines, or what it takes to get into it. */
function Book({ title, right, empty, children }: { title: ReactNode; right?: ReactNode; empty: ReactNode | false; children: ReactNode }) {
  return (
    <Section title={title} right={right}>
      {empty ? <div className="card empty">{empty}</div> : <div className="card flush list">{children}</div>}
    </Section>
  );
}

function GameRecords({ league, tid, kind, stat, setStat }: { league: League; tid?: number; kind: 'reg' | 'post'; stat: GameKey; setStat: (s: GameKey) => void }) {
  const book = league.records;
  const shelf = book ? (tid !== undefined ? book.teams[tid]?.[kind] : book.league[kind]) : undefined;
  const isTeam = stat.startsWith('team-');
  const list: (GameMark | TeamMark)[] = isTeam
    ? (shelf?.teams[stat.slice(5) as TeamRecStat] ?? []).map(teamMark)
    : (shelf?.players[stat as RecStat] ?? []).map((r) => gameMark(league, r));
  const keep = tid !== undefined ? KEEP.team[kind] : KEEP.league[kind];
  const name = listNames(
    league,
    list.flatMap((m) => ('pid' in m ? [m.pid] : [])),
  );
  return (
    <>
      <StatChips label="Record" value={stat} onChange={setStat} options={GAME_KEYS.map((k) => ({ id: k, label: GAME_SHORT[k] }))} />
      <Book
        title={`${isTeam ? TEAM_REC_LABEL[stat.slice(5) as TeamRecStat] : REC_LABEL[stat as RecStat][0]} in a game`}
        right={<span className="lg-sec-meta">Top {keep}</span>}
        empty={list.length === 0 && 'No games in the book yet: records are set as games are played.'}
      >
        {list.map((m, i) =>
          'pid' in m ? (
            <Row key={`${m.gid}-${m.pid}`} i={i} to={league.players[m.pid] ? `/player/${m.pid}` : undefined} value={m.v}>
              <span className="nm">
                <TeamLogo tid={m.tid} size={16} />
                <span className="ellipsis">{name(m.pid, m.name)}</span>
              </span>
              <When league={league} m={m} />
            </Row>
          ) : (
            <Row key={`${m.gid}-${m.tid}`} i={i} to={league.teams[m.tid] ? `/team/${m.tid}` : undefined} value={stat === 'team-margin' ? `+${m.v}` : m.v}>
              <span className="nm">
                <TeamLogo tid={m.tid} size={16} decorative />
                <span className="ellipsis">
                  {league.teams[m.tid]?.abbrev ?? '?'} {m.score[0]}-{m.score[1]}
                </span>
              </span>
              <When league={league} m={m} />
            </Row>
          ),
        )}
      </Book>
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
  const name = listNames(
    league,
    rows.map((r) => r.pid),
  );
  return (
    <>
      <StatChips label="Player record" value={stat} onChange={setStat} options={SEASON_STATS.map((k) => ({ id: k, label: SEASON_SHORT[k] }))} />
      <Book
        title={SEASON_STAT_LABEL[stat]}
        empty={
          rows.length === 0 &&
          // the qualifying lines of records.ts's qualifies()
          (playoffs
            ? "No qualifying playoff runs yet. Per-game and percentage records need half the team's playoff games, four at least (and 30 field goals, 9 threes or 13 free throws made)."
            : "No qualifying seasons yet. Per-game and percentage records need 70% of the team's games (and 300 field goals, 82 threes or 125 free throws made).")
        }
      >
        {rows.map((r, i) => (
          <Row key={`${r.pid}-${r.season}`} i={i} to={league.players[r.pid] ? `/player/${r.pid}` : undefined} value={fmtSeason(stat, r.v)}>
            <span className="nm">
              <TeamLogo tid={r.tid} size={16} />
              <span className="ellipsis">{name(r.pid)}</span>
            </span>
            <span className="sub ellipsis">
              {seasonLabel(r.season)} · {r.gp} game{r.gp === 1 ? '' : 's'}
              {r.teams ? ` · ${r.teams.map((t) => league.teams[t]?.abbrev ?? '?').join('/')}` : ''}
            </span>
          </Row>
        ))}
      </Book>
      {!playoffs && (
        <>
          <StatChips label="Team record" value={teamStat} onChange={setTeamStat} options={TEAM_SEASON_STATS.map((k) => ({ id: k, label: TEAM_SEASON_LABEL[k] }))} />
          <Book
            title={`Team seasons · ${TEAM_SEASON_LABEL[teamStat].toLowerCase()}`}
            empty={teamRows.length === 0 && 'Team season records start when the first regular season is over.'}
          >
            {teamRows.map((r, i) => (
              <Row key={`${r.tid}-${r.season}`} i={i} to={`/team/${r.tid}`} value={fmtTeam(teamStat, r.v) || `${r.won}-${r.lost}`}>
                <span className="nm">
                  <TeamLogo tid={r.tid} size={16} decorative />
                  <span className="ellipsis">
                    {league.teams[r.tid].region} {league.teams[r.tid].name}
                  </span>
                </span>
                <span className="sub ellipsis">
                  {seasonLabel(r.season)}
                  {fmtTeam(teamStat, r.v) ? ` · ${r.won}-${r.lost}` : ''}
                </span>
              </Row>
            ))}
          </Book>
        </>
      )}
    </>
  );
}

function CareerRecords({ league, tid, playoffs, stat, setStat }: { league: League; tid?: number; playoffs: boolean; stat: CareerStat; setStat: (s: CareerStat) => void }) {
  const rows = useLeagueMemo(() => careerLeaders(league, stat, { tid, playoffs }), [league, stat, tid, playoffs]);
  const name = listNames(
    league,
    rows.map((r) => r.pid),
  );
  return (
    <>
      <StatChips label="Career stat" value={stat} onChange={setStat} options={CAREER_STATS.map((k) => ({ id: k, label: CAREER_LABEL[k] }))} />
      <Book title={`${tid !== undefined ? 'Franchise' : 'Career'} leaders · ${CAREER_LABEL[stat].toLowerCase()}`} empty={rows.length === 0 && 'No games recorded yet.'}>
        {rows.map((r, i) => (
          <Row key={r.pid} i={i} to={league.players[r.pid] ? `/player/${r.pid}` : undefined} value={Math.round(r.v).toLocaleString('en-US')}>
            <span className="nm">
              <span className="ellipsis">{name(r.pid)}</span>
            </span>
            <span className="sub ellipsis">
              {r.seasons} season{r.seasons === 1 ? '' : 's'}
              {r.active ? '' : ' · retired'}
            </span>
          </Row>
        ))}
      </Book>
    </>
  );
}
