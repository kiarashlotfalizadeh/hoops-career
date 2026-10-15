// The assistant coach: opponent scouting, counter-tactic candidates (verified with lab sims
// in a worker), and alerts about rotation/tactics issues on your own team.

import type { ActionType, League, Player, PlayerDefense, PnrCoverage, SetId, Tactics } from '../types';
import { SET_IDS } from '../types';
import type { FinishType } from '../sim/log';
import { composites, ROLE_META } from '../ratings';
import { ACTION_META, DEF_PRESETS, OFF_PRESETS, COVERAGE_META, SCHEME_META, cloneTactics, isJunk, stopHacking } from '../sim/tactics';
import { CRAMPED_SPACING, defPresetFit, evaluateLineup, fitRoster, fitScale, offPresetFit, rosterProfile, sustainableMinutes } from './coachAI';
import { applyPatch, type Candidate } from './lab';
import { effectiveTactics, itemGroup, planFor } from '../league/gamePlans';
import { scoutData } from '../analysis/scouting';
import { playerName, rosterSorted, teamPlayers } from '../league/helpers';
import { complaints } from '../league/morale';
import { IMPACT_TEXT, possessive } from '../analysis/gameReport';
import { castThrees, leagueThreePct } from './opponentPlan';
import { huntPick } from '../analysis/guarding';
import { defenseLabel, offenseLabel } from '../sim/playbooks';
import { SETS } from '../sim/sets';

export interface Threat {
  pid: number;
  name: string;
  why: string;
}

export interface ScoutReport {
  tid: number;
  summary: string;
  offense: string[];
  defense: string[];
  threats: Threat[];
  weaknesses: string[];
}

function rotationPlayers(league: League, tid: number, n = 8): Player[] {
  const team = league.teams[tid];
  const healthy = rosterSorted(league, tid).filter((p) => !p.injury);
  return healthy.sort((a, b) => (team.rotation.minutes[b.pid] ?? 0) - (team.rotation.minutes[a.pid] ?? 0)).slice(0, n);
}

/** A team's rotation as scouting and counters read it: its creators, best first, and how the five who play most space the floor and handle the ball. */
function readRotation(league: League, tid: number) {
  const rot = rotationPlayers(league, tid);
  const cs = rot.map((p) => ({ p, c: composites(p.ratings) }));
  const creators = [...cs].sort((a, b) => b.c.pnrHandle + b.c.create - (a.c.pnrHandle + a.c.create));
  const five = cs.slice(0, 5);
  const avg = (f: (c: (typeof cs)[number]['c']) => number) => five.reduce((a, x) => a + f(x.c), 0) / Math.max(1, five.length);
  return { rot, cs, creators, spacing: avg((c) => c.spacing), security: avg((c) => c.ballSec) };
}

/** A big that opponents hunt on switches. */
const slowBig = (p: Player) => p.ratings.hgt >= 60 && p.ratings.spd < 40;

/** A player's complaints as sentences, or `none` when he has nothing specific. */
const moodText = (p: Player, none: string) => {
  const gripes = complaints(p);
  return gripes.length ? `${gripes.join('. ')}.` : none;
};

const pct = (x: number) => Math.round(x);

export function scoutTeam(league: League, tid: number): ScoutReport {
  const team = league.teams[tid];
  const { cs, creators, spacing, security } = readRotation(league, tid);
  const t = team.tactics;
  // a playbook whose sliders have moved reads "Custom (Balanced base)", not the preset's name
  const offName = offenseLabel(t);
  const defName = defenseLabel(t);
  const shooters = [...cs].sort((a, b) => b.c.c3 - a.c.c3);
  const protector = [...cs].sort((a, b) => b.c.rimProt - a.c.rimProt)[0];
  const offense: string[] = [];
  const defense: string[] = [];
  // with enough games, what the numbers show comes first, then what the playbook and roster suggest
  const data = scoutData(league, tid);
  const weaknesses: string[] = data.enough ? [...data.exploits] : [];
  offense.push(`Runs ${offName} at a ${t.offense.pace >= 65 ? 'fast' : t.offense.pace <= 35 ? 'slow' : 'moderate'} pace.`);
  const topAct = (Object.entries(t.offense.actions) as [ActionType, number][]).sort((a, b) => b[1] - a[1])[0][0];
  offense.push(`Favorite action: ${ACTION_META[topAct].label}.`);
  if (t.offense.threePoint >= 70) offense.push('Lives behind the arc.');
  if (t.offense.crashBoards >= 65) offense.push('Crashes the offensive glass hard, which leaves them open to run-outs.');
  // ball-screen coverages and off-ball switching only apply in man-to-man: a zone plays its zone
  const man = t.defense.scheme === 'man';
  const scheme = SCHEME_META[t.defense.scheme].label;
  defense.push(
    man
      ? `Plays ${defName}: ${COVERAGE_META[t.defense.pnr].label.toLowerCase()} coverage on ball screens.`
      : `Plays ${defName !== scheme ? `${defName} in a ${scheme}` : scheme}, so there is no ball-screen coverage to attack.`,
  );
  if (t.defense.press !== 'none') defense.push('Uses a full-court press, so secure ball handlers matter.');
  if (t.defense.help >= 65) defense.push('Helps aggressively off shooters into the paint.');
  if (t.defense.pressure >= 65) defense.push('Pressures the ball, which invites backdoor cuts and blow-bys.');
  if (spacing < CRAMPED_SPACING) weaknesses.push(`Poor spacing (${pct(spacing)}): pack the paint and dare them to shoot.`);
  if (security < 52 && !weaknesses.some((w) => w.startsWith('Loose with the ball'))) weaknesses.push('Loose with the ball: pressure and traps should force turnovers.');
  if (protector && protector.c.rimProt < 55) weaknesses.push('No real rim protection: attack the basket.');
  if (man && t.defense.pnr === 'drop') weaknesses.push('Drop coverage concedes pull-up jumpers and popping bigs.');
  // (a switch on a ball screen leaves him on a guard; switching off-ball screens doesn't)
  if (man && t.defense.pnr === 'switch') {
    const slow = cs.filter((x) => slowBig(x.p));
    if (slow.length) weaknesses.push(`Switching with a slow big (${slow[0].p.lastName}): hunt that mismatch.`);
  }
  if (man && t.defense.pnr === 'blitz') weaknesses.push('Blitzes ball screens: a good passing handler or short-roll big can carve up the 4-on-3.');
  const threats: Threat[] = [];
  if (creators[0]) {
    const role = t.offense.roles[creators[0].p.pid] ?? 'creator';
    threats.push({
      pid: creators[0].p.pid,
      name: playerName(creators[0].p),
      why: role === 'creator' ? `Primary creator, OVR ${creators[0].p.ovr}.` : `Best shot creator, used as their ${ROLE_META[role].label.toLowerCase()}, OVR ${creators[0].p.ovr}.`,
    });
  }
  if (shooters[0] && shooters[0].p !== creators[0]?.p)
    threats.push({ pid: shooters[0].p.pid, name: playerName(shooters[0].p), why: `Best shooter (3PT ${pct(shooters[0].p.ratings.tp)}). Don't leave him open.` });
  if (protector && !threats.some((x) => x.pid === protector.p.pid))
    threats.push({ pid: protector.p.pid, name: playerName(protector.p), why: `Anchors the paint (rim protection ${pct(protector.c.rimProt)}).` });
  const summary = `${team.region} ${team.name}: ${offName} offense, ${defName} defense. Watch ${threats[0]?.name ?? 'their starters'}.`;
  return { tid, summary, offense, defense, threats, weaknesses };
}

/**
 * The user's tactics against `opp` if counter `c` went into the game plan, replacing the plan's item
 * in its group (what the Lab tests and what Add on the game plan screen would play).
 */
export function tacticsWithCounter(league: League, opp: number, c: Pick<Candidate, 'id' | 'label' | 'group' | 'patch'>): Tactics {
  const plan = planFor(league, opp);
  const g = itemGroup(c);
  const items = [...(plan?.items ?? []).filter((x) => itemGroup(x) !== g), { id: c.id, label: c.label, group: c.group, patch: c.patch }];
  const view: League = { ...league, gamePlans: { ...league.gamePlans, [opp]: { oppTid: opp, items, matchups: plan?.matchups } } };
  return effectiveTactics(view, opp);
}

/**
 * Counters for the lab to test against a specific opponent, drafted against the tactics the user
 * plays them with now (the game plan for them included). Each names its game-plan group (a plan
 * keeps one item per group), slider changes to actions and shot profile are relative so they build
 * on whatever playbook is run, and counters the scouting numbers back carry that evidence and come
 * first. A counter already in the plan, or one that would change nothing, isn't offered.
 */
export function counterCandidates(league: League, userTid: number, oppTid: number): Candidate[] {
  const opp = league.teams[oppTid];
  const { rot, creators, spacing, security } = readRotation(league, oppTid);
  const top = creators[0];
  const forUser = userTid === league.userTid;
  const plan = forUser ? planFor(league, oppTid) : null;
  const cur = forUser ? effectiveTactics(league, oppTid) : cloneTactics(league.teams[userTid].tactics);
  const data = scoutData(league, oppTid);
  const backed = (id: string) => data.counters[id] !== undefined;
  const out: Candidate[] = [];
  const add = (c: Candidate) => out.push({ ...c, ...(data.counters[c.id] ? { evidence: data.counters[c.id] } : {}) });
  // coverages only apply in man-to-man, so from a zone each one is a change of scheme too (and a
  // zone and a coverage share a group: a plan plays one or the other)
  const zone = cur.defense.scheme !== 'man';
  const cov = (c: PnrCoverage, why: string, when: boolean) => {
    if ((when || backed(`cov-${c}`)) && (zone || cur.defense.pnr !== c))
      add({
        id: `cov-${c}`,
        label: `${COVERAGE_META[c].label} coverage`,
        why: zone ? `${why} You'd play man-to-man instead of your ${isJunk(cur.defense.scheme) ? SCHEME_META[cur.defense.scheme].label.toLowerCase() : 'zone'}.` : why,
        group: 'coverage',
        patch: { defense: { pnr: c, scheme: 'man', ...(c === 'switch' ? { switchOffBall: true } : {}) } },
      });
  };
  if (top) {
    const pull = (top.c.pu3 + top.c.midShot) / 2;
    cov('hedge', `${top.p.lastName} is a dangerous pull-up shooter; don't give him space.`, pull >= 60);
    cov('ice', `Keep ${top.p.lastName} out of the middle and off pull-up threes.`, pull >= 60);
    cov('blitz', `${top.p.lastName} is a shaky passer; trap him and make others beat you.`, top.c.passing < 55);
    cov('drop', 'Protect the rim and live with contested pull-ups.', top.c.passing >= 55);
    cov('switch', 'Switch everything to take away ball screens and handoffs.', true);
    // the player the numbers say they run through, else their best creator
    const star = (data.star !== undefined && league.players[data.star]) || top.p;
    const plans = [
      ['double', `Double-team ${star.lastName}`, `Force the ${possessive(opp.name)} supporting cast to beat you.`],
      ['deny', `Deny ${star.lastName}`, 'Keep the ball out of his hands without giving up 4-on-3s.'],
    ] as const;
    for (const [sp, label, why] of plans)
      if (cur.defense.starPlan !== sp || cur.defense.starTarget !== star.pid)
        add({ id: `star-${sp}`, label, why, group: 'star', patch: { defense: { starPlan: sp, starTarget: star.pid } } });
  }
  // spacing as scouting reads it: a zone only against the cramped fifth it flags, packing the
  // paint a little beyond that, staying home against about the best-spaced third; between those,
  // the numbers decide (never both at once)
  const packs = spacing < CRAMPED_SPACING + 4 || (spacing < 45 && backed('help-high') && !backed('help-low'));
  const stays = spacing >= 45 || (!packs && backed('help-low'));
  if (packs && cur.defense.help < 70)
    add({
      id: 'help-high',
      label: 'Pack the paint',
      why:
        spacing < CRAMPED_SPACING + 4
          ? `The ${opp.name} can't shoot (spacing ${Math.round(spacing)}). Sag off and protect the rim.`
          : `The ${opp.name} score inside. Sag off and protect the rim.`,
      group: 'help',
      patch: { defense: { help: 78 } },
    });
  if (stays && cur.defense.help > 40)
    add({
      id: 'help-low',
      label: 'Stay home on shooters',
      why: spacing >= 45 ? `The ${opp.name} space the floor well; don't over-help.` : `The ${opp.name} make open threes pay; don't over-help.`,
      group: 'help',
      patch: { defense: { help: 32 } },
    });
  if (spacing < CRAMPED_SPACING && cur.defense.scheme === 'man')
    add({ id: 'zone', label: SCHEME_META.zone23.label, why: 'Dare a poor-shooting team to beat you from outside.', group: 'coverage', patch: { defense: { scheme: 'zone23' } } });
  // junk defenses: their offense runs through one or two players (by the numbers) and everyone else
  // shoots threes worse than the league
  const heavy = data.enough ? data.players.filter((p) => !p.elsewhere && p.min >= 20).sort((a, b) => b.usg - a.usg) : [];
  const lgTp = leagueThreePct(league);
  for (const [n, scheme, id] of [
    [1, 'box1', 'box-1'],
    [2, 'tri2', 'tri-2'],
  ] as const) {
    const chased = heavy.slice(0, n);
    if (chased.length < n || chased[0].usg < 0.28 || (n === 2 && chased[1].usg < 0.25)) continue;
    const cast = castThrees(
      league,
      oppTid,
      chased.map((p) => p.pid),
    );
    if (!cast || !(lgTp - cast.pct >= 0.02)) continue;
    const names = chased.map((p) => league.players[p.pid]?.lastName ?? p.name);
    if (cur.defense.scheme === scheme && JSON.stringify(cur.defense.chase ?? []) === JSON.stringify(chased.map((p) => p.pid))) continue;
    out.push({
      id,
      label: `${SCHEME_META[scheme].label} on ${names.join(' and ')}`,
      why: `Face-guard ${names.join(' and ')} with ${n === 2 ? 'two of your best perimeter defenders' : 'one of your best perimeter defenders'} and zone the rest: their shooters can't make the open threes it leaves. You play man-to-man while ${n === 2 ? 'neither is' : "he isn't"} on the floor.`,
      group: 'coverage',
      evidence: `${chased.map((p) => `${p.name} uses ${Math.round(p.usg * 100)}% of their possessions`).join(', ')}; the rest make ${(cast.pct * 100).toFixed(1)}% of their threes (league ${(lgTp * 100).toFixed(1)}%).`,
      patch: { defense: { scheme, chase: chased.map((p) => p.pid) } },
    });
  }
  if ((security < 55 || backed('pressure-up')) && cur.defense.pressure < 70)
    add({ id: 'pressure-up', label: 'Turn up the pressure', why: 'Their ball handlers are loose with it.', group: 'pressure', patch: { defense: { pressure: 82 } } });
  if ((security < 52 || backed('press-on')) && cur.defense.press === 'none')
    add({
      id: 'press-on',
      label: 'Press after makes',
      why: 'Make their shaky handlers bring it up against full-court pressure (it costs your legs).',
      group: 'press',
      patch: { defense: { press: 'afterMade' } },
    });
  if (backed('getback') && cur.defense.getBack < 80)
    add({ id: 'getback', label: 'Sprint back', why: `The ${opp.name} live in transition: get back before anyone crashes.`, group: 'getback', patch: { defense: { getBack: 85 } } });
  if (backed('physicality-down') && cur.defense.physicality > 40)
    add({
      id: 'physicality-down',
      label: 'Defend without fouling',
      why: 'Keep them off the free-throw line: contest without reaching.',
      group: 'physicality',
      patch: { defense: { physicality: 35 } },
    });
  // offensive counters, as relative changes to the playbook (each in the group of its main action)
  const od = opp.tactics.defense;
  if (od.pnr === 'drop' && od.scheme === 'man')
    add({
      id: 'vs-drop',
      label: 'Attack the drop',
      why: 'Pull-up jumpers and handoffs beat drop coverage.',
      group: 'actions-pnr',
      patch: { nudge: { actions: { pnr: 20, handoff: 20 } } },
    });
  else if (backed('vs-drop'))
    out.push({
      id: 'more-pnr',
      label: 'More pick-and-roll',
      why: 'Their ball-screen defense is leaking points: get your handlers into it.',
      group: 'actions-pnr',
      evidence: data.counters['vs-drop'],
      patch: { nudge: { actions: { pnr: 20, handoff: 10 } } },
    });
  if (od.scheme === 'man' && (od.pnr === 'switch' || od.switchOffBall))
    add({
      id: 'vs-switch',
      label: 'Hunt mismatches',
      why: `They switch ${od.pnr !== 'switch' ? 'off-ball screens' : od.switchOffBall ? 'everything' : 'ball screens'}; isolate the weakest defender.`,
      group: 'actions-iso',
      patch: { offense: { huntMismatch: true }, nudge: { actions: { iso: 25, post: 15 } } },
    });
  if (od.scheme !== 'man' || od.help >= 65 || backed('vs-pack'))
    add({
      id: 'vs-pack',
      label: 'Spread & move',
      why: od.scheme !== 'man' || od.help >= 65 ? 'Beat packed defenses with motion and threes.' : 'Move the ball and let your shooters fire.',
      group: 'actions-motion',
      patch: { nudge: { offense: { threePoint: 18 }, actions: { motion: 25 } } },
    });
  if (od.pressure >= 65 || backed('vs-pressure'))
    add({
      id: 'vs-pressure',
      label: 'Backdoor & handoffs',
      why: od.pressure >= 65 ? 'Punish their overplays with cuts.' : 'Beat their aggressive hands with cuts and handoffs.',
      group: 'actions-handoff',
      patch: { nudge: { actions: { motion: 20, handoff: 15 } } },
    });
  // a real weak link on the perimeter: attack the man he guards
  const hunt = huntPick(league, oppTid);
  if (hunt?.worth && cur.offense.huntTarget !== hunt.pid) {
    const who = league.players[hunt.pid]?.lastName ?? '';
    add({
      id: 'hunt',
      label: `Attack ${who}`,
      why: `${who} is their weakest perimeter defender (${hunt.perDef}, their rotation ${hunt.teamPerDef}): run isolations and ball screens at the man he guards. It costs some ball movement.`,
      group: 'hunt',
      patch: { offense: { huntTarget: hunt.pid } },
    });
  }
  const oppProfile = rosterProfile(rot);
  // a post-up only helps with someone to feed: a big (or a strong wing) who scores on the block
  const poster = readRotation(league, userTid).cs.some((x) => x.c.postScore >= 58);
  if (poster && (oppProfile.size < 48 || backed('post-up')))
    add({
      id: 'post-up',
      label: 'Post them up',
      why: oppProfile.size < 48 ? `The ${opp.name} are small: feed the block.` : 'Their post defense is giving up points: feed the block.',
      group: 'actions-post',
      patch: { nudge: { actions: { post: 25 } } },
    });
  if (oppProfile.rimProtection < 58 || backed('attack-rim'))
    add({
      id: 'attack-rim',
      label: 'Attack the rim',
      why: oppProfile.rimProtection < 58 ? 'No rim protector to worry about.' : 'Get downhill and draw fouls.',
      group: 'rim',
      patch: { nudge: { offense: { rimAttack: 25 } } },
    });
  if ((oppProfile.athleticism < 50 || backed('pace-up')) && cur.offense.pace < 70)
    add({
      id: 'pace-up',
      label: 'Push the pace',
      why: oppProfile.athleticism < 50 ? `The ${opp.name} are slow; run on them.` : `The ${opp.name} don't defend in transition; run on them.`,
      group: 'pace',
      patch: { offense: { pace: 78, transition: 85 } },
    });
  if ((oppProfile.size < 48 || backed('crash')) && cur.offense.crashBoards < 70)
    add({
      id: 'crash',
      label: 'Crash the glass',
      why: oppProfile.size < 48 ? 'They are small; attack the offensive boards.' : "They don't finish defensive possessions with the rebound.",
      group: 'crash',
      patch: { offense: { crashBoards: 78 } },
    });
  // a counter in the plan already, or one that changes nothing (sliders at the limit), isn't worth simulating
  const inPlan = new Set(plan?.items.map((x) => x.id));
  const now = JSON.stringify(cur);
  const changes = (c: Candidate) => JSON.stringify(forUser ? tacticsWithCounter(league, oppTid, c) : applyPatch(cur, c.patch)) !== now;
  return out
    .filter((c) => !inPlan.has(c.id) && changes(c))
    .sort((a, b) => Number(!!b.evidence) - Number(!!a.evidence))
    .slice(0, 9);
}

export interface LiveCounter {
  label: string;
  /** Why the current tactics invite it, when that's the problem. */
  note?: string;
  apply: (t: Tactics) => void;
}

/**
 * The Live screen's one-tap answer to an opponent play type that's burning the defense: none
 * when the tactics already do it, so the button always changes something (and never pulls a
 * slider back from past its target).
 */
export function liveCounter(ft: FinishType, t: Tactics): LiveCounter | undefined {
  // ball-screen coverage only applies in man-to-man
  const man = t.defense.scheme === 'man';
  const cov = t.defense.pnr;
  let c: LiveCounter | undefined;
  if (ft === 'pnrBH' && man && cov === 'drop') c = { label: 'Switch to Hedge', note: 'Drop is giving their handlers room.', apply: (x) => void (x.defense.pnr = 'hedge') };
  else if (ft === 'spotup' && t.defense.help > 55) c = { label: 'Stay home', note: 'Too much help is leaving shooters open.', apply: (x) => void (x.defense.help = 35) };
  else if (ft === 'transition')
    c = {
      label: 'Sprint back',
      apply: (x) => void ((x.defense.getBack = Math.max(x.defense.getBack, 85)), (x.offense.crashBoards = Math.min(x.offense.crashBoards, 30))),
    };
  else if (ft === 'post') c = { label: 'Double the post', apply: (x) => void (x.defense.help = Math.max(x.defense.help, 80)) };
  else if (ft === 'pnrRoll' && man && cov !== 'drop') c = { label: 'Go to Drop', apply: (x) => void (x.defense.pnr = 'drop') };
  if (!c) return undefined;
  const after = cloneTactics(t);
  c.apply(after);
  return JSON.stringify(after) !== JSON.stringify(t) ? c : undefined;
}

/** The one-tap fix for each tactical edge an opponent can get on you, keyed like the engine's impact tags. */
const IMPACT_COUNTERS: Record<string, { label: string; apply: (t: Tactics) => void }> = {
  'drop_pullup:o': { label: 'Switch to Hedge', apply: (t) => void (t.defense.pnr = 'hedge') },
  'drop_pop:o': { label: 'Switch screens', apply: (t) => void (t.defense.pnr = 'switch') },
  'drop_handoff:o': { label: 'Switch off-ball screens', apply: (t) => void (t.defense.switchOffBall = true) },
  'switch_mismatch:o': { label: 'Go to Drop', apply: (t) => void (t.defense.pnr = 'drop') },
  'hedge_roll:o': { label: 'Go to Drop', apply: (t) => void (t.defense.pnr = 'drop') },
  'blitz_4v3:o': {
    label: 'Stop trapping',
    apply: (t) => {
      if (t.defense.pnr === 'blitz') t.defense.pnr = 'hedge';
      if (t.defense.starPlan === 'double') t.defense.starPlan = 'none';
    },
  },
  'zone_3pt:o': { label: 'Go man-to-man', apply: (t) => void (t.defense.scheme = 'man') },
  'zone_glass:o': { label: 'Go man-to-man', apply: (t) => void (t.defense.scheme = 'man') },
  'help_kick:o': { label: 'Stay home', apply: (t) => void (t.defense.help = 35) },
  'help_paint:o': { label: 'Pack the paint', apply: (t) => void (t.defense.help = 65) },
  'pressure_to:o': { label: 'Pressure the ball', apply: (t) => void (t.defense.pressure = 65) },
  'pressure_blowby:o': { label: 'Back off the ball', apply: (t) => void (t.defense.pressure = 35) },
  'pressure_foul:o': { label: 'Back off the ball', apply: (t) => void (t.defense.pressure = 35) },
  'press_break:o': { label: 'Call off the press', apply: (t) => void (t.defense.press = 'none') },
  'crash_leak:o': { label: 'Crash less', apply: (t) => void (t.offense.crashBoards = 30) },
  'getback:o': { label: 'Sprint back', apply: (t) => void (t.defense.getBack = 80) },
  'double_kick:o': {
    label: 'Stop doubling',
    apply: (t) => {
      if (t.defense.starPlan === 'double') t.defense.starPlan = 'none';
      t.defense.help = Math.min(t.defense.help, 50);
    },
  },
  'physicality:o': { label: 'Less physical', apply: (t) => void (t.defense.physicality = 35) },
  'clean_defense:o': { label: 'More physical', apply: (t) => void (t.defense.physicality = 60) },
  'transition:d': { label: 'Push in transition', apply: (t) => void (t.offense.transition = 75) },
  'hack:o': { label: 'Stop the Hack-a', apply: (t) => stopHacking(t.manage) },
  'box_open:o': { label: 'Go man-to-man', apply: (t) => void (t.defense.scheme = 'man') },
  'box_beat:o': { label: 'Go man-to-man', apply: (t) => void (t.defense.scheme = 'man') },
  'box_chase:d': {
    label: 'Move the ball',
    apply: (t) => {
      t.offense.actions.motion = Math.max(t.offense.actions.motion, 75);
      t.offense.actions.handoff = Math.max(t.offense.actions.handoff, 65);
    },
  },
  'pd_under:o': { label: 'Stop going under', apply: (t) => dropInstruction(t, 'under') },
  'pd_tight:o': { label: 'Stop top-locking', apply: (t) => dropInstruction(t, 'tight') },
  'pd_sag:o': { label: 'Stop sagging off', apply: (t) => dropInstruction(t, 'sag') },
  'pd_body:o': { label: 'Less physical', apply: (t) => dropInstruction(t, 'body') },
  'hunt:d': { label: 'Stop the hunt', apply: (t) => void (t.offense.huntTarget = null) },
  'foul_give:o': { label: 'No foul to give', apply: (t) => void (t.manage.foulToGive = false) },
  // a set the defense takes away comes out of the package
  ...Object.fromEntries(SET_IDS.map((id) => [`set_${id}:d`, { label: `Drop ${SETS[id].short}`, apply: (t: Tactics) => dropSet(t, id) }])),
};

/** Take a set out of the package (the package goes when it's empty). */
function dropSet(t: Tactics, id: SetId) {
  const left = (t.offense.sets ?? []).filter((x) => x !== id);
  if (left.length) t.offense.sets = left;
  else delete t.offense.sets;
}

/** Take one kind of instruction off every opponent it's on. */
function dropInstruction(t: Tactics, d: PlayerDefense) {
  const pd = t.defense.playerD;
  if (!pd) return;
  for (const [pid, x] of Object.entries(pd)) if (x === d) delete pd[+pid];
  if (!Object.keys(pd).length) delete t.defense.playerD;
}

/**
 * The live one-tap answer to a tactical edge against you (an impact key such as 'drop_pullup:o'):
 * none when your tactics no longer use what caused it, so the button always takes it away.
 */
export function impactCounter(key: string, t: Tactics): LiveCounter | undefined {
  const c = IMPACT_COUNTERS[key];
  if (!c || !IMPACT_TEXT[key]?.uses?.(t)) return undefined;
  const after = cloneTactics(t);
  c.apply(after);
  return JSON.stringify(after) !== JSON.stringify(t) ? { label: c.label, apply: c.apply } : undefined;
}

export interface Alert {
  id: string;
  tone: 'good' | 'bad' | 'alert' | 'neutral';
  title: string;
  body: string;
  link?: string;
}

export function teamAlerts(league: League, tid: number): Alert[] {
  const team = league.teams[tid];
  const players = teamPlayers(league, tid);
  const healthy = players.filter((p) => !p.injury);
  const alerts: Alert[] = [];
  // the roster and fit scores the Tactics screen shows next to each playbook
  const pr = rosterProfile(fitRoster(players));
  const offFit = offPresetFit(pr);
  const defFit = defPresetFit(pr);
  const [offShown, defShown] = [fitScale(offFit), fitScale(defFit)];
  const curOff = team.tactics.offPreset;
  const curDef = team.tactics.defPreset;
  const bestOff = Object.entries(offFit).sort((a, b) => b[1] - a[1])[0];
  const bestDef = Object.entries(defFit).sort((a, b) => b[1] - a[1])[0];
  if (team.tactics.manual && offFit[curOff] !== undefined && bestOff[1] - offFit[curOff] > 12) {
    const nm = OFF_PRESETS.find((x) => x.id === bestOff[0])?.name;
    alerts.push({
      id: 'off-fit',
      tone: 'alert',
      title: `Offense may not fit: try ${nm}`,
      body: `Your roster profile fits ${nm} better (fit ${offShown(bestOff[0])} vs ${offShown(curOff)}).`,
      link: '/tactics',
    });
  }
  if (team.tactics.manual && defFit[curDef] !== undefined && bestDef[1] - defFit[curDef] > 12) {
    const nm = DEF_PRESETS.find((x) => x.id === bestDef[0])?.name;
    alerts.push({
      id: 'def-fit',
      tone: 'alert',
      title: `Defense may not fit: try ${nm}`,
      body: `Your personnel fits ${nm} better (fit ${defShown(bestDef[0])} vs ${defShown(curDef)}).`,
      link: '/tactics',
    });
  }
  const rot = team.rotation;
  // the five who start: the first healthy ones in the depth chart, as the engine and the Rotation screen have it
  const starters = rot.order
    .map((pid) => league.players[pid])
    .filter((p) => p && p.tid === tid && !p.injury)
    .slice(0, 5);
  if (starters.length === 5) {
    const ev = evaluateLineup(starters);
    for (const n of ev.notes)
      alerts.push({
        id: `lineup-${n}`,
        tone: 'bad',
        title: `Starting five: ${n.toLowerCase()}`,
        body: 'Lineup balance matters: spacing, a ball handler and a rim protector each swing efficiency.',
        link: '/rotation',
      });
    // (coverages only apply in man-to-man)
    const man = team.tactics.defense.scheme === 'man';
    if (man && team.tactics.defense.pnr === 'drop' && ev.rimProtection < 52)
      alerts.push({
        id: 'drop-noprot',
        tone: 'alert',
        title: 'Drop coverage without a rim protector',
        body: 'Drop only works with a big who can contest at the rim. Consider Switch or Hedge.',
        link: '/tactics',
      });
    // only a switch on a ball screen leaves him on a guard (off-ball switches don't), so Drop or Ice fixes it
    const slow = starters.find(slowBig);
    if (man && team.tactics.defense.pnr === 'switch' && slow) {
      alerts.push({
        id: 'switch-slow',
        tone: 'alert',
        title: 'Switching with a slow big',
        body: `Opponents will hunt ${slow.lastName} on switched ball screens. Drop or Ice coverage keeps him near the rim.`,
        link: '/tactics',
      });
    }
  }
  // injured players' minutes count: the plan hands them to teammates before it rescales anything
  const total = players.reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
  if (rot.manual && Math.abs(total - 240) > 6)
    alerts.push({
      id: 'min-total',
      tone: 'alert',
      title: `Minutes add up to ${Math.round(total)}`,
      body: `Minute targets${healthy.length < players.length ? ", injured players' included," : ''} are scaled to 240 automatically, so the actual split may differ from what you set.`,
      link: '/rotation',
    });
  const best = [...healthy].sort((a, b) => b.ovr - a.ovr)[0];
  if (best) {
    // stamina sets a ceiling; only flag minutes well below what he can carry
    const sustain = Math.round(sustainableMinutes(best));
    const m = rot.minutes[best.pid] ?? 0;
    if (m < Math.min(28, sustain - 3))
      alerts.push({
        id: 'star-min',
        tone: 'alert',
        title: `${best.lastName} is only playing ${m} minutes`,
        body: sustain < 32 ? `His stamina supports about ${sustain} minutes. Give him most of them.` : 'Your best player should usually play 32-36 minutes.',
        link: '/rotation',
      });
  }
  for (const p of players) {
    if (p.wear >= 55) {
      // a player who already sits back-to-backs needs a lighter load instead
      const cap = rot.caps[p.pid];
      const ease = !rot.restB2B.includes(p.pid)
        ? 'Rest him on back-to-backs (Rotation).'
        : `He already rests on back-to-backs: ${cap ? `lowering his ${cap}-minute cap` : 'a hard minute cap'} (Rotation) lightens his load further.`;
      alerts.push({
        id: `wear-${p.pid}`,
        tone: 'alert',
        title: `${p.lastName} is worn down`,
        body: `Season wear ${Math.round(p.wear)}. Worn players shoot worse and get hurt more. ${ease}`,
        link: '/rotation',
      });
    }
    if (p.mood.tradeRequest)
      alerts.push({ id: `tr-${p.pid}`, tone: 'bad', title: `${p.lastName} wants a trade`, body: moodText(p, 'He wants a fresh start somewhere else.'), link: `/player/${p.pid}` });
    else if (p.mood.score <= -4 && p.ovr >= 70)
      alerts.push({ id: `mood-${p.pid}`, tone: 'bad', title: `${p.lastName} is unhappy`, body: moodText(p, 'He is frustrated.'), link: `/player/${p.pid}` });
  }
  return alerts.slice(0, 8);
}
