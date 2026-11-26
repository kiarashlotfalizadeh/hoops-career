// What the staff's counters against one opponent are worth, measured in the sim worker (see
// core/ai/counterWorth.ts) for the user's next game against them: a few seconds of games, once for
// each state of the plan, the tactics and who's fit to play on either side (a counter added changes
// what the others are worth), not again each day.
//
// Under the hood, all of it. The coach never sees a reading before its game: the matchup page lists
// the counters with the staff's reasons, and what one does is found out on the floor (shown ahead,
// the readings were an answer key: see counterWorth.ts). What the measuring is for: the readings go
// on the plan (each item's worth in it, and the plan whole), the game keeps them (GameResult.plan,
// planWorth), and its report says what the plan was worth. The staff's own picks read them too.
//
// Each reading is kept with the league (League.counterReads, one per opponent), so a reopened app has
// it at once, and the staff reads ahead: whenever the app is idle (no sim, no live game, nothing else
// measuring) the user's next two games are measured without the page open, so a sim that stops before
// a game leaves its counters read, or being read from where the last reading stood. Held in memory
// only, the reading restarted on every reopen and took 8 s or more on a busy phone: the playtest's FM
// lifer saw "Staff still looking…" on about 35 game plans (while the readings were shown).
import { useEffect, useState } from 'react';
import type { CounterRead, GamePlanItem, League } from '../../../core/types';
import type { Candidate } from '../../../core/ai/advisor';
import { PLAN_WORTH, type CounterWorth } from '../../../core/ai/counterWorth';
import { effectiveTactics, planFor, planSig } from '../../../core/league/gamePlans';
import { touch } from '../../../state/actions';
import { hashString } from '../../../core/random';
import { cancelWorth, measureCounters } from '../../../state/simClient';
import { pendingLive } from '../../../state/live';
import { useStore } from '../../../state/store';
import { laneBusy, inLane, onLaneIdle } from '../../tactics/worthLane';
import { editMeasuring } from '../../tactics/editWatch';

/** A measurement: its counters once done, else how far it has got. */
export interface WorthState {
  worth?: Map<string, CounterWorth>;
  /** Share of the games played (0 until it starts). */
  progress: number;
  /** `worth` is the last reading for this game, from before the plan, tactics or who's fit changed: being measured again. */
  stale?: true;
  /** The stale reading is the one kept with the league (an earlier session, or the last meeting), not one from before a change made here. */
  older?: true;
}

/** Measurements kept, newest last (a season's matchup pages visited). */
const KEEP = 24;
const measured = new Map<string, WorthState>();
/** The newest finished reading for each meeting (meetingOf), shown while a change is measured again. */
const lastRead = new Map<string, Map<string, CounterWorth>>();
const listeners = new Set<() => void>();
/** The measurement wanted now (the newest started), and the one in the worker, if it's ours. */
let running: string | null = null;
let active: string | null = null;
/** Times a key's measurement has been started (a stopped one is started again, RETRIES times at most). */
const retries = new Map<string, number>();
const RETRIES = 4;

const tell = () => listeners.forEach((f) => f());

/** What the measurement depends on: the league, the meeting, the user's tactics and rotation for it, and who's out on either side. */
function keyOf(league: League, opp: number, gid: number): string {
  const me = league.teams[league.userTid];
  const out = Object.values(league.players)
    .filter((p) => (p.tid === opp || p.tid === league.userTid) && p.injury)
    .map((p) => p.pid)
    .sort((a, b) => a - b);
  // (camp's drills and cuts change the teams at opening night: a preseason reading isn't kept past it)
  return `${league.id}:${league.season}:${league.phase === 'preseason' ? 'pre:' : ''}${gid}:${opp}:${hashString(JSON.stringify(effectiveTactics(league, opp)) + JSON.stringify(me.rotation) + out.join(','))}`;
}

/** A key's meeting (the league, the game, the opponent): the key without what the user decides or who's hurt. */
const meetingOf = (key: string) => key.slice(0, key.lastIndexOf(':'));

/** The reading kept with the league for `opp` this season (League.counterReads), as a map by counter id. */
function savedRead(league: League, opp: number): { read: CounterRead; worth: Map<string, CounterWorth> } | null {
  const read = league.counterReads?.[opp];
  if (!read || read.season !== league.season) return null;
  return { read, worth: new Map(read.worth.map((w) => [w.id, w])) };
}

/** A finished reading kept with the league (if it's still the open one), one per opponent: saved with the next write. */
function keepRead(leagueId: string, opp: number, gid: number, key: string, out: CounterWorth[]) {
  const open = useStore.getState().league;
  if (open?.id !== leagueId) return;
  const worth = out.filter((w) => w.id !== PLAN_WORTH).map(({ id, pts, raw, se }) => ({ id, pts, raw, se }));
  const cur = open.counterReads?.[opp];
  if (cur?.key === key) return;
  // (refused while a sim runs: kept in memory, and read again once it's done if it's still wanted)
  useStore.getState().mutate((l) => {
    const reads = (l.counterReads ??= {});
    reads[opp] = { season: l.season, gid, key, worth };
    // (last season's readings go)
    for (const k of Object.keys(reads)) if (reads[+k].season !== l.season) delete reads[+k];
  });
}

/** The user's next game against `opp` this season, if any. */
function nextMeeting(league: League, opp: number) {
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && ((g.home === me && g.away === opp) || (g.away === me && g.home === opp)))
    .sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
}

function start(league: League, opp: number, key: string) {
  running = key;
  measured.set(key, { progress: 0 });
  // its own measurement of things as they were is no longer wanted: stopped, so this one goes next (one
  // still waiting for its turn is skipped when it comes: see inLane)
  if (active && active !== key) cancelWorth();
  tell();
  const g = nextMeeting(league, opp);
  // the plan as it's measured: its reading is kept on it only while it's still this one
  const plan = planFor(league, opp, g);
  const sig = plan ? planSig(plan) : null;
  // (in the lane, in turn: the staff's measurements of the user's changes wait for it, worthLane.ts)
  inLane(
    () => {
      active = key;
      return measureCounters(league, opp, g?.gid, (done, total) => {
        const cur = measured.get(key);
        if (cur && !cur.worth) {
          measured.set(key, { progress: done / total });
          tell();
        }
      }).finally(() => {
        if (active === key) active = null;
      });
    },
    () => running === key,
  ).then(
    (out) => {
      if (running === key) running = null;
      // (stopped by a newer one, or skipped: measured again when it's asked for again)
      if (!out) measured.delete(key);
      else {
        measured.delete(key);
        if (g) keepRead(league.id, opp, g.gid, key, out);
        const worth = new Map(out.map((w) => [w.id, w]));
        measured.set(key, { worth, progress: 1 });
        lastRead.delete(meetingOf(key));
        lastRead.set(meetingOf(key), worth);
        while (lastRead.size > KEEP) lastRead.delete(lastRead.keys().next().value!);
        retries.delete(key);
        keepPlanWorth(league.id, opp, sig, out);
        while (measured.size > KEEP) measured.delete(measured.keys().next().value!);
      }
      tell();
      lookAhead();
    },
    (e: unknown) => {
      if (running === key) running = null;
      measured.delete(key);
      console.warn('The counters could not be measured:', e);
      tell();
    },
  );
}

// ---------------------------------------------------------------- reading ahead

/** The user's coming games the staff reads before their pages open: the next one, then the one after. */
const READ_AHEAD = 2;
let aheadTimer: ReturnType<typeof setTimeout> | null = null;

/** The user's next READ_AHEAD meetings this season, one per opponent (a series' next game is the one measured). */
function comingMeetings(league: League): { opp: number; gid: number }[] {
  const inSeason = league.phase === 'preseason' || league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  if (!inSeason || league.fired) return [];
  const me = league.userTid;
  const out: { opp: number; gid: number }[] = [];
  for (const g of league.schedule.filter((x) => !x.played && x.day >= league.day && (x.home === me || x.away === me)).sort((a, b) => a.day - b.day || a.gid - b.gid)) {
    const opp = g.home === me ? g.away : g.home;
    if (out.some((m) => m.opp === opp)) continue;
    out.push({ opp, gid: g.gid });
    if (out.length >= READ_AHEAD) break;
  }
  return out;
}

/**
 * Measure the first of the coming meetings without a reading for things as they stand, when nothing
 * else wants the worker: no sim, no live game, no measurement the user is waiting on or of his changes.
 */
function readAhead() {
  aheadTimer = null;
  const st = useStore.getState();
  const l = st.league;
  if (!l || st.sim || running || laneBusy() || editMeasuring() || pendingLive(l)) return;
  for (const m of comingMeetings(l)) {
    const key = keyOf(l, m.opp, m.gid);
    const done = measured.get(key)?.worth;
    // (one finished while a sim ran couldn't be kept then: it is now)
    if (done && savedRead(l, m.opp)?.read.key !== key) keepRead(l.id, m.opp, m.gid, key, [...done.values()]);
    if (measured.has(key) || savedRead(l, m.opp)?.read.key === key || (retries.get(key) ?? 0) > RETRIES) continue;
    retries.set(key, (retries.get(key) ?? 0) + 1);
    start(l, m.opp, key);
    return;
  }
}

/** Read ahead once things settle (the store has taken a sim's league in, a change of the user's has had its turn). */
function lookAhead(ms = 300) {
  if (aheadTimer) clearTimeout(aheadTimer);
  aheadTimer = setTimeout(readAhead, ms);
}

let watching = false;

/** Start reading ahead (once, as the app starts): after each sim, a league opened, and whenever the lane comes free. */
export function watchCounters() {
  if (watching) return;
  watching = true;
  useStore.subscribe((s, prev) => {
    // a sim starting stops a reading in flight (the games it plays get the worker), which doesn't count
    // as one of its tries: it's read again when the sim is done, if it's still wanted
    if (s.sim && !prev.sim && active) {
      const k = active;
      cancelWorth();
      retries.set(k, Math.max(0, (retries.get(k) ?? 1) - 1));
    }
    if ((!s.sim && prev.sim) || (s.league && s.league.id !== prev.league?.id) || (!s.sim && s.v !== prev.v)) lookAhead(s.v !== prev.v && !prev.sim ? 1500 : 300);
  });
  onLaneIdle(() => lookAhead());
  lookAhead();
}

/**
 * The plan's readings go on the plan, where the game picks them up for its report: the plan whole
 * (GamePlan.worth) and each item's worth in it (GamePlanItem.pts, the games with it against the games
 * without). Only if the league is still the open one and the plan still the one measured. Saved with
 * the next change.
 */
function keepPlanWorth(leagueId: string, opp: number, sig: string | null, out: CounterWorth[]) {
  const w = out.find((x) => x.id === PLAN_WORTH);
  if (!w || !sig) return;
  const open = useStore.getState().league;
  if (open?.id !== leagueId) return;
  const cur = open.gamePlans?.[opp];
  if (!cur || planSig(cur) !== sig) return;
  const by = new Map(out.map((x) => [x.id, x.pts]));
  const same = cur.worth?.sig === sig && cur.worth.pts === w.pts && cur.worth.se === w.se && cur.items.every((it) => !by.has(it.id) || it.pts === by.get(it.id));
  if (same) return;
  touch((l) => {
    const p = l.gamePlans?.[opp];
    if (!p || planSig(p) !== sig) return;
    p.worth = { pts: w.pts, raw: w.raw, se: w.se, sig };
    for (const it of p.items) if (by.has(it.id)) it.pts = by.get(it.id)!;
  });
}

/**
 * The staff's counters against `opp`, measured (for the plan's records and the report, never for a
 * screen to show ahead of the game): their worth by counter id once done, and the progress until then. Only in season (the preseason too: the opener's plan is the first week's
 * guide), with a game against them still to play; never while a sim runs (it waits for it).
 */
export function useCounterWorth(league: League, opp: number): WorthState | null {
  const [n, bump] = useState(0);
  const simming = useStore((s) => !!s.sim);
  const inSeason = league.phase === 'preseason' || league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const next = inSeason ? nextMeeting(league, opp) : undefined;
  const key = next ? keyOf(league, opp, next.gid) : null;
  // the reading kept with the league: for things as they stand, it's the staff's opinion, measured already
  const saved = savedRead(league, opp);
  const savedNow = !!key && saved?.read.key === key;
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  // (`n`: a measurement another one stopped is asked for again while its page is still up. Stopped and
  // never restarted, the counters read "Staff still looking…" for as long as the page stayed open:
  // the playtest's phone player saw it from the preseason through week one. A few tries, so two
  // measurements can't stop each other forever.)
  useEffect(() => {
    if (!key || simming || measured.has(key) || savedNow) return;
    const tries = retries.get(key) ?? 0;
    if (tries > RETRIES) return;
    const go = () => {
      if (measured.has(key)) return;
      retries.set(key, tries + 1);
      start(league, opp, key);
    };
    if (!tries) return go();
    const t = setTimeout(go, 400 * tries);
    return () => clearTimeout(t);
  }, [key, simming, league, opp, n, savedNow]);
  if (!key) return null;
  const cur = measured.get(key);
  if (cur?.worth) return cur;
  if (savedNow) return { worth: saved!.worth, progress: 1 };
  // the last reading: this session's for this game, else the one kept with the league (an earlier
  // session's, or the last meeting's: shown as the staff's last word while it reads again)
  const mine = lastRead.get(meetingOf(key));
  const last = mine ?? saved?.worth;
  const older = !mine && !!last ? ({ older: true } as const) : {};
  // given up (stopped too many times): nobody is looking, so it doesn't say so
  if (!cur && (retries.get(key) ?? 0) > RETRIES) return last ? { worth: last, progress: 1, stale: true, ...older } : null;
  return last ? { worth: last, progress: cur?.progress ?? 0, stale: true, ...older } : (cur ?? { progress: 0 });
}

/**
 * A staff counter as the plan's item, as its Add puts it in. Its reading as it goes in is kept with
 * it when the staff has one (for the game's report; the reading of the plan as it then stands
 * replaces it once that's measured: keepPlanWorth).
 */
export function counterItem(c: Candidate, w: CounterWorth | undefined): GamePlanItem {
  return {
    id: c.id,
    label: c.label,
    group: c.group,
    patch: c.patch,
    ...(c.evidence ? { evidence: c.evidence } : {}),
    ...(w ? { pts: w.pts } : {}),
  };
}
