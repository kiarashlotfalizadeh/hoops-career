// Scouting the draft class. A prospect's ratings are the truth; nobody sees them. The league sees
// a consensus read (truth plus an error that shrinks through the season and again at the combine),
// each front office reads him its own way (the consensus's error, less what its scouts correct, plus
// its own), and the user's staff do the same: the coaching budget sets how sharp they are, and the
// prospects he sends scouts to (SCOUT_SLOTS at a time; the staff fill the free places near his pick)
// come into focus with every day they're watched. Every read is a fixed draw per observer and
// prospect, so it narrows toward the truth rather than jumping about.
//
// The class lives through the season: a hot or a cold month, now and then an injury (each a real
// change to his ratings) on STOCK_DAYS, then the combine in May. The consensus board is re-ranked
// after each, and the big movers make the news. AI teams draft by their own reads (draft.ts), the
// mock by the consensus, the user's staff by theirs; the picks' trade values by what the teams'
// boards, averaged, let the league expect each prospect to be (leagueBoard, revealOutlook).
//
// Nothing here draws on the league's random stream: every draw is seeded by the league, the season
// and what it's for.

import type { CombineResults, League, Player, ScoutingState } from '../types';
import { DRAFT_PROSPECT } from '../types';
import { Rng, clamp, hashString, mix32 } from '../random';
import { composites, shiftToOvr } from '../ratings';
import { refreshPlayerDerived } from '../playerGen';
import { addInbox, addNews, andList, curTeamSeason, dateToDay, fmtDate, playerName, prospects, winPct } from './helpers';
import { ordinal } from '../format';

/** Prospects the user can have scouts on at once. */
export const SCOUT_SLOTS = 5;
/** Season days of the class's monthly moves: late November, December, January, February and March. */
export const STOCK_DAYS = [40, 70, 100, 130, 160];
/** The most a prospect's months move his OVR in a season, either way. */
const MOVE_MAX = 5;
/** The combine: mid-May. */
export const combineDay = (season: number) => dateToDay(season, 4, 15);

/**
 * The consensus's error on a prospect's draft score (POT 0.65, OVR 0.35), one standard deviation:
 * SIGMA_OPEN when the class arrives, SIGMA_SEASON by the end of the regular season, SIGMA_COMBINE
 * from the combine on.
 */
const SIGMA_OPEN = 4.6;
const SIGMA_SEASON = 3.9;
const SIGMA_COMBINE = 3.3;
/** How an error on the draft score splits: POT is harder to read than what he can do now. */
const OVR_SHARE = 0.7;
const POT_SHARE = 1.15;
/**
 * A range on screen holds the truth four times in five: ±1.28 standard deviations, less the half
 * point the rounding already gives (a read and the truth are both whole numbers, so a range of ±h
 * holds every error up to h + 0.5). Without that the staff's ranges held his OVR 89% of the time and
 * his POT 86% on draft night (dev-check, 1,358 reads): wider than they said.
 */
const RANGE_Z = 1.28;
const halfWidth = (sd: number) => Math.max(1, Math.round(RANGE_Z * sd - 0.5));

/** A standard normal of its own for `key`, the same every time. */
const fixedNormal = (key: string) => new Rng(mix32(hashString(key))).normal(0, 1);

/** The combine is in: from its day in May (or the lottery, if the playoffs ended first). */
export function combineIn(league: League): boolean {
  if (league.phase === 'draftLottery' || league.phase === 'draft') return true;
  const st = league.scouting;
  if (st && st.season === league.season) return !!st.combine;
  // (a league from before scouting, mid-season: by the calendar)
  return (league.phase === 'playoffs' || league.phase === 'playin') && league.day >= combineDay(league.season);
}

/** The consensus's error today, one standard deviation on the draft score. */
export function consensusSigma(league: League): number {
  if (combineIn(league)) return SIGMA_COMBINE;
  if (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs')
    return SIGMA_OPEN - (SIGMA_OPEN - SIGMA_SEASON) * Math.min(1, Math.max(0, league.day) / 175);
  return SIGMA_OPEN;
}

/** How a front office reads a prospect: the share of the consensus's error its scouts correct (q), and its own error (s, one standard deviation). */
interface Precision {
  q: number;
  s: number;
}

/** An AI front office's scouting, from poor (0) to sharp (1): the same for a franchise all league long. */
export const scoutSharpness = (league: Pick<League, 'id'>, tid: number) => new Rng(mix32(hashString(`${league.id}:scouts:${tid}`))).next();

/** Days of scouting it takes the user's staff, at an average budget, to bring a prospect about two-thirds into focus. */
const FOCUS_DAYS = 30;

/** An AI front office's scouting from poor to sharp: the share of the room's error it corrects, and its own error. */
const AI_Q = [0.1, 0.4];
const AI_S = [2.2, 1.4];

function precision(league: League, tid: number, pid: number): Precision {
  if (tid !== league.userTid) {
    const sharp = scoutSharpness(league, tid);
    return { q: AI_Q[0] + (AI_Q[1] - AI_Q[0]) * sharp, s: AI_S[0] + (AI_S[1] - AI_S[0]) * sharp };
  }
  return staffPrecision(league, scoutingState(league).looks[pid] ?? 0);
}

/** The user's staff on a prospect watched `days` days: the coaching budget pays the scouts (a poor one reads worse than the room), and days watching him bring him into focus. */
function staffPrecision(league: League, days: number): Precision {
  const b = clamp((league.teams[league.userTid]?.budget.coaching ?? 50) / 100, 0, 1);
  const f = 1 - Math.exp((-days * (0.5 + b)) / FOCUS_DAYS);
  const q0 = 0.3 * b;
  return { q: q0 + (0.85 - q0) * f, s: (2.2 - 1.0 * b) * (1 - 0.55 * f) };
}

/**
 * How far a typical AI team's read of a prospect strays from the consensus's, one standard
 * deviation (its correction of the room's error and its own error, at an average front office, for
 * a prospect this hard to read, see mystery): what the mock can't know.
 */
export const teamSpread = (league: League, m = 1) => m * Math.hypot(((AI_Q[0] + AI_Q[1]) / 2) * consensusSigma(league), (AI_S[0] + AI_S[1]) / 2);

/** A read of a prospect: OVR and POT (unrounded), the draft score they make, and its error (one standard deviation). */
export interface Read {
  ovr: number;
  pot: number;
  score: number;
  sd: number;
}

const truth = (p: Player): Read => ({ ovr: p.ovr, pot: p.pot, score: p.pot * 0.65 + p.ovr * 0.35, sd: 0 });

function readWith(p: Player, err: number, sd: number): Read {
  const ovr = p.ovr + OVR_SHARE * err;
  const pot = Math.max(ovr, p.pot + POT_SHARE * err);
  return { ovr, pot, score: pot * 0.65 + ovr * 0.35, sd };
}

const consensusZ = (league: League, pid: number) => fixedNormal(`${league.id}:cons:${pid}`);

/**
 * How hard a prospect is to read, around 1: some are known quantities, some are seen by few (and a
 * player from overseas, with no college season on film, by fewer). It scales every read's error of
 * him: the mysteries go too high or fall too far, and they're where scouting pays.
 */
export function mystery(league: League, p: Player): number {
  const u = new Rng(mix32(hashString(`${league.id}:mystery:${p.pid}`))).next();
  return (p.college ? 0.85 : 1.3) * (0.7 + 0.6 * u);
}

/** The league's read of a prospect: what the big board and the mock go by (picks are priced by the teams' boards: see leagueBoard). Anyone else: his ratings. */
export function consensusRead(league: League, p: Player): Read {
  if (p.tid !== DRAFT_PROSPECT) return truth(p);
  const sc = consensusSigma(league) * mystery(league, p);
  return readWith(p, sc * consensusZ(league, p.pid), sc);
}

/** A team's read of a prospect (the user's team: his staff's), what it drafts by. Anyone else: his ratings. */
export function teamRead(league: League, tid: number, p: Player): Read {
  if (p.tid !== DRAFT_PROSPECT) return truth(p);
  const m = mystery(league, p);
  const sc = consensusSigma(league) * m;
  const { q, s } = precision(league, tid, p.pid);
  const err = (1 - q) * sc * consensusZ(league, p.pid) + m * s * fixedNormal(`${league.id}:read:${tid}:${p.pid}`);
  return readWith(p, err, Math.hypot((1 - q) * sc, m * s));
}

/** The user's staff's read. */
export const staffRead = (league: League, p: Player) => teamRead(league, league.userTid, p);

/** A read as the screens write it: the middle and the range that holds the truth four times in five. A player who isn't a prospect reads exactly. */
export interface ReadRange {
  ovr: number;
  pot: number;
  ovrLo: number;
  ovrHi: number;
  potLo: number;
  potHi: number;
  exact: boolean;
}

export function readRange(r: Read): ReadRange {
  const ovr = clamp(Math.round(r.ovr), 40, 99);
  const pot = clamp(Math.max(ovr, Math.round(r.pot)), 40, 99);
  if (r.sd <= 0) return { ovr, pot, ovrLo: ovr, ovrHi: ovr, potLo: pot, potHi: pot, exact: true };
  const ho = halfWidth(OVR_SHARE * r.sd);
  const hp = halfWidth(POT_SHARE * r.sd);
  return { ovr, pot, ovrLo: clamp(ovr - ho, 40, 99), ovrHi: clamp(ovr + ho, 40, 99), potLo: clamp(pot - hp, 40, 99), potHi: clamp(pot + hp, 40, 99), exact: false };
}

/** The staff's read of anyone the user sees (only a prospect isn't exact). */
export const seenRange = (league: League, p: Player) => readRange(staffRead(league, p));

/**
 * A prospect as the user's staff see him, for the screens that show any player (his page, a
 * comparison): OVR and POT their read, his ratings shifted to that OVR (his strengths are his
 * own; how good he is, is their read). Anyone else comes back as he is.
 */
export function seenPlayer(league: League, p: Player): Player;
export function seenPlayer(league: League, p: Player | undefined): Player | undefined;
export function seenPlayer(league: League, p: Player | undefined): Player | undefined {
  if (!p || p.tid !== DRAFT_PROSPECT) return p;
  const r = seenRange(league, p);
  return { ...p, ovr: r.ovr, pot: r.pot, ratings: r.ovr === p.ovr ? p.ratings : shiftToOvr(p.ratings, r.ovr, league.ovrScale) };
}

/** A prospect at the consensus's read (OVR and POT), for what the league goes by before his ratings show: a second-rounder's deal, the undrafted who get a free-agent chance. Anyone else as he is. */
export function consensusView(league: League, p: Player): Player {
  if (p.tid !== DRAFT_PROSPECT) return p;
  const r = consensusRead(league, p);
  return { ...p, ovr: Math.round(r.ovr), pot: Math.round(Math.max(r.ovr, r.pot)) };
}

/** A class's draft scores as the league can expect them before any read: their middle and their spread (variance) once the reads' error is taken out. */
export interface ClassPrior {
  mu: number;
  tau2: number;
}

/** How much a read's error moves the draft score (POT 0.65, OVR 0.35: see readWith). */
const SCORE_SHARE = 0.65 * POT_SHARE + 0.35 * OVR_SHARE;

/** The league's board for a prospect: the AI front offices' reads of him averaged (`sd`: the error left in that), and how far they stray from one another (`spread`, on the draft score). */
export interface BoardRead extends Read {
  spread: number;
}

/**
 * The league's board for draft `year`'s class: every AI front office's read of each prospect,
 * averaged. Each corrects part of the room's error (the same part, as they see the same player)
 * and adds its own (which partly cancels across 29 of them), so the boards know a little more than
 * the room: a prospect the room has too high, the teams' boards have lower, and he goes later. A
 * prospect taken already is read as he was on draft night (no ratings move until the summer), so
 * the class doesn't sink as its best go. Its prior (see revealOutlook): the reads' spread less
 * their error.
 */
export function leagueBoard(league: League, year: number): { reads: Map<number, BoardRead>; prior: ClassPrior } {
  const sigma = consensusSigma(league);
  const teams = league.teams.filter((t) => t.tid !== league.userTid).map((t) => ({ tid: t.tid, ...precision(league, t.tid, -1) }));
  const n = Math.max(1, teams.length);
  const qBar = teams.reduce((a, t) => a + t.q, 0) / n;
  const s2Bar = teams.reduce((a, t) => a + t.s * t.s, 0) / n;
  const reads = new Map<number, BoardRead>();
  for (const p of Object.values(league.players)) {
    if (p.draft.year !== year || (p.tid !== DRAFT_PROSPECT && p.draft.round === 0)) continue;
    const m = mystery(league, p);
    const sc = sigma * m;
    const room = sc * consensusZ(league, p.pid);
    let ovr = 0;
    let pot = 0;
    const scores = teams.map((t) => {
      const r = readWith(p, (1 - t.q) * room + m * t.s * fixedNormal(`${league.id}:read:${t.tid}:${p.pid}`), 0);
      ovr += r.ovr / n;
      pot += r.pot / n;
      return r.score;
    });
    const score = scores.reduce((a, x) => a + x, 0) / n;
    const spread = Math.sqrt(scores.reduce((a, x) => a + (x - score) ** 2, 0) / n);
    reads.set(p.pid, { ovr, pot, score, sd: Math.hypot((1 - qBar) * sc, m * Math.sqrt(s2Bar / n)), spread });
  }
  const all = [...reads.values()];
  const k = Math.max(1, all.length);
  const mu = all.reduce((a, r) => a + r.score, 0) / k;
  const spread = all.reduce((a, r) => a + (r.score - mu) ** 2, 0) / k;
  return { reads, prior: { mu, tau2: Math.max(4, spread - all.reduce((a, r) => a + (SCORE_SHARE * r.sd) ** 2, 0) / k) } };
}

/** Gauss-Hermite points for an expectation over a standard normal: [z, weight]. */
const NODES: [number, number][] = [
  [-2.856970014, 0.011257411],
  [-1.35562618, 0.222075922],
  [0, 0.533333333],
  [1.35562618, 0.222075922],
  [2.856970014, 0.011257411],
];

/**
 * What the league can expect a prospect to turn out, from its read of him (`r`, see leagueBoard):
 * draft night shows his ratings, so a team pricing a pick before it goes by the truth the read
 * implies. A read is the truth plus an error, so the one that stands out from its class most likely
 * ran high, the more so the harder he is to read (see mystery): it shrinks toward the class
 * (`prior`), with the doubt left over. Returns him at a few points of that, with their weights (they
 * sum to 1). Priced at the room's read instead, the top of every class went at its reads (an 88
 * shown on a 75): the first picks on the clock at twice the player each became.
 */
export function revealOutlook(p: Player, r: Read, prior: ClassPrior): [Player, number][] {
  const k = SCORE_SHARE * r.sd * r.sd;
  const d = prior.tau2 + SCORE_SHARE * k;
  // the read's error given the read: its middle, and how far either way it may still be
  const mid = (k * (r.score - prior.mu)) / d;
  const sd = r.sd * Math.sqrt(prior.tau2 / d);
  return NODES.map(([z, w]) => {
    const err = mid + sd * z;
    const ovr = r.ovr - OVR_SHARE * err;
    return [{ ...p, ovr, pot: Math.max(ovr, r.pot - POT_SHARE * err) }, w];
  });
}

// ---------------------------------------------------------------- the user's scouts

const passedMoves = (league: League) =>
  league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs'
    ? STOCK_DAYS.filter((d) => league.day >= d).length
    : league.phase === 'preseason'
      ? 0
      : STOCK_DAYS.length;

/** The user's scouting of this season's class (a fresh one, not yet stored, for a new class or a league from before scouting). */
export function scoutingState(league: League): ScoutingState {
  const s = league.scouting;
  if (s && s.season === league.season) return s;
  return { season: league.season, list: [], looks: {}, moves: passedMoves(league) };
}

function ensureState(league: League): ScoutingState {
  const s = scoutingState(league);
  league.scouting = s;
  return s;
}

/**
 * Where the user's first pick this season lands overall: its slot once the lottery set it, else
 * its place by record (the worst team first). Null without a pick this season.
 */
export function userPickSlot(league: League): number | null {
  const mine = league.draftPicks.filter((d) => d.season === league.season && d.tid === league.userTid);
  if (!mine.length) return null;
  const n = league.teams.length;
  const byRecord = league.teams
    .map((t) => ({ tid: t.tid, wp: winPct(curTeamSeason(league, t.tid)) }))
    .sort((a, b) => a.wp - b.wp || a.tid - b.tid)
    .map((x) => x.tid);
  return Math.min(...mine.map((d) => (d.round - 1) * n + (d.pick ?? byRecord.indexOf(d.originalTid) + 1)));
}

/** Who the user's scouts are on: the ones he sent, then (in the free places) the staff's picks, the prospects ranked nearest his first pick. */
export function scoutList(league: League): { pid: number; auto: boolean }[] {
  const st = scoutingState(league);
  const cls = prospects(league, league.season);
  const live = new Set(cls.map((p) => p.pid));
  const sent = st.list.filter((pid) => live.has(pid)).slice(0, SCOUT_SLOTS);
  const out = sent.map((pid) => ({ pid, auto: false }));
  const slot = userPickSlot(league);
  if (out.length >= SCOUT_SLOTS || slot === null) return out;
  const taken = new Set(sent);
  const rank = (p: Player) => p.prospect?.rank ?? 99;
  const near = cls.filter((p) => !taken.has(p.pid)).sort((a, b) => Math.abs(rank(a) - slot) - Math.abs(rank(b) - slot) || rank(a) - rank(b));
  for (const p of near.slice(0, SCOUT_SLOTS - out.length)) out.push({ pid: p.pid, auto: true });
  return out;
}

/** Days the user's scouts have spent on a prospect. */
export const scoutDays = (league: League, pid: number) => Math.round(scoutingState(league).looks[pid] ?? 0);

/** Send a scout to a prospect, or call him back. Null when done, else why not. */
export function toggleScout(league: League, pid: number): string | null {
  const p = league.players[pid];
  if (!p || p.tid !== DRAFT_PROSPECT || p.draft.year !== league.season) return 'He is not in this draft class.';
  const st = ensureState(league);
  const live = new Set(prospects(league, league.season).map((x) => x.pid));
  st.list = st.list.filter((x) => live.has(x));
  if (st.list.includes(pid)) {
    st.list = st.list.filter((x) => x !== pid);
    return null;
  }
  if (st.list.length >= SCOUT_SLOTS) return `All ${SCOUT_SLOTS} scouts are out. Call one back first.`;
  st.list.push(pid);
  return null;
}

// ---------------------------------------------------------------- the class through the season

/** A prospect's combine, measured from what he can do now. */
export function combineFor(p: Player, rng: Rng): CombineResults {
  const r = p.ratings;
  const h = p.heightIn - 0.75 + rng.normal(0, 0.3);
  const wingspan = h + 3 + (r.hgt - 50) / 25 + rng.normal(0, 1.5);
  return {
    heightNoShoes: Math.round(h * 4) / 4,
    wingspan: Math.round(wingspan * 4) / 4,
    standingReach: Math.round((h * 1.33 + rng.normal(0, 1)) * 2) / 2,
    weight: p.weightLb,
    maxVert: Math.round((28 + r.ath * 0.13 + rng.normal(0, 1.5)) * 2) / 2,
    laneAgility: Math.round((12.4 - r.spd * 0.018 + rng.normal(0, 0.15)) * 100) / 100,
    sprint: Math.round((3.55 - r.spd * 0.0045 + rng.normal(0, 0.04)) * 100) / 100,
    shootingDrill: clamp(Math.round(6 + r.tp * 0.17 + rng.normal(0, 1.8)), 0, 25),
  };
}

/** A prospect's one-line scouting blurb: his type, his two best tools and what needs work. */
export function blurb(p: Player): string {
  const c = composites(p.ratings);
  const strengths: [string, number][] = [
    ['shot creation', (c.create + c.pnrHandle) / 2],
    ['shooting', (c.c3 + c.midShot) / 2],
    ['finishing', c.rim],
    ['playmaking', c.passing],
    ['perimeter defense', c.perDef],
    ['rim protection', c.rimProt],
    ['rebounding', (c.orb + c.drb) / 2],
    ['athleticism', (p.ratings.spd + p.ratings.ath) / 2],
  ];
  strengths.sort((a, b) => b[1] - a[1]);
  const weak = strengths[strengths.length - 1][0];
  return `${p.archetype}. Best tools: ${strengths[0][0]} and ${strengths[1][0]}. Needs work: ${weak}.`;
}

/** The consensus big board for a class: by the league's read, best first. Returns each prospect's rank before. */
export function rankByConsensus(league: League, year: number): Map<number, number> {
  const before = new Map<number, number>();
  const list = prospects(league, year)
    .map((p) => {
      before.set(p.pid, p.prospect?.rank ?? 99);
      return { p, s: consensusRead(league, p).score };
    })
    .sort((a, b) => b.s - a.s || a.p.pid - b.p.pid);
  list.forEach((x, i) => {
    x.p.prospect = { ...(x.p.prospect ?? { blurb: '' }), rank: i + 1 };
  });
  return before;
}

const where = (p: Player) => p.college || p.country;

/** The month a move day closes ("December"). */
const monthOf = (league: League, day: number) => fmtDate(league.season, day - 5, { month: 'long' });

/** The big movers on the board since `before`: the top 30 either side, at least five places, biggest first. */
function movers(league: League, before: Map<number, number>) {
  return prospects(league, league.season)
    .map((p) => ({ p, from: before.get(p.pid) ?? 99, to: p.prospect?.rank ?? 99 }))
    .filter((x) => Math.min(x.from, x.to) <= 30 && Math.abs(x.from - x.to) >= 5)
    .sort((a, b) => Math.abs(b.from - b.to) - Math.abs(a.from - a.to) || a.to - b.to);
}

const moveLine = (x: { p: Player; from: number; to: number }) => `${playerName(x.p)} ${x.to < x.from ? 'up' : 'down'} from ${ordinal(x.from)} to ${ordinal(x.to)}`;

/** One of the class's monthly moves: each prospect's month (most quiet), then the board re-ranked, and the big movers in the news. */
function stockMonth(league: League, i: number) {
  const cls = prospects(league, league.season).sort((a, b) => a.pid - b.pid);
  const rng = new Rng(mix32(hashString(`${league.id}:${league.season}:stock:${i}`)));
  for (const p of cls) {
    const u = rng.next();
    let kind: 'hot' | 'cold' | 'hurt';
    let d: number;
    if (u < 0.03) {
      kind = 'hurt';
      d = -rng.int(1, 3);
      // a bad injury takes some of his future too
      p.growth = clamp(p.growth - 0.15, -1, 1);
    } else if (u < 0.18) {
      kind = 'hot';
      d = Math.min(3, 1 + Math.floor(Math.abs(rng.normal(0, 1.2))));
    } else if (u < 0.3) {
      kind = 'cold';
      d = -Math.min(2, 1 + Math.floor(Math.abs(rng.normal(0, 0.8))));
    } else continue;
    // a season moves him five points at most either way
    const sofar = (p.prospect?.moves ?? []).reduce((a, m) => a + m.d, 0);
    d = clamp(sofar + d, -MOVE_MAX, MOVE_MAX) - sofar;
    if (!d) continue;
    p.ratings = shiftToOvr(p.ratings, p.ovr + d, league.ovrScale);
    refreshPlayerDerived(p, league.season, league.ovrScale);
    if (p.prospect) p.prospect.moves = [...(p.prospect.moves ?? []), { day: league.day, kind, d }];
  }
  const before = rankByConsensus(league, league.season);
  const month = monthOf(league, league.day);
  const why = (p: Player) => {
    const m = p.prospect?.moves?.at(-1);
    return m && m.day === league.day ? (m.kind === 'hurt' ? 'an injury' : `a ${m.kind} ${month}`) : 'a second look';
  };
  const big = movers(league, before);
  for (const x of big.slice(0, 2))
    addNews(league, {
      kind: 'draft',
      text: `Draft stock: ${playerName(x.p)} of ${where(x.p)} ${x.to < x.from ? 'climbs' : 'slides'} from ${ordinal(x.from)} to ${ordinal(x.to)} after ${why(x.p)}.`,
      tids: [],
      pids: [x.p.pid],
    });
  // the user hears of it sparingly: a move in the lottery's range or among his scouts' prospects
  const watched = new Set(scoutList(league).map((s) => s.pid));
  const mail = big.filter((x) => Math.min(x.from, x.to) <= 14 || watched.has(x.p.pid)).slice(0, 3);
  const hurt = cls.filter((p) => watched.has(p.pid) && p.prospect?.moves?.at(-1)?.day === league.day && p.prospect.moves.at(-1)!.kind === 'hurt' && !mail.some((x) => x.p === p));
  if (!mail.length && !hurt.length) return;
  addInbox(league, {
    from: 'Scouting Department',
    subject: `Draft stock: ${month}`,
    body: [...mail.map((x) => `${moveLine(x)} after ${why(x.p)}.`), ...hurt.map((p) => `${playerName(p)} is hurt. We're watching how he comes back.`)].join('\n'),
    tone: 'neutral',
    link: '/office/draft',
  });
}

/** The combine: every prospect measured from what he can do now, the consensus sharper for it, and the board re-ranked. */
export function holdCombine(league: League) {
  const st = ensureState(league);
  if (st.combine) return;
  st.combine = true;
  const cls = prospects(league, league.season).sort((a, b) => a.pid - b.pid);
  if (!cls.length) return;
  const rng = new Rng(mix32(hashString(`${league.id}:${league.season}:combine`)));
  for (const p of cls) p.prospect = { ...(p.prospect ?? { rank: 99, blurb: blurb(p) }), combine: combineFor(p, rng) };
  const big = movers(league, rankByConsensus(league, league.season));
  if (!big.length) return;
  addNews(league, {
    kind: 'draft',
    text: `The combine is in. ${andList(big.slice(0, 2).map((x) => `${playerName(x.p)} ${x.to < x.from ? 'rises' : 'falls'} to ${ordinal(x.to)}`))} on the big board.`,
    tids: [],
    pids: big.slice(0, 2).map((x) => x.p.pid),
  });
  addInbox(league, {
    from: 'Scouting Department',
    subject: 'The combine is in',
    body: `The board after the measurements and drills:\n${big
      .slice(0, 3)
      .map((x) => `${moveLine(x)}.`)
      .join('\n')}`,
    tone: 'neutral',
    link: '/office/draft',
  });
}

/** The day's scouting, after every season day: the user's scouts watch their prospects, and the class's months and the combine come on their days. */
export function prospectsDay(league: League) {
  if (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return;
  const cls = prospects(league, league.season);
  if (!cls.length) return;
  const st = ensureState(league);
  // opening day (or a league from before scouting): the board as the season opens is where each prospect's moves count from
  if (!st.opened) {
    st.opened = true;
    rankByConsensus(league, league.season);
    for (const p of cls) if (p.prospect) p.prospect.rank0 = p.prospect.rank;
  }
  for (const { pid } of scoutList(league)) st.looks[pid] = (st.looks[pid] ?? 0) + 1;
  while (st.moves < STOCK_DAYS.length && league.day >= STOCK_DAYS[st.moves]) stockMonth(league, st.moves++);
  if (!st.combine && league.day >= combineDay(league.season)) holdCombine(league);
}

/** A prospect's move on the board since the class arrived: places up (positive) or down; null before scouting or when he hasn't moved. */
export function stockMove(p: Player): number | null {
  const r0 = p.prospect?.rank0;
  const r = p.prospect?.rank;
  if (!r0 || !r || r0 === r) return null;
  return r0 - r;
}

// ---------------------------------------------------------------- how good the reads are

/** A read's margin: how far its OVR and its POT sit from the truth, as a range on screen is wide (plus or minus this many points holds the truth four times in five). */
export interface Margin {
  ovr: number;
  pot: number;
}

const marginOf = (sd: number): Margin => ({ ovr: halfWidth(OVR_SHARE * sd), pot: halfWidth(POT_SHARE * sd) });
const readSd = (league: League, x: Precision) => Math.hypot((1 - x.q) * consensusSigma(league), x.s);

/** Days of scouting the accuracy figures quote for a watched prospect. */
export const WATCHED_DAYS = FOCUS_DAYS;

/**
 * How sharp the user's scouts are, from the model the reads are drawn with (precision, consensusSigma):
 * their margin today on a prospect of ordinary mystery they haven't watched and on one watched
 * WATCHED_DAYS days, where the unwatched read ranks among the league's front offices (1 the
 * sharpest; an AI team reads every prospect alike), and the sharpest and the poorest of those.
 */
export function scoutingAccuracy(league: League): { rank: number; of: number; unwatched: Margin; watched: Margin; room: Margin; sharpest: Margin; poorest: Margin } {
  const user = league.userTid;
  const at = (days: number) => staffPrecision(league, days);
  const mine = readSd(league, at(0));
  const others = league.teams.filter((t) => t.tid !== user).map((t) => readSd(league, precision(league, t.tid, -1)));
  return {
    rank: 1 + others.filter((x) => x < mine).length,
    of: others.length + 1,
    unwatched: marginOf(mine),
    watched: marginOf(readSd(league, at(WATCHED_DAYS))),
    room: marginOf(consensusSigma(league)),
    sharpest: marginOf(Math.min(...others, Infinity)),
    poorest: marginOf(Math.max(...others, 0)),
  };
}

/** Where a pick was made, for how reads have held up: the top ten, the rest of the first round, the second. */
export type PickTier = 'top' | 'first' | 'second';
export const PICK_TIERS: { id: PickTier; label: string; from: number; to: number }[] = [
  { id: 'top', label: 'Picks 1-10', from: 1, to: 10 },
  { id: 'first', label: 'Picks 11-30', from: 11, to: 30 },
  { id: 'second', label: 'Second round', from: 31, to: 99 },
];
export const tierOfSlot = (slot: number) => PICK_TIERS.find((t) => slot >= t.from && slot <= t.to) ?? PICK_TIERS[2];

/**
 * How far a drafted player ends from the POT read on draft night, by where he was picked: the
 * median miss in OVR, over picks with OUTCOME_SEASONS seasons or more behind them (see readCheck).
 * A read's range holds his POT that night; where he goes from there is his summers and the arc no
 * scout sees (progression.ts's trajectory, wider the later he was picked), and this is their size.
 * Measured by dev-check (six leagues of six seasons, 2026-11-23, the room's reads: medians of 4 to 5
 * in every tier, four picks in five within 8 or 9, first-rounders as often over as under and
 * second-rounders 3 under on average, as few of them get the minutes to grow): it prints the same
 * medians and fails when these drift more than a point from them. They held on 2026-11-24, when the
 * last points were made the slowest (progression.ts's LATE_POINTS; nine leagues: 3 to 4, 4 to 5 and
 * 5, top-ten picks 0.2 to 0.5 under their read on average where they had been 1.6 over in a
 * league's own classes).
 */
export const OUTCOME_MISS: Record<PickTier, number> = { top: 4, first: 5, second: 5 };
/** Seasons since his draft from which a pick's read is judged. */
export const OUTCOME_SEASONS = 2;

/** A drafted player against a read of him from his draft night. */
export interface ReadCheck {
  pid: number;
  year: number;
  /** His pick overall, 1-60. */
  slot: number;
  /** The read judged: the user's staff's for his own picks, else the room's. */
  read: { ovr: number; pot: number };
  staff: boolean;
  /** Where he stands against it: the better of his best OVR since and the POT he shows today (a player still growing is judged on where he is headed). */
  now: number;
  /** `now` less the read's POT: positive, he beat the read. */
  miss: number;
  seasons: number;
}

/** How a drafted player has turned out against his draft night's read (the staff's, for the user's own picks, where `own`). Null for a draft before scouting or an undrafted player. */
export function readCheck(league: League, p: Player, own = true): ReadCheck | null {
  const r = p.draft.read;
  if (!r || p.draft.round === 0) return null;
  const staff = own && !!r.staff;
  const read = staff ? r.staff! : { ovr: r.ovr, pot: r.pot };
  const peak = Math.max(p.ovr, ...p.ratingsHistory.filter((h) => h.season > p.draft.year).map((h) => h.ovr));
  const now = Math.max(peak, p.retiredSeason === undefined ? p.pot : 0);
  return {
    pid: p.pid,
    year: p.draft.year,
    slot: (p.draft.round - 1) * league.teams.length + p.draft.pick,
    read,
    staff,
    now,
    miss: now - read.pot,
    seasons: league.season - p.draft.year,
  };
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : 0;
};

/**
 * The league's reads in hindsight: every pick with OUTCOME_SEASONS seasons or more behind him against
 * the room's read of his POT, by where he was picked (how many, the median miss either way, how many
 * ended three or more over and three or more under), and the user's own picks against his staff's
 * reads, newest first.
 */
export function draftRecord(league: League): { tiers: { tier: PickTier; label: string; n: number; miss: number; over: number; under: number }[]; own: ReadCheck[] } {
  const all: ReadCheck[] = [];
  const own: ReadCheck[] = [];
  for (const p of Object.values(league.players)) {
    const room = readCheck(league, p, false);
    if (!room || room.seasons < OUTCOME_SEASONS) continue;
    all.push(room);
    if (p.draft.read?.staff) own.push(readCheck(league, p)!);
  }
  const tiers = PICK_TIERS.map((t) => {
    const xs = all.filter((c) => c.slot >= t.from && c.slot <= t.to);
    return {
      tier: t.id,
      label: t.label,
      n: xs.length,
      miss: median(xs.map((c) => Math.abs(c.miss))),
      over: xs.filter((c) => c.miss >= 3).length,
      under: xs.filter((c) => c.miss <= -3).length,
    };
  });
  return { tiers, own: own.sort((a, b) => b.year - a.year || a.slot - b.slot) };
}
