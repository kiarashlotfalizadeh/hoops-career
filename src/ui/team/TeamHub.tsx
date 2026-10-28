// The Team hub: your team in one place. Its poster on the roster (the team's slab: the name, the
// record, the roster spots and payroll), then its sections as sticky page tabs with their own paths
// (/team, /team/rotation, /team/tactics and the paths under it, /team/lineups, /team/growth: the
// development report), each the screen it names. The other sections open on their tabs: the top bar
// already names the team and its record, so the section's own first block leads.
import { Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeague, useLeagueMemo } from '../../state/store';
import { curTeamSeason, payroll } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { seasonLabel } from '../../core/constants';
import type { League } from '../../core/types';
import { lazyRetry } from '../lazyRetry';
import { TabBar } from '../league/shared';
import { capSeason, isOffseason, rosterFig, shortSeason } from '../office/basis';
import '../screens/team.css';
import { money } from '../../core/format';
import { TeamLogo } from '../components/TeamLogo';
import { Fit } from '../components/ui';
import { ordinal } from '../stats';
import { useTeamEditWatch } from '../tactics/editWatch';

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
 * The team's poster over the roster: its slab, in your colours. The city and the season as a kicker,
 * the name in the headline cut and the record as the one big figure (where it stands under it), then
 * the roster spots and the payroll in mono across its foot (the only place Team shows money; it's in
 * full in the Office). Who runs the rotation and the tactics is their own tab's switch.
 */
function TeamHeader({ league }: { league: League }) {
  const t = league.teams[league.userTid];
  // between seasons, next season's contracts count, as on every Office desk (rosterSpots)
  const s0 = capSeason(league);
  const r = useLeagueMemo(() => rosterFig(league), [league]);
  const ts = curTeamSeason(league, league.userTid);
  const rank = useLeagueMemo(() => confStandings(league, t.conf).findIndex((x) => x.tid === t.tid) + 1, [league, t.conf, t.tid]);
  const pay = payroll(league, league.userTid, s0);
  const off = isOffseason(league) ? ` ${shortSeason(s0)}` : '';
  const conf = t.conf === 'E' ? 'East' : 'West';
  const gp = ts.won + ts.lost;
  return (
    <header className="slab tm-hh">
      <div className="tm-hh-over over">
        <TeamLogo tid={t.tid} size={22} decorative />
        <span className="ellipsis">
          {t.region} · {seasonLabel(league.season)}
        </span>
      </div>
      <div className="tm-hh-main">
        <Fit as="h1" className="tm-hh-name" min={18}>
          {t.name}
        </Fit>
        <div className="tm-hh-rec">
          <span className="tm-hh-wl" aria-label={`Record ${ts.won} and ${ts.lost}`}>
            {ts.won}-{ts.lost}
          </span>
          <span className="tm-hh-rank">{gp ? `${ordinal(rank)} in the ${conf}` : 'No games yet'}</span>
        </div>
      </div>
      <div className="tm-hh-figs">
        <div className="tm-hh-fig">
          <span className="tm-hh-v" style={r.color ? { color: r.color } : undefined}>
            {r.v}
          </span>
          {/* what the count is, or what's pressing about it: "1 to cut", "+3 expiring" */}
          <span className="tm-hh-k">{r.color ? r.s : `${r.k}${r.s ? ` · ${r.s}` : ''}`}</span>
        </div>
        <div className="tm-hh-fig">
          <span className="tm-hh-v">{money(pay)}</span>
          <span className="tm-hh-k">Payroll{off}</span>
        </div>
      </div>
    </header>
  );
}

export default function TeamHub() {
  const league = useLeague();
  const { tab } = useParams();
  const nav = useNavigate();
  const section = SECTIONS.find((s) => s.id === tab)?.id ?? 'roster';
  const team = league.teams[league.userTid];
  // a change to the tactics or rotation is measured by the staff when the user leaves (or taps Done on Tactics)
  useTeamEditWatch();
  return (
    <main className="page tm-hub">
      {section === 'roster' ? <TeamHeader league={league} /> : <h1 className="sr-only">{`${team.name}: ${SECTIONS.find((s) => s.id === section)!.label}`}</h1>}
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
