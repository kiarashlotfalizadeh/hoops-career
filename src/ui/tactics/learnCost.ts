// What learning a change costs, in points a game, measured: tactics `want` played on the user's next
// game as the team knows them tonight, and as it will once they're drilled (drilledAs: known as well as
// the settings they replace, `have`), paired games in the sim worker (measureChanges), a few seconds.
// The style picker's sheet and the drilled-at lines under Instructions' controls say it in place of
// familiarity points: the same unit a change is measured in once it's made (editWatch). One at a
// time, the latest asked first, in the staff's lane (worthLane.ts); kept for the session by what it
// depends on.
import { useEffect, useState } from 'react';
import type { League, Tactics } from '../../core/types';
import { poolWorth, worthCall, type CounterWorth, type LeagueChange } from '../../core/ai/counterWorth';
import { gamesAhead } from '../../core/ai/tacticEdits';
import { drilledAs, execution } from '../../core/sim/familiarity';
import { teamPlayers } from '../../core/league/helpers';
import { hashString } from '../../core/random';
import { measureChanges } from '../../state/simClient';
import { useStore } from '../../state/store';
import { inLane } from './worthLane';

/** Paired games each configuration plays (the next game's opponent): about ±0.3 a game on the difference, in a few seconds. */
const LEARN_GAMES = 200;
/** Points of the five's execution (either end) learning has to cost before it's measured: below that it's a few hundredths of a point. */
const LEARN_GAP = 2;
/** How long a request sits before it's measured: a slider being dragged isn't measured at each step. */
const SETTLE_MS = 500;

export interface LearnCost {
  /** What drilling it is worth over playing it tonight: what learning it costs (its shrunk reading). */
  worth?: CounterWorth;
  /** Share of the games played. */
  progress: number;
  /** Nothing to measure: training camp drills whatever the team plays before opening night ('camp'), or there's no game ahead ('none'). */
  skip?: 'camp' | 'none';
}

interface Ask {
  league: League;
  have: Tactics;
  want: Tactics;
  at: number;
}

const measured = new Map<string, LearnCost>();
const asked = new Map<string, Ask>();
const listeners = new Set<() => void>();
let running: string | null = null;
/** Bumped when a measurement is stopped before it's done: the screens showing it ask again. */
let dropped = 0;
const KEEP = 40;

const tell = () => listeners.forEach((f) => f());

function pump() {
  if (running || useStore.getState().sim) return;
  // (the latest asked first: the control or sheet in front of the user)
  const next = [...asked.entries()].pop();
  if (!next) return;
  const [key, a] = next;
  const wait = a.at + SETTLE_MS - Date.now();
  if (wait > 0) return void setTimeout(pump, wait);
  asked.delete(key);
  running = key;
  const l = a.league;
  const me = l.userTid;
  const team = l.teams[me];
  const g = gamesAhead(l, 1)[0];
  const drilled = drilledAs(team.fam!, a.have, a.want, teamPlayers(l, me));
  const changes: LeagueChange[] = [
    { id: 'tonight', teams: { [me]: { tactics: a.want } } },
    { id: 'drilled', teams: { [me]: { tactics: a.want, fam: drilled } } },
  ];
  measured.set(key, { progress: 0 });
  tell();
  inLane(() =>
    measureChanges(
      l,
      g.home === me ? g.away : g.home,
      g.gid,
      changes,
      (d, t) => {
        if (measured.get(key)?.worth) return;
        measured.set(key, { progress: d / Math.max(1, t) });
        tell();
      },
      LEARN_GAMES,
    ),
  )
    .then(
      (out) => {
        const [now, dr] = [out?.find((c) => c.id === 'tonight'), out?.find((c) => c.id === 'drilled')];
        // (stopped by a newer measurement: asked again when it next shows)
        if (!now || !dr) {
          measured.delete(key);
          dropped++;
          return;
        }
        measured.set(key, { worth: poolWorth('learn', [{ w: 1, raw: dr.raw - now.raw, se: Math.hypot(dr.se, now.se) }]), progress: 1 });
        while (measured.size > KEEP) measured.delete(measured.keys().next().value!);
      },
      (e: unknown) => {
        // (kept as not measurable this session: asking again would fail the same way)
        measured.set(key, { progress: 1, skip: 'none' });
        console.warn('Learning it could not be measured:', e);
      },
    )
    .finally(() => {
      running = null;
      tell();
      setTimeout(pump, 0);
    });
}

/**
 * What learning tactics `want` costs, against `have` (what the team drills now), measured on the
 * user's next game: null when there's nothing to learn (the team knows it about as well already) or
 * nothing to ask (`want` null).
 */
export function useLearnCost(have: Tactics, want: Tactics | null): LearnCost | null {
  const league = useStore((s) => s.league);
  const simming = useStore((s) => !!s.sim);
  const [, bump] = useState(0);
  const team = league?.teams[league.userTid];
  let key: string | null = null;
  let out: LearnCost | null = null;
  if (league && team && want) {
    const g = gamesAhead(league, 1)[0];
    if (!team.fam) out = { progress: 1, skip: 'camp' };
    else if (!g) out = { progress: 1, skip: 'none' };
    else {
      const roster = teamPlayers(league, league.userTid);
      const five = roster.filter((p) => team.rotation.order.slice(0, 5).includes(p.pid));
      const a = execution(team.fam, want, five);
      const b = execution(drilledAs(team.fam, have, want, roster), want, five);
      if (Math.max(b.off - a.off, b.def - a.def) >= LEARN_GAP) {
        key = `${league.id}:${league.season}:${league.day}:${g.gid}:${hashString(JSON.stringify(team.fam) + JSON.stringify(have) + JSON.stringify(want) + JSON.stringify(team.rotation))}`;
        out = measured.get(key) ?? { progress: 0 };
      }
    }
  }
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  const again = dropped;
  useEffect(() => {
    if (!key || simming || !league || !want || measured.has(key) || running === key) return;
    asked.delete(key);
    asked.set(key, { league, have, want, at: Date.now() });
    pump();
    const k = key;
    // (gone from the screen, or changed, before it started: not measured)
    return () => void asked.delete(k);
  }, [key, simming, again]); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

/** "Learning it costs about 0.6 a game at first", "too small to tell": a measured learning cost in a few words. */
export function learnText(c: LearnCost): string {
  if (c.skip === 'none') return '';
  if (c.skip === 'camp') return 'Training camp drills it before opening night';
  if (!c.worth) return 'Measuring what learning it costs…';
  return worthCall(c.worth) === 'gain' ? `Learning it costs about ${c.worth.pts.toFixed(1)} a game at first (measured)` : 'Learning it costs too little to tell (measured)';
}

/** The same after a control's "Drilled at …": " · learning it costs about 0.6 a game at first (measured)", nothing while there's nothing to say. */
export function learnInline(c: LearnCost): string {
  const s = learnText(c);
  return s ? ` · ${s.charAt(0).toLowerCase()}${s.slice(1)}` : '';
}
