// The matchup page's Brief: the two teams as numbers, before anything is decided. Both teams' league
// ranks side by side, the starting fives with who's out and the game-time decisions on his
// questionable players (when a meeting is left), their threats with their numbers, and the rest of
// the scouting a tap down: how they play, their play types, everyone's numbers, the meetings so far
// and what their coach has planned. The chance to win is on the board above it; the Game Plan tab is
// where anything is changed.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { League, ScheduledGame } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { edit, touch } from '../../../state/actions';
import { liveInProgress } from '../../../state/live';
import { ensureRotation } from '../../../core/league/games';
import { matchupPreview, type MatchupPreview, type SidePreview } from '../../../core/analysis/preview';
import { scoutTeam } from '../../../core/ai/advisor';
import { SCOUT_MIN_GAMES, scoutData } from '../../../core/analysis/scouting';
import { seasonLabel } from '../../../core/constants';
import { setGameTime } from '../../../core/league/injuries';
import { injuryName, plural, signed } from '../../../core/format';
import { Avatar, Help, Ovr, Section, Segmented, Tag } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { TeamLogo } from '../../components/TeamLogo';
import { HeadToHead, KeyPlayers, OppPlanNote, PlayTypeTable, RankCompare, scoutSource } from '../../components/scouting';
import { rosterNames } from '../../stats';
import { teamPlayers } from '../../../core/league/helpers';
import { FormMark } from '../../components/FormMark';
import { Fold } from '../occasion';

/**
 * `game`: the next meeting with them, if one is left; `next`: it is the user's next game (its
 * rotations are set as it will tip off, and his game-time decisions are his to make here).
 */
export function BriefTab({ league, opp, game, next }: { league: League; opp: number; game?: ScheduledGame; next: boolean }) {
  // the rotations as the game will start them (injuries since a team's last game): the starters shown are the real ones
  useEffect(() => {
    if (!game || !next || useStore.getState().sim) return;
    const { home, away } = game;
    touch((l) => {
      ensureRotation(l, home);
      ensureRotation(l, away);
    });
  }, [game, next, league.day]);
  const gid = game?.gid;
  const pv = useLeagueMemo(() => (gid !== undefined ? matchupPreview(league, gid) : null), [league, gid]);
  const [away, home] = pv ? (pv.usHome ? [pv.them, pv.us] : [pv.us, pv.them]) : [];
  const locked = !!game && liveInProgress(league)?.gid === game.gid;
  // what the night is, as facts: a series game that ends a season, a second night in two
  const tags = pv
    ? [
        pv.playoff?.tag,
        (pv.playoff?.elimination || pv.playIn?.elimination) && 'Elimination game',
        pv.playoff?.clinch && 'A win takes the series',
        pv.playIn?.note,
        ...[pv.us, pv.them].map((s) => s.b2b && `${league.teams[s.tid].abbrev} on a back-to-back`),
      ].filter((x): x is string => !!x)
    : [];
  return (
    <>
      {tags.length > 0 && (
        <div className="chips mu-tags">
          {tags.map((t) => (
            <Tag key={t} tone={t === 'Elimination game' ? 'bad' : t === 'A win takes the series' ? 'good' : undefined}>
              {t}
            </Tag>
          ))}
        </div>
      )}
      <Numbers league={league} opp={opp} />
      {game && pv && away && home && <StartingFives league={league} away={away} home={home} pv={pv} game={game} locked={locked} decide={next} />}
      <Threats league={league} opp={opp} />
      <Scouting league={league} opp={opp} pv={pv} />
    </>
  );
}

/** Both teams' league ranks side by side: the ratings first, the four factors and the shot mix a tap down. */
function Numbers({ league, opp }: { league: League; opp: number }) {
  const me = league.userTid;
  const us = useLeagueMemo(() => scoutData(league, me), [league, me]);
  const them = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const [all, setAll] = useState(false);
  return (
    <Section
      title="By the numbers"
      right={
        them.enough && us.enough ? (
          <span className="row" style={{ gap: 6 }}>
            <span className="tiny dim">{scoutSource(them)}</span>
            <Help title="By the numbers">
              <p>Each team&apos;s figure and where it ranks in the league. Ratings are points per 100 possessions.</p>
            </Help>
          </span>
        ) : undefined
      }
    >
      {us.enough && them.enough ? (
        <>
          <RankCompare league={league} a={us} b={them} part={all ? undefined : 'main'} />
          {!all && (
            <button className="gs-more" onClick={() => setAll(true)}>
              Four factors and shot mix
            </button>
          )}
        </>
      ) : (
        <div className="mu-note">League ranks come after {SCOUT_MIN_GAMES} games.</div>
      )}
    </Section>
  );
}

/** Their threats: who the scouts name, why, and his numbers. */
function Threats({ league, opp }: { league: League; opp: number }) {
  const rep = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  if (!rep.threats.length) return null;
  const line = new Map(data.players.map((p) => [p.pid, p]));
  return (
    <Section title="Their threats" right={data.players.length > 0 && data.lastSeason ? <span className="tiny dim">{seasonLabel(data.season)} numbers</span> : undefined}>
      <div className="card flush list">
        {rep.threats.map((th) => {
          const p = league.players[th.pid];
          const n = line.get(th.pid);
          return (
            <Link key={th.pid} to={`/player/${th.pid}`} className="mu-threat">
              {p && <Avatar p={p} />}
              <span className="grow">
                <span className="lr-name ellipsis">
                  {th.name} {p && <Ovr v={p.ovr} size="sm" />}
                </span>
                <span className="lr-meta">{th.why}</span>
                {n && (
                  <span className="lr-meta num">
                    {n.pts.toFixed(1)} PTS · {(n.ts * 100).toFixed(1)}% TS · {(n.usg * 100).toFixed(0)}% USG
                    {n.on !== undefined && n.off !== undefined ? ` · on/off ${signed(n.on - n.off)}` : ''}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

function Bullets({ items, tone }: { items: string[]; tone?: 'good' | 'info' }) {
  return (
    <ul className={`mu-bullets ${tone ?? ''}`}>
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

/** The rest of the scouting, a row each that opens: how they play, play types, their numbers, the meetings, their coach. */
function Scouting({ league, opp, pv }: { league: League; opp: number; pv: MatchupPreview | null }) {
  const rep = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const [side, setSide] = useState<'off' | 'def'>('off');
  const how = [...(data.enough ? data.tendencies : []), ...rep.offense, ...rep.defense].filter(Boolean);
  const c = pv?.them.coach;
  const coach = !!c && !!(pv?.oppPlan?.length || c.adjusts);
  return (
    <Section title="More scouting">
      <div className="card flush list">
        <Fold title="How they play" peek={how[0]}>
          <div className="mu-fold">
            <Bullets items={how} tone="info" />
            <div className="mu-sub-h">Where to attack</div>
            {rep.weaknesses.length ? <Bullets items={rep.weaknesses} tone="good" /> : <div className="mu-note">No obvious weakness: win the possession battle.</div>}
          </div>
        </Fold>
        {data.enough && data.playTypes.length > 0 && (
          <Fold
            title="Play types"
            peek={`Points per possession over ${plural(data.ptGames, 'game')}`}
            help={
              <Help title="Play types">
                <p>
                  <Term id="ppp">PPP</Term> by how the trip ended. Green is better than the league, red worse, shown only past chance.
                </p>
              </Help>
            }
          >
            <div className="mu-fold">
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
            </div>
          </Fold>
        )}
        {data.players.length > 0 && (
          <Fold title="Their numbers" peek={data.lastSeason ? seasonLabel(data.season) : `${data.players.length} in the rotation`}>
            <div className="mu-fold">
              <KeyPlayers d={data} />
              {data.players.some((p) => p.elsewhere) && <div className="mu-note">Newcomers show their numbers from their last team, without on/off.</div>}
            </div>
          </Fold>
        )}
        {data.h2h.games.length > 0 && (
          <Fold title="Head to head" peek={`${data.h2h.won}-${data.h2h.lost} this season and last`}>
            <div className="mu-fold">
              <HeadToHead league={league} d={data} />
            </div>
          </Fold>
        )}
        {coach && c && pv && (
          <Fold title="Their coach" peek={c.adjusts ? `${c.name} adjusts ${c.adjusts}` : c.name}>
            <div className="mu-fold">
              {pv.oppPlan && pv.oppPlan.length > 0 && <OppPlanNote league={league} items={pv.oppPlan} day={pv.day} />}
              {c.adjusts && <div className="small dim2">{c.name} may adjust at each break.</div>}
            </div>
          </Fold>
        )}
      </div>
    </Section>
  );
}

/** His questionable players (sit or clear each) and both teams' out, resting and worn, as rows under the starting fives. */
function Availability({ league, pv, game, locked, decide }: { league: League; pv: MatchupPreview; game: ScheduledGame; locked: boolean; decide: boolean }) {
  const simming = useStore((s) => !!s.sim);
  // (his questionable players are for his next game: a later meeting has none yet)
  const q = decide ? pv.us.questionable : [];
  const rot = league.teams[pv.us.tid].rotation;
  const sides = [pv.us, pv.them];
  const clean = sides.every((s) => !s.out.length && !s.resting.length && !s.worn.length) && !q.length;
  if (clean) return <div className="mu-five-foot">Everyone is available on both sides.</div>;
  return (
    <>
      {q.length > 0 && (
        <div className="list-divider mu-avail-h">
          <span>Game-time decisions</span>
          <Help title="Game-time decisions">
            <p>A player one game from returning is questionable, and sits unless you clear him. Cleared, he plays below his best, with a higher injury risk.</p>
          </Help>
        </div>
      )}
      {q.map((p) => (
        <div key={p.pid} className="mu-q">
          <div className="mu-q-row">
            <Tag tone={p.cleared ? 'good' : 'warn'}>{p.cleared ? 'Playing' : 'Game-time'}</Tag>
            {/* (wraps beside the button rather than cutting the injury short) */}
            <Link to={`/player/${p.pid}`} className="grow mu-q-who">
              <b>{p.name}</b> <span className="dim">{injuryName(p.injury)}</span>
            </Link>
            <button
              className={`btn xs ${p.cleared ? '' : 'primary'}`}
              disabled={locked || simming}
              // (named by what a tap does, so no pressed state: "Sit him, pressed" would read backwards)
              aria-label={p.cleared ? `Sit ${p.name}` : `Clear ${p.name} to play`}
              onClick={() => edit((l) => setGameTime(l, game.gid, p.pid, !p.cleared))}
            >
              {p.cleared ? 'Sit him' : 'Clear to play'}
            </button>
          </div>
          <div className="mu-note">
            {locked
              ? 'Settled at tip-off.'
              : p.cleared
                ? `He'd play below his best, with a higher injury risk${
                    rot.manual ? (rot.minutes[p.pid] ? ` · ${rot.minutes[p.pid]} min in your rotation` : ' · no minutes in your rotation') : ''
                  }.`
                : 'Sits unless you clear him.'}
          </div>
        </div>
      ))}
      {sides.map((s) => (
        <SideInjuries key={s.tid} league={league} s={s} />
      ))}
    </>
  );
}

/** One team's out, resting and worn players, under its name. */
function SideInjuries({ league, s }: { league: League; s: SidePreview }) {
  if (!s.out.length && !s.resting.length && !s.worn.length) return null;
  return (
    <>
      <div className="mu-inj-h">
        <TeamLogo tid={s.tid} size={18} decorative /> {league.teams[s.tid].abbrev}
      </div>
      {s.out.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="mu-inj">
          <Tag tone="bad">Out</Tag>
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className="dim">{injuryName(p.injury)}</span>
          </span>
          <span className="tiny dim num nowrap">{plural(p.games, 'game')}</span>
        </Link>
      ))}
      {s.resting.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="mu-inj">
          <Tag tone="warn">Rest</Tag>
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className="dim">back-to-back</span>
          </span>
        </Link>
      ))}
      {s.worn.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="mu-inj">
          <Tag>Worn</Tag>
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className="dim">heavy legs</span>
          </span>
          <span className="tiny dim num nowrap">wear {p.wear}</span>
        </Link>
      ))}
    </>
  );
}

/** The two starting fives side by side, away on the left: jerseys facing each other. */
function StartingFives({
  league,
  away,
  home,
  pv,
  game,
  locked,
  decide,
}: {
  league: League;
  away: SidePreview;
  home: SidePreview;
  pv: MatchupPreview;
  game: ScheduledGame;
  locked: boolean;
  /** His next game: the game-time decisions are his to make here. */
  decide: boolean;
}) {
  const rows = Array.from({ length: Math.max(away.starters.length, home.starters.length) }, (_, i) => [away.starters[i], home.starters[i]] as const);
  // teammates who share a last name told apart ("Jal. Williams", "Jay. Williams"), the usual starter one stands in for too
  const [aTid, hTid] = [away.tid, home.tid];
  const names = useLeagueMemo(() => [aTid, hTid].map((tid) => rosterNames(teamPlayers(league, tid))), [league, aTid, hTid]);
  const cell = (p: SidePreview['starters'][number] | undefined, right: boolean) => {
    const pl = p ? league.players[p.pid] : undefined;
    if (!p || !pl) return <span />;
    const name = names[right ? 1 : 0];
    return (
      <Link to={`/player/${p.pid}`} className={`mu-five-p ${right ? 'r' : ''}`}>
        <Avatar p={pl} />
        <span className="mu-five-who">
          {/* (a long name wraps, at its hyphen if it has one: "Gilgeous-" over "Alexander") */}
          <span className="mu-five-n">{name(p.pid) || pl.lastName}</span>
          <span className="mu-five-m">
            {p.pos} <Ovr v={p.ovr} size="sm" />
            {/* (on a tear or in a slump on the night: the form the engine plays him at) */}
            <FormMark league={league} p={pl} day={game.day} />
          </span>
          {p.for && <span className="mu-five-for ellipsis">for {name(p.for.pid) || p.for.name}</span>}
        </span>
      </Link>
    );
  };
  return (
    <Section
      title="Starting fives"
      right={<Help title="Starting fives">The five each coach starts, after injuries and rest. Who&apos;s out, resting or worn is listed under them.</Help>}
    >
      <div className="card flush">
        <div className="mu-fives-h">
          <span>
            <TeamLogo tid={away.tid} size={18} decorative /> {league.teams[away.tid].abbrev}
          </span>
          <span>
            {league.teams[home.tid].abbrev} <TeamLogo tid={home.tid} size={18} decorative />
          </span>
        </div>
        {rows.map(([a, h], i) => (
          <div key={i} className="mu-five">
            {cell(a, false)}
            {cell(h, true)}
          </div>
        ))}
        <Availability league={league} pv={pv} game={game} locked={locked} decide={decide} />
      </div>
    </Section>
  );
}
