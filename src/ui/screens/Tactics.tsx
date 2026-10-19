// Team → Tactics: your system and its parts in six tabs (System, Offense, Defense, Players, Game
// Mgmt, Insights; advice in core links to them by their ids, so those stay), each its own module in
// src/ui/tactics. The System tab opens on the system report: your system's grades at both ends against
// the league's, which the Offense and Defense tabs carry in a strip over their settings, moving as you
// change one, so every lever shows what it buys and what it costs. The staff's advice on tactics sits
// on top; every explanation is behind a "?". Edits save as they're made; while this visit has any, a
// compact dock says what they did to the grades and offers Undo and Done (which hands the Continue
// bar back).
import { useEffect, useMemo, useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { edit, touch } from '../../state/actions';
import { cloneTactics } from '../../core/sim/tactics';
import { guideVisit } from '../../core/league/agenda';
import { rosterSorted } from '../../core/league/helpers';
import { QUALITY_META, gradeChanges, systemReport } from '../../core/analysis/system';
import { Segmented } from '../components/ui';
import { AssistantCards } from '../components/Assistant';
import { useQueryParam } from '../league/shared';
import { visitStart } from '../tactics/edit';
import { SystemTab } from '../tactics/SystemTab';
import { GradeStrip } from '../tactics/SystemReport';
import { OffenseTab } from '../tactics/OffenseTab';
import { DefenseTab } from '../tactics/DefenseTab';
import { RolesTab } from '../tactics/RolesTab';
import { ManageTab } from '../tactics/ManageTab';
import { InsightsTab } from '../tactics/InsightsTab';
import './tactics.css';

type Tab = 'playbook' | 'offense' | 'defense' | 'roles' | 'manage' | 'insights';

const TABS: { id: Tab; label: string }[] = [
  { id: 'playbook', label: 'System' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'roles', label: 'Players' },
  { id: 'manage', label: 'Game Mgmt' },
  { id: 'insights', label: 'Insights' },
];

export default function Tactics() {
  const league = useLeague();
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

  // the system report now and as this visit found it (the other teams' systems worked out once)
  const base = useLeagueMemo(() => systemReport(league, league.userTid, start.tactics), [league, start]);
  const sig = JSON.stringify(t);
  const report = useMemo(() => (changed ? systemReport(league, league.userTid, t, base.others) : base), [changed, sig, base, league]); // eslint-disable-line react-hooks/exhaustive-deps
  const moved = changed ? gradeChanges(base, report) : [];

  return (
    <>
      <AssistantCards league={league} areas={['tactics']} max={2} />
      <div className="tx-tabs">
        <Segmented value={tab} onChange={setTab} options={TABS} label="Tactics sections" />
      </div>
      {(tab === 'offense' || tab === 'defense') && <GradeStrip report={report} was={base} end={tab === 'offense' ? 'off' : 'def'} />}

      {/* while a sim plays on a copy of the league, nothing here can change it */}
      <fieldset className="tx-fieldset" disabled={simming}>
        {tab === 'playbook' && <SystemTab report={report} was={changed ? base : undefined} />}
        {tab === 'offense' && <OffenseTab t={t} players={players} />}
        {tab === 'defense' && <DefenseTab t={t} />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'manage' && <ManageTab t={t} players={players} />}
        {tab === 'insights' && <InsightsTab />}
      </fieldset>

      {changed && !simming && (
        <div className="dockbar tx-dock" role="region" aria-label="Your changes">
          <span className="grow tx-dock-l">
            {moved.length ? (
              moved.slice(0, 2).map((m) => (
                <span key={m.id} className={`tx-dock-m ${m.up ? 'good' : 'bad'}`}>
                  {QUALITY_META[m.id].label} {m.from}→{m.to}
                </span>
              ))
            ) : (
              <span>Edited · grades unchanged</span>
            )}
            {moved.length > 2 && <span className="dim"> +{moved.length - 2}</span>}
          </span>
          <button className="btn sm ghost" aria-label="Undo your changes" onClick={() => edit((l) => void (l.teams[l.userTid].tactics = cloneTactics(start.tactics)))}>
            <Undo2 size={16} />
          </button>
          <button className="btn sm primary" aria-label="Done: keep the changes" onClick={() => setStart(visitStart(league))}>
            <Check size={16} /> Done
          </button>
        </div>
      )}
    </>
  );
}
