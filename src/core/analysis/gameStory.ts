// A game as a story: its headline, its hero, what it meant, and the user's games written up as news
// (see world.ts); and a game's billing before it's played (a rivalry, a revenge game, Christmas Day,
// Game 7). Everything here reads the league as it stands and the stored results: nothing is drawn
// from the league's random stream. Phrasings are picked by `worldRng` keyed by the game, and the
// headline's shape rotates through the user's games, so two nights in a row never read alike and a
// game always reads the same.
//
// Proportion matters more than volume: a routine win over a weak team is a calm brief, a
// buzzer-beater at a rival or a Game 7 is the front page. `weight` says which (3 the front page, 2 a
// story, 1 a brief), and the headline is chosen from the biggest thing that happened.

import type { BoxLine, GameResult, League, NewsItem, PbpEntry, Player, ScheduledGame, Team, TeamBox } from '../types';
import { worldRng } from '../league/world';
import { addNews, andList, dateToDay, fmtDate, playerName, teamCity } from '../league/helpers';
import { seasonLabel } from '../constants';
import { an, madeAtt, ordinal, plural } from '../format';
import { FRANCHISES } from '../teams';
import { careerTotals, markText, milestonesIn } from './milestones';
import { REC_LABEL, bookFrom, gameMark, recordReach, recordsHeld, recordWhat, type HeldRecord, type RecStat } from '../league/records';
import { winChance } from './winProb';
import { SETS } from '../sim/sets';
import { anniversaryOf, droughtLine, meetings, titleLine } from '../league/media/history';

/** A finished game told as a story, from one team's side. */
export interface GameStory {
  gid: number;
  /** The headline ("Brunson's 41 sinks Boston at the buzzer"). */
  head: string;
  /** The line under it. */
  dek: string;
  /** The player of the game, for his jersey: the team's own best night, in a loss too. */
  hero?: number;
  /** What it means, in short lines ("Third straight win", "Up to 4th in the East", "First win at TD Garden since 2024"). */
  means: string[];
  /** The hero's line ("41 pts · 7 reb · 5 ast · 15-26 FG"). */
  heroLine?: string;
  /** The occasion, a few words over the headline ("Opening night", "Rivalry night", "Game 7"). */
  kicker?: string;
  /** How big a night it was: 3 the front page, 2 a story, 1 a brief. */
  weight: 1 | 2 | 3;
  /** The story as the press writes it: short paragraphs, a blank line between them. */
  body: string;
  won: boolean;
  /** The story in the news, when the press ran it (its id opens it: `/league/news?story=<id>`). */
  newsId?: number;
}

// ---------------------------------------------------------------- the facts of a game

const QUARTER = ['first quarter', 'second quarter', 'third quarter', 'fourth quarter'];
const periodWord = (i: number) => (i < 4 ? QUARTER[i] : i === 4 ? 'overtime' : `the ${ordinal(i - 3)} overtime`);
const otWord = (ot: number) => (ot <= 1 ? 'overtime' : ot === 2 ? 'double overtime' : ot === 3 ? 'triple overtime' : `${ot} overtimes`);
const confWord = (c: 'E' | 'W') => (c === 'E' ? 'East' : 'West');
/** "Boston's", "Dallas'": a name's possessive. */
const poss = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const reb = (b: BoxLine) => b.orb + b.drb;
const gameScore = (b: BoxLine) => b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.orb + 0.3 * b.drb + b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov;
const tripleDouble = (b: BoxLine) => [b.pts, reb(b), b.ast, b.stl, b.blk].filter((x) => x >= 10).length >= 3;

/** A franchise's arena, when the team is the franchise the seed knows (a fictional league's aren't). */
export function arenaOf(team: Team): string | undefined {
  const f = FRANCHISES[team.tid];
  return f && f.abbrev === team.abbrev ? f.arena : undefined;
}

/** The season day of Christmas. */
export const christmasDay = (season: number) => dateToDay(season, 11, 25);

/** "1st Round", "East Semifinals"... from a series id ("E2-0"). */
function seriesName(id: string): { round: number; conf: 'E' | 'W' | 'F'; label: string; next: string } | null {
  const m = /^([EWF])(\d)-/.exec(id);
  if (!m) return null;
  const conf = m[1] as 'E' | 'W' | 'F';
  const round = Number(m[2]);
  const c = conf === 'W' ? 'West' : 'East';
  const label = round === 4 ? 'Finals' : round === 3 ? `${c} Finals` : round === 2 ? `${c} Semifinals` : `${c} First Round`;
  const next = round === 4 ? 'title' : round === 3 ? 'Finals' : round === 2 ? `${c} Finals` : `${c} Semifinals`;
  return { round, conf, label, next };
}

/** The shot that won it, as the play-by-play has it: when (seconds left in the last period), and who. */
interface Decider {
  /** The winner's side: the user's, or theirs. */
  ours: boolean;
  secs: number;
  buzzer: boolean;
  who?: BoxLine;
  ft: boolean;
  three: boolean;
}

/** A run: points one side scored while the other scored none, and the period it started in. */
interface Run {
  pts: number;
  q: number;
}

interface Facts {
  res: GameResult;
  tid: number;
  us: TeamBox;
  them: TeamBox;
  team: Team;
  foe: Team;
  won: boolean;
  margin: number;
  home: boolean;
  neutral: boolean;
  /** Where it was played ("Madison Square Garden"), when the arena is known. */
  arena?: string;
  /** The user's game number this season (its index among them). */
  k: number;
  hero?: BoxLine;
  heroP?: Player;
  /** Their best night. */
  star?: BoxLine;
  /** Our second-best scorer. */
  second?: BoxLine;
  high?: 'career' | 'season';
  /** The biggest lead the winner overcame (their biggest lead, in a win: the loser's). */
  comeback: number;
  /** The biggest lead the loser let slip. */
  blown: number;
  decider?: Decider;
  /**
   * The play you called that won it late or tied it for overtime (from the night's moves: see
   * CoachMove.call): the play in words ("the iso", "the Chicago"), who it was for, how, and when.
   */
  called?: { play: string; for?: BoxLine; how: 'won' | 'tied'; secs: number; q: number };
  run?: Run & { ours: boolean };
  /** The period the winner won by the most, and by how much. */
  turn?: { i: number; w: number; l: number };
  /** Regular-season streaks before and after (+n wins, −n losses). */
  streak: { before: number; after: number };
  theirStreak: number;
  /** The regular-season record after it. */
  rec: [number, number];
  theirRec: [number, number];
  /** Their conference place going in (1 the best), once they had ten games in. */
  theirRank: number;
  series?: { w: number; l: number; label: string; next: string; round: number };
  playIn?: string;
  opening: boolean;
  homeOpener: boolean;
  christmas: boolean;
  rivalry: Rivalry;
  /** The chance to win at tip-off, when the result keeps the projection. */
  chance?: number;
  firstWin: boolean;
  /**
   * A record this team set tonight that leads its story: a league record (a player's or the team's),
   * or a franchise scoring record by one of its players; `who` is his line, `prev` the mark it beat.
   */
  record?: { scope: 'league' | 'team'; stat: HeldRecord['stat']; team?: true; v: number; who?: BoxLine; prev?: { v: number; name: string; season: number } };
  name: (b: BoxLine) => string;
  full: (b: BoxLine) => string;
}

/** One pass over the season's stored results up to this game: records, streaks and where the user's games stood. */
function seasonPass(league: League, res: GameResult, tid: number, opp: number, hero?: number) {
  const rec = new Map<number, [number, number]>();
  let k = 0;
  let reg = 0;
  let homeReg = 0;
  let streak = 0;
  let theirStreak = 0;
  let heroBest = -1;
  let heroGp = 0;
  const step = (s: number, won: boolean) => (won ? (s > 0 ? s + 1 : 1) : s < 0 ? s - 1 : -1);
  for (const g of league.games) {
    if (g.season !== res.season) continue;
    if (g.gid === res.gid) break;
    const mine = g.home.tid === tid || g.away.tid === tid;
    if (mine && g.type !== 'allstar') k++;
    if (g.type !== 'regular') continue;
    const hw = g.home.pts > g.away.pts;
    for (const [t, w] of [
      [g.home.tid, hw],
      [g.away.tid, !hw],
    ] as const) {
      const r = rec.get(t) ?? [0, 0];
      r[w ? 0 : 1]++;
      rec.set(t, r);
      if (t === tid) streak = step(streak, w);
      if (t === opp) theirStreak = step(theirStreak, w);
    }
    if (mine) {
      reg++;
      if (g.home.tid === tid) homeReg++;
    }
    if (hero !== undefined && mine) {
      const b = (g.home.tid === tid ? g.home : g.away).players.find((x) => x.pid === hero && x.min > 0);
      if (b) {
        heroGp++;
        heroBest = Math.max(heroBest, b.pts);
      }
    }
  }
  return { rec, k, reg, homeReg, streak, theirStreak, heroBest, heroGp };
}

/** A buzzer-beater: the go-ahead basket with half a second or less left (about one game in a hundred in the NBA). */
const BUZZER = 0.5;

/** The shot that put the winner ahead for good, when it came in the last 24 seconds of the last period. */
function deciderOf(res: GameResult, usSide: 0 | 1): Decider | undefined {
  const winSide: 0 | 1 = res.home.pts > res.away.pts ? 0 : 1;
  const lastQ = 4 + res.ot;
  const ours = winSide === usSide;
  const pbp = res.pbp;
  if (pbp?.length) {
    let at: PbpEntry | undefined;
    let prev = 0;
    for (const e of pbp) {
      const lead = winSide === 0 ? e.hs - e.as : e.as - e.hs;
      if (lead > 0 && prev <= 0) at = e;
      prev = lead;
    }
    if (!at || at.q !== lastQ || at.clock > 24) return undefined;
    const box = winSide === 0 ? res.home : res.away;
    // the play-by-play names the shooter by his last name
    const who = box.players.filter((b) => b.min > 0 && at.text.startsWith(`${b.name.split(' ').slice(-1)[0]} `)).sort((a, b) => b.pts - a.pts || b.name.length - a.name.length)[0];
    return { ours, secs: at.clock, buzzer: at.clock <= BUZZER, who, ft: at.kind === 'ft', three: /\bthree\b|3-pt|3PT|three-pointer/i.test(at.text) };
  }
  // without the play-by-play (pruned from older games): the margin's flow and its clock
  const { flow, flowT } = res;
  if (!flow?.length || flowT?.length !== flow.length) return undefined;
  const total = 2880 + 300 * res.ot;
  let at = -1;
  let prev = 0;
  for (let i = 0; i < flow.length; i++) {
    const lead = winSide === 0 ? flow[i] : -flow[i];
    if (lead > 0 && prev <= 0) at = i;
    prev = lead;
  }
  if (at < 0) return undefined;
  const secs = total - flowT[at];
  if (secs > 24) return undefined;
  // who: when it was the winner's last score and a basket (a two or a three, an and-one's free
  // throw aside), the last basket the winner made in the shot chart (kept in the order they fell)
  const step = (i: number) => (winSide === 0 ? 1 : -1) * (flow[i] - (i > 0 ? flow[i - 1] : 0));
  const gain = step(at);
  const last = !flow.slice(at + 1).some((_, j) => step(at + 1 + j) > 0);
  const shot = last ? [...(res.shots ?? [])].reverse().find((x) => x.t === winSide && x.made && x.q === lastQ) : undefined;
  const value = shot ? (shot.zone === 'c3' || shot.zone === 'ab3' ? 3 : 2) : 0;
  const box = winSide === 0 ? res.home : res.away;
  const who = shot && value <= gain && gain - value <= 1 ? box.players.find((b) => b.pid === shot.pid) : undefined;
  // (the flow's clock is whole seconds: 0 is the last half second)
  return { ours, secs, buzzer: secs < 1, who, ft: !who && gain <= 2 && !shot, three: !!who && value === 3 };
}

/** Each side's longest run of unanswered points, from the play-by-play. */
function bestRuns(pbp: PbpEntry[] | undefined): [Run, Run] {
  const best: [Run, Run] = [
    { pts: 0, q: 0 },
    { pts: 0, q: 0 },
  ];
  if (!pbp?.length) return best;
  let side = -1;
  let run = 0;
  let q = 0;
  let h = 0;
  let a = 0;
  for (const e of pbp) {
    const dh = e.hs - h;
    const da = e.as - a;
    if (dh <= 0 && da <= 0) continue;
    h = e.hs;
    a = e.as;
    const s = dh > 0 ? 0 : 1;
    if (s === side) run += dh > 0 ? dh : da;
    else {
      side = s;
      run = dh > 0 ? dh : da;
      q = e.q;
    }
    if (run > best[s].pts) best[s] = { pts: run, q };
  }
  return best;
}

/** Last names for both teams' players in a game, the full name for two who share one. */
function boxNamer(league: League, res: GameResult) {
  const lines = [...res.home.players, ...res.away.players];
  const lastOf = (b: BoxLine) => league.players[b.pid]?.lastName || b.name.split(' ').slice(-1)[0];
  const count = new Map<string, number>();
  for (const b of lines) count.set(lastOf(b), (count.get(lastOf(b)) ?? 0) + 1);
  const full = (b: BoxLine) => (league.players[b.pid] ? playerName(league.players[b.pid]) : b.name);
  return { name: (b: BoxLine) => ((count.get(lastOf(b)) ?? 0) > 1 ? full(b) : lastOf(b)), full };
}

/** His regular-season career highs cover his whole career: every season he has played is one in this league, or the seed brought a real player's from every game he had played. */
function highsWhole(league: League, p: Player) {
  if (p.real && league.realHighs) return true;
  return p.stats.every((s) => s.gp === 0 || s.season >= league.startSeason) && careerTotals(p).gp >= 15;
}

/**
 * The record tid's side set tonight that its story leads with: a league record (a player's, or the
 * team's), else a franchise scoring record (a player's points, the team's points) once the book has a
 * season behind it (recordsHeld). The mark it beat is the list's second, when the book has one.
 */
function recordOf(league: League, res: GameResult, tid: number, us: TeamBox): Facts['record'] {
  const held = recordsHeld(league, res).filter((r) => r.tid === tid && r.book === 'reg');
  const r =
    held.find((x) => x.scope === 'league' && !x.team) ??
    held.find((x) => x.scope === 'league') ??
    held.find((x) => x.scope === 'team' && x.stat === 'pts' && (x.team || x.v >= 40));
  if (!r) return undefined;
  const who = r.pid !== undefined ? us.players.find((b) => b.pid === r.pid) : undefined;
  if (!r.team && !who) return undefined;
  const book = league.records!;
  const shelf = r.scope === 'league' ? book.league.reg : book.teams[tid]?.reg;
  const second = !r.team && shelf ? shelf.players[r.stat as RecStat]?.[1] : undefined;
  const prev = second ? gameMark(league, second) : undefined;
  return {
    scope: r.scope,
    stat: r.stat,
    ...(r.team ? { team: true as const } : {}),
    v: r.v,
    ...(who ? { who } : {}),
    ...(prev ? { prev: { v: prev.v, name: prev.name, season: prev.season } } : {}),
  };
}

function factsOf(league: League, res: GameResult, tid: number): Facts | null {
  const us = res.home.tid === tid ? res.home : res.away.tid === tid ? res.away : null;
  if (!us) return null;
  const them = us === res.home ? res.away : res.home;
  const team = league.teams[tid];
  const foe = league.teams[them.tid];
  const won = us.pts > them.pts;
  const home = us === res.home;
  const neutral = res.cup === 'final' || res.type === 'cup';
  const { name, full } = boxNamer(league, res);
  const ours = us.players.filter((b) => b.min > 0);
  const hero = ours.find((b) => b.pid === res.pog) ?? [...ours].sort((a, b) => gameScore(b) - gameScore(a))[0];
  const star = [...them.players.filter((b) => b.min > 0)].sort((a, b) => gameScore(b) - gameScore(a))[0];
  const second = ours.filter((b) => b !== hero).sort((a, b) => b.pts - a.pts)[0];
  const pass = seasonPass(league, res, tid, them.tid, hero?.pid);
  const heroP = hero ? league.players[hero.pid] : undefined;
  let high: Facts['high'];
  if (hero && heroP && res.type === 'regular' && hero.pts >= 20) {
    const h = heroP.highs?.pts;
    if (h && h[4] === res.gid && h[0] === hero.pts && highsWhole(league, heroP)) high = 'career';
    else if (pass.heroGp >= 10 && hero.pts > pass.heroBest && hero.pts >= 25) high = 'season';
  }
  const reg = res.type === 'regular';
  const r0 = pass.rec.get(tid) ?? [0, 0];
  const t0 = pass.rec.get(them.tid) ?? [0, 0];
  const rec: [number, number] = reg ? [r0[0] + (won ? 1 : 0), r0[1] + (won ? 0 : 1)] : [r0[0], r0[1]];
  // their place in the conference going in, by record (ten games in)
  let theirRank = 0;
  if (t0[0] + t0[1] >= 10) {
    const pct = (r: [number, number]) => r[0] / Math.max(1, r[0] + r[1]);
    theirRank = 1 + league.teams.filter((t) => t.conf === foe.conf && t.tid !== foe.tid && pct(pass.rec.get(t.tid) ?? [0, 0]) > pct(t0)).length;
  }
  const after = reg ? (won ? (pass.streak > 0 ? pass.streak + 1 : 1) : pass.streak < 0 ? pass.streak - 1 : -1) : pass.streak;
  // the series as it stood after this game
  let series: Facts['series'];
  if (res.type === 'playoffs' && res.seriesId) {
    const sn = seriesName(res.seriesId);
    let w = 0;
    let l = 0;
    for (const g of league.games) {
      if (g.season !== res.season || g.type !== 'playoffs' || g.seriesId !== res.seriesId) continue;
      if ((g.home.pts > g.away.pts ? g.home.tid : g.away.tid) === tid) w++;
      else l++;
      if (g.gid === res.gid) break;
    }
    if (sn) series = { w, l, label: sn.label, next: sn.next, round: sn.round };
  }
  const usSide: 0 | 1 = home ? 0 : 1;
  const runs = bestRuns(res.pbp);
  const winRun = won ? runs[usSide] : runs[(1 - usSide) as 0 | 1];
  let turn: Facts['turn'];
  const qs = us.quarters.map((p, i) => (won ? p - (them.quarters[i] ?? 0) : (them.quarters[i] ?? 0) - p));
  const best = qs.indexOf(Math.max(...qs));
  if (best >= 0 && qs[best] >= 6) {
    const [a, b] = [us.quarters[best], them.quarters[best]];
    turn = { i: best, w: won ? a : b, l: won ? b : a };
  }
  // the user's first win in this job
  let firstWin = false;
  const stint = league.coaches?.find((c) => c.user)?.stints.at(-1);
  if (won && reg && tid === league.userTid && stint && stint.tid === tid && stint.from === res.season) firstWin = r0[0] - (stint.at?.[0] ?? 0) <= 0;
  const edge = res.edge;
  // the play you called that won it or tied it late (the night's moves are the user's)
  const callMove = tid === league.userTid ? [...(res.moves ?? [])].reverse().find((m) => m.call?.late) : undefined;
  const c = callMove?.call;
  const called: Facts['called'] =
    callMove && c?.late
      ? { play: c.id === 'iso' ? 'the iso' : `the ${SETS[c.id].short}`, for: us.players.find((b) => b.pid === c.pid), how: c.late.how, secs: c.late.clock, q: callMove.q }
      : undefined;
  return {
    res,
    tid,
    us,
    them,
    team,
    foe,
    record: recordOf(league, res, tid, us),
    won,
    margin: Math.abs(us.pts - them.pts),
    home,
    neutral,
    arena: neutral ? undefined : arenaOf(league.teams[res.home.tid]),
    k: pass.k,
    hero,
    heroP,
    star,
    second,
    high,
    comeback: won ? them.extra.biggestLead : 0,
    blown: won ? 0 : us.extra.biggestLead,
    decider: deciderOf(res, usSide),
    called,
    run: winRun.pts >= 10 ? { ...winRun, ours: won } : undefined,
    turn,
    streak: { before: pass.streak, after },
    theirStreak: pass.theirStreak,
    rec,
    theirRec: t0,
    theirRank,
    series,
    playIn: res.type === 'playin' ? res.seriesId : undefined,
    opening: reg && pass.reg === 0,
    homeOpener: reg && home && pass.homeReg === 0 && pass.reg > 0,
    christmas: reg && res.day === christmasDay(res.season),
    rivalry: rivalryOf(league, tid, them.tid),
    chance: edge === undefined ? undefined : winChance(home ? edge : -edge),
    firstWin,
    name,
    full,
  };
}

// ---------------------------------------------------------------- the headline

/** The template for a category: the same one for a game every time, never the same as the user's game before it in the same category. */
function rotate<T>(league: League, f: Facts, cat: string, list: T[]): T {
  const off = worldRng(league, 'story-shape', f.res.season, cat).int(0, list.length - 1);
  return list[(f.k + off) % list.length];
}

/** The headline: from the biggest thing that happened, in that category's words. */
function headline(league: League, f: Facts): { cat: string; head: string } {
  const T = teamCity(league, f.team);
  const O = teamCity(league, f.foe);
  const hi = Math.max(f.us.pts, f.them.pts);
  const lo = Math.min(f.us.pts, f.them.pts);
  const score = `${hi}-${lo}`;
  const H = f.hero ? f.name(f.hero) : T;
  const S = f.star ? f.name(f.star) : O;
  // (the opponent is named by its city: an away win reads "on the road", not "edges Toronto in Toronto")
  const where = f.home ? 'at home' : f.neutral ? 'in Las Vegas' : 'on the road';
  const pick = (cat: string, list: string[]) => ({ cat, head: rotate(league, f, cat, list) });
  const s = f.series;
  const shot = (d: Decider) => (d.ft ? 'free throws' : d.three ? 'three' : 'shot');

  if (s) {
    const n = s.w + s.l;
    if (f.won) {
      if (s.w === 4 && s.round === 4) return pick('s-title', [`${T} wins it all`, `${T} wins the title in ${n}`, `${T} finishes off ${O} for the championship`]);
      if (s.w === 4 && n === 7) return pick('s-g7w', [`${T} wins Game 7, beats ${O}`, `Game 7 goes to ${T}`, `${H} carries ${T} through Game 7`]);
      if (s.w === 4) return pick('s-close', [`${T} closes out ${O} in ${n}`, `${T} finishes off ${O}, reaches the ${s.next}`, `${T} past ${O} in ${n} games`]);
      if (s.w === 3 && s.l === 3) return pick('s-force7', [`${T} forces Game 7`, `${T} stays alive, forces Game 7 against ${O}`]);
      if (s.l === 3) return pick('s-alive', [`${T} stays alive, trails ${O} ${s.l}-${s.w}`, `${T} avoids elimination in Game ${n}`]);
      if (s.w === 3) return pick('s-3', [`${T} takes ${s.w}-${s.l} lead, one win from the ${s.next}`, `${T} moves within a win of the ${s.next}`]);
      if (s.w === s.l) return pick('s-even', [`${T} evens the series with ${O} at ${s.w}-${s.l}`, `${T} levels the ${s.label} at ${s.w}`]);
      if (s.w > s.l) return pick('s-lead', [`${T} takes ${s.w}-${s.l} lead over ${O}`, `${T} goes up ${s.w}-${s.l} on ${O}`]);
      return pick('s-cut', [`${T} wins Game ${n}, cuts ${poss(O)} lead to ${s.l}-${s.w}`, `${T} gets one back on ${O}, trails ${s.l}-${s.w}`]);
    }
    if (s.l === 4 && s.round === 4) return pick('s-titlel', [`${O} beats ${T} for the title`, `${T} falls short in the Finals`]);
    if (s.l === 4 && n === 7) return pick('s-g7l', [`${T} loses Game 7 to ${O}`, `${poss(T)} season ends in Game 7`]);
    if (s.l === 4) return pick('s-out', [`${O} ends ${poss(T)} season`, `${T} eliminated by ${O} in ${n}`, `Season over: ${T} falls to ${O}`]);
    if (s.l === 3 && s.w === 3) return pick('s-forced7', [`${O} forces Game 7`, `${O} stays alive against ${T}`]);
    if (s.l === 3) return pick('s-brink', [`${T} one loss from elimination`, `${O} takes ${s.l}-${s.w} lead on ${T}`]);
    if (s.w === s.l) return pick('s-evenl', [`${O} evens the series at ${s.w}-${s.l}`, `${O} ties the ${s.label} at ${s.w}`]);
    // still ahead after a loss: a closeout missed, or a lead cut
    if (s.w === 3) return pick('s-missed', [`${O} stays alive, cuts ${poss(T)} lead to ${s.w}-${s.l}`, `${T} misses first chance to close out ${O}`]);
    if (s.w > s.l) return pick('s-cutl', [`${O} wins Game ${n}, trails ${T} ${s.w}-${s.l}`, `${O} gets one back, ${T} leads ${s.w}-${s.l}`]);
    return pick('s-trail', [`${O} takes ${s.l}-${s.w} lead on ${T}`, `${T} falls behind ${s.w}-${s.l}`]);
  }
  if (f.playIn) {
    const id = f.playIn;
    if (f.won)
      return id.endsWith('-910')
        ? pick('pi-910', [`${T} survives the play-in, plays for the 8th seed`, `${T} beats ${O} to stay alive`])
        : pick('pi-in', [`${T} is in: the ${id.endsWith('-78') ? '7th' : '8th'} seed`, `${T} beats ${O}, reaches the playoffs`]);
    return id.endsWith('-78')
      ? pick('pi-78l', [`${T} falls to ${O}, gets one more chance`, `${O} takes the 7th seed from ${T}`])
      : pick('pi-out', [`${poss(T)} season ends in the play-in`, `${O} ends ${poss(T)} season`]);
  }
  if (f.res.cup && f.res.cup !== 'group') {
    const round = f.res.cup === 'final' ? 'final' : f.res.cup === 'sf' ? 'semifinal' : 'quarterfinal';
    if (f.won)
      return f.res.cup === 'final'
        ? pick('cup-win', [`${T} wins the In-Season Cup`, `${T} takes the Cup, ${score} over ${O}`])
        : pick('cup-adv', [`${T} beats ${O}, into the Cup ${f.res.cup === 'qf' ? 'semifinals' : 'final'}`, `${T} advances in the Cup with ${score} win`]);
    return pick('cup-out', [`${O} knocks ${T} out of the Cup`, `${poss(T)} Cup run ends in the ${round}`]);
  }
  // a record set tonight leads the story, a win or a loss (the night is remembered for it)
  const rc = f.record;
  if (rc) {
    const what = recordWhat({ stat: rc.stat, team: rc.team, v: rc.v });
    if (rc.team)
      return rc.scope === 'league'
        ? pick('rec-lt', [`${T} sets a league record: ${what}`, `A league record for ${T}: ${what} ${f.won ? `in a win over ${O}` : `in a loss to ${O}`}`])
        : pick('rec-ft', [`${T} sets a franchise record with ${what}`, `${what} for ${T}, a franchise record`]);
    const W = f.name(rc.who!);
    if (rc.scope === 'league')
      return f.won
        ? pick('rec-l', [`${W} sets a league record with ${what}`, `A league-record ${what} for ${W} as ${T} beats ${O}`, `${what}: ${W} sets a league record`])
        : pick('rec-ll', [`${poss(W)} league-record ${what} not enough for ${T}`, `${W} sets a league record with ${what} in a loss to ${O}`]);
    return f.won
      ? pick('rec-f', [`${poss(W)} ${rc.v} sets a franchise record`, `A franchise record: ${rc.v} for ${W}`, `${W} scores ${rc.v}, a franchise record, as ${T} beats ${O}`])
      : pick('rec-fl', [`${W} scores a franchise-record ${rc.v} in a loss to ${O}`, `${poss(W)} franchise-record ${rc.v} not enough against ${O}`]);
  }
  const d = f.decider;
  if (d?.buzzer)
    return d.ours
      ? pick(
          'buzz',
          d.who
            ? [`${f.name(d.who)} beats the buzzer, ${T} stuns ${O}`, `${f.name(d.who)} at the horn: ${T} ${score}`, `${poss(f.name(d.who))} buzzer-beater sinks ${O}`]
            : [`${T} beats ${O} at the buzzer`],
        )
      : pick('buzzl', d.who ? [`${f.name(d.who)} beats the buzzer to sink ${T}`, `Heartbreak for ${T}: ${f.name(d.who)} at the horn`] : [`${O} beats ${T} at the buzzer`]);
  if (d && d.secs <= 12)
    return d.ours
      ? pick(
          'gw',
          d.who
            ? [`${poss(f.name(d.who))} late ${shot(d)} ${d.ft ? 'lift' : 'lifts'} ${T} past ${O}`, `${f.name(d.who)} wins it late for ${T}`]
            : [`${T} edges ${O} ${score} at the finish`],
        )
      : pick('gwl', d.who ? [`${f.name(d.who)} wins it late for ${O}`, `${poss(f.name(d.who))} late ${shot(d)} beats ${T}`] : [`${O} edges ${T} at the finish`]);
  if (f.won && f.comeback >= 15)
    return pick('comeback', [
      `${T} erases ${f.comeback}-point deficit, beats ${O}`,
      `From ${f.comeback} down, ${T} comes back on ${O}`,
      `${T} rallies from ${f.comeback} down to beat ${O}`,
    ]);
  if (!f.won && f.blown >= 15) return pick('collapse', [`${T} blows ${f.blown}-point lead, falls to ${O}`, `${O} storms back from ${f.blown} down to beat ${T}`]);
  if (f.res.ot)
    return f.won
      ? pick('ot', [`${T} outlasts ${O} in ${otWord(f.res.ot)}`, `${T} takes ${O} in ${otWord(f.res.ot)}, ${score}`, `${H} carries ${T} through ${otWord(f.res.ot)}`])
      : pick('otl', [`${T} falls to ${O} in ${otWord(f.res.ot)}`, `${O} outlasts ${T} in ${otWord(f.res.ot)}`]);
  if (f.won && f.hero && f.high === 'career' && f.hero.pts >= 30)
    return pick('high', [`${H} career-high ${f.hero.pts} powers ${T} past ${O}`, `Career night: ${H} scores ${f.hero.pts} in ${T} win`]);
  if (f.won && f.hero && f.hero.pts >= 40)
    return pick('forty', [`${poss(H)} ${f.hero.pts} sinks ${O}`, `${H} scores ${f.hero.pts} as ${T} beats ${O}`, `${f.hero.pts} for ${H}, a win for ${T}`]);
  if (!f.won && f.hero && f.hero.pts >= 50) return pick('fifty-l', [`${poss(H)} ${f.hero.pts} not enough for ${T}`, `${H} scores ${f.hero.pts}, but ${T} falls to ${O}`]);
  if (!f.won && f.star && f.star.pts >= 40) return pick('forty-l', [`${poss(S)} ${f.star.pts} too much for ${T}`, `${S} scores ${f.star.pts}, ${O} beats ${T}`]);
  if (f.won && f.firstWin) return pick('first', [`First win for the new coach as ${T} beats ${O}`, `${T} beats ${O} for its new coach's first win`]);
  if (f.streak.after >= 4)
    return pick('streak', [`${T} makes it ${f.streak.after} straight`, `${f.streak.after} in a row for ${T}`, `${T} wins ${ordinal(f.streak.after)} straight, beats ${O}`]);
  if (f.won && f.streak.before <= -3) return pick('skid-end', [`${T} ends ${-f.streak.before}-game skid`, `${T} snaps ${-f.streak.before}-game losing streak against ${O}`]);
  if (f.won && f.theirStreak >= 5) return pick('their-end', [`${T} ends ${poss(O)} ${f.theirStreak}-game win streak`, `${T} stops ${O} after ${f.theirStreak} straight wins`]);
  if (f.streak.after <= -4)
    return pick('skid', [`${T} drops ${ordinal(-f.streak.after)} straight`, `Losing streak hits ${-f.streak.after} for ${T}`, `${T} skid reaches ${-f.streak.after}`]);
  if (!f.won && f.streak.before >= 4) return pick('streak-end', [`${O} snaps ${poss(T)} ${f.streak.before}-game win streak`, `${poss(T)} streak ends at ${f.streak.before}`]);
  if (f.won && f.chance !== undefined && f.chance < 0.3)
    return pick('upset', [`${T} stuns ${O}`, `${T} upsets ${f.theirRec[0]}-${f.theirRec[1]} ${O}`, `Underdog ${T} beats ${O} ${where}`]);
  if (!f.won && f.chance !== undefined && f.chance > 0.75) return pick('upset-l', [`${O} stuns ${T}`, `${T} upset by ${O}`]);
  if (f.won && f.margin >= 25) return pick('rout', [`${T} routs ${O} by ${f.margin}`, `${T} blows out ${O}, ${score}`, `${T} runs ${O} off the floor`]);
  if (!f.won && f.margin >= 20) return pick('routl', [`${O} routs ${T}, ${score}`, `${T} routed by ${O}`]);
  if (f.won && f.hero && f.hero.pts >= 30 && tripleDouble(f.hero)) return pick('tdbl', [`${poss(H)} triple-double leads ${T} past ${O}`]);
  if (f.won && f.opening) return pick('open', [`${T} opens the season with a win over ${O}`, `${T} wins on opening night, ${score}`]);
  if (f.won && f.christmas) return pick('xmas', [`${T} takes Christmas from ${O}`, `A Christmas win for ${T} over ${O}`]);
  if (f.won)
    return f.margin <= 5
      ? pick('close', [`${T} holds off ${O}, ${score}`, `${T} edges ${O} ${where}`, `${H} helps ${T} hold off ${O}`])
      : pick('win', [`${T} beats ${O} ${score}`, `${H} leads ${T} past ${O}`, `${T} handles ${O} ${where}`, `${T} tops ${O} behind ${H}`]);
  return f.margin <= 5
    ? pick('closel', [`${O} holds off ${T}, ${score}`, `${T} comes up short against ${O}`, `${O} edges ${T} ${where}`])
    : pick('loss', [`${T} falls to ${O} ${score}`, `${O} beats ${T}`, `${T} drops one to ${O}`, `${S} leads ${O} past ${T}`]);
}

// ---------------------------------------------------------------- the dek, the means, the body

/** "34 pts · 8 reb · 6 ast · 12-20 FG", with steals and blocks when there were plenty. */
export function heroLineText(b: BoxLine): string {
  return [`${b.pts} pts`, `${reb(b)} reb`, `${b.ast} ast`, ...(b.stl >= 4 ? [`${b.stl} stl`] : []), ...(b.blk >= 4 ? [`${b.blk} blk`] : []), `${madeAtt(b.fgm, b.fga)} FG`].join(
    ' · ',
  );
}

/** His night in words: "34 points, 8 rebounds and 6 assists", "a triple-double: 21 points, 12 rebounds and 10 assists". */
function nightWords(b: BoxLine): string {
  const td = tripleDouble(b);
  // (the rebounds and assists when there were a few: "29 points and 10 assists", not "0 rebounds")
  const parts = [
    plural(b.pts, 'point'),
    ...(td || reb(b) >= 5 ? [plural(reb(b), 'rebound')] : []),
    ...(td || b.ast >= 5 ? [plural(b.ast, 'assist')] : []),
    ...(b.stl >= 5 ? [plural(b.stl, 'steal')] : []),
    ...(b.blk >= 5 ? [plural(b.blk, 'block')] : []),
  ];
  const words = andList(parts);
  return td ? `a triple-double: ${words}` : words;
}

/** Where it was: "at Madison Square Garden", "in Boston", "on a neutral floor in Las Vegas". */
const venue = (f: Facts) => (f.neutral ? 'in Las Vegas' : f.arena ? `at ${f.arena}` : f.home ? 'at home' : `in ${f.foe.region}`);

/** "on the iso you called for him", "on the Chicago you called for Bane": the play you called that a late basket came on, `who` having scored it. */
function onCall(f: Facts, who?: BoxLine): string {
  const c = f.called!;
  return `on ${c.play} you called${c.for ? ` for ${c.for.pid === who?.pid ? 'him' : f.name(c.for)}` : ''}`;
}

/** "The iso you called for Bane tied it with 2 seconds left in regulation.": a play you called that tied it for overtime. */
function tiedOnCall(f: Facts): string | undefined {
  const c = f.called;
  if (c?.how !== 'tied') return undefined;
  const when = c.secs <= BUZZER ? 'at the buzzer' : `with ${plural(Math.max(1, Math.round(c.secs)), 'second')} left`;
  return `${c.play.charAt(0).toUpperCase()}${c.play.slice(1)} you called${c.for ? ` for ${f.name(c.for)}` : ''} tied it ${when} ${c.q === 4 ? 'in regulation' : `in ${periodWord(c.q - 1)}`}.`;
}

function dekOf(league: League, f: Facts, cat: string): string {
  const rng = worldRng(league, 'story-dek', f.res.gid);
  const T = teamCity(league, f.team);
  const O = teamCity(league, f.foe);
  const out: string[] = [];
  // the record its headline leads with: what it beat
  if (cat.startsWith('rec-') && f.record) {
    const rc = f.record;
    // (a real league's book reaches back to 1996-97: a league record says whether it's the most ever)
    const since = league.records ? seasonLabel(bookFrom(league.records)) : '';
    const most = rc.team ? (rc.stat === 'margin' ? 'the biggest win' : `the most ${rc.stat === 'pts' ? 'points' : 'threes'}`) : `the most ${REC_LABEL[rc.stat as RecStat][1]}`;
    const where =
      rc.scope === 'league' ? `in a game ${recordReach(league, { book: 'reg', stat: rc.stat, team: rc.team, v: rc.v }, f.res.season)}` : `in a game for ${T} since ${since}`;
    const prev =
      rc.prev && rc.prev.v < rc.v ? ` The old mark was ${rc.prev.v}, by ${rc.prev.name}${rc.prev.season !== f.res.season ? ` in ${seasonLabel(rc.prev.season)}` : ''}.` : '';
    out.push(rc.who ? `${f.full(rc.who)} had ${nightWords(rc.who)}: ${most} ${where}.${prev}` : `${most.replace(/^./, (c) => c.toUpperCase())} ${where}.`);
    return out.join(' ');
  }
  const h = f.hero;
  if (h) {
    const n = f.full(h);
    const fg = `${madeAtt(h.fgm, h.fga)} shooting`;
    const high = f.high === 'career' ? ', a career high' : f.high === 'season' ? ', his season high' : '';
    out.push(
      f.won
        ? rng.pick([`${n} had ${nightWords(h)}${high}.`, `${n} scored ${h.pts} on ${fg}${high}.`, `${n} led the way with ${nightWords(h)}.`])
        : rng.pick([`${n} had ${nightWords(h)} for ${T}.`, `${n} scored ${h.pts} in the loss.`]),
    );
  }
  const d = f.decider;
  const s = f.series;
  // the play you called, when it won it (the shot that won it came on it) or tied it for overtime
  const onIt = d?.ours && f.called?.how === 'won';
  const tie = tiedOnCall(f);
  if (d && d.who && (d.secs <= 12 || onIt))
    out.push(
      `${f.name(d.who)} put ${d.ours ? 'them' : O} ahead with ${d.buzzer ? 'no time' : plural(Math.max(1, Math.round(d.secs)), 'second')} left${onIt ? `, ${onCall(f, d.who)}` : ''}.`,
    );
  else if (tie) out.push(tie);
  else if (f.won && f.comeback >= 12) out.push(`${T} trailed by ${f.comeback} ${venue(f)}.`);
  else if (!f.won && f.blown >= 12) out.push(`They led by ${f.blown}.`);
  else if (s)
    out.push(
      s.w === 4 || s.l === 4
        ? `${s.label}, ${Math.max(s.w, s.l)}-${Math.min(s.w, s.l)}.`
        : `${s.label}: ${s.w === s.l ? `tied ${s.w}-${s.l}` : s.w > s.l ? `they lead ${s.w}-${s.l}` : `they trail ${s.l}-${s.w}`}.`,
    );
  else if (f.opening) out.push(`Opening night ${venue(f)}.`);
  else if (f.christmas) out.push(`Christmas Day ${venue(f)}.`);
  else if (f.won && f.streak.after >= 3 && cat !== 'streak') out.push(`Their ${ordinal(f.streak.after)} straight win, ${venue(f)}.`);
  else if (f.star && !f.won && f.star.pts >= 20 && !cat.startsWith('forty')) out.push(`${f.full(f.star)} had ${f.star.pts} for ${O}.`);
  else if (f.turn) out.push(f.won ? `They won the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l}.` : `${O} won the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l}.`);
  return out.join(' ');
}

const CLINCH = { x: 'Clinched a playoff spot', p: 'Clinched a play-in spot', e: 'Eliminated from the postseason' } as const;

function meansOf(league: League, f: Facts): string[] {
  const out: string[] = [];
  const s = f.series;
  if (s)
    out.push(
      s.w === 4
        ? s.round === 4
          ? 'Champions'
          : `Won the series ${s.w}-${s.l}`
        : s.l === 4
          ? `Lost the series ${s.l}-${s.w}`
          : s.w === s.l
            ? `Series tied ${s.w}-${s.l}`
            : s.w > s.l
              ? `Lead the series ${s.w}-${s.l}`
              : `Trail the series ${s.l}-${s.w}`,
    );
  if (f.playIn)
    out.push(
      f.won
        ? f.playIn.endsWith('-910')
          ? 'Through to the game for the 8th seed'
          : `In the playoffs as the ${f.playIn.endsWith('-78') ? '7th' : '8th'} seed`
        : f.playIn.endsWith('-78')
          ? 'One more chance for the 8th seed'
          : 'Season over',
    );
  // a series won against the franchise's history in this save: a dynasty, or a drought ended
  if (s && s.w === 4 && f.res.season === league.season) {
    const h = s.round === 4 ? titleLine(league, f.tid, f.res.season, true) : droughtLine(league, f.tid, f.res.season, s.round + 1);
    if (h) out.push(h.charAt(0).toUpperCase() + h.slice(1));
  }
  const st = f.res.stakes?.tid === f.tid ? f.res.stakes : undefined;
  if (st?.after.clinched && st.after.clinched !== st.before.clinched) out.push(CLINCH[st.after.clinched]);
  if (st && f.rec[0] + f.rec[1] >= 10) {
    const c = confWord(f.team.conf);
    if (st.after.rank < st.before.rank) out.push(`Up to ${ordinal(st.after.rank)} in the ${c}`);
    else if (st.after.rank > st.before.rank) out.push(`Down to ${ordinal(st.after.rank)} in the ${c}`);
    else if (st.after.rank === 1) out.push(`Still 1st in the ${c}`);
  }
  const { before, after } = f.streak;
  if (f.res.type === 'regular') {
    if (f.won && before <= -3) out.push(`Ended ${an(-before)} ${-before}-game skid`);
    else if (!f.won && before >= 3) out.push(`Ended ${an(before)} ${before}-game win streak`);
    else if (after >= 2) out.push(`${ordinal(after)} straight win`);
    else if (after <= -2) out.push(`${ordinal(-after)} straight loss`);
  }
  if (f.firstWin) out.push('First win in charge');
  if (f.hero && f.high) out.push(`${f.high === 'career' ? 'Career' : 'Season'} high for ${f.name(f.hero)}: ${f.hero.pts}`);
  if (f.res.season === league.season) {
    for (const m of milestonesIn(league, f.res)
      .filter((x) => x.tid === f.tid)
      .slice(0, 1)) {
      const b = f.us.players.find((x) => x.pid === m.pid);
      if (b) out.push(`${poss(f.name(b))} ${markText(m.stat, m.mark)}`);
    }
    for (const r of recordsHeld(league, f.res)
      .filter((x) => x.tid === f.tid)
      .slice(0, 1))
      out.push(`${r.scope === 'league' ? 'League' : 'Franchise'} record: ${recordWhat(r)}`);
  }
  if (f.opening && f.won) out.push('1-0 to start');
  return out.slice(0, 4);
}

function bodyOf(league: League, f: Facts, means: string[]): string {
  const rng = worldRng(league, 'story-body', f.res.gid);
  const T = teamCity(league, f.team);
  const O = teamCity(league, f.foe);
  const hi = Math.max(f.us.pts, f.them.pts);
  const lo = Math.min(f.us.pts, f.them.pts);
  const ot = f.res.ot ? ` in ${otWord(f.res.ot)}` : '';
  const when = f.opening ? ' on opening night' : f.christmas ? ' on Christmas Day' : f.homeOpener ? ' in their home opener' : '';
  const paras: string[] = [];
  // the lede: the result, where, and how it went
  const lede = f.won
    ? rng.pick([`${T} beat ${O} ${hi}-${lo}${ot} ${venue(f)}${when}.`, `${T} won ${hi}-${lo}${ot} over ${O} ${venue(f)}${when}.`])
    : rng.pick([`${T} lost ${hi}-${lo}${ot} to ${O} ${venue(f)}${when}.`, `${O} beat ${T} ${hi}-${lo}${ot} ${venue(f)}${when}.`]);
  const how: string[] = [];
  if (f.turn && f.margin >= 8)
    how.push(f.won ? `They won the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l} and were not caught.` : `${O} took the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l}.`);
  else if (f.margin <= 5 && !f.decider) how.push(rng.pick(['It was close to the end.', 'Neither side pulled away.']));
  paras.push([lede, ...how].join(' '));
  // the hero, the help and their best
  const h = f.hero;
  if (h) {
    const high = f.high === 'career' ? ', a career high,' : f.high === 'season' ? ', a season high,' : '';
    const lines = [
      f.won
        ? `${f.full(h)} led them with ${plural(h.pts, 'point')}${high} on ${madeAtt(h.fgm, h.fga)} shooting. He had ${plural(reb(h), 'rebound')} and ${plural(h.ast, 'assist')}.`
        : `${f.full(h)} had ${nightWords(h)} for ${T}.`,
    ];
    if (f.second && f.second.pts >= 12) lines.push(`${f.name(f.second)} added ${f.second.pts}.`);
    if (f.star && f.star.pts >= 20) lines.push(`${f.full(f.star)} scored ${f.star.pts} for ${O}.`);
    paras.push(lines.join(' '));
  }
  // the turning point: the shot that won it, the comeback, the collapse or the run
  const d = f.decider;
  const turn: string[] = [];
  const tie = tiedOnCall(f);
  if (tie) turn.push(tie);
  if (d) {
    const who = d.who ? f.full(d.who) : d.ours ? T : O;
    const what = d.ft ? 'free throws' : d.three ? 'a three' : 'a basket';
    const call = d.ours && f.called?.how === 'won' ? `, ${onCall(f, d.who)}` : '';
    turn.push(`${who} won it with ${what} ${d.buzzer ? 'at the buzzer' : `with ${plural(Math.max(1, Math.round(d.secs)), 'second')} left`}${call}.`);
  }
  if (f.won && f.comeback >= 10) turn.push(`${T} came back from ${f.comeback} points down.`);
  if (!f.won && f.blown >= 10) turn.push(`${T} had led by ${f.blown}.`);
  if (f.run && !d) turn.push(`${f.run.ours ? T : O} put it away with a ${f.run.pts}-0 run in the ${periodWord(f.run.q - 1)}.`);
  if (turn.length) paras.push(turn.join(' '));
  // what it means
  const reg = f.res.type === 'regular';
  const mean: string[] = [];
  if (reg) mean.push(`${T} is ${f.rec[0]}-${f.rec[1]}.`);
  if (means.length) mean.push(`${means.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join('. ')}.`);
  // the next game, for the latest one
  const latest = league.games.filter((g) => g.home.tid === f.tid || g.away.tid === f.tid).at(-1)?.gid === f.res.gid;
  if (latest) {
    const next = league.schedule
      .filter((g) => !g.played && g.type !== 'allstar' && g.day > f.res.day && (g.home === f.tid || g.away === f.tid))
      .sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
    if (next) {
      const opp = teamCity(league, next.home === f.tid ? next.away : next.home);
      mean.push(`Next: ${next.home === f.tid ? 'home to' : 'at'} ${opp}, ${fmtDate(league.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })}.`);
    }
  }
  if (mean.length) paras.push(mean.join(' '));
  // a night these two remember on this date, a round number of years ago (the league's memory)
  if (reg) {
    const ann = anniversaryOf(league, { home: f.res.home.tid, away: f.res.away.tid, day: f.res.day }, f.res.season);
    if (ann) paras.push(ann.line);
  }
  return paras.join('\n\n');
}

/**
 * How big a night it was, for the news and the result's presentation. The front page (3) stops a
 * long sim and can take the screen, so it's rare: a handful of regular-season nights (a win on opening night,
 * a 60-point or career-high 50-point night, a 10-game win streak and every five after, a win at the
 * buzzer, from 20 down or as a 15% underdog, a rivalry game in the run-in with both sides in the
 * race, a playoff spot clinched or lost for good, a league record) and the playoffs' huge ones (a series won or
 * lost, a Game 7, the title, getting in or going out in the play-in, the Cup final). Everything else
 * notable is a story (2).
 */
function weightOf(f: Facts, means: string[]): 1 | 2 | 3 {
  const s = f.series;
  const h = f.hero;
  const pi = f.playIn;
  const stakes = f.res.stakes?.tid === f.tid ? f.res.stakes : undefined;
  const clinched = !!stakes?.after.clinched && stakes.after.clinched !== stakes.before.clinched;
  const big =
    (s && (s.w === 4 || s.l === 4 || s.w + s.l === 7)) ||
    (pi && (f.won ? !pi.endsWith('-910') : !pi.endsWith('-78'))) ||
    f.res.cup === 'final' ||
    f.res.type === 'cup' ||
    // (opening night's front page is a win: a loss that night is a story)
    (f.opening && f.won) ||
    (h && (h.pts >= 60 || (h.pts >= 50 && f.high === 'career'))) ||
    (f.streak.after >= 10 && f.streak.after % 5 === 0) ||
    // a win at the horn or from 20 down, and one as a big underdog (15% or less at tip-off)
    (f.won && (f.decider?.buzzer || f.comeback >= 20)) ||
    // a rivalry game when it mattered: the run-in (60 games played), both sides in the postseason race
    (f.rivalry.hot && f.res.type === 'regular' && f.rec[0] + f.rec[1] >= 60 && !!stakes && stakes.after.rank <= 10 && f.theirRank > 0 && f.theirRank <= 10) ||
    (f.won && f.res.type === 'regular' && f.chance !== undefined && f.chance <= 0.15) ||
    // (once a season at most: in the playoffs for sure, or out of them)
    (clinched && (stakes!.after.clinched === 'x' || stakes!.after.clinched === 'e')) ||
    means.some((m) => m.startsWith('League record'));
  if (big) return 3;
  const story =
    !!s ||
    !!pi ||
    !!f.decider ||
    f.res.ot > 0 ||
    f.comeback >= 12 ||
    f.blown >= 15 ||
    (h && (h.pts >= 40 || f.high === 'career' || tripleDouble(h))) ||
    Math.abs(f.streak.after) >= 5 ||
    (f.won && f.streak.before <= -5) ||
    (!f.won && f.streak.before >= 5) ||
    clinched ||
    f.firstWin ||
    f.christmas ||
    f.rivalry.hot ||
    (f.chance !== undefined && (f.won ? f.chance < 0.3 : f.chance > 0.75)) ||
    f.margin >= 30 ||
    f.homeOpener ||
    (!!f.res.cup && f.res.cup !== 'group') ||
    means.some((m) => /career \w+$|record:/.test(m));
  return story ? 2 : 1;
}

/** The occasion over the headline. */
function kickerOf(f: Facts): string | undefined {
  const s = f.series;
  if (s) return s.w + s.l === 7 ? 'Game 7' : `${s.label} · Game ${s.w + s.l}`;
  if (f.playIn) return 'Play-In';
  if (f.res.cup === 'final' || f.res.type === 'cup') return 'In-Season Cup final';
  if (f.res.cup && f.res.cup !== 'group') return `In-Season Cup ${f.res.cup === 'sf' ? 'semifinal' : 'quarterfinal'}`;
  if (f.opening) return f.res.day === 0 ? 'Opening night' : 'Season opener';
  if (f.christmas) return 'Christmas Day';
  if (f.rivalry.hot) return 'Rivalry night';
  if (f.homeOpener) return 'Home opener';
  if (f.res.cup === 'group') return 'In-Season Cup';
  return undefined;
}

/** The story of a finished game (`gid`) from `tid`'s side (the user's team by default), or null if it isn't on record. */
export function gameStoryFor(league: League, gid: number, tid = league.userTid): GameStory | null {
  const res = findResult(league, gid);
  if (!res) return null;
  const f = factsOf(league, res, tid);
  if (!f) return null;
  const { cat, head } = headline(league, f);
  const means = meansOf(league, f);
  const story: GameStory = {
    gid,
    head,
    dek: dekOf(league, f, cat),
    ...(f.hero ? { hero: f.hero.pid, heroLine: heroLineText(f.hero) } : {}),
    means: means.filter((m) => !SAID_BY[cat]?.test(m)),
    kicker: kickerOf(f),
    weight: weightOf(f, means),
    body: bodyOf(league, f, means),
    won: f.won,
  };
  // the press's story of it, as it ran: the headline the news printed is the game's
  if (tid === league.userTid) {
    const n = newsOf(league, res);
    if (n) {
      story.newsId = n.id;
      if (n.head) story.head = n.head;
      story.dek = n.text;
    }
  }
  return story;
}

/** What a headline's category already says, so its line under it isn't said twice ("Wizards end 4-game skid" over "Ended a 4-game skid"). */
const SAID_BY: Record<string, RegExp> = {
  streak: /straight win$/,
  'skid-end': /-game skid$/,
  skid: /straight loss$/,
  'streak-end': /-game win streak$/,
  high: /^Career high for /,
  open: /^1-0 to start$/,
};

/** The result of `gid`: the last of `league.games` with it (a replayed result replaces none, but be safe). */
function findResult(league: League, gid: number): GameResult | undefined {
  for (let i = league.games.length - 1; i >= 0; i--) if (league.games[i].gid === gid) return league.games[i];
  return undefined;
}

/** The game story the press ran for a result of the user's: its day, its teams. */
function newsOf(league: League, res: GameResult) {
  for (let i = league.news.length - 1; i >= 0; i--) {
    const n = league.news[i];
    if (n.season < res.season || (n.season === res.season && n.day < res.day)) break;
    if (n.kind === 'game' && n.season === res.season && n.day === res.day && n.tids[0] === league.userTid && n.tids.includes(res.home.tid) && n.tids.includes(res.away.tid))
      return n;
  }
  return undefined;
}

/** After every game: the user's games go in the news as stories (other teams' games are the press's, media.ts). */
export function storyGame(league: League, g: ScheduledGame) {
  const me = league.userTid;
  if (g.home !== me && g.away !== me) return;
  const res = findResult(league, g.gid);
  if (!res) return;
  const story = gameStoryFor(league, g.gid, me);
  if (!story || story.newsId !== undefined) return;
  const opp = res.home.tid === me ? res.away.tid : res.home.tid;
  addNews(league, {
    kind: 'game',
    head: story.head,
    text: story.dek,
    body: story.body,
    tids: [me, opp],
    pids: story.hero !== undefined ? [story.hero] : [],
    weight: story.weight,
  });
  // (dated the night it was played, whenever it's written: the report finds it by that)
  const n = league.news.at(-1);
  if (n?.kind === 'game') n.day = res.day;
}

// ---------------------------------------------------------------- rivalries

/** A rivalry's intensity at which a game is billed as one. */
export const RIVALRY = 2.5;

/** Rivalries as old as the league (a small head start: history in the save does the rest). */
const CLASSIC = new Set([
  'BOS-LAL',
  'BOS-NYK',
  'BOS-PHI',
  'BKN-NYK',
  'LAC-LAL',
  'CHI-DET',
  'MIA-NYK',
  'CLE-GSW',
  'DAL-SAS',
  'HOU-SAS',
  'BOS-DET',
  'CHI-NYK',
  'LAL-SAS',
  'GSW-LAL',
  'DEN-LAL',
]);

/**
 * The real league's recent playoff history (the 2025 playoffs, 2024-25), by pair: the winner, the
 * series and the tally. A real league opens without any of its own, so these carry the heat of the
 * first seasons, fading as its own history builds (see `realSeries`).
 */
const REAL_SERIES: Record<string, { season: number; winner: string; label: string; tally: string }> = {
  'CLE-MIA': { season: 2024, winner: 'CLE', label: 'East First Round', tally: '4-0' },
  'IND-MIL': { season: 2024, winner: 'IND', label: 'East First Round', tally: '4-1' },
  'DET-NYK': { season: 2024, winner: 'NYK', label: 'East First Round', tally: '4-2' },
  'BOS-ORL': { season: 2024, winner: 'BOS', label: 'East First Round', tally: '4-1' },
  'CLE-IND': { season: 2024, winner: 'IND', label: 'East Semifinals', tally: '4-1' },
  'BOS-NYK': { season: 2024, winner: 'NYK', label: 'East Semifinals', tally: '4-2' },
  'IND-NYK': { season: 2024, winner: 'IND', label: 'East Finals', tally: '4-2' },
  'MEM-OKC': { season: 2024, winner: 'OKC', label: 'West First Round', tally: '4-0' },
  'GSW-HOU': { season: 2024, winner: 'GSW', label: 'West First Round', tally: '4-3' },
  'DEN-LAC': { season: 2024, winner: 'DEN', label: 'West First Round', tally: '4-3' },
  'LAL-MIN': { season: 2024, winner: 'MIN', label: 'West First Round', tally: '4-1' },
  'DEN-OKC': { season: 2024, winner: 'OKC', label: 'West Semifinals', tally: '4-3' },
  'GSW-MIN': { season: 2024, winner: 'MIN', label: 'West Semifinals', tally: '4-1' },
  'MIN-OKC': { season: 2024, winner: 'OKC', label: 'West Finals', tally: '4-1' },
  'IND-OKC': { season: 2024, winner: 'OKC', label: 'Finals', tally: '4-3' },
};

/** A real league's series from REAL_SERIES between `a` and `b`, with its heat: 2½ in the league's first season, 1½ in its second, then none. */
function realSeries(league: League, a: Team, b: Team) {
  if (league.careersFrom === undefined) return null;
  const s = REAL_SERIES[[a.abbrev, b.abbrev].sort().join('-')];
  const heat = s ? [2.5, 1.5][league.season - s.season - 2] : undefined;
  return s && heat ? { ...s, heat } : null;
}

export interface Rivalry {
  /** How hot: division rivals ½, a classic 1, a playoff meeting 3 (4 to seven games), three close games or more ½ each, up to 2½. */
  score: number;
  /**
   * Billed as a rivalry: RIVALRY or more with real heat behind it (a playoff series, or three close
   * meetings or more: a name alone isn't enough), and both teams worth the billing (neither a bad
   * team, unless they met in the playoffs).
   */
  hot: boolean;
  /** Why, from `a`'s side, most telling first ("Boston knocked you out of last season's East Semifinals"). */
  reasons: string[];
}

const rivalryCache = new WeakMap<GameResult[], { n: number; map: Map<string, Rivalry> }>();

/** How much of a rivalry `a` and `b` have, from the stored results (this season's and last) and the current playoffs; reasons from `a`'s side. */
export function rivalryOf(league: League, a: number, b: number): Rivalry {
  let c = rivalryCache.get(league.games);
  if (!c || c.n !== league.games.length) rivalryCache.set(league.games, (c = { n: league.games.length, map: new Map() }));
  const key = `${a}-${b}-${league.playoffs.length}`;
  const hit = c.map.get(key);
  if (hit) return hit;
  const r = rivalry0(league, a, b);
  c.map.set(key, r);
  return r;
}

function rivalry0(league: League, a: number, b: number): Rivalry {
  const ta = league.teams[a];
  const tb = league.teams[b];
  let score = 0;
  let heat = 0;
  let playoff = false;
  const reasons: { text: string; w: number }[] = [];
  const you = a === league.userTid;
  const division = ta.div === tb.div && ta.conf === tb.conf;
  const classic = CLASSIC.has([ta.abbrev, tb.abbrev].sort().join('-'));
  score += (division ? 0.5 : 0) + (classic ? 1 : 0);
  if (division || classic) reasons.push({ text: division && classic ? 'An old division rivalry' : classic ? 'An old rivalry' : 'Division rivals', w: 1 });
  // playoff series: last season's from the stored results, this season's from the bracket
  const meet = (g: GameResult) => (g.home.tid === a && g.away.tid === b) || (g.home.tid === b && g.away.tid === a);
  const last = league.games.filter((g) => g.season === league.season - 1 && g.type === 'playoffs' && meet(g));
  if (last.length && last[0].seriesId) {
    const sn = seriesName(last[0].seriesId);
    const wa = last.filter((g) => (g.home.pts > g.away.pts ? g.home.tid : g.away.tid) === a).length;
    const wb = last.length - wa;
    if (sn && Math.max(wa, wb) === 4) {
      heat += 3 + (last.length === 7 ? 1 : 0);
      playoff = true;
      const aWon = wa === 4;
      const tally = `${Math.max(wa, wb)}-${Math.min(wa, wb)}`;
      reasons.push({
        text: you
          ? aWon
            ? `You knocked them out of last season's ${sn.label}, ${tally}`
            : `They knocked you out of last season's ${sn.label}, ${tally}`
          : `${teamCity(league, aWon ? ta : tb)} won last season's ${sn.label}, ${tally}`,
        w: 5,
      });
    }
  }
  // (in a real league's first seasons, the real playoffs before it began)
  const real = playoff ? null : realSeries(league, ta, tb);
  if (real) {
    heat += real.heat + (real.tally.endsWith('3') ? 0.5 : 0);
    playoff = true;
    const [w, l] = real.winner === ta.abbrev ? [ta, tb] : [tb, ta];
    reasons.push({ text: `${teamCity(league, w)} beat ${teamCity(league, l)} in the ${real.season + 1} ${real.label}, ${real.tally}`, w: 4 });
  }
  // older playoff series, from the league's memory (the chronicle keeps every one): a little less each year back
  for (const m of meetings(league, a, b)) {
    const ago = league.season - m.season;
    if (ago < 2 || ago > 5) continue;
    heat += ago === 2 ? 2 : ago === 3 ? 1.5 : 1;
    playoff = true;
    const sn = ['', 'first round', 'second round', 'conference finals', 'Finals'][m.round] ?? 'playoffs';
    reasons.push({ text: `${teamCity(league, m.won ? ta : tb)} won the ${seasonLabel(m.season)} ${sn}, ${Math.max(m.w, m.l)}-${Math.min(m.w, m.l)}`, w: 4 - ago / 5 });
  }
  for (const s of league.playoffs) {
    if (!([s.high, s.low].includes(a) && [s.high, s.low].includes(b)) || s.winner === undefined) continue;
    const sn = seriesName(s.id);
    heat += 3;
    playoff = true;
    const tally = `${Math.max(s.highWins, s.lowWins)}-${Math.min(s.highWins, s.lowWins)}`;
    reasons.push({ text: `${teamCity(league, s.winner === a ? ta : tb)} won this season's ${sn?.label ?? 'series'}, ${tally}`, w: 5 });
  }
  // close games: within five points or to overtime, in the meetings on record
  let close = 0;
  let n = 0;
  for (const g of league.games) {
    if (g.season < league.season - 1 || !meet(g) || g.type === 'allstar') continue;
    n++;
    if (Math.abs(g.home.pts - g.away.pts) <= 5 || g.ot) close++;
  }
  if (close >= 3) {
    heat += Math.min(2.5, close * 0.5);
    reasons.push({ text: `${close} of the last ${n} meetings were within five points`, w: 3 });
  }
  score += heat;
  // a bad team (under .400 ten games in, or last season before then) isn't a rival worth billing
  const decent = (t: Team) => {
    for (const season of [league.season, league.season - 1]) {
      const ts = t.seasons.find((x) => x.season === season);
      if (ts && ts.won + ts.lost >= 10) return ts.won / (ts.won + ts.lost) >= 0.4;
    }
    return true;
  };
  const hot = score >= RIVALRY && heat >= 1.5 && (playoff || (decent(ta) && decent(tb)));
  return { score, hot, reasons: reasons.sort((x, y) => y.w - x.w).map((x) => x.text) };
}

// ---------------------------------------------------------------- billing

/** The press's stories of the user's games, by "season-day" (one game a day): for marking the big nights in a schedule. */
export function userGameNews(league: League): Map<string, NewsItem> {
  const out = new Map<string, NewsItem>();
  for (const n of league.news) if (n.kind === 'game' && n.tids[0] === league.userTid) out.set(`${n.season}-${n.day}`, n);
  return out;
}
