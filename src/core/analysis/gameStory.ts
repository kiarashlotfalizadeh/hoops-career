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
import { addNews, andList, dateToDay, fmtDate, playerName } from '../league/helpers';
import { seasonLabel } from '../constants';
import { madeAtt, ordinal, plural } from '../format';
import { FRANCHISES } from '../teams';
import { careerTotals, markText, milestonesIn, newsworthy, type MilestoneStat } from './milestones';
import { recordsHeld, recordWhat } from '../league/records';
import { winChance } from './projection';
import { billingStorylines } from './storylines';

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
/** "Knicks'", "Heat's": a nickname's possessive. */
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
  const label = round === 4 ? 'NBA Finals' : round === 3 ? `${c} Finals` : round === 2 ? `${c} Semifinals` : `${c} First Round`;
  const next = round === 4 ? 'title' : round === 3 ? 'NBA Finals' : round === 2 ? `${c} Finals` : `${c} Semifinals`;
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

/** His regular-season career highs cover his whole career: every season he has played is one in this league. */
function highsWhole(league: League, p: Player) {
  return p.stats.every((s) => s.gp === 0 || s.season >= league.startSeason) && careerTotals(p).gp >= 15;
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
  return {
    res,
    tid,
    us,
    them,
    team,
    foe,
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
  const T = f.team.name;
  const O = f.foe.name;
  const hi = Math.max(f.us.pts, f.them.pts);
  const lo = Math.min(f.us.pts, f.them.pts);
  const score = `${hi}-${lo}`;
  const H = f.hero ? f.name(f.hero) : T;
  const S = f.star ? f.name(f.star) : O;
  const city = f.home ? 'at home' : f.neutral ? 'in Las Vegas' : `in ${f.foe.region}`;
  const pick = (cat: string, list: string[]) => ({ cat, head: rotate(league, f, cat, list) });
  const s = f.series;
  const shot = (d: Decider) => (d.ft ? 'free throws' : d.three ? 'three' : 'shot');

  if (s) {
    const n = s.w + s.l;
    if (f.won) {
      if (s.w === 4 && s.round === 4) return pick('s-title', [`${T} are champions`, `${T} win the title in ${n}`, `${T} finish off ${O} for the championship`]);
      if (s.w === 4 && n === 7) return pick('s-g7w', [`${T} win Game 7, beat ${O}`, `Game 7 goes to the ${T}`, `${H} carries ${T} through Game 7`]);
      if (s.w === 4) return pick('s-close', [`${T} close out ${O} in ${n}`, `${T} finish off ${O}, reach the ${s.next}`, `${T} past ${O} in ${n} games`]);
      if (s.w === 3 && s.l === 3) return pick('s-force7', [`${T} force Game 7`, `${T} stay alive, force Game 7 against ${O}`]);
      if (s.l === 3) return pick('s-alive', [`${T} stay alive, trail ${O} ${s.l}-${s.w}`, `${T} avoid elimination in Game ${n}`]);
      if (s.w === 3) return pick('s-3', [`${T} take ${s.w}-${s.l} lead, one win from the ${s.next}`, `${T} move within a win of the ${s.next}`]);
      if (s.w === s.l) return pick('s-even', [`${T} even the series with ${O} at ${s.w}-${s.l}`, `${T} level the ${s.label} at ${s.w}`]);
      if (s.w > s.l) return pick('s-lead', [`${T} take ${s.w}-${s.l} lead over ${O}`, `${T} go up ${s.w}-${s.l} on ${O}`]);
      return pick('s-cut', [`${T} win Game ${n}, cut ${poss(O)} lead to ${s.l}-${s.w}`, `${T} get one back on ${O}, trail ${s.l}-${s.w}`]);
    }
    if (s.l === 4 && s.round === 4) return pick('s-titlel', [`${O} beat ${T} for the title`, `${T} fall short in the Finals`]);
    if (s.l === 4 && n === 7) return pick('s-g7l', [`${T} lose Game 7 to ${O}`, `${poss(T)} season ends in Game 7`]);
    if (s.l === 4) return pick('s-out', [`${O} end ${poss(T)} season`, `${T} eliminated by ${O} in ${n}`, `Season over: ${T} fall to ${O}`]);
    if (s.l === 3 && s.w === 3) return pick('s-forced7', [`${O} force Game 7`, `${O} stay alive against ${T}`]);
    if (s.l === 3) return pick('s-brink', [`${T} one loss from elimination`, `${O} take ${s.l}-${s.w} lead on ${T}`]);
    if (s.w === s.l) return pick('s-evenl', [`${O} even the series at ${s.w}-${s.l}`, `${O} tie the ${s.label} at ${s.w}`]);
    // still ahead after a loss: a closeout missed, or a lead cut
    if (s.w === 3) return pick('s-missed', [`${O} stay alive, cut ${poss(T)} lead to ${s.w}-${s.l}`, `${T} miss first chance to close out ${O}`]);
    if (s.w > s.l) return pick('s-cutl', [`${O} win Game ${n}, trail ${T} ${s.w}-${s.l}`, `${O} get one back, ${T} lead ${s.w}-${s.l}`]);
    return pick('s-trail', [`${O} take ${s.l}-${s.w} lead on ${T}`, `${T} fall behind ${s.w}-${s.l}`]);
  }
  if (f.playIn) {
    const id = f.playIn;
    if (f.won)
      return id.endsWith('-910')
        ? pick('pi-910', [`${T} survive the play-in, play for the 8th seed`, `${T} beat ${O} to stay alive`])
        : pick('pi-in', [`${T} are in: the ${id.endsWith('-78') ? '7th' : '8th'} seed`, `${T} beat ${O}, reach the playoffs`]);
    return id.endsWith('-78')
      ? pick('pi-78l', [`${T} fall to ${O}, get one more chance`, `${O} take the 7th seed from ${T}`])
      : pick('pi-out', [`${poss(T)} season ends in the play-in`, `${O} end ${poss(T)} season`]);
  }
  if (f.res.cup && f.res.cup !== 'group') {
    const round = f.res.cup === 'final' ? 'final' : f.res.cup === 'sf' ? 'semifinal' : 'quarterfinal';
    if (f.won)
      return f.res.cup === 'final'
        ? pick('cup-win', [`${T} win the NBA Cup`, `${T} take the Cup, ${score} over ${O}`])
        : pick('cup-adv', [`${T} beat ${O}, into the Cup ${f.res.cup === 'qf' ? 'semifinals' : 'final'}`, `${T} advance in the Cup with ${score} win`]);
    return pick('cup-out', [`${O} knock ${T} out of the Cup`, `${poss(T)} Cup run ends in the ${round}`]);
  }
  const d = f.decider;
  if (d?.buzzer)
    return d.ours
      ? pick(
          'buzz',
          d.who
            ? [`${f.name(d.who)} beats the buzzer, ${T} stun ${O}`, `${f.name(d.who)} at the horn: ${T} ${score}`, `${poss(f.name(d.who))} buzzer-beater sinks ${O}`]
            : [`${T} beat ${O} at the buzzer`],
        )
      : pick('buzzl', d.who ? [`${f.name(d.who)} beats the buzzer to sink ${T}`, `Heartbreak for ${T}: ${f.name(d.who)} at the horn`] : [`${O} beat ${T} at the buzzer`]);
  if (d && d.secs <= 12)
    return d.ours
      ? pick('gw', d.who ? [`${poss(f.name(d.who))} late ${shot(d)} lifts ${T} past ${O}`, `${f.name(d.who)} wins it late for ${T}`] : [`${T} edge ${O} ${score} at the finish`])
      : pick('gwl', d.who ? [`${f.name(d.who)} wins it late for ${O}`, `${poss(f.name(d.who))} late ${shot(d)} beats ${T}`] : [`${O} edge ${T} at the finish`]);
  if (f.won && f.comeback >= 15)
    return pick('comeback', [
      `${T} erase ${f.comeback}-point deficit, beat ${O}`,
      `From ${f.comeback} down, ${T} come back on ${O}`,
      `${T} rally from ${f.comeback} down to beat ${O}`,
    ]);
  if (!f.won && f.blown >= 15) return pick('collapse', [`${T} blow ${f.blown}-point lead, fall to ${O}`, `${O} storm back from ${f.blown} down to beat ${T}`]);
  if (f.res.ot)
    return f.won
      ? pick('ot', [`${T} outlast ${O} in ${otWord(f.res.ot)}`, `${T} take ${O} in ${otWord(f.res.ot)}, ${score}`, `${H} carries ${T} through ${otWord(f.res.ot)}`])
      : pick('otl', [`${T} fall to ${O} in ${otWord(f.res.ot)}`, `${O} outlast ${T} in ${otWord(f.res.ot)}`]);
  if (f.won && f.hero && f.high === 'career' && f.hero.pts >= 30)
    return pick('high', [`${H} career-high ${f.hero.pts} powers ${T} past ${O}`, `Career night: ${H} scores ${f.hero.pts} in ${T} win`]);
  if (f.won && f.hero && f.hero.pts >= 40)
    return pick('forty', [`${poss(H)} ${f.hero.pts} sinks ${O}`, `${H} scores ${f.hero.pts} as ${T} beat ${O}`, `${f.hero.pts} for ${H}, a win for ${T}`]);
  if (!f.won && f.star && f.star.pts >= 40) return pick('forty-l', [`${poss(S)} ${f.star.pts} too much for ${T}`, `${S} scores ${f.star.pts}, ${O} beat ${T}`]);
  if (f.won && f.firstWin) return pick('first', [`First win for the new coach as ${T} beat ${O}`, `${T} beat ${O} for their new coach's first win`]);
  if (f.streak.after >= 4)
    return pick('streak', [`${T} make it ${f.streak.after} straight`, `${f.streak.after} in a row for ${T}`, `${T} win ${ordinal(f.streak.after)} straight, beat ${O}`]);
  if (f.won && f.streak.before <= -3) return pick('skid-end', [`${T} end ${-f.streak.before}-game skid`, `${T} snap ${-f.streak.before}-game losing streak against ${O}`]);
  if (f.won && f.theirStreak >= 5) return pick('their-end', [`${T} end ${poss(O)} ${f.theirStreak}-game win streak`, `${T} stop ${O} after ${f.theirStreak} straight wins`]);
  if (f.streak.after <= -4)
    return pick('skid', [`${T} drop ${ordinal(-f.streak.after)} straight`, `Losing streak hits ${-f.streak.after} for ${T}`, `${T} skid reaches ${-f.streak.after}`]);
  if (!f.won && f.streak.before >= 4) return pick('streak-end', [`${O} snap ${poss(T)} ${f.streak.before}-game win streak`, `${poss(T)} streak ends at ${f.streak.before}`]);
  if (f.won && f.chance !== undefined && f.chance < 0.3)
    return pick('upset', [`${T} stun ${O}`, `${T} upset the ${f.theirRec[0]}-${f.theirRec[1]} ${O}`, `Underdog ${T} beat ${O} ${city}`]);
  if (!f.won && f.chance !== undefined && f.chance > 0.75) return pick('upset-l', [`${O} stun ${T}`, `${T} upset by ${O}`]);
  if (f.won && f.margin >= 25) return pick('rout', [`${T} rout ${O} by ${f.margin}`, `${T} blow out ${O}, ${score}`, `${T} run ${O} off the floor`]);
  if (!f.won && f.margin >= 20) return pick('routl', [`${O} rout ${T}, ${score}`, `${T} routed by ${O}`]);
  if (f.won && f.hero && f.hero.pts >= 30 && tripleDouble(f.hero)) return pick('tdbl', [`${poss(H)} triple-double leads ${T} past ${O}`]);
  if (f.won && f.opening) return pick('open', [`${T} open the season with a win over ${O}`, `${T} win on opening night, ${score}`]);
  if (f.won && f.christmas) return pick('xmas', [`${T} take Christmas from ${O}`, `A Christmas win for ${T} over ${O}`]);
  if (f.won)
    return f.margin <= 5
      ? pick('close', [`${T} hold off ${O}, ${score}`, `${T} edge ${O} ${city}`, `${H} helps ${T} hold off ${O}`])
      : pick('win', [`${T} beat ${O} ${score}`, `${H} leads ${T} past ${O}`, `${T} handle ${O} ${city}`, `${T} top ${O} behind ${H}`]);
  return f.margin <= 5
    ? pick('closel', [`${O} hold off ${T}, ${score}`, `${T} come up short against ${O}`, `${O} edge ${T} ${city}`])
    : pick('loss', [`${T} fall to ${O} ${score}`, `${O} beat ${T}`, `${T} drop one to ${O}`, `${S} leads ${O} past ${T}`]);
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

function dekOf(league: League, f: Facts, cat: string): string {
  const rng = worldRng(league, 'story-dek', f.res.gid);
  const out: string[] = [];
  const h = f.hero;
  if (h) {
    const n = f.full(h);
    const fg = `${madeAtt(h.fgm, h.fga)} shooting`;
    const high = f.high === 'career' ? ', a career high' : f.high === 'season' ? ', his season high' : '';
    out.push(
      f.won
        ? rng.pick([`${n} had ${nightWords(h)}${high}.`, `${n} scored ${h.pts} on ${fg}${high}.`, `${n} led the way with ${nightWords(h)}.`])
        : rng.pick([`${n} had ${nightWords(h)} for the ${f.team.name}.`, `${n} scored ${h.pts} in the loss.`]),
    );
  }
  const d = f.decider;
  const s = f.series;
  if (d && d.who && d.secs <= 12)
    out.push(`${f.name(d.who)} put ${d.ours ? 'them' : 'the ' + f.foe.name} ahead with ${d.buzzer ? 'no time' : plural(Math.max(1, Math.round(d.secs)), 'second')} left.`);
  else if (f.won && f.comeback >= 12) out.push(`The ${f.team.name} trailed by ${f.comeback} ${venue(f)}.`);
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
  else if (f.star && !f.won && f.star.pts >= 20 && !cat.startsWith('forty')) out.push(`${f.full(f.star)} had ${f.star.pts} for the ${f.foe.name}.`);
  else if (f.turn) out.push(f.won ? `They won the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l}.` : `The ${f.foe.name} won the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l}.`);
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
    if (f.won && before <= -3) out.push(`Ended a ${-before}-game skid`);
    else if (!f.won && before >= 3) out.push(`Ended a ${before}-game win streak`);
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
  const T = f.team.name;
  const O = `${f.foe.region} ${f.foe.name}`;
  const hi = Math.max(f.us.pts, f.them.pts);
  const lo = Math.min(f.us.pts, f.them.pts);
  const ot = f.res.ot ? ` in ${otWord(f.res.ot)}` : '';
  const when = f.opening ? ' on opening night' : f.christmas ? ' on Christmas Day' : f.homeOpener ? ' in their home opener' : '';
  const paras: string[] = [];
  // the lede: the result, where, and how it went
  const lede = f.won
    ? rng.pick([`The ${T} beat the ${O} ${hi}-${lo}${ot} ${venue(f)}${when}.`, `The ${T} won ${hi}-${lo}${ot} over the ${O} ${venue(f)}${when}.`])
    : rng.pick([`The ${T} lost ${hi}-${lo}${ot} to the ${O} ${venue(f)}${when}.`, `The ${O} beat the ${T} ${hi}-${lo}${ot} ${venue(f)}${when}.`]);
  const how: string[] = [];
  if (f.turn && f.margin >= 8)
    how.push(
      f.won ? `They won the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l} and were not caught.` : `The ${f.foe.name} took the ${periodWord(f.turn.i)} ${f.turn.w}-${f.turn.l}.`,
    );
  else if (f.margin <= 5 && !f.decider) how.push(rng.pick(['It was close to the end.', 'Neither side pulled away.']));
  paras.push([lede, ...how].join(' '));
  // the hero, the help and their best
  const h = f.hero;
  if (h) {
    const high = f.high === 'career' ? ', a career high,' : f.high === 'season' ? ', a season high,' : '';
    const lines = [
      f.won
        ? `${f.full(h)} led them with ${plural(h.pts, 'point')}${high} on ${madeAtt(h.fgm, h.fga)} shooting, with ${plural(reb(h), 'rebound')} and ${plural(h.ast, 'assist')}.`
        : `${f.full(h)} had ${nightWords(h)} for the ${T}.`,
    ];
    if (f.second && f.second.pts >= 12) lines.push(`${f.name(f.second)} added ${f.second.pts}.`);
    if (f.star && f.star.pts >= 20) lines.push(`${f.full(f.star)} scored ${f.star.pts} for the ${f.foe.name}.`);
    paras.push(lines.join(' '));
  }
  // the turning point: the shot that won it, the comeback, the collapse or the run
  const d = f.decider;
  const turn: string[] = [];
  if (d) {
    const who = d.who ? f.full(d.who) : d.ours ? `The ${T}` : `The ${f.foe.name}`;
    const what = d.ft ? 'free throws' : d.three ? 'a three' : 'a basket';
    turn.push(`${who} won it with ${what} ${d.buzzer ? 'at the buzzer' : `with ${plural(Math.max(1, Math.round(d.secs)), 'second')} left`}.`);
  }
  if (f.won && f.comeback >= 10) turn.push(`The ${T} came back from ${f.comeback} points down.`);
  if (!f.won && f.blown >= 10) turn.push(`The ${T} had led by ${f.blown}.`);
  if (f.run && !d) turn.push(`${f.run.ours ? `The ${T}` : `The ${f.foe.name}`} put it away with a ${f.run.pts}-0 run in the ${periodWord(f.run.q - 1)}.`);
  if (turn.length) paras.push(turn.join(' '));
  // what it means
  const reg = f.res.type === 'regular';
  const mean: string[] = [];
  if (reg) mean.push(`The ${T} are ${f.rec[0]}-${f.rec[1]}.`);
  if (means.length) mean.push(`${means.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join('. ')}.`);
  // the next game, for the latest one
  const latest = league.games.filter((g) => g.home.tid === f.tid || g.away.tid === f.tid).at(-1)?.gid === f.res.gid;
  if (latest) {
    const next = league.schedule
      .filter((g) => !g.played && g.type !== 'allstar' && g.day > f.res.day && (g.home === f.tid || g.away === f.tid))
      .sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
    if (next) {
      const opp = league.teams[next.home === f.tid ? next.away : next.home];
      mean.push(
        `Next: ${next.home === f.tid ? 'home to' : 'at'} the ${opp.region} ${opp.name}, ${fmtDate(league.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })}.`,
      );
    }
  }
  if (mean.length) paras.push(mean.join(' '));
  return paras.join('\n\n');
}

/**
 * How big a night it was, for the news and the result's presentation. The front page (3) stops a
 * long sim and can take the screen, so it's rare: a handful of regular-season nights (opening night,
 * a 60-point or career-high 50-point night, a 10-game win streak and every five after, a
 * buzzer-beater or a 20-point comeback on a big night, a playoff spot clinched or lost for good) and the playoffs' huge ones (a series won or
 * lost, a Game 7, the title, getting in or going out in the play-in, the Cup final). Everything else
 * notable is a story (2).
 */
function weightOf(f: Facts, means: string[]): 1 | 2 | 3 {
  const s = f.series;
  const h = f.hero;
  // a night that was billed as a big one (see billingsFor), or any postseason game
  const billed = !!s || !!f.playIn || f.rivalry.hot || f.christmas || f.homeOpener || (!!f.res.cup && f.res.cup !== 'group');
  const pi = f.playIn;
  const stakes = f.res.stakes?.tid === f.tid ? f.res.stakes : undefined;
  const clinched = !!stakes?.after.clinched && stakes.after.clinched !== stakes.before.clinched;
  const big =
    (s && (s.w === 4 || s.l === 4 || s.w + s.l === 7)) ||
    (pi && (f.won ? !pi.endsWith('-910') : !pi.endsWith('-78'))) ||
    f.res.cup === 'final' ||
    f.res.type === 'cup' ||
    f.opening ||
    (h && (h.pts >= 60 || (h.pts >= 50 && f.high === 'career'))) ||
    (f.streak.after >= 10 && f.streak.after % 5 === 0) ||
    (billed && f.won && (f.decider?.buzzer || f.comeback >= 20)) ||
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
  if (f.res.cup === 'final' || f.res.type === 'cup') return 'NBA Cup final';
  if (f.res.cup && f.res.cup !== 'group') return `NBA Cup ${f.res.cup === 'sf' ? 'semifinal' : 'quarterfinal'}`;
  if (f.opening) return f.res.day === 0 ? 'Opening night' : 'Season opener';
  if (f.christmas) return 'Christmas Day';
  if (f.rivalry.hot) return 'Rivalry night';
  if (f.homeOpener) return 'Home opener';
  if (f.res.cup === 'group') return 'NBA Cup';
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
    means,
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
  'IND-OKC': { season: 2024, winner: 'OKC', label: 'NBA Finals', tally: '4-3' },
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
          : `${aWon ? ta.name : tb.name} won last season's ${sn.label}, ${tally}`,
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
    reasons.push({ text: `The ${w.name} beat the ${l.name} in the ${real.season + 1} ${real.label}, ${real.tally}`, w: 4 });
  }
  for (const s of league.playoffs) {
    if (!([s.high, s.low].includes(a) && [s.high, s.low].includes(b)) || s.winner === undefined) continue;
    const sn = seriesName(s.id);
    heat += 3;
    playoff = true;
    const tally = `${Math.max(s.highWins, s.lowWins)}-${Math.min(s.highWins, s.lowWins)}`;
    reasons.push({ text: `${s.winner === a ? ta.name : tb.name} won this season's ${sn?.label ?? 'series'}, ${tally}`, w: 5 });
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

/** What makes a game ahead of the user's team more than a date: its billing ("Rivalry night", "Christmas Day", "Game 7"). */
export interface Billing {
  /** A short tag ("Rivalry", "Revenge game", "Christmas Day"). */
  tag: string;
  /** One line on why ("Boston knocked you out last spring; 2-1 this season"). */
  line: string;
  /** 3 a huge night, 2 a big one, 1 a little extra. */
  weight: 1 | 2 | 3;
}

/** The billing of a game not yet played, from `tid`'s side (the user's team by default), or null for an ordinary night. */
export function billingFor(league: League, g: ScheduledGame, tid = league.userTid): Billing | null {
  return billingsFor(league, g, tid)[0] ?? null;
}

const stripStop = (s: string) => s.replace(/\.$/, '');

/**
 * Everything a game is billed for, biggest first. `light` leaves out what only the near future can
 * say (streaks, standings, revenge games and milestones change by the time a game weeks away is
 * played): for marking a whole schedule.
 */
export function billingsFor(league: League, g: ScheduledGame, tid = league.userTid, opts: { light?: boolean; out?: Set<number> } = {}): Billing[] {
  if (g.home !== tid && g.away !== tid) return [];
  const opp = g.home === tid ? g.away : g.home;
  const me = league.teams[tid];
  const them = league.teams[opp];
  const home = g.home === tid;
  const neutral = g.cup === 'final' || g.type === 'cup';
  const arena = neutral ? undefined : arenaOf(league.teams[g.home]);
  const at = neutral ? 'in Las Vegas' : arena ? `at ${arena}` : home ? 'at home' : `in ${them.region}`;
  const out: (Billing & { order: number })[] = [];
  const add = (b: Billing, order: number) => out.push({ ...b, order });

  if (g.type === 'playoffs' && g.seriesId) {
    const s = league.playoffs.find((x) => x.id === g.seriesId);
    const sn = seriesName(g.seriesId);
    if (s && sn) {
      const [w, l] = s.high === tid ? [s.highWins, s.lowWins] : [s.lowWins, s.highWins];
      const n = w + l + 1;
      if (w === 3 && l === 3) add({ tag: 'Game 7', line: sn.round === 4 ? 'Winner takes the title' : `Win or go home: the winner plays in the ${sn.next}`, weight: 3 }, 0);
      else if (l === 3) add({ tag: 'Elimination game', line: `Down ${l}-${w}: a loss ends the season`, weight: 3 }, 1);
      else if (w === 3)
        add({ tag: 'Closeout game', line: `Up ${w}-${l}: a win ${sn.round === 4 ? 'wins the title' : `takes the ${sn.label}`}`, weight: sn.round === 4 ? 3 : 2 }, 2);
      else if (n === 1) add({ tag: sn.round === 4 ? 'NBA Finals' : 'Game 1', line: `The ${sn.label} opens ${at}`, weight: sn.round === 4 ? 3 : 2 }, 3);
      else add({ tag: `Game ${n}`, line: `${sn.label}: ${w === l ? `tied ${w}-${l}` : w > l ? `you lead ${w}-${l}` : `you trail ${l}-${w}`}`, weight: sn.round === 4 ? 3 : 2 }, 4);
    }
  }
  if (g.type === 'playin' && g.seriesId) {
    const id = g.seriesId;
    add(
      {
        tag: 'Play-In',
        line: id.endsWith('-78')
          ? 'Winner is the 7th seed; the loser gets one more chance'
          : id.endsWith('-910')
            ? 'Loser goes home; the winner plays for the 8th seed'
            : 'Winner takes the 8th seed; the loser goes home',
        weight: 3,
      },
      0,
    );
  }
  if (g.cup === 'final' || g.type === 'cup') add({ tag: 'NBA Cup final', line: 'A trophy on the line in Las Vegas', weight: 3 }, 1);
  else if (g.cup === 'sf') add({ tag: 'Cup semifinal', line: 'Win and play for the Cup', weight: 2 }, 2);
  else if (g.cup === 'qf') add({ tag: 'Cup quarterfinal', line: 'Win and go to Las Vegas', weight: 2 }, 3);

  if (g.type === 'regular') {
    // opening night and the home opener: nothing of the user's played yet this season
    const played = league.games.filter((r) => r.season === league.season && r.type === 'regular' && (r.home.tid === tid || r.away.tid === tid));
    const firstUnplayed = (pred: (x: ScheduledGame) => boolean) =>
      league.schedule.filter((x) => !x.played && x.type === 'regular' && (x.home === tid || x.away === tid) && pred(x)).sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
    if (!played.length && firstUnplayed(() => true)?.gid === g.gid)
      add({ tag: g.day === 0 ? 'Opening night' : 'Season opener', line: `The ${seasonLabel(league.season)} season starts ${at}`, weight: 3 }, 2);
    else if (home && !played.some((r) => r.home.tid === tid) && firstUnplayed((x) => x.home === tid)?.gid === g.gid)
      add({ tag: 'Home opener', line: `The first game ${at} this season`, weight: 2 }, 6);
    if (g.day === christmasDay(league.season)) add({ tag: 'Christmas Day', line: `One of the league's Christmas games, ${at}`, weight: 2 }, 1);
    if (g.cup === 'group') add({ tag: 'NBA Cup', line: 'A group game: the best in each group go to the knockouts', weight: 1 }, 20);
  }

  const riv = rivalryOf(league, tid, opp);
  if (riv.hot) {
    // the reasons, and how the season series stands
    let w = 0;
    let l = 0;
    for (const r of league.games)
      if (r.season === league.season && r.type === 'regular' && [r.home.tid, r.away.tid].includes(opp) && [r.home.tid, r.away.tid].includes(tid))
        if (r.home.pts > r.away.pts === (r.home.tid === tid)) w++;
        else l++;
    const series = w + l ? `${w}-${l} this season` : '';
    add({ tag: 'Rivalry', line: [...riv.reasons.slice(0, 2), series].filter(Boolean).join('; '), weight: 2 }, 5);
  }

  if (!opts.light) {
    // revenge: a player facing the team that let him go, the coach facing his old team
    const st = billingStorylines(league, g, tid, opts.out);
    // (a stint years ago isn't a story: the first meeting since he left, or a recent one)
    const rev = st.revenge.find((x) => x.weight >= 60);
    // (a big night only for a good player's first meeting since: others are a little extra)
    if (rev) add({ tag: 'Revenge game', line: stripStop(rev.text), weight: rev.weight >= 68 ? 2 : 1 }, 7);
    if (tid === league.userTid) {
      const coach = league.coaches?.find((c) => c.user);
      const old = coach?.stints.filter((s) => s.tid === opp && s.to).at(-1);
      if (old?.to && league.season - old.to.season <= 2 && coach?.stints.at(-1)?.tid === tid) {
        const left = old.to.season;
        const met = league.games.some((r) => r.season >= left && [r.home.tid, r.away.tid].includes(opp) && [r.home.tid, r.away.tid].includes(tid));
        if (!met) add({ tag: 'Old team', line: `Your first game against the ${them.name} since you left them`, weight: 2 }, 6);
      }
    }
    const ms = st.milestone[0];
    // (the marks that make the league's news are a big night; the round thousands between, a little extra)
    const mark = ms ? /-(pts|reb|ast)-(\d+)$/.exec(ms.id) : null;
    if (ms) add({ tag: 'Milestone watch', line: stripStop(ms.text), weight: mark && newsworthy(mark[1] as MilestoneStat, Number(mark[2])) ? 2 : 1 }, 12);
    if (g.type === 'regular') {
      const streak = me.seasons.find((s) => s.season === league.season)?.streak ?? 0;
      const theirs = them.seasons.find((s) => s.season === league.season)?.streak ?? 0;
      if (streak >= 5) add({ tag: 'Streak on the line', line: `${plural(streak, 'win')} in a row`, weight: streak >= 8 ? 2 : 1 }, 8);
      else if (streak <= -5) add({ tag: 'Snap the skid', line: `${plural(-streak, 'loss', 'losses')} in a row`, weight: 1 }, 14);
      if (theirs >= 7) add({ tag: `${them.name} rolling`, line: `They have won ${theirs} straight`, weight: 2 }, 10);
      const sh = showdown(league, tid, opp, g);
      if (sh) add(sh, 9);
    }
  }
  // biggest first; among equals, the more particular occasion
  return out.sort((a, b) => b.weight - a.weight || a.order - b.order).map(({ tag, line, weight }) => ({ tag, line, weight }));
}

/** Top of the standings meeting, or seeding on the line late in the season. */
function showdown(league: League, a: number, b: number, g: ScheduledGame): Billing | null {
  const sa = league.teams[a].seasons.find((s) => s.season === league.season);
  const sb = league.teams[b].seasons.find((s) => s.season === league.season);
  if (!sa || !sb || sa.won + sa.lost < 15 || sb.won + sb.lost < 15) return null;
  const pct = (s: { won: number; lost: number }) => s.won / Math.max(1, s.won + s.lost);
  const rankIn = (tid: number, pool: number[]) =>
    1 + pool.filter((t) => t !== tid && pct(league.teams[t].seasons.find((s) => s.season === league.season) ?? { won: 0, lost: 0 }) > pct(tid === a ? sa : sb)).length;
  const all = league.teams.map((t) => t.tid);
  const [la, lb] = [rankIn(a, all), rankIn(b, all)];
  if (la <= 2 && lb <= 2) return { tag: 'Showdown', line: "The league's two best records", weight: 2 };
  const ca = league.teams[a].conf;
  if (ca === league.teams[b].conf) {
    const conf = all.filter((t) => league.teams[t].conf === ca);
    const [ra, rb] = [rankIn(a, conf), rankIn(b, conf)];
    // (the conference's top two: a big night once the season is half gone)
    if (ra <= 2 && rb <= 2) return { tag: 'Showdown', line: `1st against 2nd in the ${confWord(ca)}`, weight: g.day >= league.regularSeasonDays / 2 ? 2 : 1 };
    // the last weeks: two teams a game or two apart around the lines that matter (6th, 10th)
    const late = g.day >= league.regularSeasonDays - 21;
    const gap = Math.abs(sa.won - sa.lost - (sb.won - sb.lost)) / 2;
    const near = (r: number) => (r >= 5 && r <= 8) || (r >= 9 && r <= 12);
    if (late && gap <= 2 && Math.abs(ra - rb) <= 2 && near(ra) && near(rb))
      return {
        tag: 'Seeding',
        line: `${ordinal(Math.min(ra, rb))} and ${ordinal(Math.max(ra, rb))} in the ${confWord(ca)}, ${gap === 0 ? 'level' : `${gap % 1 ? gap.toFixed(1) : gap} ${gap === 1 ? 'game' : 'games'} apart`}`,
        weight: 2,
      };
  }
  return null;
}

/** A team's last results this season, oldest first (`true` a win), at most `n`: the form guide. */
export function formGuide(league: League, tid: number, n = 5): boolean[] {
  const ts = league.teams[tid]?.seasons.find((s) => s.season === league.season);
  return (ts?.lastTen ?? []).slice(-n).map((x) => x === 1);
}

/** The press's stories of the user's games, by "season-day" (one game a day): for marking the big nights in a schedule. */
export function userGameNews(league: League): Map<string, NewsItem> {
  const out = new Map<string, NewsItem>();
  for (const n of league.news) if (n.kind === 'game' && n.tids[0] === league.userTid) out.set(`${n.season}-${n.day}`, n);
  return out;
}
