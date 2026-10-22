import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProjection, parseProjection, projectionNote } from '../epm-projection';
import { deriveRatings, popStats, type Agg } from '../derive';
import { VALUE_BAND, valueStep, valueWeights } from '../calibrate';
import { rapm } from '../value';
import { hashInputs, pinInputs } from '../inputs';
import type { PbpAgg } from '../nba/profile';
import { composites, emptyRatings } from '../../../src/core/ratings';
import { Rng } from '../../../src/core/random';
import { K, type Stint } from '../../../src/core/sim/engine';

const HEAD =
  'season,nba_id,name,team,p_mpg,p_usg,oepm,depm,epm,p_pts_100,p_tspct,p_fg2a_100,p_fg2pct,p_fg3a_100,p_fg3pct,p_fta_100,p_ftpct,p_orb_100,p_drb_100,p_ast_100,p_tov_100,p_stl_100,p_blk_100';
const row = (season: number, id: number | '', name: string, team: string, off: number, def: number) =>
  `${season},${id},"${name}","${team}",30.5,0.25,${off},${def},${off + def},28,0.6,15,0.55,8,0.37,7,0.8,1.5,6,6,3,1.5,0.8`;

const base = (): Agg => ({
  wMin: 2400,
  rawMin: 2400,
  games: 70,
  mpg: 30,
  per36: { fga: 15, fg3a: 6, fg3: 2.2, fg2a: 9, fg2: 4.8, fta: 4, ft: 3.2, orb: 1, drb: 5, ast: 4, stl: 1.1, blk: 0.6, tov: 2, pf: 2.5, pts: 18 },
  fg3Pct: 0.36,
  fg2Pct: 0.53,
  ftPct: 0.8,
  adv: { usg: 21, ast: 16, orb: 4, drb: 15, stl: 1.6, blk: 1.4, tov: 11, obpm: 0.5, dbpm: 0, bpm: 0.5, ts: 0.58, ws48: 0.1, vorp: 1 },
  lastAge: 26,
  pos: 'SF',
});
// a population spread in box plus-minus
const pop = popStats(
  Array.from({ length: 40 }, (_, i) => {
    const a = base();
    a.adv = { ...a.adv, obpm: ((i * 7) % 9) - 4, dbpm: ((i * 3) % 5) - 2 };
    return a;
  }),
);
const bio = { heightIn: 79, weightLb: 220, age: 26, pos: 'SF' };

// a player with an NBA.com play-by-play profile and its RAPM
const zone = (rim: number, paint: number, mid: number, c3: number, ab3: number) => ({ rim, paint, mid, c3, ab3 });
const pbp = (i = 0): PbpAgg => ({
  nbaId: 1,
  mins: 2400,
  fga: zone(300, 120, 90, 80, 250),
  fgm: zone(200, 52, 38, 30, 88),
  astFgm: 240,
  pullup: 100,
  pullup3: 40,
  drive: 150,
  cut: 40,
  putback: 20,
  post: 20,
  trans: 70,
  dunk: 30,
  lob: 10,
  fta: 220,
  sfDrawn: 120,
  ast: 200,
  astRim: 80,
  ast3: 70,
  tov: 100,
  tovBadPass: 40,
  tovLostBall: 30,
  orb: 60,
  drb: 260,
  orbChances: 1400,
  drbChances: 1500,
  stl: 60,
  blk: 40,
  blkRim: 25,
  pf: 150,
  chargesDrawn: 3,
  offPoss: 4800,
  defPoss: 4800,
  oppFga: 3800,
  oppRimA: 1100 + (i % 4) * 40,
  oppRimM: 700,
  teamFga: 3800,
  mdSaved: ((i * 3) % 5) - 2,
  mdPoss: 1500,
  rapmO: ((i * 7) % 9) / 3 - 1.3,
  rapmD: ((i * 2) % 5) / 3 - 0.7,
  rapmPoss: 9000,
});
const withPbp = (i = 0): Agg => ({ ...base(), pbp: pbp(i) });
const pbpPop = popStats(Array.from({ length: 40 }, (_, i) => withPbp(i)));

describe('Dunks & Threes EPM projection as the value target', () => {
  it('reads the projection or fails, fits simulated on-court value, steps only the value skills, and pins the inputs', () => {
    // a row per player with its projected box line
    const parsed = parseProjection([HEAD, row(2027, 1628983, 'Shai Gilgeous-Alexander', 'OKC', 7.57, 1.36), row(2027, '', 'No Id', 'OKC', 1, 1)].join('\n'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ nbaId: 1628983, team: 'OKC', season: 2027, mpg: 30.5, usg: 0.25, off: 7.57, def: 1.36 });
    expect(parsed[0].tot).toBeCloseTo(8.93);
    expect(parsed[0].box).toMatchObject({ pts: 28, fg3a: 8, fg3pct: 0.37, ftpct: 0.8, blk: 0.8, tspct: 0.6 });
    // a season export isn't a projection
    expect(() => parseProjection('season,age,seasontype,player_id\n2026,27,2,1')).toThrow(/not a Dunks & Threes EPM projection/);

    // the seed season's rows load from every file, the later file winning a player listed twice
    const dir = mkdtempSync(join(tmpdir(), 'hc-proj-'));
    writeFileSync(join(dir, 'a.csv'), [HEAD, row(2027, 1, 'A One', 'BOS', 1, 0), row(2026, 2, 'B Two', 'BOS', 1, 0)].join('\n'));
    writeFileSync(join(dir, 'b.csv'), [HEAD, row(2027, 1, 'A One', 'BOS', 3, 0)].join('\n'));
    const log: string[] = [];
    expect(loadProjection(2027, dir, (m) => log.push(m)).map((r) => [r.nbaId, r.off])).toEqual([[1, 3]]);
    expect(log.join('\n')).toMatch(/ignored 1 rows for other seasons/);
    // no projection, or none for the season, fails the build
    expect(() => loadProjection(2027, join(dir, 'missing'), () => {})).toThrow(/No Dunks & Threes EPM projection for 2027/);
    expect(() => loadProjection(2028, dir, () => {})).toThrow(/a\.csv, b\.csv: 3 rows for other seasons/);
    expect(projectionNote(2027)).toBe('Dunks & Threes 2026-27 EPM projection');

    // simulated RAPM recovers each player's value at each end from stints of five against five,
    // teammates and opponents adjusted for
    const rng = new Rng(3);
    const truth = Array.from({ length: 30 }, (_, i) => ({ off: ((i * 7) % 11) / 2 - 2.5, def: ((i * 5) % 9) / 2 - 2 }));
    const stints: Stint[] = [];
    for (let g = 0; g < 4000; g++) {
      const pids = [...Array(30).keys()].sort(() => rng.next() - 0.5).slice(0, 10);
      const [off, def] = [pids.slice(0, 5), pids.slice(5)];
      const ppp = 112 + off.reduce((a, p) => a + truth[p].off, 0) - def.reduce((a, p) => a + truth[p].def, 0);
      stints.push({ off, def, poss: 20, pts: (ppp * 20) / 100 });
    }
    const fit = rapm([{ stints, w: 1 }], 1);
    // (relative to the league's rate: the intercept takes the mean)
    const mean = (f: (pid: number) => number) => truth.reduce((a, _, pid) => a + f(pid), 0) / truth.length;
    const centred = (f: (pid: number) => number) => (pid: number) => f(pid) - mean(f);
    for (const k of ['off', 'def'] as const) {
      const [fitted, real] = [centred((pid) => fit.get(pid)![k]), centred((pid) => truth[pid][k])];
      for (const pid of truth.keys()) expect(fitted(pid) - real(pid)).toBeCloseTo(0, 1);
    }
    // an older batch counts for less: a player's value follows the newer one
    const later = stints.map((s) => ({ ...s, pts: s.pts + (s.off.includes(0) ? 0.4 : 0) }));
    expect(
      rapm(
        [
          { stints, w: 0.1 },
          { stints: later, w: 1 },
        ],
        1,
      ).get(0)!.off - truth[0].off,
    ).toBeGreaterThan(1.5);

    // a value miss on defense goes where he defends: a wing's on the perimeter, a big's inside
    const wing = { ...emptyRatings(), hnd: 70, pas: 40, perD: 65, spd: 70, stl: 60, intD: 40, blk: 35, hgt: 40 };
    const big = { ...emptyRatings(), hnd: 35, pas: 75, perD: 40, spd: 35, stl: 40, intD: 75, blk: 80, hgt: 85 };
    const ww = valueWeights(wing);
    const bw = valueWeights(big);
    expect(ww.defW.perD!).toBeGreaterThan(ww.defW.intD!);
    expect(bw.defW.intD!).toBeGreaterThan(bw.defW.perD!);
    expect(bw.defW.blk!).toBeGreaterThan(ww.defW.blk!);
    // a value step lifts his feel and defense by the miss and moves no skill his real line pins but
    // the scoring ones that give back what feel adds to his own scoring
    const before = { ...wing, ins: 60, mid: 60, tp: 60 };
    const after = { ...before };
    valueStep(after, { ...ww, from: before }, { off: 1, def: 0.5 }, 0.5);
    expect(after.oiq).toBeGreaterThan(before.oiq + 3);
    expect(after.diq).toBeGreaterThan(before.diq + 2);
    // (his make rate in each zone: the skill composite it reads, and his share of the five's feel)
    const [c0, c1] = [composites(before), composites(after)];
    const feel = ((0.6 * (after.oiq - before.oiq)) / 5 / 50) * K.feel;
    const zones = [
      ['rim', 'rim'],
      ['close', 'paint'],
      ['midShot', 'mid'],
      ['c3', 'c3'],
      ['pu3', 'ab3'],
    ] as const;
    for (const [c, zone] of zones) expect(Math.abs(((c1[c] - c0[c]) / 50) * K.zoneSkill[zone] + feel)).toBeLessThan(0.002);
    for (const k of ['create', 'pnrHandle'] as const) expect(Math.abs(c1[k] - c0[k])).toBeLessThan(0.25);
    expect(c1.passing).toBeGreaterThan(c0.passing);
    for (const k of ['pas', 'ft', 'drw', 'post', 'oreb', 'dreb', 'stl', 'hgt', 'spd', 'ath', 'str'] as const) expect(after[k]).toBe(before[k]);
    // however far the engine is from his projection, value moves a skill no further than the band around his evidence
    for (let i = 0; i < 20; i++) valueStep(after, { ...ww, from: before }, { off: 5, def: -5 }, 1);
    expect(after.oiq).toBeCloseTo(before.oiq + VALUE_BAND, 5);
    expect(after.diq).toBeCloseTo(before.diq - VALUE_BAND, 5);

    // impact ratings start from the evidence alone: box plus-minus without a play-by-play profile
    const none = deriveRatings(base(), bio, pop, 'x').r;
    const better = base();
    better.adv = { ...better.adv, obpm: 3, dbpm: 1.5 };
    const boxed = deriveRatings(better, bio, pop, 'x').r;
    expect(boxed.oiq).toBeGreaterThan(none.oiq + 5);
    expect(boxed.diq).toBeGreaterThan(none.diq + 2);
    // with one, RAPM moves the four impact ratings and nothing else
    const keys = ['oiq', 'diq', 'perD', 'intD'] as const;
    const good = withPbp();
    good.pbp = { ...good.pbp!, rapmO: 2, rapmD: 1.5 };
    const poor = withPbp();
    poor.pbp = { ...poor.pbp!, rapmO: -2, rapmD: -1.5 };
    const [gr, pr] = [deriveRatings(good, bio, pbpPop, 'x').r, deriveRatings(poor, bio, pbpPop, 'x').r];
    for (const k of keys) expect(gr[k]).toBeGreaterThan(pr[k]);
    for (const k of Object.keys(gr) as (keyof typeof gr)[]) if (!(keys as readonly string[]).includes(k)) expect(gr[k]).toBe(pr[k]);

    // the inputs are pinned by content: a build from other files fails, naming them
    const raw = mkdtempSync(join(tmpdir(), 'hc-raw-'));
    mkdirSync(join(raw, 'nba'));
    writeFileSync(join(raw, 'per_game_2026.html'), 'a');
    writeFileSync(join(raw, 'nba', 'cdnnba_2025.tar.xz'), 'b');
    // (the build's own caches next to them aren't inputs)
    writeFileSync(join(raw, 'nba', 'pbp_2026.json'), 'cache');
    const roots = { raw, nba: join(raw, 'nba'), projection: dir };
    expect(Object.keys(hashInputs(roots))).toEqual(['nba/cdnnba_2025.tar.xz', 'projection/a.csv', 'projection/b.csv', 'raw/per_game_2026.html']);
    const lockPath = join(mkdtempSync(join(tmpdir(), 'hc-lock-')), 'seed-inputs.json');
    expect(() => pinInputs(roots, 2027, { update: false, today: () => '2026-10-22', lockPath })).toThrow(/No input lock/);
    const pinned = pinInputs(roots, 2027, { update: true, today: () => '2026-10-22', lockPath });
    const again = pinInputs(roots, 2027, { update: false, today: () => 'never', lockPath });
    expect([again.pinned, again.id]).toEqual(['2026-10-22', pinned.id]);
    writeFileSync(join(raw, 'nba', 'pbp_2026.json'), 'rebuilt cache');
    expect(pinInputs(roots, 2027, { update: false, today: () => 'never', lockPath }).id).toBe(pinned.id);
    writeFileSync(join(raw, 'per_game_2026.html'), 'refetched');
    writeFileSync(join(dir, 'c.csv'), HEAD);
    expect(() => pinInputs(roots, 2027, { update: false, today: () => 'never', lockPath })).toThrow(
      /changed \(1\): raw\/per_game_2026\.html[\s\S]*added \(1\): projection\/c\.csv/,
    );
    expect(() => pinInputs(roots, 2028, { update: false, today: () => 'never', lockPath })).toThrow(/pinned for season 2027/);
  });
});
