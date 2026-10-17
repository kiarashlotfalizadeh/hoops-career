import { useState } from 'react';
import type { GameType, League } from '../../core/types';
import { GAME } from '../../core/constants';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { marginWords, wpSeries, wpText } from '../../core/analysis/winProb';
import { Card, Chips, Segmented } from '../components/ui';
import { FlowChart, ShotChart, WinProbChart } from '../components/charts';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { fmtClock, periodLabel, wholeMinutes } from '../stats';
import type { Drawn } from './drawn';

type Tab = 'box' | 'team' | 'shots' | 'flow';

/**
 * The live box score as the court has drawn it: players, team totals by period, the shots (by team,
 * period and player) and the flow: your chance to win so far (`wp`, when it's on) and the score margin.
 */
export function BoxPanel({
  view,
  flow,
  flowPeriods,
  side,
  league,
  nameOf,
  colors,
  flowColors,
  wp,
}: {
  view: Drawn;
  /** The sim's score margin per possession and period starts (read up to the drawn length). */
  flow: number[];
  flowPeriods: number[];
  side: 0 | 1;
  league: League;
  nameOf: (pid: number) => string;
  /** Away, home bar colours. */
  colors: [string, string];
  /** Home, away flow colours. */
  flowColors: [string, string];
  /** Win probability's starting point (the projected home margin) and the game's type; absent when it's switched off. */
  wp?: { edge: number; type: GameType };
}) {
  const [tab, setTab] = useState<Tab>('box');
  const [team, setTeam] = useState<0 | 1>(side);
  const [period, setPeriod] = useState(0);
  const [shooter, setShooter] = useState<number | null>(null);
  const res = view.box;
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  const tb = team === 0 ? res.home : res.away;
  const min = wholeMinutes(tb.players);
  // everyone who has played, and the five on the floor now (the starters at the opening tip)
  const onFloor = new Set(view.sides[team].on);
  const pt = Object.entries(tb.playTypes).sort((a, b) => b[1].poss - a[1].poss);
  const drawnFlow = flow.slice(0, view.flowLen);
  const periods = Math.max(1, Math.min(view.q, flowPeriods.length));
  return (
    <div className="col" style={{ gap: 12 }}>
      <Segmented
        value={tab}
        onChange={setTab}
        label="Box score sections"
        options={[
          { id: 'box', label: 'Box' },
          { id: 'team', label: 'Team' },
          { id: 'shots', label: 'Shots' },
          { id: 'flow', label: 'Flow' },
        ]}
      />
      {tab === 'box' && (
        <>
          <Segmented
            value={String(team)}
            onChange={(v) => setTeam(Number(v) as 0 | 1)}
            label="Team"
            options={[
              { id: '1', label: away.abbrev },
              { id: '0', label: home.abbrev },
            ]}
          />
          {/* it scrolls sideways: focusable so a keyboard can scroll it */}
          <div className="tablewrap" tabIndex={0} role="region" aria-label={`${(team === 0 ? home : away).name} box score`}>
            <table className="stats">
              <thead>
                <tr>
                  <th className="l sticky">Player</th>
                  <th>MIN</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>AST</th>
                  <th>FG</th>
                  <th>3P</th>
                  <th>FT</th>
                  <th>PF</th>
                  <th>+/-</th>
                </tr>
              </thead>
              <tbody>
                {tb.players
                  .filter((p) => p.min > 0 || onFloor.has(p.pid))
                  .map((p) => (
                    <tr key={p.pid}>
                      <td className="l sticky">{nameOf(p.pid)}</td>
                      <td>{min(p.pid)}</td>
                      <td className="bold">{p.pts}</td>
                      <td>{p.orb + p.drb}</td>
                      <td>{p.ast}</td>
                      <td>
                        {p.fgm}-{p.fga}
                      </td>
                      <td>
                        {p.tpm}-{p.tpa}
                      </td>
                      <td>
                        {p.ftm}-{p.fta}
                      </td>
                      <td className={p.pf >= 5 ? 'bad' : ''}>{p.pf}</td>
                      <td>{p.pm > 0 ? `+${p.pm}` : p.pm}</td>
                    </tr>
                  ))}
                <tr>
                  <td className="l sticky bold">Team</td>
                  <td />
                  <td className="bold">{tb.pts}</td>
                  <td>{tb.t.orb + tb.t.drb}</td>
                  <td>{tb.t.ast}</td>
                  <td>
                    {tb.t.fgm}-{tb.t.fga}
                  </td>
                  <td>
                    {tb.t.tpm}-{tb.t.tpa}
                  </td>
                  <td>
                    {tb.t.ftm}-{tb.t.fta}
                  </td>
                  <td>{tb.t.pf}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <Card title="Play types so far">
            <div className="col" style={{ gap: 4 }}>
              {pt.map(([k, v]) => (
                <div key={k} className="row small">
                  <span className="grow">{FINISH_LABEL[k as FinishType] ?? k}</span>
                  <span className="dim num">{v.poss} poss</span>
                  <span className="num bold" style={{ width: 48, textAlign: 'right' }}>
                    {(v.pts / Math.max(1, v.poss)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
      {tab === 'team' && (
        <>
          <QuarterTable g={res} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
          <Card
            title="Team comparison"
            right={
              <span className="tiny dim">
                {away.abbrev} · {home.abbrev}
              </span>
            }
          >
            <TeamComparison g={res} colors={colors} />
          </Card>
        </>
      )}
      {tab === 'shots' && (
        <ShotsTab
          view={view}
          team={team}
          setTeam={(t) => {
            setTeam(t);
            setShooter(null);
          }}
          period={period}
          setPeriod={setPeriod}
          shooter={shooter}
          setShooter={setShooter}
          abbrevs={[home.abbrev, away.abbrev]}
          nameOf={nameOf}
          color={team === side ? 'var(--accent)' : '#7dd3fc'}
        />
      )}
      {tab === 'flow' && wp && (
        <WinProbCard view={view} flow={drawnFlow} flowPeriods={flowPeriods.slice(0, periods)} side={side} abbrevs={[home.abbrev, away.abbrev]} kits={flowColors} wp={wp} />
      )}
      {tab === 'flow' && (
        <Card
          title="Score margin"
          right={
            <span className="tiny dim">
              {/* (your team above, as in the win probability) */}
              {side === 0 ? `${home.abbrev} above · ${away.abbrev} below` : `${away.abbrev} above · ${home.abbrev} below`}
            </span>
          }
        >
          {drawnFlow.length < 2 ? (
            <div className="small dim">The chart starts after the first few possessions.</div>
          ) : (
            <FlowChart
              flow={side === 0 ? drawnFlow : drawnFlow.map((m) => -m)}
              colorA={flowColors[side]}
              colorB={flowColors[1 - side]}
              periods={Array.from({ length: periods }, (_, i) => (i < 4 ? GAME.quarterSec : GAME.otSec))}
              periodStarts={flowPeriods.slice(0, periods)}
              height={150}
            />
          )}
          <div className="small dim" style={{ marginTop: 8 }}>
            Largest leads: {home.abbrev} {res.home.extra.biggestLead}, {away.abbrev} {res.away.extra.biggestLead}.
          </div>
        </Card>
      )}
    </div>
  );
}

/** The shots drawn so far for one team, by period and by shooter (tap a row to see only his). */
function ShotsTab({
  view,
  team,
  setTeam,
  period,
  setPeriod,
  shooter,
  setShooter,
  abbrevs,
  nameOf,
  color,
}: {
  view: Drawn;
  team: 0 | 1;
  setTeam: (t: 0 | 1) => void;
  period: number;
  setPeriod: (q: number) => void;
  shooter: number | null;
  setShooter: (pid: number | null) => void;
  /** [home, away]. */
  abbrevs: [string, string];
  nameOf: (pid: number) => string;
  color: string;
}) {
  const all = (view.box.shots ?? []).filter((s) => s.t === team && (!period || s.q === period));
  const shots = shooter === null ? all : all.filter((s) => s.pid === shooter);
  const made = shots.filter((s) => s.made).length;
  const rows = [...new Set(all.map((s) => s.pid))]
    .map((pid) => {
      const mine = all.filter((s) => s.pid === pid);
      const three = mine.filter((s) => s.zone === 'c3' || s.zone === 'ab3');
      return { pid, fgm: mine.filter((s) => s.made).length, fga: mine.length, tpm: three.filter((s) => s.made).length, tpa: three.length };
    })
    .sort((a, b) => b.fga - a.fga || b.fgm - a.fgm);
  const periods = Array.from({ length: Math.max(1, view.q) }, (_, i) => ({ id: i + 1, label: periodLabel(i + 1) }));
  return (
    <>
      <Segmented
        value={String(team)}
        onChange={(v) => setTeam(Number(v) as 0 | 1)}
        label="Team"
        options={[
          { id: '1', label: abbrevs[1] },
          { id: '0', label: abbrevs[0] },
        ]}
      />
      <Chips label="Period" value={period} onChange={setPeriod} options={[{ id: 0, label: 'All' }, ...periods]} />
      <Card title={`${shooter === null ? abbrevs[team] : nameOf(shooter)} · ${made}/${shots.length}${period ? ` in ${periodLabel(period)}` : ''}`}>
        {all.length === 0 ? (
          <div className="small dim">No shots yet{period ? ` in ${periodLabel(period)}` : ''}.</div>
        ) : (
          <>
            <ShotChart shots={shots} color={color} />
            <div className="col" style={{ gap: 0, marginTop: 8 }} role="group" aria-label="Shooters: tap one to see only his shots">
              <div className="row tiny dim upper bold" style={{ padding: '0 4px' }}>
                <span className="grow">Shooter</span>
                <span style={{ width: 52, textAlign: 'right' }}>FG</span>
                <span style={{ width: 52, textAlign: 'right' }}>3P</span>
              </div>
              {rows.map((r) => (
                <button
                  key={r.pid}
                  className={`row small ${shooter === r.pid ? 'bold' : ''}`}
                  style={{ minHeight: 34, padding: '0 4px', borderRadius: 8, background: shooter === r.pid ? 'var(--surface-3)' : undefined, textAlign: 'left' }}
                  aria-pressed={shooter === r.pid}
                  onClick={() => setShooter(shooter === r.pid ? null : r.pid)}
                >
                  <span className="grow ellipsis">{nameOf(r.pid)}</span>
                  <span className="num" style={{ width: 52, textAlign: 'right' }}>
                    {r.fgm}-{r.fga}
                  </span>
                  <span className="num dim2" style={{ width: 52, textAlign: 'right' }}>
                    {r.tpm}-{r.tpa}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

/** Your chance to win after every possession drawn so far, from tip-off, and where it stands now. */
function WinProbCard({
  view,
  flow,
  flowPeriods,
  side,
  abbrevs,
  kits,
  wp,
}: {
  view: Drawn;
  flow: number[];
  flowPeriods: number[];
  side: 0 | 1;
  /** [home, away]. */
  abbrevs: [string, string];
  /** Home, away colours. */
  kits: [string, string];
  wp: { edge: number; type: GameType };
}) {
  const series = wpSeries(
    { flow, flowPeriods, flowT: view.box.flowT?.slice(0, flow.length), flowPoss: view.box.flowPoss?.slice(0, flowPeriods.length), edge: wp.edge, type: wp.type },
    undefined,
    { clock: view.clock },
  );
  const mine = (v: number) => (side === 0 ? v : 1 - v);
  const me = abbrevs[side];
  return (
    <Card title="Win probability" right={<span className="tiny dim">{me} above 50%</span>}>
      {!series || series.length < 2 ? (
        <div className="small dim">The chart starts after the first possession.</div>
      ) : (
        <>
          <WinProbChart
            points={series.map((p) => ({ t: p.t, wp: mine(p.wp) }))}
            periods={Array.from({ length: Math.max(4, view.q) }, (_, i) => (i < 4 ? GAME.quarterSec : GAME.otSec))}
            color={kits[side]}
            colorOther={kits[1 - side]}
            describe={(i) => {
              const p = series[i];
              return p.i < 0 ? 'Tip-off' : `${periodLabel(p.q)} ${fmtClock(p.clock)} · ${marginWords(me, side === 0 ? p.margin : -p.margin)}`;
            }}
            label={`${me} win probability over the game so far: ${wpText(mine(series[0].wp))} at tip-off, ${wpText(mine(series[series.length - 1].wp))} now`}
            height={130}
          />
          <div className="small dim" style={{ marginTop: 8 }}>
            {me} {wpText(mine(series[series.length - 1].wp))} to win now, from {wpText(mine(series[0].wp))} at tip-off: the score, the time left, who has the ball and the pre-game
            projection.
          </div>
        </>
      )}
    </Card>
  );
}
