// Team → Tactics' hero: the plan in use, all in one group. Your three tactics as a row of pills
// (each with how well the team knows it), the style the active one runs (its offensive playbook as
// the headline, the defensive identity under it, a tap from the picker), the grades the open tab's
// levers move as a compact strip, and the assistant's switch.
import { useState } from 'react';
import { edit } from '../../state/actions';
import { useLeague } from '../../state/store';
import { autoTactics } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { playbookLabel } from '../../core/sim/playbooks';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';
import type { SystemReport } from '../../core/analysis/system';
import { Help, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { SlotBar, StyleSheet } from './SlotBar';
import { GradeStrip } from './SystemReport';

export function TacticsHero({ report, was, end }: { report: SystemReport; was: SystemReport; end: 'off' | 'def' | 'both' | null }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const [style, setStyle] = useState(false);
  const off = OFF_PRESETS.find((p) => p.id === t.offPreset);
  const def = DEF_PRESETS.find((p) => p.id === t.defPreset);
  return (
    <section className="card tx-hero" aria-label="Your tactic">
      <SlotBar />
      <div className="tx-hero-style">
        <button className="tx-hero-pick" aria-haspopup="dialog" onClick={() => setStyle(true)}>
          <span className="grow">
            <span className="tx-hero-off">{off?.name ?? 'Custom offense'}</span>
            <span className="tx-hero-def">
              {def?.name ?? 'Custom'} on defense
              {t.manual && t.playbook ? ` · from ${t.playbook.name}` : ''}
            </span>
          </span>
          <span className="sr-only">Running {playbookLabel(t)}.</span>
          <span className="btn sm">Change</span>
        </button>
        <span className="tx-hero-r">
          <Help title="Style">
            <p>
              Your offensive playbook (pace, shot profile and the actions you run) and defensive identity (scheme, coverage, help, pressure and press). Pick one to load its
              settings, then fine-tune any of them on Instructions.
            </p>
            <p>
              <Term id="fit">Fit</Term> scores how well your roster suits each (100 your best fit of them, 45 your worst). A new style costs{' '}
              <Term id="familiarity">familiarity</Term> until it&apos;s drilled: each one you don&apos;t run says how well your team knows it.
            </p>
            <p>
              The grades under it are your system against the league&apos;s, for what the open tab&apos;s settings move; the Report tab has all of them and what each is made of.
            </p>
          </Help>
        </span>
      </div>
      {end && <GradeStrip report={report} was={was} end={end} />}
      {/* the assistant's switch sits with what he runs (any edit on any tab turns it off) */}
      <div className="tx-hero-auto">
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
          help={!t.manual ? 'He refits the playbook, shape and roles as the roster changes. Your next edit takes over.' : 'You call it. Turn on to hand back the clipboard.'}
        />
      </div>
      <StyleSheet open={style} onClose={() => setStyle(false)} />
    </section>
  );
}
