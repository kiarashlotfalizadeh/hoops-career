// A roster as rows, the same for your team (Team → Roster) and any other (/teams/:tid): tonight's
// five, the bench, then the two-way deals. A row is the jersey, the name with what's wrong (out,
// a 10-day deal: dropping under a long name rather than cutting it), position and age, then aligned
// columns under one header per group: minutes, points, rebounds and assists a game, OVR and POT.
// Before anyone plays, each player's latest season stands in for this one's, and the line under the
// list says so.
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { playerAge } from '../../core/playerGen';
import { Avatar, Ovr } from '../components/ui';
import { OvrKey } from '../components/OvrKey';
import { f1, latestLine, playerSeason, startingFive, type PerGame } from '../stats';
import { tenDayLabel } from '../office/TenDayPanel';
import { injuryName, plural } from '../../core/format';
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

/** A group's divider, with the columns' names over its rows. */
function GroupHead({ label }: { label: string }) {
  return (
    <div className="list-divider tm-rl tm-rl-head">
      <span className="tm-rl-glabel">{label}</span>
      {FIGS.map(([k, short]) => (
        <span key={k} className="tm-rl-fig" aria-hidden="true">
          {short}
        </span>
      ))}
      <span className="tm-rl-ovr" aria-hidden="true">
        OVR
      </span>
      <span className="tm-rl-pot" aria-hidden="true">
        POT
      </span>
    </div>
  );
}

/** One player's row: a link to his page. */
export function RosterRow({ league, p, line, mine }: { league: League; p: Player; line: PerGame | null; mine: boolean }) {
  const ten = mine ? tenDayLabel(league, p) : null;
  return (
    <Link to={`/player/${p.pid}`} className="tm-rl tm-rl-row">
      <Avatar p={p} />
      <span className="tm-rl-name">
        <span className="ellipsis">
          {p.firstName} {p.lastName}
        </span>
        {p.injury && (
          <span className="tag bad" title={injuryName(p.injury.type)}>
            Out {plural(p.injury.gamesRemaining, 'game')}
          </span>
        )}
        {ten && <span className="tag warn">{ten}</span>}
      </span>
      <span className="tm-rl-meta">
        {p.pos} · {playerAge(p, league.season)}
        <span className="tm-rl-arch"> · {p.archetype}</span>
        {p.injury && <span className="sr-only">, {injuryName(p.injury.type)}</span>}
      </span>
      {FIGS.map(([k, , unit]) => (
        <span key={k} className="tm-rl-fig num">
          {line ? f1(line[k]) : '—'}
          <span className="sr-only"> {unit}</span>
        </span>
      ))}
      <span className="tm-rl-ovr">
        <span className="sr-only">OVR </span>
        <Ovr v={p.ovr} size="sm" />
      </span>
      <span className={`tm-rl-pot num ${p.pot > p.ovr ? '' : 'dim'}`}>
        <span className="sr-only">potential </span>
        {p.pot}
      </span>
    </Link>
  );
}

/** Rows under one header (a team page's key players): no groups. */
export function RosterRows({ league, label, players, foot }: { league: League; label: string; players: Player[]; foot?: ReactNode }) {
  const { lines } = rosterLines(league, players);
  return (
    <div className="card flush list">
      <GroupHead label={label} />
      {players.map((p) => (
        <RosterRow key={p.pid} league={league} p={p} line={lines.get(p.pid) ?? null} mine={p.tid === league.userTid} />
      ))}
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
      <div className="card flush list">
        {groups.map(([label, list]) =>
          list.length ? (
            <Fragment key={label}>
              <GroupHead label={label} />
              {list.map((p) => (
                <RosterRow key={p.pid} league={league} p={p} line={lines.get(p.pid) ?? null} mine={mine} />
              ))}
            </Fragment>
          ) : null,
        )}
      </div>
      <div className="tm-foot row between wrap">
        <span>{current ? 'Per game this season.' : any ? 'No games yet: each player’s latest season, per game.' : 'No games played yet.'}</span>
        <OvrKey />
      </div>
    </>
  );
}
