import { useState } from 'react';
import type { League } from '../../core/types';
import { GAME } from '../../core/constants';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { Card, Segmented } from '../components/ui';
import { FlowChart } from '../components/charts';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { wholeMinutes } from '../stats';
import type { Drawn } from './drawn';

type Tab = 'box' | 'team' | 'flow';

/** The live box score as the court has drawn it: players, team totals by period, and the score margin so far. */
export function BoxPanel({
  view,
  flow,
  flowPeriods,
  side,
  league,
  nameOf,
  colors,
  flowColors,
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
}) {
  const [tab, setTab] = useState<Tab>('box');
  const [team, setTeam] = useState<0 | 1>(side);
  const res = view.box;
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  const tb = team === 0 ? res.home : res.away;
  const min = wholeMinutes(tb.players);
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
          <div className="tablewrap">
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
                  .filter((p) => p.min > 0)
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
      {tab === 'flow' && (
        <Card
          title="Score margin"
          right={
            <span className="tiny dim">
              {home.abbrev} above · {away.abbrev} below
            </span>
          }
        >
          {drawnFlow.length < 2 ? (
            <div className="small dim">The chart starts after the first few possessions.</div>
          ) : (
            <FlowChart
              flow={drawnFlow}
              colorA={flowColors[0]}
              colorB={flowColors[1]}
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
