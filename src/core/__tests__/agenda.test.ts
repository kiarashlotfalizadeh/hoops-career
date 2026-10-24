// The agenda: required decisions hold the league (and the Continue bar) until they're settled, each
// with the staff's call one tap away; optional ones never block, the staff's calls (a star hurt,
// the odds gone, the owner's floor in danger, the deadline, the books) among them, each only with a
// real choice in it. The guided first week is one checklist item. Job security: the meter, the grace period by difficulty, the ultimatum.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { agenda, agendaBlocker, cutOrder, GUIDE_STEPS, guideDone, guideOpen, guideStepOpen, resolveAgenda, showGuide } from '../league/agenda';
import { canStartRegularSeason, simDay, startRegularSeason } from '../league/season';
import { curTeamSeason, revenueScale, standardRoster } from '../league/helpers';
import { releasePlayer } from '../league/contracts';
import { CAP } from '../constants';
import { canBeFired, jobSecurity, maybeUltimatum, ultimatumVerdict } from '../league/jobSecurity';
import { ownerEvaluation } from '../league/owner';
import { CONCEDE_COST, FLOOR_EASE, currentGoals, setOwnerGoals, type OwnerReview } from '../league/ownerGoals';
import { DEADLINE_DAYS, callsDaily } from '../league/calls';
import { FROZEN_BUDGET, WARN_RED, booksDaily, booksReview, freezeResignReason, freezeSigningReason, freezeTradeReason } from '../league/books';
import { PROJECT_HOME_GAMES, seasonEndCash } from '../league/finances';
import { tenDayOpenDay } from '../league/tenDay';
import { flowActions } from '../../ui/flow';
import type { League } from '../types';

const seed = seedJson as unknown as SeedData;

/** A real league with the user's team as it opens camp (`tid` 13: the Lakers carry 16). */
const camp = (tid = 13, settings = {}): League => createLeague({ name: 'agenda', userTid: tid, coachName: 'c', settings: { ...defaultSettings(), ...settings }, seed, rngSeed: 3 });

describe('the agenda', () => {
  /** A team in its first regular season with goals set, `tenure` seasons in charge. */
  function inCharge(tenure: number, difficulty: League['settings']['difficulty'] = 'normal') {
    const l = camp(5, { difficulty });
    startRegularSeason(l);
    setOwnerGoals(l, true);
    l.tenureStart = l.season - tenure + 1;
    return l;
  }

  it("holds the league for required decisions with the staff's call one tap away, guides the first week, keeps the job on the line, and speaks with one voice", async () => {
    // it holds opening night on a roster over 15, with the cut the staff would make one tap away
    {
      const l = camp();
      const over = standardRoster(l, l.userTid).length - CAP.rosterMax;
      expect(over).toBeGreaterThan(0);
      const cuts = agenda(l).find((i) => i.kind === 'cuts')!;
      expect(cuts).toMatchObject({ required: true, title: `Cut ${over} player${over === 1 ? '' : 's'}` });
      // the Continue bar names it, and starting the season waits
      expect(flowActions(l)[0]).toMatchObject({ id: 'agenda', label: cuts.title, primary: true });
      expect(flowActions(l).find((a) => a.cmd === 'startRegular')?.disabled).toMatch(/Cut/);
      // the suggestion is the least valuable player, and taking it (enough times) clears the way
      expect(cuts.suggestion?.action).toEqual({ kind: 'release', pid: cutOrder(l, standardRoster(l, l.userTid))[0].pid });
      for (let i = 0; i < over; i++) expect(resolveAgenda(l, agenda(l).find((x) => x.kind === 'cuts')!.suggestion!.action).ok).toBe(true);
      expect(agenda(l).some((i) => i.kind === 'cuts')).toBe(false);
      expect(agendaBlocker(l)).toBeNull();
      expect(canStartRegularSeason(l)).toEqual([]);
      expect(flowActions(l)[0]).toMatchObject({ cmd: 'startRegular', primary: true });
    }

    // it holds opening night on a roster under 13, with the signing the staff would make one tap away
    {
      const l = camp(5);
      // cut down to 11 standard deals
      for (const p of cutOrder(l, standardRoster(l, l.userTid)).slice(0, standardRoster(l, l.userTid).length - 11)) releasePlayer(l, p, { news: false });
      const item = agenda(l).find((i) => i.kind === 'signings')!;
      expect(item).toMatchObject({ required: true, title: 'Sign 2 players' });
      expect(item.suggestion?.action.kind).toBe('sign');
      expect(item.suggestion?.label).toMatch(/^Sign .+ \((PG|SG|SF|PF|C) · \d+ OVR\)$/);
      expect(item.suggestion?.confirm).toMatch(/× \d yrs?\.$/);
      // two taps fill the roster, each with the best free agent the cap lets him sign at his asking deal
      for (let i = 0; i < 2; i++) {
        const s = agenda(l).find((x) => x.kind === 'signings')!.suggestion!;
        expect(resolveAgenda(l, s.action).ok).toBe(true);
      }
      expect(agenda(l).some((i) => i.kind === 'signings')).toBe(false);
      expect(standardRoster(l, l.userTid).length).toBe(CAP.rosterMin);
    }

    // a fired coach's only way on is a new job
    {
      const l = camp(5);
      l.fired = true;
      expect(agenda(l)).toEqual([expect.objectContaining({ kind: 'fired', required: true, to: '/office/career' })]);
    }

    // it turns trade offers into choices that never block
    {
      const l = camp(5);
      startRegularSeason(l);
      for (let i = 0; i < 60 && !(l.proposals ?? []).length; i++) simDay(l);
      const offer = agenda(l).find((i) => i.kind === 'tradeOffer');
      // (no AI team made an offer in two months: nothing to check)
      if (offer) {
        expect(offer.required).toBe(false);
        expect(agendaBlocker(l)).toBeNull();
        const id = Number(offer.id.split(':')[1]);
        expect(resolveAgenda(l, { kind: 'proposal', id, accept: false })).toEqual({ ok: true, text: 'Offer turned down.' });
        expect(agenda(l).some((i) => i.id === offer.id)).toBe(false);
      }
    }

    // the guided first week is one checklist of four steps, each ticked by a choice (a change, or keeping the staff's on its screen), never by a visit; it can be hidden and brought back
    {
      const l = camp(5);
      expect(guideOpen(l)).toBe(true);
      const card = () => agenda(l).find((i) => i.kind === 'guide');
      expect(card()).toMatchObject({ required: false, title: `Your first week · 0 of ${GUIDE_STEPS.length} done`, to: '/team/rotation' });
      expect(card()!.steps!.map((x) => [x.done, x.next])).toEqual([
        [false, true],
        [false, false],
        [false, false],
        [false, false],
      ]);
      // its one quick choice is putting it away: no button skips a step
      expect(card()!.suggestion).toBeUndefined();
      expect(card()!.choices!.map((c) => c.label)).toEqual(['Hide the guide']);
      expect(guideStepOpen(l, 'rotation')).toBe(true);
      // keeping the staff's rotation on its screen is a choice
      resolveAgenda(l, { kind: 'guide', step: 'rotation' });
      expect(guideStepOpen(l, 'rotation')).toBe(false);
      expect(card()!.title).toBe('Your first week · 1 of 4 done');
      expect(card()!.steps![1].next).toBe(true);
      // editing the playbook counts as picking one
      l.teams[l.userTid].tactics.manual = true;
      expect(guideDone(l).has('playbook')).toBe(true);
      // a plan with a counter in it does the third; a plan used up on the night keeps it done
      const opp = card()!.steps![2].to.match(/\/games\/(\d+)/)![1];
      l.gamePlans = { [+opp]: { oppTid: +opp, items: [{ id: 'x', label: 'Pack the paint', patch: {} }] } };
      expect(guideDone(l).has('scout')).toBe(true);
      // the last step goes to game day's preview, where Tip off is
      expect(card()!.to).toBe(`/games/${opp}`);
      resolveAgenda(l, { kind: 'hideGuide' });
      expect(card()).toBeUndefined();
      showGuide(l);
      expect(card()!.title).toBe('Your first week · 3 of 4 done');
      // it's for the first weeks of the first season only
      startRegularSeason(l);
      l.day = 30;
      expect(guideOpen(l)).toBe(false);
    }

    // the owner's welcome says what he expects from this roster, before opening night
    {
      const welcome = camp(5).inbox.find((m) => m.subject.startsWith('Welcome to the'))!;
      expect(welcome.body).toMatch(/Here is what I expect from this roster/);
      expect(welcome.body).toMatch(/^Win \d+ games \(\d+% of my review\)$/m);
      expect(welcome.link).toBe('/office/owner');
    }

    // it stays out of the way with teaching off: no guide, no welcome mail, and turning it back on brings the guide
    {
      const l = camp(5, { teaching: false });
      expect(guideOpen(l)).toBe(false);
      expect(agenda(l).some((i) => i.kind === 'guide')).toBe(false);
      expect(l.inbox.some((m) => m.subject === 'Your first week')).toBe(false);
      expect(camp(5).inbox.some((m) => m.subject === 'Your first week')).toBe(true);
      l.settings.teaching = true;
      expect(guideOpen(l)).toBe(true);
    }

    // job security reads a neutral standing as steady on opening night, and the grace period by difficulty
    {
      const l = inCharge(1);
      const js = jobSecurity(l);
      expect(js).toMatchObject({ score: 50, heat: 'steady' });
      expect(js.off).toBe(false);
      expect([1, 2, 3].map((n) => canBeFired(inCharge(n)))).toEqual([false, false, true]);
      expect([1, 2].map((n) => canBeFired(inCharge(n, 'hard')))).toEqual([false, true]);
      expect([3, 4].map((n) => canBeFired(inCharge(n, 'easy')))).toEqual([false, true]);
      l.settings.jobSecurity = false;
      expect(jobSecurity(l).off).toBe(true);
    }

    // it gives a coach on the hot seat an ultimatum at the break, and fires him when he misses it
    {
      const l = inCharge(4);
      l.ownerMood.total = -0.45;
      // a bad first half: the record the projection reads
      const ts = l.teams[l.userTid].seasons.find((s) => s.season === l.season)!;
      ts.won = 12;
      ts.lost = 38;
      const u = maybeUltimatum(l);
      expect(u).not.toBeNull();
      // never less than his floor: "win 10 games" is no ultimatum
      const og = currentGoals(l)!;
      if (u!.kind === 'wins') expect(u!.target).toBeGreaterThanOrEqual(Math.ceil(og.floor! * og.games));
      expect(currentGoals(l)!.ultimatum).toEqual(u);
      expect(jobSecurity(l).heat).toBe('hot');
      expect(agenda(l).find((i) => i.kind === 'ultimatum')?.title).toBe(`Owner: ${u!.text}`);
      // once only
      expect(maybeUltimatum(l)).toBeNull();
      // the season ends short of it: fired, whatever the rest says
      l.phase = 'playoffs';
      ts.playoffRound = -1;
      expect(ultimatumVerdict(l, currentGoals(l))).toBe('missed');
      ownerEvaluation(l);
      expect(l.fired).toBe(true);
      expect(l.inbox.find((m) => m.subject === "You're fired")?.body).toMatch(/I told you at the break/);
    }

    // it never gives an ultimatum during the grace period or with job security off
    {
      const l = inCharge(1);
      l.ownerMood.total = -0.9;
      expect(maybeUltimatum(l)).toBeNull();
      const m = inCharge(4);
      m.ownerMood.total = -0.9;
      m.settings.jobSecurity = false;
      expect(maybeUltimatum(m)).toBeNull();
    }

    // the staff's calls: a star out ten games or more is a card with the staff's call one tap away
    {
      const l = inCharge(1);
      const me = l.userTid;
      const best = () => standardRoster(l, me).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)[0];
      const hurt = (games: number) => {
        const p = best();
        p.injury = { type: 'Sprained ankle', gamesRemaining: games, gamesTotal: games, severity: 'moderate' };
        p.injuryCount++;
        return p;
      };
      const star = hurt(20);
      const card = () => agenda(l).find((i) => i.kind === 'injury');
      expect(card()).toMatchObject({ required: false, tone: 'bad', title: `${star.firstName} ${star.lastName} is out 20 games`, pids: [star.pid] });
      // before 10-day contracts open, with the staff on the rotation: ride it out
      expect(card()!.suggestion!.label).toBe('Ride it out');
      // a rotation set by hand: the staff takes it back
      l.teams[me].rotation.manual = true;
      expect(card()!.suggestion!.label).toBe('Let the staff redo the rotation');
      expect(resolveAgenda(l, card()!.suggestion!.action).ok).toBe(true);
      expect(l.teams[me].rotation.manual).toBe(false);
      expect(card()).toBeUndefined();
      // in January with a spot open: a 10-day for cover, signed in one tap
      star.injury = null;
      l.day = tenDayOpenDay(l);
      while (standardRoster(l, me).length >= CAP.rosterMax) releasePlayer(l, standardRoster(l, me).sort((a, b) => a.ovr - b.ovr)[0], { news: false });
      hurt(12);
      const c = card()!;
      expect(c.suggestion!.label).toMatch(/^Sign .+ to a 10-day$/);
      const n = standardRoster(l, me).length;
      expect(resolveAgenda(l, c.suggestion!.action).ok).toBe(true);
      expect(standardRoster(l, me).length).toBe(n + 1);
      expect(standardRoster(l, me).some((p) => p.contract.tenDay)).toBe(true);
      // a short absence, or someone outside the top three, is no call
      best().injury = null;
      hurt(6);
      expect(card()).toBeUndefined();
      // nor is one whose only answer is to carry on: 12 games out with no 10-day to be had and the staff on the rotation
      best().injury = null;
      l.day = 1;
      l.teams[me].rotation.manual = false;
      hurt(12);
      expect(card()).toBeUndefined();
      // a long one before the deadline: a trade is the other answer, made on the trade screen
      best().injury = null;
      hurt(25);
      expect(card()!.choices!.find((c) => c.label === 'Look for a trade')).toMatchObject({ to: '/office/trade' });
    }

    // a team on pace under the owner's win floor, before the deadline: chase it, or tell him it's a development year
    {
      const l = inCharge(1);
      const og = currentGoals(l)!;
      og.goals = og.goals.filter((g) => g.kind !== 'postseason');
      const ts = curTeamSeason(l, l.userTid);
      // (the pace is read against his read of the roster, as the wins goal projects it: 2-28 is well under)
      ts.won = 2;
      ts.lost = 28;
      const card = () => agenda(l).find((i) => i.kind === 'floor');
      expect(card()!.title).toMatch(/^On pace for \d+ wins: under the owner's floor$/);
      expect(card()!.suggestion).toMatchObject({ label: 'Chase the floor', to: '/office/trade' });
      const floor = og.floor!;
      const total = l.ownerMood.total;
      expect(resolveAgenda(l, card()!.choices![0].action).ok).toBe(true);
      expect(currentGoals(l)!.floor).toBeCloseTo(floor - FLOOR_EASE, 3);
      expect(currentGoals(l)!.goals.some((g) => g.kind === 'youth')).toBe(true);
      expect(l.ownerMood.total).toBeCloseTo(total - CONCEDE_COST, 2);
      expect(card()).toBeUndefined();
      // on pace to clear it, or after the deadline, there's no call
      const m = inCharge(1);
      currentGoals(m)!.goals = currentGoals(m)!.goals.filter((g) => g.kind !== 'postseason');
      Object.assign(curTeamSeason(m, m.userTid), { won: 15, lost: 15 });
      expect(agenda(m).some((i) => i.kind === 'floor')).toBe(false);
      Object.assign(curTeamSeason(m, m.userTid), { won: 2, lost: 28 });
      m.day = m.tradeDeadlineDay + 1;
      expect(agenda(m).some((i) => i.kind === 'floor')).toBe(false);
    }

    // the playoff odds gone for a team the owner expects in the postseason: tell him it's a rebuild, or keep pushing
    {
      const l = inCharge(1);
      const og = currentGoals(l)!;
      if (!og.goals.some((g) => g.kind === 'postseason')) og.goals.push({ kind: 'postseason', title: 'Make the playoffs', target: 2, weight: 0 });
      l.oddsTrail = { season: l.season, tid: l.userTid, pts: [[6, 400, 10]] };
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      l.oddsTrail.pts.push([13, 30, 0]);
      const card = agenda(l).find((i) => i.kind === 'odds')!;
      expect(card.title).toBe('Playoff odds down to 3%');
      expect(card.suggestion!.label).toBe("Tell the owner it's a rebuild");
      const total = l.ownerMood.total;
      const weights = og.goals.reduce((a, g) => a + g.weight, 0);
      expect(resolveAgenda(l, card.suggestion!.action).ok).toBe(true);
      const after = currentGoals(l)!;
      expect(after.goals.some((g) => g.kind === 'postseason')).toBe(false);
      expect(after.goals.some((g) => g.kind === 'youth')).toBe(true);
      expect(after.goals.reduce((a, g) => a + g.weight, 0)).toBeCloseTo(weights, 2);
      expect(after.rebuild).toEqual({ year: 1, of: 2 });
      expect(l.ownerMood.total).toBeCloseTo(total - CONCEDE_COST, 2);
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      // with his patience for rebuilds used up, he won't hear it: the call is to keep pushing
      const m = inCharge(3);
      const reviewed = (season: number): OwnerReview => ({
        season,
        tid: m.userTid,
        goals: [{ kind: 'youth', title: '', target: 1, weight: 1, result: 0, grade: 0 }],
        grade: 0,
        total: 0,
      });
      m.ownerReviews = [reviewed(m.season - 2), reviewed(m.season - 1)];
      setOwnerGoals(m, true);
      expect(currentGoals(m)!.goals.some((g) => g.kind === 'postseason')).toBe(true);
      m.oddsTrail = { season: m.season, tid: m.userTid, pts: [[6, 20, 0]] };
      const no = agenda(m).find((i) => i.kind === 'odds')!;
      expect(no.suggestion!.label).toBe('Keep pushing');
      expect(no.line).toMatch(/he wants the play-in/);
      // and after the deadline there is nothing to call
      m.day = m.tradeDeadlineDay + 1;
      expect(agenda(m).some((i) => i.kind === 'odds')).toBe(false);
    }

    // the deadline's last five days: the staff's deal, bought or sold as the odds say, made in one tap
    // (the Hornets: a deal both ways; the Cavaliers: none that works, so the call is to stand pat)
    for (const [tid, odds] of [
      [3, 900],
      [3, 20],
      [5, 900],
    ]) {
      const l = camp(tid);
      while (standardRoster(l, tid).length > CAP.rosterMax) releasePlayer(l, cutOrder(l, standardRoster(l, tid))[0], { news: false });
      startRegularSeason(l);
      setOwnerGoals(l, true);
      l.day = l.tradeDeadlineDay - DEADLINE_DAYS;
      l.oddsTrail = { season: l.season, tid, pts: [[l.day - 1, odds, 0]] };
      callsDaily(l);
      const call = l.deadlineCall!;
      expect(call).toMatchObject({ season: l.season, mode: odds > 500 ? 'buy' : 'sell', odds });
      const card = agenda(l).find((i) => i.kind === 'deadline')!;
      expect(card.title).toBe(`Trade deadline in ${DEADLINE_DAYS} days`);
      if (tid === 3) {
        const theirs = call.offer!.b.pids;
        expect(card.suggestion!.label).toMatch(odds > 500 ? /^Trade for / : /^Sell to [A-Z]{3}$/);
        expect(card.choices!.map((c) => c.label)).toEqual(['Stand pat']);
        expect(resolveAgenda(l, card.suggestion!.action).ok).toBe(true);
        for (const pid of theirs) expect(l.players[pid].tid).toBe(tid);
      } else {
        expect(call.offer).toBeUndefined();
        expect(card.suggestion!.label).toBe('Stand pat');
        expect(resolveAgenda(l, card.suggestion!.action).ok).toBe(true);
      }
      expect(agenda(l).some((i) => i.kind === 'deadline')).toBe(false);
    }

    // the books: a warning when they project into the red, steps only at reviews (an ultimatum, then a freeze that blocks new money), and a review in the black lifts it
    {
      const l = inCharge(1);
      const team = l.teams[l.userTid];
      team.budget.coaching = 90;
      // projected a little short of the black: within the projection's noise, no word; well into the red
      // (the season's costs and any tax to come), the warning, once the home games so far say what one brings
      const ts = curTeamSeason(l, l.userTid);
      ts.homeWon = PROJECT_HOME_GAMES;
      team.cash = -1_000 - (seasonEndCash(l, l.userTid).end - team.cash);
      expect(seasonEndCash(l, l.userTid).end).toBe(-1_000);
      booksDaily(l);
      expect(l.books).toBeUndefined();
      team.cash -= WARN_RED * revenueScale(l);
      ts.homeWon = PROJECT_HOME_GAMES - 1;
      booksDaily(l);
      expect(l.books).toBeUndefined();
      ts.homeWon = PROJECT_HOME_GAMES;
      booksDaily(l);
      expect(l.books).toMatchObject({ stage: 'warning', tid: l.userTid });
      expect(l.inbox[0].subject).toBe('The books are heading into the red');
      const card = agenda(l).find((i) => i.kind === 'books')!;
      expect(card.suggestion!.label).toBe('Cut the budgets');
      expect(card.line).toMatch(/^Projected .+ in the red at the season's end/);
      // cash crossing zero day to day moves nothing: no second warning, no lift, no step up
      const mail = l.inbox.length;
      team.cash = 50_000;
      booksDaily(l);
      team.cash = -200_000;
      booksDaily(l);
      expect(l.books!.stage).toBe('warning');
      expect(l.inbox.length).toBe(mail);
      // a review in the red: an ultimatum, held there for the season
      booksReview(l);
      expect(l.books!.stage).toBe('ultimatum');
      booksReview(l);
      expect(l.books!.stage).toBe('ultimatum');
      // still in the red at the next season's review: frozen, the budgets cut to the standard
      l.books!.season--;
      booksReview(l);
      expect(l.books!.stage).toBe('freeze');
      expect(team.budget.coaching).toBe(FROZEN_BUDGET);
      expect(l.inbox[0].subject).toBe('The budget is frozen');
      // minimum deals only, no raises, no trade that takes on salary
      expect(freezeSigningReason(l, 5_000, 2_000)).toMatch(/minimum deals only/);
      expect(freezeSigningReason(l, 2_000, 2_000)).toBeNull();
      expect(freezeResignReason(l, 10_000, 9_000)).toMatch(/no raises/);
      expect(freezeTradeReason(l, 10_000, 9_000)).toMatch(/can't take on more salary/);
      expect(freezeTradeReason(l, 9_000, 10_000)).toBeNull();
      // back in the black between reviews: still frozen; a review in the black lifts it
      team.cash = 1;
      booksDaily(l);
      expect(l.books!.stage).toBe('freeze');
      booksReview(l);
      expect(l.books).toBeUndefined();
      expect(l.inbox[0].subject).toBe('Back in the black');
      expect(freezeSigningReason(l, 5_000, 2_000)).toBeNull();
    }

    // the assistant speaks with one voice: every card has an area, and a fix it offers is one the staff can make
    const { assistantFeed, applyFix } = await import('../ai/assistant');
    const l = camp(5);
    startRegularSeason(l);
    // a big who can't guard the perimeter in a switching scheme, and drop with no rim protector, are both fixable
    l.teams[l.userTid].tactics.manual = true;
    l.teams[l.userTid].tactics.defense.pnr = 'drop';
    for (let i = 0; i < 5; i++) simDay(l);
    const feed = assistantFeed(l);
    expect(feed.every((c) => ['team', 'tactics', 'games', 'office', 'owner'].includes(c.area))).toBe(true);
    expect(feed.map((c) => c.weight)).toEqual([...feed.map((c) => c.weight)].sort((a, b) => b - a));
    for (const c of feed.filter((x) => x.fix)) {
      const copy = structuredClone(l);
      expect(applyFix(copy, c.fix!)).toBeTruthy();
    }
  }, 120_000);
});
