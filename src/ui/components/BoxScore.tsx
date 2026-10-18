// A team's box score, the same in the live game's Box tab and the game report: who played (starters
// in bold), the counting stats, the shooting as made-attempted, fouls and plus-minus, then the team's
// line and a key to the marks. The columns are named as everywhere else in the game; each is spelled
// out on a long press (its title) and for a screen reader.
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { BoxLine, TeamBox } from '../../core/types';
import { signed, wholeMinutes } from '../stats';
import './gameday.css';

/** The columns after the player's name: the abbreviation and what it stands for. */
export const BOX_COLUMNS = [
  ['MIN', 'Minutes'],
  ['PTS', 'Points'],
  ['REB', 'Rebounds'],
  ['AST', 'Assists'],
  ['STL', 'Steals'],
  ['BLK', 'Blocks'],
  ['TOV', 'Turnovers'],
  ['FG', 'Field goals, made-attempted'],
  ['3P', 'Three-pointers, made-attempted'],
  ['FT', 'Free throws, made-attempted'],
  ['PF', 'Personal fouls'],
  ['+/-', 'Plus-minus: the score while he was on the floor'],
] as const;

/** "Injured (Concussion)" reads "Injured: Concussion" inside the DNP list's own parentheses. */
const dnpLabel = (dnp: string) => dnp.replace(/^Injured \((.+)\)$/, 'Injured: $1');

export function BoxScore({
  box,
  name,
  label,
  shown = (p) => p.min > 0,
  pog,
  links,
  dnp,
}: {
  box: TeamBox;
  /** A player's name as the screen writes it. */
  name: (pid: number) => string;
  /** The table's name for a screen reader: "Oklahoma City Thunder box score". */
  label: string;
  /** Who gets a row (by default, everyone who played). */
  shown?: (p: BoxLine) => boolean;
  /** The player of the game (★). */
  pog?: number;
  /** Names link to the players' pages. */
  links?: boolean;
  /** List who didn't play, and why, under the table. */
  dnp?: boolean;
}) {
  const rows = box.players.filter(shown);
  const out = dnp ? box.players.filter((p) => p.min <= 0) : [];
  const min = wholeMinutes(box.players);
  const t = box.t;
  return (
    <div className="bx">
      {/* it scrolls sideways: focusable so a keyboard can scroll it */}
      <div className="tablewrap bx-wrap" tabIndex={0} role="region" aria-label={label}>
        <table className="stats bx-table">
          <thead>
            <tr>
              <th className="l sticky">Player</th>
              {BOX_COLUMNS.map(([k, what]) => (
                <th key={k}>
                  <abbr title={what}>{k}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const who = (
                <>
                  <span className={p.gs ? 'bold' : ''}>{name(p.pid)}</span>
                  {p.pid === pog && (
                    <span className="bx-pog" role="img" aria-label="Player of the game">
                      <Star size={12} fill="currentColor" aria-hidden="true" />
                    </span>
                  )}
                </>
              );
              return (
                <tr key={p.pid}>
                  <td className="l sticky">
                    {/* the whole name cell is the link, not just the text */}
                    {links ? (
                      <Link to={`/player/${p.pid}`} className="bx-link">
                        {who}
                      </Link>
                    ) : (
                      who
                    )}
                  </td>
                  <td>{min(p.pid)}</td>
                  <td className="bold">{p.pts}</td>
                  <td>{p.orb + p.drb}</td>
                  <td>{p.ast}</td>
                  <td>{p.stl}</td>
                  <td>{p.blk}</td>
                  <td>{p.tov}</td>
                  <td>
                    {p.fgm}-{p.fga}
                  </td>
                  <td>
                    {p.tpm}-{p.tpa}
                  </td>
                  <td>
                    {p.ftm}-{p.fta}
                  </td>
                  <td className={p.pf >= 5 ? 'bad' : ''}>{p.pf}</td>
                  <td className={p.pm > 0 ? 'good' : p.pm < 0 ? 'bad' : ''}>{signed(p.pm, 0)}</td>
                </tr>
              );
            })}
            <tr className="bx-team">
              <td className="l sticky bold">Team</td>
              <td />
              <td className="bold">{box.pts}</td>
              <td>{t.orb + t.drb}</td>
              <td>{t.ast}</td>
              <td>{t.stl}</td>
              <td>{t.blk}</td>
              <td>{t.tov}</td>
              <td>
                {t.fgm}-{t.fga}
              </td>
              <td>
                {t.tpm}-{t.tpa}
              </td>
              <td>
                {t.ftm}-{t.fta}
              </td>
              <td>{t.pf}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="bx-key">
        <b>Bold</b>: starters
        {pog !== undefined && rows.some((p) => p.pid === pog) && (
          <>
            {' '}
            · <Star size={11} className="bx-pog" fill="currentColor" aria-hidden="true" /> Player of the game
          </>
        )}
        {out.length > 0 && <span className="bx-dnp"> · Didn&apos;t play: {out.map((p) => `${name(p.pid)} (${dnpLabel(p.dnp ?? "Coach's decision")})`).join(', ')}</span>}
      </div>
    </div>
  );
}
