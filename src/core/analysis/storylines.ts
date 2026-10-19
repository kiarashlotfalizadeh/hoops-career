// Storylines for an upcoming game: what a broadcast would lead with. A player facing a team he
// played for, a career milestone one good night away, winning and losing streaks (a team's, or a
// player's run of big nights), a rematch of last season's playoff series, two players at the top of
// the MVP race, and two No. 1 picks. Each one only says what the stored data shows: a revenge game
// is "the first meeting since he left" only when every game since is stored, career milestones
// only count careers the game has whole (see milestones.ts), and a player's streak is "each of his
// last N games" (his games this season are all stored, last season's mostly aren't).

import type { GameResult, League, Player, ScheduledGame } from '../types';
import { seasonLabel } from '../constants';
import { playerName } from '../league/helpers';
import { seriesLabel } from '../league/playoffs';
import { awardLadder } from '../league/awards';
import { careerOnRecord, careerTotals, STAT_WORD, type MilestoneStat } from './milestones';

export type StorylineKind = 'revenge' | 'milestone' | 'streak' | 'hot' | 'rematch' | 'mvp' | 'picks';

export interface Storyline {
  id: string;
  kind: StorylineKind;
  text: string;
  pids: number[];
  tids: number[];
  /** How much a broadcast would make of it: the list is sorted by it, highest first. */
  weight: number;
}

const BIG_GAMES = { pts20: 6, pts30: 3, dbl: 6 };

/** A player's season lines with games in them, in the order he played them (stats rows are added as he plays). */
function teamsPlayedFor(p: Player) {
  return p.stats.filter((s) => s.gp > 0);
}

/** Last name, or the full name when he shares it with someone else in the game. */
function namer(players: Player[]) {
  const count = new Map<string, number>();
  for (const p of players) count.set(p.lastName, (count.get(p.lastName) ?? 0) + 1);
  return (p: Player) => ((count.get(p.lastName) ?? 0) > 1 || !p.lastName ? playerName(p) : p.lastName);
}

function revenge(league: League, p: Player, opp: number, name: string): Storyline | null {
  const rows = teamsPlayedFor(p);
  const withOpp = rows.filter((s) => s.tid === opp);
  // a real stint: 20 games or more for them (real seasons included)
  if (withOpp.reduce((a, s) => a + s.gp, 0) < 20) return null;
  const lastIdx = rows.lastIndexOf(withOpp[withOpp.length - 1]);
  const left = rows[lastIdx].season;
  // every game since he left is stored when he left this season, or last summer (his last games
  // last season were theirs): then "the first meeting since" can be checked
  const checkable = left === league.season || (left === league.season - 1 && !rows.slice(lastIdx + 1).some((s) => s.season === left));
  const met = checkable && league.games.some((g) => g.season === league.season && metSince(g, p.pid, opp));
  const first = checkable && !met;
  // how he left, when the transaction log has it (the moves of the last two seasons, every trade)
  const txn = [...(league.transactions ?? [])]
    .reverse()
    .find((t) => t.season >= left && (t.kind === 'trade' ? t.sides?.some((s) => s.tid === opp && s.players.some((x) => x.pid === p.pid)) : t.pid === p.pid && t.tids[0] === opp));
  const how = txn?.kind === 'trade' ? 'traded him' : txn && ['release', 'waive', 'buyout'].includes(txn.kind) ? 'let him go' : null;
  const team = league.teams[opp];
  const until = `his team until ${seasonLabel(left)}`;
  const text = first
    ? how
      ? `${name} faces the ${team.name} for the first time since they ${how} (${until}).`
      : `${name} faces the ${team.name} for the first time since he left (${until}).`
    : `${name} faces his old team, the ${team.name} (${until}).`;
  const recency = Math.max(0, 3 - (league.season - left));
  return { id: `revenge-${p.pid}`, kind: 'revenge', text, pids: [p.pid], tids: [opp, p.tid], weight: 42 + (first ? 18 : 0) + recency * 3 + Math.max(0, p.ovr - 75) };
}

/** He played against `opp` in this game, for another team. */
function metSince(g: GameResult, pid: number, opp: number) {
  for (const [mine, theirs] of [
    [g.home, g.away],
    [g.away, g.home],
  ]) {
    if (theirs.tid === opp && mine.tid !== opp && mine.players.some((b) => b.pid === pid && b.min > 0)) return true;
  }
  return false;
}

/** Points, rebounds or assists a game this season (last season's until he has played five). */
function perGame(p: Player, season: number, stat: MilestoneStat): number {
  for (const s of [season, season - 1]) {
    const rows = p.stats.filter((x) => x.season === s && !x.playoffs);
    const gp = rows.reduce((a, x) => a + x.gp, 0);
    if (gp < 5) continue;
    const tot = rows.reduce((a, x) => a + (stat === 'pts' ? x.pts : stat === 'reb' ? x.orb + x.drb : x.ast), 0);
    return tot / gp;
  }
  return 0;
}

/** The career mark within one good night: about a third more than his average gets him there. */
function milestoneWatch(league: League, p: Player, name: string): Storyline | null {
  if (!careerOnRecord(league, p)) return null;
  const tot = careerTotals(p);
  let best: Storyline | null = null;
  for (const [stat, min] of [
    ['pts', 8],
    ['reb', 5],
    ['ast', 4],
  ] as const) {
    const avg = perGame(p, league.season, stat);
    if (avg < min) continue;
    const mark = (Math.floor(tot[stat] / 1000) + 1) * 1000;
    const need = mark - tot[stat];
    if (need > Math.round(avg * 1.3)) continue;
    const weight = 50 + mark / 1000 + (stat === 'pts' ? 6 : 0);
    if (best && best.weight >= weight) continue;
    const word = STAT_WORD[stat];
    best = {
      id: `milestone-${p.pid}-${stat}-${mark}`,
      kind: 'milestone',
      text: `${name} needs ${need} ${need === 1 ? word[0] : word[1]} for ${mark.toLocaleString('en-US')} in his career (he averages ${avg.toFixed(1)}).`,
      pids: [p.pid],
      tids: [p.tid],
      weight,
    };
  }
  return best;
}

/** A player's run of big nights going in: 20+ points, 30+ or double-doubles in each of his last N games this season. */
function hotStreak(p: Player, name: string, lines: { pts: number; dbl: boolean }[]): Storyline | null {
  const run = (ok: (x: { pts: number; dbl: boolean }) => boolean) => {
    let n = 0;
    for (let i = lines.length - 1; i >= 0 && ok(lines[i]); i--) n++;
    return n;
  };
  const all = (n: number) => (n === lines.length ? `every one of his ${n} games this season` : `each of his last ${n} games`);
  const p30 = run((x) => x.pts >= 30);
  if (p30 >= BIG_GAMES.pts30)
    return { id: `hot-${p.pid}-30`, kind: 'hot', text: `${name} has scored 30 or more in ${all(p30)}.`, pids: [p.pid], tids: [p.tid], weight: 48 + p30 * 2 };
  const p20 = run((x) => x.pts >= 20);
  if (p20 >= BIG_GAMES.pts20) return { id: `hot-${p.pid}-20`, kind: 'hot', text: `${name} has scored 20 or more in ${all(p20)}.`, pids: [p.pid], tids: [p.tid], weight: 36 + p20 };
  const dbl = run((x) => x.dbl);
  if (dbl >= BIG_GAMES.dbl) return { id: `hot-${p.pid}-dbl`, kind: 'hot', text: `${name} has a double-double in ${all(dbl)}.`, pids: [p.pid], tids: [p.tid], weight: 36 + dbl };
  return null;
}

/** Last season's playoff series between the two teams, from the stored results (the user's games are kept a season). */
function rematch(league: League, a: number, b: number): Storyline | null {
  const games = league.games.filter(
    (g) => g.season === league.season - 1 && g.type === 'playoffs' && ((g.home.tid === a && g.away.tid === b) || (g.home.tid === b && g.away.tid === a)),
  );
  if (!games.length || !games[0].seriesId) return null;
  const m = /^([EWF])(\d)-/.exec(games[0].seriesId);
  if (!m) return null;
  const round = Number(m[2]);
  const wins = (tid: number) => games.filter((g) => (g.home.pts > g.away.pts ? g.home.tid : g.away.tid) === tid).length;
  const [wa, wb] = [wins(a), wins(b)];
  const label = seriesLabel({ round, conf: m[1] as 'E' | 'W' | 'F' } as Parameters<typeof seriesLabel>[0]);
  // a series is won with four (the stored games are all of it)
  const winner = wa === 4 ? a : wb === 4 ? b : null;
  const text =
    winner !== null
      ? `A rematch of last season's ${label}, which the ${league.teams[winner].name} won ${Math.max(wa, wb)}-${Math.min(wa, wb)}.`
      : `A rematch of last season's ${label}.`;
  return { id: `rematch-${games[0].seriesId}`, kind: 'rematch', text, pids: [], tids: [a, b], weight: 58 + round * 3 };
}

/**
 * The storylines for game `g`, highest weight first. `out`: players who won't play tonight
 * (injured, resting); without it, the injured (a questionable player cleared to play counts).
 */
export function storylines(league: League, g: Pick<ScheduledGame, 'gid' | 'home' | 'away' | 'type'>, out?: Set<number>): Storyline[] {
  const sides = [g.home, g.away];
  const roster = (tid: number) => Object.values(league.players).filter((p) => p.tid === tid);
  const cleared = new Set(league.gameTime?.gid === g.gid ? league.gameTime.play : []);
  const playing = (p: Player) => (out ? !out.has(p.pid) : !(p.injury && p.injury.gamesRemaining > 0) || cleared.has(p.pid));
  const both = [...roster(g.home), ...roster(g.away)];
  const name = namer(both);
  const players = both.filter(playing);
  const res: Storyline[] = [];

  // revenge games: the two best stories (one player rarely faces both his old teams)
  const rev = players.flatMap((p) => revenge(league, p, p.tid === g.home ? g.away : g.home, name(p)) ?? []);
  res.push(...rev.sort((a, b) => b.weight - a.weight).slice(0, 2));

  // (career totals are regular-season ones: a postseason night doesn't add to them)
  if (g.type === 'regular')
    for (const p of players) {
      const m = milestoneWatch(league, p, name(p));
      if (m) res.push(m);
    }

  // players' big-night runs, from this season's stored games in order
  const lines = new Map(players.map((p) => [p.pid, [] as { pts: number; dbl: boolean }[]]));
  for (const r of league.games) {
    if (r.season !== league.season || r.type === 'allstar') continue;
    for (const b of [r.home.players, r.away.players].flat()) {
      const l = lines.get(b.pid);
      if (l && b.min > 0) l.push({ pts: b.pts, dbl: [b.pts, b.orb + b.drb, b.ast, b.stl, b.blk].filter((x) => x >= 10).length >= 2 });
    }
  }
  for (const p of players) {
    const h = hotStreak(p, name(p), lines.get(p.pid)!);
    if (h) res.push(h);
  }

  // the teams' streaks (regular season)
  if (g.type === 'regular') {
    for (const tid of sides) {
      const ts = league.teams[tid].seasons.find((s) => s.season === league.season);
      const n = ts?.streak ?? 0;
      if (Math.abs(n) >= 4)
        res.push({
          id: `streak-${tid}-${n}`,
          kind: 'streak',
          text: `The ${league.teams[tid].name} have ${n > 0 ? 'won' : 'lost'} ${Math.abs(n)} straight.`,
          pids: [],
          tids: [tid],
          weight: 30 + 3 * Math.abs(n),
        });
    }
  }

  const re = rematch(league, g.home, g.away);
  if (re) res.push(re);

  // the MVP race: two of its top five, or its leader (regular season, once the ladder means something)
  const gp = Math.min(...sides.map((tid) => league.teams[tid].seasons.find((s) => s.season === league.season)).map((ts) => (ts ? ts.won + ts.lost : 0)));
  if (g.type === 'regular' && gp >= 15) {
    const ladder = awardLadder(league, 'mvp', 5);
    const rank = (tid: number) => ladder.findIndex((x) => league.players[x.pid]?.tid === tid && players.some((p) => p.pid === x.pid));
    const [rh, ra] = [rank(g.home), rank(g.away)];
    if (rh >= 0 && ra >= 0) {
      const [a, b] = [ladder[Math.min(rh, ra)].pid, ladder[Math.max(rh, ra)].pid].map((pid) => league.players[pid]);
      res.push({
        id: `mvp-${a.pid}-${b.pid}`,
        kind: 'mvp',
        text: `MVP race: ${name(a)}, No. ${Math.min(rh, ra) + 1} on the ladder, against ${name(b)}, No. ${Math.max(rh, ra) + 1}.`,
        pids: [a.pid, b.pid],
        tids: [a.tid, b.tid],
        weight: 72 - Math.min(rh, ra) * 2,
      });
    } else if (rh === 0 || ra === 0) {
      const lead = league.players[ladder[0].pid];
      res.push({ id: `mvp-${lead.pid}`, kind: 'mvp', text: `${name(lead)} leads the MVP race.`, pids: [lead.pid], tids: [lead.tid], weight: 44 });
    }
  }

  // two No. 1 overall picks (the best on each side)
  const top = sides.map((tid) => players.filter((p) => p.tid === tid && p.draft.round === 1 && p.draft.pick === 1 && p.draft.year > 0).sort((a, b) => b.ovr - a.ovr)[0]);
  if (top[0] && top[1])
    res.push({
      id: `picks-${top[0].pid}-${top[1].pid}`,
      kind: 'picks',
      text: `Two No. 1 picks: ${name(top[0])} (${top[0].draft.year}) and ${name(top[1])} (${top[1].draft.year}).`,
      pids: [top[0].pid, top[1].pid],
      tids: sides,
      weight: 40 + Math.max(0, (top[0].ovr + top[1].ovr) / 2 - 75),
    });

  return res.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}
