import type {
  ActionType,
  DefScheme,
  DefenseTactics,
  GameManagement,
  OffenseTactics,
  PnrCoverage,
  PressMode,
  SituationTrigger,
  SituationalPlan,
  StarPlan,
  Tactics,
  TacticsPatch,
} from '../types';
import { clamp } from '../random';

export interface OffPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  bestFor: string;
  values: Pick<OffenseTactics, 'pace' | 'transition' | 'actions' | 'threePoint' | 'rimAttack' | 'crashBoards' | 'huntMismatch'>;
}

export interface DefPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  bestFor: string;
  values: Pick<DefenseTactics, 'scheme' | 'pnr' | 'help' | 'pressure' | 'press' | 'getBack' | 'switchOffBall' | 'physicality'>;
}

export const OFF_PRESETS: OffPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced Attack',
    tagline: 'A bit of everything',
    description: 'Modern NBA default. Pick-and-roll first, with ball movement and a healthy shot profile.',
    bestFor: 'Rosters without one dominant creator.',
    values: { pace: 52, transition: 55, actions: { pnr: 62, iso: 35, post: 25, handoff: 45, motion: 55 }, threePoint: 62, rimAttack: 60, crashBoards: 40, huntMismatch: false },
  },
  {
    id: 'helio',
    name: 'Heliocentric',
    tagline: 'Give the star the ball',
    description: 'Your best creator runs high pick-and-rolls and isolations while four teammates space the floor.',
    bestFor: 'One elite creator (high handling, passing and pull-up shooting) surrounded by shooters.',
    values: { pace: 44, transition: 45, actions: { pnr: 82, iso: 58, post: 15, handoff: 32, motion: 36 }, threePoint: 68, rimAttack: 60, crashBoards: 30, huntMismatch: true },
  },
  {
    id: 'fiveOut',
    name: 'Five-Out Motion',
    tagline: 'Spacing, cutting, sharing',
    description: 'Constant movement, dribble handoffs and backdoor cuts with five shooters. Generates open threes.',
    bestFor: 'Many good shooters and passers; no need for a dominant creator.',
    values: { pace: 58, transition: 60, actions: { pnr: 48, iso: 18, post: 10, handoff: 72, motion: 88 }, threePoint: 84, rimAttack: 55, crashBoards: 22, huntMismatch: false },
  },
  {
    id: 'hub',
    name: 'Hub Big',
    tagline: 'Run it through the big',
    description: 'Elbow and post touches for a playmaking big; guards cut and run off his handoffs.',
    bestFor: 'A center with elite passing and IQ.',
    values: { pace: 46, transition: 48, actions: { pnr: 45, iso: 18, post: 52, handoff: 78, motion: 72 }, threePoint: 56, rimAttack: 62, crashBoards: 45, huntMismatch: false },
  },
  {
    id: 'paceSpace',
    name: 'Pace & Space',
    tagline: 'Seven seconds or less',
    description: 'Push after every stop, shoot early threes, attack before the defense sets.',
    bestFor: 'Fast, athletic rosters with shooting and good conditioning.',
    values: { pace: 88, transition: 92, actions: { pnr: 66, iso: 28, post: 10, handoff: 38, motion: 60 }, threePoint: 80, rimAttack: 66, crashBoards: 18, huntMismatch: false },
  },
  {
    id: 'grind',
    name: 'Grit & Grind',
    tagline: 'Slow it down, pound it inside',
    description: 'Low possession count, post-ups and isolations, and relentless offensive rebounding.',
    bestFor: 'Big, physical rosters short on shooting.',
    values: { pace: 18, transition: 28, actions: { pnr: 45, iso: 45, post: 72, handoff: 30, motion: 40 }, threePoint: 34, rimAttack: 72, crashBoards: 82, huntMismatch: false },
  },
];

export const DEF_PRESETS: DefPreset[] = [
  {
    id: 'drop',
    name: 'Drop & Protect',
    tagline: 'Wall off the rim',
    description: 'Big sits in the paint on pick-and-rolls. Concedes pull-up jumpers, takes away the rim and the roll man.',
    bestFor: 'An elite rim protector. Weak against pull-up shooters and popping bigs.',
    values: { scheme: 'man', pnr: 'drop', help: 62, pressure: 40, press: 'none', getBack: 60, switchOffBall: false, physicality: 50 },
  },
  {
    id: 'switch',
    name: 'Switch Everything',
    tagline: 'No gaps, no help',
    description: 'Switch every screen on and off the ball. Kills ball movement and handoffs, but invites mismatch hunting.',
    bestFor: 'Versatile, similarly sized defenders. Avoid with slow centers.',
    values: { scheme: 'man', pnr: 'switch', help: 42, pressure: 52, press: 'none', getBack: 55, switchOffBall: true, physicality: 50 },
  },
  {
    id: 'blitz',
    name: 'Blitz the Ball',
    tagline: 'Take the ball out of his hands',
    description: 'Trap the pick-and-roll ball handler and pressure passing lanes. Forces turnovers; gives up 4-on-3 chances when beaten.',
    bestFor: 'Long, rangy defenders with high IQ vs a ball-dominant star with weak passing.',
    values: { scheme: 'man', pnr: 'blitz', help: 55, pressure: 74, press: 'none', getBack: 55, switchOffBall: false, physicality: 58 },
  },
  {
    id: 'ice',
    name: 'Ice & Contain',
    tagline: 'Force him baseline',
    description: 'Push side pick-and-rolls toward the sideline. Takes away the middle: pull-up jumpers, drives and the roll man, so the ball goes to the kick-out.',
    bestFor: 'Disciplined defenders vs drivers and pull-up shooters.',
    values: { scheme: 'man', pnr: 'ice', help: 55, pressure: 46, press: 'none', getBack: 60, switchOffBall: false, physicality: 50 },
  },
  {
    id: 'hedge',
    name: 'Hedge & Recover',
    tagline: 'Show and get back',
    description: 'Big jumps out to stall the ball handler, then recovers. Requires mobile bigs; can expose the roll man.',
    bestFor: 'Mobile bigs with good IQ.',
    values: { scheme: 'man', pnr: 'hedge', help: 52, pressure: 56, press: 'none', getBack: 58, switchOffBall: false, physicality: 52 },
  },
  {
    id: 'zone',
    name: '2-3 Zone',
    tagline: 'Pack it in',
    description: 'Shrinks driving lanes and clogs the post, but leaves corner threes and the offensive glass vulnerable.',
    bestFor: 'Long lineups with a rim anchor vs poor-shooting, drive-heavy teams.',
    values: { scheme: 'zone23', pnr: 'drop', help: 70, pressure: 38, press: 'none', getBack: 62, switchOffBall: false, physicality: 48 },
  },
  {
    id: 'chaos',
    name: 'Full-Court Chaos',
    tagline: 'Press, trap, run',
    description: 'Full-court press, ball pressure everywhere. Creates turnovers, but the press eats clock, gives up run-outs when broken and costs a lot of energy.',
    bestFor: 'Deep, athletic benches with quick hands vs shaky ball handlers.',
    values: { scheme: 'man', pnr: 'hedge', help: 48, pressure: 86, press: 'always', getBack: 45, switchOffBall: false, physicality: 64 },
  },
];

export const ACTION_META: Record<ActionType, { label: string; help: string }> = {
  pnr: { label: 'Pick-and-roll', help: 'Ball screen for a creator; the screener rolls or pops. Coverage choice decides who gets open.' },
  iso: { label: 'Isolation', help: 'Clear out for a one-on-one. Efficient only for elite creators or vs a mismatch.' },
  post: { label: 'Post-up', help: 'Feed a big (or a switched mismatch) on the block. Draws doubles and fouls.' },
  handoff: { label: 'Handoffs & Screens', help: 'Dribble handoffs and off-ball screens to spring shooters. Strong vs drop and non-switching teams.' },
  motion: { label: 'Motion & Cuts', help: 'Ball movement, drive-and-kick and backdoor cuts. Needs passers and shooters; beats over-aggressive defenses.' },
};

export const COVERAGE_META: Record<PnrCoverage, { label: string; help: string }> = {
  drop: { label: 'Drop', help: 'Big sags into the paint. Protects the rim and roll man; concedes pull-up jumpers.' },
  switch: { label: 'Switch', help: 'Defenders exchange assignments. No open roll man, but creates mismatches.' },
  hedge: { label: 'Hedge', help: 'Big shows high to slow the ball, then recovers. Balanced, but slow bigs leave the roller open.' },
  blitz: { label: 'Blitz', help: 'Double-team the handler. Forces the ball out and creates turnovers; 4-on-3 behind it.' },
  ice: { label: 'Ice', help: 'Force the handler to the sideline. Takes away the middle: pull-up jumpers, drives and the roll.' },
};

export const SCHEME_META: Record<DefScheme, { label: string; help: string }> = {
  man: { label: 'Man-to-Man', help: 'Each defender has an assignment. Matchups matter.' },
  zone23: { label: '2-3 Zone', help: 'Protects the paint against drives, cuts and post-ups; vulnerable to open (often corner) threes and offensive boards.' },
  zone32: {
    label: '3-2 Zone',
    help: 'Three defenders on the arc: ball movement finds far fewer open threes than against the 2-3, but the paint, post-ups, cuts and the offensive glass are softer. A choice against shooting teams, not against bigs and drivers.',
  },
};

export const PRESS_META: Record<PressMode, { label: string; help: string }> = {
  none: { label: 'No Press', help: 'Set up in the half court.' },
  afterMade: { label: 'After Makes', help: 'Full-court pressure after made baskets and free throws.' },
  always: { label: 'Always', help: 'Press every time they inbound: after scores, dead balls and at period starts. High turnover upside, high fatigue cost.' },
};

export const STAR_PLAN_META: Record<StarPlan, { label: string; help: string }> = {
  none: { label: 'Play Straight', help: 'No special treatment.' },
  deny: { label: 'Deny', help: 'Face-guard to keep the ball away from him. Fewer touches, more fatigue on his defender.' },
  double: { label: 'Double Team', help: 'Send a second defender whenever he attacks. Forces others to beat you.' },
};

export function defaultManagement(): GameManagement {
  return {
    foulUp3: true,
    twoForOne: true,
    foulWhenTrailing: true,
    hackThreshold: 0,
    autoTimeouts: true,
    timeoutRun: 8,
    garbageTime: true,
    foulTrouble: 'standard',
    fatigueSub: 0.55,
  };
}

export function applyOffPreset(o: OffenseTactics, id: string): OffenseTactics {
  const p = OFF_PRESETS.find((x) => x.id === id) ?? OFF_PRESETS[0];
  return { ...o, ...p.values, actions: { ...p.values.actions } };
}

export function applyDefPreset(d: DefenseTactics, id: string): DefenseTactics {
  const p = DEF_PRESETS.find((x) => x.id === id) ?? DEF_PRESETS[0];
  return { ...d, ...p.values };
}

export function defaultTactics(offPreset = 'balanced', defPreset = 'drop'): Tactics {
  const offense: OffenseTactics = applyOffPreset(
    {
      pace: 50,
      transition: 50,
      actions: { pnr: 50, iso: 50, post: 50, handoff: 50, motion: 50 },
      threePoint: 50,
      rimAttack: 50,
      crashBoards: 50,
      huntMismatch: false,
      hotHand: true,
      roles: {},
      freedom: {},
      screeners: [],
    },
    offPreset,
  );
  const defense: DefenseTactics = applyDefPreset(
    {
      scheme: 'man',
      pnr: 'drop',
      help: 50,
      pressure: 50,
      press: 'none',
      getBack: 50,
      switchOffBall: false,
      starPlan: 'none',
      starTarget: null,
      matchups: {},
      physicality: 50,
    },
    defPreset,
  );
  return { offense, defense, manage: defaultManagement(), offPreset, defPreset, manual: false };
}

export function cloneTactics(t: Tactics): Tactics {
  return {
    ...t,
    offense: {
      ...t.offense,
      actions: { ...t.offense.actions },
      roles: { ...t.offense.roles },
      freedom: { ...t.offense.freedom },
      screeners: [...t.offense.screeners],
    },
    defense: { ...t.defense, matchups: { ...t.defense.matchups } },
    manage: t.manage.hackTargets ? { ...t.manage, hackTargets: [...t.manage.hackTargets] } : { ...t.manage },
    ...(t.situations && { situations: t.situations.map(cloneSituation) }),
  };
}

/**
 * The tactics without what only the user's bench uses: situational plans, the crunch-time go-to
 * player and after-timeout play, hack targets and the assistant's adjustments. An AI coach who
 * inherits a team (the user took over another) plays its playbook, not those.
 */
export function withoutCoachPlans(t: Tactics): Tactics {
  const out = cloneTactics(t);
  delete out.situations;
  for (const k of ['goTo', 'ato', 'hackTargets', 'hackFromQ', 'assistantAdjusts'] as const) delete out.manage[k];
  return out;
}

/** A copy of a situational plan that shares nothing with it (patches are plain data). */
export function cloneSituation(s: SituationalPlan): SituationalPlan {
  return { ...s, when: { ...s.when }, patch: JSON.parse(JSON.stringify(s.patch)) as TacticsPatch };
}

/** Tactics with a patch applied (a copy): fixed values first, then the relative nudges, kept within 0..100. */
export function applyPatch(t: Tactics, patch?: TacticsPatch): Tactics {
  const out = cloneTactics(t);
  if (!patch) return out;
  if (patch.offense) {
    const { actions, ...rest } = patch.offense;
    out.offense = { ...out.offense, ...rest, actions: { ...out.offense.actions } };
    for (const [k, v] of Object.entries(actions ?? {}) as [ActionType, number | undefined][]) if (v !== undefined) out.offense.actions[k] = v;
  }
  if (patch.defense) out.defense = { ...out.defense, ...patch.defense };
  if (patch.manage) out.manage = { ...out.manage, ...patch.manage };
  const n = patch.nudge;
  if (n) {
    for (const [k, d] of Object.entries(n.offense ?? {}) as [keyof NonNullable<typeof n.offense>, number][]) out.offense[k] = clamp(out.offense[k] + d, 0, 100);
    for (const [k, d] of Object.entries(n.actions ?? {}) as [ActionType, number][]) out.offense.actions[k] = clamp(out.offense.actions[k] + d, 0, 100);
    for (const [k, d] of Object.entries(n.defense ?? {}) as [keyof NonNullable<typeof n.defense>, number][]) out.defense[k] = clamp(out.defense[k] + d, 0, 100);
  }
  // the patch's own objects (matchups, roles...) never end up shared with the tactics it made
  return cloneTactics(out);
}

/** Same value, objects (roles, freedom, screeners) compared by content. */
const same = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));

/**
 * What changed from `a` to `b`, as a patch of fixed values: applyPatch(a, tacticsDiff(a, b)) gives
 * `b` back. Matchups and the star target name tonight's opponents, so they're never part of it, and
 * the playbook labels and the manual flag aren't tactics a patch carries.
 */
export function tacticsDiff(a: Tactics, b: Tactics): TacticsPatch {
  const patch: TacticsPatch = {};
  const offense: NonNullable<TacticsPatch['offense']> = {};
  for (const k of Object.keys(b.offense) as (keyof OffenseTactics)[]) {
    if (k === 'actions' || same(a.offense[k], b.offense[k])) continue;
    (offense as Record<string, unknown>)[k] = structuredClone(b.offense[k]);
  }
  for (const k of Object.keys(b.offense.actions) as ActionType[]) if (a.offense.actions[k] !== b.offense.actions[k]) (offense.actions ??= {})[k] = b.offense.actions[k];
  if (Object.keys(offense).length) patch.offense = offense;
  const defense: Partial<DefenseTactics> = {};
  for (const k of Object.keys(b.defense) as (keyof DefenseTactics)[]) {
    if (k === 'matchups' || k === 'starTarget' || same(a.defense[k], b.defense[k])) continue;
    (defense as Record<string, unknown>)[k] = b.defense[k];
  }
  if (Object.keys(defense).length) patch.defense = defense;
  const manage: Partial<GameManagement> = {};
  // hack-a-player targets name tonight's opponents, like the matchups
  for (const k of Object.keys(b.manage) as (keyof GameManagement)[])
    if (k !== 'hackTargets' && k !== 'hackFromQ' && !same(a.manage[k], b.manage[k])) (manage as Record<string, unknown>)[k] = structuredClone(b.manage[k]);
  if (Object.keys(manage).length) patch.manage = manage;
  return patch;
}

/** A patch changes nothing. */
export const emptyPatch = (p: TacticsPatch) => !p.offense && !p.defense && !p.manage && !p.nudge;
// ---------------------------------------------------------------- situations

/** A team plays at most this many situational plans (the first enabled one that matches applies). */
export const MAX_SITUATIONS = 4;

export type SituationTemplate = 'protectLead' | 'chasing' | 'secondUnit' | 'closeQ';

/** Ready-made situational plans: relative changes, so each builds on whatever playbook is in place. */
export const SITUATION_TEMPLATES: Record<SituationTemplate, { label: string; help: string; when: SituationTrigger; patch: TacticsPatch }> = {
  protectLead: {
    label: 'Protect a lead',
    help: 'Last five minutes of the 4th (and overtime), up 1 to 12: slow it down, keep bodies back, no gambles or cheap fouls.',
    when: { fromQ: 4, maxClock: 300, minLead: 1, maxLead: 12 },
    patch: { nudge: { offense: { pace: -25, transition: -20, crashBoards: -20 }, defense: { getBack: 20, pressure: -10, physicality: -10 } } },
  },
  chasing: {
    label: 'Chasing late',
    help: 'Last six minutes, down 6 to 18: push the pace, hunt threes, pressure the ball and press after makes.',
    when: { fromQ: 4, maxClock: 360, minLead: -18, maxLead: -6 },
    patch: { defense: { press: 'afterMade' }, nudge: { offense: { pace: 25, transition: 20, threePoint: 15 }, defense: { pressure: 20 } } },
  },
  secondUnit: {
    label: 'Second unit',
    help: 'While three or more reserves are on the floor: simpler sets (more pick-and-roll and ball movement, fewer isolations and post-ups) at a quicker pace.',
    when: { benchUnit: true },
    patch: { nudge: { offense: { pace: 10, transition: 10 }, actions: { pnr: 10, motion: 10, iso: -15, post: -10 } } },
  },
  closeQ: {
    label: 'End of quarter',
    help: 'Last 40 seconds of the 1st to 3rd quarters: hunt a mismatch for the last shots and avoid cheap fouls.',
    when: { untilQ: 3, maxClock: 40 },
    patch: { offense: { huntMismatch: true }, nudge: { actions: { iso: 20 }, defense: { physicality: -15 } } },
  },
};

/** A new plan from a template, with an id not used yet in `existing`. */
export function situationFromTemplate(key: SituationTemplate, existing: SituationalPlan[] = []): SituationalPlan {
  const tpl = SITUATION_TEMPLATES[key];
  let id: string = key;
  for (let n = 2; existing.some((s) => s.id === id); n++) id = `${key}-${n}`;
  return cloneSituation({ id, label: tpl.label, enabled: true, when: tpl.when, patch: tpl.patch });
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/** When a plan applies, in a few words: "Q4 & OT · last 5:00 · up 1-12", "Second unit on the floor". */
export function situationText(w: SituationTrigger): string {
  const parts: string[] = [];
  const from = w.fromQ ?? 1;
  const until = w.untilQ ?? 4;
  if (from >= 4) parts.push('Q4 & OT');
  else if (from === until) parts.push(`Q${from}`);
  else if (until >= 4) {
    if (from > 1) parts.push(`from Q${from}`);
  } else parts.push(`Q${from}-Q${until}`);
  if (w.maxClock !== undefined) parts.push(`last ${mmss(w.maxClock)}`);
  const lo = w.minLead;
  const hi = w.maxLead;
  if (lo !== undefined && hi !== undefined) {
    if (lo >= 1) parts.push(lo === hi ? `up ${lo}` : `up ${lo}-${hi}`);
    else if (hi <= -1) parts.push(lo === hi ? `down ${-hi}` : `down ${-hi}-${-lo}`);
    else if (lo === -hi) parts.push(hi === 0 ? 'tied' : `within ${hi}`);
    else parts.push(`margin ${lo > 0 ? '+' : ''}${lo} to ${hi > 0 ? '+' : ''}${hi}`);
  } else if (lo !== undefined) parts.push(lo >= 1 ? `up ${lo}+` : lo === 0 ? 'tied or ahead' : `down ${-lo} or better`);
  else if (hi !== undefined) parts.push(hi <= -1 ? `down ${-hi}+` : hi === 0 ? 'tied or behind' : `up ${hi} or less`);
  if (w.benchUnit) parts.push('second unit on the floor');
  if (!parts.length) return 'Whole game';
  const text = parts.join(' · ');
  return text[0].toUpperCase() + text.slice(1);
}
