// The agenda: required decisions hold the league (and the Continue bar) until they're settled, each
// with the staff's call one tap away; optional ones never block, the staff's calls (a star hurt,
// the odds gone two weeks running, the owner's floor in danger on two readings, the deadline, a
// playoff series or play-in game starting, the books) among them, each only with a real choice in
// it, and one still open coming due again before its deadline. The guided first week is one
// checklist item. Job security: the meter, the grace period, the ultimatum.
import { gmOnly, userJob } from '../league/coaches';
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, roleSettings, type SeedData } from '../league/create';
import { agenda, agendaBlocker, cutOrder, GUIDE_STEPS, guideDone, guideFinished, guideOpen, guideStepOpen, guideStepTitle, resolveAgenda, showGuide } from '../league/agenda';
import { canStartRegularSeason, simDay, startRegularSeason } from '../league/season';
import { CAP_FOR, curTeamSeason, fmtDate, freeAgents, payroll, playerName, standardRoster, teamPlayers } from '../league/helpers';
import { releasePlayer, signPlayer } from '../league/contracts';
import { executeTrade, teamAccepts, validateTrade, type TradeOffer } from '../league/trades';
import { ensureRotation } from '../league/games';
import { fills, movedNeedText, needCache, needMove, needOptions, teamNeed } from '../league/rosterNeed';
import { decisionThreads } from '../league/legacyReview';
import { QUALITY_META } from '../analysis/system';
import { CAP } from '../constants';
import {
  ULTIMATUM_ODDS,
  canBeFired,
  chosenJobSecurity,
  jobSecurity,
  levelOdds,
  maybeUltimatum,
  requestJobSecurity,
  seasonWeight,
  seatHeat,
  ultimatumVerdict,
} from '../league/jobSecurity';
import { ownerWord } from '../league/legacyPulse';
import { ownerEvaluation } from '../league/owner';
import {
  CONCEDE_COST,
  EASE_EDGE,
  YOUTH_TOP,
  floorCap,
  currentGoals,
  floorDanger,
  goalsWhy,
  gradeGoal,
  lastWinsTarget,
  ownerProgress,
  personalityLine,
  previewTitle,
  setOwnerGoals,
  type OwnerReview,
} from '../league/ownerGoals';
import { leagueForecast } from '../analysis/odds';
import {
  DEADLINE_DAYS,
  FLOOR_AGO,
  ODDS_FIRST_GAMES,
  assessDeadlineDeal,
  callsDaily,
  callsDecide,
  changeWorth,
  concedeStanding,
  countersWorth,
  deadlineAnswered,
  dealGoals,
  floorStanding,
  planDeadlineCall,
  quietSeriesStart,
  storeWorth,
} from '../league/calls';
import { makeItWork } from '../league/tradeHelp';
import { lowStarMinutes } from '../league/games';
import { stopsSim } from '../league/agenda';
import { staffPicksSince } from '../league/weekCall';
import { simStopIds } from '../league/agenda';
import { schedulePlayoffDay, seriesLabel } from '../league/playoffs';
import { setPlanItem } from '../league/gamePlans';
import { flowActions } from '../../ui/flow';
import { type League, type Player } from '../types';

const seed = seedJson as unknown as SeedData;

/** A real league with the user's team as it opens camp (`tid` 13: the Lakers carry 16). */
const camp = (tid = 13, settings = {}): League => createLeague({ name: 'agenda', userTid: tid, coachName: 'c', settings: { ...defaultSettings(), ...settings }, seed, rngSeed: 3 });

describe('the agenda', () => {
  /** A team in its first regular season with goals set, `tenure` seasons in charge. */
  function inCharge(tenure: number) {
    const l = camp(5);
    startRegularSeason(l);
    setOwnerGoals(l, true);
    l.tenureStart = l.season - tenure + 1;
    return l;
  }

  it("holds the league for required decisions with the staff's call one tap away, guides the first week, keeps the job on the line, and speaks with one voice", async () => {
    // the roster's need, carried through: Tactics's weakest quality is named, a player who'd fill it
    // reads so, the deal for him keeps it on its log line, and on a rotation the coach runs himself
    // Today asks for him in it until he plays
    {
      const l = camp(5);
      startRegularSeason(l);
      // (a team with one: a quality in the league's bottom half)
      l.userTid = l.teams.find((t) => (l.userTid = t.tid) >= 0 && teamNeed(l))!.tid;
      const me = l.userTid;
      const cache = needCache(l);
      const need = teamNeed(l, cache)!;
      expect(need.rank).toBeGreaterThan(Math.ceil(need.of / 2));
      const filler = Object.values(l.players)
        .filter((p) => p.tid >= 0 && p.tid !== me && !p.injury)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 60)
        .find((p) => fills(needMove(l, need.id, [p.pid], [], cache)))!;
      expect(filler).toBeDefined();
      // it's the staff's opinion, read with the staff's minutes: the allocation a candidate is graded with is said
      expect(need.by).toBe('staff');
      expect(needMove(l, need.id, [filler.pid], [], cache).minutes).toBeGreaterThan(0);
      // the coach can make another weakness his priority, or accept his weaknesses as trade-offs
      {
        const mine = structuredClone(l);
        const options = needOptions(mine);
        expect(options[0]).toMatchObject({ id: need.id, staff: true, weak: true });
        // every quality is offered, weaknesses first, strengths after: not just the few weakest
        expect(options.length).toBe(Object.keys(QUALITY_META).length);
        expect(options.some((o) => !o.weak)).toBe(true);
        expect(options.map((o) => o.weak)).toEqual(options.map((o) => o.weak).sort((a, b) => Number(b) - Number(a)));
        mine.needChoice = 'none';
        expect(teamNeed(mine)).toBeNull();
        mine.needChoice = options.at(-1)!.id;
        expect(teamNeed(mine)).toMatchObject({ id: options.at(-1)!.id, by: 'you' });
      }
      l.teams[me].rotation.manual = true;
      executeTrade(l, { a: { tid: me, pids: [], dpids: [] }, b: { tid: filler.tid, pids: [filler.pid], dpids: [] } });
      ensureRotation(l, me);
      const txn = l.transactions!.at(-1)!;
      expect(txn.need).toMatchObject({ id: need.id, by: 'staff' });
      expect(movedNeedText(l)).toMatch(/^ It fills the staff's read of your need: .+ [A-F]\+? → [A-F]\+?\.$/);
      // whose need it was stays on the log line: the review and the toast say it as it was then
      const why = () => decisionThreads(l, l.season, me)[0].rows.find(([k]) => k === 'Why')![1];
      expect(why()).toMatch(/ was the need the staff named, graded /);
      txn.need!.by = 'you';
      expect(why()).toMatch(/ was the priority you set, graded /);
      expect(movedNeedText(l)).toMatch(/^ It fills your priority: /);
      txn.need!.by = 'staff';
      const row = agenda(l).find((i) => i.id === `deploy:${filler.pid}`)!;
      expect(row).toMatchObject({ kind: 'deploy', to: '/team/rotation', title: `${playerName(filler)} isn't in your rotation` });
      l.teams[me].rotation.minutes[filler.pid] = 20;
      expect(agenda(l).some((i) => i.kind === 'deploy')).toBe(false);
    }

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
      expect(cuts.line).toMatch(/The staff's picks, least value first: .+, (\$[\d.]+[MK] dead money|no dead money)/);
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

    // a coach's own rotation with a healthy regular at no minutes is said before opening night, not after it
    // (a summer's arrivals), and one tap gives him the staff's share out of the others'
    {
      const l = camp(5);
      expect(l.phase).toBe('preseason');
      ensureRotation(l, l.userTid);
      const rot = l.teams[l.userTid].rotation;
      rot.manual = true;
      expect(agenda(l).some((i) => i.kind === 'minutes')).toBe(false);
      const sixth = rot.order.find(
        (pid) =>
          rot.order.indexOf(pid) >= 5 &&
          !l.players[pid].injury &&
          [...teamPlayers(l, l.userTid)]
            .sort((a, b) => b.ovr - a.ovr)
            .slice(0, 8)
            .some((p) => p.pid === pid),
      )!;
      const total = () => teamPlayers(l, l.userTid).reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
      const before = total();
      delete rot.minutes[sixth];
      const item = agenda(l).find((i) => i.kind === 'minutes')!;
      expect(item).toMatchObject({ required: true, to: '/team/rotation', title: `${playerName(l.players[sixth])} has no minutes` });
      expect(resolveAgenda(l, item.suggestion!.action).ok).toBe(true);
      expect(rot.minutes[sixth]).toBeGreaterThanOrEqual(10);
      expect(agenda(l).some((i) => i.kind === 'minutes')).toBe(false);
      // (his share came out of the others': the rotation is no bigger than it was)
      expect(total()).toBeLessThanOrEqual(before + 2);
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
      expect(card()!.line).toMatch(/play or sim to the next game.*the staff's counter in Matchup → Plan.*Once a month the owner checks his goals in Office → Owner/);
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
      expect(welcome.body).toMatch(/^Win about \d+ games: \d+% of my review$/m);
      expect(welcome.link).toBe('/office/owner');
      expect(welcome.body).toMatch(/^Coach c, you're running basketball operations and the bench\./);
      // (a GM-only career: the staff has the bench, and the owner doesn't call him Coach)
      const gm = createLeague({ name: 'agenda', userTid: 5, coachName: 'c', role: 'gm', settings: defaultSettings(), seed, rngSeed: 3 });
      const gmWelcome = gm.inbox.find((m) => m.subject.startsWith('Welcome to the'))!.body;
      expect(gmWelcome).toMatch(/^c, you're running basketball operations\. Your coaching staff runs the bench\./);
      expect(gmWelcome).not.toMatch(/Coach|and the bench/);
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

    // a GM-only career (create.ts's Role): a preset over switches that exist. The staff makes its in-game calls and adjusts in simmed games,
    // the coaching guide starts put away with a note saying who runs the bench, and Today's Guide link brings the checklist back
    {
      const make = (role?: 'coach' | 'gm', settings = defaultSettings()) => createLeague({ name: 'role', userTid: 5, coachName: 'c', settings, seed: null, rngSeed: 5, role });
      // (and the career is told as a GM's: the news and the Coaches tab don't call him a head coach)
      expect(roleSettings('gm')).toEqual({ liveStaff: 'auto', role: 'gm' });
      expect(roleSettings('coach')).toEqual({ liveStaff: 'ask' });
      const gm = make('gm');
      expect(gm.settings.liveStaff).toBe('auto');
      expect([gmOnly(gm), userJob(gm).title, userJob(gm).short]).toEqual([true, 'general manager', 'GM']);
      expect([gmOnly(make('coach')), userJob(make()).title]).toEqual([false, 'head coach']);
      expect(gm.teams[5].tactics.manage.assistantAdjusts).not.toBe(false);
      expect(gm.teams[5].rotation.manual || gm.teams[5].tactics.manual).toBeFalsy();
      expect(gm.onboarding).toEqual({ done: [], hidden: true });
      expect(guideOpen(gm)).toBe(false);
      expect(agenda(gm).some((i) => i.kind === 'guide')).toBe(false);
      expect(gm.inbox.some((m) => m.subject === 'Your first games')).toBe(false);
      expect(gm.inbox.find((m) => m.subject === 'The staff has the bench')).toMatchObject({ from: 'Assistant Coach', link: '/' });
      // (the bench is one tap away: the guide comes back whole)
      showGuide(gm);
      expect(guideOpen(gm)).toBe(true);
      expect(agenda(gm).find((i) => i.kind === 'guide')!.title).toBe(`Your first games · 0 of ${GUIDE_STEPS.length} done`);
      // GM and head coach is the career as it always started, said or not; the preset decides its own switch whatever the settings carried
      const coach = make('coach', { ...defaultSettings(), liveStaff: 'auto' });
      expect(coach.settings.liveStaff).toBe('ask');
      expect(coach.onboarding).toEqual({ done: [] });
      expect(make().settings.liveStaff).toBeUndefined();
      expect(make().onboarding).toEqual({ done: [] });
      // with teaching off the GM gets no note either
      expect(make('gm', { ...defaultSettings(), teaching: false }).inbox.some((m) => m.from === 'Assistant Coach')).toBe(false);
    }

    // job security reads a neutral standing as steady on opening night, and the grace period
    {
      const l = inCharge(1);
      const js = jobSecurity(l);
      expect(js).toMatchObject({ score: 50, heat: 'steady' });
      expect(js.off).toBe(false);
      expect([1, 2, 3].map((n) => canBeFired(inCharge(n)))).toEqual([false, false, true]);
      l.settings.jobSecurity = false;
      expect(jobSecurity(l).off).toBe(true);
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

    // the owner's read is the forecast's, and last season's full-season target holds up the next
    {
      const n = inCharge(1);
      const wins = (x: League) => currentGoals(x)!.goals.find((g) => g.kind === 'wins')!;
      expect(Math.abs(wins(n).perGame! * 82 - leagueForecast(n)!.teams[n.userTid].w)).toBeLessThan(1);
      const review = (): OwnerReview => ({
        season: n.season - 1,
        tid: n.userTid,
        games: 82,
        grade: 0,
        total: 0,
        goals: [{ kind: 'wins', title: 'Win 70 games', target: 70, weight: 1, result: 50, grade: -1 }],
      });
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
      // a screen says it about him, never in his voice
      expect(goalsWhy({ ...og, missed: undefined, rebuild: { year: 1, of: 2 } }, 'screen')).toContain(
        'He gives you two seasons without the playoffs. After that, he wants the play-in.',
      );
      // and his personality agrees with the mandate: a win-now owner setting rebuild goals says he'll take one
      expect(personalityLine('win-now', { rebuild: { year: 1, of: 2 } })).toBe("Win-now · wants results, but he'll take a rebuild this season");
      expect(personalityLine('win-now', {})).toBe('Win-now · wants results this season');
    }

    // job security off waits for the next opening night (no dodging a review); on counts at once
    {
      const l = camp(5);
      requestJobSecurity(l, false);
      expect(l.settings).toMatchObject({ jobSecurity: true, pending: { jobSecurity: false } });
      expect(chosenJobSecurity(l)).toBe(false);
      requestJobSecurity(l, true);
      expect(l.settings.pending).toBeUndefined();
      requestJobSecurity(l, false);
      startRegularSeason(l);
      expect(l.settings.jobSecurity).toBe(false);
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
      // settled, it leaves Today: met, or once the season's review is in, or out of season
      {
        const ult = (m: League) => agenda(m).some((i) => i.kind === 'ultimatum');
        const met = structuredClone(l);
        const mts = met.teams[met.userTid].seasons.find((s) => s.season === met.season)!;
        if (u!.kind === 'wins') mts.won = 82;
        else mts.playoffRound = 5;
        expect(ultimatumVerdict(met, currentGoals(met))).toBe('met');
        expect(ult(met)).toBe(false);
        const reviewed = structuredClone(l);
        reviewed.ownerReviews = [{ season: reviewed.season, tid: reviewed.userTid } as OwnerReview];
        expect(ult(reviewed)).toBe(false);
        const after = structuredClone(l);
        after.phase = 'draft';
        expect(ult(after)).toBe(false);
      }
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
      // (a full roster: nobody to sign for cover)
      while (standardRoster(l, me).length < CAP.rosterMax) signPlayer(l, freeAgents(l)[0], me, CAP_FOR(l).vetMin, 1, { news: false });
      const star = hurt(20);
      const card = () => agenda(l).find((i) => i.kind === 'injury');
      expect(card()).toMatchObject({ required: false, tone: 'bad', title: `${star.firstName} ${star.lastName} is out 20 games`, pids: [star.pid] });
      // a full roster, with the staff on the rotation: ride it out
      expect(card()!.suggestion!.label).toBe('Ride it out');
      // a rotation set by hand: the staff takes it back
      l.teams[me].rotation.manual = true;
      expect(card()!.suggestion!.label).toBe('Let the staff redo the rotation');
      expect(resolveAgenda(l, card()!.suggestion!.action).ok).toBe(true);
      expect(l.teams[me].rotation.manual).toBe(false);
      expect(card()).toBeUndefined();
      // with a spot open: a free agent for cover, signed in one tap
      star.injury = null;
      while (standardRoster(l, me).length >= CAP.rosterMax) releasePlayer(l, standardRoster(l, me).sort((a, b) => a.ovr - b.ovr)[0], { news: false });
      hurt(12);
      const c = card()!;
      expect(c.suggestion!.label).toMatch(/^Sign .+$/);
      const n = standardRoster(l, me).length;
      expect(resolveAgenda(l, c.suggestion!.action).ok).toBe(true);
      expect(standardRoster(l, me).length).toBe(n + 1);
      // a short absence, or someone outside the top three, is no call
      best().injury = null;
      hurt(6);
      expect(card()).toBeUndefined();
      // nor is one whose only answer is to carry on: 12 games out with the roster full again and the staff on the rotation
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
        expect(simStopIds(m)).toContain(id);
        m.transactions = [...(m.transactions ?? []), { id: m.nextTxnId ?? 1, season: m.season, day: m.day, phase: m.phase, kind: 'trade', tids: [me, 0], user: true }];
        expect(simStopIds(m)).not.toContain(id);
        callsDaily(m);
        expect(m.callsDone).toContain(id);
      }
      // measured as no real loss: no trade to look for, and riding it out is the only answer: no card,
      // and when it ages the digest doesn't blame an unanswered card
      storeWorth(l, `injury:${long.pid}:${long.injuryCount}`, { gid: 0, sig: 0, day: l.day, pts: 0.1, raw: 0.1, se: 0.4 });
      expect(card()).toBeUndefined();
      long.injury!.gamesRemaining -= 3;
      callsDaily(l);
      expect(l.staffPicks!.at(-1)!.text).toBe(`${playerName(long)} out, so the staff spread his minutes. Nothing else to choose.`);
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
      expect(card()!.title).toBe("On pace to miss the owner's floor");
      // the lean is the answer his review projects higher (the meter's read, the same record either way), in words
      const st = floorStanding(l)!;
      expect(card()!.detail).toMatch(
        st.ease > st.chase ? /^A development year should leave you better with him at his review/ : /^Chasing it should leave you better with him at his review/,
      );
      expect(card()!.detail).not.toMatch(/\d/);
      const both = [card()!.suggestion!, ...card()!.choices!];
      expect(card()!.suggestion!.label).toBe(st.ease > st.chase ? "Tell him it's a development year" : 'Chase the floor');
      expect(both.find((c) => c.label === 'Chase the floor')).toMatchObject({ to: expect.stringMatching(/^\/office\/trade\?tab=find&minOvr=\d+$/) });
      // (each the meter's projected review: a development year carries its cost)
      expect(st.ease).toBeLessThan(st.chase + 0.5);
      const floor = og.floor!;
      const total = l.ownerMood.total;
      expect(resolveAgenda(l, both.find((c) => c.label === "Tell him it's a development year")!.action).ok).toBe(true);
      // the floor stays, its cap lifted by what telling him cost and EASE_EDGE as the season counts: a
      // season that ends well under it anyway stands EASE_EDGE ahead of chasing, one that clears it
      // CONCEDE_COST behind (dropping the floor 8 wins had stood a rebuilder's 12-70 at −27 to −48)
      expect(currentGoals(l)!.floor).toBe(floor);
      {
        const eased = currentGoals(l)!;
        const n = Math.floor(floor * eased.games) - 8;
        expect((floorCap(eased, n, eased.games) - floorCap({ floor }, n, eased.games)) * seasonWeight(l) - CONCEDE_COST).toBeCloseTo(EASE_EDGE, 2);
        expect(floorCap(eased, Math.ceil(floor * eased.games), eased.games)).toBe(1);
      }
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
      // (a word, not the forecast's figure)
      expect(card.title).toBe('The postseason is slipping away');
      expect(card.due).toBe(`Decide by ${fmtDate(l.season, l.tradeDeadlineDay)}`);
      // it waits in the queue: a long sim doesn't stop for it, the day it opens or as the deadline nears
      expect(simStopIds(l)).not.toContain(card.id);
      l.day = l.tradeDeadlineDay - 5;
      expect(simStopIds(l)).not.toContain(card.id);
      l.day = 35;
      // the staff's lean is the answer that leaves his standing higher, as the forecast reads the season, in words
      {
        const st = concedeStanding(l)!;
        const post = og.goals.find((g) => g.kind === 'postseason')!;
        expect(st.concede).toBe(-CONCEDE_COST);
        expect(st.push).toBeLessThanOrEqual(0);
        expect(st.push).toBeGreaterThanOrEqual(-seasonWeight(l) * post.weight - 1e-9);
        expect(card.detail).toMatch(/^Pushing on should .+\. His goal .+\.\nTelling him now costs standing at once/);
        expect(card.detail).not.toMatch(/\d/);
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
        // (none played: the whole miss, a thousand minutes short of a season's ask being the worst there is)
        const span = Math.max(0.5, after.games / 82);
        expect(gradeGoal(l, after, youth, 0)).toBeCloseTo(Math.max(-1, -youth.target / Math.max(1_000 * span, 0.5 * youth.target)), 2);
        expect(gradeGoal(l, after, youth, 0)).toBeLessThanOrEqual(-0.4);
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
      // the odds it says are today's, in a word, not the reading the call was worked out from
      expect(card.line).toMatch(/^The postseason (is clinched|looks likely|is in reach|is a long shot)\. /);
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
        for (const pid of theirs) expect(card.detail).toContain(`${playerName(l.players[pid])}: ${l.season - l.players[pid].bornYear}, $`);
        {
          const m = structuredClone(l);
          storeWorth(m, ms.key, changeWorth(m, ms, { id: 'deal', pts: 1.2, raw: 1.3, se: 0.4 }));
          const c = agenda(m).find((i) => i.kind === 'deadline')!;
          expect(c.measure).toBeUndefined();
          expect(c.line).toMatch(/The deal should help\.$/);
          expect(c.detail).not.toMatch(/wins over|Postseason odds/);
          expect(c.suggestion!.confirm).toMatch(/^You send .+\. [A-Z].+ sends .+\. The deal should help\.$/);
          // a buy that measures as no gain is his to take, not the staff's call
          if (odds > 500) {
            storeWorth(m, ms.key, changeWorth(m, ms, { id: 'deal', pts: 0.2, raw: 0.3, se: 0.4 }));
            const f = agenda(m).find((i) => i.kind === 'deadline')!;
            expect([f.suggestion!.label, f.choices![0].label]).toEqual(['Stand pat', c.suggestion!.label]);
            expect(f.line).toMatch(/The staff's call: stand pat\. No clear edge from the deal\.$/);
            expect(f.detail).toMatch(/^The best buy it found: .+ from [A-Z].+ for .+\./);
          }
        }
        // a buy never costs the owner's payroll or youth goal: with a payroll line and no room under it, a deal that adds salary isn't the call
        if (odds > 500) {
          const m = structuredClone(l);
          const og = currentGoals(m)!;
          og.goals = [...og.goals.filter((g) => g.kind !== 'payroll'), { kind: 'payroll', title: 'Stay under the luxury tax', target: payroll(m, m.userTid), weight: 0.3 }];
          const re = planDeadlineCall(m);
          if (re.offer) expect(dealGoals(m, re.offer).some((d) => d.kind === 'payroll' && d.with > d.target && d.with > d.now)).toBe(false);
          // (the staff's first pick, had it added salary, is one it passes over now)
          if (dealGoals(m, call.offer!).some((d) => d.kind === 'payroll' && d.with > d.now)) expect(re.offer).not.toEqual(call.offer);
        }
        // a deal its team no longer takes is never offered ("Atlanta has changed its mind" on confirm, the
        // playtest): the card says so, and the next morning works out another, one its team takes
        {
          const m = structuredClone(l);
          const dc = m.deadlineCall!;
          const o = dc.offer!;
          const best = standardRoster(m, o.b.tid)
            .filter((p) => !o.b.pids.includes(p.pid))
            .sort((a, b) => b.ovr - a.ovr)[0];
          dc.offer = { ...o, b: { ...o.b, pids: [...o.b.pids, best.pid] } };
          expect(validateTrade(m, dc.offer).length > 0 || !teamAccepts(m, dc.offer, o.b.tid)).toBe(true);
          const c = agenda(m).find((i) => i.kind === 'deadline')!;
          expect([c.suggestion, ...(c.choices ?? [])].some((x) => x?.action.kind === 'call' && x.action.call.kind === 'trade')).toBe(false);
          expect(c.line).toMatch(/no longer takes the deal the staff found/);
          callsDaily(m);
          const again = m.deadlineCall!.offer;
          if (again) expect(!validateTrade(m, again).length && teamAccepts(m, again, again.b.tid)).toBe(true);
        }
        expect(resolveAgenda(l, card.suggestion!.action).ok).toBe(true);
        for (const pid of theirs) expect(l.players[pid].tid).toBe(tid);
      } else {
        expect(call.offer).toBeUndefined();
        // no deal found: the call names the need, and the look, the staff's call and the solid button, goes where it's met (Find for a buyer, the block for a seller)
        expect(card.line).not.toMatch(/look yourself/);
        expect(card.line).toMatch(odds > 500 ? /buy a player better than your fifth best \(\d+ OVR\)/ : /^The postseason .+ The staff's call: sell/);
        expect(card.suggestion!).toMatchObject({ label: 'Look for a deal', to: expect.stringMatching(odds > 500 ? /^\/office\/trade\?tab=find&minOvr=\d+$/ : /^\/office\/trade/) });
        expect(card.choices!.map((c) => c.label)).toEqual(['Stand pat']);
        // (a look doesn't answer it: standing pat does)
        expect(resolveAgenda(l, card.suggestion!.action).ok).toBe(true);
        expect(deadlineAnswered(l)).toBe(false);
        expect(resolveAgenda(l, card.choices![0].action).ok).toBe(true);
      }
      // answered, it's gone, and Today's deadline row with it
      expect(agenda(l).some((i) => i.kind === 'deadline')).toBe(false);
      expect(deadlineAnswered(l)).toBe(true);
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
      expect(card()!.line).toBe('The staff is measuring its counters against them. Win and you play for the 8th seed. Lose and the season is over.');
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
      // measured with no counter a gain, it's no call (both answers are his playbook as it is): no stop; Today's hero says so, the digest once
      {
        const m = structuredClone(l);
        const ms = card()!.measure!;
        if (ms.kind !== 'counters') throw new Error('not counters');
        storeWorth(m, ms.key, countersWorth(m, ms, []));
        expect(agenda(m).some((i) => i.kind === 'series')).toBe(false);
        expect(simStopIds(m)).not.toContain(`series:${m.season}:${conf}1-0`);
        expect(quietSeriesStart(m)).toBe("None of the staff's counters helps against them. You play them with your playbook as it is.");
        callsDecide(m);
        callsDecide(m);
        expect(staffPicksSince(m, m.season, m.day - 1)).toEqual([
          `${seriesLabel(m.playoffs[0])} vs ${abbrev}, Game 1. None of the staff's counters helps against them, so you play them with your playbook as it is.`,
        ]);
        expect(quietSeriesStart(l)).toBeNull();
      }
      // a plan from before the series still opens it (keep it, or review it); one set for the series answers it
      {
        const m = structuredClone(l);
        m.gamePlans = { [opp]: { oppTid: opp, items: [{ id: 'x', label: 'Pack the paint', patch: {} }], scope: 'next' } };
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

  it("makes the staff's own picks measured and silent (the young players' minutes, a skid's counters) with no card for either, and stops a sim only for what needs an answer", async () => {
    const { counterCandidates } = await import('../ai/advisor');
    const { runSim } = await import('../../state/simCore');
    const { staffDecide, staffNeeds } = await import('../league/callMeasure');
    const { YOUTH_ADD, youthOutlook } = await import('../league/weekCall');
    const { userYouth } = await import('../league/youthLean');
    const { ensureRotation } = await import('../league/games');
    const card = (l: League) => agenda(l).find((i) => i.id.startsWith('week:'));
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
    // the owner wants the young players' minutes and they're behind: free, the staff's lean goes in; costing points, the staff
    // weighs it by the owner's own grading and goes with its lean: no card either way
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
      // (the card's "on pace for" is the Owner page's projection: one, see youthProjected)
      expect(was.base).toBe(ownerProgress(free).find((p) => p.goal.kind === 'youth')!.projected);
      answer(free, -0.2);
      expect(card(free)).toBeUndefined();
      expect(userYouth(free)).toBeGreaterThan(0);
      // the digest says what went in, who it moves, and the staff's opinion of it, not what it measured
      expect(staffPicksSince(free, free.season, free.day - 1).at(-1)).toMatch(/for the owner's goal\.( [^.]*(start|bench|rotation)[^.]*\.)? It shouldn't cost you\.$/);
      const young = (x: League) =>
        Object.values(x.players)
          .filter((p) => p.tid === x.userTid && x.season - p.bornYear <= 23)
          .reduce((a, p) => a + (x.teams[x.userTid].rotation.minutes[p.pid] ?? 0), 0);
      // (in from tonight: the staff's rotation leans to them)
      expect(young(free)).toBeGreaterThan(young(l));
      ensureRotation(free, free.userTid);
      expect(young(free)).toBeGreaterThan(young(l));
      answer(l, -0.9);
      expect(card(l)).toBeUndefined();
      expect(l.weekCall).toMatchObject({ decided: true, taken: 'auto' });
      expect(['auto', 'kept']).toContain(l.youthLean!.how);
      expect(staffPicksSince(l, l.season, l.day - 1).at(-1)).toMatch(
        /^(About \d+ more minutes a game for the young players until .+\. It could cost a little now: the staff weighed it against the owner's goals\.|The rotation stays as it is\. More minutes for the young players would cost more than they bring\.)$/,
      );
      // decided: not weighed again for a while
      l.day = 21;
      l.weekCall = undefined;
      callsDaily(l);
      expect((l.weekCall as League['weekCall'])!.youth).toBeUndefined();
    }

    // after the deadline with the postseason out of reach: the young players' minutes against the draft (his own first as the forecast
    // reads the standings), wins that don't move the pick buying nothing; once the lean's games are played it's measured again, and said
    {
      const l = camp(29);
      startRegularSeason(l);
      setOwnerGoals(l, true);
      const og = currentGoals(l)!;
      og.goals = og.goals.filter((g) => g.kind !== 'youth');
      l.day = (Math.floor(l.tradeDeadlineDay / 7) + 1) * 7;
      l.oddsTrail = { season: l.season, tid: l.userTid, pts: [[l.day - 1, 20, 0]] };
      callsDaily(l);
      expect(l.weekCall!.youth).toMatchObject({ why: 'draft' });
      const answer = (x: League, pts: number) => {
        for (const m of staffNeeds(x)) changed(x, m, pts);
        staffDecide(x);
      };
      const flat = structuredClone(l);
      answer(flat, -0.6);
      expect(card(flat)).toBeUndefined();
      expect(flat.youthLean).toMatchObject({ how: 'kept', level: 0 });
      expect(staffPicksSince(flat, flat.season, flat.day - 1).at(-1)).toMatch(/^The rotation stays as it is\. More minutes for the young players wouldn't move your pick\.$/);
      answer(l, -6);
      expect(card(l)).toBeUndefined();
      const y = l.youthLean!;
      expect(y).toMatchObject({ why: 'draft', pts: -6 });
      expect(['auto', 'kept']).toContain(y.how);
      // a lean that cost points going in is measured again once its games are played, and said
      if (y.how === 'auto') {
        expect(staffNeeds(l).some((m) => m.key.endsWith('|again'))).toBe(false);
        for (const g of l.schedule) if (g.type === 'regular' && g.day >= y.from && g.day <= y.until && (g.home === l.userTid || g.away === l.userTid)) g.played = true;
        const again = staffNeeds(l).find((m) => m.key.endsWith('|again'))!;
        expect(again.kind === 'change' && again.base?.teams?.[l.userTid].rotation).toBeTruthy();
        answer(l, -1.1);
        expect(staffPicksSince(l, l.season, l.day - 1).at(-1)).toMatch(
          /^The young players' minutes for the draft, .+ on \w+ \d+\. Seems to hurt\. They played 0 minutes in its \d+ games\.$/,
        );
        expect(staffNeeds(l).some((m) => m.key.endsWith('|again'))).toBe(false);
      }
    }

    // a losing skid, a winning team's too: the counters are the staff's, measured, the slide said; a bad team losing
    // four straight is having its season; a slide that goes on gets a second counter, and never a card
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
      expect(agenda(l).some((i) => i.id.startsWith('skid:'))).toBe(false);
      const best = measured(l, need, 1.1);
      staffDecide(l);
      expect(l.gamePlans![l.skidCall!.opp].items.map((x) => x.id)).toContain(best.id);
      expect(staffPicksSince(l, l.season, l.day - 1).at(-1)).toMatch(new RegExp(`^4 straight losses\\. .*The staff put in ${esc(best.label)} for \\w+ (vs|@) [A-Z]{3}\\.$`));
      expect(agenda(l).some((i) => i.id.startsWith('skid:'))).toBe(false);
      // it goes on: eight straight, two counters measured, and still no card
      Object.assign(ts, { won: 14, lost: 10, streak: -8 });
      l.day = 50;
      callsDaily(l);
      expect(l.skidCall).toMatchObject({ gp: 24, rung: 2 });
      const next = staffNeeds(l).find((m) => m.key === `skid:${l.season}:24`);
      expect(next).toMatchObject({ max: 2 });
      measured(l, next, 0.2);
      staffDecide(l);
      expect(agenda(l).some((i) => i.id.startsWith('skid:'))).toBe(false);
      expect(simStopIds(l).some((id) => id.startsWith('skid:'))).toBe(false);
      // nine straight is the same step
      Object.assign(ts, { lost: 11, streak: -9 });
      callsDaily(l);
      expect(l.skidCall!.gp).toBe(24);
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
      const lines = (l.staffPicks ?? []).filter((x) => /The forecast, which counts all of it/.test(x.text));
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toMatch(
        /^\d+-\d+\. (Outscored by|Even on points)[^.]+\.\d[^.]*\. (Some of it is shots that didn't fall|The shots fell about as their looks were worth).+missed \d+ games? hurt.+The forecast, which counts all of it, has you (as a winning team|in the middle of the pack|near the bottom)\.$/,
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
        new RegExp(`^${esc(seriesLabel(l.playoffs[0]))}, down 2-1 to ${l.teams[opp].abbrev}\\. The staff put in ${esc(best.label)} for Game 4\\.$`),
      );
      l.playoffs[0].highWins = 1;
      l.playoffs[0].lowWins = 3;
      expect(staffNeeds(l).find((m) => m.key === `series:${l.season}:${conf}1-0:1-3`)).toMatchObject({ max: 3 });
    }

    // a week's sim and a month's make the same picks (measured in the sim, on its budget), and neither stops for a week with one answer
    {
      const l = camp(20);
      startRegularSeason(l);
      setOwnerGoals(l, true);
      currentGoals(l)!.goals.push({ kind: 'youth', title: 'Play your young players', target: 99_999, weight: 0.3 });
      l.settings.stopOnNews = true;
      l.day = 13;
      l.weekCall = undefined;
      const a = structuredClone(l);
      const b = structuredClone(l);
      const outA = await runSim(a, { kind: 'week' }, { progress: () => a.inbox.forEach((x) => (x.read = true)) });
      const outB = await runSim(b, { kind: 'month' }, { progress: () => b.inbox.forEach((x) => (x.read = true)) });
      const pickOf = (x: League) => (x.staffPicks ?? []).find((p) => p.text.startsWith('The young players'))?.text;
      expect(a.weekCall!.decided || a.weekCall!.week > 2).toBe(true);
      expect(pickOf(a)).toBe(pickOf(b));
      for (const [x, out] of [
        [a, outA],
        [b, outB],
      ] as const)
        if (out.stop === 'call') expect(x.stopCall && !x.stopCall.id.startsWith('week:')).toBe(true);
    }

    // P0 #4: deadline trade cards reject bad value, aging-vet pick mortgages, and core-star downgrades,
    // and explicitly label bad deals as bad with Stand pat on the primary button
    {
      const l = camp(9); // Golden State (aging supermax star Curry) or any contender with stars
      while (standardRoster(l, 9).length > CAP.rosterMax) releasePlayer(l, cutOrder(l, standardRoster(l, 9))[0], { news: false });
      startRegularSeason(l);
      setOwnerGoals(l, true);
      l.day = l.tradeDeadlineDay - DEADLINE_DAYS;
      l.oddsTrail = { season: l.season, tid: 9, pts: [[l.day - 1, 700, 0]] };
      const myRoster = standardRoster(l, 9).sort((a, b) => b.ovr - a.ovr);
      const star = myRoster[0];
      const myFirst = l.draftPicks.filter((d) => d.tid === 9 && d.round === 1).slice(0, 1);
      // a destructive overpay the other team takes and the rules allow (a card offers no other kind):
      // the franchise star and a first for another team's best player, made a 35-year-old no better
      let found: { vet: Player; offer: TradeOffer } | null = null;
      for (const t of l.teams) {
        if (t.tid === 9) continue;
        const vet = standardRoster(l, t.tid).sort((a, b) => b.ovr - a.ovr)[0];
        const was = { bornYear: vet.bornYear, ovr: vet.ovr };
        vet.bornYear = l.season - 35;
        vet.ovr = Math.min(vet.ovr, star.ovr);
        const offer = { a: { tid: 9, pids: [star.pid], dpids: myFirst.map((d) => d.dpid) }, b: { tid: t.tid, pids: [vet.pid], dpids: [] } };
        if (!validateTrade(l, offer).length && teamAccepts(l, offer, t.tid)) {
          found = { vet, offer };
          break;
        }
        Object.assign(vet, was);
      }
      if (!found) throw new Error('no team takes the overpay');
      const otherTid = found.offer.b.tid;
      const agingVet = found.vet;
      const badOffer = found.offer;
      const ev = assessDeadlineDeal(l, badOffer, 'buy');
      expect(ev.bad).toBe(true);
      expect(ev.reason).toMatch(/^Bad /);
      // Even if a saved deadlineCall holds this bad offer (and even if single-game pts measured positive!),
      // the deadline card MUST label it bad, put Stand pat on the primary suggestion button, and NEVER say "should help"
      l.deadlineCall = { season: l.season, mode: 'buy', odds: 700, offer: badOffer };
      const id = `deadline:${l.season}`;
      storeWorth(l, id, { day: l.day, gid: l.schedule[0].gid, sig: 1, pts: 1.5, raw: 1.6, se: 0.4 });
      const card = agenda(l).find((i) => i.kind === 'deadline')!;
      expect(card.tone).toBe('bad');
      expect(card.line).toMatch(/The staff's call: stand pat\. Bad /);
      expect(card.line).not.toMatch(/should help/i);
      expect(card.suggestion!.label).toBe('Stand pat');
      expect(card.choices![0].tone).toBe('bad');
      expect(card.choices![0].confirm).toMatch(/^Warning: Bad /);
      // makeItWork must never dump an 84+ OVR aging franchise star as salary filler for a worse/equal target
      star.ovr = 89;
      star.bornYear = l.season - 37;
      agingVet.ovr = 84;
      const ask = makeItWork(l, { a: { tid: 9, pids: [], dpids: [] }, b: { tid: otherTid, pids: [agingVet.pid], dpids: [] } });
      if (ask.offer) expect(ask.offer.a.pids).not.toContain(star.pid);
    }

    // P0 #5: stale manual minutes warn loudly when a top-two healthy star is planned under 28 min, stop sims, and fix in one tap
    {
      const l = camp(6);
      while (standardRoster(l, 6).length > CAP.rosterMax) releasePlayer(l, cutOrder(l, standardRoster(l, 6))[0], { news: false });
      startRegularSeason(l);
      const rot = l.teams[6].rotation;
      rot.manual = true;
      const stars = standardRoster(l, 6)
        .filter((p) => !p.injury)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 2);
      rot.minutes[stars[0].pid] = 21;
      rot.minutes[stars[1].pid] = 20;
      const low = lowStarMinutes(l, 6);
      expect(low.map((x) => x.player.pid)).toEqual([stars[0].pid, stars[1].pid]);
      const warn = agenda(l).find((i) => i.id.startsWith('lowMinutes:'))!;
      expect(warn).toBeDefined();
      expect(warn.title).toBe('Top stars short on minutes');
      expect(stopsSim(warn)).toBe(true);
      // One-tap "Keep as set" silences it
      const kept = structuredClone(l);
      expect(resolveAgenda(kept, warn.choices![0].action).ok).toBe(true);
      expect(agenda(kept).some((i) => i.id.startsWith('lowMinutes:'))).toBe(false);
      // One-tap "Give star minutes" restores both stars above 28 minutes and clears the warning
      expect(resolveAgenda(l, warn.suggestion!.action).ok).toBe(true);
      expect(rot.minutes[stars[0].pid]).toBeGreaterThanOrEqual(30);
      expect(rot.minutes[stars[1].pid]).toBeGreaterThanOrEqual(30);
      expect(lowStarMinutes(l, 6)).toEqual([]);
      expect(agenda(l).some((i) => i.id.startsWith('lowMinutes:'))).toBe(false);
    }
  }, 120_000);
});
