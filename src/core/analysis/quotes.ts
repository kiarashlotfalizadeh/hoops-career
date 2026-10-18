// What players and the other coach said after one of the user's games, and the user's own
// optional press conference. Quotes come from templates for what happened (the margin, overtime,
// a 30-point night, the player of the game, a streak, an upset, an injury), picked by a hash of the
// game id so a game always reads the same and nothing is drawn from the league's random stream. The
// press conference (below) moves the user's locker room's mood, once per game, with real trade-offs.

import type { BoxLine, GameResult, League, Player, PressChoice, TeamBox } from '../types';
import { hashString, clamp } from '../random';
import { playerName, seasonTotals, shortName } from '../league/helpers';
import { playerAge } from '../playerGen';
import type { Factor, GameReport } from './gameReport';
import { COMEBACK_WP, wpStory } from './winProb';

export interface Quote {
  /** Who said it: "Jalen Brunson" or "Joe Mazzulla". */
  who: string;
  /** "Player of the game", "Guard", "BOS head coach". */
  role: string;
  tid: number;
  pid?: number;
  text: string;
}

/** The game from the user's side, with the facts the templates read. */
interface Facts {
  won: boolean;
  margin: number;
  ot: number;
  us: TeamBox;
  them: TeamBox;
  usName: string;
  themName: string;
  /** Our player of the game, or our best game: the voice of the locker room. */
  voice: BoxLine | undefined;
  pogOurs: boolean;
  /** Their 30-point scorer, if any. */
  theirStar: BoxLine | undefined;
  /** The user's streak after this game (+n wins, -n losses), regular season only. */
  streak: number;
  /** The winner was this many places lower in the league standings going in (10+ is an upset). */
  upset: number;
  /** A player of ours hurt in this game. */
  hurt: BoxLine | undefined;
  /** What the game report says decided it (the biggest factor that went the winner's way). */
  decided?: Factor['category'];
  /** The winner's lowest win probability during the game, as the result keeps it (or its flow shows it). */
  low?: number;
}

const gameScore = (b: BoxLine) => b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.orb + 0.3 * b.drb + b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov;

/**
 * The three stars of a game, both teams: the player of the game first (the engine's pick), then the
 * next two by the same measure (game score, with two points for playing on the winning side).
 */
export function threeStars(res: GameResult): { line: BoxLine; tid: number }[] {
  const all = [res.home, res.away].flatMap((side) =>
    side.players.filter((b) => b.min > 0).map((line) => ({ line, tid: side.tid, won: side.pts > (side === res.home ? res.away : res.home).pts })),
  );
  const score = (x: (typeof all)[number]) => gameScore(x.line) + (x.won ? 2 : 0);
  const pog = all.find((x) => x.line.pid === res.pog);
  const rest = all.filter((x) => x !== pog).sort((a, b) => score(b) - score(a));
  return [...(pog ? [pog] : []), ...rest].slice(0, 3).map(({ line, tid }) => ({ line, tid }));
}

const userSide = (league: League, res: GameResult) => (res.home.tid === league.userTid ? res.home : res.away.tid === league.userTid ? res.away : null);

/** The user's games of a season in the order they were played. */
function userGames(league: League, season: number) {
  return league.games.filter((g) => g.season === season && (g.home.tid === league.userTid || g.away.tid === league.userTid));
}

/** Is this the user's latest game? (Streaks, injuries and the press conference are about the latest one.) */
export function isLatestUserGame(league: League, res: GameResult) {
  const mine = league.games.filter((g) => g.home.tid === league.userTid || g.away.tid === league.userTid);
  return mine[mine.length - 1]?.gid === res.gid;
}

/** The user's regular-season streak right after this game, from the stored results. */
export function streakAfter(league: League, res: GameResult): number {
  let streak = 0;
  for (const g of userGames(league, res.season)) {
    if (g.type === 'regular') {
      const us = g.home.tid === league.userTid ? g.home : g.away;
      const them = us === g.home ? g.away : g.home;
      const won = us.pts > them.pts;
      streak = won ? (streak > 0 ? streak + 1 : 1) : streak < 0 ? streak - 1 : -1;
    }
    if (g.gid === res.gid) break;
  }
  return streak;
}

/** League places between the winner and the loser going into the game, by regular-season record (both teams 10+ games in). */
function upsetGap(league: League, res: GameResult): number {
  if (res.type !== 'regular') return 0;
  const rec = new Map<number, [number, number]>();
  for (const g of league.games) {
    if (g.season !== res.season || g.type !== 'regular') continue;
    if (g.gid === res.gid) break;
    const hw = g.home.pts > g.away.pts;
    for (const [tid, w] of [
      [g.home.tid, hw],
      [g.away.tid, !hw],
    ] as const) {
      const r = rec.get(tid) ?? [0, 0];
      r[w ? 0 : 1]++;
      rec.set(tid, r);
    }
  }
  const pct = (tid: number) => {
    const r = rec.get(tid) ?? [0, 0];
    return r[0] + r[1] ? r[0] / (r[0] + r[1]) : 0.5;
  };
  const gp = (tid: number) => (rec.get(tid) ?? [0, 0]).reduce((a, b) => a + b, 0);
  const winner = res.home.pts > res.away.pts ? res.home.tid : res.away.tid;
  const loser = winner === res.home.tid ? res.away.tid : res.home.tid;
  if (gp(winner) < 10 || gp(loser) < 10) return 0;
  const rank = (tid: number) => 1 + league.teams.filter((t) => pct(t.tid) > pct(tid)).length;
  return rank(winner) - rank(loser);
}

/**
 * Whether a play-by-play line ("Jal. Williams is injured and leaves the game.") names this player:
 * teammates who share a last name are told apart by as much of the first name as it takes.
 */
function injuredIn(league: League, b: BoxLine, text: string) {
  const p = league.players[b.pid];
  const at = text.indexOf(`${p?.lastName ?? b.name} is injured and leaves the game.`);
  if (at < 0) return false;
  const first = text.slice(0, at).trim().replace(/\.$/, '');
  return !first || !!p?.firstName.startsWith(first);
}

/**
 * A player of ours hurt in this game: as the result keeps it, or for an older result from our side's
 * play-by-play, or (for the latest game) a fresh injury on someone who played.
 */
function hurtInGame(league: League, res: GameResult, us: TeamBox): BoxLine | undefined {
  const played = us.players.filter((b) => b.min > 0);
  if (res.hurt) return played.find((b) => res.hurt!.includes(b.pid));
  // (their player who shares one of our names isn't ours)
  const side = us === res.home ? 0 : 1;
  const named = res.pbp?.filter((e) => e.t === side && e.text.endsWith('is injured and leaves the game.'));
  if (named?.length) return played.find((b) => named.some((e) => injuredIn(league, b, e.text)));
  if (!isLatestUserGame(league, res)) return undefined;
  return played.find((b) => {
    const inj = league.players[b.pid]?.injury;
    return !!inj && inj.gamesRemaining === inj.gamesTotal && inj.gamesTotal >= 3;
  });
}

/**
 * The winner's lowest win probability once the game was under way (a low at tip-off is an upset,
 * not a comeback): as the result keeps it (none kept: there was none), else from its flow.
 */
function comebackLow(res: GameResult): number | undefined {
  if (res.hurt) return res.wpLow;
  const low = wpStory(res)?.low;
  return low && low.point.i >= 0 ? low.wp : undefined;
}

/**
 * What the quotes read that the save doesn't keep for good, kept with one of the user's results as
 * it's recorded (see applyResult): his players hurt in it (the play-by-play is kept for the latest
 * few games, and an injury heals), and the winner's low point (the flow goes at the season's end).
 * So a game always reads the same.
 */
export function recapFacts(res: GameResult, hurt: number[]): Pick<GameResult, 'hurt' | 'wpLow'> {
  const low = comebackLow({ ...res, hurt: undefined });
  // (rounded up: a low at the comeback line stays on the same side of it)
  return { hurt, ...(low !== undefined ? { wpLow: Math.ceil(low * 1e4) / 1e4 } : {}) };
}

function facts(league: League, res: GameResult, report?: GameReport | null): Facts | null {
  const us = userSide(league, res);
  if (!us) return null;
  const them = us === res.home ? res.away : res.home;
  const won = us.pts > them.pts;
  const played = us.players.filter((b) => b.min > 0);
  const pogOurs = played.some((b) => b.pid === res.pog);
  const voice = pogOurs ? played.find((b) => b.pid === res.pog) : [...played].sort((a, b) => gameScore(b) - gameScore(a))[0];
  const theirStar = [...them.players].sort((a, b) => b.pts - a.pts).find((b) => b.pts >= 30);
  const gap = upsetGap(league, res);
  return {
    won,
    margin: Math.abs(us.pts - them.pts),
    ot: res.ot,
    us,
    them,
    usName: league.teams[us.tid].name,
    themName: league.teams[them.tid].name,
    voice,
    pogOurs,
    theirStar,
    streak: res.type === 'regular' ? streakAfter(league, res) : 0,
    upset: gap,
    hurt: hurtInGame(league, res, us),
    decided: report?.factors.find((x) => x.pts > 0 === won)?.category,
    low: comebackLow(res),
  };
}

/** One of the templates, the same one every time for this game and slot. */
function pick<T>(gid: number, slot: string, list: T[]): T {
  // (mixed again: neighbouring game ids otherwise land on the same template too often)
  let h = hashString(`${slot}:${gid}`);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return list[((h ^ (h >>> 16)) >>> 0) % list.length];
}

/** His last name (his full name when a teammate shares it): the press options and their effects name one player each. */
const lastName = (league: League, b: BoxLine) => (league.players[b.pid] ? shortName(league, league.players[b.pid]) : b.name);

function voiceLine(f: Facts, gid: number, league: League): string {
  const v = f.voice!;
  const name = (b: BoxLine) => lastName(league, b);
  if (f.hurt && f.hurt.pid !== v.pid) {
    return pick(gid, 'hurt', [
      `Seeing ${name(f.hurt)} go down took something out of all of us. We're hoping it's nothing serious.`,
      `${name(f.hurt)} is a big part of what we do. Whoever steps in has to be ready.`,
    ]);
  }
  const comeback = f.low !== undefined && f.low <= COMEBACK_WP;
  if (f.won) {
    if (comeback)
      return pick(gid, 'wcomeback', [
        `Nobody in here flinched, even when it looked bad. We just kept chipping away.`,
        `That's a special win. We were in a deep hole and we climbed out together.`,
        `We stopped worrying about the scoreboard and just got stops. That's how you come back.`,
      ]);
    if (v.pts >= 30)
      return pick(gid, 'w30', [
        `${v.pts}? Honestly, my teammates found me in great spots. I just had to knock them down.`,
        `I was feeling it tonight, and the guys kept feeding me. That's trust.`,
        `When it's going in like that you keep shooting. But the stops won us this one.`,
      ]);
    if (f.upset >= 10)
      return pick(gid, 'wup', [`Nobody outside this locker room thought we'd win this one. We did.`, `We heard all week how good they are. We just went out and played our game.`]);
    if (f.ot) return pick(gid, 'wot', [`Five more minutes and we found another gear. Proud of this group.`, `Overtime is about who wants it more. Tonight that was us.`]);
    if (f.streak >= 3)
      return pick(gid, 'wstreak', [
        `${f.streak} straight. We're not satisfied, though: we want to keep this rolling.`,
        `We're playing for each other right now. ${f.streak} in a row doesn't happen by accident.`,
      ]);
    if (f.margin >= 20)
      return pick(gid, 'wbig', [
        `We set the tone early and never let up. That's how we want to play every night.`,
        `When we defend like that, it's hard for anybody to stay with us.`,
      ]);
    if (f.margin <= 4)
      return pick(gid, 'wclose', [`Games like this show what we're made of. Everybody stayed together down the stretch.`, `We made the plays we had to make late. That's growth.`]);
    return pick(gid, 'w', [
      `Good team win. We moved the ball and got stops when we needed them.`,
      `We did our jobs tonight. On to the next one.`,
      `Everybody chipped in. That's the formula.`,
    ]);
  }
  if (comeback)
    return pick(gid, 'lcollapse', [
      `We had that one, and we let it slip. That's on all of us.`,
      `You can't give a lead like that back in this league. It's going to sting.`,
      `We stopped playing the way that got us the lead. Lesson learned, the hard way.`,
    ]);
  if (v.pts >= 30) return pick(gid, 'l30', [`The points don't matter when we lose. I've got to make the right plays late.`, `I'd trade every one of those points for the win.`]);
  if (f.upset >= 10)
    return pick(gid, 'lup', [`We can't take anybody lightly in this league. Tonight showed that.`, `They wanted it more, and that's on us. It can't happen again.`]);
  if (f.streak <= -3)
    return pick(gid, 'lstreak', [`${-f.streak} in a row hurts. We have to look in the mirror and fix it together.`, `Nobody's coming to save us. We dig out of this as a group.`]);
  if (f.ot || f.margin <= 4)
    return pick(gid, 'lclose', [
      `We had our chances. A couple of plays here or there and it's a different story.`,
      `That one's going to sting. We'll learn from the end of that game.`,
    ]);
  if (f.margin >= 20) return pick(gid, 'lbig', [`That one's on us. We didn't bring the energy and they made us pay.`, `Flush it. That wasn't us out there.`]);
  return pick(gid, 'l', [`They were the better team tonight. We'll watch the film and bounce back.`, `We didn't execute down the stretch. We'll get it fixed.`]);
}

/** The other coach on what decided it, when the report names it. */
const WON_ON: Partial<Record<Factor['category'], string>> = {
  turnovers: 'We took care of the ball and turned their mistakes into points.',
  rebounding: 'We won the glass, and that was the difference.',
  shooting: "We made shots tonight. When we do that, we're dangerous.",
  fouls: "We got to the line and they didn't. That adds up.",
};
const LOST_ON: Partial<Record<Factor['category'], string>> = {
  turnovers: "Too many turnovers. You can't give a good team extra possessions.",
  rebounding: 'They beat us on the glass. That was the game.',
  shooting: "They shot the ball well, and we didn't have an answer.",
  fouls: 'We fouled too much and put them on the line all night.',
};

function coachLine(f: Facts, gid: number, league: League): string {
  // the other coach's view: "they" are the user's team
  const us = `the ${f.usName}`;
  const comeback = f.low !== undefined && f.low <= COMEBACK_WP;
  if (!f.won) {
    if (comeback)
      return pick(gid, 'ccomeback', [
        `Our guys never quit. Down like that, you keep chipping away, and they did.`,
        `That's as resilient as I've seen this group. What a comeback.`,
      ]);
    if (f.theirStar)
      return pick(gid, 'cstar', [
        `${lastName(league, f.theirStar)} was special tonight. When he gets going like that, we're tough to beat.`,
        `We rode ${lastName(league, f.theirStar)}, and he delivered.`,
      ]);
    if (f.upset >= 10) return pick(gid, 'cup', [`People counted us out against a team like ${us}. Our guys believed.`, `Nobody gave us a chance tonight. I love this group.`]);
    if (f.margin >= 20) return pick(gid, 'cbig', [`Our guys came out ready. That was as complete a game as we've played.`, `Everything clicked tonight, on both ends.`]);
    const why = f.decided && WON_ON[f.decided];
    if (why) return why;
    return pick(gid, 'cw', [`Tough, physical game. Credit to ${us}: they made us earn every point.`, `We got enough stops when it mattered. Good win for us.`]);
  }
  if (comeback)
    return pick(gid, 'ccollapse', [
      `We had control of that game and let it get away. That's on me.`,
      `Credit to ${us}: they kept coming, and we stopped doing what built the lead.`,
    ]);
  const v = f.voice;
  if (v && v.pts >= 30)
    return pick(gid, 'cl30', [
      `We threw everything at ${lastName(league, v)}. Sometimes a great player just beats you.`,
      `${lastName(league, v)} was terrific. We have to be better.`,
    ]);
  if (f.upset >= 10) return pick(gid, 'clup', [`We didn't take them seriously enough, and they made us pay.`, `Give ${us} credit. They outworked us.`]);
  if (f.margin >= 20) return pick(gid, 'clbig', [`We got beat in every way tonight. That starts with me.`, `That's not who we are. We'll regroup.`]);
  if (f.ot || f.margin <= 4) return pick(gid, 'clclose', [`Proud of the fight. We just didn't make enough plays at the end.`, `Coin-flip game. It went their way tonight.`]);
  const why = f.decided && LOST_ON[f.decided];
  if (why) return why;
  return pick(gid, 'cl', [`${us.charAt(0).toUpperCase()}${us.slice(1)} played well. We'll regroup.`, `They executed better than we did. Simple as that.`]);
}

/**
 * Post-game quotes for one of the user's games: his player of the game (or best player), and the
 * other team's coach (who talks about what decided it when the game `report` names it).
 */
export function postGameQuotes(league: League, res: GameResult, report?: GameReport | null): Quote[] {
  const f = facts(league, res, report);
  if (!f || !f.voice) return [];
  const out: Quote[] = [];
  const v = f.voice;
  const vp: Player | undefined = league.players[v.pid];
  out.push({
    who: vp ? playerName(vp) : v.name,
    role: f.pogOurs ? 'Player of the game' : vp?.pos ? `${{ PG: 'Guard', SG: 'Guard', SF: 'Forward', PF: 'Forward', C: 'Center' }[vp.pos]}` : 'Player',
    tid: f.us.tid,
    pid: v.pid,
    text: voiceLine(f, res.gid, league),
  });
  const opp = league.teams[f.them.tid];
  out.push({ who: opp.coach.name, role: `${opp.abbrev} head coach`, tid: opp.tid, text: coachLine(f, res.gid, league) });
  return out;
}

// ---------------------------------------------------------------- press conference
//
// One answer after the user's latest game, once (League.press keeps which game was answered). Every
// answer works through the morale model's mood score and nothing else: a lift raises a player's
// on-court multiplier a little (moodPerf) and the weekly morale update fades it again (it keeps 60%
// of the mood each week), so a press-conference effect is a short-term one. What each answer does is
// read from the box score and the players as they stand, never drawn from the league's random stream,
// so the same game always offers the same answers with the same effects:
//
// - Praise <the player of the game>: a bigger lift for him; the teammate whose role he outshone (our
//   usual top scorer, outscored tonight) cools, and so does a starter who had a poor night.
// - Credit the group: a small lift for everyone who played after a win; after a loss it reads as soft
//   and moves nobody.
// - Challenge the team (losses): players in a good mood answer it (a lift); unhappy ones sulk (a hit),
//   the furious more; the rest shrug.
// - Call out <player> (losses, when one of ours clearly struggled): a big swing on him alone, up for a
//   veteran in a good mood who takes it as a challenge, down for anyone else.

export interface PressOption {
  id: PressChoice;
  label: string;
  /** What the answer would do, in a few words ("+ Reaves · − Russell"), from its effects. */
  hint: string;
}

export interface PressEffect {
  pid: number;
  name: string;
  /** Change in mood score (-10..10). */
  delta: number;
}

/** Mood changes, by answer. */
export const PRESS = {
  /** The praised player. */
  praise: 0.8,
  /** The teammate he outshone, and a starter who had a poor night. */
  outshone: -0.3,
  flop: -0.2,
  /** Everyone who played, after a win. */
  group: 0.25,
  /** Challenge the team: players in a good mood (2+), unhappy ones (below -2), furious ones (-5 and below). */
  answer: 0.5,
  sulk: -0.8,
  sulkFurious: -1.2,
  /** Call out: a veteran (30+) in a good mood, anyone else. */
  calloutUp: 1.5,
  calloutDown: -2,
} as const;

/** A starter's night that reads as poor (game score), and one bad enough to call a player out for (with his minutes). */
const POOR_NIGHT = 5;
const STRUGGLED = 3;
const STRUGGLED_MIN = 18;
const VETERAN = 30;
const GOOD_MOOD = 2;

/** Our players in this game who are still on the user's team. */
function ours(league: League, res: GameResult): BoxLine[] {
  const us = userSide(league, res);
  return us ? us.players.filter((b) => b.min > 0 && league.players[b.pid]?.tid === league.userTid) : [];
}

const lostGame = (league: League, res: GameResult) => {
  const us = userSide(league, res);
  return !!us && us.pts < (us === res.home ? res.away : res.home).pts;
};

/** Who "Praise" praises: the player of the game when he's ours, else our best game. */
function praised(league: League, res: GameResult): BoxLine | undefined {
  const played = ours(league, res);
  return played.find((b) => b.pid === res.pog) ?? [...played].sort((a, b) => gameScore(b) - gameScore(a))[0];
}

/** Points a game this season (the kind of game this one was). */
function ppg(league: League, pid: number, res: GameResult): number {
  const p = league.players[pid];
  const s = p ? seasonTotals(p, res.season, res.type === 'playoffs') : null;
  return s && s.gp ? s.pts / s.gp : 0;
}

/**
 * Who cools when the user praises `star`: the teammate whose role he outshone (our usual top scorer,
 * when the praised player outscored him tonight) and a starter who had a poor night.
 */
function cooled(league: League, res: GameResult, star: BoxLine): { outshone?: BoxLine; flop?: BoxLine } {
  const rest = ours(league, res).filter((b) => b.pid !== star.pid);
  const top = [...rest].sort((a, b) => ppg(league, b.pid, res) - ppg(league, a.pid, res) || a.pid - b.pid)[0];
  const outshone = top && ppg(league, top.pid, res) > ppg(league, star.pid, res) && star.pts > top.pts ? top : undefined;
  const flop = rest.filter((b) => b.gs && b !== outshone && gameScore(b) < POOR_NIGHT).sort((a, b) => gameScore(a) - gameScore(b) || a.pid - b.pid)[0];
  return { outshone, flop };
}

/** The player a call-out names: after a loss, ours with the worst night among those who played real minutes, when it was clearly bad. */
export function calloutTarget(league: League, res: GameResult): BoxLine | undefined {
  if (!lostGame(league, res)) return undefined;
  return ours(league, res)
    .filter((b) => b.min >= STRUGGLED_MIN && gameScore(b) <= STRUGGLED)
    .sort((a, b) => gameScore(a) - gameScore(b) || a.pid - b.pid)[0];
}

/** The press conference answers on offer after this game (Challenge and Call out after losses only). */
export function pressOptions(league: League, res: GameResult): PressOption[] {
  if (!userSide(league, res)) return [];
  const star = praised(league, res);
  const lost = lostGame(league, res);
  const target = calloutTarget(league, res);
  const ids: PressChoice[] = [...(star ? (['pog'] as const) : []), 'group', ...(lost ? (['challenge'] as const) : []), ...(target ? (['callout'] as const) : [])];
  const label = (id: PressChoice) =>
    id === 'pog' ? `Praise ${lastName(league, star!)}` : id === 'group' ? 'Credit the group' : id === 'challenge' ? 'Challenge the team' : `Call out ${lastName(league, target!)}`;
  return ids.map((id) => ({ id, label: label(id), hint: pressHint(pressEffects(league, res, id), id === 'group' && lost) }));
}

/** What an answer does to the locker room (see the section's head). Only players still on the user's team count. */
export function pressEffects(league: League, res: GameResult, choice: PressChoice): PressEffect[] {
  const played = ours(league, res);
  if (!played.length) return [];
  const eff = (b: BoxLine, delta: number): PressEffect => ({ pid: b.pid, name: lastName(league, b), delta });
  const mood = (b: BoxLine) => league.players[b.pid].mood.score;
  const lost = lostGame(league, res);
  switch (choice) {
    case 'pog': {
      const star = praised(league, res);
      if (!star) return [];
      const { outshone, flop } = cooled(league, res, star);
      return [eff(star, PRESS.praise), ...(outshone ? [eff(outshone, PRESS.outshone)] : []), ...(flop ? [eff(flop, PRESS.flop)] : [])];
    }
    case 'group':
      return lost ? [] : played.map((b) => eff(b, PRESS.group));
    case 'challenge':
      if (!lost) return [];
      return played.flatMap((b) => (mood(b) >= GOOD_MOOD ? [eff(b, PRESS.answer)] : mood(b) <= -5 ? [eff(b, PRESS.sulkFurious)] : mood(b) < -2 ? [eff(b, PRESS.sulk)] : []));
    case 'callout': {
      const b = calloutTarget(league, res);
      if (!b) return [];
      const p = league.players[b.pid];
      const takesIt = playerAge(p, league.season) >= VETERAN && p.mood.score >= GOOD_MOOD;
      return [eff(b, takesIt ? PRESS.calloutUp : PRESS.calloutDown)];
    }
  }
}

/** The press conference can be held: the user's latest game, not held yet. */
export function pressOpen(league: League, res: GameResult): boolean {
  return !!userSide(league, res) && isLatestUserGame(league, res) && league.press?.gid !== res.gid;
}

/** Hold the press conference: applies the answer's mood changes once and records it. Returns the effects, or null when it can't be held. */
export function holdPress(league: League, res: GameResult, choice: PressChoice): PressEffect[] | null {
  if (!pressOpen(league, res) || !pressOptions(league, res).some((o) => o.id === choice)) return null;
  const effects = pressEffects(league, res, choice);
  for (const e of effects) {
    const p = league.players[e.pid];
    p.mood.score = Math.round(clamp(p.mood.score + e.delta, -10, 10) * 10) / 10;
  }
  league.press = { gid: res.gid, choice };
  return effects;
}

/** Who an effect list names: one or two by name, more as a count. */
const who = (list: PressEffect[]) => (list.length <= 2 ? list.map((e) => e.name).join(', ') : `${list.length} players`);

/** An answer's effect in a few words, for its button: "+ Reaves · − Russell", "+ 9 players", "Reads soft · no change". */
export function pressHint(effects: PressEffect[], soft = false): string {
  const up = effects.filter((e) => e.delta > 0);
  const down = effects.filter((e) => e.delta < 0);
  const parts = [up.length ? `+ ${who(up)}` : '', down.length ? `− ${who(down)}` : ''].filter(Boolean);
  return parts.join(' · ') || (soft ? 'Reads soft · no change' : 'No change');
}

/** The answer's effect once given: "Reaves ▲ mood · Russell ▼ mood". */
export function pressSummary(effects: PressEffect[]): string {
  const up = effects.filter((e) => e.delta > 0);
  const down = effects.filter((e) => e.delta < 0);
  return [up.length ? `${who(up)} ▲ mood` : '', down.length ? `${who(down)} ▼ mood` : ''].filter(Boolean).join(' · ') || 'No change in the room';
}
