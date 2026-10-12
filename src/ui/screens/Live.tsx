import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { haptic } from '../../native';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, ChevronsRight, FastForward, Hand, Home as HomeIcon, ListOrdered, Pause, Play, SlidersHorizontal, Timer, Users, Zap } from 'lucide-react';
import { useLeague, useStore, useVersion } from '../../state/store';
import { prepareLive, clearLive, type LiveGame } from '../../state/live';
import { buildScript, type Script } from '../live/choreo';
import { Court } from '../live/Court';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Chips, Empty, PageHeader, Segmented, Sheet, Slider, Tag, Toggle } from '../components/ui';
import { composites } from '../../core/ratings';
import type { DefScheme, League, PbpEntry, PnrCoverage, PressMode, StarPlan, Tactics, Team } from '../../core/types';
import { COVERAGE_META, PRESS_META, SCHEME_META, STAR_PLAN_META, cloneTactics } from '../../core/sim/tactics';
import { FINISH_LABEL, type FinishType, type PossLog } from '../../core/sim/log';
import { impactAdvice, impactSentence, teamRef } from '../../core/analysis/gameReport';
import { buildSimInput } from '../../core/league/games';
import { shade } from '../components/ui';
import type { GameSim, SP } from '../../core/sim/engine';
import { finalLabel, fmtClock, pbpOpacity, periodLabel, rosterNames } from '../stats';
import { adviceFor } from '../seasonAnalysis';
import { colorDistance } from '../teamColors';
import { flowActions, stillAlive } from '../flow';
import { LIVE_SPEEDS } from '../settingsOptions';

const FEED_MAX = 80;

interface Suggestion {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}

type Status = 'loading' | 'none' | 'live' | 'final' | 'simmed';

/** "an 8-0 run", "an 11-0 run", "a 12-0 run". */
const aRun = (n: number) => `${n === 8 || n === 11 || n === 18 || (n >= 80 && n < 90) ? 'an' : 'a'} ${n}-0 run`;

/**
 * Clock and score as the court animates them. A tiny store outside React state, so only the
 * scorebug re-renders, at most ~4 times a second plus each basket, instead of the whole page.
 */
function createTicker(clock: number, score: [number, number]) {
  let state = { clock, score };
  let last = 0;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (fn: () => void) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    set(c: number, s: [number, number] | null, force = false) {
      const score = s ?? state.score;
      const scored = score[0] !== state.score[0] || score[1] !== state.score[1];
      const now = performance.now();
      if (!force && !scored && (now - last < 250 || fmtClock(c) === fmtClock(state.clock))) return;
      last = now;
      state = { clock: c, score };
      subs.forEach((f) => f());
    },
  };
}
type Ticker = ReturnType<typeof createTicker>;

/** What the user's side of a live game was built from, to spot edits made away from /live. */
interface Setup {
  tactics: Tactics;
  sig: string;
  rotation: string;
}
const setups = new WeakMap<LiveGame, Setup>();

function userSetup(league: League, lg: LiveGame): Setup {
  const g = lg.game;
  const tactics = buildSimInput(league, league.userTid, g.day, g.type, lg.userSide === 0 ? g.away : g.home).team.tactics;
  return { tactics, sig: JSON.stringify(tactics), rotation: JSON.stringify(league.teams[league.userTid].rotation) };
}

/** Per-type points per possession across this season's stored games (both teams), with engine-typical fallbacks. */
const DEFAULT_PPP: Record<string, number> = {
  pnrBH: 0.85,
  pnrRoll: 1.3,
  iso: 0.95,
  post: 1.0,
  spotup: 1.05,
  offscreen: 1.05,
  handoff: 1.0,
  cut: 1.35,
  transition: 1.3,
  putback: 1.4,
  misc: 0.2,
};
function playTypeBaselines(league: League): Record<string, number> {
  const sum: Record<string, { poss: number; pts: number }> = {};
  for (const g of league.games) {
    if (g.season !== league.season) continue;
    for (const box of [g.home, g.away]) {
      for (const [k, v] of Object.entries(box.playTypes ?? {})) {
        const e = (sum[k] ??= { poss: 0, pts: 0 });
        e.poss += v.poss;
        e.pts += v.pts;
      }
    }
  }
  const out = { ...DEFAULT_PPP };
  for (const [k, v] of Object.entries(sum)) if (v.poss >= 300) out[k] = v.pts / v.poss;
  return out;
}

/** How unusual a play type's points are against its baseline, in standard errors (scores are mostly 2s and 3s). */
function zScore(v: { poss: number; pts: number }, base: number) {
  const sd = Math.sqrt(Math.max(0.5, 2.3 * base - base * base));
  return (v.pts / v.poss - base) / (sd / Math.sqrt(v.poss));
}

export default function Live() {
  const league = useLeague();
  const nav = useNavigate();
  const loc = useLocation();
  const simBusy = useStore((s) => !!s.sim);
  const liveRef = useRef<LiveGame | null>(null);
  const pbpRead = useRef(0);
  const announced = useRef('');
  const [game, setGame] = useState<LiveGame | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [ticker, setTicker] = useState<Ticker>(() => createTicker(720, [0, 0]));
  const [script, setScript] = useState<Script | null>(null);
  const [speed, setSpeed] = useState<number>(() => league.settings.liveSpeed || 1);
  const [paused, setPaused] = useState(false);
  // stopped at a period's buzzer by "Qtr": the next period starts when the user resumes
  const [atBreak, setAtBreak] = useState(false);
  const [feed, setFeed] = useState<{ i: number; e: PbpEntry }[]>([]);
  const [panel, setPanel] = useState<'none' | 'subs' | 'tactics' | 'stats' | 'end'>('none');
  // "Keep changes after this game": kept while the adjustments sheet is closed, until the next game
  const [persist, setPersist] = useState(false);
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [resultGid, setResultGid] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ text: string; id: number } | null>(null);
  const [announce, setAnnounce] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baselines = useMemo(() => playTypeBaselines(league), [league.season]);

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

  const attach = useCallback((lg: LiveGame | null) => {
    liveRef.current = lg;
    setGame(lg);
    setScript(null);
    setAtBreak(false);
    setPaused(false);
    setDismissed([]);
    setPanel('none');
    setPersist(false);
    setBanner(null);
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

  /** The game this screen is coaching was played without it (simmed from the Play menu). */
  const playedElsewhere = useCallback((lg: LiveGame) => !lg.committed && useStore.getState().league!.games.some((g) => g.gid === lg.game.gid), []);

  const start = useCallback(() => {
    let lg: LiveGame | null = null;
    useStore.getState().mutate((l) => {
      lg = prepareLive(l);
    });
    const found = lg as LiveGame | null;
    if (found && !found.committed) {
      // resuming: Tactics or game-plan edits made away from this screen take over; the stint plan can't change mid-game
      const l = useStore.getState().league!;
      const now = userSetup(l, found);
      const seen = setups.get(found);
      const notes: string[] = [];
      if (seen && seen.sig !== now.sig) {
        found.sim.setTactics(found.userSide, now.tactics);
        notes.push('Your tactics changes are in effect.');
      }
      if (seen && seen.rotation !== now.rotation) notes.push('Rotation changes apply from the next game.');
      if (notes.length) useStore.getState().toast(notes.join(' '));
      setups.set(found, now);
    }
    attach(found);
  }, [attach]);

  // a fresh visit to /live (also from the final card or the Play menu) picks up today's game; one in progress keeps going
  useEffect(() => {
    const lg = liveRef.current;
    if (lg && !lg.committed && !playedElsewhere(lg)) return;
    start();
  }, [loc.key, start, playedElsewhere]);

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
    if (!lg.committed && !playedElsewhere(lg)) {
      useStore.getState().mutate((l) => void lg.commit(l));
      clearLive();
    }
    if (lg.committed) showFinal(lg);
    else showSimmed(lg);
  }, [playedElsewhere, showFinal, showSimmed]);

  // another screen finished this game (the Play menu's sims): stop animating a ghost
  const v = useVersion();
  useEffect(() => {
    const lg = liveRef.current;
    if (!lg || status !== 'live') return;
    if (lg.committed) showFinal(lg);
    else if (playedElsewhere(lg)) showSimmed(lg);
  }, [v, status, playedElsewhere, showFinal, showSimmed]);

  const nextPossession = useCallback(() => {
    const lg = liveRef.current;
    if (!lg || lg.committed || playedElsewhere(lg)) return finish();
    // the play-by-play catches up with the court only now, so it never gives away a play still being drawn
    const lines = flushFeed();
    // screen readers hear the basket and the score the court just finished showing, at most once a possession
    const shown = ticker.get().score;
    if (shown.join('-') !== announced.current) {
      announced.current = shown.join('-');
      const basket = lines.find((e) => e.kind === 'make' || e.kind === 'ft');
      setAnnounce(`${basket ? `${basket.text} ` : ''}${lg.sim.T[1].team.abbrev} ${shown[1]}, ${lg.sim.T[0].team.abbrev} ${shown[0]}.`);
    }
    let logs: PossLog[] = [];
    let guard = 0;
    while (!logs.length && !lg.over && guard++ < 5) logs = lg.step();
    if (!logs.length) {
      flushFeed();
      return finish();
    }
    setScript(buildScript(logs[logs.length - 1], info));
    setTick((t) => t + 1);
  }, [info, finish, flushFeed, playedElsewhere, ticker]);

  useEffect(() => {
    if (status === 'live' && !script && !atBreak) nextPossession();
  }, [status, script, atBreak, nextPossession]);

  const skip = (to: 'quarter' | 'end') => {
    const lg = liveRef.current;
    if (!lg || status !== 'live') return;
    // the sim runs a possession ahead of the court: already at the buzzer, "Qtr" stops at this break, not the next one
    if (!(to === 'quarter' && lg.sim.clock <= 0.05)) lg.simTo(to);
    // a decided game ends at the buzzer: no break before an overtime that won't be played
    if (to === 'quarter' && !lg.over && lg.sim.q >= 4 && lg.sim.T[0].score !== lg.sim.T[1].score) lg.step();
    flushFeed();
    ticker.set(lg.sim.clock, [lg.sim.T[0].score, lg.sim.T[1].score], true);
    if (lg.over) finish();
    else if (to === 'quarter') {
      // a real break: subs and tactic changes made now apply from the next period's first possession
      setScript(null);
      setAtBreak(true);
      setPaused(true);
      const [h, a] = lg.sim.T;
      setAnnounce(`End of ${periodLabel(lg.sim.q)}. ${a.team.abbrev} ${a.score}, ${h.team.abbrev} ${h.score}.`);
    } else nextPossession();
  };
  const togglePause = () => {
    if (atBreak) {
      setAtBreak(false);
      setPaused(false);
    } else setPaused((p) => !p);
  };

  const userSide = game?.userSide ?? 0;

  const callTimeout = (reason?: string) => {
    const lg = liveRef.current;
    if (!lg || !lg.sim.callTimeout(userSide, reason)) return;
    const abbrev = lg.sim.T[userSide].team.abbrev;
    setBanner({ text: `TIMEOUT ${abbrev}`, id: Date.now() });
    setAnnounce(`Timeout ${abbrev}.`);
    setTick((x) => x + 1);
  };

  const applyTactics = (fn: (t: Tactics) => void, persist: boolean) => {
    const lg = liveRef.current;
    if (!lg) return;
    const t = cloneTactics(lg.sim.T[userSide].t);
    fn(t);
    lg.sim.setTactics(userSide, t);
    if (persist) {
      useStore.getState().mutate((l) => {
        const tt = l.teams[l.userTid].tactics;
        fn(tt);
        // a star target is one of tonight's opponents: the saved plan goes after each opponent's own star
        tt.defense.starTarget = null;
        tt.manual = true;
      });
      // this screen made the change: resuming later shouldn't treat it as an outside edit
      setups.set(lg, userSetup(useStore.getState().league!, lg));
    }
    setTick((x) => x + 1);
  };

  const home = game ? league.teams[game.game.home] : null;
  const away = game ? league.teams[game.game.away] : null;
  const colors = useMemo<[[string, string], [string, string]] | null>(() => {
    if (!home || !away) return null;
    const c: [[string, string], [string, string]] = [
      [home.colors[0], home.colors[1] === home.colors[0] ? home.colors[2] : home.colors[1]],
      [away.colors[0], away.colors[1] === away.colors[0] ? away.colors[2] : away.colors[1]],
    ];
    if (colorDistance(c[0][0], c[1][0]) < 90) c[1] = ['#f1f1f1', away.colors[0]];
    return c;
  }, [home, away]);

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

  const over = status !== 'live';
  const suggestions = useMemo<Suggestion[]>(() => {
    const lg = liveRef.current;
    if (!lg || over) return [];
    const me = lg.sim.T[userSide];
    const them = lg.sim.T[1 - userSide];
    const out: Suggestion[] = [];
    // a timeout can't be called at a quarter break
    if (them.run >= 8 && me.timeouts > 0 && !atBreak)
      out.push({ id: `run-${them.score}`, text: `The ${them.team.name} are on ${aRun(them.run)}.`, action: { label: 'Timeout', run: () => callTimeout('stop the run') } });
    for (const p of me.on) {
      if (p.energy < 0.55) {
        const bench = me.players.filter((b) => !b.on && b.out === 0 && b.energy > 0.8).sort((a, b) => b.c.create + b.c.helpD - (a.c.create + a.c.helpD))[0];
        out.push({
          id: `tired-${p.pid}-${Math.round(p.energy * 10)}`,
          text: `${nameOf(p.pid)} is gassed (${Math.round(p.energy * 100)}% energy).`,
          action: bench ? { label: `Sub ${nameOf(bench.pid)}`, run: () => (lg.sim.substitute(userSide, p.pid, bench.pid), setTick((x) => x + 1)) } : undefined,
        });
      }
      if (p.fouls >= Math.min(lg.sim.q + 1, 5) && lg.sim.q < 4) out.push({ id: `fouls-${p.pid}-${p.fouls}`, text: `${nameOf(p.pid)} has ${p.fouls} fouls.` });
    }
    // opponent play types torching us: well above this season's norm for that play, on a real sample
    // ("Other" is presses, the clock and late fouls: nothing to adjust against)
    for (const [k, v] of Object.entries(them.pt)) {
      const base = baselines[k];
      if (k === 'misc' || base === undefined || v.poss < 12 || zScore(v, base) <= 2) continue;
      const ft = k as FinishType;
      const cov = me.t.defense.pnr;
      // ball-screen coverage only applies in man-to-man
      const man = me.t.defense.scheme === 'man';
      let advice: Suggestion['action'];
      let text = `Their ${FINISH_LABEL[ft]} is scoring ${(v.pts / v.poss).toFixed(2)} per possession (league ${base.toFixed(2)}).`;
      if (ft === 'pnrBH' && man && cov === 'drop') {
        text += ' Drop is giving their handlers room.';
        advice = { label: 'Switch to Hedge', run: () => applyTactics((t) => void (t.defense.pnr = 'hedge'), false) };
      } else if (ft === 'spotup' && me.t.defense.help > 55) {
        text += ' Too much help is leaving shooters open.';
        advice = { label: 'Stay home', run: () => applyTactics((t) => void (t.defense.help = 35), false) };
      } else if (ft === 'transition') {
        advice = { label: 'Sprint back', run: () => applyTactics((t) => void ((t.defense.getBack = 85), (t.offense.crashBoards = Math.min(t.offense.crashBoards, 30))), false) };
      } else if (ft === 'post') {
        advice = { label: 'Double the post', run: () => applyTactics((t) => void (t.defense.help = 80), false) };
      } else if (ft === 'pnrRoll' && man && cov !== 'drop') {
        advice = { label: 'Go to Drop', run: () => applyTactics((t) => void (t.defense.pnr = 'drop'), false) };
      }
      out.push({ id: `pt-${k}`, text, action: advice });
    }
    for (const [k, v] of Object.entries(me.pt)) {
      const base = baselines[k];
      if (k !== 'misc' && base !== undefined && v.poss >= 12 && zScore(v, base) < -2)
        out.push({
          id: `mypt-${k}`,
          text: `Our ${FINISH_LABEL[k as FinishType]} is stalling (${(v.pts / v.poss).toFixed(2)} PPP, league ${base.toFixed(2)}). Consider running other actions.`,
        });
    }
    // biggest tactical edge against us so far
    // only advice that still applies: a switch away from the coverage that was burned silences it
    const worst = [...lg.sim.impacts.values()].filter((im) => im.t !== userSide && im.pts >= 2.5 && impactAdvice(im.key, me.t)).sort((a, b) => b.pts - a.pts)[0];
    if (worst) {
      out.push({
        id: `imp-${worst.key}`,
        text: `${impactSentence(worst.key, teamRef(them.team), teamRef(me.team))} ${adviceFor(impactAdvice(worst.key, me.t)!, league.settings.complexity)}`,
      });
    }
    return out.filter((s) => !dismissed.includes(s.id)).slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, dismissed, over, atBreak, nameOf, baselines]);

  // only offered once the game is over (or there is none): not worked out on every possession
  const nextAction = status !== 'live' ? flowActions(league).find((a) => !a.disabled && (a.cmd === 'watchLive' || a.sim?.kind === 'untilUserGame')) : undefined;
  const nextGame = async () => {
    if (nextAction?.sim) await useStore.getState().simulate(nextAction.sim);
    // left during the sim: don't set up a live game nobody is watching
    if (mounted.current) start();
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
  if (!game || !home || !away || !colors)
    return (
      <main className="page">
        <Empty>Preparing the arena…</Empty>
      </main>
    );

  const sim = game.sim;
  const me = sim.T[userSide];
  const quarter = script?.q ?? sim.q;
  const result = resultGid !== null ? league.games.find((g) => g.gid === resultGid) : undefined;
  const won = !!result && (userSide === 0 ? result.home.pts > result.away.pts : result.away.pts > result.home.pts);

  return (
    <main className="page full" style={{ gap: 10 }}>
      <ScoreBug ticker={ticker} sim={sim} home={home} away={away} quarter={quarter} over={over} ot={result?.ot ?? 0} />
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      <div className="live-grid">
        <div className="col live-left" style={{ gap: 10 }}>
          {/* court */}
          <div className="live-court" style={{ position: 'relative' }}>
            <Court
              script={script}
              speed={speed}
              paused={paused || over}
              colors={colors}
              jersey={(pid) => league.players[pid]?.jersey || '0'}
              onDone={nextPossession}
              onTick={(c, s) => ticker.set(c, s)}
              label={over ? 'Court: the game is over.' : atBreak ? `Court: end of ${periodLabel(sim.q)}.` : `Court: ${script?.label ?? 'tip-off'}.`}
              banner={banner}
            />
            {atBreak && !over && (
              <div
                className="col center fade-in"
                style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, background: 'rgba(6,8,12,0.62)' }}
              >
                <div className="display bold" style={{ fontSize: 26, textTransform: 'uppercase' }}>
                  {sim.q === 2 ? 'Halftime' : `End of ${periodLabel(sim.q)}`}
                </div>
                <div className="small dim2" style={{ maxWidth: 280 }}>
                  Subs and adjustments you make now apply from the first possession of {periodLabel(sim.q + 1)}.
                </div>
                <button className="btn primary sm" onClick={togglePause}>
                  <Play size={16} fill="currentColor" /> Start {periodLabel(sim.q + 1)}
                </button>
              </div>
            )}
            {script && !over && (
              <div className="pill" aria-hidden="true" style={{ position: 'absolute', left: 8, bottom: 8, background: 'rgba(6,8,12,0.78)', maxWidth: '85%' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: colors[script.off][0], border: `1px solid ${colors[script.off][1]}` }} />
                <span className="ellipsis small">{script.label}</span>
              </div>
            )}
          </div>

          {/* controls */}
          {status === 'live' ? (
            <div className="row live-ctl" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <div className="seg" role="group" aria-label="Speed" style={{ flex: 'none' }}>
                {LIVE_SPEEDS.map((s) => (
                  <button
                    key={s.id}
                    className={speed === s.id ? 'on' : ''}
                    aria-pressed={speed === s.id}
                    onClick={() => {
                      setSpeed(s.id);
                      // the next game starts at the speed you left this one at (it's the Settings default too)
                      if (league.settings.liveSpeed !== s.id) useStore.getState().mutate((l) => void (l.settings.liveSpeed = s.id));
                    }}
                    style={{ padding: '0 10px' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="grow" />
              <button className="btn sm" onClick={() => skip('quarter')} disabled={atBreak} aria-label="Qtr: sim to the end of the quarter">
                <ChevronsRight size={16} /> Qtr
              </button>
              <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPanel('end')}>
                Sim to final
              </button>
            </div>
          ) : (
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
        </div>
        <div className="col" style={{ gap: 10 }}>
          {suggestions.map((s) => (
            <div key={s.id} className="card tight fade-in" style={{ borderColor: 'color-mix(in srgb, var(--warn) 40%, transparent)' }}>
              <div className="row top">
                <Zap size={16} style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }} />
                <div className="grow small">{s.text}</div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                <button className="btn xs ghost" onClick={() => setDismissed((d) => [...d, s.id])}>
                  Dismiss
                </button>
                {s.action && (
                  <button
                    className="btn xs primary"
                    onClick={() => {
                      s.action!.run();
                      setDismissed((d) => [...d, s.id]);
                    }}
                  >
                    {s.action.label}
                  </button>
                )}
              </div>
            </div>
          ))}

          {!over && (
            <div className="grid4 live-ctl">
              <button className="btn sm" disabled={me.timeouts <= 0 || atBreak} onClick={() => callTimeout()} aria-label={`TO: call a timeout, ${me.timeouts} left`}>
                <Timer size={16} /> TO
              </button>
              <button className="btn sm" onClick={() => setPanel('subs')}>
                <Users size={16} /> Subs
              </button>
              <button className="btn sm" onClick={() => setPanel('tactics')}>
                <SlidersHorizontal size={16} /> Adjust
              </button>
              <button className="btn sm" onClick={() => setPanel('stats')}>
                <ListOrdered size={16} /> Box
              </button>
            </div>
          )}

          {/* a game simulated elsewhere: the coached version never happened, so don't show its floor or plays */}
          {status !== 'simmed' && (
            <>
              <Card title="On the floor" right={<span className="tiny dim">energy · fouls · points</span>}>
                <div className="col" style={{ gap: 6 }}>
                  {me.on.map((p) => (
                    <PlayerStrip key={p.pid} p={p} name={nameOf(p.pid)} />
                  ))}
                </div>
              </Card>
              <Feed feed={feed} colors={colors} />
            </>
          )}
        </div>
      </div>

      <Sheet open={panel === 'subs'} onClose={() => setPanel('none')} title="Substitutions">
        <SubsPanel live={game} side={userSide} nameOf={nameOf} onChange={() => setTick((x) => x + 1)} />
      </Sheet>
      <Sheet open={panel === 'tactics'} onClose={() => setPanel('none')} title="In-game adjustments">
        <TacticsPanel live={game} side={userSide} nameOf={nameOf} apply={applyTactics} persist={persist} setPersist={setPersist} />
      </Sheet>
      <Sheet open={panel === 'stats'} onClose={() => setPanel('none')} title="Live box score">
        <StatsPanel live={game} side={userSide} league={league} nameOf={nameOf} tick={tick} />
      </Sheet>
      <Sheet open={panel === 'end'} onClose={() => setPanel('none')} title="Sim to the final buzzer?">
        <p className="dim2">The rest of the game plays out instantly with your current plan and rotation.</p>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn grow" onClick={() => setPanel('none')}>
            Keep coaching
          </button>
          <button
            className="btn primary grow"
            onClick={() => {
              setPanel('none');
              skip('end');
            }}
          >
            <FastForward size={16} /> Sim to final
          </button>
        </div>
      </Sheet>
    </main>
  );
}

function ScoreBug({ ticker, sim, home, away, quarter, over, ot }: { ticker: Ticker; sim: GameSim; home: Team; away: Team; quarter: number; over: boolean; ot: number }) {
  const { clock, score } = useSyncExternalStore(ticker.subscribe, ticker.get);
  const qLabel = periodLabel(quarter);
  // the bonus dots are only colour: screen readers get them in the label
  const bonus = [sim.bonus(sim.T[0]) ? away.abbrev : '', sim.bonus(sim.T[1]) ? home.abbrev : ''].filter(Boolean);
  const state = over
    ? `final${ot ? ` in ${ot > 1 ? `${ot} overtimes` : 'overtime'}` : ''}`
    : `${qLabel} ${fmtClock(clock)}${bonus.length ? `, ${bonus.join(' and ')} in the bonus` : ''}`;
  return (
    <div
      className="card tight"
      style={{ background: `linear-gradient(90deg, ${shade(away.colors[0], -0.25)}cc, var(--surface) 40%, var(--surface) 60%, ${shade(home.colors[0], -0.25)}cc)` }}
    >
      <div className="scorebug live-bug" role="group" aria-label={`${away.abbrev} ${score[1]}, ${home.abbrev} ${score[0]}, ${state}`}>
        <div className="row" style={{ gap: 6, minWidth: 0 }}>
          <TeamLogo tid={away.tid} size={28} decorative />
          <div style={{ minWidth: 0 }}>
            <div className="bold">{away.abbrev}</div>
            <div className="tiny dim nowrap">
              TO {sim.T[1].timeouts}
              {sim.bonus(sim.T[0]) && (
                <span className="warn" title="In the bonus" aria-hidden="true">
                  {' '}
                  ●
                </span>
              )}
            </div>
          </div>
          <span className="score" style={{ marginLeft: 'auto' }}>
            {score[1]}
          </span>
        </div>
        <div className="col center" style={{ gap: 0, minWidth: 56 }}>
          <span className="display bold" style={{ fontSize: 15 }}>
            {over ? finalLabel(ot) : qLabel}
          </span>
          <span className="display num" style={{ fontSize: 20 }}>
            {over ? '' : fmtClock(clock)}
          </span>
        </div>
        <div className="row" style={{ gap: 6, flexDirection: 'row-reverse', minWidth: 0 }}>
          <TeamLogo tid={home.tid} size={28} decorative />
          <div className="right" style={{ minWidth: 0 }}>
            <div className="bold">{home.abbrev}</div>
            <div className="tiny dim nowrap">
              {sim.bonus(sim.T[1]) && (
                <span className="warn" title="In the bonus" aria-hidden="true">
                  ●{' '}
                </span>
              )}
              TO {sim.T[0].timeouts}
            </div>
          </div>
          <span className="score" style={{ marginRight: 'auto' }}>
            {score[0]}
          </span>
        </div>
      </div>
    </div>
  );
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

function PlayerStrip({ p, name }: { p: SP; name: string }) {
  const e = Math.round(p.energy * 100);
  return (
    <div className="row small" style={{ gap: 8 }}>
      <span className="bold ellipsis" style={{ width: 128 }}>
        {name}
      </span>
      <div className="grow">
        <div className="bar" style={{ height: 6 }}>
          <div style={{ width: `${e}%`, background: e < 55 ? 'var(--bad)' : e < 72 ? 'var(--warn)' : 'var(--good)' }} />
        </div>
      </div>
      <span className="num tiny" style={{ width: 30, textAlign: 'right' }}>
        {e}%
      </span>
      <span className={`num tiny ${p.fouls >= 4 ? 'bad' : 'dim'}`} style={{ width: 24, textAlign: 'right' }}>
        {p.fouls}F
      </span>
      <span className="num tiny dim2" style={{ width: 28, textAlign: 'right' }}>
        {p.b.pts}p
      </span>
    </div>
  );
}

function SubsPanel({ live, side, nameOf, onChange }: { live: LiveGame; side: 0 | 1; nameOf: (pid: number) => string; onChange: () => void }) {
  const t = live.sim.T[side];
  const [outPid, setOut] = useState<number | null>(null);
  const [, force] = useState(0);
  const bench = t.players.filter((p) => !p.on);
  return (
    <div className="col" style={{ gap: 12 }}>
      <Toggle
        on={t.manualSubs}
        onChange={(v) => {
          t.manualSubs = v;
          force((x) => x + 1);
          onChange();
        }}
        label="I'll handle substitutions"
        help="Off: your staff follows the rotation plan. On: lineups only change when you sub (injuries and foul-outs excepted), and the staff calls no timeouts to stop runs."
      />
      <div className="small dim">{outPid === null ? 'Tap a player on the floor, then a bench player.' : 'Now pick who comes in.'}</div>
      <div className="col" style={{ gap: 6 }}>
        {t.on.map((p) => (
          <button key={p.pid} className={`card tight row ${outPid === p.pid ? 'accent' : ''}`} style={{ gap: 8 }} aria-pressed={outPid === p.pid} onClick={() => setOut(p.pid)}>
            <Tag tone="info">ON</Tag>
            <span className="bold grow" style={{ textAlign: 'left' }}>
              {nameOf(p.pid)}
            </span>
            <span className="small num">{Math.round(p.energy * 100)}%</span>
            <span className="small dim num">
              {p.fouls}F · {p.b.pts}p · {(p.b.sec / 60).toFixed(0)}m
            </span>
          </button>
        ))}
      </div>
      <div className="col" style={{ gap: 6 }}>
        {bench.map((p) => (
          <button
            key={p.pid}
            className="card tight row"
            style={{ gap: 8, opacity: p.out ? 0.45 : 1 }}
            disabled={!!p.out || outPid === null}
            onClick={() => {
              if (outPid === null) return;
              // the game plays on while this sheet is open: the staff may have made a change first
              if (!live.sim.substitute(side, outPid, p.pid)) {
                const why = !t.on.some((x) => x.pid === outPid)
                  ? `${nameOf(outPid)} is already on the bench.`
                  : p.on
                    ? `${nameOf(p.pid)} is already on the floor.`
                    : `${nameOf(p.pid)} can't come in right now.`;
                useStore.getState().toast(why, 'bad');
              }
              setOut(null);
              onChange();
            }}
          >
            <Tag>{p.out === 1 ? 'FOULED OUT' : p.out === 2 ? (p.dnp === 'Rest' ? 'REST' : 'OUT') : 'BENCH'}</Tag>
            <span className="grow" style={{ textAlign: 'left' }}>
              {nameOf(p.pid)}
            </span>
            <span className="small num">{Math.round(p.energy * 100)}%</span>
            <span className="small dim num">
              {p.fouls}F · {(p.b.sec / 60).toFixed(0)}m
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TacticsPanel({
  live,
  side,
  nameOf,
  apply,
  persist,
  setPersist,
}: {
  live: LiveGame;
  side: 0 | 1;
  nameOf: (pid: number) => string;
  apply: (fn: (t: Tactics) => void, persist: boolean) => void;
  persist: boolean;
  setPersist: (on: boolean) => void;
}) {
  const [, force] = useState(0);
  const t = live.sim.T[side].t;
  const opp = live.sim.T[1 - side];
  const set = (fn: (t: Tactics) => void) => {
    apply(fn, persist);
    force((x) => x + 1);
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <Toggle on={persist} onChange={setPersist} label="Keep changes after this game" help="Off: adjustments only apply to this game." />
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>
          Pick & roll coverage
        </div>
        <Chips
          label="Pick & roll coverage"
          value={t.defense.pnr}
          onChange={(x: PnrCoverage) => set((tt) => void (tt.defense.pnr = x))}
          options={(Object.keys(COVERAGE_META) as PnrCoverage[]).map((k) => ({ id: k, label: COVERAGE_META[k].label }))}
        />
      </div>
      <Segmented
        value={t.defense.scheme}
        onChange={(x: DefScheme) => set((tt) => void (tt.defense.scheme = x))}
        label="Base scheme"
        options={(Object.keys(SCHEME_META) as DefScheme[]).map((k) => ({ id: k, label: SCHEME_META[k].label }))}
      />
      <Slider label="Help defense" value={t.defense.help} onChange={(x) => set((tt) => void (tt.defense.help = x))} left="Stay home" right="Pack the paint" />
      <Slider label="Ball pressure" value={t.defense.pressure} onChange={(x) => set((tt) => void (tt.defense.pressure = x))} left="Contain" right="Swarm" />
      <Slider label="Transition defense" value={t.defense.getBack} onChange={(x) => set((tt) => void (tt.defense.getBack = x))} left="Jog back" right="Sprint back" />
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>
          Full-court press
        </div>
        <Chips
          label="Full-court press"
          value={t.defense.press}
          onChange={(x: PressMode) => set((tt) => void (tt.defense.press = x))}
          options={(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))}
        />
      </div>
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>
          Star plan
        </div>
        <Chips
          label="Star plan"
          value={t.defense.starPlan}
          onChange={(x: StarPlan) => set((tt) => void (tt.defense.starPlan = x))}
          options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
        />
        {t.defense.starPlan !== 'none' && (
          <div className="chips" style={{ marginTop: 8 }}>
            <button
              className={`chip ${t.defense.starTarget === null ? 'on' : ''}`}
              aria-pressed={t.defense.starTarget === null}
              onClick={() => set((tt) => void (tt.defense.starTarget = null))}
            >
              Auto
            </button>
            {opp.on.map((p) => (
              <button
                key={p.pid}
                className={`chip ${t.defense.starTarget === p.pid ? 'on' : ''}`}
                aria-pressed={t.defense.starTarget === p.pid}
                onClick={() => set((tt) => void (tt.defense.starTarget = p.pid))}
              >
                {nameOf(p.pid)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>
          Matchups
        </div>
        <div className="col" style={{ gap: 8 }}>
          {opp.on.map((o) => {
            const cur = live.sim.T[side].guardOf.get(o.pid);
            return (
              <div key={o.pid} className="col" style={{ gap: 4 }}>
                <div className="small">
                  <b>{nameOf(o.pid)}</b>{' '}
                  <span className="dim">
                    guarded by {cur ? nameOf(cur.pid) : '—'}
                    {t.defense.matchups[o.pid] !== undefined ? ' (assigned)' : ''}
                  </span>
                </div>
                <div className="chips">
                  {live.sim.T[side].on.map((d) => (
                    <button
                      key={d.pid}
                      className={`chip ${t.defense.matchups[o.pid] === d.pid ? 'on' : ''}`}
                      aria-pressed={t.defense.matchups[o.pid] === d.pid}
                      style={{ fontSize: 12 }}
                      onClick={() =>
                        set((tt) => {
                          if (tt.defense.matchups[o.pid] === d.pid) delete tt.defense.matchups[o.pid];
                          else {
                            for (const k of Object.keys(tt.defense.matchups)) if (tt.defense.matchups[+k] === d.pid) delete tt.defense.matchups[+k];
                            tt.defense.matchups[o.pid] = d.pid;
                          }
                        })
                      }
                    >
                      {nameOf(d.pid)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="tiny dim">Assignments stick whenever both players are on the floor; otherwise the staff matches by size and threat.</div>
        </div>
      </div>
      <Slider label="Pace" value={t.offense.pace} onChange={(x) => set((tt) => void (tt.offense.pace = x))} left="Grind" right="Run & gun" />
      <Slider label="Three-point emphasis" value={t.offense.threePoint} onChange={(x) => set((tt) => void (tt.offense.threePoint = x))} left="Mid-range ok" right="Rim & 3s only" />
      <Slider label="Attack the rim" value={t.offense.rimAttack} onChange={(x) => set((tt) => void (tt.offense.rimAttack = x))} left="Settle" right="Downhill" />
      <Slider label="Crash the offensive glass" value={t.offense.crashBoards} onChange={(x) => set((tt) => void (tt.offense.crashBoards = x))} left="Get back" right="Crash" />
      <Toggle on={t.offense.huntMismatch} onChange={(x) => set((tt) => void (tt.offense.huntMismatch = x))} label="Hunt mismatches" />
      <div className="tiny dim">
        <Hand size={12} style={{ verticalAlign: -2 }} /> Changes take effect on the next possession.
      </div>
    </div>
  );
}

function StatsPanel({ live, side, league, nameOf, tick }: { live: LiveGame; side: 0 | 1; league: League; nameOf: (pid: number) => string; tick: number }) {
  const [team, setTeam] = useState<0 | 1>(side);
  // the box only changes between possessions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const res = useMemo(() => live.sim.result(), [live, tick]);
  const tb = team === 0 ? res.home : res.away;
  const pt = Object.entries(tb.playTypes).sort((a, b) => b[1].poss - a[1].poss);
  return (
    <div className="col" style={{ gap: 12 }}>
      <Segmented
        value={String(team)}
        onChange={(v) => setTeam(Number(v) as 0 | 1)}
        label="Team"
        options={[
          { id: '1', label: league.teams[res.away.tid].abbrev },
          { id: '0', label: league.teams[res.home.tid].abbrev },
        ]}
      />
      <div className="tablewrap">
        <table className="stats">
          <thead>
            <tr>
              <th className="l sticky">Player</th>
              <th>MIN</th>
              <th>PTS</th>
              <th>REB</th>
              <th>AST</th>
              <th>FG</th>
              <th>3P</th>
              <th>FT</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {tb.players
              .filter((p) => p.min > 0)
              .map((p) => (
                <tr key={p.pid}>
                  <td className="l sticky">{nameOf(p.pid)}</td>
                  <td>{Math.round(p.min)}</td>
                  <td className="bold">{p.pts}</td>
                  <td>{p.orb + p.drb}</td>
                  <td>{p.ast}</td>
                  <td>
                    {p.fgm}-{p.fga}
                  </td>
                  <td>
                    {p.tpm}-{p.tpa}
                  </td>
                  <td>
                    {p.ftm}-{p.fta}
                  </td>
                  <td>{p.pm > 0 ? `+${p.pm}` : p.pm}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Card title="Play types so far">
        <div className="col" style={{ gap: 4 }}>
          {pt.map(([k, v]) => (
            <div key={k} className="row small">
              <span className="grow">{FINISH_LABEL[k as FinishType] ?? k}</span>
              <span className="dim num">{v.poss} poss</span>
              <span className="num bold" style={{ width: 48, textAlign: 'right' }}>
                {(v.pts / Math.max(1, v.poss)).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
