// Broadcast graphics for the live game: now and then a lower-third about a player or a team ("Brunson:
// 14 points in the 4th", "5 of 5 from three", a new season high, a career milestone, "BOS 18-4 on
// fast-break points" at a break). Pure: it reads the game as the court has drawn it (the snapshot and
// the possession logs drawn so far) and what was known before tip-off, and says only what those
// show. The Live screen shows at most one every two minutes of game time, each once.

import type { BoxLine } from '../../core/types';
import type { PossLog } from '../../core/sim/log';
import { STAT_WORD, type MilestoneStat } from '../../core/analysis/milestones';
import { periodLabel } from '../stats';
import type { Drawn } from './drawn';

export type GraphicKind = 'milestone' | 'high' | 'triple' | 'big' | 'perfect' | 'solo' | 'quarter' | 'watch' | 'streak' | 'double' | 'team';

export interface Graphic {
  id: string;
  kind: GraphicKind;
  /** The lower-third's small label: "4th quarter", "Milestone", "Halftime". */
  tag: string;
  text: string;
  /** The team it's about (0 home, 1 away). */
  side: 0 | 1;
  priority: number;
}

/** What was known about a player before tip-off. */
export interface PlayerBefore {
  /** His most points in a game this season, over `games` games (a rookie's are his career's). */
  high?: { pts: number; games: number; career: boolean };
  /** Career regular-season totals, when his whole career is on record (see careerOnRecord). */
  career?: Record<MilestoneStat, number>;
}

export interface GraphicInput {
  view: Drawn;
  /** Every possession drawn so far, in order. */
  logs: readonly PossLog[];
  /** [home, away]. */
  abbrevs: [string, string];
  names: (pid: number) => string;
  before: ReadonlyMap<number, PlayerBefore>;
  /** Ids of the graphics already shown: none is shown twice. */
  shown: ReadonlySet<string>;
  /** Game seconds played when the last one went up (null: none yet). */
  last: number | null;
  /** Career milestones only count in the regular season. */
  regular: boolean;
}

/** Game seconds between two graphics. */
export const GRAPHIC_GAP = 120;
/** Graphics this important can go up in the last 24 seconds of a period. */
export const KEY_PRIORITY = 80;
/** A season high is worth a graphic once he has played this many games this season, and it's at least this many points. */
const HIGH_GAMES = 10;
const HIGH_MIN = 20;

const reb = (b: BoxLine) => b.orb + b.drb;

/** Points by player from the drawn possessions: [this period's, the game's] (shots and free throws). */
function scoring(logs: readonly PossLog[], q: number) {
  const period = new Map<number, number>();
  const game = new Map<number, number>();
  const team = [0, 0];
  // each side's scoring plays, latest last: who scored and how many
  const plays: [{ pid: number; pts: number }[], { pid: number; pts: number }[]] = [[], []];
  for (const log of logs) {
    for (const s of log.steps) {
      const pts = s.k === 'shot' && s.made ? (s.v ?? 0) : s.k === 'ft' ? (s.v ?? 0) : 0;
      if (!pts || s.pid === undefined) continue;
      game.set(s.pid, (game.get(s.pid) ?? 0) + pts);
      if (log.q === q) period.set(s.pid, (period.get(s.pid) ?? 0) + pts);
      team[log.off] += pts;
      plays[log.off].push({ pid: s.pid, pts });
    }
  }
  return { period, game, team, plays };
}

const ordinalQ = (q: number) => (q === 1 ? '1st' : q === 2 ? '2nd' : q === 3 ? '3rd' : q === 4 ? '4th' : null);

/** Every graphic the drawn game calls for that hasn't been shown, before the rate limit (see nextGraphic). */
export function graphicCandidates(a: GraphicInput): Graphic[] {
  const { view, names } = a;
  const q = view.q;
  const ended = view.clock <= 0.05;
  const pts = scoring(a.logs, q);
  // the logs carry every point but a technical free throw's: when a team's don't add up, its runs and periods aren't claimed
  const exact = [0, 1].map((s) => pts.team[s] === view.sides[s].score);
  const lines: [BoxLine[], BoxLine[]] = [view.box.home.players, view.box.away.players];
  const out: Graphic[] = [];
  const add = (g: Graphic) => {
    if (!a.shown.has(g.id)) out.push(g);
  };

  for (const side of [0, 1] as const) {
    for (const b of lines[side]) {
      if (b.min <= 0 && !b.pts) continue;
      const name = names(b.pid);
      const before = a.before.get(b.pid);
      // career milestones: a round thousand reached tonight (whole careers on record, regular season)
      if (a.regular && before?.career) {
        for (const stat of ['pts', 'reb', 'ast'] as const) {
          const tonight = stat === 'pts' ? b.pts : stat === 'reb' ? reb(b) : b.ast;
          const was = before.career[stat];
          const mark = (Math.floor(was / 1000) + 1) * 1000;
          if (tonight > 0 && was + tonight >= mark)
            add({
              id: `ms-${b.pid}-${stat}-${mark}`,
              kind: 'milestone',
              tag: 'Milestone',
              text: `${name} reaches ${mark.toLocaleString('en-US')} career ${STAT_WORD[stat][1]}`,
              side,
              priority: 95,
            });
        }
      }
      // a high: a new one any time, one within reach in the fourth quarter or overtime
      const high = before?.high;
      if (high && high.games >= HIGH_GAMES && high.pts >= HIGH_MIN) {
        const which = high.career ? 'career' : 'season';
        if (b.pts > high.pts)
          add({
            id: `high-${b.pid}`,
            kind: 'high',
            tag: `New ${which} high`,
            text: `${name}: ${b.pts} points, past his ${which} high of ${high.pts}`,
            side,
            priority: high.career ? 90 : 85,
          });
        else if (q >= 4 && b.pts >= high.pts - 4)
          add({
            id: `watch-${b.pid}`,
            kind: 'watch',
            tag: `${which[0].toUpperCase()}${which.slice(1)} high watch`,
            text: b.pts === high.pts ? `${name}: ${b.pts} points, matching his ${which} high` : `${name}: ${b.pts} points, ${high.pts - b.pts} off his ${which} high (${high.pts})`,
            side,
            priority: 55,
          });
      }
      // a big night: 30, 40, 50 points
      const big = [50, 40, 30].find((n) => b.pts >= n);
      if (big) add({ id: `big-${b.pid}-${big}`, kind: 'big', tag: 'Big night', text: `${name} has ${b.pts} points`, side, priority: big >= 50 ? 92 : big >= 40 ? 82 : 62 });
      const tens = [b.pts, reb(b), b.ast, b.stl, b.blk].filter((x) => x >= 10).length;
      if (tens >= 3)
        add({
          id: `td-${b.pid}`,
          kind: 'triple',
          tag: 'Triple-double',
          text: `${name}: ${b.pts} pts, ${reb(b)} reb, ${b.ast} ast${b.stl >= 10 ? `, ${b.stl} stl` : ''}${b.blk >= 10 ? `, ${b.blk} blk` : ''}`,
          side,
          priority: 88,
        });
      else if (tens === 2) {
        const parts = [`${b.pts} pts`, `${reb(b)} reb`, `${b.ast} ast`, `${b.stl} stl`, `${b.blk} blk`].filter((_, i) => [b.pts, reb(b), b.ast, b.stl, b.blk][i] >= 10);
        add({ id: `dd-${b.pid}`, kind: 'double', tag: 'Double-double', text: `${name}: ${parts.join(', ')}${q <= 2 && !ended ? ' in the first half' : ''}`, side, priority: 40 });
      }
      // shooting: perfect from three (four or more), perfect from the field (six or more), or six straight makes
      if (b.tpa >= 4 && b.tpm === b.tpa) add({ id: `p3-${b.pid}`, kind: 'perfect', tag: 'Shooting', text: `${name}: ${b.tpm} of ${b.tpa} from three`, side, priority: 70 });
      else if (b.fga >= 6 && b.fgm === b.fga)
        add({ id: `pfg-${b.pid}`, kind: 'perfect', tag: 'Shooting', text: `${name}: ${b.fgm} of ${b.fga} from the field`, side, priority: 50 });
      else {
        const streak = view.sides[side].players.find((p) => p.pid === b.pid)?.streak ?? 0;
        if (streak >= 6) add({ id: `st-${b.pid}`, kind: 'streak', tag: 'Shooting', text: `${name} has made his last ${streak} shots`, side, priority: 50 });
      }
      // a big first half: 20 points before halftime
      if (q <= 2 && b.pts >= 20)
        add({
          id: `half-${b.pid}`,
          kind: 'big',
          tag: q === 1 ? '1st quarter' : '1st half',
          text: `${name}: ${b.pts} points in the first ${q === 1 ? 'quarter' : 'half'}`,
          side,
          priority: 64,
        });
      // a big period: 10 points in a quarter, 7 in an overtime
      const inQ = pts.period.get(b.pid) ?? 0;
      if (exact[side] && inQ >= (q <= 4 ? 10 : 7)) {
        const nth = ordinalQ(q);
        add({
          id: `q-${b.pid}-${q}`,
          kind: 'quarter',
          tag: nth ? `${nth} quarter` : periodLabel(q),
          text: `${name}: ${inQ} points in ${nth ? `the ${nth}` : 'overtime'}`,
          side,
          priority: 60,
        });
      }
    }
    // one man's run: the team's last 9 points or more, all his, over three scoring plays or more
    const plays = pts.plays[side];
    if (exact[side] && plays.length >= 3) {
      const pid = plays[plays.length - 1].pid;
      let n = 0;
      let run = 0;
      for (let i = plays.length - 1; i >= 0 && plays[i].pid === pid; i--) {
        run += plays[i].pts;
        n++;
      }
      // (the run is the scoring since the other side last scored, or since anyone else on his team did)
      if (run >= 9 && n >= 3) {
        const startScore = view.sides[side].score - run;
        add({ id: `solo-${pid}-${startScore}`, kind: 'solo', tag: 'Scoring', text: `${names(pid)} has scored ${a.abbrevs[side]}'s last ${run} points`, side, priority: 65 });
      }
    }
  }

  // at a break: the most lopsided team number (8 points or more apart) not shown yet
  if (ended && !(q >= 4 && view.sides[0].score !== view.sides[1].score)) {
    const ex = [view.box.home.extra, view.box.away.extra];
    const stats: [keyof (typeof ex)[0], (team: string, score: string, other: string) => string][] = [
      ['fastBreak', (t, sc) => `${t} ${sc} on the fast break`],
      ['paint', (t, sc) => `${t} ${sc} in the paint`],
      ['secondChance', (t, sc) => `${t} ${sc} on second chances`],
      ['offTov', (t, sc) => `${t} ${sc} in points off turnovers`],
      ['bench', (t, sc, o) => `${t}'s bench outscoring ${o}'s ${sc}`],
    ];
    const best = stats
      .map(([k, say]) => ({ k, say, h: ex[0][k], w: ex[1][k] }))
      .filter((s) => Math.abs(s.h - s.w) >= 8 && !a.shown.has(`team-${s.k}`))
      .sort((x, y) => Math.abs(y.h - y.w) - Math.abs(x.h - x.w))[0];
    if (best) {
      const side = best.h > best.w ? 0 : 1;
      const score = `${Math.max(best.h, best.w)}-${Math.min(best.h, best.w)}`;
      add({
        id: `team-${best.k}`,
        kind: 'team',
        tag: q === 2 ? 'Halftime' : `End of ${periodLabel(q)}`,
        text: best.say(a.abbrevs[side], score, a.abbrevs[1 - side]),
        side,
        priority: 30,
      });
    }
  }

  return out;
}

/** The graphic to put up now, if any: the most important one not shown yet, within the rate limit. */
export function nextGraphic(a: GraphicInput): Graphic | null {
  const { view } = a;
  const ended = view.clock <= 0.05;
  const drama = !ended && view.clock <= 24;
  const out = graphicCandidates(a);
  // the rate limit: one every two minutes of game time (a break's team number whenever it comes), and in
  // the last 24 seconds of a period only the big ones
  const gapOk = a.last === null || view.elapsed - a.last >= GRAPHIC_GAP;
  const ok = out.filter((g) => (g.kind === 'team' ? ended : gapOk && !ended && (!drama || g.priority >= KEY_PRIORITY)));
  return ok.sort((x, y) => y.priority - x.priority || x.id.localeCompare(y.id))[0] ?? null;
}
