// History → Records: the league's and each franchise's record book, one line per record (who holds
// it and the mark), its whole list a tap away. Single games come from the book kept as games are
// played (League.records: in a real league it opened with the NBA's games since 1996-97); single
// seasons and careers from the stats every player and team keeps for good, this league's seasons
// only. A real league's book ends with the all-time records: the NBA's older marks (Wilt
// Chamberlain's 100, the 73-9 Warriors) beside this league's best.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { fmtDate } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import {
  ALL_TIME_SEASON,
  ALL_TIME_TEAM,
  CAREER_LABEL,
  KEEP,
  REC_LABEL,
  REC_STATS,
  SEASON_STAT_LABEL,
  TEAM_REC_LABEL,
  TEAM_REC_STATS,
  TEAM_SEASON_LABEL,
  bookFrom,
  careerLeaders,
  gameMark,
  pastMark,
  seasonRecords,
  teamMark,
  teamSeasonRecords,
  winsBar,
  type CareerStat,
  type GameMark,
  type PastMark,
  type SeasonStat,
  type TeamMark,
  type TeamSeasonStat,
} from '../../core/league/records';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Section, Sheet } from '../components/ui';
import { f1, p1, rosterNames, signed } from '../stats';
import { FilterField, Poster, teamPath, useQueryParam } from './shared';
import { PickerLine } from './Views';
import { plural } from '../../core/format';

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
const fmtSeason = (stat: SeasonStat, v: number) =>
  stat === 'fg' || stat === 'tp' || stat === 'ft' ? p1(v) : stat === 'pts' || stat === 'tpm' ? Math.round(v).toLocaleString('en-US') : f1(v);
const fmtTeam = (stat: TeamSeasonStat, v: number) => (stat === 'wins' || stat === 'losses' ? '' : stat === 'net' ? signed(v) : f1(v));

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
          sub: `${seasonLabel(r.season)} · ${plural(r.gp, 'game')}${r.teams ? ` · ${r.teams.map((t) => league.teams[t]?.abbrev ?? '?').join('/')}` : ''}`,
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
      const rows = careerLeaders(league, stat, { tid, playoffs: post, real: true });
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
          sub: `${plural(r.seasons, 'season')}${r.active ? '' : ' · retired'}`,
          v: Math.round(r.v).toLocaleString('en-US'),
        })),
      };
    });
    // a real league's all-time records: the NBA's older mark where it still stands, else the book's
    const past = (m: PastMark, v: string, label: string): Line => ({
      key: `past-${label}`,
      who: <Who name={m.who ?? m.as} />,
      sub: `${seasonLabel(m.season)}${m.who ? ` · ${m.as}` : m.score ? ` · ${m.score[0]}-${m.score[1]}` : ''}`,
      v,
    });
    const allTime: Rec[] = [];
    // (only beside a book opened with the NBA's games: an older save's book can't say whose marks since 1996-97 are the record)
    if (league.past && league.records?.from !== undefined && tid === undefined) {
      for (const r of game) {
        const [g, stat] = r.id.split('-') as ['g' | 't', string];
        const m = pastMark(kind, stat as never, g === 't');
        const top = r.lines[0];
        const stands = m && (!top || m.v >= Number(top.v.replace('+', '')));
        // (one game's, a season's average and a season's total side by side: each says which)
        if (stands || top) allTime.push({ ...r, id: `a-${r.id}`, label: g === 'g' ? `${r.label} in a game` : r.label, lines: [stands ? past(m, String(m.v), r.id) : top] });
      }
      if (!post) {
        for (const r of season.filter((x) => ['s-ppg', 's-rpg', 's-apg', 's-pts', 's-tpm'].includes(x.id))) {
          const stat = r.id.slice(2) as SeasonStat;
          const m = ALL_TIME_SEASON[stat]!;
          const top = seasonRecords(league, stat, { n: 1 })[0];
          const label = stat === 'pts' || stat === 'tpm' ? `${r.label} in a season` : SEASON_STAT_LABEL[stat];
          allTime.push({ ...r, id: `a-${r.id}`, label, lines: !top || m.v >= top.v ? [past(m, fmtSeason(stat, m.v), r.id)] : r.lines.slice(0, 1) });
        }
        const best = winsBar(league, ['preseason', 'regular'].includes(league.phase) ? league.season : league.season + 1)[0];
        const w = ALL_TIME_TEAM.wins[0];
        allTime.push({
          id: 'a-wins',
          label: 'Best record',
          title: 'Best record',
          lines: [
            best && best.season >= league.startSeason && best.tid !== undefined
              ? { key: 'a-wins', to: teamPath(best.tid), who: <Who tid={best.tid} decorative name={best.as} />, sub: seasonLabel(best.season), v: `${best.won}-${best.lost}` }
              : past({ v: w.won, team: w.team, as: w.as, season: w.season }, `${w.won}-${w.lost}`, 'wins'),
          ],
        });
        const worst = teamSeasonRecords(league, 'losses', { n: 1 })[0];
        const x = ALL_TIME_TEAM.worst;
        allTime.push({
          id: 'a-losses',
          label: 'Worst record',
          title: 'Worst record',
          lines: [
            worst && worst.v > x.lost / (x.won + x.lost)
              ? {
                  key: 'a-losses',
                  to: teamPath(worst.tid),
                  who: <Who tid={worst.tid} decorative name={`${league.teams[worst.tid].region} ${league.teams[worst.tid].name}`} />,
                  sub: seasonLabel(worst.season),
                  v: `${worst.won}-${worst.lost}`,
                }
              : past({ v: x.won, team: x.team, as: x.as, season: x.season }, `${x.won}-${x.lost}`, 'losses'),
          ],
        });
      }
    }
    return { game, season, team, career, allTime, keep: tid !== undefined ? KEEP.team[kind] : KEEP.league[kind] };
  }, [league, tid, post]);
}

export function RecordBook({ league }: { league: League }) {
  const [scope, setScope] = useQueryParam<string>('rec', 'league');
  const [post, setPost] = useQueryParam<'reg' | 'post'>('book', 'reg', ['reg', 'post']);
  const [open, setOpen] = useState<Rec | null>(null);
  const tid = scope !== 'league' && league.teams[Number(scope)] ? Number(scope) : undefined;
  const book = useBook(league, tid, post === 'post');
  const since = league.records?.since ?? league.startSeason;
  // (a real league's single games reach back to 1996-97: the NBA's from the game files)
  const from = league.records ? bookFrom(league.records) : since;
  // in a real league, what counts only this league's seasons says so
  const ours = league.past ? `Since ${seasonLabel(league.startSeason)}` : undefined;
  const sections: [string, Rec[], string, string?][] = [
    ['Single game', book.game, 'No games in the book yet.', from < since ? `Since ${seasonLabel(from)}` : undefined],
    [post === 'post' ? 'Playoff run' : 'Season', book.season, 'No qualifying seasons yet.', ours],
    ['Team season', book.team, 'Starts when a regular season is over.', ours],
    [tid !== undefined ? 'With the franchise' : 'Career', book.career, 'No games yet.', league.past ? 'Players in this league' : undefined],
    ['All-time', book.allTime, '', "The NBA's and this league's"],
  ];
  const bare = sections.every(([, recs]) => recs.every((r) => !r.lines.length));
  return (
    <>
      {/* the poster: whose book it is, and its first record's mark (a single game's points) */}
      <Poster
        // (how far back each part reaches is its section's line)
        over={post === 'post' ? 'Playoffs' : 'Regular season'}
        head={tid !== undefined ? `${league.teams[tid].name} records` : 'League records'}
        fig={book.game[0]?.lines[0] ? { v: book.game[0].lines[0].v, k: book.game[0].label } : undefined}
      >
        <PickerLine
          parts={['Change book']}
          title="Record book"
          label={`Record book: ${tid !== undefined ? league.teams[tid].name : 'league records'}, ${post === 'post' ? 'playoffs' : 'regular season'}. Change`}
        >
          <FilterField label="Records">
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
          </FilterField>
          <FilterField label="Games">
            <select className="lg-select" value={post} onChange={(e) => setPost(e.target.value as 'reg' | 'post')} aria-label="Season type">
              <option value="reg">Regular season</option>
              <option value="post">Playoffs</option>
            </select>
          </FilterField>
        </PickerLine>
      </Poster>
      {/* a book with nothing in it yet is one line, not four empty sections */}
      {bare && <div className="card empty">{post === 'post' ? 'No playoff games in the book yet.' : 'No games in the book yet. Records land here as they are set.'}</div>}
      {sections.map(([title, recs, empty, meta], i) =>
        recs.length && !bare ? (
          <Section
            key={title}
            title={title}
            right={
              i === 0 ? (
                <span className="lg-rec-h">
                  {meta && <span className="lg-sec-meta">{meta}</span>}
                  <Help title="The record book">
                    {from < since ? (
                      <>
                        <p className="lg-p">Single games reach back to {seasonLabel(from)}. They count every NBA game since then and every game here.</p>
                        <p className="lg-p">Seasons count from {seasonLabel(since)}, this league&apos;s only.</p>
                        <p className="lg-p">All-time holds the NBA&apos;s records from before {seasonLabel(from)} that still stand, beside this league&apos;s best.</p>
                      </>
                    ) : (
                      <p className="lg-p">Seasons count from {seasonLabel(since)}, this league&apos;s only.</p>
                    )}
                    <p className="lg-p">A career adds his real seasons before it, if his whole career is on record.</p>
                    <p className="lg-p">
                      Single games keep the top {KEEP.league.reg} for the league and {KEEP.team.reg} for each franchise. In the playoffs, {KEEP.league.post} and {KEEP.team.post}.
                    </p>
                    <p className="lg-p">
                      A per-game or percentage season record needs 70% of the team&apos;s games. It also needs 300 field goals, 82 threes or 125 free throws made.
                    </p>
                    <p className="lg-p">A playoff run needs half the team&apos;s playoff games. Team seasons count once the regular season is over.</p>
                  </Help>
                </span>
              ) : meta ? (
                <span className="lg-sec-meta">{meta}</span>
              ) : undefined
            }
          >
            <div className="card flush list">
              {recs.every((r) => !r.lines.length) ? (
                <div className="empty">{empty}</div>
              ) : (
                // (an all-time record is the one line: there's no list behind it)
                recs.map((r) => <RecordRow key={r.id} r={r} onOpen={r.id.startsWith('a-') ? undefined : () => setOpen(r)} />)
              )}
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

/** A record on one line: what, who holds it, the mark. It opens the whole list (an all-time record has none). */
function RecordRow({ r, onOpen }: { r: Rec; onOpen?: () => void }) {
  const top = r.lines[0];
  if (!top)
    return (
      <div className="lg-rec">
        <span className="k">{r.label}</span>
        <span className="who dim">—</span>
      </div>
    );
  const cells = (
    <>
      <span className="k">{r.label}</span>
      <span className="who">
        {top.who}
        <span className="sub ellipsis">{top.sub}</span>
      </span>
      <span className="v num">{top.v}</span>
    </>
  );
  if (!onOpen) return <div className="lg-rec">{cells}</div>;
  return (
    <button className="lg-rec" onClick={onOpen} aria-haspopup="dialog">
      {cells}
      <ChevronRight size={15} className="dim" aria-hidden="true" />
    </button>
  );
}
