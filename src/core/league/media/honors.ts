// Weekly and monthly honors by conference: Player of the Week, and Player, Rookie and Coach of the
// Month by calendar month (October goes in with November, a short April with March, as the league
// does it). Read from the box scores of the days they cover, once a week or a month, never daily.
import type { GameResult, League } from '../../types';
import { gameScore } from '../awards';
import { activeCoach } from '../coaches';
import { addInbox, dayToDate, playerName, sentence } from '../helpers';
import { worldRng } from '../world';
import type { Honor, MediaState } from '../media';
import { Voice, confName, f1, last, list, nth, publish, rec, signed } from './voice';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Regular-season results played from day `from` to day `to` (both included), this season. */
function played(league: League, from: number, to: number): GameResult[] {
  const out: GameResult[] = [];
  for (let i = league.games.length - 1; i >= 0; i--) {
    const g = league.games[i];
    if (g.season !== league.season) break;
    if (g.day < from) break;
    if (g.day <= to && g.type === 'regular') out.push(g);
  }
  return out;
}

interface Line {
  pid: number;
  tid: number;
  gp: number;
  wins: number;
  pts: number;
  reb: number;
  ast: number;
  gmsc: number;
}

interface TeamLine {
  tid: number;
  w: number;
  l: number;
  diff: number;
}

/** Everyone's totals over a window's games, and each team's record and margin. */
function tally(games: GameResult[]) {
  const players = new Map<number, Line>();
  const teams = new Map<number, TeamLine>();
  for (const g of games) {
    for (const [side, opp] of [
      [g.home, g.away],
      [g.away, g.home],
    ] as const) {
      const won = side.pts > opp.pts;
      const t = teams.get(side.tid) ?? { tid: side.tid, w: 0, l: 0, diff: 0 };
      if (won) t.w++;
      else t.l++;
      t.diff += side.pts - opp.pts;
      teams.set(side.tid, t);
      for (const b of side.players) {
        if (b.min <= 0) continue;
        const x = players.get(b.pid) ?? { pid: b.pid, tid: side.tid, gp: 0, wins: 0, pts: 0, reb: 0, ast: 0, gmsc: 0 };
        x.tid = side.tid;
        x.gp++;
        if (won) x.wins++;
        x.pts += b.pts;
        x.reb += b.orb + b.drb;
        x.ast += b.ast;
        x.gmsc += gameScore(b);
        players.set(b.pid, x);
      }
    }
  }
  return { players: [...players.values()], teams: [...teams.values()] };
}

/** "31.5 points, 8.0 rebounds and 6.3 assists a game as the Knicks went 4-0". */
function lineText(league: League, x: Line): string {
  const parts = [`${f1(x.pts / x.gp)} points`];
  if (x.reb / x.gp >= 6) parts.push(`${f1(x.reb / x.gp)} rebounds`);
  if (x.ast / x.gp >= 5) parts.push(`${f1(x.ast / x.gp)} assists`);
  return `${list(parts)} a game as the ${league.teams[x.tid].name} went ${rec(x.wins, x.gp - x.wins)}`;
}

const confOf = (league: League, tid: number) => league.teams[tid].conf;

/** Keep this season's and last season's honors. */
function keep(m: MediaState, h: Honor[], season: number) {
  m.honors = [...(m.honors ?? []).filter((x) => x.season >= season - 1), ...h];
}

/** The award a player's page lists for an honor. */
const RECORD: Record<Honor['kind'], string | null> = { potw: 'Player of the Week', potm: 'Player of the Month', rotm: 'Rookie of the Month', cotm: null };

/** The award types the press's honors leave on players' records: a season's flavour, never a reason to remember a career. */
export const HONOR_AWARDS: ReadonlySet<string> = new Set(['Player of the Week', 'Player of the Month', 'Rookie of the Month']);

function record(league: League, h: Honor) {
  const type = RECORD[h.kind];
  const p = h.pid !== undefined ? league.players[h.pid] : undefined;
  if (type && p) p.awards.push({ season: league.season, type });
}

/** How many of this kind he (or for a coach, the team) has this season, this one included. */
function countThisSeason(m: MediaState, h: Honor): number {
  return (m.honors ?? []).filter((x) => x.season === h.season && x.kind === h.kind && (h.pid !== undefined ? x.pid === h.pid : x.tid === h.tid && x.pid === undefined)).length;
}

/** The user hears about his own player's or his own honor from the league office. */
function tellUser(league: League, m: MediaState, h: Honor, newsId: number, label: string) {
  if (h.tid !== league.userTid) return;
  const n = countThisSeason(m, h);
  const who = h.pid !== undefined ? playerName(league.players[h.pid]) : 'You';
  const again = n > 1 ? ` It's the ${nth(n)} of the season.` : h.pid !== undefined ? ' His first of the season.' : ' Your first of the season.';
  addInbox(league, {
    from: 'League Office',
    subject: h.pid !== undefined ? `${who}: ${label}` : `You're the ${label}`,
    body: `${h.pid !== undefined ? `${who} is the ${label}` : `You are the ${label}`}: ${h.line}.${again}`,
    tone: 'good',
    link: `/league/news?story=${newsId}`,
  });
}

/** The week's best in each conference (two games at least): production, with a little for winning. */
export function playersOfTheWeek(league: League, m: MediaState) {
  const to = league.day - 1;
  const { players } = tally(played(league, league.day - 7, to));
  const best = (conf: 'E' | 'W') =>
    players
      .filter((x) => x.gp >= 2 && confOf(league, x.tid) === conf && league.players[x.pid])
      .map((x) => ({ x, s: x.gmsc / x.gp + 1.2 * Math.min(x.gp, 4) + (3 * x.wins) / x.gp }))
      .sort((a, b) => b.s - a.s || a.x.pid - b.x.pid)[0]?.x;
  const won = (['E', 'W'] as const).flatMap((conf) => {
    const x = best(conf);
    return x ? [{ conf, x }] : [];
  });
  if (!won.length) return;
  const honors: Honor[] = won.map(({ conf, x }) => ({ season: league.season, day: league.day, kind: 'potw', conf, tid: x.tid, pid: x.pid, line: lineText(league, x) }));
  keep(m, honors, league.season);
  for (const h of honors) record(league, h);
  const v = new Voice(worldRng(league, 'potw', league.season, league.day), m);
  const L = (h: Honor) => last(league, league.players[h.pid!]);
  const mine = honors.find((h) => h.tid === league.userTid);
  const head = mine
    ? v.say('potw-u', [
        `${L(mine)} named ${confName(mine.conf!)} player of the week`,
        `Player of the week: ${L(mine)}`,
        `${L(mine)} is the ${confName(mine.conf!)}'s player of the week`,
      ])
    : honors.length === 2
      ? v.say('potw', [
          `Players of the week: ${L(honors[0])} and ${L(honors[1])}`,
          `${L(honors[0])} and ${L(honors[1])} named players of the week`,
          `The week belonged to ${L(honors[0])} and ${L(honors[1])}`,
        ])
      : `Player of the week: ${L(honors[0])}`;
  const dek = honors.map((h) => `${confName(h.conf!)}: ${playerName(league.players[h.pid!])}, ${h.line}.`).join(' ');
  const n = publish(league, { kind: 'honor', head, dek, tids: honors.map((h) => h.tid), pids: honors.map((h) => h.pid!), weight: mine ? 2 : 1 });
  for (const h of honors) tellUser(league, m, h, n.id, `${confName(h.conf!)} Player of the Week`);
}

/** Calendar month of a season day. */
const monthOf = (league: League, day: number) => dayToDate(league.season, day).getUTCMonth();

/**
 * Called every regular-season day and on the first days after it: when the month the window
 * started in has ended, its honors go out. October waits for November's; an April too short to
 * judge (under ten days of games) goes in with March.
 */
export function monthlyHonors(league: League, m: MediaState) {
  if (!m.month || m.month.season !== league.season) {
    // a save from before the press, mid-season: its first month starts with the current one
    let from = league.phase === 'regular' ? league.day : 0;
    while (from > 0 && monthOf(league, from - 1) === monthOf(league, league.day)) from--;
    m.month = { season: league.season, from, ...(league.phase !== 'regular' && league.day > 0 ? { done: true as const } : {}) };
  }
  const w = m.month;
  if (w.done) return;
  const lastDay = league.regularSeasonDays;
  const ended = league.phase !== 'regular';
  if (!ended) {
    const today = league.day;
    const prev = today - 1;
    if (prev < 0 || monthOf(league, prev) === monthOf(league, today)) return;
    // October rolls into November
    if (monthOf(league, prev) === 9) return;
    // a short last month rolls into this one: the regular season's end is under ten days off
    if (lastDay - today < 10) return;
    awardMonth(league, m, w.from, prev);
    w.from = today;
    return;
  }
  awardMonth(league, m, w.from, Math.min(lastDay, league.day - 1));
  w.done = true;
}

function monthLabel(league: League, from: number, to: number): string {
  const a = monthOf(league, from);
  const b = monthOf(league, to);
  return a === b ? MONTHS[a] : `${MONTHS[a]} and ${MONTHS[b]}`;
}

function awardMonth(league: League, m: MediaState, from: number, to: number) {
  const games = played(league, from, to);
  if (games.length < 20) return;
  const { players, teams } = tally(games);
  const label = monthLabel(league, from, to);
  const most = Math.max(...teams.map((t) => t.w + t.l));
  const honors: Honor[] = [];
  for (const conf of ['E', 'W'] as const) {
    const inConf = players.filter((x) => confOf(league, x.tid) === conf && league.players[x.pid]);
    const pom = inConf
      .filter((x) => x.gp >= Math.max(4, most * 0.5))
      .map((x) => ({ x, s: x.gmsc / x.gp + (4 * x.wins) / x.gp }))
      .sort((a, b) => b.s - a.s || a.x.pid - b.x.pid)[0]?.x;
    if (pom) honors.push({ season: league.season, day: league.day, kind: 'potm', conf, tid: pom.tid, pid: pom.pid, line: lineText(league, pom) });
    const rom = inConf
      .filter((x) => x.gp >= Math.max(3, most * 0.4) && league.players[x.pid].draft.year === league.season - 1)
      .sort((a, b) => b.gmsc / b.gp - a.gmsc / a.gp || a.pid - b.pid)[0];
    if (rom) honors.push({ season: league.season, day: league.day, kind: 'rotm', conf, tid: rom.tid, pid: rom.pid, line: lineText(league, rom) });
    const com = teams
      .filter((t) => confOf(league, t.tid) === conf && t.w + t.l >= Math.max(4, most * 0.6))
      .sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l) || b.diff / (b.w + b.l) - a.diff / (a.w + a.l) || a.tid - b.tid)[0];
    if (com)
      honors.push({
        season: league.season,
        day: league.day,
        kind: 'cotm',
        conf,
        tid: com.tid,
        line: `the ${league.teams[com.tid].name} went ${rec(com.w, com.l)} in ${label}, by ${signed(com.diff / (com.w + com.l))} a game`,
      });
  }
  if (!honors.length) return;
  keep(m, honors, league.season);
  for (const h of honors) record(league, h);
  const v = new Voice(worldRng(league, 'month', league.season, from), m);
  const coach = (tid: number) => activeCoach(league, tid)?.name ?? league.teams[tid].coach.name;
  const who = (h: Honor) => (h.pid !== undefined ? last(league, league.players[h.pid]) : surname(coach(h.tid)));
  const of = (k: Honor['kind']) => honors.filter((h) => h.kind === k);
  const mine =
    honors.find((h) => h.tid === league.userTid && h.kind === 'cotm') ??
    honors.find((h) => h.tid === league.userTid && h.kind === 'potm') ??
    honors.find((h) => h.tid === league.userTid);
  const KIND: Record<Honor['kind'], string> = { potw: 'player of the week', potm: 'player of the month', rotm: 'rookie of the month', cotm: 'coach of the month' };
  const pom = of('potm');
  let head: string;
  if (mine)
    head = v.say('month-u', [
      `${who(mine)} named ${confName(mine.conf!)} ${KIND[mine.kind]} for ${label}`,
      `${label}'s ${KIND[mine.kind]} in the ${confName(mine.conf!)}: ${who(mine)}`,
      `${who(mine)} takes the ${confName(mine.conf!)}'s ${KIND[mine.kind]} honor`,
    ]);
  else if (pom.length === 2)
    head = v.say('month', [
      `${label}'s best: ${who(pom[0])} and ${who(pom[1])}`,
      `${who(pom[0])} and ${who(pom[1])} named players of the month`,
      `Players of ${label}: ${who(pom[0])} and ${who(pom[1])}`,
    ]);
  else head = `The honors for ${label}`;
  const group = (k: Honor['kind'], noun: string) => {
    const hs = of(k);
    return hs.length ? `${noun}: ${hs.map((h) => `${h.pid !== undefined ? playerName(league.players[h.pid]) : coach(h.tid)} (${confName(h.conf!)})`).join(', ')}.` : '';
  };
  const dek = [group('potm', 'Players'), group('rotm', 'Rookies'), group('cotm', 'Coaches')].filter(Boolean).join(' ');
  const body = honors.map((h) => {
    const nm = h.pid !== undefined ? playerName(league.players[h.pid]) : coach(h.tid);
    return `${confName(h.conf!)} ${KIND[h.kind]}: ${sentence(nm)} ${h.line.charAt(0).toUpperCase()}${h.line.slice(1)}.`;
  });
  const n = publish(league, {
    kind: 'honor',
    head,
    dek,
    body: [body.join('\n')],
    tids: honors.map((h) => h.tid),
    pids: honors.flatMap((h) => (h.pid !== undefined ? [h.pid] : [])),
    // (the user hears it from the league office; a month's honors are a story, not a front page)
    weight: 2,
  });
  const LABEL: Record<Honor['kind'], string> = { potw: 'Player of the Week', potm: 'Player of the Month', rotm: 'Rookie of the Month', cotm: 'Coach of the Month' };
  for (const h of honors) tellUser(league, m, h, n.id, `${confName(h.conf!)} ${LABEL[h.kind]} for ${label}`);
}

const surname = (name: string) => name.split(' ').slice(1).join(' ') || name;
