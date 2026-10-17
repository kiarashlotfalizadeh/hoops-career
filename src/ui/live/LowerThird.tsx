// The live game's broadcast graphic (see graphics.ts): a lower-third over the bottom of the court
// (the backcourt, away from the basket where the play happens), in the team's colour, read out
// to screen readers. Reduced motion: it appears without sliding in.
import type { GameType, League } from '../../core/types';
import type { GameSim } from '../../core/sim/engine';
import { careerOnRecord, careerTotals } from '../../core/analysis/milestones';
import { bookOf } from '../../core/league/records';
import type { Graphic, PlayerBefore } from './graphics';

/** How long a graphic stays up (real time). */
export const GRAPHIC_MS = 4500;

/**
 * What the graphics know about every player in the game before tip-off: his most points in a game
 * this season (a rookie's season is his career), his career totals when the game has his whole
 * career, and the scoring records in tonight's book. Read from the stored results, stats and record
 * book, which don't include tonight's game yet.
 */
export function playersBefore(league: League, sim: GameSim, type: GameType = 'regular'): Map<number, PlayerBefore> {
  const pids = new Set(sim.T.flatMap((t) => t.players.map((p) => p.pid)));
  const high = new Map<number, { pts: number; games: number }>();
  for (const g of league.games) {
    if (g.season !== league.season || g.type === 'allstar') continue;
    for (const b of [g.home.players, g.away.players].flat()) {
      if (!pids.has(b.pid) || b.min <= 0) continue;
      const h = high.get(b.pid) ?? { pts: 0, games: 0 };
      h.pts = Math.max(h.pts, b.pts);
      h.games++;
      high.set(b.pid, h);
    }
  }
  // scoring records count once the book has a season behind it, as in the news
  const book = league.records;
  const kind = bookOf(type);
  // (a list with nothing on it yet has no record to break)
  const lists = book && kind && league.season > book.since ? { league: book.league[kind].players.pts?.[0]?.[0], kind } : null;
  const out = new Map<number, PlayerBefore>();
  for (const t of sim.T) {
    const tid = t.team.tid;
    const team = league.teams[tid];
    for (const tp of t.players) {
      const pid = tp.pid;
      const p = league.players[pid];
      if (!p) continue;
      const whole = careerOnRecord(p, league.season);
      const h = high.get(pid);
      const c = whole ? careerTotals(p) : null;
      const franchise = lists && team ? book!.teams[tid]?.[lists.kind].players.pts?.[0]?.[0] : undefined;
      out.set(pid, {
        ...(h ? { high: { ...h, career: whole && p.experience === 0 } } : {}),
        ...(c ? { career: { pts: c.pts, reb: c.reb, ast: c.ast } } : {}),
        ...(lists && team ? { records: { team: franchise, teamName: team.name, league: lists.league, playoffs: lists.kind === 'post' } } : {}),
      });
    }
  }
  return out;
}

export function LowerThird({ g, kit }: { g: Graphic; kit: string }) {
  return (
    <div className="live-l3 fade-in" role="status" style={{ borderLeftColor: kit }}>
      <span className="live-l3-tag">{g.tag}</span>
      <span className="live-l3-text">{g.text}</span>
    </div>
  );
}
