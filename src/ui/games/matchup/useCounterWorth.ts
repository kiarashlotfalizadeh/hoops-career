// What the staff's counters against one opponent are worth, measured in the sim worker (see
// core/ai/counterWorth.ts) for the user's next game against them: a few seconds of games, once for
// each state of the plan, the tactics and who's fit to play on either side (a counter added changes
// what the others are worth), not again each day. Kept for the session, so the matchup page's tabs
// and a return to it read the same numbers.
import { useEffect, useState } from 'react';
import type { League } from '../../../core/types';
import { worthCall, type CounterWorth } from '../../../core/ai/counterWorth';
import { effectiveTactics } from '../../../core/league/gamePlans';
import { hashString } from '../../../core/random';
import { measureCounters } from '../../../state/simClient';
import { useStore } from '../../../state/store';

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

const tell = () => listeners.forEach((f) => f());

/** What the measurement depends on: the league, the meeting, the user's tactics and rotation for it, and who's out on either side. */
function keyOf(league: League, opp: number, gid: number): string {
  const me = league.teams[league.userTid];
  const out = Object.values(league.players)
    .filter((p) => (p.tid === opp || p.tid === league.userTid) && p.injury)
    .map((p) => p.pid)
    .sort((a, b) => a - b);
  return `${league.id}:${league.season}:${gid}:${opp}:${hashString(JSON.stringify(effectiveTactics(league, opp)) + JSON.stringify(me.rotation) + out.join(','))}`;
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
  measureCounters(league, opp, g?.gid, (done, total) => {
    const cur = measured.get(key);
    if (cur && !cur.worth) {
      measured.set(key, { progress: done / total });
      tell();
    }
  }).then(
    (out) => {
      if (running === key) running = null;
      // (stopped by a newer one: measured again when it's asked for again)
      if (!out) measured.delete(key);
      else {
        measured.delete(key);
        measured.set(key, { worth: new Map(out.map((w) => [w.id, w])), progress: 1 });
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
 * The staff's counters against `opp`, measured: their worth by counter id once done, and the
 * progress until then. Only in season, with a game against them still to play; never while a sim
 * runs (it waits for it).
 */
export function useCounterWorth(league: League, opp: number): WorthState | null {
  const [, bump] = useState(0);
  const simming = useStore((s) => !!s.sim);
  const inSeason = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const next = inSeason ? nextMeeting(league, opp) : undefined;
  const key = next ? keyOf(league, opp, next.gid) : null;
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  useEffect(() => {
    if (key && !simming && !measured.has(key)) start(league, opp, key);
  }, [key, simming, league, opp]);
  return key ? (measured.get(key) ?? { progress: 0 }) : null;
}

/** "About +0.6 a game", "Even", "About −0.5 a game": a measured counter in a few words (its shrunk worth), with its tone. */
export function worthText(w: CounterWorth): { text: string; tone: 'good' | 'bad' | undefined } {
  const call = worthCall(w);
  const n = Math.abs(w.pts).toFixed(1);
  return call === 'gain' ? { text: `About +${n} a game`, tone: 'good' } : call === 'cost' ? { text: `About −${n} a game`, tone: 'bad' } : { text: 'Even', tone: undefined };
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
