// The staff's development watch: snapshots of every player's ratings behind the arrows the screens
// show, breakouts and slumps reported as they happen, and the monthly development report (see world.ts).
//
// What it keeps (League.devWatch) is small: each rostered player's OVR on opening night and where it
// stood at each of the season's check-ins (only where it moved), and his OVR and ratings as the last
// two seasons ended (one character a rating), which the arrows measure this season against. The
// season-start ratings themselves are already in each player's ratingsHistory. None of it draws from
// the league's random stream: the phrasing varies on a stream of the occasion's own (worldRng).
import type { League, Player, RatingKey } from '../types';
import { FREE_AGENT, RETIRED } from '../types';
import { RATING_KEYS, RATING_META, attrDisplay, expectedGrowth } from '../ratings';
import { playerAge } from '../playerGen';
import { seasonLabel } from '../constants';
import { ordinal, plural, rankOf } from '../format';
import { addInbox, addNews, andList, playerName, seasonTotals, sentence, shortName, teamPlayers } from './helpers';
import { FOCUS_META } from './progression';
import { awardRaces } from './awards';
import { worldRng } from './world';

/** A season's end as the staff wrote it down: each rostered player's OVR and his ratings on the 40-99 scale, one character each (see packRatings). */
export interface DevSnapshot {
  season: number;
  ovr: Record<number, number>;
  r: Record<number, string>;
}

export interface DevWatchState {
  /** The season the opening-night snapshot and the check-ins are for. */
  season: number;
  /** OVR on opening night, by pid: every player on a roster then. */
  start: Record<number, number>;
  /** The check-ins so far (days 45, 90, 135): each rostered player's OVR where it differed from opening night's, or he arrived since. */
  checks: { day: number; ovr: Record<number, number> }[];
  /** What the staff and the press have reported this season, so each is news once: "b:pid" a breakout, "s:pid" a slump, "p:pid" a scoring breakout. */
  told: string[];
  /** The ends of the last two seasons (oldest first): season S measures its arrows from the end of S−1. */
  ends?: DevSnapshot[];
  /** The season whose summer report has gone out (see devSummer). */
  summer?: number;
  /** The season whose end-of-season summary has gone out. */
  ended?: number;
}

/** The check-ins' days (the season loop's periodic): the staff reports on each. */
export const CHECK_DAYS = [45, 90, 135];
/** Through this age develop() treats a player as young: his summers swing widest, and minutes help him grow. */
export const YOUNG = 25;
/** Past this age a player doesn't change in season (inSeasonProgression). */
const GROWS_IN_SEASON = 26;
/** Share of a year's development each check-in applies (inSeasonProgression's frac). */
const CHECK_FRAC = 0.07;
/**
 * A breakout: this far past what his age would have him add. Over a summer a young player's OVR
 * moves about ±3.5-4.5 (progression.ts), so 5 above the expected is about one young player in eight;
 * in season the check-ins move him a point or two, so 2 above it is rarer still.
 */
const SUMMER_BREAKOUT = 5;
const SEASON_BREAKOUT = 2;
/** A scoring breakout: points a game up this much on last season, to at least SCORING_FLOOR, over SCORING_GAMES games or more. */
const SCORING_JUMP = 6;
const SCORING_FLOOR = 14;
const SCORING_GAMES = 15;

// ---------------------------------------------------------------- reading the snapshots

const packRatings = (p: Player) => RATING_KEYS.map((k) => String.fromCharCode(attrDisplay(p.ratings[k]))).join('');

/** A packed snapshot's ratings on the 40-99 scale. */
export function unpackRatings(s: string): Partial<Record<RatingKey, number>> {
  const out: Partial<Record<RatingKey, number>> = {};
  RATING_KEYS.forEach((k, i) => {
    if (i < s.length) out[k] = s.charCodeAt(i);
  });
  return out;
}

/** His ratingsHistory entry for a season (taken after that summer's development). */
export const histAt = (p: Player, season: number) => {
  for (let i = p.ratingsHistory.length - 1; i >= 0; i--) if (p.ratingsHistory[i].season === season) return p.ratingsHistory[i];
  return undefined;
};

/** The snapshot of a season's end, if the staff kept it. */
const endOf = (league: League, season: number) => league.devWatch?.ends?.find((s) => s.season === season);

/** What this season's arrows measure from: how he was when last season ended (the summer's work and the check-ins since show), or on opening night in a league's first season. */
export interface DevBase {
  ovr?: number;
  /** His ratings then on the 40-99 scale, where they were kept. */
  r?: Partial<Record<RatingKey, number>>;
  since: 'last' | 'opening';
}

export function devBase(league: League, p: Player): DevBase {
  const end = endOf(league, league.season - 1);
  if (end && end.ovr[p.pid] !== undefined) return { ovr: end.ovr[p.pid], r: end.r[p.pid] ? unpackRatings(end.r[p.pid]) : undefined, since: 'last' };
  // without the staff's snapshot (a league's first season, a save from before them, a player who
  // arrived since): last season's start stands in, else this season's
  const prev = histAt(p, league.season - 1);
  if (prev) return { ovr: prev.ovr, r: prev.r && mapDisplay(prev.r), since: 'last' };
  const now = histAt(p, league.season);
  const start = league.devWatch?.season === league.season ? league.devWatch.start[p.pid] : undefined;
  return { ovr: start ?? now?.ovr, r: now?.r && mapDisplay(now.r), since: 'opening' };
}

const mapDisplay = (r: Record<RatingKey, number>) => {
  const out: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) out[k] = attrDisplay(r[k]);
  return out;
};

/** The arrows' words: "since last season" or "since opening night". */
export const baseLabel = (b: DevBase) => (b.since === 'last' ? 'since last season' : 'since opening night');

/** His OVR change this season (see devBase): 0 with nothing to measure from. */
export function ovrChange(league: League, p: Player): number {
  const b = devBase(league, p);
  return b.ovr === undefined ? 0 : p.ovr - b.ovr;
}

/** Each rating's change this season on the 40-99 scale (see devBase), where it moved. */
export function ratingDeltas(league: League, p: Player): Partial<Record<RatingKey, number>> {
  const b = devBase(league, p);
  const out: Partial<Record<RatingKey, number>> = {};
  if (!b.r) return out;
  for (const k of RATING_KEYS) {
    const was = b.r[k];
    if (was === undefined) continue;
    const d = attrDisplay(p.ratings[k]) - was;
    if (d) out[k] = d;
  }
  return out;
}

/** His OVR on opening night this season, if he was on a roster then. */
export function openingOvr(league: League, p: Player): number | undefined {
  const dw = league.devWatch;
  if (dw?.season === league.season && dw.start[p.pid] !== undefined) return dw.start[p.pid];
  return histAt(p, league.season)?.ovr;
}

/** His OVR at the `i`th check-in this season: a check-in leaves out the players still at their opening-night OVR. */
function ovrAtCheck(league: League, p: Player, i: number): number | undefined {
  const dw = league.devWatch;
  if (!dw || dw.season !== league.season) return undefined;
  return dw.checks[i]?.ovr[p.pid] ?? dw.start[p.pid] ?? openingOvr(league, p);
}

/** His OVR change since opening night, and since the last check-in (or opening night before the first). */
export function seasonMoves(league: League, p: Player): { sinceOpening: number; sinceCheck: number } {
  const open = openingOvr(league, p);
  const n = league.devWatch?.season === league.season ? league.devWatch.checks.length : 0;
  const last = n ? ovrAtCheck(league, p, n - 1) : open;
  return { sinceOpening: open === undefined ? 0 : p.ovr - open, sinceCheck: last === undefined ? 0 : p.ovr - last };
}

/** This season's OVR path: opening night, then each check-in so far. */
export function seasonTrail(league: League, p: Player): { day: number; ovr: number }[] {
  const open = openingOvr(league, p);
  const dw = league.devWatch;
  if (open === undefined) return [];
  const out = [{ day: 0, ovr: open }];
  if (dw?.season === league.season) dw.checks.forEach((c, i) => out.push({ day: c.day, ovr: ovrAtCheck(league, p, i) ?? open }));
  return out;
}

/** OVR his age has him add in a year at `age` (the mean path behind potential). */
export const yearlyGrowth = (age: number) => Math.max(0, expectedGrowth(age) - expectedGrowth(age + 1));

/** How far he is past what his age would have him add this season, in OVR (positive: ahead of it). */
export function vsExpectation(league: League, p: Player): number {
  const age = playerAge(p, league.season);
  const b = devBase(league, p);
  if (b.ovr === undefined) return 0;
  const checks = league.devWatch?.season === league.season ? league.devWatch.checks.length : 0;
  const inSeason = age <= GROWS_IN_SEASON ? yearlyGrowth(age) * CHECK_FRAC * checks : 0;
  // from last season's end the summer counts in full (he was a year younger then)
  const expected = (b.since === 'last' ? yearlyGrowth(age - 1) : 0) + inSeason;
  return p.ovr - b.ovr - expected;
}

/** A young player well past what his age would have him add this season, or one the staff reported breaking out as a scorer. */
export function isBreakout(league: League, p: Player): boolean {
  if (playerAge(p, league.season) > YOUNG) return false;
  const told = league.devWatch?.season === league.season ? league.devWatch.told : [];
  if (told.includes(`b:${p.pid}`) || told.includes(`p:${p.pid}`)) return true;
  const b = devBase(league, p);
  return vsExpectation(league, p) >= (b.since === 'last' ? SUMMER_BREAKOUT : SEASON_BREAKOUT);
}

export type DevTag = 'Breakout' | 'Rising' | 'Prospect' | 'Declining';

/**
 * The tag a roster row carries, if any, kept to about one player in four: a breakout, a young
 * player on the rise (4 or more this season, or 2 since opening night), a veteran in decline (30 or
 * older, down 4 or more), or a prospect (22 or younger with 8 or more to go to his potential).
 */
export function devTag(league: League, p: Player): DevTag | null {
  const age = playerAge(p, league.season);
  const d = ovrChange(league, p);
  if (age <= YOUNG) {
    if (isBreakout(league, p)) return 'Breakout';
    if (d >= 4 || seasonMoves(league, p).sinceOpening >= 2) return 'Rising';
  }
  if (age >= 30 && d <= -4) return 'Declining';
  if (age <= 22 && p.pot - p.ovr >= 8) return 'Prospect';
  return null;
}

/** A rookie this season (drafted last summer, or in that class and undrafted). */
export const isRookie = (league: League, p: Player) => p.draft.year === league.season - 1 && p.tid >= 0;

export interface RookieLine {
  gp: number;
  mpg: number;
  pts: number;
  reb: number;
  ast: number;
  /** His place in the rookie of the year race (1 = leads it), within its top 10; for a finished season, 1 if he won it. */
  roy?: number;
}

/** A rookie's season so far, with his place in the rookie of the year race. `races`: awardRaces(league, 10)'s rookies, worked out once for a list. */
export function rookieLine(league: League, p: Player, races?: { pid: number }[]): RookieLine | null {
  if (!isRookie(league, p)) return null;
  const st = seasonTotals(p, league.season);
  const gp = st?.gp ?? 0;
  const per = (v: number) => (gp ? v / gp : 0);
  const won = league.awards.find((a) => a.season === league.season)?.roy;
  const i = races?.findIndex((x) => x.pid === p.pid) ?? -1;
  return {
    gp,
    mpg: per(st?.min ?? 0),
    pts: per(st?.pts ?? 0),
    reb: per((st?.orb ?? 0) + (st?.drb ?? 0)),
    ast: per(st?.ast ?? 0),
    roy: won !== undefined ? (won === p.pid ? 1 : undefined) : i >= 0 ? i + 1 : undefined,
  };
}

/** The rookie of the year race's top 10, as pids (empty before games are played or outside the regular season). */
export function royRace(league: League): { pid: number }[] {
  if (league.phase !== 'regular') return [];
  return awardRaces(league, 10).roy.map((x) => ({ pid: x.c.p.pid }));
}

/** A rookie's line in words: "9.8 points in 22 minutes a game, 4th in the rookie of the year race". */
export function rookieText(r: RookieLine): string {
  if (!r.gp) return 'yet to play';
  const race = r.roy === undefined ? '' : r.roy === 1 ? ', leading the rookie of the year race' : `, ${ordinal(r.roy)} in the rookie of the year race`;
  return `${r.pts.toFixed(1)} points, ${r.reb.toFixed(1)} rebounds and ${r.ast.toFixed(1)} assists in ${Math.round(r.mpg)} minutes a game over ${plural(r.gp, 'game')}${race}`;
}

// ---------------------------------------------------------------- his story

/** One line on where a player's career stands: what he has added since he arrived, his place on the age curve. */
export function growthStory(league: League, p: Player): string {
  const age = playerAge(p, league.season);
  const parts: string[] = [];
  if (p.tid >= 0 && p.joinedSeason < league.season) {
    const then = histAt(p, p.joinedSeason)?.ovr;
    const d = then === undefined ? 0 : p.ovr - then;
    if (Math.abs(d) >= 3) parts.push(`${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} since he arrived in ${seasonLabel(p.joinedSeason)}`);
  }
  const two = histAt(p, league.season - 2)?.ovr;
  const slide = two === undefined ? 0 : (histAt(p, league.season)?.ovr ?? p.ovr) - two;
  const phase =
    p.tid === RETIRED
      ? ''
      : age <= 21
        ? 'years from his peak: the big jumps come now'
        : age <= 24
          ? 'still climbing toward his peak'
          : age <= 26
            ? 'entering his peak'
            : age <= 29
              ? 'in his peak years'
              : age <= 33
                ? slide <= -5
                  ? 'past his peak, and the decline has started to bite'
                  : 'past his peak; the decline is gentle so far'
                : 'late in his career: each summer takes a little more';
  if (phase) parts.push(parts.length ? phase : phase[0].toUpperCase() + phase.slice(1));
  return parts.join(', ');
}

/** What his potential means, in a phrase: how far he has to go and what that would make him. */
export function potentialText(p: Player): string {
  const room = p.pot - p.ovr;
  if (room <= 0) return 'He has reached the ceiling scouts saw for him.';
  const at = p.pot >= 89 ? 'an All-NBA player' : p.pot >= 82 ? 'an All-Star' : p.pot >= 76 ? 'a quality starter' : p.pot >= 70 ? 'a rotation player' : 'a bench piece';
  if (room >= 8)
    return `Scouts see ${room} more in him: at ${p.pot} he would be ${at}. Growth that size comes with minutes, coaching and a good summer or two, and doesn't always come.`;
  return `${room} to go to the ceiling scouts see, ${at} at ${p.pot}.`;
}

// ---------------------------------------------------------------- the report

export type DevGroup = 'rising' | 'holding' | 'slipping';

export interface DevLine {
  pid: number;
  age: number;
  ovr: number;
  /** OVR change since the last check-in (opening night before the first). */
  recent: number;
  /** OVR change this season (see devBase). */
  season: number;
  group: DevGroup;
  /** Why, in the development coach's words. */
  reason: string;
  breakout: boolean;
}

export interface DevReport {
  /** Which check-in it is (1-3), 0 outside them. */
  check: number;
  /** The setup every young player shares: coaching, budget, practice. */
  setup: string;
  rising: DevLine[];
  holding: DevLine[];
  slipping: DevLine[];
  /** Players past 26, who don't change in season. */
  veterans: number[];
  watch?: { pid: number; why: string };
  /** The rookies, apart from the groups: their line, their race and how they're developing. */
  rookies: { pid: number; line: RookieLine; dev: DevLine }[];
}

/** A rating's name in running text, as ratingText writes it: "three-point", "offensive IQ". */
const RATING_LABEL = new Map(RATING_META.map((m) => [m.key as RatingKey, m.label.replace(/^[A-Z](?=[a-z])/, (ch) => ch.toLowerCase())]));
const minus = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/** The ratings that moved most this season, in words: "three-point +3, passing +2". */
function movers(d: Partial<Record<RatingKey, number>>, n = 2, sign = 0): string {
  return (Object.entries(d) as [RatingKey, number][])
    .filter(([k, v]) => k !== 'hgt' && (sign === 0 || Math.sign(v) === sign))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n)
    .map(([k, v]) => `${RATING_LABEL.get(k)} ${minus(v)}`)
    .join(', ');
}

const FOCUS_KEYS: Record<string, RatingKey[]> = {
  shooting: ['tp', 'mid', 'ft'],
  finishing: ['ins', 'drw', 'post'],
  playmaking: ['pas', 'hnd', 'oiq'],
  perimeterD: ['perD', 'stl', 'diq'],
  interiorD: ['intD', 'blk', 'diq'],
  rebounding: ['oreb', 'dreb', 'str'],
  conditioning: ['end', 'str', 'spd'],
};

/** The team's development setup in one line, ranked against the league (coaching skill and budget, practice: what develop() reads). */
export function setupLine(league: League, tid: number): string {
  const t = league.teams[tid];
  const n = league.teams.length;
  const rank = (f: (x: (typeof league.teams)[number]) => number) => 1 + league.teams.filter((x) => f(x) > f(t)).length;
  const budget = rank((x) => x.budget.coaching);
  const coach = rank((x) => x.coach.development);
  const practice =
    t.practice === 'intense'
      ? 'intense practices add to every young player’s month'
      : t.practice === 'light'
        ? 'light practices cost the young players a little every month'
        : 'practices at a normal load';
  return `Coaching budget ${rankOf(budget, n)}, development coaching ${rankOf(coach, n)}, ${practice}.`;
}

/** Why a player moved (or didn't) in what develop() reads: the month and the season, the ratings that moved, his minutes while he's young, his training focus. */
function reasonFor(league: League, p: Player, x: Pick<DevLine, 'group' | 'recent' | 'season' | 'age'>, d: Partial<Record<RatingKey, number>>, since: string): string {
  const rng = worldRng(league, 'devReason', league.season, league.day, p.pid);
  const { age, recent, season } = x;
  const st = seasonTotals(p, league.season);
  const mpg = st && st.gp ? Math.round(st.min / st.gp) : 0;
  const moved = movers(d, 2, x.group === 'slipping' ? -1 : x.group === 'rising' ? 1 : 0);
  const out: string[] = [];
  // the month first, then the season it belongs to
  if (recent > 0)
    out.push(
      `${rng.pick([`Up ${recent} this month`, `${minus(recent)} since the last check-in`])}${season > recent ? `, ${minus(season)} ${since}` : ''}${moved ? ` (${moved})` : ''}`,
    );
  else if (recent < 0) out.push(`Down ${-recent} this month${moved ? ` (${moved})` : ''}${age <= 22 ? `, which happens at ${age}: young players grow in fits` : ''}`);
  else if (season >= 3) out.push(`${rng.pick(['A quiet month after a big summer', 'Quiet month, big year'])}: ${minus(season)} ${since}${moved ? ` (${moved})` : ''}`);
  else if (season <= -3) out.push(`No change this month, ${minus(season)} ${since}${moved ? ` (${moved})` : ''}`);
  else out.push(`${rng.pick(['No change this month', 'Steady this month', 'Holding'])}${moved ? `; ${moved} ${since}` : ''}`);
  // minutes only move a young player (develop's minutes term is for 25 and under)
  if (age <= YOUNG) {
    if (st?.gp && mpg >= 25) out.push(rng.pick([`${mpg} minutes a night at ${age} is what grows a young player`, `The ${mpg} minutes a night are doing their work`]));
    else if (st?.gp && mpg >= 15) out.push(`${mpg} minutes a night help`);
    else if (!st?.gp) out.push('Without games he has nothing to grow on');
    else if (mpg <= 6) out.push(`${mpg} minutes a night costs him: young players who sit fall behind`);
  } else if (age > GROWS_IN_SEASON) out.push('Players his age hold until the summer');
  if (p.training !== 'balanced') {
    const keys = FOCUS_KEYS[p.training] ?? [];
    const gain = keys.reduce((a, k) => a + (d[k] ?? 0), 0);
    const label = FOCUS_META[p.training].label.toLowerCase();
    if (gain > 0) out.push(`The ${label} focus shows`);
    else if (x.group !== 'rising') out.push(`The ${label} focus hasn't shown yet`);
  }
  return out.map((t) => sentence(t)).join(' ');
}

/**
 * Where a player stands this month: rising when he moved up since the last check-in, or held
 * after a big year (3 or more); slipping the other way; holding else. In season OVR moves a point
 * at a time at most, so the year behind it counts too.
 */
function groupOf(recent: number, season: number): DevGroup {
  if (recent > 0 || (recent === 0 && season >= 3)) return 'rising';
  if (recent < 0 || (recent === 0 && season <= -3)) return 'slipping';
  return 'holding';
}

/** The development report for a team's players as they stand (the monthly mail and Team → Growth both read it). */
export function devReport(league: League, tid = league.userTid): DevReport {
  const dw = league.devWatch;
  const check = dw?.season === league.season ? dw.checks.length : 0;
  const players = teamPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
  const out: DevReport = { check, setup: setupLine(league, tid), rising: [], holding: [], slipping: [], veterans: [], rookies: [] };
  const races = royRace(league);
  for (const p of players) {
    const age = playerAge(p, league.season);
    const rl = rookieLine(league, p, races);
    if (age > GROWS_IN_SEASON && !rl) {
      out.veterans.push(p.pid);
      continue;
    }
    const { sinceCheck: recent } = seasonMoves(league, p);
    const season = ovrChange(league, p);
    const group = groupOf(recent, season);
    const x = { age, recent, season, group };
    const reason = reasonFor(league, p, x, ratingDeltas(league, p), baseLabel(devBase(league, p)));
    const line: DevLine = { pid: p.pid, ovr: p.ovr, ...x, reason, breakout: isBreakout(league, p) };
    // a rookie is watched on his own, his development with his line and his race
    if (rl) out.rookies.push({ pid: p.pid, line: rl, dev: line });
    else out[group].push(line);
  }
  out.rising.sort((a, b) => b.recent - a.recent || b.season - a.season);
  out.slipping.sort((a, b) => a.recent - b.recent || a.season - b.season);
  // the one to watch: the young player with the most ahead of him who is moving (or playing), the biggest riser else
  const young = [...out.rising, ...out.holding, ...out.slipping, ...out.rookies.map((x) => x.dev)].filter((x) => x.age <= YOUNG);
  const score = (x: DevLine) => {
    const p = league.players[x.pid];
    const st = seasonTotals(p, league.season);
    const mpg = st && st.gp ? st.min / st.gp : 0;
    return (p.pot - p.ovr) * 0.6 + x.season * 1.2 + x.recent * 1.5 + (x.breakout ? 4 : 0) + Math.min(mpg, 30) * 0.08 + (p.pot >= 80 ? 2 : 0);
  };
  const best = young.sort((a, b) => score(b) - score(a))[0];
  if (best) {
    const p = league.players[best.pid];
    const why = best.breakout
      ? `he is breaking out: ${minus(best.season)} this season, ${p.ovr} now`
      : p.pot - p.ovr >= 6
        ? `${p.pot - p.ovr} to go to a ceiling of ${p.pot}, and at ${best.age} the summers are still his`
        : `${minus(best.season)} this season and still climbing`;
    out.watch = { pid: best.pid, why };
  }
  return out;
}

/** "Rising", "Holding", "Slipping": a report group's name. */
export const GROUP_LABEL: Record<DevGroup, string> = { rising: 'Rising', holding: 'Holding', slipping: 'Slipping' };

/** The report as mail: a subject that says what happened, then the groups, the one to watch and the rookies. */
export function reportMail(league: League, r: DevReport): { subject: string; body: string; tone: 'good' | 'bad' | 'neutral' } {
  const name = (pid: number) => shortName(league, league.players[pid]);
  const full = (pid: number) => playerName(league.players[pid]);
  const line = (x: DevLine) => `${full(x.pid)} (${x.age}), ${x.ovr}: ${x.reason}`;
  // a move in words for a subject: this month's, else the season's
  const move = (x: DevLine) => (x.recent ? `${x.recent > 0 ? 'up' : 'down'} ${Math.abs(x.recent)}` : `${minus(x.season)} this season`);
  const nth = ['first', 'second', 'third'][r.check - 1] ?? 'latest';
  const top = r.rising[0];
  const low = r.slipping[0];
  const subject =
    top && low
      ? `Development report: ${name(top.pid)} ${move(top)}, ${name(low.pid)} slipping`
      : top
        ? r.rising.length > 1
          ? `Development report: ${name(top.pid)} leads ${plural(r.rising.length, 'riser')}`
          : `Development report: ${name(top.pid)} ${move(top)}`
        : low
          ? `Development report: ${name(low.pid)} slips`
          : 'Development report: a quiet month';
  const parts: string[] = [];
  parts.push(`The ${nth} check-in of the season. ${r.setup}`);
  for (const g of ['rising', 'slipping', 'holding'] as const) {
    if (!r[g].length) continue;
    parts.push(`${GROUP_LABEL[g]}:`);
    for (const x of r[g]) parts.push(line(x));
  }
  if (r.veterans.length) parts.push(`The veterans don't change in season; their test is the summer: ${andList(r.veterans.map(name))}.`);
  if (r.watch) parts.push(`The one to watch: ${full(r.watch.pid)}, ${r.watch.why}.`);
  for (const x of r.rookies) parts.push(`Rookie watch: ${full(x.pid)} (${x.dev.age}), ${x.dev.ovr}: ${rookieText(x.line)}. ${x.dev.reason}`);
  parts.push('Every name is on Team → Growth, with his page a tap away.');
  const net = r.rising.reduce((a, x) => a + x.recent, 0) + r.slipping.reduce((a, x) => a + x.recent, 0);
  return { subject, body: parts.join('\n'), tone: net > 0 ? 'good' : net < 0 ? 'bad' : 'neutral' };
}

// ---------------------------------------------------------------- the calendar

/** Opening night's snapshot (the first day of the regular season, or the first day the watch sees). */
function openSeason(league: League) {
  const start: Record<number, number> = {};
  for (const p of Object.values(league.players)) if (p.tid >= 0) start[p.pid] = histAt(p, league.season)?.ovr ?? p.ovr;
  const prev = league.devWatch;
  league.devWatch = {
    season: league.season,
    start,
    checks: [],
    told: [],
    ends: prev?.ends?.filter((s) => s.season === league.season - 1),
    summer: prev?.summer,
    ended: prev?.ended,
  };
  // the summer's report goes with opening night when the new season didn't send it (see devSummer)
  if (prev?.summer !== league.season) devSummer(league);
}

/** The watch's state for this season, opened if it isn't yet. */
function current(league: League): DevWatchState {
  if (league.devWatch?.season !== league.season) openSeason(league);
  return league.devWatch!;
}

/** At the end of each day of the season and free agency: opening night's snapshot, and a look for scoring breakouts every two weeks. */
export function devDay(league: League) {
  if (league.phase !== 'regular') return;
  const dw = current(league);
  if (league.day % 14 === 7) scoringWatch(league, dw);
}

/**
 * A development check-in (days 45, 90 and 135, right after inSeasonProgression): the snapshot,
 * the season's breakouts and slumps around the league as news, and the user's development report.
 */
export function devCheckIn(league: League, changes: { pid: number; delta: number }[]) {
  void changes;
  const dw = current(league);
  const ovr: Record<number, number> = {};
  for (const p of Object.values(league.players)) if (p.tid >= 0 && dw.start[p.pid] !== p.ovr) ovr[p.pid] = p.ovr;
  dw.checks.push({ day: league.day, ovr });
  prune(league, dw);
  ratingsWatch(league, dw);
  scoringWatch(league, dw);
  const r = devReport(league);
  const mail = reportMail(league, r);
  addInbox(league, { from: 'Player Development', subject: mail.subject, body: mail.body, tone: mail.tone, link: '/team/growth' });
}

/** Players gone from the league (retired, or released and gone) leave the snapshots. */
function prune(league: League, dw: DevWatchState) {
  const gone = (pid: number | string) => {
    const p = league.players[Number(pid)];
    return !p || p.tid === RETIRED;
  };
  for (const pid of Object.keys(dw.start)) if (gone(pid)) delete dw.start[Number(pid)];
  for (const c of dw.checks) for (const pid of Object.keys(c.ovr)) if (gone(pid)) delete c.ovr[Number(pid)];
}

/** How much the league would care: the better and younger, the bigger (a 78 at 21 over a 70 at 25). */
const notability = (league: League, p: Player) => p.ovr + Math.max(0, YOUNG - playerAge(p, league.season)) * 1.5;

/** Breakouts and slumps by the ratings at a check-in: news for the notable ones around the league, mail for the user's. */
function ratingsWatch(league: League, dw: DevWatchState) {
  const found: { p: Player; kind: 'b' | 's'; by: number }[] = [];
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 || playerAge(p, league.season) > YOUNG) continue;
    const { sinceOpening } = seasonMoves(league, p);
    const ahead = vsExpectation(league, p);
    if (!dw.told.includes(`b:${p.pid}`) && sinceOpening >= SEASON_BREAKOUT + 1 && ahead >= SEASON_BREAKOUT) found.push({ p, kind: 'b', by: sinceOpening });
    else if (!dw.told.includes(`s:${p.pid}`) && sinceOpening <= -SEASON_BREAKOUT) found.push({ p, kind: 's', by: sinceOpening });
  }
  found.sort((a, b) => notability(league, b.p) - notability(league, a.p));
  let news = 0;
  for (const f of found) {
    // (the user's own are in the report that goes out with this check-in)
    dw.told.push(`${f.kind}:${f.p.pid}`);
    // the league hears about a breakout from a good young player, or a promising one's slump; two a check-in at most
    const notable = f.kind === 'b' ? f.p.ovr >= 72 || (playerAge(f.p, league.season) <= 22 && f.p.ovr >= 66) : f.p.ovr >= 76;
    if (notable && news < 2) {
      news++;
      devNews(league, f.p, f.kind, f.by);
    }
  }
}

/** A breakout or slump as news. */
function devNews(league: League, p: Player, kind: 'b' | 's' | 'p', by: number, extra = '') {
  const rng = worldRng(league, 'devNews', league.season, league.day, p.pid);
  const t = league.teams[p.tid];
  const age = playerAge(p, league.season);
  const name = playerName(p);
  const big = kind !== 's' && (p.ovr >= 80 || (age <= 22 && p.ovr >= 74));
  const head =
    kind === 'b'
      ? rng.pick([`${name} is breaking out in ${t.region}`, `${p.lastName}, ${age}, takes the leap for ${t.abbrev}`, `The ${p.lastName} jump is real`])
      : kind === 'p'
        ? rng.pick([`${name} has arrived as a scorer`, `${p.lastName}'s breakout season in ${t.region}`, `From role player to option: ${name}`])
        : rng.pick([`${name}'s season has stalled`, `A step back for ${p.lastName} in ${t.region}`]);
  const text =
    kind === 'p'
      ? extra
      : kind === 'b'
        ? `The ${age}-year-old is up ${by} since opening night, now ${p.ovr}, and his staff see more coming.`
        : `The ${age}-year-old is down ${-by} since opening night, now ${p.ovr}.`;
  addNews(league, { kind: 'general', head, text, tids: [p.tid], pids: [p.pid], weight: big ? 2 : 1 });
}

/** Scoring breakouts: a young player's points a game well up on last season over 15 games or more. News for the notable, mail for the user's. */
function scoringWatch(league: League, dw: DevWatchState) {
  const found: { p: Player; now: number; then: number; mNow: number; mThen: number }[] = [];
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 || dw.told.includes(`p:${p.pid}`) || playerAge(p, league.season) > YOUNG - 1) continue;
    const st = seasonTotals(p, league.season);
    if (!st || st.gp < SCORING_GAMES) continue;
    const last = seasonTotals(p, league.season - 1);
    if (!last || last.gp < 20) continue;
    const now = st.pts / st.gp;
    const then = last.pts / last.gp;
    if (now >= SCORING_FLOOR && now - then >= SCORING_JUMP) found.push({ p, now, then, mNow: st.min / st.gp, mThen: last.min / last.gp });
  }
  found.sort((a, b) => notability(league, b.p) + b.now - (notability(league, a.p) + a.now));
  let news = 0;
  for (const f of found) {
    dw.told.push(`p:${f.p.pid}`);
    const mins =
      Math.round(f.mNow) - Math.round(f.mThen) >= 3 ? `his minutes up from ${Math.round(f.mThen)} to ${Math.round(f.mNow)}` : `on about the same ${Math.round(f.mNow)} minutes`;
    const line = `From ${f.then.toFixed(1)} points a game last season to ${f.now.toFixed(1)}, ${mins}.`;
    if (f.p.tid === league.userTid) {
      addInbox(league, {
        from: 'Player Development',
        subject: `Breakout: ${shortName(league, f.p)} is scoring ${f.now.toFixed(1)} a game`,
        body: `${line}\nAt ${playerAge(f.p, league.season)} this is the season that sets his next contract and his ceiling. The minutes are doing as much as anything: keep them coming.`,
        tone: 'good',
        link: `/player/${f.p.pid}`,
      });
    }
    if ((f.now >= 16 || f.p.tid === league.userTid) && news < 2) {
      news++;
      devNews(league, f.p, 'p', 0, line);
    }
  }
}

/**
 * When the Finals end: the season's end written down (the arrows measure next season from it),
 * and the season's development summary for the user.
 */
export function devSeasonEnd(league: League) {
  const ovr: Record<number, number> = {};
  const r: Record<number, string> = {};
  // (free agents too: one signed over the summer is measured from where he ended the season)
  for (const p of Object.values(league.players)) {
    if (p.tid < 0 && p.tid !== FREE_AGENT) continue;
    ovr[p.pid] = p.ovr;
    r[p.pid] = packRatings(p);
  }
  const dw = current(league);
  dw.ends = [...(dw.ends ?? []).filter((s) => s.season === league.season - 1), { season: league.season, ovr, r }];
  if (dw.ended === league.season) return;
  dw.ended = league.season;
  seasonSummary(league);
}

/** The user's season in development: who grew, the rookies' first seasons, and who the summer should move. */
function seasonSummary(league: League) {
  const mine = teamPlayers(league, league.userTid);
  if (!mine.length) return;
  const name = (p: Player) => shortName(league, p);
  const moves = mine.map((p) => ({ p, d: ovrChange(league, p), age: playerAge(p, league.season) })).sort((a, b) => b.d - a.d);
  const up = moves.filter((x) => x.d > 0).slice(0, 3);
  const down = moves
    .filter((x) => x.d < 0)
    .slice(-2)
    .reverse();
  const parts: string[] = [];
  const word = (x: (typeof moves)[number]) => `${name(x.p)} ${minus(x.d)} to ${x.p.ovr}`;
  if (up.length) parts.push(`The season's growth: ${andList(up.map(word))}.`);
  if (down.length) parts.push(`Gave ground: ${andList(down.map(word))}.`);
  if (!up.length && !down.length) parts.push('Nobody moved much this season: the summer is where most of it happens.');
  const rookies = mine.filter((p) => isRookie(league, p));
  for (const p of rookies) {
    const rl = rookieLine(league, p);
    if (rl) parts.push(`${playerName(p)}'s rookie season: ${rookieText(rl)}.`);
  }
  const climb = moves.filter((x) => x.age <= 23 && x.p.pot - x.p.ovr >= 4).slice(0, 3);
  const fade = moves.filter((x) => x.age >= 31).sort((a, b) => b.p.ovr - a.p.ovr);
  if (climb.length)
    parts.push(`This summer should lift ${andList(climb.map((x) => `${name(x.p)} (${x.age}, POT ${x.p.pot})`))}: the summers are when young players take their steps.`);
  if (fade.length) parts.push(`Watch the age curve with ${andList(fade.slice(0, 3).map((x) => `${name(x.p)} (${x.age})`))}: conditioning work slows the athletic decline.`);
  const best = up[0];
  addInbox(league, {
    from: 'Player Development',
    subject: best ? `The season in development: ${name(best.p)} led the way` : 'The season in development',
    body: parts.join('\n'),
    tone: 'neutral',
    link: '/team/growth',
  });
}

/**
 * The summer's development report, once the year's progression is in: who grew over the summer,
 * who slipped, the breakouts around the league. It goes with opening night (see openSeason); the
 * new season can send it as it starts instead (newSeason, after annualProgression), and then
 * opening night doesn't.
 */
export function devSummer(league: League) {
  const dw = league.devWatch;
  if (dw) dw.summer = league.season;
  // what the summer did: from last season's end to this season's start (ratingsHistory's entry), or now
  const from = (p: Player) => endOf(league, league.season - 1)?.ovr[p.pid];
  const to = (p: Player) => histAt(p, league.season)?.ovr ?? p.ovr;
  const rows: { p: Player; d: number; age: number }[] = [];
  for (const p of Object.values(league.players)) {
    if (p.tid < 0) continue;
    const was = from(p);
    if (was === undefined) continue;
    rows.push({ p, d: to(p) - was, age: playerAge(p, league.season) });
  }
  if (!rows.length) return;
  // the league's summer breakouts: young players well past what their age would add, the notable first
  const breakouts = rows
    .filter((x) => x.age <= YOUNG && x.d - yearlyGrowth(x.age - 1) >= SUMMER_BREAKOUT && (to(x.p) >= 70 || x.age <= 22))
    .sort((a, b) => notability(league, b.p) + b.d - (notability(league, a.p) + a.d));
  if (dw) for (const x of breakouts) if (!dw.told.includes(`b:${x.p.pid}`)) dw.told.push(`b:${x.p.pid}`);
  const top = breakouts.filter((x) => x.p.tid !== league.userTid).slice(0, 3);
  if (top.length) {
    const rng = worldRng(league, 'devSummer', league.season);
    const lead = top[0];
    addNews(league, {
      kind: 'general',
      head: rng.pick([
        `${playerName(lead.p)} arrives at camp transformed`,
        `The summer's big riser: ${playerName(lead.p)}`,
        `${lead.p.lastName}, ${lead.age}, comes back a different player`,
      ]),
      text: `Up ${lead.d} over the summer to ${to(lead.p)}.${top.length > 1 ? ` Also up big: ${andList(top.slice(1).map((x) => `${playerName(x.p)} (${league.teams[x.p.tid].abbrev}) ${minus(x.d)}`))}.` : ''}`,
      tids: top.map((x) => x.p.tid),
      pids: top.map((x) => x.p.pid),
      weight: to(lead.p) >= 78 ? 2 : 1,
    });
  }
  const mine = rows.filter((x) => x.p.tid === league.userTid).sort((a, b) => b.d - a.d);
  if (!mine.length) return;
  const name = (p: Player) => shortName(league, p);
  const up = mine.filter((x) => x.d > 0).slice(0, 4);
  const down = mine
    .filter((x) => x.d < 0)
    .slice(-3)
    .reverse();
  const word = (x: (typeof mine)[number]) => `${name(x.p)} ${minus(x.d)} (now ${to(x.p)})`;
  const parts = [`The summer's work is in. ${setupLine(league, league.userTid)}`];
  const ours = mine.filter((x) => breakouts.includes(x));
  if (ours.length) parts.push(`Breakout${ours.length > 1 ? 's' : ''}: ${andList(ours.map(word))}. That is well past what his age alone would add.`);
  if (up.length) parts.push(`Up: ${andList(up.filter((x) => !ours.includes(x)).map(word)) || 'see above'}.`);
  if (down.length) parts.push(`Down: ${andList(down.map(word))}.${down.some((x) => x.age >= 30) ? ' The age curve, mostly: athleticism goes first.' : ''}`);
  const big = ours[0] ?? up[0];
  addInbox(league, {
    from: 'Player Development',
    subject: big ? `Summer development: ${name(big.p)} ${minus(big.d)}` : 'Summer development: a quiet summer',
    body: parts.join('\n'),
    tone: up.length >= down.length ? 'good' : 'neutral',
    link: '/team/growth',
  });
}
