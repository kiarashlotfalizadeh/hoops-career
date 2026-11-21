// Who people are when they talk: a player's voice in front of a microphone, a coach's, an owner's
// quirk on top of what he wants, a rival front office's way of doing business, and the nicknames the
// league gives its best. None of it is a mood to manage: nobody is happy or unhappy here, there are
// no promises and no conversations. It is how the same facts sound coming from different people, and
// (for owners and front offices) a small, stated lean in what they value. Everything is read from a
// hash of the league and the person, the same all career, except a nickname, which is given once and
// kept (Player.nick).

import type { GmTemper, League, Player, Team } from '../types';
import { RETIRED } from '../types';
import { hashString, mix32 } from '../random';
import { composites } from '../ratings';

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

/** A coach's temper, from his name: it follows him from job to job. */
export const coachTemper = (name: string): CoachTemper => pickBy(`coach-temper:${name}`, ['fiery', 'professor', 'deadpan', 'salesman', 'old-school'] as const);

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
  /** How readily he deals with other AI teams. */
  busy: number;
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

/** "Shark · wins the trade or walks": a front office in a line, for the trade screens. */
export const gmLine = (league: Pick<League, 'id' | 'gm'>, team: Pick<Team, 'tid'>) => {
  const s = gmStyle(league, team.tid);
  return `${s.label} · ${s.blurb}`;
};

/** What a front office says about a deal it took or turned down (the same words for the same deal). */
export const gmSays = (league: Pick<League, 'id' | 'gm'>, tid: number, yes: boolean, key: string | number) =>
  pickBy(`${league.id}:${tid}:gm-says:${key}`, yes ? gmStyle(league, tid).yes : gmStyle(league, tid).no);

// ---------------------------------------------------------------- nicknames

/**
 * Nicknames by what a player is. Invented for the game: none is a real player's. A player gets one
 * when the league notices him (see earnNickname), drawn from the pool that fits him best and not in
 * use by anyone still playing.
 */
const NICKS = {
  giant: ['The Lighthouse', 'Skyline', 'The Crane', 'High Tide', 'The Steeple', 'Longshadow', 'Top Shelf', 'The Overpass'],
  unicorn: ['The Glitch', 'The Mirage', 'Cheat Code', 'The Rumor', 'Northern Lights', 'The Blueprint'],
  wall: ['The Padlock', 'Curfew', 'The Lid', 'Closing Time', 'The Customs Desk', 'Deadbolt'],
  shooter: ['The Flamethrower', 'Long Distance', 'Raincloud', 'The Arsonist', 'Moneyline', 'Tracer', 'Area Code'],
  scorer: ['The Furnace', 'Thirty Piece', 'The Faucet', 'Problem', 'The Avalanche', 'Overtime Pay', 'The Headline'],
  maker: ['The Conductor', 'The Switchboard', 'The Architect', 'Easy Button', 'The Locksmith', 'Table Setter'],
  stopper: ['The Shadow', 'Handcuffs', 'The Blanket', 'Lockjaw', 'The Toll Booth', 'Static'],
  flyer: ['Springs', 'Jet Fuel', 'Liftoff', 'The Trampoline', 'Tailwind', 'No Stairs'],
  glass: ['The Vacuum', 'The Janitor', 'Second Helping', 'The Magnet', 'Lost and Found'],
  small: ['The Hornet', 'Pocket Rocket', 'The Wasp', 'Short Fuse', 'Quarter Stick'],
  all: ['The Toolbox', 'Both Ends', 'The Whole Shift', 'Every Night', 'The Foreman'],
} as const;

type NickPool = keyof typeof NICKS;

/** The pools that fit a player, best first. */
function nickPools(p: Pick<Player, 'heightIn' | 'ratings' | 'pos'>): NickPool[] {
  const c = composites(p.ratings);
  const r = p.ratings;
  const out: [NickPool, number][] = [
    ['unicorn', p.heightIn >= 85 && (r.hnd >= 62 || r.tp >= 66) ? 30 : 0],
    ['giant', p.heightIn >= 87 ? 22 : 0],
    ['small', p.heightIn <= 73 ? 18 : 0],
    ['shooter', Math.max(c.c3, c.pu3) - 62],
    ['scorer', 0.55 * c.create + 0.45 * Math.max(c.midShot, c.pu3, c.rim) - 58],
    ['maker', c.passing - 62],
    ['wall', c.rimProt - 64],
    ['stopper', c.perDef - 64],
    ['flyer', r.ath - 74],
    ['glass', (c.orb + r.dreb) / 2 - 66],
    ['all', 4],
  ];
  return out
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** Whether the league would give this player a nickname: a generated player (a real one keeps his own name), good enough to be noticed. */
export const nickWorthy = (p: Pick<Player, 'real' | 'ovr' | 'nick' | 'peak'>) => !p.real && !p.nick && (p.ovr >= 90 || !!p.peak);

/**
 * Give a noticed player his nickname (see nickWorthy): the best-fitting one nobody active has.
 * Returns it, or null when he has one, doesn't qualify, or every fitting one is taken.
 */
export function earnNickname(league: League, p: Player): string | null {
  if (!nickWorthy(p)) return null;
  const taken = new Set<string>();
  for (const x of Object.values(league.players)) if (x.nick && x.tid !== RETIRED) taken.add(x.nick);
  for (const pool of nickPools(p)) {
    const names = NICKS[pool];
    const start = mix32(hashString(`${league.id}:nick:${p.pid}`)) % names.length;
    for (let i = 0; i < names.length; i++) {
      const n = names[(start + i) % names.length];
      if (!taken.has(n)) {
        p.nick = n;
        return n;
      }
    }
  }
  return null;
}

/** 'Dario "The Furnace" Okoye' for a nicknamed player's big moments; his plain name otherwise. */
export const nickName = (p: Pick<Player, 'firstName' | 'lastName' | 'nick'>) => (p.nick ? `${p.firstName} "${p.nick}" ${p.lastName}` : `${p.firstName} ${p.lastName}`.trim());
