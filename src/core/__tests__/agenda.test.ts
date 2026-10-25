// The agenda: required decisions hold the league (and the Continue bar) until they're settled, each
// with the staff's call one tap away; optional ones never block, the staff's calls (a star hurt,
// the odds gone two weeks running, the owner's floor in danger on two readings, the deadline, a
// playoff series or play-in game starting, the books) among them, each only with a real choice in
// it, and one still open coming due again before its deadline. The guided first week is one
// checklist item. Job security: the meter, the grace period by difficulty, the ultimatum.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { agenda, agendaBlocker, cutOrder, GUIDE_STEPS, guideDone, guideFinished, guideOpen, guideStepOpen, resolveAgenda, showGuide } from '../league/agenda';
import { canStartRegularSeason, simDay, startRegularSeason } from '../league/season';
import { CAP_FOR, curTeamSeason, fmtDate, playerName, revenueScale, standardRoster } from '../league/helpers';
import { releasePlayer } from '../league/contracts';
import { CAP } from '../constants';
import { canBeFired, jobSecurity, maybeUltimatum, ultimatumVerdict } from '../league/jobSecurity';
import { ownerEvaluation } from '../league/owner';
import { CONCEDE_COST, FLOOR_EASE, currentGoals, floorDanger, goalsWhy, lastWinsTarget, ownerProgress, previewTitle, setOwnerGoals, type OwnerReview } from '../league/ownerGoals';
import { requestSetting } from '../league/difficulty';
import { leagueForecast, pct } from '../analysis/odds';
import { DEADLINE_DAYS, DUE_SOON, FLOOR_AGO, SKID_GAP, callsDaily, changeWorth, countersWorth, dueId, newCall, openCallIds, storeWorth } from '../league/calls';
import { isWeekId, staffPicksSince } from '../league/weekCall';
import { schedulePlayoffDay, seriesLabel } from '../league/playoffs';
import { setPlanItem } from '../league/gamePlans';
import {
  BLEED_GRADE,
  DEBT_LIMIT,
  FREEZE_GRADE,
  FROZEN_BUDGET,
  WARN_DAYS,
  WARN_RED,
  booksDaily,
  booksReview,
  booksVerdict,
  closeBooks,
  deeperText,
  freezeResignReason,
  freezeSigningReason,
  freezeTradeReason,
} from '../league/books';
import { PROJECT_HOME_GAMES, aiTicketPrice, seasonEndCash } from '../league/finances';
import { extensionBlockedReason, valueScore } from '../league/contracts';
import { extensionFrozenReason, userExtend } from '../league/negotiation';
import { qualifyFrozenReason, sheetDecisionBlocked } from '../league/rfa';
import { salaryFor } from '../playerGen';
import { tenDayOpenDay } from '../league/tenDay';
import { flowActions } from '../../ui/flow';
import { money } from '../format';
import { FREE_AGENT, type League } from '../types';

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
    // it holds opening night on a roster over 15, with the releases the staff would make one tap away
    {
      const l = camp(19);
      const over = standardRoster(l, l.userTid).length - CAP.rosterMax;
      expect(over).toBeGreaterThan(1);
      const cuts = agenda(l).find((i) => i.kind === 'cuts')!;
      // one verb, the title's and the button's
      expect(cuts).toMatchObject({ required: true, title: `Release ${over} players` });
      // the Continue bar names it, and starting the season waits
      expect(flowActions(l)[0]).toMatchObject({ id: 'agenda', label: cuts.title, primary: true });
      expect(flowActions(l).find((a) => a.cmd === 'startRegular')?.disabled).toMatch(/Release/);
      // the suggestion is the least valuable players, each named with why (and what he leaves on the books), and one tap clears the way
      const picks = cutOrder(l, standardRoster(l, l.userTid)).slice(0, over);
      expect(cuts.suggestion).toMatchObject({ label: `Release ${over} · staff's picks`, action: { kind: 'release', pid: picks[0].pid, pids: picks.map((p) => p.pid) } });
      expect(cuts.line).toMatch(/The staff's picks, least value to the team: .+ \((\$[\d.]+[MK] dead money|no dead money)\)/);
      for (const p of picks) expect(cuts.line).toContain(playerName(p));
      expect(resolveAgenda(l, cuts.suggestion!.action)).toMatchObject({ ok: true, text: `${picks.map((p) => playerName(p)).join(' and ')} released.` });
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
      expect(card()!.steps![2].title).toBe('Plan for your opener');
      expect(GUIDE_STEPS[2].line).toBe("Add the staff's counter, or go in with no plan.");
      // the last step goes to game day's preview, where Tip off is
      expect(card()!.to).toBe(`/games/${opp}`);
      resolveAgenda(l, { kind: 'hideGuide' });
      expect(card()).toBeUndefined();
      showGuide(l);
      expect(card()!.title).toBe('Your first week · 3 of 4 done');
      // a live game simmed to its end coaches nothing (its highlights are kept all the same), nor do the staff's own calls in it
      const move = (by?: 'staff') => ({ kind: 'tactics' as const, q: 1, clock: 300, text: 'x', end: 'def' as const, before: {} as never, after: {} as never, ...(by && { by }) });
      l.reel = { gid: 0, plays: [] };
      l.games.push({ gid: -1, moves: [move('staff')] } as never);
      expect(guideDone(l).has('coach')).toBe(false);
      // a move of his own does (a timeout, a sub, a change, a staff call he took: the report keeps them)
      l.games.push({ gid: -2, moves: [move()] } as never);
      expect(guideDone(l).has('coach')).toBe(true);
      // with all four done, the guide's last card says how a normal week goes, once ("Got it" puts it away for good)
      expect(guideOpen(l)).toBe(false);
      expect(card()).toMatchObject({ id: 'guide:done', title: 'Your first week · all 4 done', tone: 'good' });
      expect(card()!.line).toMatch(/play or sim to the next game.*the staff's counter \(Matchup → Plan\).*Once a month the owner checks his goals \(Office → Owner\)/);
      // and the staff's note says it in three lines, once (the card then points to it)
      guideFinished(l);
      guideFinished(l);
      const note = l.inbox.filter((m) => m.subject === 'A normal week');
      expect(note).toHaveLength(1);
      expect(note[0].body.split('\n\n')).toHaveLength(3);
      expect(card()).toMatchObject({ to: '/inbox' });
      expect(resolveAgenda(l, card()!.choices![0].action)).toEqual({ ok: true, text: '' });
      expect(card()).toBeUndefined();
      l.games = l.games.filter((g) => g.gid >= 0);
      delete l.reel;
      showGuide(l);
      // it's for the first weeks of the first season only
      startRegularSeason(l);
      l.day = 30;
      expect(guideOpen(l)).toBe(false);
    }

    // the owner's welcome says what he expects from this roster, before opening night
    {
      const welcome = camp(5).inbox.find((m) => m.subject.startsWith('Welcome to the'))!;
      expect(welcome.body).toMatch(/Here is what I expect from this roster/);
      // (an estimate until he sets it on opening night: the other rosters still change)
      expect(welcome.body).toMatch(/^Win about \d+ games \(\d+% of my review\)$/m);
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

    // the owner's targets count Hard's edge on the court as the forecast does: his read is the forecast's
    // on every difficulty, and a target set before he counted it doesn't hold up next season's
    {
      const [n, h] = [inCharge(1), inCharge(1, 'hard')];
      const wins = (x: League) => currentGoals(x)!.goals.find((g) => g.kind === 'wins')!;
      expect(wins(n).edge).toBe(0);
      expect(wins(h).edge).toBeLessThan(-2);
      expect(wins(h).target).toBeLessThan(wins(n).target);
      for (const x of [n, h]) expect(Math.abs(wins(x).perGame! * 82 - leagueForecast(x)!.teams[x.userTid].w)).toBeLessThan(5);
      const review = (edge?: number): OwnerReview => ({
        season: h.season - 1,
        tid: h.userTid,
        games: 82,
        grade: 0,
        total: 0,
        goals: [{ kind: 'wins', title: 'Win 70 games', target: 70, weight: 1, result: 50, grade: -1, ...(edge !== undefined ? { edge } : {}) }],
      });
      h.ownerReviews = [review()];
      expect(lastWinsTarget(h, h.userTid)).toBeUndefined();
      h.ownerReviews = [review(-6)];
      expect(lastWinsTarget(h, h.userTid)).toBe(70);
      n.ownerReviews = [review()];
      expect(lastWinsTarget(n, n.userTid)).toBe(70);
      // at 0-0 a goal over his own read is behind it already, not on track
      const og = currentGoals(n)!;
      const w = wins(n);
      w.target = Math.round(w.perGame! * og.games) + 5;
      expect(ownerProgress(n, og).find((p) => p.goal.kind === 'wins')).toMatchObject({ status: 'behind', before: true });
      // the preseason says its figures are estimates; the owner speaks for himself about a rebuild
      expect(previewTitle(w)).toBe(`Win about ${w.target} games`);
      expect(goalsWhy({ ...og, missed: undefined, rebuild: { year: 1, of: 2 } })).toContain("I'll give you two seasons without the playoffs. After that, I want the play-in.");
    }

    // a difficulty change, or job security off, waits for the next opening night (no dodging a review); on counts at once
    {
      const l = camp(5);
      requestSetting(l, 'difficulty', 'easy');
      requestSetting(l, 'jobSecurity', false);
      expect(l.settings).toMatchObject({ difficulty: 'normal', jobSecurity: true, pending: { difficulty: 'easy', jobSecurity: false } });
      requestSetting(l, 'jobSecurity', true);
      expect(l.settings.pending).toEqual({ difficulty: 'easy' });
      startRegularSeason(l);
      expect(l.settings.difficulty).toBe('easy');
      expect(l.settings.pending).toBeUndefined();
      requestSetting(l, 'difficulty', 'hard');
      requestSetting(l, 'difficulty', 'easy');
      expect(l.settings.pending).toBeUndefined();
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
      // the meter says it whatever the standing: hot, the ultimatum under the score
      {
        const m = structuredClone(l);
        m.ownerMood.total = 0.9;
        expect(jobSecurity(m)).toMatchObject({ heat: 'hot', danger: `Ultimatum: ${u!.text.toLowerCase()}, or you're fired.` });
        expect(jobSecurity(m).score).toBeLessThan(32);
      }
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
      // (the pace is read against his read of the roster, as the wins goal projects it: 2-28 is well under, and was three losses ago)
      ts.won = 2;
      ts.lost = 28;
      ts.lastTen = Array(10).fill(0);
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
      Object.assign(curTeamSeason(m, m.userTid), { won: 2, lost: 28, lastTen: Array(10).fill(0) });
      m.day = m.tradeDeadlineDay + 1;
      expect(agenda(m).some((i) => i.kind === 'floor')).toBe(false);
      // one reading isn't a call: a team that went under the pace with its latest losses waits FLOOR_AGO more games
      m.day = 40;
      const ms = curTeamSeason(m, m.userTid);
      ms.won = 10;
      for (ms.lost = 10; !floorDanger(m) && ms.lost < 70; ms.lost++);
      expect(floorDanger(m)).not.toBeNull();
      expect(agenda(m).some((i) => i.kind === 'floor')).toBe(false);
      ms.lost += FLOOR_AGO;
      expect(agenda(m).find((i) => i.kind === 'floor')?.due).toMatch(/^Decide by \w{3} \d+$/);
    }

    // the playoff odds gone for a team the owner expects in the postseason: tell him it's a rebuild, or keep pushing
    {
      const l = inCharge(1);
      const og = currentGoals(l)!;
      if (!og.goals.some((g) => g.kind === 'postseason')) og.goals.push({ kind: 'postseason', title: 'Make the playoffs', target: 2, weight: 0 });
      l.oddsTrail = { season: l.season, tid: l.userTid, pts: [[6, 400, 10]] };
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      // one week under 5% is a dip, not a call: it takes two in a row
      l.oddsTrail.pts.push([13, 30, 0]);
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      l.oddsTrail.pts.push([20, 60, 0], [27, 40, 0]);
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      l.oddsTrail.pts.push([34, 30, 0]);
      l.day = 35;
      const card = agenda(l).find((i) => i.kind === 'odds')!;
      // (they count the play-in too: the postseason's odds)
      expect(card.title).toBe('Postseason odds down to 3%');
      expect(card.due).toBe(`Decide by ${fmtDate(l.season, l.tradeDeadlineDay)}`);
      // still open as the deadline nears, it stops a long sim once more: a new id within DUE_SOON days of it
      // (the week's own call is open beside it: see weekCall.ts)
      const crisis = () => openCallIds(l).filter((id) => !isWeekId(id));
      expect(crisis()).toEqual([card.id]);
      l.day = l.tradeDeadlineDay - DUE_SOON;
      expect(crisis()).toEqual([card.id, dueId(card.id)]);
      l.day = 35;
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
      m.oddsTrail = {
        season: m.season,
        tid: m.userTid,
        pts: [
          [6, 20, 0],
          [13, 20, 0],
        ],
      };
      const no = agenda(m).find((i) => i.kind === 'odds')!;
      expect(no.suggestion!.label).toBe('Keep pushing');
      expect(no.line).toMatch(/he wants the play-in/);
      // and after the deadline there is nothing to call
      m.day = m.tradeDeadlineDay + 1;
      expect(agenda(m).some((i) => i.kind === 'odds')).toBe(false);
    }

    // the deadline's last five days: the staff's deal, bought or sold as the odds say, made in one tap
    // (the Hornets buying and the Bulls selling: a deal each; the Cavaliers: none that works, so the
    // call is to stand pat. The Hornets' veterans no longer sell: a contender's late firsts are priced
    // as late ones, see pickProjection)
    for (const [tid, odds] of [
      [3, 900],
      [4, 20],
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
      // the odds it says are today's, as Today shows them, not the reading the call was worked out from
      const now = leagueForecast(l)!.teams[tid];
      expect(card.line.startsWith(`Postseason odds ${pct(now.reach[0], now.clinched)}. `)).toBe(true);
      if (tid !== 5) {
        const theirs = call.offer!.b.pids;
        expect(card.suggestion!.label).toMatch(odds > 500 ? /^Trade for / : /^Sell to [A-Z]{3}$/);
        expect(card.choices!.map((c) => c.label)).toEqual(['Stand pat']);
        expect(resolveAgenda(l, card.suggestion!.action).ok).toBe(true);
        for (const pid of theirs) expect(l.players[pid].tid).toBe(tid);
      } else {
        expect(call.offer).toBeUndefined();
        expect(card.suggestion!.label).toBe('Stand pat');
        // no deal found: the call names the need, and the look goes where it's met (Find for a buyer, the block for a seller)
        expect(card.line).not.toMatch(/look yourself/);
        expect(card.line).toMatch(odds > 500 ? /buy a player better than your fifth best \(\d+ OVR\)/ : /^Postseason odds .+ The staff's call: sell/);
        expect(card.choices![0]).toMatchObject({ label: 'Look for a deal', to: expect.stringMatching(odds > 500 ? /^\/office\/trade\?tab=find&minOvr=\d+$/ : /^\/office\/trade/) });
        expect(resolveAgenda(l, card.suggestion!.action).ok).toBe(true);
      }
      expect(agenda(l).some((i) => i.kind === 'deadline')).toBe(false);
    }

    // the morning a play-in game or a playoff series of his starts: plan it (on the matchup page), or leave it to the staff; gone once it's under way
    {
      const l = inCharge(1);
      const me = l.userTid;
      const conf = l.teams[me].conf;
      const opp = l.teams.find((t) => t.tid !== me && t.conf === conf)!.tid;
      const abbrev = l.teams[opp].abbrev;
      const card = () => agenda(l).find((i) => i.kind === 'series');
      l.schedule = l.schedule.filter((g) => g.played);
      l.phase = 'playin';
      l.playIn = [{ id: `${conf}-910`, conf, home: me, away: opp }];
      l.schedule.push({ gid: l.nextGid++, day: l.day, home: me, away: opp, type: 'playin', seriesId: `${conf}-910` });
      expect(card()).toMatchObject({ id: `series:${l.season}:${conf}-910`, title: `Play-in vs ${abbrev} tonight`, to: `/games/${opp}` });
      // the staff's counters measured as the card shows, their numbers first; then the stakes
      expect(card()!.line).toBe('The staff is measuring its counters against them. Win and you play for the 8th seed; lose and the season is over.');
      expect(card()!.measure).toMatchObject({ kind: 'counters', opp, max: 3 });
      expect(card()!.suggestion).toMatchObject({ label: 'Plan the game', to: `/games/${opp}?tab=plan` });
      // opening the plan doesn't answer it; the staff's way does: its measured counters go in, and it says what it set
      expect(resolveAgenda(l, card()!.suggestion!.action).ok).toBe(true);
      expect(card()).toBeDefined();
      expect(card()!.choices!.map((c) => c.label)).toEqual(['Leave it to the staff']);
      {
        const m = structuredClone(l);
        const a = card()!.choices![0].action;
        if (a.kind !== 'call' || a.call.kind !== 'staffPlan') throw new Error('not the staff plan');
        const r = resolveAgenda(m, { kind: 'call', call: { ...a.call, items: [{ id: 'zone23', label: 'Zone 2-3', patch: {}, pts: 0.8 }] } });
        expect(r).toEqual({ ok: true, text: `The staff's plan vs ${abbrev}: Zone 2-3.` });
        expect(m.gamePlans![opp].items.map((x) => x.id)).toEqual(['zone23']);
        expect(agenda(m).some((i) => i.kind === 'series')).toBe(false);
      }
      expect(resolveAgenda(l, card()!.choices![0].action)).toMatchObject({ ok: true, text: expect.stringMatching(/playbook as it is/) });
      expect(card()).toBeUndefined();
      // a series: Game 1 today, plan the series; with a plan against them in place, review it
      l.phase = 'playoffs';
      l.playoffs = [{ id: `${conf}1-0`, round: 1, conf, high: me, low: opp, highSeed: 1, lowSeed: 8, highWins: 0, lowWins: 0 }];
      l.schedule = l.schedule.filter((g) => g.played);
      schedulePlayoffDay(l);
      expect(card()).toMatchObject({ id: `series:${l.season}:${conf}1-0`, title: `${seriesLabel(l.playoffs[0])} vs ${abbrev}: Game 1 tonight` });
      expect(card()!.suggestion).toMatchObject({ label: 'Plan the series', to: `/games/${opp}?tab=plan` });
      // a plan from before the series still opens it (keep it, or review it); one set for the series answers it
      {
        const m = structuredClone(l);
        m.gamePlans = { [opp]: { oppTid: opp, items: [{ id: 'x', label: 'Pack the paint', patch: {} }], scope: 'season' } };
        expect(agenda(m).find((i) => i.kind === 'series')!.suggestion!.label).toBe('Review the plan');
      }
      setPlanItem(l, opp, { id: 'x', label: 'Pack the paint', patch: {} });
      expect(card()).toBeUndefined();
      // Game 1 played, the series is under way: no call, and none again for it
      l.schedule.find((g) => g.seriesId === `${conf}1-0`)!.played = true;
      l.playoffs[0].highWins = 1;
      schedulePlayoffDay(l);
      expect(card()).toBeUndefined();
      l.day = l.schedule.find((g) => g.seriesId === `${conf}1-0` && !g.played)!.day;
      expect(card()).toBeUndefined();
    }

    // the books: judged on the regular season's close (the playoff gates come after); a warning only in
    // the weeks before the deadline, the card's choices levers he can pull then; steps at reviews (an
    // ultimatum, a freeze that blocks new money on every path, a final warning when a frozen season
    // digs deeper, then the sack, whatever he won), and a review in the black lifts it
    {
      const l = inCharge(1);
      // (an owner who signs off on no tax: the payroll his coach inherited past the line would be his
      // own, see sanctionedTax, and the ladder's steps are what this tests)
      for (const g of l.ownerGoals!.goals.filter((x) => x.kind === 'payroll')) {
        g.target = CAP_FOR(l).luxuryTax;
        delete g.line;
      }
      const team = l.teams[l.userTid];
      const scale = revenueScale(l);
      team.budget.coaching = 90;
      // (the gate already at its peak: the budgets are the lever here)
      team.budget.ticketPrice = aiTicketPrice(l, team);
      const ts = curTeamSeason(l, l.userTid);
      ts.homeWon = PROJECT_HOME_GAMES;
      const projectTo = (x: number) => (team.cash = x - (seasonEndCash(l, l.userTid).end - team.cash));
      // week two, deep in the red: no word yet (the projection's error is the warning's size, the summer's signings can't be traded)
      l.day = 14;
      projectTo(-50_000 * scale);
      booksDaily(l);
      expect(l.books).toBeUndefined();
      // three weeks before the deadline: a little short of the black is noise; well into the red, the warning
      l.day = l.tradeDeadlineDay - WARN_DAYS;
      projectTo(-1_000);
      expect(seasonEndCash(l, l.userTid).end).toBe(-1_000);
      booksDaily(l);
      expect(l.books).toBeUndefined();
      projectTo(-1_000 - WARN_RED * scale);
      booksDaily(l);
      expect(l.books).toMatchObject({ stage: 'warning', tid: l.userTid });
      expect(l.inbox[0].subject).toBe('The books are heading into the red');
      expect(l.inbox[0].body).toMatch(/playoff money won't cover it/);
      const card = agenda(l).find((i) => i.kind === 'books')!;
      expect(card.suggestion!.label).toBe('Cut the budgets');
      // how much of the gap the staff's call closes, and plainly when it can't on its own
      expect(card.line).toMatch(/\(saves \$[\d.]+M over the rest of the season\), enough to close the \$[\d.]+M gap\.$/);
      projectTo(-40_000 * scale);
      expect(agenda(l).find((i) => i.kind === 'books')!.line).toMatch(
        /It closes \$[\d.]+M of the \$[\d.]+M gap: on its own it won't change what happens when the books close, so salary has to go too\.$/,
      );
      projectTo(-1_000 - WARN_RED * scale);
      expect(card.choices!.map((c) => c.label)).toEqual(['Shed salary', 'Not now']);
      expect(card.line).toMatch(/^Projected .+ in the red when the regular season's books close.+playoff money doesn't count/);
      // a ticket priced well under where the gate peaks is a lever too, one tap away
      {
        const m = structuredClone(l);
        m.teams[m.userTid].budget.ticketPrice = 40;
        const c = agenda(m).find((i) => i.kind === 'books')!;
        const price = [c.suggestion!, ...c.choices!].find((x) => /^Price tickets at \$\d+$/.test(x.label))!;
        // (a price can be changed back: no second tap)
        expect(price.confirm).toBeUndefined();
        expect(resolveAgenda(m, price.action).ok).toBe(true);
        expect(m.teams[m.userTid].budget.ticketPrice).toBe(aiTicketPrice(m, m.teams[m.userTid]));
      }
      // after the deadline the window has shut: a season that heads into the red late hears it at the review
      {
        const m = inCharge(1);
        m.day = m.tradeDeadlineDay + 1;
        curTeamSeason(m, m.userTid).homeWon = PROJECT_HOME_GAMES;
        m.teams[m.userTid].cash = -500_000;
        booksDaily(m);
        expect(m.books).toBeUndefined();
      }
      // cash crossing zero day to day moves nothing: no second warning, no lift, no step up
      const mail = l.inbox.length;
      team.cash = 50_000;
      booksDaily(l);
      team.cash = -200_000;
      booksDaily(l);
      expect(l.books!.stage).toBe('warning');
      expect(l.inbox.length).toBe(mail);
      // the review reads the close: in the red when the regular season's books closed, an ultimatum,
      // though the playoff gates put the cash back in the black (held there for the season)
      team.cash = -2_000;
      closeBooks(l);
      team.cash = 30_000;
      // a payroll he inherited: its first close in the red (his first season in charge) only warns, once
      expect(booksVerdict(l)).toMatchObject({ close: -2_000, stage: 'warning' });
      {
        const m = structuredClone(l);
        booksReview(m);
        expect(m.books).toMatchObject({ stage: 'warning', close: -2_000 });
        expect(m.inbox[0]).toMatchObject({ subject: 'The books: a warning', important: true });
        expect(m.inbox[0].body).toMatch(/You inherited that payroll, so this time it's a warning/);
        booksReview(m);
        expect(m.inbox.filter((x) => x.subject === 'The books: a warning').length).toBe(1);
      }
      l.tenureStart = l.season - 1;
      expect(booksVerdict(l)).toMatchObject({ close: -2_000, stage: 'ultimatum' });
      booksReview(l);
      expect(l.books).toMatchObject({ stage: 'ultimatum', close: -2_000 });
      expect(l.inbox[0].body).toMatch(/closed \$2\.0M in the red.+playoff gates are my bonus/);
      booksReview(l);
      expect(l.books!.stage).toBe('ultimatum');
      // still in the red when next season's books close: frozen, the budgets cut to the standard
      const nextReview = (close: number) => {
        l.books!.season--;
        ts.closeCash = close;
        return booksVerdict(l);
      };
      nextReview(-2_500);
      booksReview(l);
      expect(l.books).toMatchObject({ stage: 'freeze', close: -2_500 });
      expect(team.budget.coaching).toBe(FROZEN_BUDGET);
      expect(l.inbox[0].subject).toBe('The budget is frozen');
      // the owner says what deeper means, the debt limit included
      expect(l.inbox[0].body).toMatch(
        /Deeper in the red when next season's books close, and that's your final warning\. Past \$[\d.]+M in the red, you're done here, whatever you win\.$/,
      );
      // minimum deals only (his minimum always), no raises, no trade that takes on salary or sends cash
      expect(freezeSigningReason(l, 5_000, 2_000)).toMatch(/minimum deals only/);
      expect(freezeSigningReason(l, 2_000, 2_000)).toBeNull();
      expect(freezeResignReason(l, 10_000, 9_000)).toMatch(/no raises/);
      expect(freezeResignReason(l, 1_300, 1_100, 1_300)).toBeNull();
      expect(freezeTradeReason(l, 10_000, 9_000)).toMatch(/can't take on more salary/);
      expect(freezeTradeReason(l, 9_000, 10_000)).toBeNull();
      expect(freezeTradeReason(l, 9_000, 10_000, 500)).toMatch(/no cash/);
      // and every path that adds to the payroll says so where its button is: an extension, a qualifying offer, a matched offer sheet
      {
        const m = structuredClone(l);
        const p = standardRoster(m, m.userTid)
          .sort((a, b) => salaryFor(a, m.season) - salaryFor(b, m.season))
          .find((x) => salaryFor(x, m.season) >= 3_000 && valueScore(m, x) < 80)!;
        const now = salaryFor(p, m.season);
        p.contract = { start: m.season - 1, salaries: [now, now] };
        expect(extensionBlockedReason(m, p)).toBeNull();
        expect(userExtend(m, p.pid, now + 5_000, 3).reason).toMatch(/no raises, and extending him at .+ is one/);
        expect(extensionFrozenReason(m, p, now)).toBeNull();
        expect(qualifyFrozenReason(m, p)).toMatch(/no raises, and his qualifying offer/);
        m.phase = 'freeAgency';
        p.tid = FREE_AGENT;
        p.rfa = { tid: m.userTid, qo: now, sheet: { tid: (m.userTid + 1) % m.teams.length, amount: now + 5_000, years: 3, route: 'space', day: 0, until: 1 } };
        expect(sheetDecisionBlocked(m, p.pid, true)).toMatch(/no raises, and matching the sheet/);
        expect(sheetDecisionBlocked(m, p.pid, false)).toBeNull();
        expect(agenda(m).find((i) => i.kind === 'offerSheet')!.choices![0].blocked).toMatch(/budget is frozen/);
      }
      // a frozen season that closes in the red grades no better than FREEZE_GRADE, a title or not;
      // closed shallower than the last review, the freeze stands
      expect(nextReview(-1_500)).toEqual({ close: -1_500, stage: 'freeze', cap: FREEZE_GRADE });
      booksReview(l);
      expect(l.books).toMatchObject({ stage: 'freeze', close: -1_500 });
      // the freeze's card says what deeper means, in the Owner page's words: in the grace years only
      // the season's cap; after them the final warning, and past the owner's debt limit the sack
      {
        const m = structuredClone(l);
        m.books!.season = m.season;
        m.books!.day = m.day;
        const line = () => agenda(m).find((i) => i.kind === 'books')!.line;
        m.tenureStart = m.season;
        expect(line()).toMatch(/Deeper in the red than \$1\.5M when the books close, and it's his final warning: that season grades −\d+ at best\./);
        m.tenureStart = m.season - 5;
        expect(line()).toMatch(/Deeper in the red than \$1\.5M when the books close, and it's his final warning; past \$[\d.]+M in the red, deeper and you're fired\./);
        m.books!.close = -DEBT_LIMIT * scale;
        expect(line()).toMatch(/when the books close, and you're fired, whatever you win\./);
      }
      // deeper than at the last review: the freeze didn't stop the bleeding, the final warning (and a lower cap)
      expect(nextReview(-3_000)).toEqual({ close: -3_000, stage: 'final', cap: BLEED_GRADE, deeper: true });
      booksReview(l);
      expect(l.books!.stage).toBe('final');
      expect(l.inbox[0]).toMatchObject({ subject: 'The books: a final warning', important: true });
      expect(agenda(l).find((i) => i.kind === 'books')!.title).toBe("The owner's final warning: the books");
      // deeper again: the sack at the review once it can fire him, whatever he won; in grace, the cap
      expect(nextReview(-4_000)).toMatchObject({ stage: 'final', cap: BLEED_GRADE, fire: true });
      {
        const m = structuredClone(l);
        const mts = curTeamSeason(m, m.userTid);
        [mts.won, mts.lost, mts.playoffRound] = [70, 12, 5];
        ownerEvaluation(m);
        expect(m.fired).toBeFalsy();
        expect(m.ownerReviews!.at(-1)).toMatchObject({ grade: BLEED_GRADE, held: 'books' });
        expect(m.inbox.find((x) => x.subject === 'Season review')!.body).toMatch(
          /We won the title\.\nThe books closed \$4\.0M in the red under the freeze, deeper than last season/,
        );
        const f = structuredClone(l);
        Object.assign(curTeamSeason(f, f.userTid), { won: 70, lost: 12, playoffRound: 5 });
        f.tenureStart = f.season - 3;
        ownerEvaluation(f);
        expect(f.fired).toBe(true);
        expect(f.inbox[0].body).toMatch(/^The books closed \$4\.0M in the red, deeper again under the freeze/);
      }
      // past the debt limit, deeper under the freeze skips the final warning
      l.books!.stage = 'freeze';
      l.books!.close = -DEBT_LIMIT * scale;
      expect(nextReview(-DEBT_LIMIT * scale - 1)).toMatchObject({ stage: 'final', fire: true });
      // books heading there with the review able to fire him: the meter says so whatever the standing, hot and under the line
      {
        const m = structuredClone(l);
        m.tenureStart = m.season - 3;
        m.ownerMood.total = 0.9;
        m.teams[m.userTid].cash = -3 * DEBT_LIMIT * scale;
        const js = jobSecurity(m);
        expect(js).toMatchObject({ heat: 'hot', danger: expect.stringMatching(/under the freeze: close there and you're fired, whatever you win/) });
        expect(js.score).toBeLessThan(25);
        expect(deeperText(m, false)).toBe(`Deeper in the red than ${money(DEBT_LIMIT * scale)} when the books close, and you're fired, whatever you win.`);
      }
      // a review in the black lifts it all
      expect(nextReview(1)).toEqual({ close: 1, stage: null });
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

  it('hands every week a small measured call, asks after a skid and each series deficit, and stops only the sims it should', async () => {
    const { counterCandidates } = await import('../ai/advisor');
    const { freshFamiliarity } = await import('../sim/familiarity');
    const { runSim } = await import('../../state/simCore');
    const card = (l: League) => agenda(l).find((i) => i.kind === 'week');
    /** The staff's counters measured: the first candidate at `pts`, the rest costs. */
    const measured = (l: League, m: NonNullable<ReturnType<typeof card>>['measure'], pts: number) => {
      if (m?.kind !== 'counters') throw new Error('not counters');
      const cands = counterCandidates(l, l.userTid, m.opp).slice(0, 5);
      storeWorth(
        l,
        m.key,
        countersWorth(
          l,
          m,
          cands.map((c, i) => ({ id: c.id, pts: i ? -0.8 : pts, raw: i ? -0.9 : pts, se: 0.45 })),
        ),
      );
      return cands[0];
    };

    // week 1 (the first is the guide's): the week's big game, the staff's counter measured as the card shows
    {
      const l = inCharge(1);
      l.day = 7;
      callsDaily(l);
      expect(l.weekCall).toMatchObject({ season: l.season, week: 1, kinds: expect.arrayContaining(['game']) });
      const c = card(l)!;
      expect(c).toMatchObject({ id: `week:${l.season}:1`, measuring: true, measure: { kind: 'counters', max: 1 } });
      expect(c.line).toMatch(/^The staff is measuring its counters against the /);
      expect(isWeekId(c.id)).toBe(true);
      const best = measured(l, c.measure, 1.4);
      const m = card(l)!;
      expect(m.measuring).toBeUndefined();
      expect(m.line).toBe(`The staff's counter: ${best.label}, about +1.4 a game against them (measured). Unanswered, the staff puts it in on game day.`);
      expect([m.suggestion!.label, ...m.choices!.map((x) => x.label)]).toEqual(['Put it in', 'Keep your plan']);
      // unanswered on game day, the staff puts it in, and the digest says what it did
      const wg = l.weekCall!.games![0];
      const g = l.schedule.find((x) => x.gid === wg.gid)!;
      const away = structuredClone(l);
      for (away.day = l.day; away.day <= g.day; away.day++) callsDaily(away);
      expect(away.gamePlans![wg.opp].items.map((x) => x.id)).toEqual([best.id]);
      expect(away.weekCall!.taken).toBe('auto');
      expect(staffPicksSince(away, l.season, l.day - 1)).toEqual([
        expect.stringMatching(new RegExp(`the staff put in ${best.label}, measured at about \\+1\\.4 a game against them\\.$`)),
      ]);
      // answered here: it's in, the card's gone, and nothing more happens on game day
      expect(resolveAgenda(l, m.suggestion!.action)).toMatchObject({ ok: true });
      expect(l.gamePlans![wg.opp].items.map((x) => x.id)).toEqual([best.id]);
      expect(card(l)).toBeUndefined();
      expect(l.weekCall!.taken).toBe('staff');
    }

    // no gain against the biggest game: the week's next game, then nothing (a call is a choice); one call a week
    {
      const l = inCharge(1);
      l.day = 14;
      callsDaily(l);
      const games = l.weekCall!.games!;
      expect(games.length).toBe(2);
      measured(l, card(l)!.measure, 0.2);
      const next = card(l)!;
      expect(next.title).toMatch(new RegExp(`(vs|@) ${l.teams[games[1].opp].abbrev} `));
      expect(next.line).toMatch(new RegExp(`\\(Against ${l.teams[games[0].opp].abbrev}, nothing it measured beats your plan\\.\\)$`));
      measured(l, next.measure, -0.3);
      expect(card(l)).toBeUndefined();
      expect(openCallIds(l).some(isWeekId)).toBe(false);
      // a new week, a new call
      l.day = 21;
      callsDaily(l);
      expect(card(l)?.id).toBe(`week:${l.season}:3`);
    }

    // a new playbook barely known: a week of tactical drills, the familiarity it makes worked out, its worth measured; back to balanced after the week
    {
      const l = inCharge(1);
      const team = l.teams[l.userTid];
      team.fam = freshFamiliarity(
        team,
        Object.values(l.players).filter((p) => p.tid === l.userTid),
        55,
      );
      l.day = 28;
      callsDaily(l);
      expect(l.weekCall!.focus).toMatchObject({ to: 'system', from: 'balanced', why: 'drills' });
      // (a billed game first: no gain there makes way for it)
      for (let i = 0; i < 3 && card(l)?.measure?.kind === 'counters'; i++) measured(l, card(l)!.measure, 0);
      const c = card(l)!;
      expect(c.title).toMatch(/^The system is at \d+%$/);
      const [, drills, balanced] = /By then the system (\d+)% with drills, (\d+)% at Balanced\./.exec(c.line)!.map(Number);
      expect(drills).toBeGreaterThan(balanced);
      expect(c.line).toMatch(
        /^The staff's call: Tactical drills until \w+day, its worth \w+ (vs|@) [A-Z]{3} being measured\. By then .+ Unanswered, the staff sets it tomorrow\.$/,
      );
      const m = c.measure!;
      if (m.kind !== 'change') throw new Error('not a change');
      expect(m.base?.teams?.[l.userTid]).toMatchObject({ prep: 'balanced' });
      expect(m.change.teams?.[l.userTid]).toMatchObject({ prep: 'system' });
      storeWorth(l, m.key, changeWorth(l, m, { id: 'focus', pts: 0.7, raw: 0.8, se: 0.4 }));
      expect(card(l)!.line).toMatch(/^The staff's call: Tactical drills until \w+day, about \+0\.7 a game \w+ (vs|@) [A-Z]{3} \(measured\)\. By then/);
      expect(resolveAgenda(l, card(l)!.suggestion!.action)).toMatchObject({ ok: true, text: expect.stringMatching(/^Practice: Tactical drills until \w+day\.$/) });
      expect(team.prep).toBe('system');
      l.day = 35;
      callsDaily(l);
      expect(team.prep).toBe('balanced');
    }

    // a losing skid, a winning team's too: the staff's change for the next game, measured; one a skid; a
    // bad team losing four straight is having its season, not a skid
    {
      const l = inCharge(1);
      l.day = 40;
      Object.assign(curTeamSeason(l, l.userTid), { won: 5, lost: 15, streak: -4, lastTen: [1, 0, 1, 0, 0, 1, 0, 0, 0, 0] });
      callsDaily(l);
      expect(l.skidCall).toBeUndefined();
      Object.assign(curTeamSeason(l, l.userTid), { won: 14, lost: 6, streak: -4, lastTen: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0] });
      callsDaily(l);
      const skid = () => agenda(l).find((i) => i.kind === 'skid');
      expect(skid()).toMatchObject({ id: `skid:${l.season}:20`, title: '4 straight losses', measuring: true });
      const best = measured(l, skid()!.measure, 1.1);
      expect(skid()!.line).toMatch(new RegExp(`^The staff's change for \\w+ (vs|@) [A-Z]{3}: ${best.label}, about \\+1\\.1 a game against them \\(measured\\)\\.$`));
      expect(resolveAgenda(l, skid()!.suggestion!.action).ok).toBe(true);
      expect(l.gamePlans![l.skidCall!.opp].items.map((x) => x.id)).toEqual([best.id]);
      expect(skid()).toBeUndefined();
      // the slide goes on, but not another call for it until SKID_GAP more games
      Object.assign(curTeamSeason(l, l.userTid), { lost: 6 + SKID_GAP - 1, streak: -(4 + SKID_GAP - 1) });
      callsDaily(l);
      expect(l.skidCall!.gp).toBe(20);
    }

    // a playoff series: a call each morning after a loss that has him behind, with the staff's adjustment for that game
    {
      const l = inCharge(1);
      const me = l.userTid;
      const conf = l.teams[me].conf;
      const opp = l.teams.find((t) => t.tid !== me && t.conf === conf)!.tid;
      l.phase = 'playoffs';
      l.schedule = l.schedule.filter((g) => g.played);
      l.playoffs = [{ id: `${conf}1-0`, round: 1, conf, high: me, low: opp, highSeed: 1, lowSeed: 8, highWins: 1, lowWins: 2 }];
      schedulePlayoffDay(l);
      l.day = l.schedule.find((g) => g.seriesId === `${conf}1-0` && !g.played)!.day;
      const c = agenda(l).find((i) => i.kind === 'series')!;
      expect(c).toMatchObject({ id: `series:${l.season}:${conf}1-0:1-2`, title: `${seriesLabel(l.playoffs[0])}: down 2-1 to ${l.teams[opp].abbrev}` });
      expect(c.line).toMatch(/^Game 4 tonight\. The staff is measuring its counters against them for it\.$/);
      const best = measured(l, c.measure, 0.9);
      const m = agenda(l).find((i) => i.kind === 'series')!;
      expect(m.suggestion).toMatchObject({ label: 'Make the adjustment' });
      expect(m.line).toBe(`Game 4 tonight. The staff's adjustment: ${best.label}, about +0.9 a game against them (measured on tonight's game).`);
      // level or ahead: no call
      l.playoffs[0].highWins = 2;
      expect(agenda(l).some((i) => i.kind === 'series')).toBe(false);
    }

    // the week's call stops a week's sim (at the week it opens), never a longer one: the staff takes those
    {
      const l = inCharge(1);
      l.settings.stopOnNews = true;
      const quiet = { progress: () => l.inbox.forEach((x) => (x.read = true)) };
      for (; l.day < 10;) simDay(l);
      const before = new Set(openCallIds(l));
      const out = await runSim(l, { kind: 'week' }, quiet);
      const opened = newCall(l, openCallIds(l), before);
      if (out.stop === 'call' && opened && isWeekId(opened.card.id)) expect(l.day).toBe(14);
      else expect(out.stop).not.toBe('target');
      const from = new Set(openCallIds(l));
      const long = await runSim(l, { kind: 'month' }, quiet);
      const why = newCall(l, openCallIds(l), from);
      if (long.stop === 'call') expect(isWeekId(why?.card.id ?? '')).toBe(false);
    }
  }, 120_000);
});
