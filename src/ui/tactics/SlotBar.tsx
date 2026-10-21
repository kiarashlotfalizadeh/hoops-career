// The Tactics hero's tactic switch, as Football Manager keeps it: your three tactics (A, B and C) as
// one row of pills (how well the team knows each is in its sheet). A tap opens its sheet: make it the active
// one (what every game plays), rename it, overwrite or clear it; an empty one offers a copy of the
// current tactic or a fresh style. Then the mentality: a dial from very cautious to very aggressive, played on top of every
// setting.
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { edit } from '../../state/actions';
import type { League, Mentality, Tactics } from '../../core/types';
import { SLOT_COUNT, SLOT_LETTERS, activeSlot, clearSlot, copyToSlot, renameSlot, slotName, slotTactics, switchSlot } from '../../core/sim/slots';
import { MENTALITY_META } from '../../core/sim/tactics';
import { playbookLabel } from '../../core/sim/playbooks';
import { systemFamiliarity } from '../../core/league/practice';
import { Help, Levels, Section, Sheet } from '../components/ui';
import { Term } from '../components/Glossary';
import { PresetPicker } from './PresetPicker';
import { famTone } from './formation';
import { tweak } from './edit';

/** Make slot `i` the team's tactic: the coach's call (the assistant stops refitting it). */
const switchTo = (i: number) =>
  edit((l) => {
    const tm = l.teams[l.userTid];
    if (switchSlot(tm, i)) tm.tactics.manual = true;
  });

interface SlotInfo {
  i: number;
  name: string;
  t: Tactics | null;
  fam: number | null;
}

function slotsOf(league: League): SlotInfo[] {
  const team = league.teams[league.userTid];
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = slotTactics(team, i);
    return { i, name: slotName(team, i), t, fam: t ? systemFamiliarity(league, league.userTid, t).overall : null };
  });
}

export function SlotBar() {
  const league = useLeague();
  const team = league.teams[league.userTid];
  const slots = useLeagueMemo(() => slotsOf(league), [league]);
  const active = activeSlot(team);
  const [menu, setMenu] = useState<number | null>(null);
  const [style, setStyle] = useState(false);
  const open = menu !== null ? slots[menu] : null;
  return (
    <>
      {/* the three as one row of pills; a tap opens its sheet (with how well the team knows it)
          (make it the active one, start, overwrite, rename or clear it) */}
      <div className="tx-slots" role="group" aria-label="Your tactics">
        {slots.map((s) => {
          const on = s.i === active;
          return (
            <button
              key={s.i}
              className={`tx-slot${on ? ' on' : ''}${s.t ? '' : ' vacant'}`}
              aria-current={on ? 'true' : undefined}
              aria-haspopup="dialog"
              aria-label={`Tactic ${SLOT_LETTERS[s.i]}, ${s.name}${on ? ', active' : ''}${s.t && s.fam !== null ? `, ${Math.round(s.fam)}% familiar` : ', empty: set up'}`}
              onClick={() => setMenu(s.i)}
            >
              <span className="tx-slot-l" aria-hidden="true">
                {SLOT_LETTERS[s.i]}
              </span>
              <span className="tx-slot-n ellipsis" aria-hidden="true">
                {s.t ? s.name : 'Set up'}
              </span>
              {!s.t && <Plus size={14} className="tx-slot-plus" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <Sheet open={!!open} onClose={() => setMenu(null)} title={open ? `Tactic ${SLOT_LETTERS[open.i]}` : 'Tactic'}>
        {open && (
          <SlotMenu
            key={open.i}
            s={open}
            active={open.i === active}
            onClose={() => setMenu(null)}
            onStyle={() => {
              setMenu(null);
              setStyle(true);
            }}
          />
        )}
      </Sheet>
      <StyleSheet open={style} onClose={() => setStyle(false)} />
    </>
  );
}

function SlotMenu({ s, active, onClose, onStyle }: { s: SlotInfo; active: boolean; onClose: () => void; onStyle: () => void }) {
  const [name, setName] = useState(s.name);
  // the name is kept as the sheet closes, whichever way it closes (a commit on blur would eat the tap that blurred it)
  const latest = useRef(name);
  latest.current = name;
  useEffect(
    () => () => {
      const n = latest.current;
      if (n.trim() && n.trim() !== s.name) edit((l) => renameSlot(l.teams[l.userTid], s.i, n));
    },
    [s.i, s.name],
  );
  return (
    <div className="col tx-confirm">
      <label className="col tx-field">
        <span className="over">Name</span>
        <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onClose()} />
      </label>
      {s.t ? (
        <div className="tx-note">
          {active ? 'Your active tactic: what every game plays.' : 'Practice drills it too, a little less than the active one.'} {playbookLabel(s.t)}
          {s.fam !== null && (
            <>
              {' '}
              · <b className={famTone(s.fam)}>{Math.round(s.fam)}%</b> familiar
            </>
          )}
        </div>
      ) : (
        <div className="tx-note">
          Empty. Start it from your current tactic, or from a style; then switch to it here or in a situational plan (Match). See <Term id="slots">tactic slots</Term>.
        </div>
      )}
      <div className="col tx-btns">
        {!s.t && (
          <>
            <button
              className="btn primary block"
              onClick={() => {
                edit((l) => void copyToSlot(l.teams[l.userTid], s.i));
                onClose();
              }}
            >
              Copy the current tactic
            </button>
            <button
              className="btn block"
              onClick={() => {
                switchTo(s.i);
                onStyle();
              }}
            >
              Start from a style
            </button>
          </>
        )}
        {s.t && !active && (
          <>
            <button
              className="btn primary block"
              onClick={() => {
                switchTo(s.i);
                onClose();
              }}
            >
              Make it the active tactic
            </button>
            <button
              className="btn block"
              onClick={() => {
                edit((l) => void copyToSlot(l.teams[l.userTid], s.i));
                onClose();
              }}
            >
              Overwrite with the current tactic
            </button>
            <button
              className="btn danger block"
              onClick={() => {
                edit((l) => void clearSlot(l.teams[l.userTid], s.i));
                onClose();
              }}
            >
              Clear it
            </button>
          </>
        )}
        {active && (
          <button
            className="btn block"
            onClick={() => {
              onClose();
            }}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

/** FM's tactical style picker: an offensive playbook and a defensive identity, each with its fit for this roster. */
export function StyleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Pick a style">
      <div className="col tx-style">
        <Section title="Offensive playbook">
          <PresetPicker kind="off" />
        </Section>
        <Section title="Defensive identity">
          <PresetPicker kind="def" />
        </Section>
        <button className="btn block" onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

/** The mentality dial: five steps from very cautious to very aggressive, nudging every setting. */
export function MentalityDial({ t }: { t: Tactics }) {
  const m = t.mentality ?? 0;
  const names = ([-2, -1, 0, 1, 2] as const).map((x) => MENTALITY_META[x].label) as unknown as readonly [string, string, string, string, string];
  return (
    <div className="tx-mentality">
      <Levels
        label="Mentality"
        value={(m + 2) * 25}
        names={names}
        mark={50}
        onChange={(x) =>
          tweak((tt) => {
            const v = Math.round(x / 25 - 2) as Mentality;
            if (v) tt.mentality = v;
            else delete tt.mentality;
          })
        }
        help={MENTALITY_META[m].help}
      />
      <Help title="Mentality">
        <p>
          How much risk your team plays with, on top of every setting: aggressive pushes the pace, crashes the glass and gets into the ball; cautious takes care of the ball and
          gets back. It costs no <Term id="familiarity">familiarity</Term>: your settings stay as drilled.
        </p>
        <p>Situational plans (Match) can change it for a situation: very aggressive when chasing a game late, cautious protecting a lead.</p>
      </Help>
    </div>
  );
}
