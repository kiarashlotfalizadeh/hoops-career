// The real-player seed: ratings that follow each player's projected impact, careers (regular seasons and
// playoffs, career highs), rosters, contracts
// (dead money, the rookie scale, two-way deals), the real mix of positions, sane games, future pick
// ownership and opening-night injuries.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { generateDraftClass } from '../league/draft';
import { simDay, startRegularSeason } from '../league/season';
import { teamPlayers } from '../league/helpers';
import { CAP } from '../constants';
import { RATING_KEYS, inferPos } from '../ratings';
import { BBREF_TO_TID } from '../teams';
import { Rng } from '../random';
import { DRAFT_PROSPECT, FREE_AGENT, POSITIONS, type Pos } from '../types';
import { reputationCheck } from '../../../scripts/data/reputation';

const seed = seedJson as unknown as SeedData;
const real = seed.players.length > 0;
const make = (s: SeedData | null, settings = defaultSettings()) => createLeague({ name: 's', userTid: 0, coachName: 'c', settings, seed: s, rngSeed: 9 });

describe('real-player seed', () => {
  it('rates, rosters and pays the real league as it is, plays sane games, and carries its picks and injuries', () => {
    if (real) {
      // rates the league the way the league rates itself
      {
        const league = createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 5 });
        const players = Object.values(league.players).filter((p) => p.real);
        expect(players.length).toBeGreaterThan(400);
        for (const p of players) for (const k of RATING_KEYS) expect(p.ratings[k]).toBeGreaterThanOrEqual(1);
        const top = [...players]
          .sort((a, b) => b.ovr - a.ovr)
          .slice(0, 10)
          .map((p) => p.bbrefId);
        for (const id of ['jokicni01', 'gilgesh01', 'doncilu01', 'wembavi01']) expect(top).toContain(id);
        // efficient bench bigs no longer outrank stars
        const kessler = players.find((p) => p.bbrefId === 'kesslwa01');
        if (kessler) expect(kessler.ovr).toBeLessThan(88);
        // and the way fans rate it: Curry the best shooter, Giannis at the line, the MVP field on top, role
        // shooters below the stars in OVR and in the market (scripts/data/reputation.ts; real-check prints them)
        expect(
          reputationCheck(structuredClone(league))
            .filter((a) => !a.ok)
            .map((a) => `${a.name}: ${a.detail}`),
        ).toEqual([]);
        // a seed built with each player's projected impact carries it: each player is calibrated to be worth on
        // the floor what it says (scripts/data/calibrate.ts), so his ratings, and the OVR they add up to, follow it
        const projected = players.filter((p) => p.proj && p.proj.mpg >= 15);
        if (projected.length) {
          expect(projected.length).toBeGreaterThan(250);
          expect(projected.every((p) => p.proj!.season === league.season)).toBe(true);
          const x = projected.map((p) => p.ovr);
          const y = projected.map((p) => p.proj!.tot!);
          const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
          const [mx, my] = [mean(x), mean(y)];
          const r = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
          // (0.80 in the committed build: the engine can't value every role player as his lineups did, see VALUE_BAND)
          expect(r).toBeGreaterThan(0.78);
        }
        // careers: experience never contradicts the seasons on record; an undrafted veteran with no entry class on
        // record who was already playing when the record begins isn't a third-year player (one whose class is known
        // counts from it: Gillespie, Tshiebwe and Spencer came in for 2023-24); undrafted rookies are rookies; a seed
        // without LeBron's draft has it unknown
        const firstRecord = Math.min(...players.flatMap((p) => p.stats.filter((s) => s.real).map((s) => s.season)));
        for (const p of players) {
          const seasons = [...new Set(p.stats.filter((s) => s.real && s.gp > 0).map((s) => s.season))];
          expect(p.experience).toBeGreaterThanOrEqual(seasons.length);
          if (!p.draft.round && !p.draft.year && p.tid >= 0 && league.season - p.bornYear >= 27 && p.experience <= 3) expect(Math.min(...seasons)).toBeGreaterThan(firstRecord);
          if (p.draft.round === 2) expect(p.draft.pick).toBeLessThanOrEqual(30);
        }
        const vanVleet = players.find((p) => p.bbrefId === 'vanvlfr01');
        if (vanVleet) expect(vanVleet.experience).toBeGreaterThanOrEqual(8);
        const lebron = players.find((p) => p.bbrefId === 'jamesle01');
        if (lebron && !lebron.draft.round) {
          expect(lebron.experience).toBeGreaterThanOrEqual(15);
          expect(lebron.draft.year).toBe(0);
        }
        // a seed from the game files carries every real season's box-score line: playoffs too, with plus-minus,
        // on-court points and starts; and each real player's career highs from every game he had played
        if (league.realHighs) {
          const sga = players.find((p) => p.bbrefId === 'gilgesh01')!;
          const last = sga.stats.filter((s) => s.real && s.season === league.season - 1);
          expect(last.map((s) => s.playoffs)).toEqual([false, true]);
          for (const s of last) {
            expect(s.pm).not.toBe(0);
            expect(s.onPoss).toBeGreaterThan(s.gp * 40);
            expect(s.onPtsFor).toBeGreaterThan(s.onPtsAgainst);
            expect(s.gs).toBe(s.gp);
            expect(s.rimA).toBeGreaterThan(0);
          }
          expect(sga.highs?.pts?.[0]).toBeGreaterThanOrEqual(55);
          // (a real high has no game in this league to open)
          expect(sga.highs?.pts?.[4]).toBe(-1);
          expect(players.filter((p) => p.highs?.pts).length).toBeGreaterThan(400);
          expect(players.filter((p) => p.stats.some((s) => s.real && s.playoffs)).length).toBeGreaterThan(250);
          // starts come from the play-by-play where the box scores mark none (2003-04 to 2016-17, 2021-22)
          const lebron = players.find((p) => p.bbrefId === 'jamesle01');
          if (lebron) expect(lebron.stats.find((s) => s.real && s.season === 2010 && !s.playoffs)?.gs).toBeGreaterThan(70);
        }
        const undraftedRookies = players.filter((p) => !p.draft.round && !p.stats.some((s) => s.real && s.gp > 0) && league.season - p.bornYear <= 25);
        expect(undraftedRookies.length).toBeGreaterThan(0);
        for (const p of undraftedRookies) expect([p.experience, p.draft.year]).toEqual([0, league.season - 1]);
        // AI teams make preseason cuts (two-way contracts don't count); every roster can field a team
        for (const t of league.teams) {
          const roster = teamPlayers(league, t.tid);
          expect(roster.length).toBeGreaterThanOrEqual(CAP.rosterMin);
          if (t.tid !== league.userTid) expect(roster.filter((p) => !p.contract.twoWay).length).toBeLessThanOrEqual(CAP.rosterMax);
        }
      }

      // plays real-player games with sane box scores
      {
        const league = createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 6 });
        for (const p of teamPlayers(league, 0)
          .sort((a, b) => a.ovr - b.ovr)
          .slice(0, Math.max(0, teamPlayers(league, 0).length - CAP.rosterMax)))
          p.tid = FREE_AGENT;
        expect(startRegularSeason(league)).toEqual([]);
        for (let d = 0; d < 20; d++) simDay(league);
        const games = league.games.filter((g) => g.type === 'regular');
        expect(games.length).toBeGreaterThan(100);
        const avg = games.reduce((a, g) => a + g.home.pts + g.away.pts, 0) / (games.length * 2);
        expect(avg).toBeGreaterThan(100);
        expect(avg).toBeLessThan(130);
      }

      // without preseason cuts
      {
        const league = createLeague({ name: 's', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 5, preseasonCuts: false });
        const byId = new Map(Object.values(league.players).map((p) => [p.bbrefId, p]));
        // keeps waived players' leftover pay as dead money, not as players on the roster: the contracts table
        // lists them under the team still paying them, below any playing contract
        const waived = seed.players.filter((sp) => sp.team && sp.contract && !sp.contract.twoWay && sp.contract.salaries[0] < CAP.minContract);
        expect(waived.length).toBeGreaterThan(0);
        for (const sp of waived) {
          const p = byId.get(sp.id);
          // a free agent if he played in the three seasons the seed rates players by, else not in the
          // league (Rubio retired in 2024: his career on record goes back further)
          if (sp.stats.some((s) => s.gp > 0 && s.season >= seed.season - 3)) expect(p?.tid).toBe(FREE_AGENT);
          else expect(p).toBeUndefined();
          expect(league.teams[BBREF_TO_TID[sp.team!]].deadMoney).toContainEqual(
            expect.objectContaining({ name: `${sp.first} ${sp.last}`, season: league.season, amount: sp.contract!.salaries[0] }),
          );
        }
        for (const p of Object.values(league.players)) if (p.tid >= 0 && !p.contract.twoWay) expect(p.contract.salaries[0]).toBeGreaterThanOrEqual(CAP.minContract);

        // puts first-round picks still on their first deal on the rookie scale: the last two classes' first-rounders
        const recent = seed.players.filter((sp) => sp.draft?.round === 1 && sp.draft.year >= league.season - 2 && sp.contract && !sp.contract.twoWay);
        expect(recent.length).toBeGreaterThan(40);
        for (const sp of recent) expect(byId.get(sp.id)!.contract.rookie).toBe(true);
        // so is a third-year pick (Castle's deal runs through next season, the team's option year)
        const castle = byId.get('castlst01');
        if (castle) expect(castle.contract).toMatchObject({ rookie: true, option: 'team' });
        // a first-rounder waived onto a minimum deal, second-rounders and veterans past their four years aren't
        const bufkin = byId.get('bufkiko01');
        if (bufkin) expect(bufkin.contract.rookie).toBeUndefined();
        for (const p of Object.values(league.players)) if (p.contract.rookie) expect([p.draft.round, league.season - 1 - p.draft.year < 4]).toEqual([1, true]);

        // gives generated players the real league's mix of positions: from size and handling, which agree with the
        // real players' box-score positions more often than not (0.57 in the committed build: the value calibration
        // lifts many wings' feel, which reads bigger)
        expect(seed.players.filter((sp) => inferPos(sp.ratings) === sp.pos).length / seed.players.length).toBeGreaterThan(0.55);
        // draft classes come out in the real shares (they had 10% power forwards and 12% centers, so a long
        // career ran out of bigs)
        const rng = new Rng(3);
        for (let y = 1; y <= 10; y++) generateDraftClass(league, league.season + y, rng);
        const share = (pos: Pos[]) => POSITIONS.map((k) => pos.filter((x) => x === k).length / pos.length);
        const realShare = share(seed.players.map((sp) => sp.pos));
        const drafted = share(Object.values(league.players).flatMap((p) => (p.tid === DRAFT_PROSPECT ? [p.pos] : [])));
        drafted.forEach((x, i) => expect(Math.abs(x - realShare[i])).toBeLessThan(0.04));
      }
    }

    const league = make(seed);
    // real future pick ownership: exactly one owner for every pick through the last seeded draft
    if (seed.picks) {
      const through = seed.picksThrough!;
      for (let season = league.season; season <= through; season++) {
        for (const round of [1, 2]) {
          for (const t of league.teams) {
            expect(league.draftPicks.filter((d) => d.season === season && d.round === round && d.originalTid === t.tid)).toHaveLength(1);
          }
        }
      }
      for (const sp of seed.picks) {
        const orig = league.teams.findIndex(
          (t) =>
            t.abbrev === sp.original ||
            (sp.original === 'BRK' && t.abbrev === 'BKN') ||
            (sp.original === 'CHO' && t.abbrev === 'CHA') ||
            (sp.original === 'PHO' && t.abbrev === 'PHX'),
        );
        const dp = league.draftPicks.find((d) => d.season === sp.season && d.round === sp.round && d.originalTid === orig)!;
        expect(dp.tid).not.toBe(-1);
        expect(dp.protection).toBe(sp.protection);
      }
      // trades happened: some teams hold several extra first-rounders, some have none in a year
      const firsts = league.teams.map((t) => league.draftPicks.filter((d) => d.round === 1 && d.season <= league.season + 5 && d.tid === t.tid).length);
      expect(Math.max(...firsts)).toBeGreaterThanOrEqual(8);
      expect(Math.min(...firsts)).toBeLessThanOrEqual(4);
    }
    // fictional leagues keep their own picks
    expect(make(null).draftPicks.every((d) => d.tid === d.originalTid && !d.protection)).toBe(true);

    // starts listed players injured, counted in their team games
    if (seed.players.some((p) => p.injury)) {
      const hurt = Object.values(league.players).filter((p) => p.injury);
      const listed = seed.players.filter((p) => p.injury && p.team);
      expect(hurt.length).toBeGreaterThan(0);
      expect(hurt.length).toBeLessThanOrEqual(listed.length);
      for (const p of hurt) expect(p.injury!.gamesRemaining).toBeGreaterThan(0);
      // back after the Cup's knockout window: his team's two games there count too
      const cup = league.cup;
      const byId = new Map(seed.players.map((sp) => [sp.id, sp]));
      const late = hurt.filter((p) => {
        const back = byId.get(p.bbrefId!)?.injury?.returnDay;
        return cup && back != null && back >= cup.finalDay && back <= league.regularSeasonDays && p.tid >= 0;
      });
      if (cup) expect(late.length).toBeGreaterThan(0);
      for (const p of late) {
        const back = byId.get(p.bbrefId!)!.injury!.returnDay!;
        const before = league.schedule.filter((g) => g.type === 'regular' && g.day < back && (g.home === p.tid || g.away === p.tid)).length;
        expect(p.injury!.gamesRemaining).toBe(before + 2);
      }
      // injuries off: everyone healthy
      expect(Object.values(make(seed, { ...defaultSettings(), injuries: false }).players).some((p) => p.injury)).toBe(false);
    }

    // marks two-way contracts, which AI cuts and the roster limit leave out
    if (seed.players.some((p) => p.contract?.twoWay)) {
      const twoWay = Object.values(league.players).filter((p) => p.contract.twoWay);
      expect(twoWay.length).toBeGreaterThan(0);
      for (const t of league.teams) {
        if (t.tid === league.userTid) continue;
        expect(teamPlayers(league, t.tid).filter((p) => !p.contract.twoWay).length).toBeLessThanOrEqual(CAP.rosterMax);
      }
    }
  }, 120_000);
});
