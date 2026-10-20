// The agenda: required decisions hold the league (and the Continue bar) until they're settled, each
// with the staff's call one tap away; optional ones never block. The guided first week runs as one
// agenda item at a time. Job security: the meter, the grace period by difficulty, the ultimatum.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../league/create';
import { agenda, agendaBlocker, cutOrder, GUIDE_STEPS, guideDone, guideOpen, resolveAgenda, showGuide } from '../league/agenda';
import { canStartRegularSeason, simDay, startRegularSeason } from '../league/season';
import { standardRoster } from '../league/helpers';
import { releasePlayer } from '../league/contracts';
import { CAP } from '../constants';
import { canBeFired, jobSecurity, maybeUltimatum, ultimatumVerdict } from '../league/jobSecurity';
import { ownerEvaluation } from '../league/owner';
import { currentGoals, setOwnerGoals } from '../league/ownerGoals';
import { flowActions } from '../../ui/flow';
import type { League } from '../types';

const seed = seedJson as unknown as SeedData;

/** A real league with the user's team as it opens camp (`tid` 13: the Lakers carry 16). */
const camp = (tid = 13, settings = {}): League => createLeague({ name: 'agenda', userTid: tid, coachName: 'c', settings: { ...defaultSettings(), ...settings }, seed, rngSeed: 3 });

describe('the agenda', () => {
  it('holds opening night on a roster over 15, with the cut the staff would make one tap away', () => {
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
  });

  it('holds opening night on a roster under 13, with the signing the staff would make one tap away', () => {
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
  });

  it("a fired coach's only way on is a new job", () => {
    const l = camp(5);
    l.fired = true;
    expect(agenda(l)).toEqual([expect.objectContaining({ kind: 'fired', required: true, to: '/office/career' })]);
  });

  it('turns trade offers into choices that never block', () => {
    const l = camp(5);
    startRegularSeason(l);
    for (let i = 0; i < 60 && !(l.proposals ?? []).length; i++) simDay(l);
    const offer = agenda(l).find((i) => i.kind === 'tradeOffer');
    if (!offer) return; // (no AI team made an offer in two months: nothing to check)
    expect(offer.required).toBe(false);
    expect(agendaBlocker(l)).toBeNull();
    const id = Number(offer.id.split(':')[1]);
    expect(resolveAgenda(l, { kind: 'proposal', id, accept: false })).toEqual({ ok: true, text: 'Offer turned down.' });
    expect(agenda(l).some((i) => i.id === offer.id)).toBe(false);
  });
});

describe('the guided first week', () => {
  it('runs one step at a time, ticks off steps done anyway, and can be hidden and brought back', () => {
    const l = camp(5);
    expect(guideOpen(l)).toBe(true);
    const step = () => agenda(l).find((i) => i.kind === 'guide');
    expect(step()).toMatchObject({ required: false, title: `1 of ${GUIDE_STEPS.length} · Check your rotation`, to: '/team/rotation' });
    resolveAgenda(l, step()!.suggestion!.action);
    expect(step()?.title).toMatch(/^2 of 4 · Pick a playbook/);
    // editing the playbook counts as picking one
    l.teams[l.userTid].tactics.manual = true;
    expect(guideDone(l).has('playbook')).toBe(true);
    expect(step()?.title).toMatch(/^3 of 4 · Scout your opener/);
    resolveAgenda(l, { kind: 'hideGuide' });
    expect(step()).toBeUndefined();
    showGuide(l);
    expect(step()?.title).toMatch(/^3 of 4/);
    // it's for the first weeks of the first season only
    startRegularSeason(l);
    l.day = 30;
    expect(guideOpen(l)).toBe(false);
  });

  it('stays out of the way with teaching off: no guide, no welcome mail, and turning it back on brings the guide', () => {
    const l = camp(5, { teaching: false });
    expect(guideOpen(l)).toBe(false);
    expect(agenda(l).some((i) => i.kind === 'guide')).toBe(false);
    expect(l.inbox.some((m) => m.subject === 'Your first week')).toBe(false);
    expect(camp(5).inbox.some((m) => m.subject === 'Your first week')).toBe(true);
    l.settings.teaching = true;
    expect(guideOpen(l)).toBe(true);
  });
});

describe('job security', () => {
  /** A team in its first regular season with goals set, `tenure` seasons in charge. */
  function inCharge(tenure: number, difficulty: League['settings']['difficulty'] = 'normal') {
    const l = camp(5, { difficulty });
    startRegularSeason(l);
    setOwnerGoals(l, true);
    l.tenureStart = l.season - tenure + 1;
    return l;
  }

  it('reads a neutral standing as steady on opening night, and the grace period by difficulty', () => {
    const l = inCharge(1);
    const js = jobSecurity(l);
    expect(js).toMatchObject({ score: 50, heat: 'steady' });
    expect(js.off).toBe(false);
    expect([1, 2, 3].map((n) => canBeFired(inCharge(n)))).toEqual([false, false, true]);
    expect([1, 2].map((n) => canBeFired(inCharge(n, 'hard')))).toEqual([false, true]);
    expect([3, 4].map((n) => canBeFired(inCharge(n, 'easy')))).toEqual([false, true]);
    l.settings.jobSecurity = false;
    expect(jobSecurity(l).off).toBe(true);
  });

  it('gives a coach on the hot seat an ultimatum at the break, and fires him when he misses it', () => {
    const l = inCharge(4);
    l.ownerMood.total = -0.45;
    // a bad first half: the record the projection reads
    const ts = l.teams[l.userTid].seasons.find((s) => s.season === l.season)!;
    ts.won = 12;
    ts.lost = 38;
    const u = maybeUltimatum(l);
    expect(u).not.toBeNull();
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
  });

  it('never gives an ultimatum during the grace period or with job security off', () => {
    const l = inCharge(1);
    l.ownerMood.total = -0.9;
    expect(maybeUltimatum(l)).toBeNull();
    const m = inCharge(4);
    m.ownerMood.total = -0.9;
    m.settings.jobSecurity = false;
    expect(maybeUltimatum(m)).toBeNull();
  });
});

describe('the assistant', () => {
  it('speaks with one voice: every card has an area, and a fix it offers is one the staff can make', async () => {
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
  });
});
