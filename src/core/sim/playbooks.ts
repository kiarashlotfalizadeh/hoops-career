// The names the screens give a team's playbook, which say "Custom" once the sliders leave the preset,
// and every difference between two sets of tactics in the Tactics screen's terms (what the staff's
// measured changes, the edit ledger and the move list say).

import { ACTIONS, type Mentality, type ShotFreedom, type Tactics } from '../types';
import { ROLE_META } from '../ratings';
import {
  ACTION_META,
  COVERAGE_META,
  DEF_PRESETS,
  DEF_ROLE_META,
  GLASS_META,
  MENTALITY_META,
  SHAPE_META,
  OFF_PRESETS,
  PRESS_META,
  SCHEME_META,
  STAR_PLAN_META,
  levelName,
  type DefPreset,
  type LeveledTactic,
  type OffPreset,
} from './tactics';
import { atoLabel } from './sets';

// ---------------------------------------------------------------- preset labels

/** Short preset names, for "Custom Balanced". */
const OFF_SHORT: Record<string, string> = { balanced: 'Balanced', helio: 'Heliocentric', fiveOut: 'Five-Out', hub: 'Hub Big', paceSpace: 'Pace & Space', grind: 'Grit & Grind' };
const DEF_SHORT: Record<string, string> = { drop: 'Drop', switch: 'Switch', blitz: 'Blitz', ice: 'Ice', hedge: 'Hedge', zone: '2-3 Zone', chaos: 'Chaos' };

/** Whether tactics still hold every value a preset sets: false once any of its sliders or switches has moved. */
export function presetMatches(values: object, preset: OffPreset | DefPreset): boolean {
  const cur = values as Record<string, unknown>;
  return Object.entries(preset.values).every(([k, v]) =>
    v !== null && typeof v === 'object' ? Object.entries(v).every(([a, x]) => (cur[k] as Record<string, unknown> | undefined)?.[a] === x) : cur[k] === v,
  );
}

/** The offense as the screens name it: the preset's name, or "Custom Balanced" once its settings have moved. */
export function offenseLabel(t: { offense: object; offPreset: string }): string {
  const p = OFF_PRESETS.find((x) => x.id === t.offPreset);
  if (!p) return 'Custom';
  return presetMatches(t.offense, p) ? p.name : `Custom ${OFF_SHORT[p.id] ?? p.name}`;
}

export function defenseLabel(t: { defense: object; defPreset: string }): string {
  const p = DEF_PRESETS.find((x) => x.id === t.defPreset);
  if (!p) return 'Custom';
  return presetMatches(t.defense, p) ? p.name : `Custom ${DEF_SHORT[p.id] ?? p.name}`;
}

/** "Heliocentric · Custom Drop": a team's offense and defense, for headers and scouting. */
export function playbookLabel(t: { offense: object; defense: object; offPreset: string; defPreset: string }): string {
  return `${offenseLabel(t)} · ${defenseLabel(t)}`;
}

// ---------------------------------------------------------------- what changed

/** The parts of Tactics compared on their own (or not at all). */
const KNOWN = ['offense', 'defense', 'manage', 'offPreset', 'defPreset', 'manual'];

/** One difference between two sets of tactics: "Tempo 62 → 80". Without from/to, "Screeners changed". */
export interface TacticsChange {
  label: string;
  from: string;
  to: string;
}

export const changeText = (c: TacticsChange) => (c.from || c.to ? `${c.label} ${c.from} → ${c.to}` : `${c.label} changed`);

const onOff = (v: unknown) => (v ? 'On' : 'Off');
/** A switch that's on unless switched off (no key: on). */
const onUnlessOff = (v: unknown) => (v === false ? 'Off' : 'On');
/** Settings this module doesn't know by name: switches read On/Off, numbers and words as they are. */
const onOffOr = (v: unknown) => (typeof v === 'boolean' ? onOff(v) : String(v));
const whole = (v: unknown) => String(Math.round(v as number));
/** A 0-100 tactic by the setting the screens show ("Up-tempo"); two values that read as the same setting are told apart by number. */
const LEVEL_FMT = new Set<(v: unknown) => string>();
const level = (k: LeveledTactic) => {
  const f = (v: unknown) => levelName(k, v as number);
  LEVEL_FMT.add(f);
  return f;
};
const ACTION_LEVEL = level('action');
const presetName = (list: { id: string; name: string }[]) => (v: unknown) => list.find((p) => p.id === v)?.name ?? 'Custom';
const FREEDOM_LABEL: Record<ShotFreedom, string> = { [-1]: 'Limited', 0: 'Normal', 1: 'Green light' };

type Field<K> = [K, string, ((v: unknown) => string)?];
const OFFENSE_FIELDS: Field<string>[] = [
  ['pace', 'Tempo', level('pace')],
  ['transition', 'After a stop', level('transition')],
  ['threePoint', 'Shot profile', level('threePoint')],
  ['rimAttack', 'Attack the rim', level('rimAttack')],
  ['crashBoards', 'Crash the offensive glass', level('crashBoards')],
  ['huntMismatch', 'Hunt mismatches', onOff],
  ['hotHand', 'Feed the hot hand', onOff],
];
const DEFENSE_FIELDS: Field<string>[] = [
  ['scheme', 'Scheme', (v) => SCHEME_META[v as keyof typeof SCHEME_META]?.label ?? String(v)],
  ['pnr', 'Ball-screen coverage', (v) => COVERAGE_META[v as keyof typeof COVERAGE_META]?.label ?? String(v)],
  ['switchOffBall', 'Switch off-ball screens', onOff],
  ['help', 'Help defense', level('help')],
  ['pressure', 'Ball pressure', level('pressure')],
  ['physicality', 'Physicality', level('physicality')],
  ['getBack', 'Transition defense', level('getBack')],
  ['press', 'Full-court press', (v) => PRESS_META[v as keyof typeof PRESS_META]?.label ?? String(v)],
  ['starPlan', 'Star plan', (v) => STAR_PLAN_META[v as keyof typeof STAR_PLAN_META]?.label ?? String(v)],
];
const MANAGE_FIELDS: Field<string>[] = [
  ['foulUp3', 'Foul when up 3', onOff],
  ['foulWhenTrailing', 'Foul when trailing late', onOff],
  ['twoForOne', 'Go for 2-for-1', onOff],
  ['garbageTime', 'Rest starters in blowouts', onOff],
  ['hackThreshold', 'Hack-a-player threshold', (v) => (v ? `< ${v}% FT` : 'Off')],
  ['foulToGive', 'Foul to give', onOff],
  ['autoTimeouts', 'Auto timeouts to stop runs', onOff],
  ['timeoutRun', 'Timeout after a run of', (v) => `${v}-0`],
  ['foulTrouble', 'Foul trouble', (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)],
  ['fatigueSub', 'Sub out tired players at', (v) => `${Math.round((v as number) * 100)}% energy`],
  ['ato', 'After-timeout play', (v) => atoLabel(v as string | null, (a) => ACTION_META[a].label)],
  ['assistantAdjusts', 'Assistant adjusts in simmed games', onUnlessOff],
];
/** Parts of the tactics that aren't settings to compare (game by game, or bookkeeping; the go-to player is named below). */
const NOT_COMPARED = new Set([
  'actions',
  'roles',
  'freedom',
  'screeners',
  'matchups',
  'starTarget',
  'chase',
  'playerD',
  'huntTarget',
  'goTo',
  'atoPid',
  'hackTargets',
  'hackFromQ',
  'glass',
  'roles',
  'shape',
  'mentality',
  ...KNOWN,
]);

/** "hackTargets" → "Hack targets", for settings this module doesn't know by name. */
const humanize = (k: string) => {
  const s = k.replace(/([A-Z])/g, ' $1').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const same = (x: unknown, y: unknown) => x === y || JSON.stringify(x) === JSON.stringify(y);

/**
 * Everything that differs between tactics `a` and `b`, in Tactics-screen terms, from `a` to `b`:
 * the playbooks, every setting and switch, game management, roles, shot freedom and screeners.
 * Matchups and the star target are game by game and aren't compared.
 */
export function tacticsChanges(a: Tactics, b: Tactics, nameOf: (pid: number) => string = (pid) => `#${pid}`): TacticsChange[] {
  const out: TacticsChange[] = [];
  const add = (label: string, x: unknown, y: unknown, fmt: (v: unknown) => string = String) => {
    if (same(x, y) || (fmt === onUnlessOff && fmt(x) === fmt(y))) return;
    if (LEVEL_FMT.has(fmt) && typeof x === 'number' && typeof y === 'number' && fmt(x) === fmt(y)) fmt = whole;
    const prim = (v: unknown) => v === undefined || v === null || typeof v !== 'object';
    // (a switch that isn't there is off: the screens delete some when they're turned off)
    const shown = (v: unknown) => (v === undefined && fmt !== onOff && fmt !== onUnlessOff ? '—' : fmt(v));
    out.push(prim(x) && prim(y) ? { label, from: shown(x), to: shown(y) } : { label, from: '', to: '' });
  };
  // known fields in screen order, then any others in that part of the tactics
  const section = (x: Record<string, unknown>, y: Record<string, unknown>, fields: Field<string>[]) => {
    for (const [k, label, fmt] of fields) add(label, x[k], y[k], fmt);
    const known = new Set(fields.map((f) => f[0]));
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (!known.has(k) && !NOT_COMPARED.has(k)) add(humanize(k), x[k], y[k], onOffOr);
  };
  add('Mentality', a.mentality ?? 0, b.mentality ?? 0, (v) => MENTALITY_META[v as Mentality]?.label ?? String(v));
  // (no shape is four-out)
  if ((a.offense.shape ?? 'fourOut') !== (b.offense.shape ?? 'fourOut'))
    out.push({ label: 'Shape', from: SHAPE_META[a.offense.shape ?? 'fourOut'].label, to: SHAPE_META[b.offense.shape ?? 'fourOut'].label });
  add('Offensive playbook', a.offPreset, b.offPreset, presetName(OFF_PRESETS));
  add('Defensive identity', a.defPreset, b.defPreset, presetName(DEF_PRESETS));
  section(a.offense as unknown as Record<string, unknown>, b.offense as unknown as Record<string, unknown>, OFFENSE_FIELDS);
  for (const k of ACTIONS) add(ACTION_META[k].label, a.offense.actions[k], b.offense.actions[k], ACTION_LEVEL);
  section(a.defense as unknown as Record<string, unknown>, b.defense as unknown as Record<string, unknown>, DEFENSE_FIELDS);
  section(a.manage as unknown as Record<string, unknown>, b.manage as unknown as Record<string, unknown>, MANAGE_FIELDS);
  const goTo = (v: number | null | undefined) => (v === null || v === undefined ? 'None' : nameOf(v));
  if ((a.manage.goTo ?? null) !== (b.manage.goTo ?? null)) out.push({ label: 'Go-to player', from: goTo(a.manage.goTo), to: goTo(b.manage.goTo) });
  // the player the after-timeout play is run for (the best fit when none is named)
  const atoFor = (v: number | null | undefined) => (v === null || v === undefined ? 'Best fit' : nameOf(v));
  if ((a.manage.atoPid ?? null) !== (b.manage.atoPid ?? null)) out.push({ label: 'After-timeout play for', from: atoFor(a.manage.atoPid), to: atoFor(b.manage.atoPid) });
  section(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>, []);
  // (by player, for the players `nameOf` can name: one it can't has left the team, his settings with him)
  const pids = (x: Record<number, unknown>, y: Record<number, unknown>) => [...new Set([...Object.keys(x), ...Object.keys(y)])].map(Number).filter((pid) => nameOf(pid));
  for (const pid of pids(a.offense.roles, b.offense.roles)) {
    const [x, y] = [a.offense.roles[pid], b.offense.roles[pid]];
    if (x !== y) out.push({ label: `${nameOf(pid)} (role)`, from: x ? ROLE_META[x].label : 'Auto', to: y ? ROLE_META[y].label : 'Auto' });
  }
  for (const pid of pids(a.offense.freedom, b.offense.freedom)) {
    const [x, y] = [a.offense.freedom[pid] ?? 0, b.offense.freedom[pid] ?? 0];
    if (x !== y) out.push({ label: `${nameOf(pid)} (shot freedom)`, from: FREEDOM_LABEL[x], to: FREEDOM_LABEL[y] });
  }
  for (const pid of pids(a.defense.roles ?? {}, b.defense.roles ?? {})) {
    const [x, y] = [a.defense.roles?.[pid] ?? 'standard', b.defense.roles?.[pid] ?? 'standard'];
    if (x !== y) out.push({ label: `${nameOf(pid)} (defensive role)`, from: DEF_ROLE_META[x].label, to: DEF_ROLE_META[y].label });
  }
  for (const pid of pids(a.offense.glass ?? {}, b.offense.glass ?? {})) {
    const [x, y] = [a.offense.glass?.[pid] ?? 0, b.offense.glass?.[pid] ?? 0];
    if (x !== y) out.push({ label: `${nameOf(pid)} (glass)`, from: GLASS_META[x].label, to: GLASS_META[y].label });
  }
  const scr = (s: number[]) => s.map(nameOf).filter(Boolean).join(', ') || 'Auto';
  if (!same(a.offense.screeners, b.offense.screeners)) out.push({ label: 'Screeners', from: scr(a.offense.screeners), to: scr(b.offense.screeners) });
  return out;
}
