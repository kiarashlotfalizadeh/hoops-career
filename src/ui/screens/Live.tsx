import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { haptic } from '../../native';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ChevronsRight,
  ClipboardList,
  Clapperboard,
  FastForward,
  Home as HomeIcon,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Timer,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useLeague, useStore, useVersion } from '../../state/store';
import { prepareLive, clearLive, playedElsewhere, CLUTCH_SEC, type LiveGame } from '../../state/live';
import { buildScript, captionAt, type Script } from '../live/choreo';
import { Court } from '../live/Court';
import { Card, Empty, PageHeader, Sheet, Toggle, scrollBehavior } from '../components/ui';
import { LateGameCard } from '../live/LateGameCard';
import { composites } from '../../core/ratings';
import type { League, PbpEntry, Settings, Tactics } from '../../core/types';
import type { PossLog } from '../../core/sim/log';
import { buildSimInput, userGameOnDay } from '../../core/league/games';
import { planFor } from '../../core/league/gamePlans';
import { hashString } from '../../core/random';
import { keptTactics } from '../live/keep';
import { fmtClock, pbpOpacity, periodLabel, rosterNames } from '../stats';
import { jerseyColors, matchupColors } from '../teamColors';
import { flowActions, stillAlive } from '../flow';
import { LIVE_SPEEDS } from '../settingsOptions';
import { playTypeBaselines } from '../../core/analysis/playTypes';
import { drawnPlayer, snapshot, type Drawn } from '../live/drawn';
import { liveAlerts, newEvents, type AlertInput, type LiveAlert, type LiveEvent } from '../live/alerts';
import { livePills } from '../live/pills';
import { isKey } from '../live/keyPlays';
import { createBeat, createTicker, type Beat, type Ticker } from '../live/ticker';
import { ScoreBug, gameContext } from '../live/ScoreBug';
import { HOT_STREAK, OnCourt } from '../live/OnCourt';
import { PeriodReport } from '../live/PeriodReport';
import { oppPlanIn } from '../../core/ai/opponentPlan';
import { TacticsPanel } from '../live/TacticsPanel';
import { BoxPanel } from '../live/BoxPanel';
import { SubsPanel } from '../live/SubsPanel';
import { OppPlayer } from '../live/OppPlayer';
import { MyPlayer } from '../live/MyPlayer';
import { Huddle } from '../live/Huddle';
import { PlayPicker } from '../live/PlayPicker';
import { useCalls } from '../live/plays';
import '../live/live.css';
import { GameRecap } from '../components/GameRecap';
import { graphicCandidates, nextGraphic, type Graphic, type GraphicInput } from '../live/graphics';
import { GRAPHIC_MS, LowerThird, playersBefore } from '../live/LowerThird';
import { winProb } from '../../core/analysis/winProb';
import { pickHighlights } from '../live/highlights';
import { gameKeys } from '../../core/analysis/keys';

const FEED_MAX = 80;
const NO_LOGS: PossLog[] = [];
/** Key plays mode: the pause between possessions it doesn't draw (at 1×). */
const FF_MS = 90;
/** How long an event banner stays over the court. */
const BANNER_MS = 3200;

type Status = 'loading' | 'none' | 'live' | 'final' | 'simmed';
/** 'player': one of theirs; 'mine': one of yours; 'huddle': your timeout, while it's taken. */
type Panel = 'none' | 'subs' | 'tactics' | 'stats' | 'skip' | 'player' | 'mine' | 'plays' | 'huddle';
type SkipTo = 'quarter' | 'half' | 'clutch' | 'end';
/**
 * Something the court shows in place of the game for a moment: a replay (asked for, or the automatic
 * one of a shot at the buzzer) or the night's highlights after the final. The possession it
 * interrupts picks up where it was.
 */
interface Show {
  kind: 'replay' | 'auto' | 'reel';
  scripts: Script[];
  i: number;
  /** For the reel: when each play happened and the score it left ('Q4 0:02 · OKC 101-100'). */
  tags?: string[];
}
/** Replays run at this share of the game's speed. */
const REPLAY_SPEED = 0.55;

/** Whether a period's buzzer stops for a break with the period report. */
const breakAfter = (mode: NonNullable<Settings['liveBreaks']>, q: number) => (mode === 'quarters' ? true : mode === 'half' ? q === 2 : false);

/**
 * What the user's side of a live game would be built from now: its tactics (with the game plan),
 * and hashes of them and of the rotation, to spot edits made away from /live (see LiveGame.seen).
 */
function userSetup(league: League, lg: LiveGame): { tactics: Tactics; seen: [number, number] } {
  const g = lg.game;
  const tactics = buildSimInput(league, league.userTid, g.day, g.type, lg.userSide === 0 ? g.away : g.home, g).team.tactics;
  return { tactics, seen: [hashString(JSON.stringify(tactics)), hashString(JSON.stringify(league.teams[league.userTid].rotation))] };
}

export default function Live() {
  const league = useLeague();
  const nav = useNavigate();
  const loc = useLocation();
  const simBusy = useStore((s) => !!s.sim);
  const liveRef = useRef<LiveGame | null>(null);
  const pbpRead = useRef(0);
  /**
   * The game as of the last possession the court finished drawing (see drawn.ts): the sim runs a
   * possession ahead of the court, and its stats would give away the play still being drawn. The
   * scorebug, the strip, the alerts and the box score all read it.
   */
  const [view, setView] = useState<Drawn | null>(null);
  const viewRef = useRef<Drawn | null>(null);
  /** Injuries, foul-outs and coaching adjustments, once drawn: alerts for a while, banners over the court once. */
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [banners, setBanners] = useState<LiveEvent[]>([]);
  /** The broadcast graphic up now (see graphics.ts), and the ones shown so far: each once, one every two game minutes. */
  const [graphic, setGraphic] = useState<Graphic | null>(null);
  // graphics shown so far tonight, when the last went up, and whether this game was picked up part-way (see takeView)
  const gfx = useRef({ shown: new Set<string>(), last: null as number | null, seed: false });
  /** A timeout the user called that the court hasn't shown yet (it opens the next possession). */
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
  // the frame the court has reached in the possession it's drawing: the caption over the backcourt follows it
  const [beat] = useState<Beat>(() => createBeat());
  const [script, setScript] = useState<Script | null>(null);
  const [show, setShow] = useState<Show | null>(null);
  // read when the court finishes drawing (from its animation loop): the latest of each
  const showRef = useRef<Show | null>(null);
  showRef.current = show;
  const scriptRef = useRef<Script | null>(null);
  scriptRef.current = script;
  /** The possession the court last finished drawing: what Replay shows. */
  const lastDone = useRef<Script | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [speed, setSpeed] = useState<number>(() => league.settings.liveSpeed || 1);
  const [paused, setPaused] = useState(false);
  // stopped at a period's buzzer (a natural break or a skip): the next period starts when the user resumes
  const [atBreak, setAtBreak] = useState(false);
  const [feed, setFeed] = useState<{ i: number; e: PbpEntry }[]>([]);
  const [panel, setPanel] = useState<Panel>('none');
  // the player a tap on the strip picked: to come out (yours) or to look at (theirs)
  const [picked, setPicked] = useState<number | undefined>();
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
  // while a game is on, a phone's tab bar gives way to the coaching dock (theme.css: :root[data-gameday])
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
        timeoutPending: toPending,
        events,
        names: nameOf,
        baselines,
        complexity: league.settings.complexity,
        subFor,
      };
    },
    [home, away, atBreak, toPending, events, nameOf, baselines, league.settings.complexity, subFor],
  );
  // tonight's keys to the game, as the preview set them (from the games before today)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const keys = useMemo(() => (game ? gameKeys(league, game.game) : []), [game]);
  // what the graphics know about the players from before tip-off (tonight's game isn't in the stats yet)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const before = useMemo(() => (game ? playersBefore(league, game.sim) : new Map()), [game]);
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
    [home, away, nameOf, before],
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
  const takeView = useCallback((lg: LiveGame, banner = true) => {
    const prev = viewRef.current;
    const next = snapshot(lg.sim);
    viewRef.current = next;
    setView(next);
    const [h, a] = loopHelpers.current.teams;
    if (prev && h && a) {
      const ev = newEvents(prev, next, lg.sim.adjustments, lg.sim.injuries, [h, a], loopHelpers.current.nameOf);
      if (ev.length) {
        setEvents((e) => [...e, ...ev].slice(-20));
        if (banner) setBanners((b) => [...b, ...ev].slice(-4));
      }
    }
    // a game picked up part-way (the app was closed, or this screen left and opened again): what the
    // court already showed when it was picked up went up then, or had its moment, so only what happens
    // from here gets a graphic
    if (gfx.current.seed && prev) {
      gfx.current.seed = false;
      for (const g of loopHelpers.current.graphicsDue(prev, lg)) gfx.current.shown.add(g.id);
    }
    // a broadcast graphic, now and then (not along a skip: that would be a string of them)
    const g = banner ? loopHelpers.current.graphicFor(next, lg) : null;
    if (g) {
      gfx.current.shown.add(g.id);
      // a break's team number doesn't hold up the next one
      if (g.kind !== 'team') gfx.current.last = next.elapsed;
      setGraphic(g);
    }
    return next;
  }, []);

  const clearFF = () => {
    clearTimeout(ff.current.timer);
    ff.current = { timer: 0, waiting: false };
  };

  const attach = useCallback((lg: LiveGame | null) => {
    liveRef.current = lg;
    clearTimeout(ff.current.timer);
    ff.current = { timer: 0, waiting: false };
    brokeAt.current = 0;
    viewRef.current = lg ? snapshot(lg.sim) : null;
    setView(viewRef.current);
    setEvents([]);
    setBanners([]);
    gfx.current = { shown: new Set(), last: null, seed: !!lg && lg.steps > 0 };
    setGraphic(null);
    setToPending(false);
    huddleNext.current = false;
    setGame(lg);
    setScript(null);
    setShow(null);
    lastDone.current = null;
    setAtBreak(false);
    setPaused(false);
    setDismissed([]);
    setPanel('none');
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
  }, []);

  /** What became of the game this screen is coaching: null while it's still the screen's to finish. */
  const fate = useCallback((lg: LiveGame) => playedElsewhere(lg, useStore.getState().league!), []);

  const start = useCallback(() => {
    let lg: LiveGame | null = null;
    const notes: string[] = [];
    useStore.getState().mutate((l) => {
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
    });
    const found = lg as LiveGame | null;
    // the app was closed mid-game: say where it picked up (or that it couldn't)
    if (found?.resumed) {
      const s = found.sim;
      if (found.resumed === 'journal')
        useStore.getState().toast(`Picked up where you left off: ${s.clock <= 0.05 ? `end of ${periodLabel(s.q)}` : `${periodLabel(s.q)} ${fmtClock(s.clock)}`}.`);
      else useStore.getState().toast("Your game in progress couldn't be picked up where you left off, so it starts again from tip-off.", 'bad');
      found.resumed = undefined;
    }
    if (notes.length) useStore.getState().toast(notes.join(' '));
    attach(found);
  }, [attach]);

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
      setStatus('final');
      setResultGid(res.gid);
      ticker.set(0, [res.home.pts, res.away.pts], true);
      const [h, a] = lg.sim.T;
      setAnnounce(`Final: ${a.team.abbrev} ${res.away.pts}, ${h.team.abbrev} ${res.home.pts}`);
      const me = lg.userSide === 0 ? res.home.pts : res.away.pts;
      const them = lg.userSide === 0 ? res.away.pts : res.home.pts;
      haptic(me > them ? 'success' : 'warning');
    },
    [ticker],
  );

  const showSimmed = useCallback(
    (lg: LiveGame) => {
      const res = useStore.getState().league!.games.find((g) => g.gid === lg.game.gid);
      clearLive();
      setPanel('none');
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
      useStore.getState().mutate((l) => void lg.commit(l));
      clearLive();
    }
    // the box score and the strip show the final numbers
    viewRef.current = snapshot(lg.sim);
    setView(viewRef.current);
    if (lg.committed) showFinal(lg);
    else showSimmed(lg);
  }, [fate, start, showFinal, showSimmed]);

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

  /** Stopped at a period's buzzer: the period report comes up, and the next period starts when the user resumes. */
  const enterBreak = useCallback(
    (lg: LiveGame) => {
      // a break is a good moment to save where the game is (the app may be closed next)
      useStore.getState().mutate(() => void lg.checkpoint());
      setScript(null);
      setAtBreak(true);
      setPaused(true);
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
    // a timeout called while the last possession was drawn opens the next one
    setToPending(false);
    const v = takeView(lg);
    const s = lg.sim;
    // the court has got to the user's timeout: the game waits in the huddle (the sim is no longer ahead)
    if (huddleNext.current && !lg.over) {
      huddleNext.current = false;
      setScript(null);
      setPaused(true);
      setPanel('huddle');
      return;
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

  /** The court finished drawing: the next play of a replay or the reel, an automatic replay of a shot at the buzzer, or the next possession. */
  const courtDone = () => {
    const sh = showRef.current;
    if (sh) {
      if (sh.i + 1 < sh.scripts.length) return setShow({ ...sh, i: sh.i + 1 });
      setShow(null);
      if (sh.kind === 'auto') nextRef.current();
      return;
    }
    const sc = scriptRef.current;
    if (sc) lastDone.current = sc;
    if (sc?.moment && useStore.getState().league?.settings.liveReplays !== false) {
      setShow({ kind: 'auto', scripts: [{ ...sc }], i: 0 });
      return;
    }
    nextRef.current();
  };
  const replay = () => {
    const sc = lastDone.current;
    if (sc && !showRef.current) setShow({ kind: 'replay', scripts: [{ ...sc }], i: 0 });
  };
  /** The night's highlights, from the possessions the game played, on the court after the final. */
  const playReel = () => {
    const lg = liveRef.current;
    if (!lg || showRef.current) return;
    const picks = pickHighlights(lg.logs, lg.userSide);
    if (!picks.length) return;
    const ab: [string, string] = [lg.sim.T[0].team.abbrev, lg.sim.T[1].team.abbrev];
    const scripts = picks.map((h) => buildScript(lg.logs[h.i], info, h.i > 0 ? lg.logs[h.i - 1].score : [0, 0], ab, loopHelpers.current.nameOf));
    const tags = picks.map((h) => {
      const l = lg.logs[h.i];
      return `${periodLabel(l.q)} ${fmtClock(l.clockEnd)} · ${ab[1]} ${l.score[1]}, ${ab[0]} ${l.score[0]}`;
    });
    setShow({ kind: 'reel', scripts, i: 0, tags });
    // (after the final the page scrolls: bring the court back up, once the button that started it has settled)
    requestAnimationFrame(() => stageRef.current?.scrollIntoView({ block: 'start', behavior: scrollBehavior() }));
  };

  const huddling = panel === 'huddle';
  useEffect(() => {
    if (status === 'live' && !script && !atBreak && !huddling && !ff.current.timer && !ff.current.waiting) nextPossession();
  }, [status, script, atBreak, huddling, nextPossession]);
  // a fast-forward that came up during a pause goes on when it ends
  useEffect(() => {
    if (!paused && ff.current.waiting && status === 'live') {
      ff.current.waiting = false;
      nextPossession();
    }
  }, [paused, status, nextPossession]);
  // a graphic stays up a few seconds of play (it waits out a break)
  const graphicId = graphic?.id;
  useEffect(() => {
    if (!graphicId || atBreak) return;
    const t = setTimeout(() => setGraphic(null), GRAPHIC_MS);
    return () => clearTimeout(t);
  }, [graphicId, atBreak]);
  // one event banner at a time
  const bannerId = banners[0]?.id;
  useEffect(() => {
    if (!bannerId) return;
    const t = setTimeout(() => setBanners((b) => b.slice(1)), BANNER_MS);
    return () => clearTimeout(t);
  }, [bannerId]);

  const skip = (to: SkipTo) => {
    const lg = liveRef.current;
    if (!lg || status !== 'live') return;
    clearFF();
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
    setToPending(false);
    ticker.set(s.clock, [s.T[0].score, s.T[1].score], true);
    if (lg.over) return finish();
    if (s.clock <= 0.05) {
      // a real break: subs and tactic changes made now apply from the next period's first possession
      brokeAt.current = s.q;
      return enterBreak(lg);
    }
    // clutch time: the court picks up from here (saved there, like a break)
    useStore.getState().mutate(() => void lg.checkpoint());
    const [h, a] = s.T;
    if (to === 'clutch') setAnnounce(`Clutch time: ${fmtClock(s.clock)} left in ${periodLabel(s.q)}. ${a.team.abbrev} ${a.score}, ${h.team.abbrev} ${h.score}.`);
    setAtBreak(false);
    setPaused(false);
    nextPossession();
  };
  const togglePause = () => {
    if (atBreak) {
      setAtBreak(false);
      setPaused(false);
      return;
    }
    // and so is a pause
    const lg = liveRef.current;
    if (!paused && lg) useStore.getState().mutate(() => void lg.checkpoint());
    setPaused((p) => !p);
  };
  const pickSpeed = (to: number) => {
    setSpeed(to);
    // the next game starts at the speed you left this one at (it's the Settings default too)
    if (league.settings.liveSpeed !== to) useStore.getState().mutate((l) => void (l.settings.liveSpeed = to));
  };
  const toggleKeyPlays = () => useStore.getState().mutate((l) => void (l.settings.liveKeyPlays = !keyPlays));

  /**
   * Every coaching move goes through the game, into its journal, inside a league change: the save
   * that follows keeps it, so the game survives the app being closed.
   */
  const coach = useCallback(<T,>(fn: (lg: LiveGame) => T): T | undefined => {
    const lg = liveRef.current;
    if (!lg) return undefined;
    let out: T | undefined;
    useStore.getState().mutate(() => void (out = fn(lg)));
    return out as T | undefined;
  }, []);

  const callTimeout = (reason?: string) => {
    const lg = liveRef.current;
    if (!lg || lg.over || !coach((g) => g.callTimeout(reason))) return;
    // the court flashes it as the next possession opens: the one possession still being drawn finishes
    // first, and then the huddle comes up
    setToPending(true);
    huddleNext.current = true;
    setAnnounce(`Timeout ${lg.sim.T[userSide].team.abbrev}.`);
    setTick((x) => x + 1);
  };

  /**
   * "Keep changes after this game" (see keptTactics), worked out again after every change: taking
   * one back (or "Reset to game plan") takes it out of the saved tactics too.
   */
  const keep = (lg: LiveGame) => {
    const base = lg.keep;
    if (!base) return;
    const kept = keptTactics(base, lg.planned, lg.sim.baseTactics(lg.userSide));
    useStore.getState().mutate((l) => {
      l.teams[l.userTid].tactics = kept;
      // this screen made the change: resuming later shouldn't treat it as an outside edit
      lg.markSeen(userSetup(l, lg).seen);
    });
  };

  /** Every in-game tactics change goes through the tactics the coach set (never an in-game overlay on them). */
  const applyTactics = (fn: (t: Tactics) => void) => {
    const lg = liveRef.current;
    if (!lg) return;
    const t = lg.sim.baseTactics(userSide);
    fn(t);
    coach((g) => g.setTactics(t));
    keep(lg);
    setTick((x) => x + 1);
  };

  /** "Keep changes after this game" (kept with the game, so it's still on after the app was closed). */
  const setKeep = (on: boolean) => {
    const lg = liveRef.current;
    if (!lg) return;
    if (on) {
      // what was changed before it was turned on is kept too
      coach((g) => g.setKeep(useStore.getState().league!.teams[g.userTid].tactics));
      keep(lg);
    } else if (lg.keep) {
      // off again: the saved tactics go back to what they were
      const base = lg.keep;
      useStore.getState().mutate((l) => {
        lg.setKeep(null);
        l.teams[l.userTid].tactics = base;
        lg.markSeen(userSetup(l, lg).seen);
      });
    }
    setTick((x) => x + 1);
  };

  const runAlert = (a: LiveAlert) => {
    const lg = liveRef.current;
    const act = a.action;
    if (!lg || !act) return;
    if (act.kind === 'timeout') callTimeout('stop the run');
    else if (act.kind === 'tactics') applyTactics(act.apply);
    else if (act.kind === 'subs') {
      setPicked(undefined);
      setPanel('subs');
    } else {
      if (!coach((g) => g.substitute(act.out, act.in))) useStore.getState().toast(`${nameOf(act.in)} can't come in for ${nameOf(act.out)} right now.`, 'bad');
      setTick((x) => x + 1);
    }
    setDismissed((d) => [...d, a.id]);
  };

  const over = status !== 'live';
  const persist = !!game?.keep;
  const tactics = useMemo(
    () => (game ? game.sim.baseTactics(game.userSide) : null),
    // the tactics change through this screen (tick) and at resume (game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, tick],
  );
  // play calls: one waiting at a time, shared by the Late game card, the Plays sheet, the huddle and the player sheet
  const calls = useCalls({
    gid: game?.game.gid ?? -1,
    side: userSide,
    logs: game?.logs ?? NO_LOGS,
    quarter: script?.q ?? view?.q ?? 1,
    initial: game?.pendingCall ?? null,
    call: (c) => !!coach((g) => g.callPlay(c)),
    cancel: () => coach((g) => g.cancelPlay()),
  });
  const resume = () => {
    setPanel('none');
    setPaused(false);
  };
  const alerts = useMemo(() => {
    if (!view || over) return [];
    const input = alertInput(view);
    return input ? liveAlerts(input).filter((s) => !dismissed.includes(s.id)) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tick, dismissed, over, alertInput]);

  const pills = useMemo(() => {
    if (!game || !view || !tactics || over) return [];
    const them = view.sides[1 - game.userSide];
    const oppOn = them.on.map((pid) => ({ pid, name: nameOf(pid), ftPct: drawnPlayer(view, pid)?.ftPct ?? 0.75 }));
    const five = them.players.filter((p) => them.on.includes(p.pid));
    // the player already targeted stays the target; otherwise their hottest shooter, or their leading scorer
    const targeted = tactics.defense.starPlan !== 'none' ? five.find((p) => p.pid === tactics.defense.starTarget) : undefined;
    const hot = [...five].filter((p) => p.streak >= HOT_STREAK).sort((a, b) => b.streak - a.streak)[0];
    const top = [...five].sort((a, b) => b.pts - a.pts)[0];
    const threat = targeted ?? hot ?? top;
    return livePills(tactics, game.planned, {
      complexity: league.settings.complexity,
      q: view.q,
      clock: view.clock,
      oppOn,
      oppThreat: threat && { pid: threat.pid, name: nameOf(threat.pid) },
    });
  }, [game, view, tactics, over, nameOf, league.settings.complexity]);

  const gameNo = useMemo(() => {
    const s = game?.game.seriesId ? league.playoffs.find((x) => x.id === game.game.seriesId) : undefined;
    return s ? s.highWins + s.lowWins + 1 : undefined;
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
    if (!mounted.current) return;
    // with the pre-game screen on, game night starts with the matchup preview
    const l = useStore.getState().league!;
    if (l.settings.pregame !== false && userGameOnDay(l, l.day)) nav('/preview', { replace: true });
    else start();
  };

  if (status === 'none') {
    return (
      <main className="page">
        <PageHeader title="Live" back backTo="/" />
        <Empty>
          {league.phase === 'preseason'
            ? 'No games yet: start the regular season from Home or the Play menu.'
            : (league.phase === 'playin' || league.phase === 'playoffs') && !stillAlive(league)
              ? 'Your season is over: no more games until next season.'
              : ['regular', 'playin', 'playoffs'].includes(league.phase)
                ? 'No game for your team today.'
                : 'No games until next season.'}
        </Empty>
        {nextAction?.sim && (
          <button className="btn primary block big" disabled={simBusy} onClick={() => void nextGame()}>
            <ChevronsRight size={18} /> Sim to next game
          </button>
        )}
      </main>
    );
  }
  if (!game || !home || !away || !colors || !view || !tactics)
    return (
      <main className="page">
        <Empty>Preparing the arena…</Empty>
      </main>
    );

  const sim = game.sim;
  const me = sim.T[userSide];
  const quarter = script?.q ?? view.q;
  const result = resultGid !== null ? league.games.find((g) => g.gid === resultGid) : undefined;
  const won = !!result && (userSide === 0 ? result.home.pts > result.away.pts : result.away.pts > result.home.pts);
  // the fives the court is drawing (between possessions, the ones on the floor now)
  const fives: [number[], number[]] = script ? (script.off === 0 ? [script.oPids, script.dPids] : [script.dPids, script.oPids]) : [view.sides[0].on, view.sides[1].on];
  const flowKits = matchupColors(home.colors, away.colors);
  // the user's team carries the accent in two-team comparisons (away first)
  const barColors: [string, string] = userSide === 1 ? ['var(--accent)', 'var(--text-dim)'] : ['var(--text-dim)', 'var(--accent)'];
  const plan = planFor(league, userSide === 0 ? game.game.away : game.game.home, game.game);
  const banner = banners[0];
  const ffing = keyPlays && !script && !atBreak && !over;
  // what the court draws: a replay or the reel in place of the game for a moment
  const drawing = show ? show.scripts[show.i] : script;
  const canReplay = status === 'live' && !show && !!lastDone.current && paused;
  // (only worked out once the game is over)
  const reelSize = status === 'final' ? pickHighlights(game.logs, game.userSide).length : 0;
  const skipTo: { id: SkipTo; label: string; sub: string }[] = [
    { id: 'quarter', label: `End of ${periodLabel(atBreak ? view.q + 1 : view.q)}`, sub: 'Stops at the break with the period report.' },
    // (from the first quarter's break, the end of the next quarter is halftime)
    ...(view.q === 1 && !atBreak ? [{ id: 'half' as SkipTo, label: 'Halftime', sub: 'Plays through the second quarter too.' }] : []),
    ...(view.q < 4 || (view.q === 4 && view.clock > CLUTCH_SEC) ? [{ id: 'clutch' as SkipTo, label: 'Clutch time', sub: '5:00 left in the fourth quarter.' }] : []),
    { id: 'end', label: 'Sim to final', sub: 'The rest plays out instantly with your current plan and rotation.' },
  ];
  const strip = (
    <OnCourt
      view={view}
      fives={fives}
      side={userSide}
      info={[
        { abbrev: home.abbrev, kit: colors[0], manage: sim.T[0].t.manage },
        { abbrev: away.abbrev, kit: colors[1], manage: sim.T[1].t.manage },
      ]}
      names={nameOf}
      jersey={(pid) => league.players[pid]?.jersey || '0'}
      onTap={(pid, mine) => {
        if (over) return;
        setPicked(pid);
        setPanel(mine ? 'mine' : 'player');
      }}
    />
  );
  const pickedOpp = panel === 'player' && picked !== undefined ? drawnPlayer(view, picked) : undefined;
  const pickedMine = panel === 'mine' && picked !== undefined ? drawnPlayer(view, picked) : undefined;
  // the Plays sheet and its sets from Advanced depth (Simple keeps the Late game card)
  const playsOn = league.settings.complexity !== 'simple';

  return (
    <main className={`page full live-page${over ? ' done' : ''}`} style={{ gap: 10 }}>
      {/* the scorebug is the visible title: screen readers get a heading to land on */}
      <h1 className="sr-only">
        Live game: {away.region} {away.name} at {home.region} {home.name}
      </h1>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <div className="live-grid">
        <div className="col live-left" style={{ gap: 10 }}>
          {/* the scorebug and the court: on a phone they stay at the top while the rest scrolls under them */}
          <div className="live-stage" ref={stageRef}>
            <ScoreBug ticker={ticker} view={view} home={home} away={away} quarter={quarter} over={over} ot={result?.ot ?? 0} context={context} wpHome={wpHome} />
            <div className="live-court">
              <Court
                script={drawing}
                speed={show && show.kind !== 'reel' ? speed * REPLAY_SPEED : speed}
                paused={!show && (paused || over)}
                colors={colors}
                jersey={(pid) => league.players[pid]?.jersey || '0'}
                onDone={courtDone}
                // (a replay doesn't move the scorebug: it stays on the game as it stands)
                onTick={show ? undefined : (c, s) => ticker.set(c, s)}
                onBeat={beat.set}
                names={nameOf}
                abbrevs={[home.abbrev, away.abbrev]}
                label={
                  show
                    ? `Court: ${show.kind === 'reel' ? `highlight ${show.i + 1} of ${show.scripts.length}` : 'replay'}, ${drawing?.label ?? ''}.`
                    : over
                      ? 'Court: the game is over.'
                      : atBreak
                        ? `Court: end of ${periodLabel(view.q)}.`
                        : ffing
                          ? 'Court: fast-forwarding to the next key play.'
                          : `Court: ${script?.label ?? 'tip-off'}.`
                }
              />
              {banner && !over && !show && (
                <div key={banner.id} className={`live-banner fade-in ${banner.kind}`} role="status">
                  {banner.text}
                </div>
              )}
              {show && (
                <div className="live-show" role="status">
                  {show.kind === 'reel' ? <Clapperboard size={13} /> : <RotateCcw size={13} />}
                  <span>{show.kind === 'reel' ? `Highlights ${show.i + 1}/${show.scripts.length}` : 'Replay'}</span>
                  {show.tags && <span className="live-show-tag">{show.tags[show.i]}</span>}
                  <button
                    className="live-show-x"
                    aria-label={show.kind === 'reel' ? 'Stop the highlights' : 'Stop the replay'}
                    onClick={() => {
                      const kind = show.kind;
                      setShow(null);
                      if (kind === 'auto') nextRef.current();
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {atBreak && !over && !show && (
                <div
                  className="col center fade-in live-break"
                  style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, background: 'rgba(6,8,12,0.62)' }}
                >
                  <div className="display bold" style={{ fontSize: 26, textTransform: 'uppercase', color: '#fff' }}>
                    {view.q === 2 ? 'Halftime' : `End of ${periodLabel(view.q)}`}
                  </div>
                  <div className="small" style={{ maxWidth: 280, color: '#d6dbe3' }}>
                    The period report is with the coaching panels. Subs and adjustments you make now apply from the first possession of {periodLabel(view.q + 1)}.
                  </div>
                  <button className="btn primary sm" onClick={togglePause}>
                    <Play size={16} fill="currentColor" /> Start {periodLabel(view.q + 1)}
                  </button>
                </div>
              )}
              {(show || (!over && !atBreak && (script || ffing || graphic))) && (
                <div className="live-lower">
                  {(drawing || ffing) && (
                    <div className="pill" aria-hidden="true" style={{ background: 'rgba(6,8,12,0.78)', color: '#fff', maxWidth: '100%' }}>
                      {drawing ? (
                        <span style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: colors[drawing.off][0], border: `1px solid ${colors[drawing.off][1]}` }} />
                      ) : (
                        <FastForward size={12} />
                      )}
                      {drawing ? <Caption script={drawing} beat={beat} /> : <span className="ellipsis small">Fast-forward to the next key play</span>}
                    </div>
                  )}
                  {graphic && !show && <LowerThird key={graphic.id} g={graphic} kit={flowKits[graphic.side]} />}
                </div>
              )}
              {/* playback, over the court like a video's: pause, speed, key plays and skip */}
              {status === 'live' && (
                <div className="live-mini" role="group" aria-label="Playback">
                  {canReplay && (
                    <button className="live-mini-btn" onClick={replay} aria-label="Replay the last play">
                      <RotateCcw size={16} />
                    </button>
                  )}
                  <button className="live-mini-btn" onClick={togglePause} aria-label={atBreak ? `Start ${periodLabel(view.q + 1)}` : paused ? 'Resume' : 'Pause'}>
                    {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} />}
                  </button>
                  <button
                    className="live-mini-btn num"
                    onClick={() => pickSpeed(LIVE_SPEEDS[(LIVE_SPEEDS.findIndex((x) => x.id === speed) + 1) % LIVE_SPEEDS.length].id)}
                    aria-label={`Speed ${speed}×: tap for ${LIVE_SPEEDS[(LIVE_SPEEDS.findIndex((x) => x.id === speed) + 1) % LIVE_SPEEDS.length].label}`}
                  >
                    {speed}×
                  </button>
                  <button
                    className={`live-mini-btn${keyPlays ? ' on' : ''}`}
                    aria-pressed={keyPlays}
                    aria-label="Key plays only"
                    title="Only draw the key plays: crunch time, the ends of periods, runs, timeouts and anything your assistant flags"
                    onClick={toggleKeyPlays}
                  >
                    <Zap size={16} />
                  </button>
                  <button className="live-mini-btn" onClick={() => setPanel('skip')} aria-label="Skip ahead">
                    <FastForward size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* a game simulated elsewhere: the coached version never happened, so don't show its floor */}
          {status !== 'simmed' && <div className="live-strip-under">{strip}</div>}

          {status !== 'live' && (
            <Card accent>
              {status === 'final' ? (
                <>
                  <div className="bold" style={{ fontSize: 18 }}>
                    Final: {away.abbrev} {ticker.get().score[1]}, {home.abbrev} {ticker.get().score[0]}
                  </div>
                  <div className="small dim" style={{ marginBottom: 10 }}>
                    {won ? 'Win! ' : 'Loss. '}The full breakdown shows exactly why.
                  </div>
                </>
              ) : (
                <>
                  <div className="bold" style={{ fontSize: 18 }}>
                    This game was simulated
                  </div>
                  <div className="small dim" style={{ marginBottom: 10 }}>
                    It was played out from the Play menu, so the result stands.
                  </div>
                </>
              )}
              <button className="btn primary block" disabled={resultGid === null} onClick={() => resultGid !== null && nav(`/game/${resultGid}`, { replace: true })}>
                <Activity size={16} /> {status === 'final' ? 'Game report' : 'Box score'}
              </button>
              {status === 'final' && reelSize > 0 && (
                <button className="btn block" style={{ marginTop: 8 }} disabled={!!show} onClick={playReel}>
                  <Clapperboard size={16} /> {show?.kind === 'reel' ? 'Playing the highlights…' : `Watch the highlights (${reelSize})`}
                </button>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn grow" onClick={() => nav('/', { replace: true })}>
                  <HomeIcon size={16} /> Home
                </button>
                {nextAction && (
                  <button className="btn grow" disabled={simBusy} onClick={() => void nextGame()}>
                    Next game <ChevronsRight size={16} />
                  </button>
                )}
              </div>
            </Card>
          )}
          {status === 'final' && result && <GameRecap res={result} league={league} />}
        </div>
        <div className="col live-right" style={{ gap: 10 }}>
          {/* the coaching buttons: a dock in place of the tab bar on a phone, the top of this column elsewhere */}
          {!over && (
            <div className={`grid4 live-ctl live-dock${playsOn ? ' five' : ''}`} role="group" aria-label="Coaching">
              <button
                className="btn sm"
                disabled={me.timeouts <= 0 || atBreak || toPending}
                onClick={() => callTimeout()}
                aria-label={toPending ? 'TO: timeout called, the court shows it next' : `TO: call a timeout, ${view.sides[userSide].timeouts} left`}
              >
                <Timer size={16} /> TO
                <span className="live-dock-n num" aria-hidden="true">
                  {view.sides[userSide].timeouts}
                </span>
              </button>
              <button
                className="btn sm"
                onClick={() => {
                  setPicked(undefined);
                  setPanel('subs');
                }}
              >
                <Users size={16} /> Subs
              </button>
              {playsOn && (
                <button
                  className={`btn sm ${calls.pending ? 'primary' : ''}`}
                  onClick={() => setPanel('plays')}
                  aria-label={calls.pending ? 'Plays: a call is waiting' : 'Plays: call a play'}
                >
                  <ClipboardList size={16} /> Plays
                </button>
              )}
              <button className="btn sm" onClick={() => setPanel('tactics')}>
                <SlidersHorizontal size={16} /> Adjust
              </button>
              <button className="btn sm" onClick={() => setPanel('stats')}>
                <ListOrdered size={16} /> Box
              </button>
            </div>
          )}

          {status !== 'simmed' && <div className="live-strip-side">{strip}</div>}

          {alerts.slice(0, 2).map((s) => (
            <div key={s.id} className="card tight fade-in" style={{ borderColor: `color-mix(in srgb, var(--${s.tone === 'info' ? 'info' : s.tone}) 40%, transparent)` }}>
              <div className="row top">
                <Zap size={16} style={{ color: `var(--${s.tone === 'info' ? 'info' : s.tone})`, flex: 'none', marginTop: 2 }} />
                <div className="grow small">{s.text}</div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                <button className="btn xs ghost" onClick={() => setDismissed((d) => [...d, s.id])}>
                  Dismiss
                </button>
                {s.action && (
                  <button className="btn xs primary" onClick={() => runAlert(s)}>
                    {s.action.label}
                  </button>
                )}
              </div>
            </div>
          ))}

          {!over && (
            <LateGameCard
              side={userSide}
              shown={ticker}
              quarter={quarter}
              logs={game.logs}
              drawing={!!script}
              nameOf={nameOf}
              timeout={() => callTimeout()}
              calls={calls}
              onSets={playsOn ? () => setPanel('plays') : undefined}
            />
          )}

          {atBreak && !over && (
            <PeriodReport
              league={league}
              view={view}
              side={userSide}
              teams={[home, away]}
              tactics={tactics}
              names={nameOf}
              baselines={baselines}
              colors={barColors}
              apply={applyTactics}
              onStart={togglePause}
              oppPlan={game ? oppPlanIn(game.sim, (1 - userSide) as 0 | 1)?.items : undefined}
              win={wpHome === undefined ? undefined : userSide === 0 ? wpHome : 1 - wpHome}
              keys={keys}
            />
          )}

          {!over && pills.length > 0 && (
            <div className="hscroll live-pills" role="group" aria-label="Quick adjustments">
              {pills.map((p) => (
                <button key={p.id} className={`chip ${p.on ? 'on' : ''}`} aria-pressed={p.id === 'reset' ? undefined : p.on} title={p.help} onClick={() => applyTactics(p.apply)}>
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {status !== 'simmed' && <Feed feed={feed} colors={colors} />}
        </div>
      </div>

      <Sheet open={panel === 'subs'} onClose={() => setPanel('none')} title="Substitutions">
        <SubsPanel
          key={picked ?? -1}
          sim={sim}
          view={view}
          side={userSide}
          nameOf={nameOf}
          initialOut={picked}
          substitute={(out, inn) => !!coach((g) => g.substitute(out, inn))}
          setManualSubs={(on) => coach((g) => g.setManualSubs(on))}
          onChange={() => setTick((x) => x + 1)}
        />
      </Sheet>
      <Sheet open={panel === 'tactics'} onClose={() => setPanel('none')} title="In-game adjustments">
        <TacticsPanel
          tactics={tactics}
          apply={applyTactics}
          persist={persist}
          setPersist={setKeep}
          complexity={league.settings.complexity}
          plan={plan?.items ?? []}
          oppOn={sim.T[1 - userSide].on.map((p) => p.pid)}
          myOn={me.on.map((p) => p.pid)}
          guardOf={(pid) => me.guardOf.get(pid)?.pid}
          nameOf={nameOf}
          q={view.q}
        />
      </Sheet>
      <Sheet open={panel === 'stats'} onClose={() => setPanel('none')} title="Live box score">
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
      </Sheet>
      <Sheet open={panel === 'player' && !!pickedOpp} onClose={() => setPanel('none')} title={picked !== undefined ? nameOf(picked) : 'Player'}>
        {pickedOpp && (
          <OppPlayer p={pickedOpp} name={nameOf(pickedOpp.pid)} tactics={tactics} complexity={league.settings.complexity} clock={view.clock} q={view.q} apply={applyTactics} />
        )}
      </Sheet>
      <Sheet open={panel === 'mine' && !!pickedMine} onClose={() => setPanel('none')} title={picked !== undefined ? nameOf(picked) : 'Player'}>
        {pickedMine && (
          <MyPlayer
            league={league}
            p={pickedMine}
            name={nameOf(pickedMine.pid)}
            tactics={tactics}
            complexity={league.settings.complexity}
            oppOn={view.sides[1 - userSide].on}
            guarding={[...me.guardOf].find(([, d]) => d.pid === pickedMine.pid)?.[0]}
            nameOf={nameOf}
            apply={applyTactics}
            calls={calls}
            onSub={() => setPanel('subs')}
          />
        )}
      </Sheet>
      <Sheet open={panel === 'plays'} onClose={() => setPanel('none')} title="Plays">
        <PlayPicker league={league} tactics={tactics} me={view.sides[userSide]} calls={calls} nameOf={nameOf} late />
      </Sheet>
      <Sheet open={huddling} onClose={resume} title={`Timeout ${me.team.abbrev}`}>
        <Huddle
          league={league}
          view={view}
          side={userSide}
          teams={[home, away]}
          tactics={tactics}
          nameOf={nameOf}
          win={wpHome === undefined ? undefined : userSide === 0 ? wpHome : 1 - wpHome}
          subFor={subFor}
          substitute={(out, inn) => {
            const ok = !!coach((g) => g.substitute(out, inn));
            if (!ok) useStore.getState().toast(`${nameOf(inn)} can't come in for ${nameOf(out)} right now.`, 'bad');
            // the court is waiting on the sim here: what it shows is the game as it stands
            if (game) takeView(game, false);
            return ok;
          }}
          alerts={alerts}
          runAlert={runAlert}
          apply={applyTactics}
          calls={calls}
          onResume={resume}
          keys={keys}
        />
      </Sheet>
      <Sheet open={panel === 'skip'} onClose={() => setPanel('none')} title="Skip ahead">
        <div className="col" style={{ gap: 8 }}>
          <div className="row between" style={{ gap: 10 }}>
            <span className="small dim2">Speed</span>
            <div className="seg" role="group" aria-label="Speed" style={{ flex: 'none' }}>
              {LIVE_SPEEDS.map((s) => (
                <button key={s.id} className={speed === s.id ? 'on' : ''} aria-pressed={speed === s.id} onClick={() => pickSpeed(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            on={keyPlays}
            onChange={toggleKeyPlays}
            label="Key plays only"
            help="Draws crunch time, the ends of periods, runs, timeouts and anything your assistant flags, and fast-forwards the rest."
          />
          {skipTo.map((o) => (
            <button
              key={o.id}
              className={`btn block ${o.id === 'end' ? '' : 'ghost'} live-skip`}
              onClick={() => {
                setPanel('none');
                skip(o.id);
              }}
            >
              <FastForward size={16} />
              <span className="col" style={{ alignItems: 'flex-start', gap: 0 }}>
                <span>{o.label}</span>
                <span className="tiny dim">{o.sub}</span>
              </span>
            </button>
          ))}
          <button className="btn block ghost" onClick={() => setPanel('none')}>
            Keep coaching
          </button>
        </div>
      </Sheet>
    </main>
  );
}

/** The court's running call of the possession it's drawing ('Holmgren screens for Mitchell'), from the frame it has reached. */
function Caption({ script, beat }: { script: Script; beat: Beat }) {
  const i = useSyncExternalStore(beat.subscribe, beat.get);
  return <span className="small live-cap">{captionAt(script, i)}</span>;
}

/** The play-by-play only re-renders when new lines arrive, not on every animation frame. */
const Feed = memo(function Feed({ feed, colors }: { feed: { i: number; e: PbpEntry }[]; colors: [[string, string], [string, string]] }) {
  return (
    <Card title="Play-by-play">
      <div className="col" style={{ gap: 6, maxHeight: 300, overflowY: 'auto' }}>
        {feed.map(({ i, e }) => (
          <div key={i} className="row top small" style={{ gap: 8, opacity: pbpOpacity(e.kind) }}>
            <span className="tiny dim num" style={{ width: 58, flex: 'none' }}>
              {periodLabel(e.q)} {fmtClock(e.clock)}
            </span>
            <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, background: e.t === -1 ? 'transparent' : colors[e.t][0], flex: 'none' }} />
            <span className="grow dim2" style={{ fontWeight: e.kind === 'period' || e.kind === 'timeout' ? 700 : undefined }}>
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
});
