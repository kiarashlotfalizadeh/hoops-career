// Team → Tactics, Football Manager's way. One hero holds the plan in use (tactics/Hero: your three
// tactics A, B and C with how well the team knows each, the style the active one runs, the grades the
// open section's levers move, the assistant's switch), then six sections as one row of chips, each
// its own module in src/ui/tactics: Tactic (the board: your five where the shape and the scheme put
// them; your saved playbooks), the Instructions by phase of play (with the mentality), Players (roles
// at both ends), Familiarity (what the team knows and the practice that builds it), Game Mgmt and the
// Report (the system report and the season's insights). Advice in core links here by the old section
// ids (playbook, offense, defense, roles, manage, insights), which open the section that now holds
// them. The grades in the hero move as you change a setting, so every lever shows what it buys and
// what it costs. Edits save as they're
// made; while this visit has any, a compact dock says what they did to the grades and offers Undo
// and Done (which hands the Continue bar back).
import { useEffect, useMemo, useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { touch } from '../../state/actions';
import { guideVisit } from '../../core/league/agenda';
import { rosterSorted } from '../../core/league/helpers';
import { systemFamiliarity } from '../../core/league/practice';
import { QUALITY_META, gradeChanges, systemReport } from '../../core/analysis/system';
import { AssistantCards } from '../components/Assistant';
import { useQueryParam } from '../league/shared';
import { tacticsSig, undoTo, visitStart } from '../tactics/edit';
import { TacticsHero } from '../tactics/Hero';
import { TacticTab } from '../tactics/TacticTab';
import { InstructionsTab } from '../tactics/InstructionsTab';
import { RolesTab } from '../tactics/RolesTab';
import { FamiliarityTab } from '../tactics/FamiliarityTab';
import { ManageTab } from '../tactics/ManageTab';
import { ReportTab } from '../tactics/ReportTab';
import { MentalityDial } from '../tactics/SlotBar';
import { PHASES, type Phase } from '../tactics/fam';
import type { BoardSide } from '../tactics/Board';
import './tactics.css';

type Tab = 'tactic' | 'instructions' | 'players' | 'familiarity' | 'manage' | 'report';
/** The sections' old ids, which advice and search still link to. */
type OldTab = 'playbook' | 'offense' | 'defense' | 'roles' | 'insights';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tactic', label: 'Tactic' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'players', label: 'Players' },
  { id: 'familiarity', label: 'Familiarity' },
  { id: 'manage', label: 'Game Mgmt' },
  { id: 'report', label: 'Report' },
];

const OLD: Record<OldTab, Tab> = { playbook: 'tactic', offense: 'instructions', defense: 'instructions', roles: 'players', insights: 'report' };
const ALL_IDS = [...TABS.map((x) => x.id), ...(Object.keys(OLD) as OldTab[])];

export default function Tactics() {
  const league = useLeague();
  const [raw, setTab] = useQueryParam<Tab | OldTab>('tab', 'tactic', ALL_IDS);
  const tab: Tab = (OLD as Record<string, Tab>)[raw] ?? (raw as Tab);
  // a link to the old Defense section opens Instructions out of possession
  const [phase, setPhase] = useQueryParam<Phase>(
    'phase',
    raw === 'defense' ? 'outPoss' : 'inPoss',
    PHASES.map((p) => p.id),
  );
  const [side, setSide] = useQueryParam<BoardSide>('side', 'in', ['in', 'out']);
  const team = league.teams[league.userTid];
  const t = team.tactics;
  // a sim hands back a new league (where the assistant may have refit a playbook he manages): a new starting point
  const [start, setStart] = useState(() => visitStart(league));
  if (start.of !== league) setStart(visitStart(league));
  const changed = start.sig !== tacticsSig(t);
  // a Play-menu sim's progress bar takes the same spot as the changes dock
  const simming = useStore((s) => !!s.sim);
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const sys = useLeagueMemo(() => systemFamiliarity(league, league.userTid), [league]);
  // the guided first week's "pick a playbook" is done once it's been looked at
  useEffect(() => void touch((l) => void guideVisit(l, 'playbook')), []);

  // the system report now and as this visit found it (the other teams' systems worked out once)
  const base = useLeagueMemo(() => systemReport(league, league.userTid, start.tactics), [league, start]);
  const sig = tacticsSig(t);
  const report = useMemo(() => (changed ? systemReport(league, league.userTid, t, base.others) : base), [changed, sig, base, league]); // eslint-disable-line react-hooks/exhaustive-deps
  const moved = changed ? gradeChanges(base, report) : [];
  // the grades the open section's levers move
  const end = tab === 'tactic' ? (side === 'in' ? 'off' : 'def') : tab === 'instructions' ? PHASES.find((p) => p.id === phase)!.end : tab === 'players' ? 'both' : null;

  return (
    <>
      {/* the hero: the plan in use (its slot, its style, the grades the open tab moves, who runs it) */}
      <fieldset className="tx-fieldset" disabled={simming}>
        <TacticsHero report={report} was={base} end={end} />
      </fieldset>
      <AssistantCards league={league} areas={['tactics']} max={2} />
      {/* the sections: one row of chips that scrolls, not a grid of tabs */}
      <div className="tx-tabs" role="group" aria-label="Tactics sections">
        {TABS.map((x) => (
          <button key={x.id} className={`chip ${tab === x.id ? 'on' : ''}`} aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>

      <fieldset className="tx-fieldset" disabled={simming}>
        {tab === 'instructions' && <MentalityDial t={t} />}
        {tab === 'tactic' && <TacticTab players={players} side={side} setSide={setSide} onPlayers={() => setTab('players')} />}
        {tab === 'instructions' && <InstructionsTab t={t} players={players} sys={sys} phase={phase} setPhase={setPhase} />}
        {tab === 'players' && <RolesTab players={players} />}
        {tab === 'familiarity' && <FamiliarityTab sys={sys} players={players} />}
        {tab === 'manage' && <ManageTab t={t} players={players} />}
        {tab === 'report' && <ReportTab report={report} was={changed ? base : undefined} />}
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
          <button className="btn sm ghost" aria-label="Undo your changes" onClick={() => undoTo(start)}>
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
