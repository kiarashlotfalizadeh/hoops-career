import { useState } from 'react';
import { ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DefScheme, PressMode, SituationalPlan, SituationTrigger, Tactics, TacticsPatch } from '../../core/types';
import { ACTIONS } from '../../core/types';
import {
  ACTION_META,
  COVERAGE_META,
  MAX_SITUATIONS,
  PRESS_META,
  SCHEME_META,
  SITUATION_TEMPLATES,
  situationFromTemplate,
  situationText,
  type SituationTemplate,
} from '../../core/sim/tactics';
import { Chips, Help, Section, Sheet, Slider, Toggle } from '../components/ui';
import '../screens/tactics.css';

type Edit = (fn: (t: Tactics) => void) => void;

const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}`;

const NUDGE_LABEL: Record<string, string> = {
  pace: 'Pace',
  transition: 'Transition',
  threePoint: 'Threes',
  rimAttack: 'Rim attack',
  crashBoards: 'Crash glass',
  help: 'Help',
  pressure: 'Pressure',
  getBack: 'Get back',
  physicality: 'Physicality',
};

/** What a plan changes, in a few words: "Pace −25 · Get back +20 · 3-2 Zone". */
export function patchText(p: TacticsPatch): string {
  const out = patchParts(p);
  return out.length ? out.join(' · ') : 'No changes yet';
}

function patchParts(p: TacticsPatch): string[] {
  const out: string[] = [];
  const { actions, ...off } = p.offense ?? {};
  if (off.huntMismatch) out.push('Hunt mismatches');
  for (const [k, v] of Object.entries(off)) if (typeof v === 'number' && NUDGE_LABEL[k]) out.push(`${NUDGE_LABEL[k]} ${v}`);
  for (const [k, v] of Object.entries(actions ?? {})) out.push(`${ACTION_META[k as keyof typeof ACTION_META].label} ${v}`);
  const d = p.defense ?? {};
  if (d.scheme) out.push(SCHEME_META[d.scheme].label);
  if (d.pnr) out.push(COVERAGE_META[d.pnr].label);
  if (d.press) out.push(d.press === 'none' ? 'No press' : `Press ${PRESS_META[d.press].label.toLowerCase()}`);
  for (const [k, v] of Object.entries(d)) if (typeof v === 'number' && NUDGE_LABEL[k]) out.push(`${NUDGE_LABEL[k]} ${v}`);
  const n = p.nudge ?? {};
  for (const [k, v] of [...Object.entries(n.offense ?? {}), ...Object.entries(n.defense ?? {})]) if (v) out.push(`${NUDGE_LABEL[k] ?? k} ${signed(v)}`);
  for (const [k, v] of Object.entries(n.actions ?? {})) if (v) out.push(`${ACTION_META[k as keyof typeof ACTION_META].label} ${signed(v)}`);
  return out;
}

/** The plan editor's own controls: six relative sliders, the base scheme and the press. */
const EDITOR_NUDGES = { offense: ['pace', 'threePoint', 'crashBoards'], defense: ['pressure', 'help', 'getBack'] } as const;

/** A plan's changes the editor has no control for (a template's extras, kept as they are). */
function extraPatch(p: TacticsPatch): TacticsPatch {
  const defense = { ...p.defense };
  delete defense.scheme;
  delete defense.press;
  const nudge = { ...p.nudge, offense: { ...p.nudge?.offense }, defense: { ...p.nudge?.defense } };
  for (const k of EDITOR_NUDGES.offense) delete nudge.offense[k];
  for (const k of EDITOR_NUDGES.defense) delete nudge.defense[k];
  return { ...p, defense, nudge };
}

const plans = (t: Tactics) => t.situations ?? [];

/** Game Mgmt's situational plans, with their triggers and what each one changes. */
export function SituationsCard({ t, edit }: { t: Tactics; edit: Edit }) {
  const [editing, setEditing] = useState<string | null>(null);
  const list = plans(t);
  const full = list.length >= MAX_SITUATIONS;
  const open = list.find((s) => s.id === editing) ?? null;
  const change = (id: string, fn: (s: SituationalPlan) => void) =>
    edit((tt) => {
      const s = tt.situations?.find((x) => x.id === id);
      if (s) fn(s);
    });
  const add = (key: SituationTemplate | 'custom') => {
    if (full) return;
    let s: SituationalPlan;
    if (key === 'custom') {
      let n = 1;
      while (list.some((x) => x.id === `custom-${n}`)) n++;
      s = { id: `custom-${n}`, label: `Custom plan ${n}`, enabled: true, when: { fromQ: 4 }, patch: {} };
      // a custom plan starts empty: straight to its editor
      setEditing(s.id);
    } else s = situationFromTemplate(key, list);
    edit((tt) => void (tt.situations = [...plans(tt), s]));
  };
  const remove = (id: string) =>
    edit((tt) => {
      tt.situations = plans(tt).filter((x) => x.id !== id);
      if (!tt.situations.length) delete tt.situations;
    });
  const moveUp = (i: number) =>
    edit((tt) => {
      const cur = [...plans(tt)];
      [cur[i - 1], cur[i]] = [cur[i], cur[i - 1]];
      tt.situations = cur;
    });
  const openAt = open ? list.indexOf(open) : -1;
  const close = () => {
    // a name cleared while typing comes back as "Plan"
    if (open && !open.label.trim()) change(open.id, (p) => void (p.label = 'Plan'));
    setEditing(null);
  };
  return (
    <Section
      title="Situations"
      right={
        <div className="row tx-sec-r">
          <span className="tiny dim num">
            {list.length}/{MAX_SITUATIONS}
          </span>
          <Help title="Situational plans">
            <p>
              Each plan changes your tactics while its situation lasts: a quarter, the time left, the score, or your second unit on the floor. The first enabled plan that matches
              applies (top to bottom), and your tactics come back when it ends.
            </p>
            <p>Changes like &quot;Pace −25&quot; build on whatever playbook you run. Up to {MAX_SITUATIONS} plans.</p>
            {(Object.keys(SITUATION_TEMPLATES) as SituationTemplate[]).map((k) => (
              <p key={k}>
                <b>{SITUATION_TEMPLATES[k].label}:</b> {SITUATION_TEMPLATES[k].help}
              </p>
            ))}
          </Help>
        </div>
      }
    >
      <div className="card flush">
        {list.length === 0 ? (
          <div className="tx-empty">No plans: your tactics stay the same all game.</div>
        ) : (
          <div className="list">
            {list.map((s) => (
              <div key={s.id} className="tx-sit">
                <button className="tx-sit-edit" aria-label={`Edit ${s.label}`} aria-haspopup="dialog" onClick={() => setEditing(s.id)}>
                  <span className="lr-name">
                    {s.label} <Pencil size={13} className="dim" aria-hidden="true" />
                  </span>
                  <span className="lr-meta">{situationText(s.when)}</span>
                  <span className="tx-sit-then">{patchText(s.patch)}</span>
                </button>
                <button
                  className={`toggle ${s.enabled ? 'on' : ''}`}
                  role="switch"
                  aria-checked={s.enabled}
                  aria-label={s.label}
                  onClick={() => change(s.id, (p) => void (p.enabled = !s.enabled))}
                />
              </div>
            ))}
          </div>
        )}
        <div className="tx-add">
          <div className="over">Add a plan{full && ` (up to ${MAX_SITUATIONS})`}</div>
          <div className="chips" role="group" aria-label="Add a situational plan">
            {(Object.keys(SITUATION_TEMPLATES) as SituationTemplate[]).map((k) => (
              <button key={k} className="chip" disabled={full} onClick={() => add(k)}>
                <Plus size={14} /> {SITUATION_TEMPLATES[k].label}
              </button>
            ))}
            <button className="chip" disabled={full} onClick={() => add('custom')}>
              <Plus size={14} /> Custom
            </button>
          </div>
        </div>
      </div>
      <Sheet open={!!open} onClose={close} title={open ? `Plan: ${open.label || 'Plan'}` : 'Plan'}>
        {open && <SituationEditor s={open} change={(fn) => change(open.id, fn)} />}
        {open && (
          <div className="row tx-btns tx-sheet-foot">
            {openAt > 0 && (
              <button className="btn grow" aria-label={`Move ${open.label} up`} onClick={() => moveUp(openAt)}>
                <ArrowUp size={16} /> Move up
              </button>
            )}
            <button
              className="btn danger grow"
              aria-label={`Remove ${open.label}`}
              onClick={() => {
                remove(open.id);
                setEditing(null);
              }}
            >
              <Trash2 size={16} /> Remove
            </button>
          </div>
        )}
      </Sheet>
    </Section>
  );
}

const ANY_LO = -31;
const ANY_HI = 31;

/** Sets or clears a relative change in a plan's patch. */
function setNudge(p: TacticsPatch, group: 'offense' | 'defense', key: string, v: number) {
  const n = (p.nudge ??= {});
  const g = ((n as Record<string, Record<string, number> | undefined>)[group] ??= {});
  if (v) g[key] = v;
  else delete g[key];
  if (!Object.keys(g).length) delete (n as Record<string, unknown>)[group];
  if (!Object.keys(n).length) delete p.nudge;
}

function setWhen<K extends keyof SituationTrigger>(s: SituationalPlan, k: K, v: SituationTrigger[K] | undefined) {
  if (v === undefined) delete s.when[k];
  else s.when[k] = v;
}

function SituationEditor({ s, change }: { s: SituationalPlan; change: (fn: (s: SituationalPlan) => void) => void }) {
  const w = s.when;
  const nudge = (group: 'offense' | 'defense', key: string) => (s.patch.nudge?.[group] as Record<string, number> | undefined)?.[key] ?? 0;
  const q = (x: number) => (x >= 4 ? 'Q4 & OT' : `Q${x}`);
  const nudgeSlider = (group: 'offense' | 'defense', key: string, label: string, help?: string) => (
    <Slider
      label={label}
      value={nudge(group, key)}
      min={-40}
      max={40}
      step={5}
      onChange={(v) => change((p) => setNudge(p.patch, group, key, v))}
      format={(v) => (v ? signed(v) : 'No change')}
      help={help}
    />
  );
  const lead = (v: number | undefined, any: number) => (v === undefined ? any : v);
  // only what the controls above don't show
  const extras = patchParts(extraPatch(s.patch));
  return (
    <div className="col tx-editor">
      <label className="col tx-field">
        <span className="over">Name</span>
        <input
          className="input"
          value={s.label}
          maxLength={30}
          onChange={(e) => change((p) => void (p.label = e.target.value))}
          onBlur={() => !s.label.trim() && change((p) => void (p.label = 'Plan'))}
        />
      </label>
      <div className="tx-sub">
        <div className="over">When</div>
        <div className="tx-when">{situationText(w)}</div>
      </div>
      {/* the quarters and the leads move together, so a plan can't be set to a situation that never comes */}
      <div className="card col tx-group">
        <Slider
          label="From"
          value={w.fromQ ?? 1}
          min={1}
          max={4}
          onChange={(v) =>
            change((p) => {
              setWhen(p, 'fromQ', v > 1 ? v : undefined);
              if (v > (p.when.untilQ ?? 4)) setWhen(p, 'untilQ', v < 4 ? v : undefined);
            })
          }
          format={q}
        />
        <Slider
          label="Until"
          value={w.untilQ ?? 4}
          min={1}
          max={4}
          onChange={(v) =>
            change((p) => {
              setWhen(p, 'untilQ', v < 4 ? v : undefined);
              if (v < (p.when.fromQ ?? 1)) setWhen(p, 'fromQ', v > 1 ? v : undefined);
            })
          }
          format={q}
        />
        <Slider
          label="Time left in the period"
          value={w.maxClock ?? 720}
          min={15}
          max={720}
          step={15}
          onChange={(v) => change((p) => setWhen(p, 'maxClock', v < 720 ? v : undefined))}
          format={(v) => (v >= 720 ? 'Any time' : `Last ${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`)}
        />
        <Slider
          label="Our lead at least"
          value={lead(w.minLead, ANY_LO)}
          min={ANY_LO}
          max={30}
          onChange={(v) =>
            change((p) => {
              setWhen(p, 'minLead', v > ANY_LO ? v : undefined);
              if (p.when.maxLead !== undefined && v > p.when.maxLead) setWhen(p, 'maxLead', v < ANY_HI ? v : undefined);
            })
          }
          format={(v) => (v <= ANY_LO ? 'Any' : signed(v))}
          help="Negative: trailing by at most that much."
        />
        <Slider
          label="Our lead at most"
          value={lead(w.maxLead, ANY_HI)}
          min={-30}
          max={ANY_HI}
          onChange={(v) =>
            change((p) => {
              setWhen(p, 'maxLead', v < ANY_HI ? v : undefined);
              if (p.when.minLead !== undefined && v < p.when.minLead) setWhen(p, 'minLead', v > ANY_LO ? v : undefined);
            })
          }
          format={(v) => (v >= ANY_HI ? 'Any' : signed(v))}
          help="Negative: trailing by at least that much."
        />
        <Toggle
          on={!!w.benchUnit}
          onChange={(x) => change((p) => setWhen(p, 'benchUnit', x || undefined))}
          label="Only with the second unit"
          help="Three or more reserves on the floor."
        />
      </div>
      <div className="tx-sub">
        <div className="over">Then</div>
        <div className="tx-when">{patchText(s.patch)}</div>
      </div>
      <div className="card col tx-group">
        {nudgeSlider('offense', 'pace', 'Pace')}
        {nudgeSlider('offense', 'threePoint', 'Three-point emphasis')}
        {nudgeSlider('offense', 'crashBoards', 'Crash the offensive glass')}
        {nudgeSlider('defense', 'pressure', 'Ball pressure')}
        {nudgeSlider('defense', 'help', 'Help defense')}
        {nudgeSlider('defense', 'getBack', 'Transition defense')}
        <div className="tx-ctl-chips">
          <div className="slider-label">Base scheme</div>
          <Chips
            label="Base scheme"
            value={s.patch.defense?.scheme ?? 'keep'}
            onChange={(x: DefScheme | 'keep') =>
              change((p) => {
                const d = { ...p.patch.defense };
                if (x === 'keep') delete d.scheme;
                else d.scheme = x;
                p.patch.defense = d;
                if (!Object.keys(d).length) delete p.patch.defense;
              })
            }
            options={[{ id: 'keep' as const, label: 'Keep' }, ...(Object.keys(SCHEME_META) as DefScheme[]).map((k) => ({ id: k, label: SCHEME_META[k].label }))]}
          />
        </div>
        <div className="tx-ctl-chips">
          <div className="slider-label">Full-court press</div>
          <Chips
            label="Full-court press"
            value={s.patch.defense?.press ?? 'keep'}
            onChange={(x: PressMode | 'keep') =>
              change((p) => {
                const d = { ...p.patch.defense };
                if (x === 'keep') delete d.press;
                else d.press = x;
                p.patch.defense = d;
                if (!Object.keys(d).length) delete p.patch.defense;
              })
            }
            options={[{ id: 'keep' as const, label: 'Keep' }, ...(Object.keys(PRESS_META) as PressMode[]).map((k) => ({ id: k, label: PRESS_META[k].label }))]}
          />
        </div>
        {extras.length > 0 && <div className="small dim">Also in this plan: {extras.join(' · ')}.</div>}
        {ACTIONS.some((a) => s.patch.nudge?.actions?.[a]) && <div className="tiny dim">Action changes come from the template and stay as they are.</div>}
      </div>
    </div>
  );
}
