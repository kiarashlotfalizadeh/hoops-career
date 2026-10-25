// Team → Tactics, Football Manager's way. One hero holds the plan in use (tactics/Hero: your three
// tactics A, B and C, the style the active one runs, how well the team knows it, its strengths and
// weaknesses from the system report, the assistant's switch), then four sections as one row of chips,
// each its own module in src/ui/tactics: Tactic (the board with your five, their partnerships and the
// bench; your saved playbooks), Instructions (the mentality and the three phases of play), Match
// (crunch time, situations and the late-game rules) and Analysis (the system report, familiarity and
// the season). Advice in core links here by the old section ids (playbook, roles, players, offense,
// defense, manage, insights, report, familiarity), which open the section that now holds them. The
// hero's strengths and weaknesses move as you change a setting, so every lever shows what it buys and
// what it costs. Edits save as they're made; while this visit has any, a compact dock says what they
// did to the grades and offers Undo and Done (which hands the Continue bar back, and has the staff
// measure the change over the next games: tactics/editWatch.ts).
import { useMemo, useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { rosterSorted } from '../../core/league/helpers';
import { systemFamiliarity } from '../../core/league/practice';
import { QUALITY_META, gradeChanges, systemReport } from '../../core/analysis/system';
import { AssistantCards } from '../components/Assistant';
import { GuideStrip } from '../components/GuideStrip';
import { useQueryParam, useSetParams } from '../league/shared';
import { tacticsSig, undoTo, visitStart } from '../tactics/edit';
import { TacticsHero } from '../tactics/Hero';
import { TacticTab } from '../tactics/TacticTab';
import { InstructionsTab } from '../tactics/InstructionsTab';
import { MatchTab } from '../tactics/MatchTab';
import { ANALYSIS_VIEWS, AnalysisTab, type AnalysisView } from '../tactics/AnalysisTab';
import { phaseId, type Phase } from '../tactics/fam';
import { settleEdits } from '../tactics/editWatch';
import { EditMeasureBar } from '../tactics/EditLedger';
import type { BoardSide } from '../tactics/Board';
import './tactics.css';

type Tab = 'tactic' | 'instructions' | 'match' | 'analysis';
/** The sections' old ids, which advice and search still link to. */
type OldTab = 'playbook' | 'roles' | 'players' | 'offense' | 'defense' | 'manage' | 'insights' | 'report' | 'familiarity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tactic', label: 'Tactic' },
  { id: 'instructions', label: 'Instructions' },
  { id: 'match', label: 'Match' },
  { id: 'analysis', label: 'Analysis' },
];

const OLD: Record<OldTab, Tab> = {
  playbook: 'tactic',
  roles: 'tactic',
  players: 'tactic',
  offense: 'instructions',
  defense: 'instructions',
  manage: 'match',
  insights: 'analysis',
  report: 'analysis',
  familiarity: 'analysis',
};
const ALL_IDS = [...TABS.map((x) => x.id), ...(Object.keys(OLD) as OldTab[])];

export default function Tactics() {
  const league = useLeague();
  const [raw, setTab] = useQueryParam<Tab | OldTab>('tab', 'tactic', ALL_IDS);
  const tab: Tab = (OLD as Record<string, Tab>)[raw] ?? (raw as Tab);
  // a link to the old Defense section opens Instructions out of possession (and an old phase reads as its new one)
  const [rawPhase, setPhase] = useQueryParam<string>('phase', raw === 'defense' ? 'outPoss' : 'inPoss');
  const phase: Phase = phaseId(rawPhase);
  // an old Familiarity or Insights link opens Analysis at that view
  const [view, setView] = useQueryParam<AnalysisView>('view', raw === 'familiarity' ? 'familiarity' : raw === 'insights' ? 'season' : 'report', ANALYSIS_VIEWS);
  const setParams = useSetParams();
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

  // the system report now and as this visit found it (the other teams' systems worked out once)
  const base = useLeagueMemo(() => systemReport(league, league.userTid, start.tactics), [league, start]);
  const sig = tacticsSig(t);
  const report = useMemo(() => (changed ? systemReport(league, league.userTid, t, base.others) : base), [changed, sig, base, league]); // eslint-disable-line react-hooks/exhaustive-deps
  const moved = changed ? gradeChanges(base, report) : [];

  return (
    <>
      {/* the hero: the plan in use (its slot, its style, how well it's known, its strengths and weaknesses, who runs it) */}
      <fieldset className="tx-fieldset" disabled={simming}>
        <TacticsHero report={report} was={base} fam={sys.overall} onAnalysis={(v) => setParams({ tab: 'analysis', view: v === 'report' ? null : v })} compact={tab !== 'tactic'} />
      </fieldset>
      <GuideStrip step="playbook" keep="Keep this playbook" />
      <AssistantCards league={league} areas={['tactics']} max={2} />
      {/* the sections: one row of chips */}
      <div className="tx-tabs" role="group" aria-label="Tactics sections">
        {TABS.map((x) => (
          <button key={x.id} className={`chip ${tab === x.id ? 'on' : ''}`} aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
            {x.label}
          </button>
        ))}
      </div>

      <fieldset className="tx-fieldset" disabled={simming}>
        {tab === 'tactic' && <TacticTab players={players} side={side} setSide={setSide} />}
        {tab === 'instructions' && <InstructionsTab t={t} players={players} sys={sys} phase={phase} setPhase={setPhase} />}
        {tab === 'match' && <MatchTab t={t} players={players} />}
        {tab === 'analysis' && <AnalysisTab view={view} setView={setView} report={report} was={changed ? base : undefined} sys={sys} players={players} />}
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
          {/* Done: the staff measures the change over the next games (editWatch) */}
          <button
            className="btn sm primary"
            aria-label="Done: keep the changes"
            onClick={() => {
              settleEdits();
              setStart(visitStart(league));
            }}
          >
            <Check size={16} /> Done
          </button>
        </div>
      )}
      {!changed && !simming && <EditMeasureBar />}
    </>
  );
}
