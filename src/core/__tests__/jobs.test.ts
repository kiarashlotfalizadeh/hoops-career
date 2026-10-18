// The job market: a fired user hears from the openings whose owners would rather have him than the
// coach they hired (always one at least), or with no openings from the teams likeliest to make a
// change; a user with a job is approached only when an opening rates him clearly above its hire;
// taking a job is a takeover that clears the other offers and reads as a hiring in the news;
// declining, the draft and saves.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { migrate } from '../../state/persistence';
import { activeCoach, candidateScore, coachCareer, openStint, profileOf, registryProblems, userCoach, type CarouselMoves } from '../league/coaches';
import { declineJob, makeJobOffers, takeJob } from '../league/jobs';
import { simDay, startDraft } from '../league/season';
import type { League } from '../types';

describe('the job market', () => {
  let l: League;
  beforeAll(() => {
    l = testLeague('jobs');
    l.id = 'lg_jobs';
    for (let i = 0; i < 400 && l.phase !== 'draftLottery'; i++) simDay(l);
  }, 180_000);

  /** An AI team and the coach in charge there, as if the carousel had just hired him. */
  const hire = (x: League, n = 1): CarouselMoves => {
    const teams = x.teams.filter((t) => t.tid !== x.userTid).slice(0, n);
    return { fired: [], hired: teams.map((t) => ({ tid: t.tid, coach: activeCoach(x, t.tid)!.id, first: false })) };
  };
  const scoreOf = (x: League, tid: number, user: boolean) => {
    const r = user ? userCoach(x)! : activeCoach(x, tid)!;
    return candidateScore(x, tid, { profile: profileOf(r), rec: r, career: coachCareer(x, r) }, user && !!x.fired);
  };

  it('a fired user always hears from an opening, and from every one that would rather have him', () => {
    const x = structuredClone(l);
    x.fired = true;
    const moves = hire(x, 4);
    makeJobOffers(x, moves);
    const offers = x.jobOffers!.offers;
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers.every((o) => o.kind === 'opening' && o.tid !== x.userTid)).toBe(true);
    const wanted = moves.hired.filter((h) => scoreOf(x, h.tid, true) - scoreOf(x, h.tid, false) >= -0.25).map((h) => h.tid);
    if (wanted.length) expect(offers.map((o) => o.tid).sort()).toEqual(wanted.sort());
    // the agent says so, and long sims stop for it
    expect(x.inbox.some((m) => m.from === 'Your agent' && m.important && m.link === '/office/career')).toBe(true);
  });

  it('with no openings, the two teams closest to a change call instead', () => {
    const x = structuredClone(l);
    x.fired = true;
    makeJobOffers(x, { fired: [], hired: [] });
    const offers = x.jobOffers!.offers;
    expect(offers).toHaveLength(2);
    expect(offers.every((o) => o.kind === 'change' && o.tid !== x.userTid)).toBe(true);
  });

  it('a user with a job is approached only after two seasons, by an opening that rates him clearly above its hire', () => {
    const x = structuredClone(l);
    makeJobOffers(x, hire(x, 6));
    // his first season in charge: nobody calls
    expect(x.jobOffers).toBeUndefined();
    x.tenureStart = x.season - 2;
    const moves = hire(x, 6);
    makeJobOffers(x, moves);
    const want = moves.hired
      .map((h) => ({ tid: h.tid, edge: scoreOf(x, h.tid, true) - scoreOf(x, h.tid, false) }))
      .filter((h) => h.edge >= 0.4)
      .sort((a, b) => b.edge - a.edge)
      .map((h) => h.tid);
    expect((x.jobOffers?.offers ?? []).map((o) => o.tid)).toEqual(want.slice(0, 2));
    expect((x.jobOffers?.offers ?? []).every((o) => o.kind === 'approach')).toBe(true);
  });

  it('taking a job is a takeover: the other offers go, the news calls it a hiring, the registry stays whole', () => {
    const x = structuredClone(l);
    x.fired = true;
    const old = x.userTid;
    makeJobOffers(x, hire(x, 3));
    const offer = x.jobOffers!.offers[0];
    const displaced = activeCoach(x, offer.tid)!;
    expect(takeJob(x, offer.tid)).toBeNull();
    expect(x.userTid).toBe(offer.tid);
    expect(x.fired).toBe(false);
    expect(x.jobOffers).toBeUndefined();
    expect(registryProblems(x)).toEqual([]);
    // the coach in charge there takes the user's old job
    expect(openStint(displaced)?.tid).toBe(old);
    expect(x.news.some((n) => n.kind === 'coach' && n.text.startsWith(`The ${x.teams[offer.tid].name} hired ${x.coachName}`))).toBe(true);
    // and the season can go on to the draft
    expect(startDraft(x)).toBe(true);
  });

  it('an offer turned down goes; the draft ends them; saves keep them and drop damaged ones', () => {
    const x = structuredClone(l);
    x.fired = true;
    makeJobOffers(x, hire(x, 4));
    expect(migrate(structuredClone(x)).jobOffers).toEqual(x.jobOffers);
    const bad = structuredClone(x) as unknown as { jobOffers: { offers: unknown[] } };
    bad.jobOffers.offers.push({ tid: x.userTid, kind: 'opening', note: 'x' });
    expect(migrate(bad).jobOffers).toBeUndefined();
    for (const o of [...x.jobOffers!.offers]) declineJob(x, o.tid);
    expect(x.jobOffers).toBeUndefined();
    // a user with a job and a standing approach: the draft ends it
    const y = structuredClone(l);
    y.jobOffers = { season: y.season, offers: [{ tid: (y.userTid + 1) % 30, kind: 'approach', note: 'call' }] };
    expect(startDraft(y)).toBe(true);
    expect(y.jobOffers).toBeUndefined();
  });
});
