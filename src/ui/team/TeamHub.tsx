// The Team hub: your team in one place. One compact line (the team, its roster spots and payroll),
// then its sections as sticky page tabs with their own paths
// (/team, /team/rotation, /team/tactics, /team/lineups, /team/growth: the development report), each
// the screen it names.
import { Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeague, useLeagueMemo } from '../../state/store';
import { payroll } from '../../core/league/helpers';
import type { League } from '../../core/types';
import { lazyRetry } from '../lazyRetry';
import { TabBar } from '../league/shared';
import { capSeason, isOffseason, rosterFig, shortSeason } from '../office/basis';
import '../screens/team.css';
import { money } from '../../core/format';

const Roster = lazyRetry(() => import('../screens/Roster'));
const Rotation = lazyRetry(() => import('../screens/Rotation'));
const Tactics = lazyRetry(() => import('../screens/Tactics'));
const Lineups = lazyRetry(() => import('../screens/Lineups'));
const Growth = lazyRetry(() => import('./GrowthView'));

type Section = 'roster' | 'rotation' | 'tactics' | 'lineups' | 'growth';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'roster', label: 'Roster' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'lineups', label: 'Lineups' },
  { id: 'growth', label: 'Growth' },
];

/**
 * One line over the tabs: the team's name, then its roster spots and payroll as two figures (the
 * record and the date are in the top bar; who runs the rotation and the tactics is their own tab's
 * switch).
 */
function TeamHeader({ league }: { league: League }) {
  const t = league.teams[league.userTid];
  // between seasons, next season's contracts count, as on every Office desk (rosterSpots)
  const s0 = capSeason(league);
  const r = useLeagueMemo(() => rosterFig(league), [league]);
  const pay = payroll(league, league.userTid, s0);
  const off = isOffseason(league) ? ` ${shortSeason(s0)}` : '';
  return (
    <header className="tm-hh">
      <h1 className="tm-hh-name">{t.name}</h1>
      <div className="tm-hh-fig">
        <span className="tm-hh-v num" style={r.color ? { color: r.color } : undefined}>
          {r.v}
        </span>
        {/* what the count is, or what's pressing about it: "1 to cut", "+3 expiring" */}
        <span className="tm-hh-k">{r.color ? r.s : `${r.k}${r.s ? ` · ${r.s}` : ''}`}</span>
      </div>
      <div className="tm-hh-fig">
        <span className="tm-hh-v num">{money(pay)}</span>
        <span className="tm-hh-k">Payroll{off}</span>
      </div>
    </header>
  );
}

export default function TeamHub() {
  const league = useLeague();
  const { tab } = useParams();
  const nav = useNavigate();
  const section = SECTIONS.find((s) => s.id === tab)?.id ?? 'roster';
  return (
    <main className="page tm-hub">
      <TeamHeader league={league} />
      <TabBar value={section} options={SECTIONS} onChange={(s) => nav(s === 'roster' ? '/team' : `/team/${s}`, { replace: true })} label="Team sections" />
      <Suspense fallback={null}>
        {section === 'roster' && <Roster />}
        {section === 'rotation' && <Rotation />}
        {section === 'tactics' && <Tactics />}
        {section === 'lineups' && <Lineups />}
        {section === 'growth' && <Growth />}
      </Suspense>
    </main>
  );
}
