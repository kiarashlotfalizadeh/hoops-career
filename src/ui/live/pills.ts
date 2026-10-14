// Quick tactical pills for the live game: one tap for the changes coaches make most during a game,
// gated by coaching depth like the Tactics screen. Pure: the Live screen applies them through
// sim.baseTactics → setTactics.

import type { Settings, Tactics } from '../../core/types';
import { cloneTactics, hacks, startHacking, stopHacking } from '../../core/sim/tactics';

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
  complexity: Settings['complexity'];
  q: number;
  /** Seconds left in the period. */
  clock: number;
  /** Their five on the floor, with free-throw percentages (0..1). */
  oppOn: { pid: number; name: string; ftPct: number }[];
  /** Who to deny or double: their hottest shooter, or their leading scorer. */
  oppThreat?: { pid: number; name: string };
}

/** Free throws below this are worth hacking. */
export const HACK_BELOW = 0.6;

/** The Hack-a threshold that sends this shooter to the line: the engine fouls players under it (FT% × 100 < threshold). */
export const hackThreshold = (ftPct: number) => Math.ceil(ftPct * 100) + 1;

const levels: Record<Settings['complexity'], number> = { simple: 0, advanced: 1, expert: 2 };

/**
 * The pills on offer: `t` is what the team plays now, `plan` what it started the game with (the
 * saved tactics with tonight's game plan), which a pressed pill goes back to.
 */
export function livePills(t: Tactics, plan: Tactics, ctx: PillContext): Pill[] {
  const lvl = levels[ctx.complexity];
  const out: Pill[] = [];
  // a pair of opposite settings: pressing the one in effect goes back to the plan (or the middle, when the plan was that setting too)
  const pair = <T>(id: string, read: (x: Tactics) => T, write: (x: Tactics, v: T) => void, on: (v: T) => boolean, set: T, middle: T, label: string, help: string) => {
    const now = on(read(t));
    const back = on(read(plan)) ? middle : read(plan);
    out.push({ id, label, on: now, help, apply: (x) => write(x, now ? back : set) });
  };
  const offense = (k: 'pace' | 'crashBoards') => [(x: Tactics) => x.offense[k], (x: Tactics, v: number) => void (x.offense[k] = v)] as const;
  const defense = (k: 'help') => [(x: Tactics) => x.defense[k], (x: Tactics, v: number) => void (x.defense[k] = v)] as const;

  pair('push', ...offense('pace'), (v) => v >= 70, 80, 50, 'Push pace', 'Pace 80: more possessions, more run-outs and more fatigue.');
  pair('slow', ...offense('pace'), (v) => v <= 30, 20, 50, 'Slow it down', 'Pace 20: fewer possessions, deep in the shot clock.');
  const zone = t.defense.scheme !== 'man';
  out.push(
    zone
      ? { id: 'man', label: 'Man', on: false, help: 'Back to man-to-man.', apply: (x) => void (x.defense.scheme = 'man') }
      : {
          id: 'zone',
          label: 'Zone 2-3',
          on: false,
          help: 'A 2-3 zone: protects the paint, gives up corner threes and offensive boards.',
          apply: (x) => void (x.defense.scheme = 'zone23'),
        },
  );
  pair('pack', ...defense('help'), (v) => v >= 70, 78, 50, 'Pack the paint', 'Help defense 78: wall off drives, live with kick-out threes.');
  pair('home', ...defense('help'), (v) => v <= 30, 25, 50, 'Stay home', 'Help defense 25: stay on the shooters, give up more drives.');
  out.push({
    id: 'hot',
    label: 'Feed hot hand',
    on: t.offense.hotHand,
    help: 'Whoever has made three or more in a row gets more of the shots.',
    apply: (x) => void (x.offense.hotHand = !t.offense.hotHand),
  });

  if (lvl >= 1) {
    const pressing = t.defense.press !== 'none';
    out.push(
      pressing
        ? { id: 'nopress', label: 'No press', on: false, help: 'Set up in the half court.', apply: (x) => void (x.defense.press = 'none') }
        : {
            id: 'press',
            label: 'Press after makes',
            on: false,
            help: 'Full-court pressure after made baskets: turnovers, at a cost in energy.',
            apply: (x) => void (x.defense.press = 'afterMade'),
          },
    );
    const crashing = t.offense.crashBoards >= 70;
    const back = t.offense.crashBoards <= 30 && t.defense.getBack >= 70;
    out.push({
      id: 'crash',
      label: 'Crash glass',
      on: crashing,
      help: 'Crash the offensive glass (80): second chances, fewer players back on defense.',
      apply: (x) => void (x.offense.crashBoards = crashing ? (plan.offense.crashBoards >= 70 ? 50 : plan.offense.crashBoards) : 80),
    });
    out.push({
      id: 'getback',
      label: 'Get back',
      on: back,
      help: 'Crash glass 20 and transition defense 85: no run-outs, fewer offensive boards.',
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
      for (const plan2 of ['deny', 'double'] as const) {
        const on = t.defense.starPlan === plan2 && t.defense.starTarget === th.pid;
        out.push({
          id: plan2,
          label: `${plan2 === 'deny' ? 'Deny' : 'Double'} ${th.name}`,
          on,
          help: plan2 === 'deny' ? `Face-guard ${th.name}: fewer touches, a tired defender.` : `Double-team ${th.name} when he attacks: make the others beat you.`,
          apply: (x) => {
            x.defense.starPlan = on ? 'none' : plan2;
            x.defense.starTarget = on ? null : th.pid;
          },
        });
      }
  }

  if (lvl >= 2) {
    // the worst free-throw shooter on the floor, while a hack is still legal this period (not in its last two minutes)
    const worst = [...ctx.oppOn].sort((a, b) => a.ftPct - b.ftPct)[0];
    // a game plan's targets count as much as the threshold: on shows what the defense does, and off stops all of it
    const hacking = hacks(t.manage);
    if (worst && worst.ftPct < HACK_BELOW && ctx.clock >= 120) {
      const on = hacks(t.manage, worst);
      out.push({
        id: 'hack',
        label: `Hack-a-${worst.name}`,
        on,
        help: `Foul ${worst.name} on purpose (${Math.round(worst.ftPct * 100)}% from the line) away from the ball.`,
        apply: (x) => (on ? stopHacking(x.manage) : startHacking(x.manage, hackThreshold(worst.ftPct), ctx.q)),
      });
    } else if (hacking)
      out.push({ id: 'hack', label: 'Stop the Hack-a', on: true, help: 'No more intentional fouls on poor free-throw shooters.', apply: (x) => stopHacking(x.manage) });
    if (ctx.q >= 4) {
      out.push({
        id: 'trailing',
        label: 'Foul when trailing',
        on: t.manage.foulWhenTrailing,
        help: 'Stop the clock with fouls when behind in the last minute.',
        apply: (x) => void (x.manage.foulWhenTrailing = !t.manage.foulWhenTrailing),
      });
      out.push({
        id: 'up3',
        label: 'Foul up 3',
        on: t.manage.foulUp3,
        help: 'Foul in the last seconds when up three, before they can try a tying three.',
        apply: (x) => void (x.manage.foulUp3 = !t.manage.foulUp3),
      });
    }
  }

  if (JSON.stringify(t) !== JSON.stringify(plan))
    out.push({
      id: 'reset',
      label: 'Reset to game plan',
      on: false,
      help: 'Back to the tactics this game started with.',
      apply: (x) => void Object.assign(x, cloneTactics(plan)),
    });
  return out;
}
