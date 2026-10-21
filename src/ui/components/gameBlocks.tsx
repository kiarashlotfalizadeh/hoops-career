// Pieces of a game's box score shared by the game report and the live game's box sheet.

import type { GameResult } from '../../core/types';
import { periodLabel } from '../stats';
import { CompareBar } from './charts';

export interface ComparisonRow {
  id: 'fg' | 'tp' | 'reb' | 'ast' | 'tov' | 'paint' | 'fastBreak' | 'second' | 'bench';
  label: string;
  /** Away, home. */
  a: number;
  b: number;
  /** A percentage (one decimal); the rest are counts. */
  pct?: boolean;
  higherBetter: boolean;
}

/** Team totals side by side, away first: shooting, boards, ball security and where the points came from. */
export function teamComparison(g: Pick<GameResult, 'home' | 'away'>): ComparisonRow[] {
  const { away, home } = g;
  const rows: ComparisonRow[] = [
    { id: 'fg', label: 'FG%', a: (away.t.fgm / Math.max(1, away.t.fga)) * 100, b: (home.t.fgm / Math.max(1, home.t.fga)) * 100, pct: true, higherBetter: true },
    { id: 'tp', label: '3P%', a: (away.t.tpm / Math.max(1, away.t.tpa)) * 100, b: (home.t.tpm / Math.max(1, home.t.tpa)) * 100, pct: true, higherBetter: true },
    { id: 'reb', label: 'Rebounds', a: away.t.orb + away.t.drb, b: home.t.orb + home.t.drb, higherBetter: true },
    { id: 'ast', label: 'Assists', a: away.t.ast, b: home.t.ast, higherBetter: true },
    { id: 'tov', label: 'Turnovers', a: away.t.tov, b: home.t.tov, higherBetter: false },
    { id: 'paint', label: 'Paint pts', a: away.extra.paint, b: home.extra.paint, higherBetter: true },
  ];
  // quick-simmed games saved before fast breaks were tracked read 0-0
  if (away.extra.fastBreak || home.extra.fastBreak) rows.push({ id: 'fastBreak', label: 'Fast break', a: away.extra.fastBreak, b: home.extra.fastBreak, higherBetter: true });
  rows.push(
    { id: 'second', label: '2nd chance', a: away.extra.secondChance, b: home.extra.secondChance, higherBetter: true },
    { id: 'bench', label: 'Bench pts', a: away.extra.bench, b: home.extra.bench, higherBetter: true },
  );
  return rows;
}

/** Comparison bars, away on the left; `only` picks rows. */
export function TeamComparison({ g, colors, only }: { g: Pick<GameResult, 'home' | 'away'>; colors: [string, string]; only?: ComparisonRow['id'][] }) {
  const rows = teamComparison(g).filter((r) => !only || only.includes(r.id));
  return (
    <div className="col" style={{ gap: 10 }}>
      {rows.map((c) => (
        <CompareBar key={c.id} label={c.label} a={c.a} b={c.b} fmt={c.pct ? undefined : (v) => String(v)} higherBetter={c.higherBetter} colorA={colors[0]} colorB={colors[1]} />
      ))}
    </div>
  );
}

/** Points by period, away over home: a broadcast's linescore. */
export function QuarterTable({ g, abbrevs }: { g: Pick<GameResult, 'home' | 'away'>; abbrevs: Record<number, string> }) {
  const n = Math.max(g.home.quarters.length, g.away.quarters.length);
  const label = (i: number) => (i < 4 ? `${i + 1}` : periodLabel(i + 1));
  // (in a scroller of its own: overtimes widen it past a phone, and the total stays in reach)
  return (
    <div className="gd-ls-wrap">
      <table className="gd-ls num">
        <thead>
          <tr>
            <th className="l">
              <span className="sr-only">Team</span>
            </th>
            {Array.from({ length: n }, (_, i) => (
              <th key={i}>{label(i)}</th>
            ))}
            <th>T</th>
          </tr>
        </thead>
        <tbody>
          {[g.away, g.home].map((t) => (
            <tr key={t.tid}>
              <th className="l" scope="row">
                {abbrevs[t.tid] ?? (t === g.away ? 'Away' : 'Home')}
              </th>
              {Array.from({ length: n }, (_, i) => (
                <td key={i}>{t.quarters[i] ?? '—'}</td>
              ))}
              <td className="gd-ls-t">{t.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
