// The Team hub: your team in one place. One compact header (the team, its roster spots and payroll,
// who runs the rotation and tactics), then its sections as sticky page tabs with their own paths
// (/team, /team/rotation, /team/tactics, /team/lineups), each the screen it names.
import { Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, UserRound } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { CAP } from '../../core/constants';
import { payroll, rosterSorted } from '../../core/league/helpers';
import { contractExp } from '../../core/playerGen';
import type { League } from '../../core/types';
import { lazyRetry } from '../lazyRetry';
import { TabBar } from '../league/shared';
import { TeamLogo } from '../components/TeamLogo';
import { capSeason, isOffseason, shortSeason } from '../office/common';
import '../screens/team.css';
import { money } from '../../core/format';

const Roster = lazyRetry(() => import('../screens/Roster'));
const Rotation = lazyRetry(() => import('../screens/Rotation'));
const Tactics = lazyRetry(() => import('../screens/Tactics'));
const Lineups = lazyRetry(() => import('../screens/Lineups'));

type Section = 'roster' | 'rotation' | 'tactics' | 'lineups';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'roster', label: 'Roster' },
  { id: 'rotation', label: 'Rotation' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'lineups', label: 'Lineups' },
];

/** Who runs the rotation and the tactics: the assistant, the coach, or one each. */
function staffLine(league: League): { text: string; assistant: boolean } {
  const t = league.teams[league.userTid];
  const rot = !t.rotation.manual;
  const tac = !t.tactics.manual;
  if (rot && tac) return { text: 'Assistant runs rotation and tactics', assistant: true };
  if (rot) return { text: 'Assistant runs the rotation · you, the tactics', assistant: true };
  if (tac) return { text: 'Assistant runs the tactics · you, the rotation', assistant: true };
  return { text: 'You run rotation and tactics', assistant: false };
}

function TeamHeader({ league }: { league: League }) {
  const t = league.teams[league.userTid];
  const roster = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  // between seasons, next season's contracts count (as on the cap sheet)
  const s0 = capSeason(league);
  const standard = roster.filter((p) => !p.contract.twoWay && contractExp(p.contract) >= s0).length;
  const pay = payroll(league, league.userTid, s0);
  const off = standard > CAP.rosterMax || (league.phase === 'preseason' && standard < CAP.rosterMin);
  const staff = staffLine(league);
  const Icon = staff.assistant ? Bot : UserRound;
  return (
    <header className="tm-hh">
      <TeamLogo tid={t.tid} size={46} decorative />
      <div className="tm-hh-id">
        <div className="tm-hh-region">{t.region}</div>
        <h1 className="tm-hh-name">{t.name}</h1>
        <div className="tm-hh-meta num">
          <span className={off ? 'bad' : undefined}>
            {standard}/{CAP.rosterMax}
          </span>
          {' · '}
          {money(pay)} payroll{isOffseason(league) ? ` in ${shortSeason(s0)}` : ''}
        </div>
        <div className="tm-hh-staff">
          <Icon size={13} aria-hidden="true" />
          {staff.text}
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
      </Suspense>
    </main>
  );
}
