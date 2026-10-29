// The coaches' side of a game, between possessions: new base tactics from the bench, timeouts (who may
// call one in a live ball, the late-game limits, the staff's automatic ones against a run, one asked
// for in the other side's live ball waiting for the dead ball) and an AI coach's adjustments at the
// breaks, read from the tags the other side is cashing in.

import type { Tactics } from '../../types';
import { archetype } from '../../ratings';
import { GAME } from '../../constants';
import type { FinishType } from '../log';
import { cloneTactics, defRoleOf, withMentality } from '../tactics';
import { type ST, ACTION_LIST, freedomMult } from './state';
import type { GameSim } from './game';

/**
 * The adjustments the user's assistant doesn't make at the breaks of a simmed game (the side whose
 * team is marked `assistant`: see buildSimInput), measured for the user's side (12 teams' first 12
 * games, 120 seeds each, injuries off; scratch round/gameday/adjust.mts, 2026-10-25), each kind kept
 * alone against none over 7,200 paired games, in points of margin: going from Drop to Hedge cost 1.9
 * a game where it was made, backing off the ball 0.35 and staying home on shooters 3.4 (on 36 games).
 * Over 17,280 paired games against no adjustments (injuries off): with every kind, +0.31 ± 0.09 a game;
 * without these three, +0.47 ± 0.09. Re-measured with injuries on (28,160 paired games over 32 team
 * runs, 2026-10-26): +0.05 ± 0.15, about even, swinging from +0.64 to −0.37 by matchups. AI coaches
 * make all of them as before.
 */
const ASSISTANT_SKIPS = new Set(['hedge', 'backoff', 'home']);

export const coachMethods = {
  /** Plays the team's base tactics (new ones from the bench), with the mentality's nudges on top. No random draws. */
  rebase(this: GameSim, t: ST) {
    const shape = t.t.offense.shape;
    t.t = withMentality(cloneTactics(t.base));
    // (a role the tactics no longer set goes back to his archetype's, as at the tip)
    for (const p of t.players) {
      p.role = t.t.offense.roles[p.pid] ?? archetype(p.r).role;
      p.freedom = freedomMult(t.t.offense.freedom[p.pid] ?? 0);
      p.drole = defRoleOf(t.t.defense, p.pid);
      p.glass = t.t.offense.glass?.[p.pid] ?? 0;
    }
    this.refreshMatchups();
    // (a new shape is new spacing for the five on the floor)
    if (t.t.offense.shape !== shape && t.on.length) {
      t.spacing = this.shapeSpacing(t);
      for (const a of ACTION_LIST) t.cap[a] = this.capability(t, a);
    }
  },

  /** Whether the team on `side` may call a timeout now: in a dead ball, or with the ball in its hands. */
  mayCallTimeout(this: GameSim, side: 0 | 1): boolean {
    return this.poss === side || (this.ctx !== 'steal' && this.ctx !== 'dreb');
  },

  /**
   * After a possession: a timeout asked for during the other side's live ball is taken now, at the dead
   * ball (or the change of possession) that ended it, unless the period ran out first.
   */
  takeWaitingTimeouts(this: GameSim) {
    for (const t of this.T) {
      if (t.toWait === null) continue;
      const reason = t.toWait;
      t.toWait = null;
      if (this.atBuzzer()) continue;
      // (none left by now, under the late-game limits: it isn't taken)
      if (this.mayCallTimeout(t.side)) this.callTimeout(t.side, reason);
      else t.toWait = reason;
    }
  },

  /** Points the team on `side` has gained from an impact key (e.g. 'drop_pullup:o') so far, per 12 minutes played. */
  gainedRate(this: GameSim, side: 0 | 1, key: string) {
    return ((this.impacts.get(`${key}|${side}`)?.pts ?? 0) * GAME.quarterSec) / Math.max(360, this.elapsed);
  },

  /**
   * In-game adjustments by an AI coach at a break: if the opponent is exploiting something
   * (per the impact tags and play-type PPP), change one thing, more often the better the coach.
   */
  adjust(this: GameSim, t: ST) {
    if (!t.adjust || t.adjustedQ === this.q || this.elapsed < 360 || !this.rng.chance(t.adjust)) return;
    const opp = this.T[1 - t.side];
    const d = t.t.defense;
    const rate = (key: string) => this.gainedRate(opp.side, key);
    const ppp = (f: FinishType) => {
      const x = opp.pt[f];
      return x && x.poss >= 6 ? x.pts / x.poss : 0;
    };
    // the change is decided on what is being played, and made to the base tactics too
    let what = '';
    /** Which kind of change it is (see ASSISTANT_SKIPS). */
    let kind = '';
    let change = (x: Tactics) => void x;
    // a defender the other bench hunts with success gets hidden on their weakest scorer on the floor
    // (only ever when the opponent hunts one: never in a game between AI teams)
    const huntedD = rate('hunt:o') >= 0.5 ? t.byId.get(opp.t.offense.huntTarget ?? -1) : undefined;
    const weak = huntedD?.on ? opp.on.filter((p) => t.guardOf.get(p.pid) !== huntedD).sort((a, b) => this.threat(a, opp) - this.threat(b, opp) || a.pid - b.pid)[0] : undefined;
    const junk = d.scheme === 'box1' || d.scheme === 'tri2';
    if (huntedD && weak) {
      change = (x) => {
        for (const k of Object.keys(x.defense.matchups)) if (x.defense.matchups[+k] === huntedD.pid) delete x.defense.matchups[+k];
        x.defense.matchups[weak.pid] = huntedD.pid;
      };
      what = `hides ${huntedD.name} on ${weak.name}`;
      kind = 'hide';
    } else if (d.scheme !== 'man') {
      if (rate('zone_3pt:o') + rate('zone_glass:o') + rate('box_open:o') + rate('box_beat:o') >= 1) {
        change = (x) => void (x.defense.scheme = 'man');
        what = 'goes back to man-to-man';
        kind = 'man';
      }
    } else if (d.pnr === 'drop' && (rate('drop_pullup:o') + rate('drop_pop:o') >= 0.8 || ppp('pnrBH') >= 1.15)) {
      change = (x) => void (x.defense.pnr = 'hedge');
      what = 'hedges ball screens instead of dropping';
      kind = 'hedge';
    } else if (d.pnr === 'blitz' && rate('blitz_4v3:o') >= 0.6) {
      change = (x) => void (x.defense.pnr = 'hedge');
      what = 'stops blitzing ball screens';
      kind = 'unblitz';
      // (0.3 a quarter of mismatch points: the off-ball switches' tags count what they're worth, K.offBallTag,
      // so this is the 0.8 the coaches read before, the same games for them to react to)
    } else if (d.pnr !== 'drop' && (ppp('pnrRoll') >= 1.45 || rate('switch_mismatch:o') >= 0.3 || rate('hedge_roll:o') >= 0.6)) {
      change = (x) => {
        x.defense.pnr = 'drop';
        x.defense.switchOffBall = false;
      };
      what = 'drops the big on ball screens';
      kind = 'drop';
    }
    if (!what) {
      if (rate('help_kick:o') >= 0.6 && d.help > 30) {
        change = (x) => void (x.defense.help = Math.max(0, x.defense.help - 15));
        what = 'stays home on shooters';
        kind = 'home';
      } else if (rate('help_paint:o') + rate('spacing:o') >= 0.6 && d.help < 75) {
        change = (x) => void (x.defense.help = Math.min(100, x.defense.help + 15));
        what = 'packs the paint';
        kind = 'pack';
        // (backing off and crashing less pay only from an extreme: the change stops at the middle,
        // where giving up turnovers or boards would cost more than the blow-bys or run-outs it saves)
      } else if (rate('pressure_blowby:o') + rate('pressure_backdoor:o') + rate('pressure_foul:o') >= 0.5 && d.pressure > 60) {
        change = (x) => void (x.defense.pressure = Math.max(50, x.defense.pressure - 15));
        what = 'backs off the ball';
        kind = 'backoff';
      } else if (rate('crash_leak:o') >= 0.5 && t.t.offense.crashBoards > 65) {
        change = (x) => void (x.offense.crashBoards = Math.max(55, x.offense.crashBoards - 20));
        what = 'sends fewer players to the offensive glass';
        kind = 'glass';
      } else if (rate('getback:o') >= 0.4 && d.getBack < 80) {
        change = (x) => void (x.defense.getBack = Math.min(100, x.defense.getBack + 15));
        what = 'sprints back in transition';
        kind = 'getback';
      }
    }
    // (the user's assistant leaves the kinds that cost his side alone, and may look again at the next stop)
    if (!what || (t.team.assistant && ASSISTANT_SKIPS.has(kind))) return;
    change(t.t);
    change(t.base);
    // a hidden defender and chasers called off are new assignments
    if ((huntedD && weak) || junk) this.refreshMatchups();
    t.adjustedQ = this.q;
    this.adjustments.push({ t: t.side, q: this.q, clock: Math.round(this.clock), text: what });
    this.addPbp(t.side, `${t.team.abbrev} adjusts: ${what}.`, 'other');
  },

  /** NBA: no more than two timeouts each after the 3:00 mark of the fourth quarter. */
  lateTimeouts(this: GameSim) {
    if (this.q === 4 && this.clock <= 180) for (const t of this.T) t.timeouts = Math.min(t.timeouts, 2);
  },

  autoTimeouts(this: GameSim) {
    this.lateTimeouts();
    for (const t of this.T) {
      const opp = this.T[1 - t.side];
      // (in a live ball only the team with the ball may call one)
      if (!t.t.manage.autoTimeouts || t.manualSubs || !this.mayCallTimeout(t.side)) continue;
      const late = this.q >= 4 && this.clock < 120;
      const reserve = late ? 0 : this.q >= 4 ? 1 : 2;
      if (opp.run >= t.t.manage.timeoutRun && t.timeouts > reserve) {
        this.callTimeout(t.side, `${opp.run}-0 run`);
      }
    }
  },
};
