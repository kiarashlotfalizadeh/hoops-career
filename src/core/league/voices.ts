// Who people are when they talk: a player's voice in front of a microphone and across a table from
// his team, a coach's, an owner's quirk on top of what he wants, and a rival front office's way of
// doing business. None of it is a mood to manage: nobody is happy or unhappy here, there are no
// promises and no conversations. It is how the same facts sound coming from different people, and
// (for owners and front offices) a small, stated lean in what they value and how often they deal.
// Everything is read from a hash of the league and the person, the same all career.

import type { GmTemper, League, Player, Team } from '../types';
import { hashString, mix32 } from '../random';

const pickBy = <T>(key: string, list: readonly T[]): T => list[mix32(hashString(key)) % list.length];
const unit = (key: string) => mix32(hashString(key)) / 4294967296;

// ---------------------------------------------------------------- players

/** How a player talks to the press. */
export type PlayerVoice = 'showman' | 'stoic' | 'grinder' | 'professor' | 'joker' | 'firebrand';

export const PLAYER_VOICE: Record<PlayerVoice, string> = {
  showman: 'Loves the stage',
  stoic: 'Says little',
  grinder: 'All about the work',
  professor: 'Breaks the game down',
  joker: 'Keeps it light',
  firebrand: 'Says what he thinks',
};

/**
 * A player's voice: his own all career. Leaning on what he is (a high-usage scorer is more often a
 * showman or a firebrand, a veteran a professor, a role player a grinder), never only on it.
 */
export function playerVoice(league: Pick<League, 'id' | 'season'>, p: Pick<Player, 'pid' | 'ovr' | 'bornYear' | 'tend'>): PlayerVoice {
  const w: Record<PlayerVoice, number> = { showman: 1, stoic: 1.2, grinder: 1.2, professor: 0.8, joker: 0.9, firebrand: 0.8 };
  if (p.ovr >= 86) {
    w.showman += 1;
    w.firebrand += 0.6;
  }
  if ((p.tend?.use ?? 1) >= 1.6) w.showman += 0.5;
  if (p.ovr < 78) w.grinder += 1;
  // (his age when the league began: the lean is his for good, it doesn't drift as he ages)
  if (p.bornYear <= league.season - 31) w.professor += 1.2;
  const order = Object.keys(w) as PlayerVoice[];
  let x = unit(`${league.id}:voice:${p.pid}`) * order.reduce((a, k) => a + w[k], 0);
  for (const k of order) if ((x -= w[k]) <= 0) return k;
  return 'stoic';
}

/**
 * The moments a player speaks for himself away from the floor: asking out (short of his minutes, or
 * tired of losing), taking the request back, and across the table in contract talks (a deal done, a
 * counter, a lowball heard, talks broken off).
 */
export type VoiceBeat = 'askRole' | 'askLosing' | 'settled' | 'deal' | 'counter' | 'lowball' | 'walk';

const OFF_COURT: Record<PlayerVoice, Record<VoiceBeat, string[]>> = {
  showman: {
    askRole: ['People pay to watch me play. They cannot watch me sit.', 'I am a headliner. Find me a stage that knows it.'],
    askLosing: ['I belong in games people stay up for. These are not those.', 'Nobody remembers a great player on a team like this. Move me somewhere that matters.'],
    settled: ['The lights are back on. I am staying.', 'I have my stage again. Forget what I said.'],
    deal: ['Tell the building I am not going anywhere.', 'Good. Now put my face on the tickets.'],
    counter: ['I fill buildings. The number should look like it.', 'You are close. Stars cost a little more than close.'],
    lowball: ['Was that a real offer? I thought it was a joke.', 'I have seen what the banners cost. Do not insult me.'],
    walk: ['I am done talking. Somebody will pay for a show.', 'We are finished here. I will be on somebody else’s poster.'],
  },
  stoic: {
    askRole: ['I want to play. I am not playing. Trade me.', 'My minutes are gone. I would like to go too.'],
    askLosing: ['I want to win. That is not happening here.', 'Too much losing. Trade me.'],
    settled: ['I am playing again. The request is withdrawn.', 'It is settled. I will stay.'],
    deal: ['Fine. Where do I sign?', 'Good. Done.'],
    counter: ['Not enough. This is my number.', 'More than that. Not much more.'],
    lowball: ['No.', 'That is not a serious offer.'],
    walk: ['We are done.', 'I have nothing more to say.'],
  },
  grinder: {
    askRole: ['I did everything you asked and the minutes went anyway. Let me earn them somewhere else.', 'I cannot work my way off a bench I am never let off. Trade me.'],
    askLosing: [
      'I will outwork anybody, but the work has to count for something. It does not here.',
      'I give this team everything every night and we are still going nowhere. I want out.',
    ],
    settled: ['I got my minutes back the only way I know how. I am staying.', 'I earned my way back in. Forget the request.'],
    deal: ['Thank you. I will earn every dollar of it.', 'Good. I will be in the gym at six.'],
    counter: ['I have earned more than that, one practice at a time.', 'I am not asking for a gift. I am asking for what the work is worth.'],
    lowball: ['I have bled for this team. That offer says nobody noticed.', 'Nobody outworks me, and that is what you think it is worth?'],
    walk: ['I do not beg. I will go and earn it somewhere else.', 'I am done asking. The work will speak to another team.'],
  },
  professor: {
    askRole: ['My minutes are down and I have not gotten worse. That tells me where this is going.', 'I can read a rotation. I am not in this one, so trade me.'],
    askLosing: [
      'I have looked at this roster and at my age. The two timelines do not meet.',
      'There is no version of this season that ends well, and I do not have many seasons to spend.',
    ],
    settled: ['The situation changed, so my answer does. I am staying.', 'I asked out for a reason, and the reason is gone.'],
    deal: ['The terms are fair to both sides. I will sign.', 'That is the right number and the right length. Agreed.'],
    counter: ['Look at what players like me signed for last summer. I am asking for that.', 'The market sets my price. You are a little under it.'],
    lowball: ['I know what I am worth to the dollar, and so do you. Try again.', 'That figure is not supported by anything. I have checked.'],
    walk: ['We are too far apart for more talk to help. I will see what the market says.', 'We have each said our number three times. It is not going to change today.'],
  },
  joker: {
    askRole: ['I have the best seat in the building. I would like a worse one, on the floor.', 'My warmups are tired of me. Trade me somewhere I get to take them off.'],
    askLosing: ['I have run out of jokes about losing, and I had a lot of them. I want out.', 'Even I cannot keep this locker room laughing. Send me somewhere fun.'],
    settled: ['Never mind. I was being dramatic. I am good.', 'Forget I said anything. I like it here again.'],
    deal: ['Deal. Dinner is on me. Somewhere cheap.', 'Sold. My mother will be thrilled. She wanted more, but she will be thrilled.'],
    counter: ['I have a very expensive dog. Go a little higher.', 'Close. Add a little and I will stop telling this story at parties.'],
    lowball: ['I laughed. Then I saw you were serious.', 'Good one. Now what is the real offer?'],
    walk: ['I love you all, but I am hanging up now.', 'This has been fun. It has not been productive. Bye.'],
  },
  firebrand: {
    askRole: ['I am better than the man playing my minutes, and everybody in that gym knows it. Trade me.', 'Nobody sits me. Not here, not anywhere. Get me out.'],
    askLosing: ['I did not come here to lose and smile about it. Get me out.', 'Somebody here is fine with losing. I am not. Trade me.'],
    settled: ['You fixed it. Good. Do not make me say it twice.', 'Fine. I am staying. Keep it this way.'],
    deal: ['Good. Now go and get me some help.', 'That is what respect looks like. It took you long enough.'],
    counter: ['That is not respect. This is my number.', 'You are paying me like somebody you can replace. You cannot.'],
    lowball: ['Disrespectful. I will remember that number.', 'Is that what you think of me? Say it to my face.'],
    walk: ['We are done. I will make sure you regret it twice a year.', 'I am not hearing another word. You had your chance.'],
  },
};

/**
 * What a player says for himself at one of those moments, in his own voice: the same words for the
 * same moment (`key` tells two of the same kind apart: the season he asked, the offer he heard).
 */
export function playerSays(league: Pick<League, 'id' | 'season'>, p: Pick<Player, 'pid' | 'ovr' | 'bornYear' | 'tend'>, beat: VoiceBeat, key: string | number = ''): string {
  return pickBy(`${league.id}:${p.pid}:says:${beat}:${key}`, OFF_COURT[playerVoice(league, p)][beat]);
}

/** Every line there is for a moment, in every voice (the tests read them). */
export const offCourtLines = (beat: VoiceBeat): string[] => Object.values(OFF_COURT).flatMap((v) => v[beat]);

// ---------------------------------------------------------------- coaches

/** How a head coach talks after a game. */
export type CoachTemper = 'fiery' | 'professor' | 'deadpan' | 'salesman' | 'old-school';

export const COACH_TEMPER: Record<CoachTemper, string> = {
  fiery: 'Wears it on his sleeve',
  professor: 'Talks in film sessions',
  deadpan: 'Gives the press nothing',
  salesman: 'Always selling his group',
  'old-school': 'Toughness first, always',
};

// ---------------------------------------------------------------- owners

/**
 * An owner's quirk, beside what he wants (ownerGoals.ts's personality: builder, win-now, frugal):
 * how he talks and one small lean in how he weighs his goals (QUIRK_LEAN, in ownerGoals.ts).
 */
export type OwnerQuirk = 'meddler' | 'showman' | 'hothead' | 'sentimental' | 'gambler' | 'accountant' | 'ghost' | 'traditionalist';

export const OWNER_QUIRK: Record<OwnerQuirk, { label: string; blurb: string }> = {
  meddler: { label: 'Meddler', blurb: 'has opinions about your rotation' },
  showman: { label: 'Showman', blurb: 'wants a team people talk about' },
  hothead: { label: 'Hothead', blurb: 'takes every loss personally' },
  sentimental: { label: 'Sentimental', blurb: 'falls for his own young players' },
  gambler: { label: 'Gambler', blurb: 'loves a big swing' },
  accountant: { label: 'Accountant', blurb: 'reads the books before the box score' },
  ghost: { label: 'Absentee', blurb: 'calls twice a year, if that' },
  traditionalist: { label: 'Traditionalist', blurb: 'believes in defense and hard practices' },
};

const QUIRKS = Object.keys(OWNER_QUIRK) as OwnerQuirk[];

/** A franchise's owner's quirk: the same every season of a league. */
export const ownerQuirk = (league: Pick<League, 'id'>, tid: number): OwnerQuirk => pickBy(`${league.id}:${tid}:owner-quirk`, QUIRKS);

/** What an owner of this quirk adds to a note, by how things are going. One short line. */
export const QUIRK_LINES: Record<OwnerQuirk, Record<'good' | 'ok' | 'bad', string[]>> = {
  meddler: {
    good: ['I had a thought about the second unit. I will bring a diagram.', 'My nephew thinks we should run more. He may be right.'],
    ok: ['I watched the fourth quarter three times. We should talk about the rotation.', 'I have notes on the closing five. Several pages.'],
    bad: ['I have ideas. I will be at practice tomorrow.', 'I drew up a lineup on a napkin at dinner. It can hardly do worse.'],
  },
  showman: {
    good: ['The building is loud and my phone will not stop. More of this.', 'People stopped me at dinner to talk about this team. That is the business I am in.'],
    ok: ['We are fine. Fine does not sell out a Tuesday.', 'Nobody is talking about us. Give them something to talk about.'],
    bad: ['I can live with losing. I cannot live with being boring.', 'There were empty seats behind the bench last night. I counted.'],
  },
  hothead: {
    good: ['Good. Do not let it go to your head.', 'I threw nothing this month. Keep it that way.'],
    ok: ['I broke a remote during the last road trip. Just so you know where I am.', 'Some nights I cannot watch the fourth quarter. Fix that.'],
    bad: ['I am trying very hard to stay calm. It is not working.', 'I left the last game at halftime. I have never done that in my life.'],
  },
  sentimental: {
    good: ['I love this group. I mean that.', 'These kids remind me why I bought the team.'],
    ok: ['I like our young players more than the standings do. Be patient with them.', 'Do not give up on our kids. I have not.'],
    bad: ['It hurts to watch them struggle. They are good kids.', 'I still believe in this group, even when the scoreboard does not.'],
  },
  gambler: {
    good: ['We are close. One more move and nobody can touch us.', 'I like our hand. I would still raise.'],
    ok: ['Standing still is the only bad bet. Find me a deal.', 'There is a swing out there somewhere. Take it.'],
    bad: ['When the cards are this bad you change the hand. Make calls.', 'I would rather miss big than drift. Do something.'],
  },
  accountant: {
    good: ['Wins are nice. The gate receipts are nicer.', 'I checked the numbers twice. They held up.'],
    ok: ['Every win this month cost more than I would like. Watch it.', 'The ledger and the standings should agree more often.'],
    bad: ['We are paying for wins and getting losses. That is poor value.', 'I read the books before the box score. Both were hard going.'],
  },
  ghost: {
    good: ['I am told it is going well. Carry on.', 'Good news reached me on the boat. Well done.'],
    ok: ['I have been away. Somebody summarized the month for me.', 'I hear it is about what we expected.'],
    bad: ['Even out here I am hearing about it. That is a bad sign.', 'People who never call me are calling me. Fix it.'],
  },
  traditionalist: {
    good: ['We defend, we rebound, we win. As it should be.', 'This team plays the right way. My father would have liked it.'],
    ok: ['Too many threes, not enough floor burns. Practice harder.', 'I would like to see somebody take a charge.'],
    bad: ['In my day a team that soft ran laps until it was not.', 'Nobody dives for anything. That I cannot forgive.'],
  },
};

// ---------------------------------------------------------------- front offices

/** How a rival front office does business (GmTemper): the same for a franchise all league long. */
export type { GmTemper };

export interface GmStyle {
  label: string;
  blurb: string;
  /** What he wants beyond an even deal from the other side, as a share of the deal's value (negative: he'll take a little less). */
  edge: number;
  /** How he values stars he would get (86 OVR and up), draft picks of his own that he would give, and his own long-serving players, against the league's value. */
  star: number;
  ownPick: number;
  ownCore: number;
  /**
   * How readily he deals, against a straight shooter's 1: the share of days he is in the market at all
   * (see takesCalls: against the league's busiest), how often he is then the one who picks up the
   * phone first (aiTrades.ts weighs who shops by it), and, on average over the league's front
   * offices, how many deals a day the league makes.
   */
  busy: number;
  /**
   * Deadline fever: in the deadline's last days (trades.ts's FEVER), what he gives past an even deal,
   * as a share of what he sends, for a trade that brings him its best player. Among AI teams only.
   */
  fever: number;
  /** What he says taking a deal and turning one down. */
  yes: string[];
  no: string[];
}

export const GM_STYLE: Record<GmTemper, GmStyle> = {
  gunslinger: {
    label: 'Gunslinger',
    blurb: 'pays for stars, shrugs at picks',
    edge: 0,
    star: 1.1,
    ownPick: 0.88,
    ownCore: 1,
    busy: 1.25,
    fever: 0.09,
    yes: ['Done. I did not come here to fold.', 'Send the paperwork before I change my mind.'],
    no: ['There is no star in this for me. Call back with one.', 'I do not get out of bed for that.'],
  },
  hoarder: {
    label: 'Pick hoarder',
    blurb: 'treats his firsts like family',
    edge: 0.02,
    star: 0.97,
    ownPick: 1.15,
    ownCore: 1,
    busy: 0.9,
    fever: 0,
    yes: ['Fine. But I counted my picks twice.', 'It works. The picks stay where I can see them.'],
    no: ['You are asking for my picks. People always do.', 'Those picks are not for sale at that price.'],
  },
  loyalist: {
    label: 'Loyalist',
    blurb: 'hates trading his own guys',
    edge: 0.01,
    star: 1,
    ownPick: 1,
    ownCore: 1.12,
    busy: 0.75,
    fever: 0,
    yes: ['It hurts to do it, but it is right for the team.', 'I will make the call to him myself. Deal.'],
    no: ['He has been here a long time. It would take more than that.', 'I do not move my guys for a fair price. Beat it.'],
  },
  shark: {
    label: 'Shark',
    blurb: 'wins the trade or walks',
    edge: 0.06,
    star: 1,
    ownPick: 1.03,
    ownCore: 1,
    busy: 1,
    fever: 0,
    yes: ['I can live with that. Barely.', 'Pleasure doing business. For me.'],
    no: ['I win my trades. This is not one.', 'Try again when it hurts you a little.'],
  },
  tinkerer: {
    label: 'Tinkerer',
    blurb: 'always moving the furniture',
    edge: -0.03,
    star: 1,
    ownPick: 0.97,
    ownCore: 0.96,
    busy: 1.4,
    fever: 0.06,
    yes: ['Sure, let us shake it up.', 'Why not. I was getting bored of this roster.'],
    no: ['Even I cannot make that one work.', 'I like a deal as much as anyone. Not this one.'],
  },
  straight: {
    label: 'Straight shooter',
    blurb: 'fair value, no games',
    edge: 0,
    star: 1,
    ownPick: 1,
    ownCore: 1,
    busy: 1,
    fever: 0,
    yes: ['That is fair. Deal.', 'Works for both of us. Done.'],
    no: ['The value is not there yet.', 'Close, but it is not even.'],
  },
};

const TEMPERS = Object.keys(GM_STYLE) as GmTemper[];

/** A franchise's front office's temper: the league's own record of it, or (a save from before them) drawn from its id. */
export const gmTemper = (league: Pick<League, 'id' | 'gm'>, tid: number): GmTemper => league.gm?.[tid] ?? pickBy(`${league.id}:${tid}:gm`, TEMPERS);

/** Every team's temper for a new league. */
export const drawTempers = (league: Pick<League, 'id' | 'teams'>): Record<number, GmTemper> =>
  Object.fromEntries(league.teams.map((t) => [t.tid, pickBy(`${league.id}:${t.tid}:gm`, TEMPERS)]));

export const gmStyle = (league: Pick<League, 'id' | 'gm'>, tid: number): GmStyle => GM_STYLE[gmTemper(league, tid)];

/** The busiest front office in the league (but the user's): the one that is in the market every day. */
function busiest(league: Pick<League, 'id' | 'gm' | 'teams' | 'userTid'>): number {
  let most = 0;
  for (const t of league.teams) if (t.tid !== league.userTid) most = Math.max(most, gmStyle(league, t.tid).busy);
  return most || 1;
}

/**
 * Whether a front office is in the market today: shopping its own players and taking other teams'
 * calls. The league's busiest always is; the others on the share of days their `busy` is of his (in
 * a league with a tinkerer, a straight shooter about five days in seven, a loyalist a little over
 * half of them), the same answer all day and for every caller: a hash of the league, the day and the
 * team, nothing drawn from the league's stream. A league of one temper is all in, every day.
 */
export function takesCalls(league: Pick<League, 'id' | 'gm' | 'teams' | 'userTid' | 'season' | 'day'>, tid: number): boolean {
  const share = gmStyle(league, tid).busy / busiest(league);
  return share >= 1 || unit(`${league.id}:${league.season}:${league.day}:${tid}:calls`) < share;
}

/** The league's front offices' average `busy` (but the user's team's): a league of tinkerers trades more than one of loyalists. */
export function leagueBusy(league: Pick<League, 'id' | 'gm' | 'teams' | 'userTid'>): number {
  const ai = league.teams.filter((t) => t.tid !== league.userTid);
  return ai.length ? ai.reduce((a, t) => a + gmStyle(league, t.tid).busy, 0) / ai.length : 1;
}

/** "Shark · wins the trade or walks": a front office in a line, for the trade screens. */
export const gmLine = (league: Pick<League, 'id' | 'gm'>, team: Pick<Team, 'tid'>) => {
  const s = gmStyle(league, team.tid);
  return `${s.label} · ${s.blurb}`;
};

/** What a front office says about a deal it took or turned down (the same words for the same deal). */
export const gmSays = (league: Pick<League, 'id' | 'gm'>, tid: number, yes: boolean, key: string | number) =>
  pickBy(`${league.id}:${tid}:gm-says:${key}`, yes ? gmStyle(league, tid).yes : gmStyle(league, tid).no);
