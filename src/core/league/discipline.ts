// Suspensions for technical and flagrant fouls, by the NBA's rules. The engine calls the fouls (see
// sim/discipline.ts); the league counts them over a player's regular season and, from scratch, his
// postseason (play-in included), and a count that crosses a line sits him out his team's next
// games, carried from one phase or season into the next. The news and the user's mail report them.

import type { GameResult, League, Player, ScheduledGame, TeamBox } from '../types';
import { Rng, hashString } from '../random';
import { addInbox, addNews, playerName, statsLine } from './helpers';

export const SUSPEND = {
  /** The technical that costs a game: the 16th of the regular season (the 7th of the postseason), then every second one after it. */
  tech: { regular: 16, playoffs: 7 },
  /** Flagrant points (a Flagrant 1 is one, a Flagrant 2 two) that cost a game: reaching 4 (3 in the postseason); past that each Flagrant 1 costs one game and each Flagrant 2 two. */
  flagrant: { regular: 4, playoffs: 3 },
  /** The share of Flagrant 2s the league office's review adds a game to, whatever his count. */
  review: 1 / 3,
};

/** Technicals and flagrant points in a season's regular season (or, with `playoffs`, its postseason), over all his teams. */
export function disciplineTotals(p: Player, season: number, playoffs: boolean): { tf: number; fp: number } {
  let tf = 0;
  let fp = 0;
  for (const s of p.stats) {
    if (s.season !== season || s.playoffs !== playoffs || s.real) continue;
    tf += s.tf ?? 0;
    fp += s.fp ?? 0;
  }
  return { tf, fp };
}

/** The technicals that cost a game going from `before` to `after` of them: the line itself (16, or 7 in the postseason) and every second one past it. */
export function techLines(before: number, after: number, playoffs: boolean): number[] {
  const line = playoffs ? SUSPEND.tech.playoffs : SUSPEND.tech.regular;
  const out: number[] = [];
  for (let k = Math.max(before + 1, line); k <= after; k++) if ((k - line) % 2 === 0) out.push(k);
  return out;
}

/** Games technicals cost going from `before` to `after` of them (see techLines). */
export function techSuspension(before: number, after: number, playoffs: boolean): number {
  return techLines(before, after, playoffs).length;
}

/** Games a flagrant worth `kind` points costs on top of `before` points: one for reaching the line, then a game a point. */
export function flagrantSuspension(before: number, kind: 1 | 2, playoffs: boolean): number {
  const line = playoffs ? SUSPEND.flagrant.playoffs : SUSPEND.flagrant.regular;
  if (before + kind < line) return 0;
  return before < line ? 1 : kind;
}

/** The technical that costs him his next game, with `tf` of them so far: the line, or the next one every second one past it. */
export function nextTechLine(tf: number, playoffs: boolean): number {
  const line = playoffs ? SUSPEND.tech.playoffs : SUSPEND.tech.regular;
  return tf < line ? line : tf + 1 + ((tf + 1 - line) % 2);
}

/** "1st", "2nd", "16th", "22nd". */
function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const games = (n: number) => `${WORDS[n] ?? n} game${n === 1 ? '' : 's'}`;

/**
 * A game's technicals, flagrants and ejections, after it's played and before its result is stored
 * (the box score's lines still hold everyone who dressed): a game a suspended player sat out counts
 * toward his suspension; the fouls go into his season's count (the Cup championship counts in no
 * stats, so in none of it); a count that crosses a line, or a Flagrant 2 the league office's review
 * adds a game to (on a random stream of its own, never the league's), suspends him; and the news and the user's mail say
 * so, the mail also when one of his players is ejected. All-Star Games have none of it.
 */
export function applyDiscipline(league: League, g: ScheduledGame, res: GameResult) {
  if (g.type === 'allstar') return;
  const playoffs = g.type === 'playoffs' || g.type === 'playin';
  const of = playoffs ? 'of the playoffs' : 'of the season';
  const sofar = playoffs ? 'in the playoffs' : 'this season';
  for (const [tb, vs] of [
    [res.home, res.away],
    [res.away, res.home],
  ] as [TeamBox, TeamBox][]) {
    const opp = league.teams[vs.tid].abbrev;
    for (const bl of tb.players) {
      const p = league.players[bl.pid];
      if (!p) continue;
      if (bl.dnp === 'Suspended' && p.suspension) {
        p.suspension.games--;
        if (p.suspension.games <= 0) delete p.suspension;
      }
      if (!bl.tf && !bl.f1 && !bl.f2 && !bl.ej) continue;
      const before = disciplineTotals(p, league.season, playoffs);
      let n = 0;
      const why: string[] = [];
      const reasons: string[] = [];
      if (g.type !== 'cup' && (bl.tf || bl.f1 || bl.f2)) {
        const s = statsLine(p, league.season, tb.tid, playoffs);
        if (bl.tf) s.tf = (s.tf ?? 0) + bl.tf;
        const tf = before.tf + (bl.tf ?? 0);
        // (named for the last of them that cost a game: two in a night from the 19th crosses the 20th)
        const lines = techLines(before.tf, tf, playoffs);
        if (lines.length) {
          n += lines.length;
          why.push(`${ordinal(lines[lines.length - 1])} technical foul`);
          reasons.push(`for his ${ordinal(lines[lines.length - 1])} technical foul ${of}`);
        }
        // the night's Flagrant 1s first, then its Flagrant 2s
        let fp = before.fp;
        const kinds: (1 | 2)[] = [...Array<1>(bl.f1 ?? 0).fill(1), ...Array<2>(bl.f2 ?? 0).fill(2)];
        kinds.forEach((k, i) => {
          const forPoints = flagrantSuspension(fp, k, playoffs);
          fp += k;
          // (the review draws from the foul and the game it was in, not the league's id, so a league
          // created from a seed plays its seasons the same way every time)
          const review = new Rng(hashString(`${league.season}:${g.gid}:${res.home.pts}-${res.away.pts}:${p.pid}:${i}:flagrant-review`));
          const reviewed = k === 2 && review.chance(SUSPEND.review) ? 1 : 0;
          if (!forPoints && !reviewed) return;
          n += forPoints + reviewed;
          why.push(`Flagrant ${k} vs ${opp}`);
          reasons.push(`after his Flagrant ${k} against ${opp}${forPoints ? ` (${fp} flagrant points ${sofar})` : ''}`);
        });
        if (fp > before.fp) s.fp = (s.fp ?? 0) + fp - before.fp;
      }
      const team = league.teams[tb.tid];
      const mine = p.tid === league.userTid && tb.tid === league.userTid;
      if (n > 0) {
        p.suspension = { games: (p.suspension?.games ?? 0) + n, why: why.join(', ') };
        const text = (who: string) => `${who} has been suspended ${games(n)} ${reasons.join(' and ')}.`;
        addNews(league, { kind: 'discipline', text: text(`${playerName(p)} (${team.abbrev})`), tids: [team.tid], pids: [p.pid] });
        if (mine)
          addInbox(league, {
            from: 'League Office',
            subject: `${playerName(p)} suspended ${games(n)}`,
            body: `${text(playerName(p))} He sits our next ${n === 1 ? 'game' : `${n} games`}, and the rotation plans around him: review it in Rotation.`,
            tone: 'bad',
            link: `/player/${p.pid}`,
          });
      } else if (bl.ej && mine) {
        const tf = before.tf + (g.type !== 'cup' ? (bl.tf ?? 0) : 0);
        const next = nextTechLine(tf, playoffs);
        addInbox(league, {
          from: 'Assistant Coach',
          subject: `${playerName(p)} ejected against ${opp}`,
          body:
            bl.ej === 'tech'
              ? `${playerName(p)} was ejected against ${opp} after his second technical foul of the night. That's ${tf} technical${tf === 1 ? '' : 's'} ${sofar}: the ${ordinal(next)} means a suspension.`
              : `${playerName(p)} was ejected against ${opp} for a Flagrant 2. The league office reviewed it and he's available for our next game.`,
          tone: 'bad',
          link: `/player/${p.pid}`,
        });
      }
    }
    if (tb.coachEj) {
      const team = league.teams[tb.tid];
      addNews(league, { kind: 'discipline', text: `${team.coach.name} (${team.abbrev}) was ejected against ${opp} after two technical fouls.`, tids: [team.tid], pids: [] });
    }
  }
}
