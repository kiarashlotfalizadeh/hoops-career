// The live game's broadcast, as a hook: it sets up (or picks up) today's game, runs the possession
// loop that hands the court one possession at a time (key plays, replays, the breaks, your timeouts),
// keeps the drawn view the rest of the screen reads, tells useOverCourt what to put up over the court,
// and finishes the game. The Live screen (screens/Live.tsx) draws what it returns and adds the
// coaching moves; every move goes through `coach`, so the game's journal keeps it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { haptic } from '../../native';
import { useLeague, useStore, useVersion } from '../../state/store';
import { act, edit } from '../../state/actions';
import { prepareLive, clearLive, dropLive, pendingLive, playedElsewhere, type LiveGame } from '../../state/live';
import { composites } from '../../core/ratings';
import type { League, PbpEntry } from '../../core/types';
import type { PossLog } from '../../core/sim/log';
import { playTypeBaselines } from '../../core/analysis/playTypes';
import { gameKeys } from '../../core/analysis/keys';
import { fmtClock, periodLabel, rosterNames } from '../stats';
import { jerseyColors } from '../teamColors';
import { buildScript, type Script } from './choreo';
import { drawnPlayer, snapshot, type Drawn } from './drawn';
import { liveAlerts, newEvents, type AlertInput, type LiveEvent } from './alerts';
import { isKey } from './keyPlays';
import { createBeat, createTicker, type Beat, type Ticker } from './ticker';
import { graphicCandidates, nextGraphic, type Graphic, type GraphicInput } from './graphics';
import { playersBefore } from './LowerThird';
import { useOverCourt } from './useOverCourt';
import { otherGames } from './scoreboard';
import type { SkipTo } from './skip';
import { FEED_MAX, FF_MS, breakAfter, eventBanner, userSetup, type Panel, type Show, type Status } from './session';

export function useLiveGame() {
  const league = useLeague();
  const nav = useNavigate();
  const loc = useLocation();
  const simBusy = useStore((s) => !!s.sim);
  const liveRef = useRef<LiveGame | null>(null);
  const pbpRead = useRef(0);
  /**
   * The game as of the last possession the court finished drawing (see drawn.ts): the sim runs a
   * possession ahead of the court, and its stats would give away the play still being drawn. The
   * scorebug, the lineup, the alerts and the box score all read it.
   */
  const [view, setView] = useState<Drawn | null>(null);
  const viewRef = useRef<Drawn | null>(null);
  /** Injuries, foul-outs and coaching adjustments, once drawn: alerts for a while, banners over the court once. */
  const [events, setEvents] = useState<LiveEvent[]>([]);
  /**
   * A timeout the user called that the court hasn't shown yet (it opens the next possession), or one
   * waiting for the next dead ball (asked for while the other side had a live ball: see GameSim.callTimeout).
   */
  const [toPending, setToPending] = useState(false);
  /** The user called a timeout: once the court gets to it, the game waits in the huddle. */
  const huddleNext = useRef(false);
  /** The period whose break the screen stopped at: resuming plays on instead of stopping again. */
  const brokeAt = useRef(0);
  /** Key plays: the timer that brings up the next possession after one it didn't draw, or one waiting for the pause to end. */
  const ff = useRef({ timer: 0, waiting: false });
  const announced = useRef('');
  const [game, setGame] = useState<LiveGame | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [ticker, setTicker] = useState<Ticker>(() => createTicker(720, [0, 0]));
  // the frame the court has reached in the possession it's drawing: the caption follows it
  const [beat] = useState<Beat>(() => createBeat());
  const [script, setScript] = useState<Script | null>(null);
  const [show, setShow] = useState<Show | null>(null);
  // a game from its tip: the starting lineups go up on the court first
  const [intro, setIntro] = useState(false);
  // the playback controls come up for a moment at the tip (and whenever this is bumped)
  const [reveal, setReveal] = useState(0);
  const tipOff = useCallback(() => {
    setIntro(false);
    setReveal((x) => x + 1);
  }, []);
  // read when the court finishes drawing (from its animation loop): the latest of each
  const showRef = useRef<Show | null>(null);
  showRef.current = show;
  const scriptRef = useRef<Script | null>(null);
  scriptRef.current = script;
  /** The possession the court last finished drawing: what Replay shows. */
  const lastDone = useRef<Script | null>(null);
  const [speed, setSpeed] = useState<number>(() => league.settings.liveSpeed || 1);
  const [paused, setPaused] = useState(false);
  // stopped at a period's buzzer (a natural break or a skip): the next period starts when the user resumes
  const [atBreak, setAtBreak] = useState(false);
  // the banners and the broadcast graphics over the court
  const oc = useOverCourt({ paused, atBreak });
  const { gfx, queueBanner, markSaid, seedGraphics, showGraphic, sayStaff, reset: resetOverCourt } = oc;
  const [feed, setFeed] = useState<{ i: number; e: PbpEntry }[]>([]);
  const [panel, setPanel] = useState<Panel>('none');
  const [clipOpen, setClipOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [resultGid, setResultGid] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(ff.current.timer);
    };
  }, []);
  // while a game is on, the tab bar gives way to the quick actions (live.css: :root[data-gameday])
  useEffect(() => {
    if (status !== 'live') return;
    const root = document.documentElement;
    root.dataset.gameday = '';
    return () => void delete root.dataset.gameday;
  }, [status]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baselines = useMemo(() => playTypeBaselines(league), [league.season]);
  const keyPlays = !!league.settings.liveKeyPlays;
  // read by the possession loop, which outlives renders
  const opts = useRef({ keyPlays, breaks: league.settings.liveBreaks ?? 'quarters', speed, paused, dismissed });
  opts.current = { keyPlays, breaks: league.settings.liveBreaks ?? 'quarters', speed, paused, dismissed };

  const userSide = game?.userSide ?? 0;
  const userSideRef = useRef(userSide);
  userSideRef.current = userSide;
  const home = game ? league.teams[game.game.home] : null;
  const away = game ? league.teams[game.game.away] : null;
  const colors = useMemo(() => (home && away ? jerseyColors(home.colors, away.colors) : null), [home, away]);

  // teammates who share a last name read "Jal. Williams" / "Jay. Williams", as on every other screen
  const nameOf = useMemo(() => {
    if (!game) return () => '';
    const side = new Map<number, number>();
    const per = game.sim.T.map((t, i) => {
      for (const sp of t.players) side.set(sp.pid, i);
      return rosterNames(t.players.map((sp) => league.players[sp.pid] ?? { pid: sp.pid, firstName: '', lastName: sp.name }));
    });
    return (pid: number) => per[side.get(pid) ?? 0](pid);
  }, [game, league]);

  /** Who the staff would send in for one of your players: a rested bench player, the same size if possible. */
  const subFor = useCallback(
    (pid: number) => {
      const t = liveRef.current?.sim.T[userSide];
      if (!t) return undefined;
      const out = t.byId.get(pid);
      const score = (p: (typeof t.players)[number]) => (p.big === out?.big ? 100 : 0) + p.c.create + p.c.helpD + p.energy * 40;
      return t.players.filter((p) => !p.on && p.out === 0 && p.energy > 0.75).sort((a, b) => score(b) - score(a))[0]?.pid;
    },
    [userSide],
  );

  const alertInput = useCallback(
    (v: Drawn): AlertInput | null => {
      const lg = liveRef.current;
      if (!lg || !home || !away) return null;
      return {
        view: v,
        side: lg.userSide,
        teams: [home, away],
        tactics: lg.sim.baseTactics(lg.userSide),
        manualSubs: lg.manualSubs,
        atBreak,
        // (the sim runs a possession ahead: at the period's buzzer, while its last possession is drawn, no timeout can be called)
        timeoutPending: toPending || lg.sim.atBuzzer(),
        events,
        names: nameOf,
        baselines,
        subFor,
      };
    },
    [home, away, atBreak, toPending, events, nameOf, baselines, subFor],
  );
  // the night's other games (played before this one: see prepareLive), for the bottom line
  const showScores = league.settings.liveScores !== false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const others = useMemo(() => (game && showScores ? otherGames(league, game.game.gid, game.game.day, league.userTid) : []), [game, showScores]);
  // tonight's keys to the game, as the preview set them (from the games before today)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => (game ? gameKeys(league, game.game) : []), [game]);
  // what the graphics know about the players from before tip-off (tonight's game isn't in the stats yet)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const before = useMemo(() => (game ? playersBefore(league, game.sim, game.game.type) : new Map()), [game]);
  /** What the graphics read of the drawn game `v`. */
  const graphicInput = useCallback(
    (v: Drawn, lg: LiveGame): GraphicInput | null =>
      home && away
        ? {
            view: v,
            logs: lg.logs,
            abbrevs: [home.abbrev, away.abbrev],
            names: nameOf,
            before,
            shown: gfx.current.shown,
            last: gfx.current.last,
            regular: lg.game.type === 'regular',
          }
        : null,
    [home, away, nameOf, before, gfx],
  );
  /** The broadcast graphic the drawn game `v` calls for now, if any; and every one it calls for (shown or not). */
  const graphicFor = useCallback(
    (v: Drawn, lg: LiveGame): Graphic | null => {
      const input = graphicInput(v, lg);
      return input ? nextGraphic(input) : null;
    },
    [graphicInput],
  );
  const graphicsDue = useCallback(
    (v: Drawn, lg: LiveGame): Graphic[] => {
      const input = graphicInput(v, lg);
      return input ? graphicCandidates(input) : [];
    },
    [graphicInput],
  );
  const loopHelpers = useRef({ alertInput, nameOf, teams: [home, away] as const, graphicFor, graphicsDue });
  loopHelpers.current = { alertInput, nameOf, teams: [home, away] as const, graphicFor, graphicsDue };

  /** Append play-by-play the sim has written since the last read (timeouts, subs and period ends included); returns the new lines, newest first. */
  const flushFeed = useCallback((): PbpEntry[] => {
    const lg = liveRef.current;
    if (!lg) return [];
    const pbp = lg.sim.pbp;
    if (pbp.length <= pbpRead.current) return [];
    const fresh = pbp
      .slice(pbpRead.current)
      .map((e, j) => ({ i: pbpRead.current + j, e }))
      .reverse();
    pbpRead.current = pbp.length;
    setFeed((f) => [...fresh, ...f].slice(0, FEED_MAX));
    return fresh.map((x) => x.e);
  }, []);

  /** The court has caught up with the sim: show the game as it stands, and what happened since the last look. */
  const takeView = useCallback(
    (lg: LiveGame, banner = true) => {
      const prev = viewRef.current;
      const next = snapshot(lg.sim);
      viewRef.current = next;
      setView(next);
      const [h, a] = loopHelpers.current.teams;
      if (prev && h && a) {
        const ev = newEvents(prev, next, lg.sim.adjustments, lg.sim.injuries, [h, a], loopHelpers.current.nameOf);
        if (ev.length) {
          setEvents((e) => [...e, ...ev].slice(-20));
          const items = ev.map(eventBanner);
          if (banner) queueBanner(items);
          // (along a skip they're taken as said: what happened waits in the alerts and the play-by-play)
          else markSaid(items);
        }
      }
      // a game picked up part-way: only what happens from here gets a graphic (see seedGraphics)
      if (prev) seedGraphics(() => loopHelpers.current.graphicsDue(prev, lg));
      // a broadcast graphic, now and then (not along a skip: that would be a string of them)
      const g = banner ? loopHelpers.current.graphicFor(next, lg) : null;
      if (g) showGraphic(g, next.elapsed);
      return next;
    },
    [queueBanner, markSaid, seedGraphics, showGraphic],
  );

  const clearFF = () => {
    clearTimeout(ff.current.timer);
    ff.current = { timer: 0, waiting: false };
  };

  const attach = useCallback(
    (lg: LiveGame | null) => {
      liveRef.current = lg;
      clearTimeout(ff.current.timer);
      ff.current = { timer: 0, waiting: false };
      brokeAt.current = 0;
      viewRef.current = lg ? snapshot(lg.sim) : null;
      setView(viewRef.current);
      setEvents([]);
      resetOverCourt(!!lg && lg.steps > 0);
      setToPending(false);
      huddleNext.current = false;
      setGame(lg);
      setScript(null);
      setShow(null);
      lastDone.current = null;
      const intro = !!lg && lg.steps === 0 && useStore.getState().league?.settings.liveIntro !== false;
      setIntro(intro);
      if (!intro) setReveal((x) => x + 1);
      setAtBreak(false);
      setPaused(false);
      setDismissed([]);
      setPanel('none');
      setClipOpen(false);
      setResultGid(null);
      setAnnounce('');
      if (!lg) {
        setStatus('none');
        return;
      }
      const pbp = lg.sim.pbp;
      pbpRead.current = pbp.length;
      setFeed(
        pbp
          .slice(-FEED_MAX)
          .map((e, j) => ({ i: pbp.length - Math.min(FEED_MAX, pbp.length) + j, e }))
          .reverse(),
      );
      const score: [number, number] = [lg.sim.T[0].score, lg.sim.T[1].score];
      announced.current = score.join('-');
      setTicker(createTicker(lg.sim.clock, score));
      setStatus('live');
    },
    [resetOverCourt],
  );

  /** What became of the game this screen is coaching: null while it's still the screen's to finish. */
  const fate = useCallback((lg: LiveGame) => playedElsewhere(lg, useStore.getState().league!), []);

  /**
   * The league went back to how it was before setting up or recording the game threw (see the store's
   * attempt): forget any game set up along the way and go to Today, where the Play menu picks the game
   * up from its journal again.
   */
  const leave = useCallback(() => {
    dropLive();
    liveRef.current = null;
    nav('/', { replace: true });
  }, [nav]);

  const start = useCallback(() => {
    let lg: LiveGame | null = null;
    const notes: string[] = [];
    const st = useStore.getState();
    const setUp = (l: League) => {
      lg = prepareLive(l);
      const found = lg as LiveGame | null;
      if (!found || found.committed) return;
      // resuming: Tactics or game-plan edits made away from this screen take over (and "Reset to game
      // plan" goes back to them); the stint plan can't change mid-game
      const now = userSetup(l, found);
      const seen = found.seen;
      if (seen && seen[0] !== now.seen[0]) {
        found.setTactics(now.tactics, true);
        // with "Keep changes" on, the saved tactics already hold what was kept so far and now the
        // edit made elsewhere too: tonight's changes count again from here
        if (found.keep) found.setKeep(l.teams[l.userTid].tactics);
        notes.push('Your tactics changes are in effect.');
      }
      if (seen && seen[1] !== now.seen[1]) notes.push('Rotation changes apply from the next game.');
      found.markSeen(now.seen);
    };
    // setting up today's game plays the day's other games first (or the journal back): if that throws,
    // the league goes back to before it (and the screen to Today) rather than keep half a day. The game
    // already open in this session needs none of that.
    if (st.league && pendingLive(st.league)) edit(setUp);
    else if (!act('Setting up the game', setUp)) return leave();
    const found = lg as LiveGame | null;
    // the app was closed mid-game: say where it picked up (or that it couldn't)
    if (found?.resumed) {
      const s = found.sim;
      if (found.resumed === 'restarted') useStore.getState().toast("Your game in progress couldn't be picked up where you left off, so it starts again from tip-off.", 'bad');
      // (one picked up before its tip has nothing to say: the starting lineups go up as on a fresh one)
      else if (found.steps > 0)
        useStore.getState().toast(`Picked up where you left off: ${s.clock <= 0.05 ? `end of ${periodLabel(s.q)}` : `${periodLabel(s.q)} ${fmtClock(s.clock)}`}.`);
      found.resumed = undefined;
    }
    if (notes.length) useStore.getState().toast(notes.join(' '));
    attach(found);
  }, [attach, leave]);

  // a fresh visit to /live (also from the final card or the Play menu) picks up today's game; one in progress keeps going
  useEffect(() => {
    const lg = liveRef.current;
    if (lg && fate(lg) === null) return;
    start();
  }, [loc.key, start, fate]);

  const info = useCallback(
    (pid: number) => {
      const p = league.players[pid];
      const c = p ? composites(p.ratings) : null;
      return { pid, hgt: p?.ratings.hgt ?? 50, shoot: c?.c3 ?? 50, handle: c?.pnrHandle ?? 50 };
    },
    [league],
  );

  const showFinal = useCallback(
    (lg: LiveGame) => {
      const res = lg.committed!;
      // the coaching sheets have nothing left to change
      setPanel('none');
      setClipOpen(false);
      setStatus('final');
      setResultGid(res.gid);
      ticker.set(0, [res.home.pts, res.away.pts], true);
      const [h, a] = lg.sim.T;
      setAnnounce(`Final: ${a.team.abbrev} ${res.away.pts}, ${h.team.abbrev} ${res.home.pts}`);
      const me = lg.userSide === 0 ? res.home.pts : res.away.pts;
      const them = lg.userSide === 0 ? res.away.pts : res.home.pts;
      haptic(me > them ? 'success' : 'warning');
      window.scrollTo({ top: 0 });
    },
    [ticker],
  );

  const showSimmed = useCallback(
    (lg: LiveGame) => {
      const res = useStore.getState().league!.games.find((g) => g.gid === lg.game.gid);
      clearLive();
      setPanel('none');
      setClipOpen(false);
      setStatus('simmed');
      setResultGid(res?.gid ?? null);
      if (res) ticker.set(0, [res.home.pts, res.away.pts], true);
      setAnnounce('This game was simulated.');
    },
    [ticker],
  );

  const finish = useCallback(() => {
    const lg = liveRef.current;
    if (!lg) return;
    clearTimeout(ff.current.timer);
    ff.current = { timer: 0, waiting: false };
    const now = fate(lg);
    // its league went back to the last save: today's game there starts over
    if (now === 'gone') return start();
    if (now === null) {
      // a sim running now finishes the game itself (from its journal): the screen catches up when it's done
      if (useStore.getState().sim) return;
      // recording it plays out the day (the standings, the playoff series, the league's moves): if that
      // throws, the league goes back to before it rather than keep a game recorded on a day that never ended
      if (!act('Recording the game', (l) => void lg.commit(l))) return leave();
      clearLive();
    }
    // the box score shows the final numbers
    viewRef.current = snapshot(lg.sim);
    setView(viewRef.current);
    if (lg.committed) showFinal(lg);
    else showSimmed(lg);
  }, [fate, start, leave, showFinal, showSimmed]);

  // another screen finished this game (the Play menu's sims), or a sim error reloaded the last save: stop animating a ghost
  const v = useVersion();
  useEffect(() => {
    const lg = liveRef.current;
    if (!lg || status !== 'live') return;
    const now = fate(lg);
    if (now === 'gone') start();
    else if (lg.committed) showFinal(lg);
    else if (now !== null) showSimmed(lg);
  }, [v, status, fate, start, showFinal, showSimmed]);

  /** Stopped at a period's buzzer: the break screen comes up, and the next period starts when the user resumes. */
  const enterBreak = useCallback(
    (lg: LiveGame) => {
      // a break is a good moment to save where the game is (the app may be closed next)
      edit(() => void lg.checkpoint());
      setScript(null);
      setAtBreak(true);
      setPaused(true);
      setClipOpen(false);
      setPanel('break');
      const [h, a] = lg.sim.T;
      ticker.set(lg.sim.clock, [h.score, a.score], true);
      setAnnounce(`${lg.sim.q === 2 ? 'Halftime' : `End of ${periodLabel(lg.sim.q)}`}. ${a.team.abbrev} ${a.score}, ${h.team.abbrev} ${h.score}.`);
    },
    [ticker],
  );

  /** Something in the sim's last possession the assistant would bring up: worth drawing in key plays mode. */
  const eventAhead = useCallback((lg: LiveGame, before: Drawn) => {
    const s = lg.sim;
    if (s.injuries.length > before.injuries || s.adjustments.length > before.adjustments) return true;
    if (s.T.some((t) => t.players.some((p) => p.out === 1 && drawnPlayer(before, p.pid)?.out !== 1))) return true;
    const ahead = snapshot(s);
    // a play that puts up a graphic is worth seeing
    const g = loopHelpers.current.graphicFor(ahead, lg);
    if (g && g.kind !== 'team') return true;
    const inputs = [before, ahead].map((d) => loopHelpers.current.alertInput(d));
    if (!inputs[0] || !inputs[1]) return false;
    const was = new Set(liveAlerts(inputs[0]).map((x) => x.id));
    return liveAlerts(inputs[1]).some((x) => !was.has(x.id) && !opts.current.dismissed.includes(x.id));
  }, []);

  const nextRef = useRef<() => void>(() => {});
  const nextPossession = useCallback(() => {
    const lg = liveRef.current;
    if (!lg || fate(lg) !== null) return finish();
    // the play-by-play catches up with the court only now, so it never gives away a play still being drawn
    const lines = flushFeed();
    // screen readers hear the basket and the score the court just finished showing, at most once a possession
    const shown = ticker.get().score;
    if (shown.join('-') !== announced.current) {
      announced.current = shown.join('-');
      const basket = lines.find((e) => e.kind === 'make' || e.kind === 'ft');
      setAnnounce(`${basket ? `${basket.text} ` : ''}${lg.sim.T[1].team.abbrev} ${shown[1]}, ${lg.sim.T[0].team.abbrev} ${shown[0]}.`);
    }
    // a timeout called while the last possession was drawn opens the next one (one waiting for a dead
    // ball stays called until the possession that brings it has been drawn)
    setToPending(lg.timeoutWaiting);
    const v = takeView(lg);
    const s = lg.sim;
    if (huddleNext.current && !lg.over && !lg.timeoutWaiting) {
      huddleNext.current = false;
      // the court has got to the user's timeout: the game waits in the huddle (the sim is no longer ahead)
      if (s.timeoutOpens() === lg.userSide) {
        setScript(null);
        setPaused(true);
        setClipOpen(false);
        setPanel('huddle');
        return;
      }
      // (a timeout waiting for a dead ball when the period ran out isn't taken: the break is the stop)
      setAnnounce("The period ended before your timeout could be taken: it wasn't charged.");
    }
    if (!lg.over && s.clock <= 0.05) {
      // a decided game ends at the buzzer: no break before an overtime that won't be played
      if (s.q >= 4 && s.T[0].score !== s.T[1].score) {
        lg.step();
        flushFeed();
        return finish();
      }
      if (brokeAt.current !== s.q && breakAfter(opts.current.breaks, s.q)) {
        brokeAt.current = s.q;
        return enterBreak(lg);
      }
    }
    let logs: PossLog[] = [];
    let guard = 0;
    // the score the drawn possession starts from (its log keeps only the one it ends on)
    let from: [number, number] = [0, 0];
    while (!logs.length && !lg.over && guard++ < 5) {
      from = [s.T[0].score, s.T[1].score];
      logs = lg.step();
    }
    if (!logs.length) {
      flushFeed();
      return finish();
    }
    const log = logs[logs.length - 1];
    if (opts.current.keyPlays && !isKey(log, { runBefore: [v.sides[0].run, v.sides[1].run], runAfter: [s.T[0].run, s.T[1].run], event: eventAhead(lg, v) })) {
      // not worth drawing: the scorebug jumps to where it ended and the next one comes up
      ticker.set(log.clockEnd, log.score, true);
      setScript(null);
      ff.current.timer = window.setTimeout(() => {
        ff.current.timer = 0;
        if (opts.current.paused) ff.current.waiting = true;
        else nextRef.current();
      }, FF_MS / opts.current.speed);
      return;
    }
    beat.set(0);
    setScript(buildScript(log, info, logs.length > 1 ? logs[logs.length - 2].score : from, [s.T[0].team.abbrev, s.T[1].team.abbrev], loopHelpers.current.nameOf));
    setTick((t) => t + 1);
  }, [info, finish, flushFeed, fate, ticker, beat, takeView, enterBreak, eventAhead]);
  nextRef.current = nextPossession;

  /** The court finished drawing: an automatic replay of a shot at the buzzer, or the next possession. */
  const courtDone = () => {
    const sh = showRef.current;
    if (sh) {
      setShow(null);
      if (sh.kind === 'auto') nextRef.current();
      return;
    }
    const sc = scriptRef.current;
    if (sc) lastDone.current = sc;
    // a shot at the buzzer, felt as it drops (on a phone)
    if (sc?.moment) haptic(sc.off === userSideRef.current ? 'success' : 'warning');
    if (sc?.moment && useStore.getState().league?.settings.liveReplays !== false) {
      setShow({ kind: 'auto', script: { ...sc } });
      return;
    }
    nextRef.current();
  };
  const replay = () => {
    const sc = lastDone.current;
    if (sc && !showRef.current) setShow({ kind: 'replay', script: { ...sc } });
  };
  const stopShow = () => {
    const kind = show?.kind;
    setShow(null);
    if (kind === 'auto') nextRef.current();
  };

  const huddling = panel === 'huddle';
  useEffect(() => {
    if (status === 'live' && !script && !atBreak && !huddling && !intro && !ff.current.timer && !ff.current.waiting) nextPossession();
  }, [status, script, atBreak, huddling, intro, nextPossession]);
  // a fast-forward that came up during a pause goes on when it ends
  useEffect(() => {
    if (!paused && ff.current.waiting && status === 'live') {
      ff.current.waiting = false;
      nextPossession();
    }
  }, [paused, status, nextPossession]);
  const skip = (to: SkipTo) => {
    const lg = liveRef.current;
    if (!lg || status !== 'live') return;
    clearFF();
    setIntro(false);
    // a replay up now is of a moment the skip leaves behind (and an automatic one, once done, would play on past the break)
    setShow(null);
    // a timeout called just before the skip is taken along the way: no huddle at the other end
    huddleNext.current = false;
    // the sim runs a possession ahead of the court: already at the buzzer, "End of quarter" stops at this break, not the next one
    if (!(to === 'quarter' && !atBreak && lg.sim.clock <= 0.05)) lg.simTo(to);
    // a decided game ends at the buzzer: no break before an overtime that won't be played
    const s = lg.sim;
    if (!lg.over && s.clock <= 0.05 && s.q >= 4 && s.T[0].score !== s.T[1].score) lg.step();
    flushFeed();
    // what happened along the way waits in the alerts: no string of banners
    takeView(lg, false);
    oc.afterSkip();
    setToPending(false);
    ticker.set(s.clock, [s.T[0].score, s.T[1].score], true);
    if (lg.over) return finish();
    if (s.clock <= 0.05) {
      // a real break: subs and tactic changes made now apply from the next period's first possession
      brokeAt.current = s.q;
      return enterBreak(lg);
    }
    // clutch time: the court picks up from here (saved there, like a break)
    edit(() => void lg.checkpoint());
    const [h, a] = s.T;
    if (to === 'clutch') setAnnounce(`Clutch time: ${fmtClock(s.clock)} left in ${periodLabel(s.q)}. ${a.team.abbrev} ${a.score}, ${h.team.abbrev} ${h.score}.`);
    setAtBreak(false);
    setPaused(false);
    nextPossession();
  };
  const togglePause = () => {
    if (atBreak) {
      setPanel('none');
      setAtBreak(false);
      setPaused(false);
      return;
    }
    // and so is a pause
    const lg = liveRef.current;
    if (!paused && lg) edit(() => void lg.checkpoint());
    setPaused((p) => !p);
  };
  const pickSpeed = (to: number) => {
    setSpeed(to);
    // the next game starts at the speed you left this one at (it's the Settings default too)
    if (league.settings.liveSpeed !== to) edit((l) => void (l.settings.liveSpeed = to));
  };
  const toggleKeyPlays = () => edit((l) => void (l.settings.liveKeyPlays = !keyPlays));

  /**
   * Every coaching move goes through the game, into its journal, inside a league change: the save
   * that follows keeps it, so the game survives the app being closed.
   */
  const coach = useCallback(<T>(fn: (lg: LiveGame) => T): T | undefined => {
    const lg = liveRef.current;
    if (!lg) return undefined;
    let out: T | undefined;
    edit(() => void (out = fn(lg)));
    return out as T | undefined;
  }, []);

  const callTimeout = (reason?: string) => {
    const lg = liveRef.current;
    if (!lg || lg.over || !coach((g) => g.callTimeout(reason))) return;
    // the court flashes it as the next possession opens: the one possession still being drawn finishes
    // first, and then the huddle comes up. In the other side's live ball (a steal or a defensive board)
    // it's taken at the next dead ball, and the huddle waits for that
    setToPending(true);
    huddleNext.current = true;
    haptic();
    const abbrev = lg.sim.T[userSide].team.abbrev;
    if (lg.timeoutWaiting) {
      setAnnounce(`Timeout ${abbrev} at the next dead ball.`);
      useStore.getState().toast('Timeout at the next dead ball: they have the ball.');
    } else setAnnounce(`Timeout ${abbrev}.`);
    setTick((x) => x + 1);
  };

  const over = status !== 'live';
  const resume = () => {
    setPanel('none');
    setPaused(false);
    setReveal((x) => x + 1);
  };
  const alerts = useMemo(() => {
    if (!view || over) return [];
    const input = alertInput(view);
    return input ? liveAlerts(input).filter((s) => !dismissed.includes(s.id)) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tick, dismissed, over, alertInput]);
  // the assistant's word goes up over the court once (see sayStaff)
  useEffect(() => {
    if (!over) sayStaff(alerts);
  }, [alerts, over, sayStaff]);

  return {
    league,
    nav,
    simBusy,
    status,
    game,
    view,
    home,
    away,
    colors,
    userSide,
    nameOf,
    subFor,
    baselines,
    keyPlays,
    others,
    keys,
    over,
    // the broadcast
    ticker,
    beat,
    script,
    show,
    intro,
    reveal,
    tipOff,
    speed,
    paused,
    atBreak,
    feed,
    graphic: oc.graphic,
    banner: oc.banner,
    dropBanner: oc.dropBanner,
    lastDone,
    courtDone,
    replay,
    stopShow,
    skip,
    togglePause,
    pickSpeed,
    toggleKeyPlays,
    resume,
    takeView,
    // the game itself
    liveRef,
    coach,
    callTimeout,
    toPending,
    alerts,
    dismissed,
    setDismissed,
    /** Something changed through the game (tactics, subs): the screen reads it again. */
    bump: () => setTick((x) => x + 1),
    tick,
    // the sheets
    panel,
    setPanel,
    clipOpen,
    setClipOpen,
    // the end
    start,
    mounted,
    resultGid,
    announce,
  };
}

export type LiveSession = ReturnType<typeof useLiveGame>;
