// God mode: the commissioner's in-game editor, turned on and off in Settings at any time
// (Settings.godMode). With it on, any player's bio, ratings, development, health, mood, contract and
// team can be edited, teams renamed, recoloured and given money, players created, and trades forced
// that the AI GMs (or the CBA) wouldn't allow. Edits bend the league's rules, never its shape: a
// player is on one team or none, his contract pays someone, every team keeps five players to dress
// in season, and the derived numbers (OVR, potential, archetype, tendencies, rotations, jersey
// numbers, the coach registry) follow at once. Everything is validated before anything changes, so
// an edit applies whole or not at all; each one is counted (League.godEdits) so the league says it
// has been edited. Created players draw on a random stream of their own, never the league's.
import type { Injury, League, Player, Pos, RatingKey, Ratings, Team } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, POSITIONS, RETIRED } from '../types';
import { CAP } from '../constants';
import { RATING_KEYS, shiftToOvr } from '../ratings';
import { Rng, clamp, hashString } from '../random';
import { contractExp, followTendencies, genTendencies, generatePlayer, salaryFor } from '../playerGen';
import { contractSeason, inSeason, playerName, rosterMaxNow, standardRoster, teamPlayers, TWO_WAY_MAX, twoWayRoster } from './helpers';
import { FA_PRICE_CUT_DAYS, askingContract, leaveTeam, makeContract, preferredYears, valueScore } from './contracts';
import { refreshDerived } from './progression';
import { INJURY_TYPES } from './injuries';
import { numberTeam, retiredNumbers } from './jerseys';
import { ensureRotation } from './games';
import { activeCoach } from './coaches';
import { cleanProposals } from './proposals';
import { executeTrade, swapSeasons, type TradeOffer } from './trades';

/** A team in season needs this many players to dress for a game (the engine plays five). */
export const DRESS_MIN = 5;

/** What an editor may set, and the ranges it's held to. */
export const GOD_LIMITS = {
  name: 30,
  age: [16, 45],
  heightIn: [64, 96],
  weightLb: [140, 380],
  /** A season's salary ($K): $0.1M to $100M. */
  salary: [100, 100_000],
  years: [1, 5],
  injuryGames: [1, 200],
  /** $K in the bank: ±$10B. */
  cash: 10_000_000,
  coach: [1, 100],
} as const;

const between = (v: number, [lo, hi]: readonly [number, number]) => Number.isFinite(v) && v >= lo && v <= hi;
const wholeIn = (v: number, range: readonly [number, number]) => Number.isInteger(v) && between(v, range);

/** A god-mode change to a contract: this contract season's salary and length (later seasons get the usual 5% raises), its option, two-way or not. */
export interface ContractEdit {
  amount?: number;
  years?: number;
  option?: 'player' | 'team' | null;
  twoWay?: boolean;
}

/** A god-mode edit to one player: only the fields given change. */
export interface PlayerEdit {
  firstName?: string;
  lastName?: string;
  pos?: Pos;
  jersey?: string;
  age?: number;
  heightIn?: number;
  weightLb?: number;
  country?: string;
  college?: string;
  /** Stored 0-100 values (1-100 after clamping). */
  ratings?: Partial<Ratings>;
  growth?: number;
  injuryProne?: number;
  /** An injury (its type and games out), or null to heal him. */
  injury?: { type: string; games: number } | null;
  wear?: number;
  mood?: { score?: number; tradeRequest?: boolean };
  contract?: ContractEdit;
  /** Move him to a team, or to free agency (FREE_AGENT). */
  tid?: number;
}

export interface EditCheck {
  /** Why the edit can't be made: nothing changes while there are any. */
  errors: string[];
  /** Rules it bends (a roster over the limit, a two-way slot too many): allowed in god mode. */
  warnings: string[];
}

/** Players god mode can move or hurt: everyone on a team or in free agency (not draft prospects or retired players). */
export const movable = (p: Player) => p.tid >= FREE_AGENT;

const teamLabel = (league: League, tid: number) => league.teams[tid]?.abbrev ?? '?';

/** Whether a name field holds a usable name. */
const nameOk = (s: string) => s.trim().length > 0 && s.trim().length <= GOD_LIMITS.name;

/** One player joining (+1) or leaving (-1) a team's roster, on a standard or a two-way deal. */
interface RosterMove {
  tid: number;
  n: 1 | -1;
  twoWay: boolean;
}

/**
 * Roster problems of a set of moves: a team left with fewer than five players to dress in season is
 * an error; going past a roster limit, or under the season's minimum, a warning.
 */
function rosterChecks(league: League, moves: RosterMove[], out: EditCheck) {
  for (const tid of new Set(moves.map((m) => m.tid).filter((t) => t >= 0))) {
    const net = (tw: boolean) => moves.reduce((a, m) => a + (m.tid === tid && m.twoWay === tw ? m.n : 0), 0);
    const std = net(false);
    const tw = net(true);
    const n = standardRoster(league, tid).length + std;
    const all = teamPlayers(league, tid).length + std + tw;
    const nTw = twoWayRoster(league, tid).length + tw;
    const ab = teamLabel(league, tid);
    if (inSeason(league) && std + tw < 0 && all < DRESS_MIN)
      out.errors.push(`${ab} would have ${all} player${all === 1 ? '' : 's'}: a team needs ${DRESS_MIN} to dress for its games.`);
    else if (inSeason(league) && std < 0 && n < CAP.rosterMin) out.warnings.push(`${ab} drops to ${n} players (${CAP.rosterMin} is the minimum in season).`);
    if (std > 0 && n > rosterMaxNow(league)) out.warnings.push(`${ab} will carry ${n} players (the limit is ${rosterMaxNow(league)} now).`);
    if (tw > 0 && nTw > TWO_WAY_MAX) out.warnings.push(`${ab} will have ${nTw} two-way players (the limit is ${TWO_WAY_MAX}).`);
  }
}

/** What's wrong with an edit (errors stop it; warnings are rules god mode lets it bend). */
export function checkPlayerEdit(league: League, p: Player, e: PlayerEdit): EditCheck {
  const out: EditCheck = { errors: [], warnings: [] };
  const err = (s: string) => out.errors.push(s);
  if (e.firstName !== undefined && !nameOk(e.firstName)) err(`A first name is 1 to ${GOD_LIMITS.name} characters.`);
  if (e.lastName !== undefined && !nameOk(e.lastName)) err(`A last name is 1 to ${GOD_LIMITS.name} characters.`);
  if (e.country !== undefined && e.country.trim().length > GOD_LIMITS.name) err(`A country is at most ${GOD_LIMITS.name} characters.`);
  if (e.college !== undefined && e.college.trim().length > GOD_LIMITS.name * 2) err(`A college is at most ${GOD_LIMITS.name * 2} characters.`);
  if (e.pos !== undefined && !POSITIONS.includes(e.pos)) err('Pick a position: PG, SG, SF, PF or C.');
  if (e.age !== undefined && !wholeIn(e.age, GOD_LIMITS.age)) err(`Age is ${GOD_LIMITS.age[0]} to ${GOD_LIMITS.age[1]}.`);
  if (e.heightIn !== undefined && !wholeIn(e.heightIn, GOD_LIMITS.heightIn)) err(`Height is 5'4" to 8'0".`);
  if (e.weightLb !== undefined && !wholeIn(e.weightLb, GOD_LIMITS.weightLb)) err(`Weight is ${GOD_LIMITS.weightLb[0]} to ${GOD_LIMITS.weightLb[1]} lb.`);
  for (const [k, v] of Object.entries(e.ratings ?? {})) if (!RATING_KEYS.includes(k as RatingKey) || !Number.isFinite(v)) err(`${k} isn't a rating.`);
  if (e.growth !== undefined && !between(e.growth, [-1, 1])) err('Development is -1 to 1.');
  if (e.injuryProne !== undefined && !between(e.injuryProne, [0, 1])) err('Injury proneness is 0 to 100%.');
  if (e.wear !== undefined && !between(e.wear, [0, 100])) err('Wear is 0 to 100.');
  if (e.mood?.score !== undefined && !between(e.mood.score, [-10, 10])) err('Mood is -10 to 10.');
  if (e.injury) {
    if (!movable(p)) err('Only active players can be hurt.');
    else if (!e.injury.type.trim()) err('Pick an injury.');
    else if (!wholeIn(e.injury.games, GOD_LIMITS.injuryGames)) err(`An injury keeps him out ${GOD_LIMITS.injuryGames[0]} to ${GOD_LIMITS.injuryGames[1]} games.`);
  }

  // where he ends up: the contract and the jersey are checked against that team
  const to = e.tid ?? p.tid;
  const moving = e.tid !== undefined && e.tid !== p.tid;
  const cs = contractSeason(league);
  // a free agent, or a player whose deal is up, joins a team on his asking deal: a standard one,
  // unless the edit makes it a two-way one
  const signs = moving && to >= 0 && salaryFor(p, cs) <= 0;
  const wasTw = p.tid >= 0 && !!p.contract.twoWay;
  const isTw = to >= 0 && (e.contract?.twoWay ?? (signs ? false : wasTw));
  if (moving) {
    if (!movable(p)) err(p.tid === DRAFT_PROSPECT ? 'A draft prospect joins a team through the draft.' : 'A retired player stays retired.');
    else if (to !== FREE_AGENT && !league.teams[to]) err("That team doesn't exist.");
  }
  if (!out.errors.length && (moving || isTw !== wasTw) && to >= FREE_AGENT)
    rosterChecks(
      league,
      [
        { tid: p.tid, n: -1, twoWay: wasTw },
        { tid: to, n: 1, twoWay: isTw },
      ],
      out,
    );
  if (e.jersey !== undefined && (e.jersey !== p.jersey || moving)) {
    // (no leading zero but 00's: "07" would be a second 7)
    if (!/^(00|\d|[1-9]\d)$/.test(e.jersey)) err('A jersey number is 0 to 99 (00 too).');
    else if (league.teams[to]) {
      const mate = teamPlayers(league, to).find((x) => x.pid !== p.pid && x.jersey === e.jersey);
      if (mate) err(`${playerName(mate)} wears No. ${e.jersey} for ${teamLabel(league, to)}.`);
      else if (retiredNumbers(league.teams[to]).has(e.jersey)) err(`${teamLabel(league, to)} has retired No. ${e.jersey}.`);
    }
  }
  const c = e.contract;
  if (c) {
    if (to < 0) err('Only a player on a team has a contract: free agents sign one when they join.');
    if (c.amount !== undefined && !between(c.amount, GOD_LIMITS.salary)) err('A salary is $0.1M to $100M a season.');
    if (c.years !== undefined && !wholeIn(c.years, GOD_LIMITS.years)) err(`A contract runs ${GOD_LIMITS.years[0]} to ${GOD_LIMITS.years[1]} seasons.`);
    if (c.option) {
      // the deal it goes on: the length set here, or his asking deal's when he signs one (joining a
      // team, or a new salary on a deal that's up; at his age after the edit, see preferredYears), or
      // what's left of his deal
      const asks = signs || (c.amount !== undefined && salaryFor(p, cs) <= 0);
      const years = c.years ?? (asks ? preferredYears(league, { ...p, bornYear: e.age !== undefined ? league.season - e.age : p.bornYear }) : yearsLeft(league, p));
      if (years < 2) err('An option goes on the last season of a deal of two seasons or more.');
    }
  }
  return out;
}

/** Seasons left on his deal from the contract season (0 when nothing is left: a free agent, an expiring deal after the season). */
export function yearsLeft(league: League, p: Player): number {
  const cs = contractSeason(league);
  return salaryFor(p, cs) > 0 ? Math.max(0, contractExp(p.contract) - cs + 1) : 0;
}

/**
 * Rewrite his contract from the contract season on (the seasons before it, already under way or
 * paid, stay as they were): a new salary or length is a new deal with the usual raises, which drops
 * a signed extension and the rookie, 10-day and qualifying-offer marks of the old one.
 */
function applyContract(league: League, p: Player, c: ContractEdit) {
  const cs = contractSeason(league);
  if (c.amount !== undefined || c.years !== undefined) {
    // (what the edit leaves out stays as it is, or for a deal that's up is his asking deal's)
    const ask = salaryFor(p, cs) > 0 ? null : askingContract(league, p);
    const amount = c.amount ?? ask?.amount ?? salaryFor(p, cs);
    const years = c.years ?? ask?.years ?? yearsLeft(league, p);
    const old = p.contract;
    const past: number[] = [];
    for (let s = old.start; s < cs; s++) past.push(salaryFor(p, s));
    p.contract = { start: past.length ? old.start : cs, salaries: [...past, ...makeContract(league, amount, years, cs).salaries] };
    // (an option goes on the last season of a deal of two or more)
    if (old.option && years >= 2) p.contract.option = old.option;
    if (old.twoWay) p.contract.twoWay = true;
  }
  if (c.option !== undefined) {
    if (c.option) p.contract.option = c.option;
    else delete p.contract.option;
  }
  if (c.twoWay !== undefined) {
    if (c.twoWay) p.contract.twoWay = true;
    else delete p.contract.twoWay;
  }
}

/**
 * Move a player to a team or to free agency, cleanly: off his old team's rotation and roles, his
 * talks, promises, waiver and restricted free agency over, the user's pending offer to him dropped.
 * A free agent (or a player whose deal is up) joins a team on his asking contract; a player under
 * contract takes his deal with him, as in a trade. Nothing is left on the old team's books.
 */
function movePlayer(league: League, p: Player, to: number) {
  const from = p.tid;
  if (from === to) return;
  if (from >= 0) leaveTeam(league.teams[from], p.pid);
  delete p.tradedFrom;
  delete p.tradeLock;
  delete p.promise;
  delete p.meeting;
  delete p.talks;
  delete p.rfa;
  delete p.waivers;
  p.mood.tradeRequest = false;
  if (league.faBids?.some((b) => b.pid === p.pid)) league.faBids = league.faBids.filter((b) => b.pid !== p.pid);
  p.asking = undefined;
  p.faDays = undefined;
  if (to === FREE_AGENT) {
    p.tid = FREE_AGENT;
    p.contract = { start: league.season, salaries: [0] };
    p.asking = askingContract(league, p);
    p.faDays = FA_PRICE_CUT_DAYS;
  } else {
    const cs = contractSeason(league);
    if (salaryFor(p, cs) <= 0) {
      const ask = askingContract(league, p, to);
      p.contract = makeContract(league, ask.amount, ask.years, cs, p.experience);
    }
    p.tid = to;
    p.joinedSeason = league.season;
    league.teams[to].rotation.order.push(p.pid);
    // he takes a number nobody there wears (nor has retired)
    numberTeam(league, to);
  }
}

/** Rotations, roles and numbers of the teams an edit touched, brought up to date now (not at their next game). */
function refreshTeams(league: League, tids: Iterable<number>) {
  for (const tid of new Set(tids)) if (tid >= 0 && league.teams[tid]) ensureRotation(league, tid);
}

const injurySeverity = (type: string, games: number): Injury['severity'] =>
  INJURY_TYPES.find((t) => t.name === type)?.severity ?? (games >= 60 ? 'severe' : games >= 20 ? 'major' : games >= 6 ? 'moderate' : 'minor');

/** Apply a god-mode edit to a player (throws, changing nothing, if checkPlayerEdit finds an error). */
export function editPlayer(league: League, pid: number, e: PlayerEdit) {
  const p = league.players[pid];
  if (!p) throw new Error(`There's no player ${pid}.`);
  const { errors } = checkPlayerEdit(league, p, e);
  if (errors.length) throw new Error(errors[0]);
  const touched = [p.tid];
  const moving = e.tid !== undefined && e.tid !== p.tid;
  const prevOvr = p.ovr;
  const worth = valueScore(league, p);
  if (e.firstName !== undefined) p.firstName = e.firstName.trim();
  if (e.lastName !== undefined) p.lastName = e.lastName.trim();
  if (e.country !== undefined) p.country = e.country.trim();
  if (e.college !== undefined) p.college = e.college.trim();
  if (e.pos !== undefined) p.pos = e.pos;
  if (e.age !== undefined) p.bornYear = league.season - e.age;
  if (e.heightIn !== undefined) p.heightIn = e.heightIn;
  if (e.weightLb !== undefined) p.weightLb = e.weightLb;
  for (const k of RATING_KEYS) {
    const v = e.ratings?.[k];
    if (v !== undefined) p.ratings[k] = clamp(Math.round(v * 10) / 10, 1, 100);
  }
  if (e.growth !== undefined) p.growth = e.growth;
  if (e.injuryProne !== undefined) p.injuryProne = e.injuryProne;
  refreshDerived(league, p);
  // his tendencies follow his new level (his style stays, and his role settles over the summer): from
  // the level of this season's snapshot, which they were set for, and the snapshot then holds him as
  // edited, or next summer's development (see annualProgression) would move them for the edit again
  if (p.ovr !== prevOvr) {
    const last = p.ratingsHistory[p.ratingsHistory.length - 1];
    const snap = last?.season === league.season ? last : undefined;
    followTendencies(p, snap?.ovr ?? prevOvr, new Rng(hashString(`${league.id}:god:${pid}`)), false);
    if (snap) Object.assign(snap, { ovr: p.ovr, pot: p.pot }, snap.r ? { r: { ...p.ratings } } : {});
  }
  if (e.injury === null) p.injury = null;
  else if (e.injury) {
    const type = e.injury.type.trim();
    p.injury = { type, gamesRemaining: e.injury.games, gamesTotal: e.injury.games, severity: injurySeverity(type, e.injury.games) };
  }
  if (e.wear !== undefined) p.wear = e.wear;
  if (e.mood?.score !== undefined) p.mood.score = e.mood.score;
  if (e.mood?.tradeRequest !== undefined) p.mood.tradeRequest = e.mood.tradeRequest;
  if (moving) {
    movePlayer(league, p, e.tid!);
    touched.push(p.tid);
  }
  if (e.contract) applyContract(league, p, e.contract);
  if (e.jersey !== undefined) {
    p.jersey = e.jersey;
    if (p.tid >= 0) (p.jerseys ??= {})[p.tid] = e.jersey;
  }
  // a free agent asks for what he's worth now (one sent to free agency already does)
  if (p.tid === FREE_AGENT && !moving && valueScore(league, p) !== worth) {
    p.asking = undefined;
    p.asking = askingContract(league, p);
  }
  // trade offers and untouchable marks that no longer stand (he moved) go now, not overnight
  cleanProposals(league);
  refreshTeams(league, touched);
  league.godEdits = (league.godEdits ?? 0) + 1;
}

/** A god-mode edit to a team: only the fields given change. */
export interface TeamEdit {
  region?: string;
  name?: string;
  abbrev?: string;
  colors?: [string, string, string];
  strategy?: Team['strategy'];
  /** $K in the bank. */
  cash?: number;
  /** 0-1. */
  hype?: number;
  coach?: { development?: number; tactics?: number };
}

const COLOR = /^#[0-9a-f]{6}$/i;

export function checkTeamEdit(league: League, tid: number, e: TeamEdit): string[] {
  const out: string[] = [];
  const t = league.teams[tid];
  if (!t) return ["That team doesn't exist."];
  if (e.region !== undefined && !nameOk(e.region)) out.push(`A city is 1 to ${GOD_LIMITS.name} characters.`);
  if (e.name !== undefined && !nameOk(e.name)) out.push(`A team name is 1 to ${GOD_LIMITS.name} characters.`);
  if (e.abbrev !== undefined) {
    const ab = e.abbrev.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,4}$/.test(ab)) out.push('An abbreviation is 2 to 4 letters or digits.');
    else if (league.teams.some((x) => x.tid !== tid && x.abbrev.toUpperCase() === ab)) out.push(`${ab} is another team's abbreviation.`);
  }
  if (e.colors !== undefined && !(e.colors.length === 3 && e.colors.every((c) => COLOR.test(c)))) out.push('Colors are three #rrggbb values.');
  if (e.strategy !== undefined && !['contend', 'retool', 'rebuild'].includes(e.strategy)) out.push('A strategy is contend, retool or rebuild.');
  if (e.cash !== undefined && !between(e.cash, [-GOD_LIMITS.cash, GOD_LIMITS.cash])) out.push('Cash is within ±$10B.');
  if (e.hype !== undefined && !between(e.hype, [0, 1])) out.push('Hype is 0 to 100%.');
  for (const v of [e.coach?.development, e.coach?.tactics]) if (v !== undefined && !wholeIn(v, GOD_LIMITS.coach)) out.push('Coach ratings are 1 to 100.');
  return [...new Set(out)];
}

/** Apply a god-mode edit to a team (throws, changing nothing, if checkTeamEdit finds a problem). */
export function editTeam(league: League, tid: number, e: TeamEdit) {
  const errors = checkTeamEdit(league, tid, e);
  if (errors.length) throw new Error(errors[0]);
  const t = league.teams[tid];
  if (e.region !== undefined) t.region = e.region.trim();
  if (e.name !== undefined) t.name = e.name.trim();
  if (e.abbrev !== undefined) t.abbrev = e.abbrev.trim().toUpperCase();
  // a new array: the screens holding the old one see the change
  if (e.colors) t.colors = [e.colors[0].toLowerCase(), e.colors[1].toLowerCase(), e.colors[2].toLowerCase()];
  if (e.strategy !== undefined) t.strategy = e.strategy;
  if (e.cash !== undefined) t.cash = Math.round(e.cash);
  if (e.hype !== undefined) t.hype = e.hype;
  if (e.coach) {
    // the coach registry keeps every coach's profile: it changes with him (see registryProblems)
    const r = activeCoach(league, tid);
    if (e.coach.development !== undefined) {
      t.coach.development = e.coach.development;
      if (r) r.dev = e.coach.development;
    }
    if (e.coach.tactics !== undefined) {
      t.coach.tactics = e.coach.tactics;
      if (r) r.tac = e.coach.tactics;
    }
  }
  league.godEdits = (league.godEdits ?? 0) + 1;
}

/** Every player on a team healed and rested (wear gone): one edit. */
export function healTeam(league: League, tid: number): number {
  const hurt = teamPlayers(league, tid).filter((p) => p.injury || p.wear > 0);
  for (const p of hurt) {
    p.injury = null;
    p.wear = 0;
  }
  if (!hurt.length) return 0;
  refreshTeams(league, [tid]);
  league.godEdits = (league.godEdits ?? 0) + 1;
  return hurt.length;
}

/** The owner's standing with the user (-1 to 1; below -0.5 after the grace period he fires him, see ownerEvaluation). */
export function setOwnerConfidence(league: League, total: number) {
  if (!Number.isFinite(total)) throw new Error("The owner's confidence is -100 to 100.");
  league.ownerMood = { ...league.ownerMood, total: Math.round(clamp(total, -1, 1) * 100) / 100 };
  league.godEdits = (league.godEdits ?? 0) + 1;
}

/** A player made from scratch: his name (random when left blank), age, height, OVR and development; he joins a team or free agency. */
export interface NewPlayer {
  firstName?: string;
  lastName?: string;
  pos?: Pos;
  age: number;
  heightIn: number;
  ovr: number;
  growth: number;
  tid: number;
}

export function checkNewPlayer(league: League, o: NewPlayer): EditCheck {
  const out: EditCheck = { errors: [], warnings: [] };
  // (a name left blank is drawn at random)
  if ((o.firstName?.trim().length ?? 0) > GOD_LIMITS.name) out.errors.push(`A first name is at most ${GOD_LIMITS.name} characters.`);
  if ((o.lastName?.trim().length ?? 0) > GOD_LIMITS.name) out.errors.push(`A last name is at most ${GOD_LIMITS.name} characters.`);
  if (o.pos !== undefined && !POSITIONS.includes(o.pos)) out.errors.push('Pick a position: PG, SG, SF, PF or C.');
  if (!wholeIn(o.age, GOD_LIMITS.age)) out.errors.push(`Age is ${GOD_LIMITS.age[0]} to ${GOD_LIMITS.age[1]}.`);
  if (!wholeIn(o.heightIn, GOD_LIMITS.heightIn)) out.errors.push(`Height is 5'4" to 8'0".`);
  if (!wholeIn(o.ovr, [40, 99])) out.errors.push('OVR is 40 to 99.');
  if (!between(o.growth, [-1, 1])) out.errors.push('Development is -1 to 1.');
  if (o.tid !== FREE_AGENT && !league.teams[o.tid]) out.errors.push("That team doesn't exist.");
  else if (o.tid >= 0) rosterChecks(league, [{ tid: o.tid, n: 1, twoWay: false }], out);
  return out;
}

/**
 * Create a player: generated for his age and height, his skills shifted to the OVR asked for, with
 * the experience and draft year a player his age would have (undrafted), tendencies of his own and
 * a ratings snapshot for this season. His draws come from a stream seeded by the league and his id.
 */
export function createPlayer(league: League, o: NewPlayer): Player {
  const { errors } = checkNewPlayer(league, o);
  if (errors.length) throw new Error(errors[0]);
  const pid = league.nextPid++;
  const rng = new Rng(hashString(`${league.id}:god:new:${pid}`));
  const taken = new Set(Object.values(league.players).flatMap((x) => (x.tid === RETIRED ? [] : [playerName(x)])));
  const p = generatePlayer(rng, {
    pid,
    season: league.season,
    tid: FREE_AGENT,
    age: o.age,
    talent: clamp((o.ovr - 72) / 8, -2, 3),
    heightIn: o.heightIn,
    scale: league.ovrScale,
    taken,
  });
  p.ratings = shiftToOvr(p.ratings, o.ovr, league.ovrScale);
  p.growth = o.growth;
  if (o.firstName?.trim()) p.firstName = o.firstName.trim();
  if (o.lastName?.trim()) p.lastName = o.lastName.trim();
  if (o.pos) p.pos = o.pos;
  p.experience = clamp(o.age - 21, 0, 20);
  // (in the league since the summer before his first season, as a fictional league's undrafted free
  // agents are: one with no experience is this season's rookie)
  p.draft = { year: league.season - 1 - p.experience, round: 0, pick: 0, tid: null };
  p.contract = { start: league.season, salaries: [0] };
  refreshDerived(league, p);
  p.tend = genTendencies(p, rng);
  p.ratingsHistory = [{ season: league.season, ovr: p.ovr, pot: p.pot, r: { ...p.ratings } }];
  league.players[pid] = p;
  p.asking = askingContract(league, p);
  p.faDays = FA_PRICE_CUT_DAYS;
  if (o.tid >= 0) {
    movePlayer(league, p, o.tid);
    refreshTeams(league, [o.tid]);
  }
  league.godEdits = (league.godEdits ?? 0) + 1;
  return p;
}

/**
 * What stops a forced trade: only the deal's shape (each player and pick still with the team
 * sending it, each swap on both teams' own open firsts, nothing in it twice, something moving, cash
 * one way) and five players left to dress in season. Value, salary matching, roster limits, the
 * deadline and the trade-back rule don't apply; the roster limits come back as warnings.
 */
export function checkForceTrade(league: League, offer: TradeOffer): EditCheck {
  const out: EditCheck = { errors: [], warnings: [] };
  const { a, b } = offer;
  if (a.tid === b.tid || !league.teams[a.tid] || !league.teams[b.tid]) out.errors.push('A trade is between two teams.');
  for (const side of [a, b]) {
    for (const pid of side.pids) if (league.players[pid]?.tid !== side.tid) out.errors.push(`A player in the deal isn't with ${teamLabel(league, side.tid)}.`);
    for (const dpid of side.dpids)
      if (league.draftPicks.find((d) => d.dpid === dpid)?.tid !== side.tid) out.errors.push(`A pick in the deal isn't ${teamLabel(league, side.tid)}'s.`);
    if (side.cash !== undefined && side.cash !== 0 && !(Number.isInteger(side.cash) && side.cash > 0)) out.errors.push("The cash in the deal isn't a valid amount.");
  }
  const pids = [...a.pids, ...b.pids];
  const dpids = [...a.dpids, ...b.dpids];
  if (new Set(pids).size < pids.length || new Set(dpids).size < dpids.length) out.errors.push('A player or pick is in the deal twice.');
  if ((a.cash ?? 0) > 0 && (b.cash ?? 0) > 0) out.errors.push('Cash can only go one way in a deal.');
  // a swap right rides on both teams' own firsts of that draft (see termErrors in trades.ts): each
  // still with its team, unprotected, in no other swap and staying put in this deal, or the right
  // would land on a pick a third team holds
  const moving = new Set(dpids);
  for (const [side, other] of [
    [a, b],
    [b, a],
  ])
    for (const y of side.swaps ?? [])
      if (
        !swapSeasons(league, side.tid, other.tid).includes(y) ||
        other.swaps?.includes(y) ||
        league.draftPicks.some((d) => d.season === y && d.round === 1 && moving.has(d.dpid) && (d.originalTid === a.tid || d.originalTid === b.tid))
      )
        out.errors.push(`A ${y} pick swap needs both teams' own ${y} firsts, unprotected, in no other swap and not moving in the deal.`);
  const something = (s: TradeOffer['a']) => s.pids.length || s.dpids.length || s.swaps?.length || (s.cash ?? 0) > 0;
  if (!something(a) && !something(b)) out.errors.push('The trade is empty.');
  if (!out.errors.length) {
    const tw = (pid: number) => !!league.players[pid].contract.twoWay;
    const moves = (from: number, to: number, pids: number[]) =>
      pids.flatMap((pid): RosterMove[] => [
        { tid: from, n: -1, twoWay: tw(pid) },
        { tid: to, n: 1, twoWay: tw(pid) },
      ]);
    rosterChecks(league, [...moves(a.tid, b.tid, a.pids), ...moves(b.tid, a.tid, b.pids)], out);
  }
  out.errors = [...new Set(out.errors)];
  return out;
}

/** Make a trade happen whatever the AI GM and the rules say (throws, changing nothing, if checkForceTrade finds an error). */
export function forceTrade(league: League, offer: TradeOffer) {
  const { errors } = checkForceTrade(league, offer);
  if (errors.length) throw new Error(errors[0]);
  executeTrade(league, offer);
  // as after any edit: offers that no longer stand go now, and both rosters' rotations, roles and
  // numbers follow at once
  cleanProposals(league);
  refreshTeams(league, [offer.a.tid, offer.b.tid]);
  league.godEdits = (league.godEdits ?? 0) + 1;
}
