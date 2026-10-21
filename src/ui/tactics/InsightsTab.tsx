// Tactics → Analysis → Season: what your tactics have won and given up this season (each effect in
// points a game, with the fix for what hurts) in one list, and how teams see you: your scouting
// report as an opponent reads it.
import { useState } from 'react';
import { useLeague, useLeagueMemo } from '../../state/store';
import type { League } from '../../core/types';
import { scoutData, SCOUT_MIN_GAMES } from '../../core/analysis/scouting';
import { scoutTeam } from '../../core/ai/advisor';
import { IMPACT_TEXT, impactAdvice, impactSentence } from '../../core/analysis/gameReport';
import { Help, More, Section, Segmented } from '../components/ui';
import { Term } from '../components/Glossary';
import { plural } from '../../core/format';
import { PlayTypeTable, RankStrip, scoutSource } from '../components/scouting';
import { seasonImpacts, strongerSides } from '../seasonAnalysis';

export function InsightsTab() {
  const league = useLeague();
  // the games the effects were tracked in, whether or not any effect is big enough to list
  const { games, effects } = useLeagueMemo(() => seasonImpacts(league), [league]);
  const imps = strongerSides(effects.filter((x) => IMPACT_TEXT[x.key] && x.perGame >= 0.3));
  // the three biggest each way, two more a tap away
  const [more, setMore] = useState(false);
  const helpAll = imps.filter((x) => x.forUser).slice(0, 5);
  const hurtAll = imps.filter((x) => !x.forUser).slice(0, 5);
  const helping = more ? helpAll : helpAll.slice(0, 3);
  const hurting = more ? hurtAll : hurtAll.slice(0, 3);
  const hidden = helpAll.length + hurtAll.length - helping.length - hurting.length;
  const row = (x: { key: string; perGame: number; forUser: boolean }) => {
    // no "go to Hedge" once you already play Hedge
    const advice = x.forUser ? undefined : impactAdvice(x.key, league.teams[league.userTid].tactics);
    const X = x.forUser ? 'your team' : 'the opposition';
    const Y = x.forUser ? 'the opposition' : 'your team';
    return (
      <div key={`${x.key}${x.forUser}`} className="tx-imp">
        <span className={`tx-imp-v num ${x.forUser ? 'good' : 'bad'}`}>
          {x.forUser ? '+' : '−'}
          {x.perGame.toFixed(1)}
        </span>
        <span className="grow">
          <span className="tx-imp-t">{impactSentence(x.key, X, Y)}</span>
          {advice && <span className="tx-imp-a">{advice}</span>}
        </span>
      </div>
    );
  };
  return (
    <>
      {games > 0 ? (
        <Section title="What your tactics did" right={<span className="tiny dim">pts a game · {plural(games, 'game')}</span>}>
          <div className="card flush list">
            <div className="list-divider list-h" aria-hidden="true">
              <span>Working</span>
            </div>
            {helping.length ? helping.map(row) : <div className="tx-empty">Nothing stands out yet.</div>}
            <div className="list-divider list-h" aria-hidden="true">
              <span>Hurting you</span>
            </div>
            {hurting.length ? hurting.map(row) : <div className="tx-empty">Nothing stands out yet.</div>}
          </div>
          {hidden > 0 && (
            <button className="btn sm tx-imp-more" onClick={() => setMore(true)}>
              {hidden} more
            </button>
          )}
        </Section>
      ) : (
        <div className="tx-empty">What your tactics win and give up comes in after your first games.</div>
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
            <p>Your numbers as other coaches scout them: league ranks (1st is the best, or the most for style numbers like pace) and your play types at both ends.</p>
            <p>
              <Term id="ppp">PPP</Term> is points per possession by how the possession finished, against the league&apos;s. Green is where you are better than the league, red where
              you are worse: red is what they&apos;ll go after.
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
            <More label={`What they'll go after (${weak.length})`}>
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
