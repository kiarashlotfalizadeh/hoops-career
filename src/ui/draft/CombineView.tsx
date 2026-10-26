// The combine: every invitee's measurements and drills in one sortable table, once it's held in May.
import type { CombineResults, League, Player } from '../../core/types';
import { combineDay, combineIn, seenRange } from '../../core/league/prospects';
import { fmtDate } from '../../core/league/helpers';
import { Empty, Ovr, Section, StatTable, type Col } from '../components/ui';
import { fmtIn } from './common';

export function CombineView({ league, list, onOpen }: { league: League; list: Player[]; onOpen: (pid: number) => void }) {
  if (list.length && !combineIn(league)) return <Empty>The combine is held on {fmtDate(league.season, combineDay(league.season))}.</Empty>;
  // the staff's read, as on the board (rows and sorts alike)
  const read = new Map(list.map((p) => [p.pid, seenRange(league, p)]));
  const c = (p: Player): Partial<CombineResults> => p.prospect?.combine ?? {};
  // a missing result sorts last either way, also in the columns where lower is better
  const num = (x: number | undefined) => (x === undefined ? NaN : x);
  const fmt = (show: (v: number) => string) => (v: number | string) => (Number.isFinite(v) ? show(Number(v)) : '—');
  const cols: Col<Player>[] = [
    { key: 'name', label: 'Prospect', left: true, sticky: true, get: (p) => p.lastName, fmt: (_v, p) => <span className="bold">{`${p.firstName[0]}. ${p.lastName}`}</span> },
    { key: 'rk', label: 'Rank', help: "The scouts' board, as on the Board tab", asc: true, get: (p) => p.prospect?.rank ?? 99 },
    { key: 'pos', label: 'Pos', get: (p) => p.pos },
    { key: 'ovr', label: 'OVR', help: "Your staff's read", get: (p) => read.get(p.pid)?.ovr ?? p.ovr, fmt: (v) => <Ovr v={Number(v)} size="sm" /> },
    { key: 'pot', label: 'POT', help: "Your staff's read of his ceiling (the middle of its range)", get: (p) => read.get(p.pid)?.pot ?? p.pot },
    { key: 'hgt', label: 'Height', help: 'Height without shoes', get: (p) => num(c(p).heightNoShoes), fmt: (_v, p) => fmtIn(c(p).heightNoShoes) },
    { key: 'wing', label: 'Wingspan', get: (p) => num(c(p).wingspan), fmt: (_v, p) => fmtIn(c(p).wingspan) },
    { key: 'reach', label: 'Reach', help: 'Standing reach', get: (p) => num(c(p).standingReach), fmt: (_v, p) => fmtIn(c(p).standingReach) },
    { key: 'wt', label: 'Wt', help: 'Weight (lb)', get: (p) => num(c(p).weight) },
    { key: 'vert', label: 'Vert', help: 'Max vertical (in)', get: (p) => num(c(p).maxVert), fmt: fmt((v) => `${v.toFixed(1)}"`) },
    { key: 'lane', label: 'Lane', help: 'Lane agility (s, lower is better)', asc: true, get: (p) => num(c(p).laneAgility), fmt: fmt((v) => v.toFixed(2)) },
    { key: 'sprint', label: '¾ Sprint', help: '3/4 court sprint (s, lower is better)', asc: true, get: (p) => num(c(p).sprint), fmt: fmt((v) => v.toFixed(2)) },
    { key: 'shoot', label: 'Shoot', help: 'Shooting drill makes out of 25', get: (p) => num(c(p).shootingDrill), fmt: fmt((v) => `${v}/25`) },
  ];
  if (!list.length) return <Empty>No combine results for this class.</Empty>;
  return (
    <Section title={`${league.season} combine`} right={<span className="tiny dim">{list.length} invitees</span>}>
      <StatTable rows={list} cols={cols} rowKey={(p) => p.pid} onRow={(p) => onOpen(p.pid)} maxHeight={560} />
      <div className="tiny dim">Lane and sprint: lower is better. Tap a column to sort, a row for his report.</div>
    </Section>
  );
}
