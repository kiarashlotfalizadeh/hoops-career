import type {
  ActionType,
  DefRole,
  DefScheme,
  DefenseTactics,
  GameManagement,
  GlassDuty,
  Mentality,
  OffShape,
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

/**
 * The offensive playbooks. Their action mixes were set again in 2026-10 against what the engine says
 * each is worth (every playbook for 90 real and fictional rosters, fully drilled, against every other
 * team, paired games): as first written, Heliocentric beat the roster's average playbook by 1.5 a
 * game and was the best for 73 of 90 rosters whatever they had (its edge was its action mix: more
 * pick-and-roll, less motion, which pay nearly every roster), while Hub Big and Grit & Grind were
 * a point under for nearly all. Now Heliocentric leans on the star's isolations as much as his ball
 * screens, and every playbook runs a pick-and-roll base under its own identity: against Balanced,
 * Heliocentric +0.6, Pace & Space +0.5, Five-Out 0.0, Grit & Grind −0.1, Hub Big −0.2 (each ±0.1),
 * the best for a roster now depending on the roster (see the fits in core/ai/coachAI.ts). On the
 * engine as it plays since a shooter's three-point volume levels off, against the roster's average
 * playbook: Pace & Space +0.4, Five-Out +0.3, Heliocentric +0.1, Balanced 0.0, Hub Big −0.3, Grit &
 * Grind −0.5, and none the best for more than a third of the rosters.
 */
export const OFF_PRESETS: OffPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced Attack',
    tagline: 'A bit of everything',
    description: 'Modern NBA default. Pick-and-roll first, with ball movement and a healthy shot profile.',
    bestFor: 'Rosters without one dominant creator.',
    values: { pace: 52, transition: 55, actions: { pnr: 58, iso: 35, post: 25, handoff: 52, motion: 55 }, threePoint: 62, rimAttack: 60, crashBoards: 55, huntMismatch: false },
  },
  {
    id: 'helio',
    name: 'Heliocentric',
    tagline: 'Give the star the ball',
    description: 'Your best creator runs high pick-and-rolls and isolations while four teammates space the floor.',
    bestFor: 'One elite creator (high handling, passing and pull-up shooting) surrounded by shooters.',
    values: { pace: 44, transition: 45, actions: { pnr: 66, iso: 66, post: 18, handoff: 42, motion: 50 }, threePoint: 68, rimAttack: 60, crashBoards: 55, huntMismatch: true },
  },
  {
    id: 'fiveOut',
    name: 'Five-Out Motion',
    tagline: 'Spacing, cutting, sharing',
    description: 'Constant movement, dribble handoffs and backdoor cuts with five shooters. Generates open threes.',
    bestFor: 'Many good shooters and passers; no need for a dominant creator.',
    values: { pace: 58, transition: 60, actions: { pnr: 58, iso: 18, post: 10, handoff: 62, motion: 88 }, threePoint: 84, rimAttack: 55, crashBoards: 42, huntMismatch: false },
  },
  {
    id: 'hub',
    name: 'Hub Big',
    tagline: 'Run it through the big',
    description: 'Elbow and post touches for a playmaking big; guards cut and run off his handoffs.',
    bestFor: 'A center with elite passing and IQ.',
    values: { pace: 46, transition: 48, actions: { pnr: 60, iso: 20, post: 48, handoff: 72, motion: 52 }, threePoint: 56, rimAttack: 62, crashBoards: 55, huntMismatch: false },
  },
  {
    id: 'paceSpace',
    name: 'Pace & Space',
    tagline: 'Seven seconds or less',
    description: 'Push after every stop, shoot early threes, attack before the defense sets.',
    bestFor: 'Fast, athletic rosters with shooting and good conditioning.',
    values: { pace: 88, transition: 92, actions: { pnr: 60, iso: 28, post: 10, handoff: 38, motion: 60 }, threePoint: 80, rimAttack: 66, crashBoards: 45, huntMismatch: false },
  },
  {
    id: 'grind',
    name: 'Grit & Grind',
    tagline: 'Slow it down, pound it inside',
    description: 'Low possession count, post-ups and isolations, and relentless offensive rebounding.',
    bestFor: 'Big, physical rosters short on shooting.',
    values: { pace: 28, transition: 32, actions: { pnr: 58, iso: 45, post: 58, handoff: 30, motion: 38 }, threePoint: 42, rimAttack: 72, crashBoards: 72, huntMismatch: false },
  },
];

export const DEF_PRESETS: DefPreset[] = [
  {
    id: 'drop',
    name: 'Drop & Protect',
    tagline: 'Wall off the rim',
    description: 'Big sits in the paint on pick-and-rolls. Concedes pull-up jumpers, takes away the rim and the roll man. Off-ball screens are switched.',
    bestFor: 'An elite rim protector. Weak against pull-up shooters and popping bigs.',
    values: { scheme: 'man', pnr: 'drop', help: 56, pressure: 52, press: 'none', getBack: 60, switchOffBall: true, physicality: 50 },
  },
  {
    id: 'switch',
    name: 'Switch Everything',
    tagline: 'No gaps, no help',
    description: 'Switch every screen on and off the ball. Kills ball movement and handoffs, but invites mismatch hunting.',
    bestFor: 'Versatile, similarly sized defenders. Avoid with slow centers.',
    values: { scheme: 'man', pnr: 'switch', help: 52, pressure: 52, press: 'none', getBack: 55, switchOffBall: true, physicality: 50 },
  },
  {
    id: 'blitz',
    name: 'Blitz the Ball',
    tagline: 'Take the ball out of his hands',
    description: 'Trap the pick-and-roll ball handler and pressure passing lanes. Forces turnovers; gives up 4-on-3 chances when beaten. Off-ball screens are switched.',
    bestFor: 'Long, rangy defenders with high IQ vs a ball-dominant star with weak passing.',
    values: { scheme: 'man', pnr: 'blitz', help: 55, pressure: 74, press: 'none', getBack: 55, switchOffBall: true, physicality: 58 },
  },
  {
    id: 'ice',
    name: 'Ice & Contain',
    tagline: 'Force him baseline',
    description:
      'Push side pick-and-rolls toward the sideline. Takes away the middle: pull-up jumpers, drives and the roll man, so the ball goes to the kick-out. Off-ball screens are switched.',
    bestFor: 'Disciplined defenders vs drivers and pull-up shooters.',
    values: { scheme: 'man', pnr: 'ice', help: 55, pressure: 52, press: 'none', getBack: 60, switchOffBall: true, physicality: 50 },
  },
  {
    id: 'hedge',
    name: 'Hedge & Recover',
    tagline: 'Show and get back',
    description: 'Big jumps out to stall the ball handler, then recovers. Requires mobile bigs; can expose the roll man. Off-ball screens are switched.',
    bestFor: 'Mobile bigs with good IQ.',
    values: { scheme: 'man', pnr: 'hedge', help: 52, pressure: 56, press: 'none', getBack: 58, switchOffBall: true, physicality: 52 },
  },
  {
    id: 'zone',
    name: '2-3 Zone',
    tagline: 'Pack it in',
    description: 'Shrinks driving lanes and clogs the post, but leaves corner threes and the offensive glass vulnerable.',
    bestFor: 'Long lineups with a rim anchor vs poor-shooting, drive-heavy teams.',
    values: { scheme: 'zone23', pnr: 'drop', help: 56, pressure: 48, press: 'none', getBack: 62, switchOffBall: false, physicality: 48 },
  },
  {
    id: 'chaos',
    name: 'Full-Court Chaos',
    tagline: 'Press, trap, run',
    description: 'Full-court press, ball pressure everywhere. Creates turnovers, but the press eats clock, gives up run-outs when broken and costs a lot of energy.',
    bestFor: 'Deep, athletic benches with quick hands vs shaky ball handlers.',
    values: { scheme: 'man', pnr: 'hedge', help: 48, pressure: 80, press: 'always', getBack: 45, switchOffBall: true, physicality: 64 },
  },
];

// ---------------------------------------------------------------- five-level settings

/** The five settings each 0-100 tactic offers on the screens, low to high. */
export const LEVEL_VALUES = [0, 25, 50, 75, 100] as const;

/**
 * Which of the five settings a value reads as: the nearest one. Presets, the staff's in-game
 * adjustments and situational nudges can land between them, and the engine plays the value itself.
 */
export function levelIndex(v: number): number {
  return Math.round(clamp(v, 0, 100) / 25);
}

export type LevelNames = readonly [string, string, string, string, string];
/** The 0-100 tactics, and every action's frequency as one. */
export type LeveledTactic = 'pace' | 'transition' | 'threePoint' | 'rimAttack' | 'crashBoards' | 'help' | 'pressure' | 'physicality' | 'getBack' | 'action';

/** What each setting is called, low to high. */
export const TACTIC_LEVELS: Record<LeveledTactic, LevelNames> = {
  pace: ['Grind it out', 'Patient', 'Balanced', 'Up-tempo', 'Run & gun'],
  transition: ['Walk it up', 'Pick spots', 'Balanced', 'Push often', 'Always run'],
  threePoint: ['Lots of twos', 'Fewer threes', 'Balanced', 'More threes', 'Rim & 3s only'],
  rimAttack: ['Jump shots', 'Few drives', 'Balanced', 'Drive often', 'All downhill'],
  crashBoards: ['Never crash', 'Rarely crash', 'Balanced', 'Crash often', 'Crash hard'],
  help: ['Never help', 'Stay home', 'Balanced', 'Pack the paint', 'Wall off paint'],
  pressure: ['Sag off', 'Contain', 'Balanced', 'Pressure', 'Swarm'],
  physicality: ['Hands off', 'Play clean', 'Balanced', 'Physical', 'Rough it up'],
  getBack: ['Jog back', 'Trot back', 'Balanced', 'Hustle back', 'Sprint back'],
  action: ['Almost never', 'Rarely', 'Normal', 'Often', 'Heavily'],
};

/** The name of the setting a value reads as ("Up-tempo" for a pace of 72). */
export const levelName = (k: LeveledTactic, v: number) => TACTIC_LEVELS[k][levelIndex(v)];

export const ACTION_META: Record<ActionType, { label: string; help: string }> = {
  pnr: { label: 'Pick-and-roll', help: 'Ball screen for a creator; the screener rolls or pops. Coverage choice decides who gets open.' },
  iso: { label: 'Isolation', help: 'Clear out for a one-on-one. Efficient only for elite creators or vs a mismatch.' },
  post: { label: 'Post-up', help: 'Feed a big (or a switched mismatch) on the block. Draws doubles and fouls.' },
  handoff: { label: 'Handoffs & screens', help: 'Dribble handoffs and off-ball screens to spring shooters. Strong vs drop and non-switching teams.' },
  motion: { label: 'Motion & cuts', help: 'Ball movement, drive-and-kick and backdoor cuts. Needs passers and shooters; beats over-aggressive defenses.' },
};

export const COVERAGE_META: Record<PnrCoverage, { label: string; help: string }> = {
  drop: { label: 'Drop', help: 'Big sags into the paint. Protects the rim and roll man; concedes pull-up jumpers.' },
  switch: { label: 'Switch', help: 'Defenders exchange assignments. No open roll man, but creates mismatches.' },
  hedge: { label: 'Hedge', help: 'Big shows high to slow the ball, then recovers. Balanced, but slow bigs leave the roller open.' },
  blitz: { label: 'Blitz', help: 'Double-team the handler. Forces the ball out and creates turnovers; 4-on-3 behind it.' },
  ice: { label: 'Ice', help: 'Force the handler to the sideline. Takes away the middle: pull-up jumpers, drives and the roll.' },
};

export const SCHEME_META: Record<DefScheme, { label: string; help: string }> = {
  man: { label: 'Man-to-man', help: 'Each defender has an assignment. Matchups matter.' },
  zone23: { label: '2-3 Zone', help: 'Protects the paint against drives, cuts and post-ups; vulnerable to open (often corner) threes and offensive boards.' },
  zone32: {
    label: '3-2 Zone',
    help: 'Three defenders on the arc: ball movement finds far fewer open threes than against the 2-3, but the paint, post-ups, cuts and the offensive glass are softer. A choice against shooting teams, not against bigs and drivers.',
  },
  box1: {
    label: 'Box-and-one',
    help: 'One of your best perimeter defenders face-guards their main creator (fewer touches, late catches, few catch-and-shoot looks, a tiring chase) while the other four play a 2-2 zone. Everyone else gets more open threes and gaps, and the glass is softer: a weapon against one star with poor shooters around him, a loser against teams that shoot.',
  },
  tri2: {
    label: 'Triangle-and-two',
    help: 'Two chasers face-guard their top two creators while three play a zone. Even more open threes for the other three and a weaker glass: only against two scorers surrounded by players who can’t shoot.',
  },
};

/** Junk defenses: a zone behind one or two chasers. */
export const isJunk = (s: DefScheme) => s === 'box1' || s === 'tri2';
/** How many players a junk defense chases (none for man-to-man or a zone). */
export const chasers = (s: DefScheme) => (s === 'box1' ? 1 : s === 'tri2' ? 2 : 0);
/** Every defensive scheme, junk defenses included. */
export const ALL_SCHEMES = Object.keys(SCHEME_META) as DefScheme[];

export const PRESS_META: Record<PressMode, { label: string; help: string }> = {
  none: { label: 'No press', help: 'Set up in the half court.' },
  afterMade: { label: 'After makes', help: 'Full-court pressure after made baskets and free throws.' },
  always: { label: 'Always', help: 'Press every time they inbound: after scores, dead balls and at period starts. High turnover upside, high fatigue cost.' },
};

export const STAR_PLAN_META: Record<StarPlan, { label: string; help: string }> = {
  none: { label: 'Play straight', help: 'No special treatment.' },
  double: { label: 'Double-team', help: 'Send a second defender whenever he attacks. Forces others to beat you.' },
};

// ---------------------------------------------------------------- headline decisions

/**
 * What the half court plays through: one choice over the five action weights (the fine-tuning keeps
 * all five). Each is a mix of weights; tactics read as the focus nearest their weights, or as their
 * own mix when none is near.
 */
export type PlayFocus = 'balanced' | 'pnr' | 'handoff' | 'motion' | 'post' | 'iso';
export const PLAY_FOCI: PlayFocus[] = ['balanced', 'pnr', 'handoff', 'motion', 'post', 'iso'];

export const FOCUS_META: Record<PlayFocus, { label: string; help: string; actions: Record<ActionType, number> }> = {
  balanced: {
    label: 'Balanced',
    help: 'A bit of everything, pick-and-roll first: the half court runs whatever the five on the floor run best.',
    actions: { pnr: 58, iso: 35, post: 25, handoff: 52, motion: 55 },
  },
  pnr: {
    label: 'Pick-and-roll',
    help: 'Ball screens for your handlers on most trips, the rest isolations: the creators carry it, and a handler with a roll man or a popping big makes it sing.',
    actions: { pnr: 82, iso: 45, post: 15, handoff: 35, motion: 40 },
  },
  handoff: {
    label: 'Handoffs',
    help: 'Dribble handoffs and off-ball screens: shooters and cutters running off a passing big. Strong against a drop and against defenses that don’t switch.',
    actions: { pnr: 45, iso: 18, post: 40, handoff: 80, motion: 70 },
  },
  motion: {
    label: 'Motion',
    help: 'Cuts, drive-and-kick and the extra pass, with almost no isolations: needs passers and shooters everywhere, and beats defenses that overplay.',
    actions: { pnr: 48, iso: 18, post: 10, handoff: 72, motion: 88 },
  },
  post: {
    label: 'Inside',
    help: 'Post-ups and touches near the basket, with isolations to go with them: for a post scorer, a big who passes out of the double, and a slower game.',
    actions: { pnr: 45, iso: 45, post: 72, handoff: 30, motion: 40 },
  },
  iso: {
    label: 'Isolation',
    help: 'Clear out for your scorers: efficient only for elite creators, or against a defender you can hunt. Little ball movement.',
    actions: { pnr: 60, iso: 80, post: 25, handoff: 25, motion: 30 },
  },
};

/** How far action weights can sit from a focus (summed over the five) and still read as it. */
const FOCUS_NEAR = 60;

/** The focus offense tactics play through: the nearest to their weights, or null when they're their own mix. */
export function focusOf(o: Pick<OffenseTactics, 'actions'>): PlayFocus | null {
  let best: PlayFocus | null = null;
  let bestD = Infinity;
  for (const f of PLAY_FOCI) {
    const d = (Object.keys(o.actions) as ActionType[]).reduce((a, k) => a + Math.abs(o.actions[k] - FOCUS_META[f].actions[k]), 0);
    if (d < bestD) [best, bestD] = [f, d];
  }
  return bestD <= FOCUS_NEAR ? best : null;
}

/** Play through a focus: its action weights in place of the offense's (in place, on `o`). */
export function applyFocus(o: OffenseTactics, f: PlayFocus) {
  o.actions = { ...FOCUS_META[f].actions };
}

/**
 * When a shot goes up: one dial over the offensive glass and transition defense, the same choice
 * from the two ends (the fine-tuning keeps both). Each level is a pair of settings; tactics read as
 * the nearest.
 */
export const GLASS_LEVELS: { label: string; crash: number; getBack: number }[] = [
  { label: 'Crash hard', crash: 85, getBack: 30 },
  { label: 'Crash', crash: 68, getBack: 45 },
  { label: 'Balanced', crash: 52, getBack: 60 },
  { label: 'Get back', crash: 38, getBack: 74 },
  { label: 'Sprint back', crash: 22, getBack: 88 },
];

/** The "when a shot goes up" level tactics read as (0 crash hard .. 4 sprint back). */
export function glassLevel(t: Pick<Tactics, 'offense' | 'defense'>): number {
  let best = 2;
  let bestD = Infinity;
  GLASS_LEVELS.forEach((l, i) => {
    const d = Math.abs(t.offense.crashBoards - l.crash) + Math.abs(t.defense.getBack - l.getBack);
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/** Set the glass dial: both settings of level `i` (in place). */
export function setGlassLevel(t: Pick<Tactics, 'offense' | 'defense'>, i: number) {
  const l = GLASS_LEVELS[clamp(Math.round(i), 0, GLASS_LEVELS.length - 1)];
  t.offense.crashBoards = l.crash;
  t.defense.getBack = l.getBack;
}

// ---------------------------------------------------------------- shape, out-of-possession roles, mentality

export const SHAPE_META: Record<OffShape, { label: string; short: string; help: string; good: string; bad: string }> = {
  fourOut: {
    label: '4-Out, 1-In',
    short: '4-out',
    help: 'Four on the arc, one big in the dunker spot. The league’s default: the man inside doesn’t have to shoot, and he’s where the misses fall.',
    good: 'Hides a big who can’t shoot; normal glass',
    bad: 'One help defender already in the paint',
  },
  fiveOut: {
    label: '5-Out',
    short: '5-out',
    help: 'All five on the arc and the paint empty: drives, cuts and rolls get more room, so long as all five can shoot. Anyone who can’t is sagged off, and nobody is near the glass.',
    good: 'More room for drives, cuts and rolls with five shooters',
    bad: 'Non-shooters get sagged off; fewer offensive boards; no post game',
  },
  horns: {
    label: 'Horns',
    short: 'Horns',
    help: 'Two bigs at the elbows, two shooters in the corners: every trip starts with a choice of ball screens and handoffs, out of a set the players know cold. Less ball movement, fewer turnovers.',
    good: 'Better ball screens and handoffs; fewer turnovers',
    bad: 'Less motion and cutting; a little less spacing',
  },
  twoIn: {
    label: 'Double Post',
    short: 'Twin bigs',
    help: 'Two bigs inside, three outside: post-ups, high-low passes and the offensive glass, at the cost of a crowded paint for everyone else’s drives.',
    good: 'Post-ups and offensive boards',
    bad: 'Crowded paint: drives and spacing suffer',
  },
};

export const DEF_ROLE_META: Record<DefRole, { label: string; short: string; help: string }> = {
  standard: { label: 'Position Defender', short: 'Position D', help: 'Guards whomever the staff’s matchups give him, plays the scheme and nothing more.' },
  poa: {
    label: 'Point-of-Attack Stopper',
    short: 'Point of attack',
    help: 'Picks up their lead ball handler wherever he goes: harder to blow by and more turnovers forced on the ball, but the chase wears him down, and a big one can be beaten for speed.',
  },
  stopper: {
    label: 'Wing Stopper',
    short: 'Stopper',
    help: 'Takes their best scorer who isn’t the lead handler: fewer touches for him and tougher shots when he gets one. It’s tiring work.',
  },
  anchor: {
    label: 'Rim Anchor',
    short: 'Anchor',
    help: 'Guards their least dangerous big and lives in the paint, contesting everyone’s shots at the rim; if the man he leaves can shoot, he gets open looks.',
  },
  roamer: {
    label: 'Roamer',
    short: 'Roamer',
    help: 'Guards their weakest shooter and roams off him into driving lanes, helping on everyone else’s drives, cuts and rolls. His man’s kick-outs come open, so it pays only against a player who can’t make them.',
  },
  hide: {
    label: 'Hidden',
    short: 'Hidden',
    help: 'Guards their least dangerous player, so a weak defender is out of the action as much as the matchups allow. No other duty.',
  },
};

export const GLASS_META: Record<GlassDuty, { label: string; help: string }> = {
  [-1]: { label: 'Get back', help: 'Retreats on every shot: fewer offensive boards for him, fewer run-outs for them.' },
  0: { label: 'Team setting', help: 'Crashes or gets back as the team does.' },
  1: { label: 'Crash', help: 'Goes to the glass on every shot: more offensive boards for him, and more run-outs for them when he doesn’t get it.' },
};

/** The five mentalities, from very cautious (-2) to very aggressive (2). */
export const MENTALITY_META: Record<Mentality, { label: string; help: string }> = {
  [-2]: {
    label: 'Very cautious',
    help: 'Long possessions, nobody leaks or crashes, no gambles on defense: fewer turnovers and run-outs, fewer possessions. Protects a lead; can’t chase one.',
  },
  [-1]: { label: 'Cautious', help: 'A little slower and safer at both ends than your settings: fewer gambles, more bodies back.' },
  0: { label: 'Balanced', help: 'Your settings as they are.' },
  1: { label: 'Aggressive', help: 'A little faster and riskier at both ends than your settings: push, crash, pressure the ball.' },
  2: {
    label: 'Very aggressive',
    help: 'Run on everything, shoot early, crash the glass, get into the ball: more possessions and more variance, and more run-outs given up. For chasing a game, or an underdog looking for chaos.',
  },
};

/** One step of mentality, as it nudges the settings (see withMentality). */
const MENTALITY_STEP = { pace: 9, transition: 9, crashBoards: 7, threePoint: 3, pressure: 7, physicality: 3, getBack: -7 } as const;

/**
 * Tactics as the team plays them: the mentality's nudges on top of the settings (a copy when there are
 * any, kept within 0..100). Balanced, or none set, plays the settings as they are.
 */
export function withMentality(t: Tactics): Tactics {
  const m = t.mentality ?? 0;
  if (!m) return t;
  const out = cloneTactics(t);
  const o = out.offense;
  const d = out.defense;
  o.pace = clamp(o.pace + m * MENTALITY_STEP.pace, 0, 100);
  o.transition = clamp(o.transition + m * MENTALITY_STEP.transition, 0, 100);
  o.crashBoards = clamp(o.crashBoards + m * MENTALITY_STEP.crashBoards, 0, 100);
  o.threePoint = clamp(o.threePoint + m * MENTALITY_STEP.threePoint, 0, 100);
  d.pressure = clamp(d.pressure + m * MENTALITY_STEP.pressure, 0, 100);
  d.physicality = clamp(d.physicality + m * MENTALITY_STEP.physicality, 0, 100);
  d.getBack = clamp(d.getBack + m * MENTALITY_STEP.getBack, 0, 100);
  return out;
}

/** The shape the offense plays (four-out, one-in when none is set). */
export const shapeOf = (o: Pick<OffenseTactics, 'shape'>): OffShape => o.shape ?? 'fourOut';

/** A player's out-of-possession role (standard when none is set). */
export const defRoleOf = (d: Pick<DefenseTactics, 'roles'>, pid: number): DefRole => d.roles?.[pid] ?? 'standard';

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
      ...(t.offense.sets && { sets: [...t.offense.sets] }),
      ...(t.offense.glass && { glass: { ...t.offense.glass } }),
    },
    defense: {
      ...t.defense,
      matchups: { ...t.defense.matchups },
      ...(t.defense.chase && { chase: [...t.defense.chase] }),
      ...(t.defense.roles && { roles: { ...t.defense.roles } }),
    },
    manage: t.manage.hackTargets ? { ...t.manage, hackTargets: [...t.manage.hackTargets] } : { ...t.manage },
    ...(t.situations && { situations: t.situations.map(cloneSituation) }),
  };
}

/** The coach-only management settings an AI coach never plays (see withoutCoachPlans). */
const COACH_MANAGE = ['goTo', 'ato', 'atoPid', 'hackTargets', 'hackFromQ', 'assistantAdjusts', 'foulToGive'] as const;

/** Whether tactics carry anything only the user's bench uses (see withoutCoachPlans). */
export function hasCoachPlans(t: Tactics): boolean {
  return (
    !!t.situations ||
    COACH_MANAGE.some((k) => t.manage[k] !== undefined && t.manage[k] !== null && t.manage[k] !== false) ||
    t.offense.huntTarget != null ||
    t.offense.sets !== undefined ||
    t.defense.chase !== undefined
  );
}

/**
 * The tactics without what only the user's bench uses: situational plans, the crunch-time go-to
 * player and after-timeout play, hack targets, the foul to give, the assistant's adjustments, the set
 * package, and the game-specific hunt target and chase targets on tonight's opponents.
 * An AI coach who inherits a team (the user took over another) plays its playbook, not those.
 */
export function withoutCoachPlans(t: Tactics): Tactics {
  const out = cloneTactics(t);
  delete out.situations;
  for (const k of COACH_MANAGE) delete out.manage[k];
  delete out.offense.sets;
  delete out.offense.huntTarget;
  delete out.defense.chase;
  return out;
}

/** A box-and-one or triangle-and-two named for particular players: drawn up for one opponent. */
export const namedJunk = (d: DefenseTactics) => isJunk(d.scheme) && !!d.chase?.length;

/**
 * The parts of the tactics that name one night's opponents: kept in a game or its plan, never in
 * saved tactics. A junk defense named for their players goes with them, back to `base`'s scheme
 * (the tactics it was drawn up over) or man-to-man.
 */
export function withoutGameSpecific(t: Tactics, base?: Tactics): Tactics {
  const out = cloneTactics(t);
  if (namedJunk(out.defense)) out.defense.scheme = base && !namedJunk(base.defense) ? base.defense.scheme : 'man';
  out.defense.matchups = {};
  out.defense.starTarget = null;
  delete out.defense.chase;
  delete out.offense.huntTarget;
  delete out.manage.hackTargets;
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
  if (patch.mentality !== undefined) out.mentality = patch.mentality;
  if (patch.offense) {
    const { actions, ...rest } = patch.offense;
    out.offense = { ...out.offense, ...rest, actions: { ...out.offense.actions } };
    for (const [k, v] of Object.entries(actions ?? {}) as [ActionType, number | undefined][]) if (v !== undefined) out.offense.actions[k] = v;
  }
  if (patch.defense) out.defense = { ...out.defense, ...patch.defense };
  if (patch.manage) out.manage = { ...out.manage, ...patch.manage };
  // a setting the patch takes off (undefined: how tacticsDiff carries a deleted key) is deleted, not left undefined
  const parts: [object | undefined, object][] = [
    [patch.offense, out.offense],
    [patch.defense, out.defense],
    [patch.manage, out.manage],
  ];
  for (const [from, to] of parts) for (const [k, v] of Object.entries(from ?? {})) if (v === undefined) delete (to as Record<string, unknown>)[k];
  const n = patch.nudge;
  if (n) {
    for (const [k, d] of Object.entries(n.offense ?? {}) as [keyof NonNullable<typeof n.offense>, number][]) out.offense[k] = clamp(out.offense[k] + d, 0, 100);
    for (const [k, d] of Object.entries(n.actions ?? {}) as [ActionType, number][]) out.offense.actions[k] = clamp(out.offense.actions[k] + d, 0, 100);
    for (const [k, d] of Object.entries(n.defense ?? {}) as [keyof NonNullable<typeof n.defense>, number][]) out.defense[k] = clamp(out.defense[k] + d, 0, 100);
  }
  // the patch's own objects (matchups, roles...) never end up shared with the tactics it made
  return cloneTactics(out);
}

/** Defense settings that name tonight's opponents (matchups, the star and chase targets). */
const GAME_DEFENSE = new Set<keyof DefenseTactics>(['matchups', 'starTarget', 'chase']);

/** Same value, objects (roles, freedom, screeners) compared by content. */
const same = (a: unknown, b: unknown) => a === b || (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b));

/**
 * What changed from `a` to `b`, as a patch of fixed values: applyPatch(a, tacticsDiff(a, b)) gives
 * `b` back. Matchups, the star and chase targets, instructions by player, the hunt target and
 * hack-a targets name tonight's opponents, so they're never part of it, and the playbook labels and
 * the manual flag aren't tactics a patch carries.
 */
export function tacticsDiff(a: Tactics, b: Tactics): TacticsPatch {
  const patch: TacticsPatch = {};
  if ((a.mentality ?? 0) !== (b.mentality ?? 0)) patch.mentality = b.mentality ?? 0;
  const offense: NonNullable<TacticsPatch['offense']> = {};
  // (both sides' keys: a set package taken off is a change too)
  for (const k of new Set([...Object.keys(a.offense), ...Object.keys(b.offense)]) as Set<keyof OffenseTactics>) {
    if (k === 'actions' || k === 'huntTarget' || same(a.offense[k], b.offense[k])) continue;
    (offense as Record<string, unknown>)[k] = structuredClone(b.offense[k]);
  }
  for (const k of Object.keys(b.offense.actions) as ActionType[]) if (a.offense.actions[k] !== b.offense.actions[k]) (offense.actions ??= {})[k] = b.offense.actions[k];
  if (Object.keys(offense).length) patch.offense = offense;
  const defense: Partial<DefenseTactics> = {};
  // (both sides' keys: a setting taken off, its key deleted, is a change too)
  for (const k of new Set([...Object.keys(a.defense), ...Object.keys(b.defense)]) as Set<keyof DefenseTactics>) {
    // (a junk defense named for their players is tonight's too)
    if (GAME_DEFENSE.has(k) || same(a.defense[k], b.defense[k]) || (k === 'scheme' && namedJunk(b.defense))) continue;
    (defense as Record<string, unknown>)[k] = b.defense[k];
  }
  if (Object.keys(defense).length) patch.defense = defense;
  const manage: Partial<GameManagement> = {};
  // hack-a-player targets name tonight's opponents, like the matchups
  for (const k of new Set([...Object.keys(a.manage), ...Object.keys(b.manage)]) as Set<keyof GameManagement>)
    if (k !== 'hackTargets' && k !== 'hackFromQ' && !same(a.manage[k], b.manage[k])) (manage as Record<string, unknown>)[k] = structuredClone(b.manage[k]);
  if (Object.keys(manage).length) patch.manage = manage;
  return patch;
}

/** A patch changes nothing. */
export const emptyPatch = (p: TacticsPatch) => !p.offense && !p.defense && !p.manage && !p.nudge && p.mentality === undefined;
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
    help: 'While three or more reserves are on the floor: a simpler offense (more pick-and-roll and ball movement, fewer isolations and post-ups) at a quicker pace.',
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
  // (the editor keeps these apart; a plan saved before it did would never apply, and says so)
  if (from > until || (w.minLead !== undefined && w.maxLead !== undefined && w.minLead > w.maxLead) || (w.maxClock !== undefined && w.maxClock <= 0))
    return "Never: these conditions can't all hold";
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

// ---------------------------------------------------------------- hack-a-player

/**
 * Whether the defense fouls this player on purpose (when he's on the floor, from the plan's quarter):
 * he's one of a game plan's targets, or below the free-throw threshold. Without a player, whether
 * it hacks anyone at all.
 */
export function hacks(m: GameManagement, p?: { pid: number; ftPct: number }): boolean {
  const targets = m.hackTargets ?? [];
  if (!p) return m.hackThreshold > 0 || targets.length > 0;
  return targets.includes(p.pid) || p.ftPct * 100 < m.hackThreshold;
}

/** No more intentional fouls: the threshold off, and a game plan's targets (and the quarter they started) cleared. */
export function stopHacking(m: GameManagement) {
  m.hackThreshold = 0;
  delete m.hackTargets;
  delete m.hackFromQ;
}

/** Hack from now on everyone under `threshold` from the line: a plan's later starting quarter moves up to quarter `q`. */
export function startHacking(m: GameManagement, threshold: number, q: number) {
  m.hackThreshold = threshold;
  if ((m.hackFromQ ?? 1) > q) m.hackFromQ = q;
}
