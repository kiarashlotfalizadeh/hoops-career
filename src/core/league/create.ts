import type { DraftInfo, Injury, League, Player, PlayerStats, Pos, RatingKey, Ratings, Settings, Tendencies } from '../types';
import { FREE_AGENT } from '../types';
import { CAP, ROOKIE_SCALE, SAVE_VERSION, START_SEASON } from '../constants';
import { Rng, hashString, clamp } from '../random';
import { FRANCHISES, BBREF_TO_TID } from '../teams';
import { coachName, makeTeam } from '../teamFactory';
import { seedCoaches } from './coaches';
import { DEFAULT_SCALE, blankMood, genTendencies, generatePlayer, refreshPlayerDerived } from '../playerGen';
import { OVR_ANCHORS, SKILL_KEYS, archetype, buildOvrScale, ovrRaw, ovrWeights } from '../ratings';
import { generateSchedule, realSchedule, type RealCupData } from './schedule';
import { cupState } from './cup';
import { ensureFuturePicks, generateDraftClass } from './draft';
import { ensureRotation } from './games';
import { JERSEYS } from './jerseys';
import { updateMorale } from './morale';
import { FA_PRICE_CUT_DAYS, askingContract, makeContract, marketSalary, preferredYears, releasePlayer, rookieContract, twoWaySalary, valueScore } from './contracts';
import { CAP_FOR, addInbox, playerName, standardRoster, teamPlayers } from './helpers';
import { teamStrategyUpdate } from './trades';
import { fillRosters, trimRosters } from './freeAgency';
import { ratingMeans, ratingSpreads } from './progression';

export interface SeedPlayer {
  id: string;
  nbaId?: number;
  first: string;
  last: string;
  pos: Pos;
  heightIn: number;
  weightLb: number;
  bornYear: number;
  country: string;
  college: string;
  jersey: string;
  /** Basketball Reference team abbreviation from the contracts page, or null for free agents. */
  team: string | null;
  contract: { salaries: number[]; option?: 'player' | 'team'; twoWay?: boolean } | null;
  draft: { year: number; round: number; pick: number; team?: string } | null;
  ratings: Ratings;
  tend?: Tendencies;
  growth?: number;
  injuryProne?: number;
  stats: PlayerStats[];
  /** Out on opening night (real league with injuries on). */
  injury?: SeedInjury;
}

export interface SeedInjury {
  type: string;
  severity: Injury['severity'];
  /** Expected return as a season day (day 0 = opening night), if known. */
  returnDay: number | null;
  /** Team games he misses, estimated from the real schedule. */
  games: number;
  /** Source description, e.g. "Knee: expected to miss the season". */
  detail?: string;
}

/** A future draft pick that doesn't simply belong to its original team (traded and/or protected). */
export interface SeedPick {
  season: number;
  round: 1 | 2;
  /** BBRef codes. */
  original: string;
  owner: string;
  /** Top-N protection: stays with the original team if it lands in the first N of its round. */
  protection?: number;
}

export interface SeedSchedule {
  season: number;
  /** Calendar date of day 0. */
  start: string;
  /** "day:AWY@HOM" with NBA tricodes, regular season only. */
  games: string[];
  /** NBA Cup groups, group games and knockout days (see RealCupData). */
  cup?: RealCupData;
}

export interface SeedData {
  version: number;
  generated: string;
  source: string;
  season: number;
  players: SeedPlayer[];
  /** The real regular-season schedule (80 games per team plus the Cup, or completed to 82 at creation). */
  schedule?: SeedSchedule;
  /** Real future pick ownership: picks not listed belong to their original team. */
  picks?: SeedPick[];
  /** Last draft covered by `picks`. */
  picksThrough?: number;
  /** When the schedule, picks, injuries and two-way contracts were fetched. */
  extrasAsOf?: string;
}

export interface CreateOpts {
  name: string;
  userTid: number;
  coachName: string;
  settings: Settings;
  seed?: SeedData | null;
  rngSeed?: number;
  /** Cut AI rosters to 15 at creation (default). The seed builder keeps everyone to calibrate them. */
  preseasonCuts?: boolean;
}

export function defaultSettings(): Settings {
  return { difficulty: 'casual', injuries: true, jobSecurity: true, complexity: 'advanced', liveSpeed: 1 };
}

/**
 * NBA seasons before `season` and draft details for a seed player. Without draft data he went
 * undrafted (or, like LeBron, was drafted before the seed's draft pages begin): with no season on
 * record he is a rookie, one who debuted within the record has its seasons, and one already playing
 * when it begins (`firstRecord`) counts the years since a typical undrafted debut at 22 (VanVleet 10,
 * not the 2 on record), which sets his max, his minimum and two-way eligibility. Second-round picks
 * are numbered within the round, as the game does.
 */
function seedCareer(sp: SeedPlayer, season: number, firstRecord: number): { experience: number; draft: DraftInfo } {
  if (sp.draft) {
    const { year, round, team } = sp.draft;
    const pick = round === 2 && sp.draft.pick > 30 ? sp.draft.pick - 30 : sp.draft.pick;
    return { experience: Math.max(0, season - 1 - year), draft: { year, round, pick, tid: team ? (BBREF_TO_TID[team] ?? null) : null, teamAbbrev: team } };
  }
  const seasons = new Set(sp.stats.filter((s) => s.real).map((s) => s.season));
  const experience = seasons.has(firstRecord) ? Math.max(seasons.size, season - sp.bornYear - 22) : seasons.size;
  // a 15-year veteran was almost surely drafted: his draft stays unknown rather than "undrafted"
  return { experience, draft: { year: experience >= 15 ? 0 : season - 1 - experience, round: 0, pick: 0, tid: null } };
}

/**
 * A first-round pick still on the deal he signed as a rookie: it ends within four seasons of his
 * draft and pays about his slot's rookie scale or more (one waived onto a minimum deal isn't on it).
 */
function onRookieScale(sp: SeedPlayer, season: number): boolean {
  const c = sp.contract;
  if (!c || c.twoWay || !sp.draft || sp.draft.round !== 1) return false;
  const scale = ROOKIE_SCALE[Math.min(29, sp.draft.pick - 1)] * Math.pow(1.045, season - 1 - sp.draft.year);
  return season + c.salaries.length - 1 <= sp.draft.year + 4 && c.salaries[0] >= scale * 0.85;
}

function seedToPlayer(sp: SeedPlayer, pid: number, season: number, rng: Rng, firstRecord: number): Player {
  const tid = sp.team ? (BBREF_TO_TID[sp.team] ?? FREE_AGENT) : FREE_AGENT;
  const salaries = sp.contract?.salaries?.length ? sp.contract.salaries : [0];
  const { experience, draft } = seedCareer(sp, season, firstRecord);
  const p: Player = {
    pid,
    bbrefId: sp.id,
    nbaId: sp.nbaId,
    firstName: sp.first,
    lastName: sp.last,
    pos: sp.pos,
    heightIn: sp.heightIn,
    weightLb: sp.weightLb,
    bornYear: sp.bornYear,
    country: sp.country,
    college: sp.college,
    // Basketball Reference lists every number a player wore that season ("6, 9"): the latest is his
    jersey: sp.jersey.split(',').pop()!.trim(),
    draft,
    tid,
    ratings: { ...sp.ratings },
    tend: sp.tend ? { ...sp.tend } : undefined,
    ovr: 0,
    pot: 0,
    growth: sp.growth ?? clamp(rng.normal(0, 0.4), -1, 1),
    injuryProne: sp.injuryProne ?? 0.3,
    ratingsHistory: [],
    contract: { start: season, salaries, option: sp.contract?.option, ...(sp.contract?.twoWay ? { twoWay: true } : {}), ...(onRookieScale(sp, season) ? { rookie: true } : {}) },
    stats: sp.stats.map((s) => ({ ...s, tid: BBREF_TO_TID[String(s.tid)] ?? s.tid })),
    injury: null,
    injuryCount: 0,
    mood: blankMood(),
    training: 'balanced',
    awards: [],
    joinedSeason: season,
    experience,
    wear: 0,
    restedGames: 0,
    real: true,
    archetype: archetype(sp.ratings).label,
  };
  return p;
}

/** Rookies and new signings without a listed number pick a free one on their team. */
function assignJerseys(league: League, rng: Rng) {
  for (const t of league.teams) {
    const roster = Object.values(league.players).filter((p) => p.tid === t.tid);
    const used = new Set<string>();
    const fixes: Player[] = [];
    for (const p of roster) {
      if (p.jersey && !used.has(p.jersey)) used.add(p.jersey);
      else fixes.push(p);
    }
    for (const p of fixes) {
      const free = JERSEYS.filter((j) => !used.has(j));
      p.jersey = free.length ? rng.pick(free) : String(rng.int(40, 99));
      used.add(p.jersey);
    }
  }
}

/**
 * A fictional roster's heights by spot, each with some noise: the real league's mix of guards, wings
 * and bigs, in both halves of the roster. Drawn independently, a fifth of the teams had no 6'10"
 * player in their top eight (no real team is without one) and some had seven or eight players 6'4"
 * or shorter.
 */
const SPOT_HEIGHTS = [74, 75, 76, 76.5, 77, 77.5, 78.5, 79, 80, 80.5, 81.5, 82, 83, 84];

export function createLeague(opts: CreateOpts): League {
  const rngSeed = opts.rngSeed ?? hashString(opts.name + Date.now()) >>> 0;
  const rng = new Rng(rngSeed);
  const season = START_SEASON;
  const teams = FRANCHISES.map((_, tid) => makeTeam(tid, season, rng));
  const league: League = {
    // a league made from a given seed (tests and scripts) gets an id from it, so the streams drawn from
    // the id (opponents' game plans, AI extensions, the carousel...) play out the same on every run
    id: `lg_${opts.rngSeed !== undefined ? `s${rngSeed.toString(36)}${(hashString(opts.name) >>> 0).toString(36)}` : Date.now().toString(36)}_${Math.floor(rng.next() * 1e6).toString(36)}`,
    name: opts.name,
    version: SAVE_VERSION,
    created: Date.now(),
    userTid: opts.userTid,
    coachName: opts.coachName,
    season,
    phase: 'preseason',
    day: 0,
    settings: opts.settings,
    teams,
    players: {},
    draftPicks: [],
    schedule: [],
    games: [],
    playIn: [],
    playoffs: [],
    awards: [],
    news: [],
    inbox: [],
    nextPid: 1,
    nextGid: 1,
    nextDpid: 1,
    nextMsgId: 1,
    rng: rng.state,
    ovrScale: DEFAULT_SCALE,
    regularSeasonDays: 165,
    tradeDeadlineDay: 108,
    allStarDay: 120,
    ownerMood: { wins: 0, playoffs: 0, money: 0, total: 0 },
    faDay: 30,
    startSeason: season,
  };
  teams[opts.userTid].coach.name = opts.coachName;
  // no two head coaches share a name (drawn from 900, a third of leagues had two, and Coach of the
  // Year history goes by name); redraws come from a stream of their own, so nothing else moves
  const coachRng = new Rng(rngSeed ^ 0x2c1b3c6d);
  const coaches = new Set([opts.coachName]);
  for (const t of teams) {
    if (t.tid === opts.userTid) continue;
    while (coaches.has(t.coach.name)) t.coach.name = coachName(coachRng);
    coaches.add(t.coach.name);
  }
  // the coach registry starts with them, each in charge from the league's first season
  seedCoaches(league);

  if (opts.seed && opts.seed.players.length) {
    // the first season the seed's stats cover
    const firstRecord = Math.min(season - 1, ...opts.seed.players.flatMap((sp) => sp.stats.filter((s) => s.real).map((s) => s.season)));
    for (const sp of opts.seed.players) {
      const p = seedToPlayer(sp, league.nextPid++, season, rng, firstRecord);
      // the contracts table also lists waived players a team still pays (a stretched or partly
      // guaranteed deal, below any playing contract): that is dead money (a team option year isn't
      // guaranteed), and the player is a free agent, or out of the league if he hasn't played in the
      // seed's seasons
      const c = p.contract;
      if (p.tid >= 0 && !c.twoWay && c.salaries[0] < CAP.minContract) {
        const years = c.option === 'team' ? c.salaries.length - 1 : c.salaries.length;
        for (let i = 0; i < years; i++) if (c.salaries[i] > 0) league.teams[p.tid].deadMoney.push({ pid: p.pid, name: playerName(p), season: season + i, amount: c.salaries[i] });
        if (!p.stats.some((s) => s.real && s.gp > 0)) continue;
        p.tid = FREE_AGENT;
        p.contract = { start: season, salaries: [0] };
      }
      league.players[p.pid] = p;
    }
    const rostered = Object.values(league.players).filter((p) => p.tid >= 0);
    league.ovrScale = buildOvrScale(rostered.map((p) => ovrRaw(p.ratings)));
    assignJerseys(league, rng);
  } else {
    // fictional league
    const taken = new Set<string>();
    for (let tid = 0; tid < 30; tid++) {
      const roster: Player[] = [];
      // contenders and rebuilding teams: the whole roster is a little better or worse. Teams' top-8
      // OVR then spreads about 2 points, near real rosters' 1.75; a wider start (2.7) only drained
      // away over the first few offseasons
      const quality = rng.normal(0, 0.2);
      // each pair of neighbouring heights is split between the better and the weaker half of the roster
      const pairs = Array.from({ length: SPOT_HEIGHTS.length / 2 }, (_, j) => rng.shuffle([SPOT_HEIGHTS[2 * j], SPOT_HEIGHTS[2 * j + 1]]));
      const heights = [...rng.shuffle(pairs.map((x) => x[0])), ...rng.shuffle(pairs.map((x) => x[1]))];
      for (let i = 0; i < 14; i++) {
        const talent = quality + rng.normal(i < 2 ? 1.6 : i < 5 ? 0.8 : i < 9 ? 0 : -0.8, 0.6);
        // the last three spots go to young players (some of them on rookie deals); with the rest, about
        // as many are 23 or younger as on real rosters. When half of them were, the anchor that holds
        // the league's attribute means pulled everyone back as the league grew older: players peaked at
        // 24-25 and lost OVR from 27
        const age = i >= 11 ? Math.round(clamp(rng.normal(21.5, 1.2), 19, 23)) : Math.round(clamp(rng.normal(28, 4), 20, 38));
        // the last spot goes to a center if the roster has none yet
        const big = i === 13 && !roster.some((p) => p.pos === 'C');
        const heightIn = big ? rng.int(83, 85) : clamp(Math.round(heights[i] + rng.normal(0, 1.2)), 70, 88);
        let p = generatePlayer(rng, { pid: league.nextPid, season, tid, age, talent, scale: DEFAULT_SCALE, heightIn, taken });
        for (let tries = 0; big && p.pos !== 'C' && tries < 10; tries++)
          p = generatePlayer(rng, { pid: league.nextPid, season, tid, age, talent, scale: DEFAULT_SCALE, heightIn: rng.int(84, 86), taken });
        league.nextPid++;
        p.experience = Math.max(0, age - 20);
        p.draft = { year: season - 1 - p.experience, round: rng.chance(0.7) ? 1 : 2, pick: rng.int(1, 30), tid: null };
        league.players[p.pid] = p;
        roster.push(p);
      }
      // two-way prospects outside the 15 (most real ones are 22 to 27)
      for (let i = 0; i < 2; i++) {
        const age = rng.int(22, 27);
        const p = generatePlayer(rng, { pid: league.nextPid++, season, tid, age, talent: rng.normal(-1.3, 0.4), scale: DEFAULT_SCALE, taken });
        p.experience = rng.int(0, Math.min(2, age - 20));
        p.draft = { year: season - 1 - p.experience, round: 2, pick: rng.int(1, 30), tid: null };
        p.contract = { start: season, salaries: [0], twoWay: true };
        league.players[p.pid] = p;
      }
    }
    for (let i = 0; i < 40; i++) {
      const age = rng.int(22, 34);
      const p = generatePlayer(rng, { pid: league.nextPid++, season, tid: FREE_AGENT, age, talent: rng.normal(-1, 0.5), scale: DEFAULT_SCALE, taken });
      p.experience = Math.max(0, age - 21);
      // undrafted, in the league since his first season (so not a rookie next year)
      p.draft = { year: season - 1 - p.experience, round: 0, pick: 0, tid: null };
      league.players[p.pid] = p;
    }
    const rostered = Object.values(league.players).filter((p) => p.tid >= 0 && !p.contract.twoWay);
    matchRealSpread(rostered, Object.values(league.players));
    league.ovrScale = buildOvrScale(rostered.map((p) => ovrRaw(p.ratings)));
    for (const p of Object.values(league.players)) {
      refreshPlayerDerived(p, season, league.ovrScale);
      p.tend = genTendencies(p, rng);
    }
    fictionalContracts(league, rng);
  }
  for (const p of Object.values(league.players)) {
    refreshPlayerDerived(p, season, league.ovrScale);
    p.ratingsHistory = [{ season, ovr: p.ovr, pot: p.pot, r: { ...p.ratings } }];
    if (p.tid === FREE_AGENT) {
      p.asking = askingContract(league, p);
      p.faDays = FA_PRICE_CUT_DAYS;
    }
  }
  league.ratingAnchors = ratingMeans(league);
  league.ratingSpreads = ratingSpreads(league);
  const realSeed = opts.seed && opts.seed.players.length ? opts.seed : null;
  ensureFuturePicks(league, Math.max(season + 4, realSeed?.picks ? (realSeed.picksThrough ?? 0) : 0));
  if (realSeed?.picks) applySeedPicks(league, realSeed.picks);
  generateDraftClass(league, season, rng);
  const sched = (realSeed?.schedule && realSchedule(league.teams, realSeed.schedule, season, rng, league.nextGid)) || generateSchedule(league.teams, season, rng, league.nextGid);
  league.schedule = sched.games;
  league.nextGid += sched.games.length;
  league.regularSeasonDays = sched.lastDay;
  league.allStarDay = sched.allStarDay;
  league.tradeDeadlineDay = sched.tradeDeadlineDay;
  league.cup = sched.cup ? cupState(sched.cup, season) : null;
  // injuries first, so preseason cuts see who is out
  if (realSeed && opts.settings.injuries) applySeedInjuries(league, realSeed);
  // preseason cuts: real contract lists include camp deals (not guaranteed until opening night), so
  // AI teams trim to 15 standard contracts
  if (opts.preseasonCuts !== false) trimRosters(league, (p) => releasePlayer(league, p, { news: false }));
  fillRosters(league, rng);
  league.rng = rng.state;
  teamStrategyUpdate(league);
  for (const t of league.teams) ensureRotation(league, t.tid);
  for (const t of league.teams) updateMorale(league, t.tid);
  const user = league.teams[opts.userTid];
  const roster = teamPlayers(league, opts.userTid);
  // two-way contracts don't count toward the 15-man roster
  const standard = roster.filter((p) => !p.contract.twoWay);
  const twoWays = roster.length - standard.length;
  addInbox(league, {
    from: 'Owner',
    subject: `Welcome to the ${user.region} ${user.name}`,
    body: `Coach ${opts.coachName}, you're running basketball operations and the bench. Your roster has ${standard.length} players${twoWays ? `, plus ${twoWays === 1 ? 'one on a two-way deal' : `${twoWays} on two-way deals`}` : ''}. Start with Tactics: your assistant has drafted a game plan that fits this roster, and every choice explains what it does. When you're ready, start the regular season from Home.`,
    tone: 'good',
    link: '/tactics',
  });
  const over = standard.length - CAP.rosterMax;
  if (over > 0) {
    const cuts = [...standard].sort((a, b) => valueScore(league, a) - valueScore(league, b)).slice(0, over);
    addInbox(league, {
      from: 'Assistant GM',
      subject: `Preseason cuts: ${standard.length} players, room for ${CAP.rosterMax}`,
      body: `We carry ${standard.length} players on standard contracts into camp, including camp invites${twoWays ? ` (plus ${twoWays === 1 ? "one on a two-way deal, who doesn't count" : `${twoWays} on two-way deals, who don't count`})` : ''}. The league allows ${CAP.rosterMax} on opening night, so ${over} ${over === 1 ? 'has' : 'have'} to go before the season starts. Camp and minimum deals signed for this season aren't guaranteed until opening night, so cutting those costs nothing; anyone else's remaining salary stays on our books.\n\nMy suggestion, by least value to the team: ${cuts.map((p) => `${playerName(p)} (${p.ovr})`).join(', ')}. Release players from the Office or their player page.`,
      tone: 'alert',
      link: '/office',
    });
  }
  return league;
}

/** Raw OVR (ovrRaw) of the real 2026-27 rosters at each OVR_ANCHORS quantile, as the seed rates them. */
const REAL_RAW_QUANTILES = [41.76, 44.38, 44.97, 46.24, 47.98, 50.01, 52.81, 56.58, 58.83, 61.72, 66.09];

/**
 * Generated talent moves every skill together, so a generated league spread overall ability more
 * than real rosters do (raw OVR SD about 9 against 4). Development and aging move attributes by the
 * same amounts in any league, so a fictional player's OVR barely moved: rookies gained a point a
 * year, veterans hardly declined into their late 30s and POT overshot by four. Each player's level
 * is moved along his skills (his profile kept) to the same place in the real league's distribution,
 * by his quantile among `rostered`; `all` gets the same mapping.
 */
function matchRealSpread(rostered: Player[], all: Player[]) {
  // the shape only: the average stays where it was generated (skill levels set the scoring level)
  const avg = () => rostered.reduce((a, p) => a + ovrRaw(p.ratings), 0) / rostered.length;
  const avg0 = avg();
  const median = OVR_ANCHORS.findIndex(([q]) => q === 0.5);
  const centre = buildOvrScale(rostered.map((p) => ovrRaw(p.ratings))).raw[median];
  const to = REAL_RAW_QUANTILES.map((x) => x - REAL_RAW_QUANTILES[median] + centre);
  const shift = (p: Player, raw: number) => {
    const w = ovrWeights(p.ratings);
    const d = raw / SKILL_KEYS.reduce((t, key) => t + w[key], 0);
    for (const key of SKILL_KEYS) p.ratings[key] = clamp(p.ratings[key] + d, 1, 100);
  };
  const stats = (k: RatingKey) => {
    const m = rostered.reduce((a, p) => a + p.ratings[k], 0) / rostered.length;
    return { m, sd: Math.sqrt(rostered.reduce((a, p) => a + (p.ratings[k] - m) ** 2, 0) / rostered.length) };
  };
  const skill0 = new Map(SKILL_KEYS.map((k) => [k, stats(k)]));
  // alternate: level onto the real quantiles, then give each skill back its spread (players come out
  // more specialised, like real ones, rather than uniformly worse or better)
  for (let pass = 0; pass < 4; pass++) {
    if (pass) {
      for (const k of SKILL_KEYS) {
        const { m, sd } = stats(k);
        if (sd > 0) for (const p of all) p.ratings[k] = clamp(skill0.get(k)!.m + ((p.ratings[k] - m) * skill0.get(k)!.sd) / sd, 1, 100);
      }
    }
    const from = buildOvrScale(rostered.map((p) => ovrRaw(p.ratings))).raw;
    // piecewise linear between matching quantiles, extended with the end segments' slopes
    const map = (raw: number) => {
      let i = 1;
      while (i < from.length - 1 && raw > from[i]) i++;
      return to[i - 1] + ((raw - from[i - 1]) * (to[i] - to[i - 1])) / (from[i] - from[i - 1]);
    };
    for (const p of all) shift(p, map(ovrRaw(p.ratings)) - ovrRaw(p.ratings));
  }
  const off = avg0 - avg();
  for (const p of all) {
    shift(p, off);
    for (const key of SKILL_KEYS) p.ratings[key] = Math.round(p.ratings[key] * 10) / 10;
  }
}

/**
 * Fictional contracts follow value: each player gets about his market price (with some noise).
 * Team totals are pulled halfway toward the league average (teams budget, so payrolls don't swing
 * as widely as talent does), then everything is scaled so the average payroll lands a little over
 * the cap and clamped to each player's minimum and max. Each team's two or three best young
 * players are on rookie-scale deals, some veterans hold options, and the two-way prospects get
 * two-way deals.
 */
function fictionalContracts(league: League, rng: Rng) {
  const season = league.season;
  const cap = CAP_FOR(league, season);
  const teams = league.teams.map((t) => {
    const roster = standardRoster(league, t.tid);
    const young = roster.filter((p) => p.experience <= 3).sort((a, b) => valueScore(league, b) - valueScore(league, a));
    const rookies = new Set(young.slice(0, rng.int(2, 3)));
    for (const p of rookies) {
      // a first-rounder in year experience+1 of his four-year scale
      p.draft = { ...p.draft, year: season - 1 - p.experience, round: 1 };
      p.contract = rookieContract(league, p.draft.pick, 1, season - p.experience);
    }
    return roster.filter((p) => !rookies.has(p)).map((p) => ({ p, amount: marketSalary(league, p) * rng.uniform(0.8, 1.2) }));
  });
  const totals = teams.map((team) => team.reduce((a, x) => a + x.amount, 0));
  const mean = totals.reduce((a, v) => a + v, 0) / totals.length;
  const open = teams.flatMap((team, i) => team.map((x) => ({ ...x, amount: x.amount * Math.sqrt(mean / totals[i]) })));
  for (const p of Object.values(league.players)) {
    if (p.contract.twoWay) p.contract = { start: season, salaries: [twoWaySalary(league, season)], twoWay: true };
  }
  const rookiePay = Object.values(league.players).reduce((a, p) => a + (p.tid >= 0 && p.contract.rookie ? p.contract.salaries[season - p.contract.start] : 0), 0);
  const target = league.teams.length * cap.salaryCap * 1.05 - rookiePay;
  const limits = (p: Player) => [p.experience >= 3 ? cap.vetMin : cap.minContract, cap.maxContract(p.experience)] as const;
  // clamping moves the total, so scale twice
  let f = 1;
  for (let i = 0; i < 2; i++) {
    const total = open.reduce((a, x) => a + clamp(x.amount * f, ...limits(x.p)), 0);
    f *= target / Math.max(1, total);
  }
  for (const { p, amount } of open) {
    const years = rng.int(1, Math.min(4, preferredYears(league, p)));
    p.contract = makeContract(league, clamp(Math.round((amount * f) / 10) * 10, ...limits(p)), years, season, p.experience);
    if (years > 1 && p.experience >= 4 && rng.chance(0.12)) p.contract.option = rng.chance(0.7) ? 'player' : 'team';
  }
}

/** Real pick ownership: every listed pick moves to its owner (picks start with their original team). */
function applySeedPicks(league: League, picks: SeedPick[]) {
  for (const sp of picks) {
    const orig = BBREF_TO_TID[sp.original];
    const owner = BBREF_TO_TID[sp.owner];
    if (orig === undefined || owner === undefined) continue;
    const dp = league.draftPicks.find((d) => d.season === sp.season && d.round === sp.round && d.originalTid === orig);
    if (!dp) continue;
    dp.tid = owner;
    if (sp.protection && sp.protection > 0) dp.protection = sp.protection;
  }
}

/**
 * Opening-night injuries. The time out is counted in the team's games on the actual schedule
 * (with a share of the playoffs when the return date is after the regular season).
 */
function applySeedInjuries(league: League, seed: SeedData) {
  const byId = new Map(seed.players.filter((sp) => sp.injury).map((sp) => [sp.id, sp.injury!]));
  if (!byId.size) return;
  const last = league.regularSeasonDays;
  const cup = league.cup;
  for (const p of Object.values(league.players)) {
    const inj = p.bbrefId ? byId.get(p.bbrefId) : undefined;
    if (!inj || p.tid < 0) continue;
    let games = inj.games;
    if (inj.returnDay !== null) {
      games = league.schedule.filter((g) => g.type === 'regular' && g.day < inj.returnDay! && (g.home === p.tid || g.away === p.tid)).length;
      // every team's last two games go in the Cup's knockout window once the groups are decided
      // (before the championship); a return inside the window misses about one of them
      if (cup && inj.returnDay > cup.qfDays[0]) games += inj.returnDay >= cup.finalDay ? 2 : 1;
      // back after the regular season: part or all of the playoffs too (~2.5 days per playoff game)
      if (inj.returnDay > last) games += Math.min(28, Math.round((inj.returnDay - last) / 2.5));
    }
    if (games <= 0) continue;
    p.injury = { type: inj.type, gamesRemaining: games, gamesTotal: games, severity: inj.severity };
    p.injuryCount++;
  }
}
