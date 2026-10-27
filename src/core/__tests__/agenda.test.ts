// The agenda: required decisions hold the league (and the Continue bar) until they're settled, each
// with the staff's call one tap away; optional ones never block, the staff's calls (a star hurt,
// the odds gone two weeks running, the owner's floor in danger on two readings, the deadline, a
// playoff series or play-in game starting, the books) among them, each only with a real choice in
// it, and one still open coming due again before its deadline. The guided first week is one
// checklist item. Job security: the meter, the grace period by difficulty, the ultimatum.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { agenda, agendaBlocker, cutOrder, GUIDE_STEPS, guideDone, guideFinished, guideOpen, guideStepOpen, guideStepTitle, resolveAgenda, showGuide } from '../league/agenda';
import { canStartRegularSeason, simDay, startRegularSeason } from '../league/season';
import { CAP_FOR, curTeamSeason, fmtDate, playerName, revenueScale, standardRoster } from '../league/helpers';
import { releasePlayer } from '../league/contracts';
import { CAP } from '../constants';
import { ULTIMATUM_ODDS, canBeFired, jobSecurity, levelOdds, maybeUltimatum, seasonWeight, seatHeat, ultimatumVerdict } from '../league/jobSecurity';
import { ownerWord } from '../league/legacyPulse';
import { legacyOf } from '../league/legacy';
import { ownerEvaluation } from '../league/owner';
import {
  CONCEDE_COST,
  FLOOR_EASE,
  YOUTH_TOP,
  currentGoals,
  floorDanger,
  goalsWhy,
  CROWN_GRADE,
  gradeGoal,
  gradeOwnerGoals,
  lastWinsTarget,
  ownerProgress,
  personalityLine,
  previewTitle,
  setOwnerGoals,
  type OwnerReview,
} from '../league/ownerGoals';
import { requestSetting } from '../league/difficulty';
import { leagueForecast, pct } from '../analysis/odds';
import {
  DEADLINE_DAYS,
  DUE_SOON,
  FLOOR_AGO,
  ODDS_FIRST_GAMES,
  callsDaily,
  changeWorth,
  concedeStanding,
  countersWorth,
  dealGoals,
  dueId,
  floorStanding,
  openCallIds,
  planDeadlineCall,
  storeWorth,
} from '../league/calls';
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
      expect(card()).toMatchObject({ required: false, title: `Your first games · 0 of ${GUIDE_STEPS.length} done`, to: '/team/rotation' });
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
      expect(card()!.title).toBe('Your first games · 1 of 4 done');
      expect(card()!.steps![1].next).toBe(true);
      // editing the playbook counts as picking one
      l.teams[l.userTid].tactics.manual = true;
      expect(guideDone(l).has('playbook')).toBe(true);
      // a plan with a counter in it does the third (the staff's own silent counter doesn't: it isn't his); a plan used up on the night keeps it done
      const opp = card()!.steps![2].to.match(/\/games\/(\d+)/)![1];
      l.gamePlans = { [+opp]: { oppTid: +opp, items: [{ id: 'x', label: 'Pack the paint', patch: {}, staff: true }] } };
      expect(guideDone(l).has('scout')).toBe(false);
      l.gamePlans = { [+opp]: { oppTid: +opp, items: [{ id: 'x', label: 'Pack the paint', patch: {} }] } };
      expect(guideDone(l).has('scout')).toBe(true);
      expect(card()!.steps![2].title).toBe('Plan for your opener');
      expect(GUIDE_STEPS[2].line).toBe("Add the staff's counter, or go in with no plan.");
      // the last step goes to game day's preview, where Tip off is
      expect(card()!.to).toBe(`/games/${opp}`);
      resolveAgenda(l, { kind: 'hideGuide' });
      expect(card()).toBeUndefined();
      showGuide(l);
      expect(card()!.title).toBe('Your first games · 3 of 4 done');
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
      expect(card()).toMatchObject({ id: 'guide:done', title: 'Your first games · all 4 done', tone: 'good' });
      // it waits on nothing: Needs you shows it, but doesn't count it
      {
        const { needsYouOf } = await import('../../ui/today/needs');
        const n = needsYouOf(l);
        expect(n.items.some((i) => i.id === 'guide:done')).toBe(true);
        expect(n.rows - n.count).toBe(1);
      }
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
      // it's for the first weeks of the first season only; once the opener is played the plan step is for the next game,
      // and no AI team's offer lands on those weeks (they're the guide's)
      startRegularSeason(l);
      expect(guideStepTitle(l, 'scout')).toBe('Plan for your opener');
      curTeamSeason(l, l.userTid).won = 1;
      expect(guideStepTitle(l, 'scout')).toBe('Plan for your next game');
      {
        const { aiProposals, openProposals } = await import('../league/proposals');
        l.proposals = [];
        for (l.day = 1; l.day < 21; l.day++) aiProposals(l);
        expect(openProposals(l)).toEqual([]);
      }
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
      expect(l.inbox.some((m) => m.subject === 'Your first games')).toBe(false);
      expect(camp(5).inbox.some((m) => m.subject === 'Your first games')).toBe(true);
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
      // grace counts from the difficulty each season was played on: a Hard season and then Easy buys no more seasons
      const easy = inCharge(2, 'easy');
      const played = (d: League['settings']['difficulty']) => {
        (easy.legacy ??= legacyOf(easy)).reviews = [
          { season: easy.season - 1, tid: easy.userTid, won: 20, lost: 62, conf: 'E', round: -1, records: [], honors: [], difficulty: d },
        ];
        return canBeFired(easy);
      };
      expect([played('easy'), played('normal'), played('hard')]).toEqual([false, false, true]);
      // one ladder: the pulse names the owner by the meter's word ("Steady 47", never "Watchful 47")
      for (const score of [20, 40, 47, 50, 70]) expect(ownerWord(score).word).toBe(seatHeat(score).label);
    }

    // opening night: the meter's neutral 50 says so when he expects more than his read of the roster;
    // between seasons on a warm seat it says what the next review needs
    {
      const l = inCharge(1);
      const w = currentGoals(l)!.goals.find((g) => g.kind === 'wins')!;
      w.target = Math.round(w.perGame! * 82) + 6;
      expect(jobSecurity(l).line).toMatch(/^He expects more than his read of this roster: win \d+ games/);
      const pre = camp(5);
      pre.tenureStart = pre.season - 3;
      pre.ownerMood.total = -0.3;
      const js = jobSecurity(pre);
      expect(js.heat).toBe('warm');
      // (−0.5 at 40%: −0.3 × 0.6 + 0.4 g ≥ −0.5 → g ≥ −0.8)
      expect(js.line).toMatch(/^Next review needs a season grade of −80 or better: about \d+ wins/);
      // past his rebuild allowance, missing the postseason caps the season at −40 whatever the record:
      // the line leads with the postseason ("about 4 wins" had been said to a coach no record could save)
      const out = structuredClone(pre);
      out.ownerMood.total = -0.6;
      const missed = (season: number): OwnerReview => ({
        season,
        tid: out.userTid,
        goals: [{ kind: 'youth', title: '', target: 1, weight: 1, result: 0, grade: 0 }],
        grade: 0,
        total: -0.6,
      });
      out.ownerReviews = [missed(out.season - 2), missed(out.season - 1)];
      // (−0.5 − 0.6 × −0.6 = −0.14 at 40%: g ≥ −0.35, over the cap's −0.40)
      expect(jobSecurity(out).line).toMatch(
        /^Next review needs a season grade of −35 or better: to (reach the play-in|make the playoffs|win a playoff round), (and about \d+ wins|whatever your record)\./,
      );
    }

    // the owner's targets count Hard's edge on the court as the forecast does: his read is the forecast's
    // on every difficulty, and a target set before he counted it doesn't hold up next season's
    {
      const [n, h] = [inCharge(1), inCharge(1, 'hard')];
      const wins = (x: League) => currentGoals(x)!.goals.find((g) => g.kind === 'wins')!;
      expect(wins(n).edge).toBe(0);
      expect(wins(h).edge).toBeLessThan(-2);
      expect(wins(h).target).toBeLessThan(wins(n).target);
      for (const x of [n, h]) expect(Math.abs(wins(x).perGame! * 82 - leagueForecast(x)!.teams[x.userTid].w)).toBeLessThan(1);
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
      // and his personality agrees with the mandate: a win-now owner setting rebuild goals says he'll take one
      expect(personalityLine('win-now', { rebuild: { year: 1, of: 2 } })).toBe("Win-now · wants results, but he'll take a rebuild this season");
      expect(personalityLine('win-now', {})).toBe('Win-now · wants results this season');
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
      // one the forecast gives a real chance: with the postseason out of reach (2%), the wins its upper quarter reaches
      {
        const m = structuredClone(l);
        const fc = structuredClone(leagueForecast(m)!);
        const o = Object.assign(fc.teams[m.userTid], { w: 20, lo: 17, hi: 23, top6: 0, playIn: 0.02, reach: [0.01, 0, 0, 0, 0] });
        const um = maybeUltimatum(m, fc)!;
        expect(um).toMatchObject({ kind: 'wins' });
        expect(um.target).toBeGreaterThan(12);
        expect(um.target).toBeLessThanOrEqual(Math.floor(o.w + 0.674 * ((o.hi - o.lo) / 2.563)));
        // a level it gives a quarter or better stands
        o.playIn = 0.3;
        const n = structuredClone(l);
        const un = maybeUltimatum(n, fc);
        if (un?.kind === 'postseason') expect(levelOdds(o, un.target)).toBeGreaterThanOrEqual(ULTIMATUM_ODDS);
      }
      const u = maybeUltimatum(l);
      expect(u).not.toBeNull();
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
      const long = hurt(25);
      const look = card()!.choices!.find((c) => c.label === 'Look for a trade')!;
      // (Find at his position, better than the fifth best, the salary he can take back: not a blank builder)
      expect(look.to).toBe(`/office/trade?tab=find&pos=${long.pos}&minOvr=${standardRoster(l, me).sort((a, b) => b.ovr - a.ovr)[4].ovr + 1}`);
      // the look doesn't settle it: a trade of his from there on does
      {
        const m = structuredClone(l);
        expect(resolveAgenda(m, look.action).ok).toBe(true);
        expect(agenda(m).some((i) => i.kind === 'injury')).toBe(true);
        const id = `injury:${long.pid}:${long.injuryCount}`;
        expect(openCallIds(m)).toContain(id);
        m.transactions = [...(m.transactions ?? []), { id: m.nextTxnId ?? 1, season: m.season, day: m.day, phase: m.phase, kind: 'trade', tids: [me, 0], user: true }];
        expect(openCallIds(m)).not.toContain(id);
        callsDaily(m);
        expect(m.callsDone).toContain(id);
      }
      // measured as no real loss: no trade to look for, and riding it out is the only answer: no card,
      // and when it ages the digest doesn't blame an unanswered card
      storeWorth(l, `injury:${long.pid}:${long.injuryCount}`, { gid: 0, sig: 0, day: l.day, pts: 0.1, raw: 0.1, se: 0.4 });
      expect(card()).toBeUndefined();
      long.injury!.gamesRemaining -= 3;
      callsDaily(l);
      expect(l.staffPicks!.at(-1)!.text).toBe(`${playerName(long)} out: the staff spread his minutes (nothing else to choose).`);
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
      // the lean is the answer his review projects higher (the meter's read, the same record either way), with both numbers
      const st = floorStanding(l)!;
      expect(card()!.line).toMatch(
        /Chasing it: [−+]\d+ to your standing at his review; a development year: [−+]\d+, its cost included \(the forecast's read: about \d+ wins either way\)\./,
      );
      const both = [card()!.suggestion!, ...card()!.choices!];
      expect(card()!.suggestion!.label).toBe(st.ease > st.chase ? "Tell him it's a development year" : 'Chase the floor');
      expect(both.find((c) => c.label === 'Chase the floor')).toMatchObject({ to: expect.stringMatching(/^\/office\/trade\?tab=find&minOvr=\d+$/) });
      // (each the meter's projected review: a development year carries its cost)
      expect(st.ease).toBeLessThan(st.chase + 0.5);
      const floor = og.floor!;
      const total = l.ownerMood.total;
      expect(resolveAgenda(l, both.find((c) => c.label === "Tell him it's a development year")!.action).ok).toBe(true);
      expect(currentGoals(l)!.floor).toBeCloseTo(floor - FLOOR_EASE, 3);
      expect(currentGoals(l)!.goals.some((g) => g.kind === 'youth')).toBe(true);
      expect(l.ownerMood.total).toBeCloseTo(total - CONCEDE_COST, 2);
      // the part of the win goal it moved to the young players keeps the win goal's miss: the kids'
      // minutes don't make up for the losses (easing had been worth +48 to a rebuilder's season grade)
      {
        const eased = currentGoals(l)!;
        const youth = eased.goals.find((g) => g.kind === 'youth')!;
        const wins = eased.goals.find((g) => g.kind === 'wins')!;
        expect(youth.fromWins).toBeGreaterThan(0);
        const wg = gradeGoal(l, eased, wins, wins.target - 14);
        const own = youth.weight - youth.conceded!;
        expect(gradeGoal(l, eased, youth, youth.target * 5, wg)).toBeCloseTo((own * YOUTH_TOP + (youth.conceded! - youth.fromWins!) * 0 + youth.fromWins! * wg) / youth.weight, 1);
        expect(gradeGoal(l, eased, youth, youth.target * 5, 0.5)).toBeCloseTo((own * YOUTH_TOP) / youth.weight, 1);
      }
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
      // (past the first season's ODDS_FIRST_GAMES: before them a newcomer's slump is the staff's plain read, not a rebuild call)
      Object.assign(curTeamSeason(l, l.userTid), { won: 3, lost: 14 });
      l.oddsTrail = { season: l.season, tid: l.userTid, pts: [[6, 400, 10]] };
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      // one week under 5% is a dip, not a call: it takes two in a row
      l.oddsTrail.pts.push([13, 30, 0]);
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      l.oddsTrail.pts.push([20, 60, 0], [27, 40, 0]);
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      l.oddsTrail.pts.push([34, 30, 0]);
      l.day = 35;
      {
        const m = structuredClone(l);
        Object.assign(curTeamSeason(m, m.userTid), { won: 1, lost: ODDS_FIRST_GAMES - 2 });
        expect(agenda(m).some((i) => i.kind === 'odds')).toBe(false);
      }
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
      // the staff's lean is the answer that leaves his standing higher, as the forecast reads the season, with both numbers
      {
        const st = concedeStanding(l)!;
        const post = og.goals.find((g) => g.kind === 'postseason')!;
        expect(st.concede).toBe(-CONCEDE_COST);
        expect(st.push).toBeLessThanOrEqual(0);
        expect(st.push).toBeGreaterThanOrEqual(-seasonWeight(l) * post.weight - 1e-9);
        expect(card.line).toMatch(/^Pushing on: [−+]\d+ to your standing with him, the forecast's read \(.+ to reach his goal\); telling him now: −10 at once/);
        expect(card.suggestion!.label).toBe(st.concede > st.push ? "Tell the owner it's a rebuild" : 'Keep pushing');
        // a goal one level out costs little missed (−35 on his weight): push; one three levels out costs it all: tell him
        const m = structuredClone(l);
        const mp = currentGoals(m)!.goals.find((g) => g.kind === 'postseason')!;
        Object.assign(mp, { target: 1, weight: 0.3 });
        expect(agenda(m).find((i) => i.kind === 'odds')!.suggestion!.label).toBe('Keep pushing');
        Object.assign(mp, { target: 4, weight: 1 });
        expect(agenda(m).find((i) => i.kind === 'odds')!.suggestion!.label).toBe("Tell the owner it's a rebuild");
      }
      const total = l.ownerMood.total;
      const weights = og.goals.reduce((a, g) => a + g.weight, 0);
      const tell = [card.suggestion!, ...card.choices!].find((c) => c.label === "Tell the owner it's a rebuild")!;
      expect(resolveAgenda(l, tell.action).ok).toBe(true);
      const after = currentGoals(l)!;
      expect(after.goals.some((g) => g.kind === 'postseason')).toBe(false);
      expect(after.goals.some((g) => g.kind === 'youth')).toBe(true);
      expect(after.goals.reduce((a, g) => a + g.weight, 0)).toBeCloseTo(weights, 2);
      expect(after.rebuild).toEqual({ year: 1, of: 2 });
      expect(l.ownerMood.total).toBeCloseTo(total - CONCEDE_COST, 2);
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
      // the weight moved to the young players grades 0 at best (it spares the miss, it doesn't earn on top), and
      // the cost stays off at the review, a first season's grade setting the standing or not
      {
        const youth = after.goals.find((g) => g.kind === 'youth')!;
        expect(youth.conceded).toBeGreaterThan(0);
        const own = (youth.weight - youth.conceded!) / youth.weight;
        expect(gradeGoal(l, after, youth, youth.target * 5)).toBeCloseTo(YOUTH_TOP * own, 2);
        expect(gradeGoal(l, after, youth, 0)).toBe(-1);
        const r = structuredClone(l);
        r.phase = 'playoffs';
        curTeamSeason(r, r.userTid).playoffRound = -1;
        ownerEvaluation(r);
        const review = r.ownerReviews!.find((x) => x.season === r.season)!;
        expect(review.total).toBeCloseTo(Math.max(-1, review.grade - CONCEDE_COST), 2);
      }
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
      Object.assign(curTeamSeason(m, m.userTid), { won: 3, lost: 14 });
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
    // (the first team that finds a deal buying, the first that finds one selling, and the first buyer
    // with none that works, whose call is to stand pat: searched for, so a new seed's rosters don't
    // break the pin. A contender's late firsts are priced as late ones, see pickProjection)
    const deadlineLeague = (tid: number, odds: number) => {
      const l = camp(tid);
      while (standardRoster(l, tid).length > CAP.rosterMax) releasePlayer(l, cutOrder(l, standardRoster(l, tid))[0], { news: false });
      startRegularSeason(l);
      setOwnerGoals(l, true);
      l.day = l.tradeDeadlineDay - DEADLINE_DAYS;
      l.oddsTrail = { season: l.season, tid, pts: [[l.day - 1, odds, 0]] };
      callsDaily(l);
      return l;
    };
    const firstWith = (odds: number, deal: boolean) => {
      for (let tid = 0; tid < 30; tid++) {
        const l = deadlineLeague(tid, odds);
        // (a team whose call goes the way its odds say: a strategy or the owner can turn one around)
        const call = l.deadlineCall;
        if (call && call.mode === (odds > 500 ? 'buy' : 'sell') && !!call.offer === deal) return { tid, odds, l, deal };
      }
      throw new Error(`no team ${deal ? 'finds' : 'misses'} a deal at odds ${odds}`);
    };
    for (const { tid, odds, l, deal } of [firstWith(900, true), firstWith(20, true), firstWith(900, false)]) {
      const call = l.deadlineCall!;
      expect(call).toMatchObject({ season: l.season, mode: odds > 500 ? 'buy' : 'sell', odds });
      const card = agenda(l).find((i) => i.kind === 'deadline')!;
      expect(card.title).toBe(`Trade deadline in ${DEADLINE_DAYS} days`);
      // the odds it says are today's, as Today shows them, not the reading the call was worked out from
      const now = leagueForecast(l)!.teams[tid];
      expect(card.line.startsWith(`Postseason odds ${pct(now.reach[0], now.clinched)}. `)).toBe(true);
      if (deal) {
        const theirs = call.offer!.b.pids;
        expect(card.suggestion!.label).toMatch(odds > 500 ? /^Trade for / : /^Sell to [A-Z]{3}$/);
        expect(card.choices!.map((c) => c.label)).toEqual(['Stand pat']);
        // its numbers: measured on his next game against someone else (the deal and the staff's rotation for it, against
        // its rotation now), what the players coming cost, then what the forecast reads it adds to the odds
        const ms = card.measure!;
        if (ms.kind !== 'change') throw new Error('not a change');
        expect(ms).toMatchObject({ key: card.id, base: { id: 'staff' }, change: { id: 'deal' } });
        expect(ms.opp).not.toBe(call.offer!.b.tid);
        expect(call.oddsGain).toEqual(expect.any(Number));
        expect(card.line).toMatch(/The staff is measuring the deal\./);
        for (const pid of theirs) expect(card.line).toContain(`${playerName(l.players[pid])}: ${l.season - l.players[pid].bornYear}, $`);
        {
          const m = structuredClone(l);
          storeWorth(m, ms.key, changeWorth(m, ms, { id: 'deal', pts: 1.2, raw: 1.3, se: 0.4 }));
          const c = agenda(m).find((i) => i.kind === 'deadline')!;
          expect(c.measure).toBeUndefined();
          expect(c.line).toMatch(/With the deal: about \+1\.2 a game \(measured (vs|@) [A-Z]{3}\), about \+\d\.\d wins over the \d+ games left/);
          expect(c.suggestion!.confirm).toMatch(/^You send .+; the .+ send .+\. With the deal: about \+1\.2 a game/);
          // a buy that measures as no gain is his to take, not the staff's call
          if (odds > 500) {
            storeWorth(m, ms.key, changeWorth(m, ms, { id: 'deal', pts: 0.2, raw: 0.3, se: 0.4 }));
            const f = agenda(m).find((i) => i.kind === 'deadline')!;
            expect([f.suggestion!.label, f.choices![0].label]).toEqual(['Stand pat', c.suggestion!.label]);
            expect(f.line).toMatch(/The staff's call: stand pat; the best buy it found doesn't measure as a gain\. .+With the deal: too close to say/);
          }
        }
        // a buy never costs one of the owner's money or youth goals: with a profit goal and no room in it, a deal that adds salary isn't the call
        if (odds > 500) {
          const m = structuredClone(l);
          const og = currentGoals(m)!;
          og.goals = [
            ...og.goals.filter((g) => g.kind !== 'profit' && g.kind !== 'payroll'),
            { kind: 'profit', title: 'Turn a profit', target: 0, weight: 0.3, perGame: 0, end: 0 },
          ];
          const prof = og.goals.at(-1)!;
          prof.target = ownerProgress(m, og).find((x) => x.goal === prof)!.projected;
          const re = planDeadlineCall(m);
          if (re.offer) expect(dealGoals(m, re.offer).some((d) => d.kind === 'profit' && d.with < d.target && d.with < d.now)).toBe(false);
          // (the staff's first pick, had it added salary, is one it passes over now)
          if (dealGoals(m, call.offer!).some((d) => d.kind === 'profit' && d.with < d.now)) expect(re.offer).not.toEqual(call.offer);
        }
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
      // the size of the hole counts: past the debt limit and deeper than last season's close, no ultimatum
      // first but the freeze, and no title lifts the season (a passive Thunder coach had closed $1.07B in
      // the red on a title and heard "I'm thrilled")
      {
        const m = structuredClone(l);
        m.tenureStart = m.season - 1;
        const mts = curTeamSeason(m, m.userTid);
        mts.closeCash = -DEBT_LIMIT * scale - 30_000;
        expect(booksVerdict(m)).toMatchObject({ stage: 'freeze', past: true, debt: true });
        // a title on a losing record: graded as the goals graded it, the crown's lift gone
        const og = currentGoals(m)!;
        const wins = og.goals.find((g) => g.kind === 'wins')!;
        Object.assign(mts, { won: wins.target - 15, lost: 82 - wins.target + 15, playoffRound: 5, revenue: 100_000, expenses: 1_000_000 });
        const graded = gradeOwnerGoals(m, og);
        expect(graded).toMatchObject({ crowned: 'title', grade: CROWN_GRADE.title });
        expect(graded.uncrowned).toBeLessThan(CROWN_GRADE.title);
        ownerEvaluation(m);
        expect(m.ownerReviews!.at(-1)).toMatchObject({ grade: graded.uncrowned, held: 'debt', said: `We won, and it cost me ${money(900_000)}.` });
        expect(m.books).toMatchObject({ stage: 'freeze', debt: true });
        const frozenMail = m.inbox.find((x) => x.subject === 'The budget is frozen')!;
        expect(frozenMail.important).toBe(true);
        expect(frozenMail.body).toMatch(/^The books closed \$[\d.]+M in the red, past the \$[\d.]+M I'll carry\. A hole that size doesn't get an ultimatum first\./);
        expect(m.inbox.find((x) => x.subject === 'Season review')!.body).toMatch(/^We won, and it cost me \$900\.0M\. Season grade/);
        // a hole he took over, no deeper than last season's close, climbs the ladder as before
        const n = structuredClone(l);
        n.tenureStart = n.season - 1;
        curTeamSeason(n, n.userTid).closeCash = -DEBT_LIMIT * scale - 30_000;
        n.teams[n.userTid].seasons.push({ ...structuredClone(curTeamSeason(n, n.userTid)), season: n.season - 1, closeCash: -DEBT_LIMIT * scale - 60_000 });
        expect(booksVerdict(n)).toMatchObject({ stage: 'ultimatum', past: true });
        expect(booksVerdict(n)!.debt).toBeUndefined();
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

  it("makes the staff's one-answer picks measured and silent, opens the week's card only for a trade-off, asks after a skid that goes on, and stops a sim only for a real call", async () => {
    const { counterCandidates } = await import('../ai/advisor');
    const { freshFamiliarity } = await import('../sim/familiarity');
    const { runSim } = await import('../../state/simCore');
    const { staffDecide, staffNeeds } = await import('../league/callMeasure');
    const { weekWorthId, YOUTH_ADD, youthOutlook } = await import('../league/weekCall');
    const { userYouth } = await import('../league/youthLean');
    const { ensureRotation } = await import('../league/games');
    const card = (l: League) => agenda(l).find((i) => i.kind === 'week');
    const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    type Measure = ReturnType<typeof staffNeeds>[number];
    /** The staff's counters measured: the first candidate at `pts`, the rest costs. */
    const measured = (l: League, m: Measure | undefined, pts: number) => {
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
    /** A change measured at `pts`. */
    const changed = (l: League, m: Measure | undefined, pts: number) => {
      if (m?.kind !== 'change') throw new Error('not a change');
      storeWorth(l, m.key, changeWorth(l, m, { id: 'x', pts, raw: pts, se: 0.4 }));
    };
    /** The Nuggets in their first season in charge (their schedule has billed nights from week 5 on, before a game is played). */
    const nuggets = () => {
      const l = camp(7);
      while (standardRoster(l, 7).length > CAP.rosterMax) releasePlayer(l, cutOrder(l, standardRoster(l, 7))[0], { news: false });
      startRegularSeason(l);
      setOwnerGoals(l, true);
      l.tenureStart = l.season;
      return l;
    };
    /** The first week from `from` on with a billed game: the league on its first morning, the week planned. */
    const billedWeek = (l: League, from = 1) => {
      for (let w = from; w < 22; w++) {
        l.day = w * 7;
        l.weekCall = undefined;
        callsDaily(l);
        const wc = l.weekCall as League['weekCall'];
        if (wc?.games?.length) return wc;
      }
      throw new Error('no billed week');
    };

    // a billed night: the staff's counter measured before anything opens; a gain goes in without a card (its one count), and is said
    {
      const l = nuggets();
      const wc = billedWeek(l);
      const wg = wc.games![0];
      const need = staffNeeds(l);
      expect(need[0]).toMatchObject({ kind: 'counters', key: weekWorthId(wc, 'game', wg.gid), max: 1 });
      expect(card(l)).toBeUndefined();
      expect(openCallIds(l).some(isWeekId)).toBe(false);
      const none = structuredClone(l);
      const best = measured(l, need[0], 1.4);
      staffDecide(l);
      expect(l.gamePlans![wg.opp].items.map((x) => x.id)).toEqual([best.id]);
      expect(card(l)).toBeUndefined();
      expect(openCallIds(l).some(isWeekId)).toBe(false);
      expect(staffPicksSince(l, l.season, l.day - 1)).toEqual([
        expect.stringMatching(new RegExp(`the staff put in ${esc(best.label)}, \\+1\\.4 pts \\(≈ \\+\\d+% to win\\) against them \\(measured\\)\\.$`)),
      ]);
      // no gain: nothing changes, no card
      measured(none, staffNeeds(none)[0], 0.2);
      staffDecide(none);
      expect(none.gamePlans?.[wg.opp]?.items ?? []).toEqual([]);
      expect(none.weekCall!.decided).toBe(true);
      expect(card(none)).toBeUndefined();
    }

    // the system barely known: drills on their own go in without a card; against prep for a billed night, each side measured on its own game
    {
      const l = nuggets();
      const me = l.userTid;
      const team = l.teams[me];
      team.fam = freshFamiliarity(
        team,
        Object.values(l.players).filter((p) => p.tid === me),
        55,
      );
      const wc = billedWeek(l);
      expect(wc.focus).toMatchObject({ to: 'system', from: 'balanced', why: 'drills' });
      const abbrev = l.teams[wc.games![0].opp].abbrev;
      // (no gain on the night: no prep to weigh, drills in for the week)
      const plain = structuredClone(l);
      measured(plain, staffNeeds(plain)[0], 0.1);
      expect(staffNeeds(plain)).toEqual([]);
      staffDecide(plain);
      expect(plain.teams[me].prep).toBe('system');
      expect(card(plain)).toBeUndefined();
      expect(staffPicksSince(plain, plain.season, plain.day - 1).at(-1)).toMatch(
        /^Practice: Tactical drills through \w+day \(the system at \d+%, building twice as fast as at Balanced\)\.$/,
      );
      plain.day = (wc.week + 1) * 7;
      callsDaily(plain);
      expect(plain.teams[me].prep).toBe('balanced');
      // a gain on the night: prep (its counter drilled) against drills (the system after it)
      measured(l, staffNeeds(l)[0], 1.2);
      const [near, far] = staffNeeds(l);
      expect(near).toMatchObject({ kind: 'change', key: weekWorthId(wc, 'near', wc.games![0].gid) });
      expect(near.kind === 'change' && near.change.teams![me].prep).toBe('opponent');
      expect(far).toMatchObject({ kind: 'change', key: expect.stringContaining('|far:') });
      const one = structuredClone(l);
      const left = structuredClone(l);
      // each wins its own game: a choice, with both numbers and the staff's lean
      changed(l, near, 0.9);
      changed(l, far, 0.8);
      staffDecide(l);
      const c = card(l)!;
      expect(c.title).toBe(`Prep for ${abbrev}, or drill the system?`);
      expect(c.line).toMatch(
        /^Prep: \+0\.9 pts \(≈ \+\d+% to win\) (vs|@) [A-Z]{3} (tonight|on \w+day), the staff's counter drilled\. Drills: \+0\.8 pts .+, the system at \d+% not \d+%\. Both measured\. The staff leans drill the system: the system pays for more than one night\. Unanswered, the staff goes with its lean tomorrow\.$/,
      );
      expect([c.suggestion!.label, ...c.choices!.map((x) => x.label)]).toEqual(['Drill the system', `Prep for ${abbrev}`]);
      expect(openCallIds(l)).toContain(c.id);
      // answered for prep: it holds to the night, then drills, then the balance at the week's end
      expect(resolveAgenda(l, c.choices![0].action)).toMatchObject({ ok: true, text: expect.stringMatching(/^Practice: Opponent prep through \w+day/) });
      expect(team.prep).toBe('opponent');
      expect(card(l)).toBeUndefined();
      const steps = l.weekCall!.hold!.steps;
      l.day = steps[0][1] + 1;
      callsDaily(l);
      expect(team.prep).toBe(steps[1] && l.day <= steps[1][1] ? 'system' : 'balanced');
      // left unanswered: the staff's lean the next morning
      changed(left, near, 0.9);
      changed(left, far, 0.8);
      staffDecide(left);
      left.day++;
      callsDaily(left);
      expect(left.teams[me].prep).toBe('system');
      expect(left.weekCall!.taken).toBe('auto');
      expect(card(left)).toBeUndefined();
      // one side only clears its noise: it goes in, no card
      changed(one, near, 0.9);
      changed(one, far, 0.1);
      staffDecide(one);
      expect(card(one)).toBeUndefined();
      expect(one.teams[me].prep).toBe('opponent');
    }

    // the owner wants the young players' minutes and they're behind: free, the staff's lean goes in; costing points, a card
    {
      const l = camp(20);
      startRegularSeason(l);
      setOwnerGoals(l, true);
      currentGoals(l)!.goals.push({ kind: 'youth', title: 'Play your young players', target: 99_999, weight: 0.3 });
      l.day = 14;
      callsDaily(l);
      const wc = l.weekCall!;
      expect(wc.youth!.add).toBeGreaterThanOrEqual(YOUTH_ADD);
      const answer = (x: League, pts: number) => {
        for (const m of staffNeeds(x)) if (m.kind === 'counters') measured(x, m, 0.1);
        for (const m of staffNeeds(x)) changed(x, m, pts);
        staffDecide(x);
      };
      const free = structuredClone(l);
      const was = youthOutlook(free, wc.youth!.add)!;
      answer(free, -0.2);
      expect(card(free)).toBeUndefined();
      expect(userYouth(free)).toBeGreaterThan(0);
      // the digest's "without" is the rotation as it was before the lean went in (not counting the lean twice)
      expect(staffPicksSince(free, free.season, free.day - 1).at(-1)).toContain(
        `${was.lean.toLocaleString('en-US')} of his 99,999 minutes, ${was.base.toLocaleString('en-US')} without`,
      );
      const young = (x: League) =>
        Object.values(x.players)
          .filter((p) => p.tid === x.userTid && x.season - p.bornYear <= 23)
          .reduce((a, p) => a + (x.teams[x.userTid].rotation.minutes[p.pid] ?? 0), 0);
      // (in from tonight: the staff's rotation leans to them)
      expect(young(free)).toBeGreaterThan(young(l));
      ensureRotation(free, free.userTid);
      expect(young(free)).toBeGreaterThan(young(l));
      answer(l, -0.9);
      const c = card(l)!;
      expect(c.title).toBe(`${wc.youth!.add} more minutes a game for the young players?`);
      expect(c.line).toMatch(
        /^It costs 0\.9 pts a game \(≈ −\d+% to win, measured (vs|@) [A-Z]{3}\): about \d\.\d wins over \d+ games\. It adds [\d,]+ of the owner's minutes: on pace for [\d,]+ of his 99,999, not [\d,]+\. The staff leans /,
      );
      // turned down: not asked again for a while
      expect(resolveAgenda(l, [c.suggestion!, ...c.choices!].find((x) => x.label === 'Keep the rotation')!.action).ok).toBe(true);
      expect(l.youthLean).toMatchObject({ how: 'kept', level: 0 });
      l.day = 21;
      l.weekCall = undefined;
      callsDaily(l);
      expect((l.weekCall as League['weekCall'])!.youth).toBeUndefined();
    }

    // a losing skid, a winning team's too: the first step's counter is the staff's, measured, the slide said; a bad team losing
    // four straight is having its season; a slide that goes on is a card at eight straight: a trade while deals can be made
    {
      const l = inCharge(1);
      l.day = 40;
      const ts = curTeamSeason(l, l.userTid);
      Object.assign(ts, { won: 5, lost: 15, streak: -4, lastTen: [1, 0, 1, 0, 0, 1, 0, 0, 0, 0] });
      callsDaily(l);
      expect(l.skidCall).toBeUndefined();
      Object.assign(ts, { won: 14, lost: 6, streak: -4, lastTen: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0] });
      callsDaily(l);
      expect(l.skidCall).toMatchObject({ gp: 20, rung: 1 });
      const need = staffNeeds(l).find((m) => m.key === `skid:${l.season}:20`);
      expect(need).toMatchObject({ kind: 'counters', max: 1 });
      expect(agenda(l).some((i) => i.kind === 'skid')).toBe(false);
      const best = measured(l, need, 1.1);
      staffDecide(l);
      expect(l.gamePlans![l.skidCall!.opp].items.map((x) => x.id)).toContain(best.id);
      expect(staffPicksSince(l, l.season, l.day - 1).at(-1)).toMatch(
        new RegExp(`^4 straight losses: .*The staff put in ${esc(best.label)} \\(\\+1\\.1 pts, ≈ \\+\\d+% to win\\) for \\w+ (vs|@) [A-Z]{3}, measured\\.$`),
      );
      expect(agenda(l).some((i) => i.kind === 'skid')).toBe(false);
      // it goes on: eight straight, two counters measured, and a card
      Object.assign(ts, { won: 14, lost: 10, streak: -8 });
      l.day = 50;
      callsDaily(l);
      expect(l.skidCall).toMatchObject({ gp: 24, rung: 2 });
      const next = staffNeeds(l).find((m) => m.key === `skid:${l.season}:24`);
      expect(next).toMatchObject({ max: 2 });
      measured(l, next, 0.2);
      staffDecide(l);
      const s = agenda(l).find((i) => i.kind === 'skid')!;
      expect(s).toMatchObject({
        title: '8 straight losses',
        suggestion: { label: 'Look for a trade', to: expect.stringMatching(/^\/office\/trade\?tab=find&minOvr=\d+$/) },
        choices: [{ label: 'Ride it out' }],
      });
      // the call follows what's behind it: shots that didn't fall (and nobody out) ride it out, the trade the other way
      {
        const m = structuredClone(l);
        m.skidCall!.luck = true;
        const r = agenda(m).find((i) => i.kind === 'skid')!;
        expect([r.suggestion!.label, ...r.choices!.map((c) => c.label)]).toEqual(['Ride it out', 'Look for a trade']);
        expect(r.line).toMatch(/The staff's call: ride it out; the box scores say the shots will come back/);
      }
      expect(s.line).toMatch(
        /Nothing the staff measured for \w+ (vs|@) [A-Z]{3} beats your plan\. The staff's call: look for a trade; counters alone haven't turned it\. Deals until /,
      );
      // nine straight is the same step; past the deadline there's no card
      Object.assign(ts, { lost: 11, streak: -9 });
      callsDaily(l);
      expect(l.skidCall!.gp).toBe(24);
      l.day = l.tradeDeadlineDay + 1;
      expect(agenda(l).some((i) => i.kind === 'skid')).toBe(false);
    }

    // a newcomer's first slump (three under .500 in his first 5-20 games): one plain line from the staff, once, that pulls apart
    // the luck, the games missed hurt and the rest, with the forecast's wins; no odds call before ODDS_FIRST_GAMES
    {
      const l = camp(29);
      while (standardRoster(l, 29).length > CAP.rosterMax) releasePlayer(l, cutOrder(l, standardRoster(l, 29))[0], { news: false });
      startRegularSeason(l);
      for (const p of standardRoster(l, 29)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 4))
        p.injury = { type: 'Torn ACL', gamesRemaining: 82, gamesTotal: 82, severity: 'severe' };
      const ts = curTeamSeason(l, 29);
      while (ts.won + ts.lost < 12) simDay(l);
      const lines = (l.staffPicks ?? []).filter((x) => / as the staff reads it: /.test(x.text));
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toMatch(
        /^\d+-\d+, as the staff reads it: (outscored by|even on points).+\. (About \d+\.\d a game of it is shots that didn't fall|The shots fell about as their looks were worth).+missed \d+ games? hurt.+The forecast, which counts all of it, has you at about \d+ wins\.$/,
      );
      expect(agenda(l).some((i) => i.kind === 'odds')).toBe(false);
    }

    // behind in a series: the staff's adjustment goes in each such morning without a card (one counter, three facing elimination), and is said
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
      const id = `series:${l.season}:${conf}1-0:1-2`;
      expect(agenda(l).some((i) => i.kind === 'series')).toBe(false);
      const need = staffNeeds(l).find((m) => m.key === id);
      expect(need).toMatchObject({ kind: 'counters', max: 1 });
      const best = measured(l, need, 0.9);
      staffDecide(l);
      expect(l.gamePlans![opp].items.map((x) => x.id)).toContain(best.id);
      expect(l.callsDone).toContain(id);
      expect(staffPicksSince(l, l.season, l.day - 1).at(-1)).toMatch(
        new RegExp(
          `^${esc(seriesLabel(l.playoffs[0]))}: down 2-1 to ${l.teams[opp].abbrev}\\. The staff put in ${esc(best.label)} \\(\\+0\\.9 pts, ≈ \\+\\d+% to win\\) for Game 4, measured\\.$`,
        ),
      );
      l.playoffs[0].highWins = 1;
      l.playoffs[0].lowWins = 3;
      expect(staffNeeds(l).find((m) => m.key === `series:${l.season}:${conf}1-0:1-3`)).toMatchObject({ max: 3 });
    }

    // a week's sim and a month's make the same picks (measured in the sim, on its budget), and neither stops for a week with one answer
    {
      const l = nuggets();
      l.settings.stopOnNews = true;
      const wc = billedWeek(l);
      const wg = wc.games![0];
      l.day = wc.week * 7 - 1;
      l.weekCall = undefined;
      const a = structuredClone(l);
      const b = structuredClone(l);
      const outA = await runSim(a, { kind: 'week' }, { progress: () => a.inbox.forEach((x) => (x.read = true)) });
      const outB = await runSim(b, { kind: 'month' }, { progress: () => b.inbox.forEach((x) => (x.read = true)) });
      const pickOf = (x: League) => (x.staffPicks ?? []).find((p) => p.text.includes(` ${l.teams[wg.opp].abbrev} `))?.text;
      expect(a.weekCall!.decided || a.weekCall!.week > wc.week).toBe(true);
      expect(pickOf(a)).toBe(pickOf(b));
      for (const [x, out] of [
        [a, outA],
        [b, outB],
      ] as const)
        if (out.stop === 'call') expect(x.stopCall && (!isWeekId(x.stopCall.id) || !!x.weekCall?.ask)).toBe(true);
    }
  }, 120_000);
});
