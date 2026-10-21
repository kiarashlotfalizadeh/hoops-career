// The end of close games: a team holding for the last shot gets it up with time to spare, and the
// horn decides a game about as often as in the NBA (a game-winner at the buzzer in about one game in
// a hundred), instead of nearly every late winner coming with no time left.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, type SimTeamInput } from '../sim/engine';
import { Rng } from '../random';

describe('endgame', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 23 });
  const side = (tid: number): SimTeamInput => ({ team: league.teams[tid], players: teamPlayers(league, tid), adjust: true });

  it('decides close games through the last seconds, not all at the horn', () => {
    let late = 0;
    let horn = 0;
    const games = 1500;
    for (let g = 0; g < games; g++) {
      const a = g % 30;
      const b = (a + 1 + (g % 29)) % 30;
      const res = new GameSim(side(a), side(b), { rng: new Rng(4000 + g), type: 'regular', injuries: false }).simToEnd();
      const { flow, flowT } = res;
      if (!flow?.length || flowT?.length !== flow.length) continue;
      // the basket that put the winner ahead for good, and the seconds left when it fell (the flow's
      // clock is whole seconds: 0 is the last half second)
      const winner = res.home.pts > res.away.pts ? 1 : -1;
      let at = -1;
      let prev = 0;
      for (let i = 0; i < flow.length; i++) {
        const lead = winner * flow[i];
        if (lead > 0 && prev <= 0) at = i;
        prev = lead;
      }
      if (at < 0) continue;
      const left = 2880 + 300 * res.ot - flowT[at];
      if (left > 24) continue;
      late++;
      if (left < 1) horn++;
    }
    // games decided in the last 24 seconds: seven or eight in a hundred
    expect(late / games).toBeGreaterThan(0.04);
    expect(late / games).toBeLessThan(0.12);
    // and at the horn: about a quarter of the late ones, two games in a hundred (the NBA's about one
    // in a hundred; when every last shot waited for the horn it was nearly four in ten of them)
    expect(horn / late).toBeLessThan(0.33);
    expect(horn / games).toBeLessThan(0.03);
  }, 120_000);
});
