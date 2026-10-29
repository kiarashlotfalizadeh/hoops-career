// A team's box score, the same in the live game's Box tab and the game report: who played (the
// starters, then the bench under its divider), the counting stats, the shooting as made-attempted,
// fouls and plus-minus, then the team's line and who didn't play. The columns are named as everywhere
// else in the game; each is spelled out on a long press (its title) and for a screen reader.
import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { BoxLine, TeamBox } from '../../core/types';
import { signed, wholeMinutes } from '../stats';
import { injuryName, keepFigures, madeAtt } from '../../core/format';
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

/** The injury of a player out injured ("Injured (Knee Soreness)": "knee soreness", named as everywhere else), or null for any other reason. */
const dnpInjury = (dnp: string | undefined) => {
  const m = /^Injured \((.+)\)$/.exec(dnp ?? '');
  // (its first letter only: "torn ACL" keeps its capitals)
  return m ? injuryName(m[1]).replace(/^./, (c) => c.toLowerCase()) : null;
};

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
  const played = box.players.filter(shown);
  // the starters first, then the bench under its divider (no key needed to tell them apart)
  const rows = [...played.filter((p) => p.gs), ...played.filter((p) => !p.gs)];
  const firstBench = rows.findIndex((p) => !p.gs);
  const out = dnp ? box.players.filter((p) => p.min <= 0) : [];
  const injured = out.filter((p) => dnpInjury(p.dnp));
  const benched = out.filter((p) => !dnpInjury(p.dnp));
  const min = wholeMinutes(box.players);
  const t = box.t;
  // on a phone the figures past TOV wait to the right: the names stay put and the edge fades until
  // they're in view (StatTable's .tablewrap-o, as the league's tables do)
  const scroller = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => outer.current?.classList.toggle('fr', el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    on();
    el.addEventListener('scroll', on, { passive: true });
    // (a sheet opening, a row added in a live game: the widths change without a scroll)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(on);
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', on);
      ro?.disconnect();
    };
  }, []);
  return (
    <div className="bx">
      {/* it scrolls sideways: focusable so a keyboard can scroll it */}
      <div className="tablewrap-o" ref={outer}>
        <div className="tablewrap" tabIndex={0} role="region" aria-label={label} ref={scroller}>
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
              {rows.map((p, i) => {
                const who = (
                  <span className="bx-who">
                    <span>{name(p.pid)}</span>
                    {p.pid === pog && (
                      <span className="bx-pog" role="img" aria-label="Player of the game">
                        <Star size={12} fill="currentColor" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                );
                return (
                  <Fragment key={p.pid}>
                    {i === firstBench && i > 0 && (
                      <tr className="bx-div">
                        <td className="l sticky">Bench</td>
                        <td colSpan={BOX_COLUMNS.length} />
                      </tr>
                    )}
                    <tr>
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
                      <td>{keepFigures(madeAtt(p.fgm, p.fga))}</td>
                      <td>{keepFigures(madeAtt(p.tpm, p.tpa))}</td>
                      <td>{keepFigures(madeAtt(p.ftm, p.fta))}</td>
                      <td className={p.pf >= 5 ? 'bad' : ''}>{p.pf}</td>
                      <td className={p.pm > 0 ? 'good' : p.pm < 0 ? 'bad' : ''}>{signed(p.pm, 0)}</td>
                    </tr>
                  </Fragment>
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
                <td>{keepFigures(madeAtt(t.fgm, t.fga))}</td>
                <td>{keepFigures(madeAtt(t.tpm, t.tpa))}</td>
                <td>{keepFigures(madeAtt(t.ftm, t.fta))}</td>
                <td>{t.pf}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {(injured.length > 0 || benched.length > 0 || (pog !== undefined && rows.some((p) => p.pid === pog))) && (
        <div className="bx-key">
          {pog !== undefined && rows.some((p) => p.pid === pog) && (
            <div>
              <Star size={11} className="bx-pog" fill="currentColor" aria-hidden="true" /> Player of the game
            </div>
          )}
          {injured.length > 0 && (
            <div>
              <b>Out injured:</b> {injured.map((p) => `${name(p.pid)}, ${dnpInjury(p.dnp)}`).join(' · ')}
            </div>
          )}
          {benched.length > 0 && (
            <div>
              <b>Didn&apos;t play:</b> {benched.map((p) => `${name(p.pid)}${p.dnp === 'Rest' ? ', rest' : ''}`).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
