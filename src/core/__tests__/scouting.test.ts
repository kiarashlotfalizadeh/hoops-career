// Scouting from the games played: play types, ranks, on/off and the last-season fallback; counters
// drafted against the plan with evidence from the numbers; the matchup preview; a team takeover.
import { describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { simDay } from '../league/season';
import { scoutData, SCOUT_MIN_GAMES, type Ranked, type ScoutData } from '../analysis/scouting';
import { counterCandidates, scoutTeam, tacticsWithCounter } from '../ai/advisor';
import { effectiveTactics, ensurePlan, setPlanItem } from '../league/gamePlans';
import { buildSimInput, ensureRotation } from '../league/games';
import { teamSeason } from '../league/helpers';
import { previewMatchups } from '../analysis/matchupPreview';
import { takeOverTeam } from '../league/owner';
import { rankedPresets } from '../ai/coachAI';
import { applyPatch, defaultManagement } from '../sim/tactics';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import type { League } from '../types';

/** A real-league season into its second week. */
function playedLeague(days = 10): League {
  const l = testLeague();
  for (let i = 0; i < days; i++) simDay(l);
  return l;
}

/** The first team after `from` (not the user's) with enough games to scout. */
function scoutable(l: League, from: number) {
  for (let k = 0; k < 30; k++) {
    const tid = (from + k) % 30;
    const ts = teamSeason(l.teams[tid], l.season);
    if (tid !== l.userTid && ts.won + ts.lost >= SCOUT_MIN_GAMES) return tid;
  }
  throw new Error('no team has played enough games');
}

describe('scouting data', () => {
  const l = playedLeague();
  const opp = scoutable(l, l.userTid + 3);

  it('reads play types from the stored games: shares add up, points per possession as counted', () => {
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
  });

  it('ranks every number 1 to 30 across the league', () => {
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
  });

  it("splits the team's possessions into on and off the floor for each key player", () => {
    const d = scoutData(l, opp);
    const ts = teamSeason(l.teams[opp], l.season);
    expect(d.players.length).toBeGreaterThan(6);
    for (const p of d.players.filter((x) => !x.elsewhere)) expect(p.onPoss + p.offPoss).toBe(ts.poss);
    // on-court possessions are offensive possessions, five players on each
    const lines = Object.values(l.players).flatMap((p) => p.stats.filter((s) => s.season === l.season && s.tid === opp && !s.playoffs));
    expect(lines.reduce((a, s) => a + s.onPoss, 0)).toBe(5 * ts.poss);
  });

  it('keeps up as games are played: the same numbers as counting them all again', () => {
    scoutData(l, opp);
    const played = l.games.length;
    simDay(l);
    simDay(l);
    expect(l.games.length).toBeGreaterThan(played);
    const now = scoutData(l, opp);
    const fresh = scoutData(structuredClone(l), opp);
    expect(now.playTypes).toEqual(fresh.playTypes);
    expect(now.defPlayTypes).toEqual(fresh.defPlayTypes);
    expect([now.pace, now.ortg, now.rimRate]).toEqual([fresh.pace, fresh.ortg, fresh.rimRate]);
  });

  it("falls back to last season's numbers (labelled) until this season has enough games", () => {
    const m = playedLeague();
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
    const fresh = testLeague();
    expect(scoutData(fresh, tid)).toMatchObject({ lastSeason: false, enough: false, gp: 0, playTypes: [] });
    expect(scoutData(fresh, tid).tendencies).toEqual([]);
  });

  it("on a new season's opening nights reads no play types from last season's few stored meetings, and ranks only teams with enough games", () => {
    const m = playedLeague(14);
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
  });

  it('says how many meetings the head-to-head numbers are over, last season and playoffs included', () => {
    const m = playedLeague(14);
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
  });

  it('marks the NBA Cup final in the head-to-head: a neutral floor, nobody at home', () => {
    const m = playedLeague(6);
    const g = m.games.find((x) => x.home.tid === m.userTid || x.away.tid === m.userTid)!;
    const opp = g.home.tid === m.userTid ? g.away.tid : g.home.tid;
    g.cup = 'final';
    const games = scoutData(m, opp).h2h.games;
    expect(games.find((x) => x.gid === g.gid)?.cupFinal).toBe(true);
    expect(games.filter((x) => x.gid !== g.gid).every((x) => x.cupFinal === undefined)).toBe(true);
  });

  it("backs counters with evidence when their P&R ball handlers' numbers are inflated, and lists those first", () => {
    const m = playedLeague();
    const tid = scoutable(m, m.userTid + 5);
    // their handlers scoring 1.6 a trip
    for (const g of m.games) {
      const side = g.home.tid === tid ? g.home : g.away.tid === tid ? g.away : null;
      if (side) side.playTypes.pnrBH = { poss: 20, pts: 32 };
    }
    m.teams[m.userTid].tactics = applyPatch(m.teams[m.userTid].tactics, { defense: { scheme: 'man', pnr: 'drop' } });
    const d = scoutData(m, tid);
    expect(d.counters['cov-hedge']).toMatch(/ball handlers score 1\.60 per possession/);
    const cands = counterCandidates(m, m.userTid, tid);
    const hedge = cands.find((c) => c.id === 'cov-hedge')!;
    expect(hedge.evidence).toMatch(/ball handlers score 1\.60/);
    const firstPlain = cands.findIndex((c) => !c.evidence);
    expect(cands.findIndex((c) => c.id === 'cov-hedge')).toBeLessThan(firstPlain < 0 ? Infinity : firstPlain);
    // and the scouting report's attack line reads the numbers first
    expect(scoutTeam(m, tid).weaknesses.length).toBeGreaterThan(0);
  });
});

describe('counters for a game plan', () => {
  const l = playedLeague(6);
  const opp = (l.userTid + 7) % 30;
  // a packed drop defense: both "Attack the drop" and "Spread & move" apply
  l.teams[opp].tactics = applyPatch(l.teams[opp].tactics, { defense: { scheme: 'man', pnr: 'drop', help: 70 } });
  const base = l.teams[l.userTid].tactics;

  it('names a group for every counter, and changes actions relative to the playbook', () => {
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
  });

  it('two action counters in one plan both apply', () => {
    const cands = counterCandidates(l, l.userTid, opp);
    const drop = cands.find((c) => c.id === 'vs-drop')!;
    const pack = cands.find((c) => c.id === 'vs-pack')!;
    setPlanItem(l, opp, { id: drop.id, label: drop.label, group: drop.group, patch: drop.patch });
    setPlanItem(l, opp, { id: pack.id, label: pack.label, group: pack.group, patch: pack.patch });
    const t = effectiveTactics(l, opp);
    const a = base.offense.actions;
    expect(t.offense.actions).toEqual({ ...a, pnr: Math.min(100, a.pnr + 20), handoff: Math.min(100, a.handoff + 20), motion: Math.min(100, a.motion + 25) });
    expect(t.offense.threePoint).toBe(Math.min(100, base.offense.threePoint + 18));
    delete l.gamePlans;
  });

  it("keeps the plan's guarding instructions with a counter, and offers none that changes nothing", () => {
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
    const cands = counterCandidates(l, l.userTid, opp);
    expect(cands.map((c) => c.id)).toEqual(plain);
    for (const c of cands) expect(tacticsWithCounter(l, opp, c).defense.playerD).toEqual({ [pid]: 'sag' });
    l.teams[l.userTid].tactics = saved;
    delete l.gamePlans;
  });

  it("doesn't offer a counter that's already in the plan, and drafts the rest against the plan", () => {
    const before = counterCandidates(l, l.userTid, opp);
    const drop = before.find((c) => c.id === 'vs-drop')!;
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
    delete l.gamePlans;
  });
});

describe('matchup preview', () => {
  it("opens with the engine's own tip-off matchups", () => {
    const l = playedLeague(4);
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
  });
});

describe('taking over another team', () => {
  it("gives the old team fresh tactics from its new staff, not the user's custom ones", () => {
    const l = testLeague();
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
  });
});
