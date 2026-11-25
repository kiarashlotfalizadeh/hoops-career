// What the staff's counters against one opponent are worth, measured in the sim worker (see
// core/ai/counterWorth.ts) for the user's next game against them: a few seconds of games, once for
// each state of the plan, the tactics and who's fit to play on either side (a counter added changes
// what the others are worth), not again each day. Kept for the session, so the matchup page's tabs
// and a return to it say the same. The player gets the staff's opinion (worthText), never the figure.
import { useEffect, useState } from 'react';
import type { GamePlanItem, League } from '../../../core/types';
import type { Candidate } from '../../../core/ai/advisor';
import { PLAN_WORTH, worthCall, type CounterWorth } from '../../../core/ai/counterWorth';
import { AHEAD, leanTone } from '../../../core/analysis/staffWords';
import { effectiveTactics, planFor, planSig } from '../../../core/league/gamePlans';
import { touch } from '../../../state/actions';
import { hashString } from '../../../core/random';
import { measureCounters } from '../../../state/simClient';
import { useStore } from '../../../state/store';
import { inLane } from '../../tactics/worthLane';

/** A measurement: its counters once done, else how far it has got. */
export interface WorthState {
  worth?: Map<string, CounterWorth>;
  /** Share of the games played (0 until it starts). */
  progress: number;
}

/** Measurements kept, newest last (a season's matchup pages visited). */
const KEEP = 24;
const measured = new Map<string, WorthState>();
const listeners = new Set<() => void>();
let running: string | null = null;
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
  tell();
  const g = nextMeeting(league, opp);
  // the plan as it's measured: its reading is kept on it only while it's still this one
  const plan = planFor(league, opp, g);
  const sig = plan ? planSig(plan) : null;
  // (it holds the lane: the staff's measurements of the user's changes wait for it, worthLane.ts)
  inLane(() =>
    measureCounters(league, opp, g?.gid, (done, total) => {
      const cur = measured.get(key);
      if (cur && !cur.worth) {
        measured.set(key, { progress: done / total });
        tell();
      }
    }),
  ).then(
    (out) => {
      if (running === key) running = null;
      // (stopped by a newer one: measured again when it's asked for again)
      if (!out) measured.delete(key);
      else {
        measured.delete(key);
        measured.set(key, { worth: new Map(out.map((w) => [w.id, w])), progress: 1 });
        retries.delete(key);
        keepPlanWorth(
          league.id,
          opp,
          sig,
          out.find((w) => w.id === PLAN_WORTH),
        );
        while (measured.size > KEEP) measured.delete(measured.keys().next().value!);
      }
      tell();
    },
    (e: unknown) => {
      if (running === key) running = null;
      measured.delete(key);
      console.warn('The counters could not be measured:', e);
      tell();
    },
  );
}

/**
 * The whole plan's reading goes on the plan (GamePlan.worth), where the forecast reads it: if the
 * league is still the open one and the plan still the one measured. Saved with the next change.
 */
function keepPlanWorth(leagueId: string, opp: number, sig: string | null, w: CounterWorth | undefined) {
  if (!w || !sig) return;
  const open = useStore.getState().league;
  if (open?.id !== leagueId) return;
  const cur = open.gamePlans?.[opp];
  if (!cur || planSig(cur) !== sig) return;
  if (cur.worth?.sig === sig && cur.worth.pts === w.pts && cur.worth.se === w.se) return;
  touch((l) => {
    const p = l.gamePlans?.[opp];
    if (p && planSig(p) === sig) p.worth = { pts: w.pts, raw: w.raw, se: w.se, sig };
  });
}

/**
 * The staff's counters against `opp`, measured: their worth by counter id once done, and the
 * progress until then. Only in season (the preseason too: the opener's plan is the first week's
 * guide), with a game against them still to play; never while a sim runs (it waits for it).
 */
export function useCounterWorth(league: League, opp: number): WorthState | null {
  const [n, bump] = useState(0);
  const simming = useStore((s) => !!s.sim);
  const inSeason = league.phase === 'preseason' || league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const next = inSeason ? nextMeeting(league, opp) : undefined;
  const key = next ? keyOf(league, opp, next.gid) : null;
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
    if (!key || simming || measured.has(key)) return;
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
  }, [key, simming, league, opp, n]);
  return key ? (measured.get(key) ?? { progress: 0 }) : null;
}

/** "Should help", "Could hurt", "No clear edge": a measured counter as the staff's opinion, with its tone. `short`: the same inside a sentence. */
export function worthText(w: CounterWorth): { text: string; tone: 'good' | 'bad' | undefined; short: string } {
  const call = worthCall(w);
  return { text: AHEAD[call], tone: leanTone(call) || undefined, short: AHEAD[call].toLowerCase() };
}

/** Counters by what they measured: gains first (the biggest first), then the ones too close to call, then the costs, the ones the staff didn't measure last. */
export function byWorth<T extends { id: string }>(list: T[], worth: Map<string, CounterWorth> | undefined): T[] {
  if (!worth) return list;
  const rank = (c: T) => {
    const w = worth.get(c.id);
    if (!w) return 3;
    const call = worthCall(w);
    return call === 'gain' ? 0 : call === 'even' ? 1 : 2;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || (worth.get(b.id)?.pts ?? 0) - (worth.get(a.id)?.pts ?? 0));
}

/** A staff counter as the plan's item, as its Add puts it in: with its measured worth (the win chance counts it) when that isn't even. */
export function counterItem(c: Candidate, w: CounterWorth | undefined): GamePlanItem {
  return {
    id: c.id,
    label: c.label,
    group: c.group,
    patch: c.patch,
    ...(c.evidence ? { evidence: c.evidence } : {}),
    ...(w && worthCall(w) !== 'even' ? { pts: w.pts } : {}),
  };
}
