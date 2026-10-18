// Tactics → Playbook: what you run now and the assistant's switch (he picks the playbooks while it's
// on), the offensive playbooks and defensive identities with their fit for this roster, and the
// coach's saved playbooks.
import { edit } from '../../state/actions';
import { useLeague } from '../../state/store';
import { autoTactics } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { playbookLabel } from '../../core/sim/playbooks';
import { Help, Section, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { PresetPicker } from './PresetPicker';
import { MyPlaybooksCard } from './MyPlaybooks';

export function PlaybookTab() {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  return (
    <>
      {/* the assistant's switch sits with the playbooks he picks (any edit on any tab turns it off) */}
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
      <Section
        title="Offense"
        right={
          <Help title="Playbooks">
            <p>A playbook sets pace, shot profile and which actions you run. Tap one to run it; ⓘ tells you what it is and who it&apos;s for.</p>
            <p>
              <Term id="fit">Fit</Term> scores how well your current roster suits it: creators, shooters, passers, bigs and athleticism. It ranks the playbooks against each other:
              100 is your best fit of them, 45 your worst; green is 85 and up, red under 60. Tap a fit to see what it is made of.
            </p>
            <p>Fine-tune any playbook on the Offense tab.</p>
          </Help>
        }
      >
        <PresetPicker kind="off" />
      </Section>
      <Section
        title="Defense"
        right={
          <Help title="Defensive identities">
            <p>
              A defensive identity sets your scheme, ball-screen coverage, help, pressure and press. Fit scores how well your roster suits it, on the same scale as the offenses;
              tap a fit to see why.
            </p>
            <p>Fine-tune any of them on the Defense tab.</p>
          </Help>
        }
      >
        <PresetPicker kind="def" />
      </Section>
      <MyPlaybooksCard />
    </>
  );
}
