// Tactics → Analysis → Season: the engine's tally of your season (each setting's trade-off netted on
// one row, each other effect it tracks on its own, in points a game) and how teams see you: your
// scouting report as an opponent reads it. The tally is what happened, never advice: it isn't a
// counterfactual (it has read a coverage as the worse one where paired games found it the better), so
// it says nothing about what a change would win. The staff measures that in paired games before it
// suggests or makes one (staffLever.ts): its latest test heads the tally, a row.
import { useState } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { League } from '../../core/types';
import { scoutData, SCOUT_MIN_GAMES } from '../../core/analysis/scouting';
import { scoutTeam, seasonLevers } from '../../core/ai/advisor';
import { leverReport } from '../../core/league/staffLever';
import { IMPACT_TEXT, LEVER_GAINS, impactSentence, leverNet } from '../../core/analysis/gameReport';
import { Help, More, Section, Segmented } from '../components/ui';
import { Term } from '../components/Glossary';
import { plural } from '../../core/format';
import { PlayTypeTable, RankStrip, scoutSource } from '../components/scouting';
import { seasonImpacts, strongerSides } from '../seasonAnalysis';

/** Rows shown before "more". */
const SHOWN = 4;
/** Points a game a row has to come to (either way, or in what it gave up and won back) to be listed. */
const LISTED = 0.3;

/** One row of the tally: a setting netted, or another effect. */
interface TallyRow {
  id: string;
  v: number;
  title: string;
  /** A setting's two sides. */
  sides?: string;
}

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

export function InsightsTab() {
  const league = useLeague();
  // the games the effects were tracked in, whether or not any effect is big enough to list
  const { games, effects } = useLeagueMemo(() => seasonImpacts(league), [league]);
  const levers = useLeagueMemo(() => seasonLevers(league, league.userTid), [league]);
  // (the staff's latest measured change: what the tally sent it to look at, played both ways)
  const report = useLeagueMemo(() => leverReport(league), [league]);
  const [more, setMore] = useState(false);
  // your settings, each on one row: what it gave up against what it won back
  const settings: TallyRow[] = levers
    .filter((l) => l.lost + l.won >= LISTED)
    .map((l) => ({ id: l.what, v: l.net, title: l.what.charAt(0).toUpperCase() + l.what.slice(1), sides: `gave up ${l.lost.toFixed(1)}, won ${l.won.toFixed(1)} back` }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  // every other effect: the opponents' settings, and what isn't a trade-off (a side of one of yours is in its row above)
  const yours = (x: { key: string; forUser: boolean }) => (x.forUser ? LEVER_GAINS.has(x.key) : !!leverNet([], x.key, 0));
  const others: TallyRow[] = strongerSides(effects.filter((x) => IMPACT_TEXT[x.key] && x.perGame >= LISTED && !yours(x))).map((x) => ({
    id: `${x.key}${x.forUser}`,
    v: x.forUser ? x.perGame : -x.perGame,
    title: impactSentence(x.key, x.forUser ? 'your team' : 'the opposition', x.forUser ? 'the opposition' : 'your team'),
  }));
  const hidden = Math.max(0, settings.length - SHOWN) + Math.max(0, others.length - SHOWN);
  const cut = (xs: TallyRow[]) => (more ? xs : xs.slice(0, SHOWN));
  const row = (x: TallyRow) => (
    <div key={x.id} className="tx-imp">
      <span className={`tx-imp-v num ${x.v >= 0 ? 'good' : 'bad'}`}>{signed(x.v)}</span>
      <span className="grow">
        <span className="tx-imp-t">{x.title}</span>
        {x.sides && <span className="tx-imp-s">{x.sides}</span>}
      </span>
    </div>
  );
  return (
    <>
      {games > 0 ? (
        <Section
          title={
            <h3>
              The engine&apos;s tally
              <Help title="The engine's tally">
                <p>What the engine counted in your games, in points a game. Each setting nets what it gave up against what it won back.</p>
                <p>
                  It&apos;s what happened, not what a change would win. The staff <Term id="measured">measures</Term> a change before they suggest it.
                </p>
              </Help>
            </h3>
          }
          right={<span className="tiny dim">pts a game · {plural(games, 'game')}</span>}
        >
          <div className="card flush list">
            {report && (
              <>
                <div className="list-divider list-h" aria-hidden="true">
                  <span>Staff&apos;s latest test</span>
                </div>
                {row({ id: 'lever', v: report.pts, title: report.title, sides: report.meta })}
              </>
            )}
            <div className="list-divider list-h" aria-hidden="true">
              <span>Your settings, net</span>
            </div>
            {settings.length ? cut(settings).map(row) : <div className="tx-empty">Nothing stands out yet.</div>}
            <div className="list-divider list-h" aria-hidden="true">
              <span>Other effects</span>
            </div>
            {others.length ? cut(others).map(row) : <div className="tx-empty">Nothing stands out yet.</div>}
          </div>
          {!more && hidden > 0 && (
            <button className="btn sm tx-imp-more" onClick={() => setMore(true)}>
              {hidden} more
            </button>
          )}
        </Section>
      ) : (
        <div className="tx-empty">The engine&apos;s tally comes in after your first games.</div>
      )}
      <SeenBy league={league} />
    </>
  );
}

/** How teams see you: your scouting report as an opponent reads it (league ranks, play types at both ends, what they'll go after). */
function SeenBy({ league }: { league: League }) {
  const tid = league.userTid;
  const data = useLeagueMemo(() => scoutData(league, tid), [league, tid]);
  const weak = useLeagueMemo(() => scoutTeam(league, tid).weaknesses, [league, tid]);
  const [end, setEnd] = useState<'off' | 'def'>('off');
  return (
    <Section
      title={
        <h3>
          How teams see you
          <Help title="How teams see you">
            <p>Your numbers as other coaches scout them, ranked in the league. 1st is the best, or the most for pace.</p>
            <p>
              <Term id="ppp">PPP</Term> is points per possession by play type. Red is worse than the league, and it&apos;s what they&apos;ll attack.
            </p>
          </Help>
        </h3>
      }
      right={data.enough ? <span className="tiny dim">{scoutSource(data)}</span> : undefined}
    >
      {!data.enough ? (
        <div className="tx-empty">Your scouting numbers come in after {SCOUT_MIN_GAMES} games.</div>
      ) : (
        <div className="col tx-seen">
          <RankStrip d={data} />
          {data.playTypes.length > 0 && (
            <More label="Play types at both ends">
              <Segmented
                label="Play types at which end"
                value={end}
                onChange={setEnd}
                options={[
                  { id: 'off', label: 'Your offense' },
                  { id: 'def', label: 'Your defense' },
                ]}
              />
              <PlayTypeTable rows={end === 'off' ? data.playTypes : data.defPlayTypes} defense={end === 'def'} />
            </More>
          )}
          {weak.length > 0 && (
            <More label={`What they'll attack · ${weak.length}`}>
              <ul className="tx-bullets">
                {weak.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </More>
          )}
        </div>
      )}
    </Section>
  );
}
