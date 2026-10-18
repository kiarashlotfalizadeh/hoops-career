// The lineup lab: your five-man units, the trios and pairs inside them and each player's on/off
// split, this season or last, sorted and filtered; a five-man unit can become the starters or the
// closers. Opened from the Rotation screen, where its edits show.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { LOW_SAMPLE_POSS, lineupUnits, netSE, onOffSplits, unitToClosers, unitToStarters, type LineupAgg, type OnOff } from '../../core/analysis/lineups';
import { sortByPosition } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { seasonLabel } from '../../core/constants';
import type { Player } from '../../core/types';
import { Avatar, Chips, Empty, Help, More, Ovr, PageHeader, Section, Segmented, Sheet, Statline, Tag, activateOnKey } from '../components/ui';
import { f1, rosterNames, signed, startingFive } from '../stats';
import '../league/league.css';
import './team.css';

type View = '5' | '3' | '2' | 'onoff';
type Sort = 'min' | 'net' | 'ortg' | 'drtg';

/** Minimum minutes: a unit's minutes together, or a player's season minutes for on/off. */
const MIN_UNIT = [0, 10, 25, 50, 100];
const MIN_PLAYER = [0, 100, 250, 500, 1000];

const PAGE = 30;

const lowUnit = (u: LineupAgg) => u.poss < LOW_SAMPLE_POSS;
const lowSplit = (r: OnOff) => Math.min(r.on.poss, r.off.poss) < LOW_SAMPLE_POSS;

const UNIT_SORT: Record<Sort, (a: LineupAgg, b: LineupAgg) => number> = {
  min: (a, b) => b.min - a.min,
  net: (a, b) => b.net - a.net,
  ortg: (a, b) => b.ortg - a.ortg,
  drtg: (a, b) => a.drtg - b.drtg,
};
// on/off sorts by the difference his minutes make: on minus off
const SPLIT_SORT: Record<Sort, (a: OnOff, b: OnOff) => number> = {
  min: (a, b) => b.min - a.min,
  net: (a, b) => b.diff - a.diff,
  ortg: (a, b) => b.on.ortg - b.off.ortg - (a.on.ortg - a.off.ortg),
  drtg: (a, b) => a.on.drtg - a.off.drtg - (b.on.drtg - b.off.drtg),
};

const Net = ({ v }: { v: number }) => <span className={`tm-net num ${v >= 0 ? 'good' : 'bad'}`}>{signed(v)}</span>;

export default function Lineups() {
  const league = useLeague();
  const tid = league.userTid;
  const team = league.teams[tid];
  const advanced = true;
  const [view, setView] = useState<View>('5');
  const [season, setSeason] = useState(league.season);
  const [sort, setSort] = useState<Sort>('min');
  const [minIx, setMinIx] = useState(1);
  const [only, setOnly] = useState<number | null>(null);
  const [pick, setPick] = useState<LineupAgg | null>(null);
  // a season of trios runs to hundreds: the first rows, then more on request
  const [limit, setLimit] = useState(PAGE);
  const roster = useLeagueMemo(() => rosterSorted(league, tid), [league, tid]);
  // last season counts when this team has numbers from it (lineups or a season line)
  const hasLast = useLeagueMemo(
    () => team.seasons.some((s) => s.season === league.season - 1 && s.poss > 0) || league.games.some((g) => g.season === league.season - 1 && g.lineups),
    [league, team],
  );
  const units = useLeagueMemo(() => (view === 'onoff' ? [] : lineupUnits(league, tid, Number(view) as 2 | 3 | 5, season)), [league, tid, view, season]);
  const splits = useLeagueMemo(() => (view === 'onoff' ? onOffSplits(league, tid, season) : []), [league, tid, view, season]);
  // everyone in the numbers, traded or released since included, named as they were
  const people = useMemo(() => {
    const pids = new Set([...units.flatMap((u) => u.pids), ...splits.map((r) => r.pid)]);
    return [...pids].map((pid) => league.players[pid]).filter((p): p is Player => !!p);
  }, [units, splits, league]);
  const name = useMemo(() => rosterNames(people), [people]);
  const fullName = useMemo(() => rosterNames(people, { initial: true }), [people]);
  const thresholds = view === 'onoff' ? MIN_PLAYER : MIN_UNIT;
  const minMin = thresholds[minIx];
  const sortBy: Sort = advanced || sort === 'min' || sort === 'net' ? sort : 'min';
  const shownUnits = units.filter((u) => u.min >= minMin && (only === null || u.pids.includes(only))).sort(UNIT_SORT[sortBy]);
  const shownSplits = splits.filter((r) => r.min >= minMin && (only === null || r.pid === only)).sort(SPLIT_SORT[sortBy]);
  // the filter lists who is in this view's numbers, most minutes first
  const filterPeople = useMemo(() => {
    const min = new Map<number, number>();
    for (const u of units) for (const pid of u.pids) min.set(pid, (min.get(pid) ?? 0) + u.min);
    for (const r of splits) min.set(r.pid, r.min);
    return [...min.entries()].sort((a, b) => b[1] - a[1]).map(([pid]) => pid);
  }, [units, splits]);
  const starters = useMemo(() => startingFive(roster), [roster]);
  const closers = new Set(team.rotation.closers);
  const sameSet = (pids: number[], set: Set<number>) => pids.length === set.size && pids.every((pid) => set.has(pid));
  const ordered = (pids: number[]) => {
    const ps = pids.map((pid) => league.players[pid]).filter((p): p is Player => !!p);
    return ps.length === pids.length ? sortByPosition(ps).map((p) => p.pid) : pids;
  };

  const views: { id: View; label: string }[] = [
    { id: '5', label: '5-man' },
    ...(advanced
      ? [
          { id: '3' as View, label: '3-man' },
          { id: '2' as View, label: '2-man' },
        ]
      : []),
    { id: 'onoff', label: 'On-off' },
  ];
  const lowCount = view === 'onoff' ? shownSplits.filter(lowSplit).length : shownUnits.filter(lowUnit).length;
  const rows = view === 'onoff' ? shownSplits.length : shownUnits.length;
  const any = view === 'onoff' ? splits.length > 0 : units.length > 0;

  return (
    <main className="page">
      <PageHeader title="Lineups" back backTo="/rotation" sub={`${team.region} ${team.name} · ${seasonLabel(season)}${view === 'onoff' ? ' regular season' : ''}`} />
      <div className="tm-tabs">
        <Segmented
          tabs
          value={view}
          onChange={(v) => {
            setView(v);
            setOnly(null);
            setLimit(PAGE);
          }}
          label="Lineup view"
          options={views}
        />
      </div>
      <div className="tm-filters">
        <div className="tm-frow">
          <span className="over">Sort</span>
          <Chips
            label="Sort by"
            value={sortBy}
            onChange={setSort}
            options={[
              { id: 'min' as Sort, label: 'Minutes' },
              { id: 'net' as Sort, label: view === 'onoff' ? 'On-off' : 'Net' },
              ...(advanced
                ? [
                    { id: 'ortg' as Sort, label: 'ORtg' },
                    { id: 'drtg' as Sort, label: 'DRtg' },
                  ]
                : []),
            ]}
          />
        </div>
        <div className="tm-frow">
          <span className="over">Min</span>
          <Chips label="Minimum minutes" value={minIx} onChange={setMinIx} options={thresholds.map((m, i) => ({ id: i, label: m ? `${m}+` : 'All' }))} />
        </div>
        {(hasLast || filterPeople.length > 0) && (
          <div className="tm-frow">
            <span className="over">Show</span>
            <div className="tm-frow-r">
              {hasLast && (
                <Chips
                  label="Season"
                  value={season}
                  onChange={(s) => {
                    setSeason(s);
                    setOnly(null);
                    setLimit(PAGE);
                  }}
                  options={[
                    { id: league.season, label: 'This season' },
                    { id: league.season - 1, label: 'Last season' },
                  ]}
                />
              )}
              {filterPeople.length > 0 && (
                <select
                  className="lg-select tm-select"
                  aria-label={view === 'onoff' ? 'Show one player' : 'Show lineups with a player'}
                  value={only ?? ''}
                  onChange={(e) => setOnly(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{view === 'onoff' ? 'All players' : 'With anyone'}</option>
                  {filterPeople.map((pid) => (
                    <option key={pid} value={pid}>
                      {view === 'onoff' ? '' : 'With '}
                      {fullName(pid)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </div>

      {!any ? (
        <div className="card">
          <Empty>
            {view === 'onoff'
              ? `No on-off numbers for the ${team.name} ${season === league.season ? 'yet this season' : 'last season'}: they come from regular-season games.`
              : season === league.season
                ? 'No lineup data yet: lineups are tracked in your games, from the first one this season.'
                : `No lineups kept for the ${team.name} last season (only your own games keep them).`}
          </Empty>
        </div>
      ) : !rows ? (
        <div className="card">
          <Empty>
            Nothing with {minMin}+ minutes{only !== null ? ` and ${fullName(only)}` : ''}. Lower the minimum to see more.
          </Empty>
        </div>
      ) : (
        <Section
          title={
            <h3>
              {view === 'onoff' ? 'On the floor vs off it' : view === '5' ? 'Five-man units' : view === '3' ? 'Trios' : 'Pairs'} · {rows}
              <Help title={view === 'onoff' ? 'On-off' : 'Lineup ratings'}>
                {view === 'onoff' ? (
                  <p>
                    The team's net rating (points scored minus allowed per 100 possessions) with each player on the floor, against the rest of its regular season with him off it.
                    The big number is the difference. Starters share the floor with the best teammates, so their numbers lean on who they play with.
                  </p>
                ) : (
                  <p>
                    Points scored (ORtg) and allowed (DRtg) per 100 of the unit's own possessions while those players shared the floor; net is the difference.{' '}
                    {view !== '5' && 'Trios and pairs count every five-man stint they were part of.'}
                  </p>
                )}
                <p>
                  Faded rows have fewer than {LOW_SAMPLE_POSS} possessions{view === 'onoff' ? ' on or off the floor' : ''}: over that few, a net rating can swing ±16 or more by
                  chance.
                </p>
              </Help>
            </h3>
          }
        >
          {view === '5' && <div className="tm-foot tm-hint">Tap a five to make it your starters or closers.</div>}
          <div className="card flush">
            <div className="list">
              {view === 'onoff'
                ? shownSplits.slice(0, limit).map((r) => {
                    const p = league.players[r.pid];
                    return (
                      <div key={r.pid} className={`listrow tm-lurow ${lowSplit(r) ? 'lu-faded' : ''}`}>
                        {p && <Avatar p={p} />}
                        <div className="grow">
                          <div className="tm-lu-who ellipsis">{fullName(r.pid)}</div>
                          <div className="lr-meta num">
                            {Math.round(r.min)}m · on {signed(r.on.net)} · off {signed(r.off.net)}
                          </div>
                          {advanced && (
                            <div className="lr-meta num">
                              ORtg {f1(r.on.ortg)} ({signed(r.on.ortg - r.off.ortg)}) · DRtg {f1(r.on.drtg)} ({signed(r.on.drtg - r.off.drtg)})
                            </div>
                          )}
                        </div>
                        <Net v={r.diff} />
                      </div>
                    );
                  })
                : shownUnits.slice(0, limit).map((u) => {
                    const five = view === '5';
                    const open = () => setPick(u);
                    return (
                      <div
                        key={u.key}
                        className={`listrow tm-lurow ${five ? 'clickable' : ''} ${lowUnit(u) ? 'lu-faded' : ''}`}
                        {...(five
                          ? {
                              role: 'button',
                              tabIndex: 0,
                              onClick: open,
                              onKeyDown: activateOnKey(open),
                              // named by what it shows: the five, then minutes, possessions and net
                              'aria-haspopup': 'dialog' as const,
                            }
                          : {})}
                      >
                        <div className="grow">
                          <div className="tm-lu-who">
                            {ordered(u.pids)
                              .map((pid) => name(pid) || '?')
                              .join(', ')}
                          </div>
                          <div className="tm-lu-meta lr-meta num">
                            <span>
                              {Math.round(u.min)}m · {u.poss} poss
                            </span>
                            {advanced && (
                              <span>
                                ORtg {f1(u.ortg)} · DRtg {f1(u.drtg)}
                              </span>
                            )}
                            {five && season === league.season && sameSet(u.pids, starters) && <Tag tone="info">Starters</Tag>}
                            {five && season === league.season && sameSet(u.pids, closers) && <Tag>Closers</Tag>}
                          </div>
                        </div>
                        <Net v={u.net} />
                        {five && <ChevronRight size={16} className="dim tm-lu-chev" aria-hidden="true" />}
                      </div>
                    );
                  })}
            </div>
            {rows > limit && (
              <div className="tm-lu-more">
                <button className="btn sm block ghost" onClick={() => setLimit((n) => n + PAGE * 3)}>
                  Show {Math.min(rows - limit, PAGE * 3)} more
                </button>
              </div>
            )}
          </div>
          {lowCount > 0 && (
            <div className="tm-foot">
              Faded: {lowCount === rows ? 'all of these have' : `${lowCount} ha${lowCount === 1 ? 's' : 've'}`} under {LOW_SAMPLE_POSS} possessions
              {view === 'onoff' ? ' on or off the floor' : ''}, too few to trust.
            </div>
          )}
        </Section>
      )}

      <Sheet open={!!pick} onClose={() => setPick(null)} title="Five-man unit">
        {pick && <UnitSheet u={pick} roster={roster} close={() => setPick(null)} starters={starters} closers={closers} name={fullName} order={ordered} />}
      </Sheet>
    </main>
  );
}

function UnitSheet({
  u,
  roster,
  close,
  starters,
  closers,
  name,
  order,
}: {
  u: LineupAgg;
  roster: Player[];
  close: () => void;
  starters: Set<number>;
  closers: Set<number>;
  name: (pid: number) => string;
  order: (pids: number[]) => number[];
}) {
  const league = useLeague();
  const onTeam = new Set(roster.map((p) => p.pid));
  const gone = u.pids.filter((pid) => !onTeam.has(pid));
  const hurt = u.pids.filter((pid) => onTeam.has(pid) && league.players[pid]?.injury);
  const isStarters = u.pids.every((pid) => starters.has(pid));
  const isClosers = u.pids.length === closers.size && u.pids.every((pid) => closers.has(pid));
  const names = (pids: number[]) => pids.map(name).join(' and ');
  const why = gone.length ? `${names(gone)} ${gone.length === 1 ? 'is' : 'are'} no longer on the team.` : null;
  const act = (kind: 'starters' | 'closers') => {
    useStore.getState().mutate((l) => {
      const r = l.teams[l.userTid].rotation;
      const players = rosterSorted(l, l.userTid);
      if (kind === 'starters') unitToStarters(r, players, u.pids);
      else unitToClosers(r, players, u.pids);
    });
    useStore.getState().toast(kind === 'starters' ? 'These five now start' : 'These five now close games', 'good');
    close();
  };
  const se = netSE(u.poss);
  return (
    <div className="tm-ed">
      <div className="card flush list">
        {order(u.pids).map((pid) => {
          const p = league.players[pid];
          if (!p) return null;
          return (
            <div key={pid} className="listrow tm-unit-p">
              <Avatar p={p} />
              <div className="grow">
                <div className="lr-name ellipsis">{name(pid)}</div>
                <div className="lr-meta">{p.pos}</div>
              </div>
              {!onTeam.has(pid) ? <Tag>Gone</Tag> : p.injury ? <Tag tone="bad">Out</Tag> : null}
              <Ovr v={p.ovr} size="sm" />
            </div>
          );
        })}
      </div>
      <Statline
        items={[
          { k: 'Net', v: signed(u.net), s: Number.isFinite(se) ? `± ${f1(se)}` : undefined, color: u.net >= 0 ? 'var(--good)' : 'var(--bad)' },
          { k: 'ORtg', v: f1(u.ortg) },
          { k: 'DRtg', v: f1(u.drtg) },
          { k: 'Minutes', v: Math.round(u.min), s: `${u.poss} poss` },
        ]}
      />
      <div className="tm-foot">{u.poss < LOW_SAMPLE_POSS ? 'A small sample: the ratings can swing a lot by chance.' : `The net rating's 95% range is about ± ${f1(2 * se)}.`}</div>
      <div className="col" style={{ gap: 8 }}>
        <button className="btn primary block" disabled={!!why || hurt.length > 0 || isStarters} onClick={() => act('starters')}>
          {isStarters ? 'Your starters' : 'Make these the starters'}
        </button>
        <button className="btn block" disabled={!!why || isClosers} onClick={() => act('closers')}>
          {isClosers ? 'Your closers' : 'Make these the closers'}
        </button>
        {(why || hurt.length > 0) && (
          <div className="tm-why-line">
            {why ?? `${names(hurt)} ${hurt.length === 1 ? 'is' : 'are'} injured: this five can start once ${hurt.length === 1 ? 'he is' : 'they are'} back.`}
          </div>
        )}
      </div>
      <div className="row between top tm-sheet-foot">
        <More label="What changes">
          <p className="tm-more-p">
            Starters swap into the first five spots on your depth chart and take those spots’ minutes, as a swap on the Rotation screen does. Either one makes your rotation custom.
          </p>
        </More>
        <Link to="/rotation" className="card-link" onClick={close}>
          Open Rotation <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
