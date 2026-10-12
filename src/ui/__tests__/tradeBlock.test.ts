// The trading block: the best package each team would give for one of the user's players.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { standardRoster } from '../../core/league/helpers';
import { capSalary, playerValueFor, untradeableReason } from '../../core/league/trades';
import { blockOffers } from '../office/tradeBlock';

describe('blockOffers', () => {
  it("doesn't mistake a salary filler for a pick already in the package when their ids match", () => {
    const l = createLeague({ name: 'block7', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });
    let tried = 0;
    for (const target of standardRoster(l, 0)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 6)) {
      for (const o of blockOffers(l, target.pid)) {
        const t = o.tid;
        if (!o.offer.b.dpids.length) continue;
        // the team's cheapest contracts for their value: the fillers it adds to make the money work
        const fillers = standardRoster(l, t)
          .filter((p) => !untradeableReason(l, p) && capSalary(l, p.pid) > 0 && !o.offer.b.pids.includes(p.pid))
          .sort((x, y) => playerValueFor(l, x, t, false) / capSalary(l, x.pid) - playerValueFor(l, y, t, false) / capSalary(l, y.pid))
          .slice(0, 3);
        for (const f of fillers) {
          // renumber the package's pick to the filler's id (and the pick that had it to the old one)
          const d = l.draftPicks.find((x) => x.dpid === o.offer.b.dpids[0])!;
          const other = l.draftPicks.find((x) => x.dpid === f.pid);
          const old = d.dpid;
          if (other) other.dpid = old;
          d.dpid = f.pid;
          const again = blockOffers(l, target.pid).find((x) => x.tid === t);
          d.dpid = old;
          if (other) other.dpid = f.pid;
          tried++;
          // the same package, its pick under the new id
          expect(again?.offer.b.pids).toEqual(o.offer.b.pids);
          expect(again?.offer.b.dpids.map((x) => (x === f.pid ? old : x))).toEqual(o.offer.b.dpids);
        }
      }
    }
    expect(tried).toBeGreaterThan(0);
  });
});
