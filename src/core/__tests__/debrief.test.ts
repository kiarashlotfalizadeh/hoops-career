// The staff's debrief (analysis/debrief.ts): the verdict, the edges that decided it, and what to do
// next time, each fix a real change to the tactics as they are now, for the plan or for good.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { playGame } from '../league/games';
import { buildGameReport } from '../analysis/gameReport';
import { debrief } from '../analysis/debrief';
import { applyPatch } from '../sim/tactics';

describe('the debrief', () => {
  it('leads with the verdict and the edges, and its fixes change the tactics as they are now', () => {
    const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
    league.phase = 'regular';
    let fixes = 0;
    for (let i = 0; i < 8; i++) {
      const g = league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!;
      const res = playGame(league, g);
      const rep = buildGameReport(league, res)!;
      const d = debrief(league, res, rep);
      // the staff's read says how it went in words: the final above it has the score
      expect(d.headline).not.toContain(`${res.home.pts}-${res.away.pts}`);
      expect(d.headline).not.toContain(`${res.away.pts}-${res.home.pts}`);
      expect(d.headline).toMatch(/^[A-Z].+\.$/);
      // and the next-time rows don't repeat a key's number (the keys' list has it)
      for (const a of d.advice) expect(a.title).not.toMatch(/goal [≤≥]/);
      expect(d.decided.length).toBeLessThanOrEqual(3);
      expect(d.opp).toBe(res.home.tid === 0 ? res.away.tid : res.home.tid);
      expect(d.advice.length).toBeLessThanOrEqual(5);
      const t = league.teams[0].tactics;
      for (const a of d.advice) {
        if (!a.patch) continue;
        fixes++;
        expect(a.label).toBeTruthy();
        expect(JSON.stringify(applyPatch(t, a.patch))).not.toBe(JSON.stringify(t));
      }
      // a simmed game has no live moves
      expect(d.moves).toBeNull();
    }
    expect(fixes).toBeGreaterThan(0);
  });
});
