// History → Records: the league's and each franchise's record book, one line per record (who holds
// it and the mark), its whole list a tap away. Single games come from the book kept as games are
// played (League.records); single seasons and careers from the stats every player and team keeps
// for good. Only seasons played in this league count.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
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
  type SeasonStat,
  type TeamMark,
  type TeamSeasonStat,
} from '../../core/league/records';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Section, Sheet } from '../components/ui';
import { f1, p1, rosterNames } from '../stats';
import { teamPath, useQueryParam } from './shared';

const SEASON_STATS: SeasonStat[] = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'pts', 'tpm', 'fg', 'tp', 'ft'];
const TEAM_SEASON_STATS: TeamSeasonStat[] = ['wins', 'losses', 'net', 'ortg', 'drtg', 'ppg'];
const CAREER_STATS: CareerStat[] = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm', 'gp'];

/** One line of a record's list: its place, who set it (with when), the mark. */
interface Line {
  key: string;
  to?: string;
  who: ReactNode;
  sub: ReactNode;
  v: string;
}

/** A record: its name, and its list best first (the record is the first line). */
interface Rec {
  id: string;
  label: string;
  title: string;
  lines: Line[];
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

const when = (league: League, m: { season: number; day: number; opp: number }) =>
  `vs ${league.teams[m.opp]?.abbrev ?? '?'} · ${fmtDate(m.season, m.day, { month: 'short', day: 'numeric', year: 'numeric' })}`;
const fmtSeason = (stat: SeasonStat, v: number) => (stat === 'fg' || stat === 'tp' || stat === 'ft' ? p1(v) : stat === 'pts' || stat === 'tpm' ? String(Math.round(v)) : f1(v));
const fmtTeam = (stat: TeamSeasonStat, v: number) => (stat === 'wins' || stat === 'losses' ? '' : stat === 'net' ? `${v > 0 ? '+' : ''}${f1(v)}` : f1(v));

function Who({ tid, name, decorative }: { tid?: number; name: ReactNode; decorative?: boolean }) {
  return (
    <span className="nm">
      {tid !== undefined && <TeamLogo tid={tid} size={16} decorative={decorative} />}
      <span className="ellipsis">{name}</span>
    </span>
  );
}

/** Every record of the book for the league or one franchise, the regular season's or the postseason's. */
function useBook(league: League, tid: number | undefined, post: boolean) {
  return useLeagueMemo(() => {
    const kind = post ? 'post' : 'reg';
    const shelf = league.records ? (tid !== undefined ? league.records.teams[tid]?.[kind] : league.records.league[kind]) : undefined;
    const game: Rec[] = [
      ...REC_STATS.map((stat): Rec => {
        const marks: GameMark[] = (shelf?.players[stat] ?? []).map((r) => gameMark(league, r));
        const name = listNames(
          league,
          marks.map((m) => m.pid),
        );
        return {
          id: `g-${stat}`,
          label: REC_LABEL[stat][0],
          title: `${REC_LABEL[stat][0]} in a game`,
          lines: marks.map((m) => ({
            key: `${m.gid}-${m.pid}`,
            to: league.players[m.pid] ? `/player/${m.pid}` : undefined,
            who: <Who tid={m.tid} name={name(m.pid, m.name)} />,
            sub: when(league, m),
            v: String(m.v),
          })),
        };
      }),
      ...TEAM_REC_STATS.map((stat): Rec => {
        const marks: TeamMark[] = (shelf?.teams[stat] ?? []).map(teamMark);
        const label = stat === 'pts' ? 'Team points' : stat === 'margin' ? 'Biggest win' : 'Team threes';
        return {
          id: `t-${stat}`,
          label,
          title: `${TEAM_REC_LABEL[stat]} in a game`,
          lines: marks.map((m) => ({
            key: `${m.gid}-${m.tid}`,
            to: league.teams[m.tid] ? teamPath(m.tid) : undefined,
            who: <Who tid={m.tid} decorative name={`${league.teams[m.tid]?.abbrev ?? '?'} ${m.score[0]}-${m.score[1]}`} />,
            sub: when(league, m),
            v: stat === 'margin' ? `+${m.v}` : String(m.v),
          })),
        };
      }),
    ];
    const season: Rec[] = SEASON_STATS.map((stat) => {
      const rows = seasonRecords(league, stat, { tid, playoffs: post });
      const name = listNames(
        league,
        rows.map((r) => r.pid),
      );
      return {
        id: `s-${stat}`,
        label: SEASON_STAT_LABEL[stat].replace(' per game', ''),
        title: `${SEASON_STAT_LABEL[stat]}, ${post ? 'a playoff run' : 'a season'}`,
        lines: rows.map((r) => ({
          key: `${r.pid}-${r.season}`,
          to: league.players[r.pid] ? `/player/${r.pid}` : undefined,
          who: <Who tid={r.tid} name={name(r.pid)} />,
          sub: `${seasonLabel(r.season)} · ${r.gp} game${r.gp === 1 ? '' : 's'}${r.teams ? ` · ${r.teams.map((t) => league.teams[t]?.abbrev ?? '?').join('/')}` : ''}`,
          v: fmtSeason(stat, r.v),
        })),
      };
    });
    // per game: "Points" alone would read like a total beside the totals
    for (const r of season) if (['s-ppg', 's-rpg', 's-apg', 's-spg', 's-bpg'].includes(r.id)) r.label = `${r.label} a game`;
    const team: Rec[] = post
      ? []
      : TEAM_SEASON_STATS.map((stat) => {
          const rows = teamSeasonRecords(league, stat, { tid });
          return {
            id: `ts-${stat}`,
            label: TEAM_SEASON_LABEL[stat],
            title: `Team seasons: ${TEAM_SEASON_LABEL[stat].toLowerCase()}`,
            lines: rows.map((r) => ({
              key: `${r.tid}-${r.season}`,
              to: teamPath(r.tid),
              who: <Who tid={r.tid} decorative name={`${league.teams[r.tid].region} ${league.teams[r.tid].name}`} />,
              sub: `${seasonLabel(r.season)}${fmtTeam(stat, r.v) ? ` · ${r.won}-${r.lost}` : ''}`,
              v: fmtTeam(stat, r.v) || `${r.won}-${r.lost}`,
            })),
          };
        });
    const career: Rec[] = CAREER_STATS.map((stat) => {
      const rows = careerLeaders(league, stat, { tid, playoffs: post });
      const name = listNames(
        league,
        rows.map((r) => r.pid),
      );
      return {
        id: `c-${stat}`,
        label: CAREER_LABEL[stat],
        title: `${tid !== undefined ? 'Franchise' : 'Career'} ${CAREER_LABEL[stat].toLowerCase()}`,
        lines: rows.map((r) => ({
          key: String(r.pid),
          to: league.players[r.pid] ? `/player/${r.pid}` : undefined,
          who: <Who name={name(r.pid)} />,
          sub: `${r.seasons} season${r.seasons === 1 ? '' : 's'}${r.active ? '' : ' · retired'}`,
          v: Math.round(r.v).toLocaleString('en-US'),
        })),
      };
    });
    return { game, season, team, career, keep: tid !== undefined ? KEEP.team[kind] : KEEP.league[kind] };
  }, [league, tid, post]);
}

export function RecordBook({ league }: { league: League }) {
  const [scope, setScope] = useQueryParam<string>('rec', 'league');
  const [post, setPost] = useQueryParam<'reg' | 'post'>('book', 'reg', ['reg', 'post']);
  const [open, setOpen] = useState<Rec | null>(null);
  const tid = scope !== 'league' && league.teams[Number(scope)] ? Number(scope) : undefined;
  const book = useBook(league, tid, post === 'post');
  const since = league.records?.since ?? league.startSeason;
  const sections: [string, Rec[], string][] = [
    ['Single game', book.game, 'No games in the book yet.'],
    [post === 'post' ? 'Playoff run' : 'Season', book.season, 'No qualifying seasons yet.'],
    ['Team season', book.team, 'Starts when a regular season is over.'],
    [tid !== undefined ? 'With the franchise' : 'Career', book.career, 'No games yet.'],
  ];
  return (
    <>
      <div className="lg-sub">
        <select className="lg-select" value={tid ?? 'league'} onChange={(e) => setScope(e.target.value)} aria-label="Record book">
          <option value="league">League records</option>
          {[...league.teams]
            .sort((a, b) => a.abbrev.localeCompare(b.abbrev))
            .map((t) => (
              <option key={t.tid} value={t.tid}>
                {t.region} {t.name}
              </option>
            ))}
        </select>
        <select className="lg-select" value={post} onChange={(e) => setPost(e.target.value as 'reg' | 'post')} aria-label="Season type">
          <option value="reg">Regular season</option>
          <option value="post">Playoffs</option>
        </select>
      </div>
      {sections.map(([title, recs, empty], i) =>
        recs.length ? (
          <Section
            key={title}
            title={title}
            right={
              i === 0 ? (
                <Help title="The record book">
                  <p className="lg-p">
                    Since {seasonLabel(since)}, this league&apos;s seasons only. Single games keep the top {KEEP.league.reg} (playoffs {KEEP.league.post}) for the league and the
                    top {KEEP.team.reg} ({KEEP.team.post}) for each franchise.
                  </p>
                  <p className="lg-p">
                    Per-game and percentage season records need 70% of the team&apos;s games (and 300 field goals, 82 threes or 125 free throws made); a playoff run, half the
                    team&apos;s playoff games. Team seasons count once the regular season is over.
                  </p>
                </Help>
              ) : undefined
            }
          >
            <div className="card flush list">
              {recs.every((r) => !r.lines.length) ? <div className="empty">{empty}</div> : recs.map((r) => <RecordRow key={r.id} r={r} onOpen={() => setOpen(r)} />)}
            </div>
          </Section>
        ) : null,
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open && (
          <div className="card flush list">
            {open.lines.map((l, i) => {
              const cells = (
                <>
                  <span className="rk">{i + 1}</span>
                  <span className="who">
                    {l.who}
                    <span className="sub ellipsis">{l.sub}</span>
                  </span>
                  <span className="v num">{l.v}</span>
                </>
              );
              return l.to ? (
                <Link key={l.key} to={l.to} className="lg-book-row" onClick={() => setOpen(null)}>
                  {cells}
                </Link>
              ) : (
                <div key={l.key} className="lg-book-row">
                  {cells}
                </div>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}

/** A record on one line: what, who holds it, the mark. It opens the whole list. */
function RecordRow({ r, onOpen }: { r: Rec; onOpen: () => void }) {
  const top = r.lines[0];
  if (!top)
    return (
      <div className="lg-rec">
        <span className="k">{r.label}</span>
        <span className="who dim">—</span>
      </div>
    );
  return (
    <button className="lg-rec" onClick={onOpen} aria-haspopup="dialog">
      <span className="k">{r.label}</span>
      <span className="who">
        {top.who}
        <span className="sub ellipsis">{top.sub}</span>
      </span>
      <span className="v num">{top.v}</span>
      <ChevronRight size={15} className="dim" aria-hidden="true" />
    </button>
  );
}
