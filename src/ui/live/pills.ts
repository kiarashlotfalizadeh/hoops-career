// Quick changes for the live game: a short, curated row of one-tap moves at the top of the Every
// setting sheet, over the full levers. Each is a real change; pressed, it goes back to the game plan's setting.
// Pure: the Live screen applies them through the live game (sim.baseTactics → setTactics).

import type { Tactics } from '../../core/types';
import { cloneTactics, hacks, levelName, startHacking, stopHacking } from '../../core/sim/tactics';

export interface Pill {
  id: string;
  label: string;
  /** What it's doing now (pressed). */
  on: boolean;
  /** Turns it on, or (pressed) back to the game plan's setting. */
  apply: (t: Tactics) => void;
  /** Spelled out for screen readers and the tooltip. */
  help: string;
}

export interface PillContext {
  q: number;
  /** Seconds left in the period. */
  clock: number;
  /** Your score minus theirs, as the court shows it (a lead late brings "Slow it down" instead of "Push pace"). */
  margin?: number;
  /** Their five on the floor, with free-throw percentages (0..1). */
  oppOn: { pid: number; name: string; ftPct: number }[];
  /** Who to deny or double: their hottest shooter, or their leading scorer. */
  oppThreat?: { pid: number; name: string };
}

/** Free throws below this are worth hacking. */
export const HACK_BELOW = 0.6;

/** The Hack-a threshold that sends this shooter to the line: the engine fouls players under it (FT% × 100 < threshold). */
export const hackThreshold = (ftPct: number) => Math.ceil(ftPct * 100) + 1;

/** Whether tonight's tactics have moved off the game plan (what "Reset to game plan" is offered for). */
export const offPlan = (t: Tactics, plan: Tactics) => JSON.stringify(t) !== JSON.stringify(plan);

/** "Reset to game plan": back to the tactics the game tipped off with (a field they don't have, a mentality set since, goes too). */
export function resetToPlan(x: Tactics, plan: Tactics) {
  for (const k of Object.keys(x)) delete (x as unknown as Record<string, unknown>)[k];
  Object.assign(x, cloneTactics(plan));
}

/**
 * The quick changes on offer, at most seven: the defense's shape (zone or man), the pace (pushing,
 * or slowing it down to protect a fourth-quarter lead), packing the paint, getting back in
 * transition, denying or doubling their threat, and a Hack-a on their worst free-throw shooter while
 * that's legal. `t` is what the team plays now, `plan` what it tipped off with (the saved tactics
 * with tonight's game plan), which a pressed pill goes back to. Everything else is a lever below them.
 */
export function livePills(t: Tactics, plan: Tactics, ctx: PillContext): Pill[] {
  const out: Pill[] = [];
  // a pair of opposite settings: pressing the one in effect goes back to the plan (or the middle, when the plan was that setting too)
  const pair = <T>(id: string, read: (x: Tactics) => T, write: (x: Tactics, v: T) => void, on: (v: T) => boolean, set: T, middle: T, label: string, help: string) => {
    const now = on(read(t));
    const back = on(read(plan)) ? middle : read(plan);
    out.push({ id, label, on: now, help, apply: (x) => write(x, now ? back : set) });
  };
  const pace = [(x: Tactics) => x.offense.pace, (x: Tactics, v: number) => void (x.offense.pace = v)] as const;
  const help = [(x: Tactics) => x.defense.help, (x: Tactics, v: number) => void (x.defense.help = v)] as const;

  // the defense's shape: one pill that flips it
  out.push(
    t.defense.scheme !== 'man'
      ? { id: 'man', label: 'Man', on: false, help: 'Back to man-to-man.', apply: (x) => void (x.defense.scheme = 'man') }
      : {
          id: 'zone',
          label: 'Zone 2-3',
          on: false,
          help: 'A 2-3 zone: protects the paint, gives up corner threes and offensive boards.',
          apply: (x) => void (x.defense.scheme = 'zone23'),
        },
  );

  // the pace: the one in effect, else slowing it down to protect a lead in the fourth, else pushing
  const pushing = t.offense.pace >= 70;
  const slowing = t.offense.pace <= 30;
  const slow = slowing || (!pushing && ctx.q >= 4 && (ctx.margin ?? 0) > 0);
  if (slow) pair('slow', ...pace, (v) => v <= 30, 20, 50, 'Slow it down', `Pace: ${levelName('pace', 20)}. Fewer possessions, deep in the shot clock.`);
  else pair('push', ...pace, (v) => v >= 70, 80, 50, 'Push pace', `Pace: ${levelName('pace', 80)}. More possessions, more run-outs and more fatigue.`);

  pair('pack', ...help, (v) => v >= 70, 78, 50, 'Pack the paint', `Help defense: ${levelName('help', 78)}. Wall off drives, live with kick-out threes.`);

  const back = t.offense.crashBoards <= 30 && t.defense.getBack >= 70;
  out.push({
    id: 'getback',
    label: 'Get back',
    on: back,
    help: `Crash the glass: ${levelName('crashBoards', 20)}; transition defense: ${levelName('getBack', 85)}. No run-outs, fewer offensive boards.`,
    apply: (x) => {
      if (back) {
        x.offense.crashBoards = plan.offense.crashBoards <= 30 ? 50 : plan.offense.crashBoards;
        x.defense.getBack = plan.defense.getBack >= 70 ? 50 : plan.defense.getBack;
      } else {
        x.offense.crashBoards = 20;
        x.defense.getBack = 85;
      }
    },
  });

  const th = ctx.oppThreat;
  if (th)
    for (const how of ['deny', 'double'] as const) {
      const on = t.defense.starPlan === how && t.defense.starTarget === th.pid;
      out.push({
        id: how,
        label: `${how === 'deny' ? 'Deny' : 'Double'} ${th.name}`,
        on,
        help: how === 'deny' ? `Face-guard ${th.name}: fewer touches, a tired defender.` : `Double-team ${th.name} when he attacks: make the others beat you.`,
        apply: (x) => {
          x.defense.starPlan = on ? 'none' : how;
          x.defense.starTarget = on ? null : th.pid;
        },
      });
    }

  // the worst free-throw shooter on the floor, while a hack is still legal this period (not in its last two minutes)
  const worst = [...ctx.oppOn].sort((a, b) => a.ftPct - b.ftPct)[0];
  // a game plan's targets count as much as the threshold: on shows what the defense does, and off stops all of it
  if (worst && worst.ftPct < HACK_BELOW && ctx.clock >= 120) {
    const on = hacks(t.manage, worst);
    out.push({
      id: 'hack',
      label: `Hack-a-${worst.name}`,
      on,
      help: `Foul ${worst.name} on purpose (${Math.round(worst.ftPct * 100)}% from the line) away from the ball.`,
      apply: (x) => (on ? stopHacking(x.manage) : startHacking(x.manage, hackThreshold(worst.ftPct), ctx.q)),
    });
  } else if (hacks(t.manage))
    out.push({ id: 'hack', label: 'Stop Hack-a-player', on: true, help: 'No more intentional fouls on poor free-throw shooters.', apply: (x) => stopHacking(x.manage) });
  return out;
}
