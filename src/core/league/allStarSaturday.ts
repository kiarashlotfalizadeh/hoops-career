// All-Star Saturday: the Three-Point Contest and the Slam Dunk Contest, held on the All-Star day
// once the All-Stars are picked and before the game (see advanceDay). The results are kept on the
// season's awards (SeasonAwards.saturday) with each entrant's name and team frozen, the winners get
// an award record ('Three-Point Contest', 'Slam Dunk Contest'), and both make the news.
//
// Everything is drawn from a random stream of its own, one per league and season: the league's
// stream never moves for it, so no game after it changes, and the same league always gets the same
// Saturday.

import type { Dunk, Dunker, League, Player, ThreeShooter } from '../types';
import { Rng, clamp, hashString } from '../random';
import { playerAge } from '../playerGen';
import { addInbox, addNews, playerName, seasonTotals } from './helpers';

export const THREE_FIELD = 8;
export const THREE_FINALISTS = 3;
export const DUNK_FIELD = 4;
export const DUNK_FINALISTS = 2;
/** Tie-breaking shoot-offs or dunk-offs in a row before the earlier order (the field's seeding) stands. */
const MAX_TIEBREAKS = 3;

const saturdayRng = (league: League) => new Rng(hashString(`${league.id}:${league.season}:all-star-saturday`));

/** The regular-season games the busiest team has played: the yardstick for attempts and appearances. */
function teamGames(league: League) {
  return Math.max(1, ...league.teams.map((t) => t.seasons.find((s) => s.season === league.season)).map((s) => (s ? s.won + s.lost : 0)));
}

// ---------------------------------------------------------------- three-point contest

/** The league's three-point percentage the shooters' form is read against (the engine's: about 36.5% since the big decisions' open looks came to count by who takes them). */
const LEAGUE_3P = 0.365;
/** Attempts of league-average shooting his season is blended with, so a hot month on few shots is mostly noise. */
const FORM_PRIOR = 150;
/** Three-point attempts a team game he needs to be invited (some 140 by the All-Star break). */
const MIN_TPA_PER_GAME = 2.5;
/** All-Stars the league invites when they're among its best shooters. */
const ALL_STAR_SHOOTERS = 2;
/** How deep in the shooting ranks an All-Star can still be invited. */
const ALL_STAR_DEPTH = 20;

/** His season's three-point percentage, blended with league-average shooting (FORM_PRIOR attempts of it). */
function threeForm(p: Player, season: number) {
  const s = seasonTotals(p, season, false);
  return ((s?.tpm ?? 0) + LEAGUE_3P * FORM_PRIOR) / ((s?.tpa ?? 0) + FORM_PRIOR);
}

/**
 * The shooters the league invites: healthy players on a roster with enough attempts this season
 * (2.5 a team game), ranked by threes made a team game and how well they shoot them (two threes a
 * game are worth about as much as five points of percentage), with a couple of All-Stars from among
 * the twenty best when the eight don't have them.
 */
export function threeField(league: League): Player[] {
  const games = teamGames(league);
  const aw = league.awards.find((a) => a.season === league.season);
  const allStars = new Set([...(aw?.allStars.E ?? []), ...(aw?.allStars.W ?? [])]);
  const ranked = Object.values(league.players)
    .filter((p) => p.tid >= 0 && !p.injury)
    .map((p) => ({ p, s: seasonTotals(p, league.season, false) }))
    .filter(({ s }) => s && s.tpa >= MIN_TPA_PER_GAME * games)
    .map(({ p, s }) => ({ p, score: (2 * s!.tpm) / games + 100 * (threeForm(p, league.season) - LEAGUE_3P) }))
    .sort((a, b) => b.score - a.score || a.p.pid - b.p.pid)
    .map((x) => x.p);
  const field = ranked.slice(0, THREE_FIELD);
  const stars = ranked.slice(THREE_FIELD, ALL_STAR_DEPTH).filter((p) => allStars.has(p.pid));
  for (const star of stars) {
    if (field.filter((p) => allStars.has(p.pid)).length >= ALL_STAR_SHOOTERS) break;
    // he takes the place of the last shooter in who isn't an All-Star
    const out = field.map((p) => !allStars.has(p.pid)).lastIndexOf(true);
    if (out < 0) break;
    field.splice(out, 1);
    field.push(star);
  }
  return field;
}

/**
 * His chance on a regular ball, fresh: from his three-point rating, plus a little of his form this
 * season. A tp of 50 makes about 47% (an average shooter, rarely invited), 70 about 55%, 85 about
 * 62%; shooting 45% from three on 400 attempts adds about 3 points, 33% takes off about 1.
 */
export function threeSkill(p: Player, season: number): number {
  return clamp(SKILL_BASE + SKILL_PER_TP * p.ratings.tp + FORM_WEIGHT * (threeForm(p, season) - LEAGUE_3P), 0.25, 0.8);
}

/** (0.26 until the best shooters' seasons came to run about two points hotter, when the big decisions' looks came to count by who takes them: the field's first rounds had gone from 21 to 23.) */
const SKILL_BASE = 0.245;
const SKILL_PER_TP = 0.0042;
const FORM_WEIGHT = 0.5;
/** A money ball at the end of a rack comes in a hurry. */
const MONEY_BALL = 0.03;
/** The all-money-ball rack goes at his favorite spot, which takes most of that back. */
const FAVORITE_SPOT = 0.02;
/** The deep shots, six feet behind the line. */
const DEEP = 0.17;
/** Fatigue: off his chance for every ball after the first ten. */
const FATIGUE = 0.004;
const FRESH_BALLS = 10;
/** A round's rhythm: some days the rack just feels right (SD of a round's swing in his chance). */
const RHYTHM = 0.06;

/**
 * One round, the NBA's way: five racks of four 1-point balls and a 2-point money ball, one of them
 * (his choice of spot) all money balls, and two 3-point deep shots, between the second and third
 * racks and the third and fourth: 27 balls, 40 points at most.
 */
export function shootRound(rng: Rng, skill: number): number {
  const moneyRack = rng.int(0, 4);
  skill += rng.normal(0, RHYTHM);
  let ball = 0;
  let pts = 0;
  const shot = (chance: number, value: number) => {
    const tired = FATIGUE * Math.max(0, ball - FRESH_BALLS);
    ball++;
    if (rng.chance(clamp(chance - tired, 0.03, 0.97))) pts += value;
  };
  for (let rack = 0; rack < 5; rack++) {
    for (let i = 0; i < 5; i++) {
      if (rack === moneyRack) shot(skill - MONEY_BALL + FAVORITE_SPOT, 2);
      else if (i === 4) shot(skill - MONEY_BALL, 2);
      else shot(skill, 1);
    }
    if (rack === 1 || rack === 2) shot(skill - DEEP, 3);
  }
  return pts;
}

/** A shoot-off: one more rack of four and a money ball (0-6), fresh legs or not. */
function shootOff(rng: Rng, skill: number): number {
  let pts = 0;
  for (let i = 0; i < 5; i++) if (rng.chance(clamp(skill - (i === 4 ? MONEY_BALL : 0), 0.03, 0.97))) pts += i === 4 ? 2 : 1;
  return pts;
}

/**
 * The `n` who go through, best first: by `score`, a tie at the cut settled by `extra` (one more try
 * each, again among any still level, at most MAX_TIEBREAKS times; then the earlier order stands).
 */
function advance<T>(rows: T[], n: number, score: (r: T) => number, extra: (r: T) => number): T[] {
  const sorted = [...rows].sort((a, b) => score(b) - score(a));
  if (sorted.length <= n || score(sorted[n]) !== score(sorted[n - 1])) return sorted.slice(0, n);
  const line = score(sorted[n - 1]);
  const through = sorted.filter((r) => score(r) > line);
  let tied = sorted.filter((r) => score(r) === line);
  for (let i = 0; i < MAX_TIEBREAKS && tied.length > n - through.length; i++) {
    const s = new Map(tied.map((r) => [r, extra(r)] as const));
    tied.sort((a, b) => s.get(b)! - s.get(a)!);
    const cut = s.get(tied[n - through.length - 1])!;
    through.push(...tied.filter((r) => s.get(r)! > cut));
    tied = tied.filter((r) => s.get(r)! === cut);
  }
  return [...through, ...tied].slice(0, n);
}

/** The score of the last of his shoot-offs (or dunk-offs), -1 for none. */
const lastOff = (xs: (number | Dunk)[] | undefined) => {
  const v = xs?.[xs.length - 1];
  return v === undefined ? -1 : typeof v === 'number' ? v : v.score;
};

/** Among those level on a round, who did better in its tiebreak: whoever lasted more shoot-offs, then won the last one he was in. */
const byOff = (a: (number | Dunk)[] | undefined, b: (number | Dunk)[] | undefined) => (b?.length ?? 0) - (a?.length ?? 0) || lastOff(b) - lastOff(a);

/**
 * The Three-Point Contest for a field (in seeding order) and each shooter's chance: everyone shoots
 * a round, the top three a final, ties at either cut broken by shoot-off racks. Returns the field
 * in its final order, the winner first (then the other finalists by their final, the rest by their
 * first round).
 *
 * Calibration, 20,000 contests each with the field invited at the first All-Star break of the real
 * league and of a fictional one: a first-round score averages 20.9 and 21.7 (most between 14 and
 * 28), the best of the eight 28.2 and 28.7, and the winning final 25.9 and 26.3, 21-31 for 80% of
 * winners (the real contest's winners mostly score 24-31, its fields 18-22). About three contests in
 * ten need a shoot-off.
 */
export function threePointContest(rng: Rng, field: { entry: ThreeShooter; skill: number }[]): ThreeShooter[] {
  const skill = new Map(field.map((f) => [f.entry, f.skill]));
  const all = field.map((f) => f.entry);
  for (const e of all) e.r1 = shootRound(rng, skill.get(e)!);
  const finalists = advance(
    all,
    THREE_FINALISTS,
    (e) => e.r1,
    (e) => {
      const s = shootOff(rng, skill.get(e)!);
      (e.r1Off ??= []).push(s);
      return s;
    },
  );
  for (const e of finalists) e.final = shootRound(rng, skill.get(e)!);
  const [winner] = advance(
    finalists,
    1,
    (e) => e.final!,
    (e) => {
      const s = shootOff(rng, skill.get(e)!);
      (e.finalOff ??= []).push(s);
      return s;
    },
  );
  const others = finalists.filter((e) => e !== winner).sort((a, b) => b.final! - a.final! || byOff(a.finalOff, b.finalOff) || b.r1 - a.r1);
  const out = all.filter((e) => !finalists.includes(e)).sort((a, b) => b.r1 - a.r1 || byOff(a.r1Off, b.r1Off));
  return [winner, ...others, ...out];
}

// ---------------------------------------------------------------- slam dunk contest

/** Overall a player can have and still be asked: the dunk contest is for the high-flyers, not the stars. */
const DUNK_MAX_OVR = 84;
/** The age the league looks to for its dunkers (older ones only when there aren't enough). */
const DUNK_MAX_AGE = 26;
/** Games he has played this season, at least: someone the fans have seen. */
const DUNK_MIN_GAMES = 10;

/** How much of a dunker he is (0-100): mostly bounce, then speed, finishing and size. */
export function dunkRating(p: Player) {
  const r = p.ratings;
  return 0.55 * r.ath + 0.3 * r.spd + 0.1 * r.ins + 0.05 * r.hgt;
}

/**
 * The dunkers the league invites: young high-flyers who aren't stars (no All-Stars, nobody 85 or
 * better), healthy, on a roster and playing this season, the best dunkers 26 or younger first.
 */
export function dunkField(league: League): Player[] {
  const aw = league.awards.find((a) => a.season === league.season);
  const allStars = new Set([...(aw?.allStars.E ?? []), ...(aw?.allStars.W ?? [])]);
  const ranked = Object.values(league.players)
    .filter((p) => p.tid >= 0 && !p.injury && p.ovr <= DUNK_MAX_OVR && !allStars.has(p.pid) && (seasonTotals(p, league.season, false)?.gp ?? 0) >= DUNK_MIN_GAMES)
    .sort((a, b) => dunkRating(b) - dunkRating(a) || a.pid - b.pid);
  const young = ranked.filter((p) => playerAge(p, league.season) <= DUNK_MAX_AGE);
  return [...young, ...ranked.filter((p) => playerAge(p, league.season) > DUNK_MAX_AGE)].slice(0, DUNK_FIELD);
}

/**
 * His dunk rating on a 0-1 scale for the contest, by how far above the league's rostered players
 * it is: 1.25 standard deviations is nothing special in this company (0), 3.25 the best there is (1).
 * Read against the league, so a league whose players jump higher all round (a fictional one's
 * generated ratings spread wider) doesn't score its contests higher.
 */
export function dunkSkills(league: League, field: Player[]): number[] {
  const all = Object.values(league.players)
    .filter((p) => p.tid >= 0)
    .map(dunkRating);
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, all.length)) || 1;
  return field.map((p) => clamp(((dunkRating(p) - mean) / sd - 1.25) / 2, 0, 1));
}

/**
 * What a dunk was, by its score: the bigger dunks only for the bigger scores. A dunk he couldn't
 * finish is named for what he tried. Each reads after "a 50 for" in the news.
 */
const DUNKS: { min: number; names: string[] }[] = [
  {
    min: 50,
    names: [
      'a dunk from the free-throw line',
      'a 360 between the legs',
      'a between-the-legs over a teammate',
      'a reverse 360 windmill',
      'a between-the-legs over the mascot',
      'a windmill from inside the free-throw line',
    ],
  },
  {
    min: 47,
    names: [
      'a 360 windmill',
      'a between-the-legs off the bounce',
      'a dunk over a teammate',
      'a reverse double-pump',
      'a behind-the-back off the glass',
      'a 360 off the bounce',
      'a windmill over a seated teammate',
    ],
  },
  {
    min: 43,
    names: [
      'a reverse windmill',
      'a 360',
      'a double-clutch reverse',
      'an alley-oop off the backboard',
      'a windmill off the lob',
      'a cradle slam off the bounce',
      'a tomahawk over a ball boy',
      'a 180 off the lob',
      'a one-handed windmill off the bounce',
      'a tomahawk off the side of the backboard',
      'a double-pump off a lob from a teammate',
      'a two-handed reverse windmill',
    ],
  },
  {
    min: 38,
    names: [
      'a windmill',
      'a two-handed reverse',
      'a tomahawk off the lob',
      'a one-handed reverse',
      'a double-pump',
      'an off-the-glass slam',
      'a two-handed tomahawk',
      'a one-handed alley-oop',
      'a reverse off the bounce',
    ],
  },
  { min: 30, names: ['a two-handed flush', 'a one-handed jam', 'a tomahawk', 'a baseline reverse', 'a rim-rattling two-hander'] },
];

/** A dunk's name for its score (or, missed, for how big a dunk he tried), one not used yet today where the list allows. */
function dunkName(rng: Rng, score: number, used: Set<string>) {
  const tier = DUNKS.find((t) => score >= t.min) ?? DUNKS[DUNKS.length - 1];
  const fresh = tier.names.filter((n) => !used.has(n));
  const name = rng.pick(fresh.length ? fresh : tier.names);
  used.add(name);
  return name;
}

/** How big a dunk he goes for (0-1): a little more with more bounce, and some days he has something special planned. */
const DUNK_SIZE = { base: 0.3, perSkill: 0.45, sd: 0.22 };
/** What the judges make of a finished dunk (a judge's mark around 6-10), and how far the crowd and the judges' own tastes move it. */
const DUNK_WORTH = { base: 7.2, perSize: 2.4, perSkill: 0.4, crowd: 0.4, judge: 0.3 };

/**
 * One dunk. He goes for something as big as his bounce allows, give or take, and gets it down in
 * his tries most of the time (less often the bigger it is): five judges then give 6-10 each around
 * what it was worth, the crowd's reaction moving them together. One he can't finish scores 30-36.
 */
function dunk(rng: Rng, q: number, used: Set<string>): Dunk {
  const size = clamp(DUNK_SIZE.base + DUNK_SIZE.perSkill * q + rng.normal(0, DUNK_SIZE.sd), 0, 1);
  if (!rng.chance(clamp(0.95 - 0.2 * size + 0.1 * q, 0.6, 0.98))) {
    const judged = Math.round(clamp(6.4 + 0.5 * size + rng.normal(0, 0.25), 6, 7.2) * 5);
    return { score: judged, text: dunkName(rng, 38 + 12 * size, used), miss: true };
  }
  const worth = DUNK_WORTH.base + DUNK_WORTH.perSize * size + DUNK_WORTH.perSkill * q + rng.normal(0, DUNK_WORTH.crowd);
  let score = 0;
  for (let j = 0; j < 5; j++) score += clamp(Math.round(worth + rng.normal(0, DUNK_WORTH.judge)), 6, 10);
  return { score, text: dunkName(rng, score, used) };
}

const total = (ds: Dunk[] | undefined) => (ds ?? []).reduce((a, d) => a + d.score, 0);

/**
 * The Slam Dunk Contest for a field (in seeding order) and each dunker's contest rating: two dunks
 * each in the first round, two more for the top two in the final, a tie at either cut going to a
 * dunk-off (one dunk each, again while level). Returns the field in its final order, the winner first.
 *
 * Calibration, 20,000 contests each with the real and a fictional league's fields: a finished dunk
 * scores 44 on average (the judges agreeing on 40, 45 or 50 most often; 50s are 10% and 7% of
 * them), one in ten isn't finished, and the winning final (two dunks) averages 91.5 and 89.8, 83-98
 * for 80% of winners.
 */
export function slamDunkContest(rng: Rng, field: { entry: Dunker; q: number }[]): Dunker[] {
  const q = new Map(field.map((f) => [f.entry, f.q]));
  const used = new Set<string>();
  const all = field.map((f) => f.entry);
  for (const e of all) e.r1 = [dunk(rng, q.get(e)!, used), dunk(rng, q.get(e)!, used)];
  const finalists = advance(
    all,
    DUNK_FINALISTS,
    (e) => total(e.r1),
    (e) => {
      const d = dunk(rng, q.get(e)!, used);
      (e.r1Off ??= []).push(d);
      return d.score;
    },
  );
  for (const e of finalists) e.final = [dunk(rng, q.get(e)!, used), dunk(rng, q.get(e)!, used)];
  const [winner] = advance(
    finalists,
    1,
    (e) => total(e.final),
    (e) => {
      const d = dunk(rng, q.get(e)!, used);
      (e.finalOff ??= []).push(d);
      return d.score;
    },
  );
  const others = finalists.filter((e) => e !== winner);
  const out = all.filter((e) => !finalists.includes(e)).sort((a, b) => total(b.r1) - total(a.r1) || byOff(a.r1Off, b.r1Off));
  return [winner, ...others, ...out];
}

// ---------------------------------------------------------------- the day

const PLACE = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

/** His best finished dunk of the day: the one the news remembers. */
function bestDunk(e: Dunker): Dunk | undefined {
  const all = [...(e.finalOff ?? []), ...(e.final ?? []), ...(e.r1Off ?? []), ...e.r1].filter((d) => !d.miss);
  return all.reduce<Dunk | undefined>((best, d) => (!best || d.score > best.score ? d : best), undefined);
}

/**
 * All-Star Saturday, on the All-Star day before the game: both contests, kept on the season's
 * awards, the winners' award records, the news, and one inbox message when any of the user's
 * players took part.
 */
export function allStarSaturday(league: League) {
  const aw = league.awards.find((a) => a.season === league.season);
  if (!aw || aw.saturday) return;
  const rng = saturdayRng(league);
  const entry = (p: Player) => ({ pid: p.pid, name: playerName(p), tid: p.tid });
  const shooters = threeField(league);
  const dunkers = dunkField(league);
  const three =
    shooters.length === THREE_FIELD
      ? threePointContest(
          rng,
          shooters.map((p) => ({ entry: { ...entry(p), r1: 0 }, skill: threeSkill(p, league.season) })),
        )
      : [];
  const q = dunkSkills(league, dunkers);
  const dunk =
    dunkers.length === DUNK_FIELD
      ? slamDunkContest(
          rng,
          dunkers.map((p, i) => ({ entry: { ...entry(p), r1: [] }, q: q[i] })),
        )
      : [];
  aw.saturday = { three, dunk };
  const abbrev = (tid: number) => league.teams[tid]?.abbrev ?? '';
  if (three.length) {
    const [w, second] = three;
    league.players[w.pid].awards.push({ season: league.season, type: 'Three-Point Contest' });
    const tied = second.final === w.final;
    addNews(league, {
      kind: 'award',
      text: tied
        ? `${w.name} (${abbrev(w.tid)}) wins the Three-Point Contest in a shoot-off with ${second.name} (${lastOff(w.finalOff)}-${lastOff(second.finalOff)}) after both scored ${w.final} in the final.`
        : `${w.name} (${abbrev(w.tid)}) wins the Three-Point Contest, ${w.final}-${second.final} over ${second.name} in the final.`,
      tids: [w.tid],
      pids: three.slice(0, THREE_FINALISTS).map((e) => e.pid),
    });
  }
  if (dunk.length) {
    const [w, second] = dunk;
    league.players[w.pid].awards.push({ season: league.season, type: 'Slam Dunk Contest' });
    const best = bestDunk(w);
    const [a, b] = [total(w.final), total(second.final)];
    addNews(league, {
      kind: 'award',
      text: `${w.name} (${abbrev(w.tid)}) wins the Slam Dunk Contest${best ? ` with a ${best.score} for ${best.text}` : ''}, ${a === b ? `beating ${second.name} in a dunk-off after a ${a}-${b} final` : `${a}-${b} over ${second.name} in the final`}.`,
      tids: [w.tid],
      pids: dunk.slice(0, DUNK_FINALISTS).map((e) => e.pid),
    });
  }
  // one message for the user's players who took part, how each did
  const lines: string[] = [];
  three.forEach((e, i) => {
    if (league.players[e.pid]?.tid !== league.userTid) return;
    if (i === 0) lines.push(`${e.name} won the Three-Point Contest with ${e.final} in the final.`);
    else if (e.final !== undefined) lines.push(`${e.name} reached the Three-Point Contest final and finished ${PLACE[i]} with ${e.final}.`);
    else lines.push(`${e.name} scored ${e.r1} in the Three-Point Contest's first round, ${PLACE[i]} of ${THREE_FIELD}.`);
  });
  dunk.forEach((e, i) => {
    if (league.players[e.pid]?.tid !== league.userTid) return;
    const best = bestDunk(e);
    if (i === 0) lines.push(`${e.name} won the Slam Dunk Contest${best ? `, his best a ${best.score} for ${best.text}` : ''}.`);
    else if (e.final !== undefined) lines.push(`${e.name} was the Slam Dunk Contest's runner-up with ${total(e.final)} in the final.`);
    else lines.push(`${e.name} scored ${total(e.r1)} in the Slam Dunk Contest's first round, ${PLACE[i]} of ${DUNK_FIELD}.`);
  });
  if (lines.length) {
    const won = [three[0], dunk[0]].some((e) => e && league.players[e.pid]?.tid === league.userTid);
    addInbox(league, { from: 'League Office', subject: 'All-Star Saturday', body: lines.join(' '), tone: won ? 'good' : 'neutral', link: '/league/awards' });
  }
}
