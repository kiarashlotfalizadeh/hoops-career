// The trading block: the best package each team would give for one of the user's players.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { standardRoster } from '../../core/league/helpers';
import { blockOffers } from '../office/tradeBlock';

describe('blockOffers', () => {
  it("doesn't mistake a salary filler for a pick already in the package when their ids match", () => {
    let tried = 0;
    for (const rngSeed of [7, 11, 23]) {
      const l = createLeague({ name: `block${rngSeed}`, userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
      for (const target of standardRoster(l, 0)) {
        for (const o of blockOffers(l, target.pid)) {
          if (!o.offer.b.dpids.length) continue;
          // give the package's pick the id of a player in the same package (a salary filler, when
          // the money needed one), swapping with the pick that had it
          for (const pid of o.offer.b.pids) {
            const d = l.draftPicks.find((x) => x.dpid === o.offer.b.dpids[0])!;
            const other = l.draftPicks.find((x) => x.dpid === pid);
            const old = d.dpid;
            if (other) other.dpid = old;
            d.dpid = pid;
            const again = blockOffers(l, target.pid).find((x) => x.tid === o.tid);
            d.dpid = old;
            if (other) other.dpid = pid;
            tried++;
            // the same package, its picks under their swapped ids
            expect(again?.offer.b.pids).toEqual(o.offer.b.pids);
            expect(again?.offer.b.dpids.map((x) => (x === pid ? old : other && x === old ? pid : x))).toEqual(o.offer.b.dpids);
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(0);
  });
});
