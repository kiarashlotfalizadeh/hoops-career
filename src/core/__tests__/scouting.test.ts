// Scouting from the games played: play types, ranks, on/off and the last-season fallback; counters
// drafted against the plan with evidence from the numbers; the matchup preview; a team takeover; and
// the staff's debrief (analysis/debrief.ts): the verdict, the edges that decided it, and what to do
// next time, each fix a real change to the tactics as they are now, for the plan or for good.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { simDay } from '../league/season';
import { scoutData, SCOUT_MIN_GAMES, type Ranked, type ScoutData } from '../analysis/scouting';
import { counterCandidates, scoutTeam, tacticsWithCounter } from '../ai/advisor';
import { effectiveTactics, ensurePlan, setPlanItem } from '../league/gamePlans';
import { buildSimInput, ensureRotation, playGame } from '../league/games';
import { shortName, teamSeason } from '../league/helpers';
import { huntPick } from '../analysis/guarding';
import { previewMatchups } from '../analysis/matchupPreview';
import { buildGameReport, decidingFactors } from '../analysis/gameReport';
import { debrief, keyAdvice } from '../analysis/debrief';
import { createLeague, defaultSettings } from '../league/create';
import { takeOverTeam } from '../league/owner';
import { rankedPresets } from '../ai/coachAI';
import { applyPatch, defaultManagement } from '../sim/tactics';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import type { GameResult, League } from '../types';

/** The first team after `from` (not the user's) with enough games to scout. */
function scoutable(l: League, from: number) {
  for (let k = 0; k < 30; k++) {
    const tid = (from + k) % 30;
    const ts = teamSeason(l.teams[tid], l.season);
    if (tid !== l.userTid && ts.won + ts.lost >= SCOUT_MIN_GAMES) return tid;
  }
  throw new Error('no team has played enough games');
}

describe('scouting and the staff', () => {
  /** A real-league season before its first game, and after 4, 6, 10 and 14 days. */
  const at: Record<0 | 4 | 6 | 10 | 14, League> = {} as never;
  beforeAll(() => {
    const l = testLeague();
    let days = 0;
    for (const d of [0, 4, 6, 10, 14] as const) {
      for (; days < d; days++) simDay(l);
      at[d] = structuredClone(l);
    }
  }, 180_000);
  const played = (days: 0 | 4 | 6 | 10 | 14) => structuredClone(at[days]);

  it('scouts from the games played, drafts counters against the plan, previews the matchups, hands over a team and debriefs a game', () => {
    // scouting data, ten days in
    {
      const l = played(10);
      const opp = scoutable(l, l.userTid + 3);
      // reads play types from the stored games: shares add up, points per possession as counted
      const d = scoutData(l, opp);
      expect(d.enough).toBe(true);
      expect(d.lastSeason).toBe(false);
      for (const rows of [d.playTypes, d.defPlayTypes]) expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 9);
      // by hand: their offense's P&R ball-handler plays in every game they played
      let poss = 0;
      let pts = 0;
      let games = 0;
      for (const g of l.games) {
        const side = g.home.tid === opp ? g.home : g.away.tid === opp ? g.away : null;
        if (!side) continue;
        games++;
        poss += side.playTypes.pnrBH?.poss ?? 0;
        pts += side.playTypes.pnrBH?.pts ?? 0;
      }
      const row = d.playTypes.find((r) => r.key === 'pnrBH')!;
      expect(d.ptGames).toBe(games);
      expect(row.poss).toBe(poss);
      expect(row.ppp).toBeCloseTo(pts / poss, 12);

      // ranks every number 1 to 30 across the league
      const all = Array.from({ length: 30 }, (_, tid) => scoutData(l, tid));
      const pick: ((d: ScoutData) => Ranked)[] = [
        (d) => d.pace,
        (d) => d.ortg,
        (d) => d.drtg,
        (d) => d.net,
        (d) => d.off.efg,
        (d) => d.def.tov,
        (d) => d.threeRate,
        (d) => d.rimRate,
      ];
      for (const f of pick) expect(all.map((d) => f(d).rank).sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
      // rank 1 is the best offense, and the best defense allows the fewest points
      const best = all.find((d) => d.ortg.rank === 1)!;
      expect(Math.max(...all.map((d) => d.ortg.v))).toBe(best.ortg.v);
      expect(Math.min(...all.map((d) => d.drtg.v))).toBe(all.find((d) => d.drtg.rank === 1)!.drtg.v);
      // and reads as "the league's best", never "1st-best"
      for (const d of all) for (const x of [...d.tendencies, ...d.exploits]) expect(x).not.toMatch(/\b1st-/);

      // splits the team's possessions into on and off the floor for each key player
      const ts = teamSeason(l.teams[opp], l.season);
      expect(d.players.length).toBeGreaterThan(6);
      for (const p of d.players.filter((x) => !x.elsewhere)) expect(p.onPoss + p.offPoss).toBe(ts.poss);
      // on-court possessions are offensive possessions, five players on each
      const lines = Object.values(l.players).flatMap((p) => p.stats.filter((s) => s.season === l.season && s.tid === opp && !s.playoffs));
      expect(lines.reduce((a, s) => a + s.onPoss, 0)).toBe(5 * ts.poss);

      // keeps up as games are played: the same numbers as counting them all again
      const before = l.games.length;
      simDay(l);
      simDay(l);
      expect(l.games.length).toBeGreaterThan(before);
      const now = scoutData(l, opp);
      const fresh = scoutData(structuredClone(l), opp);
      expect(now.playTypes).toEqual(fresh.playTypes);
      expect(now.defPlayTypes).toEqual(fresh.defPlayTypes);
      expect([now.pace, now.ortg, now.rimRate]).toEqual([fresh.pace, fresh.ortg, fresh.rimRate]);
    }

    // falls back to last season's numbers (labelled) until this season has enough games
    {
      const m = played(10);
      const tid = scoutable(m, m.userTid + 1);
      // what was played becomes last season, and the new one hasn't started (the imported lines of the real
      // season before move back a year first, as they would be by then: else a regular's imported line and his
      // played one share a season, and the imported one, with no on-court numbers, is the one read)
      const S = m.season;
      for (const p of Object.values(m.players)) for (const s of p.stats) if (s.season === S - 1 && s.real) s.season = S - 2;
      for (const t of m.teams) for (const s of t.seasons) s.season = S - 1;
      for (const p of Object.values(m.players)) for (const s of p.stats) if (s.season === S) s.season = S - 1;
      for (const g of m.games) g.season = S - 1;
      for (const t of m.teams) teamSeason(t, S);
      const d = scoutData(m, tid);
      expect(d.lastSeason).toBe(true);
      expect(d.season).toBe(S - 1);
      expect(d.gp).toBeGreaterThanOrEqual(SCOUT_MIN_GAMES);
      expect(d.enough).toBe(true);
      expect(d.players.some((p) => p.on !== undefined)).toBe(true);
      // without a last season to read either, there is nothing to rank yet
      const fresh = played(0);
      expect(scoutData(fresh, tid)).toMatchObject({ lastSeason: false, enough: false, gp: 0, playTypes: [] });
      expect(scoutData(fresh, tid).tendencies).toEqual([]);
    }

    // on a new season's opening nights reads no play types from last season's few stored meetings, and ranks only teams with enough games
    {
      const m = played(14);
      const S = m.season;
      for (const t of m.teams) for (const s of t.seasons) s.season = S - 1;
      for (const p of Object.values(m.players)) for (const s of p.stats) if (s.season === S) s.season = S - 1;
      // as a new season keeps them: only the user's results
      m.games = m.games.filter((g) => g.home.tid === m.userTid || g.away.tid === m.userTid).map((g) => ({ ...g, season: S - 1 }));
      for (const t of m.teams) teamSeason(t, S);
      let read = 0;
      for (const t of m.teams) {
        if (t.tid === m.userTid) continue;
        const d = scoutData(m, t.tid);
        if (!d.enough) continue;
        read++;
        expect(d.lastSeason).toBe(true);
        expect(d.ptGames).toBeLessThan(SCOUT_MIN_GAMES);
        expect([d.playTypes, d.defPlayTypes]).toEqual([[], []]);
        // (play types read as "1.09 points each (league 1.02)", "score 1.14 per possession (league 1.02)")
        for (const x of [...d.tendencies, ...d.exploits, ...Object.values(d.counters)]) expect(x).not.toMatch(/points each|per possession \(league/);
      }
      expect(read).toBeGreaterThan(20);
      // the user's own team has all its games: it ranks first of the one team with enough
      const mine = scoutData(m, m.userTid);
      expect(mine.ptGames).toBeGreaterThanOrEqual(SCOUT_MIN_GAMES);
      expect(mine.playTypes.length).toBeGreaterThan(0);
      for (const r of [...mine.playTypes, ...mine.defPlayTypes]) expect([r.shareRank, r.pppRank]).toEqual([1, 1]);
    }

    // says how many meetings the head-to-head numbers are over, last season and playoffs included
    {
      const m = played(14);
      const mine = (g: League['games'][number]) => g.home.tid === m.userTid || g.away.tid === m.userTid;
      // an opponent met once this season, and once more last season
      const met = new Map<number, League['games']>();
      for (const g of m.games.filter(mine)) {
        const opp = g.home.tid === m.userTid ? g.away.tid : g.home.tid;
        met.set(opp, [...(met.get(opp) ?? []), g]);
      }
      const [opp, [g]] = [...met].find(([, gs]) => gs.length === 1)!;
      const before = structuredClone(g);
      m.games.push({ ...before, gid: m.nextGid++, season: m.season - 1 });
      // in both, their popping big punished the drop for three points
      const side = g.home.tid === opp ? 0 : 1;
      for (const x of m.games.filter((y) => y.gid === g.gid || y.season === m.season - 1)) x.impacts = [{ key: 'drop_pop:o', t: side, count: 6, pts: 3, players: {} }];
      const d = scoutData(m, opp);
      expect(d.h2h.games.length).toBe(2);
      expect(d.h2h.tracked).toBe(2);
      expect(d.counters['cov-switch']).toMatch(/\(\+3\.0 points a game for them over 2 games\)\.$/);
    }

    // marks the NBA Cup final in the head-to-head: a neutral floor, nobody at home
    {
      const m = played(6);
      const g = m.games.find((x) => x.home.tid === m.userTid || x.away.tid === m.userTid)!;
      const opp = g.home.tid === m.userTid ? g.away.tid : g.home.tid;
      g.cup = 'final';
      const games = scoutData(m, opp).h2h.games;
      expect(games.find((x) => x.gid === g.gid)?.cupFinal).toBe(true);
      expect(games.filter((x) => x.gid !== g.gid).every((x) => x.cupFinal === undefined)).toBe(true);
    }

    // backs counters with evidence when their P&R ball handlers' numbers are inflated, and lists those first
    {
      const m = played(10);
      const tid = scoutable(m, m.userTid + 5);
      // their handlers scoring 1.6 a trip, and their defense giving up 1.7 on spot-ups
      for (const g of m.games) {
        const [side, other] = g.home.tid === tid ? [g.home, g.away] : g.away.tid === tid ? [g.away, g.home] : [null, null];
        if (side) side.playTypes.pnrBH = { poss: 20, pts: 32 };
        if (other) other.playTypes.spotup = { poss: 20, pts: 34 };
      }
      m.teams[m.userTid].tactics = applyPatch(m.teams[m.userTid].tactics, { defense: { scheme: 'man', pnr: 'drop' } });
      const d = scoutData(m, tid);
      expect(d.counters['cov-hedge']).toMatch(/ball handlers score 1\.60 per possession/);
      const cands = counterCandidates(m, m.userTid, tid);
      const hedge = cands.find((c) => c.id === 'cov-hedge')!;
      expect(hedge.evidence).toMatch(/ball handlers score 1\.60/);
      const firstPlain = cands.findIndex((c) => !c.evidence);
      expect(cands.findIndex((c) => c.id === 'cov-hedge')).toBeLessThan(firstPlain < 0 ? Infinity : firstPlain);
      // and the scouting report's attack lines read the numbers before the rules of thumb (another
      // line from the numbers, a volume shooter's, may outweigh this one)
      const lines = scoutTeam(m, tid).weaknesses;
      const idx = lines.findIndex((w) => /^Their defense gives up/.test(w));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(d.exploits.length);
      // its weak link is the one the plan's "Attack" counter goes after: Scout and Plan name the same man
      const hp = huntPick(m, tid);
      const weakLine = lines.find((w) => w.includes('weakest perimeter defender'));
      expect(!!weakLine).toBe(!!hp?.worth);
      if (hp?.worth) {
        expect(weakLine).toContain(shortName(m, m.players[hp.pid]));
        const attack = cands.find((c) => c.id === 'hunt');
        if (attack) expect(attack.label).toBe(`Attack ${m.players[hp.pid].lastName}`);
      }
    }

    // counters for a game plan
    {
      const l = played(6);
      const opp = (l.userTid + 7) % 30;
      // a packed drop defense: both "Attack the drop" and "Spread & move" apply
      l.teams[opp].tactics = applyPatch(l.teams[opp].tactics, { defense: { scheme: 'man', pnr: 'drop', help: 70, switchOffBall: false } });
      const base = l.teams[l.userTid].tactics;

      // names a group for every counter, and changes actions relative to the playbook
      const cands = counterCandidates(l, l.userTid, opp);
      expect(cands.length).toBeGreaterThan(3);
      for (const c of cands) {
        expect(c.group).toBeTruthy();
        if (c.id.startsWith('cov-') || c.id === 'zone') expect(c.group).toBe('coverage');
        if (c.id.startsWith('star-')) expect(c.group).toBe('star');
        if (c.id.startsWith('vs-')) expect(c.group).toMatch(/^actions-/);
        // no whole action sets: the playbook's other weights are left alone
        expect(c.patch.offense?.actions).toBeUndefined();
      }
      expect(cands.find((c) => c.id === 'vs-drop')!.patch.nudge?.actions).toEqual({ pnr: 20, handoff: 20 });

      // two action counters in one plan both apply
      const drop = cands.find((c) => c.id === 'vs-drop')!;
      const pack = cands.find((c) => c.id === 'vs-pack')!;
      setPlanItem(l, opp, { id: drop.id, label: drop.label, group: drop.group, patch: drop.patch });
      setPlanItem(l, opp, { id: pack.id, label: pack.label, group: pack.group, patch: pack.patch });
      const t = effectiveTactics(l, opp);
      const a = base.offense.actions;
      expect(t.offense.actions).toEqual({ ...a, pnr: Math.min(100, a.pnr + 20), handoff: Math.min(100, a.handoff + 20), motion: Math.min(100, a.motion + 25) });
      expect(t.offense.threePoint).toBe(Math.min(100, base.offense.threePoint + 18));
      delete l.gamePlans;

      // keeps the plan's guarding instructions with a counter, and offers none that changes nothing
      const pid = Object.values(l.players).find((p) => p.tid === opp)!.pid;
      const saved = l.teams[l.userTid].tactics;
      // every action and the shot profile at the top: the counters that nudge them change nothing
      const maxed = structuredClone(saved);
      for (const k of Object.keys(maxed.offense.actions) as (keyof typeof maxed.offense.actions)[]) maxed.offense.actions[k] = 100;
      Object.assign(maxed.offense, { threePoint: 100, rimAttack: 100 });
      l.teams[l.userTid].tactics = maxed;
      const plain = counterCandidates(l, l.userTid, opp).map((c) => c.id);
      expect(plain).not.toContain('vs-drop');
      expect(plain).not.toContain('vs-pack');
      // a plan that only says how to guard one of theirs
      ensurePlan(l, opp).playerD = { [pid]: 'sag' };
      const guarded = counterCandidates(l, l.userTid, opp);
      expect(guarded.map((c) => c.id)).toEqual(plain);
      for (const c of guarded) expect(tacticsWithCounter(l, opp, c).defense.playerD).toEqual({ [pid]: 'sag' });
      l.teams[l.userTid].tactics = saved;
      delete l.gamePlans;

      // doesn't offer a counter that's already in the plan, and drafts the rest against the plan
      const before = counterCandidates(l, l.userTid, opp);
      setPlanItem(l, opp, { id: drop.id, label: drop.label, group: drop.group, patch: drop.patch });
      const after = counterCandidates(l, l.userTid, opp).map((c) => c.id);
      expect(after).not.toContain('vs-drop');
      expect(after).toContain('vs-pack');
      // a coverage in the plan: the same one isn't offered again, another replaces it
      const cov = before.find((c) => c.id.startsWith('cov-') && c.id !== `cov-${base.defense.pnr}`)!;
      setPlanItem(l, opp, { id: cov.id, label: cov.label, group: cov.group, patch: cov.patch });
      const covs = counterCandidates(l, l.userTid, opp).filter((c) => c.group === 'coverage');
      expect(covs.map((c) => c.id)).not.toContain(cov.id);
      // (the zone replaces the coverage in the plan: man-to-man's coverage goes back to the base tactics')
      for (const c of covs)
        expect(tacticsWithCounter(l, opp, c).defense).toMatchObject(c.id === 'zone' ? { scheme: 'zone23', pnr: base.defense.pnr } : { scheme: 'man', pnr: c.patch.defense?.pnr });
    }

    // the matchup preview opens with the engine's own tip-off matchups
    {
      const l = played(4);
      const me = l.userTid;
      let checked = 0;
      for (const opp of [0, 7, 13, 24].filter((t) => t !== me)) {
        ensureRotation(l, opp);
        ensureRotation(l, me);
        const pv = previewMatchups(l, opp);
        expect(pv.theirs.length).toBe(8);
        expect(pv.mine.length).toBe(10);
        const g = l.schedule.filter((x) => !x.played && ((x.home === me && x.away === opp) || (x.away === me && x.home === opp))).sort((a, b) => a.day - b.day)[0];
        const sim = new GameSim(buildSimInput(l, me, g.day, g.type, opp, g), buildSimInput(l, opp, g.day, g.type, me, g), { rng: new Rng(opp), type: g.type, record: true });
        let log = sim.logs.find((x) => x.off === 1);
        for (let k = 0; k < 4 && !log; k++) {
          sim.step();
          log = sim.logs.find((x) => x.off === 1);
        }
        for (const r of pv.rows.filter((x) => x.starter)) {
          expect(log!.guards![r.pid]).toBe(r.auto);
          checked++;
        }
      }
      expect(checked).toBeGreaterThanOrEqual(15);
    }

    // taking over another team gives the old team fresh tactics from its new staff, not the user's custom ones
    {
      const l = played(0);
      const old = l.teams[l.userTid];
      const t = applyPatch(old.tactics, { defense: { starPlan: 'double', pnr: 'blitz', press: 'always' }, manage: { hackThreshold: 70, foulUp3: false }, offense: { pace: 3 } });
      old.tactics = { ...t, manual: true, offPreset: 'custom', defPreset: 'custom' };
      takeOverTeam(l, (l.userTid + 1) % 30);
      const players = Object.values(l.players).filter((p) => p.tid === old.tid);
      const ranked = rankedPresets(old, players);
      expect(old.tactics.manual).toBe(false);
      expect(old.tactics.manage).toEqual(defaultManagement());
      expect(old.tactics.defense.starPlan).toBe('none');
      expect([old.tactics.offPreset, old.tactics.defPreset]).toEqual([ranked.off[0], ranked.def[0]]);
      expect(old.tactics.offense.pace).not.toBe(3);
    }

    // the debrief, over a fictional league's games
    const fictional = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 9 });
    fictional.phase = 'regular';
    const firstGame = (league: League) =>
      playGame(
        league,
        league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!,
      );
    // leads with the verdict and the edges, and its fixes change the tactics as they are now
    {
      const league = structuredClone(fictional);
      let fixes = 0;
      for (let i = 0; i < 8; i++) {
        const res = firstGame(league);
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
        // a new coach's first five nights say what one game can and can't show
        expect(!!d.frame).toBe(i < 5);
      }
      expect(fixes).toBeGreaterThan(0);
    }
    // the game plan it was played with is kept with the result and graded on what each counter was aimed at
    {
      const league = structuredClone(fictional);
      const g = league.schedule.find((x) => !x.played && (x.home === 0 || x.away === 0))!;
      const opp = g.home === 0 ? g.away : g.home;
      const pnr = league.teams[0].tactics.defense.pnr === 'hedge' ? 'drop' : 'hedge';
      setPlanItem(league, opp, { id: 'cov', label: 'Change the coverage', patch: { defense: { pnr } }, pts: 0.4 });
      const res = playGame(league, g);
      expect(res.plan).toEqual([{ label: 'Change the coverage', end: 'def', types: ['pnrBH', 'pnrRoll'], pts: 0.4 }]);
      const d = debrief(league, res, buildGameReport(league, res)!);
      expect(d.plan).toHaveLength(1);
      expect(d.plan[0]).toMatchObject({ label: 'Change the coverage', worth: '+0.4 a game' });
      expect(d.plan[0].line).toMatch(/pick-and-roll/);
      expect(['better', 'worse', 'same', 'few']).toContain(d.plan[0].verdict);
      // (and used up: a next-game plan is for one game)
      expect(league.gamePlans?.[opp]).toBeUndefined();
    }
    // offers no fix for a setting's cost that the same setting won back that night
    const night = structuredClone(fictional);
    const nightRes = firstGame(night);
    {
      const league = structuredClone(night);
      const res = structuredClone(nightRes);
      const me: 0 | 1 = res.home.tid === 0 ? 0 : 1;
      const them = (1 - me) as 0 | 1;
      league.teams[0].tactics = applyPatch(league.teams[0].tactics, { defense: { scheme: 'man', pnr: 'drop' } });
      const im = (key: string, t: 0 | 1, pts: number) => ({ key, t, pts, count: 8, players: {} });
      const factor = () => buildGameReport(league, res)!.factors.find((f) => f.title.includes('pull-up jumpers'))!;
      // drop gave up 2.5 in pull-ups and won 3.1 back at the rim: no reason to leave it
      res.impacts = [im('drop_pullup:o', them, 2.5), im('drop_rim:d', me, 3.1)];
      expect(factor()).toMatchObject({ pts: -2.5, detail: 'Over 8 plays. Your drop coverage won 3.1 back.' });
      expect(factor().key).toBeUndefined();
      expect(factor().advice).toBeUndefined();
      expect(debrief(league, res, buildGameReport(league, res)!).advice.some((a) => a.id === 'fix-drop_pullup:o')).toBe(false);
      // it won back only 0.4: the fix stands
      res.impacts = [im('drop_pullup:o', them, 2.5), im('drop_rim:d', me, 0.4)];
      expect(factor()).toMatchObject({ key: 'drop_pullup:o', detail: 'Over 8 plays.' });
      expect(debrief(league, res, buildGameReport(league, res)!).advice.find((a) => a.id === 'fix-drop_pullup:o')?.label).toBe('Switch to Hedge');
    }
    // tells each deciding edge once: a won-back setting in one row, an edge that is part of another under it
    {
      const league = structuredClone(night);
      const res = structuredClone(nightRes);
      const me: 0 | 1 = res.home.tid === 0 ? 0 : 1;
      const them = (1 - me) as 0 | 1;
      league.teams[0].tactics = applyPatch(league.teams[0].tactics, { defense: { scheme: 'man', pnr: 'blitz' } });
      const im = (key: string, t: 0 | 1, pts: number) => ({ key, t, pts, count: 20, players: {} });
      // the blitz gave up 8.9 in 4-on-3s and won 8.8 back in turnovers: one row carries both numbers
      res.impacts = [im('blitz_4v3:o', them, 8.9), im('blitz_to:d', me, 8.8), im('help_kick:o', me, 2)];
      const rep = buildGameReport(league, res)!;
      expect(rep.factors.some((f) => f.won === 'blitzing')).toBe(true);
      const told = decidingFactors(rep.factors, rep.factors.length);
      expect(told.some((f) => f.won === 'blitzing')).toBe(false);
      expect(told.find((f) => f.paid === 'blitzing')?.detail).toMatch(/won 8\.8 back/);
      // traps that forced turnovers under a turnover battle won the same way: the battle is told, the traps give way
      res.impacts = [im('blitz_to:d', me, 5)];
      const f = buildGameReport(league, res)!.factors;
      const battle = f.find((x) => x.category === 'turnovers' && x.title.startsWith('Turnover battle'));
      const traps = f.find((x) => x.key === 'blitz_to:d')!;
      expect(traps.topic).toBe('turnovers');
      if (battle && battle.pts > 0) expect(decidingFactors(f, f.length).filter((x) => x.topic === 'turnovers')).toHaveLength(1);
      // the debrief's edges are the deciding ones
      expect(debrief(league, res, buildGameReport(league, res)!).decided).toEqual(decidingFactors(buildGameReport(league, res)!.factors));
    }
    // tells the looks from the luck: the shots each side got, and how they fell against what they were worth
    {
      const league = structuredClone(night);
      const res = structuredClone(nightRes);
      const me: 0 | 1 = res.home.tid === 0 ? 0 : 1;
      const [us, them] = me === 0 ? [res.home, res.away] : [res.away, res.home];
      expect(res.xShots).toHaveLength(2);
      const side = (u: { pts: number; tpm: number }, o: { pts: number; tpm: number }) => (me === 0 ? [u, o] : [o, u]) as GameResult['xShots'];
      const fgPts = (b: typeof us) => 2 * b.t.fgm + b.t.tpm;
      // looks worth the same eFG to both: whatever the shooting decided was luck, told with nothing to change
      res.xShots = side({ pts: 2 * 0.53 * us.t.fga, tpm: us.t.tpm }, { pts: 2 * 0.53 * them.t.fga, tpm: them.t.tpm });
      let rep = buildGameReport(league, res)!;
      const ff = rep.fourFactors;
      const efgSwing = (ff.user.efg - ff.opp.efg) * (us.t.fga + them.t.fga);
      expect(rep.factors.some((f) => f.category === 'shooting' && !f.luck)).toBe(false);
      const luck = rep.factors.find((f) => f.luck);
      expect(!!luck).toBe(Math.abs(efgSwing) >= 3);
      if (luck) {
        expect(luck.pts).toBeCloseTo(efgSwing, 6);
        expect(luck.key).toBeUndefined();
        expect(luck.advice).toBeUndefined();
      }
      // shots that fell exactly as their looks: the gap was the looks, and luck says nothing
      res.xShots = side({ pts: fgPts(us), tpm: us.t.tpm }, { pts: fgPts(them), tpm: them.t.tpm });
      rep = buildGameReport(league, res)!;
      expect(rep.factors.some((f) => f.luck)).toBe(false);
      const looks = rep.factors.find((f) => f.category === 'shooting');
      expect(!!looks).toBe(Math.abs(efgSwing) >= 3);
      if (looks) expect(looks.title).toMatch(/got the better looks: worth/);
      // a threes key missed with the looks there reads as shots that didn't fall, missed without them as threes not taken
      const fly = { id: 'fly', title: 'Let it fly', goal: '', dir: 'min' as const, target: us.t.tpm + 3, value: us.t.tpm, met: false };
      res.xShots = side({ pts: fgPts(us), tpm: us.t.tpm + 3 }, { pts: fgPts(them), tpm: them.t.tpm });
      expect(keyAdvice(league, fly, res, me)).toMatch(/^The threes were there and you took them/);
      res.xShots = side({ pts: fgPts(us), tpm: us.t.tpm }, { pts: fgPts(them), tpm: them.t.tpm });
      expect(keyAdvice(league, fly, res, me)).toMatch(/you didn't take them/);
      // and a team that made more threes than its looks were worth beat the arc key on luck, not on the plan
      const arc = { id: 'arc', title: 'Run them off the line', goal: '', dir: 'max' as const, target: them.t.tpm - 3, value: them.t.tpm, met: false };
      res.xShots = side({ pts: fgPts(us), tpm: us.t.tpm }, { pts: fgPts(them), tpm: them.t.tpm - 4 });
      expect(keyAdvice(league, arc, res, me)).toMatch(/that part was luck/);
    }
    // a free-throw gap against a physical defense comes with its lever; played clean, it says where it came from
    {
      const league = structuredClone(night);
      const res = structuredClone(nightRes);
      const me: 0 | 1 = res.home.tid === 0 ? 0 : 1;
      const opp = me === 0 ? 'away' : 'home';
      res[opp] = { ...res[opp], t: { ...res[opp].t, ftm: res[opp].t.ftm + 15, fta: res[opp].t.fta + 18 } };
      const fouls = () => buildGameReport(league, res)!.factors.find((f) => f.category === 'fouls' && f.title.startsWith('Free throws'))!;
      league.teams[0].tactics = applyPatch(league.teams[0].tactics, { defense: { physicality: 65 } });
      expect(fouls()).toMatchObject({ key: 'physicality:o' });
      expect(debrief(league, res, buildGameReport(league, res)!).advice.some((a) => a.label === 'Less physical')).toBe(true);
      league.teams[0].tactics = applyPatch(league.teams[0].tactics, { defense: { physicality: 40 } });
      expect(fouls().key).toBeUndefined();
      expect(fouls().advice).toMatch(/^Not from how physical you played/);
    }
  }, 180_000);
});
