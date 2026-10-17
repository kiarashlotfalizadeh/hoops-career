// The pre-game screen: everything about the next game before tip-off (the storylines, the
// projection, who's out and the game-time decisions on your questionable players, the starting
// fives, how they play, the matchups on their best players and your game plan for them), with Tip
// off, Quick sim and the Lab one tap away.
import { gameKeys } from '../../core/analysis/keys';
import { KeysList } from '../components/GameKeys';
import { useEffect, useRef, useState } from 'react';
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
import { Bar, Card, Chips, Empty, Help, PageHeader, Spinner, Tag } from '../components/ui';
import { OppPlanNote } from '../components/scouting';
import { TeamLogo } from '../components/TeamLogo';
import { flowActions } from '../flow';
import { useFlowRunner } from '../useFlow';
import { f1, ordinal, p0, rosterNames, signed } from '../stats';
import '../components/gameday.css';

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

  return (
    <main className="page">
      <PageHeader
        title="Preview"
        back
        backTo="/"
        sub={`${typeLabel} · ${fmtDate(league.season, game.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${countdownLabel(pv.days)}`}
      />

      <Card accent>
        <div className="scorebug">
          <TeamHead league={league} s={away} />
          <div className="display dim" style={{ fontSize: 22 }}>
            {pv.neutral ? 'vs' : '@'}
          </div>
          <TeamHead league={league} s={home} />
        </div>
        <div className="chips" style={{ justifyContent: 'center', marginTop: 12 }}>
          <Tag tone="info">{countdownLabel(pv.days)}</Tag>
          {pv.playoff && <Tag tone="info">{pv.playoff.tag}</Tag>}
          {pv.playoff?.elimination && <Tag tone="bad">Elimination game</Tag>}
          {pv.playoff?.clinch && <Tag tone="good">A win takes the series</Tag>}
          {pv.playIn?.elimination && <Tag tone="bad">Elimination game</Tag>}
          {[pv.us, pv.them].map((s) => s.b2b && <Tag key={s.tid} tone="warn">{`${league.teams[s.tid].abbrev} back-to-back`}</Tag>)}
        </div>
        {pv.playoff && (
          <div className="center small dim2" style={{ marginTop: 8 }}>
            {pv.playoff.label}: {league.teams[pv.us.tid].abbrev} {pv.playoff.wins}-{pv.playoff.losses}
            {pv.playoff.homeCourt ? ' · home court' : ''}
          </div>
        )}
        {pv.playIn && (
          <div className="center small dim2" style={{ marginTop: 8 }}>
            {pv.playIn.note}
          </div>
        )}
        {pv.series.total > 0 && (
          <div className="center small dim2" style={{ marginTop: 6 }}>
            Season series {pv.series.won}-{pv.series.lost}
            {pv.series.meeting ? ` · meeting ${pv.series.meeting} of ${pv.series.total}` : ''}
            {pv.series.games.length > 0 && (
              <>
                {' · last: '}
                <Link to={`/game/${pv.series.games[pv.series.games.length - 1].gid}`} className="bold" style={{ color: 'var(--accent-text)' }}>
                  {(() => {
                    const m = pv.series.games[pv.series.games.length - 1];
                    return `${m.won ? 'W' : 'L'} ${m.us}-${m.them}`;
                  })()}
                </Link>
              </>
            )}
          </div>
        )}
      </Card>

      <StorylinesCard league={league} game={game} pv={pv} />

      {pv.userGame && <KeysCard league={league} game={game} />}

      {pv.userGame && <ProjectionCard league={league} game={game} pv={pv} />}

      <Card
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
        <div className="md-grid2" style={{ display: 'grid', gap: 12 }}>
          {[pv.us, pv.them].map((s) => (
            <InjuryList key={s.tid} league={league} s={s} game={game} locked={inProgress} />
          ))}
        </div>
      </Card>

      <Card
        title="Projected starters"
        right={
          <Help title="Projected starters">
            The five each coach starts tonight, as the game sets them up from the depth charts, injuries and rest. A player starting in place of a usual starter says whom he stands
            in for.
          </Help>
        }
      >
        <div className="md-grid2" style={{ display: 'grid', gap: 12 }}>
          {[pv.us, pv.them].map((s) => (
            <div key={s.tid} className="col" style={{ gap: 0 }}>
              <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                <TeamLogo tid={s.tid} size={20} decorative />
                <span className="small bold">{league.teams[s.tid].name}</span>
              </div>
              {s.starters.map((p) => (
                <Link key={p.pid} to={`/player/${p.pid}`} className="gd-row">
                  <span className="tag" style={{ width: 30, justifyContent: 'center' }}>
                    {p.pos}
                  </span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small bold ellipsis">{p.name}</div>
                    {p.for && <div className="tiny warn ellipsis">Starting for {p.for.name}</div>}
                  </div>
                  <span className="num small dim">{p.ovr}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </Card>

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
            <button className="btn primary" style={{ gridColumn: 'span 2' }} disabled={simming} onClick={() => void useStore.getState().simulate({ kind: 'untilUserGame' })}>
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

function TeamHead({ league, s }: { league: League; s: SidePreview }) {
  const t = league.teams[s.tid];
  return (
    <Link to={`/team/${s.tid}`} className="col" style={{ alignItems: 'center', gap: 4, minWidth: 0 }}>
      <TeamLogo tid={s.tid} size={54} decorative />
      <div className="bold">{t.abbrev}</div>
      <div className="tiny dim num">
        {s.won}-{s.lost}
        {s.confRank && s.won + s.lost ? ` · ${ordinal(s.confRank)} ${confWord(s.conf)}` : ''}
      </div>
      <div className="tiny dim num">
        {s.streak ? (s.streak > 0 ? `W${s.streak}` : `L${-s.streak}`) : ''}
        {s.won + s.lost ? `${s.streak ? ' · ' : ''}L10 ${s.lastTen}` : ''}
      </div>
    </Link>
  );
}

function ProjectionCard({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const { margin, win } = pv.projection;
  const me = league.teams[pv.us.tid];
  const them = league.teams[pv.them.tid];
  const fav = margin >= 0 ? me : them;
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
    <Card
      title="Projection"
      right={
        <Help title="Projection">
          <p>
            An estimate, not a simulation: each team&apos;s net rating this season, weighted toward what its rotation tonight is worth until enough games are in, at the two
            teams&apos; pace, plus home court (about {pv.projection.edge ? Math.abs(pv.projection.edge).toFixed(1) : '1.3'} points). A game&apos;s margin varies by about 13 points
            either way.
          </p>
          <p>Simulate plays the real engine with both game plans, rests and injuries as they stand, at tonight&apos;s venue.</p>
        </Help>
      }
    >
      <div className="row" style={{ gap: 12 }}>
        <TeamLogo tid={fav.tid} size={36} decorative />
        <div className="grow">
          <div className="bold" style={{ fontSize: 17 }}>
            {Math.abs(margin) < 0.5 ? 'A toss-up' : `${fav.abbrev} by ${Math.abs(margin).toFixed(1)}`}
          </div>
          <div className="small dim2">
            {me.abbrev} {p0(win)} to win · estimate
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <Bar value={win * 100} color={win >= 0.5 ? 'var(--good)' : 'var(--bad)'} />
      </div>
      <Stakes league={league} game={game} tid={pv.us.tid} />
      {busy ? (
        <div className="col" style={{ gap: 6, marginTop: 12 }}>
          <div className="row">
            <Spinner />
            <span className="small dim2 grow">Simulating {GAMES} games…</span>
            <span className="small num dim">
              {Math.min(done, GAMES)}/{GAMES}
            </span>
          </div>
          <div className="bar" role="progressbar" aria-label="Simulation progress" aria-valuemin={0} aria-valuemax={GAMES} aria-valuenow={Math.min(done, GAMES)}>
            <div style={{ width: `${Math.min(100, (done / GAMES) * 100)}%`, transition: 'width 0.2s' }} />
          </div>
        </div>
      ) : shown ? (
        <div className="card tight" style={{ marginTop: 12 }}>
          <div className="small">
            <b>
              {me.abbrev} won {shown.wins} of {shown.games}
            </b>{' '}
            ({p0(shown.winPct)}) · average {f1(shown.ptsFor)}-{f1(shown.ptsAgainst)} ({signed(avg)})
          </div>
          <div className="tiny dim" style={{ marginTop: 2 }}>
            Net rating {signed(shown.net)} ± {f1(2 * shown.netSE)} per 100 possessions over {shown.games} engine games.
          </div>
        </div>
      ) : null}
      <button className="btn sm block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void simulate()}>
        <Beaker size={15} /> {shown ? 'Simulate again' : `Simulate ${GAMES} games`}
      </button>
    </Card>
  );
}

/** What tonight is worth in the playoff race (see gameStakes): the season forecast with the game won, and lost. */
function Stakes({ league, game, tid }: { league: League; game: ScheduledGame; tid: number }) {
  const s = useLeagueMemo(() => gameStakes(league, game.gid, tid), [league, game.gid, tid]);
  // a game that changes nothing either way (in or out whatever happens) isn't worth the line
  if (!s || Math.abs(s.win - s.loss) < 0.01) return null;
  return (
    <div className="small dim2" style={{ marginTop: 8 }}>
      Playoff odds with a win <b className="good">{oddsPct(s.win)}</b> · with a loss <b className="bad">{oddsPct(s.loss)}</b>
    </div>
  );
}

/** Tonight's keys to the game (see keys.ts): tracked live at the breaks, graded with the result. */
function KeysCard({ league, game }: { league: League; game: ScheduledGame }) {
  const keys = useLeagueMemo(() => gameKeys(league, game), [league, game]);
  if (!keys.length) return null;
  return (
    <Card
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
      <KeysList keys={keys} />
    </Card>
  );
}

/** Icons by storyline kind. */
const STORY_ICON: Record<StorylineKind, LucideIcon> = { revenge: History, milestone: Medal, streak: TrendingUp, hot: Flame, rematch: Repeat, mvp: Crown, picks: Star };

/** What a broadcast would lead with tonight (see storylines.ts): the top four. */
function StorylinesCard({ league, game, pv }: { league: League; game: ScheduledGame; pv: MatchupPreview }) {
  const stories = useLeagueMemo(() => {
    const out = new Set([pv.us, pv.them].flatMap((s) => [...s.out, ...s.resting, ...s.questionable.filter((q) => !q.cleared)].map((p) => p.pid)));
    return storylines(league, game, out).slice(0, 4);
  }, [league, game, pv]);
  if (!stories.length) return null;
  return (
    <Card title="Storylines">
      <div className="col" style={{ gap: 8 }}>
        {stories.map((st) => {
          const Icon = STORY_ICON[st.kind];
          return (
            <div key={st.id} className="row top small" style={{ gap: 8 }}>
              <Icon size={15} className="dim" style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
              <span className="grow">{st.text}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function InjuryList({ league, s, game, locked }: { league: League; s: SidePreview; game: ScheduledGame; locked: boolean }) {
  const none = !s.out.length && !s.resting.length && !s.worn.length && !s.questionable.length;
  const rot = league.teams[s.tid].rotation;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 6 }}>
        <TeamLogo tid={s.tid} size={20} decorative />
        <span className="small bold">{league.teams[s.tid].name}</span>
      </div>
      {none && <div className="small dim">Everyone is available.</div>}
      {s.questionable.map((p) => (
        <div key={p.pid} className="col" style={{ gap: 2, padding: '4px 0' }}>
          <div className="row small" style={{ gap: 8, minHeight: 32 }}>
            <Tag tone={p.cleared ? 'good' : 'warn'}>{p.cleared ? 'Playing' : 'Questionable'}</Tag>
            <Link to={`/player/${p.pid}`} className="grow ellipsis">
              <b>{p.name}</b> <span className="dim">{p.injury}</span>
            </Link>
            <button
              className={`btn xs ${p.cleared ? '' : 'primary'}`}
              disabled={locked}
              aria-pressed={p.cleared}
              aria-label={p.cleared ? `Sit ${p.name} tonight` : `Clear ${p.name} to play tonight`}
              onClick={() => useStore.getState().mutate((l) => setGameTime(l, game.gid, p.pid, !p.cleared))}
            >
              {p.cleared ? 'Sit him' : 'Clear to play'}
            </button>
          </div>
          <div className="tiny dim">
            {p.cleared
              ? `Medical staff: he plays about ${Math.round((1 - GAME_TIME_PERF) * 100)}% below his best, ${K.gameTimeRisk}× as likely to get hurt in the game${
                  rot.manual ? (rot.minutes[p.pid] ? ` (your rotation gives him ${rot.minutes[p.pid]} minutes)` : ' (your rotation gives him no minutes)') : ''
                }. Tonight counts as the game he had left.`
              : `Medical staff: one game left on his ${injuryText(p.injury)}. He sits tonight unless you clear him.`}
            {locked ? ' The game is under way: this was settled at tip-off.' : ''}
          </div>
        </div>
      ))}
      {s.out.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="gd-row small">
          <Tag tone="bad">Out</Tag>
          {/* (a suspension reads "Suspended" where an injury names itself) */}
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className={p.suspended ? 'bad' : 'dim'}>{p.injury}</span>
          </span>
          <span className="tiny dim num nowrap">
            {p.games} game{p.games === 1 ? '' : 's'}
          </span>
        </Link>
      ))}
      {s.resting.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="gd-row small">
          <Tag tone="warn">Rest</Tag>
          <span className="grow ellipsis">
            <b>{p.name}</b> <span className="dim">second night of a back-to-back</span>
          </span>
        </Link>
      ))}
      {s.worn.map((p) => (
        <Link key={p.pid} to={`/player/${p.pid}`} className="gd-row small">
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

function TendenciesCard({ league, s, pv }: { league: League; s: SidePreview; pv: MatchupPreview }) {
  const t = league.teams[s.tid];
  const detail = league.settings.complexity !== 'simple';
  const pts = s.playTypes.slice(0, 5);
  const maxShare = Math.max(0.01, ...pts.map((x) => x.share));
  // league ranks once they have played
  const played = s.pace.rank > 0;
  return (
    <Card title={`How the ${t.name} play`}>
      <div className="col" style={{ gap: 8 }}>
        <div className="small dim2">
          {s.offense.preset} at a {s.offense.pace >= 65 ? 'fast' : s.offense.pace <= 35 ? 'slow' : 'moderate'} pace
          {played ? `: ${rankText(s.pace)} in pace (${f1(s.pace.v)}), ${rankText(s.threes)} in threes (${f1(s.threes.v)} a game)` : ''}.
        </div>
        <div className="small dim2">
          Defense: {s.defense.preset} · {s.defense.scheme}
          {s.defense.coverage ? `, ${s.defense.coverage.toLowerCase()} on ball screens` : ''}
          {s.defense.press ? `, press ${s.defense.press.toLowerCase()}` : ''}
          {detail ? `, help ${s.defense.help}, pressure ${s.defense.pressure}` : ''}.
        </div>
        {s.coach.adjusts && (
          <div className="small dim2">
            Coach {s.coach.name} adjusts {s.coach.adjusts} during games{detail ? ` (${p0(s.coach.chance)} chance at each break)` : ''}.
          </div>
        )}
        <OppPlanNote league={league} items={pv.oppPlan} day={pv.day} />
        {played && (
          <div className="small dim2">
            Offense {rankText(s.ortg)} · defense {rankText(s.drtg)} · net {signed(s.net.v)} ({rankText(s.net)})
          </div>
        )}
        {detail && pts.length > 0 && (
          <div className="col" style={{ gap: 6, marginTop: 4 }}>
            <div className="row tiny dim upper bold">
              <span className="grow">Their play types</span>
              <span>pts / poss</span>
            </div>
            {pts.map((x) => (
              <div key={x.key} className="gd-pt">
                <span className="ellipsis">{x.label}</span>
                <Bar value={x.share} max={maxShare} color="var(--info)" />
                <span className="num bold right" style={{ color: x.z >= 2 ? 'var(--bad)' : x.z <= -2 ? 'var(--good)' : undefined }} title={`League ${x.base.toFixed(2)}`}>
                  {x.ppp.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="tiny dim">Bars: share of their possessions. Red: well above the league&apos;s points per possession for that play; green: well below.</div>
          </div>
        )}
        <Link to={`/team/${s.tid}?tab=scouting`} className="small card-link row" style={{ gap: 4, color: 'var(--accent-text)', alignSelf: 'flex-start' }}>
          Full scouting report <ChevronRight size={14} />
        </Link>
      </div>
    </Card>
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
    <Card
      title="Key matchups"
      right={
        <Help title="Key matchups">
          Their key players and who guards them when the game tips off. Pick a defender to plan the matchup for this opponent: he takes that assignment whenever both are on the
          floor. Staff lets the coaches decide.{canPlan ? ' You can also say how to guard each one (go under, top-lock, sag off, get physical); ★ is the staff’s suggestion.' : ''}
        </Help>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {threats.map((th) => {
          const planned = plan?.matchups?.[th.pid];
          const open = editing === th.pid;
          const how = plan?.playerD?.[th.pid];
          const them = league.players[th.pid];
          const suggest = canPlan && them ? guardAdvice(league, them).suggest : undefined;
          return (
            <div key={th.pid} className="col" style={{ gap: 6 }}>
              <div className="row top" style={{ gap: 10 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <Link to={`/player/${th.pid}`} className="bold">
                    {th.name}
                  </Link>
                  <div className="tiny dim">{th.why}</div>
                  {canPlan && how && (
                    <div style={{ marginTop: 4 }}>
                      <Tag tone="info">{PLAYER_D_META[how].label}</Tag>
                    </div>
                  )}
                </div>
                <div className="small right" style={{ flex: 'none', maxWidth: '45%' }}>
                  {th.resting ? (
                    <span className="warn">Resting tonight</span>
                  ) : th.guard ? (
                    <>
                      <span className="dim">Guarded by</span> <b>{nameOf(th.guard.pid)}</b>
                    </>
                  ) : (
                    <span className="dim">Comes off the bench</span>
                  )}
                  {planned !== undefined && planned !== th.guard?.pid && (
                    <div className="tiny dim">
                      Planned: <b>{nameOf(planned)}</b>
                    </div>
                  )}
                  {canPlan && !th.resting && (
                    <div>
                      <button className="btn xs ghost" style={{ marginTop: 4 }} aria-expanded={open} onClick={() => setEditing(open ? null : th.pid)}>
                        {open ? 'Done' : 'Change'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {open && (
                <>
                  <Chips
                    label={`Who guards ${th.name}`}
                    value={planned ?? -1}
                    onChange={(pid) => useStore.getState().mutate((l) => setPlanMatchup(l, opp, th.pid, pid === -1 ? null : pid))}
                    options={[{ id: -1, label: 'Staff' }, ...mine.map((p) => ({ id: p.pid, label: nameOf(p.pid) }))]}
                  />
                  <div className="tiny upper dim bold">How to guard him</div>
                  <Chips
                    label={`How to guard ${th.name}`}
                    value={how ?? ('' as PlayerDefense)}
                    onChange={(d: PlayerDefense) => useStore.getState().mutate((l) => setPlanPlayerD(l, opp, th.pid, d === how ? null : d))}
                    options={PLAYER_DEFENSES.map((d) => ({ id: d, label: `${PLAYER_D_META[d].short}${d === suggest ? ' ★' : ''}` }))}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
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
    <Card
      title="Your game plan"
      right={
        plan?.scope && plan.scope !== 'next' ? <Tag tone="info">{plan.scope === 'series' ? 'This series' : 'All season'}</Tag> : <span className="tiny dim">vs {t.abbrev}</span>
      }
    >
      <div className="col" style={{ gap: 10 }}>
        {!plan || (!plan.items.length && !planned) ? (
          <div className="small dim">No changes for this opponent yet: your usual tactics play. Add a counter below or build one in the Lab.</div>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {plan.items.map((it) => (
              <div key={it.id} className="row" style={{ gap: 8 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold">{it.label}</div>
                  {it.evidence && <div className="tiny dim">{it.evidence}</div>}
                </div>
                <button className="iconbtn" aria-label={`Remove ${it.label} from the game plan`} onClick={() => useStore.getState().mutate((l) => removePlanItem(l, opp, it.id))}>
                  <X size={16} />
                </button>
              </div>
            ))}
            {planned > 0 && (
              <div className="small dim2">
                {planned} planned matchup{planned === 1 ? '' : 's'}
              </div>
            )}
          </div>
        )}
        {ideas.length > 0 && (
          <div className="col" style={{ gap: 6 }}>
            <div className="tiny dim upper bold">The assistant suggests</div>
            {ideas.map((c) => (
              <div key={c.id} className="row" style={{ gap: 8 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold">{c.label}</div>
                  <div className="tiny dim">{c.why}</div>
                </div>
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
            <div className="tiny dim">Untested ideas: the Lab measures what each is worth against them.</div>
          </div>
        )}
        <div className="row wrap" style={{ gap: 14 }}>
          <Link to={`/lab?opp=${opp}&mode=counters`} className="small card-link row" style={{ gap: 4, color: 'var(--accent-text)' }}>
            Test counters in the Lab <ChevronRight size={14} />
          </Link>
          <Link to={`/gameplan/${opp}`} className="small card-link row" style={{ gap: 4, color: 'var(--accent-text)' }}>
            Full game plan <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </Card>
  );
}
