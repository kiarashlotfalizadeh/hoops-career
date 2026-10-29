// One possession from the start: the late-game foul check, the play after a timeout, the press, the run-out decision (each setting's share
// of it tagged), and the half court's sequence of up to six actions, the first of which may be a set,
// with the shot clock running from the inbound. Also the shot profile the offense's settings and the
// game situation ask for, and its spacing.

import type { ActionType, SetId } from '../../types';
import { clamp } from '../../random';
import { GAME } from '../../constants';
import { SETS, isSetId } from '../sets';
import { K, lev, levExtra } from './constants';
import type { SP, ST, SetPlay, LateMode, ActionResult } from './state';
import type { GameSim } from './game';

export const possessionMethods = {
  possession(this: GameSim) {
    const o = this.poss;
    const off = this.T[o];
    const def = this.T[1 - o];
    let ctx = this.ctx;
    this.inbound = false;
    this.firstOpen = 0;
    this.sideOut = false;
    this.possPts = 0;
    this.secondChance = false;
    this.inTransition = false;
    this.possFinish = 'misc';
    this.lastShooter = null;
    this.possSet = null;
    this.possCtxForTOPts = ctx;
    const clockStart = this.clock;
    this.tripClock = clockStart;
    this.scramble = 1;
    // a timeout stops play: the trip out of it starts with an inbound, whatever the ball was doing
    // before (a steal or a defensive board still counts as what the trip came from)
    const outOfTimeout = this.timeoutStep;
    if (this.record) {
      this.cur = {
        off: o,
        q: this.q,
        clockStart,
        clockEnd: clockStart,
        kind: 'half',
        steps: this.timeoutStep ? [{ k: 'timeout', t: this.timeoutSide }] : [],
        pts: 0,
        score: [this.T[0].score, this.T[1].score],
        label: '',
        lines: [],
        on: [this.T[0].on.map((p) => p.pid), this.T[1].on.map((p) => p.pid)],
        guards: Object.fromEntries(off.on.map((p) => [p.pid, this.defOf(def, p).pid])),
        scheme: this.schemeNow(def),
        help: def.t.defense.help,
      };
      const chased = this.chased(def, off);
      if (chased.length) this.cur.chase = chased.map((p) => p.pid);
    }
    this.timeoutStep = false;
    off.poss++;
    for (const p of off.on) p.b.onPoss++;
    const ls = this.lineupStat(off);
    ls.poss++;
    if (this.stints) this.stint(off, def).poss++;

    // ---- end-of-game: intentional fouls by the defense (short of the penalty, a side out)
    const foul = this.intentionalFoul(off, def);
    if (foul === 'ft') return;
    // the shot clock runs from the inbound; a side-out foul stops it, and the inbound after it restarts
    // it where it was, or at 14 if it was under that (NBA)
    let shotFull = GAME.shotClock;
    let shotFrom = clockStart;
    if (foul === 'sideout') {
      ctx = 'deadTO';
      shotFull = Math.max(14, GAME.shotClock - (clockStart - this.clock));
      shotFrom = this.clock;
    }

    const late = this.lateMode(off, def);
    const paceF = this.paceF(off);
    // the after-timeout play is for this trip (a called play takes its place). Both wait for a trip
    // that gets to the half court: a press turnover or a run-out leaves them for the next one
    const ato = off.atoNext ? (off.t.manage.ato ?? null) : null;
    const queued = off.nextSet;
    // an after-timeout set is run for its player (the best fit when he's off the floor), and an
    // after-timeout isolation named for a player is a clear-out for him
    const atoPid = off.t.manage.atoPid ?? null;
    let set: { id: SetId; pid: number | null } | null = ato && isSetId(ato) ? { id: ato, pid: atoPid } : null;
    let first: ActionType | null = ato && !isSetId(ato) ? ato : null;
    let isoFor: SP | null = first === 'iso' && atoPid !== null ? (off.byId.get(atoPid) ?? null) : null;
    // a called play takes the after-timeout play's place: a set, or a clear-out isolation run as the
    // after-timeout isolation is (for its player while he's on the floor)
    if (queued) {
      const { id, pid } = queued;
      if (id === 'iso') {
        first = 'iso';
        isoFor = pid !== null ? (off.byId.get(pid) ?? null) : null;
        set = null;
      } else {
        first = null;
        isoFor = null;
        set = { id, pid };
      }
    }

    // ---- full court press
    let pressBroken = false;
    let pressed = 0;
    // (a team up big calls off its press, whatever the quarter: K.garbage.pressLead)
    const pressOn = (def.t.defense.press === 'always' || (def.t.defense.press === 'afterMade' && (ctx === 'made' || ctx === 'ft'))) && def.score - off.score < K.garbage.pressLead;
    if (pressOn && (ctx === 'made' || ctx === 'ft' || ctx === 'deadTO' || ctx === 'start' || outOfTimeout) && !late.hold) {
      const before = this.clock;
      const res = this.press(off, def);
      pressed = before - this.clock;
      if (res === 'to') return;
      pressBroken = res === 'broken';
    }

    // ---- transition
    const push = 0.55 + 0.9 * (off.t.offense.transition / 100);
    let transP = (K.transitionBase[ctx] ?? 0) * push;
    transP *= 1 + (off.speed - def.speed) / K.runSpeed.often;
    const getBack = 1.25 - 0.5 * (def.t.defense.getBack / 100) + levExtra(0.25 - 0.5 * (def.t.defense.getBack / 100));
    transP *= getBack;
    // crashing the offensive glass leaves you exposed (the defense crashed on its last
    // possession): a little below 50, a lot above it (more so past 1x leverage, see K.tradeOff)
    const crashLeak = ctx === 'dreb' ? (this.crashOf(def) - 50) / 50 : 0;
    // (never quite none: each run-out that happens books its share of the ones saved)
    const leak = Math.max(0.1, 1 + lev((crashLeak > 0 ? K.crashLeak : K.crashLow.leak) * crashLeak) + levExtra(K.tradeOff.crash * Math.max(0, crashLeak)));
    transP *= leak;
    if (pressBroken) transP = 0.75;
    if (late.hold || late.milk) transP *= 0.2;
    // (nor does it push the ball: it walks it up, see K.garbage)
    const easing = this.eases(off);
    if (easing) transP *= K.garbage.run;
    if (late.hurry) transP *= 1.5;
    // a called play is walked up and run in the half court, and so is the inbounds play after a foul to
    // give or a timeout
    if (queued || this.inbound || outOfTimeout) transP = 0;

    if (this.clock > 2 && this.rng.chance(clamp(transP, 0, 0.85))) {
      // each setting's share of the run-outs, at K.runOutPts per run-out over a half-court trip
      if (!pressBroken) {
        this.impact('transition', o, ((K.runOutPts * (push - 1)) / push) * (push < 1 ? K.walkUpTag : 1));
        this.impact('getback', (1 - o) as 0 | 1, (K.runOutPts * (1 - getBack)) / getBack + lev((def.t.defense.getBack - 50) / 100) * K.transAdvPts);
        if (leak !== 1) this.impact('crash_leak', o, ((K.runOutPts * (leak - 1)) / leak + this.crashRunOut(def, ctx) * K.transAdvPts) * (crashLeak > 0 ? K.crashTag.leak : 1));
      }
      this.transition(off, def, ctx, pressBroken);
      return;
    }

    // ---- half court: the trip uses up the after-timeout play and a called one
    if (this.cur) this.cur.kind = 'half';
    // a defense that didn't crash the glass is back and set when the ball comes up the floor
    if (crashLeak < 0 && !outOfTimeout) {
      this.firstOpen = lev(K.crashLow.set * crashLeak);
      this.impact('crash_leak', o, this.firstOpen * K.crashLow.setPts);
    }
    off.atoNext = false;
    off.nextSet = null;
    // (out of a timeout, the ball is inbounded and brought up, as after any dead ball)
    let setup = (K.setup[outOfTimeout && (ctx === 'steal' || ctx === 'dreb') ? 'deadTO' : ctx] ?? 4) * paceF * this.rng.uniform(0.75, 1.25);
    // (a press beaten is the ball brought up: the time it took was the walk-up)
    if (pressed) setup = Math.max(2, setup - pressed);
    if (late.milk) setup += 6;
    else if (easing) setup += K.garbage.slow;
    if (late.hold) {
      // run the clock down for a last shot. At the end of a game, start the action with time for it to
      // work: tied, with eight to ten seconds left (the shot goes up with a few to spare, a miss can
      // still be put back); behind, a little sooner, leaving time to foul or get it back. The other
      // quarters' last shots are played as they always were
      const start = this.q < 4 ? null : off.score < def.score ? K.holdStart.behind : K.holdStart.tied;
      setup = Math.max(setup, this.clock - (start ? this.rng.uniform(start[0], start[1]) : K.holdStart.quarter));
    }
    if (late.quick || late.hurry) setup = Math.min(setup, 2.5);
    // the period is about to run out: push it up the floor and get a shot off before the buzzer
    // (unless it's a lead to run out: then the clock dies with the ball); tied or down three or less
    // at the end of the game, a second is enough for a quick catch-and-shoot
    const chasing = this.q >= 4 && off.score <= def.score && off.score >= def.score - 3;
    if (!late.milk && this.clock >= (chasing ? 0.8 : 2.5) && setup > this.clock - 2.5) setup = Math.max(0.5, this.clock * 0.4);
    // the shot clock started on the inbound: time spent breaking a press is gone
    let shotClock = shotFull - (shotFrom - this.clock);
    if (this.record) this.cur!.steps.push({ k: 'advance', pid: off.on.reduce((a, p) => (p.c.pnrHandle > a.c.pnrHandle ? p : a), off.on[0]).pid });
    setup = Math.min(setup, shotClock - 4);
    this.tick(setup);
    shotClock -= setup;
    if (this.clock <= 0.05) {
      this.clockOut(off);
      return;
    }
    this.halfCourt(off, def, shotClock, late, paceF, first, isoFor, set);
  },

  /**
   * `first`: an action the trip opens with (an after-timeout play, a called isolation for `isoFor`);
   * `set`: a set it opens with instead (called, or after a timeout), for a player or the best fit.
   */
  halfCourt(
    this: GameSim,
    off: ST,
    def: ST,
    shotClock: number,
    late: LateMode,
    paceF: number,
    first: ActionType | null = null,
    isoFor: SP | null = null,
    set: { id: SetId; pid: number | null } | null = null,
  ) {
    // an inbounds play after a foul to give starts from a worse look
    let carryOpen = (this.inbound ? -K.ftg.open : 0) + this.firstOpen;
    this.inbound = false;
    this.firstOpen = 0;
    let ballFrom: SP | null = null;
    let forced = false;
    // (rushed actions a side-out foul cut short, which don't count toward the trip's six)
    let stops = 0;
    for (let n = 0; n < 6 + stops; n++) {
      // a late lead with the shot clock off (it can't run out before the game clock): the clock dies with the ball
      if (late.milk && this.clock <= shotClock) this.tick(this.clock);
      if (this.clock <= 0.05) {
        this.clockOut(off);
        return;
      }
      const left = Math.min(shotClock, this.clock);
      // the last shot of a game (the game clock runs out before the shot clock): a team holding for it
      // runs its play and shoots with a second or few to spare, time for a miss to be put back,
      // instead of letting the horn decide when it goes up
      const lastShot = late.hold && this.q >= 4 && this.clock < shotClock && left > 3;
      forced = left <= 4.5 || n === 5 + stops || lastShot;
      // the trip opens with its set: one called from the bench, or after a timeout
      let play: SetPlay | null = null;
      if (n === 0 && set) play = this.setPlay(off, def, set.id, set.pid);
      const action = play ? play.cast.action : n === 0 && first ? first : forced ? (this.rng.chance(0.6) ? 'iso' : 'pnr') : this.chooseAction(off, late);
      let dt = lastShot
        ? Math.max(0.5, Math.min(left - this.rng.uniform(K.lastShotSpare[0], K.lastShotSpare[1]), K.actionTime * paceF * this.rng.uniform(0.6, 1)))
        : forced
          ? Math.max(0.5, left - this.rng.uniform(0.3, 1.5))
          : K.actionTime * paceF * this.rng.uniform(0.6, 1.4);
      if (late.quick && n === 0) dt = Math.min(dt, 3.5);
      if (late.hurry) dt = Math.min(dt, 4);
      // a set takes longer to run than whatever the team would do: with too little clock it's rushed
      if (play) dt += SETS[play.cast.id].time;
      let buzzer = false;
      if (dt >= left - 0.3) {
        dt = Math.max(0, left - this.rng.uniform(0.2, 0.9));
        buzzer = true;
      }
      this.tick(dt);
      shotClock -= dt;
      // a trip begun with the game nearly over (a rebound, a steal or an inbound with a second or two
      // left in the fourth quarter or overtime) gets what it can: a heave or a scrambled catch, rarely
      // a good look (the other quarters' last trips are left as they were calibrated)
      this.scramble = this.q >= 4 && this.tripClock < K.scramble.sec ? 1 - K.scramble.cut * (1 - this.tripClock / K.scramble.sec) : 1;
      const urgency = buzzer || forced ? -0.45 : 0;
      const ctxOpen = carryOpen + urgency;
      if (n === 0 && isoFor) {
        this.calledActor = isoFor;
        // a clear-out for a player on the floor: its possession counts for the night's tally of them
        if (isoFor.on) {
          this.possSet = this.setStat(off.side, 'iso');
          if (this.cur) this.cur.iso = isoFor.pid;
        }
      }
      this.play = play;
      // (a set run for a shooter is the staff getting him his look: he takes it whatever his share of
      // the threes tonight, see threeDamp; the damp is back at the next shot)
      if (play) play.cast.star.t3 = play.cast.star.t3o;
      const res = this.runAction(action, off, def, ctxOpen, ballFrom, late, forced || buzzer);
      this.calledActor = null;
      this.play = null;
      if (res === 'done') return;
      // a side-out foul in the action: the shot clock restarts where it was, or at 14 if it was under
      // that (NBA); a rushed action it cut short doesn't count toward the trip's six
      if (this.sideOut) {
        this.sideOut = false;
        shotClock = Math.max(shotClock, 14);
        if (forced || buzzer) stops++;
      }
      // continue: ball reversed, maybe with a small residual advantage
      carryOpen = res.carry;
      ballFrom = res.ball;
    }
    this.finishPoss(off, 'misc');
  },

  runAction(this: GameSim, action: ActionType, off: ST, def: ST, open: number, ballFrom: SP | null, late: LateMode, forced: boolean): ActionResult {
    if (this.cur && !this.cur.action) this.cur.action = action;
    switch (action) {
      case 'pnr':
        return this.pnr(off, def, open, late, forced);
      case 'iso':
        return this.iso(off, def, open, late, forced, null);
      case 'post':
        return this.post(off, def, open, forced, null);
      case 'handoff':
        return this.handoff(off, def, open, late, forced);
      case 'motion':
        return this.motion(off, def, open, ballFrom, late, forced);
    }
  },

  prefs(this: GameSim, off: ST, late: LateMode) {
    const t3 = off.t.offense.threePoint / 100;
    let three = (0.48 + 0.8 * t3) * (1 + levExtra(K.recenter.three));
    let mid = 1.43 - 0.95 * t3;
    const rim = 0.7 + 0.6 * (off.t.offense.rimAttack / 100);
    // (two: the weight left on the looks that can only be twos, the roll and the drive on the catch)
    let two = 1;
    if (late.need3) {
      three *= 6;
      mid *= 0.1;
      // with the clock nearly out a two doesn't tie it: only a three will do
      two = this.clock <= 12 ? 0.08 : 0.3;
    } else if (late.hurry) {
      three *= 1.8;
      mid *= 0.5;
    } else if (late.tie) three *= 0.6;
    // (a team easing off a blowout hunts fewer threes)
    if (this.eases(off)) three *= K.garbage.three;
    return { three, mid, rim: late.need3 ? rim * two : rim, two };
  },

  spacingBonus(this: GameSim, off: ST) {
    return (off.spacing - 45) / 100; // ~ -0.3..+0.35
  },

  passStep(this: GameSim, from: SP, to: SP) {
    if (this.record) this.cur!.steps.push({ k: 'pass', pid: from.pid, pid2: to.pid });
  },
};
