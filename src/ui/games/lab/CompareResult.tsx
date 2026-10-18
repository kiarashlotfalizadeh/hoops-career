// A Lab comparison's result: your tactics before and after an edit through the same games. The
// verdict and the change in net rating with its range, then what moved: the shot profile, the play
// types, the sets and who gets the ball.
import { pairedDelta, type LabSummary } from '../../../core/ai/lab';
import { FINISH_LABEL, type FinishType } from '../../../core/sim/log';
import { CLEAR_OUT, SETS } from '../../../core/sim/sets';
import type { League, SetId } from '../../../core/types';
import { Help, Section, Statline } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { CompareBar } from '../../components/charts';
import { f1, p0, p1, rosterNames, signed } from '../../stats';
import { SIGMAS } from './sides';

export function CompareResult({ before, after, league }: { before: LabSummary; after: LabSummary; league: League }) {
  const { delta: d, se } = pairedDelta(before, after);
  const margin = SIGMAS * se;
  const verdict = d > margin ? 'An improvement' : d < -margin ? 'A step back' : 'Too close to call';
  const tone = d > margin ? 'good' : d < -margin ? 'bad' : '';
  const names = rosterNames(
    Object.keys(after.players)
      .map((pid) => league.players[+pid])
      .filter(Boolean),
  );
  const keys = Array.from(new Set([...Object.keys(before.playTypes), ...Object.keys(after.playTypes)]));
  // (summaries from before sets have none)
  const setKeys = Array.from(new Set([...Object.keys(before.sets ?? {}), ...Object.keys(after.sets ?? {})]));
  const players = Object.keys(after.players)
    .map(Number)
    .map((pid) => ({ p: league.players[pid], a: after.players[pid], b: before.players[pid] }))
    .filter((x) => x.p && x.a)
    .sort((x, y) => y.a.min - x.a.min)
    .slice(0, 9);
  const legend = (
    <span className="lab-legend">
      <i className="before" /> Before <i className="after" /> After
    </span>
  );
  return (
    <>
      <section className="lab-hero" aria-label="Verdict">
        <div className="lab-verdict">
          <div className="grow">
            <div className="over">Verdict</div>
            <div className={`lab-verdict-t ${tone}`}>{verdict}</div>
          </div>
          <div className="lab-d">
            <span className={`lab-delta big num ${tone || 'dim2'}`}>{signed(d)}</span>
            <span className="tiny dim">
              net / 100 poss · <Term id="range">± {f1(margin)}</Term>
            </span>
          </div>
        </div>
        <Statline
          items={[
            { k: 'Win %', v: p0(after.winPct), s: `was ${p0(before.winPct)}` },
            { k: 'Off rtg', v: f1(after.ortg), s: signed(after.ortg - before.ortg) },
            { k: 'Def rtg', v: f1(after.drtg), s: signed(after.drtg - before.drtg) },
          ]}
        />
      </section>
      <Section title="Shot profile" right={legend}>
        <div className="card lab-bars">
          <CompareBar label="eFG%" a={before.shot.efg * 100} b={after.shot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
          <CompareBar label="3PA rate" a={before.shot.threeRate * 100} b={after.shot.threeRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" neutral />
          <CompareBar label="Rim rate" a={before.shot.rimRate * 100} b={after.shot.rimRate * 100} colorA="var(--text-dim)" colorB="var(--accent)" neutral />
          <CompareBar label="Opp eFG%" a={before.oppShot.efg * 100} b={after.oppShot.efg * 100} colorA="var(--text-dim)" colorB="var(--accent)" higherBetter={false} />
          <CompareBar label="Opp turnover %" a={before.oppShot.tov * 100} b={after.oppShot.tov * 100} colorA="var(--text-dim)" colorB="var(--accent)" />
        </div>
      </Section>
      <Section title="Play types" right={<span className="tiny dim">share · pts/poss</span>}>
        <div className="card flush list">
          {keys.map((k) => {
            const b = before.playTypes[k] ?? { freq: 0, ppp: 0 };
            const a = after.playTypes[k] ?? { freq: 0, ppp: 0 };
            return (
              <div key={k} className="lab-tr c3">
                <span className="ellipsis">{FINISH_LABEL[k as FinishType] ?? k}</span>
                <span className="num dim2">
                  {p0(b.freq)} → {p0(a.freq)}
                </span>
                <span className="num">
                  {b.ppp.toFixed(2)} → <b>{a.ppp.toFixed(2)}</b>
                </span>
              </div>
            );
          })}
        </div>
      </Section>
      {setKeys.length > 0 && (
        <Section
          title="Sets"
          right={
            <Help title="Sets">
              The possessions each set opened, a game, and the points per possession they scored. A set package&apos;s sets run now and then, for players who fit them; their
              defense reads each one a little better every run.
            </Help>
          }
        >
          <div className="card flush list">
            {setKeys.map((k) => {
              const b = before.sets?.[k];
              const a = after.sets?.[k];
              const ppp = (x?: { runs: number; pts: number }) => (x?.runs ? (x.pts / x.runs).toFixed(2) : '—');
              return (
                <div key={k} className="lab-tr c3">
                  <span className="ellipsis">{k === 'iso' ? CLEAR_OUT.name : SETS[k as SetId].name}</span>
                  <span className="num dim2">
                    {f1(b?.runs ?? 0)} → {f1(a?.runs ?? 0)}
                  </span>
                  <span className="num">
                    {ppp(b)} → <b>{ppp(a)}</b>
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Section title="Touches" right={<span className="tiny dim">usage · pts</span>}>
        <div className="card flush list">
          {players.map(({ p, a, b }) => (
            <div key={p.pid} className="lab-tr c3">
              <span className="ellipsis">{names(p.pid)}</span>
              <span className="num dim2 nowrap">
                {b ? p1(b.usg) : '—'} → {p1(a.usg)}
              </span>
              <span className="num">{f1(a.pts)} pts</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
