// The library of named offensive sets. A set is a specific way of running one of the engine's
// actions (a pick-and-roll, a handoff off screens, a drive-and-kick, a post-up) for one player and one
// look: it decides WHO gets the ball and WHAT the team goes for, plus the structural edges and costs
// it has against particular coverages and schemes (tagged 'set_<id>', the same kind of interplay the
// coverages already have). There is no execution bonus: the shot is made or missed as any other.
// Defenses read sets: every run tonight takes some openness off its look on the next run and gets its
// passes jumped a little more often, faster for a coach better at tactics (tagged 'set_read'), so a
// set is strongest early and costly when spammed.
// Sets come from bench calls and after-timeout plays; AI coaches run none.

import type { ActionType, CallId, DefScheme, OffRole, Player, PnrCoverage, SetId, Tactics } from '../types';
import { SET_IDS } from '../types';
import { archetype, composites, type Composites } from '../ratings';
import { planRoles } from './rotationPlan';

export { SET_IDS };
export type { SetId };

/** What the screens say about a set. */
export interface SetDef {
  id: SetId;
  name: string;
  short: string;
  /** The engine action it runs (Horns runs a handoff off the elbow when it's for a passing big). */
  action: ActionType;
  /** Who it's for, as "Run a play for him" lists it. */
  forWho: string;
  what: string;
  /** The look it creates. */
  look: string;
  /** The defenses it works against, and the ones it does nothing against (or worse): "Works against … Not against …". */
  beats: string;
  killedBy: string;
  /** Anything else it needs or costs. */
  note?: string;
  /** Extra seconds of shot clock it takes to run. */
  time: number;
  /** How fast defenses read it (1: the usual rate). */
  read: number;
}

export const SETS: Record<SetId, SetDef> = {
  spain: {
    id: 'spain',
    name: 'Spain pick-and-roll',
    short: 'Spain',
    action: 'pnr',
    forWho: 'a big who rolls to the rim',
    what: "A pick-and-roll where a shooter back-screens the roll man's defender as he dives.",
    look: 'the roll to the rim, or a three for the back screener',
    beats: 'drop, hedge, blitz and ice coverage, where the big guarding the roll man gets screened',
    killedBy: 'a switch',
    note: 'It needs a shooter to set the back screen. A zone waits for the roll.',
    time: 2,
    read: 1,
  },
  horns: {
    id: 'horns',
    name: 'Horns',
    short: 'Horns',
    action: 'pnr',
    forWho: 'a big who passes or shoots',
    what: 'Two bigs at the elbows, and the handler picks a side. A passing big hands it back, a shooting big pops.',
    look: 'an elbow handoff for a passing big, a pick-and-pop three for a shooting big',
    beats: 'drop coverage, and ball pressure, which the elbow handoff gets behind',
    killedBy: 'zones, which sit on the elbows',
    time: 1,
    read: 1,
  },
  floppy: {
    id: 'floppy',
    name: 'Floppy',
    short: 'Floppy',
    action: 'handoff',
    forWho: 'a shooter who moves without the ball',
    what: 'The shooter starts under the basket and picks a side: one screen or a stagger.',
    look: 'a catch-and-shoot three off the screens, or a curl when his man trails',
    beats: 'man-to-man that fights over screens, drop most of all, and top-locking, which he curls',
    killedBy: 'switching off-ball screens',
    note: 'It does little against a zone.',
    time: 1.5,
    read: 1,
  },
  elevator: {
    id: 'elevator',
    name: 'Elevator doors',
    short: 'Elevator',
    action: 'handoff',
    forWho: 'a catch-and-shoot shooter',
    what: 'The shooter runs between two side-by-side screeners, who close the doors behind him.',
    look: 'a three at the top of the key',
    beats: 'every man-to-man coverage, even a switch',
    killedBy: 'the 3-2 zone or top-locking him',
    note: 'The hardest look to stop and the easiest to read. Defenses read it twice as fast.',
    time: 1.5,
    read: 2,
  },
  hammer: {
    id: 'hammer',
    name: 'Hammer',
    short: 'Hammer',
    action: 'motion',
    forWho: 'a corner shooter',
    what: 'A baseline drive while a weak-side screen pins the defender who’d rotate to the corner.',
    look: 'a corner three on the kick-out',
    beats: 'help defense and the 2-3 zone: the more they help, the more open the corner',
    killedBy: 'staying home on shooters or switching the hammer screen',
    time: 1,
    read: 1,
  },
  chicago: {
    id: 'chicago',
    name: 'Chicago',
    short: 'Chicago',
    action: 'handoff',
    forWho: 'a scorer who shoots or drives off a handoff',
    what: 'A pin-down straight into a dribble handoff from a big. His man is a step behind twice.',
    look: 'a pull-up or a downhill drive off the handoff',
    beats: 'drop coverage most of all, and the other man-to-man coverages',
    killedBy: 'switching, which takes both actions away, or a zone',
    time: 1.5,
    read: 1,
  },
  postSplit: {
    id: 'postSplit',
    name: 'Post split',
    short: 'Post split',
    action: 'post',
    forWho: 'a post player who passes',
    what: 'A post entry, then the two around him split into a cut and a flare.',
    look: 'a cut or a flare three when they help the post, else his own shot',
    beats: 'help and double teams on the post',
    killedBy: 'switching the split, staying home or a zone',
    time: 1,
    read: 1,
  },
};

/** The clear-out isolation, as the play lists show it next to the sets: it is the isolation call. */
export const CLEAR_OUT = {
  name: 'Clear-out iso',
  short: 'Iso',
  forWho: 'any creator',
  what: 'Four players clear a side and he goes one-on-one.',
  look: 'his own shot against his man',
  beats: 'a weak defender and little help',
  killedBy: 'double teams and zones',
  // an isolation hides nothing: there is no look for a defense to read
  note: 'Never read: everyone sees an isolation coming.',
};

export const isSetId = (x: unknown): x is SetId => typeof x === 'string' && (SET_IDS as string[]).includes(x);
/** A play the bench can call: a set, or the clear-out isolation. */
export const isCallId = (x: unknown): x is CallId => x === 'iso' || isSetId(x);

/** Tuning shared by the engine and the screens. */
export const SET_K = {
  /** A player who fits a set at least this well is one the bench's play calls suggest it for. */
  fit: 60,
  /** Openness a read takes off the set's look per earlier run tonight, for a coach of 50 tactics (0.6x at 0, 1.4x at 100). */
  read: 0.35,
  /** The most a read takes off. */
  readMax: 2.5,
  /** Turnover chance per unit of read: the passes of a play the defense knows get jumped. */
  jump: 0.03,
};

/**
 * A read that has taken this much of the look away: "they're on it" (the run a report says it was read
 * by, and the package stops running it: only a call runs it again).
 */
export const READ_ON_IT = 0.5;

/** How much openness a defense whose coach rates `coachTactics` takes off set `id`'s look per earlier run. */
export function readRate(id: SetId, coachTactics: number): number {
  return SET_K.read * (0.6 + 0.8 * (coachTactics / 100)) * SETS[id].read;
}

/** Openness the defense takes off set `id`'s look on a run after `runs` earlier ones tonight. */
export function readAfter(id: SetId, runs: number, coachTactics: number): number {
  return Math.min(SET_K.readMax, runs * readRate(id, coachTactics));
}

// ---------------------------------------------------------------- who runs it

/** What a set needs to know about a player. */
export interface FitPlayer {
  pid: number;
  c: Composites;
  role: OffRole;
  big: boolean;
  r: { hgt: number };
}

/** A player as the sets weigh him (as the engine sees him): skills, his role in `t` (else his archetype's), size. */
export function fitPlayer(p: Player, t?: Pick<Tactics, 'offense'>): FitPlayer {
  return { pid: p.pid, c: composites(p.ratings), role: t?.offense.roles[p.pid] ?? archetype(p.ratings).role, big: planRoles(p.ratings, p.pos).big, r: { hgt: p.ratings.hgt } };
}

/** How well a player fits as the one a set is run for (about 30-90; SET_K.fit and up is a good fit). */
export function setFit(id: SetId, p: FitPlayer): number {
  const c = p.c;
  switch (id) {
    case 'spain':
      return p.big || p.role === 'roller' ? c.roll : 0.6 * c.roll;
    case 'horns': {
      const best = Math.max(c.passing + (p.role === 'hub' ? 6 : 0), c.pop + (p.role === 'stretch' ? 6 : 0));
      return p.big ? best : 0.5 * best;
    }
    case 'floppy':
      return 0.65 * c.c3 + 0.35 * c.offBall + (p.role === 'shooter' ? 4 : 0);
    case 'elevator':
      return 0.85 * c.c3 + 0.15 * c.offBall + (p.role === 'shooter' ? 4 : 0);
    case 'hammer':
      return c.c3 + (p.role === 'shooter' || p.role === 'glue' ? 3 : 0);
    case 'chicago':
      return 0.35 * c.offBall + 0.3 * c.pu3 + 0.35 * c.create;
    case 'postSplit':
      return 0.6 * c.postScore + 0.4 * c.passing + (p.role === 'post' || p.role === 'hub' ? 4 : 0);
  }
}

/**
 * Who does what in a set run for `star` (or the best fit among the five), by its part in the action:
 * - spain: a handler, b the roll man (him), c the shooter who sets the back screen
 * - horns: a handler, b the big at the elbow (him), c the other big; mode 'elbow' (a handoff from him
 *   back to the handler) for a passing big, 'pop' (a pick-and-pop) for a shooting one
 * - floppy, elevator: a the shooter (him), b the passer, c and d the screeners
 * - hammer: a the driver, b the corner shooter (him), c the hammer screener
 * - chicago: a the scorer (him), b the big handing off, c the pin-down screener
 * - postSplit: a the post player (him), b the entry passer, c and d the splitting pair (c cuts, d flares)
 */
export interface Cast<T extends FitPlayer> {
  id: SetId;
  star: T;
  action: ActionType;
  mode?: 'pop' | 'elbow';
  a: T;
  b: T;
  c: T;
  d?: T;
}

const by =
  <T extends FitPlayer>(score: (p: T) => number) =>
  (a: T, b: T) =>
    score(b) - score(a) || a.pid - b.pid;

/** The player of `five` who fits set `id` best (the first of the best). */
export function bestFor<T extends FitPlayer>(id: SetId, five: T[]): T | undefined {
  return [...five].sort(by((p) => setFit(id, p)))[0];
}

/** The cast of set `id` for `star` (the best fit when he isn't one of the five): null without five players. */
export function castFor<T extends FitPlayer>(id: SetId, five: T[], star?: T): Cast<T> | null {
  if (five.length < 5) return null;
  const s = star && five.includes(star) ? star : bestFor(id, five)!;
  const rest = five.filter((p) => p !== s);
  const top = (list: T[], score: (p: T) => number) => [...list].sort(by(score))[0];
  const tallest = (list: T[]) => [...list].sort(by((p) => p.r.hgt))[0];
  const without = (...x: T[]) => rest.filter((p) => !x.includes(p));
  switch (id) {
    case 'spain': {
      const a = top(rest, (p) => p.c.pnrHandle);
      return { id, star: s, action: 'pnr', a, b: s, c: top(without(a), (p) => p.c.c3) };
    }
    case 'horns': {
      const a = top(rest, (p) => p.c.pnrHandle);
      const elbow = s.c.passing + (s.role === 'hub' ? 6 : 0) >= s.c.pop + (s.role === 'stretch' ? 6 : 0);
      return { id, star: s, action: elbow ? 'handoff' : 'pnr', mode: elbow ? 'elbow' : 'pop', a, b: s, c: tallest(without(a)) };
    }
    case 'floppy':
    case 'elevator': {
      const b = top(rest, (p) => p.c.passing);
      const screens = [...without(b)].sort(by((p) => p.r.hgt));
      return { id, star: s, action: 'handoff', a: s, b, c: screens[0], d: screens[1] };
    }
    case 'hammer': {
      const a = top(rest, (p) => p.c.create);
      return { id, star: s, action: 'motion', a, b: s, c: tallest(without(a)) };
    }
    case 'chicago': {
      // the big who hands off: a passing big as the handoffs' hub is chosen
      const b = top(rest, (p) => p.c.passing + (p.big ? 15 : 0) + (p.role === 'hub' ? 20 : 0));
      return { id, star: s, action: 'handoff', a: s, b, c: tallest(without(b)) };
    }
    case 'postSplit': {
      const b = top(rest, (p) => p.c.passing);
      const pair = [...without(b)].sort(by((p) => p.c.cut + p.c.c3));
      const [c, d] = pair[0].c.cut >= pair[1].c.cut ? [pair[0], pair[1]] : [pair[1], pair[0]];
      return { id, star: s, action: 'post', a: s, b, c, d };
    }
  }
}

// ---------------------------------------------------------------- what it goes for, and its edges

/**
 * The options of the action a set runs, by name: a pick-and-roll's pull-ups, drive, roll, pop and
 * kick-out; a handoff's three, mid-range, rim (the curl or drive) and the big's roll; motion's cut,
 * swing, drive (the kick off it is 'kick') and mid-range; a post-up's own shots ('post') and pass,
 * with the cut and kick-out it finds.
 */
export type Slot = 'pull3' | 'pull2' | 'drive' | 'roll' | 'pop' | 'kick' | 'three' | 'mid' | 'rim' | 'cut' | 'swing' | 'post' | 'pass';

/** What the team goes for: weight multipliers on the action's options (the look up, the rest down). */
export function setLook(cast: Pick<Cast<FitPlayer>, 'id' | 'mode'>, locked = false): Partial<Record<Slot, number>> {
  switch (cast.id) {
    case 'spain':
      return { roll: 2.5, kick: 1.3, pull3: 0.5, pull2: 0.5, drive: 0.7, pop: 0.5 };
    case 'horns':
      return cast.mode === 'elbow' ? { three: 1.4, rim: 1.6, roll: 1.3, mid: 0.8 } : { pop: 2.2, drive: 1.2, kick: 0.8, roll: 0.5, pull3: 0.7, pull2: 0.7 };
    case 'floppy':
      // top-locked, he curls
      return { three: locked ? 1 : 2, rim: locked ? 3 : 1.5, mid: 0.6, roll: 0.3 };
    case 'elevator':
      return { three: 3, mid: 0.4, rim: 0.4, roll: 0.2 };
    case 'hammer':
      return { drive: 4, cut: 0.3, swing: 0.3, mid: 0.2 };
    case 'chicago':
      return { three: 1.5, mid: 1.2, rim: 1.8, roll: 1 };
    case 'postSplit':
      return { post: 0.6, pass: 2.5 };
  }
}

/** The options whose openness a read takes away: the set's look. */
export function readSlots(cast: Pick<Cast<FitPlayer>, 'id' | 'mode'>): Slot[] {
  switch (cast.id) {
    case 'spain':
      return ['roll', 'kick'];
    case 'horns':
      return cast.mode === 'elbow' ? ['three', 'rim'] : ['pop', 'drive'];
    case 'floppy':
      return ['three', 'rim'];
    case 'elevator':
      return ['three'];
    case 'hammer':
      return ['kick'];
    case 'chicago':
      return ['three', 'mid', 'rim'];
    case 'postSplit':
      return ['cut', 'kick'];
  }
}

/** The defense a set meets, as its edges read it. */
export interface DefRead {
  /** The ball-screen coverage played, 'zone' in any zone. */
  cov: PnrCoverage | 'zone';
  /** The scheme played now (a junk defense with nobody to chase plays man-to-man). */
  scheme: DefScheme;
  /** Screens off the ball and handoffs get switched (man-to-man with Switch coverage or Switch off-ball screens). */
  switches: boolean;
  /** -1 stay home .. +1 pack the paint. */
  help: number;
  /** -1 contain .. +1 swarm. */
  pressure: number;
  /** The player it's run for is top-locked (a junk defense's chaser, or "run him off the line"). */
  locked: boolean;
}

const pos = (x: number) => Math.max(0, x);

/**
 * A set's structural edges against the defense it meets: openness by option (positive for the
 * offense), on top of everything the action already does against that defense. These are the
 * documented strengths and weaknesses in SETS (beats / killedBy), and nothing else.
 */
export function setEdges(cast: Pick<Cast<FitPlayer>, 'id' | 'mode' | 'c'>, d: DefRead): Partial<Record<Slot, number>> {
  const zone = d.cov === 'zone';
  switch (cast.id) {
    case 'spain': {
      // a zone has no man to back-screen: its back line is waiting for the roll
      if (zone) return { roll: -0.5 };
      // the back screen only bites when the screener's man has to respect his shot
      const k = Math.min(1, Math.max(0.25, (cast.c.c.c3 - 35) / 30));
      const cov = d.cov as PnrCoverage;
      const roll = { drop: 0.9, hedge: 0.7, blitz: 0.5, ice: 0.6, switch: 0 }[cov];
      const kick = { drop: 0.3, hedge: 0.25, blitz: 0.2, ice: 0.25, switch: 0 }[cov];
      return roll ? { roll: roll * k, kick: kick * k } : {};
    }
    case 'horns':
      // the zone's top defenders sit on the elbows
      if (zone) return cast.mode === 'elbow' ? { three: -0.8, rim: -0.8 } : { pop: -0.8, drive: -0.6 };
      if (cast.mode === 'elbow') {
        if (d.switches) return { three: -0.8, rim: -0.8 };
        // the second big at the other elbow takes his man out of the paint, and an overplay on the
        // handler leaves the handoff behind it
        return { rim: 0.3 + 0.6 * pos(d.pressure), three: d.cov === 'drop' ? 0.4 : 0.2, roll: 0.3 };
      }
      return d.cov === 'switch' ? {} : { pop: 0.5, drive: 0.3 };
    case 'floppy':
      if (zone) return { three: -0.5 };
      if (d.switches) return { three: -0.8, rim: -0.5 };
      return { three: d.cov === 'drop' ? 0.6 : 0.4, rim: d.locked ? 0.6 : 0.1 };
    case 'elevator':
      if (d.locked) return { three: -0.8 };
      if (zone) return d.scheme === 'zone32' ? { three: -0.8 } : {};
      return { three: d.switches ? 0.3 : 0.8 };
    case 'hammer':
      if (zone) return d.scheme === 'zone32' ? {} : { kick: 0.6 };
      return { kick: 0.2 + 0.8 * pos(d.help) - 1.2 * pos(-d.help) - (d.switches ? 1 : 0) };
    case 'chicago':
      if (zone) return { three: -0.5, mid: -0.3, rim: -0.5 };
      if (d.switches) return { three: -0.9, mid: -0.6, rim: -0.8 };
      return d.cov === 'drop' ? { three: 0.4, mid: 0.3, rim: 0.5 } : { three: 0.25, mid: 0.15, rim: 0.3 };
    case 'postSplit':
      if (zone) return { cut: -0.6, kick: -0.2 };
      return {
        cut: 0.45 + 0.8 * pos(d.help) - 0.6 * pos(-d.help) - (d.switches ? 1 : 0),
        kick: 0.3 + 0.5 * pos(d.help) - (d.switches ? 0.5 : 0),
      };
  }
}

/** Openness a double team on Post split's post player leaves its split cutters (on the 4-on-3 out of it). */
export const SPLIT_DOUBLE = 0.4;

// ---------------------------------------------------------------- labels

/** "Spain: Holmgren". */
export const setLabel = (id: SetId, name: string) => `${SETS[id].short}: ${name}`;

/** A called play as the screens name it: "Spain: Holmgren", "Iso: Bane"; the play alone without a name. */
export function callLabel(id: CallId, name?: string): string {
  if (id === 'iso') return name ? `${CLEAR_OUT.short}: ${name}` : CLEAR_OUT.name;
  return name ? setLabel(id, name) : SETS[id].name;
}

/** The after-timeout play as the screens name it: an action, a set, or a clear-out iso for one player. */
export function atoLabel(ato: string | null | undefined, actionLabel: (a: ActionType) => string, playerName?: string): string {
  if (!ato) return 'None';
  if (isSetId(ato)) return playerName ? setLabel(ato, playerName) : SETS[ato].name;
  if (ato === 'iso' && playerName) return `${CLEAR_OUT.name}: ${playerName}`;
  return actionLabel(ato as ActionType);
}
