// Your system on the floor: the starting five on a half court, each where his role puts him (the
// creator up top, shooters in the corners, the roll man at the dunker spot, a hub at the elbow), with
// his role and how well he suits it in stars. A tap opens his role and shot freedom.
import { useMemo, useState } from 'react';
import type { League, OffRole, Player } from '../../core/types';
import { ROLE_META, archetype } from '../../core/ratings';
import { fitStars, roleFits } from '../../core/analysis/system';
import { rosterSorted } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { rosterNames } from '../stats';
import { Help, Section, Sheet } from '../components/ui';
import { RoleEditor } from '../components/RoleEditor';

/**
 * Where each role stands on the half court drawn below (its units: x across 0-100, y down from the
 * baseline 0-70; the arc's top is at 58), first choice first; a name plate is about a sixth of the court high, so none sits lower than 56.
 */
const SPOTS: Record<OffRole, [number, number][]> = {
  creator: [
    [50, 56],
    [24, 50],
  ],
  playmaker: [
    [50, 56],
    [76, 50],
  ],
  scorer: [
    [83, 34],
    [17, 34],
  ],
  shooter: [
    [83, 8],
    [17, 8],
    [83, 34],
  ],
  slasher: [
    [17, 34],
    [83, 34],
  ],
  roller: [
    [33, 13],
    [67, 13],
  ],
  stretch: [
    [76, 50],
    [24, 50],
  ],
  post: [
    [36, 22],
    [64, 22],
  ],
  hub: [
    [64, 31],
    [36, 31],
  ],
  glue: [
    [17, 8],
    [83, 8],
    [17, 34],
  ],
};
const ALL: [number, number][] = [
  [50, 56],
  [83, 34],
  [17, 34],
  [83, 8],
  [17, 8],
  [33, 13],
  [67, 31],
];

/** Each of the five's spot, taken in turn by role (a spot already taken goes to the next free one). */
function placements(five: { pid: number; role: OffRole }[]): Map<number, [number, number]> {
  const taken: [number, number][] = [];
  const out = new Map<number, [number, number]>();
  // (each name plate is about a third of the court wide)
  const free = (s: [number, number]) => !taken.some((t) => Math.abs(t[0] - s[0]) < 30 && Math.abs(t[1] - s[1]) < 12);
  // the ball handlers first, then the bigs, then the rest
  const order = [...five].sort((a, b) => rank(a.role) - rank(b.role));
  for (const x of order) {
    const s = [...SPOTS[x.role], ...ALL].find(free) ?? [50, 50];
    taken.push(s);
    out.set(x.pid, s);
  }
  return out;
}
const rank = (r: OffRole) => ['creator', 'playmaker', 'roller', 'post', 'hub', 'stretch', 'scorer', 'slasher', 'shooter', 'glue'].indexOf(r);

export function FloorCard({ league }: { league: League }) {
  const t = league.teams[league.userTid].tactics;
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const [pick, setPick] = useState<number | null>(null);
  const order = league.teams[league.userTid].rotation?.order ?? [];
  const five = order
    .slice(0, 5)
    .map((pid) => league.players[pid])
    .filter((p): p is Player => !!p);
  const rows = five.map((p) => {
    const role = t.offense.roles[p.pid] ?? archetype(p.ratings).role;
    const fits = roleFits(p);
    const bestRole = (Object.keys(fits) as OffRole[]).sort((a, b) => fits[b] - fits[a])[0];
    return { p, role, stars: fitStars(fits[role]), best: bestRole, bestStars: fitStars(fits[bestRole]) };
  });
  const spots = placements(rows.map((r) => ({ pid: r.p.pid, role: r.role })));
  const picked = pick !== null ? league.players[pick] : null;
  return (
    <Section
      title="Your five"
      right={
        <Help title="Your five">
          <p>Your starters where their roles put them, with how well each suits his role (★ to ★★★★★). Tap one to change his role or shot freedom.</p>
          <p>A player out of his best role shows it underneath: roles decide which actions he&apos;s in and how often the offense looks for him.</p>
        </Help>
      }
    >
      <div className="tx-floor" role="list" aria-label="Your starting five by role">
        <svg className="tx-floor-court" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">
          <rect x="0" y="0" width="100" height="70" className="tx-floor-wood" />
          <rect x="33" y="0" width="34" height="27" className="tx-floor-paint" />
          <path d="M 6 0 L 6 14 A 44 44 0 0 0 94 14 L 94 0" className="tx-floor-line" fill="none" />
          <circle cx="50" cy="27" r="9" className="tx-floor-line" fill="none" />
          <circle cx="50" cy="5" r="1.6" className="tx-floor-rim" fill="none" />
        </svg>
        {rows.map((r) => {
          const [x, y] = spots.get(r.p.pid)!;
          const off = r.best !== r.role && r.bestStars > r.stars;
          return (
            <button
              key={r.p.pid}
              role="listitem"
              className={`tx-floor-p${off ? ' off' : ''}`}
              // (the drawing's units: y from the baseline, at its top, over its 70)
              style={{ left: `${x}%`, top: `${(y / 70) * 100}%` }}
              onClick={() => setPick(r.p.pid)}
              aria-label={`${nameOf(r.p.pid)}, ${ROLE_META[r.role].label}, ${r.stars} of 5 for it${off ? `; best as ${ROLE_META[r.best].label}` : ''}`}
            >
              <span className="tx-floor-n">{nameOf(r.p.pid)}</span>
              <span className="tx-floor-r">{ROLE_META[r.role].label}</span>
              <span className="tx-floor-s" aria-hidden="true">
                {'★'.repeat(r.stars)}
                <span className="dim">{'★'.repeat(5 - r.stars)}</span>
              </span>
              {off && <span className="tx-floor-best">Best: {ROLE_META[r.best].label}</span>}
            </button>
          );
        })}
      </div>
      <Sheet open={!!picked} onClose={() => setPick(null)} title={picked ? nameOf(picked.pid) : 'Player'}>
        {picked && <RoleEditor p={picked} onDone={() => setPick(null)} />}
      </Sheet>
    </Section>
  );
}
