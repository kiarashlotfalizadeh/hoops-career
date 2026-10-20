// The touchline in a live game (ui/live/familiar.ts): a switch to another of the coach's tactic
// slots plays it with tonight's orders carried over, the game knows which slot it's on (after a
// switch, changes on it, and "Reset to game plan"), changes made on another slot aren't kept, and
// the night's moves name the switch.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prepareLive, type LiveGame } from '../live';
import { useStore } from '../store';
import { emptyPatch, tacticsDiff } from '../../core/sim/tactics';
import { copyToSlot } from '../../core/sim/slots';
import { currentSlot, liveOpt, liveSlots, replaceWith, slotForGame, tipSlot, withMentalityOf } from '../../ui/live/familiar';
import { resetToPlan } from '../../ui/live/pills';
import type { League } from '../../core/types';
import { testLeague, toGameDay } from './fixtures';

function goLive(l: League): LiveGame {
  useStore.getState().setLeague(l);
  let lg: LiveGame | null = null;
  useStore.getState().mutate((x) => (lg = prepareLive(x)));
  if (!lg) throw new Error('no live game');
  return lg;
}

beforeEach(() => useStore.getState().setLeague(null));

/** A league on game day whose Tactic B is a 2-3 zone out of the 5-Out. */
function withPlanB(): League {
  const l = testLeague('slots');
  toGameDay(l);
  const team = l.teams[l.userTid];
  copyToSlot(team, 1);
  const b = team.slots!.stored[1]!;
  b.defense.scheme = 'zone23';
  b.offense.shape = 'fiveOut';
  team.slots!.names[1] = 'Zone look';
  return l;
}

describe('the touchline', () => {
  it('switches to another tactic with tonight’s orders kept, and knows which one is in play', () => {
    const l = withPlanB();
    const lg = goLive(l);
    const league = useStore.getState().league!;
    expect(currentSlot(league, lg)).toBe(0);
    const now = lg.sim.baseTactics(lg.userSide);
    // a matchup of tonight's carries over
    const theirs = lg.sim.T[1 - lg.userSide].players[0].pid;
    const mine = lg.sim.T[lg.userSide].players[0].pid;
    now.defense.matchups = { [theirs]: mine };
    const b = slotForGame(league, lg, 1, now)!;
    expect(b.defense.scheme).toBe('zone23');
    expect(b.offense.shape).toBe('fiveOut');
    expect(b.defense.matchups[theirs]).toBe(mine);
    // an empty slot has nothing to switch to
    expect(slotForGame(league, lg, 2, now)).toBeNull();
    lg.setTactics(b);
    expect(currentSlot(league, lg)).toBe(1);
    // a change on it: still Tactic B
    const tweak = lg.sim.baseTactics(lg.userSide);
    withMentalityOf(tweak, 1, lg.planned);
    lg.setTactics(tweak);
    expect(currentSlot(league, lg)).toBe(1);
    expect(tipSlot(league, lg)).toBe(0);
    // the touchline's figures: B is less familiar than A (a zone and a shape the team hasn't drilled)
    const { cur, slots } = liveSlots(league, lg, lg.sim.baseTactics(lg.userSide));
    expect(cur).toBe(1);
    expect(slots[0].fam).toBeGreaterThan(slots[1].fam);
    expect(slots[2].tactics).toBeNull();
    expect(liveOpt(lg, 'scheme:zone23')).toBeLessThan(liveOpt(lg, 'scheme:man'));
    // "Reset to game plan": back on A
    const back = lg.sim.baseTactics(lg.userSide);
    resetToPlan(back, lg.planned);
    lg.setTactics(back);
    expect(currentSlot(league, lg)).toBe(0);
  });

  it('replaces tactics whole, and puts a mentality back to the game’s own value', () => {
    const l = withPlanB();
    const lg = goLive(l);
    const x = lg.sim.baseTactics(lg.userSide);
    x.mentality = 2;
    replaceWith(x, lg.planned);
    expect(x.mentality).toBe(lg.planned.mentality);
    withMentalityOf(x, 1, lg.planned);
    expect(x.mentality).toBe(1);
    withMentalityOf(x, lg.planned.mentality ?? 0, lg.planned);
    expect(emptyPatch(tacticsDiff(lg.planned, x))).toBe(true);
    expect(JSON.stringify(x)).toBe(JSON.stringify(lg.planned));
  });

  it('names the switch in the night’s moves', () => {
    const l = withPlanB();
    const lg = goLive(l);
    const league = useStore.getState().league!;
    lg.simTo('quarter');
    lg.setTactics(slotForGame(league, lg, 1, lg.sim.baseTactics(lg.userSide))!);
    lg.simTo('end');
    let res = null as ReturnType<LiveGame['commit']> | null;
    useStore.getState().mutate((x) => void (res = lg.commit(x)));
    expect(res!.moves?.[0].text).toBe('Switched to Tactic B (Zone look)');
    // and the saved tactics are still Tactic A's
    expect(useStore.getState().league!.teams[league.userTid].tactics.defense.scheme).not.toBe('zone23');
  });
});
