// What a Finals was, told from one side: how the series went (a sweep, a comeback from 3-1, a Game
// 7), the night that ended it (the shot in the last seconds, the deficit overcome, overtime), whether
// it was an upset by the regular season, the Finals MVP and his line, and what the title means
// against the franchise's history (titleLine). The title moment and the Finals-loss moment read it
// (src/ui/moments.ts), so a Game 7 won at the horn doesn't get the same card as a sweep. Read from the
// season's Finals games while the league keeps them; nothing here draws from any random stream.
import type { BoxLine, GameResult, League, PlayoffSeries } from '../../types';
import { countWord, ordWord, titleLine } from './history';

/** The shot that won the night: who (his name in the box score), when (seconds left), and whether it beat the horn. */
export interface FinalsShot {
  name?: string;
  pid?: number;
  secs: number;
  buzzer: boolean;
  three: boolean;
  ft: boolean;
}

export interface FinalsStory {
  /** The side it's told from won it. */
  won: boolean;
  /** The other side's tid. */
  opp: number;
  /** The series from this side: its wins, then the other side's. */
  w: number;
  l: number;
  /** The deepest hole this side was in (games behind), and the score then ("1-3"). */
  down?: { by: number; at: [number, number] };
  /** The deepest hole the other side climbed out of against it (a lead blown). */
  blew?: { by: number; at: [number, number] };
  /** The last game: its number, the score from this side, overtime, the winner's biggest deficit overcome, and the shot that won it. */
  last?: { n: number; gid: number; us: number; them: number; ot: number; comeback: number; shot?: FinalsShot };
  /** The champion won fewer regular-season games than the runner-up, by this many or more (UPSET_WINS). */
  upset?: { champWins: number; runnerWins: number };
  /** The Finals MVP and his series line ("31.2 pts · 7.0 reb · 6.4 ast"). */
  mvp?: { pid: number; line: string };
  /** What the title means against the franchise's titles (titleLine): null for the loser, or a title with nothing before it on record. */
  history: string | null;
}

/** Regular-season wins the runner-up must have had over the champion for the title to read as an upset. */
export const UPSET_WINS = 6;
/** A buzzer-beater: the go-ahead basket with half a second or less left (as the game story has it). */
const BUZZER = 0.5;

/** A season's Finals, for the one season the league still holds its bracket. */
const finalsOf = (league: League): PlayoffSeries | undefined => league.playoffs.find((s) => s.round === 4);

/** The Finals' games, in order (the league keeps this season's and last season's results). */
function finalsGames(league: League, season: number, s: PlayoffSeries): GameResult[] {
  return league.games
    .filter(
      (g) =>
        g.season === season &&
        g.type === 'playoffs' &&
        (g.seriesId === s.id || g.seriesId === 'F4-0') &&
        [g.home.tid, g.away.tid].includes(s.high) &&
        [g.home.tid, g.away.tid].includes(s.low),
    )
    .sort((a, b) => a.day - b.day || a.gid - b.gid);
}

/** The shot that put the winner ahead for good, when it came in the last 24 seconds of the last period (from the play-by-play). */
function winningShot(res: GameResult): FinalsShot | undefined {
  const pbp = res.pbp;
  if (!pbp?.length) return undefined;
  const winSide: 0 | 1 = res.home.pts > res.away.pts ? 0 : 1;
  let at: (typeof pbp)[number] | undefined;
  let prev = 0;
  for (const e of pbp) {
    const lead = winSide === 0 ? e.hs - e.as : e.as - e.hs;
    if (lead > 0 && prev <= 0) at = e;
    prev = lead;
  }
  if (!at || at.q !== 4 + res.ot || at.clock > 24) return undefined;
  const box = winSide === 0 ? res.home : res.away;
  const who = box.players.filter((b) => b.min > 0 && at.text.startsWith(`${b.name.split(' ').slice(-1)[0]} `)).sort((a, b) => b.pts - a.pts || b.name.length - a.name.length)[0];
  return {
    ...(who ? { name: who.name, pid: who.pid } : {}),
    secs: at.clock,
    buzzer: at.clock <= BUZZER,
    three: /\bthree\b|3-pt|3PT|three-pointer/i.test(at.text),
    ft: at.kind === 'ft',
  };
}

const pg = (x: number, n: number) => (x / Math.max(1, n)).toFixed(1);

/** A player's line over the series' games ("31.2 pts · 7.0 reb · 6.4 ast"). */
function seriesLine(games: GameResult[], pid: number): string | undefined {
  const lines: BoxLine[] = games.flatMap((g) => [...g.home.players, ...g.away.players].filter((b) => b.pid === pid && b.min > 0));
  if (!lines.length) return undefined;
  const sum = (k: (b: BoxLine) => number) => lines.reduce((a, b) => a + k(b), 0);
  return `${pg(
    sum((b) => b.pts),
    lines.length,
  )} pts · ${pg(
    sum((b) => b.orb + b.drb),
    lines.length,
  )} reb · ${pg(
    sum((b) => b.ast),
    lines.length,
  )} ast`;
}

/**
 * This season's Finals from `tid`'s side, while the league holds its bracket and games; null when
 * `tid` wasn't in them or they aren't over.
 */
export function finalsStory(league: League, tid: number): FinalsStory | null {
  const s = finalsOf(league);
  if (!s || s.winner === undefined || (s.high !== tid && s.low !== tid)) return null;
  const season = league.season;
  const opp = s.high === tid ? s.low : s.high;
  const [w, l] = s.high === tid ? [s.highWins, s.lowWins] : [s.lowWins, s.highWins];
  const won = s.winner === tid;
  const games = finalsGames(league, season, s);
  // the series game by game: the deepest hole each side was in
  let a = 0;
  let b = 0;
  let down: FinalsStory['down'];
  let blew: FinalsStory['blew'];
  for (const g of games) {
    const usPts = g.home.tid === tid ? g.home.pts : g.away.pts;
    const themPts = g.home.tid === tid ? g.away.pts : g.home.pts;
    if (usPts > themPts) a++;
    else b++;
    if (b - a >= 2 && (!down || b - a > down.by)) down = { by: b - a, at: [a, b] };
    if (a - b >= 2 && (!blew || a - b > blew.by)) blew = { by: a - b, at: [a, b] };
  }
  const end = games.at(-1);
  let last: FinalsStory['last'];
  if (end && games.length === w + l) {
    const home = end.home.tid === tid;
    const us = home ? end.home.pts : end.away.pts;
    const them = home ? end.away.pts : end.home.pts;
    const loser = end.home.pts > end.away.pts ? end.away : end.home;
    const shot = winningShot(end);
    last = { n: games.length, gid: end.gid, us, them, ot: end.ot, comeback: loser.extra?.biggestLead ?? 0, ...(shot ? { shot } : {}) };
  }
  const champ = s.winner;
  const runner = champ === s.high ? s.low : s.high;
  const winsOf = (t: number) => league.teams[t].seasons.find((x) => x.season === season)?.won ?? 0;
  const upset = winsOf(runner) - winsOf(champ) >= UPSET_WINS ? { champWins: winsOf(champ), runnerWins: winsOf(runner) } : undefined;
  const aw = league.awards.find((x) => x.season === season);
  const mvpPid = aw?.finalsMvp;
  const mvpLine = mvpPid !== undefined ? seriesLine(games, mvpPid) : undefined;
  return {
    won,
    opp,
    w,
    l,
    ...(down ? { down } : {}),
    ...(blew ? { blew } : {}),
    ...(last ? { last } : {}),
    ...(upset ? { upset } : {}),
    ...(mvpPid !== undefined && mvpLine ? { mvp: { pid: mvpPid, line: mvpLine } } : {}),
    history: won ? titleLine(league, tid, season, true) : null,
  };
}

/** "in a sweep", "in five", "in seven". */
export const inGames = (w: number, l: number) => (w + l === 4 ? 'in a sweep' : `in ${countWord(w + l)}`);

/**
 * The night that ended it, in a sentence, from the champion's side (`won`) or the loser's: the shot at
 * the horn, the late winner, the comeback, overtime; null for an ordinary closeout.
 */
export function clincherLine(f: FinalsStory, us: string, them: string): string | null {
  const g = f.last;
  if (!g) return null;
  const score = `${Math.max(g.us, g.them)}-${Math.min(g.us, g.them)}`;
  const game = `Game ${g.n}`;
  const who = g.shot?.name;
  const what = g.shot ? (g.shot.ft ? 'free throws' : g.shot.three ? 'a three' : 'a basket') : '';
  if (g.shot?.buzzer)
    return f.won
      ? `${who ?? 'The winner'} beat the buzzer with ${what} to win ${game}, ${score}.`
      : `${who ?? `The ${them}`} beat the buzzer with ${what} to win ${game}, ${score}.`;
  if (g.shot && g.shot.secs <= 12) {
    const left = `${Math.max(1, Math.round(g.shot.secs))} second${Math.round(g.shot.secs) === 1 ? '' : 's'} left`;
    return f.won
      ? `${who ?? 'The winning basket'}${who ? ` hit ${what}` : ' came'} with ${left} in ${game}, ${score}.`
      : `${who ?? `The ${them}`} won ${game} with ${left}, ${score}.`;
  }
  if (g.comeback >= 12)
    return f.won ? `From ${g.comeback} down in ${game}, the ${us} came back to win it, ${score}.` : `The ${them} came back from ${g.comeback} down to win ${game}, ${score}.`;
  if (g.ot) return `${game} went to ${g.ot === 1 ? 'overtime' : `${countWord(g.ot)} overtimes`}: ${score}.`;
  if (g.n === 7) return `The ${f.won ? us : them} won Game 7, ${score}.`;
  return null;
}

/** How the series went, in a sentence, or null: a sweep, a comeback from a hole, a lead let go, a Game 7. */
export function seriesArc(f: FinalsStory, us: string, them: string): string | null {
  // (after the deepest hole: "won three straight", or "won four of the next five")
  const run = (n: number, of: number) => (n === of ? `${countWord(n)} straight` : `${countWord(n)} of the next ${countWord(of)}`);
  if (f.won && f.down) return `Down ${f.down.at[1]}-${f.down.at[0]}, the ${us} won ${run(f.w - f.down.at[0], f.w + f.l - f.down.at[0] - f.down.at[1])}.`;
  if (!f.won && f.blew) return `Up ${f.blew.at[0]}-${f.blew.at[1]}, the ${us} lost ${run(f.l - f.blew.at[1], f.w + f.l - f.blew.at[0] - f.blew.at[1])}.`;
  if (f.won && f.l === 0) return `A sweep of the ${them}.`;
  if (!f.won && f.w === 0) return `Swept by the ${them}.`;
  return null;
}

/** "the 4th" of a coach's titles, for the title card ("Rev Coach's third title"). */
export const titleCount = (n: number) => `${ordWord(n)} title`;
