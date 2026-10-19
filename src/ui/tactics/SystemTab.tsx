// Tactics → System, where the screen opens: what you run and the assistant's switch, the system
// report (your system's grades at both ends against the league's, each a tap from what it's made
// of), your five on the floor by role, what the season says is working and hurting, then the
// playbooks to start from (with their fit for this roster) and your saved ones.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { edit } from '../../state/actions';
import { useLeague, useLeagueMemo } from '../../state/store';
import { autoTactics } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { playbookLabel } from '../../core/sim/playbooks';
import { IMPACT_TEXT, impactSentence } from '../../core/analysis/gameReport';
import type { SystemReport } from '../../core/analysis/system';
import { Help, More, Section, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { seasonImpacts } from '../seasonAnalysis';
import { PresetPicker } from './PresetPicker';
import { MyPlaybooksCard } from './MyPlaybooks';
import { SystemReportCard } from './SystemReport';
import { FloorCard } from './FloorCard';

export function SystemTab({ report, was }: { report: SystemReport; was?: SystemReport }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const { games, effects } = useLeagueMemo(() => seasonImpacts(league), [league]);
  const imps = effects.filter((x) => IMPACT_TEXT[x.key] && x.perGame >= 0.3);
  const helping = imps.filter((x) => x.forUser).slice(0, 2);
  const hurting = imps.filter((x) => !x.forUser).slice(0, 2);
  return (
    <>
      {/* the assistant's switch sits with what he runs (any edit on any tab turns it off) */}
      <div className="tx-auto">
        <Toggle
          on={!t.manual}
          onChange={(on) =>
            edit((l) => {
              const tm = l.teams[l.userTid];
              if (on) {
                tm.tactics = autoTactics({ ...tm, tactics: { ...tm.tactics, manual: false } }, rosterSorted(l, l.userTid), false);
                // his refits make it his playbook, not a saved one
                tm.tactics.playbook = null;
              } else tm.tactics.manual = true;
            })
          }
          label="Let the assistant manage"
          help={!t.manual ? 'He refits the playbook as the roster changes. Your next edit takes over.' : 'You call it. Turn on to hand back the clipboard.'}
        />
        <div className="tx-note">
          Running <b className="dim2">{playbookLabel(t)}</b>
          {t.manual && t.playbook ? ` · from My playbooks: ${t.playbook.name}` : ''}
        </div>
      </div>

      <SystemReportCard report={report} was={was} />
      <FloorCard league={league} />

      {games > 0 && (helping.length > 0 || hurting.length > 0) && (
        <Section
          title="This season"
          right={
            <Link to="/team/tactics?tab=insights" className="tx-link">
              Insights <ChevronRight size={14} aria-hidden="true" />
            </Link>
          }
        >
          <div className="card flush list">
            {[...helping, ...hurting].map((x) => (
              <div key={`${x.key}${x.forUser}`} className="tx-imp">
                <span className={`tx-imp-v num ${x.forUser ? 'good' : 'bad'}`}>
                  {x.forUser ? '+' : '-'}
                  {x.perGame.toFixed(1)}
                </span>
                <span className="grow tx-imp-t">{impactSentence(x.key, x.forUser ? 'your team' : 'the opposition', x.forUser ? 'the opposition' : 'your team')}</span>
              </div>
            ))}
          </div>
          <div className="tiny dim" style={{ marginTop: 4 }}>
            Points a game over {games} game{games === 1 ? '' : 's'}: what your tactics actually won and gave up.
          </div>
        </Section>
      )}

      <Section
        title="Start from a playbook"
        right={
          <Help title="Playbooks">
            <p>A playbook sets pace, shot profile and which actions you run; a defensive identity your scheme, coverage, help, pressure and press. Tap one to run it.</p>
            <p>
              <Term id="fit">Fit</Term> scores how well your roster suits it (100 your best fit of them, 45 your worst). Fine-tune any of them on the Offense and Defense tabs, and
              watch the system report move.
            </p>
          </Help>
        }
      >
        <More label="Offensive playbooks">
          <PresetPicker kind="off" />
        </More>
        <More label="Defensive identities">
          <PresetPicker kind="def" />
        </More>
      </Section>
      <MyPlaybooksCard />
    </>
  );
}
