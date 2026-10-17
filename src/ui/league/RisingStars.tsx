// The Rising Stars game on the Awards tab: the rookies' and the sophomores' rosters with their lines
// and the final score, the MVP marked. Names and teams are as they were that night; a player still in
// the save links to his page.
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import type { League, RisingStar, SeasonAwards } from '../../core/types';
import { TeamLogo } from '../components/TeamLogo';
import { Card } from '../components/ui';

/** "Cooper Flagg" → "C. Flagg", from the name as it was. */
const short = (name: string) => {
  const i = name.indexOf(' ');
  return i > 0 ? `${name[0]}. ${name.slice(i + 1)}` : name;
};

function Side({ league, title, pts, won, list, mvp }: { league: League; title: string; pts: number; won: boolean; list: RisingStar[]; mvp?: number }) {
  return (
    <Card
      title={
        <h3>
          {title} · {pts}
          {won ? ' · W' : ''}
        </h3>
      }
      right={<Sparkles size={16} className="dim" />}
    >
      <div className="lg-team5">
        {[...list]
          .sort((a, b) => b.pts - a.pts)
          .map((e) => {
            const name = (
              <span className="ellipsis">
                <span className="bold">{short(e.name)}</span>
                {e.pid === mvp && (
                  <span className="tag lg-gold" style={{ marginLeft: 6 }}>
                    MVP
                  </span>
                )}
              </span>
            );
            const line = <span className="tiny dim num">{`${e.pts} pts · ${e.reb} reb · ${e.ast} ast`}</span>;
            return league.players[e.pid] ? (
              <Link key={e.pid} to={`/player/${e.pid}`} className="row5">
                <TeamLogo tid={e.tid} size={22} />
                {name}
                {line}
              </Link>
            ) : (
              <div key={e.pid} className="row5">
                <TeamLogo tid={e.tid} size={22} />
                {name}
                {line}
              </div>
            );
          })}
      </div>
    </Card>
  );
}

export function RisingStars({ league, aw }: { league: League; aw: SeasonAwards }) {
  const rs = aw.risingStars;
  if (!rs) return null;
  const [r, s] = rs.score;
  return (
    <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
      <Side league={league} title="Rising Stars: Rookies" pts={r} won={r > s} list={rs.rookies} mvp={rs.mvp} />
      <Side league={league} title="Rising Stars: Sophomores" pts={s} won={s > r} list={rs.sophomores} mvp={rs.mvp} />
    </div>
  );
}
