// God mode's team editor: its name, abbreviation and colours (its mark follows them), front-office
// strategy, money and hype, and its head coach's development and tactics ratings; and every player
// healed and rested at a tap.
import { useState } from 'react';
import { HeartPulse } from 'lucide-react';
import type { League, Team } from '../../core/types';
import { checkTeamEdit, editTeam, healTeam, type TeamEdit } from '../../core/league/godMode';
import { teamPlayers } from '../../core/league/helpers';
import { useLeague, useStore } from '../../state/store';
import { Chips, Sheet, Slider } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { STRATEGY_META } from '../office/common';
import { Field, Foot, applyEdit, useEditBlock } from './common';

interface Form {
  region: string;
  name: string;
  abbrev: string;
  colors: [string, string, string];
  strategy: Team['strategy'];
  /** $M, as typed. */
  cash: string;
  hype: number;
  development: number;
  tactics: number;
}

export const formOf = (t: Team): Form => ({
  region: t.region,
  name: t.name,
  abbrev: t.abbrev,
  colors: [...t.colors],
  strategy: t.strategy,
  cash: (t.cash / 1000).toFixed(1),
  hype: t.hype,
  development: t.coach.development,
  tactics: t.coach.tactics,
});

/**
 * The edit: only what differs from the form as it opened, `base` (not from the team as it is now: a
 * sim running while the sheet is open moves its cash, hype and strategy, and saving mustn't put those back).
 */
export function editOf(base: Form, f: Form): TeamEdit {
  const e: TeamEdit = {};
  if (f.region.trim() !== base.region) e.region = f.region;
  if (f.name.trim() !== base.name) e.name = f.name;
  if (f.abbrev.trim().toUpperCase() !== base.abbrev) e.abbrev = f.abbrev;
  if (f.colors.some((c, i) => c.toLowerCase() !== base.colors[i].toLowerCase())) e.colors = f.colors;
  if (f.strategy !== base.strategy) e.strategy = f.strategy;
  // (shown to $0.1M: an amount left as it was shown keeps the exact balance)
  if (f.cash.trim() !== base.cash) e.cash = f.cash.trim() ? Math.round(Number(f.cash) * 1000) : NaN;
  if (Math.abs(f.hype - base.hype) > 1e-6) e.hype = f.hype;
  const coach = { ...(f.development !== base.development ? { development: f.development } : {}), ...(f.tactics !== base.tactics ? { tactics: f.tactics } : {}) };
  if (Object.keys(coach).length) e.coach = coach;
  return e;
}

/** The editor for one team, in its own sheet; closed when `tid` is null. */
export function TeamEditor({ tid, onClose }: { tid: number | null; onClose: () => void }) {
  const league = useLeague();
  const t = tid !== null ? league.teams[tid] : undefined;
  return (
    <Sheet open={!!t} onClose={onClose} title={t ? `Edit the ${t.name}` : undefined}>
      {t && <Editor key={t.tid} league={league} t={t} onClose={onClose} />}
    </Sheet>
  );
}

const COLOR_NAMES = ['Main color', 'Second color', 'Trim'];

function Editor({ league, t, onClose }: { league: League; t: Team; onClose: () => void }) {
  const [base] = useState(() => formOf(t));
  const [f, setF] = useState(base);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const block = useEditBlock(league);
  const edit = editOf(base, f);
  const errors = checkTeamEdit(league, t.tid, edit);
  const hurt = teamPlayers(league, t.tid).filter((p) => p.injury).length;
  const save = () => {
    if (!applyEdit((l) => editTeam(l, t.tid, edit))) return;
    useStore.getState().toast(`The ${f.name.trim()} are saved.`, 'good');
    onClose();
  };
  const heal = () => {
    let n = 0;
    if (applyEdit((l) => void (n = healTeam(l, t.tid))))
      useStore.getState().toast(n ? `${t.abbrev}: ${n} player${n === 1 ? '' : 's'} healed and rested.` : `${t.abbrev} are healthy and rested.`, 'good');
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="god-preview">
        <TeamLogo tid={t.tid} size={48} abbrev={f.abbrev.trim().toUpperCase() || t.abbrev} colors={f.colors} decorative />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">
            {f.region.trim() || t.region} {f.name.trim() || t.name}
          </div>
          <div className="small dim2">
            {STRATEGY_META[f.strategy].label} · coach {t.coach.name}
          </div>
        </div>
      </div>
      <div className="god-grid">
        <Field label="City">
          <input className="input" value={f.region} maxLength={30} onChange={(e) => set({ region: e.target.value })} />
        </Field>
        <Field label="Name">
          <input className="input" value={f.name} maxLength={30} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Abbreviation">
          <input className="input" value={f.abbrev} maxLength={4} autoCapitalize="characters" onChange={(e) => set({ abbrev: e.target.value.toUpperCase() })} />
        </Field>
        <div className="god-field">
          <span className="tiny dim upper bold">Colors</span>
          <div className="god-colors">
            {f.colors.map((c, i) => (
              <input
                key={i}
                type="color"
                value={c}
                aria-label={COLOR_NAMES[i]}
                onChange={(e) => set({ colors: f.colors.map((x, j) => (j === i ? e.target.value : x)) as Form['colors'] })}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="tiny dim upper bold">Front office</span>
        <Chips
          label="Front office"
          value={f.strategy}
          options={(['contend', 'retool', 'rebuild'] as const).map((id) => ({ id, label: STRATEGY_META[id].label }))}
          onChange={(strategy) => set({ strategy })}
        />
        {t.tid === league.userTid && <span className="tiny dim">AI GMs read it when they trade with you.</span>}
      </div>
      <Field label="Cash ($M)" hint="The bank balance the owner's finances and cash in trades come out of.">
        <input className="input" inputMode="decimal" value={f.cash} onChange={(e) => set({ cash: e.target.value })} />
      </Field>
      <Slider
        label="Hype"
        min={0}
        max={100}
        value={Math.round(f.hype * 100)}
        onChange={(v) => set({ hype: v / 100 })}
        format={(v) => `${v}%`}
        help="Fans' excitement: it fills the arena and sells merchandise."
      />
      <div className="over god-sec">Head coach · {t.coach.name}</div>
      <Slider
        label="Player development"
        min={1}
        max={100}
        value={f.development}
        onChange={(development) => set({ development })}
        help="How much his players improve each summer and in season."
      />
      <Slider
        label="In-game tactics"
        min={1}
        max={100}
        value={f.tactics}
        onChange={(tactics) => set({ tactics })}
        help="How often, and how well, he adjusts during games and reads your sets."
      />
      <button className="btn" disabled={!!block} onClick={heal}>
        <HeartPulse size={17} /> Heal and rest everyone{hurt ? ` (${hurt} hurt)` : ''}
      </button>
      <Foot check={{ errors, warnings: [] }} block={block} onCancel={onClose} onSave={save} dirty={Object.keys(edit).length > 0} />
    </div>
  );
}
