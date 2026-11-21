// What players and the other coach said after one of the user's games. Quotes come from templates
// for what happened (the margin, overtime, a 30-point night, the player of the game, a streak, an
// upset, an injury), picked by a hash of the game id so a game always reads the same and nothing is
// drawn from the league's random stream.

import type { BoxLine, GameResult, League, Player, TeamBox } from '../types';
import { hashString } from '../random';
import { playerName, shortName, teamCity } from '../league/helpers';
import { coachTemper, playerVoice, type CoachTemper, type PlayerVoice } from '../league/voices';
import { decidingFactors, type Factor, type GameReport } from './gameReport';
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

/** Is this the user's latest game? (Streaks and injuries are about the latest one.) */
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
    usName: teamCity(league, us.tid),
    themName: teamCity(league, them.tid),
    voice,
    pogOurs,
    theirStar,
    streak: res.type === 'regular' ? streakAfter(league, res) : 0,
    upset: gap,
    hurt: hurtInGame(league, res, us),
    decided: report ? decidingFactors(report.factors, report.factors.length).find((x) => x.pts > 0 === won)?.category : undefined,
    low: comebackLow(res),
  };
}

/** One of the templates, the same one every time for this game and slot. */
export function pick<T>(gid: number, slot: string, list: T[]): T {
  // (mixed again: neighbouring game ids otherwise land on the same template too often)
  let h = hashString(`${slot}:${gid}`);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return list[((h ^ (h >>> 16)) >>> 0) % list.length];
}

/** His last name (his full name when a teammate shares it): the press options and their effects name one player each. */
const lastName = (league: League, b: BoxLine) => (league.players[b.pid] ? shortName(league, league.players[b.pid]) : b.name);

/** The moments a quote is for: what happened, from the speaker's side. */
type Beat = 'hurt' | 'wcomeback' | 'w30' | 'wup' | 'wot' | 'wstreak' | 'wbig' | 'wclose' | 'w' | 'lcollapse' | 'l30' | 'lup' | 'lstreak' | 'lclose' | 'lbig' | 'l';

/** What a line can name: his points, the streak's length, the other team, a hurt teammate. */
interface Says {
  pts: number;
  n: number;
  them: string;
  mate: string;
}
type Line = (x: Says) => string;

/** What anyone might say: the lines every voice shares. */
const PLAIN: Record<Beat, Line[]> = {
  hurt: [
    (x) => `Seeing ${x.mate} go down took something out of all of us. We're hoping it's nothing serious.`,
    (x) => `${x.mate} is a big part of what we do. Whoever steps in has to be ready.`,
    (x) => `You hate to see ${x.mate} go down like that. We'll hold it together until he's back.`,
  ],
  wcomeback: [
    () => `Nobody in here flinched, even when it looked bad. We just kept chipping away.`,
    () => `We stopped worrying about the scoreboard and just got stops. That's how you come back.`,
    () => `We said at the half: one stop, one basket, and see where we are. It added up.`,
  ],
  w30: [
    (x) => `${x.pts}? My teammates found me in great spots. I just had to knock them down.`,
    () => `When it's going in like that you keep shooting. But the stops won us this one.`,
    (x) => `It felt good tonight, I won't lie. ${x.pts} or ten, I'd take the win either way.`,
  ],
  wup: [
    () => `Nobody outside this locker room thought we'd win this one. We did.`,
    () => `We heard all week how good they are. We just went out and played our game.`,
    () => `That's a really good team over there. Tonight we were a little better.`,
  ],
  wot: [
    () => `Five more minutes and we found another gear. Proud of this group.`,
    () => `Overtime is about who wants it more. Tonight that was us.`,
    () => `We were gassed, they were gassed. We made one more play.`,
  ],
  wstreak: [
    (x) => `${x.n} straight. We're not satisfied, though: we want to keep this rolling.`,
    (x) => `We're playing for each other right now. ${x.n} in a row doesn't happen by accident.`,
  ],
  wbig: [
    () => `We set the tone early and never let up. That's how we want to play every night.`,
    () => `When we defend like that, it's hard for anybody to stay with us.`,
    () => `Everybody who checked in gave us something. That's a complete game.`,
  ],
  wclose: [
    () => `Games like this show what we're made of. Everybody stayed together down the stretch.`,
    () => `We made the plays we had to make late. That's growth.`,
    () => `It wasn't our cleanest game, but we got the stops at the end. Those count the same.`,
  ],
  w: [
    () => `Good team win. We moved the ball and got stops when we needed them.`,
    () => `Everybody chipped in. That's the formula.`,
    () => `We stuck to the game plan and it showed.`,
  ],
  lcollapse: [
    () => `We had that one, and we let it slip. That's on all of us.`,
    () => `You can't give a lead like that back in this league. It's going to sting.`,
    () => `We took our foot off the gas, and a good team made us pay for it.`,
  ],
  l30: [
    () => `The points don't matter when we lose. I've got to make the right plays late.`,
    () => `I'd trade every one of those points for the win.`,
    () => `Individual numbers are for the summer. We needed one more stop, and I didn't get it.`,
  ],
  lup: [
    () => `We can't take anybody lightly in this league. Tonight showed that.`,
    () => `They wanted it more, and that's on us. It can't happen again.`,
    () => `Credit to them. They came in here like it meant something, and we played like it didn't.`,
  ],
  lstreak: [
    (x) => `${x.n} in a row hurts. We have to look in the mirror and fix it together.`,
    () => `Nobody's coming to save us. We dig out of this as a group.`,
    (x) => `${x.n} straight. It's a long season, but it's getting shorter. We need one.`,
  ],
  lclose: [
    () => `We had our chances. A couple of plays here or there and it's a different story.`,
    () => `That one's going to sting. We'll learn from the end of that game.`,
    () => `We did enough to win for most of the night. Most of the night doesn't get it done.`,
  ],
  lbig: [
    () => `That one's on us. We didn't bring the energy and they made us pay.`,
    () => `Flush it. That wasn't us out there.`,
    () => `They punched first and we never answered. We owe our fans a better night.`,
  ],
  l: [
    () => `They were the better team tonight. We'll watch the film and bounce back.`,
    () => `Not our night. We'll be back in the gym tomorrow.`,
    () => `We dug ourselves a hole with too many empty trips. That's fixable.`,
  ],
};

/**
 * The same moments in each player's own voice (league/voices.ts): two times in three he says it his
 * way, where his voice has something for the moment. Three lines or so a moment, so a voice heard
 * for 82 games doesn't say the same thing every Tuesday; no line serves two moments (the tests read
 * a moment's lines to tell which one a game was).
 */
const OWN: Record<PlayerVoice, Partial<Record<Beat, Line[]>>> = {
  showman: {
    hurt: [(x) => `${x.mate} going down quiets a building. We'll put on a show for him when he's back.`],
    wcomeback: [
      () => `Down big on the road with everybody booing? That's my favorite kind of night.`,
      () => `They celebrated early. I saw it. I enjoyed what came next.`,
      () => `You don't leave one of my games early. Ask the people who did.`,
    ],
    w30: [
      (x) => `${x.pts}. And I left a few out there. Tell whoever has us next.`,
      () => `The rim looked like the ocean tonight. I felt bad for them. For a second.`,
      (x) => `Somebody in the front row told me I couldn't shoot. That was around point ${Math.max(2, x.pts - 20)}.`,
      (x) => `${x.pts} tonight. The people paid for a show and I don't give refunds.`,
    ],
    wup: [
      () => `Y'all picked against us. I read all of it. Keep writing.`,
      () => `The favorites were in the other locker room. Go check on them for me.`,
      () => `Big stage, big name across from us. That's when I'm at my best.`,
    ],
    wot: [
      () => `Free basketball. The people paid for forty-eight and got a show.`,
      () => `Overtime means more time on camera. I've never minded that.`,
      () => `Extra minutes, same ending. I like the long version.`,
    ],
    wstreak: [
      (x) => `${x.n} straight. At some point it's not a streak, it's just who we are.`,
      (x) => `${x.n} in a row. We're the best show in the league right now, and the tickets say so.`,
      (x) => `${x.n} and counting. Somebody's going to have to come take it from us.`,
    ],
    wbig: [
      () => `That was over by halftime. The second half was for the highlight reel.`,
      () => `I only played three quarters. I'd like that noted.`,
      () => `I felt bad for the fans who came to see a game. They got a recital.`,
    ],
    wclose: [
      () => `Give me the ball with the game on the line every single time. I sleep fine either way.`,
      () => `Last shot, whole building standing. That's the only place I want to be.`,
      () => `It got loud, it got tight, and I got the ball. That's how it's supposed to go.`,
    ],
    w: [
      () => `We put on a show and we got the win. That's a good night's work.`,
      () => `Two points in the standings and a few for the highlight shows. I'll take both.`,
      () => `The people went home happy. That's the job.`,
    ],
    lcollapse: [() => `We started admiring the lead. I was admiring it too. That's on me.`, () => `We wrote the ending early and they tore it up. Embarrassing.`],
    l30: [
      (x) => `${x.pts} and a loss. Put it in the trash. I mean it.`,
      (x) => `Nobody remembers ${x.pts} in a loss. I won't either.`,
      () => `A big night with the wrong ending. I don't do those twice.`,
    ],
    lup: [
      () => `We showed up for the cameras and forgot there was a game. That's on the guys with the big names, me first.`,
      () => `We spent the week reading our own reviews. They spent it in the gym.`,
    ],
    lstreak: [(x) => `${x.n} straight. Nobody buys a ticket to watch this, and I don't blame them.`, (x) => `${x.n} in a row. I'm not used to being the opening act.`],
    lbig: [
      () => `Embarrassing. I don't do embarrassing. Circle the next one.`,
      () => `I owe the people who came tonight a better one. They'll get it.`,
      () => `That was their show, start to finish. I hated every second of watching it.`,
    ],
    lclose: [
      () => `I had the shot I wanted. I'll take it again tomorrow, and the day after.`,
      () => `Last shot was mine and it didn't go. Give it to me again next time. Same shot.`,
      () => `That's the shot I've made my whole life. Tonight it owed me one.`,
    ],
    l: [() => `They got one. Enjoy it. We see them again.`, () => `Not my best. You'll want to be here for the next one.`, () => `They can have tonight. I've got a long memory.`],
  },
  stoic: {
    hurt: [(x) => `Hope ${x.mate} is all right. That's all.`],
    wcomeback: [() => `We kept playing.`, () => `It was a long game. We used all of it.`, () => `Down a lot. Then less. Then ahead.`],
    w30: [(x) => `${x.pts}. Shots went in. Next game.`, () => `It's one night. I've had bad ones too.`, () => `They left me open. I shot it.`],
    wup: [() => `They're good. We were better tonight.`, () => `Nobody in here was surprised.`, () => `The standings didn't play. We did.`],
    wot: [() => `Took longer. Same result.`, () => `Five more minutes. Fine.`, () => `We were less tired than they were.`],
    wstreak: [(x) => `${x.n}. The next one counts the same.`, (x) => `${x.n} in a row. Doesn't carry over.`, () => `We're playing well. That's all it is.`],
    wbig: [() => `We did our jobs.`, () => `It was over early. That's the idea.`, () => `Good night. Short one.`],
    wclose: [() => `One more stop than them. That's all it was.`, () => `Close game. We closed it.`, () => `It came down to the end. We were there.`],
    w: [() => `A win is a win.`, () => `We'll take it. On to the next.`, () => `We played. We won. Good.`],
    lcollapse: [() => `We stopped doing what worked. Not complicated.`, () => `Had a lead. Lost it.`, () => `We let them back in. Can't do that.`],
    l30: [(x) => `${x.pts}. We lost. Doesn't matter.`, () => `Points didn't help.`, () => `I'd rather have the win.`],
    lup: [() => `We weren't ready. They were.`, () => `Should have won. Didn't.`],
    lstreak: [(x) => `${x.n} losses. Talking won't fix it.`, (x) => `${x.n} straight. We know.`, () => `We have to play better. That's the whole answer.`],
    lbig: [() => `Nothing to say about that one.`, () => `Bad night. Move on.`, () => `They beat us. Badly.`],
    lclose: [() => `Came down to a shot. Theirs went in.`, () => `One play short.`, () => `Close. Not close enough.`],
    l: [() => `They played better. That's it.`, () => `We lost. Next one.`, () => `Not enough tonight.`],
  },
  grinder: {
    hurt: [(x) => `${x.mate} would run through a wall for this team. The rest of us owe him some extra work until he's back.`],
    wcomeback: [
      () => `That's conditioning. That's every wind sprint in September paying us back.`,
      () => `You come back one stop at a time. Nobody in here knows another way.`,
      () => `They got tired. We didn't. That's the off-season talking.`,
    ],
    w30: [
      (x) => `${x.pts} is what happens when you get your shots up at six in the morning. I've been doing that for years.`,
      (x) => `${x.pts}. Every one of those shots I've taken ten thousand times in an empty gym.`,
      () => `Nights like this are built in the summer. I just showed up to collect.`,
    ],
    wup: [
      () => `They've got the names. We've got the bruises. I'll take the bruises.`,
      () => `Talent's nice. They didn't want to box out for forty-eight minutes, and we did.`,
      () => `Nobody gave us this one. We took it off the floor.`,
    ],
    wot: [() => `Overtime is who's in shape. We're in shape.`, () => `Five extra minutes of hard work. I'd have played ten.`, () => `Tired legs on both sides. Ours kept moving.`],
    wstreak: [
      (x) => `${x.n} straight and I promise you practice tomorrow will be the hardest one yet.`,
      (x) => `${x.n} in a row. The work hasn't changed, so the results haven't either.`,
      (x) => `Nobody in here is talking about ${x.n}. We're talking about the next one.`,
    ],
    wbig: [
      () => `We won the loose balls. Count them. That's the game right there.`,
      () => `Up twenty and still diving on the floor. That's the part I'm proud of.`,
      () => `We didn't let up. Letting up is a habit, and it's a bad one.`,
    ],
    wclose: [
      () => `Somebody had to get on the floor for that last one. I've got the floor burn to prove it.`,
      () => `One rebound decided it. I wanted it more than my guy did.`,
      () => `Ugly possession, ugly stop, beautiful win.`,
    ],
    w: [
      () => `Nothing pretty about it. Screens, box-outs, getting back. I love a night like that.`,
      () => `We outworked them. You can coach a lot of things. Not that.`,
      () => `Hard hat game. Those are my favorite.`,
    ],
    lcollapse: [
      () => `We got comfortable. Comfortable gets you beat. I'll be in early tomorrow.`,
      () => `We stopped doing the dirty work with a lead. The lead noticed.`,
      () => `You don't get to rest in this league. We tried to.`,
    ],
    l30: [(x) => `${x.pts} doesn't mean a thing if I miss my box-out late. And I missed it.`, () => `I'll take ten points and a win over that every time.`],
    lup: [() => `We thought showing up was enough. They outworked us, and that should never happen.`, () => `They wanted it and we assumed it. I'm sick about that.`],
    lstreak: [
      (x) => `${x.n} straight losses. You don't talk your way out of that. You work your way out.`,
      (x) => `${x.n} in a row. I'll be in the gym at six. I hope I'm not alone.`,
      () => `The only way out is through. More film, more reps.`,
    ],
    lbig: [
      () => `They wanted every rebound more than we did. I take that personally.`,
      () => `We got outworked. That's the one thing I can't stand to say.`,
      () => `No excuses. They played harder, and it showed on every loose ball.`,
    ],
    lclose: [() => `One loose ball. I had a hand on it. I'll see it all night.`, () => `We did the work for forty-seven minutes. It takes forty-eight.`],
    l: [
      () => `Lost the 50-50 balls, lost the game. It usually goes like that.`,
      () => `We didn't earn it tonight. Simple as that.`,
      () => `Back to work. That's the only answer I've ever had.`,
    ],
  },
  professor: {
    hurt: [(x) => `Losing ${x.mate} changes our spacing and our rotations. We'll have to solve that as a group.`],
    wcomeback: [
      () => `We went under on their screens in the third and it changed everything. Small thing, big swing.`,
      () => `They ran the same three sets all night. By the fourth quarter we were calling them out before they did.`,
      () => `We stopped helping off their shooters. The comeback was that one decision.`,
    ],
    w30: [
      () => `They kept dropping their big, so I kept pulling up. If they adjust, I pass. They never adjusted.`,
      (x) => `It wasn't a hot night, it was a coverage night. They gave me the same look for ${x.pts} points.`,
      () => `Every defense gives you something. Tonight it was the middle of the floor, all game.`,
    ],
    wup: [
      () => `On paper they're better. Paper doesn't have to guard a pick-and-roll for forty-eight minutes.`,
      () => `They have more talent. We had the better plan for their second unit.`,
      () => `We made their best player a passer. Their record is built on him not being one.`,
    ],
    wot: [
      () => `By overtime you know every set they have. It becomes a memory test. We passed.`,
      () => `In overtime both teams run their two best plays. Ours were better.`,
      () => `We saved a look for late and they hadn't seen it. That was the overtime.`,
    ],
    wstreak: [
      (x) => `${x.n} straight isn't luck. Our shot quality has been the best in the league over this stretch.`,
      (x) => `We've won ${x.n} because we've stopped beating ourselves. Fewer turnovers, better shots.`,
    ],
    wbig: [
      () => `We took away their first option on every trip. Most teams don't have a second one.`,
      () => `They wanted to play fast. We made them play in the half court, and they don't have the sets for it.`,
      () => `We won the possession count by a mile. The rest is arithmetic.`,
    ],
    wclose: [
      () => `We got the matchup we wanted on the last three trips. That's not luck, that's the timeout.`,
      () => `The last play had three options. They took away two.`,
      () => `Late in a game it comes down to who gets the switch they want. We got ours.`,
    ],
    w: [
      () => `Shot quality. We got good ones, they got tough ones. Over a night that adds up.`,
      () => `The game plan was right and we executed it. That's rarer than you'd think.`,
      () => `We won the turnover count and the free-throw count. You rarely lose doing both.`,
    ],
    lcollapse: [
      () => `They went zone and we stood around for six minutes. You can see it on the film. We'll all have to watch it.`,
      () => `They changed the coverage at halftime and we kept running the first-half offense.`,
      () => `A lead is a math problem. We stopped doing the math.`,
    ],
    l30: [
      () => `My points came easy and everybody else's came hard. That's a bad offense, whatever my line says.`,
      (x) => `They let me have ${x.pts} and took away everyone else. That was their plan, and it worked.`,
    ],
    lup: [() => `They ran one action we'd never seen from them. We didn't solve it in time.`, () => `We prepared for the team on the scouting report. A different one showed up.`],
    lstreak: [
      (x) => `${x.n} straight, and it's the same two problems every night. We know what they are. Fixing them is the hard part.`,
      () => `The film from this stretch all looks the same. That's the good news and the bad news.`,
    ],
    lclose: [
      () => `Two possessions. A missed box-out and a late switch. That's the margin in this league.`,
      () => `We got the shot we drew up. It's a forty percent shot. Tonight was the sixty.`,
      () => `One blown coverage in the last minute. You can play forty-seven good ones and lose on that.`,
    ],
    lbig: [
      () => `They hunted the same matchup fifteen times and we never changed it. That's on all of us, staff included.`,
      () => `We lost every category that matters. There's no single fix for that.`,
      () => `Their spacing broke our help rules. We need different rules.`,
    ],
    l: [
      () => `We lost the math. More threes for them, more turnovers for us. Hard to win that way.`,
      () => `They got to their spots and we didn't get to ours. That's most of basketball.`,
      () => `Too many long twos, not enough paint touches. The shot chart will say it plainly.`,
    ],
  },
  joker: {
    hurt: [(x) => `${x.mate} is the only one who laughs at my jokes. I need him back for selfish reasons.`],
    wcomeback: [
      () => `I told the guys at halftime we had them right where we wanted them. Nobody laughed. They're laughing now.`,
      () => `We spotted them twenty to make it interesting. I don't recommend it.`,
      () => `My wife turned the game off at halftime. I can't wait to get home.`,
    ],
    w30: [
      (x) => `${x.pts}? My mom's going to say I should've had ${x.pts + 10}. She's undefeated.`,
      () => `I blacked out somewhere in the second quarter. Somebody tell me what happened.`,
      (x) => `${x.pts}. I'd like to thank the guy guarding me. He was very supportive.`,
    ],
    wup: [
      () => `Somebody check on the experts. They looked pale.`,
      () => `I guess nobody told us we were supposed to lose.`,
      () => `They were favored by a lot. I took it personally, eventually.`,
    ],
    wot: [
      () => `I had dinner plans. Worth it, though.`,
      () => `Overtime. Do we get paid extra? Somebody look into that.`,
      () => `I told coach I only stretch for forty-eight. He didn't laugh.`,
    ],
    wstreak: [
      (x) => `${x.n} in a row. I haven't washed these socks since the first one. Don't stand too close.`,
      (x) => `${x.n} straight. I've eaten the same sandwich before every one of them. I'm so tired of that sandwich.`,
      (x) => `${x.n} wins. Even I'm running out of ways to mess this up.`,
    ],
    wbig: [
      () => `Our bench played so much they asked for a raise at the buzzer.`,
      () => `I was in my sweats by the fourth quarter. Best seat in the house.`,
      () => `That one was over so early I started thinking about dinner in the third.`,
    ],
    wclose: [
      () => `My heart can't take many more of those. I'm not as young as my haircut.`,
      () => `I aged about four years in the last minute. Worth it.`,
      () => `I closed my eyes on the last shot. Don't tell coach.`,
    ],
    w: [
      () => `We won, the music's loud, and I'm not buying dinner. Good night.`,
      () => `A win's a win. I was mostly there for moral support.`,
      () => `Everybody's happy, nobody's hurt, and the plane has snacks. Great night.`,
    ],
    lcollapse: [() => `We had a big lead and I started planning my evening. That's on me.`, () => `We gave that one away like it was a birthday present.`],
    l30: [(x) => `${x.pts} points and a loss. It's like winning the lottery and losing the ticket.`, () => `Great night for my fantasy owners. Bad night for everything else.`],
    lup: [
      () => `We lost to a team I couldn't have named three players on. That's not funny. It's a little funny.`,
      () => `I tried a joke on the bench in the fourth. Nobody laughed. Fair enough.`,
    ],
    lstreak: [(x) => `${x.n} straight. I'd make a joke but my material's on a losing streak too.`, (x) => `${x.n} in a row. I've stopped reading my phone. And my mail.`],
    lbig: [
      () => `I've seen the film already. I was in it. It's a horror movie.`,
      () => `The good news is it only counts as one loss. I checked.`,
      () => `They beat us so badly I think I owe them rent.`,
    ],
    lclose: [
      () => `I thought that last one was good. So did my eyes. The rim disagreed.`,
      () => `One point. I've lost more than that in my couch.`,
      () => `So close. I'm going to go stare at a wall for a while.`,
    ],
    l: [
      () => `They hit everything. A guy made one off the shot clock, I think. Not our night.`,
      () => `We lost. The post-game spread was good, though. Small wins.`,
      () => `Tough one. I'm blaming the socks.`,
    ],
  },
  firebrand: {
    hurt: [(x) => `That was a dirty play on ${x.mate} and everybody in the building saw it. The league can check the tape.`],
    wcomeback: [
      () => `People left early. I hope the traffic was terrible.`,
      () => `They were laughing on their bench in the second quarter. I watched them stop.`,
      () => `Count us out again. Go ahead. See how it goes.`,
    ],
    w30: [
      (x) => `${x.pts}, and I'm still not on the national broadcast. Explain that to me.`,
      () => `Their guy was talking all night. Ask him how the fourth quarter went.`,
      (x) => `${x.pts}. Put that next to the names they rank ahead of me.`,
    ],
    wup: [
      () => `Nobody respects us. Fine. Keep doing it. It's working out great.`,
      () => `They looked past us. You could see it in warmups. Big mistake.`,
      () => `Every show picked them. Every one. I keep a list.`,
    ],
    wot: [() => `That game should have ended in regulation, and the officials know why it didn't.`, () => `They got five extra minutes and still couldn't beat us.`],
    wstreak: [
      (x) => `${x.n} straight and the rankings still have us behind teams we beat. Say something.`,
      (x) => `${x.n} in a row. Where's everybody who had us dead in the fall?`,
      (x) => `We've won ${x.n} and I haven't heard one apology.`,
    ],
    wbig: [
      () => `They quit in the third. I don't respect that and I told them so.`,
      () => `That's what happens when a team talks all week. We heard every word.`,
      () => `We could've won by forty. Next time maybe we will.`,
    ],
    wclose: [
      () => `We got that one in spite of the whistle. I'll take the fine.`,
      () => `They wanted no part of the last two minutes. We did.`,
      () => `Close game on the road, three guys with whistles, and we still won.`,
    ],
    w: [
      () => `We're better than people say. We'll keep showing it until somebody admits it.`,
      () => `Another win nobody will talk about tomorrow. I'm used to it.`,
      () => `We handled our business. Put it on the shows. You won't.`,
    ],
    lcollapse: [
      () => `We got soft with a lead. I said it in the locker room and I'll say it here.`,
      () => `That's a gutless way to lose a game. All of us. Me too.`,
      () => `We let go of the rope. I don't play with people who let go of the rope.`,
    ],
    l30: [(x) => `${x.pts} and I got four free throws. Watch the tape and tell me that's right.`, (x) => `I gave ${x.pts}. I need more from this locker room, and they know it.`],
    lup: [() => `We lost to a team we should beat by twenty. Somebody needs to be angry about that. I am.`, () => `We disrespected the game tonight and it paid us back.`],
    lstreak: [
      (x) => `${x.n} straight. Some guys in there are too comfortable losing. I'm not one of them.`,
      (x) => `${x.n} in a row and I've heard a lot of excuses. I'm done listening to them.`,
      () => `Somebody has to say it, so I will: this isn't good enough, top to bottom.`,
    ],
    lbig: [
      () => `No effort. None. If that doesn't bother you, you're in the wrong business.`,
      () => `I've never been that embarrassed on a basketball court.`,
      () => `Some of us competed tonight. I could count them on one hand.`,
    ],
    lclose: [
      () => `We played five on eight in the last minute. That's all I'll say.`,
      () => `I'll get fined if I answer that honestly. So, no comment.`,
      () => `We earned that game and somebody else decided it.`,
    ],
    l: [
      () => `They did nothing special. We beat ourselves. That's worse.`,
      () => `I'm not giving them credit. We were bad. Start there.`,
      () => `We'll see them again. Write the date down.`,
    ],
  },
};

/** Every line a player might say for a moment, in any voice, and every line the other coach might (the tests read them). */
export const quoteLines = (beat: Beat, x: Says): string[] => [...PLAIN[beat], ...Object.values(OWN).flatMap((v) => v[beat] ?? [])].map((f) => f(x));
export const benchLines = (beat: CoachBeat, x: { us: string; star: string; pts: number }): string[] =>
  Object.values(BENCH)
    .flatMap((v) => v[beat] ?? [])
    .map((f) => f(x));

/** The moment a game was, from our locker room. */
function beatOf(f: Facts): Beat {
  const v = f.voice!;
  if (f.hurt && f.hurt.pid !== v.pid) return 'hurt';
  const comeback = f.low !== undefined && f.low <= COMEBACK_WP;
  if (f.won) {
    if (comeback) return 'wcomeback';
    if (v.pts >= 30) return 'w30';
    if (f.upset >= 10) return 'wup';
    if (f.ot) return 'wot';
    if (f.streak >= 3) return 'wstreak';
    if (f.margin >= 20) return 'wbig';
    if (f.margin <= 4) return 'wclose';
    return 'w';
  }
  if (comeback) return 'lcollapse';
  if (v.pts >= 30) return 'l30';
  if (f.upset >= 10) return 'lup';
  if (f.streak <= -3) return 'lstreak';
  if (f.ot || f.margin <= 4) return 'lclose';
  if (f.margin >= 20) return 'lbig';
  return 'l';
}

function voiceLine(f: Facts, gid: number, league: League): string {
  const v = f.voice!;
  const beat = beatOf(f);
  const says: Says = { pts: v.pts, n: Math.abs(f.streak), them: f.themName, mate: f.hurt ? lastName(league, f.hurt) : '' };
  const p = league.players[v.pid];
  const own = p ? OWN[playerVoice(league, p)][beat] : undefined;
  // (two times in three in his own voice, when it has a line for the moment)
  const mine = own?.length && pick(gid, `own:${beat}`, [true, true, false]);
  return pick(gid, beat, mine ? own! : PLAIN[beat])(says);
}

/** The other coach on what decided it, when the report names it. */
const WON_ON: Partial<Record<Factor['category'], string[]>> = {
  turnovers: [
    'We took care of the ball and turned their mistakes into points.',
    'We made them pay for every turnover. That was the game.',
    'Our hands were active tonight, and the steals turned into easy ones.',
  ],
  rebounding: [
    'We won the glass, and that was the difference.',
    'Second chances. We kept getting them, and they kept hurting.',
    'We were tougher on the boards tonight. Simple as that.',
  ],
  shooting: ["We made shots tonight. When we do that, we're dangerous.", 'The ball was moving and the shots were falling.', 'Our shooters got good looks and knocked them down.'],
  fouls: [
    "We got to the line and they didn't. That adds up.",
    'We kept attacking the rim, and the free throws came.',
    'We put pressure on the rim all night. The whistle followed.',
  ],
};
const LOST_ON: Partial<Record<Factor['category'], string[]>> = {
  turnovers: [
    "Too many turnovers. You can't give a good team extra possessions.",
    "We kept giving it away, and they kept running. That's the game.",
    "We were careless with the ball. That's on us to clean up.",
  ],
  rebounding: [
    'They beat us on the glass. That was the game.',
    "We didn't finish our defense with the rebound, and they made us pay.",
    'Too many second chances for them. We have to box out.',
  ],
  shooting: ["They shot the ball well, and we didn't have an answer.", "We didn't make shots tonight, and they did.", "We got some good looks. They just didn't go down."],
  fouls: [
    'We fouled too much and put them on the line all night.',
    'We were reaching instead of moving our feet. The free throws added up.',
    "They lived at the line. We've got to defend without fouling.",
  ],
};

function coachLine(f: Facts, gid: number, league: League): string {
  // the other coach's view: "they" are the user's team
  const us = f.usName;
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
    if (why) return pick(gid, 'cwon', why);
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
      `${v.pts} for ${lastName(league, v)}. We'll look at what we could have done differently on him.`,
      `You live with some of those. ${lastName(league, v)} made a lot of tough shots.`,
    ]);
  if (f.upset >= 10) return pick(gid, 'clup', [`We didn't take them seriously enough, and they made us pay.`, `Give ${us} credit. They outworked us.`]);
  if (f.margin >= 20) return pick(gid, 'clbig', [`We got beat in every way tonight. That starts with me.`, `That's not who we are. We'll regroup.`]);
  if (f.ot || f.margin <= 4) return pick(gid, 'clclose', [`Proud of the fight. We just didn't make enough plays at the end.`, `Coin-flip game. It went their way tonight.`]);
  const why = f.decided && LOST_ON[f.decided];
  if (why) return pick(gid, 'clost', why);
  return pick(gid, 'cl', [`${us.charAt(0).toUpperCase()}${us.slice(1)} played well. We'll regroup.`, `They executed better than we did. Simple as that.`]);
}

/** The moments the other coach speaks to: `c…` he won, `cl…` he lost. */
type CoachBeat = 'ccomeback' | 'cstar' | 'cup' | 'cbig' | 'cw' | 'ccollapse' | 'cl30' | 'clup' | 'clbig' | 'clclose' | 'cl';

function coachBeat(f: Facts): CoachBeat {
  const comeback = f.low !== undefined && f.low <= COMEBACK_WP;
  if (!f.won) return comeback ? 'ccomeback' : f.theirStar ? 'cstar' : f.upset >= 10 ? 'cup' : f.margin >= 20 ? 'cbig' : 'cw';
  if (comeback) return 'ccollapse';
  if (f.voice && f.voice.pts >= 30) return 'cl30';
  return f.upset >= 10 ? 'clup' : f.margin >= 20 ? 'clbig' : f.ot || f.margin <= 4 ? 'clclose' : 'cl';
}

/** The same moments as each kind of coach says them (league/voices.ts): `us` is the user's team, `star` the player the night belonged to. */
const BENCH: Record<CoachTemper, Partial<Record<CoachBeat, ((x: { us: string; star: string; pts: number }) => string)[]>>> = {
  fiery: {
    ccomeback: [
      () => `I broke a clipboard at halftime. Best clipboard I ever broke.`,
      () => `I said some things at the half I'll have to apologize for. They worked.`,
      () => `Down like that, you find out who's a fighter. I've got a room full of them.`,
    ],
    cstar: [
      (x) => `${x.star} was an animal tonight. I've been telling you people for months.`,
      (x) => `${x.pts} from ${x.star}. I nearly ran out there and hugged him mid-game.`,
      (x) => `You saw ${x.star}. Don't ask me a question about him. Just write it down.`,
    ],
    cup: [
      () => `Everybody wrote us off. I pinned it on the wall. It's coming down now.`,
      () => `Nobody believed in this group but this group. I want that in every paper.`,
      () => `I read what they said about us this week. Out loud. Before the game.`,
    ],
    cbig: [
      () => `That's the team I yell about in practice. Finally.`,
      () => `I had nothing to scream about in the fourth. I screamed anyway.`,
      () => `Forty-eight minutes of what I've been begging for.`,
    ],
    cw: [
      (x) => `${x.us} hit us in the mouth and we hit back. I loved every minute.`,
      () => `That was a fight and we won it. Give me that over pretty every night.`,
      () => `My voice is gone and we won. Good trade.`,
    ],
    ccollapse: [
      () => `We choked. I'm not dressing it up. We had it and we choked.`,
      () => `I'm sick. Physically sick. You can't lose a game like that.`,
      (x) => `Credit ${x.us}. Now excuse me, I've got a locker room to go back into.`,
    ],
    cl30: [
      (x) => `${x.pts} for ${x.star}. I ran out of things to scream.`,
      (x) => `We let ${x.star} get comfortable in the first quarter. You can't do that, and I said so. Loudly.`,
      (x) => `Somebody has to stand in front of ${x.star} and want to be there. Nobody did.`,
    ],
    clup: [
      () => `That was a disgrace, and I told them in words I can't repeat here.`,
      () => `We disrespected a professional basketball team tonight and got exactly what we deserved.`,
    ],
    clbig: [
      () => `If I could have subbed out all five at once, I would have.`,
      () => `I've been in this league a long time. I've never been angrier at halftime.`,
      () => `There will be a film session tomorrow. It will not be short.`,
    ],
    clclose: [
      () => `I've got some thoughts on the last whistle. My wallet says keep them to myself.`,
      () => `We fought. I'll never be mad at a team that fights. I'm mad at one or two other people.`,
      () => `One possession. I'll be awake until four thinking about it.`,
    ],
    cl: [
      () => `Not good enough. Not close to good enough. Practice is at seven.`,
      () => `We were flat, and flat is on me. It won't happen twice.`,
      () => `I didn't like our body language and I told them at every timeout.`,
    ],
  },
  professor: {
    ccomeback: [
      () => `We changed the coverage at the half and took away their first read. The rest followed from that.`,
      () => `We found a matchup in the third quarter and went to it eleven straight times.`,
      () => `The comeback was two adjustments: who guarded their point guard, and where we sent help from.`,
    ],
    cstar: [
      (x) => `We got ${x.star} the same look nine times because they never took it away.`,
      (x) => `${x.star} read every coverage correctly. That's rarer than making the shots.`,
      (x) => `They chose single coverage on ${x.star}. I understand why. It was the wrong choice.`,
    ],
    cup: [
      () => `Their record comes from transition. We took transition away, and what was left was a fair fight.`,
      () => `We had a specific plan for their best action. The players ran it nearly perfectly.`,
    ],
    cbig: [
      () => `Our shot profile was excellent. When you win the math by that much, the score takes care of itself.`,
      () => `We won all four factors. That happens perhaps five times a season.`,
      () => `Their sets depend on one screen. We took the screen away.`,
    ],
    cw: [
      (x) => `${x.us} is well coached. We found one edge in the second half and stayed on it.`,
      () => `It was a possession game. We had three more of them.`,
      () => `We made one more adjustment than they did. Most nights that's the margin.`,
    ],
    ccollapse: [
      () => `They changed the matchup and we were two possessions late answering. That's my job, not the players'.`,
      () => `We kept running what had worked after it stopped working. I should have gone away from it sooner.`,
      (x) => `${x.us} went small, and I didn't have an answer ready. I will next time.`,
    ],
    cl30: [
      (x) => `We tried four coverages on ${x.star}. He solved each one. That's a great player reading the game.`,
      (x) => `${x.star} punished every decision we made. Help and he passed, stay home and he scored.`,
      (x) => `${x.pts} for ${x.star}, most of it on the play we practiced against all week. That part bothers me.`,
    ],
    clup: [
      () => `They ran an action we hadn't prepared for, and I didn't adjust quickly enough.`,
      () => `We scouted their season. They played a different game tonight, and it was a good one.`,
    ],
    clbig: [
      () => `They got the shots they wanted and we got the shots they wanted us to take. That's a staff problem first.`,
      () => `Our help rules didn't hold up against their spacing. We'll rewrite them.`,
      () => `We lost every category. When that happens the plan was wrong, and the plan is mine.`,
    ],
    clclose: [
      () => `One possession. We had the right play and the wrong spacing. We'll drill it.`,
      () => `The last play was the right call. I'd make it again. The execution was half a step off.`,
      () => `Games like that are decided by two or three details. We lost the details.`,
    ],
    cl: [
      (x) => `Credit to ${x.us}. They had a better plan tonight, and I mean that literally.`,
      () => `We gave up too many corner threes. That's a scheme issue and it's fixable.`,
      () => `They won the middle of the floor. Everything else came from that.`,
    ],
  },
  deadpan: {
    ccomeback: [() => `We were behind. Then we weren't.`, () => `It looked bad. It got better.`, () => `They scored a lot early. We scored a lot late.`],
    cstar: [(x) => `${x.star} played well.`, (x) => `${x.star} had ${x.pts}. That helped.`, (x) => `We gave ${x.star} the ball. It worked.`],
    cup: [() => `We won. I'm told that's a surprise.`, () => `They were favored. We weren't. Here we are.`, () => `I don't read the predictions. Apparently they were wrong.`],
    cbig: [() => `We scored more than they did. By a lot.`, () => `It went well.`, () => `I have no complaints. That's rare.`],
    cw: [() => `Fine. Next question.`, () => `We won. That's the summary.`, () => `It was a basketball game. We had more points.`],
    ccollapse: [() => `We had a lead. We don't have it anymore.`, () => `It was going well. Then it wasn't.`, () => `I've seen the film already. In person. Live.`],
    cl30: [(x) => `${x.star} scored ${x.pts}. I was there. I saw it.`, (x) => `We had a plan for ${x.star}. He had a better one.`, (x) => `${x.star} made shots. A lot of them.`],
    clup: [() => `We lost to a team we were supposed to beat. It happens. It shouldn't.`, () => `They were better. Tonight. Somehow.`],
    clbig: [() => `We lost. Next question.`, () => `It was not close. I noticed.`, () => `I'd describe it, but you were here.`],
    clclose: [() => `Ball didn't go in. That happens.`, () => `One shot. Theirs.`, () => `Close game. We came second.`],
    cl: [() => `They were better. I don't have a second sentence.`, () => `We lost. I'll have more after the film. Probably not.`, () => `Not our night. That covers it.`],
  },
  salesman: {
    ccomeback: [
      () => `This group never stops believing. Best locker room I've ever had, and I've had some great ones.`,
      () => `I looked at their faces at halftime and I knew. I knew. You can't teach that.`,
      () => `That's a championship comeback. I don't use that word lightly. I do use it often.`,
    ],
    cstar: [
      (x) => `${x.star} is a superstar. Not becoming one. Is one. Write it down.`,
      (x) => `I wouldn't trade ${x.star} for anybody in this league. Anybody. Ask me again tomorrow, same answer.`,
      (x) => `${x.pts} for ${x.star}, and he's the hardest worker we have. That's the best part.`,
    ],
    cup: [
      () => `I've said since camp this team is special. Tonight the rest of the league found out.`,
      () => `People are going to call that an upset. In our building we call it Tuesday.`,
      () => `This is what I've been telling you about. This, right here.`,
    ],
    cbig: [
      () => `That's who we are. That's the standard. I couldn't be prouder.`,
      () => `If we play like that, there isn't a team in this league I'm worried about.`,
      () => `Every single guy contributed. Every one. I love this team.`,
    ],
    cw: [
      () => `Another step. We're building something here and nights like this are the proof.`,
      () => `Great win. Great group. I say it every night because it's true every night.`,
      (x) => `Beating ${x.us} tells you where this program is headed. Up.`,
    ],
    ccollapse: [
      () => `We'll grow from this. I honestly think this loss makes us better in April.`,
      () => `For three quarters that was the best basketball we've played. I'm taking that with me.`,
      () => `Young teams have to learn to close. Tonight was tuition.`,
    ],
    cl30: [
      (x) => `${x.star} was terrific, but I loved our fight. Loved it.`,
      (x) => `Sometimes you tip your cap. ${x.star} earned it. I still like where we are.`,
      (x) => `Take away ${x.star} and we win by ten. I know you can't. I'm just saying.`,
    ],
    clup: [
      () => `Honestly? I think we needed that. A little humility in March is worth a lot in May.`,
      () => `Give them credit. And give us credit for how we'll respond, because I already know.`,
    ],
    clbig: [
      () => `One bad night doesn't change what I know about this group.`,
      () => `Flush it. Great teams have a couple of those a year, and we're a great team.`,
      () => `I'd be worried if I didn't know these guys. I know these guys.`,
    ],
    clclose: [
      () => `We were a bounce away from beating a very good team. I'm encouraged. I really am.`,
      () => `If we get that shot ten times we win nine. I'll take those odds all season.`,
      () => `That's a win in every way except the one on the scoreboard.`,
    ],
    cl: [
      () => `There was a lot to like in that game. No, really.`,
      () => `We're closer than that score says. Much closer.`,
      () => `I saw things tonight that are going to win us games next month.`,
    ],
  },
  'old-school': {
    ccomeback: [
      () => `We got on the floor for loose balls. Funny how the shots start falling after that.`,
      () => `We started hitting people on box-outs in the third. The scoreboard followed.`,
      () => `Nothing fancy. We guarded somebody. That's the whole comeback.`,
    ],
    cstar: [
      (x) => `${x.star} got his the hard way, at the rim, through contact. That's a ballplayer.`,
      (x) => `${x.star} didn't take a play off on either end. The ${x.pts} is the least of it.`,
      (x) => `You build a team around a man like ${x.star}. He'd have played in any era.`,
    ],
    cup: [
      () => `They've got more talent. We've got more guys who'll take a charge.`,
      () => `Talent wins in the summer. Toughness wins in the winter.`,
      () => `We outrebounded a better team. That's all an upset has ever been.`,
    ],
    cbig: [
      () => `We defended and we rebounded. The rest is decoration.`,
      () => `Held them under their average by plenty. I don't care what we scored.`,
      () => `That's a full day's work from everybody who checked in.`,
    ],
    cw: [
      (x) => `That was a street fight, and I like our chances in those. Hats off to ${x.us}.`,
      () => `We won the glass and we won the game. It's not complicated.`,
      () => `Nobody on my bench was looking at the stat sheet. They were looking at the scoreboard.`,
    ],
    ccollapse: [
      () => `We stopped guarding people. You can't shoot your way out of that.`,
      () => `We got fancy with a lead. Fancy loses.`,
      () => `Up big and we quit boxing out. I've seen that movie for forty years.`,
    ],
    cl30: [
      (x) => `Nobody put a body on ${x.star} all night. In my day somebody would have.`,
      (x) => `${x.star} walked into every shot he wanted. Not one hard foul. That's on us.`,
      (x) => `${x.pts} for ${x.star}. You don't stop a man like that with a clipboard. You stop him with your chest.`,
    ],
    clup: [() => `They wanted it more. I never thought I'd say that about one of my teams.`, () => `We showed up expecting to be handed a win. Nobody hands you anything.`],
    clbig: [
      () => `Soft. Start to finish. We'll fix that in practice, and they won't enjoy it.`,
      () => `We got pushed around. I can live with missing shots. I can't live with that.`,
      () => `Bring your sneakers tomorrow. All of them.`,
    ],
    clclose: [
      () => `You lose the glass late, you lose the game. Same as it was fifty years ago.`,
      () => `One box-out. That's the game. It's always one box-out.`,
      () => `We missed free throws. You can't miss free throws and win close games. Never could.`,
    ],
    cl: [
      () => `We got out-toughed. No chalkboard fixes that.`,
      () => `They were the harder-working team. That stings more than the score.`,
      () => `Not enough defense. It's always not enough defense.`,
    ],
  },
};

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
  // (the other coach in his own manner two times in three, where it has a line for the night)
  const cb = coachBeat(f);
  const bench = BENCH[coachTemper(opp.coach.name)][cb];
  const star = cb === 'cstar' ? f.theirStar : cb === 'cl30' ? f.voice : undefined;
  const benchLine =
    bench?.length && pick(res.gid, `bench:${cb}`, [true, true, false])
      ? pick(res.gid, `b:${cb}`, bench)({ us: f.usName, star: star ? lastName(league, star) : '', pts: star?.pts ?? 0 })
      : coachLine(f, res.gid, league);
  out.push({ who: opp.coach.name, role: `${opp.abbrev} head coach`, tid: opp.tid, text: benchLine.charAt(0).toUpperCase() + benchLine.slice(1) });
  return out;
}
