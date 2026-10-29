// A roster as rows, the same for your team (Team → Roster) and any other (/teams/:tid): tonight's
// five, the bench, then the two-way deals. A row is two lines beside the jersey. The first: the name
// with one mark at most (out, else a 10-day deal, else a development tag: Breakout, Rising, Prospect,
// Declining), then OVR and POT in columns named once in the group's header. The second, quieter:
// position and age, then minutes, points, rebounds and assists a game, each labelled. His OVR change
// this season is on the Ratings view and his page, not on the row.
// Before anyone plays, each player's latest season stands in for this one's, and the line under the
// list says so.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { playerAge } from '../../core/playerGen';
import { Avatar, Ovr } from '../components/ui';
import { OvrKey } from '../components/OvrKey';
import { f1, latestLine, playerSeason, startingFive, type PerGame } from '../stats';
import { tenDayLeft } from '../../core/league/tenDay';
import { injuryName, plural } from '../../core/format';
import { devTag } from '../../core/league/devWatch';
import { DevTagChip } from '../player/dev';
// its rows' styles, wherever a roster shows (another team's page, not only the Team tab)
import '../screens/team.css';

const FIGS = [
  ['min', 'MIN', 'minutes'],
  ['pts', 'PTS', 'points'],
  ['reb', 'REB', 'rebounds'],
  ['ast', 'AST', 'assists'],
] as const;

/** Each player's per-game line: this season's once the team has played, else his latest season's. */
export function rosterLines(league: League, roster: Player[]): { lines: Map<number, PerGame | null>; current: boolean; any: boolean } {
  const current = roster.some((p) => (playerSeason(p, league.season)?.gp ?? 0) > 0);
  const lines = new Map(roster.map((p) => [p.pid, current ? playerSeason(p, league.season) : (latestLine(league, p)?.pg ?? null)]));
  return { lines, current, any: [...lines.values()].some(Boolean) };
}

/** A group's divider: its name, and the two columns' names over its rows (the figures under the name carry their own labels). */
function GroupHead({ label }: { label: string }) {
  return (
    <div className="tm-rl tm-rl-head">
      <span className="tm-rl-glabel">{label}</span>
      <span className="tm-rl-ovr" aria-hidden="true">
        OVR
      </span>
      <span className="tm-rl-pot" aria-hidden="true">
        POT
      </span>
    </div>
  );
}

/** A row's one mark, the most pressing first: out, else a 10-day deal (yours), else his development tag. */
function RowTag({ league, p, mine }: { league: League; p: Player; mine: boolean }) {
  if (p.injury)
    return (
      <span className="tag bad" title={injuryName(p.injury.type)}>
        Out {plural(p.injury.gamesRemaining, 'game')}
      </span>
    );
  const td = mine && p.contract.tenDay;
  if (td) {
    const left = tenDayLeft(league, p);
    return (
      <span className="tag warn" title={td.hardship ? 'Hardship 10-day' : undefined}>
        10-day · {left > 1 ? `${left} days left` : 'last day'}
      </span>
    );
  }
  const dev = devTag(league, p);
  return dev ? <DevTagChip tag={dev} /> : null;
}

/** One player's row: a link to his page. */
export function RosterRow({ league, p, line, mine }: { league: League; p: Player; line: PerGame | null; mine: boolean }) {
  return (
    <Link to={`/player/${p.pid}`} className="tm-rl tm-rl-row">
      <Avatar p={p} />
      <span className="tm-rl-name">
        <span className="ellipsis">
          {p.firstName} {p.lastName}
        </span>
        <RowTag league={league} p={p} mine={mine} />
      </span>
      <span className="tm-rl-ovr">
        <span className="sr-only">OVR </span>
        <Ovr v={p.ovr} size="sm" />
      </span>
      <span className={`tm-rl-pot num ${p.pot > p.ovr ? '' : 'dim'}`}>
        <span className="sr-only">potential </span>
        {p.pot}
      </span>
      <span className="tm-rl-line">
        <span className="tm-rl-meta">
          {p.pos} · {playerAge(p, league.season)}
          <span className="tm-rl-arch"> · {p.archetype}</span>
          {p.injury && <span className="sr-only">, {injuryName(p.injury.type)}</span>}
        </span>
        {line ? (
          FIGS.map(([k, short, unit]) => (
            <span key={k} className="tm-rl-fig">
              <b className="num">{f1(line[k])}</b>
              <span aria-hidden="true">{short}</span>
              <span className="sr-only"> {unit}</span>
            </span>
          ))
        ) : (
          <span className="tm-rl-none">No games yet</span>
        )}
      </span>
    </Link>
  );
}

/** Rows under one header (a team page's key players): no groups. */
export function RosterRows({ league, label, players, foot }: { league: League; label: string; players: Player[]; foot?: ReactNode }) {
  const { lines } = rosterLines(league, players);
  return (
    <div className="tm-rl-list">
      {/* one group, so its rows sit on hairlines rather than the list's gap between groups */}
      <div className="tm-rl-group">
        <GroupHead label={label} />
        {players.map((p) => (
          <RosterRow key={p.pid} league={league} p={p} line={lines.get(p.pid) ?? null} mine={p.tid === league.userTid} />
        ))}
      </div>
      {foot}
    </div>
  );
}

/** The whole roster in its groups, with the line under it that says what the figures are. */
export function RosterList({ league, roster }: { league: League; roster: Player[] }) {
  if (!roster.length) return <div className="card empty">No players on the roster.</div>;
  const mine = roster[0].tid === league.userTid;
  // the five who start the next game: an injured starter is listed with the bench until he's back
  const starters = startingFive(roster);
  const groups: [string, Player[]][] = [
    ['Starters', roster.filter((p) => starters.has(p.pid))],
    ['Bench', roster.filter((p) => !starters.has(p.pid) && !p.contract.twoWay)],
    ['Two-way', roster.filter((p) => !starters.has(p.pid) && p.contract.twoWay)],
  ];
  const { lines, current, any } = rosterLines(league, roster);
  return (
    <>
      <div className="tm-rl-list">
        {groups.map(([label, list]) =>
          list.length ? (
            <div key={label} className="tm-rl-group">
              <GroupHead label={label} />
              {list.map((p) => (
                <RosterRow key={p.pid} league={league} p={p} line={lines.get(p.pid) ?? null} mine={mine} />
              ))}
            </div>
          ) : null,
        )}
      </div>
      <div className="tm-foot row between wrap">
        <span>{current ? 'Per game this season.' : any ? 'Per game in each player’s latest season.' : 'No games played yet.'}</span>
        <OvrKey />
      </div>
    </>
  );
}
