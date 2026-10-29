// Team → Tactics, Football Manager's way. Four sections with their own paths under the hub's tabs,
// one boxed switch: Tactic (/team/tactics: the board with your five, the staff's word, the strengths
// and weaknesses, the bench), Instructions (/team/tactics/instructions: the three phases of play),
// Match (/team/tactics/match: crunch time and game management) and Analysis
// (/team/tactics/analysis: the system report and the season), each its own module in src/ui/tactics.
// Over each, one card holds the style in use (tactics/Hero), and on Tactic who runs it; a section's
// own switch (the board's end, the phase, the view) is its heading. Advice in core links here by the
// old ?tab= ids (playbook, roles, players, offense, defense, manage, insights, report, familiarity),
// which open the section that now holds them. The plan's strengths and weaknesses move as you change
// a setting, so every lever shows what it buys and what it costs. Edits save as they're made; while
// this visit has any, a compact dock says what they did to the grades and offers Undo and Done (which
// hands the Continue bar back, and has the staff measure the change over the next games:
// tactics/editWatch.ts).
import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, Undo2 } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { rosterSorted } from '../../core/league/helpers';
import { QUALITY_META, gradeChanges, systemReport } from '../../core/analysis/system';
import { AssistantCards } from '../components/Assistant';
import { GuideStrip } from '../components/GuideStrip';
import { Segmented } from '../components/ui';
import { useQueryParam } from '../league/shared';
import { tacticsSig, undoTo, visitStart } from '../tactics/edit';
import { StrengthsCard, TacticsHero } from '../tactics/Hero';
import { TacticTab } from '../tactics/TacticTab';
import { InstructionsTab } from '../tactics/InstructionsTab';
import { MatchTab } from '../tactics/MatchTab';
import { ANALYSIS_VIEWS, AnalysisTab, type AnalysisView } from '../tactics/AnalysisTab';
import { phaseId, type Phase } from '../tactics/phases';
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
/** A section's path. */
export const tacticsPath = (tab: Tab) => (tab === 'tactic' ? '/team/tactics' : `/team/tactics/${tab}`);

/**
 * A link by the old ?tab= ids: the section's path, its other params kept (an old Defense link opens
 * Instructions out of possession, an old Insights one Analysis at the season).
 */
function OldLink({ raw, search }: { raw: string; search: string }) {
  const q = new URLSearchParams(search);
  q.delete('tab');
  if (raw === 'defense' && !q.has('phase')) q.set('phase', 'outPoss');
  if (raw === 'insights' && !q.has('view')) q.set('view', 'season');
  const tab = (OLD as Record<string, Tab>)[raw] ?? (TABS.some((x) => x.id === raw) ? (raw as Tab) : 'tactic');
  const qs = q.toString();
  return <Navigate to={`${tacticsPath(tab)}${qs ? `?${qs}` : ''}`} replace />;
}

export default function Tactics() {
  const { search } = useLocation();
  const old = new URLSearchParams(search).get('tab');
  if (old !== null) return <OldLink raw={old} search={search} />;
  return <TacticsScreen />;
}

function TacticsScreen() {
  const league = useLeague();
  const nav = useNavigate();
  const { sub } = useParams();
  const tab: Tab = TABS.find((x) => x.id === sub)?.id ?? 'tactic';
  const [rawPhase, setPhase] = useQueryParam<string>('phase', 'inPoss');
  // (an old phase reads as its new one)
  const phase: Phase = phaseId(rawPhase);
  const [view, setView] = useQueryParam<AnalysisView>('view', 'report', ANALYSIS_VIEWS);
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

  // the system report now and as this visit found it (the other teams' systems worked out once)
  const base = useLeagueMemo(() => systemReport(league, league.userTid, start.tactics), [league, start]);
  const sig = tacticsSig(t);
  const report = useMemo(() => (changed ? systemReport(league, league.userTid, t, base.others) : base), [changed, sig, base, league]); // eslint-disable-line react-hooks/exhaustive-deps
  const moved = changed ? gradeChanges(base, report) : [];

  return (
    <>
      {/* the sections: the one boxed switch under the hub's tabs, each its own path */}
      <Segmented value={tab} options={TABS} onChange={(x) => nav(tacticsPath(x), { replace: true })} label="Tactics sections" />
      <fieldset className="tx-fieldset" disabled={simming}>
        {/* the style in use; on Tactic, who runs it */}
        <TacticsHero manage={tab === 'tactic'} />
        {tab === 'tactic' && (
          <TacticTab players={players} side={side} setSide={setSide}>
            {/* the first-hour guide and the staff's advice, under the board (the board leads the page; one home for both) */}
            <GuideStrip step="playbook" keep="Keep this playbook" />
            <AssistantCards league={league} areas={['tactics']} max={2} />
            <StrengthsCard report={report} was={base} onAnalysis={() => nav(tacticsPath('analysis'), { replace: true })} />
          </TacticTab>
        )}
        {tab === 'instructions' && <InstructionsTab t={t} players={players} phase={phase} setPhase={setPhase} />}
        {tab === 'match' && <MatchTab t={t} players={players} />}
        {tab === 'analysis' && <AnalysisTab view={view} setView={setView} report={report} was={changed ? base : undefined} />}
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
