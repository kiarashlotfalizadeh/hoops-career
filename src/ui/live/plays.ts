// Your plays in a live game: the late play call (built around your closer: his isolation, the sets he
// fits best, then one for someone else), how far the other defense has read each set tonight, and your
// players as the sets weigh them.

import type { CallId, League, SetId, Tactics } from '../../core/types';
import type { PossLog, PossStep } from '../../core/sim/log';
import { READ_ON_IT, SET_IDS, SET_K, castFor, fitPlayer, setFit, type FitPlayer } from '../../core/sim/sets';
import { buildScript, type Pt } from './choreo';
import type { DrawnSide } from './drawn';

/** A play the late call offers: a set or the clear-out isolation, and the player it's for. */
export interface PlayOption {
  id: CallId;
  pid: number;
}

/** Sets the late call offers for the player it's built around, after his isolation. */
const STAR_SETS = 2;

/**
 * The plays you can call late, built around `star` (your go-to while he's on the floor, else the one
 * the ball finds at the end: GameSim.closer): his clear-out isolation first, then the sets he fits
 * best (SET_K.fit and up, in your package or not: a call runs whatever you call), then the best set
 * for one of the other four that isn't one of his. Each runs on your next trip up the floor.
 */
export function playOptions(league: League, five: number[], t: Tactics, star: number): PlayOption[] {
  const fp = fitPlayers(league, five, t);
  const me = fp.find((p) => p.pid === star);
  if (fp.length < 5 || !me) return [];
  const fits = (p: FitPlayer) => SET_IDS.map((id) => ({ id, pid: p.pid, fit: setFit(id, p) })).filter((x) => x.fit >= SET_K.fit);
  const mine = fits(me)
    .sort((a, b) => b.fit - a.fit)
    .slice(0, STAR_SETS);
  const other = fp
    .filter((p) => p !== me)
    .flatMap(fits)
    .filter((x) => !mine.some((m) => m.id === x.id))
    .sort((a, b) => b.fit - a.fit || a.pid - b.pid)[0];
  return [{ id: 'iso', pid: star }, ...[...mine, ...(other ? [other] : [])].map(({ id, pid }) => ({ id, pid }))];
}

/** How far the defense has read a set tonight, from the court's drawn game: its runs, and a few words on it. */
export function readStatus(side: Pick<DrawnSide, 'sets'>, id: SetId): { runs: number; read: number; onIt: boolean; text: string } {
  const r = side.sets.find((x) => x.id === id);
  if (!r?.runs) return { runs: 0, read: 0, onIt: false, text: 'Not run yet' };
  const onIt = r.read >= READ_ON_IT;
  return { runs: r.runs, read: r.read, onIt, text: `Run ${r.runs}×${onIt ? ", they're on it" : r.read > 0 ? ", they've seen it" : ''}` };
}

/** Your players as the sets weigh them: skills, the role your tactics give them, size. */
export function fitPlayers(league: League, pids: number[], t: Tactics): FitPlayer[] {
  return pids.flatMap((pid) => (league.players[pid] ? [fitPlayer(league.players[pid], t)] : []));
}

// ---------------------------------------------------------------- the board: a play, drawn

/**
 * A play as a coach draws it in the huddle: the five where the play starts (`n`: 1 the man with the ball, then up
 * to 5 the tallest; `star`: the man it is for), and what each does, in order: a cut or a dribble along a line of
 * points, a pass from one spot to another (a hand-off: `hand`), a screen where it is set and which way it faces. In
 * the offense's half of the floor, as the court has it (choreo.ts: x across, -25 to 25; y out from the baseline it
 * attacks, the basket at 5.25).
 */
export interface Board {
  men: { pid: number; n: number; at: Pt; star: boolean; ball: boolean }[];
  marks: ({ kind: 'cut' | 'dribble'; pid: number; pts: Pt[]; screen?: number } | { kind: 'pass'; from: Pt; to: Pt; hand: boolean })[];
  /** The play in words, a beat at a time (the court's own captions for it). */
  says: string[];
}

/**
 * The court's beats for a play called from the bench, as the engine logs them when it runs clean (engine/pnr.ts,
 * handoff.ts, motion.ts, postUp.ts: the same steps, with nobody guessing what the defense does about them).
 */
function playSteps(id: CallId, five: FitPlayer[], star: FitPlayer): PossStep[] | null {
  if (id === 'iso') {
    return [
      { k: 'advance', pid: star.pid },
      { k: 'drive', pid: star.pid },
    ];
  }
  const c = castFor(id, five, star);
  if (!c) return null;
  const [a, b, cc, d] = [c.a.pid, c.b.pid, c.c.pid, c.d?.pid];
  switch (id) {
    case 'spain':
      return [
        { k: 'advance', pid: a },
        { k: 'screen', pid: b, pid2: a },
        { k: 'pin', pid: cc, pid2: b },
      ];
    case 'horns':
      return c.mode === 'elbow'
        ? [
            { k: 'advance', pid: a },
            { k: 'pass', pid: a, pid2: b },
            { k: 'handoff', pid: b, pid2: a },
          ]
        : [
            { k: 'advance', pid: a },
            { k: 'screen', pid: b, pid2: a },
          ];
    case 'floppy':
    case 'elevator':
      return [{ k: 'advance', pid: b }, { k: 'pin', pid: cc, pid2: a }, ...(d !== undefined ? [{ k: 'pin' as const, pid: d, pid2: a }] : []), { k: 'pass', pid: b, pid2: a }];
    case 'hammer':
      return [
        { k: 'advance', pid: a },
        { k: 'drive', pid: a },
        { k: 'pin', pid: cc, pid2: b },
        { k: 'pass', pid: a, pid2: b },
      ];
    case 'chicago':
      return [
        { k: 'advance', pid: b },
        { k: 'pin', pid: cc, pid2: a },
        { k: 'handoff', pid: b, pid2: a },
      ];
    case 'postSplit':
      return [{ k: 'advance', pid: b }, { k: 'post', pid: a }, ...(d !== undefined ? [{ k: 'pin' as const, pid: d, pid2: cc }] : [])];
  }
}

/** A man goes at least this far (ft) in a beat to have a line drawn for it; one the play's beats don't name (he is making room), this far. */
const BOARD_MOVE = 1.2;
const BOARD_ROOM = 4;

/**
 * The board for a play: what the court will draw when it is run, read off the court's own keyframes for it (the
 * play's beats put through choreo.ts buildScript, with no defense's answer in them), so the board in the huddle
 * and the play on the floor are one drawing. Null without five players.
 */
export function playBoard(id: CallId, five: FitPlayer[], pid: number, names?: (pid: number) => string): Board | null {
  const star = five.find((p) => p.pid === pid);
  if (five.length < 5 || !star) return null;
  const steps = playSteps(id, five, star);
  if (!steps) return null;
  const off = five.map((p) => p.pid);
  // (the other five: nobody the board draws, but the court's frames are of ten)
  const def = off.map((_, i) => -1 - i);
  const log: PossLog = {
    off: 0,
    q: 1,
    clockStart: 600,
    clockEnd: 590,
    kind: 'half',
    steps,
    pts: 0,
    score: [0, 0],
    label: '',
    lines: [],
    on: [off, def],
    guards: Object.fromEntries(off.map((o, i) => [o, def[i]])),
    scheme: 'man',
    help: 50,
    ...(id !== 'iso' && { set: { id, pid, n: 1 } }),
    ...(id === 'iso' && { iso: pid }),
  };
  const byPid = new Map(five.map((p) => [p.pid, p]));
  const info = (p: number) => ({ pid: p, hgt: byPid.get(p)?.r.hgt ?? 50, shoot: byPid.get(p)?.c.c3 ?? 50, handle: byPid.get(p)?.c.pnrHandle ?? 50 });
  const script = buildScript(log, info, undefined, undefined, names);
  const f = script.frames;
  // (the first frame is the five coming over half court, the second the set they come into: the board starts there)
  if (f.length < 2) return null;
  const start = f[1];
  const order = [...off.keys()].sort((x, y) => (x === start.hold ? -1 : y === start.hold ? 1 : info(off[x]).hgt - info(off[y]).hgt));
  const men = off.map((p, j) => ({ pid: p, n: order.indexOf(j) + 1, at: { ...start.o[j] }, star: p === pid, ball: j === start.hold }));
  const marks: Board['marks'] = [];
  const named = new Set(steps.flatMap((st) => [st.pid, st.pid2]));
  const open = new Map<number, Extract<Board['marks'][number], { pts: Pt[] }>>();
  for (let i = 2; i < f.length; i++) {
    const [was, now] = [f[i - 1], f[i]];
    // (the ball from one man to another: thrown, or handed over)
    if (was.hold !== undefined && now.hold !== undefined && was.hold >= 0 && now.hold >= 0 && was.hold < 5 && now.hold < 5 && was.hold !== now.hold) {
      marks.push({ kind: 'pass', from: { ...now.o[was.hold] }, to: { ...now.o[now.hold] }, hand: !!now.handoff });
      open.clear();
    }
    for (let j = 0; j < 5; j++) {
      const far = Math.hypot(now.o[j].x - was.o[j].x, now.o[j].y - was.o[j].y);
      const kind = j === now.hold && j === was.hold ? 'dribble' : 'cut';
      const screens = now.act[j] === 'screen';
      if (far < (named.has(off[j]) ? BOARD_MOVE : BOARD_ROOM)) {
        // (a screen set where he stands: the last line that brought him here ends in it)
        const last = open.get(j);
        if (screens && last) last.screen = now.face[j];
        continue;
      }
      let line = open.get(j);
      // (a line that ended in a screen is done: where he goes from it is another line, and the bar stays where he set it)
      if (!line || line.kind !== kind || line.screen !== undefined) {
        line = { kind, pid: off[j], pts: [{ ...was.o[j] }] };
        marks.push(line);
        open.set(j, line);
      }
      line.pts.push({ ...now.o[j] });
      if (screens) line.screen = now.face[j];
    }
  }
  return { men, marks, says: f.map((x) => x.cap ?? '').filter((c, i, all) => c && all.indexOf(c) === i) };
}
