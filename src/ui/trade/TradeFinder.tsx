// Trade finder: everyone AI teams could trade right now, filtered by position, OVR, age and the
// salary you can take back, with each player's value tier and whether his team looks ready to
// move him. Tapping one opens the builder with that team and asks what they'd want for him.
import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import type { League, Pos } from '../../core/types';
import { POSITIONS } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { withHoldsMemo } from '../../core/league/freeAgency';
import { filterTargets, maxTakeBack, pickLabel, tradeTargets, type TradeOffer, type WorkResult } from '../../core/league/trades';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Chips, Empty, Section } from '../components/ui';
import { Callout, HelpSheet, OvrPot, capSeason, contractYearsLabel, fmtM, isOffseason } from '../office/common';
import { TierLine } from './common';

export interface FinderState {
  pos: 'all' | Pos;
  minOvr: number;
  maxAge: number;
  /** $K, or what you can take back right now (see maxTakeBack) */
  salary: number | 'match';
  available: boolean;
  sort: 'value' | 'ovr' | 'salary';
}

export const FINDER_DEFAULT: FinderState = { pos: 'all', minOvr: 0, maxAge: 99, salary: 'match', available: false, sort: 'value' };

const PAGE = 40;
const ANY = 1e9;
const MATCH = -1;

/** A compact drop-down for one filter. */
export function FilterSelect<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <select className="fo-select" aria-label={label} value={String(value)} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}>
      {options.map(([v, text]) => (
        <option key={String(v)} value={String(v)}>
          {text}
        </option>
      ))}
    </select>
  );
}

export function TradeFinder({ league, state, onChange, onPick }: { league: League; state: FinderState; onChange: (s: FinderState) => void; onPick: (pid: number) => void }) {
  const [limit, setLimit] = useState(PAGE);
  const set = (patch: Partial<FinderState>) => {
    onChange({ ...state, ...patch });
    setLimit(PAGE);
  };
  const s = capSeason(league);
  // every AI team's tradeable players, once per league change (filtering and sorting is cheap)
  const data = useLeagueMemo(
    () =>
      withHoldsMemo(() => {
        const rows = tradeTargets(league);
        const all = Object.values(league.players).filter((p) => p.tid >= 0 && p.tid !== league.userTid).length;
        return { rows, locked: all - rows.length, match: maxTakeBack(league, league.userTid) };
      }),
    [league],
  );
  const maxSalary = state.salary === 'match' ? data.match : state.salary;
  const rows = filterTargets(data.rows, { pos: state.pos, minOvr: state.minOvr, maxAge: state.maxAge, maxSalary, available: state.available, sort: state.sort });

  return (
    <>
      <Section
        title="Find a player"
        right={
          <HelpSheet title="Trade finder">
            <p>Every player on another team who can be traded now. Tap one to open the builder with his team and hear their ask.</p>
            <p>
              <b>Value tiers</b> rank league-neutral trade value (ability, age, potential, contract) among everyone on a roster: Franchise (about one for every two teams),
              All-Star, Starter, Rotation and Depth. Negative is a contract worth less than nothing.
            </p>
            <p>
              <b>On the block</b>: his team looks ready to move him (he asked out, his contract is a burden, or he's a rebuilder's veteran). <b>Cornerstone</b>: a young star his
              team builds around; expect a steep price.
            </p>
            <p>
              <b>Salary you can match</b>: the most you could take back sending up to two of your tradeable contracts (125% of them plus $0.1M, or what fits under the cap after
              they leave).
            </p>
          </HelpSheet>
        }
      >
        <div className="fo-filters">
          <div className="hscroll">
            <Chips
              label="Position"
              value={state.pos}
              onChange={(pos) => set({ pos })}
              options={[{ id: 'all' as const, label: 'All' }, ...POSITIONS.map((p) => ({ id: p, label: p }))]}
            />
          </div>
          <div className="fo-selects">
            <FilterSelect
              label="Minimum OVR"
              value={state.minOvr}
              onChange={(minOvr) => set({ minOvr })}
              options={[
                [0, 'Any OVR'],
                [70, '70+ OVR'],
                [75, '75+ OVR'],
                [80, '80+ OVR'],
                [85, '85+ OVR'],
              ]}
            />
            <FilterSelect
              label="Maximum age"
              value={state.maxAge}
              onChange={(maxAge) => set({ maxAge })}
              options={[
                [99, 'Any age'],
                [24, 'Age ≤ 24'],
                [27, 'Age ≤ 27'],
                [30, 'Age ≤ 30'],
              ]}
            />
            <FilterSelect
              label="Maximum salary"
              value={state.salary === 'match' ? MATCH : state.salary}
              onChange={(v) => set({ salary: v === MATCH ? 'match' : v })}
              options={[
                [MATCH, `≤ ${fmtM(data.match)} (you can match)`],
                [25_000, 'Salary ≤ $25M'],
                [10_000, 'Salary ≤ $10M'],
                [ANY, 'Any salary'],
              ]}
            />
            <FilterSelect
              label="Sort by"
              value={state.sort}
              onChange={(sort) => set({ sort })}
              options={[
                ['value', 'Sort: value'],
                ['ovr', 'Sort: OVR'],
                ['salary', 'Sort: salary'],
              ]}
            />
          </div>
          <div className="chips">
            <button className={`chip ${state.available ? 'on' : ''}`} aria-pressed={state.available} onClick={() => set({ available: !state.available })}>
              On the block
            </button>
          </div>
        </div>
      </Section>

      {rows.length === 0 ? (
        <Empty>{data.rows.length === 0 ? 'Nobody can be traded right now.' : 'No players match these filters.'}</Empty>
      ) : (
        <Section title={`${rows.length} player${rows.length === 1 ? '' : 's'}`} right={<span className="tiny dim">Tap one to hear their ask</span>}>
          <div className="card flush">
            <div className="list wide2">
              {rows.slice(0, limit).map(({ p, age, tier, avail, salary }) => (
                <button key={p.pid} className="fo-prow" onClick={() => onPick(p.pid)}>
                  <OvrPot p={p} />
                  <div className="grow">
                    <div className="fo-prow-name">
                      <TeamLogo tid={p.tid} size={16} decorative />
                      <span className="fo-name">{playerName(p)}</span>
                      {p.injury && <span className="fo-flag bad">INJ</span>}
                    </div>
                    <div className="fo-meta">
                      {league.teams[p.tid].abbrev} · {p.pos} · {age} · {p.archetype}
                    </div>
                    <TierLine tier={tier} avail={avail} />
                  </div>
                  <div className="fo-money">
                    <div className="a">{p.contract.twoWay ? 'Two-way' : fmtM(salary)}</div>
                    <div className="b">{contractYearsLabel(league, p, s)}</div>
                  </div>
                </button>
              ))}
            </div>
            {rows.length > limit && (
              <button className="btn ghost block fo-more-btn" onClick={() => setLimit(limit + PAGE)}>
                Show more ({rows.length - limit} left)
              </button>
            )}
          </div>
          {data.locked > 0 && (
            <div className="tiny dim">
              {data.locked} more can't be traded now ({isOffseason(league) ? 'expiring contracts, undecided options and recent signings' : 'recent signings'}).
            </div>
          )}
        </Section>
      )}
    </>
  );
}

/** What an AI team asked for a player picked in the finder: the package "what would make this work?" found, loaded in the builder, or why there isn't one. */
export interface Ask {
  tid: number;
  pid: number;
  result: WorkResult | null;
}

export function AskCallout({ league, ask, onClose }: { league: League; ask: Ask; onClose: () => void }) {
  const p = league.players[ask.pid];
  const abbr = league.teams[ask.tid].abbrev;
  const r = ask.result;
  const asked = (o: TradeOffer) => [
    ...o.a.pids.map((pid) => playerName(league.players[pid])),
    ...o.a.dpids.map((d) => {
      const dp = league.draftPicks.find((x) => x.dpid === d);
      return dp ? pickLabel(league, dp) : 'a pick';
    }),
  ];
  return (
    <Callout tone={r?.offer ? undefined : 'warn'} icon={<MessageSquare size={18} className={r?.offer ? 'dim' : 'warn'} />}>
      <div className="row top">
        <div className="grow">
          <b>
            {abbr}'s ask for {p ? playerName(p) : 'him'}
            {': '}
          </b>
          {!r
            ? 'trading is closed, but you can plan the deal.'
            : r.offer
              ? `${asked(r.offer).join(' + ') || 'nothing more'}. Loaded below: change it or propose it.`
              : r.why === 'salary'
                ? `no player (or pair) of yours matches his salary, so ${abbr} can't take it back.`
                : `${abbr} can't find a package of yours they'd take for him.`}
        </div>
        <button className="iconbtn fo-ask-x" aria-label="Dismiss their ask" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </Callout>
  );
}
