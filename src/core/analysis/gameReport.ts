// Post-game "why" report: turns engine impact tags, four factors, play types, runs and
// lineups into ranked, plain-language factors with concrete advice.

import type { GameResult, League, PlayerDefense, SetId, TacticImpact, Tactics, TeamBox } from '../types';
import { FINISH_LABEL, type FinishType } from '../sim/log';
import { hacks, isJunk } from '../sim/tactics';
import { CLEAR_OUT, SETS, SET_IDS } from '../sim/sets';
import { wholeMinutes } from '../league/helpers';
import { GAME } from '../constants';

export interface Factor {
  title: string;
  detail: string;
  /** Points swing in the user's favor (negative = hurt the user). */
  pts: number;
  category: 'tactics' | 'shooting' | 'turnovers' | 'rebounding' | 'fouls' | 'pace' | 'fatigue' | 'stars';
  advice?: string;
  /** The engine's impact key behind a tactical factor (e.g. 'drop_pullup:o'), for a one-tap counter. */
  key?: string;
}

interface Tpl {
  /** X benefited, Y was hurt: lowercase noun phrases ("the Celtics", "your team"); `who` names the players involved. */
  text: (X: string, Y: string, who: string) => string;
  advice?: string; // advice for the team that was hurt
  /** Whether the hurt team's tactics still use what caused it (no "go to Hedge" for a team already in Hedge). */
  uses?: (t: Tactics) => boolean;
  cat?: Factor['category'];
}

const dropping = (t: Tactics) => t.defense.scheme === 'man' && t.defense.pnr === 'drop';
/** Whether the tactics give this instruction on any of tonight's opponents. */
const instructs = (t: Tactics, d: PlayerDefense) => Object.values(t.defense.playerD ?? {}).includes(d);

/** Team nicknames are plural, so their possessive drops the extra s: "the Celtics" → "the Celtics'", "your team" → "your team's". */
export const possessive = (x: string) => (x.endsWith('s') ? `${x}'` : `${x}'s`);

/** A team as the impact sentences name it: "the Thunder". */
export const teamRef = (t: { name: string }) => `the ${t.name}`;

/** One impact as a sentence, X having benefited and Y been hurt (noun phrases as `teamRef` makes them). */
export const impactSentence = (key: string, X: string, Y: string, who = '') => {
  const s = IMPACT_TEXT[key].text(X, Y, who);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Templates keyed by impact key + beneficiary role (o = offense, d = defense). */
export const IMPACT_TEXT: Record<string, Tpl> = {
  'drop_pullup:o': {
    text: (X, _Y, w) => `${X} attacked drop coverage with pull-up jumpers${w}.`,
    advice: 'Against elite pull-up shooters, try Hedge or Ice instead of Drop, or switch if your big can move.',
    uses: dropping,
  },
  'drop_rim:d': {
    text: (X) => `${possessive(X)} drop coverage walled off the rim on pick-and-rolls.`,
    advice: 'Against drop, lean on pull-up shooters, popping bigs and handoffs (Offense > Actions).',
  },
  'drop_pop:o': {
    text: (X, _Y, w) => `${possessive(X)} popping big punished the drop with open threes${w}.`,
    advice: 'Against a shooting big, take your center out of Drop: Switch or Hedge.',
    uses: dropping,
  },
  'drop_handoff:o': {
    text: (X, _Y, w) => `${X} ran handoffs into the drop for clean looks${w}.`,
    advice: 'Switching off-ball screens (Defense > Switch off-ball screens) neutralizes handoffs.',
    uses: (t) => dropping(t) && !t.defense.switchOffBall,
  },
  'switch_mismatch:o': {
    text: (X, _Y, w) => `${X} hunted switches to get favorable matchups${w}.`,
    advice: 'Stop switching when you have a slow big on the floor, or go to Drop/Ice coverage.',
    uses: (t) => t.defense.scheme === 'man' && t.defense.pnr === 'switch',
  },
  'switch_mismatch:d': { text: (X) => `${X} switched screens without giving up real mismatches.` },
  'switch_deny:d': {
    text: (X) => `${possessive(X)} switching blew up off-ball screens and handoffs.`,
    advice: 'Against a switching defense, isolate mismatches (Offense > Hunt mismatches) and post up smaller defenders.',
  },
  'switch_screen:d': {
    text: (X) => `${possessive(X)} switches took away the screen on pick-and-rolls: no open roll man, no pull-up space.`,
    advice: 'Against a switching defense, hunt the weakest defender (Offense > Hunt mismatches) and post up smaller players.',
  },
  'hedge_stall:d': { text: (X) => `${possessive(X)} hedges stalled ball handlers on the pick-and-roll.` },
  'hedge_roll:o': {
    text: (X, _Y, w) => `${possessive(X)} roll men found space behind the hedge${w}.`,
    advice: 'Slow bigs should not hedge; use Drop instead.',
    uses: (t) => t.defense.scheme === 'man' && t.defense.pnr === 'hedge',
  },
  'hedge_roll:d': { text: (X) => `${possessive(X)} mobile bigs recovered to the roll man after hedging.` },
  'hedge_rotate:o': { text: (X) => `${X} found open shooters when the defense rotated behind its hedges.` },
  'blitz_to:d': {
    text: (X, _Y, w) => `${possessive(X)} traps forced turnovers${w}.`,
    advice: 'Against blitzes, put your best passer in the pick-and-roll, or set screens with a big who can pass on the short roll.',
  },
  'blitz_4v3:o': {
    text: (X, _Y, w) => `${X} beat the blitz with quick passes into 4-on-3s${w}.`,
    // a Star plan double traps the star's ball screens too
    advice: 'Stop trapping good passers: Hedge or Drop instead of Blitz, and no Star plan double (Defense).',
    uses: (t) => t.defense.scheme === 'man' && (t.defense.pnr === 'blitz' || t.defense.starPlan === 'double'),
  },
  'blitz_4v3:d': { text: (X) => `${possessive(X)} traps left the offense no clean outlet.` },
  'ice_contain:d': { text: (X) => `${possessive(X)} ice coverage kept ball handlers out of the middle.` },
  'zone_paint:d': {
    text: (X) => `${possessive(X)} zone clogged driving lanes and post-ups.`,
    advice: 'Beat zones with Motion & cuts (Offense > Actions), shooters in the corners and a high-post passer.',
  },
  'zone_3pt:o': {
    text: (X, _Y, w) => `${X} found open threes against the zone${w}.`,
    advice: 'Your zone is giving up corner threes. Go back to man-to-man against good shooting teams.',
    uses: (t) => t.defense.scheme !== 'man',
  },
  'zone_3pt:d': { text: (X) => `${possessive(X)} 3-2 zone ran shooters off the three-point line.` },
  'zone_glass:o': {
    text: (X) => `${X} crashed the offensive glass against the zone.`,
    advice: 'Zones struggle to box out; play man against strong rebounding teams.',
    uses: (t) => t.defense.scheme !== 'man',
  },
  'help_paint:d': {
    text: (X) => `${X} packed the paint and contested drives at the rim.`,
    advice: 'Space the floor with more shooters, and raise Three-point emphasis (Offense) to punish help.',
  },
  'help_paint:o': {
    text: (X, Y) => `${Y} stayed home on shooters, leaving driving lanes open for ${X}.`,
    advice: 'Raise Help defense (Defense) against teams that live at the rim.',
    uses: (t) => t.defense.help < 50,
  },
  'help_kick:o': {
    text: (X, _Y, w) => `${X} punished heavy help with kick-out threes${w}.`,
    advice: 'Lower Help defense (Defense) to stay home on good shooting teams.',
    uses: (t) => t.defense.help > 50,
  },
  'help_kick:d': { text: (X) => `${X} stayed home and ran shooters off the line.` },
  'spacing:o': { text: (X) => `${possessive(X)} floor spacing opened driving lanes.` },
  'spacing:d': {
    text: (X, Y) => `${possessive(Y)} cramped spacing let ${X} load up the paint.`,
    advice: 'Play more shooters together: check Rotation for lineups with two non-shooters.',
  },
  'pressure_to:d': {
    text: (X) => `${possessive(X)} ball pressure forced turnovers.`,
    advice: 'Give the ball to your most secure handlers, or run more Handoffs & screens (Offense > Actions) against pressure.',
  },
  'pressure_to:o': {
    text: (X, Y) => `${Y} played soft on the ball, so ${X} rarely turned it over.`,
    advice: 'Turn up Ball pressure (Defense) against shaky ball handlers.',
    uses: (t) => t.defense.pressure < 50,
  },
  'pressure_blowby:o': {
    text: (X, _Y, w) => `${possessive(X)} handlers blew by aggressive on-ball defenders${w}.`,
    advice: 'Back off the Ball pressure (Defense) against quick creators.',
    uses: (t) => t.defense.pressure > 50,
  },
  'pressure_blowby:d': { text: (X) => `${X} contained the ball and kept handlers in front.` },
  'pressure_foul:o': {
    text: (X, _Y, w) => `${X} drew reach-in fouls against aggressive ball pressure${w}.`,
    advice: 'Lower Ball pressure (Defense) once you are in the penalty.',
    uses: (t) => t.defense.pressure > 50,
    cat: 'fouls',
  },
  'pressure_foul:d': { text: (X) => `${X} contained without reaching, staying out of the penalty.`, cat: 'fouls' },
  'pressure_backdoor:o': { text: (X) => `${X} beat overplays with backdoor cuts.` },
  'press_to:d': { text: (X) => `${possessive(X)} full-court press created turnovers.` },
  'press_break:o': {
    text: (X) => `${X} broke the press for easy baskets.`,
    advice: 'Your press is being broken. Turn it off against good ball-handling teams (Defense > Full-court press).',
    uses: (t) => t.defense.press !== 'none',
  },
  'crash_orb:o': {
    text: (X) => `${possessive(X)} offensive rebounding created second chances.`,
    advice: 'Play a better defensive rebounder at center, and make them pay for crashing: push the ball off defensive rebounds (Offense > Push in transition).',
  },
  'crash_orb:d': { text: (X, Y) => `${Y} got back on defense instead of crashing, conceding the glass to ${X}.` },
  'crash_leak:o': {
    text: (X, Y) => `${X} got out in transition because ${Y} crashed the offensive glass.`,
    advice: 'Crash the offensive glass less (Offense) if you keep giving up run-outs.',
    uses: (t) => t.offense.crashBoards > 50,
  },
  'crash_leak:d': { text: (X) => `${X} sent players back instead of crashing, limiting run-outs.` },
  'getback:d': { text: (X) => `${possessive(X)} transition defense limited fast breaks.` },
  'getback:o': {
    text: (X, Y) => `${possessive(Y)} slow transition defense gave ${X} run-outs.`,
    advice: 'Raise Transition defense (Defense) against fast teams.',
    uses: (t) => t.defense.getBack < 50,
  },
  'transition:o': { text: (X) => `${X} pushed the pace for transition chances.`, cat: 'pace' },
  'transition:d': {
    text: (X, Y) => `${Y} rarely pushed in transition, letting ${X} set their defense.`,
    advice: 'Push the ball after stops and steals (Offense > Push in transition).',
    uses: (t) => t.offense.transition < 50,
    cat: 'pace',
  },
  'star_deny:d': {
    text: (X, _Y, w) => `${X} face-guarded the star, so he caught the ball late and far from the basket${w}.`,
    advice: 'Against a deny, run the star off screens and handoffs, and let others start the offense.',
  },
  'star_double:d': {
    text: (X, _Y, w) => `${possessive(X)} double teams took the ball out of the star's hands${w}.`,
    advice: 'When the star gets doubled, surround him with shooters and passers.',
  },
  'double_kick:o': {
    text: (X, _Y, w) => `${X} punished double teams with open looks${w}.`,
    // doubles come from the Star plan, and from heavy help on drives and post-ups
    advice: 'Stop doubling a good passer when his teammates can shoot: no Star plan double, less Help defense (Defense).',
    uses: (t) => t.defense.starPlan === 'double' || t.defense.help > 50,
  },
  'mismatch_post:o': { text: (X, _Y, w) => `${X} posted up smaller defenders${w}.` },
  'physicality:o': {
    text: (X) => `${X} drew fouls against an overly physical defense.`,
    advice: 'Lower Physicality (Defense) to cut down free throws.',
    uses: (t) => t.defense.physicality > 50,
    cat: 'fouls',
  },
  'physicality:d': { text: (X) => `${possessive(X)} physical defense won more on tighter contests than it gave up in fouls.`, cat: 'fouls' },
  'clean_defense:o': {
    text: (X, Y) => `${X} got clean looks against ${possessive(Y)} foul-wary defense.`,
    advice: 'Raise Physicality (Defense) to contest harder.',
    uses: (t) => t.defense.physicality < 50,
    cat: 'fouls',
  },
  'clean_defense:d': { text: (X) => `${X} defended without fouling, keeping the opponent off the line.`, cat: 'fouls' },
  'fatigue:d': {
    text: (_X, Y) => `${Y} wore down: tired legs cost them shooting accuracy.`,
    advice: 'Shorten stints (Rotation), or raise "Sub out tired players at" (Game Mgmt) to sub tired players out sooner; heavy minutes cost shooting.',
    cat: 'fatigue',
  },
  'box_chase:d': {
    text: (X, _Y, w) => `${possessive(X)} chasers took their man out of the offense: fewer touches, late catches, few clean looks${w}.`,
    advice:
      'Against a box-and-one or triangle-and-two, run the chased player off screens and handoffs and let the others attack the zone with ball movement (Offense > Motion & cuts, Handoffs & screens).',
    uses: (t) => t.offense.actions.motion < 75 || t.offense.actions.handoff < 65,
  },
  'box_open:o': {
    text: (X, _Y, w) => `${X} found open threes and gaps against the junk defense${w}.`,
    advice: 'The players your junk defense leaves to the zone are making it pay: go back to man-to-man (Defense > Base scheme).',
    uses: (t) => isJunk(t.defense.scheme),
  },
  'box_beat:o': {
    text: (X, _Y, w) => `${possessive(X)} chased player beat a defender caught high, on the catch and backdoor${w}.`,
    advice: 'Your chaser is getting beaten off the dribble and backdoor: chase him with a quicker defender (Matchups), or go back to man-to-man (Defense > Base scheme).',
    uses: (t) => isJunk(t.defense.scheme),
  },
  'pd_under:o': {
    text: (X, Y, w) => `${X} made ${Y} pay for going under screens with pull-up jumpers${w}.`,
    advice: 'Stop going under on a handler who can shoot off the dribble (Matchups > How to guard him).',
    uses: (t) => instructs(t, 'under'),
  },
  'pd_under:d': { text: (X, _Y, w) => `${X} went under screens and kept the handler out of the paint${w}.` },
  'pd_tight:o': {
    text: (X, Y, w) => `${X} beat ${possessive(Y)} top-locks with drives and back-cuts${w}.`,
    advice: 'Stop running a shooter off the line when he can put it on the floor (Matchups > How to guard him).',
    uses: (t) => instructs(t, 'tight'),
  },
  'pd_tight:d': { text: (X, _Y, w) => `${X} ran shooters off the three-point line${w}.` },
  'pd_sag:o': {
    text: (X, Y, w) => `${X} made ${Y} pay for sagging off them with open kick-out shots${w}.`,
    advice: 'Stop sagging off a player who makes open threes (Matchups > How to guard him).',
    uses: (t) => instructs(t, 'sag'),
  },
  'pd_sag:d': { text: (X) => `${X} sagged off non-shooters and walled off the rim.` },
  'pd_body:o': {
    text: (X, Y, w) => `${X} drew fouls against ${possessive(Y)} physical defense${w}.`,
    advice: 'Stop getting physical with a player who draws fouls and makes his free throws (Matchups > How to guard him).',
    uses: (t) => instructs(t, 'body'),
    cat: 'fouls',
  },
  'pd_body:d': { text: (X, _Y, w) => `${possessive(X)} physical defense made post-ups and drives hard work${w}.` },
  'hunt:o': {
    text: (X, _Y, w) => `${X} hunted a weak link in the defense with isolations and ball screens${w}.`,
    advice: 'Hide the defender they hunt on their weakest scorer (Matchups), or sub him out.',
  },
  'hunt:d': {
    text: (_X, Y) => `${possessive(Y)} hunt for one defender cost them ball movement and good looks.`,
    advice: 'Hunting one defender costs ball movement: keep it for a real weak link, or stop the hunt (Plan > Attack a defender).',
    uses: (t) => t.offense.huntTarget != null,
  },
  'foul_give:d': { text: (X) => `${possessive(X)} fouls to give broke up last-shot plays.` },
  'foul_give:o': {
    text: (X, _Y, w) => `${X} got free throws when a foul to give came on the shot${w}.`,
    advice: 'A foul to give has to come before the shot: turn it off if it keeps sending them to the line (Game Mgmt).',
    uses: (t) => !!t.manage.foulToGive,
    cat: 'fouls',
  },
  'hack:d': { text: (X, _Y, w) => `${possessive(X)} Hack-a strategy paid off${w}.` },
  'hack:o': {
    text: (X, _Y, w) => `${X} made the free throws when intentionally fouled${w}.`,
    advice: 'Hack-a only works against truly bad free-throw shooters: lower the Hack-a-player threshold (Game Mgmt) or drop the target from your game plan.',
    uses: (t) => hacks(t.manage),
  },
};

/** A set's edge against the defense it met (X the offense when it paid, the defense when it didn't), and what the defense's reads took back. */
const SET_TEXT: Record<SetId, { o: Tpl['text']; d: Tpl['text'] }> = {
  spain: {
    o: (X, _Y, w) => `${X} freed the roll man with Spain pick-and-rolls${w}.`,
    d: (X, _Y, w) => `${possessive(X)} defense left Spain's back screen nothing to hit${w}.`,
  },
  horns: {
    o: (X, _Y, w) => `${X} found elbow handoffs and pick-and-pops out of Horns${w}.`,
    d: (X, _Y, w) => `${X} sat on the elbows and took Horns away${w}.`,
  },
  floppy: {
    o: (X, _Y, w) => `${possessive(X)} shooters came off Floppy screens open${w}.`,
    d: (X, _Y, w) => `${X} switched Floppy's screens and took the shooter's look away${w}.`,
  },
  elevator: {
    o: (X, _Y, w) => `${X} got shooters open through the elevator doors${w}.`,
    d: (X, _Y, w) => `${X} kept the shooter out of the elevator doors${w}.`,
  },
  hammer: {
    o: (X, _Y, w) => `${X} found the corner three off Hammer drives${w}.`,
    d: (X, _Y, w) => `${X} stayed home on the corner and beat the hammer screen${w}.`,
  },
  chicago: {
    o: (X, _Y, w) => `${X} ran Chicago, a pin-down into a handoff, for open looks${w}.`,
    d: (X, _Y, w) => `${X} took away Chicago's pin-down and handoff${w}.`,
  },
  postSplit: {
    o: (X, _Y, w) => `${X} split cutters around the post for easy looks${w}.`,
    d: (X, _Y, w) => `${X} took away the cutters splitting around the post${w}.`,
  },
};

for (const id of SET_IDS) {
  IMPACT_TEXT[`set_${id}:o`] = { text: SET_TEXT[id].o };
  IMPACT_TEXT[`set_${id}:d`] = {
    text: SET_TEXT[id].d,
    advice: `${SETS[id].name} doesn't work against this defense: take it out of your set package (Offense > Set package), or call something else.`,
    uses: (t) => !!t.offense.sets?.includes(id),
  };
}
// (a read always pays the defense)
IMPACT_TEXT['set_read:d'] = {
  text: (X, _Y, w) => `${X} read the sets they kept seeing: their looks came up covered and their passes got jumped${w}.`,
  advice:
    "Call each set a few times a game, not every trip: the more a defense sees one, the less open its look (better coaches read them faster). Your package drops a set once they're on it; a call runs it anyway.",
};

/** "Halftime: the Thunder lead the Celtics 55-50. Biggest factor so far: …" (the factor that went the leader's way, the biggest one when tied). */
function partialHeadline(us: string, them: string, a: number, b: number, periods: number, top?: string) {
  const score = a === b ? `the ${us} and the ${them} are tied at ${a}` : `the ${us} ${a > b ? 'lead' : 'trail'} the ${them} ${Math.max(a, b)}-${Math.min(a, b)}`;
  return `${breakLabel(periods)}: ${score}.${top ? ` Biggest factor so far: ${top}.` : ''}`;
}

/** Advice for the team an effect hurt, unless its tactics no longer use what caused it. */
export function impactAdvice(key: string, hurt: Tactics): string | undefined {
  const tpl = IMPACT_TEXT[key];
  return tpl?.advice && tpl.uses?.(hurt) !== false ? tpl.advice : undefined;
}

function names(league: League, im: TacticImpact, max = 2) {
  const top = Object.entries(im.players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([pid]) => league.players[+pid]?.lastName)
    .filter(Boolean);
  return top.length ? ` (${top.join(', ')})` : '';
}

function fourFactors(t: TeamBox, o: TeamBox) {
  const efg = (t.t.fgm + 0.5 * t.t.tpm) / Math.max(1, t.t.fga);
  const tov = t.t.tov / Math.max(1, t.t.fga + 0.44 * t.t.fta + t.t.tov);
  const orb = t.t.orb / Math.max(1, t.t.orb + o.t.drb);
  const ftr = t.t.ftm / Math.max(1, t.t.fga);
  return { efg, tov, orb, ftr };
}

export interface GameReport {
  headline: string;
  userWon: boolean;
  factors: Factor[];
  fourFactors: { user: ReturnType<typeof fourFactors>; opp: ReturnType<typeof fourFactors> };
  playTypes: { key: string; label: string; userPoss: number; userPpp: number; oppPoss: number; oppPpp: number }[];
  runs: { side: 'user' | 'opp'; pts: number; startIdx: number; endIdx: number; text: string }[];
  lineups: { pids: number[]; min: number; pm: number; netRtg: number }[];
  grades: { pid: number; grade: string; note: string }[];
  /** The user's sets (and clear-out isolations) run, most run first. */
  sets: SetLine[];
}

/** One set's night for a side: "Elevator: 3 runs, 0.67 PPP, read by the 3rd". */
export interface SetLine {
  id: SetId | 'iso';
  name: string;
  runs: number;
  pts: number;
  ppp: number;
  /** The run the defense was on it by, if it got there. */
  readAt?: number;
}

const nth = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? `${n}st` : n % 10 === 2 && n % 100 !== 12 ? `${n}nd` : n % 10 === 3 && n % 100 !== 13 ? `${n}rd` : `${n}th`);

/** The sets side `side` ran in a game (or so far), most run first. */
export function setLines(res: Pick<GameResult, 'sets'>, side: 0 | 1): SetLine[] {
  return (res.sets ?? [])
    .filter((x) => x.t === side)
    .map((x) => ({ id: x.id, name: x.id === 'iso' ? CLEAR_OUT.name : SETS[x.id].name, runs: x.runs, pts: x.pts, ppp: x.pts / x.runs, ...(x.readAt ? { readAt: x.readAt } : {}) }))
    .sort((a, b) => b.runs - a.runs || b.pts - a.pts);
}

/** "3 runs, 0.67 PPP, read by the 3rd". */
export function setLineText(l: SetLine): string {
  return `${l.runs} run${l.runs === 1 ? '' : 's'}, ${l.ppp.toFixed(2)} PPP${l.readAt ? `, read by the ${nth(l.readAt)}` : ''}`;
}

export interface ReportOptions {
  /** A game still being played, stopped at a break (the Live screen's period report): "so far" wording, star lines scaled to the time played. */
  partial?: boolean;
  /** Game seconds played so far (partial reports); defaults to the periods the box score has. */
  elapsed?: number;
  /** The tactics the user's team is playing with now, for advice (defaults to its saved tactics). */
  tactics?: Tactics;
}

/** "Halftime", "After Q3", "End of regulation", "After OT": a break `periods` periods in. */
function breakLabel(periods: number) {
  if (periods === 2) return 'Halftime';
  if (periods < 4) return `After Q${periods}`;
  if (periods === 4) return 'End of regulation';
  return periods === 5 ? 'After OT' : `After ${periods - 4}OT`;
}

export function buildGameReport(league: League, res: GameResult, userTid = league.userTid, opts: ReportOptions = {}): GameReport | null {
  const userSide: 0 | 1 = res.home.tid === userTid ? 0 : res.away.tid === userTid ? 1 : 0;
  const u = userSide === 0 ? res.home : res.away;
  const o = userSide === 0 ? res.away : res.home;
  const ut = league.teams[u.tid];
  const ot = league.teams[o.tid];
  const userWon = u.pts > o.pts;
  const factors: Factor[] = [];
  const tactics = opts.tactics ?? ut.tactics;
  const periods = Math.max(res.home.quarters.length, 1);
  // the share of a full game played: star lines are measured against it
  const played = opts.partial ? Math.min(1, (opts.elapsed ?? Math.min(periods, 4) * GAME.quarterSec) / (4 * GAME.quarterSec)) : 1;

  // tactical impacts
  for (const im of res.impacts ?? []) {
    const tpl = IMPACT_TEXT[im.key];
    if (!tpl || im.pts < 0.6) continue;
    const benefitUser = im.t === userSide;
    const X = teamRef(benefitUser ? ut : ot);
    const Y = teamRef(benefitUser ? ot : ut);
    factors.push({
      title: impactSentence(im.key, X, Y, names(league, im)),
      detail: `Worth about ${im.pts.toFixed(1)} points over ${im.count} play${im.count === 1 ? '' : 's'}.`,
      pts: benefitUser ? im.pts : -im.pts,
      category: tpl.cat ?? 'tactics',
      advice: benefitUser ? undefined : impactAdvice(im.key, tactics),
      key: im.key,
    });
  }

  // four factors
  const fu = fourFactors(u, o);
  const fo = fourFactors(o, u);
  const efgSwing = (((fu.efg - fo.efg) * (u.t.fga + o.t.fga)) / 2) * 2;
  if (Math.abs(efgSwing) >= 3) {
    const better = efgSwing > 0 ? ut.name : ot.name;
    factors.push({
      title: `The ${better} shot it better: eFG ${(Math.max(fu.efg, fo.efg) * 100).toFixed(1)}% vs ${(Math.min(fu.efg, fo.efg) * 100).toFixed(1)}%.`,
      detail: `${ut.abbrev} ${u.t.fgm}/${u.t.fga} (${u.t.tpm}/${u.t.tpa} 3PT) · ${ot.abbrev} ${o.t.fgm}/${o.t.fga} (${o.t.tpm}/${o.t.tpa} 3PT)`,
      pts: efgSwing,
      category: 'shooting',
    });
  }
  const tovSwing = (o.t.tov - u.t.tov) * 1.05;
  if (Math.abs(tovSwing) >= 3) {
    factors.push({
      title: `Turnover battle: ${ut.abbrev} ${u.t.tov}, ${ot.abbrev} ${o.t.tov}.`,
      detail: `Each turnover costs about a point, more when it is a live-ball steal. Points off turnovers: ${ut.abbrev} ${u.extra.offTov}, ${ot.abbrev} ${o.extra.offTov}.`,
      pts: tovSwing,
      category: 'turnovers',
      advice: tovSwing < 0 ? 'Shift creation to your most secure ball handlers (Tactics > Roles) or lower the pace.' : undefined,
    });
  }
  const orbSwing = (u.t.orb - o.t.orb) * 1.05;
  if (Math.abs(orbSwing) >= 3) {
    factors.push({
      title: `Offensive rebounds: ${ut.abbrev} ${u.t.orb}, ${ot.abbrev} ${o.t.orb}.`,
      detail: `Second-chance points: ${ut.abbrev} ${u.extra.secondChance}, ${ot.abbrev} ${o.extra.secondChance}.`,
      pts: orbSwing,
      category: 'rebounding',
      // your own crashing only changes your own offensive boards
      advice:
        orbSwing < 0
          ? 'Play better defensive rebounders, and avoid a zone against strong rebounding teams; to win the glass yourself, raise Crash the offensive glass (Offense).'
          : undefined,
    });
  }
  const ftSwing = (u.t.ftm - o.t.ftm) * 0.6;
  if (Math.abs(ftSwing) >= 3) {
    factors.push({
      title: `Free throws: ${ut.abbrev} ${u.t.ftm}/${u.t.fta}, ${ot.abbrev} ${o.t.ftm}/${o.t.fta}.`,
      detail: 'Free-throw volume comes from rim pressure and foul-drawing ability, and from defensive Physicality.',
      pts: ftSwing,
      category: 'fouls',
    });
  }

  // star performances
  for (const [side, box, sign] of [
    [ut, u, 1],
    [ot, o, -1],
  ] as const) {
    const star = [...box.players].sort((a, b) => b.pts - a.pts)[0];
    // 35 in a full game; at a break, the same pace (and never fewer than 8)
    if (star && star.pts >= Math.max(8, 35 * played)) {
      factors.push({
        title: opts.partial
          ? `${star.name} has ${star.pts} points so far (${star.fgm}/${star.fga} FG).`
          : `${star.name} erupted for ${star.pts} points (${star.fgm}/${star.fga} FG).`,
        // (no pace to be on once regulation is played)
        detail: opts.partial && played < 1 ? `On pace for ${Math.round(star.pts / played)}.` : `The ${side.name} rode their star.`,
        pts: sign * (star.pts - 22 * played) * 0.5,
        category: 'stars',
        // (not named: a Star plan goes after their primary creator, who isn't always the scorer)
        advice:
          sign < 0 && tactics.defense.starPlan === 'none'
            ? opts.partial
              ? 'Try a Star plan (Defense): deny him the ball or double him.'
              : 'Next time try a Star plan (Defense): deny him the ball or double him.'
            : undefined,
      });
    }
  }

  factors.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));

  // play types
  const keys = new Set([...Object.keys(u.playTypes), ...Object.keys(o.playTypes)]);
  const playTypes = [...keys]
    .map((k) => {
      const a = u.playTypes[k] ?? { poss: 0, pts: 0 };
      const b = o.playTypes[k] ?? { poss: 0, pts: 0 };
      return { key: k, label: FINISH_LABEL[k as FinishType] ?? k, userPoss: a.poss, userPpp: a.poss ? a.pts / a.poss : 0, oppPoss: b.poss, oppPpp: b.poss ? b.pts / b.poss : 0 };
    })
    .filter((x) => x.userPoss + x.oppPoss > 0)
    .sort((a, b) => b.userPoss + b.oppPoss - (a.userPoss + a.oppPoss));

  // runs from the score flow (home - away margin per possession)
  const runs: GameReport['runs'] = [];
  const flow = res.flow ?? [];
  if (flow.length > 4) {
    const userMargin = flow.map((m) => (userSide === 0 ? m : -m));
    let i = 0;
    while (i < userMargin.length - 1) {
      let j = i;
      let best = 0;
      let bestJ = i;
      // greedy: extend while the run continues in one direction
      const dir = Math.sign(userMargin[i + 1] - userMargin[i]) || 1;
      while (j < userMargin.length - 1) {
        j++;
        const swing = (userMargin[j] - userMargin[i]) * dir;
        if (swing > best) {
          best = swing;
          bestJ = j;
        }
        // run broken when the other side scores 5+ back from the peak
        const back = (userMargin[bestJ] - userMargin[j]) * dir;
        if (back >= 5) break;
      }
      if (best >= 10) {
        runs.push({ side: dir > 0 ? 'user' : 'opp', pts: best, startIdx: i, endIdx: bestJ, text: `${dir > 0 ? ut.abbrev : ot.abbrev} ${best}-point swing` });
        i = bestJ;
      } else i++;
    }
  }

  // lineups
  const lineups = (res.lineups ?? [])
    .filter((l) => l.t === userSide && l.sec >= 180)
    .map((l) => ({ pids: l.pids, min: l.sec / 60, pm: l.ptsFor - l.ptsAgainst, netRtg: l.poss ? ((l.ptsFor - l.ptsAgainst) / l.poss) * 100 : 0 }))
    .sort((a, b) => b.pm - a.pm);

  // player grades, quoting the box score's whole minutes (rounding each line alone can be a minute off)
  const minutes = wholeMinutes(u.players);
  const grades = u.players
    .filter((p) => p.min >= 6)
    .map((bl) => {
      const p = league.players[bl.pid];
      const gmsc = bl.pts + 0.4 * bl.fgm - 0.7 * bl.fga - 0.4 * (bl.fta - bl.ftm) + 0.7 * bl.orb + 0.3 * bl.drb + bl.stl + 0.7 * bl.ast + 0.7 * bl.blk - 0.4 * bl.pf - bl.tov;
      const expected = p ? ((p.ovr - 55) / 40) * 16 * (bl.min / 34) : 8;
      const score = gmsc - expected + bl.pm * 0.15;
      const grade = score >= 8 ? 'A+' : score >= 5 ? 'A' : score >= 2.5 ? 'B+' : score >= 0 ? 'B' : score >= -2.5 ? 'C+' : score >= -5 ? 'C' : score >= -8 ? 'D' : 'F';
      const note = `${bl.pts} pts, ${bl.orb + bl.drb} reb, ${bl.ast} ast, ${bl.pm >= 0 ? '+' : ''}${bl.pm} in ${minutes(bl.pid)} min`;
      return { pid: bl.pid, grade, note };
    });

  const margin = Math.abs(u.pts - o.pts);
  // the biggest factor that went the winner's way (the biggest of all can favor the loser)
  const top = factors.find((f) => f.pts > 0 === userWon);
  // "Turnover battle: NYK 18, CLE 11" reads "Turnover battle (NYK 18, CLE 11)" after the headline's own colon
  const topText = top?.title.replace(/\.$/, '').replace(/: (.+)$/, ' ($1)');
  const how = res.ot ? ` in ${res.ot > 1 ? `${res.ot}OT` : 'OT'}` : margin <= 3 ? ' in a nail-biter' : margin >= 20 ? ' in a rout' : '';
  const headline = opts.partial
    ? partialHeadline(ut.name, ot.name, u.pts, o.pts, periods, (u.pts === o.pts ? factors[0] : top)?.title.replace(/\.$/, '').replace(/: (.+)$/, ' ($1)'))
    : `The ${ut.name} ${userWon ? 'beat' : 'fell to'} the ${ot.name} ${Math.max(u.pts, o.pts)}-${Math.min(u.pts, o.pts)}${how}.${topText ? ` Biggest factor: ${topText}.` : ''}`;
  return {
    headline,
    userWon,
    factors: factors.slice(0, 8),
    fourFactors: { user: fu, opp: fo },
    playTypes,
    runs: runs.sort((a, b) => b.pts - a.pts).slice(0, 4),
    lineups: lineups.slice(0, 6),
    grades,
    sets: setLines(res, userSide),
  };
}
