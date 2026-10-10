import type { League, Player, PlayerStats, Pos, Ratings, Settings } from '../types';
import { FREE_AGENT } from '../types';
import { START_SEASON } from '../constants';
import { Rng, hashString, clamp } from '../random';
import { FRANCHISES, BBREF_TO_TID } from '../teams';
import { makeTeam } from '../teamFactory';
import { DEFAULT_SCALE, blankMood, generatePlayer, refreshPlayerDerived } from '../playerGen';
import { archetype, buildOvrScale, ovrRaw } from '../ratings';
import { generateSchedule } from './schedule';
import { ensureFuturePicks, generateDraftClass } from './draft';
import { ensureRotation } from './games';
import { updateMorale } from './morale';
import { askingContract } from './contracts';
import { addInbox, teamPlayers } from './helpers';
import { teamStrategyUpdate } from './trades';
import { fillRosters } from './freeAgency';

export interface SeedPlayer {
  id: string;
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
  contract: { salaries: number[]; option?: 'player' | 'team' } | null;
  draft: { year: number; round: number; pick: number; team?: string } | null;
  ratings: Ratings;
  growth?: number;
  injuryProne?: number;
  stats: PlayerStats[];
}

export interface SeedData {
  version: number;
  generated: string;
  source: string;
  season: number;
  players: SeedPlayer[];
  realAvgs?: Record<string, number>;
}

export interface CreateOpts {
  name: string;
  userTid: number;
  coachName: string;
  settings: Settings;
  seed?: SeedData | null;
  rngSeed?: number;
}

export function defaultSettings(): Settings {
  return { difficulty: 'casual', injuries: true, jobSecurity: true, complexity: 'advanced', liveSpeed: 1 };
}

function seedToPlayer(sp: SeedPlayer, pid: number, season: number, rng: Rng): Player {
  const tid = sp.team ? BBREF_TO_TID[sp.team] ?? FREE_AGENT : FREE_AGENT;
  const salaries = sp.contract?.salaries?.length ? sp.contract.salaries : [0];
  const experience = sp.draft ? Math.max(0, season - 1 - sp.draft.year) : Math.max(0, sp.stats.filter((s) => s.real).map((s) => s.season).filter((v, i, a) => a.indexOf(v) === i).length);
  const p: Player = {
    pid,
    bbrefId: sp.id,
    firstName: sp.first,
    lastName: sp.last,
    pos: sp.pos,
    heightIn: sp.heightIn,
    weightLb: sp.weightLb,
    bornYear: sp.bornYear,
    country: sp.country,
    college: sp.college,
    jersey: sp.jersey,
    draft: sp.draft
      ? { year: sp.draft.year, round: sp.draft.round, pick: sp.draft.pick, tid: sp.draft.team ? BBREF_TO_TID[sp.draft.team] ?? null : null, teamAbbrev: sp.draft.team }
      : { year: 0, round: 0, pick: 0, tid: null },
    tid,
    ratings: { ...sp.ratings },
    ovr: 0,
    pot: 0,
    growth: sp.growth ?? clamp(rng.normal(0, 0.4), -1, 1),
    injuryProne: sp.injuryProne ?? 0.3,
    ratingsHistory: [],
    contract: { start: season, salaries, option: sp.contract?.option },
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

export function createLeague(opts: CreateOpts): League {
  const rngSeed = opts.rngSeed ?? (hashString(opts.name + Date.now()) >>> 0);
  const rng = new Rng(rngSeed);
  const season = START_SEASON;
  const teams = FRANCHISES.map((_, tid) => makeTeam(tid, season, rng));
  const league: League = {
    id: `lg_${Date.now().toString(36)}_${Math.floor(rng.next() * 1e6).toString(36)}`,
    name: opts.name,
    version: 1,
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
    realAvgs: opts.seed?.realAvgs,
  };
  teams[opts.userTid].coach.name = opts.coachName;

  if (opts.seed) {
    for (const sp of opts.seed.players) {
      const p = seedToPlayer(sp, league.nextPid++, season, rng);
      league.players[p.pid] = p;
    }
    const rostered = Object.values(league.players).filter((p) => p.tid >= 0);
    league.ovrScale = buildOvrScale(rostered.map((p) => ovrRaw(p.ratings)));
  } else {
    // fictional league
    for (let tid = 0; tid < 30; tid++) {
      for (let i = 0; i < 14; i++) {
        const talent = rng.normal(i < 2 ? 1.6 : i < 5 ? 0.8 : i < 9 ? 0 : -0.8, 0.6);
        const age = Math.round(clamp(rng.normal(26.5, 4), 19, 37));
        const p = generatePlayer(rng, { pid: league.nextPid++, season, tid, age, talent, scale: DEFAULT_SCALE });
        p.experience = Math.max(0, age - 20);
        p.draft = { year: season - 1 - p.experience, round: rng.chance(0.7) ? 1 : 2, pick: rng.int(1, 30), tid: null };
        league.players[p.pid] = p;
      }
    }
    for (let i = 0; i < 40; i++) {
      const p = generatePlayer(rng, { pid: league.nextPid++, season, tid: FREE_AGENT, age: rng.int(22, 34), talent: rng.normal(-1, 0.5), scale: DEFAULT_SCALE });
      league.players[p.pid] = p;
    }
    const rostered = Object.values(league.players).filter((p) => p.tid >= 0);
    league.ovrScale = buildOvrScale(rostered.map((p) => ovrRaw(p.ratings)));
    // contracts for the fictional league, scaled so payrolls land near the cap
    for (const p of Object.values(league.players)) {
      refreshPlayerDerived(p, season, league.ovrScale);
      if (p.tid >= 0) {
        const ask = askingContract(league, p);
        p.contract = { start: season, salaries: Array.from({ length: rng.int(1, 4) }, (_, i) => Math.round(ask.amount * Math.pow(1.05, i))) };
      }
    }
    for (let tid = 0; tid < 30; tid++) {
      const roster = Object.values(league.players).filter((p) => p.tid === tid);
      const pay = roster.reduce((a, p) => a + p.contract.salaries[0], 0);
      const target = rng.uniform(150_000, 195_000);
      const f = target / Math.max(1, pay);
      for (const p of roster) p.contract.salaries = p.contract.salaries.map((x) => Math.max(1_300, Math.round((x * f) / 10) * 10));
    }
  }
  for (const p of Object.values(league.players)) {
    refreshPlayerDerived(p, season, league.ovrScale);
    p.ratingsHistory = [{ season, ovr: p.ovr, pot: p.pot, r: { ...p.ratings } }];
    if (p.tid === FREE_AGENT) {
      p.asking = askingContract(league, p);
      p.faDays = 30;
    }
  }
  ensureFuturePicks(league, season + 3);
  generateDraftClass(league, season, rng);
  fillRosters(league, rng);
  const sched = generateSchedule(league.teams, season, rng, league.nextGid);
  league.schedule = sched.games;
  league.nextGid += sched.games.length;
  league.regularSeasonDays = sched.lastDay;
  league.allStarDay = sched.allStarDay;
  league.tradeDeadlineDay = sched.tradeDeadlineDay;
  league.rng = rng.state;
  teamStrategyUpdate(league);
  for (const t of league.teams) ensureRotation(league, t.tid);
  for (const t of league.teams) updateMorale(league, t.tid);
  const user = league.teams[opts.userTid];
  const roster = teamPlayers(league, opts.userTid);
  addInbox(league, {
    from: 'Owner',
    subject: `Welcome to the ${user.region} ${user.name}`,
    body: `Coach ${opts.coachName}, you're running basketball operations and the bench. Your roster has ${roster.length} players. Start with Tactics: your assistant has drafted a game plan that fits this roster, and every choice explains what it does. When you're ready, start the regular season from Home.`,
    tone: 'good',
    link: '/tactics',
  });
  return league;
}
