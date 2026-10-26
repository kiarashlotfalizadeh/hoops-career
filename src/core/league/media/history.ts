// The press's long memory: what a title, a series, an award or a meeting means against the league's
// history in this save, read from what the save keeps for good (the awards, every team's seasons,
// the record book, the chronicle's playoff series and stories). Every line is true as far as the
// save knows. A real league opens with the NBA's past (media/past.ts: every Finals since 1947, and
// each player's real honours on his record), so a franchise's titles and a player's MVPs are counted
// whole ("a first title since 1972-73", "his third MVP"); a save from before it, or a real league
// without it, says nothing of "first ever" it can't see whole. A fictional league's past is its
// own. Repeats, dynasties and counts are said within the window they're counted in ("a third title
// in four years"), droughts only when the last time is on record ("a first series win since
// 2031-32"). Nothing here draws from any random stream.
import type { League, Player, ScheduledGame } from '../../types';
import { seasonLabel } from '../../constants';
import { ordinal } from '../../format';
import { dayToDate } from '../helpers';
import { REC_LABEL, REC_STATS, TEAM_REC_LABEL, TEAM_REC_STATS, gameMark, teamMark } from '../records';
import { pastFinal, pastTitles } from './past';

/** "two", "three" ... for counts in copy (ten and under). */
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const countWord = (n: number) => WORD[n] ?? String(n);
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
export const ordWord = (n: number) => ORD[n] ?? ordinal(n);

/** The seasons a team won the title, oldest first: the NBA's before the league (a real league's past) and this league's. */
export function titleSeasons(league: League, tid: number): number[] {
  return [...pastTitles(league, tid), ...league.awards.filter((a) => a.champion === tid).map((a) => a.season)];
}

/**
 * What a title means against the team's titles in this save: "a three-peat", "back-to-back titles",
 * "a third title in five years", "a first title since 2029-30", or null for a title with nothing
 * before it in the save (the save can't say it's the franchise's first).
 */
export function titleLine(league: League, tid: number, season: number, won0?: true): string | null {
  // (`won0`: the title just won, before the awards have it: the night of the Finals' last game)
  const won = [...new Set([...titleSeasons(league, tid).filter((s) => s <= season), ...(won0 ? [season] : [])])].sort((a, b) => a - b);
  if (!won.includes(season)) return null;
  // (the franchise's first, when every title it won is on record: an expansion team's, or the NBA's)
  if (won.length < 2) return league.past ? 'the first title in franchise history' : null;
  let run = 1;
  while (won.includes(season - run)) run++;
  if (run >= 3) return run === 3 ? 'a three-peat' : `a ${countWord(run)}-peat`;
  if (run === 2) return 'back-to-back titles';
  // within a window that starts at the first of them: "a third title in five years"
  const recent = won.filter((s) => s > season - 6);
  if (recent.length >= 3) return `a ${ordWord(recent.length)} title in ${countWord(season - recent[0] + 1)} years`;
  // more than any other franchise has: "a record 19th title"
  if (won.length >= 10 && league.teams.every((t) => t.tid === tid || titleSeasons(league, t.tid).filter((s) => s <= season).length < won.length))
    return `a record ${ordinal(won.length)} title`;
  const prev = won.filter((s) => s < season).at(-1)!;
  if (season - prev >= 4) {
    // (won under another name: "a first title since the 1978-79 SuperSonics")
    const as = pastFinal(league, prev)?.[6];
    return as ? `a first title since the ${seasonLabel(prev)} ${as.split(' ').slice(-1)[0]}` : `a first title since ${seasonLabel(prev)}`;
  }
  return `a ${ordWord(recent.length)} title in ${countWord(season - recent[0] + 1)} years`;
}

const ROUND_WORDS = ['', 'playoff berth', 'series win', 'trip to the conference finals', 'trip to the Finals', 'title'];

/**
 * A run that ended a drought: the team got at least as far as `reached` (a TeamSeason playoffRound:
 * 1 a berth, 2 a series won, 3 the conference finals, 4 the Finals) for the first time since a
 * season the save has, at least four seasons back: "a first series win since 2029-30". Null when
 * it got that far lately, or never before in the save.
 */
export function droughtLine(league: League, tid: number, season: number, reached: number): string | null {
  const seasons = league.teams[tid]?.seasons ?? [];
  const before = seasons.filter((s) => s.season < season && s.playoffRound >= reached).map((s) => s.season);
  if (!before.length) return null;
  const last = Math.max(...before);
  if (season - last < 4) return null;
  return `a first ${ROUND_WORDS[reached] ?? 'run like it'} since ${seasonLabel(last)}`;
}

/** His career is all in this save (drafted into it, or a fictional league's): counts of his awards are whole. */
export function careerInSave(league: League, p: Player): boolean {
  return !p.stats.some((s) => s.real) && p.draft.year >= league.startSeason - 1;
}

/**
 * His honours are on his record whole: his career is all in this save, or the league opened with the
 * NBA's past and every real season of his is from when its honours start (every current player's).
 */
export function honoursWhole(league: League, p: Player): boolean {
  if (careerInSave(league, p)) return true;
  const from = league.past?.honoursFrom;
  return from !== undefined && !p.stats.some((s) => s.real && s.season < from);
}

/**
 * An award's line with the award in it, where it reads: "his second straight MVP", "his third MVP in
 * four seasons", "his first All-Star selection" (awardLine's "his third in four seasons" + "MVP").
 */
export function awardPhrase(line: string, noun: string): string {
  const m = /^(his \w+(?: straight)?)( in .+)?$/.exec(line);
  return m ? `${m[1]} ${noun}${m[2] ?? ''}` : `${line} ${noun}`;
}

/**
 * What an award means for the man who won it: "his second straight", "his third in four seasons",
 * or, with his whole career in the save, "his first" and "his fourth". `type` is the award's name on
 * his record ("MVP", "Defensive Player of the Year"). Null for a first that the save can't vouch for.
 */
export function awardLine(league: League, p: Player, type: string, season: number): string | null {
  const won = [...new Set(p.awards.filter((a) => a.type === type && a.season <= season).map((a) => a.season))].sort((a, b) => a - b);
  if (!won.includes(season)) return null;
  let run = 1;
  while (won.includes(season - run)) run++;
  if (run >= 2) return run === 2 ? 'his second straight' : `his ${ordWord(run)} straight`;
  const whole = honoursWhole(league, p);
  if (won.length === 1) return whole ? 'his first' : null;
  const recent = won.filter((s) => s > season - 5);
  if (recent.length >= 2 && !whole) return `his ${ordWord(recent.length)} in ${countWord(season - recent[0] + 1)} seasons`;
  return whole ? `his ${ordWord(won.length)}` : null;
}

/** A playoff meeting of two teams, from the chronicle: the season, the round and the result from `a`'s side. */
export interface Meeting {
  season: number;
  round: number;
  won: boolean;
  /** Its games: `a`'s wins, then the other side's. */
  w: number;
  l: number;
}

const ROUND_NAME = ['', 'first round', 'second round', 'conference finals', 'Finals'];

/** Every playoff series two teams have played in this save, newest first (the chronicle keeps them all). */
export function meetings(league: League, a: number, b: number): Meeting[] {
  const out: Meeting[] = [];
  for (const c of league.chronicle ?? [])
    for (const [round, high, low, hw, lw] of c.series) {
      if (!((high === a && low === b) || (high === b && low === a))) continue;
      const [w, l] = high === a ? [hw, lw] : [lw, hw];
      out.push({ season: c.season, round, won: w > l, w, l });
    }
  return out.sort((x, y) => y.season - x.season);
}

/**
 * Two teams' playoff history in a line, from `a`'s side: "a rematch of the 2029-30 conference
 * finals, which the Celtics won in six", "their third playoff meeting in four years". Null when
 * they haven't met in the save.
 */
export function rematchLine(league: League, a: number, b: number): string | null {
  const ms = meetings(league, a, b);
  if (!ms.length) return null;
  const [last] = ms;
  const winner = league.teams[last.won ? a : b].name;
  const games = last.w + last.l;
  const inN = games === 4 ? 'in a sweep' : `in ${countWord(games)}`;
  const recent = ms.filter((m) => m.season > last.season - 4);
  if (recent.length >= 3) return `their ${ordWord(recent.length + 1)} playoff meeting in ${countWord(league.season - recent.at(-1)!.season + 1)} years`;
  return `a rematch of the ${seasonLabel(last.season)} ${ROUND_NAME[last.round] ?? 'playoffs'}, which the ${winner} won ${inN}`;
}

/** An anniversary of a night between two teams: how many years ago it was and the line that says it. */
export interface Anniversary {
  years: number;
  line: string;
  /** The night's story, while the news has it. */
  story?: number;
}

const sameDate = (season: number, day: number, s2: number, d2: number) => {
  const a = dayToDate(season, day);
  const b = dayToDate(s2, d2);
  return a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
};

/** Years ago an anniversary is worth saying at: a round number of them. */
const ROUND_YEARS = new Set([3, 5, 10, 15, 20, 25]);

/**
 * A night these two teams remember on this date: a record set in a game between them (the league's
 * book, or either franchise's top mark) or one of the chronicle's stories about the two of them, a
 * round number of years ago tonight: "Five years ago tonight, Keyonte George had 62 points against the
 * Suns." Read before a game is played (its billing) or after (its story). Null for an ordinary
 * date.
 */
export function anniversaryOf(league: League, g: Pick<ScheduledGame, 'home' | 'away' | 'day'>, season = league.season): Anniversary | null {
  const pair = (x: number, y: number) => (x === g.home && y === g.away) || (x === g.away && y === g.home);
  const when = (s: number) => `${countWord(season - s).replace(/^./, (c) => c.toUpperCase())} years ago tonight`;
  const book = league.records;
  if (book) {
    const shelves = [book.league.reg, book.teams[g.home]?.reg, book.teams[g.away]?.reg].filter((x) => !!x);
    for (const shelf of shelves) {
      for (const stat of REC_STATS)
        for (const r of shelf.players[stat] ?? []) {
          const m = gameMark(league, r);
          if (!pair(m.tid, m.opp) || !ROUND_YEARS.has(season - m.season) || !sameDate(m.season, m.day, season, g.day)) continue;
          return { years: season - m.season, line: `${when(m.season)}, ${m.name} had ${m.v} ${REC_LABEL[stat][1]} against the ${league.teams[m.opp].name}.` };
        }
      for (const stat of TEAM_REC_STATS)
        for (const r of shelf.teams[stat] ?? []) {
          const m = teamMark(r);
          if (!pair(m.tid, m.opp) || !ROUND_YEARS.has(season - m.season) || !sameDate(m.season, m.day, season, g.day)) continue;
          const what =
            stat === 'margin' ? `beat the ${league.teams[m.opp].name} by ${m.v}` : `put up ${m.v} ${TEAM_REC_LABEL[stat].toLowerCase()} on the ${league.teams[m.opp].name}`;
          return { years: season - m.season, line: `${when(m.season)}, the ${league.teams[m.tid].name} ${what}, ${m.score[0]}-${m.score[1]}.` };
        }
    }
  }
  for (const c of league.chronicle ?? []) {
    if (!ROUND_YEARS.has(season - c.season)) continue;
    for (const s of c.stories)
      if (s.kind === 'game' && s.tids.includes(g.home) && s.tids.includes(g.away) && sameDate(c.season, s.day, season, g.day))
        return { years: season - c.season, line: `${when(c.season)}: ${s.head}.`, ...(league.news.some((n) => n.id === s.id) ? { story: s.id } : {}) };
  }
  return null;
}
