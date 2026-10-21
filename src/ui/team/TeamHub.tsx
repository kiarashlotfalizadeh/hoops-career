// The Team hub: your team in one place. One compact header (the team, its roster spots and payroll,
// who runs the rotation and tactics), then its sections as sticky page tabs with their own paths
// (/team, /team/rotation, /team/tactics, /team/lineups, /team/growth: the development report), each
// the screen it names.
import { Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, UserRound } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { CAP } from '../../core/constants';
import { payroll } from '../../core/league/helpers';
import type { League } from '../../core/types';
import { lazyRetry } from '../lazyRetry';
import { TabBar } from '../league/shared';
import { TeamLogo } from '../components/TeamLogo';
import { capSeason, isOffseason, rosterLine, rosterSpots, shortSeason } from '../office/basis';
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

/** Who runs the rotation and the tactics: the assistant, the coach, or one each. */
function staffLine(league: League): { text: string; assistant: boolean } {
  const t = league.teams[league.userTid];
  const rot = !t.rotation.manual;
  const tac = !t.tactics.manual;
  if (rot && tac) return { text: 'Assistant runs rotation, tactics', assistant: true };
  if (rot) return { text: 'Assistant runs the rotation', assistant: true };
  if (tac) return { text: 'Assistant runs the tactics', assistant: true };
  return { text: 'You run rotation, tactics', assistant: false };
}

/** Two lines over the tabs: the team and who runs it, then its roster spots and payroll (the record is in the top bar). */
function TeamHeader({ league }: { league: League }) {
  const t = league.teams[league.userTid];
  // between seasons, next season's contracts count, as on every Office desk (rosterSpots)
  const s0 = capSeason(league);
  const r = useLeagueMemo(() => ({ spots: rosterSpots(league), line: rosterLine(league, league.userTid, false) }), [league]);
  const pay = payroll(league, league.userTid, s0);
  const off = r.spots.signed > CAP.rosterMax || (league.phase === 'preseason' && r.spots.signed < CAP.rosterMin);
  const staff = staffLine(league);
  const Icon = staff.assistant ? Bot : UserRound;
  return (
    <header className="tm-hh">
      <TeamLogo tid={t.tid} size={36} decorative />
      <div className="tm-hh-id">
        <div className="tm-hh-top">
          <h1 className="tm-hh-name">{t.name}</h1>
          <span className="tm-hh-staff">
            <Icon size={13} aria-hidden="true" />
            {staff.text}
          </span>
        </div>
        <div className="tm-hh-meta">
          Roster{isOffseason(league) ? ` ${shortSeason(s0)}` : ''} <b className={`num ${off ? 'bad' : ''}`}>{r.line}</b>
          {' · '}Payroll <b className="num">{money(pay)}</b>
          {isOffseason(league) ? ` in ${shortSeason(s0)}` : ''}
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
  return (
    <main className="page tm-hub">
      <TeamHeader league={league} />
      <TabBar value={section} options={SECTIONS} onChange={(s) => nav(s === 'roster' ? '/team' : `/team/${s}`, { replace: true })} label="Team sections" />
      <Suspense fallback={<div className="empty">Loading…</div>}>
        {section === 'roster' && <Roster />}
        {section === 'rotation' && <Rotation />}
        {section === 'tactics' && <Tactics />}
        {section === 'lineups' && <Lineups />}
        {section === 'growth' && <Growth />}
      </Suspense>
    </main>
  );
}
