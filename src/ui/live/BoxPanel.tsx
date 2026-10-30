import { useState } from 'react';
import type { GameType, League } from '../../core/types';
import { GAME } from '../../core/constants';
import { gameTime, keepFigures, madeAtt } from '../../core/format';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { marginWords, wpSeries } from '../../core/analysis/winProb';
import { oddsWord } from '../../core/analysis/staffWords';
import { Card, Chips, Section, Segmented } from '../components/ui';
import { FlowChart, ShotChart, WinProbChart } from '../components/charts';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { periodLabel } from '../stats';
import { BoxScore } from '../components/BoxScore';
import { Term } from '../components/Glossary';
import type { Drawn } from './drawn';

/** The Stats view's sections (the play-by-play is the console's own, beside them). */
export type BoxTab = 'players' | 'team' | 'shots' | 'flow';

/**
 * The console's Stats view, the game as the court has drawn it: each team's players (the box score
 * the report has, and their play types so far), the team totals by period, the shots (by team, period
 * and player) and the flow: your chance to win so far (`wp`, when it's on) and the score margin.
 */
export function BoxPanel({
  tab,
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
  /** The section shown (its tabs are the Stats view's, one row with the play-by-play). */
  tab: BoxTab;
  view: Drawn;
  /** The sim's score margin per possession and period starts (read up to the drawn length). */
  flow: number[];
  flowPeriods: number[];
  side: 0 | 1;
  league: League;
  nameOf: (pid: number) => string;
  /** Away, home bar colours. */
  colors: [string, string];
  /** Home, away colours (the flow's and the shot charts'). */
  flowColors: [string, string];
  /** Win probability's starting point (the projected home margin) and the game's type; absent when it's switched off. */
  wp?: { edge: number; type: GameType };
}) {
  const [team, setTeam] = useState<0 | 1>(side);
  const [period, setPeriod] = useState(0);
  const [shooter, setShooter] = useState<number | null>(null);
  const res = view.box;
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  const tb = team === 0 ? res.home : res.away;
  // everyone who has played, and the five on the floor now (the starters at the opening tip)
  const onFloor = new Set(view.sides[team].on);
  const pt = Object.entries(tb.playTypes).sort((a, b) => b[1].poss - a[1].poss);
  const drawnFlow = flow.slice(0, view.flowLen);
  const periods = Math.max(1, Math.min(view.q, flowPeriods.length));
  return (
    <div className="lv-bx">
      {tab === 'players' && (
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
          <BoxScore box={tb} name={nameOf} label={`${(team === 0 ? home : away).name} box score`} shown={(p) => p.min > 0 || onFloor.has(p.pid)} />
          <Section
            title={`${(team === 0 ? home : away).abbrev} play types so far`}
            right={
              <span className="tiny dim">
                Poss · <Term id="ppp">PPP</Term>
              </span>
            }
          >
            <div className="card flush list">
              {pt.length === 0 && <div className="lv-bx-pt small dim">None yet.</div>}
              {pt.map(([k, v]) => (
                <div key={k} className="lv-bx-pt">
                  <span className="grow">{FINISH_LABEL[k as FinishType] ?? k}</span>
                  <span className="dim num">{v.poss}</span>
                  <span className="num lv-bx-ppp">{(v.pts / Math.max(1, v.poss)).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Section>
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
          color={flowColors[team]}
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
          <div className="small dim lv-bx-foot">
            Largest leads: {away.abbrev} {res.away.extra.biggestLead}, {home.abbrev} {res.home.extra.biggestLead}.
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
      <Card title={`${shooter === null ? abbrevs[team] : nameOf(shooter)} · ${keepFigures(madeAtt(made, shots.length))} FG${period ? ` in ${periodLabel(period)}` : ''}`}>
        {/* (the period narrows the chart: a filter on the card, not another row of controls over it) */}
        <div className="lv-sh-q">
          <Chips label="Period" value={period} onChange={setPeriod} options={[{ id: 0, label: 'All' }, ...periods]} />
        </div>
        {all.length === 0 ? (
          <div className="small dim">No shots yet{period ? ` in ${periodLabel(period)}` : ''}.</div>
        ) : (
          <>
            <ShotChart shots={shots} color={color} />
            <div className="lv-sh" role="group" aria-label="Shooters: tap one to see only his shots">
              <div className="lv-sh-h">
                <span>Shooter</span>
                <span>FG</span>
                <span>3P</span>
              </div>
              {rows.map((r) => (
                <button
                  key={r.pid}
                  className={`lv-sh-row${shooter === r.pid ? ' on' : ''}`}
                  aria-pressed={shooter === r.pid}
                  onClick={() => setShooter(shooter === r.pid ? null : r.pid)}
                >
                  <span className="grow ellipsis">{nameOf(r.pid)}</span>
                  <span className="num">{keepFigures(madeAtt(r.fgm, r.fga))}</span>
                  <span className="num dim2">{keepFigures(madeAtt(r.tpm, r.tpa))}</span>
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
    <Card title={<Term id="winprob">Who's winning it</Term>} right={<span className="tiny dim">{me} above the line</span>}>
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
              return p.i < 0 ? 'Tip-off' : `${gameTime(p.q, p.clock)} · ${marginWords(me, side === 0 ? p.margin : -p.margin)}`;
            }}
            label={`${me} chance to win over the game so far: ${oddsWord(mine(series[series.length - 1].wp))} now`}
            height={130}
            bare
          />
          <div className="small dim lv-bx-foot">
            {me} now: {oddsWord(mine(series[series.length - 1].wp))}.
          </div>
        </>
      )}
    </Card>
  );
}
