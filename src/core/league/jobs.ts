// The job market: after the playoffs, once the coaching carousel has made its moves, the teams that
// changed coaches look at the user too. A fired user hears from every opening whose owner would
// rather have him than the coach it just hired (candidateScore: his record, titles, Coaches of the
// Year and playoff runs, less for one fired this summer); when none would, the league's two worst
// records take a chance on him (the league waits for a fired coach, so he always has a call). A
// user still in his job can be approached after a good run, when an opening rates him clearly above
// its hire. Those offers are the only way to another job (god mode can put him anywhere). Taking a
// job is a takeover (the coach the team hired, or the one it lets go, takes the user's old job), his
// reputation comes with him (part of his standing with the last owner), and the offers go with the
// draft. Nothing here draws from a random stream.

import type { League } from '../types';
import { activeCoach, candidateScore, coachCareer, coyWinners, openStint, profileOf, userCoach, type CarouselMoves } from './coaches';
import { addInbox, addNews, andList, curTeamSeason, winPct } from './helpers';
import { clamp } from '../random';
import { seasonsInCharge, takeOverTeam } from './owner';

export type JobOfferKind = 'opening' | 'approach' | 'change';

/** A team that wants the user: an opening (after a firing), an approach (while he has a job), or a change it would make for him. */
export interface JobOffer {
  tid: number;
  kind: JobOfferKind;
  note: string;
}

/** How far below a team's hire a fired user can rate and still get its offer: an owner is glad to have a proven coach back. */
const OFFER_MARGIN = 0.25;
/** How far above its hire a user with a job must rate for an opening to approach him. */
const APPROACH_MARGIN = 0.4;
/** Seasons in charge before other teams approach him. */
const APPROACH_SEASONS = 2;
/** The most approaches a summer. */
const MAX_APPROACHES = 2;
/** Calls a fired coach nobody wants still gets: the league's worst records. */
const LAST_RESORT = 2;
/** Share of his standing with his last owner a coach brings to the next job (his reputation), and the most it can be either way. */
export const REPUTATION_CARRY = 0.5;
export const REPUTATION_MAX = 0.3;

const record = (league: League, tid: number) => {
  const ts = curTeamSeason(league, tid);
  return `${ts.won}-${ts.lost}`;
};

/** The user as a candidate for a team's job: his profile and his career (see candidateScore). */
function userScore(league: League, tid: number): number | null {
  const me = userCoach(league);
  if (!me) return null;
  return candidateScore(league, tid, { profile: profileOf(me), rec: me, career: coachCareer(league, me, coyWinners(league)) }, !!league.fired);
}

/** The offers the carousel's moves leave for the user (League.jobOffers), with one inbox message about them. Call after coachingCarousel. */
export function makeJobOffers(league: League, moves: CarouselMoves) {
  delete league.jobOffers;
  const me = userCoach(league);
  if (!me) return;
  const coy = coyWinners(league);
  const hiredScore = (tid: number, coach: number) => {
    const r = league.coaches?.find((x) => x.id === coach);
    return r ? candidateScore(league, tid, { profile: profileOf(r), rec: r, career: coachCareer(league, r, coy) }, false) : 0;
  };
  const openings = moves.hired
    .filter((h) => h.tid !== league.userTid)
    .map((h) => ({ ...h, edge: (userScore(league, h.tid) ?? -Infinity) - hiredScore(h.tid, h.coach) }))
    .sort((a, b) => b.edge - a.edge);
  const offers: JobOffer[] = [];
  const firedText = (tid: number) => {
    const f = moves.fired.find((x) => x.tid === tid);
    const r = f && league.coaches?.find((x) => x.id === f.coach);
    return r ? ` after letting ${r.name} go` : '';
  };
  if (league.fired) {
    for (const o of openings.filter((x) => x.edge >= -OFFER_MARGIN))
      offers.push({
        tid: o.tid,
        kind: 'opening',
        note: `The ${league.teams[o.tid].name} (${record(league, o.tid)}) have an opening${firedText(o.tid)} and want you to take over.`,
      });
    if (!offers.length) {
      // nobody's first choice: the jobs nobody else wants, the league's worst records, take a chance on him
      // (the league waits for a fired coach, so there is always a call: just not a good one)
      const hiring = new Set(openings.map((o) => o.tid));
      const worst = league.teams
        .filter((t) => t.tid !== league.userTid && !activeCoach(league, t.tid)?.user)
        .sort((a, b) => winPct(curTeamSeason(league, a.tid)) - winPct(curTeamSeason(league, b.tid)) || a.tid - b.tid)
        .slice(0, LAST_RESORT);
      for (const t of worst)
        offers.push({
          tid: t.tid,
          kind: hiring.has(t.tid) ? 'opening' : 'change',
          note: hiring.has(t.tid)
            ? `The ${t.name} (${record(league, t.tid)}) have an opening${firedText(t.tid)}, and nobody better is calling: they'll take a chance on you.`
            : `The ${t.name} (${record(league, t.tid)}) would make a change and take a chance on you: ${activeCoach(league, t.tid)?.name ?? 'their coach'} would take over your old team.`,
        });
    }
  } else if (seasonsInCharge(league) >= APPROACH_SEASONS) {
    for (const o of openings.filter((x) => x.edge >= APPROACH_MARGIN).slice(0, MAX_APPROACHES))
      offers.push({
        tid: o.tid,
        kind: 'approach',
        note: `The ${league.teams[o.tid].name} (${record(league, o.tid)}) would like to talk to you about their opening${firedText(o.tid)}.`,
      });
  }
  if (!offers.length) return;
  league.jobOffers = { season: league.season, offers };
  const names = andList(offers.map((o) => `the ${league.teams[o.tid].name}`));
  addInbox(league, {
    important: true,
    from: 'Your agent',
    subject: league.fired ? (offers.length > 1 ? `${offers.length} job offers` : 'A job offer') : 'Other teams are calling',
    body: league.fired
      ? `${names[0].toUpperCase()}${names.slice(1)} want you as head coach. ${offers.map((o) => o.note).join(' ')} Take one: the league waits until you do.`
      : `${offers.map((o) => o.note).join(' ')} Stay put, or ${offers.length > 1 ? 'take one of the jobs: the offers stand' : 'take the job: the offer stands'} until the draft.`,
    tone: 'good',
    link: '/office/career',
  });
}

/** The user's offer from this team, if it stands. */
export const jobOffer = (league: League, tid: number) => league.jobOffers?.offers.find((o) => o.tid === tid);

/**
 * Take a job: a takeover of the team (see takeOverTeam; the coach in charge there takes the user's old
 * job), in the news as a hiring when it came from an offer. Any other offers go. Returns why not, or null.
 */
export function takeJob(league: League, tid: number): string | null {
  if (tid === league.userTid || !league.teams[tid]) return 'Pick another team.';
  const offer = jobOffer(league, tid);
  // jobs come to him; god mode, or a fired coach with no offers on file (a save from before them), can take any
  if (!offer && !league.settings.godMode && !(league.fired && !league.jobOffers?.offers.length)) return `The ${league.teams[tid].name} haven't offered you the job.`;
  const old = league.teams[league.userTid];
  const displaced = activeCoach(league, tid);
  // his reputation comes with him: part of where he stood with his last owner (a firing's poor standing too)
  const was = league.ownerMood.total;
  takeOverTeam(league, tid);
  league.ownerMood.total = Math.round(clamp(was * REPUTATION_CARRY, -REPUTATION_MAX, REPUTATION_MAX) * 100) / 100;
  delete league.jobOffers;
  if (offer) {
    const t = league.teams[tid];
    const me = userCoach(league);
    const k = me ? coachCareer(league, me) : null;
    const resume =
      k && k.seasons ? ` (${k.won}-${k.lost} in ${k.seasons} season${k.seasons === 1 ? '' : 's'}${k.titles ? `, ${k.titles} title${k.titles > 1 ? 's' : ''}` : ''})` : '';
    addNews(league, {
      kind: 'coach',
      text: `The ${t.name} hired ${league.coachName}${resume}${displaced && !displaced.user && openStint(displaced)?.tid === old.tid ? `; ${displaced.name} takes over the ${old.name}` : ''}.`,
      tids: [tid, old.tid],
      pids: [],
    });
  }
  return null;
}

/** Turn an offer down: it goes, and the team keeps the coach it has. */
export function declineJob(league: League, tid: number) {
  if (!league.jobOffers) return;
  league.jobOffers.offers = league.jobOffers.offers.filter((o) => o.tid !== tid);
  if (!league.jobOffers.offers.length) delete league.jobOffers;
}
