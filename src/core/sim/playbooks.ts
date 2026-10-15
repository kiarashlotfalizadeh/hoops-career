// The coach's saved playbooks (League.playbooks): his own library of tactics, which goes with him
// when he takes over another team. A playbook keeps the schemes, sliders, set package and game management;
// roles, shot freedom and screeners are kept by player and only come back for players still on the
// roster, and the game-specific parts (matchups, the star, chase and hunt targets, instructions by
// player, hack-a targets) are never saved. Also here: the names the screens give a team's playbook,
// which say "Custom" once the sliders leave the preset.

import { ACTIONS, type League, type SavedPlaybook, type ShotFreedom, type Tactics } from '../types';
import { ROLE_META } from '../ratings';
import { ACTION_META, COVERAGE_META, DEF_PRESETS, OFF_PRESETS, PRESS_META, SCHEME_META, STAR_PLAN_META, type DefPreset, type OffPreset } from './tactics';
import { SETS, atoLabel, isSetId } from './sets';

export const MAX_PLAYBOOKS = 12;
export const PLAYBOOK_NAME_MAX = 30;

// ---------------------------------------------------------------- preset labels

/** Short preset names, for "Custom (Balanced base)". */
const OFF_SHORT: Record<string, string> = { balanced: 'Balanced', helio: 'Heliocentric', fiveOut: 'Five-Out', hub: 'Hub Big', paceSpace: 'Pace & Space', grind: 'Grit & Grind' };
const DEF_SHORT: Record<string, string> = { drop: 'Drop', switch: 'Switch', blitz: 'Blitz', ice: 'Ice', hedge: 'Hedge', zone: '2-3 Zone', chaos: 'Chaos' };

/** Whether tactics still hold every value a preset sets: false once any of its sliders or switches has moved. */
export function presetMatches(values: object, preset: OffPreset | DefPreset): boolean {
  const cur = values as Record<string, unknown>;
  return Object.entries(preset.values).every(([k, v]) =>
    v !== null && typeof v === 'object' ? Object.entries(v).every(([a, x]) => (cur[k] as Record<string, unknown> | undefined)?.[a] === x) : cur[k] === v,
  );
}

/** The offense as the screens name it: the preset's name, or "Custom (Balanced base)" once its sliders have moved. */
export function offenseLabel(t: { offense: object; offPreset: string }): string {
  const p = OFF_PRESETS.find((x) => x.id === t.offPreset);
  if (!p) return 'Custom';
  return presetMatches(t.offense, p) ? p.name : `Custom (${OFF_SHORT[p.id] ?? p.name} base)`;
}

export function defenseLabel(t: { defense: object; defPreset: string }): string {
  const p = DEF_PRESETS.find((x) => x.id === t.defPreset);
  if (!p) return 'Custom';
  return presetMatches(t.defense, p) ? p.name : `Custom (${DEF_SHORT[p.id] ?? p.name} base)`;
}

/** "Heliocentric · Custom (Drop base)": a team's offense and defense, for headers and scouting. */
export function playbookLabel(t: { offense: object; defense: object; offPreset: string; defPreset: string }): string {
  return `${offenseLabel(t)} · ${defenseLabel(t)}`;
}

// ---------------------------------------------------------------- playbooks and tactics

/** The parts of Tactics this module knows; anything else (newer features) is saved and loaded as it is. */
const KNOWN = ['offense', 'defense', 'manage', 'offPreset', 'defPreset', 'manual', 'playbook'];

function omit<T extends object>(o: T, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = { ...(o as Record<string, unknown>) };
  for (const k of keys) delete out[k];
  return out as Partial<T>;
}

/** A playbook of tactics `t` (a deep copy: later edits to either leave the other alone). */
export function toPlaybook(t: Tactics, meta: Pick<SavedPlaybook, 'id' | 'name' | 'saved'>): SavedPlaybook {
  const c = structuredClone(t);
  const extra = Object.fromEntries(Object.entries(omit(c, KNOWN)).filter(([, v]) => v !== undefined));
  return {
    id: meta.id,
    name: meta.name,
    saved: { ...meta.saved },
    // (the hunt, chase targets and instructions by player name one night's opponents, like the matchups)
    offense: omit(c.offense, ['roles', 'freedom', 'screeners', 'huntTarget']) as SavedPlaybook['offense'],
    defense: omit(c.defense, ['matchups', 'starTarget', 'chase', 'playerD']) as SavedPlaybook['defense'],
    // hack-a-player targets are one opponent's players: they belong in game plans
    manage: omit(c.manage, ['hackTargets', 'hackFromQ']) as SavedPlaybook['manage'],
    offPreset: c.offPreset,
    defPreset: c.defPreset,
    roles: c.offense.roles,
    freedom: c.offense.freedom,
    screeners: c.offense.screeners,
    ...(Object.keys(extra).length ? { extra } : {}),
  };
}

/**
 * Tactics `t` with a playbook loaded, for a team whose roster is `roster` (pids): its roles, shot
 * freedom and screeners apply to players still on it (the others keep theirs), and tonight's
 * matchups, star, chase and hunt targets and instructions by player stay. Fields newer than the playbook keep their current values. The
 * result shares no objects with the playbook or with `t`, and is the coach's (manual).
 */
export function loadPlaybook(t: Tactics, pb: SavedPlaybook, roster: Iterable<number>): Tactics {
  const on = new Set(roster);
  const src = structuredClone(pb);
  const out = structuredClone(t);
  const roles = { ...out.offense.roles };
  for (const [pid, r] of Object.entries(src.roles ?? {})) if (on.has(+pid)) roles[+pid] = r;
  const freedom = { ...out.offense.freedom };
  for (const [pid, f] of Object.entries(src.freedom ?? {})) if (on.has(+pid)) freedom[+pid] = f;
  const screeners = src.screeners ? src.screeners.filter((pid) => on.has(pid)) : out.offense.screeners;
  out.offense = { ...out.offense, ...src.offense, roles, freedom, screeners };
  out.defense = { ...out.defense, ...src.defense };
  out.manage = { ...out.manage, ...src.manage };
  // a go-to player (or the player of the after-timeout play) who has left stays with the current one
  if (src.manage.goTo !== undefined && src.manage.goTo !== null && !on.has(src.manage.goTo)) out.manage.goTo = t.manage.goTo ?? null;
  if (src.manage.atoPid !== undefined && src.manage.atoPid !== null && !on.has(src.manage.atoPid)) out.manage.atoPid = t.manage.atoPid ?? null;
  Object.assign(out, omit(src.extra ?? {}, KNOWN));
  out.offPreset = src.offPreset;
  out.defPreset = src.defPreset;
  out.playbook = { id: pb.id, name: pb.name };
  out.manual = true;
  return out;
}

/** One difference between two sets of tactics: "Pace 62 → 80". Without from/to, "Situations changed". */
export interface TacticsChange {
  label: string;
  from: string;
  to: string;
}

export const changeText = (c: TacticsChange) => (c.from || c.to ? `${c.label} ${c.from} → ${c.to}` : `${c.label} changed`);

const onOff = (v: unknown) => (v ? 'On' : 'Off');
/** Settings this module doesn't know by name: switches read On/Off, numbers and words as they are. */
const onOffOr = (v: unknown) => (typeof v === 'boolean' ? onOff(v) : String(v));
const whole = (v: unknown) => String(Math.round(v as number));
const presetName = (list: { id: string; name: string }[]) => (v: unknown) => list.find((p) => p.id === v)?.name ?? 'Custom';
const FREEDOM_LABEL: Record<ShotFreedom, string> = { [-1]: 'Limited', 0: 'Normal', 1: 'Green light' };

type Field<K> = [K, string, ((v: unknown) => string)?];
const OFFENSE_FIELDS: Field<string>[] = [
  ['pace', 'Pace', whole],
  ['transition', 'Push in transition', whole],
  ['threePoint', 'Three-point emphasis', whole],
  ['rimAttack', 'Attack the rim', whole],
  ['crashBoards', 'Crash the glass', whole],
  ['huntMismatch', 'Hunt mismatches', onOff],
  ['hotHand', 'Feed the hot hand', onOff],
];
const DEFENSE_FIELDS: Field<string>[] = [
  ['scheme', 'Scheme', (v) => SCHEME_META[v as keyof typeof SCHEME_META]?.label ?? String(v)],
  ['pnr', 'Coverage', (v) => COVERAGE_META[v as keyof typeof COVERAGE_META]?.label ?? String(v)],
  ['switchOffBall', 'Switch off-ball screens', onOff],
  ['help', 'Help defense', whole],
  ['pressure', 'Ball pressure', whole],
  ['physicality', 'Physicality', whole],
  ['getBack', 'Transition defense', whole],
  ['press', 'Full-court press', (v) => PRESS_META[v as keyof typeof PRESS_META]?.label ?? String(v)],
  ['starPlan', 'Star plan', (v) => STAR_PLAN_META[v as keyof typeof STAR_PLAN_META]?.label ?? String(v)],
];
const MANAGE_FIELDS: Field<string>[] = [
  ['foulUp3', 'Foul when up 3', onOff],
  ['foulWhenTrailing', 'Foul when trailing late', onOff],
  ['twoForOne', 'Go for 2-for-1', onOff],
  ['garbageTime', 'Rest starters in blowouts', onOff],
  ['hackThreshold', 'Hack-a-player', (v) => (v ? `< ${v}% FT` : 'Off')],
  ['foulToGive', 'Foul to give', onOff],
  ['autoTimeouts', 'Auto timeouts', onOff],
  ['timeoutRun', 'Timeout after a run of', (v) => `${v}-0`],
  ['foulTrouble', 'Foul trouble', (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)],
  ['fatigueSub', 'Sub out tired players at', (v) => `${Math.round((v as number) * 100)}% energy`],
  ['ato', 'After-timeout play', (v) => atoLabel(v as string | null, (a) => ACTION_META[a].label)],
  ['assistantAdjusts', 'Assistant adjusts in simmed games', onOff],
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
  'sets',
  'goTo',
  'atoPid',
  'hackTargets',
  'hackFromQ',
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
 * the playbooks, every slider and switch, game management, roles, shot freedom and screeners.
 * Matchups and the star target are game by game and aren't compared.
 */
export function tacticsChanges(a: Tactics, b: Tactics, nameOf: (pid: number) => string = (pid) => `#${pid}`): TacticsChange[] {
  const out: TacticsChange[] = [];
  const add = (label: string, x: unknown, y: unknown, fmt: (v: unknown) => string = String) => {
    if (same(x, y)) return;
    const prim = (v: unknown) => v === undefined || v === null || typeof v !== 'object';
    out.push(prim(x) && prim(y) ? { label, from: x === undefined ? '—' : fmt(x), to: y === undefined ? '—' : fmt(y) } : { label, from: '', to: '' });
  };
  // known fields in screen order, then any others in that part of the tactics
  const section = (x: Record<string, unknown>, y: Record<string, unknown>, fields: Field<string>[]) => {
    for (const [k, label, fmt] of fields) add(label, x[k], y[k], fmt);
    const known = new Set(fields.map((f) => f[0]));
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (!known.has(k) && !NOT_COMPARED.has(k)) add(humanize(k), x[k], y[k], onOffOr);
  };
  add('Offensive playbook', a.offPreset, b.offPreset, presetName(OFF_PRESETS));
  add('Defensive identity', a.defPreset, b.defPreset, presetName(DEF_PRESETS));
  section(a.offense as unknown as Record<string, unknown>, b.offense as unknown as Record<string, unknown>, OFFENSE_FIELDS);
  for (const k of ACTIONS) add(ACTION_META[k].label, a.offense.actions[k], b.offense.actions[k], whole);
  section(a.defense as unknown as Record<string, unknown>, b.defense as unknown as Record<string, unknown>, DEFENSE_FIELDS);
  section(a.manage as unknown as Record<string, unknown>, b.manage as unknown as Record<string, unknown>, MANAGE_FIELDS);
  const goTo = (v: number | null | undefined) => (v === null || v === undefined ? 'None' : nameOf(v));
  if ((a.manage.goTo ?? null) !== (b.manage.goTo ?? null)) out.push({ label: 'Go-to player', from: goTo(a.manage.goTo), to: goTo(b.manage.goTo) });
  // the player the after-timeout play is run for (the best fit when none is named)
  const atoFor = (v: number | null | undefined) => (v === null || v === undefined ? 'Best fit' : nameOf(v));
  if ((a.manage.atoPid ?? null) !== (b.manage.atoPid ?? null)) out.push({ label: 'After-timeout play for', from: atoFor(a.manage.atoPid), to: atoFor(b.manage.atoPid) });
  const pkg = (v: unknown) => (Array.isArray(v) && v.length ? v.map((id) => (isSetId(id) ? SETS[id].short : String(id))).join(', ') : 'None');
  if (!same(a.offense.sets ?? [], b.offense.sets ?? [])) out.push({ label: 'Set package', from: pkg(a.offense.sets), to: pkg(b.offense.sets) });
  section(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>, []);
  const pids = (x: Record<number, unknown>, y: Record<number, unknown>) => [...new Set([...Object.keys(x), ...Object.keys(y)])].map(Number);
  for (const pid of pids(a.offense.roles, b.offense.roles)) {
    const [x, y] = [a.offense.roles[pid], b.offense.roles[pid]];
    if (x !== y) out.push({ label: `${nameOf(pid)} (role)`, from: x ? ROLE_META[x].label : 'Auto', to: y ? ROLE_META[y].label : 'Auto' });
  }
  for (const pid of pids(a.offense.freedom, b.offense.freedom)) {
    const [x, y] = [a.offense.freedom[pid] ?? 0, b.offense.freedom[pid] ?? 0];
    if (x !== y) out.push({ label: `${nameOf(pid)} (shot freedom)`, from: FREEDOM_LABEL[x], to: FREEDOM_LABEL[y] });
  }
  const scr = (s: number[]) => (s.length ? s.map(nameOf).join(', ') : 'Auto');
  if (!same(a.offense.screeners, b.offense.screeners)) out.push({ label: 'Screeners', from: scr(a.offense.screeners), to: scr(b.offense.screeners) });
  return out;
}

/** What loading a playbook would change in tactics `t`, for a team with this roster ("Pace 62 → 80", "Coverage Drop → Hedge"). */
export function playbookDiff(t: Tactics, pb: SavedPlaybook, roster: Iterable<number>, nameOf?: (pid: number) => string): TacticsChange[] {
  return tacticsChanges(t, loadPlaybook(t, pb, roster), nameOf);
}

// ---------------------------------------------------------------- the coach's library

export const playbookLibrary = (league: League): SavedPlaybook[] => league.playbooks ?? [];

export const findPlaybook = (league: League, id: string | undefined): SavedPlaybook | undefined => (id ? playbookLibrary(league).find((p) => p.id === id) : undefined);

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');

const userRoster = (league: League) =>
  Object.values(league.players)
    .filter((p) => p.tid === league.userTid)
    .map((p) => p.pid);

/** Why `name` can't name a playbook (empty, too long, taken by another one), or null. */
export function playbookNameError(league: League, name: string, except?: string): string | null {
  const n = cleanName(name);
  if (!n) return 'Give the playbook a name.';
  if (n.length > PLAYBOOK_NAME_MAX) return `Keep the name to ${PLAYBOOK_NAME_MAX} characters.`;
  const dup = playbookLibrary(league).find((p) => p.id !== except && p.name.toLowerCase() === n.toLowerCase());
  return dup ? `You already have a playbook called "${dup.name}".` : null;
}

/** A playbook id nothing uses or has used lately (tactics may still point at a deleted one). */
function newId(league: League): string {
  const used = new Set([...playbookLibrary(league).map((p) => p.id), ...league.teams.map((t) => t.tactics.playbook?.id)]);
  let n = playbookLibrary(league).length + 1;
  while (used.has(`pb-${league.season}-${league.day}-${n}`)) n++;
  return `pb-${league.season}-${league.day}-${n}`;
}

/** Save the user's tactics as a new playbook (which they then come from). Returns why it can't be saved, or null. */
export function savePlaybook(league: League, name: string): string | null {
  const err = playbookNameError(league, name);
  if (err) return err;
  if (playbookLibrary(league).length >= MAX_PLAYBOOKS) return `You can keep ${MAX_PLAYBOOKS} playbooks: overwrite or delete one first.`;
  const tm = league.teams[league.userTid];
  const pb = toPlaybook(tm.tactics, { id: newId(league), name: cleanName(name), saved: { season: league.season, day: league.day } });
  (league.playbooks ??= []).push(pb);
  tm.tactics.playbook = { id: pb.id, name: pb.name };
  return null;
}

/** Replace a playbook with the user's current tactics, keeping its name. */
export function overwritePlaybook(league: League, id: string): boolean {
  const lib = playbookLibrary(league);
  const i = lib.findIndex((p) => p.id === id);
  if (i < 0) return false;
  const tm = league.teams[league.userTid];
  lib[i] = toPlaybook(tm.tactics, { id, name: lib[i].name, saved: { season: league.season, day: league.day } });
  tm.tactics.playbook = { id, name: lib[i].name };
  return true;
}

/** Rename a playbook (tactics that come from it follow). Returns why it can't take that name, or null. */
export function renamePlaybook(league: League, id: string, name: string): string | null {
  const pb = findPlaybook(league, id);
  if (!pb) return 'That playbook no longer exists.';
  const err = playbookNameError(league, name, id);
  if (err) return err;
  pb.name = cleanName(name);
  for (const t of league.teams) if (t.tactics.playbook?.id === id) t.tactics.playbook = { id, name: pb.name };
  return null;
}

/** Delete a playbook: tactics that came from it keep their settings, without the link. */
export function deletePlaybook(league: League, id: string) {
  league.playbooks = playbookLibrary(league).filter((p) => p.id !== id);
  for (const t of league.teams) if (t.tactics.playbook?.id === id) t.tactics.playbook = null;
}

/** Load a playbook into the user's tactics (for the players on his roster now). */
export function applyPlaybook(league: League, id: string): boolean {
  const pb = findPlaybook(league, id);
  if (!pb) return false;
  const tm = league.teams[league.userTid];
  tm.tactics = loadPlaybook(tm.tactics, pb, userRoster(league));
  return true;
}

/** The user's tactics compared with the playbook they came from: null when they don't come from one (or it's gone). */
export function playbookStatus(league: League, nameOf?: (pid: number) => string): { pb: SavedPlaybook; changes: TacticsChange[] } | null {
  const t = league.teams[league.userTid].tactics;
  const pb = findPlaybook(league, t.playbook?.id);
  if (!pb) return null;
  // what has changed since: the playbook as loaded now, against the tactics
  return { pb, changes: tacticsChanges(loadPlaybook(t, pb, userRoster(league)), t, nameOf) };
}
