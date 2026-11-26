// Team → Tactics, two sections with their own paths under the hub's tabs, one boxed switch: System
// (/team/tactics: the style card, the board with your five and their roles, Team Instructions (the
// one surface for how the team plays, in three phases, opened from the board), the staff's word, the
// grades, the bench, and one Advanced drawer with the game's management) and Season Analysis (/team/tactics/analysis: what your changes measured, the season's
// tally, how teams see you, every grade), each built from modules in src/ui/tactics. Nothing here
// names an opponent: that is the matchup page's Game Plan. Advice in core links here by the old
// ?tab= ids and section paths, which open the section that now holds them. The plan's strengths and
// weaknesses move as you change a setting, so every lever shows what it buys and what it costs. Edits
// save as they're made; while this visit has any, a compact dock says what they did to the grades and
// offers Undo and Done (which hands the Continue bar back, and has the staff measure the change over
// the next games: tactics/editWatch.ts).
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
import { InstructionsCard } from '../tactics/instructions/InstructionsCard';
import { TeamInstructions, type Phase } from '../tactics/instructions/TeamInstructions';
import { Advanced } from '../tactics/Advanced';
import { AnalysisTab } from '../tactics/AnalysisTab';
import { settleEdits } from '../tactics/editWatch';
import type { BoardSide } from '../tactics/Board';
import './tactics.css';

type Tab = 'system' | 'analysis';

const TABS: { id: Tab; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'analysis', label: 'Season Analysis' },
];

/** The old ?tab= ids advice and search still link by: everything but the analysis is the System. */
const OLD_ANALYSIS = ['insights', 'report', 'familiarity', 'analysis'];
/** A section's path. */
export const tacticsPath = (tab: Tab) => (tab === 'system' ? '/team/tactics' : '/team/tactics/analysis');

/** A link by an old ?tab= id: the section's path, its other params kept. */
function OldLink({ raw, search }: { raw: string; search: string }) {
  const q = new URLSearchParams(search);
  for (const k of ['tab', 'phase', 'view']) q.delete(k);
  const qs = q.toString();
  return <Navigate to={`${tacticsPath(OLD_ANALYSIS.includes(raw) ? 'analysis' : 'system')}${qs ? `?${qs}` : ''}`} replace />;
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
  const tab: Tab = sub === 'analysis' ? 'analysis' : 'system';
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
  // Team Instructions, open on a phase (over the board)
  const [phase, setPhase] = useState<Phase | null>(null);
  // this visit's changes: what they did to the grades, Undo, and Done (the change is noted for its check on played games: editWatch)
  const changes = (
    <>
      <span className="grow tx-dock-l">
        {moved.length ? (
          moved.slice(0, 2).map((m) => (
            <span key={`${m.id}${m.to}`} className={`tx-dock-m m-tick-up ${m.up ? 'good' : 'bad'}`}>
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
      <button
        className="btn sm primary"
        aria-label="Done: keep the changes"
        onClick={() => {
          settleEdits();
          setStart(visitStart(league));
          setPhase(null);
        }}
      >
        <Check size={16} /> Done
      </button>
    </>
  );

  return (
    <>
      {/* the sections: the one boxed switch under the hub's tabs, each its own path */}
      <Segmented value={tab} options={TABS} onChange={(x) => nav(tacticsPath(x), { replace: true })} label="Tactics sections" />
      <fieldset className="tx-fieldset" disabled={simming}>
        {/* the style in use; on System, who runs it */}
        <TacticsHero manage={tab === 'system'} />
        {tab === 'system' && (
          <>
            {/* the first-hour guide up top, under the playbook it asks about (below the board it sat under the fold) */}
            <GuideStrip step="playbook" keep="Keep this playbook" />
            <TacticTab players={players} side={side} setSide={setSide} onInstructions={setPhase}>
              <InstructionsCard t={t} onOpen={setPhase} />
              {/* the staff's advice */}
              <AssistantCards league={league} areas={['tactics']} max={2} />
              <StrengthsCard report={report} was={base} onAnalysis={() => nav(tacticsPath('analysis'), { replace: true })} />
            </TacticTab>
            <Advanced t={t} players={players} />
          </>
        )}
        {tab === 'analysis' && <AnalysisTab report={report} was={changed ? base : undefined} />}
      </fieldset>

      <TeamInstructions
        phase={simming ? null : phase}
        setPhase={setPhase}
        onClose={() => setPhase(null)}
        t={t}
        players={players}
        dock={
          changed && (
            <div className="ti-dock" role="region" aria-label="Your changes">
              {changes}
            </div>
          )
        }
      />
      {changed && !simming && (
        <div className="dockbar tx-dock" role="region" aria-label="Your changes">
          {changes}
        </div>
      )}
    </>
  );
}
