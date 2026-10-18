// The live game, broadcast first: the scorebug and the court own the screen; coaching is one row of
// quick actions (a timeout, subs, a call, the staff's top fix, the Clipboard) and one Clipboard with a
// tab for each way to coach; playback is a tap on the court; the breaks and your timeouts stop on one
// break screen. The broadcast itself runs in useLiveGame (live/useLiveGame.ts); this screen draws it
// and makes the coaching moves (live/coaching.ts). The game is a journal (state/live.ts): every move
// goes into it, so the game picks up where it was after the app is closed.
import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { neutralSite, userGameOnDay } from '../../core/league/games';
import { planFor } from '../../core/league/gamePlans';
import { oppPlanIn } from '../../core/ai/opponentPlan';
import { winProb } from '../../core/analysis/winProb';
import { Empty, Sheet } from '../components/ui';
import { periodLabel } from '../stats';
import { matchupColors, teamLook } from '../teamColors';
import { flowActions } from '../flow';
import { skipChoices } from '../live/skip';
import { Court, courtFloor } from '../live/Court';
import { drawnPlayer } from '../live/drawn';
import { lateGame } from '../live/alerts';
import { offPlan, resetToPlan } from '../live/pills';
import { ScoreBug, gameContext } from '../live/ScoreBug';
import { TacticsPanel } from '../live/TacticsPanel';
import { BoxPanel } from '../live/BoxPanel';
import { OppPlayer } from '../live/OppPlayer';
import { MyPlayer } from '../live/MyPlayer';
import { Break } from '../live/Break';
import { Calls } from '../live/Calls';
import { Clipboard, type ClipTab } from '../live/Clipboard';
import { Lineup, MiniFive } from '../live/Lineup';
import { Feed } from '../live/Feed';
import { Playback } from '../live/Playback';
import { QuickBar, type QuickFix } from '../live/QuickBar';
import { useCalls } from '../live/plays';
import { ScoresSheet, ScoreTicker } from '../live/ScoreTicker';
import { Intro } from '../live/Intro';
import { LiveFinal, NoGame } from '../live/Final';
import { BreakCard, CourtLower } from '../live/Overlays';
import { SkipSheet } from '../live/SkipSheet';
import { useLiveGame } from '../live/useLiveGame';
import { useBugHeight, useDockHeight } from '../live/useLiveLayout';
import { coachingMoves } from '../live/coaching';
import { DOCK_MIN, NO_LOGS, PEEK_MIN, REPLAY_SPEED, quickPills, subOptions } from '../live/session';
import '../live/live.css';

export default function Live() {
  const s = useLiveGame();
  const { league, nav, simBusy, status, game, view, home, away, colors, userSide, nameOf, over, script, panel, setPanel, coach } = s;
  // the Clipboard's tab (it's open in its sheet, or docked under the court when there's room)
  const [clipTab, setClipTab] = useState<ClipTab>('lineup');
  // the player whose sheet is open
  const [picked, setPicked] = useState<number | undefined>();
  const openClip = (tab?: ClipTab) => {
    if (tab) setClipTab(tab);
    s.setClipOpen(true);
  };
  const { applyTactics, setKeep, substitute, runAlert } = coachingMoves(s, openClip);
  // a tablet or phone's room under the court for the docked clipboard (and the court's own size: live.css)
  const [setDockEl, dockH] = useDockHeight();
  const setBugEl = useBugHeight();

  const persist = !!game?.keep;
  const tactics = useMemo(
    () => (game ? game.sim.baseTactics(game.userSide) : null),
    // the tactics change through this screen (tick) and at resume (game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, s.tick],
  );
  // play calls: one waiting at a time, shared by the Calls tab, the huddle and the player sheet
  const calls = useCalls({
    gid: game?.game.gid ?? -1,
    side: userSide,
    logs: game?.logs ?? NO_LOGS,
    quarter: script?.q ?? view?.q ?? 1,
    initial: game?.pendingCall ?? null,
    call: (c) => !!coach((g) => g.callPlay(c)),
    cancel: () => coach((g) => g.cancelPlay()),
  });
  const pills = useMemo(() => (game && view && tactics && !over ? quickPills(view, game.userSide, tactics, game.planned, nameOf) : []), [game, view, tactics, over, nameOf]);

  const gameNo = useMemo(() => {
    const ser = game?.game.seriesId ? league.playoffs.find((x) => x.id === game.game.seriesId) : undefined;
    return ser ? ser.highWins + ser.lowWins + 1 : undefined;
    // the game's number in its series as it started (the series counts it once it's over)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);
  const context = game ? gameContext(league, game.game, gameNo) : undefined;
  // the home team's chance to win as the court has drawn the game (Settings can switch it off)
  const showWp = league.settings.liveWinProb !== false;
  const wpHome =
    game && view && showWp ? winProb({ margin: view.sides[0].score - view.sides[1].score, q: view.q, clock: view.clock, ball: view.ball, edge: game.edge }) : undefined;

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

  if (status === 'none') return <NoGame league={league} canSim={!!nextAction?.sim} busy={simBusy} onNext={() => void nextGame()} />;
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
  const { atBreak, paused, show, toPending, alerts } = s;
  const huddling = panel === 'huddle';
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
  // what the court draws: a replay in place of the game for a moment
  const drawing = show ? show.script : script;
  const canReplay = !show && !!s.lastDone.current && paused && !atBreak;
  // (the period being played, as the scorebug shows it: the drawn view still reads the one before on a period's first possession)
  const skipTo = skipChoices(atBreak ? view.q + 1 : quarter, atBreak, sim);
  // the sim is at the period's buzzer while the court draws its last possession: no timeout then (the break is the stop)
  const buzzer = sim.atBuzzer();
  const jersey = (pid: number) => league.players[pid]?.jersey || '0';
  // whose floor: the home team's, or a neutral one for the Cup final
  const floor = courtFloor(home, neutral, game.game.cup === 'final' ? 'NBA Cup' : '');
  const myView = view.sides[userSide];
  const late = lateGame(view.q, view.clock, myView.score - view.sides[1 - userSide].score);
  const win = wpHome === undefined ? undefined : userSide === 0 ? wpHome : 1 - wpHome;
  const docked = dockH >= DOCK_MIN;

  // the staff's top fix, as the pill in the quick actions (not while the game is stopped for a break)
  const top = !atBreak && !huddling ? alerts.find((a) => a.action) : undefined;
  const fix: QuickFix | null = top
    ? {
        label: top.action!.label,
        about: top.title,
        run: () => runAlert(top),
        dismiss: () => s.setDismissed((d) => [...d, top.id]),
      }
    : null;

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

  const callsTab = (huddle = false) => (
    <Calls
      league={league}
      tactics={tactics}
      me={myView}
      side={userSide}
      late={late}
      logs={game.logs}
      drawing={!!script}
      calls={calls}
      nameOf={nameOf}
      timeout={huddle ? undefined : () => s.callTimeout()}
      onCalled={huddle ? undefined : () => s.setClipOpen(false)}
      huddle={huddle}
    />
  );
  const clipboard = (isDocked: boolean) => (
    <Clipboard tab={clipTab} onTab={setClipTab} docked={isDocked}>
      {clipTab === 'lineup' && (
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
      )}
      {clipTab === 'tactics' && (
        <TacticsPanel
          tactics={tactics}
          apply={applyTactics}
          persist={persist}
          setPersist={setKeep}
          plan={plan?.items ?? []}
          pills={pills}
          offPlan={offPlan(tactics, game.planned)}
          reset={() => applyTactics((x) => resetToPlan(x, game.planned))}
          oppOn={sim.T[1 - userSide].on.map((p) => p.pid)}
          nameOf={nameOf}
          q={view.q}
        />
      )}
      {clipTab === 'calls' && callsTab()}
      {clipTab === 'box' && (
        <BoxPanel
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
      )}
      {clipTab === 'pbp' && <Feed feed={s.feed} colors={colors} homeAbbrev={home.abbrev} awayAbbrev={away.abbrev} />}
    </Clipboard>
  );

  const breakSheet = (mode: 'period' | 'huddle') => (
    <Break
      mode={mode}
      league={league}
      view={view}
      side={userSide}
      teams={[home, away]}
      tactics={tactics}
      names={nameOf}
      baselines={s.baselines}
      colors={barColors}
      apply={applyTactics}
      alerts={alerts}
      runAlert={runAlert}
      subFor={s.subFor}
      substitute={(out, inn) => {
        const ok = substitute(out, inn, true);
        // the court is waiting on the sim here: what it shows is the game as it stands
        if (ok && mode === 'huddle') s.takeView(game, false);
        return ok;
      }}
      calls={calls}
      drawUp={callsTab(true)}
      keys={s.keys}
      win={win}
      oppPlan={mode === 'period' ? oppPlanIn(sim, (1 - userSide) as 0 | 1)?.items : undefined}
      onGo={mode === 'huddle' ? s.resume : s.togglePause}
    />
  );

  return (
    <main className={`page lv${atBreak ? ' at-break' : ''}${docked ? ' has-dock' : ''}`}>
      {/* the scorebug is the visible title: screen readers get a heading to land on */}
      <h1 className="sr-only">
        Live game: {away.region} {away.name} {neutral ? 'vs' : 'at'} {home.region} {home.name}
      </h1>
      <div className="sr-only" aria-live="polite">
        {s.announce}
      </div>

      <div className="lv-bug" ref={setBugEl}>
        <ScoreBug ticker={s.ticker} view={view} home={home} away={away} quarter={quarter} atBreak={atBreak} context={context} wpHome={wpHome}>
          {s.others.length > 0 && <ScoreTicker league={league} games={s.others} elapsed={view.elapsed} done={false} onOpen={() => setPanel('scores')} />}
        </ScoreBug>
      </div>

      <div className="lv-stage">
        <Court
          script={drawing}
          speed={show ? s.speed * REPLAY_SPEED : s.speed}
          paused={!show && paused}
          colors={colors}
          jersey={jersey}
          onDone={s.courtDone}
          // (a replay doesn't move the scorebug: it stays on the game as it stands)
          onTick={show ? undefined : (c, sc) => s.ticker.set(c, sc)}
          onBeat={s.beat.set}
          names={nameOf}
          abbrevs={[home.abbrev, away.abbrev]}
          floor={floor}
          label={
            show
              ? `Court: replay, ${drawing?.label ?? ''}.`
              : atBreak
                ? `Court: end of ${periodLabel(view.q)}.`
                : ffing
                  ? 'Court: fast-forwarding to the next key play.'
                  : `Court: ${script?.label ?? 'tip-off'}.`
          }
        />
        {!s.intro && !atBreak && (
          <Playback
            paused={paused}
            speed={s.speed}
            keyPlays={s.keyPlays}
            canReplay={canReplay}
            playLabel="Resume"
            reveal={s.reveal}
            replaying={!!show}
            onPause={s.togglePause}
            onSpeed={s.pickSpeed}
            onKeyPlays={s.toggleKeyPlays}
            onReplay={s.replay}
            onSkip={() => setPanel('skip')}
          />
        )}
        {(show || (!atBreak && (script || ffing || s.graphic || s.banner))) && (
          <CourtLower
            replay={!!show}
            drawing={drawing}
            ffing={ffing}
            beat={s.beat}
            capColor={drawing ? colors[drawing.off][0] : undefined}
            graphic={s.graphic}
            kit={teamLook((s.graphic?.side === 0 ? home : away).colors).slab}
            banner={s.intro ? undefined : s.banner}
            onStopReplay={s.stopShow}
            onDropBanner={s.dropBanner}
          />
        )}
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
        {atBreak && !show && <BreakCard q={view.q} tied={view.sides[0].score} onStart={s.togglePause} onReport={() => setPanel('break')} onSkip={() => setPanel('skip')} />}
      </div>

      {/* under the court, the clipboard docked when there's room for it (held sideways: beside the court, under the quick actions) */}
      <div className="lv-dock" ref={setDockEl}>
        {docked && !s.clipOpen && clipboard(true)}
        {!docked && dockH >= PEEK_MIN && (
          <MiniFive view={view} side={userSide} five={fives[userSide]} kit={colors[userSide]} fatigue={me.t.manage.fatigueSub} nameOf={nameOf} jersey={jersey} onTap={pickPlayer} />
        )}
      </div>

      <div className="lv-quick">
        <QuickBar
          timeouts={myView.timeouts}
          timeout={() => s.callTimeout()}
          canTimeout={canTimeout}
          toPending={toPending}
          toState={toState}
          onSubs={() => openClip('lineup')}
          onCall={() => openClip('calls')}
          called={!!calls.pending}
          late={late}
          fix={simBusy ? null : fix}
          clipOpen={s.clipOpen}
          onClip={() => (s.clipOpen ? s.setClipOpen(false) : openClip())}
        />
      </div>

      <Sheet open={s.clipOpen} onClose={() => s.setClipOpen(false)} title="Clipboard">
        {clipboard(false)}
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
              calls={calls}
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
      <Sheet open={panel === 'break'} onClose={() => setPanel('none')} title={view.q === 2 ? 'Halftime' : view.q === 4 ? 'End of regulation' : `End of ${periodLabel(view.q)}`}>
        {panel === 'break' && breakSheet('period')}
      </Sheet>
      <Sheet open={huddling} onClose={s.resume} title={`Timeout ${me.team.abbrev}`}>
        {huddling && breakSheet('huddle')}
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
