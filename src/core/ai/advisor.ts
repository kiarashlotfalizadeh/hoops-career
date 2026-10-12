// The assistant coach: opponent scouting, counter-tactic candidates (verified with lab sims
// in a worker), and alerts about rotation/tactics issues on your own team.

import type { ActionType, League, Player, PnrCoverage } from '../types';
import { composites, ROLE_META } from '../ratings';
import { ACTION_META, DEF_PRESETS, OFF_PRESETS, COVERAGE_META, SCHEME_META } from '../sim/tactics';
import { CRAMPED_SPACING, defPresetFit, evaluateLineup, offPresetFit, rosterProfile, sustainableMinutes } from './coachAI';
import { applyPatch, type Candidate } from './lab';
import { playerName, rosterSorted, teamPlayers } from '../league/helpers';
import { possessive } from '../analysis/gameReport';

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
const moodText = (p: Player, none: string) => (p.mood.notes.length ? `${p.mood.notes.join('. ')}.` : none);

const pct = (x: number) => Math.round(x);

export function scoutTeam(league: League, tid: number): ScoutReport {
  const team = league.teams[tid];
  const { cs, creators, spacing, security } = readRotation(league, tid);
  const off = OFF_PRESETS.find((x) => x.id === team.tactics.offPreset);
  const def = DEF_PRESETS.find((x) => x.id === team.tactics.defPreset);
  const t = team.tactics;
  const shooters = [...cs].sort((a, b) => b.c.c3 - a.c.c3);
  const protector = [...cs].sort((a, b) => b.c.rimProt - a.c.rimProt)[0];
  const offense: string[] = [];
  const defense: string[] = [];
  const weaknesses: string[] = [];
  offense.push(`Runs ${off?.name ?? 'a balanced attack'} at a ${t.offense.pace >= 65 ? 'fast' : t.offense.pace <= 35 ? 'slow' : 'moderate'} pace.`);
  const topAct = (Object.entries(t.offense.actions) as [ActionType, number][]).sort((a, b) => b[1] - a[1])[0][0];
  offense.push(`Favorite action: ${ACTION_META[topAct].label}.`);
  if (t.offense.threePoint >= 70) offense.push('Lives behind the arc.');
  if (t.offense.crashBoards >= 65) offense.push('Crashes the offensive glass hard, which leaves them open to run-outs.');
  // ball-screen coverages and off-ball switching only apply in man-to-man: a zone plays its zone
  const man = t.defense.scheme === 'man';
  const scheme = SCHEME_META[t.defense.scheme].label;
  defense.push(
    man
      ? `Plays ${def?.name ?? 'man-to-man'}: ${COVERAGE_META[t.defense.pnr].label.toLowerCase()} coverage on ball screens.`
      : `Plays ${def && def.name !== scheme ? `${def.name} in a ${scheme}` : scheme}, so there is no ball-screen coverage to attack.`,
  );
  if (t.defense.press !== 'none') defense.push('Uses a full-court press, so secure ball handlers matter.');
  if (t.defense.help >= 65) defense.push('Helps aggressively off shooters into the paint.');
  if (t.defense.pressure >= 65) defense.push('Pressures the ball, which invites backdoor cuts and blow-bys.');
  if (spacing < CRAMPED_SPACING) weaknesses.push(`Poor spacing (${pct(spacing)}): pack the paint and dare them to shoot.`);
  if (security < 52) weaknesses.push('Loose with the ball: pressure and traps should force turnovers.');
  if (protector && protector.c.rimProt < 55) weaknesses.push('No real rim protection: attack the basket.');
  if (man && t.defense.pnr === 'drop') weaknesses.push('Drop coverage concedes pull-up jumpers and popping bigs.');
  if (man && (t.defense.pnr === 'switch' || t.defense.switchOffBall)) {
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
  const summary = `${team.region} ${team.name}: ${off?.name ?? 'Balanced'} offense, ${def?.name ?? 'man'} defense. Watch ${threats[0]?.name ?? 'their starters'}.`;
  return { tid, summary, offense, defense, threats, weaknesses };
}

/** Heuristic counters for the lab to test against a specific opponent. */
export function counterCandidates(league: League, userTid: number, oppTid: number): Candidate[] {
  const opp = league.teams[oppTid];
  const mine = league.teams[userTid];
  const { rot, creators, spacing, security } = readRotation(league, oppTid);
  const top = creators[0];
  const out: Candidate[] = [];
  const cur = mine.tactics;
  // coverages only apply in man-to-man, so from a zone each one is a change of scheme too
  const zone = cur.defense.scheme !== 'man';
  const cov = (c: PnrCoverage, why: string) => {
    if (zone || cur.defense.pnr !== c)
      out.push({
        id: `cov-${c}`,
        label: `${COVERAGE_META[c].label} coverage`,
        why: zone ? `${why} You'd play man-to-man instead of your zone.` : why,
        patch: { defense: { pnr: c, scheme: 'man', ...(c === 'switch' ? { switchOffBall: true } : {}) } },
      });
  };
  if (top) {
    const pull = (top.c.pu3 + top.c.midShot) / 2;
    if (pull >= 60) cov('hedge', `${top.p.lastName} is a dangerous pull-up shooter; don't give him space.`);
    if (pull >= 60) cov('ice', `Keep ${top.p.lastName} out of the middle and off pull-up threes.`);
    if (top.c.passing < 55) cov('blitz', `${top.p.lastName} is a shaky passer; trap him and make others beat you.`);
    else cov('drop', 'Protect the rim and live with contested pull-ups.');
    cov('switch', 'Switch everything to take away ball screens and handoffs.');
    if (cur.defense.starPlan !== 'double')
      out.push({
        id: 'star-double',
        label: `Double-team ${top.p.lastName}`,
        why: `Force the ${possessive(opp.name)} supporting cast to beat you.`,
        patch: { defense: { starPlan: 'double', starTarget: top.p.pid } },
      });
    if (cur.defense.starPlan !== 'deny')
      out.push({
        id: 'star-deny',
        label: `Deny ${top.p.lastName}`,
        why: 'Keep the ball out of his hands without giving up 4-on-3s.',
        patch: { defense: { starPlan: 'deny', starTarget: top.p.pid } },
      });
  }
  // spacing as scouting reads it: a zone only against the cramped fifth it flags, packing the
  // paint a little beyond that, staying home against about the best-spaced third
  if (spacing < CRAMPED_SPACING + 4 && cur.defense.help < 70)
    out.push({
      id: 'help-high',
      label: 'Pack the paint',
      why: `The ${opp.name} can't shoot (spacing ${Math.round(spacing)}). Sag off and protect the rim.`,
      patch: { defense: { help: 78 } },
    });
  if (spacing >= 45 && cur.defense.help > 40)
    out.push({ id: 'help-low', label: 'Stay home on shooters', why: `The ${opp.name} space the floor well; don't over-help.`, patch: { defense: { help: 32 } } });
  if (spacing < CRAMPED_SPACING && cur.defense.scheme === 'man')
    out.push({ id: 'zone', label: SCHEME_META.zone23.label, why: 'Dare a poor-shooting team to beat you from outside.', patch: { defense: { scheme: 'zone23' } } });
  if (security < 55 && cur.defense.pressure < 70)
    out.push({ id: 'pressure-up', label: 'Turn up the pressure', why: 'Their ball handlers are loose with it.', patch: { defense: { pressure: 82 } } });
  // offensive counters
  const od = opp.tactics.defense;
  if (od.pnr === 'drop' && od.scheme === 'man')
    out.push({
      id: 'vs-drop',
      label: 'Attack the drop',
      why: 'Pull-up jumpers and handoffs beat drop coverage.',
      patch: { offense: { actions: { ...cur.offense.actions, pnr: Math.min(100, cur.offense.actions.pnr + 20), handoff: Math.min(100, cur.offense.actions.handoff + 20) } } },
    });
  if (od.scheme === 'man' && (od.pnr === 'switch' || od.switchOffBall))
    out.push({
      id: 'vs-switch',
      label: 'Hunt mismatches',
      why: 'They switch everything; isolate the weakest defender.',
      patch: {
        offense: { huntMismatch: true, actions: { ...cur.offense.actions, iso: Math.min(100, cur.offense.actions.iso + 25), post: Math.min(100, cur.offense.actions.post + 15) } },
      },
    });
  if (od.scheme !== 'man' || od.help >= 65)
    out.push({
      id: 'vs-pack',
      label: 'Spread & move',
      why: 'Beat packed defenses with motion and threes.',
      patch: { offense: { threePoint: Math.min(100, cur.offense.threePoint + 18), actions: { ...cur.offense.actions, motion: Math.min(100, cur.offense.actions.motion + 25) } } },
    });
  if (od.pressure >= 65)
    out.push({
      id: 'vs-pressure',
      label: 'Backdoor & handoffs',
      why: 'Punish their overplays with cuts.',
      patch: { offense: { actions: { ...cur.offense.actions, motion: Math.min(100, cur.offense.actions.motion + 20), handoff: Math.min(100, cur.offense.actions.handoff + 15) } } },
    });
  const oppProfile = rosterProfile(rot);
  if (oppProfile.rimProtection < 58)
    out.push({ id: 'attack-rim', label: 'Attack the rim', why: 'No rim protector to worry about.', patch: { offense: { rimAttack: Math.min(100, cur.offense.rimAttack + 25) } } });
  if (oppProfile.athleticism < 50 && cur.offense.pace < 70)
    out.push({ id: 'pace-up', label: 'Push the pace', why: `The ${opp.name} are slow; run on them.`, patch: { offense: { pace: 78, transition: 85 } } });
  if (oppProfile.size < 48 && cur.offense.crashBoards < 70)
    out.push({ id: 'crash', label: 'Crash the glass', why: 'They are small; attack the offensive boards.', patch: { offense: { crashBoards: 78 } } });
  // a counter that changes nothing (sliders already at the limit) isn't worth simulating
  const same = JSON.stringify(cur);
  return out.filter((c) => JSON.stringify(applyPatch(cur, c.patch)) !== same).slice(0, 9);
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
  const pr = rosterProfile(healthy);
  const offFit = offPresetFit(pr);
  const defFit = defPresetFit(pr);
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
      body: `Your roster profile fits ${nm} better (fit ${Math.round(bestOff[1])} vs ${Math.round(offFit[curOff])}).`,
      link: '/tactics',
    });
  }
  if (team.tactics.manual && defFit[curDef] !== undefined && bestDef[1] - defFit[curDef] > 12) {
    const nm = DEF_PRESETS.find((x) => x.id === bestDef[0])?.name;
    alerts.push({
      id: 'def-fit',
      tone: 'alert',
      title: `Defense may not fit: try ${nm}`,
      body: `Your personnel fits ${nm} better (fit ${Math.round(bestDef[1])} vs ${Math.round(defFit[curDef])}).`,
      link: '/tactics',
    });
  }
  const rot = team.rotation;
  const starters = rot.order
    .slice(0, 5)
    .map((pid) => league.players[pid])
    .filter(Boolean);
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
    if (man && (team.tactics.defense.pnr === 'switch' || team.tactics.defense.switchOffBall) && starters.some(slowBig)) {
      alerts.push({
        id: 'switch-slow',
        tone: 'alert',
        title: 'Switching with a slow big',
        body: 'Opponents will hunt your center on switches. Use Drop or Ice when he is on the floor.',
        link: '/tactics',
      });
    }
  }
  const total = Object.entries(rot.minutes)
    .filter(([pid]) => players.some((p) => p.pid === +pid && !p.injury))
    .reduce((a, [, m]) => a + m, 0);
  if (rot.manual && Math.abs(total - 240) > 6)
    alerts.push({
      id: 'min-total',
      tone: 'alert',
      title: `Minutes add up to ${Math.round(total)}`,
      body: 'Minute targets are scaled to 240 automatically, so the actual split may differ from what you set.',
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
    if (p.wear >= 55)
      alerts.push({
        id: `wear-${p.pid}`,
        tone: 'alert',
        title: `${p.lastName} is worn down`,
        body: `Season wear ${Math.round(p.wear)}. Worn players shoot worse and get hurt more. Rest him on back-to-backs (Rotation).`,
        link: '/rotation',
      });
    if (p.mood.tradeRequest)
      alerts.push({ id: `tr-${p.pid}`, tone: 'bad', title: `${p.lastName} wants a trade`, body: moodText(p, 'He wants a fresh start somewhere else.'), link: `/player/${p.pid}` });
    else if (p.mood.score <= -4 && p.ovr >= 70)
      alerts.push({ id: `mood-${p.pid}`, tone: 'bad', title: `${p.lastName} is unhappy`, body: moodText(p, 'He is frustrated.'), link: `/player/${p.pid}` });
  }
  return alerts.slice(0, 8);
}
