// The job market: after the playoffs, once the coaching carousel has made its moves, the teams that
// changed coaches look at the user too. A fired user hears from every opening whose owner would
// rather have him than the coach it just hired (candidateScore: his record, titles, Coaches of the
// Year and playoff runs, less for one fired this summer), and always from one at least; with no
// openings at all, the two teams likeliest to make a change call instead. A user still in his job
// can be approached after a good run, when an opening rates him clearly above its hire. Taking a job
// is a takeover (the coach the team hired, or the one it lets go, takes the user's old job), and the
// offers go with the draft. Nothing here draws from a random stream.

import type { League } from '../types';
import { activeCoach, candidateScore, coachCareer, coyWinners, firingOdds, openStint, profileOf, rosterResiduals, userCoach, type CarouselMoves } from './coaches';
import { addInbox, addNews, andList, curTeamSeason } from './helpers';
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
    const wanted = openings.filter((o) => o.edge >= -OFFER_MARGIN);
    // nobody is left without a call: the opening that rates him best
    for (const o of wanted.length ? wanted : openings.slice(0, 1))
      offers.push({
        tid: o.tid,
        kind: 'opening',
        note: `The ${league.teams[o.tid].name} (${record(league, o.tid)}) have an opening${firedText(o.tid)} and want you to take over.`,
      });
    if (!offers.length) {
      // no openings this summer: the owners closest to a change would make one for him
      const resid = new Map<number, Map<number, number>>();
      const fit = (season: number) => resid.get(season) ?? resid.set(season, rosterResiduals(league, season)).get(season)!;
      const odds = league.teams
        .filter((t) => t.tid !== league.userTid)
        .flatMap((t) => {
          const r = activeCoach(league, t.tid);
          return r && !r.user ? [{ tid: t.tid, coach: r.name, odds: firingOdds(league, r, fit) }] : [];
        })
        .sort((a, b) => b.odds - a.odds || a.tid - b.tid)
        .slice(0, 2);
      for (const o of odds)
        offers.push({
          tid: o.tid,
          kind: 'change',
          note: `The ${league.teams[o.tid].name} (${record(league, o.tid)}) would make a change for you: ${o.coach} would take over your old team.`,
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
      ? `${names[0].toUpperCase()}${names.slice(1)} want you as head coach. ${offers.map((o) => o.note).join(' ')} Take one, or any job you like, from the job market.`
      : `${offers.map((o) => o.note).join(' ')} Stay put, or take the job: the offer stands until the draft.`,
    tone: 'good',
    link: '/settings?sheet=switch',
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
  const old = league.teams[league.userTid];
  const displaced = activeCoach(league, tid);
  takeOverTeam(league, tid);
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
