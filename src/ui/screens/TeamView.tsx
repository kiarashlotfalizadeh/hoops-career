// Another team's page (/teams/:tid; the user's own team lives in the Team tab): its slab, the two
// things to do with it (its Matchup page, a trade), then Overview, Roster, Schedule, Picks, Moves
// and History (the sections live in src/ui/league/team). Scouting them lives on the Matchup page.
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useLeague } from '../../state/store';
import { PageHeader } from '../components/ui';
import { TabBar, useQueryParam } from '../league/shared';
import { MovesTab } from '../league/MovesTab';
import { PicksList } from '../league/PicksList';
import { FranchiseFigures, FranchiseHistory } from '../league/Franchise';
import { TeamActions, TeamHero } from '../league/team/Hero';
import { TeamOverview } from '../league/team/Overview';
import { RosterTab } from '../league/team/RosterTab';
import { ScheduleTab } from '../league/team/ScheduleTab';
import { LazyTeamEditor } from '../god/lazy';

const TABS = ['overview', 'roster', 'schedule', 'picks', 'moves', 'history'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { overview: 'Overview', roster: 'Roster', schedule: 'Schedule', picks: 'Picks', moves: 'Moves', history: 'History' };

export default function TeamView() {
  const league = useLeague();
  const params = useParams();
  const tid = Number(params.tid);
  const team = Number.isInteger(tid) ? league.teams[tid] : undefined;
  const [raw, setTab] = useQueryParam<string>('tab', 'overview');
  const [editing, setEditing] = useState(false);
  if (!team) {
    return (
      <main className="page">
        <PageHeader title="Team" back backTo="/league" />
        <div className="card empty">That team does not exist.</div>
      </main>
    );
  }
  // scouting them (and how they play) lives on their Matchup page now
  if (raw === 'scouting' || raw === 'tactics') return <Navigate to={`/games/${tid}`} replace />;
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : 'overview';
  return (
    <main className="page lg-page">
      {editing && league.settings.godMode && <LazyTeamEditor tid={tid} onClose={() => setEditing(false)} />}
      <TeamHero league={league} tid={tid} onEdit={league.settings.godMode ? () => setEditing(true) : undefined} />
      <TeamActions league={league} tid={tid} />
      <TabBar value={tab} onChange={setTab} options={TABS.map((id) => ({ id, label: LABEL[id] }))} label="Team sections" />
      {tab === 'overview' && <TeamOverview league={league} tid={tid} onRoster={() => setTab('roster')} />}
      {tab === 'roster' && <RosterTab league={league} tid={tid} />}
      {tab === 'schedule' && <ScheduleTab league={league} tid={tid} />}
      {tab === 'picks' && <PicksList league={league} tid={tid} />}
      {tab === 'moves' && <MovesTab league={league} tid={tid} />}
      {tab === 'history' && (
        <>
          <div className="card lg-strip">
            <FranchiseFigures league={league} tid={tid} />
          </div>
          <FranchiseHistory league={league} tid={tid} />
        </>
      )}
    </main>
  );
}
