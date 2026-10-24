// Planning for an opponent. The user's side: the staff's read on guarding each of their players and on
// which of their defenders to attack, the assistant's junk-defense and hunt counters (with the numbers
// behind them) and the live one-tap fixes. The AI's side: coaches game-plan against the user's team
// never on easy, about half the games on normal, every game on hard; only in games against the user;
// the same plan for a game whatever is asked when (preview, Lab, live or simmed game, other games that
// day); items that answer the user's measured strengths (a box-and-one on a one-man offense, a hunt, a
// coverage change, how to guard a regular, never one who rests tonight); and the plan kept with the
// user's game results only. And the difficulty's edge on the court: Hard's opponents play about two
// points a game better against him, Easy gives him about one and a half.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague, toGameDay, userGames } from '../../state/__tests__/fixtures';
import { prepareLive } from '../../state/live';
import { aiGamePlan, nextMeeting, oppPlanChance, oppPlanIn, preparesPlan, withOppPlan } from '../ai/opponentPlan';
import { counterCandidates, impactCounter } from '../ai/advisor';
import { buildSimInput, ensureRotation, playGame, tipoffEdge, userGameOnDay } from '../league/games';
import { DIFFICULTY, courtEdge, courtPoints, userCourtPoints, userProjectedNet } from '../league/difficulty';
import { matchupPreview } from '../analysis/preview';
import { simDay } from '../league/season';
import { shortName, teamPlayers } from '../league/helpers';
import { guardAdvice, huntPick } from '../analysis/guarding';
import { projectedRotation } from '../analysis/scouting';
import { applyPatch, cloneTactics, defaultTactics, hasCoachPlans, withoutCoachPlans } from '../sim/tactics';
import { persistableTactics } from '../league/gamePlans';
import { keptTactics } from '../../ui/live/keep';
import { GameSim } from '../sim/engine';
import { Rng, clamp } from '../random';
import type { PossLog } from '../sim/log';
import type { League, Player, ScheduledGame } from '../types';

// a real-league season a few days in (simmed on the default difficulty), then at `difficulty`
const after: Record<number, League> = {};
beforeAll(() => {
  const l = testLeague();
  after[0] = structuredClone(l);
  for (let i = 1; i <= 14; i++) {
    simDay(l);
    if ([2, 6, 12, 14].includes(i)) after[i] = structuredClone(l);
  }
}, 120_000);
function leagueAt(difficulty: League['settings']['difficulty'], days: number): League {
  const l = structuredClone(after[days]);
  l.settings.difficulty = difficulty;
  return l;
}
const fresh = () => structuredClone(after[0]);

const aiTeams = (l: League) => l.teams.map((t) => t.tid).filter((tid) => tid !== l.userTid);
const oppOf = (l: League, g: ScheduledGame) => (g.home === l.userTid ? g.away : g.home);

/** A team whose offense runs through one player (his line this season made to use 38% of the possessions) and whose others make 25% of their threes. */
function oneManTeam(l: League, tid: number): Player {
  const players = teamPlayers(l, tid);
  const line = (p: Player) => p.stats.find((s) => s.season === l.season && s.tid === tid && !s.playoffs);
  const use = (p: Player) => {
    const s = line(p)!;
    return (s.fga + 0.44 * s.fta + s.tov) / (s.teamFga + 0.44 * s.teamFta + s.teamTov);
  };
  // their healthy player who already uses the most possessions, and nobody resting on back-to-backs
  const star = players.filter((p) => !p.injury && line(p) && line(p)!.gp >= 5 && line(p)!.min >= 20 * line(p)!.gp).sort((a, b) => use(b) - use(a))[0];
  l.teams[tid].rotation.restB2B = [];
  for (const p of players) {
    const s = line(p);
    if (!s) continue;
    if (p === star) {
      const teamUse = s.teamFga + 0.44 * s.teamFta + s.teamTov;
      s.fga = Math.round(0.38 * teamUse - 0.44 * s.fta - s.tov);
      s.min = Math.max(s.min, 34 * s.gp);
    } else {
      s.tpa = Math.max(s.tpa, 6);
      s.tpm = Math.floor(s.tpa * 0.25);
      // and poor shooters by their ratings too (a percentage over a few games is mostly noise)
      p.ratings.tp = Math.min(p.ratings.tp, 40);
    }
  }
  return star;
}

describe('planning for an opponent', () => {
  it('reads how to guard each of their players and whom to attack, counters a one-man offense or a weak link, keeps a junk defense with its opponent, and has a one-tap fix live', () => {
    {
      // suggests going under on a ball handler who can't shoot, top-locking a shooter who can't drive, sagging off a non-shooter, getting physical with a poor free-throw shooter inside
      const l = fresh();
      const p = structuredClone(teamPlayers(l, 3)[0]);
      // ratings only: no games this season or last
      p.stats = [];
      const advise = (r: Partial<Player['ratings']>) => guardAdvice(l, { ...p, ratings: { ...p.ratings, ...r } }).suggest;
      expect(advise({ hnd: 90, pas: 85, oiq: 80, tp: 25, mid: 50, spd: 70 })).toBe('under');
      expect(advise({ tp: 92, hnd: 35, spd: 35, oiq: 60, ath: 40, str: 40 })).toBe('tight');
      expect(advise({ tp: 20, hnd: 40, pas: 40 })).toBe('sag');
      expect(advise({ tp: 40, post: 90, str: 90, hgt: 90, ins: 85, ft: 35, hnd: 40, pas: 40 })).toBe('body');
      // a complete player: nothing clearly fits
      expect(advise({ tp: 80, hnd: 80, pas: 80, oiq: 80, spd: 80, mid: 80, ft: 85, post: 50 })).toBeUndefined();
    }
    {
      // reads his games when there are enough, and says so
      const lg = leagueAt('easy', 14);
      const them = projectedRotation(lg, 3, 8);
      const withGames = them.map((x) => guardAdvice(lg, x)).filter((a) => a.line.source === 'season');
      expect(withGames.length).toBeGreaterThan(4);
      for (const a of withGames.filter((x) => x.suggest)) expect(a.why).toMatch(/%|a game|\d/);
    }
    {
      // quotes his three-point percentage only on enough threes to mean something
      const lg = leagueAt('easy', 14);
      const q = structuredClone(projectedRotation(lg, 3, 8).find((x) => (x.stats.find((s) => s.season === lg.season && s.tid === 3 && !s.playoffs)?.gp ?? 0) >= 5)!);
      const s = q.stats.find((x) => x.season === lg.season && x.tid === 3 && !x.playoffs)!;
      // a non-shooter who isn't a handler or a post scorer, and makes his free throws
      Object.assign(q.ratings, { tp: 10, hnd: 35, pas: 40, post: 30, ins: 40, ft: 85 });
      s.ftm = s.fta;
      // one three in his games, and he made it
      s.tpa = s.tpm = 1;
      const one = guardAdvice(lg, q);
      expect(one.suggest).toBe('sag');
      expect(one.why).toBe(`Rarely shoots threes (1 three in his ${s.gp} games).`);
      s.tpa = s.tpm = 0;
      expect(guardAdvice(lg, q).why).toBe(`Doesn't shoot threes (no threes in his ${s.gp} games).`);
      // enough of them to mean something: the percentage
      s.tpa = 2 * s.gp;
      s.tpm = Math.floor(s.tpa / 5);
      expect(guardAdvice(lg, q).why).toMatch(/^Doesn't shoot threes \(\d+\.\d% from three on 2\.0 a game\)\.$/);
      // last season's numbers (before five games with his team this season) say so
      q.stats = [{ ...s, season: lg.season - 1, real: undefined }];
      expect(guardAdvice(lg, q).line.source).toBe('last');
      expect(guardAdvice(lg, q).why).toMatch(/^Doesn't shoot threes \(\d+\.\d% from three on 2\.0 a game last season\)\.$/);
    }
    {
      // picks their weakest perimeter defender to attack, and says when he isn't much of a weak link
      const lg = fresh();
      ensureRotation(lg, 3);
      const rot = projectedRotation(lg, 3, 8);
      const pick = huntPick(lg, 3)!;
      expect(rot.slice(0, 7).map((x) => x.pid)).toContain(pick.pid);
      expect(pick.perDef).toBeLessThanOrEqual(pick.teamPerDef);
      // make one of their starters a sieve: he's the pick, and worth it
      const sieve = rot[1];
      Object.assign(sieve.ratings, { perD: 10, spd: 20, diq: 20 });
      const now = huntPick(lg, 3)!;
      expect(now.pid).toBe(sieve.pid);
      expect(now.worth).toBe(true);
    }
    {
      // the assistant suggests a box-and-one on a one-man offense whose others can't shoot, with the numbers
      const l = leagueAt('easy', 14);
      const opp = 3;
      const star = oneManTeam(l, opp);
      const box = counterCandidates(l, l.userTid, opp).find((c) => c.id === 'box-1');
      expect(box).toBeDefined();
      expect(box!.label).toBe(`Box-and-one on ${star.lastName}`);
      expect(box!.patch).toEqual({ defense: { scheme: 'box1', chase: [star.pid] } });
      expect(box!.evidence).toMatch(/uses 38% of their possessions; the rest make 2\d\.\d% of their threes/);
      // the same percentages from players who can shoot by their ratings: no junk defense (it costs points then)
      for (const p of teamPlayers(l, opp)) if (p !== star) p.ratings.tp = Math.max(p.ratings.tp, 70);
      expect(counterCandidates(l, l.userTid, opp).some((c) => c.id === 'box-1')).toBe(false);
    }
    {
      // the assistant suggests attacking a real weak link
      const l = leagueAt('easy', 2);
      const opp = 4;
      ensureRotation(l, opp);
      const rot = projectedRotation(l, opp, 8);
      Object.assign(rot[0].ratings, { perD: 5, spd: 15, diq: 15 });
      const hunt = counterCandidates(l, l.userTid, opp).find((c) => c.id === 'hunt');
      expect(hunt?.patch).toEqual({ offense: { huntTarget: rot[0].pid } });
      expect(hunt?.label).toBe(`Attack ${rot[0].lastName}`);
    }
    {
      // a junk defense named for their players stays with that opponent: the Lab's Always and Keep changes never make it the default
      const l = fresh();
      const mine = l.teams[l.userTid].tactics;
      mine.defense.scheme = 'zone23';
      const star = teamPlayers(l, 5).sort((a, b) => b.ovr - a.ovr)[0];
      const patch = { defense: { scheme: 'box1' as const, chase: [star.pid] } };
      // nothing to keep for every game (the Lab hides Always), and kept anyway it's the scheme it was drawn up over
      expect(persistableTactics(applyPatch(mine, patch), mine)).toEqual(persistableTactics(mine, mine));
      expect(persistableTactics(applyPatch(mine, patch)).defense.scheme).toBe('man');
      // named live and kept after the game: the saved scheme stays
      expect(keptTactics(mine, cloneTactics(mine), applyPatch(mine, patch)).defense.scheme).toBe('zone23');
      // a box-and-one you set for every game, chasing whoever runs their offense, is yours to keep
      const auto = { defense: { scheme: 'box1' as const } };
      expect(persistableTactics(applyPatch(mine, auto), mine).defense.scheme).toBe('box1');
      expect(keptTactics(mine, cloneTactics(mine), applyPatch(mine, auto)).defense.scheme).toBe('box1');
    }
    {
      // a box-and-one chases the first name it has: a second one left from a triangle-and-two doesn't count
      const l = fresh();
      const [a, b] = projectedRotation(l, 4, 8);
      const t = cloneTactics(l.teams[l.userTid].tactics);
      t.defense.scheme = 'box1';
      t.defense.chase = [a.pid, b.pid];
      const sim = new GameSim(
        { team: { ...l.teams[l.userTid], tactics: t }, players: teamPlayers(l, l.userTid) },
        { team: l.teams[4], players: teamPlayers(l, 4), rest: [a.pid] },
        { rng: new Rng(3), type: 'regular', record: true, injuries: false },
      );
      const logs: PossLog[] = [];
      while (sim.step()) logs.push(...sim.drainLogs());
      const theirs = logs.filter((x) => x.off === 1);
      // their first name sits tonight: man-to-man all game, nobody chased
      expect(theirs.every((x) => x.scheme === 'man' && !x.chase?.length)).toBe(true);
    }
    {
      // the live one-tap fixes take a junk defense, an instruction or a hunt away
      const t = defaultTactics();
      t.defense.scheme = 'tri2';
      t.defense.playerD = { 3: 'under', 4: 'sag' };
      t.offense.huntTarget = 9;
      const fix = (key: string) => {
        const c = impactCounter(key, t)!;
        const out = structuredClone(t);
        c.apply(out);
        return { label: c.label, after: out };
      };
      expect(fix('box_open:o').after.defense.scheme).toBe('man');
      expect(fix('pd_under:o').after.defense.playerD).toEqual({ 4: 'sag' });
      expect(fix('hunt:d').after.offense.huntTarget).toBeNull();
      expect(fix('box_chase:d').label).toBe('Move the ball');
    }
  }, 120_000);

  it('lets AI coaches game-plan against the user by difficulty, the same plan wherever it is asked for, answering his strengths and never his resting players, and keeps it with his results only', () => {
    {
      // never on easy, about half the games for an average coach on normal, every game on hard
      const l = leagueAt('easy', 12);
      const tid = aiTeams(l)[0];
      expect(oppPlanChance(l, tid)).toBe(0);
      for (const opp of aiTeams(l)) {
        const g = nextMeeting(l, opp);
        if (g) expect(aiGamePlan(l, opp, l.userTid, g)).toBeNull();
      }
      l.settings.difficulty = 'hard';
      expect(oppPlanChance(l, tid)).toBe(1);
      l.settings.difficulty = 'normal';
      l.teams[tid].coach.tactics = 60;
      expect(oppPlanChance(l, tid)).toBeCloseTo(0.5, 9);
      // the better the coach, the more often: over many games the share follows the chance
      const share = (rating: number) => {
        l.teams[tid].coach.tactics = rating;
        let n = 0;
        for (let gid = 0; gid < 2000; gid++) if (preparesPlan(l, tid, gid)) n++;
        return n / 2000;
      };
      const avg = share(60);
      expect(avg).toBeGreaterThan(0.45);
      expect(avg).toBeLessThan(0.55);
      expect(share(85)).toBeGreaterThan(share(35));
    }
    {
      // the same plan every time it is asked for a game, and it draws nothing from the league
      const l = leagueAt('hard', 12);
      const rng = l.rng;
      let planned = 0;
      for (const opp of aiTeams(l)) {
        const g = nextMeeting(l, opp);
        if (!g) continue;
        const a = aiGamePlan(l, opp, l.userTid, g);
        expect(a).not.toBeNull();
        expect(aiGamePlan(structuredClone(l), opp, l.userTid, g)).toEqual(a);
        expect(a!.items.length).toBeGreaterThan(0);
        expect(a!.items.length).toBeLessThanOrEqual(2);
        // one item per group, and each changes something in their usual tactics
        expect(new Set(a!.items.map((x) => x.group)).size).toBe(a!.items.length);
        expect(withOppPlan(l.teams[opp].tactics, a)).not.toEqual(l.teams[opp].tactics);
        planned++;
      }
      expect(planned).toBeGreaterThan(20);
      expect(l.rng).toBe(rng);
    }
    {
      // never applies in games between AI teams
      const l = leagueAt('hard', 12);
      const g = l.schedule.find((x) => !x.played && x.home !== l.userTid && x.away !== l.userTid)!;
      for (const [tid, opp] of [
        [g.home, g.away],
        [g.away, g.home],
      ]) {
        expect(aiGamePlan(l, tid, opp, g)).toBeNull();
        const input = buildSimInput(l, tid, g.day, g.type, opp, g);
        expect(input.team).toBe(l.teams[tid]);
      }
      // a day of simmed games keeps a plan only on the user's game
      toGameDay(l);
      const day = l.day;
      simDay(l);
      const played = l.games.filter((x) => x.day === day);
      expect(played.length).toBeGreaterThan(1);
      for (const r of played) {
        const user = r.home.tid === l.userTid || r.away.tid === l.userTid;
        if (user) expect(r.oppPlan?.length).toBeGreaterThan(0);
        else expect(r.oppPlan).toBeUndefined();
      }
    }
    {
      // on hard every game against the user brings a plan, kept with the result
      const l = leagueAt('hard', 6);
      const before = userGames(l).length;
      for (let i = 0; i < 12; i++) simDay(l);
      const later = userGames(l).slice(before);
      expect(later.length).toBeGreaterThan(3);
      for (const r of later) {
        expect(r.oppPlan?.length).toBeGreaterThan(0);
        expect(r.oppPlan!.length).toBeLessThanOrEqual(2);
      }
      // and none on easy
      l.settings.difficulty = 'easy';
      const n = userGames(l).length;
      for (let i = 0; i < 6; i++) simDay(l);
      for (const r of userGames(l).slice(n)) expect(r.oppPlan).toBeUndefined();
    }
    {
      // answers the user's measured strengths: a hot pick-and-roll ball handler gets a coverage change
      const l = leagueAt('hard', 12);
      // the user's stored games show his handlers scoring 1.5 points per pick-and-roll
      for (const r of userGames(l)) {
        const box = r.home.tid === l.userTid ? r.home : r.away;
        box.playTypes = { ...box.playTypes, pnrBH: { poss: 60, pts: 90 } };
      }
      const g = nextMeeting(
        l,
        aiTeams(l).find((tid) => nextMeeting(l, tid))!,
      )!;
      const opp = oppOf(l, g);
      const d = l.teams[opp].tactics.defense;
      d.scheme = 'man';
      d.pnr = 'drop';
      const plan = aiGamePlan(l, opp, l.userTid, g)!;
      expect(['cov-hedge', 'cov-ice']).toContain(plan.items[0].id);
      expect(plan.items[0].why).toMatch(/ball handlers/);
      const tactics = buildSimInput(l, opp, g.day, g.type, l.userTid, g).team.tactics;
      expect(tactics.defense.pnr).not.toBe('drop');
      // a zone stays a zone: no coverage change from one
      d.scheme = 'zone23';
      expect(aiGamePlan(l, opp, l.userTid, g)!.items.some((x) => x.group === 'coverage')).toBe(false);
    }
    {
      // an AI coach answers a one-man offense that can't shoot around him with a box-and-one on him
      const l = leagueAt('hard', 14);
      const star = oneManTeam(l, l.userTid);
      let found = 0;
      for (const tid of l.teams.map((t) => t.tid).filter((t) => t !== l.userTid)) {
        const g = nextMeeting(l, tid);
        if (!g) continue;
        l.teams[tid].tactics.defense.scheme = 'man';
        const plan = aiGamePlan(l, tid, l.userTid, g);
        const box = plan?.items.find((it) => it.id === 'box1');
        if (!box) continue;
        found++;
        expect(box.text).toBe(`plays a box-and-one on ${shortName(l, star)}`);
        expect(box.why).toMatch(/uses 38% of your possessions, and the rest of your team makes 2\d\.\d% of its threes/);
        const t = buildSimInput(l, tid, g.day, g.type, l.userTid, g).team.tactics;
        expect(t.defense).toMatchObject({ scheme: 'box1', chase: [star.pid] });
      }
      expect(found).toBeGreaterThan(5);
      // and an AI team never plays the user's game-by-game settings: a team the user left keeps none of them or his foul to give
      const t = defaultTactics();
      expect(hasCoachPlans(t)).toBe(false);
      t.manage.foulToGive = true;
      t.offense.huntTarget = 3;
      t.defense.chase = [4];
      t.defense.playerD = { 5: 'sag' };
      expect(hasCoachPlans(t)).toBe(true);
      const ai = withoutCoachPlans(t);
      expect([ai.manage.foulToGive, ai.offense.huntTarget, ai.defense.chase, ai.defense.playerD]).toEqual([undefined, undefined, undefined, undefined]);
    }
    {
      // AI coaches can attack the user's weakest perimeter defender and plan how to guard one of his regulars, and play it in the game
      const l = leagueAt('hard', 14);
      ensureRotation(l, l.userTid);
      const rot = projectedRotation(l, l.userTid, 8);
      const sieve = rot[1];
      Object.assign(sieve.ratings, { perD: 5, spd: 15, diq: 15 });
      // and a starter who doesn't shoot threes, in his ratings and his games
      const brick = rot[2];
      Object.assign(brick.ratings, { tp: 5 });
      for (const s of brick.stats) if (s.season === l.season) s.tpa = s.tpm = 0;
      let hunts = 0;
      let guards = 0;
      for (const tid of l.teams.map((t) => t.tid).filter((t) => t !== l.userTid)) {
        const g = nextMeeting(l, tid);
        if (!g) continue;
        l.teams[tid].tactics.defense.scheme = 'man';
        l.teams[tid].tactics.defense.pnr = 'drop';
        const plan = aiGamePlan(l, tid, l.userTid, g);
        const t = () => buildSimInput(l, tid, g.day, g.type, l.userTid, g).team.tactics;
        const hunt = plan?.items.find((it) => it.id === 'hunt');
        if (hunt) {
          hunts++;
          expect(hunt.text).toBe(`attacks ${shortName(l, sieve)} on defense`);
          expect(hunt.why).toMatch(/defends the perimeter at \d+, your rotation at \d+\./);
          expect(t().offense.huntTarget).toBe(sieve.pid);
        }
        const guard = plan?.items.find((it) => it.group === 'guard');
        if (guard) {
          guards++;
          const [pid, how] = Object.entries(guard.patch.defense!.playerD!)[0];
          expect(rot.slice(0, 7).map((p) => p.pid)).toContain(Number(pid));
          expect(guard.id).toBe(`guard-${how}`);
          expect(t().defense.playerD).toEqual({ [pid]: how });
        }
      }
      expect(hunts).toBeGreaterThan(3);
      expect(guards).toBeGreaterThan(0);
    }
    {
      // AI coaches don't plan for a player of the user's who rests tonight
      const l = leagueAt('hard', 14);
      ensureRotation(l, l.userTid);
      const rot = projectedRotation(l, l.userTid, 8);
      const sieve = rot[1];
      Object.assign(sieve.ratings, { perD: 5, spd: 15, diq: 15 });
      const brick = rot[2];
      Object.assign(brick.ratings, { tp: 5 });
      for (const s of brick.stats) if (s.season === l.season) s.tpa = s.tpm = 0;
      // and a regular who plays every night, a weak defender too (if not as weak as the sieve): with the
      // sieve resting, the coaches who hunt one go after him, so their plans still name someone
      Object.assign(rot[3].ratings, { perD: 15, spd: 30, diq: 25 });
      l.teams[l.userTid].rotation.restB2B = [sieve.pid, brick.pid];
      // a night with no game the night before, then the same night as the second of a back-to-back
      const me = l.userTid;
      let day = l.day + 30;
      while (l.schedule.some((g) => g.day === day - 1 && (g.home === me || g.away === me))) day++;
      const targets = () => {
        const named = new Set<number>();
        for (const tid of l.teams.map((t) => t.tid).filter((t) => t !== me)) {
          Object.assign(l.teams[tid].tactics.defense, { scheme: 'man', pnr: 'drop' });
          for (const it of aiGamePlan(l, tid, me, { gid: 90000 + tid, day })?.items ?? []) {
            const d = it.patch.defense;
            for (const pid of [it.patch.offense?.huntTarget, d?.starTarget, ...(d?.chase ?? []), ...Object.keys(d?.playerD ?? {}).map(Number)]) if (pid != null) named.add(pid);
          }
        }
        return named;
      };
      const rested = targets();
      expect(rested.has(sieve.pid) || rested.has(brick.pid)).toBe(true);
      l.schedule.push({ gid: l.nextGid++, day: day - 1, home: me, away: (me + 1) % 30, type: 'regular', played: true });
      const b2b = targets();
      expect(b2b.has(sieve.pid)).toBe(false);
      expect(b2b.has(brick.pid)).toBe(false);
      expect(b2b.size).toBeGreaterThan(0);
    }
    {
      // leaves the user's counters reading their usual tactics
      const l = leagueAt('easy', 12);
      toGameDay(l);
      const opp = oppOf(l, userGameOnDay(l, l.day)!);
      const casual = counterCandidates(l, l.userTid, opp);
      l.settings.difficulty = 'hard';
      expect(counterCandidates(l, l.userTid, opp)).toEqual(casual);
    }
    {
      // the preview, the Lab and the real game play the same opponent tactics, whatever else is played that day
      const l = leagueAt('hard', 12);
      toGameDay(l);
      const g = userGameOnDay(l, l.day)!;
      const opp = oppOf(l, g);
      ensureRotation(l, g.home);
      ensureRotation(l, g.away);
      const plan = aiGamePlan(l, opp, l.userTid, g)!;
      expect(plan).not.toBeNull();
      // the preview lists it and projects with it, the Lab (from today, for the next meeting) plays it
      const pv = matchupPreview(l, g.gid)!;
      expect(pv.oppPlan).toEqual(plan.items);
      const preview = buildSimInput(l, opp, g.day, g.type, l.userTid, g).team.tactics;
      const lab = buildSimInput(l, opp, l.day, 'regular', l.userTid, nextMeeting(l, opp)).team.tactics;
      expect(lab).toEqual(preview);
      expect(preview).toEqual(withOppPlan(l.teams[opp].tactics, plan));
      // the live game sims the day's other games first: the plan it tips off with is the same
      const lg = prepareLive(l)!;
      expect(l.games.filter((x) => x.day === l.day).length).toBeGreaterThan(0);
      expect(oppPlanIn(lg.sim, (1 - lg.userSide) as 0 | 1)).toEqual(plan);
      expect(lg.sim.baseTactics((1 - lg.userSide) as 0 | 1)).toEqual(preview);
      // (the night's other games never count: even absurd numbers in them change nothing)
      for (const r of l.games.filter((x) => x.day === l.day)) for (const b of [r.home, r.away]) b.playTypes = { ...b.playTypes, pnrBH: { poss: 500, pts: 0 } };
      expect(aiGamePlan(l, opp, l.userTid, g)).toEqual(plan);
      const res = lg.commit(l);
      expect(res.oppPlan).toEqual(plan.items.map((x) => x.text));
      expect(l.games.find((x) => x.gid === g.gid)!.oppPlan).toEqual(res.oppPlan);
    }
    {
      // a simmed game keeps the plan it was played with
      const l = leagueAt('hard', 12);
      toGameDay(l);
      const g = userGameOnDay(l, l.day)!;
      ensureRotation(l, g.home);
      ensureRotation(l, g.away);
      const plan = aiGamePlan(l, oppOf(l, g), l.userTid, g)!;
      const res = playGame(l, g);
      expect(res.oppPlan).toEqual(plan.items.map((x) => x.text));
    }
    {
      // the difficulty's edge on the court, in his games only: on Hard his opponents play about 2
      // points a game better, on Easy he gets about 1.5 (the same games, measured)
      const l = leagueAt('normal', 12);
      const me = l.userTid;
      const [a, b] = aiTeams(l);
      for (const d of ['easy', 'hard'] as const) {
        l.settings.difficulty = d;
        expect(courtEdge(l, a, b)).toBeUndefined();
        expect(courtEdge(l, me, a)![0]).toBe(-courtEdge(l, me, a)![1]);
        expect(courtEdge(l, a, me)).toEqual([...courtEdge(l, me, a)!].reverse());
      }
      l.settings.difficulty = 'normal';
      expect(courtEdge(l, me, a)).toBeUndefined();
      for (const t of l.teams) ensureRotation(l, t.tid);
      const N = 600;
      const margin = (d: League['settings']['difficulty']) => {
        l.settings.difficulty = d;
        let m = 0;
        for (let i = 0; i < N; i++) {
          const opp = aiTeams(l)[i % 29];
          const [home, away] = i % 2 ? [me, opp] : [opp, me];
          const sim = new GameSim(buildSimInput(l, home, l.day, 'regular', away), buildSimInput(l, away, l.day, 'regular', home), {
            rng: new Rng(500 + i),
            type: 'regular',
            injuries: false,
            edge: courtEdge(l, home, away),
          });
          sim.simToEnd();
          const r = sim.result(1, l.season, l.day);
          m += r.home.tid === me ? r.home.pts - r.away.pts : r.away.pts - r.home.pts;
        }
        return m / N;
      };
      const [easy, normal, hard] = (['easy', 'normal', 'hard'] as const).map(margin);
      expect(hard - normal).toBeLessThan(-1);
      expect(hard - normal).toBeGreaterThan(-3.5);
      expect(easy - normal).toBeGreaterThan(0.5);
      expect(easy - normal).toBeLessThan(2.8);
      // the pre-game projection carries it, and the live game plays it
      toGameDay(l);
      const g = userGameOnDay(l, l.day)!;
      l.settings.difficulty = 'normal';
      const sim = new GameSim(buildSimInput(l, g.home, g.day, g.type, g.away, g), buildSimInput(l, g.away, g.day, g.type, g.home, g), { rng: new Rng(1), type: g.type });
      const base = tipoffEdge(l, g, sim);
      l.settings.difficulty = 'hard';
      expect(tipoffEdge(l, g, sim)).toBeCloseTo(base + courtPoints(l, g.home, g.away), 1);
      expect(courtPoints(l, me, g.home === me ? g.away : g.home)).toBe(userCourtPoints(l));
      // Hard's edge grows with the user's team: 2 points for an average roster, more for a better
      // one (up to 5), less for a worse one (down to 1); Easy's stays flat
      const mine = teamPlayers(l, me);
      const at = (lift: number) => {
        for (const p of mine) p.ovr += lift;
        const pts = userCourtPoints(l);
        for (const p of mine) p.ovr -= lift;
        return pts;
      };
      expect(at(0)).toBeCloseTo(clamp(-2 * (1 + DIFFICULTY.hard.courtGrowth * userProjectedNet(l)), -5, -1), 5);
      expect(at(4)).toBeLessThan(at(0));
      expect(at(30)).toBe(-5);
      expect(at(-30)).toBe(-1);
      expect(prepareLive(l)!.sim.opts.edge).toEqual(courtEdge(l, g.home, g.away));
      l.settings.difficulty = 'easy';
      expect(at(30)).toBe(at(-30));
    }
  }, 180_000);
});
