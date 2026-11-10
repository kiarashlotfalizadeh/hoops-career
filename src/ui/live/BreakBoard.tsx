// The board that heads the console at a stop, as a broadcast puts one up going to a break: an ink
// plate with the line score (each team's chip in its kit colour, every period played, the total, the
// leader's bold) and, at a period's end, four team numbers side by side for the game so far (shooting,
// threes, rebounds, turnovers: the better figure of each stands out, in words for a screen reader).
// In a huddle it's the line score alone: the room is the play call's. The report under it
// (PeriodReport.tsx) has the story and the staff; the full box score stays on the Stats view.
import type { CSSProperties } from 'react';
import type { Team, TeamBox } from '../../core/types';
import { madeAtt } from '../../core/format';
import { periodLabel } from '../stats';
import type { MatchKit } from '../teamColors';
import type { Drawn } from './drawn';

/** A team number to compare: each side's figure as shown, and the value that decides who has the better of it. */
interface Stat {
  label: string;
  /** For a screen reader, where the label is an abbreviation. */
  name: string;
  show: (t: TeamBox) => string;
  value: (t: TeamBox) => number;
  lowerBetter?: boolean;
}

const pct = (m: number, a: number) => (a > 0 ? (m / a) * 100 : NaN);
const STATS: Stat[] = [
  { label: 'FG%', name: 'Field goal percentage', show: (t) => (t.t.fga > 0 ? `${Math.round(pct(t.t.fgm, t.t.fga))}%` : '—'), value: (t) => pct(t.t.fgm, t.t.fga) },
  { label: 'Threes', name: 'Threes made and tried', show: (t) => madeAtt(t.t.tpm, t.t.tpa), value: (t) => t.t.tpm },
  { label: 'Rebounds', name: 'Rebounds', show: (t) => String(t.t.orb + t.t.drb), value: (t) => t.t.orb + t.t.drb },
  { label: 'Turnovers', name: 'Turnovers', show: (t) => String(t.t.tov), value: (t) => t.t.tov, lowerBetter: true },
];

/** The stop's name, as the board's title. */
export function breakTitle(q: number): string {
  return q === 2 ? 'Halftime' : q === 4 ? 'End of regulation' : q > 4 ? `End of ${q === 5 ? 'overtime' : periodLabel(q)}` : `End of ${periodLabel(q)}`;
}

export function BreakBoard({
  view,
  teams,
  kits,
  side,
  kind,
}: {
  view: Drawn;
  /** [home, away]. */
  teams: [Team, Team];
  /** Tonight's kits, [home, away]. */
  kits: [MatchKit, MatchKit];
  /** The user's side (0 home, 1 away). */
  side: 0 | 1;
  /** A period's end or the final buzzer (the line score and the team numbers), or a huddle (the line score alone). */
  kind: 'break' | 'huddle';
}) {
  const boxes: [TeamBox, TeamBox] = [view.box.home, view.box.away];
  const pts: [number, number] = [view.sides[0].score, view.sides[1].score];
  const lead = pts[side] - pts[1 - side];
  const periods = Math.max(4, boxes[0].quarters.length, boxes[1].quarters.length, view.q);
  const col = (i: number) => (i < 4 ? String(i + 1) : periodLabel(i + 1));
  // away over home, as the scorebug has them left to right
  const order = [1, 0] as const;
  // (a period's end past the third with a side ahead is the game's: the board under the final frame)
  const final = kind === 'break' && view.q >= 4 && lead !== 0;
  const title = final ? 'Final' : breakTitle(view.q);
  const standing = lead === 0 ? `Tied at ${pts[0]}` : `You ${final ? (lead > 0 ? 'won' : 'lost') : lead > 0 ? 'lead' : 'trail'} by ${Math.abs(lead)}`;
  return (
    <section className={`lv-bd ${kind}`} aria-label={kind === 'break' ? `${title}: ${standing}` : 'Line score'}>
      {kind === 'break' && (
        <div className="lv-bd-head">
          <h2 className="lv-bd-title">{title}</h2>
          <span className="lv-bd-lead">{standing}</span>
        </div>
      )}
      <table className="lv-bd-ls">
        <thead>
          <tr>
            <th className="l" scope="col">
              <span className="sr-only">Team</span>
            </th>
            {Array.from({ length: periods }, (_, i) => (
              <th key={i} scope="col">
                {col(i)}
              </th>
            ))}
            <th className="t" scope="col">
              <abbr title="Total">T</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {order.map((i) => (
            <tr key={i} className={pts[i] >= pts[1 - i] ? 'ahead' : undefined}>
              <th className="l" scope="row">
                <span className="lv-bd-chip" style={{ background: kits[i].night }} aria-hidden="true" />
                {teams[i].abbrev}
              </th>
              {Array.from({ length: periods }, (_, p) => {
                const v = boxes[i].quarters[p];
                // (a period not started yet is a dash, not a 0)
                return <td key={p}>{v === undefined || p + 1 > view.q ? <span className="lv-bd-none">–</span> : v}</td>;
              })}
              <td className="t">{pts[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {kind === 'break' && (
        <div className="lv-bd-stats">
          {/* whose figure is on which side, in words */}
          <div className="lv-bd-key">
            {order.map((i) => (
              <span key={i}>
                <span className="lv-bd-chip" style={{ background: kits[i].night }} aria-hidden="true" />
                {teams[i].abbrev}
              </span>
            ))}
          </div>
          <div className="lv-bd-grid">
            {STATS.map((s) => {
              const [va, vh] = [s.value(boxes[1]), s.value(boxes[0])];
              const decided = isFinite(va) && isFinite(vh) && s.show(boxes[1]) !== s.show(boxes[0]);
              const awayWins = decided && (s.lowerBetter ? va < vh : va > vh);
              const homeWins = decided && !awayWins;
              const [wa, wh] = [va, vh].map((v) => (isFinite(v) ? Math.max(0, v) : 0));
              const none = wa + wh === 0;
              const better = awayWins ? `, ${teams[1].abbrev} better` : homeWins ? `, ${teams[0].abbrev} better` : '';
              return (
                <div
                  key={s.label}
                  className="lv-bd-cmp"
                  role="group"
                  aria-label={`${s.name}: ${teams[1].abbrev} ${s.show(boxes[1])}, ${teams[0].abbrev} ${s.show(boxes[0])}${better}`}
                >
                  <span className={`lv-bd-v${awayWins ? ' win' : ''}`} aria-hidden="true">
                    {s.show(boxes[1])}
                  </span>
                  <span className="lv-bd-l" aria-hidden="true">
                    {s.label}
                  </span>
                  <span className={`lv-bd-v r${homeWins ? ' win' : ''}`} aria-hidden="true">
                    {s.show(boxes[0])}
                  </span>
                  <span className="lv-bd-bar" aria-hidden="true">
                    <i className={homeWins ? 'dim' : undefined} style={{ flexGrow: none ? 1 : wa, background: kits[1].night } as CSSProperties} />
                    <i className={awayWins ? 'dim' : undefined} style={{ flexGrow: none ? 1 : wh, background: kits[0].night } as CSSProperties} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
