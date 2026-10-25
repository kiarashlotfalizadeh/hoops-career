// "While you were away": what a sim of more than a day did for the user, read once when it ends.
// The store marks where the league stood when the sim started (`digestMark`) and, at the end, builds
// the digest from what the league holds since then (`buildDigest`): news and mail are told apart by
// their ids (one counter for both), results by their place in the season's list. Nothing here runs
// while the sim plays.
import type { League, Phase } from '../../core/types';
import { confStandings } from '../../core/league/standings';
import { curTeamSeason, fmtDate, shortName } from '../../core/league/helpers';
import { injuryName, ordinal, outFor } from '../../core/format';
import { gameStoryFor } from '../../core/analysis/gameStory';
import { headOf, isHisStory, isLeagueStory, byWeight, resultOf, scoreText, weightOf } from './front';

/** Where the league stood when a sim started. */
export interface DigestMark {
  leagueId: string;
  season: number;
  phase: Phase;
  day: number;
  /** The season's results so far (an index into `games`). */
  games: number;
  /** The next news or mail id: everything from it on is new. */
  msgId: number;
  /** The user's conference rank, once his season has games in it. */
  seed?: number;
  /** His place in the power rankings. */
  power?: number;
  /** His players out hurt, by pid, and for how many games. */
  hurt: Record<number, number>;
}

export function digestMark(l: League): DigestMark {
  const me = l.userTid;
  const ts = curTeamSeason(l, me);
  const seed = l.phase === 'regular' && ts.won + ts.lost > 0 ? confStandings(l, l.teams[me].conf).find((r) => r.tid === me)?.confRank : undefined;
  const hurt: Record<number, number> = {};
  for (const p of Object.values(l.players)) if (p.tid === me && p.injury) hurt[p.pid] = p.injury.gamesRemaining;
  return { leagueId: l.id, season: l.season, phase: l.phase, day: l.day, games: l.games.length, msgId: l.nextMsgId, seed, power: powerRank(l), hurt };
}

function powerRank(l: League): number | undefined {
  const p = l.media?.power;
  return p && p.season === l.season ? p.rows.find((r) => r.tid === l.userTid)?.rank : undefined;
}

export interface DigestResult {
  gid: number;
  won: boolean;
  /** "128-127 OT". */
  score: string;
  opp: number;
  home: boolean;
  /** The press's headline for it (the newest RESULTS_READ). */
  head?: string;
  /** How big a night the press made it (gameStoryFor): 3 the front page, 2 a story, 1 a brief. */
  weight?: number;
}

export interface DigestStory {
  id: number;
  head: string;
  /** The line under a headline, when it has one. */
  dek?: string;
  weight: number;
}

export interface Digest {
  leagueId: string;
  /** What the sim covered: "Dec 3 to Dec 9", "Free agency, a week". */
  span: string;
  /** The user's results, newest first, and the record over them. */
  results: DigestResult[];
  record?: { w: number; l: number };
  /** His conference rank before and after (the regular season). */
  seed?: { conf: 'E' | 'W'; before: number; after: number };
  /** His power ranking before (if there was one) and now, when a new one came out. */
  power?: { before?: number; after: number };
  /** Stories about his team: honors, milestones, breakouts, columns (his games are in `results`). */
  stories: DigestStory[];
  /** His players hurt in the stretch ("Brunson: Ankle sprain · out 6 games"), and those back. */
  injuries: string[];
  back: string[];
  /** New mail, by id (read from the inbox when shown, so a read mark shows). */
  mail: number[];
  /** The rest of the league's biggest stories. */
  around: DigestStory[];
  /** Why the sim stopped short, when it did: the digest says it first, instead of a toast (see the store's simulate). */
  stop?: { text: string; tone: 'good' | 'bad' | 'neutral'; to: string; call?: true };
}

/** The results a digest lists: all of a short stretch's; a longer one's newest RESULTS_NEW and its biggest nights. */
export const RESULTS_SHOWN = 5;
const RESULTS_NEW = 2;
/** The newest results the press's story is read for, to list the biggest nights of a long stretch (a sim to the season's end has 80). */
const RESULTS_READ = 40;

/**
 * The results a digest lists, newest first: a stretch of up to RESULTS_SHOWN + 2 all but its oldest;
 * a longer one its RESULTS_NEW newest and then its biggest nights by the press's weight (a buzzer-
 * beater, Christmas), newer first at equal size.
 */
export function shownResults(results: DigestResult[]): DigestResult[] {
  if (results.length <= RESULTS_SHOWN + 2) return results.slice(0, RESULTS_SHOWN);
  const rest = results
    .slice(RESULTS_NEW)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.weight ?? 1) - (a.r.weight ?? 1) || a.i - b.i)
    .slice(0, RESULTS_SHOWN - RESULTS_NEW)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.r);
  return [...results.slice(0, RESULTS_NEW), ...rest];
}

const story = (n: { id: number; head?: string; text: string; weight?: 1 | 2 | 3 }): DigestStory => ({
  id: n.id,
  head: n.head ?? n.text,
  dek: n.head ? n.text : undefined,
  weight: n.weight ?? 1,
});

/**
 * The digest of what happened since `mark`, or null if the stretch was too short to need one (fewer
 * than two of his games and three days, unless `long`: an offseason week, training camp) or nothing
 * happened worth one.
 */
export function buildDigest(mark: DigestMark, l: League, opts: { long?: boolean; span?: string } = {}): Digest | null {
  if (mark.leagueId !== l.id) return null;
  const me = l.userTid;
  const sameSeason = mark.season === l.season;
  // the season's results since the mark (a new season replaces the list: none of it is new)
  const results: DigestResult[] = [];
  let w = 0;
  let lo = 0;
  if (sameSeason)
    for (let i = l.games.length - 1; i >= mark.games; i--) {
      const g = l.games[i];
      if (g.home.tid !== me && g.away.tid !== me) continue;
      const r = resultOf(l, g);
      if (r.won) w++;
      else lo++;
      const st = results.length < RESULTS_READ ? gameStoryFor(l, r.gid) : null;
      results.push({ gid: r.gid, won: r.won, score: scoreText(r), opp: r.opp, home: r.home, head: st?.head, weight: st?.weight });
    }
  const days = sameSeason ? l.day - mark.day : Infinity;
  if (!opts.long && results.length < 2 && days < 3) return null;

  const mine = [];
  const others = [];
  for (let i = l.news.length - 1; i >= 0 && l.news[i].id >= mark.msgId; i--) {
    const n = l.news[i];
    // (his games are told in the results, and the power rankings in their figure)
    if (isHisStory(l, n) && n.kind !== 'game' && n.kind !== 'power') mine.push(n);
    else if (isLeagueStory(l, n)) others.push(n);
  }
  const stories = mine.sort(byWeight).slice(0, 6).map(story);
  const around = others
    .sort(byWeight)
    .filter((n) => weightOf(n) >= 2)
    .slice(0, 3)
    .map((n) => ({ ...story(n), head: headOf(n) }));

  // standings: the conference rank then and now, in the regular season
  let seed: Digest['seed'];
  if (sameSeason && mark.seed !== undefined && (l.phase === 'regular' || mark.phase === 'regular')) {
    const conf = l.teams[me].conf;
    const after = confStandings(l, conf).find((r) => r.tid === me)?.confRank;
    if (after !== undefined) seed = { conf, before: mark.seed, after };
  }
  // a new power ranking that moved him (the first of a season counts as a move)
  const nowRank = powerRank(l);
  const power = nowRank !== undefined && nowRank !== mark.power ? { before: sameSeason ? mark.power : undefined, after: nowRank } : undefined;

  const injuries: string[] = [];
  const back: string[] = [];
  for (const pl of Object.values(l.players)) {
    if (pl.tid !== me) continue;
    const was = mark.hurt[pl.pid];
    if (pl.injury && (was === undefined || pl.injury.gamesRemaining > was))
      injuries.push(`${shortName(l, pl)}: ${injuryName(pl.injury.type)} · ${outFor(pl.injury.gamesRemaining)}`);
    else if (!pl.injury && was !== undefined) back.push(shortName(l, pl));
  }
  const mail = l.inbox.filter((m) => m.id >= mark.msgId && !m.read).map((m) => m.id);

  const empty = !results.length && !stories.length && !around.length && !mail.length && !injuries.length && !seed && !power;
  if (empty) return null;
  const span =
    opts.span ??
    (sameSeason && Number.isFinite(days) && days > 0
      ? days === 1
        ? fmtDate(l.season, mark.day)
        : `${fmtDate(l.season, mark.day)} to ${fmtDate(l.season, l.day - 1)}`
      : `Since ${fmtDate(mark.season, mark.day)}`);
  return {
    leagueId: l.id,
    span,
    results,
    record: results.length ? { w, l: lo } : undefined,
    seed,
    power,
    stories,
    injuries,
    back,
    mail,
    around,
  };
}

/** The digest's one-line summary, for Today's link back to it: "3-1 · 4 stories · 2 new messages". */
export function digestLine(d: Digest): string {
  const parts: string[] = [];
  if (d.record) parts.push(`${d.record.w}-${d.record.l}`);
  if (d.seed && d.seed.before !== d.seed.after) parts.push(`${d.seed.after < d.seed.before ? 'up' : 'down'} to ${ordinal(d.seed.after)}`);
  if (d.stories.length) parts.push(`${d.stories.length} ${d.stories.length === 1 ? 'story' : 'stories'}`);
  if (d.mail.length) parts.push(`${d.mail.length} new message${d.mail.length === 1 ? '' : 's'}`);
  return parts.join(' · ') || d.span;
}
