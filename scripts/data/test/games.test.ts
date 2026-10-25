// The seed's game files and value target: box scores and play-by-play read into lines, shots by zone,
// games started and stints; each player's impact (RAPM toward a box-score prior, aged); simulated
// on-court value and the calibration's value step; and the inputs pinned by content.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveRatings, popStats, type Agg } from '../derive';
import { VALUE_BAND, valueStep, valueWeights } from '../calibrate';
import { rapm } from '../value';
import { hashInputs, pinInputs } from '../inputs';
import type { PbpAgg } from '../nba/profile';
import { shotZone, zoneOf, newSeason, type SeasonPbp } from '../nba/pbp';
import { gameOf, lineKey } from '../games/sources';
import { readBoxScores, type BoxLine } from '../games/boxscores';
import { PBP_COLUMNS, readPlayByPlay, whoCameOn } from '../games/playbyplay';
import { agedImpact, agingStep, estimateImpact } from '../games/impact';
import { seedLine } from '../games/lines';
import { composites, emptyRatings } from '../../../src/core/ratings';
import { Rng } from '../../../src/core/random';
import { BBREF_TO_TID } from '../../../src/core/teams';
import { K, type Stint } from '../../../src/core/sim/engine';

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

const OKC = 1610612760;
const HOU = 1610612745;
const BOX_HEAD =
  'firstName,lastName,personId,gameId,gameDateTimeEst,gameType,playerteamId,playerteamCity,playerteamName,opponentteamId,opponentteamCity,opponentteamName,comment,startingPosition,numMinutes,points,assists,reboundsTotal,reboundsOffensive,reboundsDefensive,fieldGoalsMade,fieldGoalsAttempted,threePointersMade,threePointersAttempted,freeThrowsMade,freeThrowsAttempted,steals,blocks,turnovers,foulsPersonal,plusMinusPoints,offensiveRating,defensiveRating,possessions,percentTeamFieldGoalsAttempted,percentTeamFreeThrowsAttempted,percentTeamTurnovers';
/** A box-score row: Shai's game (team ids empty when `byName`, as 2021-22's rows have them). */
const boxRow = (game: number, date: string, o: { pts: number; min?: string; starter?: boolean; byName?: boolean; fga?: number; poss?: number; pm?: number }) =>
  [
    'Shai',
    'Gilgeous-Alexander',
    1628983,
    game,
    `${date} 20:00:00`,
    'x',
    o.byName ? '' : OKC,
    'Oklahoma City',
    'Thunder',
    o.byName ? '' : HOU,
    'Houston',
    'Rockets',
    '',
    o.starter ? 'G' : '',
    o.min ?? '35.0',
    o.pts,
    6,
    5,
    1,
    4,
    10,
    o.fga ?? 20,
    2,
    6,
    8,
    10,
    2,
    1,
    2,
    2,
    o.pm ?? 10,
    120,
    100,
    o.poss ?? 70,
    o.fga === 0 ? 0 : 0.25,
    0.4,
    0.2,
  ].join(',');

/** A play-by-play row with the columns the reader takes (the rest empty). */
const pbpRow = (v: Partial<Record<(typeof PBP_COLUMNS)[number], string | number>>) => PBP_COLUMNS.map((c) => (v[c] === undefined ? '' : String(v[c]))).join(',');

describe('the game files and the value target', () => {
  it('reads box scores and play-by-play into lines, shots, starts and stints, estimates impact, fits simulated value, steps only the value skills, and pins the inputs', async () => {
    // game ids: type, the year the season started, the game; the play-in counts with the playoffs
    expect(gameOf('0022500001')).toEqual({ season: 2026, part: 'reg' });
    expect(gameOf(49700101)).toEqual({ season: 1998, part: 'post' });
    expect(gameOf(52500101)).toEqual({ season: 2026, part: 'post' });
    for (const preseasonAllStarCupFinal of [12500001, 32500001, 62500001]) expect(gameOf(preseasonAllStarCupFinal)).toBeNull();

    // shot zones from where a shot was taken: the restricted area (and unlocated tips), the lane, mid-range, corner and above-the-break threes
    expect(zoneOf(0, 0, false)).toBe('rim');
    expect(zoneOf(30, 25, false)).toBe('rim');
    expect(zoneOf(-60, 100, false)).toBe('paint');
    expect(zoneOf(150, 60, false)).toBe('mid');
    expect(zoneOf(-225, 40, true)).toBe('c3');
    expect(zoneOf(100, 230, true)).toBe('ab3');
    // (NBA.com's own label wins where the log has one, an unlocated tip it called mid-range included)
    expect([shotZone('Mid-Range', 0, 0, false), shotZone('Left Corner 3', 100, 230, true), shotZone('', 0, 0, false)]).toEqual(['mid', 'c3', 'rim']);
    // an old-form substitution names who comes on by surname, by initial and surname when a teammate shares it
    const pteam = new Map([
      [1, 10],
      [2, 10],
      [3, 10],
      [4, 20],
    ]);
    const names = new Map([
      [1, 'E. Moore'],
      [2, 'G. Hill'],
      [3, 'S. Hill'],
      [4, 'B. Moore'],
    ]);
    expect(whoCameOn('Moore', 10, pteam, names)).toBe(1);
    expect(whoCameOn('G. Hill', 10, pteam, names)).toBe(2);
    expect(whoCameOn('Hill', 10, pteam, names)).toBeUndefined();

    // box scores: lines by team, season and part, his team's points and usage while he played, the
    // career highs of regular seasons before the new one, teams named by name alone resolved
    const dir = mkdtempSync(join(tmpdir(), 'hc-games-'));
    writeFileSync(
      join(dir, 'PlayerStatisticsExtended.csv'),
      [
        BOX_HEAD,
        boxRow(22500001, '2025-10-21', { pts: 30, starter: true }),
        boxRow(22500050, '2025-11-01', { pts: 55, byName: true, pm: -4 }),
        boxRow(22500060, '2025-11-03', { pts: 12, fga: 0, poss: 40 }),
        boxRow(42500101, '2026-04-19', { pts: 40, starter: true }),
        boxRow(22600001, '2026-10-21', { pts: 60, starter: true }),
        boxRow(12500001, '2025-10-05', { pts: 70 }),
        boxRow(22500070, '2025-11-05', { pts: 0, min: '' }),
        // (an opponent's id is known once a row of its own players names it)
        `Alperen,Sengun,1631167,22500001,2025-10-21 20:00:00,x,${HOU},Houston,Rockets,${OKC},Oklahoma City,Thunder,,C,36.0,20,5,10,2,8,8,15,0,1,4,6,1,1,3,4,-10,100,120,70,0.2,0.3,0.15`,
      ].join('\n'),
    );
    const box = await readBoxScores(2027, { dir, log: () => {} });
    const reg = box.lines.find((l) => l.pid === 1628983 && l.season === 2026 && l.part === 'reg')!;
    expect(reg).toMatchObject({ pid: 1628983, teamId: OKC, gp: 3, gs: 1, pts: 97, pm: 16, poss: 180, ptsFor: 216, ptsAgainst: 180, min: 105, first: 20251021 });
    // (his team's shots with him on: his own over his share, and a night he took none at his rate elsewhere)
    expect(reg.teamFga).toBe(Math.round(160 + 40 * (160 / 140)));
    expect(box.lines.find((l) => l.part === 'post')).toMatchObject({ pid: 1628983, season: 2026, gp: 1, pts: 40 });
    expect(box.lines.some((l) => l.season === 2027)).toBe(false);
    expect(box.highs[1628983].pts).toEqual([55, 2026, 20251101, OKC, HOU]);
    expect(box.people[1628983]).toEqual({ name: 'Shai Gilgeous-Alexander', teams: { 2026: OKC, 2027: OKC } });
    expect(box.teamNames[OKC]).toBe('Oklahoma City Thunder');
    // (two starters flagged over four team games: these box scores don't mark five a side)
    expect(box.startsListed['2026|reg']).toBe(false);

    // minutes: a season written as minutes and seconds ("24.30" is 24:30) reads so; a season of cut-off
    // whole minutes gets back what each team's game falls short of 240, shared by its players
    const mins = mkdtempSync(join(tmpdir(), 'hc-mins-'));
    const minRow = (pid: number, game: number, m: string) => `P,${pid},${pid},${game},2024-11-01 19:00:00,${OKC},Oklahoma City,Thunder,${HOU},Houston,Rockets,${m},10`;
    writeFileSync(
      join(mins, 'PlayerStatisticsExtended.csv'),
      [
        'firstName,lastName,personId,gameId,gameDateTimeEst,playerteamId,playerteamCity,playerteamName,opponentteamId,opponentteamCity,opponentteamName,numMinutes,points',
        ...Array.from({ length: 10 }, (_, i) => minRow(i + 1, 22400001, i < 8 ? '24.30' : '22.00')),
        ...Array.from({ length: 10 }, (_, i) => minRow(i + 1, 20900001, '23')),
      ].join('\n'),
    );
    const minBox = await readBoxScores(2027, { dir: mins, log: () => {} });
    expect(minBox.lines.find((l) => l.pid === 1 && l.season === 2025)!.min).toBe(25);
    expect(minBox.lines.filter((l) => l.season === 2025).reduce((a, l) => a + l.min, 0)).toBe(8 * 25 + 2 * 22);
    expect(minBox.lines.filter((l) => l.season === 2010).map((l) => l.min)).toEqual(Array(10).fill(24));

    // play-by-play: a 2025-26 game in NBA.com's newer form, read in full, and a 2010-11 game in its older form
    const [A, B] = [1610612760, 1610612745];
    const v3 = (order: number, v: Partial<Record<(typeof PBP_COLUMNS)[number], string | number>>) =>
      pbpRow({ gameId: 22500001, period: 1, orderNumber: order, possession: A, scoreHome: 0, scoreAway: 0, ...v });
    const home = [1, 2, 3, 4, 5];
    const away = [11, 12, 13, 14, 15];
    const old = (id: number, v: Partial<Record<(typeof PBP_COLUMNS)[number], string | number>>) => pbpRow({ gameId: 21000001, period: 1, actionId: id, ...v });
    writeFileSync(
      join(dir, 'PlayByPlay.csv'),
      [
        PBP_COLUMNS.join(','),
        v3(1, { clock: 'PT12M00.00S', actionType: 'period', subType: 'start', personId: 0 }),
        ...home.map((p, i) =>
          v3(2 + i, { clock: 'PT11M50.00S', actionType: 'foul', subType: 'personal', personId: p, teamId: A, teamTricode: 'OKC', playerNameI: `H. ${p}`, possession: B }),
        ),
        ...away.map((p, i) =>
          v3(10 + i, { clock: 'PT11M40.00S', actionType: 'rebound', subType: 'defensive', personId: p, teamId: B, teamTricode: 'HOU', playerNameI: `A. ${p}` }),
        ),
        v3(20, {
          clock: 'PT11M00.00S',
          actionType: '2pt',
          subType: 'Layup',
          personId: 1,
          teamId: A,
          teamTricode: 'OKC',
          shotResult: 'Made',
          xLegacy: 5,
          yLegacy: 10,
          scoreHome: 2,
        }),
        v3(21, {
          clock: 'PT10M40.00S',
          actionType: '3pt',
          subType: 'Jump Shot',
          personId: 11,
          teamId: B,
          teamTricode: 'HOU',
          shotResult: 'Missed',
          xLegacy: -225,
          yLegacy: 30,
          possession: B,
          scoreHome: 2,
        }),
        v3(22, { clock: 'PT10M38.00S', actionType: 'rebound', subType: 'defensive', personId: 2, teamId: A, teamTricode: 'OKC', scoreHome: 2 }),
        v3(23, { clock: 'PT10M30.00S', actionType: 'substitution', subType: 'out', personId: 1, teamId: A, teamTricode: 'OKC', scoreHome: 2 }),
        v3(24, { clock: 'PT10M30.00S', actionType: 'substitution', subType: 'in', personId: 6, teamId: A, teamTricode: 'OKC', scoreHome: 2 }),
        // (a row that names the player's team only as his own)
        v3(25, { clock: 'PT10M10.00S', actionType: '3pt', subType: 'Jump Shot', personId: 6, playerteamId: A, shotResult: 'Made', xLegacy: 50, yLegacy: 250, scoreHome: 5 }),
        ...home.map((p, i) => old(i + 1, { actionType: 'Foul', subType: 'Personal', personId: p, teamId: A, playerNameI: `H. P${p}` })),
        old(6, { actionType: 'Substitution', personId: 1, teamId: A, playerNameI: 'H. P1', description: 'SUB: P6 FOR P1' }),
        old(7, {
          actionType: 'Made Shot',
          subType: 'Jump Shot',
          personId: 6,
          teamId: A,
          playerNameI: 'H. P6',
          shotResult: 'Made',
          shotValue: 2,
          xLegacy: 150,
          yLegacy: 60,
          description: "P6 16' Jump Shot",
        }),
        ...away.map((p, i) =>
          old(10 + i, {
            actionType: 'Missed Shot',
            subType: 'Jump Shot',
            personId: p,
            teamId: B,
            playerNameI: `A. P${p}`,
            shotResult: 'Missed',
            shotValue: 3,
            xLegacy: 0,
            yLegacy: 0,
            description: `MISS P${p} 25' 3PT Jump Shot`,
          }),
        ),
      ].join('\n'),
    );
    const pbp = await readPlayByPlay([2026], 2004, 2027, { dir, log: () => {} });
    const line = (pid: number, season: number, team: number) => pbp.lines[lineKey(pid, season, team, 'reg')];
    expect(pbp.starters).toEqual({ whole: 2, games: 2 });
    for (const p of home) expect([line(p, 2026, A)?.gs, line(p, 2011, A)?.gs]).toEqual([1, 1]);
    expect([line(6, 2026, A).gs, line(6, 2011, A).gs]).toEqual([0, 0]);
    expect(line(1, 2026, A).fgm.rim).toBe(1);
    expect(line(11, 2026, B).fga.c3).toBe(1);
    expect(line(6, 2026, A).fgm.ab3).toBe(1);
    expect(line(6, 2011, A).fgm.mid).toBe(1);
    // (an old-form three with no location counts above the break)
    expect(line(11, 2011, B).fga.ab3).toBe(1);
    const full = pbp.full['2026|reg'];
    expect(full.games).toBe(1);
    expect(full.players[6].fgm.ab3).toBe(1);
    expect(full.stints.reduce((a, s) => a + s.pts, 0)).toBe(5);
    expect(pbp.full['2026|post']).toMatchObject({ season: 2026, games: 0 });
    // read again from its cache
    expect(await readPlayByPlay([2026], 2004, 2027, { dir, log: () => {} })).toEqual(pbp);

    // a line as a real season on his record: starts from the play-by-play where the box scores mark none
    const seeded = seedLine(reg, 'OKC', { fga: { ...line(1, 2026, A).fga }, fgm: { ...line(1, 2026, A).fgm }, gs: 3 }, false, undefined);
    expect(seeded).toMatchObject({ season: 2026, tid: BBREF_TO_TID.OKC, real: true, playoffs: false, gs: 3, pm: 16, onPoss: 180, onPtsFor: 216, rimA: 1, rimM: 1 });
    expect(seedLine(reg, 'OKC', undefined, true, undefined).gs).toBe(1);

    // impact: RAPM toward a box-score prior recovers each player's value; a player with a small sample
    // keeps close to what his box line says
    const imp = new Rng(11);
    const worth = Array.from({ length: 40 }, (_, i) => ({ off: ((i * 7) % 11) / 2 - 2.5, def: ((i * 5) % 9) / 2 - 2 }));
    const season: SeasonPbp = newSeason(2026);
    for (let g = 0; g < 6000; g++) {
      const pids = [...Array(40).keys()].sort(() => imp.next() - 0.5).slice(0, 10);
      const [off, def] = [pids.slice(0, 5), pids.slice(5)];
      const ppp = 112 + off.reduce((a, p) => a + worth[p].off, 0) - def.reduce((a, p) => a + worth[p].def, 0);
      season.stints.push({ off, def, home: g % 2 === 0, poss: 25, pts: (ppp * 25) / 100 });
    }
    for (let p = 0; p < 40; p++) season.players[p] = { id: p, offPoss: 18000, defPoss: 18000 } as SeasonPbp['players'][number];
    // (box lines that say something of each player's offense)
    const lines: BoxLine[] = worth.map((t, pid) => ({ ...reg, pid, season: 2026, poss: 18000, pts: Math.round(18000 * (1.1 + t.off / 100)), ast: 2000 + pid * 10 }));
    const { impact } = estimateImpact([season], lines, { weights: { 2026: 1 }, log: () => {} });
    const centre = (f: (p: number) => number) => worth.map((_, p) => f(p) - worth.reduce((a, __, q) => a + f(q), 0) / worth.length);
    for (const k of ['off', 'def'] as const) {
      const [got, want] = [centre((p) => impact.get(p)![k]), centre((p) => worth[p][k])];
      expect(got.reduce((a, g, i) => a + Math.abs(g - want[i]), 0) / got.length).toBeLessThan(0.6);
    }
    expect(impact.get(0)!.center).toBe(2026);
    // aging: the young gain, mostly on offense; past 27 they lose at both ends, faster each year
    expect(agingStep(21).off).toBeGreaterThan(agingStep(21).def);
    expect(agingStep(21).off).toBeGreaterThan(0);
    expect(agingStep(27)).toEqual({ off: 0, def: 0 });
    expect(agingStep(34).off + agingStep(34).def).toBeLessThan(agingStep(30).off + agingStep(30).def);
    const i0 = { off: 1, def: 1, priorOff: 0, priorDef: 0, poss: 9000, center: 2025.5 };
    expect(agedImpact(i0, 2027, 21).off).toBeGreaterThan(1);
    expect(agedImpact(i0, 2027, 35).def).toBeLessThan(1);
    expect(agedImpact({ ...i0, center: 2027 }, 2027, 35)).toEqual({ off: 1, def: 1 });

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
    mkdirSync(join(raw, 'games'));
    writeFileSync(join(raw, 'per_game_2026.html'), 'a');
    writeFileSync(join(raw, 'nba', 'matchups_2025.tar.xz'), 'b');
    writeFileSync(join(raw, 'games', 'PlayByPlay.parquet'), 'c');
    // (the build's own caches next to them aren't inputs)
    writeFileSync(join(raw, 'nba', 'matchups_2026.json'), 'cache');
    writeFileSync(join(raw, 'games', 'cache_box.json'), 'cache');
    const roots = { raw, games: join(raw, 'games'), nba: join(raw, 'nba') };
    expect(Object.keys(hashInputs(roots))).toEqual(['games/PlayByPlay.parquet', 'nba/matchups_2025.tar.xz', 'raw/per_game_2026.html']);
    const lockPath = join(mkdtempSync(join(tmpdir(), 'hc-lock-')), 'seed-inputs.json');
    expect(() => pinInputs(roots, 2027, { update: false, today: () => '2026-10-22', lockPath })).toThrow(/No input lock/);
    const pinned = pinInputs(roots, 2027, { update: true, today: () => '2026-10-22', lockPath });
    const again = pinInputs(roots, 2027, { update: false, today: () => 'never', lockPath });
    expect([again.pinned, again.id]).toEqual(['2026-10-22', pinned.id]);
    writeFileSync(join(raw, 'games', 'cache_box.json'), 'rebuilt cache');
    expect(pinInputs(roots, 2027, { update: false, today: () => 'never', lockPath }).id).toBe(pinned.id);
    writeFileSync(join(raw, 'per_game_2026.html'), 'refetched');
    writeFileSync(join(raw, 'games', 'PlayerStatisticsExtended.csv'), 'new');
    expect(() => pinInputs(roots, 2027, { update: false, today: () => 'never', lockPath })).toThrow(
      /changed \(1\): raw\/per_game_2026\.html[\s\S]*added \(1\): games\/PlayerStatisticsExtended\.csv/,
    );
    expect(() => pinInputs(roots, 2028, { update: false, today: () => 'never', lockPath })).toThrow(/pinned for season 2027/);
  });
});
