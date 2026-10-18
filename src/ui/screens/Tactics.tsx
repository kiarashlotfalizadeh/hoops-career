// Team → Tactics: the playbook and its parts in six tabs (Playbook, Offense, Defense, Roles, Game
// Mgmt, Insights; advice in core names them, so their names stay), each its own module in
// src/ui/tactics. The staff's advice on tactics sits on top; every explanation is behind a "?". Edits
// save as they're made; while this visit has any, a compact dock offers Undo, a comparison in the
// Lab, and Done (which hands the Continue bar back).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, FlaskConical, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit, touch } from '../../state/actions';
import { cloneTactics } from '../../core/sim/tactics';
import { guideVisit } from '../../core/league/agenda';
import { rosterSorted } from '../../core/league/helpers';
import { Segmented } from '../components/ui';
import { AssistantCards } from '../components/Assistant';
import { useQueryParam } from '../league/shared';
import { setLabBaseline } from './labBridge';
import { visitStart } from '../tactics/edit';
import { PlaybookTab } from '../tactics/PlaybookTab';
import { OffenseTab } from '../tactics/OffenseTab';
import { DefenseTab } from '../tactics/DefenseTab';
import { RolesTab } from '../tactics/RolesTab';
import { ManageTab } from '../tactics/ManageTab';
import { InsightsTab } from '../tactics/InsightsTab';
import './tactics.css';

type Tab = 'playbook' | 'offense' | 'defense' | 'roles' | 'manage' | 'insights';

const TABS: { id: Tab; label: string }[] = [
  { id: 'playbook', label: 'Playbook' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'roles', label: 'Roles' },
  { id: 'manage', label: 'Game Mgmt' },
  { id: 'insights', label: 'Insights' },
];

export default function Tactics() {
  const league = useLeague();
  const nav = useNavigate();
  const [tab, setTab] = useQueryParam<Tab>(
    'tab',
    'playbook',
    TABS.map((x) => x.id),
  );
  const t = league.teams[league.userTid].tactics;
  // a sim hands back a new league (where the assistant may have refit a playbook he manages): a new starting point
  const [start, setStart] = useState(() => visitStart(league));
  if (start.of !== league) setStart(visitStart(league));
  const changed = start.sig !== JSON.stringify(t);
  // a Play-menu sim's progress bar takes the same spot as the changes dock
  const simming = useStore((s) => !!s.sim);
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  // the guided first week's "pick a playbook" is done once it's been looked at
  useEffect(() => void touch((l) => void guideVisit(l, 'playbook')), []);

  return (
    <>
      <AssistantCards league={league} areas={['tactics']} max={2} />
      <div className="tx-tabs">
        <Segmented value={tab} onChange={setTab} options={TABS} label="Tactics sections" />
      </div>

      {/* while a sim plays on a copy of the league, nothing here can change it */}
      <fieldset className="tx-fieldset" disabled={simming}>
        {tab === 'playbook' && <PlaybookTab />}
        {tab === 'offense' && <OffenseTab t={t} players={players} />}
        {tab === 'defense' && <DefenseTab t={t} />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'manage' && <ManageTab t={t} players={players} />}
        {tab === 'insights' && <InsightsTab />}
      </fieldset>

      <Link to="/lab" className="tx-lablink">
        <FlaskConical size={16} aria-hidden="true" />
        <span className="grow">Test your tactics in the Lab</span>
        <ChevronRight size={16} className="dim" aria-hidden="true" />
      </Link>

      {changed && !simming && (
        <div className="dockbar tx-dock" role="region" aria-label="Your changes">
          <span className="grow tx-dock-l">Edited</span>
          <button className="btn sm ghost" aria-label="Undo your changes" onClick={() => edit((l) => void (l.teams[l.userTid].tactics = cloneTactics(start.tactics)))}>
            <Undo2 size={16} />
          </button>
          <button
            className="btn sm"
            onClick={() => {
              setLabBaseline(cloneTactics(start.tactics), league);
              nav('/lab?compare=1');
            }}
          >
            <FlaskConical size={16} /> Compare
          </button>
          <button className="btn sm primary" aria-label="Done: keep the changes" onClick={() => setStart(visitStart(league))}>
            <Check size={16} /> Done
          </button>
        </div>
      )}
    </>
  );
}
