// The staff acts on the season only on a paired measurement: the engine's tally of each setting's
// trade-off orders where it looks, and a change it runs for the user goes in only when the games
// played both ways say so (staffLever.ts), said by mail with Undo; the user's own tactics get a card.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { leverCounter, seasonLevers, staffTactics, teamAlerts } from '../ai/advisor';
import { autoTactics, defPresetFit, fitRoster, offPresetFit, rankedPresets, rosterProfile, staffPick } from '../ai/coachAI';
import { cloneTactics } from '../sim/tactics';
import { teamPlayers } from '../league/helpers';
import { applyStaffTactics } from '../league/games';
import {
  LEVER_AHEAD,
  LEVER_EVERY,
  leverCard,
  leverClears,
  leverDecide,
  leverMorning,
  leverReport,
  leverSig,
  moveLine,
  staffMoveNow,
  undoStaffMove,
  withStaffMoves,
  type LeverReading,
} from '../league/staffLever';
import { staffPicksSince } from '../league/weekCall';
import type { League, TacticImpact } from '../types';

/** A fictional league a few weeks in, with every user game's trade-offs replaced by `impacts(side)`. */
function league(impacts: (us: 0 | 1) => TacticImpact[]): League {
  const l = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
  startRegularSeason(l);
  l.teams[0].tactics.manual = false;
  for (let d = 0; d < 24; d++) simDay(l);
  for (const g of l.games) {
    const side = g.home.tid === 0 ? 0 : g.away.tid === 0 ? 1 : -1;
    if (side >= 0) g.impacts = impacts(side as 0 | 1);
  }
  return l;
}

const im = (key: string, t: 0 | 1, pts: number): TacticImpact => ({ key, t, pts, count: 1, players: {} });

/** A reading of the staff's change for trade-off `what` on the user's tactics as they stand, measured today. */
function reading(l: League, what: string, w: Pick<LeverReading, 'pts' | 'raw' | 'se'>): LeverReading {
  const t = l.teams[0].tactics;
  return { what, label: leverCounter(what, t)!.label, sig: leverSig(t, what), day: l.day, games: LEVER_AHEAD, ...w };
}
const put = (l: League, ...rs: LeverReading[]) => (l.staffLever = { season: l.season, tid: 0, last: l.day, readings: rs, moves: [] });

describe('the staff acts on the season', () => {
  // crashing gives up 3 a game in run-outs and wins 1 back; sitting off the ball gives up 2.5 in turnovers not forced
  const costly = (us: 0 | 1): TacticImpact[] => {
    const them = (1 - us) as 0 | 1;
    return [im('crash_leak:o', them, 3), im('crash_orb:o', us, 1), im('pressure_to:o', them, 2.5)];
  };

  it("tallies each trade-off over the season, changes a setting it runs only on a paired measurement and says what it measured, with Undo, and leaves the user's own tactics, a quiet season and AI teams alone", async () => {
    const costlyLeague = league(costly);
    {
      // the engine's tally of each trade-off over the season, worst first
      const l = structuredClone(costlyLeague);
      const levers = seasonLevers(l, 0);
      expect(levers.slice(0, 2).map((e) => [e.what, e.net])).toEqual([
        ['soft ball pressure', -2.5],
        ['crashing', -2],
      ]);
    }
    {
      // the tally alone changes nothing: the staff's refit is its fit, with no word
      const l = structuredClone(costlyLeague);
      const t = l.teams[0].tactics;
      t.offense.crashBoards = 80;
      const mail = l.inbox.length;
      expect(staffTactics(l, 0)).toEqual(autoTactics(l.teams[0], teamPlayers(l, 0), true, { sticky: true, user: true }));
      applyStaffTactics(l, 0);
      expect(l.inbox.length).toBe(mail);
      expect(leverDecide(l)).toBeNull();
    }
    {
      // a reading that clears the bar (WORTH_MIN, and two standard errors from even) goes in, said with what was measured
      const l = structuredClone(costlyLeague);
      const t = l.teams[0].tactics;
      t.offense.crashBoards = 80;
      t.defense.pressure = 40;
      put(l, reading(l, 'crashing', { pts: 0.4, raw: 0.6, se: 0.5 }), reading(l, 'soft ball pressure', { pts: 1.1, raw: 1.4, se: 0.9 }));
      // (under the bar: too small, or too noisy)
      expect(leverDecide(l)).toBeNull();
      put(l, reading(l, 'crashing', { pts: 1.2, raw: 1.5, se: 0.6 }));
      expect(leverClears(l.staffLever!.readings[0])).toBe(true);
      const m = leverDecide(l)!;
      expect(l.teams[0].tactics.offense.crashBoards).toBeLessThanOrEqual(50);
      expect(l.teams[0].tactics.manual).toBe(false);
      expect(l.inbox[0].subject).toBe('Staff change: Crash less');
      expect(l.inbox[0].body).toMatch(/I tried it both ways\. It seems to help, so I've made the change\./);
      expect(l.inbox[0].body).toContain('Undo');
      expect(l.staffPicks!.at(-1)!.text).toMatch(/^Staff (moved|made a change: ).+\. It seems to help\.$/);
      // named on Tactics while it holds, kept through the staff's refits, not made twice
      expect(staffMoveNow(l)).toEqual(m);
      expect(moveLine(l, m)).toMatch(/^Staff (moved .+ on|made a change on) [A-Z][a-z]{2} \d+(: .+)?\. It seems to help\.$/);
      expect(withStaffMoves(l, { ...l.teams[0].tactics, offense: { ...l.teams[0].tactics.offense, crashBoards: 80 } }).offense.crashBoards).toBeLessThanOrEqual(50);
      expect(leverDecide(l)).toBeNull();
      // Undo puts it back, and the staff doesn't make it again this season
      expect(undoStaffMove(l, m.day)).toBe(true);
      expect(l.teams[0].tactics.offense.crashBoards).toBe(80);
      expect(staffMoveNow(l)).toBeNull();
      expect(leverDecide(l)).toBeNull();
      expect(withStaffMoves(l, l.teams[0].tactics).offense.crashBoards).toBe(80);
    }
    {
      // his own tactics: the same reading is a card with the change as its fix, not a change; none on the tally alone
      const l = structuredClone(costlyLeague);
      const t = l.teams[0].tactics;
      t.offense.crashBoards = 80;
      t.manual = true;
      expect(teamAlerts(l, 0).some((a) => a.id.startsWith('lever-'))).toBe(false);
      put(l, reading(l, 'crashing', { pts: 1.2, raw: 1.5, se: 0.6 }));
      const card = leverCard(l)!;
      expect(card).toMatchObject({ title: 'Crash less: should help', fix: { kind: 'patch', label: 'Crash less' } });
      expect(teamAlerts(l, 0).find((a) => a.id === card.id)).toBeTruthy();
      expect(leverDecide(l)).toBeNull();
      // (changed since it was measured: the reading no longer stands)
      t.offense.crashBoards = 90;
      expect(leverCard(l)).toBeNull();
    }
    {
      // a real measurement: paired games over his next games, kept; made only if it clears
      const l = structuredClone(costlyLeague);
      l.teams[0].tactics.offense.crashBoards = 80;
      const before = cloneTactics(l.teams[0].tactics);
      expect(await leverMorning(l)).toBe(true);
      const r = l.staffLever!.readings[0];
      expect(r.games).toBeGreaterThan(0);
      expect(r.games).toBeLessThanOrEqual(LEVER_AHEAD);
      expect(r.se).toBeGreaterThan(0);
      if (leverClears(r)) expect(staffMoveNow(l)).toBeTruthy();
      else expect(l.teams[0].tactics).toEqual(before);
      // (not again for a while)
      const n = l.staffLever!.readings.length;
      await leverMorning(l);
      expect(l.staffLever!.readings.length).toBe(n);
    }
    {
      // a change that read short of the bar isn't measured again this season on the same tactics and
      // roster: the next reading is the tally's next candidate, and each is said (the digest's staff report, Analysis's row)
      const l = structuredClone(costlyLeague);
      const t = l.teams[0].tactics;
      t.offense.crashBoards = 80;
      t.defense.pressure = 40;
      put(l, reading(l, 'soft ball pressure', { pts: -0.6, raw: -0.8, se: 0.9 }));
      expect(leverReport(l)).toMatchObject({
        lean: 'cost',
        title: l.staffLever!.readings[0].label,
        meta: expect.stringMatching(/^[A-Z][a-z]{2} \d+ · kept the playbook as it is$/),
      });
      {
        const m = structuredClone(l);
        m.staffLever!.readings[0].words = [['Ball pressure', 'Off the ball', 'Up on the ball']];
        expect(leverReport(m)!.meta).toMatch(/kept Off the ball$/);
      }
      l.staffLever!.last = l.day - LEVER_EVERY;
      await leverMorning(l);
      const rs = l.staffLever!.readings;
      expect(rs.map((r) => r.what)).toEqual(['soft ball pressure', 'crashing']);
      expect(leverReport(l)!.title).toBe(rs[1].label);
      if (!leverClears(rs[1])) {
        expect(l.staffPicks!.at(-1)!.text).toMatch(/^Staff report: tried .+\. (No clear edge|Could hurt)\. Keeping .+\.$/);
        // (the digest says the latest, as one row)
        const latest = l.staffPicks!.at(-1)!.text;
        l.staffPicks!.splice(-1, 0, { season: l.season, day: l.day, text: 'Staff report: an earlier one.' });
        // (on screen without its mark)
        const said = `${latest.slice('Staff report: '.length).replace(/^t/, 'T')} The latest of 2 reports.`;
        expect(staffPicksSince(l, l.season, -1).filter((x) => x.startsWith('Tried') || x.startsWith('An earlier'))).toEqual([said]);
        // nothing left to look at on these tactics: no reading
        l.staffLever!.last = l.day - LEVER_EVERY;
        await leverMorning(l);
        expect(l.staffLever!.readings).toHaveLength(2);
      }
    }
    {
      // leaves the user's own tactics, a quiet season and AI teams alone
      const l = structuredClone(costlyLeague);
      l.teams[0].tactics.manual = true;
      const mine = structuredClone(l.teams[0].tactics);
      expect(staffTactics(l, 0)).toEqual(mine);
      // (in season the staff keeps the shape and playbooks it runs unless another fits clearly better: sticky)
      const ai = l.teams[1];
      expect(staffTactics(l, 1)).toEqual(autoTactics(ai, teamPlayers(l, 1), true, { sticky: true }));
      const quiet = league(() => []);
      // (the user's own staff: by its read)
      expect(staffTactics(quiet, 0)).toEqual(autoTactics(quiet.teams[0], teamPlayers(quiet, 0), true, { sticky: true, user: true }));
    }
    {
      // the user's own staff picks by its read, the style picker's top (no coach's lean); AI staffs keep
      // their coach's lean; in season a staff keeps what it runs
      // until another reads STICK better
      const l = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 3 });
      const pr = rosterProfile(fitRoster(teamPlayers(l, 0)));
      const top = (f: Record<string, number>) => Object.entries(f).sort((a, b) => b[1] - a[1])[0][0];
      expect([l.teams[0].tactics.offPreset, l.teams[0].tactics.defPreset]).toEqual([top(offPresetFit(pr)), top(defPresetFit(pr))]);
      for (const t of l.teams.slice(1)) {
        const r = rankedPresets(t, teamPlayers(l, t.tid));
        expect([t.tactics.offPreset, t.tactics.defPreset]).toEqual([r.off[0], r.def[0]]);
      }
      expect(rankedPresets(l.teams[0], teamPlayers(l, 0), { user: true }).def[0]).toBe(top(defPresetFit(pr)));
      // (no defense is barred for AI staffs: the zone is in every staff's read, its coach's or not)
      for (const t of l.teams.slice(1, 6)) expect(rankedPresets(t, teamPlayers(l, t.tid)).def).toContain('zone');
      expect([staffPick({ a: 10, b: 17 }, 'a', true), staffPick({ a: 10, b: 18 }, 'a', true), staffPick({ a: 10, b: 17 }, 'a')]).toEqual(['a', 'b', 'b']);
    }
  }, 120_000);
});
