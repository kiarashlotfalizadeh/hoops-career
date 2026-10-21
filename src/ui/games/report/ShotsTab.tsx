// The game report's Shots: each team's shot chart, away first, in its own colour (as the Flow's
// charts draw it) under one key, with its field goals and how it shot at the rim, from the paint and
// mid-range, and from three.
import type { GameResult, League } from '../../../core/types';
import { madeAtt } from '../../../core/format';
import { Section, Statline } from '../../components/ui';
import { TeamLogo } from '../../components/TeamLogo';
import { ShotChart, ShotKey } from '../../components/charts';
import { boardColors } from '../../components/FinalSlab';
import { p1 } from '../../stats';

const ZONES = [
  { k: 'At the rim', in: (z: string) => z === 'rim' },
  { k: 'Paint & mid', in: (z: string) => z === 'paint' || z === 'mid' },
  { k: 'Threes', in: (z: string) => z === 'c3' || z === 'ab3' },
];

export function ShotsTab({ g, league }: { g: GameResult; league: League }) {
  const shots = g.shots ?? [];
  const [home, away] = [league.teams[g.home.tid], league.teams[g.away.tid]];
  // (each team in its colour on the board above)
  const kits = boardColors(league, g);
  return (
    <>
      <ShotKey
        made={[
          { label: `${away.abbrev} made`, color: kits[1] },
          { label: `${home.abbrev} made`, color: kits[0] },
        ]}
      />
      <div className="md-grid2">
        {([1, 0] as const).map((side) => {
          const t = side === 0 ? home : away;
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
              right={<span className="small bold num">{madeAtt(made, mine.length)} FG</span>}
            >
              <div className="card gv-shots">
                <ShotChart shots={mine} color={kits[side]} keyed={false} />
                <Statline
                  items={ZONES.map((z) => {
                    const zs = mine.filter((s) => z.in(s.zone));
                    const m = zs.filter((s) => s.made).length;
                    return { k: z.k, v: madeAtt(m, zs.length), s: zs.length ? p1(m / zs.length) : '—' };
                  })}
                />
              </div>
            </Section>
          );
        })}
      </div>
    </>
  );
}
