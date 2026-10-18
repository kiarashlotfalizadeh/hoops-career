// What an AI coach prepares for a game against the user's team: at most two changes to his usual
// tactics that answer what the user's team does best (a hot pick-and-roll, its shooting, its
// running game, the player it runs its offense through...) or where it's weak (a starter to guard
// a particular way, a poor perimeter defender to attack). Whether he prepares one depends on the
// difficulty and his tactics rating, rolled from the game's id, never the league's random stream.
// What goes in it is read from the user's stored games before game day only, so the plan for a
// game reads the same in the preview, the Lab and the game itself, whatever else is played that
// day. AI-vs-AI games never get one, so the league's numbers are unchanged.

import { preset } from '../league/difficulty';
import type { GameSim } from '../sim/engine';
import type { League, Player, PlayerDefense, PnrCoverage, ScheduledGame, Tactics, TacticsPatch, Team, TeamBox } from '../types';
import { Rng, clamp, hashString } from '../random';
import { applyPatch } from '../sim/tactics';
import { DEFAULT_PPP, zScore } from '../analysis/playTypes';
import { SCOUT_MIN_GAMES } from '../analysis/scouting';
import { guardingPlan, huntPick } from '../analysis/guarding';
import { playerName, seasonLine, seasonTotals, teamPlayers } from '../league/helpers';
import { defPresetFit, rosterProfile } from './coachAI';

export interface OppPlanItem {
  id: string;
  /** A plan has one item of each group (one ball-screen coverage, one help level...). */
  group: string;
  /** What the coach does, as his in-game adjustments read: 'hedges ball screens'. */
  text: string;
  /** The user's numbers it answers. */
  why: string;
  patch: TacticsPatch;
}

export interface OppPlan {
  /** The AI team that game-plans. */
  tid: number;
  gid: number;
  items: OppPlanItem[];
}

/** Items in a plan at most. */
export const OPP_PLAN_MAX = 2;

/** Possessions of a play type before its points per possession count. */
const MIN_PT_POSS = 40;

/**
 * The chance an AI coach game-plans for a game against the user: never on easy, every game on
 * hard, and on normal about half of them, more often the better he is at tactics.
 */
export function oppPlanChance(league: League, aiTid: number): number {
  const d = preset(league).opponentPlans;
  if (d === 'never') return 0;
  if (d === 'always') return 1;
  return clamp(0.5 + (league.teams[aiTid].coach.tactics - 60) / 100, 0.15, 0.85);
}

/** Whether he prepares a plan for game `gid`: the same answer every time it's asked. */
export function preparesPlan(league: League, aiTid: number, gid: number): boolean {
  const p = oppPlanChance(league, aiTid);
  return p > 0 && new Rng(hashString(`${league.id}:${league.season}:${gid}:opp-plan`)).chance(p);
}

/** The user's next unplayed game against `tid`. */
export function nextMeeting(league: League, tid: number): ScheduledGame | undefined {
  const me = league.userTid;
  return league.schedule.filter((g) => !g.played && ((g.home === me && g.away === tid) || (g.away === me && g.home === tid))).sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
}

// ---------------------------------------------------------------- the user's numbers

interface Sum {
  poss: number;
  pts: number;
}

/** One side of the games read: play types, shooting, free throws, turnovers and the glass. */
interface SideAgg {
  pt: Record<string, Sum>;
  ptTotal: number;
  poss: number;
  fga: number;
  tpa: number;
  tpm: number;
  fta: number;
  tov: number;
  orb: number;
  /** Defensive rebounds of the team they played (the misses they didn't get back). */
  oppDrb: number;
}

const blank = (): SideAgg => ({ pt: {}, ptTotal: 0, poss: 0, fga: 0, tpa: 0, tpm: 0, fta: 0, tov: 0, orb: 0, oppDrb: 0 });

function add(a: SideAgg, box: TeamBox, opp: TeamBox) {
  for (const [k, v] of Object.entries(box.playTypes ?? {})) {
    const e = (a.pt[k] ??= { poss: 0, pts: 0 });
    e.poss += v.poss;
    e.pts += v.pts;
    a.ptTotal += v.poss;
  }
  a.poss += box.poss;
  a.fga += box.t.fga;
  a.tpa += box.t.tpa;
  a.tpm += box.t.tpm;
  a.fta += box.t.fta;
  a.tov += box.t.tov;
  a.orb += box.t.orb;
  a.oppDrb += opp.t.drb;
}

interface Profile {
  /** The user's offense, and his opponents' offense against him. */
  off: SideAgg;
  def: SideAgg;
  /** Everyone else in the games read (this season: the league; last season: his opponents). */
  lg: SideAgg;
  /** The league's points per possession by play type (engine-typical ones for last season, of which only the user's games are kept). */
  base: Record<string, number>;
}

/**
 * The user's team from its stored games before `day` this season (last season's while it has
 * played fewer than SCOUT_MIN_GAMES), against everyone else in the same games. Games played on
 * game day itself are left out, so the other games that night never change the plan.
 */
function userProfile(league: League, userTid: number, day: number): Profile | null {
  const read = (season: number, lastSeason: boolean): Profile | null => {
    const off = blank();
    const def = blank();
    const lg = blank();
    let n = 0;
    for (const g of league.games) {
      if (g.season !== season || g.type === 'allstar' || (!lastSeason && g.day >= day)) continue;
      for (const [box, opp] of [
        [g.home, g.away],
        [g.away, g.home],
      ]) {
        if (box.tid === userTid) {
          n++;
          add(off, box, opp);
        } else {
          add(lg, box, opp);
          if (opp.tid === userTid) add(def, box, opp);
        }
      }
    }
    if (n < SCOUT_MIN_GAMES) return null;
    const base = { ...DEFAULT_PPP };
    if (!lastSeason) for (const [k, v] of Object.entries(lg.pt)) if (v.poss >= 300) base[k] = v.pts / v.poss;
    return { off, def, lg, base };
  };
  return read(league.season, false) ?? read(league.season - 1, true);
}

interface PtRead {
  poss: number;
  ppp: number;
  base: number;
  z: number;
  share: number;
  lgShare: number;
}

function ptRead(p: Profile, side: SideAgg, key: string): PtRead | null {
  const v = side.pt[key];
  if (!v || v.poss < MIN_PT_POSS || !side.ptTotal) return null;
  const base = p.base[key] ?? DEFAULT_PPP[key] ?? 1;
  const lg = p.lg.pt[key]?.poss ?? 0;
  return { poss: v.poss, ppp: v.pts / v.poss, base, z: zScore(v, base), share: v.poss / side.ptTotal, lgShare: p.lg.ptTotal ? lg / p.lg.ptTotal : 0 };
}

const div = (a: number, b: number) => (b > 0 ? a / b : NaN);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const ppp = (v: number) => v.toFixed(2);

/** How often a play type runs against the league's, and how well, as one sentence of evidence. */
function ptEvidence(noun: string, r: PtRead, heavy: boolean) {
  return heavy
    ? `${noun} finish ${pct(r.share)} of your possessions (league ${pct(r.lgShare)}), at ${ppp(r.ppp)} points each (league ${ppp(r.base)}).`
    : `${noun} score ${ppp(r.ppp)} points per possession (league ${ppp(r.base)}).`;
}

/** A play type the user leans on: well above the league's points per possession, or run far more than the league runs it without scoring less. */
function strength(r: PtRead | null, heavyAt: number): { w: number; heavy: boolean } | null {
  if (!r) return null;
  const hot = r.z >= 1.5 ? r.z : 0;
  const heavy = r.lgShare > 0 && r.share >= r.lgShare * heavyAt && r.ppp >= r.base ? (r.share / r.lgShare - 1) * 6 : 0;
  if (!hot && !heavy) return null;
  return { w: Math.max(hot, heavy), heavy: heavy > hot };
}

// ---------------------------------------------------------------- the plan

interface Cand extends OppPlanItem {
  w: number;
}

/** The user's players who rest tonight, the second night of a back-to-back (a regular-season game the day after any game, as the engine has it): none of them is worth a plan. */
function restingTonight(league: League, userTid: number, day: number): Set<number> {
  const plays = (g: ScheduledGame) => g.home === userTid || g.away === userTid;
  const b2b = !league.schedule.some((g) => g.day === day && g.type !== 'regular' && plays(g)) && league.schedule.some((g) => g.day === day - 1 && plays(g));
  return new Set(b2b ? league.teams[userTid].rotation.restB2B : []);
}

/** The player the user's team runs its offense through, by usage (this season's numbers, else last season's). */
function userStar(league: League, userTid: number, day: number) {
  const rest = restingTonight(league, userTid, day);
  const rows = teamPlayers(league, userTid)
    .filter((p) => !p.injury && !rest.has(p.pid))
    .map((p) => {
      const here = p.stats.find((s) => s.season === league.season && s.tid === userTid && !s.playoffs && s.gp >= SCOUT_MIN_GAMES);
      // (seasonLine: a real season split by a trade keeps its imported usage)
      const s = here ?? seasonLine(p, league.season - 1);
      if (!s || s.gp < SCOUT_MIN_GAMES || s.min / s.gp < 20) return { p, usg: 0 };
      const teamUse = s.teamFga + 0.44 * s.teamFta + s.teamTov;
      const usg = s.adv ? s.adv.usg / 100 : teamUse ? (s.fga + 0.44 * s.fta + s.tov) / teamUse : 0;
      return { p, usg };
    })
    .sort((a, b) => b.usg - a.usg || b.p.ovr - a.p.ovr || a.p.pid - b.p.pid);
  return rows[0] as { p: Player; usg: number } | undefined;
}

const lastName = (p: Player) => p.lastName || p.firstName;

/**
 * The three-point shooting of a team's players other than its star(s): what a junk defense dares.
 * Their regular-season lines with the team this season once it has played five games, else each
 * one's last season; null without 150 attempts to go on.
 */
export function castThrees(league: League, tid: number, stars: number | number[]): { tpa: number; pct: number } | null {
  const skip = new Set(Array.isArray(stars) ? stars : [stars]);
  const ts = league.teams[tid].seasons.find((s) => s.season === league.season);
  const now = !!ts && ts.won + ts.lost >= SCOUT_MIN_GAMES;
  let tpa = 0;
  let tpm = 0;
  for (const pl of teamPlayers(league, tid)) {
    if (skip.has(pl.pid)) continue;
    const s = now ? pl.stats.find((x) => x.season === league.season && x.tid === tid && !x.playoffs) : seasonTotals(pl, league.season - 1);
    if (!s) continue;
    tpa += s.tpa;
    tpm += s.tpm;
  }
  return tpa >= 150 ? { tpa, pct: tpm / tpa } : null;
}

/** The league's three-point percentage this regular season (last season's until 2,000 attempts are in), NaN without either. */
export function leagueThreePct(league: League): number {
  for (const season of [league.season, league.season - 1]) {
    let tpa = 0;
    let tpm = 0;
    for (const t of league.teams) {
      const ts = t.seasons.find((x) => x.season === season);
      if (!ts) continue;
      tpa += ts.t.tpa;
      tpm += ts.t.tpm;
    }
    if (tpa >= 2000) return tpm / tpa;
  }
  return NaN;
}

const COVERAGE_TEXT: Partial<Record<PnrCoverage, string>> = { hedge: 'hedges ball screens', ice: 'ices ball screens', drop: 'drops the big on ball screens' };

/** A guarding instruction as the coach's plan reads ("goes under screens on Brunson"). */
const GUARD_TEXT: Record<PlayerDefense, (name: string) => string> = {
  under: (n) => `goes under screens on ${n}`,
  tight: (n) => `runs ${n} off the three-point line`,
  sag: (n) => `sags off ${n}`,
  body: (n) => `gets physical with ${n}`,
};

/** Everything the coach could plan against the user's team tonight, each weighted by how strong the numbers behind it are. */
function candidates(league: League, aiTid: number, base: Tactics, userTid: number, day: number): Cand[] {
  const out: Cand[] = [];
  const d = base.defense;
  const man = d.scheme === 'man';
  const p = userProfile(league, userTid, day);
  if (p) {
    const { off, def, lg } = p;
    // ---- ball screens (coverages are a man-to-man thing: a zone stays a zone), in the coverage his
    // healthy roster plays best: hedging takes mobile bigs, icing perimeter defenders, dropping a rim protector
    const roster = teamPlayers(league, aiTid);
    const healthy = roster.filter((x) => !x.injury);
    const pr = rosterProfile(healthy.length >= 8 ? healthy : roster);
    const fit = defPresetFit(pr);
    const best = (opts: PnrCoverage[]) => opts.filter((c) => c !== d.pnr).sort((a, b) => fit[b] - fit[a])[0];
    const coverage = (to: PnrCoverage | undefined, why: string, w: number) => {
      if (man && to)
        out.push({ id: `cov-${to}`, group: 'coverage', text: COVERAGE_TEXT[to]!, why, patch: { defense: { pnr: to, ...(to === 'drop' ? { switchOffBall: false } : {}) } }, w });
    };
    const bh = ptRead(p, off, 'pnrBH');
    const sBh = strength(bh, 1.25);
    if (bh && sBh) coverage(best(['hedge', 'ice']), ptEvidence('Your pick-and-roll ball handlers', bh, sBh.heavy), sBh.w);
    const roll = ptRead(p, off, 'pnrRoll');
    if (roll && roll.z >= 1.5) coverage(best(pr.rimProtection >= 58 ? ['drop'] : ['ice']), ptEvidence('Your roll and pop men', roll, false), roll.z);
    // ---- help: stay home on a shooting team, pack the paint against one that can't shoot or lives inside
    const three = div(off.tpa, off.fga);
    const lgThree = div(lg.tpa, lg.fga);
    const spot = ptRead(p, off, 'spotup');
    const stay: { w: number; why: string }[] = [];
    if (three - lgThree >= 0.04) stay.push({ w: ((three - lgThree) / 0.04) * 2, why: `${pct(three)} of your shots are threes (league ${pct(lgThree)}).` });
    if (spot && spot.z >= 1.5) stay.push({ w: spot.z, why: ptEvidence('Your spot-up shooters', spot, false) });
    const stayBest = stay.sort((a, b) => b.w - a.w)[0];
    if (stayBest && d.help > 45) out.push({ id: 'help-low', group: 'help', text: 'stays home on shooters', why: stayBest.why, patch: { defense: { help: 30 } }, w: stayBest.w });
    const pack: { w: number; why: string }[] = [];
    const tp = div(off.tpm, off.tpa);
    const lgTp = div(lg.tpm, lg.tpa);
    if (off.tpa >= 150 && lgTp - tp >= 0.025) pack.push({ w: (lgTp - tp) / 0.0125, why: `You make ${pct1(tp)} of your threes (league ${pct1(lgTp)}).` });
    if (lgThree - three >= 0.05) pack.push({ w: (lgThree - three) / 0.025, why: `Only ${pct(three)} of your shots are threes (league ${pct(lgThree)}).` });
    for (const [key, noun] of [
      ['post', 'Your post-ups'],
      ['cut', 'Your cutters'],
    ] as const) {
      const r = ptRead(p, off, key);
      if (r && r.z >= 1.5) pack.push({ w: r.z, why: ptEvidence(noun, r, false) });
    }
    const packBest = pack.sort((a, b) => b.w - a.w)[0];
    if (packBest && !stayBest && d.help < 60)
      out.push({ id: 'help-high', group: 'help', text: 'packs the paint', why: packBest.why, patch: { defense: { help: 72 } }, w: packBest.w });
    // ---- the glass and getting back: one answer a game
    const tr = ptRead(p, off, 'transition');
    const sTr = strength(tr, 1.3);
    if (tr && sTr) {
      const why = sTr.heavy
        ? `${pct(tr.share)} of your possessions come in transition (league ${pct(tr.lgShare)}), at ${ppp(tr.ppp)} points each.`
        : ptEvidence('Your transition plays', tr, false);
      if (d.getBack < 75) out.push({ id: 'getback', group: 'glass', text: 'sprints back in transition', why, patch: { defense: { getBack: 85 } }, w: sTr.w });
      else if (base.offense.crashBoards > 50)
        out.push({ id: 'crash-less', group: 'glass', text: 'sends fewer players to the offensive glass', why, patch: { offense: { crashBoards: 30 } }, w: sTr.w * 0.8 });
    }
    const orbAllowed = div(def.orb, def.orb + def.oppDrb);
    const lgOrb = div(lg.orb, lg.orb + lg.oppDrb);
    if (orbAllowed - lgOrb >= 0.03 && base.offense.crashBoards < 60)
      out.push({
        id: 'crash',
        group: 'glass',
        text: 'crashes the offensive glass',
        why: `Opponents rebound ${pct(orbAllowed)} of their misses against you (league ${pct(lgOrb)}).`,
        patch: { offense: { crashBoards: 72 } },
        w: ((orbAllowed - lgOrb) / 0.03) * 2,
      });
    // ---- fouls and turnovers
    const ftr = div(off.fta, off.fga);
    const lgFtr = div(lg.fta, lg.fga);
    if (ftr - lgFtr >= 0.04 && d.physicality > 45)
      out.push({
        id: 'physicality-down',
        group: 'physicality',
        text: 'defends without fouling',
        why: `You get ${ftr.toFixed(2)} free throws per shot (league ${lgFtr.toFixed(2)}).`,
        patch: { defense: { physicality: 35 } },
        w: (ftr - lgFtr) / 0.02,
      });
    const tov = div(off.tov, off.poss);
    const lgTov = div(lg.tov, lg.poss);
    if (tov - lgTov >= 0.015 && d.pressure < 60)
      out.push({
        id: 'pressure-up',
        group: 'pressure',
        text: 'pressures the ball',
        why: `You turn it over on ${pct1(tov)} of your possessions (league ${pct1(lgTov)}).`,
        patch: { defense: { pressure: 75 } },
        w: (tov - lgTov) / 0.0075,
      });
    // ---- running on a team that doesn't get back
    const trD = ptRead(p, def, 'transition');
    if (trD && trD.z >= 1.5 && base.offense.transition < 65)
      out.push({
        id: 'run',
        group: 'pace',
        text: 'runs on the break',
        why: `Opponents score ${ppp(trD.ppp)} points per possession in transition against you (league ${ppp(trD.base)}).`,
        patch: { offense: { transition: 80 } },
        w: trD.z,
      });
  }
  // ---- the user's weakest perimeter defender, when he gives up a lot to the rest of the rotation:
  // isolations, post-ups and ball screens at the man he guards (it costs them some ball movement)
  const resting = restingTonight(league, userTid, day);
  const hunt = huntPick(league, userTid, 8, resting);
  const victim = hunt?.worth ? league.players[hunt.pid] : undefined;
  if (hunt && victim && base.offense.huntTarget == null)
    out.push({
      id: 'hunt',
      group: 'hunt',
      text: `attacks ${lastName(victim)} on defense`,
      why: `${playerName(victim)} defends the perimeter at ${hunt.perDef}, your rotation at ${hunt.teamPerDef}.`,
      patch: { offense: { huntTarget: hunt.pid } },
      w: (hunt.teamPerDef - hunt.perDef) / 4,
    });
  // ---- how to guard one of the user's regulars (his top seven, who play the minutes worth a plan):
  // the read the user's own staff makes on an opponent
  // (go under on a handler who can't shoot off the dribble, top-lock a shooter who can't drive, sag
  // off a non-shooter, get physical with a poor free-throw shooter inside); a man-to-man thing
  if (d.scheme === 'man' && !d.playerD) {
    const read = guardingPlan(league, userTid, resting)
      .slice(0, 7)
      .find((a) => a.suggest && (a.suggest !== 'under' || (d.pnr !== 'switch' && d.pnr !== 'blitz')));
    const who = read && league.players[read.pid];
    if (read?.suggest && who)
      out.push({
        id: `guard-${read.suggest}`,
        group: 'guard',
        text: GUARD_TEXT[read.suggest](lastName(who)),
        why: `${playerName(who)}: ${read.why}`,
        patch: { defense: { playerD: { [who.pid]: read.suggest } } },
        // a small edge (see the README's numbers): the plan's second item at most, unless nothing else stands out
        w: 1.2,
      });
  }
  // ---- the player the user's offense runs through: doubled when he carries it, denied the ball otherwise
  const star = userStar(league, userTid, day);
  // ...or chased in a box-and-one when the players around him don't make their threes
  const cast = star && p ? castThrees(league, userTid, star.p.pid) : null;
  const lgTp = p ? div(p.lg.tpm, p.lg.tpa) : NaN;
  if (star && star.usg >= 0.28 && cast && lgTp - cast.pct >= 0.02 && d.scheme === 'man')
    out.push({
      id: 'box1',
      group: 'star',
      text: `plays a box-and-one on ${lastName(star.p)}`,
      why: `${playerName(star.p)} uses ${pct(star.usg)} of your possessions, and the rest of your team makes ${pct1(cast.pct)} of its threes (league ${pct1(lgTp)}).`,
      patch: { defense: { scheme: 'box1', chase: [star.p.pid] } },
      w: 1.5 + (star.usg - 0.28) * 25 + (lgTp - cast.pct) / 0.01,
    });
  if (star && star.usg >= 0.28 && d.starPlan === 'none') {
    const iso = p ? ptRead(p, p.off, 'iso') : null;
    const spot = p ? ptRead(p, p.off, 'spotup') : null;
    // a double leaves a shooter open: not against a team whose shooters make it pay
    const shooters = !!p && ((!!spot && spot.z >= 1) || div(p.off.tpm, p.off.tpa) > div(p.lg.tpm, p.lg.tpa) + 0.02);
    const double = star.usg >= 0.32 && !shooters;
    out.push({
      id: double ? 'star-double' : 'star-deny',
      group: 'star',
      text: double ? `doubles ${lastName(star.p)}` : `denies ${lastName(star.p)} the ball`,
      why: `${playerName(star.p)} uses ${pct(star.usg)} of your possessions when he plays.`,
      patch: { defense: { starPlan: double ? 'double' : 'deny', starTarget: star.p.pid } },
      w: 1.5 + (star.usg - 0.28) * 25 + (iso && iso.z >= 1.5 ? 1 : 0),
    });
  }
  return out;
}

/**
 * The game plan AI team `aiTid` brings to `game` against the user's team `userTid`, or null when its
 * coach doesn't prepare one (see oppPlanChance) or it isn't the user's game. Up to OPP_PLAN_MAX
 * items, one per group, each answering something the user's numbers show, drafted against the
 * team's own tactics (an item only changes something); with nothing standing out he plans for the
 * player the user's team leans on most.
 */
export function aiGamePlan(league: League, aiTid: number, userTid: number, game: Pick<ScheduledGame, 'gid' | 'day'>): OppPlan | null {
  if (aiTid === userTid || userTid !== league.userTid || !league.teams[aiTid] || !preparesPlan(league, aiTid, game.gid)) return null;
  const base = league.teams[aiTid].tactics;
  const items: OppPlanItem[] = [];
  // the strongest numbers always get an answer; the rest of the plan varies from coach to coach and
  // game to game, the stronger the numbers the likelier (drawn from the game's id)
  let pool = candidates(league, aiTid, base, userTid, game.day).sort((a, b) => b.w - a.w || a.id.localeCompare(b.id));
  const rng = new Rng(hashString(`${league.id}:${league.season}:${game.gid}:opp-plan-items`));
  while (pool.length && items.length < OPP_PLAN_MAX) {
    const c = items.length ? pool[rng.weighted(pool.map((x) => x.w))] : pool[0];
    items.push({ id: c.id, group: c.group, text: c.text, why: c.why, patch: c.patch });
    pool = pool.filter((x) => x.group !== c.group);
  }
  if (!items.length && base.defense.starPlan === 'none') {
    // nothing stands out: take away the best player who's playing
    const star = userStar(league, userTid, game.day);
    if (star)
      items.push({
        id: 'star-deny',
        group: 'star',
        text: `denies ${lastName(star.p)} the ball`,
        why: star.usg > 0 ? `${playerName(star.p)} uses the most of your possessions (${pct(star.usg)}).` : `${playerName(star.p)} is your best player.`,
        patch: { defense: { starPlan: 'deny', starTarget: star.p.pid } },
      });
  }
  return items.length ? { tid: aiTid, gid: game.gid, items } : null;
}

/** The team's tactics with the plan's items applied in order. */
export function withOppPlan(t: Tactics, plan: OppPlan | null): Tactics {
  if (!plan) return t;
  let out = t;
  for (const it of plan.items) out = applyPatch(out, it.patch);
  return out;
}

// ---------------------------------------------------------------- the plan a game was set up with

/** The team a game was set up with, and the plan it brought (kept with the object handed to the engine). */
const tipOff = new WeakMap<Team, OppPlan>();

/** The team as a game takes it, with tonight's tactics: remembered with its plan, for the game report. */
export function planTeam(team: Team, tactics: Tactics, plan: OppPlan): Team {
  const out = { ...team, tactics };
  tipOff.set(out, plan);
  return out;
}

/** The plan side `side` of a game brought to tip-off, if it game-planned. */
export function oppPlanIn(sim: GameSim, side: 0 | 1): OppPlan | undefined {
  return tipOff.get(sim.T[side].team);
}
