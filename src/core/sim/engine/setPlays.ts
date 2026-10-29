// Sets as the engine runs them (the library is ../sets.ts): the cast and the openness a set adds to
// its look against this defense, the defense's read of it from the runs before (openness lost, passes
// jumped), and the night's tally of each set's runs and points. An action takes its set when it
// starts, so the actions it hands on to never see it.

import type { ActionType, SetId, SetStat } from '../../types';
import { READ_ON_IT, SET_K, castFor, readAfter, readSlots, setEdges, setLabel, setLook, type DefRead, type Slot } from '../sets';
import { K, lev } from './constants';
import type { SP, ST, SetPlay } from './state';
import type { GameSim } from './game';

export const setPlaysMethods = {
  /**
   * Set `id` run now for player `pid` (the best fit when he isn't on the floor): its cast, its edges
   * against this defense, the defense's read of it from the runs before, and the look the team goes
   * for. Counts the run (the possession's points go to its tally) and records it on the possession.
   * Its edges and the read's openness are played at the tactical leverage; whether the defense is on
   * it (READ_ON_IT) is judged on the read's 1x size, so a set is read in as many runs as before.
   */
  setPlay(this: GameSim, off: ST, def: ST, id: SetId, pid: number | null): SetPlay | null {
    const cast = castFor(id, off.on, pid !== null ? off.on.find((p) => p.pid === pid) : undefined);
    if (!cast) return null;
    const runs = off.setRuns.get(id) ?? 0;
    off.setRuns.set(id, runs + 1);
    const seen = readAfter(id, runs, def.team.coach?.tactics ?? 50);
    const read = lev(seen);
    const zone = this.zone(def);
    const d: DefRead = {
      cov: zone ? 'zone' : def.t.defense.pnr,
      scheme: this.schemeNow(def),
      switches: !zone && (def.t.defense.pnr === 'switch' || def.t.defense.switchOffBall),
      help: this.help(def),
      pressure: this.pressure(def),
      locked: !!this.lock(def, off, cast.star),
    };
    const open: SetPlay['open'] = {};
    const tags: SetPlay['tags'] = {};
    for (const [slot, e] of Object.entries(setEdges(cast, d)) as [Slot, number][]) {
      if (!e) continue;
      open[slot] = lev(e);
      tags[slot] = [[`set_${id}`, lev(e)]];
    }
    if (read > 0)
      for (const slot of readSlots(cast)) {
        open[slot] = (open[slot] ?? 0) - read;
        (tags[slot] ??= []).push(['set_read', -read]);
      }
    const st = this.setStat(off.side, id);
    if (seen >= READ_ON_IT && st.readAt === undefined) st.readAt = st.runs;
    this.possSet = st;
    if (this.cur) this.cur.set = { id, pid: cast.star.pid, n: runs + 1 };
    return { cast, label: setLabel(id, cast.star.name), read, open, tags, w: setLook(cast, d.locked) };
  },

  /** The night's tally of a side's set (or clear-out isolations), with this run counted. */
  setStat(this: GameSim, side: 0 | 1, id: SetId | 'iso'): SetStat {
    const key = `${side}:${id}`;
    let st = this.setStats.get(key);
    if (!st) {
      st = { t: side, id, runs: 0, pts: 0 };
      this.setStats.set(key, st);
    }
    st.runs++;
    return st;
  },

  /** The set handed to this action, if it's one of its: taken, so actions it hands on to never see it. */
  takePlay(this: GameSim, action: ActionType): SetPlay | null {
    const play = this.play?.cast.action === action ? this.play : null;
    this.play = null;
    return play;
  },

  /**
   * A set the defense has read gets its passes jumped: the turnover chance its read adds to the action
   * (tagged as the read's cost). Nothing without a set, or on its first run.
   */
  setJump(this: GameSim, play: SetPlay | null, def: ST, h: SP): number {
    if (!play?.read) return 0;
    const x = play.read * SET_K.jump;
    this.impact('set_read', def.side, x * h.ttv * K.toPts, h.pid);
    return x;
  },

  /** The openness a set adds to one of the action's options, its tags added to `tags`. */
  setOpen(this: GameSim, play: SetPlay, slot: Slot, tags: [string, number][]): number {
    const t = play.tags[slot];
    if (t) tags.push(...t);
    return play.open[slot] ?? 0;
  },
};
