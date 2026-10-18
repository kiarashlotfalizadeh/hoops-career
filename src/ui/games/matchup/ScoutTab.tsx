// The matchup page's Scout: their league ranks, how they play, where to attack them, their play
// types at both ends, their key players and the user's meetings with them.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { League } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { scoutTeam } from '../../../core/ai/advisor';
import { SCOUT_MIN_GAMES, scoutData } from '../../../core/analysis/scouting';
import { seasonLabel } from '../../../core/constants';
import { Avatar, Help, More, Ovr, Section, Segmented } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { plural } from '../../../core/format';
import { HeadToHead, KeyPlayers, PlayTypeTable, RankStrip, scoutSource } from '../../components/scouting';

function Bullets({ items, tone }: { items: string[]; tone?: 'good' | 'info' }) {
  return (
    <ul className={`mu-bullets ${tone ?? ''}`}>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export function ScoutTab({ league, opp }: { league: League; opp: number }) {
  const rep = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const [side, setSide] = useState<'off' | 'def'>('off');
  // what the numbers show first, then what the playbook and roster say
  const how = [...(data.enough ? data.tendencies.slice(0, 2) : []), rep.offense[0], rep.defense[0]].filter(Boolean);
  const howMore = [...(data.enough ? data.tendencies.slice(2) : []), ...rep.offense.slice(1), ...rep.defense.slice(1)];
  const attack = rep.weaknesses.slice(0, 3);
  return (
    <>
      <Section title="By the numbers" right={data.enough ? <span className="tiny dim">{scoutSource(data)}</span> : undefined}>
        {data.enough ? (
          <>
            <RankStrip d={data} part="main" />
            <More label="Four factors and shot mix">
              <div style={{ marginTop: 10 }}>
                <RankStrip d={data} part="rest" />
              </div>
            </More>
          </>
        ) : (
          <div className="mu-note">League ranks after {SCOUT_MIN_GAMES} games; until then, this reads their playbook and roster.</div>
        )}
      </Section>

      <Section title="How they play">
        <Bullets items={how} tone="info" />
        {howMore.length > 0 && (
          <More label="More">
            <Bullets items={howMore} tone="info" />
          </More>
        )}
      </Section>

      <Section title="Where to attack">
        {attack.length ? <Bullets items={attack} tone="good" /> : <div className="mu-note">No obvious weakness: win the possession battle.</div>}
        {rep.weaknesses.length > 3 && (
          <More label="More">
            <Bullets items={rep.weaknesses.slice(3)} tone="good" />
          </More>
        )}
      </Section>

      {data.enough && data.playTypes.length > 0 && (
        <Section
          title="Play types"
          right={
            <span className="row" style={{ gap: 6 }}>
              <span className="tiny dim">
                <Term id="ppp">PPP</Term> vs the league
              </span>
              <Help title="Play types">
                <p>
                  Points per possession by how the possession finished, against the league&apos;s, over {plural(data.ptGames, 'game')}. Green is where they are better than the
                  league (scoring more on offense, allowing less on defense), red where they are worse: red is where to attack them.
                </p>
                <p>
                  <Term id="z">z</Term> is how far from the league in standard errors: beyond ±2 is more than noise.
                </p>
              </Help>
            </span>
          }
        >
          <Segmented
            label="Play types at which end"
            value={side}
            onChange={setSide}
            options={[
              { id: 'off', label: 'Their offense' },
              { id: 'def', label: 'Their defense' },
            ]}
          />
          <PlayTypeTable rows={side === 'off' ? data.playTypes : data.defPlayTypes} defense={side === 'def'} />
        </Section>
      )}

      <Section title="Key players">
        {rep.threats.length > 0 && (
          <div className="card flush list">
            {rep.threats.map((th) => {
              const p = league.players[th.pid];
              return (
                <Link key={th.pid} to={`/player/${th.pid}`} className="mu-threat">
                  {p && <Avatar p={p} />}
                  <span className="grow">
                    <span className="lr-name ellipsis">
                      {th.name} {p && <Ovr v={p.ovr} size="sm" />}
                    </span>
                    <span className="lr-meta">{th.why}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        {data.players.length > 0 && (
          <More label={data.lastSeason ? `Their numbers (${seasonLabel(data.season)})` : 'Their numbers'}>
            <KeyPlayers d={data} />
            {data.players.some((p) => p.elsewhere) && <div className="mu-note">Newcomers show their numbers from their last team, without on/off.</div>}
          </More>
        )}
      </Section>

      {data.h2h.games.length > 0 && (
        <Section title="Head to head">
          <HeadToHead league={league} d={data} />
        </Section>
      )}
    </>
  );
}
