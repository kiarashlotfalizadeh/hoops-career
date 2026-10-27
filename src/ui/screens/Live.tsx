// The live game, broadcast first: the scorebug and the court own the top of the screen; under them,
// the console holds the staff (the lead assistant's read, the calls he wants from you and your moves
// with what each has done), the game plan (each of tonight's numbers beside the lever that moves it),
// the lineup and the stats; the bench bar in the tab bar's place has the timeout and the views. At a
// period's end or in your timeout the court steps aside for the report or the huddle, on this screen.
// Playback is a tap on the court. Around it, the night: the crowd's glow and its lines, the callouts
// for a run or a big play, clutch time on the scorebug and the court (live/atmosphere.ts, Atmos.tsx).
// The broadcast itself runs in useLiveGame (live/useLiveGame.ts);
// this screen draws it and makes the coaching moves (live/coaching.ts). The game is a journal
// (state/live.ts): every move goes into it, so the game picks up where it was after the app is closed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { identityColor, matchupColors, matchupLooks, teamLook } from '../teamColors';
import { flowActions } from '../flow';
import { canGoBack } from '../nav';
import { sealedGame, simDecided, skipChoices } from '../live/skip';
import { Court, courtFloor } from '../live/Court';
import { drawnPlayer } from '../live/drawn';
import { offPlan, resetToPlan } from '../live/pills';
import { ScoreBug, gameContext } from '../live/ScoreBug';
import { TacticsPanel } from '../live/TacticsPanel';
import { BoxPanel, type BoxTab } from '../live/BoxPanel';
import { OppPlayer } from '../live/OppPlayer';
import { MyPlayer } from '../live/MyPlayer';
import { Lineup } from '../live/Lineup';
import { Feed } from '../live/Feed';
import { Playback } from '../live/Playback';
import { BenchBar, type ConsoleView } from '../live/BenchBar';
import { StaffView } from '../live/StaffView';
import { PlanView } from '../live/PlanView';
import { Huddle, PeriodReport } from '../live/PeriodReport';
import { staffRead, type StaffAction, type StaffNote } from '../live/staff';
import { ScoresSheet, ScoreTicker } from '../live/ScoreTicker';
import { Intro } from '../live/Intro';
import { LiveFinal, NoGame } from '../live/Final';
import { CourtLower } from '../live/Overlays';
import { SkipSheet } from '../live/SkipSheet';
import { useLiveGame } from '../live/useLiveGame';
import { useBugHeight } from '../live/useLiveLayout';
import { coachingMoves } from '../live/coaching';
import { Touchline } from '../live/Touchline';
import { liveOpt, liveSlots, tipSlot } from '../live/familiar';
import { slotMatcher, slotMoveName } from '../../core/analysis/moves';
import type { CallId, Tactics } from '../../core/types';
import { quickPills, subOptions } from '../live/session';
import { HOT_STREAK } from '../live/OnCourt';
import { changesLine, screenChanges } from '../tactics/changes';
import { nightWatch } from '../games/data';
import { breakStory, crowdLevel, currentRun, isClutch, RUN_MIN } from '../live/atmosphere';
import { CallOut, ClutchOffer, Crowd, CrowdLine, FinalOffer, clutchSlowAlways, setClutchSlowAlways } from '../live/Atmos';
import { COACH_MARKS, CoachMark, coachMarksSeen, markCoachMarksSeen } from '../live/CoachMarks';
import '../live/live.css';

export default function Live() {
  const s = useLiveGame();
  const { league, nav, simBusy, status, game, view, home, away, colors, userSide, nameOf, over, script, panel, setPanel, coach } = s;
  // the console's view (at a stop, the staff's is the report or the huddle)
  const [cview, setCview] = useState<ConsoleView>('staff');
  const [statsTab, setStatsTab] = useState<BoxTab | 'pbp'>('players');
  // the player whose sheet is open
  const [picked, setPicked] = useState<number | undefined>();
  const { applyTactics, switchSlot, setKeep, substitute } = coachingMoves(s, () => setCview('lineup'));
  const setBugEl = useBugHeight();
  const conRef = useRef<HTMLDivElement>(null);

  const persist = !!game?.keep;
  const tactics = useMemo(
    () => (game ? game.sim.baseTactics(game.userSide) : null),
    // the tactics change through this screen (tick) and at resume (game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, s.tick],
  );
  const pills = useMemo(() => (game && view && tactics && !over ? quickPills(view, game.userSide, tactics, game.planned, nameOf) : []), [game, view, tactics, over, nameOf]);
  // the coach's three tactics as tonight plays them, each with the team's familiarity with it, and the one in play
  const slots = useMemo(() => (game && tactics ? liveSlots(league, game, tactics) : null), [league, game, tactics]);
  // the night's moves as the court has drawn the game, each with what it has done since (a switch of tactic named as one)
  const slotName = useMemo(() => {
    if (!game) return undefined;
    const match = slotMatcher(league, game.game);
    return (t: Tactics) => {
      const i = match(t);
      return i === null ? null : slotMoveName(league, i);
    };
  }, [league, game]);
  const moves = useMemo(
    () => (game && view ? coachMoves(game.marks, game.logs.slice(0, view.logs), game.userSide, nameOf, slotName, game.over && view.logs >= game.logs.length) : []),
    // (the marks grow with every move: tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, view, s.tick, nameOf, slotName],
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
  // a stop opens on its report (or the huddle), at the top
  useEffect(() => {
    if (!stop) return;
    setCview('staff');
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
    const call = n.id.startsWith('call-');
    applyTactics(a.apply, n.title, { measured: call });
    if (call) s.staff.took(a.label);
    s.setDismissed((d) => [...d, n.id]);
    useStore.getState().toast(`${assistant.last}: ${a.label}${call && n.fig ? ` (${n.fig.v} ${n.fig.unit}, measured)` : ''}`, 'good');
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
  if (!game || !home || !away || !colors || !view || !tactics)
    return (
      <main className="page">
        <Empty>Preparing the arena…</Empty>
      </main>
    );

  // ------------------------------------------------------------ the final: the result, the report, the next game
  if (over) {
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
  const flowKits = matchupColors(home.colors, away.colors);
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
  // whose floor: the home team's, or a neutral one for the Cup final
  const floor = courtFloor(home, neutral, game.game.cup === 'final' ? 'NBA Cup' : '');
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
  // (a team's callout wears its block's colour on the scorebug)
  const callKit = s.call && s.call.side !== -1 ? matchupLooks(home.colors, away.colors)[s.call.side].slab : undefined;
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

  // (a card only while the court plays: not over the intro, a break, a huddle or a banner, the staff's call above all)
  const tipUp = tip !== null && !s.intro && !stop && !s.banner;
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
    // the staff's measured call: its number is the change's (nothing to measure again)
    const call = n.id.startsWith('call-');
    if (a.kind === 'tactics') {
      applyTactics(a.apply, undefined, { measured: call });
      useStore.getState().toast(`${a.label}: from the next possession.`, 'good');
    } else if (a.kind === 'sub') (stop ? subAtStop : substitute)(a.out, a.in);
    else if (a.kind === 'timeout') s.callTimeout(call ? 'staff call' : 'stop the run');
    else setCview('lineup');
    if (call) s.staff.took(a.label);
    s.setDismissed((d) => [...d, n.id]);
  };
  const dismiss = (n: StaffNote) => {
    // a call turned down isn't measured again for a while
    if (n.id.startsWith('call-')) s.staff.decline(n.id.slice(5), game.steps);
    s.setDismissed((d) => [...d, n.id]);
  };
  const changed = offPlan(tactics, game.planned) ? changesLine(screenChanges(game.planned, tactics, nameOf).slice(0, 3)) : '';
  // the touchline: your three tactics, the mentality and (in Every setting) the shape, with what the team knows of each
  const famOf = (key: string) => liveOpt(game, key);
  const touchline = (shape: boolean) =>
    slots && (
      <Touchline
        team={league.teams[league.userTid]}
        slots={slots.slots}
        cur={slots.cur}
        onSwitch={switchSlot}
        tactics={tactics}
        planned={game.planned}
        apply={applyTactics}
        famOf={famOf}
        shape={shape}
        measured={s.staff.change}
      />
    );

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
  };

  const consoleBody = () => {
    if (cview === 'staff') {
      if (atBreak)
        return (
          <PeriodReport
            {...common}
            baselines={s.baselines}
            colors={barColors}
            oppPlan={oppPlanIn(sim, (1 - userSide) as 0 | 1)?.items}
            adjustments={sim.adjustments}
            onSkip={() => setPanel('skip')}
            story={story}
          />
        );
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
          famOf={famOf}
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
            { abbrev: home.abbrev, kit: colors[0], edge: teamLook(home.colors).text, manage: sim.T[0].t.manage },
            { abbrev: away.abbrev, kit: colors[1], edge: teamLook(away.colors).text, manage: sim.T[1].t.manage },
          ]}
          nameOf={nameOf}
          jersey={jersey}
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
            { id: 'pbp', label: 'Play-by-play' },
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
    <main className={`page lv${atBreak ? ' at-break' : ''}${stop ? ' stopped' : ''}${moreBench ? ' more-bench' : ''}`} data-tip={tipUp ? COACH_MARKS[tip].at.join(' ') : undefined}>
      {/* the scorebug is the visible title: screen readers get a heading to land on */}
      <h1 className="sr-only">
        Live game: {away.region} {away.name} {neutral ? 'vs' : 'at'} {home.region} {home.name}
      </h1>
      <div className="sr-only" aria-live="polite">
        {s.announce}
      </div>

      <div className="lv-bug" ref={setBugEl}>
        <ScoreBug
          ticker={s.ticker}
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
        >
          {s.others.length > 0 && <ScoreTicker league={league} games={s.others} elapsed={view.elapsed} done={false} onOpen={() => setPanel('scores')} />}
        </ScoreBug>
      </div>

      <div className="lv-stage">
        <Court
          script={script}
          speed={s.speed}
          paused={paused}
          colors={colors}
          jersey={jersey}
          onDone={s.courtDone}
          onTick={(c, sc) => s.ticker.set(c, sc)}
          onBeat={s.beat.set}
          names={nameOf}
          abbrevs={[home.abbrev, away.abbrev]}
          floor={floor}
          hot={hot}
          label={atBreak ? `Court: end of ${periodLabel(view.q)}.` : ffing ? 'Court: fast-forwarding to the next key play.' : `Court: ${script?.label ?? 'tip-off'}.`}
        />
        {!s.intro && !atBreak && (
          <Playback
            paused={paused}
            speed={s.speed}
            keyPlays={s.keyPlays}
            playLabel="Resume"
            reveal={s.reveal}
            onPause={s.togglePause}
            onSpeed={s.pickSpeed}
            onKeyPlays={s.toggleKeyPlays}
            onSkip={() => setPanel('skip')}
          />
        )}
        {/* the building: the home crowd's glow around the floor (a neutral floor's crowd has no side); after
            the playback controls, so clutch time's offer can step down under them */}
        {!s.intro && !atBreak && <Crowd level={crowd} color={neutral ? 'var(--accent)' : identityColor(home.colors)} clutch={clutch} />}
        {!s.intro && !atBreak && s.call && <CallOut ev={s.call} kit={callKit} />}
        {!s.intro && !atBreak && s.crowdLine && !offer && !finalOffer && <CrowdLine ev={s.crowdLine} level={crowd} />}
        {offer && !atBreak && (
          <ClutchOffer
            onSlow={() => {
              watchAt(1);
              setOffer(false);
            }}
            onAlways={() => {
              setClutchSlowAlways(true);
              watchAt(1);
              setOffer(false);
            }}
            onClose={closeOffer}
          />
        )}
        {finalOffer && !offer && !atBreak && (
          <FinalOffer
            onSim={() => {
              setFinalOffer(false);
              s.skip('end');
            }}
            onClose={closeFinalOffer}
          />
        )}
        {!atBreak && (script || ffing || s.graphic || s.banner) && (
          <CourtLower
            drawing={script}
            ffing={ffing}
            beat={s.beat}
            capColor={script ? colors[script.off][0] : undefined}
            // (a callout up over the court has the moment: the graphic waits under it, one thing at a time)
            graphic={s.call ? null : s.graphic}
            kit={teamLook((s.graphic?.side === 0 ? home : away).colors).slab}
            banner={s.intro ? undefined : s.banner}
            onDropBanner={s.dropBanner}
          />
        )}
        {tipUp && <CoachMark step={tip} onNext={nextTip} />}
        {s.intro && (
          <Intro
            league={league}
            teams={[home, away]}
            fives={[view.sides[0].on, view.sides[1].on]}
            kits={colors}
            names={nameOf}
            context={context}
            neutral={neutral}
            speed={s.speed}
            paused={paused}
            onTip={s.tipOff}
          />
        )}
      </div>

      <div className="lv-con" ref={conRef}>
        {!stop && (
          <button
            className="lv-grab"
            onClick={() => edit((l) => void (l.settings.liveView = moreBench ? 'court' : 'bench'))}
            aria-label={moreBench ? 'Bigger court' : 'Smaller court, more room under it'}
          >
            {moreBench ? 'Bigger court' : 'Smaller court'}
          </button>
        )}
        <div className="lv-con-body">{consoleBody()}</div>
      </div>

      <div className="lv-bar">
        <BenchBar
          view={cview}
          onView={(v) => {
            setCview(v);
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
            famOf={famOf}
            away={!!slots && slots.cur !== tipSlot(league, game)}
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
          onPick={(to) => {
            setPanel('none');
            s.skip(to);
          }}
        />
      </Sheet>
    </main>
  );
}
