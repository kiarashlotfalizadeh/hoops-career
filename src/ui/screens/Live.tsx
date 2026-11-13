// The live game, broadcast first: the scorebug, the call bar and the court own the top of the screen;
// under them the console answers one question a view: Now (what the staff sees and what needs you),
// Players (who's on, who's tired, who to sub), Tactics (what each side is running, beside the lever
// that moves it) and Stats; the bench bar in the tab bar's place has the timeout and the views.
// The court is a full one and never leaves the screen: at a period's end or in your timeout it
// becomes the compact whole floor (the shot chart, or the players where they stood) over the break
// board and the report or the huddle; at the final buzzer it freezes under the final score.
// Nothing sits over the court while the game plays: the call bar (live/CallBar.tsx) shows the running
// call, the graphics, the one banner, the offers and the playback controls, one at a time.
// A phone gets it sideways (live/turn.ts): the court fills the screen under a slim strip (the scorebug
// and the call bar side by side), the bench bar is a rail at the right edge, and the console a drawer
// that a view opens over the court (a stop opens it on the report or the huddle). Held upright, the
// page is turned so the phone is turned too, unless Settings keep the upright layout.
// The broadcast itself runs in useLiveGame (live/useLiveGame.ts); this screen draws it and makes the
// coaching moves (live/coaching.ts). The game is a journal (state/live.ts): every move goes into it,
// so the game picks up where it was after the app is closed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Smartphone, X } from 'lucide-react';
import { useStore } from '../../state/store';
import { edit } from '../../state/actions';
import { neutralSite, userGameOnDay } from '../../core/league/games';
import { planFor } from '../../core/league/gamePlans';
import { oppPlanIn } from '../../core/ai/opponentPlan';
import { leadAssistant } from '../../core/ai/assistant';
import { coachMoves } from '../../core/analysis/moves';
import { winProb } from '../../core/analysis/winProb';
import { GAME } from '../../core/constants';
import { Empty, Segmented, Sheet } from '../components/ui';
import { periodLabel } from '../stats';
import { flowActions } from '../flow';
import { canGoBack } from '../nav';
import { sealedGame, simDecided, skipChoices } from '../live/skip';
import { courtFloor } from '../live/Court';
import { CourtView } from '../live/CourtView';
import { occasionOf } from '../live/occasion';
import { bodyOf } from '../live/court3d/puppet';
import { drawnPlayer } from '../live/drawn';
import { offPlan, resetToPlan } from '../live/pills';
import { BugMore, ScoreBug, gameContext } from '../live/ScoreBug';
import { TacticsPanel } from '../live/TacticsPanel';
import { BoxPanel, type BoxTab } from '../live/BoxPanel';
import { OppPlayer } from '../live/OppPlayer';
import { MyPlayer } from '../live/MyPlayer';
import { Lineup } from '../live/Lineup';
import { Feed } from '../live/Feed';
import { CallBar } from '../live/CallBar';
import { BreakBoard } from '../live/BreakBoard';
import { FINAL_HOLD, FinalFrame } from '../live/FinalFrame';
import { BenchBar, type ConsoleView } from '../live/BenchBar';
import { StaffView } from '../live/StaffView';
import { PlanView } from '../live/PlanView';
import { Huddle, PeriodReport } from '../live/PeriodReport';
import { staffRead, type StaffAction, type StaffNote } from '../live/staff';
import { ScoresSheet, ScoreTicker } from '../live/ScoreTicker';
import { Intro } from '../live/Intro';
import { LiveFinal, NoGame } from '../live/Final';
import { SkipSheet } from '../live/SkipSheet';
import { useLiveGame } from '../live/useLiveGame';
import { coachingMoves } from '../live/coaching';
import { Touchline } from '../live/Touchline';
import type { CallId } from '../../core/types';
import { quickPills, subOptions } from '../live/session';
import { HOT_STREAK } from '../live/Lineup';
import { changesLine, screenChanges } from '../tactics/changes';
import { nightWatch } from '../games/data';
import { teamPlayers } from '../../core/league/helpers';
import { breakStory, crowdLevel, currentRun, isClutch, RUN_MIN } from '../live/atmosphere';
import { Crowd, clutchSlowAlways, setClutchSlowAlways } from '../live/Atmos';
import { COACH_MARKS, CoachMark, coachMarksSeen, markCoachMarksSeen } from '../live/CoachMarks';
import { lockSideways, unlockSideways, useLiveShape } from '../live/turn';
import '../live/live.css';

/** How long the turned page says to turn the phone (ms). */
const TURN_HINT_MS = 4500;

export default function Live() {
  const s = useLiveGame();
  const { league, nav, simBusy, status, game, view, home, away, colors, kits, userSide, nameOf, over, script, panel, setPanel, coach } = s;
  // the console's view (at a stop, the staff's is the report or the huddle)
  const [cview, setCview] = useState<ConsoleView>('staff');
  const [statsTab, setStatsTab] = useState<BoxTab | 'pbp'>('players');
  // the player whose sheet is open
  const [picked, setPicked] = useState<number | undefined>();
  const { applyTactics, setKeep, substitute } = coachingMoves(s, () => setCview('lineup'));
  const conRef = useRef<HTMLDivElement>(null);
  // a tap on the court brings the playback controls up in the call bar
  const [courtTap, setCourtTap] = useState(0);

  // a phone: sideways (or turned so the phone is), or the upright layout; the console a drawer sideways
  const onAir = status === 'live' || (status === 'final' && s.buzzer);
  const shape = useLiveShape(league.settings.liveTurn, onAir);
  const side = shape === 'side' || shape === 'turned';
  const [drawer, setDrawer] = useState(false);
  const setTurn = (to: 'side' | 'upright') => edit((l) => void (l.settings.liveTurn = to));
  // turned: a word to turn the phone, for a moment; and where the screen can be locked sideways, it is
  // (on the first touch: a lock needs one), and let go when the game is
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (shape !== 'turned') return;
    setHint(true);
    const t = setTimeout(() => setHint(false), TURN_HINT_MS);
    return () => clearTimeout(t);
  }, [shape]);
  const locked = useRef(false);
  const tryLock = () => {
    if (locked.current) return;
    locked.current = true;
    lockSideways();
  };
  useEffect(() => () => void (locked.current && unlockSideways()), []);

  const persist = !!game?.keep;
  // (each side's healthy players, best first: the 3D benches seat whoever of them is not on the floor)
  const benches = useMemo(
    () =>
      [home?.tid, away?.tid].map((tid) =>
        tid === undefined
          ? []
          : teamPlayers(league, tid)
              .filter((p) => !p.injury)
              .sort((a, b) => b.ovr - a.ovr)
              .map((p) => p.pid),
      ) as [number[], number[]],
    [league, home?.tid, away?.tid],
  );
  const tactics = useMemo(
    () => (game ? game.sim.baseTactics(game.userSide) : null),
    // the tactics change through this screen (tick) and at resume (game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, s.tick],
  );
  const pills = useMemo(() => (game && view && tactics && !over ? quickPills(view, game.userSide, tactics, game.planned, nameOf) : []), [game, view, tactics, over, nameOf]);
  // the night's moves as the court has drawn the game, each with what it has done since
  const moves = useMemo(
    () => (game && view ? coachMoves(game.marks, game.logs.slice(0, view.logs), game.userSide, nameOf, game.over && view.logs >= game.logs.length) : []),
    // (the marks grow with every move: tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, view, s.tick, nameOf],
  );
  const assistant = useMemo(() => leadAssistant(league), [league]);
  // the night's one watch pick, the preview's "Watch" (games/data.ts): the staff watches him all game
  const pick = useMemo(() => (game ? nightWatch(league, game.userSide === 0 ? game.game.away : game.game.home) : undefined), [league, game]);

  // clutch time, as the court has drawn the game: at speed, the finish is offered at 1× (once a game)
  const clutch = !!view && !over && isClutch(view.q, view.clock, view.sides[0].score - view.sides[1].score);
  const [offer, setOffer] = useState(false);
  const offered = useRef<number | null>(null);
  const { speed, watchAt } = s;
  useEffect(() => {
    if (!clutch || !game || s.atBreak || offered.current === game.game.gid) return;
    offered.current = game.game.gid;
    if (speed <= 1) return;
    if (clutchSlowAlways()) {
      watchAt(1);
      useStore.getState().toast('Clutch time: down to 1× for the finish.');
    } else setOffer(true);
  }, [clutch, game, speed, watchAt, s.atBreak]);
  const closeOffer = useCallback(() => setOffer(false), []);
  // a game decided in the fourth quarter, as the court has drawn it: the final is offered (once a game)
  const sealed = !!view && !!game && !over && sealedGame(view, game.edge);
  const [finalOffer, setFinalOffer] = useState(false);
  const finalOffered = useRef<number | null>(null);
  useEffect(() => {
    if (!sealed || !game || s.atBreak || finalOffered.current === game.game.gid) return;
    finalOffered.current = game.game.gid;
    setFinalOffer(true);
  }, [sealed, game, s.atBreak]);
  const closeFinalOffer = useCallback(() => setFinalOffer(false), []);

  // the first live game's coach marks (with teaching on, once on this device): the card up, if any
  const [tip, setTip] = useState<number | null>(() => (league.settings.teaching !== false && !coachMarksSeen() ? 0 : null));
  const nextTip = () => {
    if (tip === null || tip < COACH_MARKS.length - 1) return setTip(tip === null ? null : tip + 1);
    markCoachMarksSeen();
    setTip(null);
  };
  // the cards are the first quarter's: one skipped past it (a skip, a game picked up later) isn't
  // shown at a close finish, or in the next game
  const pastFirst = !!view && view.q > 1;
  useEffect(() => {
    if (tip === null || !pastFirst) return;
    markCoachMarksSeen();
    setTip(null);
  }, [tip, pastFirst]);

  // the game stopped for a call on one of yours (a fifth foul, a closer out of legs): his sheet, with who can come in
  // (the last possession waits in the huddle instead)
  const stopCall = s.stopCall;
  useEffect(() => {
    if (!stopCall) return;
    setPicked(stopCall.pid);
    setPanel('player');
    useStore.getState().toast(`Paused: ${stopCall.text}`);
  }, [stopCall, setPanel]);

  const gameNo = useMemo(() => {
    const ser = game?.game.seriesId ? league.playoffs.find((x) => x.id === game.game.seriesId) : undefined;
    return ser ? ser.highWins + ser.lowWins + 1 : undefined;
    // the game's number in its series as it started (the series counts it once it's over)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);
  const context = game ? gameContext(league, game.game, gameNo) : undefined;
  // the home team's chance to win as the court has drawn the game (Settings can switch it off)
  const showWp = league.settings.liveWinProb !== false;
  // (before the clock starts, the jump ball isn't counted: tip-off reads the pre-game screens' number)
  const tipped = view && (view.q > 1 || view.clock < GAME.quarterSec);
  const wpHome =
    game && view && showWp
      ? winProb({ margin: view.sides[0].score - view.sides[1].score, q: view.q, clock: view.clock, ball: tipped ? view.ball : null, edge: game.edge })
      : undefined;

  const huddling = s.huddling;
  const stop: 'break' | 'huddle' | null = s.atBreak ? 'break' : huddling ? 'huddle' : null;
  // a stop opens on its report (or the huddle), at the top (sideways, the drawer opens for it, and
  // closes again when play goes on)
  useEffect(() => {
    if (!stop) return setDrawer(false);
    setCview('staff');
    setDrawer(true);
    conRef.current?.scrollTo({ top: 0 });
  }, [stop]);

  // with the bench handed to the staff, it takes its own measured calls: a tactics change that cleared
  // its noise, the moment it lands (subs and timeouts stay yours), and the late fouls
  const autonomy = league.settings.liveStaff === 'auto' ? 'auto' : 'ask';
  const autoDone = useRef(new Set<string>());
  useEffect(() => {
    if (autonomy !== 'auto' || over || simBusy) return;
    const n = s.notes.find((x) => x.auto && x.actions[0]?.kind === 'tactics' && !autoDone.current.has(x.id));
    const a = n?.actions[0];
    if (!n || a?.kind !== 'tactics') return;
    autoDone.current.add(n.id);
    applyTactics(a.apply, n.title);
    if (n.id.startsWith('call-')) s.staff.took();
    s.setDismissed((d) => [...d, n.id]);
    useStore.getState().toast(`${assistant.last}: ${a.label}.`, 'good');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.notes, autonomy, over, simBusy]);

  // only offered once the game is over (or there is none): not worked out on every possession
  const nextAction = status !== 'live' ? flowActions(league).find((a) => !a.disabled && (a.cmd === 'watchLive' || a.sim?.kind === 'untilUserGame')) : undefined;
  const nextGame = async () => {
    if (nextAction?.sim) await useStore.getState().simulate(nextAction.sim);
    // left during the sim: don't set up a live game nobody is watching
    if (!s.mounted.current) return;
    // with the pre-game screen on, game night starts with the matchup preview
    const l = useStore.getState().league!;
    const today = userGameOnDay(l, l.day);
    if (l.settings.pregame !== false && today) nav(`/games/${today.home === l.userTid ? today.away : today.home}?tab=preview`, { replace: true });
    else s.start();
  };

  // the way out mid-game: where the game is goes to the save, and it waits to be resumed (Continue,
  // its Matchup page); Back to the screen before, or Today after a reload
  const leave = () => {
    void useStore.getState().flush();
    if (canGoBack()) nav(-1);
    else nav('/', { replace: true });
  };

  if (status === 'none') return <NoGame league={league} canSim={!!nextAction?.sim} next={nextAction?.sub} busy={simBusy} onNext={() => void nextGame()} />;
  if (!game || !home || !away || !colors || !kits || !view || !tactics)
    return (
      <main className="page">
        <Empty>Preparing the arena…</Empty>
      </main>
    );

  // ------------------------------------------------------------ the final: the result, the report, the next game
  // (a game watched to the buzzer holds on the frozen floor under the final score first: see FinalFrame below)
  const frozen = over && s.buzzer && status === 'final';
  // (what the end is: the 3D picture celebrates it, and the frame holds longer for the bigger ones)
  const occasion = frozen ? occasionOf(league, game.game, game.logs, view.sides[0].score > view.sides[1].score ? 0 : 1) : undefined;
  if (over && !frozen) {
    const final = status === 'final';
    return (
      <LiveFinal
        league={league}
        final={final}
        teams={[home, away]}
        result={s.resultGid !== null ? league.games.find((g) => g.gid === s.resultGid) : undefined}
        announce={s.announce}
        // the report opens on the Why: the recap is already here
        onReport={(gid) => nav(`/game/${gid}${final ? '?tab=report' : ''}`, { replace: true })}
        next={nextAction}
        busy={simBusy}
        onNext={() => void nextGame()}
      />
    );
  }

  // ------------------------------------------------------------ the game
  const { atBreak, paused, toPending } = s;
  const sim = game.sim;
  const me = sim.T[userSide];
  const quarter = script?.q ?? view.q;
  // the fives the court is drawing (between possessions, the ones on the floor now)
  const fives: [number[], number[]] = script ? (script.off === 0 ? [script.oPids, script.dPids] : [script.dPids, script.oPids]) : [view.sides[0].on, view.sides[1].on];
  const flowKits: [string, string] = [kits[0].color, kits[1].color];
  // the user's team carries the accent in two-team comparisons (away first)
  const barColors: [string, string] = userSide === 1 ? ['var(--accent)', 'var(--text-dim)'] : ['var(--text-dim)', 'var(--accent)'];
  const plan = planFor(league, userSide === 0 ? game.game.away : game.game.home, game.game);
  // the Cup final: nobody's home floor
  const neutral = neutralSite(game.game);
  const ffing = s.keyPlays && !script && !atBreak;
  // (the period being played, as the scorebug shows it: the drawn view still reads the one before on a period's first possession)
  const skipTo = skipChoices(atBreak ? view.q + 1 : quarter, atBreak, sim, simDecided(sim, game.edge));
  // the sim is at the period's buzzer while the court draws its last possession: no timeout then (the break is the stop)
  const buzzer = sim.atBuzzer();
  const jersey = (pid: number) => league.players[pid]?.jersey || '0';
  const body = (pid: number) => {
    const p = league.players[pid];
    return bodyOf(p?.heightIn ?? 78, p?.weightLb ?? 215, p?.ratings.str);
  };
  // whose floor: the home team's, or a neutral one for the Cup final
  const floor = courtFloor(home, kits[0], neutral, game.game.cup === 'final' ? 'NBA Cup' : '');
  const myView = view.sides[userSide];
  const abbrevs = { us: me.team.abbrev, them: sim.T[1 - userSide].team.abbrev };
  const teams: [typeof home, typeof away] = [home, away];
  const read = staffRead({ view, side: userSide, teams });
  // the night: the run on now, the crowd, the story so far at a break
  const night = s.night;
  const nightRun = night ? ([0, 1] as const).map((sd) => currentRun(night.plays, sd)).find((r) => r && r.a - r.b >= RUN_MIN) : undefined;
  const actx = s.atmoCtx.current;
  const top = (sd: 0 | 1) => [...view.sides[sd].players].sort((a, b) => b.pts - a.pts).slice(0, 1);
  const story = atBreak && night && actx ? breakStory(night, actx, view.q, [top(0), top(1)]) : undefined;
  const crowd = night ? crowdLevel(night.crowd) : 2;
  const notes = s.notes;
  const calls = notes.filter((n) => n.kind === 'decision').length;
  const moreBench = league.settings.liveView === 'bench';
  // shooters on a streak wear a heat ring on the court
  const hot = new Set(view.sides.flatMap((sd) => sd.players.filter((p) => p.streak >= HOT_STREAK).map((p) => p.pid)));
  // the player of theirs the staff watches: the night's pick; one not dressed, their best night so far or their best player
  const themSide = view.sides[1 - userSide];
  const watchP =
    (pick && themSide.players.find((p) => p.pid === pick.pid)) ??
    [...themSide.players].filter((p) => p.pts >= 8).sort((a, b) => b.pts - a.pts)[0] ??
    [...themSide.players].filter((p) => themSide.on.includes(p.pid)).sort((a, b) => (league.players[b.pid]?.ovr ?? 0) - (league.players[a.pid]?.ovr ?? 0))[0];
  const watch = watchP ? { pid: watchP.pid, defender: me.guardOf.get(watchP.pid)?.pid } : undefined;

  // (a card only while the court plays the first quarter: not over the intro, a break, a huddle or a banner,
  // the staff's call above all; past the first quarter the cards have had their moment: see the effect above)
  const tipUp = tip !== null && quarter === 1 && !s.intro && !stop && !s.banner;
  const canTimeout = me.timeouts > 0 && !atBreak && !toPending && !s.intro && !buzzer && !simBusy;
  const toState = toPending
    ? game.timeoutWaiting
      ? ' left: timeout called, taken at the next dead ball'
      : ' left: timeout called, the court shows it next'
    : buzzer
      ? ' left: the period is ending'
      : ' left: call a timeout';

  const pickedP = panel === 'player' && picked !== undefined ? drawnPlayer(view, picked) : undefined;
  const pickedMine = pickedP ? me.byId.has(pickedP.pid) : false;
  const pickPlayer = (pid: number) => {
    setPicked(pid);
    setPanel('player');
  };

  /** A play called in the huddle (or from the bench on the last possession), for the next trip up the floor. */
  const callPlay = (set: CallId, pid: number) => {
    if (coach((g) => g.callPlay(set, pid))) s.bump();
  };

  /** A substitution from a stop: the court is waiting on the sim, so what it shows is the game as it stands. */
  const subAtStop = (out: number, inn: number) => {
    const ok = substitute(out, inn, true);
    if (ok && huddling) s.takeView(game, false);
    return ok;
  };
  /** One of the staff's moves, taken: its change, sub, timeout or the lineup. */
  const act = (n: StaffNote, a: StaffAction) => {
    const call = n.id.startsWith('call-');
    if (a.kind === 'tactics') {
      applyTactics(a.apply);
      useStore.getState().toast(`${a.label}: from the next possession.`, 'good');
    } else if (a.kind === 'sub') (stop ? subAtStop : substitute)(a.out, a.in);
    else if (a.kind === 'timeout') s.callTimeout(call ? 'staff call' : 'stop the run');
    else setCview('lineup');
    if (call) s.staff.took();
    s.setDismissed((d) => [...d, n.id]);
  };
  const dismiss = (n: StaffNote) => {
    // a call turned down isn't measured again for a while
    if (n.id.startsWith('call-')) s.staff.decline(n.id.slice(5), game.steps);
    s.setDismissed((d) => [...d, n.id]);
  };
  const changed = offPlan(tactics, game.planned) ? changesLine(screenChanges(game.planned, tactics, nameOf).slice(0, 3)) : '';
  // the touchline: the mentality and (in Every setting) the shape
  const touchline = (shape: boolean) => <Touchline tactics={tactics} planned={game.planned} apply={applyTactics} shape={shape} />;

  const common = {
    league,
    view,
    side: userSide,
    teams,
    tactics,
    names: nameOf,
    assistant,
    read,
    notes,
    onAct: act,
    onDismiss: dismiss,
    subFor: s.subFor,
    substitute: subAtStop,
    keys: s.keys,
    moves,
    busy: simBusy,
    quiet: s.quiet,
    kits,
  };

  const consoleBody = () => {
    if (cview === 'staff') {
      if (atBreak)
        return <PeriodReport {...common} oppPlan={oppPlanIn(sim, (1 - userSide) as 0 | 1)?.items} adjustments={sim.adjustments} onSkip={() => setPanel('skip')} story={story} />;
      if (huddling)
        return (
          <Huddle
            {...common}
            kind={s.huddle ?? 'timeout'}
            called={game.calledPlay}
            onCall={callPlay}
            // (in a huddle the sim is where the court is: who closes for you, and who guards whom, now)
            closer={sim.closer(me)?.pid}
            defenderOf={(pid) => sim.T[1 - userSide].guardOf.get(pid)?.pid}
            onTimeout={s.huddle === 'last' && me.timeouts > 0 && !simBusy ? () => s.callTimeout() : undefined}
          />
        );
      return (
        <StaffView
          assistant={assistant}
          read={read}
          notes={notes}
          quiet={s.quiet}
          onAct={act}
          onDismiss={dismiss}
          autonomy={autonomy}
          setAutonomy={(v) => edit((l) => void (l.settings.liveStaff = v))}
          moves={moves}
          abbrevs={abbrevs}
          nameOf={nameOf}
          busy={simBusy}
          view={view}
          side={userSide}
          keys={s.keys}
          watch={watch}
          onPlayer={pickPlayer}
          tactics={tactics}
          subFor={s.subFor}
          substitute={subAtStop}
        />
      );
    }
    if (cview === 'plan')
      return (
        <PlanView
          view={view}
          side={userSide}
          tactics={tactics}
          logs={game.logs.slice(0, view.logs)}
          baselines={s.baselines}
          apply={applyTactics}
          nameOf={nameOf}
          plan={plan?.items ?? []}
          changed={changed}
          onReset={() => applyTactics((x) => resetToPlan(x, game.planned))}
          onPlayer={pickPlayer}
          onAll={() => s.setClipOpen(true)}
          abbrevs={abbrevs}
          touchline={touchline(false)}
        />
      );
    if (cview === 'lineup')
      return (
        <Lineup
          sim={sim}
          view={view}
          side={userSide}
          fives={fives}
          info={[
            { abbrev: home.abbrev, kit: colors[0], manage: sim.T[0].t.manage },
            { abbrev: away.abbrev, kit: colors[1], manage: sim.T[1].t.manage },
          ]}
          nameOf={nameOf}
          jersey={jersey}
          ovr={(pid) => league.players[pid]?.ovr}
          onTap={pickPlayer}
          setManualSubs={(on) => {
            coach((g) => g.setManualSubs(on));
            s.bump();
          }}
        />
      );
    return (
      <div className="lv-stats">
        {/* one row of tabs: the box score's sections and the play-by-play */}
        <Segmented
          tabs
          value={statsTab}
          onChange={setStatsTab}
          label="Stats"
          options={[
            { id: 'players', label: 'Players' },
            { id: 'team', label: 'Team' },
            { id: 'shots', label: 'Shots' },
            { id: 'flow', label: 'Flow' },
            { id: 'pbp', label: 'Plays' },
          ]}
        />
        {statsTab !== 'pbp' ? (
          <BoxPanel
            tab={statsTab}
            view={view}
            flow={sim.flow}
            flowPeriods={sim.flowPeriods}
            side={userSide}
            league={league}
            nameOf={nameOf}
            colors={barColors}
            flowColors={flowKits}
            wp={showWp ? { edge: game.edge, type: game.game.type } : undefined}
          />
        ) : (
          <Feed feed={s.feed} colors={colors} homeAbbrev={home.abbrev} awayAbbrev={away.abbrev} />
        )}
      </div>
    );
  };

  return (
    <main
      className={`page lv${atBreak ? ' at-break' : ''}${stop ? ' stopped' : ''}${stop || moreBench || frozen ? ' compact' : ''}${clutch ? ' clutch' : ''}${frozen ? ' at-final' : ''}${side ? ' side' : ''}${shape === 'turned' ? ' turned' : ''}${side && drawer && !frozen ? ' drawer' : ''}`}
      data-tip={tipUp ? COACH_MARKS[tip].at.join(' ') : undefined}
      onPointerDown={shape === 'turned' ? tryLock : undefined}
    >
      {/* the scorebug is the visible title: screen readers get a heading to land on */}
      <h1 className="sr-only">
        Live game: {away.region} {away.name} {neutral ? 'vs' : 'at'} {home.region} {home.name}
      </h1>
      <div className="sr-only" aria-live="polite">
        {s.announce}
      </div>

      <div className="lv-bug">
        <ScoreBug
          ticker={s.ticker}
          kits={kits}
          ball={atBreak || s.intro || frozen ? null : script ? script.off : tipped ? view.ball : null}
          view={view}
          home={home}
          away={away}
          quarter={quarter}
          atBreak={atBreak}
          context={context}
          wpHome={wpHome}
          run={nightRun ? { abbrev: nightRun.side === 0 ? home.abbrev : away.abbrev, a: nightRun.a, b: nightRun.b } : undefined}
          momentum={night?.momentum}
          clutch={clutch}
          keyPlays={s.keyPlays}
          onLeave={over ? undefined : leave}
          slim={side}
          shotClock={!stop && !s.intro && !frozen}
        >
          {!side && s.others.length > 0 && <ScoreTicker league={league} games={s.others} elapsed={view.elapsed} done={false} onOpen={() => setPanel('scores')} />}
        </ScoreBug>
      </div>

      <div className="lv-call">
        <CallBar
          script={script}
          ffing={ffing}
          beat={s.beat}
          kits={kits}
          title={
            frozen
              ? 'Final'
              : s.intro
                ? 'Tip-off'
                : atBreak
                  ? view.q === 2
                    ? 'Halftime'
                    : `End of ${periodLabel(view.q)}`
                  : huddling
                    ? s.huddle === 'last'
                      ? 'Last possession'
                      : 'Timeout'
                    : undefined
          }
          graphic={s.graphic}
          banner={s.intro || frozen ? undefined : s.banner}
          onDropBanner={s.dropBanner}
          call={s.call}
          crowdLine={s.crowdLine}
          crowd={crowd}
          clutchOffer={
            offer
              ? {
                  onSlow: () => {
                    watchAt(1);
                    setOffer(false);
                  },
                  onAlways: () => {
                    setClutchSlowAlways(true);
                    watchAt(1);
                    setOffer(false);
                  },
                  onClose: closeOffer,
                }
              : undefined
          }
          finalOffer={
            finalOffer && !offer
              ? {
                  onSim: () => {
                    setFinalOffer(false);
                    s.skip('end');
                  },
                  onClose: closeFinalOffer,
                }
              : undefined
          }
          paused={paused}
          speed={s.speed}
          keyPlays={s.keyPlays}
          reveal={s.reveal}
          tap={courtTap}
          onPause={s.togglePause}
          onSpeed={s.pickSpeed}
          onKeyPlays={s.toggleKeyPlays}
          onSkip={() => setPanel('skip')}
          clutch={clutch}
        />
      </div>

      {/* the court: nothing sits over it while the game plays but its own short labels (the call bar has the rest) */}
      {/* (sideways, a tap on the court with the drawer out puts the drawer away) */}
      <div className="lv-stage" onClick={side && drawer && !frozen ? () => setDrawer(false) : stop || frozen || s.intro ? undefined : () => setCourtTap((n) => n + 1)}>
        <CourtView
          look={league.settings.courtLook ?? '3d'}
          onLook={(v) => edit((l) => void (l.settings.courtLook = v))}
          cam={league.settings.courtCam}
          onCam={(v) => edit((l) => void (l.settings.courtCam = v))}
          bench={benches}
          body={body}
          script={script}
          speed={s.speed}
          paused={paused}
          kits={kits}
          jersey={jersey}
          onDone={s.courtDone}
          onReached={s.courtReached}
          onTick={(c, sc, shot) => s.ticker.set(c, sc, false, shot)}
          onBeat={s.beat.set}
          names={nameOf}
          abbrevs={[home.abbrev, away.abbrev]}
          game={() => ({ abbrevs: [home.abbrev, away.abbrev], ...s.ticker.get(), q: script?.q ?? view.q })}
          replays={!s.keyPlays && !toPending}
          floor={floor}
          hot={hot}
          // between possessions the floor is never empty: the tip's line-up, the break's shot chart, or the players where they stood
          idle={s.intro ? { kind: 'tip', fives: [view.sides[0].on, view.sides[1].on] } : atBreak ? { kind: 'chart', shots: view.box.shots ?? [] } : { kind: 'hold' }}
          clutch={clutch}
          final={frozen ? (view.sides[0].score > view.sides[1].score ? 0 : 1) : undefined}
          occasion={occasion}
          label={
            frozen
              ? 'Court: the final buzzer.'
              : atBreak
                ? `Court: end of ${periodLabel(view.q)}, both teams' shots so far.`
                : ffing
                  ? 'Court: fast-forwarding to the next key play.'
                  : `Court: ${script?.label ?? 'tip-off'}.`
          }
        />
        {/* the building: the home crowd's glow around the floor (a neutral floor's crowd has no side) */}
        {!s.intro && !stop && !frozen && <Crowd level={crowd} color={neutral ? 'var(--accent)' : kits[0].color} clutch={clutch} />}
        {tipUp && <CoachMark step={tip} onNext={nextTip} />}
        {/* a phone: the way to the other layout, in the court's corner; turned, a word to turn the phone */}
        {(shape === 'turned' || shape === 'upright') && !frozen && !s.intro && (
          <button
            type="button"
            className={`lv-turn${shape === 'upright' ? ' to-side' : ''}`}
            data-turn-toggle=""
            onClick={(e) => {
              e.stopPropagation();
              setTurn(shape === 'upright' ? 'side' : 'upright');
            }}
            aria-label={shape === 'upright' ? 'Watch sideways' : 'Keep the phone upright'}
            title={shape === 'upright' ? 'Watch sideways' : 'Keep upright'}
          >
            <Smartphone size={16} aria-hidden="true" />
          </button>
        )}
        {hint && shape === 'turned' && (
          <div className="lv-turn-hint" role="status" onClick={(e) => e.stopPropagation()}>
            <RotateCcw size={18} aria-hidden="true" />
            <span>Turn your phone sideways</span>
            <button
              type="button"
              className="lv-turn-keep"
              onClick={() => {
                setHint(false);
                setTurn('upright');
              }}
            >
              Keep upright
            </button>
          </div>
        )}
        {s.intro && (
          <Intro
            league={league}
            teams={[home, away]}
            fives={[view.sides[0].on, view.sides[1].on]}
            kits={kits}
            names={nameOf}
            context={context}
            neutral={neutral}
            speed={s.speed}
            paused={paused}
            onTip={s.tipOff}
          />
        )}
        {frozen && (
          <FinalFrame
            teams={[home, away]}
            kits={kits}
            score={[view.sides[0].score, view.sides[1].score]}
            label={view.q > 4 ? `Final · ${view.q === 5 ? 'OT' : `${view.q - 4}OT`}` : 'Final'}
            won={view.sides[userSide].score > view.sides[1 - userSide].score}
            hold={occasion && (league.settings.courtLook ?? '3d') === '3d' ? FINAL_HOLD[occasion] : undefined}
            onDone={s.endBuzzer}
          />
        )}
      </div>

      <div className="lv-con" ref={conRef}>
        {/* sideways: the drawer's head, with what the slim strip leaves out and the way to put it away */}
        {side && (
          <div className="lv-side-head">
            <BugMore context={context} wpHome={wpHome} kits={kits} abbrevs={[home.abbrev, away.abbrev]} momentum={night?.momentum}>
              {s.others.length > 0 && <ScoreTicker league={league} games={s.others} elapsed={view.elapsed} done={false} onOpen={() => setPanel('scores')} />}
            </BugMore>
            <button type="button" className="lv-side-x" onClick={() => setDrawer(false)} aria-label="Close the console">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        )}
        {!side && !stop && !frozen && (
          <button
            className="lv-grab"
            onClick={() => edit((l) => void (l.settings.liveView = moreBench ? 'court' : 'bench'))}
            aria-label={moreBench ? 'Bigger court' : 'Smaller court, more room under it'}
          >
            {moreBench ? 'Bigger court' : 'Smaller court'}
          </button>
        )}
        {(stop || frozen) && <BreakBoard view={view} teams={teams} kits={kits} side={userSide} kind={stop === 'huddle' ? 'huddle' : 'break'} />}
        {!frozen && <div className="lv-con-body">{consoleBody()}</div>}
      </div>

      {!frozen && (
        <div className="lv-bar">
          <BenchBar
            // (sideways, a view is on only while the drawer is out; the one that's on puts it away)
            view={side && !drawer ? null : cview}
            onView={(v) => {
              if (side && drawer && v === cview) return setDrawer(false);
              setCview(v);
              if (side) setDrawer(true);
              conRef.current?.scrollTo({ top: 0 });
            }}
            calls={calls}
            stop={stop}
            timeouts={myView.timeouts}
            canTimeout={canTimeout}
            toPending={toPending}
            toState={toState}
            onTimeout={() => s.callTimeout()}
            go={atBreak ? { label: `Start ${periodLabel(view.q + 1)}`, run: s.togglePause } : huddling ? { label: 'Resume', run: s.resume } : undefined}
          />
        </div>
      )}

      <Sheet open={s.clipOpen} onClose={() => s.setClipOpen(false)} title="Every setting">
        {s.clipOpen && (
          <TacticsPanel
            tactics={tactics}
            apply={applyTactics}
            persist={persist}
            setPersist={setKeep}
            plan={plan?.items ?? []}
            pills={pills}
            planned={game.planned}
            offPlan={offPlan(tactics, game.planned)}
            reset={() => applyTactics((x) => resetToPlan(x, game.planned))}
            oppOn={sim.T[1 - userSide].on.map((p) => p.pid)}
            nameOf={nameOf}
            q={view.q}
            touchline={touchline(true)}
          />
        )}
      </Sheet>
      <Sheet open={panel === 'player' && !!pickedP} onClose={() => setPanel('none')} title={picked !== undefined ? nameOf(picked) : 'Player'}>
        {pickedP &&
          (pickedMine ? (
            <MyPlayer
              league={league}
              p={pickedP}
              name={nameOf(pickedP.pid)}
              tactics={tactics}
              oppOn={view.sides[1 - userSide].on}
              guarding={[...me.guardOf].find(([, d]) => d.pid === pickedP.pid)?.[0]}
              nameOf={nameOf}
              apply={applyTactics}
              subs={subOptions(view, userSide, me, pickedP.pid, s.subFor)}
              onSub={(other) => {
                const on = me.byId.get(pickedP.pid)?.on;
                if (on ? substitute(pickedP.pid, other) : substitute(other, pickedP.pid)) setPanel('none');
              }}
            />
          ) : (
            <OppPlayer p={pickedP} name={nameOf(pickedP.pid)} tactics={tactics} clock={view.clock} q={view.q} apply={applyTactics} />
          ))}
      </Sheet>
      <Sheet open={panel === 'scores'} onClose={() => setPanel('none')} title="Around the league">
        <ScoresSheet league={league} games={s.others} elapsed={view.elapsed} done={false} />
      </Sheet>
      <Sheet open={panel === 'skip'} onClose={() => setPanel('none')} title="Skip ahead">
        <SkipSheet
          choices={skipTo}
          manualSubs={me.manualSubs}
          onPick={(to) => {
            setPanel('none');
            s.skip(to);
          }}
        />
      </Sheet>
    </main>
  );
}
