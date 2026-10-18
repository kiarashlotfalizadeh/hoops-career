// A Lab projection's result: your plan against one team over the games run. The verdict figures,
// what drives it (each side's tactical gains, with the fix for what hurts you), the shot profile next
// to theirs, your play types and who gets the ball.
import type { LabSummary } from '../../../core/ai/lab';
import { FINISH_LABEL, type FinishType } from '../../../core/sim/log';
import { IMPACT_TEXT, impactAdvice, impactSentence, teamRef } from '../../../core/analysis/gameReport';
import type { League } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { Section, Statline } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { CompareBar } from '../../components/charts';
import { matchupColors } from '../../teamColors';
import { f1, p0, p1, rosterNames, signed } from '../../stats';
import { SIGMAS, sideFor } from './sides';

export function ProjectionResult({ r, league, oppTid }: { r: LabSummary; league: League; oppTid: number }) {
  const me = league.teams[league.userTid];
  const them = league.teams[oppTid];
  const [cMe, cThem] = matchupColors(me.colors, them.colors);
  // advice only for what your tactics for this opponent still do: no "go back to man-to-man" from man-to-man
  const tactics = useLeagueMemo(() => sideFor(league, league.userTid, oppTid).team.tactics, [league, oppTid]);
  const names = rosterNames(
    Object.keys(r.players)
      .map((pid) => league.players[+pid])
      .filter(Boolean),
    { initial: true },
  );
  const users = Object.entries(r.players)
    .map(([pid, v]) => ({ p: league.players[+pid], ...v }))
    .filter((x) => x.p)
    .sort((a, b) => b.min - a.min);
  const pts = Object.entries(r.playTypes).sort((a, b) => b[1].freq - a[1].freq);
  // each side's gains on their own line: netted, both teams' drop coverage conceding pull-ups cancelled out
  const impacts = Object.entries(r.impacts)
    .filter(([k]) => IMPACT_TEXT[k])
    .flatMap(([k, v]): [string, number][] => [
      [k, v.us],
      [k, -v.them],
    ])
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);
  return (
    <>
      <section className="lab-hero" aria-label="Projection">
        <div className="over">
          {me.abbrev} vs {them.abbrev} · {r.games} games · pace {f1(r.pace)}
        </div>
        <Statline
          items={[
            { k: 'Win %', v: p0(r.winPct) },
            { k: 'Net', v: signed(r.net), s: <Term id="range">± {f1(SIGMAS * r.netSE)}</Term>, color: r.net >= 0 ? 'var(--good)' : 'var(--bad)' },
            { k: 'Margin', v: signed(r.ptsFor - r.ptsAgainst), s: `${Math.round(r.ptsFor)}-${Math.round(r.ptsAgainst)} a game` },
          ]}
        />
      </section>
      {impacts.length > 0 && (
        <Section title="What drives it" right={<span className="tiny dim">pts a game</span>}>
          <div className="card flush list">
            {impacts.map(([k, v]) => {
              const advice = v < 0 ? impactAdvice(k, tactics) : undefined;
              return (
                <div key={`${k}${v >= 0 ? '+' : '-'}`} className="lab-imp">
                  <span className={`lab-imp-v num ${v >= 0 ? 'good' : 'bad'}`}>{signed(v)}</span>
                  <span>
                    <span>{impactSentence(k, teamRef(v >= 0 ? me : them), teamRef(v >= 0 ? them : me))}</span>
                    {advice && <span className="lab-imp-a">{advice}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Section
        title="Shot profile"
        right={
          <span className="lab-legend">
            <i style={{ background: cMe }} /> {me.abbrev} <i style={{ background: cThem }} /> {them.abbrev}
          </span>
        }
      >
        <div className="card lab-bars">
          <CompareBar label="eFG%" a={r.shot.efg * 100} b={r.oppShot.efg * 100} colorA={cMe} colorB={cThem} />
          <CompareBar label="Rim rate" a={r.shot.rimRate * 100} b={r.oppShot.rimRate * 100} colorA={cMe} colorB={cThem} neutral />
          <CompareBar label="3PA rate" a={r.shot.threeRate * 100} b={r.oppShot.threeRate * 100} colorA={cMe} colorB={cThem} neutral />
          <CompareBar label="FTA/FGA" a={r.shot.ftRate * 100} b={r.oppShot.ftRate * 100} colorA={cMe} colorB={cThem} />
          <CompareBar label="TOV%" a={r.shot.tov * 100} b={r.oppShot.tov * 100} colorA={cMe} colorB={cThem} higherBetter={false} />
          <CompareBar label="ORB%" a={r.shot.orb * 100} b={r.oppShot.orb * 100} colorA={cMe} colorB={cThem} />
        </div>
      </Section>
      <Section title="Your play types" right={<span className="tiny dim">share · pts/poss</span>}>
        <div className="card flush list">
          {pts.map(([k, v]) => (
            <div key={k} className="lab-tr c2">
              <span className="ellipsis">{FINISH_LABEL[k as FinishType] ?? k}</span>
              <span className="num dim2">{p0(v.freq)}</span>
              <span className={`num bold ${v.ppp >= 1.1 ? 'good' : v.ppp < 0.9 ? 'bad' : ''}`}>{v.ppp.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Who gets the ball" right={<span className="tiny dim">a game</span>}>
        <div className="card flush list">
          <div className="lab-tr c5 h">
            <span>Player</span>
            <span>Min</span>
            <span>Pts</span>
            <span>Usg</span>
            <span>TS%</span>
          </div>
          {users.slice(0, 10).map((u) => (
            <div key={u.p.pid} className="lab-tr c5">
              <span className="ellipsis">{names(u.p.pid)}</span>
              <span className="num dim2">{f1(u.min)}</span>
              <span className="num bold">{f1(u.pts)}</span>
              <span className="num dim2">{p1(u.usg)}</span>
              <span className="num dim2">{p1(u.ts)}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
