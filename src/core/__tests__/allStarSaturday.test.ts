// All-Star Saturday: eight healthy shooters and four healthy dunkers from the rosters, scores in
// range, the winners with the award and the best final, the same league getting the same day, the
// league's random stream (and so the All-Star Game) untouched by it, a damaged result dropped on
// load, the contests a token among a career's honours, and the calibration over many contests.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { migrate } from '../../state/persistence';
import { accoladeScore, accolades } from '../../ui/league/shared';
import { hallOfFameScore, simDay } from '../league/season';
import { missesAllStarGame, selectAllStars } from '../league/awards';
import { playerName, seasonTotals } from '../league/helpers';
import {
  DUNK_FIELD,
  DUNK_FINALISTS,
  THREE_FIELD,
  THREE_FINALISTS,
  allStarSaturday,
  dunkField,
  dunkSkills,
  slamDunkContest,
  threeField,
  threePointContest,
  threeSkill,
} from '../league/allStarSaturday';
import { playerAge } from '../playerGen';
import { Rng } from '../random';
import type { Dunk, League, SeasonAwards } from '../types';

/** The league on the morning of the All-Star day, and the same league once the day is over. */
const before = (() => {
  const l = testLeague('saturday');
  while (l.day < l.allStarDay) simDay(l);
  return l;
})();
const after = structuredClone(before);
simDay(after);

const awardsOf = (l: League): SeasonAwards => l.awards.find((a) => a.season === l.season)!;
const sat = awardsOf(after).saturday!;
const total = (ds: Dunk[] | undefined) => (ds ?? []).reduce((a, d) => a + d.score, 0);
const allDunks = (e: (typeof sat.dunk)[number]) => [...e.r1, ...(e.final ?? []), ...(e.r1Off ?? []), ...(e.finalOff ?? [])];

describe('the fields', () => {
  it('eight shooters and four dunkers, healthy (or with a knock that heals over the break) and on a roster that morning, names and teams as they were', () => {
    expect(sat.three).toHaveLength(THREE_FIELD);
    expect(sat.dunk).toHaveLength(DUNK_FIELD);
    for (const e of [...sat.three, ...sat.dunk]) {
      const p = before.players[e.pid];
      expect(p.tid, e.name).toBeGreaterThanOrEqual(0);
      expect(e.tid).toBe(p.tid);
      expect(e.name).toBe(playerName(p));
      // the day heals a knock short enough to keep an All-Star his place before the contests
      if (p.injury) expect(missesAllStarGame(p), e.name).toBe(false);
    }
    expect(new Set(sat.three.map((e) => e.pid)).size).toBe(THREE_FIELD);
    expect(new Set(sat.dunk.map((e) => e.pid)).size).toBe(DUNK_FIELD);
  });

  it('shooters with the attempts; dunkers young high-flyers who are no All-Stars', () => {
    const games = Math.max(...before.teams.map((t) => t.seasons.find((s) => s.season === before.season)!).map((s) => s.won + s.lost));
    for (const e of sat.three) expect(seasonTotals(before.players[e.pid], before.season)!.tpa).toBeGreaterThanOrEqual(2.5 * games);
    const aw = awardsOf(after);
    const stars = new Set([...aw.allStars.E, ...aw.allStars.W]);
    for (const e of sat.dunk) {
      const p = before.players[e.pid];
      expect(stars.has(e.pid), e.name).toBe(false);
      expect(p.ovr).toBeLessThanOrEqual(84);
      // the real league has plenty of young athletes to ask
      expect(playerAge(p, before.season)).toBeLessThanOrEqual(26);
    }
  });

  it('a couple of All-Stars are invited when they are among the best shooters', () => {
    const l = structuredClone(before);
    selectAllStars(l);
    const aw = awardsOf(l);
    aw.allStars = { E: [], W: [] };
    const first = threeField(l);
    // the next eight: hurt the first eight for a moment
    for (const p of first) p.injury = { type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 1, severity: 'minor' };
    const next = threeField(l);
    for (const p of first) p.injury = null;
    aw.allStars = { E: [next[0].pid], W: [next[1].pid] };
    const field = threeField(l).map((p) => p.pid);
    expect(field).toHaveLength(THREE_FIELD);
    expect(field).toContain(next[0].pid);
    expect(field).toContain(next[1].pid);
    // in place of the two shooters ranked last
    expect(field.slice(0, 6)).toEqual(first.slice(0, 6).map((p) => p.pid));
  });
});

describe('the results', () => {
  it('Three-Point Contest: 0-40 a round, the top three in the final, the winner with the best final and the award', () => {
    for (const e of sat.three) {
      expect(Number.isInteger(e.r1) && e.r1 >= 0 && e.r1 <= 40).toBe(true);
      if (e.final !== undefined) expect(e.final >= 0 && e.final <= 40).toBe(true);
    }
    const finalists = sat.three.slice(0, THREE_FINALISTS);
    expect(finalists.every((e) => e.final !== undefined)).toBe(true);
    expect(sat.three.slice(THREE_FINALISTS).every((e) => e.final === undefined)).toBe(true);
    const cut = Math.min(...finalists.map((e) => e.r1));
    for (const e of sat.three.slice(THREE_FINALISTS)) {
      expect(e.r1).toBeLessThanOrEqual(cut);
      // level with a finalist: he lost a shoot-off
      if (e.r1 === cut) expect(e.r1Off?.length).toBeGreaterThan(0);
    }
    const [w] = sat.three;
    expect(w.final).toBe(Math.max(...finalists.map((e) => e.final!)));
    if (finalists.filter((e) => e.final === w.final).length > 1) expect(w.finalOff?.length).toBeGreaterThan(0);
    expect(after.players[w.pid].awards).toContainEqual({ season: after.season, type: 'Three-Point Contest' });
    const news = after.news.find((n) => n.kind === 'award' && n.text.includes('wins the Three-Point Contest'))!;
    expect(news.text.startsWith(w.name)).toBe(true);
    expect(news.text).toContain(`${w.final}`);
  });

  it('Slam Dunk Contest: 30-50 a dunk with its name, two a round, the top two in the final, the winner with the best final and the award', () => {
    for (const e of sat.dunk) {
      expect(e.r1).toHaveLength(2);
      for (const d of allDunks(e)) {
        expect(Number.isInteger(d.score) && d.score >= 30 && d.score <= 50).toBe(true);
        expect(d.text.length).toBeGreaterThan(3);
        // one he couldn't finish scores low
        if (d.miss) expect(d.score).toBeLessThanOrEqual(36);
      }
    }
    const finalists = sat.dunk.slice(0, DUNK_FINALISTS);
    expect(finalists.every((e) => e.final?.length === 2)).toBe(true);
    expect(sat.dunk.slice(DUNK_FINALISTS).every((e) => e.final === undefined)).toBe(true);
    const cut = Math.min(...finalists.map((e) => total(e.r1)));
    for (const e of sat.dunk.slice(DUNK_FINALISTS)) expect(total(e.r1)).toBeLessThanOrEqual(cut);
    const [w, second] = sat.dunk;
    expect(total(w.final)).toBeGreaterThanOrEqual(total(second.final));
    if (total(w.final) === total(second.final)) expect(w.finalOff?.length).toBeGreaterThan(0);
    expect(after.players[w.pid].awards).toContainEqual({ season: after.season, type: 'Slam Dunk Contest' });
    const news = after.news.find((n) => n.kind === 'award' && n.text.includes('wins the Slam Dunk Contest'))!;
    expect(news.text.startsWith(w.name)).toBe(true);
    expect(news.text).toMatch(/with a \d\d for /);
  });

  it('only the two winners get a contest award, and the user hears about his players in one message', () => {
    const won = Object.values(after.players).flatMap((p) => p.awards.filter((a) => a.season === after.season && a.type.endsWith('Contest')).map(() => p.pid));
    expect(won.sort()).toEqual([sat.three[0].pid, sat.dunk[0].pid].sort());
    const mine = [...sat.three, ...sat.dunk].filter((e) => before.players[e.pid].tid === after.userTid);
    const mail = after.inbox.filter((m) => m.subject === 'All-Star Saturday' && m.season === after.season);
    expect(mail).toHaveLength(mine.length ? 1 : 0);
    for (const e of mine) expect(mail[0].body).toContain(e.name);
  });
});

describe('its own random stream', () => {
  it('the same league gets the same Saturday whatever state the league stream is in, and leaves it where it was', () => {
    const a = structuredClone(before);
    const b = structuredClone(before);
    b.rng = (b.rng ^ 0x5bd1e995) >>> 0;
    for (const l of [a, b]) {
      selectAllStars(l);
      // as the day does: knocks short enough to keep an All-Star his place heal over the break
      for (const p of Object.values(l.players)) if (p.tid >= 0 && p.injury && !missesAllStarGame(p)) p.injury = null;
    }
    const rng = a.rng;
    allStarSaturday(a);
    expect(a.rng).toBe(rng);
    allStarSaturday(b);
    expect(awardsOf(b).saturday).toEqual(awardsOf(a).saturday);
    // and it's the Saturday the day itself held
    expect(awardsOf(a).saturday).toEqual(sat);
  });

  it('the All-Star Game and the league stream after the day are what they would be without it', () => {
    const without = structuredClone(before);
    let aw = without.awards.find((a) => a.season === without.season);
    if (!aw) {
      aw = { season: without.season, allNba: [], allDefense: [], allRookie: [], allStars: { E: [], W: [] } };
      without.awards.push(aw);
    }
    // a Saturday already held is never held again
    aw.saturday = { three: [], dunk: [] };
    simDay(without);
    expect(without.rng).toBe(after.rng);
    expect(awardsOf(without).allStarMvp).toBe(awardsOf(after).allStarMvp);
    expect(Object.values(without.players).some((p) => p.awards.some((a) => a.type.endsWith('Contest')))).toBe(false);
  });
});

describe('saves and honours', () => {
  it('an intact Saturday survives a load; a damaged one is dropped and the rest of the awards stay', () => {
    expect(awardsOf(migrate(structuredClone(after))).saturday).toEqual(sat);
    const damage: ((s: SeasonAwards['saturday'] & object) => void)[] = [
      (s) => (s.three[0].r1 = 41),
      (s) => ((s.dunk[0].r1[0] as unknown as { score: string }).score = 'x'),
      (s) => ((s.dunk[1] as unknown as { r1: unknown }).r1 = null),
      (s) => (s.three[2].tid = 999),
      (s) => (s.dunk.push(...s.dunk.slice(0, 1)), s.dunk.push(...s.dunk.slice(0, 1))),
    ];
    for (const f of damage) {
      const x = structuredClone(after);
      f(awardsOf(x).saturday!);
      const back = awardsOf(migrate(x));
      expect(back.saturday).toBeUndefined();
      expect(back.allStars).toEqual(awardsOf(after).allStars);
    }
    const junk = structuredClone(after);
    (awardsOf(junk) as unknown as { saturday: unknown }).saturday = 'junk';
    expect(awardsOf(migrate(junk)).saturday).toBeUndefined();
  });

  it('a contest win is a token among the honours: nothing toward the Hall of Fame, a quarter point in the rankings, a chip after All-Star MVP', () => {
    const p = structuredClone(after.players[sat.three[0].pid]);
    const base = { hof: hallOfFameScore(after, p), acc: accoladeScore(p) };
    for (let i = 0; i < 3; i++) p.awards.push({ season: after.season + i, type: 'Three-Point Contest' }, { season: after.season + i, type: 'Slam Dunk Contest' });
    expect(hallOfFameScore(after, p)).toBe(base.hof);
    expect(accoladeScore(p)).toBeCloseTo(base.acc + 1.5);
    const chips = accolades({ ...p, awards: [...p.awards, { season: 1, type: 'All-Star MVP' }] }).map((a) => a.label);
    expect(chips.indexOf('3-Point Contest')).toBe(chips.indexOf('All-Star MVP') + 1);
    expect(chips).toContain('Dunk Contest');
  });
});

describe('calibration', () => {
  // the fields this league invites at its break, as in the contests' calibration notes
  const l = structuredClone(before);
  selectAllStars(l);
  const shooters = threeField(l).map((p) => threeSkill(p, l.season));
  const dunkers = dunkField(l);
  const q = dunkSkills(l, dunkers);
  const N = 3000;

  it('Three-Point Contest: first rounds average about 21, the winning final 24-29', () => {
    const rng = new Rng(2027);
    let r1 = 0;
    let won = 0;
    for (let i = 0; i < N; i++) {
      const res = threePointContest(
        rng,
        shooters.map((skill, pid) => ({ entry: { pid, name: '', tid: 0, r1: 0 }, skill })),
      );
      r1 += res.reduce((a, e) => a + e.r1, 0) / res.length;
      won += res[0].final!;
      expect(res.every((e) => e.r1 >= 0 && e.r1 <= 40)).toBe(true);
    }
    expect(r1 / N).toBeGreaterThan(18);
    expect(r1 / N).toBeLessThan(23);
    expect(won / N).toBeGreaterThan(24);
    expect(won / N).toBeLessThan(29);
  });

  it('Slam Dunk Contest: a finished dunk averages in the 40s, about one in ten missed, the winning final near 90', () => {
    const rng = new Rng(2027);
    const made: number[] = [];
    let missed = 0;
    let won = 0;
    for (let i = 0; i < N; i++) {
      const res = slamDunkContest(
        rng,
        dunkers.map((_, pid) => ({ entry: { pid, name: '', tid: 0, r1: [] }, q: q[pid] })),
      );
      for (const d of res.flatMap(allDunks)) {
        expect(d.score >= 30 && d.score <= 50).toBe(true);
        if (d.miss) missed++;
        else made.push(d.score);
      }
      won += total(res[0].final);
    }
    const mean = made.reduce((a, b) => a + b, 0) / made.length;
    expect(mean).toBeGreaterThan(41);
    expect(mean).toBeLessThan(47);
    expect(missed / (missed + made.length)).toBeGreaterThan(0.05);
    expect(missed / (missed + made.length)).toBeLessThan(0.16);
    expect(won / N).toBeGreaterThan(85);
    expect(won / N).toBeLessThan(96);
  });
});
