// The live game's broadcast, as a hook: it sets up (or picks up) today's game, runs the possession
// loop that hands the court one possession at a time (key plays, the breaks, your timeouts),
// keeps the drawn view the rest of the screen reads, tells useOverCourt what to put up over the court,
// and finishes the game. The night's atmosphere (the runs, the crowd, the calls: useAtmosphere) is
// folded as the court draws each possession. The Live screen (screens/Live.tsx) draws what it returns
// and adds the coaching moves; every move goes through `coach`, so the game's journal keeps it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { haptic } from '../../native';
import { useLeague, useStore, useVersion } from '../../state/store';
import { act, edit } from '../../state/actions';
import { prepareLive, clearLive, dropLive, pendingLive, playedElsewhere, type LiveGame } from '../../state/live';
import { composites } from '../../core/ratings';
import { gameTime, plural } from '../../core/format';
import type { League, PbpEntry } from '../../core/types';
import type { GameSim } from '../../core/sim/engine';
import { neutralSite } from '../../core/league/games';
import { FRANCHISES } from '../../core/teams';
import type { PossLog } from '../../core/sim/log';
import { playTypeBaselines } from '../../core/analysis/playTypes';
import { gameKeys } from '../../core/analysis/keys';
import { fmtClock, periodLabel, rosterNames } from '../stats';
import { jerseyColors } from '../teamColors';
import { buildScript, type Script } from './choreo';
import { drawnPlayer, snapshot, type Drawn } from './drawn';
import { closeGame, crunchTime, foulLimit, lastPossession, liveAlerts, newEvents, recentLevers, type AlertInput, type LiveEvent } from './alerts';
import { staffNotes } from './staff';
import { isKey } from './keyPlays';
import { createBeat, createTicker, type Beat, type Ticker } from './ticker';
import { graphicCandidates, nextGraphic, type Graphic, type GraphicInput } from './graphics';
import { playersBefore } from './LowerThird';
import { useOverCourt } from './useOverCourt';
import { otherGames } from './scoreboard';
import type { SkipTo } from './skip';
import { FEED_MAX, FF_MS, breakAfter, eventBanner, userSetup, type Panel, type Status } from './session';
import { stakesOf, useAtmosphere } from './useAtmosphere';
import type { AtmoCtx } from './atmosphere';
import type { FeedRow } from './Feed';

/** Teammates who share a last name read "Jal. Williams" / "Jay. Williams", as on every other screen. */
function simNames(league: League, sim: GameSim): (pid: number) => string {
  const side = new Map<number, number>();
  const per = sim.T.map((t, i) => {
    for (const sp of t.players) side.set(sp.pid, i);
    return rosterNames(t.players.map((sp) => league.players[sp.pid] ?? { pid: sp.pid, firstName: '', lastName: sp.name }));
  });
  return (pid: number) => per[side.get(pid) ?? 0](pid);
}

/** What the night's atmosphere knows of a live game: who's playing where, and how much it means. */
function atmoCtx(league: League, lg: LiveGame): AtmoCtx {
  const g = lg.game;
  const [h, a] = [league.teams[g.home], league.teams[g.away]];
  return {
    gid: g.gid,
    user: lg.userSide,
    teams: [h.name, a.name],
    abbrevs: [h.abbrev, a.abbrev],
    arena: neutralSite(g) ? undefined : FRANCHISES[g.home]?.arena,
    name: simNames(league, lg.sim),
    stakes: stakesOf(league, g),
  };
}

/**
 * The end of a period (a break or not): the journal is brought up to it and written to the device
 * now, not after the autosave's pause, so a reload or a closed app picks the game up from here at
 * worst, and says so when it does (LiveGame.rewound).
 */
function saveSpot(lg: LiveGame) {
  if (edit(() => void lg.checkpoint())) void useStore.getState().save();
}

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
  // a game from its tip: the starting lineups go up on the court first
  const [intro, setIntro] = useState(false);
  // the playback controls come up for a moment at the tip (and whenever this is bumped)
  const [reveal, setReveal] = useState(0);
  const tipOff = useCallback(() => {
    setIntro(false);
    setReveal((x) => x + 1);
  }, []);
  // read when the court finishes drawing (from its animation loop)
  const scriptRef = useRef<Script | null>(null);
  scriptRef.current = script;
  const [speed, setSpeed] = useState<number>(() => league.settings.liveSpeed || 1);
  const [paused, setPaused] = useState(false);
  // stopped at a period's buzzer (a natural break or a skip): the next period starts when the user resumes
  const [atBreak, setAtBreak] = useState(false);
  // the banners and the broadcast graphics over the court
  const oc = useOverCourt({ paused, atBreak });
  const { gfx, queueBanner, markSaid, seedGraphics, showGraphic, sayStaff, reset: resetOverCourt } = oc;
  // the night's atmosphere: the runs, the crowd, clutch time, the calls
  const atmo = useAtmosphere({ paused, held: !!oc.banner });
  const atmoApi = atmo.api;
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [panel, setPanel] = useState<Panel>('none');
  /**
   * Your timeout, while it's taken ('timeout'), or the last possession of a close game ('last': the play
   * call without a timeout): the game waits in the huddle (on the screen, under any sheet opened from it).
   */
  const [huddle, setHuddle] = useState<HuddleKind | null>(null);
  const [clipOpen, setClipOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  /** The last call on a player the game stopped for (a fifth foul, a closer out of legs): the screen opens his sheet. */
  const [stopCall, setStopCall] = useState<StopCall | null>(null);
  /** The calls the game has stopped for tonight: each stops it once. */
  const stoppedFor = useRef(new Set<string>());
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

  const nameOf = useMemo(() => (game ? simNames(league, game.sim) : () => ''), [game, league]);

  /**
   * Who the staff would send in for one of your players: a rested bench player, the same size if
   * possible, and never one in foul trouble (at the staff's limit for the period, the next one's at a
   * break): sending him in only brings the next sub, or a foul-out.
   */
  const subFor = useCallback(
    (pid: number) => {
      const sim = liveRef.current?.sim;
      const t = sim?.T[userSide];
      if (!sim || !t) return undefined;
      const out = t.byId.get(pid);
      const limit = foulLimit(sim.atBuzzer() ? sim.q + 1 : sim.q, t.t.manage.foulTrouble);
      const score = (p: (typeof t.players)[number]) => (p.big === out?.big ? 100 : 0) + p.c.create + p.c.helpD + p.energy * 40;
      return t.players.filter((p) => !p.on && p.out === 0 && p.energy > 0.75 && p.fouls < limit).sort((a, b) => score(b) - score(a))[0]?.pid;
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
        edge: lg.edge,
        // (the settings changed tonight, and the trips the court has drawn since)
        recent: recentLevers(lg.marks, lg.logs.slice(0, v.logs), lg.userSide),
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

  /**
   * Append play-by-play the sim has written since the last read (timeouts, subs and period ends
   * included), in the night's voice with the moments it called: the atmosphere folds the possessions
   * first (`loud`: its biggest moment goes up over the court). Returns the sim's new lines, newest first.
   */
  const flushFeed = useCallback(
    (loud = true): PbpEntry[] => {
      const lg = liveRef.current;
      if (!lg) return [];
      const logFrom = atmoApi.catchUp(lg, loud);
      const pbp = lg.sim.pbp;
      if (pbp.length <= pbpRead.current) return [];
      const rows = atmoApi.rows(pbp, pbpRead.current, lg.logs, logFrom).reverse();
      const fresh = pbp.slice(pbpRead.current).reverse();
      pbpRead.current = pbp.length;
      setFeed((f) => [...rows, ...f].slice(0, FEED_MAX));
      return fresh;
    },
    [atmoApi],
  );

  /** The court has caught up with the sim: show the game as it stands, and what happened since the last look. */
  const takeView = useCallback(
    (lg: LiveGame, banner = true) => {
      const prev = viewRef.current;
      const next = snapshot(lg.sim, lg.logs.length);
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
      // a broadcast graphic, now and then (not along a skip: that would be a string of them; and not
      // with a callout just up over the court: one thing at a time, the graphic comes next)
      const g = banner && !atmoApi.calledNow() ? loopHelpers.current.graphicFor(next, lg) : null;
      if (g) showGraphic(g, next.elapsed);
      return next;
    },
    [queueBanner, markSaid, seedGraphics, showGraphic, atmoApi],
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
      stoppedFor.current = new Set();
      setStopCall(null);
      viewRef.current = lg ? snapshot(lg.sim, lg.logs.length) : null;
      setView(viewRef.current);
      setEvents([]);
      resetOverCourt(!!lg && lg.steps > 0);
      const lgNow = useStore.getState().league;
      atmoApi.reset(lg, lg && lgNow ? atmoCtx(lgNow, lg) : null);
      // a game picked up with your timeout called and not yet shown (the screen was left right after
      // calling it): the huddle still comes, as the court gets to it
      const called = !!lg && lg.steps > 0 && !lg.over && (lg.timeoutWaiting || lg.sim.timeoutOpens() === lg.userSide);
      setToPending(called);
      huddleNext.current = called;
      setGame(lg);
      setScript(null);
      const intro = !!lg && lg.steps === 0 && useStore.getState().league?.settings.liveIntro !== false;
      setIntro(intro);
      if (!intro) setReveal((x) => x + 1);
      setAtBreak(false);
      setPaused(false);
      setDismissed([]);
      setPanel('none');
      setHuddle(null);
      setClipOpen(false);
      setResultGid(null);
      setAnnounce('');
      if (!lg) {
        setStatus('none');
        return;
      }
      // the play-by-play so far, in the voice it had as it was played (it's the same game, so the same words)
      const pbp = lg.sim.pbp;
      pbpRead.current = pbp.length;
      setFeed(atmoApi.rows(pbp, 0, lg.logs, 0).slice(-FEED_MAX).reverse());
      const score: [number, number] = [lg.sim.T[0].score, lg.sim.T[1].score];
      announced.current = score.join('-');
      setTicker(createTicker(lg.sim.clock, score));
      setStatus('live');
    },
    [resetOverCourt, atmoApi],
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
      else {
        const at = s.clock <= 0.05 ? `end of ${periodLabel(s.q)}` : gameTime(s.q, s.clock);
        // it went back to the last save (the app closed between saves): the possessions after it play again
        if (found.rewound) useStore.getState().toast(`Picked up from the last save, ${at}: ${plural(found.rewound, 'possession')} back.`);
        // (one picked up before its tip has nothing to say: the starting lineups go up as on a fresh one)
        else if (found.steps > 0) useStore.getState().toast(`Picked up where you left off: ${at}.`);
      }
      found.resumed = undefined;
      found.rewound = undefined;
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
      setHuddle(null);
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
      setHuddle(null);
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
    viewRef.current = snapshot(lg.sim, lg.logs.length);
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
      saveSpot(lg);
      setScript(null);
      // (the court steps aside: its callout goes with it, the period report tells the story)
      atmoApi.clear();
      setAtBreak(true);
      setPaused(true);
      setClipOpen(false);
      const [h, a] = lg.sim.T;
      ticker.set(lg.sim.clock, [h.score, a.score], true);
      setAnnounce(`${lg.sim.q === 2 ? 'Halftime' : `End of ${periodLabel(lg.sim.q)}`}. ${a.team.abbrev} ${a.score}, ${h.team.abbrev} ${h.score}.`);
    },
    [ticker, atmoApi],
  );

  /** Something in the sim's last possession the assistant would bring up, or the night would call: worth drawing in key plays mode. */
  const eventAhead = useCallback(
    (lg: LiveGame, before: Drawn) => {
      const s = lg.sim;
      if (atmoApi.bigAhead(lg)) return true;
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
    },
    [atmoApi],
  );

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
        // (a timeout on the last possession is where its play gets called: the game doesn't stop for it again)
        if (lastPossession(v, lg.userSide)) stoppedFor.current.add(lastId(v.q));
        setScript(null);
        setPaused(true);
        setClipOpen(false);
        setPanel('none');
        setHuddle('timeout');
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
      // no break here (Settings → Live games → Breaks): the period's end is saved all the same, once
      if (lg.journal.steps !== lg.steps) saveSpot(lg);
    }
    // a call only you can make now stops a close game, once each: the last possession, a fifth foul, a closer out of legs
    const call = lg.over ? null : takeStop(stopCalls(v, lg, loopHelpers.current.nameOf, opts.current.dismissed), stoppedFor.current);
    if (call) {
      setScript(null);
      setPaused(true);
      setAnnounce(`Paused: ${call.text}`);
      haptic('warning');
      // the last possession waits in the huddle, for the play call (no timeout taken); a player's call opens his sheet
      if (call.kind === 'last') {
        setClipOpen(false);
        setPanel('none');
        setHuddle('last');
      } else {
        ff.current.waiting = true;
        setStopCall(call);
      }
      return;
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
    setScript(
      buildScript(log, info, logs.length > 1 ? logs[logs.length - 2].score : from, [s.T[0].team.abbrev, s.T[1].team.abbrev], loopHelpers.current.nameOf, atmoApi.voiceAhead(lg)),
    );
    setTick((t) => t + 1);
  }, [info, finish, flushFeed, fate, ticker, beat, takeView, enterBreak, eventAhead, atmoApi]);
  nextRef.current = nextPossession;

  /** The court finished drawing: on to the next possession. */
  const courtDone = () => {
    const sc = scriptRef.current;
    // a shot at the buzzer, felt as it drops (on a phone)
    if (sc?.moment) haptic(sc.off === userSideRef.current ? 'success' : 'warning');
    nextRef.current();
  };

  const huddling = huddle !== null;
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
    // a timeout called just before the skip is taken along the way: no huddle at the other end
    huddleNext.current = false;
    // the sim runs a possession ahead of the court: already at the buzzer, "End of quarter" stops at this break, not the next one
    if (!(to === 'quarter' && !atBreak && lg.sim.clock <= 0.05)) lg.simTo(to);
    // a decided game ends at the buzzer: no break before an overtime that won't be played
    const s = lg.sim;
    if (!lg.over && s.clock <= 0.05 && s.q >= 4 && s.T[0].score !== s.T[1].score) lg.step();
    // (along a skip the night's moments go in the play-by-play, not over the court)
    flushFeed(false);
    atmoApi.clear();
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
  /** Watch at another speed for now (clutch time at 1×): the Settings default stays as it was. */
  const watchAt = (to: number) => setSpeed(to);
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
    haptic();
    const abbrev = lg.sim.T[userSide].team.abbrev;
    // stopped for the last possession, the court has caught up with the sim and the ball is yours: the
    // timeout is taken now and the huddle opens at once, with any play called from the bench kept
    if (huddle === 'last' && lg.sim.timeoutOpens() === userSide) {
      takeView(lg, false);
      flushFeed(false);
      setHuddle('timeout');
      setAnnounce(`Timeout ${abbrev}.`);
      return;
    }
    // the court flashes it as the next possession opens: the one possession still being drawn finishes
    // first, and then the huddle comes up. In the other side's live ball (a steal or a defensive board)
    // it's taken at the next dead ball, and the huddle waits for that
    setToPending(true);
    huddleNext.current = true;
    if (lg.timeoutWaiting) {
      setAnnounce(`Timeout ${abbrev} at the next dead ball.`);
      useStore.getState().toast('Timeout at the next dead ball: they have the ball.');
    } else setAnnounce(`Timeout ${abbrev}.`);
    setTick((x) => x + 1);
  };

  const over = status !== 'live';
  const resume = () => {
    setPanel('none');
    setHuddle(null);
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
  /** The bench's notes (see staff.ts), from the game as the court has drawn it: the ones not dismissed. */
  const notes = useMemo(() => {
    const lg = liveRef.current;
    if (!view || over || !lg) return [];
    const input = alertInput(view);
    return input ? staffNotes({ ...input, logs: lg.logs.slice(0, view.logs) }).filter((n) => !dismissed.includes(n.id)) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tick, dismissed, over, alertInput]);

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
    intro,
    reveal,
    tipOff,
    speed,
    paused,
    atBreak,
    feed,
    graphic: oc.graphic,
    // the atmosphere: the night as drawn, the callout and the crowd's line up now, what it knows of the game
    night: atmo.tally,
    call: atmo.call,
    crowdLine: atmo.crowdLine,
    atmoCtx: atmo.ctx,
    watchAt,
    banner: oc.banner,
    dropBanner: oc.dropBanner,
    courtDone,
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
    notes,
    dismissed,
    setDismissed,
    stopCall,
    /** Something changed through the game (tactics, subs): the screen reads it again. */
    bump: () => setTick((x) => x + 1),
    tick,
    // the sheets
    panel,
    setPanel,
    huddling,
    /** Which huddle the game waits in: your timeout, or the last possession's play call. */
    huddle,
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

/** The huddles the game waits in: your timeout, or the last possession's play call without one. */
export type HuddleKind = 'timeout' | 'last';

/** A call the live game stops for: what it is in a line; a player's (his sheet opens), or the last possession's (the play call opens). */
export interface StopCall {
  id: string;
  /** The player it's about; none for the last possession. */
  pid?: number;
  text: string;
  /** 'last': the last possession, your ball. */
  kind?: 'last';
}

/** The last possession's stop: once a period (the end of regulation and of each overtime is a last possession of its own). */
const lastId = (q: number) => `last-${q}`;

/**
 * The calls the drawn game `v` stops for, the biggest first, and only in a close game (closeGame: a
 * blowout never stops): the last possession, your ball (the play is yours to call, the staff calls
 * none); then one of your five on five fouls from the fourth quarter on, or one of your closers below
 * the energy your staff subs at in crunch time, only when the staff won't make that call for you (in
 * crunch time it stops subbing for fouls and legs, and it never does when you make the subs), and not
 * once you've dismissed the alert for it.
 */
export function stopCalls(v: Drawn, lg: LiveGame, names: (pid: number) => string, dismissed: string[]): StopCall[] {
  if (!closeGame(v, lg.edge)) return [];
  const out: StopCall[] = [];
  const side = lg.userSide;
  const me = v.sides[side];
  if (lastPossession(v, side)) {
    const margin = me.score - v.sides[1 - side].score;
    out.push({ id: lastId(v.q), kind: 'last', text: `Last possession, your ball, ${margin ? `down ${-margin}` : 'tied'}.` });
  }
  const t = lg.sim.T[side];
  const crunch = crunchTime(v);
  if (!lg.manualSubs && !crunch) return out;
  // the closing five: the rotation's, else the five the staff plans most minutes for
  const set = t.team.rotation.closers;
  const closers = new Set(
    set.length >= 5
      ? set
      : [...t.players]
          .sort((a, b) => b.planMin - a.planMin)
          .slice(0, 5)
          .map((p) => p.pid),
  );
  for (const pid of me.on) {
    const p = me.players.find((x) => x.pid === pid);
    if (!p || p.out !== 0) continue;
    if (v.q >= 4 && p.fouls === 5 && !dismissed.includes(`fouls-${pid}-5`)) return [...out, { id: `fouls-${pid}`, pid, text: `${names(pid)} has 5 fouls. One more and he's out.` }];
    if (crunch && closers.has(pid) && p.energy < t.t.manage.fatigueSub && !dismissed.some((d) => d.startsWith(`tired-${pid}-`)))
      return [...out, { id: `tired-${pid}-${v.q}`, pid, text: `${names(pid)} is gassed (${Math.round(p.energy * 100)}% energy).` }];
  }
  return out;
}

/**
 * The call to stop for now, of those `due`: the first not stopped for yet tonight, marked as stopped
 * for (each stops the game once). The last possession's marks the others due with it: its screen has
 * who's tired or in foul trouble, with the subs, so no stop follows it for them.
 */
export function takeStop(due: StopCall[], stopped: Set<string>): StopCall | null {
  const call = due.find((c) => !stopped.has(c.id));
  if (!call) return null;
  for (const c of call.kind === 'last' ? due : [call]) stopped.add(c.id);
  return call;
}
