// The owner's goals: set on opening night from the roster the team opens with, frozen for the season
// and the same for the same league (never drawing from its random stream); win targets that are
// unbiased across the league over simulated seasons; grades relative to the targets, so beating a low
// bar pleases him and a stacked team that underachieves doesn't; in-season progress and check-ins;
// the review and its history; takeovers; firing (grace, job security, and where the line sits); saves.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { autoDraftUserPick, finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency, startRegularSeason } from '../league/season';
import { nextPick } from '../league/draft';
import { CAP_FOR, curTeamSeason, freeAgents, payroll, revenueScale, standardRoster, statsLine } from '../league/helpers';
import { askingContract, releasePlayer, valueScore } from '../league/contracts';
import { userOffer } from '../league/freeAgency';
import { FIRING_LINE, ownerEvaluation, takeOverTeam } from '../league/owner';
import {
  REVIEWS_KEPT,
  WIN_SCALE,
  currentGoals,
  goalResult,
  gradeOwnerGoals,
  leagueOutlook,
  ownerCheckIn,
  ownerPersonality,
  ownerProgress,
  planOwnerGoals,
  seasonBudget,
  type GoalProgress,
  type OwnerGoalKind,
  type OwnerGoals,
  type OwnerReview,
} from '../league/ownerGoals';
import { loadLeague, migrate, saveLeague } from '../../state/persistence';
import { forecast } from '../analysis/odds';
import { playerAge, salaryFor } from '../playerGen';
import { CAP } from '../constants';
import { FREE_AGENT, type League } from '../types';

const seed = seedJson as unknown as SeedData;
const U = 19;

/** A league in the preseason (the real one unless `real` is false), the user's roster cut to 15 (and filled to 13) as opening night needs. */
function preseason(rngSeed = 7, userTid = U, real = true): League {
  const l = createLeague({ name: 'owner', userTid, coachName: 'c', settings: { ...defaultSettings(), stopOnNews: false }, seed: real ? seed : null, rngSeed });
  l.id = `owner_${rngSeed}`;
  fitRoster(l);
  return l;
}

function fitRoster(l: League) {
  const std = () => standardRoster(l, l.userTid);
  while (std().length > CAP.rosterMax) releasePlayer(l, std().sort((a, b) => valueScore(l, a) - valueScore(l, b))[0], { news: false });
  for (const p of freeAgents(l).sort((a, b) => b.ovr - a.ovr)) {
    if (std().length >= CAP.rosterMin) break;
    userOffer(l, p.pid, askingContract(l, p, l.userTid).amount, 1);
  }
}

function start(l: League) {
  fitRoster(l);
  const errs = startRegularSeason(l);
  if (errs.length) throw new Error(errs.join('; '));
}

const inSeason = (l: League) => ['regular', 'playin', 'playoffs'].includes(l.phase);
const goal = (og: Pick<OwnerGoals, 'goals'>, kind: OwnerGoalKind) => og.goals.find((g) => g.kind === kind);
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;

/** A team's season results set goal by goal: `r` names a result for a kind, every other goal is met exactly. */
function results(l: League, og: OwnerGoals, r: Partial<Record<OwnerGoalKind, number>> = {}) {
  const ts = curTeamSeason(l, og.tid);
  for (const g of og.goals) {
    const v = r[g.kind] ?? g.target;
    if (g.kind === 'wins') [ts.won, ts.lost] = [v + (og.from?.won ?? 0), 82 - v - (og.from?.won ?? 0)];
    if (g.kind === 'postseason') [ts.playoffRound, ts.playIn] = [v >= 2 ? v - 1 : -1, v === 1];
    if (g.kind === 'profit') ts.revenue = ts.expenses + v + (og.from?.profit ?? 0);
    if (g.kind === 'payroll') ts.payroll = v;
    if (g.kind === 'youth') {
      const kid = Object.values(l.players).find((p) => p.tid >= 0 && playerAge(p, l.season) <= 23)!;
      statsLine(kid, l.season, og.tid, false).min = v + (og.from?.youth ?? 0);
    }
  }
}

describe('opening night', () => {
  it('sets three or four goals from the roster, frozen for the season and the same for the same league, without drawing from its random stream', () => {
    const l = preseason();
    const rng = l.rng;
    const plan = planOwnerGoals(l, U)!;
    expect(l.rng).toBe(rng);
    expect(planOwnerGoals(structuredClone(l), U)).toEqual(plan);
    expect(startRegularSeason(l)).toEqual([]);
    const og = currentGoals(l)!;
    expect(og).toMatchObject({ season: l.season, tid: U, games: 82 });
    expect(og.from).toBeUndefined();
    expect(og.goals.length).toBeGreaterThanOrEqual(3);
    expect(og.goals.length).toBeLessThanOrEqual(4);
    expect(new Set(og.goals.map((g) => g.kind)).size).toBe(og.goals.length);
    expect(sum(og.goals.map((g) => g.weight))).toBeCloseTo(1, 6);
    expect(og.goals[0].title).toMatch(/^Win \d+ games$/);
    for (const g of og.goals)
      expect(g.title).toMatch(
        /^(Win \d+ games|Reach the play-in|Make the playoffs|Win a playoff round|Reach the conference finals|Reach the Finals|Turn a \$\d+\.\dM profit|Break even|Keep the loss under \$\d+\.\dM|Stay under the luxury tax|Get under the luxury tax|Keep the payroll under \$\d+\.\dM|Play your young players: [\d,]+ minutes for players 23 or under)$/,
      );
    // he says so, with each goal's weight
    const mail = l.inbox.find((m) => m.subject === 'My goals for this season')!;
    for (const g of og.goals) expect(mail.body).toContain(`${g.title} (${Math.round(g.weight * 100)}% of my review)`);
    // frozen: a week of games and a roster move later, the goals are the ones set on opening night
    const before = structuredClone(og.goals);
    for (let d = 0; d < 7; d++) simDay(l);
    releasePlayer(l, standardRoster(l, U).sort((a, b) => b.ovr - a.ovr)[0], { news: false });
    expect(currentGoals(l)!.goals).toEqual(before);
  });

  it('asks a stronger roster for more wins', () => {
    const l = preseason();
    const before = goal(planOwnerGoals(l, U)!, 'wins')!.target;
    // the league's best player joins the user's team from another one
    const star = Object.values(l.players)
      .filter((p) => p.tid >= 0 && p.tid !== U)
      .sort((a, b) => b.ovr - a.ovr)[0];
    const from = star.tid;
    const theirs = goal(planOwnerGoals(l, from)!, 'wins')!.target;
    star.tid = U;
    expect(goal(planOwnerGoals(l, U)!, 'wins')!.target).toBeGreaterThan(before + 2);
    expect(goal(planOwnerGoals(l, from)!, 'wins')!.target).toBeLessThan(theirs - 2);
  });

  it('sets the postseason, development and money goals by the projection, the strategy and the payroll; every owner has a personality of his own', () => {
    const l = preseason();
    const outlook = leagueOutlook(l);
    const all = l.teams.map((t) => planOwnerGoals(l, t.tid, outlook)!);
    const line = CAP_FOR(l).luxuryTax;
    const rank = (tid: number) =>
      1 +
      outlook.filter(
        (o) => o.tid !== tid && l.teams[o.tid].conf === l.teams[tid].conf && (o.final > outlook[tid].final || (o.final === outlook[tid].final && o.talent > outlook[tid].talent)),
      ).length;
    for (const og of all) {
      const t = l.teams[og.tid];
      const post = goal(og, 'postseason');
      const r = rank(og.tid);
      if (t.strategy === 'rebuild' || r >= 11) {
        expect(post, t.abbrev).toBeUndefined();
        expect(goal(og, 'youth'), t.abbrev).toBeDefined();
      } else if (r <= 4 || t.strategy === 'contend') expect(post!.target, t.abbrev).toBeGreaterThanOrEqual(3);
      else expect(post!.target, t.abbrev).toBe(r <= 8 ? 2 : 1);
      const pay = payroll(l, og.tid);
      if (pay <= line * 0.94) expect(goal(og, 'profit'), t.abbrev).toBeDefined();
      else expect(goal(og, 'payroll')!.title, t.abbrev).toMatch(pay <= line ? /^Stay under the luxury tax$/ : /^(Get under the luxury tax|Keep the payroll under .*)$/);
      // the expectation and the target agree, but for the owner's nudge of a win or two
      expect(Math.abs(goal(og, 'wins')!.target - outlook[og.tid].pct * 82), t.abbrev).toBeLessThanOrEqual(2.5);
    }
    // the stronger the roster, the higher the bar: targets follow the talent
    const byTalent = [...all].sort((a, b) => outlook[a.tid].talent - outlook[b.tid].talent);
    expect(goal(byTalent[29], 'wins')!.target).toBeGreaterThan(goal(byTalent[0], 'wins')!.target + 15);
    const who = l.teams.map((t) => ownerPersonality(l, t.tid));
    expect(new Set(who).size).toBe(3);
    expect(l.teams.map((t) => ownerPersonality(structuredClone(l), t.tid))).toEqual(who);
  });

  it("doesn't count on money a team under the salary floor will pay to reach it", () => {
    const l = preseason();
    const tid = (U + 1) % 30;
    const floor = CAP_FOR(l).minPayroll;
    // its best-paid players off the books, until the payroll is well under the floor
    const paid = () => standardRoster(l, tid).sort((a, b) => salaryFor(b, l.season) - salaryFor(a, l.season));
    while (payroll(l, tid) > floor - 15_000) paid()[0].tid = FREE_AGENT;
    const a = seasonBudget(l, tid);
    expect(a.floor).toBe(floor - payroll(l, tid));
    // a little more off the payroll before the season: every dollar saved goes to the shortfall at its end
    const p = paid().find((x) => salaryFor(x, l.season) >= 1_000 && !x.contract.tenDay)!;
    p.tid = FREE_AGENT;
    const b = seasonBudget(l, tid);
    expect(b.floor - a.floor).toBe(salaryFor(p, l.season));
    expect(b.op - b.floor).toBeCloseTo(a.op - a.floor, 3);
    expect(b.share).toBeCloseTo(a.share, 3);
  });
});

describe('two simulated seasons', () => {
  let l: League;
  /** Every team's goals on each opening night, and the league once each season was over. */
  const openings: OwnerGoals[][] = [];
  const ends: League[] = [];
  /** The user's goals and their progress at about 41 games each season. */
  const mid: { og: OwnerGoals; progress: GoalProgress[]; won: number; lost: number }[] = [];
  const mine: OwnerGoals[] = [];

  beforeAll(() => {
    l = preseason(11, 4);
    for (let s = 0; s < 2; s++) {
      start(l);
      const outlook = leagueOutlook(l);
      openings.push(l.teams.map((t) => planOwnerGoals(l, t.tid, outlook)!));
      mine.push(structuredClone(currentGoals(l)!));
      for (let g = 0; inSeason(l) && g < 500; g++) {
        const ts = curTeamSeason(l, l.userTid);
        if (l.phase === 'regular' && mid.length === s && ts.won + ts.lost >= 41)
          mid.push({ og: structuredClone(currentGoals(l)!), progress: ownerProgress(l), won: ts.won, lost: ts.lost });
        simDay(l);
      }
      ends.push(structuredClone(l));
      if (s === 0) {
        startDraft(l);
        for (let g = 0; nextPick(l) && g < 100; g++) autoDraftUserPick(l);
        finishDraftPhase(l);
        startFreeAgency(l);
        newSeason(l);
      }
    }
  }, 600_000);

  it('sets win targets that are unbiased across the league and track the wins', () => {
    const targets: number[] = [];
    const wins: number[] = [];
    openings.forEach((all, s) =>
      all.forEach((og) => {
        targets.push(goal(og, 'wins')!.target);
        wins.push(ends[s].teams[og.tid].seasons.find((x) => x.season === og.season)!.won);
      }),
    );
    expect(Math.abs(mean(targets) - 41)).toBeLessThan(2);
    expect(Math.abs(mean(wins) - mean(targets))).toBeLessThan(2);
    const [mt, mw] = [mean(targets), mean(wins)];
    const r = sum(targets.map((t, i) => (t - mt) * (wins[i] - mw))) / Math.sqrt(sum(targets.map((t) => (t - mt) ** 2)) * sum(wins.map((w) => (w - mw) ** 2)));
    expect(r).toBeGreaterThan(0.5);
    // unbiased across the range, not just on average: a win more of target is about a win more won, and
    // neither the weakest third nor the strongest misses its targets by much either way
    const slope = sum(targets.map((t, i) => (t - mt) * (wins[i] - mw))) / sum(targets.map((t) => (t - mt) ** 2));
    expect(slope).toBeGreaterThan(0.7);
    expect(slope).toBeLessThan(1.3);
    const order = targets.map((_, i) => i).sort((a, b) => targets[a] - targets[b]);
    const third = Math.floor(order.length / 3);
    for (const part of [order.slice(0, third), order.slice(-third)]) expect(Math.abs(mean(part.map((i) => wins[i] - targets[i])))).toBeLessThan(4);
  });

  it("grades an average roster's seasons around zero, few of them below the firing line", () => {
    const grades = openings.flatMap((all, s) => all.filter((og) => Math.abs(goal(og, 'wins')!.target - 41) <= 6).map((og) => gradeOwnerGoals(ends[s], og).grade));
    expect(grades.length).toBeGreaterThan(15);
    expect(Math.abs(mean(grades))).toBeLessThan(0.2);
    expect(grades.filter((g) => g < FIRING_LINE).length / grades.length).toBeLessThan(0.25);
  });

  it('reports each goal mid-season: the record and a projection, the seed, the money so far', () => {
    expect(mid).toHaveLength(2);
    for (const m of mid) {
      const left = 82 - m.won - m.lost;
      for (const p of m.progress) {
        expect(['ahead', 'on track', 'behind', 'met', 'missed']).toContain(p.status);
        expect(p.fill).toBeGreaterThanOrEqual(0);
        expect(p.fill).toBeLessThanOrEqual(1);
        if (p.goal.kind === 'wins') {
          expect(p.now).toBe(m.won);
          expect(p.projected).toBeGreaterThanOrEqual(m.won);
          expect(p.projected).toBeLessThanOrEqual(m.won + left);
          expect(p.text).toBe(`${m.won}-${m.lost}, projected ${p.projected} wins`);
          const want = p.projected >= p.goal.target + 3 ? 'ahead' : p.projected >= p.goal.target - 1 ? 'on track' : 'behind';
          if (m.won < p.goal.target && m.won + left >= p.goal.target) expect(p.status).toBe(want);
        }
        if (p.goal.kind === 'postseason') expect(p.text).toMatch(/^\d+(st|nd|rd|th) in the (East|West)$/);
        if (p.goal.kind === 'profit') expect(p.text).toMatch(/^−?\$\d+\.\dM so far, projected −?\$\d+\.\dM$/);
        if (p.goal.kind === 'payroll') expect(p.text).toMatch(/^\$\d+\.\dM, \$\d+\.\dM (under|over)$/);
        if (p.goal.kind === 'youth') expect(p.text).toMatch(/^[\d,]+ so far, projected [\d,]+$/);
      }
    }
  });

  it('checks in once at the All-Star break, and warns at most once when the team falls off pace', () => {
    for (const s of [0, 1]) {
      const season = ends[s].season;
      const mail = ends[s].inbox.filter((m) => m.season === season && m.from === 'Owner');
      expect(mail.filter((m) => m.subject === 'All-Star break check-in')).toHaveLength(1);
      expect(mail.filter((m) => m.subject === "We're off pace").length).toBeLessThanOrEqual(1);
      expect(mail.find((m) => m.subject === 'All-Star break check-in')!.body).toMatch(/^At the break, (1 of my \d goals is|[02-9] of my \d goals are) on track\./);
    }
  });

  it('reviews each season goal by goal: the history, the standing and the inbox', () => {
    const reviews = l.ownerReviews!;
    expect(reviews.map((r) => r.season)).toEqual([l.season - 1, l.season]);
    reviews.forEach((r, s) => {
      expect(r.tid).toBe(4);
      expect(r.goals.map((g) => g.title)).toEqual(mine[s].goals.map((g) => g.title));
      expect(r.grade).toBeCloseTo(sum(r.goals.map((g) => g.weight * g.grade)), 1);
      for (const g of r.goals) expect(Math.abs(g.grade)).toBeLessThanOrEqual(1);
      const mail = ends[s].inbox.find((m) => m.season === r.season && m.subject === 'Season review')!;
      for (const g of r.goals) expect(mail.body).toContain(`${g.title} — `);
    });
    // the first season sets the standing, the second counts 40%
    expect(reviews[0].total).toBeCloseTo(reviews[0].grade, 2);
    expect(reviews[1].total).toBeCloseTo(0.4 * reviews[1].grade + 0.6 * reviews[0].total, 1);
    expect(l.ownerMood.total).toBe(reviews[1].total);
    // within the grace period nobody is fired
    expect(l.fired).toBeFalsy();
  });
});

describe('grading', () => {
  it('is relative: beating a low bar pleases him, a stacked team under its target does not', () => {
    const l = preseason();
    const outlook = leagueOutlook(l);
    const order = [...outlook].sort((a, b) => a.talent - b.talent);
    const weak = planOwnerGoals(l, order[0].tid, outlook)!;
    const strong = planOwnerGoals(l, order[29].tid, outlook)!;
    const [lo, hi] = [goal(weak, 'wins')!.target, goal(strong, 'wins')!.target];
    expect(hi - lo).toBeGreaterThan(15);
    // every goal met: a small plus
    results(l, weak);
    expect(gradeOwnerGoals(l, weak).grade).toBeGreaterThanOrEqual(0);
    // a weak roster that wins six more than its target, still a losing record, grades well
    results(l, weak, { wins: lo + 6 });
    expect(lo + 6).toBeLessThan(41);
    const w = gradeOwnerGoals(l, weak);
    expect(w.goals.find((g) => g.kind === 'wins')!.grade).toBeCloseTo(6 / WIN_SCALE, 2);
    expect(w.grade).toBeGreaterThan(0.1);
    // a stacked roster that wins eight fewer, still a winning record, and goes out a round early grades badly
    const post = goal(strong, 'postseason')!.target;
    results(l, strong, { wins: hi - 8, postseason: post - 1 });
    expect(hi - 8).toBeGreaterThan(41);
    const s = gradeOwnerGoals(l, strong);
    expect(s.goals.find((g) => g.kind === 'wins')!.grade).toBeCloseTo(-8 / WIN_SCALE, 2);
    expect(s.goals.find((g) => g.kind === 'postseason')!.grade).toBeCloseTo(-0.35, 2);
    expect(s.grade).toBeLessThan(-0.2);
    // a near miss costs little
    results(l, strong, { wins: hi - 2 });
    expect(gradeOwnerGoals(l, strong).grade).toBeGreaterThan(-0.15);
  });
});

describe('in season', () => {
  it('reads the progress, warns once when the team falls off pace, and checks in once at the All-Star break', () => {
    const l = preseason();
    start(l);
    const og = currentGoals(l)!;
    const target = goal(og, 'wins')!.target;
    const ts = curTeamSeason(l, U);
    // half a season played (the forecast reads the schedule left), then a record well under his pace
    while (ts.won + ts.lost < 41) simDay(l);
    expect(l.day).toBeLessThan(l.allStarDay - 14);
    const gp = ts.won + ts.lost;
    const bad = Math.max(0, Math.round((target * gp) / 82) - 9);
    [ts.won, ts.lost] = [bad, gp - bad];
    const quick = ownerProgress(l).find((p) => p.goal.kind === 'wins')!;
    expect(quick.status).toBe('behind');
    expect(quick.text).toBe(`${bad}-${gp - bad}, projected ${quick.projected} wins`);
    // the screens pass the season forecast: its projected record, as the odds line beside it shows it
    const fc = forecast(l)!;
    const wins = ownerProgress(l, og, fc).find((p) => p.goal.kind === 'wins')!;
    expect(wins.projected).toBe(Math.round(fc.teams[U].w));
    expect(wins.status).toBe('behind');
    expect(wins.projected).toBeLessThan(target - 5);
    const off = () => l.inbox.filter((m) => m.subject === "We're off pace").length;
    const before = off();
    // he looks once a week
    l.day += 6 - (l.day % 7);
    // a coach his review could fire hears it as big news (it stops a sim); in the grace period, not
    const veteran = structuredClone(l);
    veteran.tenureStart = veteran.season - 3;
    ownerCheckIn(veteran);
    expect(veteran.inbox.find((m) => m.subject === "We're off pace")?.important).toBe(true);
    ownerCheckIn(l);
    ownerCheckIn(l);
    expect(off()).toBe(1);
    expect(l.inbox.find((m) => m.subject === "We're off pace")?.important).toBe(false);
    if (before === 0) expect(l.inbox[0].body).toContain(`on course for about ${Math.round(forecast(l)!.teams[U].w)} wins. I expected ${target}`);
    l.day += 7;
    ownerCheckIn(l);
    expect(off()).toBe(1);
    // ahead of the pace instead
    const good = Math.min(gp, Math.round((target * gp) / 82) + 8);
    [ts.won, ts.lost] = [good, gp - good];
    expect(ownerProgress(l, og, forecast(l)).find((p) => p.goal.kind === 'wins')!.status).toMatch(/^(ahead|met)$/);
    l.day = l.allStarDay;
    ownerCheckIn(l);
    ownerCheckIn(l);
    expect(l.inbox.filter((m) => m.subject === 'All-Star break check-in')).toHaveLength(1);
    expect(currentGoals(l)!.sent!.sort()).toEqual(['allStar', 'pace']);
  });
});

describe('the review', () => {
  it('maps the goals onto the standing, keeps the last ten seasons, and grades a season without goals the old way', () => {
    const l = preseason();
    start(l);
    const og = currentGoals(l)!;
    results(l, og, { wins: goal(og, 'wins')!.target + 6 });
    ownerEvaluation(l);
    const r = l.ownerReviews![0];
    const wg = r.goals.find((g) => g.kind === 'wins')!.grade;
    expect(wg).toBeCloseTo(6 / WIN_SCALE, 2);
    // the first season sets each part (a part without a goal keeps its value: 0 here)
    expect(l.ownerMood.wins).toBeCloseTo(wg, 2);
    expect(l.ownerMood.total).toBeCloseTo(r.grade, 2);
    if (goal(og, 'youth')) expect(l.ownerMood.youth).toBeDefined();
    else expect(l.ownerMood.youth).toBeUndefined();
    expect(l.inbox[0].subject).toBe('Season review');
    expect(l.inbox[0].body.split('\n')).toHaveLength(1 + og.goals.length);
    // the history keeps the last REVIEWS_KEPT seasons
    for (let i = 0; i < 12; i++) {
      l.season++;
      l.ownerGoals = { ...structuredClone(og), season: l.season };
      results(l, l.ownerGoals);
      ownerEvaluation(l);
    }
    expect(l.ownerReviews).toHaveLength(REVIEWS_KEPT);
    expect(l.ownerReviews![REVIEWS_KEPT - 1].season).toBe(l.season);
    // no goals for the season: the old absolute grades, and an empty review
    l.season++;
    delete l.ownerGoals;
    ownerEvaluation(l);
    expect(l.ownerReviews!.at(-1)).toMatchObject({ season: l.season, goals: [] });
    expect(l.inbox[0].body).toMatch(/^I'm .*\. Wins: [+-]\d+ · Playoffs: [+-]\d+ · Finances: [+-]\d+\./);
  });
});

describe('firing', () => {
  /** The user's season `n` times over: goals met (`bad`: twenty wins under the roster, no postseason, $40M short), reviewed each time. */
  function seasons(l: League, og: OwnerGoals, n: number, bad: boolean) {
    for (let i = 0; i < n && !l.fired; i++) {
      l.season++;
      l.ownerGoals = { ...structuredClone(og), season: l.season };
      results(l, l.ownerGoals, bad ? { wins: goal(og, 'wins')!.target - 20, postseason: 0, profit: (goal(og, 'profit')?.target ?? 0) - 40_000 * revenueScale(l) } : {});
      ownerEvaluation(l);
    }
  }

  /**
   * A league whose user team's owner sets a `money` goal, a playoff goal and no development goal, past
   * the grace period at a neutral standing (a profit goal and a playoff goal: a fictional league's team,
   * the real league's are over the tax or not playoff teams).
   */
  function setup(money: 'profit' | 'payroll') {
    const real = money === 'payroll';
    const probe = preseason(7, U, real);
    const outlook = leagueOutlook(probe);
    const fits = (og: OwnerGoals) => !!goal(og, money) && (goal(og, 'postseason')?.target ?? 0) >= 2 && !goal(og, 'youth');
    const tid = probe.teams.find((t) => fits(planOwnerGoals(probe, t.tid, outlook)!))!.tid;
    const l = preseason(7, tid, real);
    start(l);
    const og = structuredClone(currentGoals(l)!);
    expect(fits(og)).toBe(true);
    l.tenureStart = l.season - 4;
    l.ownerMood = { wins: 0, playoffs: 0, money: 0, total: 0 };
    return { l, og };
  }

  it('never fires a coach whose seasons meet the goals; twenty wins under the roster two seasons running puts him in trouble', () => {
    const a = setup('profit');
    seasons(a.l, a.og, 10, false);
    expect(a.l.fired).toBeFalsy();
    expect(a.l.ownerMood.total).toBeGreaterThanOrEqual(0);
    // out of the postseason and short of the budget too: fired after the second
    const b = setup('profit');
    seasons(b.l, b.og, 1, true);
    expect(b.l.fired).toBeFalsy();
    expect(b.l.ownerReviews!.at(-1)!.grade).toBeLessThan(-0.85);
    expect(b.l.inbox[0].body).toMatch(/serious conversation/);
    seasons(b.l, b.og, 1, true);
    expect(b.l.fired).toBe(true);
    expect(b.l.ownerMood.total).toBeLessThan(FIRING_LINE);
    expect(b.l.ownerReviews!.at(-1)!.fired).toBe(true);
    expect(b.l.inbox[0].subject).toBe("You're fired");
    for (const g of b.og.goals) expect(b.l.inbox[0].body).toContain(`${g.title} — `);
    // a payroll goal kept (no money lost to it) doesn't save him: in trouble after two, gone after a third
    const c = setup('payroll');
    seasons(c.l, c.og, 2, true);
    expect(c.l.ownerMood.total).toBeLessThan(-0.4);
    seasons(c.l, c.og, 1, true);
    expect(c.l.fired).toBe(true);
  });

  it('respects the grace period and job security', () => {
    for (const [tenure, security, fired] of [
      [1, true, false],
      [2, true, false],
      [3, true, true],
      [3, false, false],
    ] as const) {
      const { l, og } = setup('profit');
      l.settings.jobSecurity = security;
      // a standing already on the hot seat, then a terrible season in his `tenure`th season in charge
      l.ownerMood.total = -0.5;
      l.tenureStart = l.season + 1 - (tenure - 1);
      seasons(l, og, 1, true);
      expect(!!l.fired, `season ${tenure}, job security ${security}`).toBe(fired);
    }
  });
});

describe('takeovers', () => {
  it('mid-season: the new owner sets goals from that day, prorated to the games left', () => {
    const l = preseason();
    start(l);
    for (let d = 0; d < 15; d++) simDay(l);
    const to = 3;
    const ts = curTeamSeason(l, to);
    const gp = ts.won + ts.lost;
    expect(gp).toBeGreaterThan(0);
    takeOverTeam(l, to);
    const og = currentGoals(l)!;
    expect(og).toMatchObject({ tid: to, games: 82 - gp, from: { day: l.day, won: ts.won, lost: ts.lost } });
    expect(og.goals[0].title).toBe(`Win ${og.goals[0].target} of the last ${82 - gp} games`);
    expect(og.goals[0].target).toBeLessThan(82 - gp);
    expect(l.ownerMood).toEqual({ wins: 0, playoffs: 0, money: 0, total: 0 });
    expect(l.inbox[0].subject).toBe('My goals for the rest of the season');
    // only the games after he took over count
    ts.won += 3;
    expect(goalResult(l, og, og.goals[0])).toBe(3);
  });

  it('in the preseason the new owner waits for opening night; after the season, for the next one; in the postseason he wants the next round', () => {
    const l = preseason();
    l.ownerGoals = planOwnerGoals(l, U)!;
    takeOverTeam(l, 6);
    expect(l.ownerGoals).toBeUndefined();
    start(l);
    expect(currentGoals(l)).toMatchObject({ tid: 6, games: 82 });
    expect(currentGoals(l)!.from).toBeUndefined();
    // the playoffs: a team in the first round is asked to win it
    const p = structuredClone(l);
    p.phase = 'playoffs';
    curTeamSeason(p, 8).playoffRound = 1;
    takeOverTeam(p, 8);
    expect(currentGoals(p)!.goals).toEqual([{ kind: 'postseason', title: 'Win a playoff round', target: 3, weight: 1 }]);
    // a team whose season is over has none until opening night
    curTeamSeason(p, 9).playoffRound = -1;
    takeOverTeam(p, 9);
    expect(p.ownerGoals).toBeUndefined();
    const o = structuredClone(l);
    o.phase = 'draftLottery';
    takeOverTeam(o, 10);
    expect(o.ownerGoals).toBeUndefined();
  });
});

describe('saves', () => {
  it('keep the goals and reviews; a save without them loads, and damaged ones are dropped', async () => {
    const l = preseason();
    start(l);
    results(l, currentGoals(l)!);
    ownerEvaluation(l);
    currentGoals(l)!.sent = ['allStar'];
    await saveLeague(l);
    const back = (await loadLeague(l.id))!;
    expect(back.ownerGoals).toEqual(l.ownerGoals);
    expect(back.ownerReviews).toEqual(l.ownerReviews);
    // a save from before goals: it loads, the preseason shows what he would set, and a season under way gets them from that day
    const old = structuredClone(l);
    delete old.ownerGoals;
    delete old.ownerReviews;
    const m = migrate(old);
    expect(m.ownerGoals).toBeUndefined();
    const pre = structuredClone(m);
    pre.phase = 'preseason';
    pre.day = 0;
    for (const t of pre.teams) Object.assign(curTeamSeason(pre, t.tid), { won: 0, lost: 0, homeWon: 0, homeLost: 0 });
    expect(planOwnerGoals(pre, pre.userTid)!.goals.length).toBeGreaterThanOrEqual(3);
    m.phase = 'regular';
    m.day = 20;
    Object.assign(curTeamSeason(m, m.userTid), { won: 8, lost: 6 });
    ownerCheckIn(m);
    expect(currentGoals(m)!.from!.day).toBe(20);
    // damaged goals go; a damaged review goes and the rest stay; a development part that isn't a number goes
    const bad = structuredClone(l);
    (bad.ownerGoals as unknown as { goals: unknown }).goals = [{ kind: 'wins', title: 7 }];
    bad.ownerReviews = [...structuredClone(l.ownerReviews!), { season: 'x' } as unknown as OwnerReview, { ...structuredClone(l.ownerReviews![0]), tid: 99 }];
    (bad.ownerMood as { youth?: unknown }).youth = 'lots';
    const fixed = migrate(bad);
    expect(fixed.ownerGoals).toBeUndefined();
    expect(fixed.ownerReviews).toEqual(l.ownerReviews);
    expect(fixed.ownerMood.youth).toBeUndefined();
    const junk = structuredClone(l);
    (junk as unknown as { ownerReviews: unknown }).ownerReviews = 'none';
    (junk as unknown as { ownerGoals: unknown }).ownerGoals = { season: l.season, tid: U, games: 82, goals: [], from: 3 };
    const j = migrate(junk);
    expect(j.ownerReviews).toEqual([]);
    expect(j.ownerGoals).toBeUndefined();
  });
});
