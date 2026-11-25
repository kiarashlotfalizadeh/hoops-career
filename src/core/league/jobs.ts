// The job market: after the playoffs, once the coaching carousel has made its moves, the teams that
// changed coaches look at the user too. A fired user hears from every opening whose owner would
// rather have him than the coach it just hired (candidateScore: his record, titles, Coaches of the
// Year and playoff runs, less for one fired this summer); when none would, the league's two worst
// records take a chance on him (the league waits for a fired coach, so he always has a call). A
// user still in his job can be approached after a good run, when an opening rates him clearly above
// its hire, and can ask for an opening that rates him at least level with it (askForJob). Every
// opening of the summer stays on file with how its owner rated him and its hire (League.jobMarket),
// and his reputation (the market's read of him, any team asking) is a number the Jobs tab shows.
// Those offers are the only way to another job (god mode can put him anywhere). Taking a
// job is a takeover (the coach the team hired, or the one it lets go, takes the user's old job), his
// reputation comes with him (part of his standing with the last owner), and the offers go with the
// draft. Nothing here draws from a random stream.

import type { League } from '../types';
import { activeCoach, candidateScore, coachCareer, coyWinners, marketScore, openStint, profileOf, userCoach, userJob, type CarouselMoves } from './coaches';
import { addInbox, addNews, andList, curTeamSeason, teamCity, winPct } from './helpers';
import { clamp } from '../random';
import { seasonsInCharge, takeOverTeam } from './owner';

export type JobOfferKind = 'opening' | 'approach' | 'change';

/** A team that wants the user: an opening (after a firing), an approach (while he has a job), or a change it would make for him. */
export interface JobOffer {
  tid: number;
  kind: JobOfferKind;
  note: string;
}

/** A team that changed coaches this summer, and how its owner rated the user against its hire (League.jobMarket). */
export interface JobOpening {
  tid: number;
  /** The coach it hired (the registry's id), and the one it let go. */
  hired: number;
  fired?: number;
  /** Its owner's read of the user and of its hire when it chose (candidateScore, shown as repScore). */
  you: number;
  hire: number;
  /** Where that left the user: an offer made, 'listen' (it rates him level with its hire: he can ask, see askForJob), or passed. */
  status: 'offer' | 'listen' | 'passed';
}

/** How far below its hire an opening can rate a user with a job and still hear him out when he asks. */
export const ASK_MARGIN = 0;

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

const round2 = (x: number) => Math.round(x * 100) / 100;

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
  delete league.jobMarket;
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
  // every opening on file, with both reads: the Jobs tab names them whether or not they called
  const market: JobOpening[] = openings.map((o) => {
    const hire = hiredScore(o.tid, o.coach);
    const let_ = moves.fired.find((x) => x.tid === o.tid)?.coach;
    return { tid: o.tid, hired: o.coach, ...(let_ !== undefined ? { fired: let_ } : {}), you: round2(o.edge + hire), hire: round2(hire), status: 'passed' as const };
  });
  const mark = (tid: number, status: JobOpening['status']) => {
    const m = market.find((x) => x.tid === tid);
    if (m) m.status = status;
  };
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
        note: `${teamCity(league, o.tid)}, ${record(league, o.tid)}, has an opening${firedText(o.tid)} and wants you to take over.`,
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
            ? `${teamCity(league, t)}, ${record(league, t.tid)}, has an opening${firedText(t.tid)}. Nobody better is calling, so they'll take a chance on you.`
            : `${teamCity(league, t)}, ${record(league, t.tid)}, would make a change for you. ${activeCoach(league, t.tid)?.name ?? 'Their coach'} would take over your old team.`,
        });
    }
  } else if (seasonsInCharge(league) >= APPROACH_SEASONS) {
    for (const o of openings.filter((x) => x.edge >= APPROACH_MARGIN).slice(0, MAX_APPROACHES))
      offers.push({
        tid: o.tid,
        kind: 'approach',
        note: `${teamCity(league, o.tid)} (${record(league, o.tid)}) would like to talk to you about the opening${firedText(o.tid)}.`,
      });
  }
  for (const o of offers) mark(o.tid, 'offer');
  // a coach with a job can ask an opening that rates him level with its hire (after a season in charge: he has a record with this team)
  if (!league.fired && seasonsInCharge(league) >= 1) for (const m of market) if (m.status === 'passed' && m.you - m.hire >= -ASK_MARGIN) m.status = 'listen';
  if (market.length) league.jobMarket = { season: league.season, openings: market };
  else delete league.jobMarket;
  if (!offers.length) {
    // nobody called, but an opening or two would hear him out: his agent says so (a note, never a stop)
    const asks = market.filter((m) => m.status === 'listen');
    if (asks.length)
      addInbox(league, {
        from: 'Your agent',
        subject: asks.length > 1 ? `${asks.length} openings would hear you out` : 'An opening would hear you out',
        body: `${andList(asks.map((m) => teamCity(league, m.tid)))} changed coaches and ${asks.length > 1 ? 'rate' : 'rates'} you level with ${asks.length > 1 ? 'their hires' : 'its hire'}. Nobody called, but ask and the job is yours to take or turn down. Career → Jobs, until the draft.`,
        tone: 'neutral',
        link: '/office/career?tab=jobs',
      });
    return;
  }
  league.jobOffers = { season: league.season, offers };
  const names = andList(offers.map((o) => teamCity(league, o.tid)));
  addInbox(league, {
    important: true,
    from: 'Your agent',
    subject: league.fired ? (offers.length > 1 ? `${offers.length} job offers` : 'A job offer') : 'Other teams are calling',
    body: league.fired
      ? `${names} ${offers.length > 1 ? 'want' : 'wants'} you as ${userJob(league).title}. ${offers.map((o) => o.note).join(' ')} Take one: the league waits until you do.`
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
  if (!offer && !league.settings.godMode && !(league.fired && !league.jobOffers?.offers.length)) return `${teamCity(league, tid)} hasn't offered you the job.`;
  const old = league.teams[league.userTid];
  const displaced = activeCoach(league, tid);
  // his reputation comes with him: part of where he stood with his last owner (a firing's poor standing too)
  const was = league.ownerMood.total;
  takeOverTeam(league, tid);
  league.ownerMood.total = Math.round(clamp(was * REPUTATION_CARRY, -REPUTATION_MAX, REPUTATION_MAX) * 100) / 100;
  delete league.jobOffers;
  delete league.jobMarket;
  if (offer) {
    const t = league.teams[tid];
    const me = userCoach(league);
    const k = me ? coachCareer(league, me) : null;
    const resume =
      k && k.seasons ? `, ${k.won}-${k.lost} in ${k.seasons} season${k.seasons === 1 ? '' : 's'}${k.titles ? ` with ${k.titles} title${k.titles > 1 ? 's' : ''}` : ''}` : '';
    addNews(league, {
      kind: 'coach',
      text: `${teamCity(league, t)} hired ${league.coachName}${resume}${displaced && !displaced.user && openStint(displaced)?.tid === old.tid ? `. ${displaced.name} takes over ${teamCity(league, old)}` : ''}.`,
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

// ---------------------------------------------------------------- the market, as the Jobs tab shows it

/** A market read (candidateScore, marketScore) on the Jobs tab's 1-99 scale: a first-time coach about 40, a .575 record with playoff runs about 65, a champion 80 or more. */
export const repScore = (s: number) => Math.round(clamp(45 + 14 * s, 1, 99));

/** The openings can still be asked about: this summer's, until the draft. */
export const marketOpen = (league: League) => league.jobMarket?.season === league.season && league.phase === 'draftLottery' && !league.fired;

/**
 * Ask an opening that rates the user level with its hire for the job (a coach with a job: a fired
 * one's offers come to him). It makes the offer, to take or turn down like any other until the
 * draft. Returns why not, or null.
 */
export function askForJob(league: League, tid: number): string | null {
  const m = league.jobMarket?.openings.find((x) => x.tid === tid);
  if (!m || !marketOpen(league)) return 'That job is no longer open.';
  if (m.status === 'offer') return null;
  if (m.status !== 'listen') return `${teamCity(league, tid)} rates its hire ahead of you.`;
  m.status = 'offer';
  const hired = league.coaches?.find((x) => x.id === m.hired);
  const offers = league.jobOffers?.season === league.season ? league.jobOffers.offers : [];
  offers.push({
    tid,
    kind: 'opening',
    note: `${teamCity(league, tid)}, ${record(league, tid)}, will give you the job you asked about${hired ? ` over ${hired.name}` : ''}. He would take over your old team.`,
  });
  league.jobOffers = { season: league.season, offers };
  return null;
}

/** The user's reputation: the market's read of him on the 1-99 scale, where that ranks among the league's head coaches, and what feeds it. */
export interface Reputation {
  score: number;
  rank: number;
  of: number;
  /** What the market counts, each with what it adds on the same scale ("+8"). */
  parts: { k: string; v: string; pts: number }[];
}

export function reputation(league: League): Reputation | null {
  const me = userCoach(league);
  if (!me) return null;
  const coy = coyWinners(league);
  const read = (r: NonNullable<League['coaches']>[number]) => marketScore(league, { profile: profileOf(r), rec: r, career: coachCareer(league, r, coy) });
  const mine = read(me);
  const others = (league.coaches ?? []).filter((r) => !r.user && openStint(r)).map(read);
  const k = coachCareer(league, me, coy);
  const recent = k.lines.filter((l) => l.season > league.season - 6);
  const titles = Math.min(2, recent.filter((l) => l.round === 5).length);
  const awards = Math.min(2, k.coy.filter((y) => y > league.season - 6).length);
  const runs = Math.min(4, recent.filter((l) => (l.round ?? -1) >= 1).length);
  const rec = ((k.won + 0.45 * 82) / (k.won + k.lost + 82) - 0.5) * 10 + 0.25;
  const staff = (((me.dev + me.tac) / 2 - 60) / 12.5) * 0.25;
  const pts = (x: number) => Math.round(14 * x);
  return {
    score: repScore(mine),
    rank: 1 + others.filter((x) => x > mine).length,
    of: others.length + 1,
    parts: [
      { k: 'Career record', v: k.won + k.lost ? `${k.won}-${k.lost}` : 'No games yet', pts: pts(rec) },
      { k: 'Playoff teams, last six seasons', v: String(runs), pts: pts(0.1 * runs) },
      { k: 'Titles, last six seasons', v: String(titles), pts: pts(0.7 * titles) },
      { k: 'Coach of the Year, last six seasons', v: String(awards), pts: pts(0.4 * awards) },
      { k: 'Development and tactics ratings', v: `${Math.round(me.dev)} / ${Math.round(me.tac)}`, pts: pts(staff) },
    ],
  };
}
