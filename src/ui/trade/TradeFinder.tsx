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
import { Card, Chips, Empty, Help } from '../components/ui';
import { Callout, OvrPot, capSeason, contractYearsLabel, fmtM, isOffseason } from '../office/common';
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

/** A compact drop-down for one filter (the League screens' select). */
function Pick<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <select
      className="lg-select"
      aria-label={label}
      value={String(value)}
      onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}
      style={{ width: '100%', minWidth: 0, padding: '0 24px 0 10px', backgroundPosition: 'right 8px center', textOverflow: 'ellipsis' }}
    >
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
      <Card
        title={<h3>Find a player</h3>}
        right={
          <Help title="Trade finder">
            <p style={{ margin: 0 }}>Every player on another team who can be traded right now. Tap one to open the trade builder with his team and see what they'd ask for him.</p>
            <p style={{ margin: 0 }}>
              <b>Value tiers</b> rank each player's league-neutral trade value (ability, age, potential and contract) among everyone on a roster: Franchise (about one for every two
              teams), All-Star, Starter, Rotation and Depth. Negative value is a contract worth less than nothing.
            </p>
            <p style={{ margin: 0 }}>
              <b>On the block</b>: his team looks ready to move him (he asked for a trade, his contract is a burden, or he's a rebuilding team's veteran). <b>Cornerstone</b>: a
              young star his team builds around, so expect a steep price.
            </p>
            <p style={{ margin: 0 }}>
              <b>Salary you can match</b> is the most you could take back sending up to two of your own tradeable contracts: 125% of them plus $0.1M, or what fits under the cap
              after they leave.
            </p>
          </Help>
        }
      >
        <div className="col" style={{ gap: 8 }}>
          <Chips
            label="Position"
            value={state.pos}
            onChange={(pos) => set({ pos })}
            options={[{ id: 'all' as const, label: 'All' }, ...POSITIONS.map((p) => ({ id: p, label: p }))]}
          />
          {/* two compact rows of drop-downs, so the list starts on the first screen of a phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6 }}>
            <Pick
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
            <Pick
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
            <button className={`chip ${state.available ? 'on' : ''}`} aria-pressed={state.available} onClick={() => set({ available: !state.available })}>
              On the block
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
            <Pick
              label="Maximum salary"
              value={state.salary === 'match' ? MATCH : state.salary}
              onChange={(v) => set({ salary: v === MATCH ? 'match' : v })}
              options={[
                [MATCH, `≤ ${fmtM(data.match)}: you can match`],
                [25_000, 'Salary ≤ $25M'],
                [10_000, 'Salary ≤ $10M'],
                [ANY, 'Any salary'],
              ]}
            />
            <Pick
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
        </div>
      </Card>

      {rows.length === 0 ? (
        <Empty>{data.rows.length === 0 ? 'Nobody can be traded right now.' : 'No players match these filters.'}</Empty>
      ) : (
        <Card className="flush">
          <div className="tiny dim" style={{ padding: '10px 12px 6px' }}>
            {rows.length} player{rows.length === 1 ? '' : 's'} · tap one to hear their ask
          </div>
          <div className="list wide2">
            {rows.slice(0, limit).map(({ p, age, tier, avail, salary }) => (
              <button key={p.pid} className="fo-prow" onClick={() => onPick(p.pid)}>
                <OvrPot p={p} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <TeamLogo tid={p.tid} size={16} decorative />
                    <span className="fo-name">{playerName(p)}</span>
                    {p.injury && <span className="tag bad">INJ</span>}
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
            <button className="btn ghost block" style={{ borderRadius: 0, borderInline: 0, borderBottom: 0 }} onClick={() => setLimit(limit + PAGE)}>
              Show more ({rows.length - limit} left)
            </button>
          )}
        </Card>
      )}
      {data.locked > 0 && (
        <div className="tiny dim" style={{ padding: '0 4px' }}>
          {data.locked} more can't be traded right now ({isOffseason(league) ? 'expiring contracts, undecided options and recent signings' : 'recent signings'}).
        </div>
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
      <div className="row top" style={{ gap: 8 }}>
        <div className="grow">
          <b>
            Their ask for {p ? playerName(p) : 'him'}
            {': '}
          </b>
          {!r
            ? 'trading is closed, but you can plan the deal.'
            : r.offer
              ? `${asked(r.offer).join(' + ') || 'nothing more'}. It's loaded below: change it, or propose it as is.`
              : r.why === 'salary'
                ? `no player (or pair) of yours matches his salary, so ${abbr} can't take it back.`
                : `${abbr} can't find a package of yours they'd take for him.`}
        </div>
        <button className="iconbtn" style={{ margin: '-6px -6px 0 0' }} aria-label="Dismiss their ask" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </Callout>
  );
}
