// The owner's and the fans' pulse through the season, FM-style: how the owner feels (his job-security
// score, see jobSecurity.ts, read without the forecast so a week's point costs nothing), how the fans
// feel (their hype, the team's form and how full the arena is), a point a week of both for a chart,
// and the owner's word once a month in his own voice: what the record says against his goals and the
// press's preseason prediction, how the last month went, the crowds. This only presents and voices
// the owner: who gets fired is still owner.ts's review alone. Nothing here draws from the league's
// random stream; phrasing is chosen by worldRng from the occasion.
import type { League, Team, TeamSeason } from '../types';
import { clamp } from '../random';
import { worldRng } from './world';
import { addInbox, dateToDay, fmtDate } from './helpers';
import { arenaCapacity } from './finances';
import { jobSecurity } from './jobSecurity';
import { frozen } from './books';
import { currentGoals, ownerPersonality, SEASON_GAMES, type OwnerPersonality } from './ownerGoals';
import { confStandings } from './standings';
import { arenaOf, legacyOf, type LegacyState, type PulsePoint } from './legacy';
import { ordinal, plural } from '../format';

/** Points of the pulse kept a season (a point a week: the regular season and the playoffs fit). */
export const PULSE_KEPT = 40;
/** Days between the pulse's points. */
export const PULSE_EVERY = 7;
/** How far back the trend looks (days): about three weeks. */
const TREND_DAYS = 21;
/** A move of this much (out of 100) over the trend's window is a direction; less is steady. */
const TREND_STEP = 3;

export type Trend = 'up' | 'down' | 'flat';

export interface Mood {
  /** 0..100. */
  score: number;
  /** "pleased", "buzzing". */
  word: string;
  tone: 'good' | 'info' | 'warn' | 'bad';
  trend: Trend;
  /** The change over the trend's window, and the day it's counted from (absent without a point to count from). */
  delta: number;
  since?: number;
}

// ---------------------------------------------------------------- the owner

const OWNER_WORDS: { min: number; word: string; tone: Mood['tone'] }[] = [
  { min: 80, word: 'delighted', tone: 'good' },
  { min: 65, word: 'pleased', tone: 'good' },
  { min: 52, word: 'content', tone: 'info' },
  { min: 45, word: 'watchful', tone: 'info' },
  { min: 32, word: 'uneasy', tone: 'warn' },
  { min: -1, word: 'impatient', tone: 'bad' },
];

export const ownerWord = (score: number) => OWNER_WORDS.find((w) => score >= w.min)!;

// ---------------------------------------------------------------- the fans

const FAN_WORDS: { min: number; word: string; tone: Mood['tone'] }[] = [
  { min: 80, word: 'electric', tone: 'good' },
  { min: 66, word: 'buzzing', tone: 'good' },
  { min: 52, word: 'loyal', tone: 'info' },
  { min: 40, word: 'restless', tone: 'warn' },
  { min: 28, word: 'grumbling', tone: 'bad' },
  { min: -1, word: 'fed up', tone: 'bad' },
];

const thisSeason = (league: League, tid: number): TeamSeason | undefined => league.teams[tid]?.seasons.find((s) => s.season === league.season);

/** The share of the arena's seats filled on an average home night this season (null before a home game). */
export function arenaFill(league: League, tid: number): number | null {
  const ts = thisSeason(league, tid);
  const home = ts ? ts.homeWon + ts.homeLost : 0;
  return ts && home > 0 && ts.attendance > 0 ? ts.attendance / home / arenaCapacity(league.teams[tid]) : null;
}

/**
 * The fans' mood, 0..100: their hype (45%), the team's form over its last ten (35%, pulled toward .500
 * early on) and how full the arena has been (20%), a few points either way for a streak running.
 */
export function fanScore(league: League, tid = league.userTid): number {
  const t: Team = league.teams[tid];
  const ts = thisSeason(league, tid);
  const ten = ts?.lastTen ?? [];
  const form = (ten.filter((x) => x === 1).length + 2.5) / (ten.length + 5);
  const fill = arenaFill(league, tid) ?? 0.9;
  const fillPart = clamp((fill - 0.7) / 0.3, 0, 1);
  const streak = clamp(ts?.streak ?? 0, -8, 8) * 1.5;
  return Math.round(clamp(100 * (0.45 * t.hype + 0.35 * form + 0.2 * fillPart) + streak, 0, 100));
}

export const fanWord = (score: number) => FAN_WORDS.find((w) => score >= w.min)!;

/**
 * The fans in a line that names the city or the arena and says what the crowds are doing: sold out
 * only when it is, empty seats only when there are. The same line all week.
 */
export function fanLine(league: League, tid = league.userTid, score = fanScore(league, tid), quiet = false): string {
  const t = league.teams[tid];
  const arena = arenaOf(league, tid);
  const city = t.region;
  const fill = arenaFill(league, tid);
  const ts = thisSeason(league, tid);
  // (quiet: a line that doesn't count the streak, for a note that already has)
  const streak = quiet ? 0 : (ts?.streak ?? 0);
  const rng = worldRng(league, 'fans', league.season, tid, Math.floor(league.day / PULSE_EVERY));
  const full = fill !== null && fill >= 0.99;
  const thin = fill !== null && fill < 0.85;
  const seats = fill !== null ? `${Math.round(fill * 100)}% full` : '';
  if (score >= 80)
    return rng.pick([
      full ? `${arena} is sold out and loud` : `${city} is all in on the ${t.name}`,
      streak >= 4 ? `${plural(streak, 'straight win')} and ${city} can't get enough` : `Every ticket in ${city} is spoken for`,
      `${arena} is the loudest building in the league right now`,
    ]);
  if (score >= 66)
    return rng.pick([
      full ? `Sellouts at ${arena}, and ${city} is buzzing` : `The crowds at ${arena} are growing`,
      `${city} is talking about the ${t.name} again`,
      `${arena} is rocking`,
    ]);
  if (score >= 52)
    return rng.pick([
      `${city} is behind the ${t.name}`,
      seats ? `Steady crowds at ${arena}, ${seats}` : `Steady crowds at ${arena}`,
      `${poss(t.name)} fans are patient and present`,
    ]);
  if (score >= 40)
    return rng.pick([
      `${city} is getting restless`,
      thin ? `Empty seats are showing at ${arena}` : `${arena} is quieter than it was`,
      streak <= -3 ? `${plural(-streak, 'straight loss', 'straight losses')} and ${city} is losing its voice` : `${poss(t.name)} fans want more`,
    ]);
  if (score >= 28) return rng.pick([`Boos at ${arena}`, `${city} is grumbling about the ${t.name}`, thin ? `Whole sections empty at ${arena}` : `${arena} has gone flat`]);
  return rng.pick([thin ? `${city} has stopped coming: ${arena} is ${seats}` : `${city} has given up on this season`, `Empty seats and silence at ${arena}`]);
}

// ---------------------------------------------------------------- the pulse

/** This season's pulse points for the user's team (empty for another season or team). */
export function pulsePoints(league: League, s: LegacyState = legacyOf(league)): PulsePoint[] {
  const p = s.pulse;
  return p && p.season === league.season && p.tid === league.userTid ? p.pts : [];
}

function trendOf(now: number, pts: PulsePoint[], at: number, day: number): { trend: Trend; delta: number; since?: number } {
  if (!pts.length) return { trend: 'flat', delta: 0 };
  // the latest point at least TREND_DAYS back, or the season's first
  let ref = pts[0];
  for (const p of pts) if (p[0] <= day - TREND_DAYS) ref = p;
  const delta = now - ref[at];
  return { trend: delta >= TREND_STEP ? 'up' : delta <= -TREND_STEP ? 'down' : 'flat', delta, since: ref[0] };
}

/**
 * How the owner and the fans feel now and which way it's going (over about three weeks of the
 * pulse). `ownerScore`: the job-security score the screen shows (its forecast's), else the quick one.
 */
export function pulseNow(league: League, ownerScore?: number): { owner: Mood; fans: Mood } {
  const pts = pulsePoints(league);
  const o = ownerScore ?? jobSecurity(league).score;
  const f = fanScore(league);
  const ow = ownerWord(o);
  const fw = fanWord(f);
  return {
    owner: { score: o, word: ow.word, tone: ow.tone, ...trendOf(o, pts, 1, league.day) },
    fans: { score: f, word: fw.word, tone: fw.tone, ...trendOf(f, pts, 2, league.day) },
  };
}

/** The end of a day of the season or the postseason: a point a week, and in the regular season the owner's monthly word and his note on a losing run. */
export function pulseDay(league: League) {
  if (league.fired || !['regular', 'playin', 'playoffs'].includes(league.phase) || !league.legacy) return;
  const s = league.legacy;
  const tid = league.userTid;
  if (!s.pulse || s.pulse.season !== league.season || s.pulse.tid !== tid) s.pulse = { season: league.season, tid, pts: [] };
  const pts = s.pulse.pts;
  const last = pts[pts.length - 1];
  if (!last || league.day - last[0] >= PULSE_EVERY) {
    pts.push([league.day, jobSecurity(league).score, fanScore(league)]);
    if (pts.length > PULSE_KEPT) pts.splice(0, pts.length - PULSE_KEPT);
  }
  if (league.phase === 'regular') {
    monthlyCheckIn(league, s);
    skidNote(league, s);
  }
}

// ---------------------------------------------------------------- the owner's voice

type Band = 'good' | 'ok' | 'bad';
const bandOf = (score: number): Band => (score >= 58 ? 'good' : score >= 42 ? 'ok' : 'bad');

/** How each owner opens a check-in, by how he feels: his own words, the same man every month. */
const OPENERS: Record<OwnerPersonality, Record<Band, string[]>> = {
  'win-now': {
    good: ['This is what I pay for.', "Good. Now don't let up.", 'I like where this is going. Keep the foot down.', 'Winning suits this building.'],
    ok: [
      "Fine isn't what I signed up for.",
      "We're treading water, and I don't swim.",
      "It's not bad. It's not what I want either.",
      "I didn't buy this team to be in the middle.",
    ],
    bad: [
      "This isn't acceptable.",
      "I'm running out of ways to say it: we have to win.",
      "I didn't build this payroll to watch this.",
      'Every loss costs us something we spent money on.',
    ],
  },
  builder: {
    good: ['The work is showing.', 'This is the progress I hoped for.', 'I like the habits I see.', "We're ahead of where I thought we'd be."],
    ok: [
      'Steady. I can live with steady, for now.',
      "Some nights I see the plan. Some nights I don't.",
      "It's a long road. I just want to see us on it.",
      'Not every month is a step forward. I know that.',
    ],
    bad: [
      "I'm patient. I'm not blind.",
      "I need to see the direction, and lately I don't.",
      "Patience isn't the same as accepting this.",
      'The plan has to show up in the results eventually.',
    ],
  },
  frugal: {
    good: ['Winning is good business. Keep it up.', 'Full seats and wins: the best kind of month.', "This is what a sound team looks like. Don't change a thing."],
    ok: ['We are what we cost, about. I want better than that.', "A month like this pays the bills. It doesn't move the needle.", "It's a fair return. I'm after a good one."],
    bad: ['Losing costs money. We are losing.', 'I watch the gate numbers. They are telling me what the standings are.', "I'm paying for a winner and getting this."],
  },
};

/** How he opens while the budget is frozen over the books, whatever the record: the money comes first. */
const BOOKS_OPENERS: Record<OwnerPersonality, string[]> = {
  'win-now': ["Winning doesn't pay for the hole in the books.", "I'll pay for a winner. I won't pay for this deficit."],
  builder: ["The plan doesn't work if the books don't.", 'We can build without bleeding money. Right now we are bleeding it.'],
  frugal: ["The books are still in the red. Nothing else matters until they aren't.", "I don't care how full the seats are while we're losing money."],
};

const CLOSERS: Record<OwnerPersonality, string[]> = {
  'win-now': ['Win the next one.', 'I want more.', "Don't make me write a longer note."],
  builder: ['Keep building.', 'Stay with the plan.', 'Keep the young guys growing.'],
  frugal: ['And keep an eye on the bottom line.', "Let's keep it efficient.", 'Spend wisely.'],
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The months he checks in (the first of each, 0-based): December, January, February (unless the All-Star break is near), March, April. */
const CHECK_MONTHS = [11, 0, 1, 2, 3];
/** Days around the All-Star break inside which the break's check-in (ownerGoals.ts) stands for the month's. */
const ALL_STAR_GAP = 24;

/**
 * The owner's word on the first of the month (see CHECK_MONTHS): his mood and which way it moved since
 * the last one, the record since then, the pace against his wins goal and the press's prediction,
 * where the team sits, and the fans. A mail, never important (the review is what decides).
 */
export function monthlyCheckIn(league: League, s: LegacyState) {
  const og = currentGoals(league);
  if (!og) return;
  const tid = league.userTid;
  for (const m of CHECK_MONTHS) {
    const day = dateToDay(league.season, m, 1);
    if (league.day < day || league.day - day >= PULSE_EVERY) continue;
    if (m === 1 && Math.abs(league.allStarDay - day) < ALL_STAR_GAP) continue;
    if (!s.checkins || s.checkins.season !== league.season || s.checkins.tid !== tid) s.checkins = { season: league.season, tid, sent: [] };
    const key = `m:${m}`;
    if (s.checkins.sent.includes(key)) continue;
    const ts = thisSeason(league, tid);
    if (!ts) return;
    const gp = ts.won + ts.lost - (og.from ? og.from.won + og.from.lost : 0);
    // too few games since he set his goals to say anything
    if (gp < 8) return;
    s.checkins.sent.push(key);
    const score = jobSecurity(league).score;
    const last = s.checkins.last;
    s.checkins.last = { won: ts.won, lost: ts.lost, score };
    addInbox(league, checkInMail(league, m, ts, score, last, og.goals.find((g) => g.kind === 'wins')?.target, og.from ? og.games : undefined));
    return;
  }
}

function checkInMail(
  league: League,
  month: number,
  ts: TeamSeason,
  score: number,
  last: { won: number; lost: number; score: number } | undefined,
  target: number | undefined,
  /** Games the goals cover after a mid-season takeover. */
  span: number | undefined,
) {
  const tid = league.userTid;
  const who = ownerPersonality(league, tid);
  const rng = worldRng(league, 'owner', league.season, tid, month);
  // (the budget frozen over the books: no "best kind of month" while the money bleeds)
  const red = frozen(league);
  const band = red && bandOf(score) === 'good' ? 'ok' : bandOf(score);
  const t = league.teams[tid];
  const gp = ts.won + ts.lost;
  const pace = Math.round((ts.won / Math.max(1, gp)) * SEASON_GAMES);
  const lines: string[] = [rng.pick(red ? BOOKS_OPENERS[who] : OPENERS[who][band])];
  // the month: the record since his last note (or since opening night), and how his mood moved
  const since = last ? [ts.won - last.won, ts.lost - last.lost] : [ts.won, ts.lost];
  const moved = last ? score - last.score : 0;
  const run = `${since[0]}-${since[1]} ${last ? 'since my last note' : 'so far'}`;
  lines.push(
    moved >= TREND_STEP
      ? rng.pick([`You've gone ${run}, and I feel better than I did.`, `${cap(run)}. That's the direction I want.`])
      : moved <= -TREND_STEP
        ? rng.pick([`You've gone ${run}. I feel worse about this than I did a month ago.`, `${cap(run)}. That's the wrong direction.`])
        : `You've gone ${run}.`,
  );
  // against his goal and the press's prediction (an old save has no prediction)
  const pre = league.media?.preseason;
  const picked = pre && pre.season === league.season ? pre.rows.find((r) => r.tid === tid) : undefined;
  const parts: string[] = [];
  if (target !== undefined && !span) parts.push(`I asked for ${target}`);
  if (picked) parts.push(`the papers picked you for ${picked.wins}`);
  lines.push(`At ${ts.won}-${ts.lost} you're on pace for ${pace} wins${parts.length ? `; ${parts.join(', ')}` : ''}.`);
  const row = confStandings(league, t.conf).find((r) => r.tid === tid);
  if (row) {
    const conf = t.conf === 'E' ? 'East' : 'West';
    const pickedRank = picked?.confRank;
    lines.push(
      pickedRank && Math.abs(pickedRank - row.confRank) >= 3
        ? `${ordinal(row.confRank)} in the ${conf}, ${row.confRank < pickedRank ? 'well above' : 'well below'} the ${ordinal(pickedRank)} they had you.`
        : `${ordinal(row.confRank)} in the ${conf}.`,
    );
  }
  // the fans, as he hears them
  const f = fanScore(league);
  lines.push(`${fanLine(league, tid, f)}.`);
  lines.push(rng.pick(CLOSERS[who]));
  const mood = ownerWord(red ? Math.min(score, 51) : score).word;
  return {
    from: 'Owner',
    subject: `${MONTHS[month]} check-in: ${mood}`,
    body: lines.join('\n'),
    tone: band === 'good' ? ('good' as const) : band === 'bad' ? ('bad' as const) : ('neutral' as const),
    link: '/office/owner',
  };
}

/** Losing streaks the owner writes about (once a season each). */
const SKIDS = [6, 10];

/** The owner's word on a losing run: six straight, ten straight. */
function skidNote(league: League, s: LegacyState) {
  if (!currentGoals(league)) return;
  const tid = league.userTid;
  const ts = thisSeason(league, tid);
  if (!ts || ts.streak > -SKIDS[0]) return;
  if (!s.checkins || s.checkins.season !== league.season || s.checkins.tid !== tid) s.checkins = { season: league.season, tid, sent: [] };
  const n = [...SKIDS].reverse().find((k) => -ts.streak >= k);
  if (!n || s.checkins.sent.includes(`skid:${n}`)) return;
  for (const k of SKIDS) if (k <= n) s.checkins.sent.push(`skid:${k}`);
  const who = ownerPersonality(league, tid);
  const rng = worldRng(league, 'skid', league.season, tid, n);
  const words = n >= 10 ? 'Ten' : 'Six';
  const opener: Record<OwnerPersonality, string[]> = {
    'win-now': [`${words} straight. Fix it.`, `${words} losses in a row. I don't accept that.`],
    builder: [`${words} in a row. I can take losses; I can't take a team that stops improving.`, `${words} straight. Show me this isn't who we are.`],
    frugal: [`${words} straight losses, and the gate is feeling it.`, `${words} in a row. Losing streaks are expensive.`],
  };
  addInbox(league, {
    from: 'Owner',
    subject: `${words} straight losses`,
    body: [rng.pick(opener[who]), `You're ${ts.won}-${ts.lost}. ${fanLine(league, tid, undefined, true)}.`].join('\n'),
    tone: 'bad',
    link: '/office/owner',
  });
}

/** "The Knicks' fans", "The Heat's fans". */
const poss = (name: string) => `The ${name}${name.endsWith('s') ? "'" : "'s"}`;
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** The pulse's points as dates, for a chart's labels. */
export const pulseLabels = (league: League, pts: PulsePoint[]) => pts.map((p) => fmtDate(league.season, p[0]));
