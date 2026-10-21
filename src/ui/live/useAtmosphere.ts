// The live game's atmosphere as the screen keeps it (see atmosphere.ts): the night folded up to the
// possessions the court has drawn, each possession's calls for the court's caption and the
// play-by-play, the callout up over the court and the crowd's line. useLiveGame drives it from its
// possession loop; the fold is a few steps a possession, never per frame.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { League, PbpEntry, ScheduledGame } from '../../core/types';
import type { PossLog } from '../../core/sim/log';
import type { LiveGame } from '../../state/live';
import { advance, foldAll, pickCall, voiceLog, type AtmoCtx, type AtmoEvent, type LogVoice, type Tally } from './atmosphere';
import type { FeedRow } from './Feed';

/** How long a callout and a crowd line stay up (real time). */
export const CALL_MS = 2600;
export const CROWD_MS = 3800;

/** How much a game means, for how loud its crowd starts: 0 a regular-season night .. 3 a Finals game or a Game 7. */
export function stakesOf(league: League, g: ScheduledGame): number {
  if (g.type === 'playoffs') {
    const s = league.playoffs.find((x) => x.id === g.seriesId);
    if (!s) return 2;
    return s.round === 4 || s.highWins + s.lowWins === 6 ? 3 : 2;
  }
  if (g.type === 'playin' || g.cup === 'final' || g.cup === 'sf' || g.cup === 'qf') return 1;
  return 0;
}

/**
 * The play-by-play rows for the sim's lines `pbp[from..]`, written by the possessions `logs[logFrom..]`:
 * each made basket, block and steal in the voice the night gave it, and after each possession the
 * moments it called (a run, a lead change, clutch time, a timeout into a run, the crowd). A possession's
 * lines are the sim's own, in order, so they're found by their text; anything else (a sub, a period's
 * start) passes through as the sim wrote it. Oldest first.
 */
export function feedRows(
  pbp: readonly PbpEntry[],
  from: number,
  logs: readonly PossLog[],
  logFrom: number,
  voices: readonly LogVoice[],
  events: readonly AtmoEvent[][],
): FeedRow[] {
  const out: FeedRow[] = [];
  let j = from;
  const plain = (i: number) => out.push({ key: `p${i}`, e: pbp[i] });
  for (let li = logFrom; li < logs.length; li++) {
    const log = logs[li];
    const v = voices[li] ?? [];
    const makes = log.steps.flatMap((s, i) => (s.k === 'shot' && s.made ? [i] : []));
    const blocks = log.steps.flatMap((s, i) => (s.k === 'block' ? [i] : []));
    const tos = log.steps.flatMap((s, i) => (s.k === 'to' || s.k === 'steal' ? [i] : []));
    let m = 0;
    let b = 0;
    let o = 0;
    let lastE: PbpEntry | undefined;
    for (const line of log.lines) {
      let k = j;
      while (k < pbp.length && pbp[k].text !== line) k++;
      // (a line the sim didn't keep: say nothing rather than misplace a call)
      if (k >= pbp.length) continue;
      while (j < k) plain(j++);
      const e = pbp[j];
      const step = e.kind === 'make' ? makes[m++] : e.kind === 'miss' && e.text.includes('blocked') ? blocks[b++] : e.kind === 'to' ? tos[o++] : undefined;
      const call = step !== undefined ? v[step] : undefined;
      out.push(call ? { key: `p${j}`, e: { ...e, text: call.text }, tier: call.tier } : { key: `p${j}`, e });
      lastE = e;
      j++;
    }
    for (const ev of events[li] ?? []) {
      // (a big play's own line already says it)
      if (ev.kind === 'play') continue;
      const at = lastE ?? pbp[j - 1];
      out.push({
        key: `a${ev.id}`,
        e: { q: ev.q, clock: ev.clock, t: ev.side, text: ev.line ? `${ev.title}. ${ev.line}.` : `${ev.title}.`, hs: at?.hs ?? 0, as: at?.as ?? 0, kind: 'other' },
        beat: { kicker: ev.kicker, kind: ev.kind },
        tier: ev.weight,
      });
    }
  }
  while (j < pbp.length) plain(j++);
  return out;
}

/** `held`: something else is up over the court (a banner): the callout waits its turn, one thing at a time. */
export function useAtmosphere({ paused, held }: { paused: boolean; held: boolean }) {
  const ctx = useRef<AtmoCtx | null>(null);
  const night = useRef<{ t: Tally; voices: LogVoice[]; events: AtmoEvent[][] } | null>(null);
  /** The night as the court has drawn it (a new object each possession: the screen re-renders on it). */
  const [tally, setTally] = useState<Tally | null>(null);
  const [call, setCall] = useState<AtmoEvent | null>(null);
  const [crowdLine, setCrowdLine] = useState<AtmoEvent | null>(null);
  /** Game seconds of the last callout, and whether one went up with the possession just folded. */
  const lastCall = useRef<number | null>(null);
  const calledNow = useRef(false);

  /** A new game (or none): the night folded quietly up to where the game stands. */
  const reset = useCallback((lg: LiveGame | null, c: AtmoCtx | null) => {
    ctx.current = c;
    night.current = lg && c ? foldAll(lg.logs, c) : null;
    setTally(night.current?.t ?? null);
    setCall(null);
    setCrowdLine(null);
    lastCall.current = null;
    calledNow.current = false;
  }, []);

  /**
   * Fold the possessions the court has drawn since the last look; `loud`, the biggest moment goes up
   * over the court and the crowd has its line (not along a skip). Returns the logs it started from.
   */
  const catchUp = useCallback((lg: LiveGame, loud: boolean): number => {
    calledNow.current = false;
    const c = ctx.current;
    const cur = night.current;
    if (!c || !cur) return lg.logs.length;
    const from = cur.t.n;
    if (from >= lg.logs.length) return from;
    let t = cur.t;
    const fresh: AtmoEvent[] = [];
    for (let i = from; i < lg.logs.length; i++) {
      const r = advance(t, lg.logs[i], c);
      t = r.t;
      cur.voices[i] = r.voice;
      cur.events[i] = r.events;
      fresh.push(...r.events);
    }
    cur.t = t;
    setTally(t);
    if (loud) {
      const top = pickCall(fresh, lastCall.current);
      if (top) {
        lastCall.current = top.at;
        calledNow.current = true;
        setCall(top);
      }
      // (the crowd's line gives way to a callout: one thing at a time)
      const crowd = fresh.find((e) => e.kind === 'crowd');
      if (crowd && !top) setCrowdLine(crowd);
    }
    return from;
  }, []);

  /** The play-by-play rows for the sim's lines from `from` on, the possessions from `logFrom` on (see feedRows). */
  const rows = useCallback((pbp: readonly PbpEntry[], from: number, logs: readonly PossLog[], logFrom: number): FeedRow[] => {
    const cur = night.current;
    return feedRows(pbp, from, logs, logFrom, cur?.voices ?? [], cur?.events ?? []);
  }, []);

  /** The calls of the possession about to be drawn (the last of the logs the sim has played ahead). */
  const voiceAhead = useCallback((lg: LiveGame): LogVoice | undefined => {
    const c = ctx.current;
    const cur = night.current;
    if (!c || !cur || cur.t.n >= lg.logs.length) return undefined;
    const before = foldAll(lg.logs.slice(0, lg.logs.length - 1), c, cur.t).t;
    return voiceLog(before, lg.logs[lg.logs.length - 1], c);
  }, []);

  /** Whether the possessions played ahead have something to call over the court (key plays draws them). */
  const bigAhead = useCallback((lg: LiveGame): boolean => {
    const c = ctx.current;
    const cur = night.current;
    if (!c || !cur || cur.t.n >= lg.logs.length) return false;
    return foldAll(lg.logs, c, cur.t).events.some((evs) => evs?.some((e) => e.weight >= 2 && e.kind !== 'crowd'));
  }, []);

  // a callout has its moment, and the crowd its line (both wait out a pause)
  useEffect(() => {
    if (!call || paused || held) return;
    const t = setTimeout(() => setCall(null), CALL_MS);
    return () => clearTimeout(t);
  }, [call, paused, held]);
  useEffect(() => {
    if (!crowdLine || paused) return;
    const t = setTimeout(() => setCrowdLine(null), CROWD_MS);
    return () => clearTimeout(t);
  }, [crowdLine, paused]);

  const clear = useCallback(() => {
    setCall(null);
    setCrowdLine(null);
  }, []);
  /** A callout went up with the possession just folded: the broadcast graphic waits its turn. */
  const calledThisTime = useCallback(() => calledNow.current, []);
  // (the moves are the same functions for the whole visit: the possession loop holds on to them)
  const api = useMemo(
    () => ({ reset, catchUp, rows, voiceAhead, bigAhead, calledNow: calledThisTime, clear }),
    [reset, catchUp, rows, voiceAhead, bigAhead, calledThisTime, clear],
  );

  // (while something else is up, the callout waits: it's drawn when it's its turn)
  return { ctx, tally, call: held ? null : call, crowdLine: held ? null : crowdLine, api };
}
