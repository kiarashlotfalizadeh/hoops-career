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

// (how each talks is part of the voice: the showman, the grinder, the joker and the firebrand talk in
// contractions, the stoic and the professor never do. Three lines a moment, so two players of a voice
// asking out in one season, or one man's second contract, don't say the same thing.)
const OFF_COURT: Record<PlayerVoice, Record<VoiceBeat, string[]>> = {
  showman: {
    askRole: ["People pay to watch me play. They can't watch me sit.", "I'm a headliner. Find me a stage that knows it.", "You don't put the main act on the bench. Move me."],
    askLosing: [
      "I belong in games people stay up for. These aren't those.",
      'Nobody remembers a great player on a team like this. Move me somewhere that matters.',
      "I'm putting on a show for an empty house. Get me to a full one.",
    ],
    settled: ["The lights are back on. I'm staying.", "I've got my stage again. Forget what I said.", "They're cheering again. I can work with that."],
    deal: ["Tell the building I'm not going anywhere.", 'Good. Now put my face on the tickets.', 'Done. Somebody call the billboard people.'],
    counter: ['I fill buildings. The number should look like it.', "You're close. Stars cost a little more than close.", 'Count the jerseys in the crowd, then come back.'],
    lowball: ['Was that a real offer? I thought it was a joke.', "I've seen what the banners cost. Don't insult me.", 'You want a headliner at an opening-act price.'],
    walk: ["I'm done talking. Somebody will pay for a show.", "We're finished here. I'll be on somebody else's poster.", "That's it. Enjoy the quiet in here next year."],
  },
  stoic: {
    askRole: ['I want to play. I am not playing. Trade me.', 'My minutes are gone. I would like to go too.', 'I do not sit well. Move me.'],
    askLosing: ['I want to win. That is not happening here.', 'Too much losing. Trade me.', 'I have lost enough. Send me somewhere else.'],
    settled: ['I am playing again. The request is withdrawn.', 'It is settled. I will stay.', 'Things changed. I am staying.'],
    deal: ['Fine. Where do I sign?', 'Good. Done.', 'Agreed.'],
    counter: ['Not enough. This is my number.', 'More than that. Not much more.', 'Higher.'],
    lowball: ['No.', 'That is not a serious offer.', 'Try again.'],
    walk: ['We are done.', 'I have nothing more to say.', 'Goodbye.'],
  },
  grinder: {
    askRole: [
      'I did everything you asked and the minutes went anyway. Let me earn them somewhere else.',
      "I can't work my way off a bench I'm never let off. Trade me.",
      "I don't need the ball. I need minutes, and I'm not getting them here.",
    ],
    askLosing: [
      "I'll outwork anybody, but the work has to count for something. It doesn't here.",
      "I give this team everything every night and we're still going nowhere. I want out.",
      "I don't mind hard. I mind pointless. Move me.",
    ],
    settled: ["I got my minutes back the only way I know how. I'm staying.", 'I earned my way back in. Forget the request.', "I'm back on the floor. That's all I ever asked for."],
    deal: ["Thank you. I'll earn every dollar of it.", "Good. I'll be in the gym at six.", "Deal. Now I've got to go and be worth it."],
    counter: [
      "I've earned more than that, one practice at a time.",
      "I'm not asking for a gift. I'm asking for what the work is worth.",
      "Add a little. I'll pay it back in floor burns.",
    ],
    lowball: [
      "I've bled for this team. That offer says nobody noticed.",
      "Nobody outworks me, and that's what you think it's worth?",
      "I don't take plays off. Don't take money off.",
    ],
    walk: ["I don't beg. I'll go and earn it somewhere else.", "I'm done asking. The work will speak to another team.", "All right. I'll be in somebody else's gym at six."],
  },
  professor: {
    askRole: [
      'My minutes are down and I have not gotten worse. That tells me where this is going.',
      'I can read a rotation. I am not in this one, so trade me.',
      'A player my age learns nothing from the bench. I would like to be moved.',
    ],
    askLosing: [
      'I have looked at this roster and at my age. The two timelines do not meet.',
      'There is no version of this season that ends well, and I do not have many seasons to spend.',
      'I have done the arithmetic on this season. It does not come out. Trade me.',
    ],
    settled: [
      'The situation changed, so my answer does. I am staying.',
      'I asked out for a reason, and the reason is gone.',
      'The facts are different now, and so is my position. I will stay.',
    ],
    deal: [
      'The terms are fair to both sides. I will sign.',
      'That is the right number and the right length. Agreed.',
      'Both sides gave a little. That is how a good contract reads. I accept.',
    ],
    counter: [
      'Look at what players like me signed for last summer. I am asking for that.',
      'The market sets my price. You are a little under it.',
      'Your figure leaves out two seasons of evidence. Mine does not.',
    ],
    lowball: [
      'I know what I am worth to the dollar, and so do you. Try again.',
      'That figure is not supported by anything. I have checked.',
      'I assume that was an opening position. Open again.',
    ],
    walk: [
      'We are too far apart for more talk to help. I will see what the market says.',
      'We have each said our number three times. It is not going to change today.',
      'Neither of us is going to move. Let us stop pretending otherwise.',
    ],
  },
  joker: {
    askRole: [
      "I've got the best seat in the building. I'd like a worse one, on the floor.",
      'My warmups are tired of me. Trade me somewhere I get to take them off.',
      "I know the ushers' kids' names now. All of them. Get me out.",
    ],
    askLosing: [
      "I've run out of jokes about losing, and I had a lot of them. I want out.",
      "Even I can't keep this locker room laughing. Send me somewhere fun.",
      'I read the standings upside down. Still bad. Trade me.',
    ],
    settled: ["Never mind. I was being dramatic. I'm good.", 'Forget I said anything. I like it here again.', 'I take it back. Tell everybody I was kidding.'],
    deal: [
      "Deal. Dinner's on me. Somewhere cheap.",
      "Sold. My mother will be thrilled. She wanted more, but she'll be thrilled.",
      "Done. Don't tell my agent how fast I said yes.",
    ],
    counter: [
      'I have a very expensive dog. Go a little higher.',
      "Close. Add a little and I'll stop telling this story at parties.",
      "Almost. Round it up and I'll laugh at your jokes too.",
    ],
    lowball: ['I laughed. Then I saw you were serious.', "Good one. Now what's the real offer?", 'I do the jokes around here.'],
    walk: ["I love you all, but I'm hanging up now.", "This has been fun. It hasn't been productive. Bye.", "I'm out of jokes and you're out of money. Bye."],
  },
  firebrand: {
    askRole: [
      "I'm better than the man playing my minutes, and everybody in that gym knows it. Trade me.",
      'Nobody sits me. Not here, not anywhere. Get me out.',
      "I won't clap from the bench for a worse player. Move me.",
    ],
    askLosing: [
      "I didn't come here to lose and smile about it. Get me out.",
      "Somebody here is fine with losing. I'm not. Trade me.",
      "I'm tired of being the only one who's angry. Send me somewhere that is.",
    ],
    settled: ["You fixed it. Good. Don't make me say it twice.", "Fine. I'm staying. Keep it this way.", "That's better. I'll drop it. For now."],
    deal: ['Good. Now go and get me some help.', "That's what respect looks like. It took you long enough.", "Done. Now nobody gets to say I'm the problem."],
    counter: ["That's not respect. This is my number.", "You're paying me like somebody you can replace. You can't.", "Don't tell me what I'm worth. Pay it."],
    lowball: ["Disrespectful. I'll remember that number.", 'Is that what you think of me? Say it to my face.', 'Somebody in your office should be embarrassed.'],
    walk: [
      "We're done. I'll make sure you regret it twice a year.",
      "I'm not hearing another word. You had your chance.",
      "Lose my number. You'll see me in your building soon enough.",
    ],
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

/** What an owner of this quirk adds to a note, by how things are going. One short line (in his manner: see ownerVoice.ts on who contracts). */
export const QUIRK_LINES: Record<OwnerQuirk, Record<'good' | 'ok' | 'bad', string[]>> = {
  meddler: {
    good: [
      "I had a thought about the second unit. I'll bring a diagram.",
      'My nephew thinks we should run more. He may be right.',
      "It's going well. Imagine how it'd go with my out-of-bounds play.",
    ],
    ok: [
      'I watched the fourth quarter three times. We should talk about the rotation.',
      "I've got notes on the closing five. Several pages.",
      "I've been charting our timeouts. I have questions.",
    ],
    bad: ["I have ideas. I'll be at practice tomorrow.", 'I drew up a lineup on a napkin at dinner. It can hardly do worse.', "I've cleared my week. I'm all yours."],
  },
  showman: {
    good: [
      "The building's loud and my phone won't stop. More of this.",
      "People stopped me at dinner to talk about this team. That's the business I'm in.",
      "We're on national TV twice next month. Wear something nice.",
    ],
    ok: ["We're fine. Fine doesn't sell out a Tuesday.", "Nobody's talking about us. Give them something to talk about.", 'I need a highlight. One a night would do.'],
    bad: [
      "I can live with losing. I can't live with being boring.",
      'There were empty seats behind the bench last night. I counted.',
      "The late shows are making jokes about us. They're good jokes.",
    ],
  },
  hothead: {
    good: ["Good. Don't let it go to your head.", 'I threw nothing this month. Keep it that way.', "I'm in a good mood. Don't ask how long it'll last."],
    ok: [
      'I broke a remote during the last road trip. Just so you know where I am.',
      "Some nights I can't watch the fourth quarter. Fix that.",
      'My doctor says to skip the close ones. Stop making them close.',
    ],
    bad: [
      "I'm trying very hard to stay calm. It isn't working.",
      "I left the last game at halftime. I've never done that in my life.",
      "I've stopped reading the standings. Somebody reads them to me, slowly.",
    ],
  },
  sentimental: {
    good: ['I love this group. I mean that.', 'These kids remind me why I bought the team.', "I'd watch this team play in an empty gym."],
    ok: ['I like our young players more than the standings do. Be patient with them.', "Don't give up on our kids. I haven't.", "They're trying. I can see it from my seat."],
    bad: [
      "It hurts to watch them struggle. They're good kids.",
      "I still believe in this group, even when the scoreboard doesn't.",
      'Look after them through this. That matters to me.',
    ],
  },
  gambler: {
    good: ["We're close. One more move and nobody can touch us.", "I like our hand. I'd still raise.", "We're running hot. That's when you bet more."],
    ok: ['Standing still is the only bad bet. Find me a deal.', "There's a swing out there somewhere. Take it.", "I'm bored, and bored is expensive. Do something."],
    bad: [
      'When the cards are this bad you change the hand. Make calls.',
      "I'd rather miss big than drift. Make a move.",
      "We're losing slowly. Nothing's worse than losing slowly.",
    ],
  },
  accountant: {
    good: ['Wins are nice. The gate receipts are nicer.', 'I checked the numbers twice. They held up.', 'The season is running ahead of its budget. I have double-checked.'],
    ok: [
      'Every win this month cost more than I would like. Watch it.',
      'The ledger and the standings should agree more often.',
      'We are on forecast. I had hoped to be surprised.',
    ],
    bad: [
      'We are paying for wins and getting losses. That is poor value.',
      'I read the books before the box score. Both were hard going.',
      'The cost of each win went up again this month. I keep a chart.',
    ],
  },
  ghost: {
    good: ['I am told it is going well. Carry on.', 'Good news reached me on the boat. Well done.', 'I received one message this month and it was good. Ideal.'],
    ok: ['I have been away. Somebody summarized the month for me.', 'I hear it is about what we expected.', 'No news has reached me. I assume that is news.'],
    bad: [
      'Even out here I am hearing about it. That is a bad sign.',
      'People who never call me are calling me. Fix it.',
      'I was recognized at an airport and asked about the team. I did not enjoy it.',
    ],
  },
  traditionalist: {
    good: [
      'We defend, we rebound, we win. As it should be.',
      'This team plays the right way. My father would have liked it.',
      'They box out. I had forgotten how much I like watching that.',
    ],
    ok: ['Too many threes, not enough floor burns. Practice harder.', 'I would like to see somebody take a charge.', 'Good teams win the loose balls. We win about half.'],
    bad: [
      'In my day a team that soft ran laps until it was not.',
      'Nobody dives for anything. That I cannot forgive.',
      'I watched us give up a layup line last night. I did not sleep.',
    ],
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
    yes: ["Done. I didn't come here to fold.", 'Send the paperwork before I change my mind.'],
    no: ["There's no star in this for me. Call back with one.", "I don't get out of bed for that."],
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
    no: ["You're asking for my picks. People always do.", "Those picks aren't for sale at that price."],
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
    yes: ["It hurts to do it, but it's right for the team.", "I'll make the call to him myself. Deal."],
    no: ["He's been here a long time. It'd take more than that.", "I don't move my guys for a fair price. Beat it."],
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
    no: ["I win my trades. This isn't one.", 'Try again when it hurts you a little.'],
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
    yes: ["Sure, let's shake it up.", 'Why not. I was getting bored of this roster.'],
    no: ["Even I can't make that one work.", 'I like a deal as much as anyone. Not this one.'],
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
    yes: ["That's fair. Deal.", 'Works for both of us. Done.'],
    no: ["The value isn't there yet.", "Close, but it's not even."],
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
/** What a GM says about a deal a little short of yes: a door left open, never "that can't work" beside a "Close" verdict. */
const CLOSE_LINES = ["We're not far apart. A little more and we talk.", 'Close. Sweeten it a touch.', 'Nearly there. Find me a bit more.'];

export const gmSays = (league: Pick<League, 'id' | 'gm'>, tid: number, yes: boolean, key: string | number, close = false) =>
  pickBy(`${league.id}:${tid}:gm-says:${key}`, yes ? gmStyle(league, tid).yes : close ? CLOSE_LINES : gmStyle(league, tid).no);
