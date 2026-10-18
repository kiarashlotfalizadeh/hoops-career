import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { haptic } from '../../native';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, ChevronsRight, FastForward, Play, RotateCcw, X } from 'lucide-react';
import { useLeague, useStore, useVersion } from '../../state/store';
import { act, edit } from '../../state/actions';
import { prepareLive, clearLive, dropLive, pendingLive, playedElsewhere, type LiveGame } from '../../state/live';
import { skipChoices, type SkipTo } from '../live/skip';
import { buildScript, captionAt, type Script } from '../live/choreo';
import { Court, courtFloor } from '../live/Court';
import { Empty, PageHeader, Sheet } from '../components/ui';
import { composites } from '../../core/ratings';
import type { League, PbpEntry, Settings, Tactics } from '../../core/types';
import type { PossLog } from '../../core/sim/log';
import { buildSimInput, neutralSite, userGameOnDay } from '../../core/league/games';
import { planFor } from '../../core/league/gamePlans';
import { hashString } from '../../core/random';
import { keptTactics } from '../live/keep';
import { fmtClock, periodLabel, rosterNames } from '../stats';
import { jerseyColors, matchupColors, teamLook } from '../teamColors';
import { flowActions, stillAlive } from '../flow';
import { playTypeBaselines } from '../../core/analysis/playTypes';
import { drawnPlayer, snapshot, subsLine, type Drawn } from '../live/drawn';
import { lateGame, liveAlerts, newEvents, type AlertInput, type LiveAlert, type LiveEvent } from '../live/alerts';
import { livePills, offPlan, resetToPlan } from '../live/pills';
import { isKey } from '../live/keyPlays';
import { createBeat, createTicker, type Beat, type Ticker } from '../live/ticker';
import { ScoreBug, gameContext } from '../live/ScoreBug';
import { HOT_STREAK } from '../live/OnCourt';
import { oppPlanIn } from '../../core/ai/opponentPlan';
import { TacticsPanel } from '../live/TacticsPanel';
import { BoxPanel } from '../live/BoxPanel';
import { OppPlayer } from '../live/OppPlayer';
import { MyPlayer, type SubOptions } from '../live/MyPlayer';
import { Break } from '../live/Break';
import { Calls } from '../live/Calls';
import { Clipboard, type ClipTab } from '../live/Clipboard';
import { Lineup, MiniFive } from '../live/Lineup';
import { Feed } from '../live/Feed';
import { Playback } from '../live/Playback';
import { QuickBar, type QuickFix } from '../live/QuickBar';
import { Banner, type BannerItem } from '../live/Banner';
import { useCalls } from '../live/plays';
import '../live/live.css';
import { FinalSlab, GameRecap } from '../components/GameRecap';
import { HighlightsCard } from '../components/HighlightsCard';
import { graphicCandidates, nextGraphic, type Graphic, type GraphicInput } from '../live/graphics';
import { GRAPHIC_MS, LowerThird, playersBefore } from '../live/LowerThird';
import { winProb } from '../../core/analysis/winProb';
import { gameKeys } from '../../core/analysis/keys';
import { otherGames } from '../live/scoreboard';
import { ScoresSheet, ScoreTicker } from '../live/ScoreTicker';
import { Intro } from '../live/Intro';

const FEED_MAX = 80;
const NO_LOGS: PossLog[] = [];
/** Key plays mode: the pause between possessions it doesn't draw (at 1×). */
const FF_MS = 90;
/** How long a banner stays over the court: an event, and the assistant's word (it has a line to read). */
const EVENT_MS = 4000;
const WORD_MS = 6500;
/** The docked clipboard needs this much height under the court to be worth showing (with less, your five in a row). */
const DOCK_MIN = 150;
const PEEK_MIN = 64;

type Status = 'loading' | 'none' | 'live' | 'final' | 'simmed';
/** 'player': one of the players (yours or theirs); 'break': a period's end; 'huddle': your timeout, while it's taken. */
type Panel = 'none' | 'player' | 'skip' | 'break' | 'huddle' | 'scores';
/**
 * Something the court shows in place of the game for a moment: a replay, asked for or the automatic
 * one of a shot at the buzzer. The possession it interrupts picks up where it was.
 */
interface Show {
  kind: 'replay' | 'auto';
  script: Script;
}
/** Replays run at this share of the game's speed. */
const REPLAY_SPEED = 0.55;

/** Whether a period's buzzer stops for a break with the period report. */
const breakAfter = (mode: NonNullable<Settings['liveBreaks']>, q: number) => (mode === 'quarters' ? true : mode === 'half' ? q === 2 : false);

/** An alert's banner, said once: a tired player's alert comes back as his legs go, but its banner doesn't. */
const bannerKey = (id: string) => id.replace(/^(tired-\d+)-\d+$/, '$1');

const EVENT_KICKER: Record<LiveEvent['kind'], string> = { injury: 'Injury', foulout: 'Fouled out', adjust: 'Adjustment' };

/**
 * What the user's side of a live game would be built from now: its tactics (with the game plan),
 * and hashes of them and of the rotation, to spot edits made away from /live (see LiveGame.seen).
 */
function userSetup(league: League, lg: LiveGame): { tactics: Tactics; seen: [number, number] } {
  const g = lg.game;
  const tactics = buildSimInput(league, league.userTid, g.day, g.type, lg.userSide === 0 ? g.away : g.home, g).team.tactics;
  return { tactics, seen: [hashString(JSON.stringify(tactics)), hashString(JSON.stringify(league.teams[league.userTid].rotation))] };
}

/**
 * The live game, broadcast first: the scorebug and the court own the screen; coaching is one row of
 * quick actions (a timeout, subs, a call, the staff's top fix, the Clipboard) and one Clipboard with
 * a tab for each way to coach; playback is a tap on the court; the breaks and your timeouts stop on
 * one break screen. The game itself is a journal (state/live.ts): every coaching move goes into it,
 * so the game picks up where it was after the app is closed.
 */
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
   * scorebug, the lineup, the alerts and the box score all read it.
   */
  const [view, setView] = useState<Drawn | null>(null);
  const viewRef = useRef<Drawn | null>(null);
  /** Injuries, foul-outs and coaching adjustments, once drawn: alerts for a while, banners over the court once. */
  const [events, setEvents] = useState<LiveEvent[]>([]);
  /** What's waiting to go up over the court, one at a time (the first is up). */
  const [banners, setBanners] = useState<BannerItem[]>([]);
  /** The banners said so far tonight (see bannerKey), and whether the alerts up now are to be taken as already said (the game was picked up, or skipped ahead). */
  const bannered = useRef({ said: new Set<string>(), seed: true });
  /** The broadcast graphic up now (see graphics.ts), and the ones shown so far: each once, one every two game minutes. */
  const [graphic, setGraphic] = useState<Graphic | null>(null);
  // graphics shown so far tonight, when the last went up, and whether this game was picked up part-way (see takeView)
  const gfx = useRef({ shown: new Set<string>(), last: null as number | null, seed: false });
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
  const [feed, setFeed] = useState<{ i: number; e: PbpEntry }[]>([]);
  const [panel, setPanel] = useState<Panel>('none');
  // the Clipboard: its tab, and whether it's open in its sheet (docked under the court otherwise, when there's room)
  const [clipTab, setClipTab] = useState<ClipTab>('lineup');
  const [clipOpen, setClipOpen] = useState(false);
  // the player whose sheet is open
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

  /** Put something up over the court (each once a night). */
  const queueBanner = useCallback((items: BannerItem[]) => {
    const said = bannered.current.said;
    const fresh = items.filter((b) => !said.has(bannerKey(b.id)));
    if (!fresh.length) return;
    for (const b of fresh) said.add(bannerKey(b.id));
    // (a pile-up keeps the latest few)
    setBanners((q) => [...q, ...fresh].slice(-3));
  }, []);

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
          const items = ev.map((e): BannerItem => {
            const i = e.kind === 'adjust' ? e.text.indexOf(': ') : -1;
            return {
              id: e.id,
              tone: e.kind === 'adjust' ? 'info' : 'bad',
              kicker: EVENT_KICKER[e.kind],
              title: i < 0 ? e.text.replace(/\.$/, '') : e.text.slice(0, i),
              line: i < 0 ? undefined : e.text.slice(i + 2).replace(/^./, (c) => c.toUpperCase()),
            };
          });
          if (banner) queueBanner(items);
          // (along a skip they're taken as said: what happened waits in the alerts and the play-by-play)
          else for (const b of items) bannered.current.said.add(bannerKey(b.id));
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
    },
    [queueBanner],
  );

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
    bannered.current = { said: new Set(), seed: true };
    gfx.current = { shown: new Set(), last: null, seed: !!lg && lg.steps > 0 };
    setGraphic(null);
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
  }, []);

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
      if (found.resumed === 'journal')
        useStore.getState().toast(`Picked up where you left off: ${s.clock <= 0.05 ? `end of ${periodLabel(s.q)}` : `${periodLabel(s.q)} ${fmtClock(s.clock)}`}.`);
      else useStore.getState().toast("Your game in progress couldn't be picked up where you left off, so it starts again from tip-off.", 'bad');
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
  // a graphic stays up a few seconds of play (it waits out a break)
  const graphicId = graphic?.id;
  useEffect(() => {
    if (!graphicId || atBreak) return;
    const t = setTimeout(() => setGraphic(null), GRAPHIC_MS);
    return () => clearTimeout(t);
  }, [graphicId, atBreak]);
  // one banner at a time, for a few seconds of play (it waits out a pause)
  const banner = banners[0];
  useEffect(() => {
    if (!banner || paused) return;
    const t = setTimeout(() => setBanners((b) => b.slice(1)), banner.kicker === 'Staff' ? WORD_MS : EVENT_MS);
    return () => clearTimeout(t);
  }, [banner, paused]);

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
    bannered.current.seed = true;
    setBanners([]);
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
  const coach = useCallback(<T,>(fn: (lg: LiveGame) => T): T | undefined => {
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

  /**
   * "Keep changes after this game" (see keptTactics), worked out again after every change: taking
   * one back (or "Reset to game plan") takes it out of the saved tactics too.
   */
  const keep = (lg: LiveGame) => {
    const base = lg.keep;
    if (!base) return;
    const kept = keptTactics(base, lg.planned, lg.sim.baseTactics(lg.userSide));
    edit((l) => {
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
      edit((l) => {
        lg.setKeep(null);
        l.teams[l.userTid].tactics = base;
        lg.markSeen(userSetup(l, lg).seen);
      });
    }
    setTick((x) => x + 1);
  };

  /** A substitution through the game (the court shows it from the next possession). */
  const substitute = (out: number, inn: number, quiet = false) => {
    const ok = !!coach((g) => g.substitute(out, inn));
    if (!ok) useStore.getState().toast(`${nameOf(inn)} can't come in for ${nameOf(out)} right now.`, 'bad');
    else if (!quiet) {
      haptic();
      useStore.getState().toast(`${nameOf(inn)} in for ${nameOf(out)}.`, 'good');
    }
    setTick((x) => x + 1);
    return ok;
  };

  const openClip = (tab?: ClipTab) => {
    if (tab) setClipTab(tab);
    setClipOpen(true);
  };

  const runAlert = (a: LiveAlert) => {
    const lg = liveRef.current;
    const what = a.action;
    if (!lg || !what) return;
    if (what.kind === 'timeout') callTimeout('stop the run');
    else if (what.kind === 'tactics') {
      applyTactics(what.apply);
      haptic();
      useStore.getState().toast(`${what.label}: from the next possession.`, 'good');
    } else if (what.kind === 'subs') openClip('lineup');
    else substitute(what.out, what.in);
    setDismissed((d) => [...d, a.id]);
  };

  // a tablet or phone's room under the court for the docked clipboard (and the court's own size: live.css)
  const [dockEl, setDockEl] = useState<HTMLDivElement | null>(null);
  const [dockH, setDockH] = useState(0);
  useEffect(() => {
    if (!dockEl) return;
    const ro = new ResizeObserver(() => setDockH(dockEl.clientHeight));
    ro.observe(dockEl);
    return () => ro.disconnect();
  }, [dockEl]);
  const [bugEl, setBugEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const page = bugEl?.closest<HTMLElement>('.lv');
    if (!bugEl || !page) return;
    const ro = new ResizeObserver(() => page.style.setProperty('--lv-bug-h', `${bugEl.offsetHeight}px`));
    ro.observe(bugEl);
    return () => {
      ro.disconnect();
      page.style.removeProperty('--lv-bug-h');
    };
  }, [bugEl]);

  const over = status !== 'live';
  const persist = !!game?.keep;
  const tactics = useMemo(
    () => (game ? game.sim.baseTactics(game.userSide) : null),
    // the tactics change through this screen (tick) and at resume (game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, tick],
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
  // the assistant's word goes up over the court once; what was up when the game was picked up (or skipped through) is taken as said
  useEffect(() => {
    if (over) return;
    const b = bannered.current;
    if (b.seed) {
      b.seed = false;
      for (const a of alerts) b.said.add(bannerKey(a.id));
      return;
    }
    queueBanner(alerts.map((a) => ({ id: a.id, tone: a.tone, kicker: 'Staff', title: a.title, line: a.text || undefined })));
    // the staff's word on something that's over (he's been subbed out, the run has ended) comes down
    const up = new Set(alerts.map((a) => bannerKey(a.id)));
    setBanners((q) => (q.some((x) => x.kicker === 'Staff' && !up.has(bannerKey(x.id))) ? q.filter((x) => x.kicker !== 'Staff' || up.has(bannerKey(x.id))) : q));
  }, [alerts, over, queueBanner]);

  const pills = useMemo(() => {
    if (!game || !view || !tactics || over) return [];
    const me = view.sides[game.userSide];
    const them = view.sides[1 - game.userSide];
    const oppOn = them.on.map((pid) => ({ pid, name: nameOf(pid), ftPct: drawnPlayer(view, pid)?.ftPct ?? 0.75 }));
    const five = them.players.filter((p) => them.on.includes(p.pid));
    // the player already targeted stays the target; otherwise their hottest shooter, or their leading scorer
    const targeted = tactics.defense.starPlan !== 'none' ? five.find((p) => p.pid === tactics.defense.starTarget) : undefined;
    const hot = [...five].filter((p) => p.streak >= HOT_STREAK).sort((a, b) => b.streak - a.streak)[0];
    const top = [...five].sort((a, b) => b.pts - a.pts)[0];
    const threat = targeted ?? hot ?? top;
    return livePills(tactics, game.planned, {
      q: view.q,
      clock: view.clock,
      margin: me.score - them.score,
      oppOn,
      oppThreat: threat && { pid: threat.pid, name: nameOf(threat.pid) },
    });
  }, [game, view, tactics, over, nameOf]);

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
        <PageHeader title="Live" back backTo="/games" />
        <Empty>
          {league.phase === 'preseason'
            ? 'No games yet: start the regular season from Today or the Play menu.'
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

  const result = resultGid !== null ? league.games.find((g) => g.gid === resultGid) : undefined;

  // ------------------------------------------------------------ the final: the result, the report, the next game
  if (over) {
    const final = status === 'final';
    return (
      <main className="page lv-final">
        <h1 className="sr-only">
          {final ? 'Final' : 'Simulated'}: {away.region} {away.name} {neutralSite(game.game) ? 'vs' : 'at'} {home.region} {home.name}
        </h1>
        <div className="sr-only" aria-live="polite">
          {announce}
        </div>
        {result ? (
          <FinalSlab res={result} league={league}>
            {!final && <div className="lv-simmed small">Played out from the Play menu: the result stands.</div>}
            <div className="lv-final-go">
              <button
                className="btn primary"
                // the report opens on the Why: the recap is already here
                onClick={() => nav(`/game/${result.gid}${final ? '?tab=report' : ''}`, { replace: true })}
              >
                <Activity size={16} aria-hidden="true" /> {final ? 'Game report' : 'Box score'}
              </button>
              {nextAction && (
                <button className="btn" disabled={simBusy} onClick={() => void nextGame()}>
                  Next game <ChevronsRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </FinalSlab>
        ) : (
          <Empty>{final ? 'Final.' : 'This game was simulated.'}</Empty>
        )}
        {result && <GameRecap res={result} league={league} highlights={final ? <HighlightsCard league={league} res={result} /> : undefined} />}
      </main>
    );
  }

  // ------------------------------------------------------------ the game
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
  const ffing = keyPlays && !script && !atBreak;
  // what the court draws: a replay in place of the game for a moment
  const drawing = show ? show.script : script;
  const canReplay = !show && !!lastDone.current && paused && !atBreak;
  // (the period being played, as the scorebug shows it: the drawn view still reads the one before on a period's first possession)
  const skipTo = skipChoices(atBreak ? view.q + 1 : quarter, atBreak, sim);
  // the sim is at the period's buzzer while the court draws its last possession: no timeout then (the break is the stop)
  const buzzer = sim.atBuzzer();
  const jersey = (pid: number) => league.players[pid]?.jersey || '0';
  // whose floor: the home team's, or a neutral one for the Cup final
  const floor = courtFloor(home, neutral, game.game.cup === 'final' ? 'NBA Cup' : '');
  const nextPeriod = periodLabel(view.q + 1);
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
        dismiss: () => setDismissed((d) => [...d, top.id]),
      }
    : null;

  const canTimeout = me.timeouts > 0 && !atBreak && !toPending && !intro && !buzzer && !simBusy;
  const toState = toPending
    ? game.timeoutWaiting
      ? ' left: timeout called, taken at the next dead ball'
      : ' left: timeout called, the court shows it next'
    : buzzer
      ? ' left: the period is ending'
      : ' left: call a timeout';

  /** A player's sheet: who can swap places with him. */
  const subsFor = (pid: number): SubOptions => {
    const sp = me.byId.get(pid);
    const line = (p: NonNullable<typeof sp>) => subsLine(view, userSide, p);
    if (!sp) return { on: false, out: 0, options: [] };
    const l = line(sp);
    if (l.out) return { on: sp.on, out: l.out, dnp: sp.dnp, options: [] };
    if (sp.on) {
      const staff = subFor(pid);
      const bench = me.players
        .filter((p) => !p.on && line(p).out === 0)
        .sort((a, b) => (a.pid === staff ? -1 : b.pid === staff ? 1 : b.energy - a.energy))
        .slice(0, 6);
      return { on: true, out: 0, options: bench.map((p) => ({ pid: p.pid, line: `${line(p).energy}%`, staff: p.pid === staff })) };
    }
    return {
      on: false,
      out: 0,
      options: me.on.map((p) => {
        const x = line(p);
        return { pid: p.pid, line: `${x.energy}%${x.fouls ? ` · ${x.fouls}F` : ''}` };
      }),
    };
  };
  const pickedP = panel === 'player' && picked !== undefined ? drawnPlayer(view, picked) : undefined;
  const pickedMine = pickedP ? me.byId.has(pickedP.pid) : false;

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
      timeout={huddle ? undefined : () => callTimeout()}
      onCalled={huddle ? undefined : () => setClipOpen(false)}
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
          onTap={(pid) => {
            setPicked(pid);
            setPanel('player');
          }}
          setManualSubs={(on) => {
            coach((g) => g.setManualSubs(on));
            setTick((x) => x + 1);
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
      {clipTab === 'pbp' && <Feed feed={feed} colors={colors} homeAbbrev={home.abbrev} awayAbbrev={away.abbrev} />}
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
      baselines={baselines}
      colors={barColors}
      apply={applyTactics}
      alerts={alerts}
      runAlert={runAlert}
      subFor={subFor}
      substitute={(out, inn) => {
        const ok = substitute(out, inn, true);
        // the court is waiting on the sim here: what it shows is the game as it stands
        if (ok && mode === 'huddle') takeView(game, false);
        return ok;
      }}
      calls={calls}
      drawUp={callsTab(true)}
      keys={keys}
      win={win}
      oppPlan={mode === 'period' ? oppPlanIn(sim, (1 - userSide) as 0 | 1)?.items : undefined}
      onGo={mode === 'huddle' ? resume : togglePause}
    />
  );

  return (
    <main className={`page lv${atBreak ? ' at-break' : ''}${docked ? ' has-dock' : ''}`}>
      {/* the scorebug is the visible title: screen readers get a heading to land on */}
      <h1 className="sr-only">
        Live game: {away.region} {away.name} {neutral ? 'vs' : 'at'} {home.region} {home.name}
      </h1>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <div className="lv-bug" ref={setBugEl}>
        <ScoreBug ticker={ticker} view={view} home={home} away={away} quarter={quarter} atBreak={atBreak} context={context} wpHome={wpHome}>
          {others.length > 0 && <ScoreTicker league={league} games={others} elapsed={view.elapsed} done={false} onOpen={() => setPanel('scores')} />}
        </ScoreBug>
      </div>

      <div className="lv-stage">
        <Court
          script={drawing}
          speed={show ? speed * REPLAY_SPEED : speed}
          paused={!show && paused}
          colors={colors}
          jersey={jersey}
          onDone={courtDone}
          // (a replay doesn't move the scorebug: it stays on the game as it stands)
          onTick={show ? undefined : (c, s) => ticker.set(c, s)}
          onBeat={beat.set}
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
        {!intro && !atBreak && (
          <Playback
            paused={paused}
            speed={speed}
            keyPlays={keyPlays}
            canReplay={canReplay}
            playLabel="Resume"
            reveal={reveal}
            onPause={togglePause}
            onSpeed={pickSpeed}
            onKeyPlays={toggleKeyPlays}
            onReplay={replay}
            onSkip={() => setPanel('skip')}
          />
        )}
        {(show || (!atBreak && (script || ffing || graphic || banner))) && (
          <div className="lv-lower">
            {show && (
              <div className="lv-show" role="status">
                <RotateCcw size={13} aria-hidden="true" />
                <span>Replay</span>
                <button className="lv-show-x" aria-label="Stop the replay" onClick={stopShow}>
                  <X size={14} />
                </button>
              </div>
            )}
            {(drawing || ffing) && (
              // the offense's colour along its edge, as the court's boards show who has the ball
              <div className="lv-cap" aria-hidden="true" style={drawing ? ({ '--cap-c': colors[drawing.off][0] } as CSSProperties) : undefined}>
                {drawing ? (
                  <Caption script={drawing} beat={beat} />
                ) : (
                  <span className="lv-cap-t ff">
                    <FastForward size={12} /> Key plays: on to the next one
                  </span>
                )}
              </div>
            )}
            {graphic && !show && <LowerThird key={graphic.id} g={graphic} kit={teamLook((graphic.side === 0 ? home : away).colors).slab} />}
            {banner && !show && !intro && <Banner key={banner.id} item={banner} onClose={() => setBanners((b) => b.slice(1))} />}
          </div>
        )}
        {intro && (
          <Intro
            league={league}
            teams={[home, away]}
            fives={[view.sides[0].on, view.sides[1].on]}
            kits={colors}
            names={nameOf}
            context={context}
            neutral={neutral}
            speed={speed}
            paused={paused}
            onTip={tipOff}
          />
        )}
        {atBreak && !show && (
          <div className="lv-break fade-in">
            <div className="lv-break-t">{view.q >= 4 ? (view.q === 4 ? 'Overtime' : `Overtime ${view.q - 3}`) : view.q === 2 ? 'Halftime' : `End of ${periodLabel(view.q)}`}</div>
            {view.q >= 4 && <div className="lv-break-s">Tied at {view.sides[0].score}.</div>}
            <div className="lv-break-go">
              <button className="btn primary" onClick={togglePause}>
                <Play size={16} fill="currentColor" aria-hidden="true" /> Start {nextPeriod}
              </button>
              <button className="btn lv-break-rep" onClick={() => setPanel('break')} aria-haspopup="dialog">
                Report
              </button>
              <button className="btn lv-break-rep lv-break-skip" onClick={() => setPanel('skip')} aria-label="Skip ahead" aria-haspopup="dialog">
                <FastForward size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* under the court, the clipboard docked when there's room for it (held sideways: beside the court, under the quick actions) */}
      <div className="lv-dock" ref={setDockEl}>
        {docked && !clipOpen && clipboard(true)}
        {!docked && dockH >= PEEK_MIN && (
          <MiniFive
            view={view}
            side={userSide}
            five={fives[userSide]}
            kit={colors[userSide]}
            fatigue={me.t.manage.fatigueSub}
            nameOf={nameOf}
            jersey={jersey}
            onTap={(pid) => {
              setPicked(pid);
              setPanel('player');
            }}
          />
        )}
      </div>

      <div className="lv-quick">
        <QuickBar
          timeouts={myView.timeouts}
          timeout={() => callTimeout()}
          canTimeout={canTimeout}
          toState={toState}
          onSubs={() => openClip('lineup')}
          onCall={() => openClip('calls')}
          called={!!calls.pending}
          late={late}
          fix={simBusy ? null : fix}
          clipOpen={clipOpen}
          onClip={() => (clipOpen ? setClipOpen(false) : openClip())}
        />
      </div>

      <Sheet open={clipOpen} onClose={() => setClipOpen(false)} title="Clipboard">
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
              subs={subsFor(pickedP.pid)}
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
      <Sheet open={huddling} onClose={resume} title={`Timeout ${me.team.abbrev}`}>
        {huddling && breakSheet('huddle')}
      </Sheet>
      <Sheet open={panel === 'scores'} onClose={() => setPanel('none')} title="Around the league">
        <ScoresSheet league={league} games={others} elapsed={view.elapsed} done={false} />
      </Sheet>
      <Sheet open={panel === 'skip'} onClose={() => setPanel('none')} title="Skip ahead">
        <div className="lv-skip">
          {skipTo.map((o) => (
            <button
              key={o.id}
              className="flow-opt"
              onClick={() => {
                setPanel('none');
                skip(o.id);
              }}
            >
              <span className="fo-l">{o.label}</span>
              <span className="fo-s">{o.sub}</span>
              <FastForward size={18} className="fo-c" aria-hidden="true" />
            </button>
          ))}
        </div>
      </Sheet>
    </main>
  );
}

/** The court's running call of the possession it's drawing ('Holmgren screens for Mitchell'), from the frame it has reached. */
function Caption({ script, beat }: { script: Script; beat: Beat }) {
  const i = useSyncExternalStore(beat.subscribe, beat.get);
  return <span className="lv-cap-t">{captionAt(script, i)}</span>;
}
