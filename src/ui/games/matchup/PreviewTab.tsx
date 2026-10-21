// The matchup page's Preview, for the user's next game against them: what you act on before the tip,
// in order (the hero above it holds the two teams, the chances and the billing): the staff's plan for
// tonight, the keys to the game, and the starting fives with who's out and the game-time decisions on
// his questionable players. More about tonight holds the rest a tap each: what the game is worth,
// both teams' form, what their coach has planned and the storylines a broadcast would lead with.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { League, ScheduledGame } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { edit, touch } from '../../../state/actions';
import { liveInProgress } from '../../../state/live';
import { ensureRotation } from '../../../core/league/games';
import { matchupPreview, type MatchupPreview, type SidePreview } from '../../../core/analysis/preview';
import { gameKeys } from '../../../core/analysis/keys';
import { storylines } from '../../../core/analysis/storylines';
import { formGuide } from '../../../core/analysis/gameStory';
import { gameStakes, pct as oddsPct } from '../../../core/analysis/odds';
import { GAME_TIME_PERF, setGameTime } from '../../../core/league/injuries';
import { injuryName, plural } from '../../../core/format';
import { K } from '../../../core/sim/engine';
import { CLASH_META, LINK_META } from '../../../core/sim/links';
import { Avatar, Empty, Help, Ovr, Section, Tag } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { OppPlanNote } from '../../components/scouting';
import { p0, rosterNames } from '../../stats';
import { teamPlayers } from '../../../core/league/helpers';
import { Briefing } from './Briefing';
import { Fold, TeamForm, useBillings } from '../occasion';

export function PreviewTab({ league, game, onPlan }: { league: League; game: ScheduledGame; onPlan: () => void }) {
  // the rotations as the game will start them (injuries since a team's last game): the starters shown are the real ones
  useEffect(() => {
    if (useStore.getState().sim) return;
    const { home, away } = game;
    touch((l) => {
      ensureRotation(l, home);
      ensureRotation(l, away);
    });
  }, [game, league.day]);
  const pv = useLeagueMemo(() => matchupPreview(league, game.gid), [league, game.gid]);
  if (!pv) return <Empty>This game is no longer on the schedule.</Empty>;
  const [away, home] = pv.usHome ? [pv.them, pv.us] : [pv.us, pv.them];
  const live = liveInProgress(league);
  const locked = live?.gid === game.gid;
  return (
    <>
      <Briefing league={league} opp={pv.them.tid} onPlan={onPlan} />
      <Keys league={league} game={game} />
      <StartingFives league={league} away={away} home={home} pv={pv} game={game} locked={locked} />
      <Tonight league={league} game={game} pv={pv} />
    </>
  );
}

/** The rest of tonight, a row each that opens: what it's worth, both teams' form, their coach's plan, the storylines. */
function Tonight({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const stakes = useLeagueMemo(() => gameStakes(league, game.gid, pv.us.tid), [league, game.gid, pv.us.tid]);
  // a game that changes nothing either way isn't worth the line
  const odds = stakes && Math.abs(stakes.win - stakes.loss) >= 0.01 ? stakes : null;
  const [, ...more] = useBillings(league, game);
  const tags = [
    pv.playoff?.tag,
    (pv.playoff?.elimination || pv.playIn?.elimination) && 'Elimination game',
    pv.playoff?.clinch && 'A win takes the series',
    ...[pv.us, pv.them].map((s) => s.b2b && `${league.teams[s.tid].abbrev} back-to-back`),
  ].filter((x): x is string => !!x);
  const stake = !!(odds || pv.playIn || tags.length || more.length);
  const c = pv.them.coach;
  const coach = !!(pv.oppPlan?.length || c.adjusts);
  const stories = useLeagueMemo(() => {
    const out = new Set([pv.us, pv.them].flatMap((s) => [...s.out, ...s.resting, ...s.questionable.filter((q) => !q.cleared)].map((p) => p.pid)));
    return storylines(league, game, out).slice(0, 3);
  }, [league, game, pv]);
  const forms = [pv.us.tid, pv.them.tid].map((tid) => {
    const f = formGuide(league, tid, 5);
    return { tid, f, text: `${league.teams[tid].abbrev} ${f.filter(Boolean).length}-${f.filter((w) => !w).length}` };
  });
  const form = forms.some((x) => x.f.length > 0);
  if (!stake && !coach && !stories.length && !form) return null;
  return (
    <Section title="More about tonight">
      <div className="card flush list">
        {stake && (
          <Fold
            title="What it's worth"
            peek={odds ? `Playoff odds ${oddsPct(odds.win)} with a win, ${oddsPct(odds.loss)} with a loss` : (tags[0] ?? more[0]?.tag ?? pv.playIn?.note ?? '')}
          >
            <div className="mu-fold">
              {odds && (
                <div className="mu-stakes">
                  Playoff odds with a win <b className="good num">{oddsPct(odds.win)}</b> · with a loss <b className="bad num">{oddsPct(odds.loss)}</b>
                </div>
              )}
              {pv.playIn && <div className="mu-stakes">{pv.playIn.note}</div>}
              {tags.length > 0 && (
                <div className="chips">
                  {tags.map((t) => (
                    <Tag key={t} tone={t === 'Elimination game' ? 'bad' : t === 'A win takes the series' ? 'good' : undefined}>
                      {t}
                    </Tag>
                  ))}
                </div>
              )}
              {more.length > 0 && (
                <ul className="mu-occ-more">
                  {more.slice(0, 3).map((b) => (
                    <li key={b.tag}>
                      <b>{b.tag}</b> {b.line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Fold>
        )}
        {form && (
          <Fold title="Form" peek={`Last five: ${forms.map((x) => x.text).join(' · ')}`}>
            <div className="mu-fold mu-forms">
              {forms.map(({ tid }) => (
                <span key={tid} className="mu-proj-fs">
                  <span className="mu-proj-ab">{league.teams[tid].abbrev}</span>
                  <TeamForm league={league} tid={tid} page />
                </span>
              ))}
            </div>
          </Fold>
        )}
        {coach && (
          <Fold title="Their coach" peek={c.adjusts ? `${c.name} adjusts ${c.adjusts}` : c.name}>
            <div className="mu-fold">
              {pv.oppPlan && pv.oppPlan.length > 0 && <OppPlanNote league={league} items={pv.oppPlan} day={pv.day} />}
              {c.adjusts && (
                <div className="small dim2">
                  {c.name} adjusts {c.adjusts} ({p0(c.chance)} at each break).
                </div>
              )}
            </div>
          </Fold>
        )}
        {stories.length > 0 && (
          <Fold title="Storylines" peek={stories[0].text}>
            <div className="list">
              {stories.map((st) => {
                const p = st.pids.length ? league.players[st.pids[0]] : undefined;
                return (
                  <div key={st.id} className="mu-story">
                    {p ? <Avatar p={p} /> : st.tids.length ? <TeamLogo tid={st.tids[0]} size={34} decorative /> : null}
                    <span className="grow">{st.text}</span>
                  </div>
                );
              })}
            </div>
          </Fold>
        )}
      </div>
    </Section>
  );
}

/** Tonight's keys to the game (see keys.ts): tracked live at the breaks, graded with the result. Each opens on why. */
function Keys({ league, game }: { league: League; game: ScheduledGame }) {
  const keys = useLeagueMemo(() => gameKeys(league, game), [league, game]);
  if (!keys.length) return null;
  return (
    <Section
      title="Keys to the game"
      right={
        <Help title="Keys to the game">
          <p>
            Three numbers to hit, from what both teams have done this season: what they do best, what their defense gives up or takes away, and the player they run their offense
            through. Each target is about where the number lands if both teams play to form, so hitting one is a real edge.
          </p>
          <p>The live game tracks them at every break and in the huddle; the recap grades them. Tap a key for why.</p>
        </Help>
      }
    >
      <div className="card flush list">
        {keys.map((k, i) => (
          <details key={k.id} className="mu-keyd">
            <summary className="mu-key">
              <span className="mu-key-n num" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="mu-key-t">{k.title}</span>
                <span className="mu-key-g">{k.goal}</span>
              </span>
            </summary>
            <div className="mu-key-why">{k.why}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}

/** His questionable players (sit or clear each) and both teams' out, resting and worn, as rows under the starting fives. */
function Availability({ league, pv, game, locked }: { league: League; pv: MatchupPreview; game: ScheduledGame; locked: boolean }) {
  const simming = useStore((s) => !!s.sim);
  const q = pv.us.questionable;
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
            <p>
              A player one game from returning from a minor or moderate injury (not a concussion) is questionable: he sits unless you clear him to play. The game counts as the one
              he had left either way.
            </p>
            <p>
              Cleared, he plays about {Math.round((1 - GAME_TIME_PERF) * 100)}% below his best and is {K.gameTimeRisk}× as likely to get hurt during the game. Other teams always
              sit theirs.
            </p>
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
                ? `About ${Math.round((1 - GAME_TIME_PERF) * 100)}% below his best, ${K.gameTimeRisk}× the injury risk${
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
}: {
  league: League;
  away: SidePreview;
  home: SidePreview;
  pv: MatchupPreview;
  game: ScheduledGame;
  locked: boolean;
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
          </span>
          {p.for && <span className="mu-five-for ellipsis">for {name(p.for.pid) || p.for.name}</span>}
        </span>
      </Link>
    );
  };
  return (
    <Section
      title="Starting fives"
      right={
        <Help title="Starting fives">
          The five each coach starts, from the depth charts, injuries and rest. A player in for a usual starter says for whom; who&apos;s out, resting or worn is under them.
        </Help>
      }
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
        {(away.links.length > 0 || home.links.length > 0 || away.crowd || home.crowd) && (
          <div className="mu-five mu-links">
            <FiveLinks league={league} s={away} name={names[0]} />
            <FiveLinks league={league} s={home} name={names[1]} right />
          </div>
        )}
        <Availability league={league} pv={pv} game={game} locked={locked} />
      </div>
    </Section>
  );
}

/** A starting five's partnerships worth naming (see sim/links.ts), and its crowded paint. */
function FiveLinks({ league, s, name, right }: { league: League; s: SidePreview; name: (pid: number) => string; right?: boolean }) {
  const who = (pid: number) => name(pid) || league.players[pid]?.lastName;
  return (
    <span className={`mu-links-side ${right ? 'r' : ''}`}>
      {s.links.map((l) => (
        <span key={`${l.id}-${l.a}-${l.b}`} className="mu-link">
          <b>{LINK_META[l.id].label}</b> {who(l.a)} → {who(l.b)}
          <span className="dim"> · {l.word}</span>
        </span>
      ))}
      {s.crowd && <span className="mu-link bad">{CLASH_META.crowd.label}</span>}
    </span>
  );
}
