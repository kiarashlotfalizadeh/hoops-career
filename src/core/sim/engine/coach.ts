// The coaches' side of a game, between possessions: the situational plan in effect (base tactics with
// its patch on top), timeouts (who may call one in a live ball, the late-game limits, the staff's
// automatic ones against a run, one asked for in the other side's live ball waiting for the dead ball)
// and an AI coach's adjustments at the breaks, read from the tags the other side is cashing in.

import type { SituationalPlan, Tactics } from '../../types';
import { archetype } from '../../ratings';
import { GAME } from '../../constants';
import type { FinishType } from '../log';
import { MAX_SITUATIONS, applyPatch, cloneTactics } from '../tactics';
import { type ST, freedomMult } from './state';
import type { GameSim } from './game';

export const coachMethods = {
  /** The first enabled situational plan whose trigger matches the game right now. */
  situationFor(this: GameSim, t: ST): SituationalPlan | null {
    const plans = t.base.situations;
    if (!plans?.length) return null;
    const lead = t.score - this.T[1 - t.side].score;
    // overtime counts as the 4th quarter
    const q = Math.min(this.q, 4);
    for (const s of plans.slice(0, MAX_SITUATIONS)) {
      const w = s.when;
      if (!s.enabled || q < (w.fromQ ?? 1) || q > (w.untilQ ?? 4)) continue;
      if ((w.maxClock !== undefined && this.clock > w.maxClock) || (w.minLead !== undefined && lead < w.minLead) || (w.maxLead !== undefined && lead > w.maxLead)) continue;
      if (w.benchUnit && t.on.filter((p) => !p.starter).length < 3) continue;
      return s;
    }
    return null;
  },

  /**
   * Plays the situational plan that fits the game now (base tactics with its patch on top), when it
   * changes or `rebase` brings new base tactics. No random draws: a team without situational plans
   * plays exactly as before.
   */
  situate(this: GameSim, t: ST, rebase = false) {
    const plan = this.situationFor(t);
    const changed = (plan?.id ?? '') !== (t.sit?.id ?? '');
    if (!changed && !rebase) return;
    const before = JSON.stringify(t.t.defense);
    t.t = plan ? applyPatch(t.base, plan.patch) : cloneTactics(t.base);
    t.sit = plan && { id: plan.id, label: plan.label };
    // (a role the tactics no longer set goes back to his archetype's, as at the tip: a plan's role
    // doesn't outlast the plan)
    for (const p of t.players) {
      p.role = t.t.offense.roles[p.pid] ?? archetype(p.r).role;
      p.freedom = freedomMult(t.t.offense.freedom[p.pid] ?? 0);
    }
    if (rebase || JSON.stringify(t.t.defense) !== before) this.refreshMatchups();
    if (changed) this.addPbp(t.side, plan ? `${t.team.abbrev} switches to its "${plan.label}" plan.` : `${t.team.abbrev} goes back to its base plan.`, 'other');
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
    // the change is decided on what is being played, and made to the base tactics too, so it
    // outlasts a situational plan coming or going
    let what = '';
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
    } else if (d.scheme !== 'man') {
      if (rate('zone_3pt:o') + rate('zone_glass:o') + rate('box_open:o') + rate('box_beat:o') >= 1) {
        change = (x) => void (x.defense.scheme = 'man');
        what = 'goes back to man-to-man';
      }
    } else if (d.pnr === 'drop' && (rate('drop_pullup:o') + rate('drop_pop:o') >= 0.8 || ppp('pnrBH') >= 1.15)) {
      change = (x) => void (x.defense.pnr = 'hedge');
      what = 'hedges ball screens instead of dropping';
    } else if (d.pnr === 'blitz' && rate('blitz_4v3:o') >= 0.6) {
      change = (x) => void (x.defense.pnr = 'hedge');
      what = 'stops blitzing ball screens';
    } else if (d.pnr !== 'drop' && (ppp('pnrRoll') >= 1.45 || rate('switch_mismatch:o') >= 0.8 || rate('hedge_roll:o') >= 0.6)) {
      change = (x) => {
        x.defense.pnr = 'drop';
        x.defense.switchOffBall = false;
      };
      what = 'drops the big on ball screens';
    }
    if (!what) {
      if (rate('help_kick:o') >= 0.6 && d.help > 30) {
        change = (x) => void (x.defense.help = Math.max(0, x.defense.help - 15));
        what = 'stays home on shooters';
      } else if (rate('help_paint:o') + rate('spacing:o') >= 0.6 && d.help < 75) {
        change = (x) => void (x.defense.help = Math.min(100, x.defense.help + 15));
        what = 'packs the paint';
      } else if (rate('pressure_blowby:o') + rate('pressure_backdoor:o') + rate('pressure_foul:o') >= 0.5 && d.pressure > 35) {
        change = (x) => void (x.defense.pressure = Math.max(0, x.defense.pressure - 15));
        what = 'backs off the ball';
      } else if (rate('crash_leak:o') >= 0.5 && t.t.offense.crashBoards > 25) {
        change = (x) => void (x.offense.crashBoards = Math.max(0, x.offense.crashBoards - 20));
        what = 'sends fewer players to the offensive glass';
      } else if (rate('getback:o') >= 0.4 && d.getBack < 80) {
        change = (x) => void (x.defense.getBack = Math.min(100, x.defense.getBack + 15));
        what = 'sprints back in transition';
      }
    }
    if (!what) return;
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
