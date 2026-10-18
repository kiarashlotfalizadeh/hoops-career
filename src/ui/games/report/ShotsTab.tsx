// The game report's Shots: each team's shot chart, away first, with its field goals and how it
// shot at the rim, from the paint and midrange, and from three.
import type { GameResult, League } from '../../../core/types';
import { Section, Statline } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { ShotChart } from '../../components/charts';
import { p1 } from '../../stats';

/** The opponent's shots, against your accent (and between two other teams, both sides). */
const OTHER = '#7dd3fc';

export function ShotsTab({ g, league, userGame, accentSide }: { g: GameResult; league: League; userGame: boolean; accentSide: 0 | 1 }) {
  const shots = g.shots ?? [];
  return (
    <div className="md-grid2">
      {([1, 0] as const).map((side) => {
        const t = league.teams[side === 0 ? g.home.tid : g.away.tid];
        const mine = shots.filter((s) => s.t === side);
        const made = mine.filter((s) => s.made).length;
        return (
          <Section
            key={side}
            title={
              <h3>
                <TeamLogo tid={t.tid} size={18} decorative /> {t.name}
              </h3>
            }
            right={
              <span className="small bold num">
                {made}/{mine.length} FG
              </span>
            }
          >
            <div className="card gv-shots">
              <ShotChart shots={mine} color={userGame && side === accentSide ? 'var(--accent)' : OTHER} />
              <Statline
                items={(['rim', 'mid', 'ab3'] as const).map((z) => {
                  const zs = mine.filter((s) => (z === 'ab3' ? s.zone === 'ab3' || s.zone === 'c3' : z === 'mid' ? s.zone === 'mid' || s.zone === 'paint' : s.zone === 'rim'));
                  const m = zs.filter((s) => s.made).length;
                  return { k: z === 'rim' ? 'At rim' : z === 'mid' ? 'Paint/Mid' : 'Three', v: `${m}/${zs.length}`, s: zs.length ? p1(m / zs.length) : '—' };
                })}
              />
            </div>
          </Section>
        );
      })}
    </div>
  );
}
