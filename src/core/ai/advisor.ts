// The assistant coach: opponent scouting, counter-tactic candidates, and alerts about rotation and
// tactics issues on your own team.

import type { ActionType, DefRole, DefScheme, League, OffRole, OffShape, Player, PnrCoverage, PrepFocus, RatingKey, SetId, Tactics, TacticsPatch } from '../types';
import { OFF_SHAPES, SET_IDS } from '../types';
import type { FinishType } from '../sim/log';
import { attrDisplay, composites, ROLE_META } from '../ratings';
import { ACTION_META, COVERAGE_META, DEF_ROLE_META, SCHEME_META, SHAPE_META, cloneTactics, defRoleOf, isJunk, shapeOf, stopHacking } from '../sim/tactics';
import { CRAMPED_SPACING, autoDefRoles, autoTactics, evaluateLineup, rosterProfile, shapeFits, sustainableMinutes } from './coachAI';
import { FLUID, PREP_META, famLabel, freshFamiliarity, gamesTo, optValue, optionsOf } from '../sim/familiarity';
import { systemFamiliarity } from '../league/practice';
import { defRoleFits, fitStars, roleFits, roleScale, roleStars } from '../analysis/system';
import { leverCard, withStaffMoves } from '../league/staffLever';
import { CLASH_META, LINK_META, duoShare, lineupLinks, linksByRole, offRoleOf } from '../sim/links';
import { applyPatch } from '../sim/tactics';
import { effectiveTactics, itemGroup, planFor } from '../league/gamePlans';
import { scoutData } from '../analysis/scouting';
import { andList, inSeason, playerName, rosterSorted, shortName, teamPlayers } from '../league/helpers';
import { IMPACT_TEXT, LEVER_KEYS, leverNet } from '../analysis/gameReport';
import { castThrees, leagueThreePct } from './opponentPlan';
import { huntPick, ratingText } from '../analysis/guarding';
import { defenseLabel, offenseLabel } from '../sim/playbooks';
import { SETS } from '../sim/sets';
import { plural } from '../format';

/** A change the staff would make against one opponent (see counterCandidates). */
export interface Candidate {
  id: string;
  label: string;
  why: string;
  patch: TacticsPatch;
  /** Game-plan group: a counter replaces the plan's item in the same group (see GamePlanItem). */
  group?: string;
  /** What in the scouting numbers backs it. */
  evidence?: string;
}

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

/** What each starting-five hole is about, as a rating. */
const HOLE_RATING: Record<string, RatingKey> = {
  'Cramped spacing': 'tp',
  'No real creator': 'hnd',
  'No rim protection': 'blk',
  'Very small': 'hgt',
  'No secure ball handler': 'hnd',
};

/** "Best in the five: Wallace (three-point 68). Topić (three-point 79) is on the bench." */
function lineupHole(league: League, note: string, five: Player[], bench: Player[]): string {
  if (note === 'Too many bigs') {
    const bigs = five.filter((p) => p.ratings.hgt >= 60);
    return `${bigs.length} bigs start (${andList(bigs.map((p) => shortName(league, p)))}): a wing in for one opens the floor.`;
  }
  const key = HOLE_RATING[note];
  if (!key) return 'Check the five on Rotation.';
  const best = (ps: Player[]) => [...ps].sort((a, b) => b.ratings[key] - a.ratings[key])[0];
  const top = best(five);
  const sub = best(bench);
  const head = `Best in the five: ${shortName(league, top)} (${ratingText(top, key)}).`;
  return sub && sub.ratings[key] > top.ratings[key] + 3
    ? `${head} ${shortName(league, sub)} (${ratingText(sub, key)}) is on the bench.`
    : `${head} Nobody on the bench does it better.`;
}

export function scoutTeam(league: League, tid: number): ScoutReport {
  const team = league.teams[tid];
  const { cs, creators, spacing, security } = readRotation(league, tid);
  const t = team.tactics;
  // a playbook whose settings have moved reads "Custom (Balanced base)", not the preset's name
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
  if (spacing < CRAMPED_SPACING) {
    // the five's three-point rating, as their Ratings tabs show it
    const five = cs.slice(0, 5);
    const tp = Math.round(five.reduce((a, x) => a + attrDisplay(x.p.ratings.tp), 0) / Math.max(1, five.length));
    weaknesses.push(`Few shooters in their five (three-point ${tp} on average): pack the paint and dare them to shoot.`);
  }
  if (security < 52 && !weaknesses.some((w) => w.startsWith('Loose with the ball'))) weaknesses.push('Loose with the ball: pressure and traps should force turnovers.');
  if (protector && protector.c.rimProt < 55) weaknesses.push('No real rim protection: attack the basket.');
  if (man && t.defense.pnr === 'drop') weaknesses.push('Drop coverage concedes pull-up jumpers and popping bigs.');
  // (a switch on a ball screen leaves him on a guard; switching off-ball screens doesn't)
  if (man && t.defense.pnr === 'switch') {
    const slow = cs.filter((x) => slowBig(x.p));
    if (slow.length) weaknesses.push(`Switching with a slow big (${shortName(league, slow[0].p)}): hunt that mismatch.`);
  }
  if (man && t.defense.pnr === 'blitz') weaknesses.push('Blitzes ball screens: a good passing handler or short-roll big can carve up the 4-on-3.');
  // the weak link the staff's plan attacks (its "Attack" counter reads the same pick), so the two never disagree
  const hunt = huntPick(league, tid);
  if (hunt?.worth) {
    const who = league.players[hunt.pid];
    if (who) weaknesses.push(`${shortName(league, who)} is their weakest perimeter defender (${hunt.perDef}, their rotation ${hunt.teamPerDef}): attack the man he guards.`);
  }
  const threats: Threat[] = [];
  if (creators[0]) {
    const role = t.offense.roles[creators[0].p.pid] ?? 'creator';
    threats.push({
      pid: creators[0].p.pid,
      name: playerName(creators[0].p),
      // (his OVR is on the badge beside the name)
      why:
        role === 'creator'
          ? `Primary creator (${ratingText(creators[0].p, 'hnd')}).`
          : `Best shot creator, used as their ${ROLE_META[role].label.toLowerCase()} (${ratingText(creators[0].p, 'hnd')}).`,
    });
  }
  if (shooters[0] && shooters[0].p !== creators[0]?.p)
    threats.push({ pid: shooters[0].p.pid, name: playerName(shooters[0].p), why: `Best shooter (${ratingText(shooters[0].p, 'tp')}). Don't leave him open.` });
  if (protector && !threats.some((x) => x.pid === protector.p.pid))
    threats.push({ pid: protector.p.pid, name: playerName(protector.p), why: `Anchors the paint (${ratingText(protector.p, 'blk')}).` });
  const summary = `${team.region} ${team.name}: ${offName} offense, ${defName} defense. Watch ${threats[0]?.name ?? 'their starters'}.`;
  return { tid, summary, offense, defense, threats, weaknesses };
}

/**
 * The user's tactics against `opp` if counter `c` went into the game plan, replacing the plan's item
 * in its group (what Add on the game plan screen would play).
 */
export function tacticsWithCounter(league: League, opp: number, c: Pick<Candidate, 'id' | 'label' | 'group' | 'patch'>): Tactics {
  const plan = planFor(league, opp);
  const g = itemGroup(c);
  const items = [...(plan?.items ?? []).filter((x) => itemGroup(x) !== g), { id: c.id, label: c.label, group: c.group, patch: c.patch }];
  // (the rest of the plan stays as it is: its matchups and how it guards their players)
  const view: League = { ...league, gamePlans: { ...league.gamePlans, [opp]: { ...plan, oppTid: opp, items } } };
  return effectiveTactics(view, opp);
}

/**
 * The staff's counters against a specific opponent, drafted against the tactics the user plays them
 * with now (the game plan for them included). Each names its game-plan group (a plan keeps one item
 * per group), slider changes to actions and shot profile are relative so they build on whatever
 * playbook is run, and counters the scouting numbers back carry that evidence and come first. A
 * counter already in the plan, or one that would change nothing, isn't offered.
 *
 * The big decisions come first (the scheme, the ball-screen coverage, ball pressure and the press,
 * help, the double): each is worth two points a game and more against the opponent it's aimed at,
 * and costs about as much against the wrong one (paired real-league games; see K.matchup and
 * scripts/tactic-impact.ts). So each is offered only on the read it's aimed at: a 2-3 zone against a
 * five that can't shoot (spacing CRAMPED_SPACING + 6 or less: the measured best cases were 25-38), a
 * 3-2 against one that lives on threes (ZONE32_SPACING and more), pressure against handlers who
 * don't protect it (security under PRESSURE_SECURITY), the press against the loosest, a double
 * against a star who can't pass with non-shooters around him, a box-and-one or triangle-and-two
 * against a cast that can't shoot by its ratings (a percentage over twenty games is mostly noise).
 */
/** A five's spacing (the rotation's five who play most) from which the staff offers a 3-2 zone: the measured best cases were 58-66. */
export const ZONE32_SPACING = 56;
/** The five's ball security under which the staff offers ball pressure (the press a point lower): the measured best cases were 49-52. */
export const PRESSURE_SECURITY = 53;

/** Groups of the big decisions, which the staff measures first (see counterWorth.ts). */
const BIG_GROUPS = new Set(['coverage', 'pressure', 'press', 'help', 'star']);

export function counterCandidates(league: League, userTid: number, oppTid: number): Candidate[] {
  const opp = league.teams[oppTid];
  const { rot, cs, creators, spacing, security } = readRotation(league, oppTid);
  const top = creators[0];
  /** How the five who play most besides `skip` space the floor (what a double or a junk defense dares). */
  const castSpacing = (skip: number[]) => {
    const five = cs.filter((x) => !skip.includes(x.p.pid)).slice(0, 5);
    return five.reduce((a, x) => a + x.c.spacing, 0) / Math.max(1, five.length);
  };
  const forUser = userTid === league.userTid;
  // (the junk zones below read a percentage; the 2-3 and the 3-2 read the five's spacing)
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
    // the player the numbers say they run through, else their best creator: doubled when he can't
    // pass out of it and the players around him can't make the shots it leaves
    const star = (data.star !== undefined && league.players[data.star]) || top.p;
    const starPass = composites(star.ratings).passing;
    const around = castSpacing([star.pid]);
    if (starPass < 55 && around < CRAMPED_SPACING && (cur.defense.starPlan !== 'double' || cur.defense.starTarget !== star.pid))
      add({
        id: 'star-double',
        label: `Double-team ${star.lastName}`,
        why: `${star.lastName} doesn't pass out of traps, and the ${opp.name} around him can't shoot (spacing ${Math.round(around)}).`,
        group: 'star',
        patch: { defense: { starPlan: 'double', starTarget: star.pid } },
      });
  }
  // the zones: the 2-3 walls off the paint and dares a five that can't shoot to fire; the 3-2 closes
  // out on the arc and dares one that lives on threes to win inside (a zone and a coverage share a group)
  if (cur.defense.scheme !== 'zone23' && (spacing <= CRAMPED_SPACING + 6 || backed('zone23')))
    add({
      id: 'zone23',
      label: '2-3 zone',
      why: `The ${opp.name} can't shoot (spacing ${Math.round(spacing)}): wall off the paint and let them fire from outside.`,
      group: 'coverage',
      patch: { defense: { scheme: 'zone23' } },
    });
  if (cur.defense.scheme !== 'zone32' && (spacing >= ZONE32_SPACING || backed('zone32')))
    add({
      id: 'zone32',
      label: '3-2 zone',
      why: `The ${opp.name} live on threes (spacing ${Math.round(spacing)}): run their shooters off the arc and make them win inside.`,
      group: 'coverage',
      patch: { defense: { scheme: 'zone32' } },
    });
  // spacing as scouting reads it: packing the paint against a little more than the cramped fifth it
  // flags, staying home against about the best-spaced third; between those, the numbers decide
  // (never both at once)
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
    // the players left to the zone have to be poor shooters by their ratings, not only by a percentage
    if (castSpacing(chased.map((p) => p.pid)) >= CRAMPED_SPACING) continue;
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
  if ((security < PRESSURE_SECURITY || backed('pressure-up')) && cur.defense.pressure < 70)
    add({
      id: 'pressure-up',
      label: 'Turn up the pressure',
      why: `Their ball handlers are loose with it (security ${Math.round(security)}): get into them.`,
      group: 'pressure',
      patch: { defense: { pressure: 82 } },
    });
  if ((security < PRESSURE_SECURITY - 1 || backed('press-on')) && cur.defense.press === 'none')
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
  // a real weak link on the perimeter: attack the man he guards. His defense against his rotation's is
  // the evidence, so he ranks with the counters the numbers back (with tactics' edges at their full size,
  // the scouting backs many of them, and a weak link shouldn't drop off the end of the list behind them)
  const hunt = huntPick(league, oppTid);
  if (hunt?.worth && cur.offense.huntTarget !== hunt.pid) {
    const who = league.players[hunt.pid]?.lastName ?? '';
    add({
      id: 'hunt',
      label: `Attack ${who}`,
      why: `${who} is their weakest perimeter defender (${hunt.perDef}, their rotation ${hunt.teamPerDef}): run isolations and ball screens at the man he guards. It costs some ball movement.`,
      group: 'hunt',
      evidence: `${who} rates ${hunt.perDef} on perimeter defense; their rotation averages ${hunt.teamPerDef}.`,
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
      label: 'Crash the offensive glass',
      why: oppProfile.size < 48 ? 'They are small; attack the offensive boards.' : "They don't finish defensive possessions with the rebound.",
      group: 'crash',
      patch: { offense: { crashBoards: 78 } },
    });
  // a counter in the plan already, or one that changes nothing (sliders at the limit), isn't worth simulating
  const inPlan = new Set(plan?.items.map((x) => x.id));
  const now = JSON.stringify(cur);
  const changes = (c: Candidate) => JSON.stringify(forUser ? tacticsWithCounter(league, oppTid, c) : applyPatch(cur, c.patch)) !== now;
  // the big decisions first, then the counters the numbers back
  return out
    .filter((c) => !inPlan.has(c.id) && changes(c))
    .sort((a, b) => Number(BIG_GROUPS.has(b.group ?? '')) - Number(BIG_GROUPS.has(a.group ?? '')) || Number(!!b.evidence) - Number(!!a.evidence))
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
      apply: (x) => void ((x.defense.getBack = Math.max(x.defense.getBack, 85)), (x.offense.crashBoards = Math.min(x.offense.crashBoards, 45))),
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
  'switch_slip:o': { label: 'Go to Drop', apply: (t) => void (t.defense.pnr = 'drop') },
  'ice_corner:o': { label: 'Go to Drop', apply: (t) => void (t.defense.pnr = 'drop') },
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
  // (backing off further than the middle costs more turnovers forced than it saves in blow-bys)
  'pressure_blowby:o': { label: 'Back off the ball', apply: (t) => void (t.defense.pressure = Math.min(t.defense.pressure, 55)) },
  'pressure_foul:o': { label: 'Back off the ball', apply: (t) => void (t.defense.pressure = Math.min(t.defense.pressure, 55)) },
  'press_break:o': { label: 'Call off the press', apply: (t) => void (t.defense.press = 'none') },
  // (to the middle: crashing less than that gives up more second chances than run-outs it saves)
  'crash_leak:o': { label: 'Crash less', apply: (t) => void (t.offense.crashBoards = Math.min(t.offense.crashBoards, 50)) },
  'crash_orb:d': { label: 'Crash the glass', apply: (t) => void (t.offense.crashBoards = Math.max(t.offense.crashBoards, 60)) },
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
  'hack:o': { label: 'Stop Hack-a-player', apply: (t) => stopHacking(t.manage) },
  'box_open:o': { label: 'Go man-to-man', apply: (t) => void (t.defense.scheme = 'man') },
  'box_beat:o': { label: 'Go man-to-man', apply: (t) => void (t.defense.scheme = 'man') },
  'box_chase:d': {
    label: 'Move the ball',
    apply: (t) => {
      t.offense.actions.motion = Math.max(t.offense.actions.motion, 75);
      t.offense.actions.handoff = Math.max(t.offense.actions.handoff, 65);
    },
  },
  'hunt:d': { label: 'Stop the hunt', apply: (t) => void (t.offense.huntTarget = null) },
  'role_anchor:o': { label: 'No rim anchor', apply: (t) => dropRole(t, 'anchor') },
  'role_roam:o': { label: 'No roamer', apply: (t) => dropRole(t, 'roamer') },
  'foul_give:o': { label: 'No foul to give', apply: (t) => void (t.manage.foulToGive = false) },
  // (two inside bigs: the shape built for them)
  'clash_crowd:d': { label: 'Double post', apply: (t) => void (t.offense.shape = 'twoIn') },
  // a set the defense takes away comes out of the package
  ...Object.fromEntries(SET_IDS.map((id) => [`set_${id}:d`, { label: `Drop ${SETS[id].short}`, apply: (t: Tactics) => dropSet(t, id) }])),
};

/** Take a set out of the package (the package goes when it's empty). */
function dropSet(t: Tactics, id: SetId) {
  const left = (t.offense.sets ?? []).filter((x) => x !== id);
  if (left.length) t.offense.sets = left;
  else delete t.offense.sets;
}

/** Make everyone in an out-of-possession role a position defender. */
function dropRole(t: Tactics, r: DefRole) {
  const roles = t.defense.roles;
  if (!roles) return;
  for (const [pid, x] of Object.entries(roles)) if (x === r) delete roles[+pid];
  if (!Object.keys(roles).length) delete t.defense.roles;
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

/** A change the assistant can make in one tap (see applyFix in assistant.ts). */
export type AlertFix =
  | { kind: 'offPreset'; id: string; label: string }
  | { kind: 'defPreset'; id: string; label: string }
  | { kind: 'coverage'; pnr: PnrCoverage; label: string }
  | { kind: 'restB2B'; pid: number; label: string }
  | { kind: 'patch'; patch: TacticsPatch; label: string }
  /** A practice focus between games (Team.prep). */
  | { kind: 'prep'; focus: PrepFocus; label: string };

export interface Alert {
  id: string;
  tone: 'good' | 'bad' | 'alert' | 'neutral';
  title: string;
  body: string;
  link?: string;
  fix?: AlertFix;
}

/** Games of this season's trade-offs before the staff reads a pattern into them. */
const LEVER_GAMES = 8;

/** One setting's trade-off over this season's games, as the engine tallied it: what it gave away and won back, a game. */
export interface SeasonLever {
  what: string;
  lost: number;
  won: number;
  /** Won less lost, a game. */
  net: number;
  games: number;
}

/**
 * The engine's tally of every setting's trade-off over a team's stored games this season (the user's
 * games keep its accounting of both sides of each setting), worst first; empty before LEVER_GAMES
 * games. What happened, not a counterfactual: it can read a setting as the worse one where paired
 * games find it the better (Drop against Switch, round-3 review). So it only orders where the staff
 * looks for a change, which it then measures (staffLever.ts), and the Season view shows it as the
 * tally. Nothing decides on it.
 */
export function seasonLevers(league: League, tid: number): SeasonLever[] {
  const sums = new Map<string, { what: string; lost: number; won: number; key: string }>();
  let n = 0;
  for (const g of league.games) {
    if (g.season !== league.season || g.type === 'allstar' || !g.impacts) continue;
    const side = g.home.tid === tid ? 0 : g.away.tid === tid ? 1 : -1;
    if (side < 0) continue;
    n++;
    for (const key of LEVER_KEYS) {
      const lv = leverNet(g.impacts, key, side as 0 | 1);
      if (!lv) continue;
      const e = sums.get(lv.what) ?? { what: lv.what, lost: 0, won: 0, key };
      // (each lever is read once a game, from its first cost key)
      if (e.key === key) {
        e.lost += lv.lost;
        e.won += lv.won;
      }
      sums.set(lv.what, e);
    }
  }
  if (n < LEVER_GAMES) return [];
  return [...sums.values()].map((e) => ({ what: e.what, lost: e.lost / n, won: e.won / n, net: (e.won - e.lost) / n, games: n })).sort((a, b) => a.net - b.net);
}

/**
 * The tactics the staff runs for a team it manages (tactics not the user's own): the playbook that
 * fits the roster (autoTactics), and for the user's team the changes the staff measured as gains in
 * paired games this season and made, while the playbook and identity they were made on stand
 * (staffLever.ts: a change made by mail, with Undo). The engine's tally never changes them: it only
 * says where to measure. AI staffs don't read the tally at all; they run their coach's fit.
 */
export function staffTactics(league: League, tid: number): Tactics {
  const t = autoTactics(league.teams[tid], teamPlayers(league, tid), true, { sticky: inSeason(league), links: tid === league.userTid, user: tid === league.userTid });
  return t.manual || tid !== league.userTid ? t : withStaffMoves(league, t);
}

/** The trade-offs the staff measures a change to by itself, for the playbook it runs (each one's counter has measured as a gain somewhere). */
export const STAFF_LEVERS = new Set([
  'drop coverage',
  'switching',
  'hedging',
  'blitzing',
  'zone defense',
  'heavy help',
  'staying home on shooters',
  'soft ball pressure',
  'ball pressure',
  'physical defense',
  'clean defense',
  'full-court press',
  'crashing',
  'staying off the glass',
  'doubling',
  'junk defense',
]);

/** The staff's change for a setting's trade-off (named as leverNet names it): the counter to its first cost the tactics still give. */
export function leverCounter(what: string, t: Tactics): LiveCounter | undefined {
  for (const key of LEVER_KEYS) {
    if (leverNet([], key, 0)?.what !== what) continue;
    const c = impactCounter(key, t);
    if (c) return c;
  }
  return undefined;
}

// ---------------------------------------------------------------- familiarity, shape and roles

/**
 * A discrete option ('scheme:zone23', 'pnr:blitz', 'shape:fiveOut', 'press:always') as the staff
 * names it in a sentence: "the 2-3 zone", "the blitz", "the 5-Out".
 */
export function optionName(key: string): string {
  const [k, v] = key.split(':');
  if (k === 'scheme') return v === 'man' ? 'man-to-man' : `the ${(SCHEME_META[v as DefScheme]?.label ?? v).toLowerCase()}`;
  if (k === 'pnr')
    return ({ drop: 'drop coverage', switch: 'switching ball screens', hedge: 'the hedge', blitz: 'the blitz', ice: 'icing ball screens' } as Record<string, string>)[v] ?? v;
  if (k === 'shape') return v === 'horns' ? 'Horns' : v === 'twoIn' ? 'the double post' : `the ${SHAPE_META[v as OffShape]?.label ?? v}`;
  if (k === 'press') return v === 'always' ? 'the full-court press' : 'the press after makes';
  return key;
}

/** An option the team knows less than this is a gamble the staff flags. */
export const RISKY = 60;

/** What the team knows of the tactics it plays (against `opp`, its game plan for them on top), and where it's short. */
export interface FamReadout {
  overall: number;
  off: number;
  def: number;
  prep: PrepFocus;
  /** The options the tactics play that the team knows less than RISKY, least known first; `plan`: tonight's plan brings it (not the system). */
  risks: { key: string; name: string; v: number; plan: boolean }[];
  /** Rotation players still learning the system (knowledge under 70), least first. */
  learning: { pid: number; know: number }[];
}

export function famReadout(league: League, opp?: number, tid = league.userTid): FamReadout {
  const team = league.teams[tid];
  const base = team.tactics;
  const t = opp !== undefined && tid === league.userTid ? effectiveTactics(league, opp) : base;
  const sys = systemFamiliarity(league, tid, t);
  const fam = team.fam ?? freshFamiliarity(team, teamPlayers(league, tid));
  const was = new Set(optionsOf(base));
  const risks = optionsOf(t)
    .map((key) => ({ key, name: optionName(key), v: optValue(fam, key), plan: !was.has(key) }))
    .filter((r) => r.v < RISKY)
    .sort((a, b) => a.v - b.v);
  const mins = team.rotation?.minutes ?? {};
  const learning = sys.players
    .filter((p) => (mins[p.pid] ?? 0) >= 12 && p.know < 70)
    .sort((a, b) => a.know - b.know)
    .map((p) => ({ pid: p.pid, know: p.know }));
  return { overall: sys.overall, off: sys.off, def: sys.def, prep: team.prep ?? 'balanced', risks, learning };
}

/**
 * Fit points (shapeFits: 10 is a point a game) a shape has to beat the one played by for the staff to
 * say so: half a point a game, as a measured change has to reach to read as a gain (WORTH_MIN).
 */
const SHAPE_EDGE = 5;
/** A defensive role fit the staff calls obvious. */
const ROLE_OBVIOUS = 70;

/**
 * The staff on the system as a whole: how well the team knows it (an option it plays that it hasn't
 * drilled, a system still being learned, new arrivals still learning it, or drills that have done
 * their job), with the practice focus that answers it; and, for tactics the user runs himself, a shape
 * that fits the roster clearly better and an obvious point-of-attack stopper or rim anchor not used.
 */
function systemAlerts(league: League, tid: number, starters: Player[]): Alert[] {
  const out: Alert[] = [];
  const team = league.teams[tid];
  const t = team.tactics;
  const r = famReadout(league, undefined, tid);
  const pct = (v: number) => `${Math.round(v)}%`;
  const drills = (label = PREP_META.system.label): AlertFix | undefined => (r.prep === 'system' ? undefined : { kind: 'prep', focus: 'system', label });
  const worst = r.risks.find((x) => !x.plan);
  if (worst) {
    const left = gamesTo(worst.v);
    out.push({
      id: `fam-opt-${worst.key}`,
      tone: 'alert',
      title: `${worst.name.charAt(0).toUpperCase()}${worst.name.slice(1)} is new to us (${pct(worst.v)})`,
      body: `We play it a step slow until it's drilled: about ${plural(left, 'game')} to fluid at a balanced focus, fewer with ${PREP_META.system.label.toLowerCase()}. Stick with it rather than changing again mid-stretch, or go back to what we know.`,
      link: '/team/tactics?tab=analysis&view=familiarity',
      fix: drills(),
    });
  } else if (r.overall < 80) {
    const end = r.off < r.def ? 'offense' : 'defense';
    out.push({
      id: 'fam-system',
      tone: 'alert',
      title: `Still learning the system: ${pct(r.overall)}`,
      body: `${famLabel(r.overall)} so far, the ${end} most of all: a step slow until it's drilled. ${r.prep === 'system' ? 'The drills are on: give them time, and keep the changes for later.' : `${PREP_META.system.label} between games build it about twice as fast; changing it again starts over.`}`,
      link: '/team/tactics?tab=analysis&view=familiarity',
      fix: drills(),
    });
  } else if (r.learning.length) {
    const names = r.learning.slice(0, 3).map((x) => `${shortName(league, league.players[x.pid])} (${pct(x.know)})`);
    const one = r.learning.length === 1;
    out.push({
      id: 'fam-arrivals',
      tone: 'neutral',
      title: `${andList(names)} ${one ? 'is' : 'are'} still learning the system`,
      body: `A new player is a step behind in what we run until he knows it; games and practice teach it. ${r.prep === 'system' ? 'The tactical drills are teaching it about twice as fast.' : `${PREP_META.system.label} teach it about twice as fast.`}`,
      link: '/team/tactics?tab=analysis&view=familiarity',
      fix: drills(),
    });
  } else if (r.prep === 'system' && r.overall >= FLUID - 3) {
    out.push({
      id: 'fam-done',
      tone: 'good',
      title: `The system is fluid (${pct(r.overall)})`,
      body: `The tactical drills have done their job. ${PREP_META.balanced.label} practice keeps it there; ${PREP_META.opponent.label.toLowerCase()} drills each game plan for its game.`,
      link: '/team/tactics?tab=analysis&view=familiarity',
      fix: { kind: 'prep', focus: 'balanced', label: PREP_META.balanced.label },
    });
  }
  // the shape and the roles are the user's calls only when he runs the tactics himself
  if (!t.manual || starters.length < 5) return out;
  const players = teamPlayers(league, tid).filter((p) => !p.injury);
  const fits = shapeFits(players, t, team.rotation.order);
  const cur = shapeOf(t.offense);
  const best = OFF_SHAPES.reduce((a, s) => (fits[s] > fits[a] ? s : a), cur);
  if (best !== cur && fits[best] - fits[cur] >= SHAPE_EDGE) {
    const known = optValue(team.fam, `shape:${best}`);
    out.push({
      id: `shape-${best}`,
      tone: 'alert',
      title: `${SHAPE_META[best].label} fits this roster better`,
      body: `My read: about ${((fits[best] - fits[cur]) / 10).toFixed(1)} points a game over the ${SHAPE_META[cur].label} with this rotation, once drilled: ${SHAPE_META[best].good.charAt(0).toLowerCase()}${SHAPE_META[best].good.slice(1)}.${known < FLUID ? ` We're ${pct(known)} familiar with it, so it takes some practice first.` : ''} Make the change and I'll measure it on our next games.`,
      link: '/team/tactics',
      fix: { kind: 'patch', patch: { offense: { shape: best } }, label: `Play ${SHAPE_META[best].short}` },
    });
  }
  const link = partnershipAlert(league, tid, starters);
  if (link) out.push(link);
  const auto = autoDefRoles(players, team.rotation);
  const five = new Set(starters.map((p) => p.pid));
  for (const role of ['poa', 'anchor'] as const) {
    if (starters.some((p) => defRoleOf(t.defense, p.pid) === role)) continue;
    const pid = Object.keys(auto)
      .map(Number)
      .find((x) => auto[x] === role && five.has(x));
    const p = pid !== undefined ? league.players[pid] : undefined;
    if (!p || defRoleOf(t.defense, p.pid) !== 'standard' || defRoleFits(p)[role] < ROLE_OBVIOUS) continue;
    const meta = DEF_ROLE_META[role];
    out.push({
      id: `defrole-${role}`,
      tone: 'neutral',
      title: `${p.lastName} is a natural ${meta.label.toLowerCase()}`,
      body: `Nobody in the starting five has the role, and he suits it (${'★'.repeat(roleStars(roleScale(league).def[role], defRoleFits(p)[role]))}). ${meta.help}`,
      link: '/team/tactics',
      fix: { kind: 'patch', patch: { defense: { roles: { ...(t.defense.roles ?? {}), [p.pid]: role } } }, label: `Make him ${role === 'poa' ? 'POA stopper' : 'rim anchor'}` },
    });
    break;
  }
  return out;
}

/** A link the staff calls worth a role change (its strength with the five as they know each other). */
const LINK_WORTH = 0.6;
/** Non-inside roles the staff would move a crowding big to. */
const OUTSIDE_BIG: OffRole[] = ['stretch', 'hub', 'glue'];

/**
 * The staff on the starting five's partnerships (see sim/links.ts), one thing at a time: two inside
 * bigs crowding the paint (with the role or the shape that ends it), a role change that would make a
 * strong partnership without miscasting anyone, or the five's best partnership still building after a
 * new arrival.
 */
function partnershipAlert(league: League, tid: number, starters: Player[]): Alert | null {
  const team = league.teams[tid];
  const t = team.tactics;
  const fam = team.fam ?? freshFamiliarity(team, teamPlayers(league, tid));
  const name = (pid: number) => league.players[pid].lastName;
  const { links, clashes } = lineupLinks(t, starters, fam);
  const crowd = clashes.find((c) => c.id === 'crowd');
  if (crowd) {
    const bigs = crowd.pids.map((pid) => league.players[pid]);
    // the big who loses least by moving outside, to his best outside role
    const moves = bigs
      .map((p) => {
        const fits = roleFits(p);
        const to = OUTSIDE_BIG.reduce((a, r) => (fits[r] > fits[a] ? r : a), OUTSIDE_BIG[0]);
        return { p, to, loss: fitStars(fits[offRoleOf(t, p)]) - fitStars(fits[to]) };
      })
      .sort((a, b) => a.loss - b.loss);
    const m = moves[0];
    const fix: AlertFix =
      m.loss <= 1
        ? { kind: 'patch', patch: { offense: { roles: { ...t.offense.roles, [m.p.pid]: m.to } } }, label: `Make ${m.p.lastName} a ${ROLE_META[m.to].label}` }
        : { kind: 'patch', patch: { offense: { shape: 'twoIn' } }, label: `Play ${SHAPE_META.twoIn.short}` };
    return {
      id: 'link-crowd',
      tone: 'alert',
      title: `${andList(bigs.map((p) => p.lastName))} crowd the paint`,
      body: `${CLASH_META.crowd.help} ${m.loss <= 1 ? `${m.p.lastName} can play ${ROLE_META[m.to].label} and keep the paint open.` : `Neither plays outside well: the ${SHAPE_META.twoIn.label} is built for two bigs.`}`,
      link: '/team/tactics',
      fix,
    };
  }
  // a role change that makes a strong partnership, the player no worse cast for it
  const inLink = new Set(links.filter((l) => LINK_META[l.id].end === 'off').flatMap((l) => [l.a, l.b]));
  let best: { pid: number; role: OffRole; s: number; with: number; id: keyof typeof LINK_META } | null = null;
  for (const p of starters) {
    if (inLink.has(p.pid)) continue;
    const fits = roleFits(p);
    const cur = fitStars(fits[offRoleOf(t, p)]);
    for (const [role, ls] of Object.entries(linksByRole(t, starters, p.pid, fam)) as [OffRole, NonNullable<ReturnType<typeof linksByRole>[OffRole]>][]) {
      if (role === offRoleOf(t, p) || fitStars(fits[role]) < cur) continue;
      const l = ls[0];
      if (l.strength >= LINK_WORTH && (!best || l.strength > best.s)) best = { pid: p.pid, role, s: l.strength, with: l.a === p.pid ? l.b : l.a, id: l.id };
    }
  }
  if (best) {
    return {
      id: `link-make-${best.pid}`,
      tone: 'neutral',
      title: `${name(best.pid)} as a ${ROLE_META[best.role].label}: a ${LINK_META[best.id].label.toLowerCase()} with ${name(best.with)}`,
      body: `${LINK_META[best.id].help} He suits the role at least as well as the one he plays.`,
      link: '/team/tactics',
      fix: { kind: 'patch', patch: { offense: { roles: { ...t.offense.roles, [best.pid]: best.role } } }, label: `Make him a ${ROLE_META[best.role].label}` },
    };
  }
  // the five's best partnership, still building (a new arrival in it)
  const top = links[0];
  if (top && duoShare(top.understanding) < 0.7 && top.fit >= 60) {
    return {
      id: `link-building-${top.a}-${top.b}`,
      tone: 'neutral',
      title: `${name(top.a)} and ${name(top.b)} are still learning each other`,
      body: `Their ${LINK_META[top.id].label.toLowerCase()} plays at ${Math.round(duoShare(top.understanding) * 100)}% of what it will once they know each other (understanding ${Math.round(top.understanding)}%). Minutes together build it.`,
      link: '/team/tactics',
    };
  }
  return null;
}

export function teamAlerts(league: League, tid: number): Alert[] {
  const team = league.teams[tid];
  const players = teamPlayers(league, tid);
  const healthy = players.filter((p) => !p.injury);
  const alerts: Alert[] = [];
  // a change to the user's own tactics the staff measured as a gain in paired games over his next
  // games (staffLever.ts), with the change as its fix: the engine's tally only says where it looked.
  // Not a playbook swap on its fit: over real rosters a playbook's fit doesn't predict what it's worth
  // in the engine, and the swap the old card offered cost points as often as not.
  const inSeason = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const lever = inSeason && tid === league.userTid ? leverCard(league) : null;
  if (lever) alerts.push(lever);
  const rot = team.rotation;
  // the five who start: the first healthy ones in the depth chart, as the engine and the Rotation screen have it
  const starters = rot.order
    .map((pid) => league.players[pid])
    .filter((p) => p && p.tid === tid && !p.injury)
    .slice(0, 5);
  // lineups are a game-season matter (the summer's roster isn't the one that plays), and the staff
  // doesn't flag what it decides itself: holes in a five it picked, a coverage it chose
  const games = league.phase === 'preseason' || league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  if (games && starters.length === 5) {
    const ev = evaluateLineup(starters);
    // each hole says who's best at it in the five, and who on the bench would fill it
    const bench = teamPlayers(league, tid).filter((p) => !p.injury && !starters.includes(p));
    for (const n of rot.manual ? ev.notes : [])
      alerts.push({
        id: `lineup-${n}`,
        tone: 'bad',
        title: `Starting five: ${n.toLowerCase()}`,
        body: lineupHole(league, n, starters, bench),
        link: '/team/rotation',
      });
    // (coverages only apply in man-to-man)
    const man = team.tactics.defense.scheme === 'man' && team.tactics.manual;
    if (man && team.tactics.defense.pnr === 'drop' && ev.rimProtection < 52)
      alerts.push({
        id: 'drop-noprot',
        tone: 'alert',
        title: 'Drop coverage without a rim protector',
        body: 'Drop only works with a big who can contest at the rim. Consider Switch or Hedge.',
        link: '/team/tactics?side=out',
        fix: { kind: 'coverage', pnr: 'hedge', label: 'Hedge instead' },
      });
    // only a switch on a ball screen leaves him on a guard (off-ball switches don't), so Drop or Ice fixes it
    const slow = starters.find(slowBig);
    if (man && team.tactics.defense.pnr === 'switch' && slow) {
      alerts.push({
        id: 'switch-slow',
        tone: 'alert',
        title: 'Switching with a slow big',
        body: `Opponents will hunt ${slow.lastName} on switched ball screens. Drop or Ice coverage keeps him near the rim.`,
        link: '/team/tactics?side=out',
        fix: { kind: 'coverage', pnr: 'drop', label: 'Drop instead' },
      });
    }
  }
  // what the team knows of its system, the shape and the out-of-possession roles (in season: camp drills the system before it)
  if (inSeason) alerts.push(...systemAlerts(league, tid, starters));
  // injured players' minutes count: the plan hands them to teammates before it rescales anything
  const total = players.reduce((a, p) => a + (rot.minutes[p.pid] ?? 0), 0);
  if (rot.manual && Math.abs(total - 240) > 6)
    alerts.push({
      id: 'min-total',
      tone: 'alert',
      title: `Minutes add up to ${Math.round(total)}`,
      body: `Minute targets${healthy.length < players.length ? ", injured players' included," : ''} are scaled to 240 automatically, so the actual split may differ from what you set.`,
      link: '/team/rotation',
    });
  const best = [...healthy].sort((a, b) => b.ovr - a.ovr)[0];
  // (only the user's own minutes: an assistant-run rotation plans them itself)
  if (games && best && rot.manual) {
    // stamina sets a ceiling; only flag minutes well below what he can carry
    const sustain = Math.round(sustainableMinutes(best));
    const m = rot.minutes[best.pid] ?? 0;
    if (m < Math.min(28, sustain - 3))
      alerts.push({
        id: 'star-min',
        tone: 'alert',
        title: m ? `${best.lastName} is only playing ${m} minute${m === 1 ? '' : 's'}` : `${best.lastName} isn't getting any minutes`,
        body: sustain < 32 ? `His stamina supports about ${sustain} minutes. Give him most of them.` : 'Your best player should usually play 32-36 minutes.',
        link: '/team/rotation',
      });
  }
  // wear builds over the season and the postseason (the next season starts it again): only a team
  // with games left has a load to manage, and only the regular season has back-to-backs to rest on
  const ts = team.seasons.find((s) => s.season === league.season);
  const lostSeries = league.playoffs.some((s) => s.winner !== undefined && s.winner !== tid && (s.high === tid || s.low === tid));
  const playing = league.phase === 'regular' || ((league.phase === 'playin' || league.phase === 'playoffs') && (ts?.playoffRound ?? -1) >= 0 && !lostSeries);
  const b2b = league.phase === 'regular';
  for (const p of players) {
    if (playing && p.wear >= 55) {
      // a player who already sits back-to-backs (or has none to sit) needs a lighter load instead
      const cap = rot.caps[p.pid];
      const lighter = cap ? `lowering his ${cap}-minute cap` : 'a hard minute cap';
      const ease =
        b2b && !rot.restB2B.includes(p.pid)
          ? 'Rest him on back-to-backs (Rotation).'
          : b2b
            ? `He already rests on back-to-backs: ${lighter} (Rotation) lightens his load further.`
            : `${lighter.charAt(0).toUpperCase()}${lighter.slice(1)} (Rotation) lightens his load.`;
      alerts.push({
        id: `wear-${p.pid}`,
        tone: 'alert',
        title: `${p.lastName} is worn down`,
        body: `Season wear ${Math.round(p.wear)}. Worn players shoot worse and get hurt more. ${ease}`,
        link: '/team/rotation',
        ...(b2b && !rot.restB2B.includes(p.pid) ? { fix: { kind: 'restB2B' as const, pid: p.pid, label: 'Rest him on back-to-backs' } } : {}),
      });
    }
  }
  return alerts.slice(0, 8);
}
