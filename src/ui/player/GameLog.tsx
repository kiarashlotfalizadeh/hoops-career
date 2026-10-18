// A player's page, Games: this season's game log, newest first; a row opens the game's report.
import type { League, Player } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { neutralSite } from '../../core/league/games';
import { Empty, Section, StatTable, type Col } from '../components/ui';
import { f1, signed } from '../stats';

export function GameLog({ p, league, onOpen }: { p: Player; league: League; onOpen: (gid: number) => void }) {
  const rows = league.games
    .filter((g) => g.season === league.season)
    .map((g) => {
      const side = g.home.players.some((b) => b.pid === p.pid) ? 'home' : g.away.players.some((b) => b.pid === p.pid) ? 'away' : null;
      if (!side) return null;
      const box = (side === 'home' ? g.home : g.away).players.find((b) => b.pid === p.pid)!;
      if (!box.min) return null;
      const opp = side === 'home' ? g.away : g.home;
      const us = side === 'home' ? g.home : g.away;
      return { g, box, opp, won: us.pts > opp.pts, home: side === 'home' };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .reverse();
  if (!rows.length)
    return (
      <div className="card">
        <Empty>No games this season.</Empty>
      </div>
    );
  type R = (typeof rows)[number];
  const cols: Col<R>[] = [
    {
      key: 'opp',
      label: 'Opp',
      left: true,
      sticky: true,
      get: (r) => r.g.gid,
      fmt: (_, r) => (
        <span className="tm-log-opp">
          {/* the Cup final is on a neutral floor: nobody's home */}
          <span className={`tm-wl ${r.won ? 'w' : 'l'}`}>{r.won ? 'W' : 'L'}</span> {r.home || neutralSite(r.g) ? 'vs' : '@'} {league.teams[r.opp.tid].abbrev}
        </span>
      ),
    },
    { key: 'min', label: 'MIN', get: (r) => r.box.min, fmt: (v) => f1(v as number) },
    { key: 'pts', label: 'PTS', get: (r) => r.box.pts },
    { key: 'reb', label: 'REB', get: (r) => r.box.orb + r.box.drb },
    { key: 'ast', label: 'AST', get: (r) => r.box.ast },
    { key: 'fg', label: 'FG', get: (r) => r.box.fgm, fmt: (_, r) => `${r.box.fgm}-${r.box.fga}` },
    { key: '3p', label: '3P', get: (r) => r.box.tpm, fmt: (_, r) => `${r.box.tpm}-${r.box.tpa}` },
    { key: 'ft', label: 'FT', get: (r) => r.box.ftm, fmt: (_, r) => `${r.box.ftm}-${r.box.fta}` },
    { key: 'stl', label: 'STL', get: (r) => r.box.stl },
    { key: 'blk', label: 'BLK', get: (r) => r.box.blk },
    { key: 'tov', label: 'TOV', get: (r) => r.box.tov },
    { key: 'pm', label: '+/-', get: (r) => r.box.pm, fmt: (v) => signed(v as number, 0) },
  ];
  return (
    <Section title={`${seasonLabel(league.season)} · ${rows.length} game${rows.length === 1 ? '' : 's'}`}>
      <StatTable rows={rows} cols={cols} rowKey={(r) => r.g.gid} onRow={(r) => onOpen(r.g.gid)} />
    </Section>
  );
}
