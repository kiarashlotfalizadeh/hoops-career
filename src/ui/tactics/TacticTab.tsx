// Tactics → Tactic, where the screen opens: the tactics board (your five where the shape and the
// scheme put them, each with his role, how he suits it and how well he knows it, the formation picker
// with each choice's fit and familiarity), the mentality, the assistant's switch, the style (the
// offensive playbook and defensive identity, each with its fit for this roster) and your saved
// playbooks.
import { useState } from 'react';
import { edit } from '../../state/actions';
import { useLeague } from '../../state/store';
import { autoTactics } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { playbookLabel } from '../../core/sim/playbooks';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';
import type { Player } from '../../core/types';
import { Help, Section, Toggle } from '../components/ui';
import { Term } from '../components/Glossary';
import { MyPlaybooksCard } from './MyPlaybooks';
import { Board, type BoardSide } from './Board';
import { MentalityDial, StyleSheet } from './SlotBar';
import { useFam } from './useFam';

export function TacticTab({ players, side, setSide }: { players: Player[]; side: BoardSide; setSide: (s: BoardSide) => void }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const fam = useFam();
  const [style, setStyle] = useState(false);
  const off = OFF_PRESETS.find((p) => p.id === t.offPreset);
  const def = DEF_PRESETS.find((p) => p.id === t.defPreset);
  return (
    <div className="tx-tactic">
      <div className="tx-tactic-head">
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
            help={!t.manual ? 'He refits the playbook, shape and roles as the roster changes. Your next edit takes over.' : 'You call it. Turn on to hand back the clipboard.'}
          />
        </div>
        <MentalityDial t={t} />
      </div>
      <div className="tx-tactic-main">
        <Board t={t} players={players} fam={fam} side={side} setSide={setSide} />
      </div>
      <div className="tx-tactic-side">
        <Section
          title="Style"
          right={
            <Help title="Style">
              <p>
                Your offensive playbook (pace, shot profile and the actions you run) and defensive identity (scheme, coverage, help, pressure and press). Pick one to load its
                settings, then fine-tune any of them on Instructions.
              </p>
              <p>
                <Term id="fit">Fit</Term> scores how well your roster suits each (100 your best fit of them, 45 your worst). A new style costs{' '}
                <Term id="familiarity">familiarity</Term> until it&apos;s drilled.
              </p>
            </Help>
          }
        >
          <button className="card tx-stylebtn" aria-haspopup="dialog" onClick={() => setStyle(true)}>
            <span className="grow">
              <span className="tx-style-row">
                <span className="over">Offense</span> {off?.name ?? 'Custom'}
              </span>
              <span className="tx-style-row">
                <span className="over">Defense</span> {def?.name ?? 'Custom'}
              </span>
              {t.manual && t.playbook && <span className="tx-note">From My playbooks: {t.playbook.name}</span>}
            </span>
            <span className="btn sm">Change</span>
          </button>
          <span className="sr-only">Running {playbookLabel(t)}</span>
        </Section>
        <MyPlaybooksCard />
      </div>
      <StyleSheet open={style} onClose={() => setStyle(false)} />
    </div>
  );
}
