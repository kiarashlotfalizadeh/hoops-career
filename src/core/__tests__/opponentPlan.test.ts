// Planning for an opponent. The user's side: the staff's read on guarding each of their players and on
// which of their defenders to attack, the assistant's junk-defense and hunt counters (with the numbers
// behind them) and the live one-tap fixes. The AI's side: coaches game-plan against the user's team
// about half the games, more often the better they are at tactics; only in games against the user;
// the same plan for a game whatever is asked when (preview, Lab, live or simmed game, other games that
// day); items that answer the user's measured strengths (a box-and-one on a one-man offense, a hunt, a
// coverage change, how to guard a regular, never one who rests tonight); and the plan kept with the
// user's game results only. No edge on the court either way.
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague, toGameDay, userGames } from '../../state/__tests__/fixtures';
import { prepareLive } from '../../state/live';
import { aiGamePlan, nextMeeting, oppPlanChance, oppPlanIn, preparesPlan, withOppPlan } from '../ai/opponentPlan';
import { counterCandidates, impactCounter } from '../ai/advisor';
import { buildSimInput, ensureRotation, playGame, userGameOnDay } from '../league/games';
import { matchupPreview } from '../analysis/preview';
import { simDay } from '../league/season';
import { shortName, teamPlayers } from '../league/helpers';
import { guardLine, huntPick } from '../analysis/guarding';
import { projectedRotation } from '../analysis/scouting';
import { applyPatch, cloneTactics, defaultTactics, hasCoachPlans, withoutCoachPlans } from '../sim/tactics';
import { persistableTactics } from '../league/gamePlans';
import { keptTactics } from '../../ui/live/keep';
import { GameSim } from '../sim/engine';
import { Rng } from '../random';
import type { PossLog } from '../sim/log';
import type { League, Player, ScheduledGame } from '../types';

// a real-league season a few days in
const after: Record<number, League> = {};
beforeAll(() => {
  const l = testLeague();
  after[0] = structuredClone(l);
  for (let i = 1; i <= 14; i++) {
    simDay(l);
    if ([2, 6, 12, 14].includes(i)) after[i] = structuredClone(l);
  }
}, 120_000);
const leagueAt = (days: number): League => structuredClone(after[days]);
/**
 * The same with every AI coach at the top of the tactics scale, so most of them (85%) game-plan
 * for a game against the user: for the tests of what goes in a plan, which skip the games without one.
 */
function keenAt(days: number): League {
  const l = leagueAt(days);
  for (const tid of aiTeams(l)) l.teams[tid].coach.tactics = 99;
  return l;
}
/** Each AI team's next meeting with the user whose coach game-plans for it. */
const plannedMeetings = (l: League) =>
  aiTeams(l)
    .map((opp) => ({ opp, g: nextMeeting(l, opp) }))
    .filter((x): x is { opp: number; g: ScheduledGame } => !!x.g && preparesPlan(l, x.opp, x.g.gid));
/** On to the next day the user plays a coach who game-plans for him. */
function toPlannedGameDay(l: League) {
  toGameDay(l);
  for (let i = 0; i < 20; i++) {
    const g = userGameOnDay(l, l.day)!;
    if (preparesPlan(l, oppOf(l, g), g.gid)) return;
    simDay(l);
    toGameDay(l);
  }
  throw new Error('no planned game found');
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
  it('reads their players and whom to attack, counters a one-man offense or a weak link, keeps a junk defense with its opponent, and has a one-tap fix live', () => {
    {
      // reads each player's shooting from his games when there are enough, and says when they're last season's
      const lg = leagueAt(14);
      const them = projectedRotation(lg, 3, 8);
      expect(them.map((x) => guardLine(lg, x)).filter((a) => a.source === 'season').length).toBeGreaterThan(4);
      const q = structuredClone(them.find((x) => (x.stats.find((s) => s.season === lg.season && s.tid === 3 && !s.playoffs)?.gp ?? 0) >= 5)!);
      const s = q.stats.find((x) => x.season === lg.season && x.tid === 3 && !x.playoffs)!;
      s.tpa = 2 * s.gp;
      s.tpm = Math.floor(s.tpa / 5);
      expect(guardLine(lg, q)).toMatchObject({ source: 'season', tpa: 2 });
      q.stats = [{ ...s, season: lg.season - 1, real: undefined }];
      expect(guardLine(lg, q).source).toBe('last');
      q.stats = [];
      expect(guardLine(lg, q).source).toBe('ratings');
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
      const l = leagueAt(14);
      const opp = 3;
      const star = oneManTeam(l, opp);
      const box = counterCandidates(l, l.userTid, opp).find((c) => c.id === 'box-1');
      expect(box).toBeDefined();
      expect(box!.label).toBe(`Box-and-one on ${star.lastName}`);
      expect(box!.patch).toEqual({ defense: { scheme: 'box1', chase: [star.pid] } });
      expect(box!.evidence).toMatch(/uses 38% of their possessions\. The rest make 2\d\.\d% of their threes/);
      // the same percentages from players who can shoot by their ratings: no junk defense (it costs points then)
      for (const p of teamPlayers(l, opp)) if (p !== star) p.ratings.tp = Math.max(p.ratings.tp, 70);
      expect(counterCandidates(l, l.userTid, opp).some((c) => c.id === 'box-1')).toBe(false);
    }
    {
      // the assistant suggests attacking a real weak link
      const l = leagueAt(2);
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
      // the live one-tap fixes take a junk defense or a hunt away
      const t = defaultTactics();
      t.defense.scheme = 'tri2';
      t.offense.huntTarget = 9;
      const fix = (key: string) => {
        const c = impactCounter(key, t)!;
        const out = structuredClone(t);
        c.apply(out);
        return { label: c.label, after: out };
      };
      expect(fix('box_open:o').after.defense.scheme).toBe('man');
      expect(fix('hunt:d').after.offense.huntTarget).toBeNull();
      expect(fix('box_chase:d').label).toBe('Move the ball');
    }
  }, 120_000);

  it('lets AI coaches game-plan against the user by their tactics rating, the same plan wherever it is asked for, answering his strengths and never his resting players, and keeps it with his results only', () => {
    {
      // about half the games for an average coach, from 15% for the worst to 85% for the best
      const l = leagueAt(12);
      const tid = aiTeams(l)[0];
      l.teams[tid].coach.tactics = 60;
      expect(oppPlanChance(l, tid)).toBeCloseTo(0.5, 9);
      l.teams[tid].coach.tactics = 20;
      expect(oppPlanChance(l, tid)).toBeCloseTo(0.15, 9);
      l.teams[tid].coach.tactics = 99;
      expect(oppPlanChance(l, tid)).toBeCloseTo(0.85, 9);
      // a coach who doesn't prepare one for a game has none
      for (const opp of aiTeams(l)) {
        const g = nextMeeting(l, opp);
        if (g && !preparesPlan(l, opp, g.gid)) expect(aiGamePlan(l, opp, l.userTid, g)).toBeNull();
      }
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
      const l = keenAt(12);
      const rng = l.rng;
      let planned = 0;
      for (const { opp, g } of plannedMeetings(l)) {
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
      expect(planned).toBeGreaterThan(15);
      expect(l.rng).toBe(rng);
    }
    {
      // never applies in games between AI teams
      const l = keenAt(12);
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
        if (user) expect(!!r.oppPlan?.length).toBe(preparesPlan(l, r.home.tid === l.userTid ? r.away.tid : r.home.tid, r.gid));
        else expect(r.oppPlan).toBeUndefined();
      }
    }
    {
      // every game whose coach game-plans for it brings his plan, kept with the result; the others none
      const l = keenAt(6);
      const before = userGames(l).length;
      for (let i = 0; i < 12; i++) simDay(l);
      const later = userGames(l).slice(before);
      expect(later.length).toBeGreaterThan(3);
      const planned = later.filter((r) => preparesPlan(l, r.home.tid === l.userTid ? r.away.tid : r.home.tid, r.gid));
      expect(planned.length).toBeGreaterThan(0);
      for (const r of later) {
        if (!planned.includes(r)) expect(r.oppPlan).toBeUndefined();
        else {
          expect(r.oppPlan?.length).toBeGreaterThan(0);
          expect(r.oppPlan!.length).toBeLessThanOrEqual(2);
        }
      }
    }
    {
      // answers the user's measured strengths: a hot pick-and-roll ball handler gets a coverage change
      const l = keenAt(12);
      // the user's stored games show his handlers scoring 1.5 points per pick-and-roll
      for (const r of userGames(l)) {
        const box = r.home.tid === l.userTid ? r.home : r.away;
        box.playTypes = { ...box.playTypes, pnrBH: { poss: 60, pts: 90 } };
      }
      const { opp, g } = plannedMeetings(l)[0];
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
      const l = keenAt(14);
      const star = oneManTeam(l, l.userTid);
      let found = 0;
      for (const { opp: tid, g } of plannedMeetings(l)) {
        l.teams[tid].tactics.defense.scheme = 'man';
        const plan = aiGamePlan(l, tid, l.userTid, g);
        const box = plan?.items.find((it) => it.id === 'box1');
        if (!box) continue;
        found++;
        expect(box.text).toBe(`plays a box-and-one on ${shortName(l, star)}`);
        expect(box.why).toMatch(/uses 38% of your possessions\. The rest of your team makes 2\d\.\d% of its threes/);
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
      expect(hasCoachPlans(t)).toBe(true);
      const ai = withoutCoachPlans(t);
      expect([ai.manage.foulToGive, ai.offense.huntTarget, ai.defense.chase]).toEqual([undefined, undefined, undefined]);
    }
    {
      // AI coaches can attack the user's weakest perimeter defender, and zone a five of his that can't shoot, and play it in the game
      const l = keenAt(14);
      ensureRotation(l, l.userTid);
      const rot = projectedRotation(l, l.userTid, 8);
      const sieve = rot[1];
      Object.assign(sieve.ratings, { perD: 5, spd: 15, diq: 15 });
      // and a starter who doesn't shoot threes, in his ratings and his games
      const brick = rot[2];
      Object.assign(brick.ratings, { tp: 5 });
      for (const s of brick.stats) if (s.season === l.season) s.tpa = s.tpm = 0;
      let hunts = 0;
      for (const { opp: tid, g } of plannedMeetings(l)) {
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
      }
      expect(hunts).toBeGreaterThan(3);
      // the five who play most can't shoot: some coaches pack it into a 2-3 zone (one item a group: in place of a coverage)
      for (const p of projectedRotation(l, l.userTid, 5)) Object.assign(p.ratings, { tp: 5, mid: 10 });
      let zones = 0;
      for (const { opp: tid, g } of plannedMeetings(l)) {
        const zone = aiGamePlan(l, tid, l.userTid, g)?.items.find((it) => it.id === 'zone23');
        if (!zone) continue;
        zones++;
        expect(zone).toMatchObject({ group: 'coverage', text: 'plays a 2-3 zone' });
        expect(buildSimInput(l, tid, g.day, g.type, l.userTid, g).team.tactics.defense.scheme).toBe('zone23');
      }
      expect(zones).toBeGreaterThan(3);
    }
    {
      // AI coaches don't plan for a player of the user's who rests tonight
      const l = keenAt(14);
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
            for (const pid of [it.patch.offense?.huntTarget, d?.starTarget, ...(d?.chase ?? []), ...Object.keys(d?.matchups ?? {}).map(Number)]) if (pid != null) named.add(pid);
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
      // leaves the user's counters reading their usual tactics: the same whether his coach plans or not
      const l = keenAt(12);
      toPlannedGameDay(l);
      const opp = oppOf(l, userGameOnDay(l, l.day)!);
      const planned = counterCandidates(l, l.userTid, opp);
      l.teams[opp].coach.tactics = 0;
      const g = userGameOnDay(l, l.day)!;
      if (!preparesPlan(l, opp, g.gid)) expect(counterCandidates(l, l.userTid, opp)).toEqual(planned);
      expect(aiGamePlan(l, opp, l.userTid, g) === null).toBe(!preparesPlan(l, opp, g.gid));
    }
    {
      // the preview, the Lab and the real game play the same opponent tactics, whatever else is played that day
      const l = keenAt(12);
      toPlannedGameDay(l);
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
      const l = keenAt(12);
      toPlannedGameDay(l);
      const g = userGameOnDay(l, l.day)!;
      ensureRotation(l, g.home);
      ensureRotation(l, g.away);
      const plan = aiGamePlan(l, oppOf(l, g), l.userTid, g)!;
      const res = playGame(l, g);
      expect(res.oppPlan).toEqual(plan.items.map((x) => x.text));
    }
    {
      // no edge on the court in his games: the pre-game projection is home court and the rosters, and the live game plays none
      const l = leagueAt(12);
      toGameDay(l);
      expect(prepareLive(l)!.sim.opts.edge).toBeUndefined();
    }
  }, 180_000);
});
