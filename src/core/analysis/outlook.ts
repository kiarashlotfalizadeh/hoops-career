// What a set of team instructions plays like with this roster, measured: the user's team as it would
// dress tonight (its rotation, who's hurt) plays one game against every other team with the
// instructions, and the games say how long its trips last, where its shots come from, what it runs
// and what it gives up. Diagnostics of how the team plays (a shot diet, a tempo), never what a choice
// is worth in points: that stays the staff's read and the games'. Each game has its own fixed seed, so
// two sets of instructions are compared over the same games and a setting's effect isn't lost in the
// noise between them. A game is about 3 ms, so the whole measurement is a tenth of a second, run in
// slices between frames (ui/tactics/useOutlook.ts).

import type { League, ShotZone, Tactics } from '../types';
import { GameSim, type SimTeamInput } from '../sim/engine';
import { buildSimInput } from '../league/games';
import { hashString, Rng } from '../random';
import type { FinishType } from '../sim/log';

/** The three shot zones the instructions steer: beyond the arc, between it and the rim, at the rim. */
export type MixZone = 'three' | 'mid' | 'rim';
export const MIX_ZONES: MixZone[] = ['three', 'mid', 'rim'];
export const mixZone = (z: ShotZone): MixZone => (z === 'c3' || z === 'ab3' ? 'three' : z === 'rim' ? 'rim' : 'mid');

/** A side's shots: each zone's share of its attempts, and where they went up (feet: x from the basket along the baseline, y from the baseline). */
export interface ShotDiet {
  mix: Record<MixZone, number>;
  shots: { x: number; y: number; zone: MixZone }[];
}

export interface Outlook {
  /** Games measured. */
  games: number;
  /** Seconds a trip with the ball lasts. */
  secPerPoss: number;
  /** The user's shots, and the shots his defense gives up. */
  own: ShotDiet;
  opp: ShotDiet;
  /** Each way a trip ends as a share of the user's trips. */
  finishes: Partial<Record<FinishType, number>>;
  /** Trips in transition as a share of all trips: the user's, and his opponents'. */
  fastBreak: number;
  oppFastBreak: number;
  /** Share of the user's own misses he rebounds. */
  orb: number;
  /** Turnovers his defense forces, per opponent trip. */
  forced: number;
}

/** Games of the measurement: one against each other team, at most. */
export const OUTLOOK_GAMES = 29;
/** Shot locations kept for the chart, per side. */
const KEEP_SHOTS = 1400;

/** What decides the measurement: the league's day, the instructions, the rotation and who's hurt. */
export function outlookKey(league: League, t: Tactics): string {
  const me = league.teams[league.userTid];
  const out = Object.values(league.players)
    .filter((p) => p.injury)
    .map((p) => p.pid)
    .sort((a, b) => a - b);
  return `${league.id}:${league.season}:${league.day}:${hashString(JSON.stringify([t.offense, t.defense, t.mentality ?? 0, me.rotation, out]))}`;
}

/**
 * The measurement as a run that can be played in slices: `step(n)` plays up to `n` more games and says
 * whether any are left, `result()` reads what has been played so far.
 */
export function outlookRun(league: League, tactics: Tactics, games = OUTLOOK_GAMES) {
  const user = league.userTid;
  const opps = league.teams.map((t) => t.tid).filter((tid) => tid !== user);
  const n = Math.min(games, opps.length);
  const seed = hashString(`${league.id}:outlook`);
  // (no in-game adjustments on either bench: the instructions as set, all game)
  const side = (tid: number): SimTeamInput => ({ ...buildSimInput(league, tid, league.day, 'regular'), adjust: false });
  const mine = side(user);
  const me: SimTeamInput = { ...mine, team: { ...mine.team, tactics } };
  const zones = { own: { three: 0, mid: 0, rim: 0 }, opp: { three: 0, mid: 0, rim: 0 } };
  const shots: { own: ShotDiet['shots']; opp: ShotDiet['shots'] } = { own: [], opp: [] };
  const fin: Partial<Record<FinishType, number>> = {};
  let done = 0;
  let sec = 0;
  let poss = 0;
  let oppPoss = 0;
  let oppBreak = 0;
  let orb = 0;
  let oppDrb = 0;
  let forced = 0;
  // (each side keeps an even share of every game's shots for the chart)
  const per = Math.ceil(KEEP_SHOTS / Math.max(1, n));
  return {
    games: n,
    get done() {
      return done;
    },
    step(count: number): boolean {
      for (let i = 0; i < count && done < n; i++, done++) {
        const home = done % 2 === 0;
        const them = side(opps[done]);
        const sim = new GameSim(home ? me : them, home ? them : me, {
          rng: new Rng((seed + Math.imul(done + 1, 2654435761)) >>> 0),
          type: 'regular',
          injuries: false,
          neutral: true,
          keepShots: true,
        });
        const res = sim.simToEnd();
        const mySide = home ? 0 : 1;
        const a = home ? res.home : res.away;
        const b = home ? res.away : res.home;
        sec += sim.possSec[mySide];
        poss += a.poss;
        oppPoss += b.poss;
        orb += a.t.orb;
        oppDrb += b.t.drb;
        forced += b.t.tov;
        for (const [k, v] of Object.entries(a.playTypes)) fin[k as FinishType] = (fin[k as FinishType] ?? 0) + v.poss;
        oppBreak += b.playTypes.transition?.poss ?? 0;
        const kept = { own: 0, opp: 0 };
        for (const s of res.shots ?? []) {
          const who = s.t === mySide ? 'own' : 'opp';
          const zone = mixZone(s.zone);
          zones[who][zone]++;
          if (kept[who]++ < per) shots[who].push({ x: s.x, y: s.y, zone });
        }
      }
      return done < n;
    },
    result(): Outlook {
      const diet = (who: 'own' | 'opp'): ShotDiet => {
        const z = zones[who];
        const all = Math.max(1, z.three + z.mid + z.rim);
        return { mix: { three: z.three / all, mid: z.mid / all, rim: z.rim / all }, shots: shots[who] };
      };
      const p = Math.max(1, poss);
      return {
        games: done,
        secPerPoss: sec / p,
        own: diet('own'),
        opp: diet('opp'),
        finishes: Object.fromEntries(Object.entries(fin).map(([k, v]) => [k, v / p])),
        fastBreak: (fin.transition ?? 0) / p,
        oppFastBreak: oppBreak / Math.max(1, oppPoss),
        orb: orb / Math.max(1, orb + oppDrb),
        forced: forced / Math.max(1, oppPoss),
      };
    },
  };
}

/** The whole measurement at once (tests, scripts). */
export function outlook(league: League, tactics: Tactics, games = OUTLOOK_GAMES): Outlook {
  const run = outlookRun(league, tactics, games);
  run.step(run.games);
  return run.result();
}
