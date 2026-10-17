// The pre-game screen, a broadcast's pre-game show: both teams on one slab, the projection, the
// storylines and keys, who's out and the game-time decisions on your questionable players, the
// starting fives, how they play, the matchups on their best players and your game plan for them,
// with Tip off, Quick sim and the Lab one tap away.
import { gameKeys } from '../../core/analysis/keys';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Beaker, ChevronRight, Crown, Eye, FastForward, Flame, History, Medal, Plus, Repeat, Star, TrendingUp, X, type LucideIcon } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { liveInProgress } from '../../state/live';
import { progressCallback, resetLab, withLab } from '../../state/labClient';
import type { LabSide, LabSummary } from '../../core/ai/lab';
import { counterCandidates } from '../../core/ai/advisor';
import { buildSimInput, ensureRotation } from '../../core/league/games';
import { planFor, removePlanItem, setPlanItem, setPlanMatchup, setPlanPlayerD } from '../../core/league/gamePlans';
import { guardAdvice } from '../../core/analysis/guarding';
import { PLAYER_D_META } from '../../core/sim/tactics';
import { cupLabel } from '../../core/league/cup';
import { fmtDate, teamPlayers } from '../../core/league/helpers';
import { hashString } from '../../core/random';
import { countdownLabel, matchupPreview, nextUserGame, type MatchupPreview, type SidePreview } from '../../core/analysis/preview';
import { PLAYER_DEFENSES, type GameType, type League, type PlayerDefense, type ScheduledGame } from '../../core/types';
import { storylines, type StorylineKind } from '../../core/analysis/storylines';
import { gameStakes, pct as oddsPct } from '../../core/analysis/odds';
import { GAME_TIME_PERF, injuryText, setGameTime } from '../../core/league/injuries';
import { K } from '../../core/sim/engine';
import { Avatar, Chips, Empty, Help, Ovr, PageHeader, Section, Spinner, Statline, Tag } from '../components/ui';
import { OppPlanNote } from '../components/scouting';
import { TeamLogo } from '../components/TeamLogo';
import { matchupColors, slabVars } from '../teamColors';
import { flowActions } from '../flow';
import { useFlowRunner } from '../useFlow';
import { f1, ordinal, p0, rosterNames, signed } from '../stats';
import '../components/gameday.css';
import './tactics.css';

const confWord = (c: 'E' | 'W') => (c === 'E' ? 'East' : 'West');
const rankText = (r: { rank: number }) => (r.rank ? ordinal(r.rank) : '—');

/** Lab games are the kind being played: in the postseason, the play-in's or the playoffs'. */
const labType = (g: ScheduledGame): GameType => (g.type === 'playoffs' || g.type === 'playin' ? g.type : 'regular');

function labSide(league: League, tid: number, g: ScheduledGame): LabSide {
  const opp = g.home === tid ? g.away : g.home;
  const input = buildSimInput(league, tid, g.day, labType(g), opp, g);
  // (the season history is never read by a game: it stays out of the message to the worker)
  return { ...input, team: { ...input.team, seasons: [] } };
}

export default function Preview() {
  const league = useLeague();
  const { gid } = useParams();
  const asked = gid !== undefined ? league.schedule.find((g) => g.gid === Number(gid)) : undefined;
  const game = gid !== undefined ? asked : nextUserGame(league);
  const simming = useStore((s) => !!s.sim);
  // the rotations as the game will start them (injuries since a team's last game): the starters shown are the real ones
  const ready = !!game && !game.played;
  useEffect(() => {
    if (!game || game.played || useStore.getState().sim) return;
    const { home, away } = game;
    useStore.getState().mutate((l) => {
      ensureRotation(l, home);
      ensureRotation(l, away);
    }, false);
  }, [game, league.day]);
  const pv = useLeagueMemo(() => (game && ready ? matchupPreview(league, game.gid) : null), [league, game, ready]);

  if (!game || !pv) {
    const res = gid !== undefined ? league.games.find((g) => g.gid === Number(gid)) : undefined;
    return (
      <main className="page">
        <PageHeader title="Preview" back backTo="/" />
        <Empty>
          {res
            ? 'This game has been played.'
            : game?.played
              ? 'This game has been played.'
              : gid !== undefined
                ? 'This game is not on the schedule.'
                : 'No game coming up for your team.'}
        </Empty>
        {res && (
          <Link to={`/game/${res.gid}`} className="btn primary block">
            Game report
          </Link>
        )}
      </main>
    );
  }
  return <PreviewBody league={league} game={game} pv={pv} simming={simming} />;
}

function PreviewBody({ league, game, pv, simming }: { league: League; game: ScheduledGame; pv: MatchupPreview; simming: boolean }) {
  const nav = useNavigate();
  const run = useFlowRunner();
  const today = game.day === league.day;
  const opp = pv.them.tid;
  const typeLabel = cupLabel(league, game) ?? (game.type === 'playoffs' ? 'Playoffs' : game.type === 'playin' ? 'Play-In' : 'Regular season');
  const [away, home] = pv.usHome ? [pv.them, pv.us] : [pv.us, pv.them];
  const live = today ? liveInProgress(league) : null;
  const inProgress = !!live && live.gid === game.gid;
  const actions = flowActions(league);
  const resume = inProgress ? actions.find((a) => a.cmd === 'watchLive') : undefined;
  const finish = inProgress ? actions.find((a) => a.cmd === 'quickGame') : undefined;
  const them = league.teams[opp];
  // each half of the slab in its team's colours
  const a = slabVars(league.teams[away.tid].colors);
  const h = slabVars(league.teams[home.tid].colors);
  const slab = { '--pv-a': a['--slab'], '--pv-a2': a['--slab-2'], '--pv-h': h['--slab'], '--pv-h2': h['--slab-2'] } as CSSProperties;
  const last = pv.series.games[pv.series.games.length - 1];
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
    <main className="page">
      <PageHeader title="Preview" back backTo="/" />

      <section className="slab pv-slab" style={slab} aria-label={`${league.teams[away.tid].name} ${pv.neutral ? 'vs' : 'at'} ${league.teams[home.tid].name}`}>
        <span className="pv-mark l">
          <TeamLogo tid={away.tid} size={170} decorative />
        </span>
        <span className="pv-mark r">
          <TeamLogo tid={home.tid} size={170} decorative />
        </span>
        <div className="pv-over">
          <span>{pv.playoff ? pv.playoff.label : typeLabel}</span>
          <span>{fmtDate(league.season, game.day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
        <div className="pv-match">
          <TeamSide league={league} s={away} />
          <div className="pv-mid">
            <span className="pv-at">{pv.neutral ? 'vs' : '@'}</span>
            <span className="pv-when">{inProgress ? 'Live' : countdownLabel(pv.days)}</span>
          </div>
          <TeamSide league={league} s={home} home />
        </div>
        {tags.length > 0 && <div className="chips pv-tags">{tags}</div>}
        {(pv.playoff || pv.playIn || pv.series.total > 0) && (
          <dl className="tx-facts">
            {pv.playoff && (
              <Fact k="Series">
                {league.teams[pv.us.tid].abbrev} {pv.playoff.wins}-{pv.playoff.losses}
                {pv.playoff.homeCourt ? ' · home court' : ''}
              </Fact>
            )}
            {pv.playIn && <Fact k="Play-In">{pv.playIn.note}</Fact>}
            {pv.series.total > 0 && (
              <Fact k="Season">
                {pv.series.won}-{pv.series.lost}
                {pv.series.meeting ? ` · meeting ${pv.series.meeting} of ${pv.series.total}` : ''}
                {last && (
                  <>
                    {' · last '}
                    <Link to={`/game/${last.gid}`} className="pv-link">
                      {`${last.won ? 'W' : 'L'} ${last.us}-${last.them}`}
                    </Link>
                  </>
                )}
              </Fact>
            )}
          </dl>
        )}
      </section>

      {pv.userGame && <ProjectionCard league={league} game={game} pv={pv} />}

      <StorylinesCard league={league} game={game} pv={pv} />

      {pv.userGame && <KeysCard league={league} game={game} />}

      <Section
        title="Injury report"
        right={
          pv.us.questionable.length > 0 ? (
            <Help title="Questionable players">
              <p>
                A player one game from returning from a minor or moderate injury (not a concussion) is questionable: he sits tonight unless you clear him to play. Tonight still
                counts as the game he had left either way.
              </p>
              <p>
                Cleared, he plays about {Math.round((1 - GAME_TIME_PERF) * 100)}% below his best (his shots, his creation, how much the offense looks for him and, a little, his
                defense) and is {K.gameTimeRisk}× as likely to get hurt during the game. Other teams always sit theirs.
              </p>
            </Help>
          ) : undefined
        }
      >
        <div className="card flush pv-inj">
          {[pv.us, pv.them].map((s) => (
            <InjuryList key={s.tid} league={league} s={s} game={game} locked={inProgress} />
          ))}
        </div>
      </Section>

      <StartingFives league={league} away={away} home={home} />

      <TendenciesCard league={league} s={pv.them} pv={pv} />

      {pv.userGame && <MatchupsCard league={league} game={game} pv={pv} />}

      {pv.userGame && <PlanCard league={league} game={game} opp={opp} />}

      {pv.userGame && (
        <div className="gd-dock" role="group" aria-label="Game actions">
          {today ? (
            <>
              <button className="btn primary" disabled={simming} onClick={() => nav('/live')} aria-label={resume?.label ?? `Tip off against the ${them.name}`}>
                <Eye size={17} /> {resume ? 'Resume' : 'Tip off'}
              </button>
              <button className="btn" disabled={simming} onClick={() => void run({ id: 'quick', label: '', cmd: 'quickGame' })} aria-label={finish?.label ?? 'Quick sim this game'}>
                <FastForward size={17} /> {finish ? 'Finish' : 'Quick sim'}
              </button>
            </>
          ) : (
            <button className="btn primary pv-span2" disabled={simming} onClick={() => void useStore.getState().simulate({ kind: 'untilUserGame' })}>
              <FastForward size={17} /> Sim to game day
            </button>
          )}
          <Link to={`/lab?opp=${opp}`} className="btn" aria-label={`Lab: test a plan against the ${them.name}`}>
            <Beaker size={17} /> Lab
          </Link>
        </div>
      )}
    </main>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="tx-fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TeamSide({ league, s, home }: { league: League; s: SidePreview; home?: boolean }) {
  const t = league.teams[s.tid];
  const played = s.won + s.lost > 0;
  return (
    <Link to={`/team/${s.tid}`} className={`pv-side ${home ? 'home' : ''}`}>
      <TeamLogo tid={s.tid} size={58} decorative />
      <span className="pv-ab">{t.abbrev}</span>
      <span className="pv-rec num">
        {s.won}-{s.lost}
      </span>
      <span className="pv-meta num">
        {s.confRank && played ? `${ordinal(s.confRank)} ${confWord(s.conf)}` : confWord(s.conf)}
        {s.streak ? ` · ${s.streak > 0 ? `W${s.streak}` : `L${-s.streak}`}` : ''}
      </span>
      {played && <span className="pv-meta num">L10 {s.lastTen}</span>}
    </Link>
  );
}

function ProjectionCard({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const { margin, win } = pv.projection;
  const me = league.teams[pv.us.tid];
  const them = league.teams[pv.them.tid];
  const fav = margin >= 0 ? me : them;
  const [cUs, cThem] = matchupColors(me.colors, them.colors);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<{ gid: number; r: LabSummary } | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // leaving mid-run stops the worker so the next visit isn't queued behind stale sims
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (busyRef.current) resetLab();
    };
  }, []);
  const GAMES = 40;
  const simulate = async () => {
    setBusy(true);
    setDone(0);
    try {
      useStore.getState().mutate((l) => {
        ensureRotation(l, game.home);
        ensureRotation(l, game.away);
      }, false);
      const a = labSide(league, pv.us.tid, game);
      const b = labSide(league, pv.them.tid, game);
      const venue = pv.neutral ? 'neutral' : pv.usHome ? 'a' : 'b';
      const r = await withLab((w) =>
        w.runLab(
          { a, b, games: GAMES, seed: hashString(`${league.id}:${game.gid}:preview`), type: labType(game), venue },
          progressCallback((n) => mounted.current && setDone(n)),
        ),
      );
      if (mounted.current) setResult({ gid: game.gid, r });
    } catch (e) {
      console.error(e);
      if (mounted.current) useStore.getState().toast(`The lab could not finish: ${e instanceof Error ? e.message : 'unknown error'}`, 'bad');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const shown = result?.gid === game.gid ? result.r : null;
  const avg = shown ? shown.margins.reduce((x, y) => x + y, 0) / shown.margins.length : 0;
  return (
    <Section
      title="Projection"
      right={
        <Help title="Projection">
          <p>
            An estimate, not a simulation: each team&apos;s net rating this season, weighted toward what its rotation tonight is worth until enough games are in, at the two
            teams&apos; pace, {pv.neutral ? 'with no home court on the neutral floor' : `plus home court (about ${Math.abs(pv.projection.edge).toFixed(1)} points)`}. A game&apos;s
            margin varies by about 13 points either way.
          </p>
          <p>Simulate plays the real engine with both game plans, rests and injuries as they stand, at tonight&apos;s venue.</p>
        </Help>
      }
    >
      <div className="card pv-proj">
        <div className="pv-proj-top">
          <div className="grow">
            <div className="over">Estimate</div>
            <div className="pv-big">{Math.abs(margin) < 0.5 ? 'A toss-up' : `${fav.abbrev} by ${Math.abs(margin).toFixed(1)}`}</div>
          </div>
          <div className="pv-proj-win">
            <div className="over">{me.abbrev} to win</div>
            <div className="pv-big num">{p0(win)}</div>
          </div>
        </div>
        <div className="pv-winbar" aria-hidden="true">
          <span style={{ flexGrow: win, background: cUs }} />
          <span style={{ flexGrow: 1 - win, background: cThem }} />
        </div>
        <div className="pv-winbar-l">
          <span>{me.abbrev}</span>
          <span>{them.abbrev}</span>
        </div>
        <Stakes league={league} game={game} tid={pv.us.tid} />
        {busy ? (
          <div className="col pv-busy">
            <div className="row">
              <Spinner />
              <span className="small dim2 grow">Simulating {GAMES} games…</span>
              <span className="small num dim">
                {Math.min(done, GAMES)}/{GAMES}
              </span>
            </div>
            <div className="bar" role="progressbar" aria-label="Simulation progress" aria-valuemin={0} aria-valuemax={GAMES} aria-valuenow={Math.min(done, GAMES)}>
              <div className="tx-fill" style={{ width: `${Math.min(100, (done / GAMES) * 100)}%` }} />
            </div>
          </div>
        ) : shown ? (
          <div className="pv-sim">
            <div className="over">
              {me.abbrev} won {shown.wins} of {shown.games} engine games
            </div>
            <Statline
              items={[
                { k: 'Win %', v: p0(shown.winPct) },
                { k: 'Avg score', v: `${Math.round(shown.ptsFor)}-${Math.round(shown.ptsAgainst)}`, s: `${f1(shown.ptsFor)}-${f1(shown.ptsAgainst)} (${signed(avg)})` },
                { k: 'Net rtg', v: signed(shown.net), s: `± ${f1(2 * shown.netSE)} per 100` },
              ]}
            />
          </div>
        ) : null}
        <button className="btn sm block" disabled={busy} onClick={() => void simulate()}>
          <Beaker size={15} /> {shown ? 'Simulate again' : `Simulate ${GAMES} games`}
        </button>
      </div>
    </Section>
  );
}

/** What tonight is worth in the playoff race (see gameStakes): the season forecast with the game won, and lost. */
function Stakes({ league, game, tid }: { league: League; game: ScheduledGame; tid: number }) {
  const s = useLeagueMemo(() => gameStakes(league, game.gid, tid), [league, game.gid, tid]);
  // a game that changes nothing either way (in or out whatever happens) isn't worth the line
  if (!s || Math.abs(s.win - s.loss) < 0.01) return null;
  return (
    <div className="pv-stakes">
      <span className="over">Playoff odds</span>
      <span>
        with a win <b className="good">{oddsPct(s.win)}</b> · with a loss <b className="bad">{oddsPct(s.loss)}</b>
      </span>
    </div>
  );
}

/** Tonight's keys to the game (see keys.ts): tracked live at the breaks, graded with the result. */
function KeysCard({ league, game }: { league: League; game: ScheduledGame }) {
  const keys = useLeagueMemo(() => gameKeys(league, game), [league, game]);
  if (!keys.length) return null;
  return (
    <Section
      title="Keys to the game"
      right={
        <Help title="Keys to the game">
          <p>
            Three numbers to hit tonight, from what both teams have done this season: what they do best, what their defense gives up or takes away, and the player they run their
            offense through. Each target is about where tonight&apos;s number lands if both teams play to form, so hitting one is a real edge.
          </p>
          <p>The live game tracks them at every break and in the huddle, and the recap grades them.</p>
        </Help>
      }
    >
      <ol className="card flush list pv-keys">
        {keys.map((k, i) => (
          <li key={k.id} className="pv-key">
            <span className="pv-key-n num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="grow">
              <span className="pv-key-t">{k.title}</span>
              <span className="pv-key-g">{k.goal}</span>
              <span className="lr-meta">{k.why}</span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Icons by storyline kind. */
const STORY_ICON: Record<StorylineKind, LucideIcon> = { revenge: History, milestone: Medal, streak: TrendingUp, hot: Flame, rematch: Repeat, mvp: Crown, picks: Star };

/** What a broadcast would lead with tonight (see storylines.ts): the top four, each with the jersey of the player it's about. */
function StorylinesCard({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const stories = useLeagueMemo(() => {
    const out = new Set([pv.us, pv.them].flatMap((s) => [...s.out, ...s.resting, ...s.questionable.filter((q) => !q.cleared)].map((p) => p.pid)));
    return storylines(league, game, out).slice(0, 4);
  }, [league, game, pv]);
  if (!stories.length) return null;
  return (
    <Section title="Storylines">
      <div className="card flush list">
        {stories.map((st) => {
          const Icon = STORY_ICON[st.kind];
          const p = st.pids.length ? league.players[st.pids[0]] : undefined;
          return (
            <div key={st.id} className="pv-story">
              {p ? <Avatar p={p} /> : st.tids.length ? <TeamLogo tid={st.tids[0]} size={34} decorative /> : <span className="pv-story-ic" />}
              <span className="grow pv-story-t">{st.text}</span>
              <Icon size={15} className="dim pv-story-k" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function InjuryList({ league, s, game, locked }: { league: League; s: SidePreview; game: ScheduledGame; locked: boolean }) {
  const none = !s.out.length && !s.resting.length && !s.worn.length && !s.questionable.length;
  const rot = league.teams[s.tid].rotation;
  return (
    <div className="list">
      <div className="pv-inj-h">
        <TeamLogo tid={s.tid} size={22} decorative />
        <span className="grow">{league.teams[s.tid].name}</span>
        {none && <span className="tiny dim">Everyone is available</span>}
      </div>
      {s.questionable.map((p) => (
        <div key={p.pid} className="pv-q">
          <div className="pv-row">
            <Tag tone={p.cleared ? 'good' : 'warn'}>{p.cleared ? 'Playing' : 'Questionable'}</Tag>
            <Link to={`/player/${p.pid}`} className="grow ellipsis">
              <b>{p.name}</b> <span className="dim">{p.injury}</span>
            </Link>
            <button
              className={`btn xs ${p.cleared ? '' : 'primary'}`}
              disabled={locked}
              // (named by what a tap does, so no pressed state: "Sit him, pressed" would read backwards)
              aria-label={p.cleared ? `Sit ${p.name} tonight` : `Clear ${p.name} to play tonight`}
              onClick={() => useStore.getState().mutate((l) => setGameTime(l, game.gid, p.pid, !p.cleared))}
            >
              {p.cleared ? 'Sit him' : 'Clear to play'}
            </button>
          </div>
          <div className="tx-note">
            {p.cleared
              ? `Plays about ${Math.round((1 - GAME_TIME_PERF) * 100)}% below his best, ${K.gameTimeRisk}× as likely to get hurt${
                  rot.manual ? (rot.minutes[p.pid] ? ` (your rotation gives him ${rot.minutes[p.pid]} minutes)` : ' (your rotation gives him no minutes)') : ''
                }. Tonight counts as the game he had left.`
              : `One game left on his ${injuryText(p.injury)}. He sits tonight unless you clear him.`}
            {locked ? ' The game is under way: this was settled at tip-off.' : ''}
          </div>
        </div>
      ))}
      {s.out.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="pv-row">
          <Tag tone="bad">Out</Tag>
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className="dim">{p.injury}</span>
          </span>
          <span className="tiny dim num nowrap">
            {p.games} game{p.games === 1 ? '' : 's'}
          </span>
        </Link>
      ))}
      {s.resting.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="pv-row">
          <Tag tone="warn">Rest</Tag>
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className="dim">second night of a back-to-back</span>
          </span>
        </Link>
      ))}
      {s.worn.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="pv-row">
          <Tag>Worn</Tag>
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className="dim">heavy legs</span>
          </span>
          <span className="tiny dim num nowrap">wear {p.wear}</span>
        </Link>
      ))}
    </div>
  );
}

/** The two starting fives side by side, away on the left as on the slab: jerseys facing each other. */
function StartingFives({ league, away, home }: { league: League; away: SidePreview; home: SidePreview }) {
  const rows = Array.from({ length: Math.max(away.starters.length, home.starters.length) }, (_, i) => [away.starters[i], home.starters[i]] as const);
  const cell = (p: SidePreview['starters'][number] | undefined, right: boolean) => {
    const pl = p ? league.players[p.pid] : undefined;
    if (!p || !pl) return <span />;
    return (
      <Link to={`/player/${p.pid}`} className={`pv-five-p ${right ? 'r' : ''}`}>
        <Avatar p={pl} />
        <span className="pv-five-who">
          <span className="pv-five-n ellipsis">{pl.lastName}</span>
          <span className="pv-five-m">
            {p.pos} <Ovr v={p.ovr} size="sm" />
          </span>
          {p.for && <span className="pv-five-for ellipsis">for {league.players[p.for.pid]?.lastName ?? p.for.name}</span>}
        </span>
      </Link>
    );
  };
  return (
    <Section
      title="Starting fives"
      right={
        <Help title="Starting fives">
          The five each coach starts tonight, as the game sets them up from the depth charts, injuries and rest. A player starting in place of a usual starter says whom he stands
          in for.
        </Help>
      }
    >
      <div className="card flush pv-fives">
        <div className="pv-fives-h">
          <span>
            <TeamLogo tid={away.tid} size={22} decorative /> {league.teams[away.tid].abbrev}
          </span>
          <span>
            {league.teams[home.tid].abbrev} <TeamLogo tid={home.tid} size={22} decorative />
          </span>
        </div>
        {rows.map(([a, h], i) => (
          <div key={i} className="pv-five">
            {cell(a, false)}
            {cell(h, true)}
          </div>
        ))}
      </div>
    </Section>
  );
}

function TendenciesCard({ league, s, pv }: { league: League; s: SidePreview; pv: MatchupPreview }) {
  const t = league.teams[s.tid];
  const detail = league.settings.complexity !== 'simple';
  const pts = s.playTypes.slice(0, 5);
  const maxShare = Math.max(0.01, ...pts.map((x) => x.share));
  // league ranks once they have played
  const played = s.pace.rank > 0;
  return (
    <Section
      title={`How the ${t.name} play`}
      right={
        <Link to={`/team/${s.tid}?tab=scouting`} className="card-link">
          Scouting <ChevronRight size={14} />
        </Link>
      }
    >
      <div className="card flush">
        {played && (
          <div className="pv-ranks">
            <Statline
              items={[
                { k: 'Off', v: rankText(s.ortg) },
                { k: 'Def', v: rankText(s.drtg) },
                { k: 'Net', v: signed(s.net.v), s: rankText(s.net) },
                { k: 'Pace', v: f1(s.pace.v), s: rankText(s.pace) },
              ]}
            />
          </div>
        )}
        <dl className="tx-facts pv-how">
          <Fact k="Offense">
            {s.offense.preset} · {s.offense.pace >= 65 ? 'fast' : s.offense.pace <= 35 ? 'slow' : 'moderate'} pace
            {played ? ` · ${rankText(s.threes)} in threes (${f1(s.threes.v)} a game)` : ''}
          </Fact>
          <Fact k="Defense">
            {s.defense.preset} · {s.defense.scheme}
            {s.defense.coverage ? `, ${s.defense.coverage.toLowerCase()} on ball screens` : ''}
            {s.defense.press ? `, press ${s.defense.press.toLowerCase()}` : ''}
            {detail ? ` · help ${s.defense.help}, pressure ${s.defense.pressure}` : ''}
          </Fact>
          {s.coach.adjusts && (
            <Fact k="Coach">
              {s.coach.name} adjusts {s.coach.adjusts}
              {detail ? ` (${p0(s.coach.chance)} at each break)` : ''}
            </Fact>
          )}
        </dl>
        {pv.oppPlan && pv.oppPlan.length > 0 && (
          <div className="pv-expect">
            <OppPlanNote league={league} items={pv.oppPlan} day={pv.day} />
          </div>
        )}
        {detail && pts.length > 0 && (
          <div className="pv-pts">
            <div className="pv-pts-h">
              <span className="over">Their play types</span>
              <span className="over">pts / poss</span>
            </div>
            {pts.map((x) => (
              <div key={x.key} className="gd-pt">
                <span className="ellipsis">{x.label}</span>
                <div className="bar">
                  <div style={{ width: `${(x.share / maxShare) * 100}%`, background: 'var(--info)' }} />
                </div>
                <span className={`num bold right ${x.z >= 2 ? 'bad' : x.z <= -2 ? 'good' : ''}`} title={`League ${x.base.toFixed(2)}`}>
                  {x.ppp.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="tx-note">Bars: share of their possessions. Red is well above the league for that play; green well below.</div>
          </div>
        )}
      </div>
    </Section>
  );
}

function MatchupsCard({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const opp = pv.them.tid;
  const canPlan = league.settings.complexity !== 'simple';
  // our available players, the depth chart's order (the starters first)
  const unavailable = new Set([...pv.us.out, ...pv.us.resting].map((p) => p.pid));
  const order = league.teams[league.userTid].rotation.order;
  const all = teamPlayers(league, league.userTid);
  const nameOf = rosterNames(all);
  const roster = all.filter((p) => !unavailable.has(p.pid));
  const starters = new Set(pv.us.starters.map((p) => p.pid));
  const mine = roster.sort((a, b) => Number(starters.has(b.pid)) - Number(starters.has(a.pid)) || order.indexOf(a.pid) - order.indexOf(b.pid)).slice(0, 8);
  const plan = planFor(league, opp, game);
  const [editing, setEditing] = useState<number | null>(null);
  const threats = pv.threats.slice(0, 3);
  if (!threats.length) return null;
  return (
    <Section
      title="Key matchups"
      right={
        <Help title="Key matchups">
          Their key players and who guards them when the game tips off. Pick a defender to plan the matchup for this opponent: he takes that assignment whenever both are on the
          floor. Staff lets the coaches decide.{canPlan ? ' You can also say how to guard each one (go under, top-lock, sag off, get physical); ★ is the staff’s suggestion.' : ''}
        </Help>
      }
    >
      <div className="card flush list">
        {threats.map((th) => {
          const planned = plan?.matchups?.[th.pid];
          const open = editing === th.pid;
          const how = plan?.playerD?.[th.pid];
          const them = league.players[th.pid];
          const guard = th.guard ? league.players[th.guard.pid] : undefined;
          const suggest = canPlan && them ? guardAdvice(league, them).suggest : undefined;
          return (
            <div key={th.pid} className="pv-mu">
              <div className="pv-mu-row">
                {them && <Avatar p={them} />}
                <span className="grow pv-mu-who">
                  <Link to={`/player/${th.pid}`} className="lr-name">
                    {th.name}
                  </Link>
                  <span className="lr-meta">{th.why}</span>
                  {canPlan && how && <Tag tone="info">{PLAYER_D_META[how].label}</Tag>}
                </span>
                <span className="pv-mu-d">
                  {th.resting ? (
                    <span className="warn small">Resting tonight</span>
                  ) : th.guard ? (
                    <>
                      <span className="tiny dim">Guarded by</span>
                      <span className="pv-mu-dn">
                        {guard && <Avatar p={guard} />}
                        <b>{nameOf(th.guard.pid)}</b>
                      </span>
                    </>
                  ) : (
                    <span className="tiny dim">Comes off the bench</span>
                  )}
                  {planned !== undefined && planned !== th.guard?.pid && (
                    <span className="tiny dim">
                      Planned: <b>{nameOf(planned)}</b>
                    </span>
                  )}
                  {canPlan && !th.resting && (
                    <button className="btn xs ghost pv-mu-btn" aria-expanded={open} onClick={() => setEditing(open ? null : th.pid)}>
                      {open ? 'Done' : 'Change'}
                    </button>
                  )}
                </span>
              </div>
              {open && (
                <div className="col pv-mu-edit">
                  <div className="over">Who guards him</div>
                  <Chips
                    label={`Who guards ${th.name}`}
                    value={planned ?? -1}
                    onChange={(pid) => useStore.getState().mutate((l) => setPlanMatchup(l, opp, th.pid, pid === -1 ? null : pid))}
                    options={[{ id: -1, label: 'Staff' }, ...mine.map((p) => ({ id: p.pid, label: nameOf(p.pid) }))]}
                  />
                  <div className="over">How to guard him</div>
                  <Chips
                    label={`How to guard ${th.name}`}
                    value={how ?? ('' as PlayerDefense)}
                    onChange={(d: PlayerDefense) => useStore.getState().mutate((l) => setPlanPlayerD(l, opp, th.pid, d === how ? null : d))}
                    options={PLAYER_DEFENSES.map((d) => ({ id: d, label: `${PLAYER_D_META[d].short}${d === suggest ? ' ★' : ''}` }))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function PlanCard({ league, game, opp }: { league: League; game: ScheduledGame; opp: number }) {
  const plan = planFor(league, opp, game);
  const t = league.teams[opp];
  const counters = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const have = new Set((plan?.items ?? []).map((it) => it.id));
  const groups = new Set((plan?.items ?? []).map((it) => it.group ?? it.id));
  const ideas = counters.filter((c) => !have.has(c.id) && !groups.has(c.group ?? c.id)).slice(0, 4);
  const planned = Object.keys(plan?.matchups ?? {}).length;
  return (
    <Section
      title="Your game plan"
      right={
        plan?.scope && plan.scope !== 'next' ? <Tag tone="info">{plan.scope === 'series' ? 'This series' : 'All season'}</Tag> : <span className="tiny dim">vs {t.abbrev}</span>
      }
    >
      <div className="card flush list">
        {!plan || (!plan.items.length && !planned) ? (
          <div className="tx-empty">No changes for them yet: your usual tactics play.</div>
        ) : (
          <>
            {plan.items.map((it) => (
              <div key={it.id} className="tx-item">
                <span className="grow">
                  <span className="lr-name">{it.label}</span>
                  {it.evidence && <span className="lr-meta">{it.evidence}</span>}
                </span>
                <button className="iconbtn" aria-label={`Remove ${it.label} from the game plan`} onClick={() => useStore.getState().mutate((l) => removePlanItem(l, opp, it.id))}>
                  <X size={16} />
                </button>
              </div>
            ))}
            {planned > 0 && (
              <div className="tx-item tx-item-x">
                {planned} planned matchup{planned === 1 ? '' : 's'}
              </div>
            )}
          </>
        )}
        {ideas.length > 0 && (
          <>
            <div className="list-divider">The assistant suggests · untested</div>
            {ideas.map((c) => (
              <div key={c.id} className="tx-item">
                <span className="grow">
                  <span className="lr-name">{c.label}</span>
                  <span className="lr-meta">{c.why}</span>
                </span>
                <button
                  className="btn xs"
                  aria-label={`Add ${c.label} to the game plan`}
                  onClick={() => {
                    useStore
                      .getState()
                      .mutate((l) => setPlanItem(l, opp, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) }));
                    useStore.getState().toast(`Game plan vs ${t.abbrev}: ${c.label}`, 'good');
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            ))}
          </>
        )}
        <Link to={`/lab?opp=${opp}&mode=counters`} className="tx-linkrow">
          <span className="grow tx-linkrow-t">Test counters in the Lab</span>
          <ChevronRight size={16} />
        </Link>
        <Link to={`/gameplan/${opp}`} className="tx-linkrow">
          <span className="grow tx-linkrow-t">Full game plan</span>
          <ChevronRight size={16} />
        </Link>
      </div>
    </Section>
  );
}
