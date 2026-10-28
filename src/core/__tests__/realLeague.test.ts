// Two seasons of the real league with the user's Knicks. The owner's goals: set on opening night from
// the roster the team opens with, frozen for the season and the same for the same league (never
// drawing from its random stream); win targets that are unbiased across the league over simulated
// seasons; grades relative to the targets, so beating a low bar pleases him and a stacked team that
// underachieves doesn't; in-season progress and check-ins; the review and its history; takeovers;
// firing (grace, job security, and where the line sits); saves. The user's legacy (legacy.ts,
// legacyPulse.ts, legacyReview.ts) over a season: milestones once and at the right counts, a save from
// before the legacy, the cabinet, the pulse, the owner's monthly check-ins, the season's review, and
// none of it changing how the league plays out. And the real Cup in its December window, and the
// user's nights on the front page.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { autoDraftUserPick, finishDraftPhase, newSeason, simDay, startDraft, startFreeAgency, startRegularSeason } from '../league/season';
import { nextPick } from '../league/draft';
import { CAP_FOR, curTeamSeason, freeAgents, payroll, revenueScale, standardRoster, statsLine, teamSeason } from '../league/helpers';
import { askingContract, releasePlayer, valueScore } from '../league/contracts';
import { userOffer } from '../league/freeAgency';
import { FIRING_LINE, ownerEvaluation, takeOverTeam } from '../league/owner';
import { levelOdds } from '../league/jobSecurity';
import {
  forcedPayroll,
  CROWN_GRADE,
  FLOOR_MARGIN,
  PAY_RAISE,
  PAYROLL_SLACK,
  FLOOR_GAMES,
  FLOOR_GRADE,
  FLOOR_SLOPE,
  HOLD_OVER_READ,
  PATIENCE_STEP,
  POSTSEASON_ODDS,
  REVIEWS_KEPT,
  WIN_SCALE,
  WIN_SLIDE,
  currentGoals,
  floorCap,
  goalResult,
  goalsRecord,
  goalsWhy,
  gradeOwnerGoals,
  rebuildRun,
  leagueOutlook,
  ownerCheckIn,
  ownerPersonality,
  ownerProgress,
  patienceCap,
  planOwnerGoals,
  seasonBudget,
  type GoalProgress,
  type OwnerGoalKind,
  type OwnerGoals,
  type OwnerReview,
} from '../league/ownerGoals';
import { coachCareer, userCoach } from '../league/coaches';
import { userGameOnDay } from '../league/games';
import { STREAK_MARKS, WIN_MARKS, cabinet, coachRanks, ensureLegacy, legacyDay, legacyGame, reviewPath, winValue } from '../league/legacy';
import { PULSE_EVERY, PULSE_KEPT, fanLine, fanScore, pulseNow } from '../league/legacyPulse';
import { buildSeasonReview, vsPress } from '../league/legacyReview';
import { loadLeague, migrate, saveLeague } from '../../state/persistence';
import { forecast } from '../analysis/odds';
import { playerAge, salaryFor } from '../playerGen';
import { CAP } from '../constants';
import { FREE_AGENT, type League, type NewsItem } from '../types';

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

/** The league with everything the legacy writes taken out: what's left must be the same with or without it. */
function withoutLegacy(l: League) {
  const { legacy, inbox, news, nextMsgId, ...rest } = l;
  void legacy;
  void inbox;
  void news;
  void nextMsgId;
  return JSON.stringify(rest);
}

/** A finished regular schedule: 1,230 games, 82 a team, 40-42 at home, never two on a day or three in three days. */
function checkFinalSchedule(league: League) {
  const regular = league.schedule.filter((g) => g.type === 'regular');
  expect(regular).toHaveLength(1230);
  for (const t of league.teams) {
    const mine = regular.filter((g) => g.home === t.tid || g.away === t.tid);
    expect(mine).toHaveLength(82);
    const homes = mine.filter((g) => g.home === t.tid).length;
    expect(homes).toBeGreaterThanOrEqual(40);
    expect(homes).toBeLessThanOrEqual(42);
    const days = league.schedule
      .filter((g) => g.home === t.tid || g.away === t.tid)
      .map((g) => g.day)
      .sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThan(days[i - 1]);
    for (let i = 2; i < days.length; i++) expect(days[i] - days[i - 2]).toBeGreaterThan(2);
  }
}

describe('two seasons of the real league', () => {
  let l: League;
  /** The preseason (the user's roster fit), and the first season on opening night, 15 days in, at 41 games, on day 90 and the day after the Cup final. */
  let pre: League;
  let opening: League;
  let day15: League;
  let half: League;
  let day90: League;
  let afterCup: League;
  /** The user's front pages in the first regular season. */
  let frontPages: NewsItem[] | undefined;
  /** Every team's goals on each opening night, and the league once each season was over. */
  const openings: OwnerGoals[][] = [];
  const ends: League[] = [];
  /** The user's goals and their progress at about 41 games each season. */
  const mid: { og: OwnerGoals; progress: GoalProgress[]; won: number; lost: number }[] = [];
  const mine: OwnerGoals[] = [];

  beforeAll(() => {
    l = preseason();
    l.id = 'lg_legacy';
    pre = structuredClone(l);
    for (let s = 0; s < 2; s++) {
      start(l);
      if (s === 0) opening = structuredClone(l);
      const outlook = leagueOutlook(l);
      openings.push(l.teams.map((t) => planOwnerGoals(l, t.tid, outlook)!));
      mine.push(structuredClone(currentGoals(l)!));
      for (let g = 0; inSeason(l) && g < 500; g++) {
        const ts = curTeamSeason(l, l.userTid);
        if (l.phase === 'regular' && mid.length === s && ts.won + ts.lost >= 41) {
          mid.push({ og: structuredClone(currentGoals(l)!), progress: ownerProgress(l), won: ts.won, lost: ts.lost });
          if (s === 0) half = structuredClone(l);
        }
        if (s === 0) {
          if (g === 15) day15 = structuredClone(l);
          if (l.day === 90 && l.phase === 'regular') day90 = structuredClone(l);
          if (!afterCup && l.day > l.cup!.finalDay + 1) afterCup = structuredClone(l);
        }
        simDay(l);
        if (s === 0 && !frontPages && l.phase !== 'regular')
          frontPages = l.news.filter((n) => n.kind === 'game' && n.tids[0] === l.userTid && n.weight === 3 && n.day <= l.regularSeasonDays);
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

  it('sets the owner goals so wins track them across the league, reports them through each season, and reviews each season', () => {
    // win targets are unbiased across the league and track the wins
    {
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
    }

    // an average roster's seasons grade around zero, few of them below the firing line
    {
      const grades = openings.flatMap((all, s) => all.filter((og) => Math.abs(goal(og, 'wins')!.target - 41) <= 6).map((og) => gradeOwnerGoals(ends[s], og).grade));
      expect(grades.length).toBeGreaterThan(15);
      expect(Math.abs(mean(grades))).toBeLessThan(0.2);
      expect(grades.filter((g) => g < FIRING_LINE).length / grades.length).toBeLessThan(0.25);
    }

    // each goal is reported mid-season: the record and a projection, the seed, the money so far
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

    // the owner checks in once at the All-Star break, and warns at most once when the team falls off pace
    for (const s of [0, 1]) {
      const season = ends[s].season;
      const mail = ends[s].inbox.filter((m) => m.season === season && m.from === 'Owner');
      expect(mail.filter((m) => m.subject === 'All-Star break check-in')).toHaveLength(1);
      expect(mail.filter((m) => m.subject === "We're off pace").length).toBeLessThanOrEqual(1);
      expect(mail.find((m) => m.subject === 'All-Star break check-in')!.body).toMatch(/^At the break, (1 of my \d goals is|[02-9] of my \d goals are) on track\./);
    }

    // he reviews each season goal by goal: the history, the standing and the inbox
    const reviews = l.ownerReviews!;
    expect(reviews.map((r) => r.season)).toEqual([l.season - 1, l.season]);
    reviews.forEach((r, s) => {
      expect(r.tid).toBe(U);
      expect(r.goals.map((g) => g.title)).toEqual(mine[s].goals.map((g) => g.title));
      // (a record under his floor caps the grade, a title or a deep run lifts it)
      const rec = goalsRecord(ends[s], mine[s]);
      const graded = Math.min(sum(r.goals.map((g) => g.weight * g.grade)), floorCap(mine[s], rec.won, rec.games));
      expect(r.grade).toBeCloseTo(Math.max(graded, r.crowned ? CROWN_GRADE[r.crowned] : -1), 1);
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

  it('sets the owner goals on opening night, grades them against the targets, reads them in season, and acts on them: reviews, firings, takeovers and saves', async () => {
    // opening night sets three or four goals from the roster, frozen for the season and the same for the same league, without drawing from its random stream
    {
      const l = structuredClone(pre);
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
          /^(Win \d+ games|Reach the play-in|Make the playoffs|Win a playoff round|Reach the conference finals|Reach the Finals|Turn a \$\d+\.\dM profit|Break even|Keep the loss under \$\d+\.\dM|Stay under the luxury tax|Get under the luxury tax|Stay under the first apron|Get under the first apron|Add nothing to the payroll you inherited|Keep the payroll under \$\d+\.\dM|Play your young players: [\d,]+ minutes for players 23 or under)$/,
        );
      // he says so, with each goal's weight
      const mail = l.inbox.find((m) => m.subject === 'My goals for this season')!;
      for (const g of og.goals) expect(mail.body).toContain(`${g.title} (${Math.round(g.weight * 100)}% of my review)`);
      // frozen: a week of games and a roster move later, the goals are the ones set on opening night
      const before = structuredClone(og.goals);
      for (let d = 0; d < 7; d++) simDay(l);
      releasePlayer(l, standardRoster(l, U).sort((a, b) => b.ovr - a.ovr)[0], { news: false });
      expect(currentGoals(l)!.goals).toEqual(before);
    }

    // a stronger roster is asked for more wins
    {
      const l = structuredClone(pre);
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
    }

    // the postseason, development and money goals follow the projection, the strategy and the payroll; every owner has a personality of his own
    {
      const l = structuredClone(pre);
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
        // (every payroll here is one a new coach would inherit: none is a plan to win, whatever its
        // rank, so a rebuild stays one; a payroll of the coach's own is, below)
        // the strategy and the rank say how far he'd ask, the season forecast how far he can: never a
        // level it gives less than POSTSEASON_ODDS (Minnesota on Hard had been asked to win a round at 9%)
        const odds = outlook[og.tid].odds!;
        let most = 5;
        while (most > 0 && levelOdds(odds, most) < POSTSEASON_ODDS) most--;
        const want = t.strategy === 'rebuild' || r >= 11 ? 0 : r <= 4 || t.strategy === 'contend' ? 3 : r <= 8 ? 2 : 1;
        if (Math.min(want, most) === 0) {
          expect(post, t.abbrev).toBeUndefined();
          expect(goal(og, 'youth'), t.abbrev).toBeDefined();
        } else if (want >= 3) {
          expect(post!.target, t.abbrev).toBeGreaterThanOrEqual(Math.min(3, most));
          expect(post!.target, t.abbrev).toBeLessThanOrEqual(most);
        } else expect(post!.target, t.abbrev).toBe(Math.min(want, most));
        if (post) expect(levelOdds(odds, post.target), t.abbrev).toBeGreaterThanOrEqual(POSTSEASON_ODDS);
        const pay = payroll(l, og.tid);
        if (pay <= line * 0.94) expect(goal(og, 'profit'), t.abbrev).toBeDefined();
        // the tax line is his limit (a win-now owner's the first apron), or the payroll a coach would
        // inherit past it: add nothing to that
        else {
          const own = ownerPersonality(l, og.tid) === 'win-now' && pay > line ? CAP_FOR(l).firstApron : line;
          const forced = forcedPayroll(l, og.tid);
          // (rounded up, with PAYROLL_SLACK of room: a coach who adds nothing is never over it)
          if (forced > own)
            expect(goal(og, 'payroll')!, t.abbrev).toMatchObject({
              target: Math.ceil((forced + PAYROLL_SLACK * line) / 100) * 100,
              line: own,
              title: 'Add nothing to the payroll you inherited',
            });
          else if (own > line) expect(goal(og, 'payroll')!.target, t.abbrev).toBe(own);
          else expect(goal(og, 'payroll')!, t.abbrev).toMatchObject({ target: line, title: pay <= line ? 'Stay under the luxury tax' : 'Get under the luxury tax' });
        }
        // the expectation (the season forecast's) and the target agree, but for the owner's nudge of a
        // win or two and the floor (normal: a .300 pace, never closer than FLOOR_MARGIN wins under his
        // read); a payroll the coach inherited doesn't raise it
        const wins = goal(og, 'wins')!;
        const exp = outlook[og.tid].pct * 82;
        expect(og.floor, t.abbrev).toBeCloseTo(Math.max(0.1, Math.min(0.3, outlook[og.tid].pct - FLOOR_MARGIN / 82)), 3);
        expect(wins.payRank, t.abbrev).toBeUndefined();
        expect(Math.abs(wins.target - Math.max(exp, 82 * og.floor!)), t.abbrev).toBeLessThanOrEqual(2.5);
      }
      // after his first season, a payroll of his own in the league's top half raises it, PAY_RAISE wins at most
      {
        const m = structuredClone(l);
        const mo = leagueOutlook(m);
        const pays = m.teams.map((x) => payroll(m, x.tid));
        const rankOf = (tid: number) => 1 + pays.filter((q, i) => i !== tid && (q > pays[tid] || (q === pays[tid] && i < tid))).length;
        const sorted = mo.map((o) => o.pct).sort((a, b) => b - a);
        // (the team paid furthest past what its roster should win)
        const short = (o: (typeof mo)[number]) => sorted[rankOf(o.tid) - 1] - o.pct;
        const tid = mo.filter((o) => rankOf(o.tid) <= 15).sort((a, b) => short(b) - short(a))[0].tid;
        m.userTid = tid;
        // (in charge long enough that the contracts are his, not inherited)
        m.tenureStart = m.season - 10;
        const plan = planOwnerGoals(m, tid, mo)!;
        const raised = goal(plan, 'wins')!;
        expect(raised.payRank).toBe(rankOf(tid));
        expect(raised.target - mo[tid].pct * 82).toBeLessThanOrEqual(PAY_RAISE + 2.5);
        // and a payroll of his own in the top half is no rebuild: the play-in at least, whatever the label
        expect(goal(plan, 'postseason')?.target ?? 0).toBeGreaterThanOrEqual(1);
      }
      // the stronger the roster, the higher the bar: targets follow the talent
      const byTalent = [...all].sort((a, b) => outlook[a.tid].talent - outlook[b.tid].talent);
      expect(goal(byTalent[29], 'wins')!.target).toBeGreaterThan(goal(byTalent[0], 'wins')!.target + 15);
      const who = l.teams.map((t) => ownerPersonality(l, t.tid));
      expect(new Set(who).size).toBe(3);
      expect(l.teams.map((t) => ownerPersonality(structuredClone(l), t.tid))).toEqual(who);
    }

    // the budget doesn't count on money a team under the salary floor will pay to reach it
    {
      const l = structuredClone(pre);
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
    }

    // grading is relative: beating a low bar pleases him, a stacked team under its target does not
    {
      const l = structuredClone(pre);
      const outlook = leagueOutlook(l);
      // (the lowest bar and the highest: a roster's talent on opening night counts its injured out, its target doesn't)
      const plans = outlook.map((o) => planOwnerGoals(l, o.tid, outlook)!).sort((a, b) => goal(a, 'wins')!.target - goal(b, 'wins')!.target);
      const weak = plans[0];
      const strong = plans[plans.length - 1];
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
      // a title is what the season is remembered for: Excellent at least, whatever the wins and the money did
      results(l, strong, { wins: hi - 8, postseason: 6, payroll: CAP_FOR(l).luxuryTax * 2, profit: -500_000 });
      expect(gradeOwnerGoals(l, strong)).toMatchObject({ grade: CROWN_GRADE.title, crowned: 'title' });
      // and so is a run two rounds past the goal
      if (post + 2 <= 5) {
        results(l, strong, { wins: hi - 8, postseason: post + 2 });
        expect(gradeOwnerGoals(l, strong).crowned).toBe('run');
        expect(gradeOwnerGoals(l, strong).grade).toBeGreaterThanOrEqual(CROWN_GRADE.run);
      }
    }

    // outside a rebuild, the bar falls at most WIN_SLIDE a season under the same coach: a roster run down doesn't lower it
    {
      const l = structuredClone(pre);
      const outlook = leagueOutlook(l);
      const tid = [...outlook].sort((a, b) => b.talent - a.talent)[0].tid;
      const base = goal(planOwnerGoals(l, tid, outlook)!, 'wins')!.target;
      const last = (games?: number): OwnerReview => ({
        season: l.season - 1,
        tid,
        goals: [{ kind: 'wins', title: '', target: base + 12, weight: 1, result: 0, grade: 0 }],
        grade: 0,
        total: 0,
        ...(games ? { games } : {}),
      });
      l.ownerReviews = [last(82)];
      const held = planOwnerGoals(l, tid, outlook)!;
      // (and never more than HOLD_OVER_READ over his read: a Wizards coach on Hard had been held to 30 on a 16-win read)
      const read = outlook[tid].pct * 82;
      const target = Math.min(base + 12 - WIN_SLIDE, Math.round(read + HOLD_OVER_READ), Math.round(82 * 0.88));
      expect(goal(held, 'wins')).toMatchObject({ target, held: base + 12 });
      expect(target).toBeLessThan(base + 12 - WIN_SLIDE);
      expect(goalsWhy(held)).toContain(`Last season I asked for ${base + 12} wins. I'm holding the bar at ${target}, ${target - Math.round(read)} over my read of this roster.`);
      // a smaller hold says the rule, and names what the coach himself traded or let go since, not what aged or walked
      {
        const m = structuredClone(l);
        m.ownerReviews = [{ ...last(82), goals: [{ kind: 'wins', title: '', target: base + 4, weight: 1, result: 0, grade: 0 }] }];
        expect(goalsWhy(planOwnerGoals(m, tid, outlook)!)).toContain(`Last season I asked for ${base + 4} wins. I don't lower the bar by more than ${WIN_SLIDE} in a season.`);
        const star = standardRoster(m, tid).sort((a, b) => b.ovr - a.ovr)[0];
        const other = (tid + 1) % 30;
        const name = `${star.firstName} ${star.lastName}`;
        star.tid = other;
        m.transactions = [
          {
            id: 1,
            season: m.season - 1,
            day: 60,
            phase: 'regular',
            kind: 'trade',
            tids: [tid, other],
            user: true,
            sides: [
              { tid, players: [{ pid: star.pid, name }], picks: [] },
              { tid: other, players: [], picks: [] },
            ],
          },
        ];
        const g = goal(planOwnerGoals(m, tid, outlook)!, 'wins')!;
        expect(g.gone).toEqual([name]);
        expect(goalsWhy(planOwnerGoals(m, tid, outlook)!)).toContain(
          `Last season I asked for ${base + 4} wins. Since then you've traded or let go ${name}, and that doesn't lower the bar by more than ${WIN_SLIDE}.`,
        );
      }
      // a mid-season start's prorated target doesn't hold up a full season's
      l.ownerReviews = [last()];
      expect(goal(planOwnerGoals(l, tid, outlook)!, 'wins')!.target).toBe(base);
    }

    // the floor: a season under it grades Poor or worse whatever else went right (a 5-77 season with
    // every other goal met is the worst grade there is), and at the floor the cap is off
    {
      const l = structuredClone(pre);
      const outlook = leagueOutlook(l);
      // (the lowest bar: a roster's talent on opening night counts its injured out, its target doesn't)
      const weak = outlook.map((o) => planOwnerGoals(l, o.tid, outlook)!).sort((a, b) => goal(a, 'wins')!.target - goal(b, 'wins')!.target)[0];
      // (the floor never closer than FLOOR_MARGIN wins under his read: for the weakest roster, under .300)
      const floorOf = (f: number, tid = weak.tid) => Math.round(Math.max(0.1, Math.min(f, outlook[tid].pct - FLOOR_MARGIN / 82)) * 1000) / 1000;
      expect(weak.floor).toBe(floorOf(0.3));
      expect(weak.floor).toBeLessThan(0.3);
      results(l, weak, { wins: 5 });
      const g = gradeOwnerGoals(l, weak);
      expect(g.goals.filter((x) => x.kind !== 'wins').every((x) => x.grade >= 0)).toBe(true);
      expect(g.floored).toBe(true);
      expect(g.grade).toBeCloseTo(Math.max(-1, FLOOR_GRADE - FLOOR_SLOPE * (weak.floor! - 5 / 82)), 2);
      expect(floorCap(weak, 10, 82)).toBeCloseTo(FLOOR_GRADE - FLOOR_SLOPE * (weak.floor! - 10 / 82), 5);
      results(l, weak, { wins: 25 });
      expect(gradeOwnerGoals(l, weak).floored).toBeUndefined();
      // (a short stretch after a late takeover doesn't count)
      expect(floorCap(weak, 0, FLOOR_GAMES - 1)).toBe(1);

      // the rebuild clock: Normal gives two seasons in a row without the postseason; in the third he
      // wants the play-in at least, the floor rises, and missing it anyway caps the grade
      const tid = weak.tid;
      expect(goal(weak, 'postseason')).toBeUndefined();
      expect(weak.rebuild).toEqual({ year: 1, of: 2 });
      const reviewed = (season: number, post: boolean): OwnerReview => ({
        season,
        tid,
        goals: [{ kind: post ? 'postseason' : 'youth', title: '', target: 1, weight: 1, result: 0, grade: 0 }],
        grade: 0,
        total: 0,
      });
      l.ownerReviews = [reviewed(l.season - 1, false)];
      expect(planOwnerGoals(l, tid, outlook)).toMatchObject({ rebuild: { year: 2, of: 2 }, floor: floorOf(0.3) });
      expect(goalsWhy(planOwnerGoals(l, tid, outlook)!)).toContain("This is the last of the two seasons without the playoffs I'll give you. After that, I want the play-in.");
      l.ownerReviews = [reviewed(l.season - 2, false), reviewed(l.season - 1, false)];
      const out = planOwnerGoals(l, tid, outlook)!;
      // (his patience out, the floor rises, but never past FLOOR_MARGIN under his read: Hard had asked a roster he read at 16 for 35)
      expect(out).toMatchObject({ rebuild: { year: 3, of: 2, over: true }, floor: floorOf(0.4) });
      expect(goal(out, 'postseason')!.target).toBeGreaterThanOrEqual(1);
      expect(goal(out, 'wins')!.target).toBeGreaterThanOrEqual(Math.round(82 * out.floor!));
      expect(goal(out, 'wins')!.target).toBeLessThanOrEqual(Math.round(outlook[tid].pct * 82) + 2);
      // past his allowance, a season that misses the postseason grades Poor at best, lower each season it goes on; reaching it lifts the cap
      expect(goalsWhy(out)).toContain(
        "2 seasons without the postseason is all I'll take. This season we compete: miss the play-in and it grades −40 at best, whatever else goes right.",
      );
      results(l, out, { postseason: 0 });
      expect(gradeOwnerGoals(l, out)).toMatchObject({ grade: FLOOR_GRADE, impatient: true });
      expect(patienceCap({ rebuild: { year: 5, of: 2, over: true } }, 0)).toBeCloseTo(FLOOR_GRADE - 2 * PATIENCE_STEP, 5);
      results(l, out, { postseason: 1 });
      expect(gradeOwnerGoals(l, out).impatient).toBeUndefined();
      // only a season that reached the postseason (the play-in counts) starts the count again: one that
      // had a postseason goal and missed it doesn't; Easy gives three
      l.ownerReviews = [reviewed(l.season - 3, false), reviewed(l.season - 2, true), reviewed(l.season - 1, false)];
      expect(rebuildRun(l, tid)).toBe(3);
      const reached = teamSeason(l.teams[tid], l.season - 2);
      reached.playIn = true;
      expect(rebuildRun(l, tid)).toBe(1);
      reached.playIn = false;
      // a season he asks to compete in after a miss says the clock is running
      const top = [...outlook].sort((a, b) => b.talent - a.talent)[0].tid;
      l.ownerReviews = [{ ...reviewed(l.season - 1, true), tid: top }];
      const comp = planOwnerGoals(l, top, outlook)!;
      expect(comp).toMatchObject({ missed: { seasons: 1, of: 2 } });
      expect(goalsWhy(comp)).toContain("Last season went without the postseason, one of the 2 I'll allow. Miss it again and I want the play-in at least.");
    }

    // in season he reads the progress, warns once when the team falls off pace, and checks in once at the All-Star break
    {
      // half a season played (the forecast reads the schedule left), then a record well under his pace
      const l = structuredClone(half);
      const og = currentGoals(l)!;
      const target = goal(og, 'wins')!.target;
      const ts = curTeamSeason(l, U);
      expect(l.day).toBeLessThan(l.allStarDay - 14);
      const gp = ts.won + ts.lost;
      // (well under: the forecast regresses the half season left toward the roster's strength, as below)
      const bad = Math.max(0, Math.round((target * gp) / 82) - 12);
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
      // ahead of the pace instead (well ahead: the forecast regresses a half season toward the roster's strength)
      const good = Math.min(gp, Math.round((target * gp) / 82) + 12);
      [ts.won, ts.lost] = [good, gp - good];
      expect(ownerProgress(l, og, forecast(l)).find((p) => p.goal.kind === 'wins')!.status).toMatch(/^(ahead|met)$/);
      l.day = l.allStarDay;
      ownerCheckIn(l);
      ownerCheckIn(l);
      expect(l.inbox.filter((m) => m.subject === 'All-Star break check-in')).toHaveLength(1);
      expect(currentGoals(l)!.sent!.sort()).toEqual(['allStar', 'pace']);
    }

    // the review maps the goals onto the standing, keeps the last ten seasons, and grades a season without goals the old way
    {
      const l = structuredClone(opening);
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
    }

    // firing
    {
      /** The user's season `n` times over: goals met (`bad`: twenty wins under the roster, no postseason, $40M short), reviewed each time. */
      const seasons = (l: League, og: OwnerGoals, n: number, bad: boolean) => {
        for (let i = 0; i < n && !l.fired; i++) {
          l.season++;
          l.ownerGoals = { ...structuredClone(og), season: l.season };
          results(l, l.ownerGoals, bad ? { wins: goal(og, 'wins')!.target - 20, postseason: 0, profit: (goal(og, 'profit')?.target ?? 0) - 40_000 * revenueScale(l) } : {});
          ownerEvaluation(l);
        }
      };
      /**
       * A league whose user team's owner sets a `money` goal, a playoff goal and no development goal, past
       * the grace period at a neutral standing (a profit goal and a playoff goal: a fictional league's team,
       * the real league's are over the tax or not playoff teams).
       */
      const setup = (money: 'profit' | 'payroll') => {
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
      };

      // he never fires a coach whose seasons meet the goals; twenty wins under the roster two seasons running puts him in trouble
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

      // he respects the grace period and job security
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
    }

    // a takeover mid-season: the new owner sets goals from that day, prorated to the games left
    {
      const l = structuredClone(day15);
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
      // the reputation he brought (a review by his last owner on file) survives his first review here:
      // the season counts 40% against it, where a new career's first season sets the standing; the
      // parts are the new owner's own read
      const rep = structuredClone(l);
      rep.ownerReviews = [{ season: rep.season - 1, tid: U, goals: [], grade: -0.6, total: -0.6 }];
      rep.ownerMood.total = -0.3;
      results(rep, og);
      ownerEvaluation(rep);
      const first = rep.ownerReviews!.at(-1)!;
      expect(first.total).toBeCloseTo(0.4 * first.grade + 0.6 * -0.3, 2);
      expect(rep.ownerMood.wins).toBeCloseTo(first.goals.find((g) => g.kind === 'wins')!.grade, 2);
    }

    // in the preseason the new owner waits for opening night; after the season, for the next one; in the postseason he wants the next round
    {
      const l = structuredClone(pre);
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
    }

    // saves keep the goals and reviews; a save without them loads, and damaged ones are dropped
    {
      const l = structuredClone(opening);
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
    }
  }, 300_000);

  it("keeps the user's legacy over a season: milestones once, the cabinet, the pulse, the owner's check-ins and the season's review, without changing how the league plays out", () => {
    const l = ends[0];
    const mid = day90;

    // each milestone fires once, with its news and a mail
    {
      const s = l.legacy!;
      expect(new Set(s.done).size).toBe(s.done.length);
      expect(new Set(s.milestones.map((m) => m.key)).size).toBe(s.milestones.length);
      for (const m of s.milestones) {
        expect(m.head.length).toBeGreaterThan(10);
        expect(l.inbox.some((x) => x.season === m.season && x.link === '/office/career?tab=milestones')).toBe(true);
      }
      // the first win of the career, in the game it came in
      const k = coachCareer(l, userCoach(l)!);
      if (k.won > 0) {
        const first = s.milestones.find((m) => m.key.startsWith('job:'))!;
        const g = l.games.find((x) => x.gid === first.gid)!;
        const mine = l.games
          .filter((x) => x.type === 'regular' && (x.home.tid === U || x.away.tid === U))
          .find((x) => (x.home.tid === U ? x.home.pts > x.away.pts : x.away.pts > x.home.pts));
        expect(g.gid).toBe(mine!.gid);
        // (its news, unless the season's stories have pushed it out of the 400 the save keeps)
        if (l.news[0].season < l.season || l.news[0].day <= first.day) expect(l.news.some((n) => n.kind === 'milestone' && n.head === first.head && n.weight === 3)).toBe(true);
      }
      // career wins: every mark passed, none to come
      for (const n of WIN_MARKS) expect(s.done.includes(`wins:${n}`)).toBe(k.won >= n);
    }

    // a career from before the legacy is marked as reached, without news or mail
    {
      const x = structuredClone(l);
      delete x.legacy;
      const mail = x.inbox.length;
      const news = x.news.length;
      const s = ensureLegacy(x);
      expect(s.milestones).toHaveLength(0);
      expect(x.inbox.length).toBe(mail);
      expect(x.news.length).toBe(news);
      const k = coachCareer(x, userCoach(x)!);
      for (const n of WIN_MARKS) expect(s.done.includes(`wins:${n}`)).toBe(k.won >= n);
      if (k.playoffs) expect(s.done).toContain('playoffs:first');
      if (k.titles) expect(s.done).toContain('title:first');
    }

    // career wins and a streak are reached at the game that gets there, once
    {
      const x = structuredClone(mid);
      delete x.legacy;
      const ts = x.teams[U].seasons.find((s) => s.season === x.season)!;
      // two wins from a hundred, and a nine-game streak: the next win makes ten
      const k0 = coachCareer(x, userCoach(x)!);
      ts.won += 98 - k0.won;
      ts.streak = 9;
      ensureLegacy(x);
      expect(x.legacy!.done).toContain('wins:50');
      expect(x.legacy!.done).not.toContain('wins:100');
      let reached100: number | undefined;
      for (let i = 0; i < 60 && reached100 === undefined; i++) {
        const before = ts.won;
        simDay(x);
        if (ts.won >= 100 && before < 100) reached100 = x.day;
      }
      expect(reached100).toBeDefined();
      const ms = x.legacy!.milestones.filter((m) => m.key === 'wins:100');
      expect(ms).toHaveLength(1);
      expect(x.news.filter((n) => n.kind === 'milestone' && n.head === ms[0].head && n.weight === 3)).toHaveLength(1);
      expect(x.inbox.filter((m) => m.subject === ms[0].head)).toHaveLength(1);
      // the win that made it a hundred is the game it names
      const g = x.games.find((r) => r.gid === ms[0].gid)!;
      expect(g.home.tid === U ? g.home.pts > g.away.pts : g.away.pts > g.home.pts).toBe(true);
      // the streak's ten fired only if the streak got there
      const streakMs = x.legacy!.milestones.filter((m) => m.key === `streak:${x.season}:10`);
      expect(streakMs.length).toBeLessThanOrEqual(1);
      for (let i = 0; i < 10; i++) simDay(x);
      expect(x.legacy!.milestones.filter((m) => m.key === 'wins:100')).toHaveLength(1);
      expect(STREAK_MARKS[0]).toBe(10);

      // a streak held at nine until the next win: its ten is reached once, at that win, dated from the run's first game
      const y = structuredClone(mid);
      const ys = y.teams[U].seasons.find((s) => s.season === y.season)!;
      const key = `streak:${y.season}:10`;
      ensureLegacy(y);
      for (let i = 0; i < 40 && !y.legacy!.done.includes(key); i++) {
        ys.streak = 9;
        simDay(y);
      }
      const run = y.legacy!.milestones.filter((m) => m.key === key);
      expect(run).toHaveLength(1);
      const won = y.games.find((r) => r.gid === run[0].gid)!;
      expect(won.home.tid === U ? won.home.pts > won.away.pts : won.away.pts > won.home.pts).toBe(true);
      const story = y.news.filter((n) => n.kind === 'milestone' && n.head === run[0].head && n.weight === 3);
      expect(story).toHaveLength(1);
      expect(story[0].body).toMatch(/since [A-Z][a-z]{2} \d{1,2}\./);
      for (let i = 0; i < 5; i++) simDay(y);
      expect(y.legacy!.milestones.filter((m) => m.key === key)).toHaveLength(1);
    }

    // the cabinet keeps a Coach of the Month after the press has pruned it
    {
      const x = structuredClone(mid);
      // (from a league whose user hasn't been one yet)
      if (x.legacy) x.legacy.honors = x.legacy.honors.filter((h) => h.kind !== 'cotm');
      x.inbox = x.inbox.filter((m) => m.subject !== 'Coach of the Month');
      const day = x.day;
      x.media = { honors: [{ season: x.season, day, kind: 'cotm', conf: 'E', tid: U, line: 'The Knicks went 12-3 in December.' }] };
      legacyDay(x);
      legacyDay(x);
      expect(x.legacy!.honors).toHaveLength(1);
      expect(x.inbox.filter((m) => m.subject === 'Coach of the Month')).toHaveLength(1);
      x.media.honors = [];
      expect(cabinet(x).filter((t) => t.kind === 'cotm')).toHaveLength(1);
      // another team's honor isn't his
      x.media.honors = [{ season: x.season, day: day + 1, kind: 'cotm', conf: 'W', tid: 3, line: 'x' }];
      legacyDay(x);
      expect(x.legacy!.honors).toHaveLength(1);
    }

    // the pulse keeps a point a week of the owner and the fans, a season at most
    {
      const p = l.legacy!.pulse!;
      expect(p.season).toBe(l.season);
      expect(p.pts.length).toBeGreaterThan(20);
      expect(p.pts.length).toBeLessThanOrEqual(PULSE_KEPT);
      for (let i = 1; i < p.pts.length; i++) expect(p.pts[i][0] - p.pts[i - 1][0]).toBeGreaterThanOrEqual(PULSE_EVERY);
      for (const [, o, f] of p.pts) {
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(100);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(100);
      }
      const now = pulseNow(mid);
      expect(['up', 'down', 'flat']).toContain(now.owner.trend);
      // the fans' line names the city or the arena
      const line = fanLine(mid);
      expect(line).toMatch(/New York|Madison Square Garden|Knicks/);
      expect(fanScore(mid)).toBeGreaterThanOrEqual(0);
    }

    // the owner checks in once a month, in his voice
    {
      const mails = l.inbox.filter((m) => m.season === l.season && / check-in: /.test(m.subject));
      expect(mails.length).toBeGreaterThanOrEqual(3);
      expect(mails.length).toBeLessThanOrEqual(5);
      const months = mails.map((m) => m.subject.split(' ')[0]);
      expect(new Set(months).size).toBe(months.length);
      for (const m of mails) {
        expect(m.from).toBe('Owner');
        expect(m.subject).toMatch(/^(December|January|February|March|April) check-in: [a-z ]+$/);
        // the record and the pace, against his goal
        expect(m.body).toMatch(/you're on pace for \d+ wins; I asked for \d+/);
        expect(m.important).toBeFalsy();
      }
      // (the All-Star break keeps its own check-in)
      expect(l.inbox.filter((m) => m.subject === 'All-Star break check-in')).toHaveLength(1);
    }

    // the season is reviewed when the Finals end, and the owner's verdict opens it
    {
      const r = l.legacy!.reviews.find((x) => x.season === l.season)!;
      expect(r).toBeDefined();
      const ts = l.teams[U].seasons.find((s) => s.season === l.season)!;
      expect([r.won, r.lost]).toEqual([ts.won, ts.lost]);
      expect(r.round).toBe(ts.playoffRound);
      expect(r.ownerWins).toBe(l.ownerGoals!.goals.find((g) => g.kind === 'wins')!.target);
      if (r.best) expect(r.best.season).toBe(l.season);
      expect(r.star?.name.length).toBeGreaterThan(3);
      expect(r.records.length).toBeLessThanOrEqual(4);
      expect(r.next!.wins).toBeGreaterThan(10);
      expect(r.next!.wins).toBeLessThan(72);
      // the career keeps job security only when it was off
      expect(r).not.toHaveProperty('jobSecurity');
      const verdict = l.inbox.find((m) => m.season === l.season && m.subject === 'Season review')!;
      // and the review keeps the owner's own first words, which his verdict opens with
      expect(verdict.body.startsWith(l.ownerReviews!.find((x) => x.season === l.season)!.said!)).toBe(true);
      expect(verdict.link).toBe(reviewPath(l.season));
      // with the press's prediction, the season against it
      const x = structuredClone(l);
      x.media = { preseason: { season: x.season, rows: [{ tid: U, wins: 40, confRank: 9 }] } };
      const rx = buildSeasonReview(x)!;
      expect(rx.press).toEqual({ wins: 40, confRank: 9, champ: false });
      expect(vsPress(rx)).toMatch(/on the prediction|Right on the prediction/);
      // his rank among the coaches in charge
      const ranks = coachRanks(l)!;
      expect(ranks.wins).toBeGreaterThanOrEqual(1);
      expect(ranks.wins).toBeLessThanOrEqual(ranks.of);
    }

    // signature wins are ranked by how big they were
    expect(winValue({ kind: 'title', score: [100, 90], round: 4 })).toBeGreaterThan(winValue({ kind: 'series', score: [100, 90], round: 3 }));
    expect(winValue({ kind: 'upset', score: [100, 99], p: 10 })).toBeGreaterThan(winValue({ kind: 'upset', score: [100, 99], p: 28 }));
    const w = l.legacy!.wins;
    for (let i = 1; i < w.length; i++) expect(w[i - 1].v).toBeGreaterThanOrEqual(w[i].v);

    // it changes nothing about how the league plays out
    // the legacy's hooks on a copy: everything but its own state, the mail and the news stays as it was
    const a = structuredClone(mid);
    const b = structuredClone(mid);
    const before = withoutLegacy(a);
    for (let d = 0; d < 3; d++) {
      for (const g of b.schedule.filter((x) => x.played && x.day === b.day - 1 - d)) legacyGame(b, g);
      legacyDay(b);
    }
    const after = withoutLegacy(b);
    expect(after.length).toBe(before.length);
    expect(after).toBe(before);
    expect(b.rng).toBe(a.rng);
    // and a season sims to the same results whatever the legacy has kept
    const c = structuredClone(mid);
    const e = structuredClone(mid);
    delete e.legacy;
    for (let i = 0; i < 25; i++) {
      simDay(c);
      simDay(e);
    }
    expect(c.rng).toBe(e.rng);
    expect(c.games.map((g) => [g.gid, g.home.pts, g.away.pts])).toEqual(e.games.map((g) => [g.gid, g.home.pts, g.away.pts]));
    expect(userGameOnDay(c, c.day)?.gid).toBe(userGameOnDay(e, e.day)?.gid);
  }, 300_000);

  it('plays the real Cup in its December window, and puts the user on the front page on only a handful of nights', () => {
    // the real 2026-27 Cup in the real December window
    if (seed.schedule?.cup) {
      const league = afterCup;
      expect(league.cup!.champion).toBeDefined();
      checkFinalSchedule(league);
      // the knockout window held only Cup games and the games for teams that didn't advance
      const window = league.schedule.filter((g) => g.day >= league.cup!.qfDays[0] && g.day <= league.cup!.finalDay);
      expect(window.filter((g) => g.cup === 'qf' || g.cup === 'sf' || g.cup === 'final')).toHaveLength(7);
      expect(window.filter((g) => !g.cup)).toHaveLength(24);
    }
    // the front page is rare in a regular season: a handful of the user's nights (4-9 over eight seeds,
    // about 5.5, before and after the 2026-10 round; this league's hot seasons, a streak and its
    // buzzer-beaters, reach 10-11)
    expect(frontPages).toBeDefined();
    expect(frontPages!.length).toBeGreaterThanOrEqual(1);
    expect(frontPages!.length, frontPages!.map((n) => n.head).join(' | ')).toBeLessThanOrEqual(12);
  });
});
