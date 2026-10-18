// What a game records: the tagged expected-points effects (the "why" behind every report), points
// on the board with everything they count for, turnovers, the end of a possession (play types, the
// set's tally, the possession log, the score flow), lineup tallies, play-by-play, and the GameResult
// built from all of it.

import type { BoxLine, GameResult, LineupStat, PbpEntry, TeamBox } from '../../types';
import { FINISH_LABEL, type FinishType, type PossLog } from '../log';
import type { Box, SP, ST } from './state';
import type { GameSim } from './game';

export const recordMethods = {
  lineupStat(this: GameSim, t: ST): LineupStat {
    if (t.ls) return t.ls;
    const key = `${t.side}:${t.lineupKey}`;
    let ls = this.lineups.get(key);
    if (!ls) {
      ls = { t: t.side, pids: t.on.map((p) => p.pid), poss: 0, ptsFor: 0, ptsAgainst: 0, sec: 0 };
      this.lineups.set(key, ls);
    }
    t.ls = ls;
    return ls;
  },

  /**
   * Record an expected-points effect. `benefit` is the side the effect is meant to help;
   * negative pts flip it to the other side. Keys are stored with the beneficiary's role in
   * the possession (':o' offense, ':d' defense) so reports can phrase them correctly.
   */
  impact(this: GameSim, key: string, benefit: 0 | 1, pts: number, pid?: number) {
    if (!pts) return;
    if (pts < 0) {
      benefit = (1 - benefit) as 0 | 1;
      pts = -pts;
    }
    const roleO = benefit === this.poss;
    let slots = this.impactSlots.get(key);
    if (!slots) {
      slots = [null, null, null, null];
      this.impactSlots.set(key, slots);
    }
    const si = benefit * 2 + (roleO ? 0 : 1);
    let im = slots[si];
    if (!im) {
      const full = `${key}:${roleO ? 'o' : 'd'}`;
      im = { key: full, t: benefit, count: 0, pts: 0, players: {} };
      slots[si] = im;
      this.impacts.set(`${full}|${benefit}`, im);
    }
    im.count++;
    im.pts += pts;
    if (pid !== undefined) im.players[pid] = (im.players[pid] ?? 0) + 1;
  },

  turnover(this: GameSim, off: ST, def: ST, handler: SP, stealer: SP | null, finish: FinishType | 'press') {
    handler.b.tov++;
    off.tot.tov++;
    for (const p of off.on) p.b.tTov++;
    const live = !!stealer;
    if (stealer) {
      stealer.b.stl++;
      def.tot.stl++;
    }
    const charge = !stealer && this.rng.chance(0.24);
    if (this.record) {
      const text = stealer
        ? `${handler.name} turnover, stolen by ${stealer.name}.`
        : charge
          ? `${handler.name} offensive foul.`
          : `${handler.name} turnover (${this.fx.pick(['bad pass', 'lost ball', 'traveling', 'out of bounds', 'bad pass'])}).`;
      this.addPbp(off.side, text, 'to');
      this.cur!.steps.push({ k: stealer ? 'steal' : 'to', pid: handler.pid, pid2: stealer?.pid });
    }
    if (charge) this.chargeFoul(off, handler);
    this.ctx = live ? 'steal' : 'deadTO';
    this.finishPoss(off, finish === 'press' ? 'misc' : finish);
  },

  score(this: GameSim, off: ST, def: ST, sh: SP, pts: number) {
    off.score += pts;
    off.qs[off.qs.length - 1] += pts;
    off.tot.pts += pts;
    sh.b.pts += pts;
    this.possPts += pts;
    for (const p of off.on) {
      p.b.pm += pts;
      p.b.onPF += pts;
    }
    for (const p of def.on) {
      p.b.pm -= pts;
      p.b.onPA += pts;
    }
    this.lineupStat(off).ptsFor += pts;
    this.lineupStat(def).ptsAgainst += pts;
    if (!sh.starter) off.ex.bench += pts;
    if (this.secondChance) off.ex.secondChance += pts;
    if (this.inTransition) off.ex.fastBreak += pts;
    if (this.possCtxForTOPts === 'steal' || this.possCtxForTOPts === 'deadTO') off.ex.offTov += pts;
    off.run += pts;
    def.run = 0;
    const lead = off.score - def.score;
    if (lead > off.ex.biggestLead) off.ex.biggestLead = lead;
  },

  finishPoss(this: GameSim, off: ST, finish: FinishType) {
    const pt = off.pt[finish] ?? (off.pt[finish] = { poss: 0, pts: 0 });
    pt.poss++;
    pt.pts += this.possPts;
    // the possession a set opened (second chances included) counts for its tally
    if (this.possSet) this.possSet.pts += this.possPts;
    this.possSet = null;
    if (this.cur) {
      this.cur.clockEnd = this.clock;
      this.cur.pts = this.possPts;
      this.cur.score = [this.T[0].score, this.T[1].score];
      if (!this.cur.finish) this.cur.finish = finish;
      if (!this.cur.label) this.cur.label = FINISH_LABEL[finish];
      this.logs.push(this.cur);
      this.cur = null;
    }
    this.flow.push(this.T[0].score - this.T[1].score);
    this.flowT.push(Math.round(this.elapsed));
    // injuries
    if (this.opts.injuries !== false) this.injuryCheck();
    this.poss = (1 - off.side) as 0 | 1;
    if (this.ctx === 'orb') this.ctx = 'dreb';
  },

  addPbp(this: GameSim, side: 0 | 1 | -1, text: string, kind: PbpEntry['kind']) {
    if (!this.record) return;
    // a name that ends in a period ("Reed Jr.") closes the sentence itself
    text = text.replace(/\.\.+/g, '.');
    this.pbp.push({ q: this.q, clock: Math.max(0, Math.round(this.clock * 10) / 10), t: side, text, hs: this.T?.[0]?.score ?? 0, as: this.T?.[1]?.score ?? 0, kind });
    if (this.cur) this.cur.lines.push(text);
  },

  result(this: GameSim, gid = 0, season = 0, day = 0): GameResult {
    const box = (t: ST): TeamBox => {
      const tenths = boxTenths(t.players.map((p) => p.b.sec));
      const players: BoxLine[] = t.players.map((p, i) => ({
        pid: p.pid,
        name: p.full,
        pos: p.pos,
        gs: p.starter,
        min: tenths[i] / 10,
        fgm: p.b.fgm,
        fga: p.b.fga,
        tpm: p.b.tpm,
        tpa: p.b.tpa,
        ftm: p.b.ftm,
        fta: p.b.fta,
        orb: p.b.orb,
        drb: p.b.drb,
        ast: p.b.ast,
        stl: p.b.stl,
        blk: p.b.blk,
        tov: p.b.tov,
        pf: p.b.pf,
        pts: p.b.pts,
        pm: p.b.pm,
        energy: Math.round(p.energy * 100) / 100,
        dnp: p.played ? undefined : (p.dnp ?? "Coach's decision"),
      }));
      return {
        tid: t.tid,
        pts: t.score,
        quarters: t.qs.slice(),
        players,
        t: { ...t.tot },
        poss: t.poss,
        timeoutsLeft: t.timeouts,
        playTypes: t.pt,
        extra: { ...t.ex },
      };
    };
    // player of the game: game score
    let pog = -1;
    let best = -999;
    for (const t of this.T) {
      for (const p of t.players) {
        const b = p.b;
        const gmsc =
          b.pts +
          0.4 * b.fgm -
          0.7 * b.fga -
          0.4 * (b.fta - b.ftm) +
          0.7 * b.orb +
          0.3 * b.drb +
          b.stl +
          0.7 * b.ast +
          0.7 * b.blk -
          0.4 * b.pf -
          b.tov +
          (t.score > this.T[1 - t.side].score ? 2 : 0);
        if (gmsc > best) {
          best = gmsc;
          pog = p.pid;
        }
      }
    }
    return {
      gid,
      season,
      day,
      type: this.opts.type,
      home: box(this.T[0]),
      away: box(this.T[1]),
      ot: Math.max(0, this.q - 4),
      shots: this.shots,
      impacts: [...this.impacts.values()].filter((i) => i.pts >= 0.05).map((i) => ({ ...i, pts: Math.round(i.pts * 100) / 100 })),
      // every unit, however short its stints (the lineup lab's pairs and trios add them all up)
      lineups: [...this.lineups.values()],
      flow: this.flow,
      flowPeriods: this.flowPeriods,
      flowT: this.flowT,
      flowPoss: this.flowPoss,
      pbp: this.record ? this.pbp : undefined,
      adjustments: this.adjustments.length ? this.adjustments.map((a) => ({ ...a })) : undefined,
      pog,
      // (only a game where a set or a clear-out was run has them: nobody else's result changes shape)
      ...(this.setStats.size ? { sets: [...this.setStats.values()].map((s) => ({ ...s })) } : {}),
    };
  },

  /** Raw per-player internal box (with on-court context) for season stat accumulation. */
  rawBoxes(this: GameSim): { tid: number; pid: number; b: Box; played: boolean; starter: boolean }[] {
    const out: { tid: number; pid: number; b: Box; played: boolean; starter: boolean }[] = [];
    for (const t of this.T) for (const p of t.players) out.push({ tid: t.tid, pid: p.pid, b: p.b, played: p.played, starter: p.starter });
    return out;
  },

  /** Drain recorded possession logs (for the live view). */
  drainLogs(this: GameSim): PossLog[] {
    const l = this.logs;
    this.logs = [];
    return l;
  },
};

/**
 * Box-score minutes in tenths from seconds played: rounded so a team's minutes add up to exactly
 * the time it played (largest remainder), and anyone who got on the floor shows at least 0.1.
 */
function boxTenths(secs: number[]): number[] {
  const raw = secs.map((s) => s / 6);
  const out = raw.map((r, i) => (secs[i] > 0 ? Math.max(1, Math.floor(r)) : 0));
  let left = Math.round(raw.reduce((a, b) => a + b, 0)) - out.reduce((a, b) => a + b, 0);
  // the tenths still to hand out go to the biggest remainders; any the 0.1 floors overspent come off the smallest
  const order = raw.map((_, i) => i).sort((a, b) => raw[b] - out[b] - (raw[a] - out[a]));
  for (const i of order) {
    if (left <= 0) break;
    if (secs[i] <= 0) continue;
    out[i]++;
    left--;
  }
  for (let k = order.length - 1; k >= 0 && left < 0; k--) {
    if (out[order[k]] <= 1) continue;
    out[order[k]]--;
    left++;
  }
  return out;
}
