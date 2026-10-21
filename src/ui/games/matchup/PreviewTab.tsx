// The matchup page's Preview, for the user's next game against them: what the night is billed as (a
// rivalry, a revenge game, Christmas Day, Game 7: see billingsFor), the staff's briefing and its
// plan for tonight, the projection, both teams' form and what the game is worth, the keys to the game, the injury report with the game-time decisions on his
// questionable players, the starting fives, what their coach has planned for tonight, and the
// storylines a broadcast would lead with.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Flame, History, Medal, Repeat, Star, TrendingUp, type LucideIcon } from 'lucide-react';
import type { League, ScheduledGame } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { edit, touch } from '../../../state/actions';
import { liveInProgress } from '../../../state/live';
import { ensureRotation } from '../../../core/league/games';
import { matchupPreview, type MatchupPreview, type SidePreview } from '../../../core/analysis/preview';
import { gameKeys } from '../../../core/analysis/keys';
import { storylines, type StorylineKind } from '../../../core/analysis/storylines';
import { gameStakes, pct as oddsPct } from '../../../core/analysis/odds';
import { GAME_TIME_PERF, setGameTime } from '../../../core/league/injuries';
import { injuryName, plural } from '../../../core/format';
import { K } from '../../../core/sim/engine';
import { Avatar, Empty, Help, Ovr, Section, Tag } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { OppPlanNote } from '../../components/scouting';
import { matchupColors } from '../../teamColors';
import { p0, rosterNames } from '../../stats';
import { teamPlayers } from '../../../core/league/helpers';
import { Briefing } from './Briefing';
import { TeamForm, useBillings } from '../occasion';

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
      <Occasion league={league} game={game} />
      <Briefing league={league} opp={pv.them.tid} onPlan={onPlan} />
      <Projection league={league} game={game} pv={pv} />
      <Keys league={league} game={game} />
      <InjuryReport league={league} pv={pv} game={game} locked={locked} />
      <StartingFives league={league} away={away} home={home} />
      <TheirNight league={league} pv={pv} />
      <Storylines league={league} game={game} pv={pv} />
    </>
  );
}

/** What the night is billed as: the biggest occasion first, in display type, the others under it. */
function Occasion({ league, game }: { league: League; game: ScheduledGame }) {
  const bills = useBillings(league, game);
  if (!bills.length) return null;
  const [top, ...rest] = bills;
  return (
    <section className={`mu-occ w${top.weight}`} aria-label="The occasion">
      <div className="mu-occ-tag">{top.tag}</div>
      <div className="mu-occ-line">{top.line}</div>
      {rest.length > 0 && (
        <ul className="mu-occ-more">
          {rest.slice(0, 3).map((b) => (
            <li key={b.tag}>
              <b>{b.tag}</b> {b.line}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Who's favoured and by how much, the win chance, the two teams' last five, and what tonight is worth in the playoff race. */
function Projection({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const { margin, win } = pv.projection;
  const me = league.teams[pv.us.tid];
  const them = league.teams[pv.them.tid];
  const fav = margin >= 0 ? me : them;
  const [cUs, cThem] = matchupColors(me.colors, them.colors);
  const tags = [
    pv.playoff && <Tag key="po">{pv.playoff.tag}</Tag>,
    (pv.playoff?.elimination || pv.playIn?.elimination) && (
      <Tag key="el" tone="bad">
        Elimination game
      </Tag>
    ),
    pv.playoff?.clinch && (
      <Tag key="cl" tone="good">
        A win takes the series
      </Tag>
    ),
    ...[pv.us, pv.them].map((s) => s.b2b && <Tag key={s.tid}>{`${league.teams[s.tid].abbrev} back-to-back`}</Tag>),
  ].filter(Boolean);
  return (
    <Section
      title={pv.days <= 0 ? 'Tonight' : pv.days === 1 ? 'Tomorrow' : `In ${pv.days} days`}
      right={
        <Help title="Projection">
          <p>
            An estimate, not a simulation: each team&apos;s net rating this season, weighted toward what its rotation for the game is worth until enough games are in, at the two
            teams&apos; pace, {pv.neutral ? 'with no home court on the neutral floor' : `plus home court (about ${Math.abs(pv.projection.edge).toFixed(1)} points)`}. One
            game&apos;s margin swings well either side of it.
          </p>
        </Help>
      }
    >
      <div className="mu-proj">
        <div className="mu-proj-top">
          <div className="mu-big">{Math.abs(margin) < 0.5 ? 'A toss-up' : `${fav.abbrev} by ${Math.abs(margin).toFixed(1)}`}</div>
          <div className="right">
            <div className="mu-big num">{p0(win)}</div>
            <div className="tiny dim">{me.abbrev} to win</div>
          </div>
        </div>
        <div className="mu-winbar" aria-hidden="true">
          <span style={{ flexGrow: win, background: cUs }} />
          <span style={{ flexGrow: 1 - win, background: cThem }} />
        </div>
        <div className="mu-proj-form">
          {[pv.us.tid, pv.them.tid].map((tid) => (
            <span key={tid} className="mu-proj-fs">
              <span className="tiny dim">{league.teams[tid].abbrev}</span>
              <TeamForm league={league} tid={tid} page />
            </span>
          ))}
        </div>
        <Stakes league={league} game={game} tid={pv.us.tid} />
        {pv.playIn && <div className="mu-stakes">{pv.playIn.note}</div>}
        {tags.length > 0 && <div className="chips">{tags}</div>}
      </div>
    </Section>
  );
}

/** What tonight is worth in the playoff race: the season forecast with the game won, and lost. */
function Stakes({ league, game, tid }: { league: League; game: ScheduledGame; tid: number }) {
  const s = useLeagueMemo(() => gameStakes(league, game.gid, tid), [league, game.gid, tid]);
  // a game that changes nothing either way isn't worth the line
  if (!s || Math.abs(s.win - s.loss) < 0.01) return null;
  return (
    <div className="mu-stakes">
      Playoff odds with a win <b className="good num">{oddsPct(s.win)}</b> · with a loss <b className="bad num">{oddsPct(s.loss)}</b>
    </div>
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

function InjuryReport({ league, pv, game, locked }: { league: League; pv: MatchupPreview; game: ScheduledGame; locked: boolean }) {
  const simming = useStore((s) => !!s.sim);
  const q = pv.us.questionable;
  const rot = league.teams[pv.us.tid].rotation;
  const sides = [pv.us, pv.them];
  const clean = sides.every((s) => !s.out.length && !s.resting.length && !s.worn.length) && !q.length;
  return (
    <Section
      title="Injury report"
      right={
        q.length > 0 ? (
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
        ) : undefined
      }
    >
      {clean ? (
        <div className="mu-note">Everyone is available on both sides.</div>
      ) : (
        <div className="card flush list">
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
        </div>
      )}
    </Section>
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
function StartingFives({ league, away, home }: { league: League; away: SidePreview; home: SidePreview }) {
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
      right={<Help title="Starting fives">The five each coach starts, from the depth charts, injuries and rest. A player in for a usual starter says for whom.</Help>}
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
      </div>
    </Section>
  );
}

/** What their coach has planned for this game, and how often he changes things in one. */
function TheirNight({ league, pv }: { league: League; pv: MatchupPreview }) {
  const c = pv.them.coach;
  if (!pv.oppPlan?.length && !c.adjusts) return null;
  return (
    <Section title="Their coach">
      <div className="mu-group">
        {pv.oppPlan && pv.oppPlan.length > 0 && <OppPlanNote league={league} items={pv.oppPlan} day={pv.day} />}
        {c.adjusts && (
          <div className="small dim2">
            {c.name} adjusts {c.adjusts} ({p0(c.chance)} at each break).
          </div>
        )}
      </div>
    </Section>
  );
}

const STORY_ICON: Record<StorylineKind, LucideIcon> = { revenge: History, milestone: Medal, streak: TrendingUp, hot: Flame, rematch: Repeat, mvp: Crown, picks: Star };

/** What a broadcast would lead with (see storylines.ts): the top three, each with the jersey of the player it's about. */
function Storylines({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const stories = useLeagueMemo(() => {
    const out = new Set([pv.us, pv.them].flatMap((s) => [...s.out, ...s.resting, ...s.questionable.filter((q) => !q.cleared)].map((p) => p.pid)));
    return storylines(league, game, out).slice(0, 3);
  }, [league, game, pv]);
  if (!stories.length) return null;
  return (
    <Section title="Storylines">
      <div className="card flush list">
        {stories.map((st) => {
          const Icon = STORY_ICON[st.kind];
          const p = st.pids.length ? league.players[st.pids[0]] : undefined;
          return (
            <div key={st.id} className="mu-story">
              {p ? <Avatar p={p} /> : st.tids.length ? <TeamLogo tid={st.tids[0]} size={34} decorative /> : null}
              <span className="grow">{st.text}</span>
              <Icon size={15} className="dim" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </Section>
  );
}
