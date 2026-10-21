// The game report's Box: the points by period, both teams' box scores, away first as the final
// reads, then the teams side by side. A game between two other teams opens with its three stars
// (yours have them in the recap).
import { Link } from 'react-router-dom';
import type { GameResult, League } from '../../../core/types';
import { threeStars } from '../../../core/analysis/quotes';
import { Section } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { BoxScore } from '../../components/BoxScore';
import { QuarterTable, TeamComparison } from '../../components/gameBlocks';
import { boxNames } from './names';

export function BoxTab({ g, league, userGame, colors }: { g: GameResult; league: League; userGame: boolean; colors: [string, string] }) {
  const [home, away] = [league.teams[g.home.tid], league.teams[g.away.tid]];
  return (
    <>
      {!userGame && <StarsCard g={g} league={league} />}
      <Section title="By period">
        <div className="card gv-ls">
          <QuarterTable g={g} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
          {/* (the board over the report names the night's occasion; the crowd is here) */}
          {g.att ? <div className="gv-att">Attendance {g.att.toLocaleString()}</div> : null}
        </div>
      </Section>
      {[g.away, g.home].map((box) => {
        const t = league.teams[box.tid];
        return (
          <Section
            key={box.tid}
            title={
              <h3>
                <TeamLogo tid={t.tid} size={18} decorative /> {t.region} {t.name}
              </h3>
            }
          >
            <BoxScore box={box} name={boxNames(league, box, true)} label={`${t.region} ${t.name} box score`} pog={g.pog} links dnp />
          </Section>
        );
      })}
      <Section
        title="Team comparison"
        right={
          <span className="tiny dim">
            {away.abbrev} · {home.abbrev}
          </span>
        }
      >
        <div className="card">
          <TeamComparison g={g} colors={colors} />
        </div>
      </Section>
    </>
  );
}

/** The three stars, both teams: the player of the game first, then the next two by game score. */
function StarsCard({ g, league }: { g: GameResult; league: League }) {
  const stars = threeStars(g);
  if (!stars.length) return null;
  return (
    <Section title="Three stars">
      <div className="card flush list">
        {stars.map(({ line, tid }, k) => (
          <Link key={line.pid} to={`/player/${line.pid}`} className={`gd-star${k === 0 && line.pid === g.pog ? ' pog' : ''}`}>
            <span className="gd-star-n num">{k + 1}</span>
            <span className="grow gd-star-who">
              <span className="gd-star-name ellipsis">{league.players[line.pid] ? `${league.players[line.pid].firstName} ${league.players[line.pid].lastName}` : line.name}</span>
              <span className="gd-star-line num">
                {line.pts} pts · {line.orb + line.drb} reb · {line.ast} ast
              </span>
            </span>
            <span className="gd-star-team">{league.teams[tid]?.abbrev}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}
