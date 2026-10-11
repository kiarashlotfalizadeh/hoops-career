// Core league data model. Everything here is plain, structured-clone-safe data so
// the whole league can be persisted to IndexedDB and shipped to web workers.

export type Pos = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export const POSITIONS: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** Internal attribute ratings, 0-100. League-average rotation player sits near 50. */
export interface Ratings {
  hgt: number; // height/length (mostly fixed after 21)
  spd: number; // speed & lateral quickness
  ath: number; // explosiveness / vertical
  str: number; // strength
  end: number; // endurance
  ins: number; // finishing at the rim
  mid: number; // mid-range & pull-up touch
  tp: number; // three-point shooting
  ft: number; // free throw shooting
  hnd: number; // ball handling
  pas: number; // passing & vision
  oiq: number; // offensive IQ / shot creation feel
  drw: number; // drawing fouls
  post: number; // post-up skill
  perD: number; // perimeter on-ball defense
  intD: number; // interior post defense
  stl: number; // hands / steals
  blk: number; // shot blocking
  diq: number; // team defense IQ (rotations, positioning)
  oreb: number;
  dreb: number;
}
export type RatingKey = keyof Ratings;

export type OffRole =
  | 'creator' // primary initiator (heliocentric option)
  | 'scorer' // secondary creator / three-level scorer
  | 'playmaker' // pass-first guard / connector
  | 'shooter' // movement / spot-up shooter
  | 'slasher' // rim attacker, cutter
  | 'roller' // rim runner / lob threat
  | 'stretch' // pick-and-pop / stretch big
  | 'post' // post hub / back-to-basket
  | 'hub' // passing big, handoff hub
  | 'glue'; // low usage 3&D / connector

export type ShotFreedom = -1 | 0 | 1; // limited / normal / green light

export type TrainingFocus = 'balanced' | 'shooting' | 'finishing' | 'playmaking' | 'perimeterD' | 'interiorD' | 'rebounding' | 'conditioning';

export interface Contract {
  /** Season (end year, e.g. 2027 = 2026-27) of first salary entry. */
  start: number;
  /** Salary per season in thousands of dollars. */
  salaries: number[];
  rookie?: boolean;
  /** Option on the final season. */
  option?: 'player' | 'team';
  /** Two-way deal: doesn't use a 15-man roster spot and is paid outside the cap and tax. */
  twoWay?: boolean;
}

export interface Injury {
  type: string;
  gamesRemaining: number;
  /** Total games out when it happened, for UI. */
  gamesTotal: number;
  /** Small lasting ratings hit applied on return (major injuries). */
  severity: 'minor' | 'moderate' | 'major' | 'severe';
}

/** Totals for one player, one season, one team (and regular season vs playoffs). */
export interface PlayerStats {
  season: number;
  tid: number;
  playoffs: boolean;
  /** True for real seed seasons imported from Basketball Reference. */
  real?: boolean;
  gp: number;
  gs: number;
  min: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  pm: number; // plus/minus
  // shot zones (simulated seasons only)
  rimM: number;
  rimA: number;
  midM: number;
  midA: number;
  // on-court team context, used for USG/ratings/on-off
  onPoss: number;
  onPtsFor: number;
  onPtsAgainst: number;
  teamFga: number;
  teamFta: number;
  teamTov: number;
  // real advanced numbers (seed seasons only)
  adv?: {
    per: number;
    ts: number;
    usg: number;
    astPct: number;
    trbPct: number;
    stlPct: number;
    blkPct: number;
    tovPct: number;
    ws: number;
    ws48: number;
    obpm: number;
    dbpm: number;
    bpm: number;
    vorp: number;
  };
}

export type MoodLevel = 'ecstatic' | 'happy' | 'content' | 'unhappy' | 'furious';

export interface Mood {
  /** -10..10 composite. */
  score: number;
  ptComponent: number; // playing time vs expectation
  winComponent: number;
  roleComponent: number;
  contractComponent: number;
  /** Minutes per game the player expects, given his standing. */
  expectedMin: number;
  tradeRequest: boolean;
  /** Short reasons for UI. */
  notes: string[];
}

export interface AwardRecord {
  season: number;
  type: string; // 'MVP', 'DPOY', 'All-NBA 1st', 'Champion', 'All-Star', ...
}

export interface RatingsSnapshot {
  season: number;
  ovr: number;
  pot: number;
  r: Ratings;
}

export interface DraftInfo {
  year: number;
  round: number; // 0 = undrafted
  pick: number;
  tid: number | null;
  /** Original team abbrev for real seeded draftees. */
  teamAbbrev?: string;
}

export interface Player {
  pid: number;
  bbrefId?: string;
  /** NBA.com person id, for refreshing real data. */
  nbaId?: number;
  firstName: string;
  lastName: string;
  pos: Pos;
  heightIn: number;
  weightLb: number;
  bornYear: number;
  country: string;
  college: string;
  jersey: string;
  draft: DraftInfo;
  /** Team id. FREE_AGENT, DRAFT_PROSPECT, RETIRED are negative sentinels. */
  tid: number;
  ratings: Ratings;
  ovr: number; // display scale 40-99
  pot: number; // display scale 40-99
  /** Hidden development tendency (-1..1), drives volatility of progression. */
  growth: number;
  injuryProne: number; // 0..1
  ratingsHistory: RatingsSnapshot[];
  contract: Contract;
  stats: PlayerStats[];
  injury: Injury | null;
  injuryCount: number;
  mood: Mood;
  training: TrainingFocus;
  awards: AwardRecord[];
  /** Season he joined current team. */
  joinedSeason: number;
  experience: number; // NBA seasons completed
  retiredSeason?: number;
  hof?: boolean;
  /** Accumulated season wear 0..100 (load management). */
  wear: number;
  /** Games rested via load management this season. */
  restedGames: number;
  /** Real seed season lines retained for calibration and display. */
  real?: boolean;
  /** Draft prospect extras. */
  prospect?: ProspectInfo;
  /** Player's archetype label, recomputed when ratings change. */
  archetype: string;
  /** Playing-style tendencies (multipliers around 1), fitted to real stats for seeded players. */
  tend?: Tendencies;
  /** Free agent asking contract while in FA. */
  asking?: { amount: number; years: number };
  /** Days remaining in which FA will consider offers before re-evaluating. */
  faDays?: number;
}

export interface Tendencies {
  /** How often the offense looks for him. */
  use: number;
  /** Preference for threes over twos. */
  three: number;
  /** Preference for attacking the rim. */
  drive: number;
  /** Preference for passing out of actions. */
  pass: number;
  /**
   * Hidden event multipliers, fitted so a real player reproduces his per-36 box profile in
   * the engine. Visible ratings say how good he is; these absorb role and opportunity
   * (a help-side guard who blocks shots, a center whose teammates crash the glass). 1 = neutral.
   */
  blk?: number;
  stl?: number;
  orb?: number;
  drb?: number;
  tov?: number;
  /** personal fouls */
  pf?: number;
  /** Shot-diet tendencies, fitted to NBA.com shot locations: mid-range preference, corner share of
   * spot-up threes, and self-creation (primary-action weight vs. finishing others' set-ups). */
  mid?: number;
  corner?: number;
  create?: number;
}

export interface ProspectInfo {
  rank: number; // consensus big board rank
  combine?: CombineResults;
  /** Short scouting blurb. */
  blurb: string;
}

export interface CombineResults {
  heightNoShoes: number; // inches
  wingspan: number;
  standingReach: number;
  weight: number;
  maxVert: number;
  laneAgility: number; // seconds
  sprint: number; // 3/4 court seconds
  shootingDrill: number; // makes of 25
}

// ---------------------------------------------------------------- tactics

export type ActionType = 'pnr' | 'iso' | 'post' | 'handoff' | 'motion';
export const ACTIONS: ActionType[] = ['pnr', 'iso', 'post', 'handoff', 'motion'];

export type PnrCoverage = 'drop' | 'switch' | 'hedge' | 'blitz' | 'ice';
export type DefScheme = 'man' | 'zone23' | 'zone32';
export type PressMode = 'none' | 'afterMade' | 'always';
export type StarPlan = 'none' | 'deny' | 'double';

export interface OffenseTactics {
  /** 0..100: 0 = grind every possession, 100 = run-and-gun. */
  pace: number;
  /** 0..100 how hard to push in transition after stops. */
  transition: number;
  /** Action emphasis weights 0..100. */
  actions: Record<ActionType, number>;
  /** 0..100 shot profile: 0 = mid-range friendly, 100 = rim & threes only. */
  threePoint: number;
  /** 0..100 attack the rim vs settle. */
  rimAttack: number;
  /** 0..100 offensive rebounding (vs get back). */
  crashBoards: number;
  /** Hunt the weakest defender with isolations/PnR. */
  huntMismatch: boolean;
  /** Feed whoever is hot. */
  hotHand: boolean;
  roles: Record<number, OffRole>;
  freedom: Record<number, ShotFreedom>;
  /** Preferred PnR screeners, in order (empty = auto). */
  screeners: number[];
}

export interface DefenseTactics {
  scheme: DefScheme;
  pnr: PnrCoverage;
  /** 0..100: 0 = stay home on shooters, 100 = pack the paint. */
  help: number;
  /** 0..100 on-ball pressure / passing-lane denial. */
  pressure: number;
  press: PressMode;
  /** 0..100 transition defense: sprint back (100) vs crash glass (0). */
  getBack: number;
  /** Switch everything 1-4 off ball as well. */
  switchOffBall: boolean;
  /** Plan for the opponent's best player (auto-targets top scorer). */
  starPlan: StarPlan;
  /** Explicit target for star plan; null = auto (opponent top usage). */
  starTarget: number | null;
  /** Manual matchups: opponent pid -> my defender pid (game-specific, optional). */
  matchups: Record<number, number>;
  /** 0..100 foul aggressiveness (physicality). */
  physicality: number;
}

export interface GameManagement {
  /** Foul when up 3 in final ~8 seconds. */
  foulUp3: boolean;
  /** Quick shot for 2-for-1 at end of quarters. */
  twoForOne: boolean;
  /** Intentionally foul when trailing late. */
  foulWhenTrailing: boolean;
  /** Hack-a-player: foul this opponent intentionally (0 = off) when his FT% under threshold. */
  hackThreshold: number;
  /** AI auto-timeouts to stop runs. */
  autoTimeouts: boolean;
  /** Run threshold that triggers an auto-timeout. */
  timeoutRun: number;
  /** Rest starters in garbage time. */
  garbageTime: boolean;
  /** 'aggressive' sits players earlier in foul trouble. */
  foulTrouble: 'loose' | 'standard' | 'strict';
  /** Fatigue (energy %) threshold below which a player is subbed if possible. */
  fatigueSub: number;
}

export interface Rotation {
  /** Ordered depth: first five are starters. */
  order: number[];
  /** Target minutes per pid (sum ~240). */
  minutes: Record<number, number>;
  /** Preferred closing lineup (5 pids or empty = auto best). */
  closers: number[];
  /** Players to rest on the 2nd night of back-to-backs. */
  restB2B: number[];
  /** Hard minute caps (load management). */
  caps: Record<number, number>;
  /** User lock: if false, auto-coach maintains rotation every day. */
  manual: boolean;
}

export interface Tactics {
  offense: OffenseTactics;
  defense: DefenseTactics;
  manage: GameManagement;
  /** Offensive & defensive playbook presets used (labels only). */
  offPreset: string;
  defPreset: string;
  /** If false the auto coach can retune tactics for roster fit. */
  manual: boolean;
}

// ---------------------------------------------------------------- teams

export interface TeamSeason {
  season: number;
  won: number;
  lost: number;
  homeWon: number;
  homeLost: number;
  confWon: number;
  confLost: number;
  divWon: number;
  divLost: number;
  streak: number; // +n wins, -n losses
  lastTen: number[]; // 1 = W, 0 = L
  ptsFor: number;
  ptsAgainst: number;
  poss: number;
  oppPoss: number;
  playoffRound: number; // -1 missed, 0 play-in lost, 1.. round reached, 5 champion
  seed: number | null;
  revenue: number;
  expenses: number;
  payroll: number;
  attendance: number;
  hype: number;
  pop: number;
  playIn?: boolean;
  /** Team totals for advanced team stats. */
  t: TeamTotals;
  o: TeamTotals; // opponent totals
}

export interface TeamTotals {
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
}

export interface Budget {
  coaching: number; // 1..100 -> progression
  health: number; // 1..100 -> injury recovery
  facilities: number; // 1..100 -> attendance/hype, slow-moving
  ticketPrice: number; // dollars
}

export interface Team {
  tid: number;
  abbrev: string;
  region: string;
  name: string;
  colors: [string, string, string];
  conf: 'E' | 'W';
  div: string;
  /** Market size factor ~ metro population in millions. */
  pop: number;
  tactics: Tactics;
  rotation: Rotation;
  strategy: 'contend' | 'retool' | 'rebuild';
  budget: Budget;
  cash: number; // thousands
  hype: number; // 0..1
  /** Coach personality bias for AI tactics. */
  coach: CoachProfile;
  seasons: TeamSeason[];
  /** Dead money from released players: season -> amount. */
  deadMoney: { pid: number; name: string; season: number; amount: number }[];
  /** Contract season the team last used its mid-level exception. */
  mleSeason?: number;
  practice: 'light' | 'normal' | 'intense';
  timeoutsUsedThisGame?: number;
}

export interface CoachProfile {
  name: string;
  offPhilosophy: string;
  defPhilosophy: string;
  /** 0..100 player development skill. */
  development: number;
  /** 0..100 in-game adjustment skill. */
  tactics: number;
}

export interface DraftPick {
  dpid: number;
  season: number; // draft year
  round: 1 | 2;
  originalTid: number;
  tid: number;
  /** Assigned once lottery/order known. */
  pick?: number;
  /** Top-N protected: if it lands in the first N picks of its round, it stays with originalTid (obligation ends). */
  protection?: number;
}

// ---------------------------------------------------------------- games

/** 'cup' is the NBA Cup championship game: it doesn't count in the standings or season stats. */
export type GameType = 'regular' | 'playin' | 'playoffs' | 'allstar' | 'cup';

/** NBA Cup stage of a game: group games and the quarter/semifinals are regular-season games. */
export type CupRound = 'group' | 'qf' | 'sf' | 'final';

export interface ScheduledGame {
  gid: number;
  day: number;
  home: number;
  away: number;
  type: GameType;
  /** Playoff series id. */
  seriesId?: string;
  played?: boolean;
  cup?: CupRound;
}

export interface BoxLine {
  pid: number;
  name: string;
  pos: Pos;
  gs: boolean;
  min: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  pm: number;
  energy: number; // energy at end (0..1)
  dnp?: string;
}

export interface TeamBox {
  tid: number;
  pts: number;
  quarters: number[];
  players: BoxLine[];
  t: TeamTotals;
  poss: number;
  timeoutsLeft: number;
  /** Points per possession and possession counts by finishing play type. */
  playTypes: Record<string, { poss: number; pts: number }>;
  /** Biggest lead, fast break pts, paint pts, second chance, pts off TOs, bench pts. */
  extra: {
    biggestLead: number;
    fastBreak: number;
    paint: number;
    secondChance: number;
    offTov: number;
    bench: number;
  };
}

export interface ShotRecord {
  /** 0 = home, 1 = away. */
  t: 0 | 1;
  pid: number;
  x: number; // feet from basket center along baseline axis (-25..25)
  y: number; // feet from baseline (0..47)
  made: boolean;
  zone: ShotZone;
  q: number;
}

export type ShotZone = 'rim' | 'paint' | 'mid' | 'c3' | 'ab3';

export interface TacticImpact {
  /** Impact key, e.g. 'drop_pullup'. */
  key: string;
  /** Team the effect benefited (0 home, 1 away). */
  t: 0 | 1;
  count: number;
  /** Expected points gained by team t versus a neutral baseline. */
  pts: number;
  /** Most involved players (pid -> count). */
  players: Record<number, number>;
}

export interface LineupStat {
  t: 0 | 1;
  pids: number[];
  poss: number;
  ptsFor: number;
  ptsAgainst: number;
  sec: number;
}

export interface GameResult {
  gid: number;
  season: number;
  day: number;
  type: GameType;
  seriesId?: string;
  cup?: CupRound;
  home: TeamBox;
  away: TeamBox;
  ot: number;
  shots?: ShotRecord[];
  impacts?: TacticImpact[];
  lineups?: LineupStat[];
  /** Score margin flow (home - away) sampled per possession, for charts. */
  flow?: number[];
  /** Index into flow where each period (Q1, Q2, ..., OT) starts. */
  flowPeriods?: number[];
  /** Compact play-by-play for detailed (user) games. */
  pbp?: PbpEntry[];
  /** Player of the game. */
  pog?: number;
  att?: number;
}

export interface PbpEntry {
  q: number;
  clock: number; // seconds remaining in period
  t: 0 | 1 | -1; // team; -1 neutral
  text: string;
  hs: number;
  as: number;
  kind?: 'make' | 'miss' | 'to' | 'foul' | 'sub' | 'timeout' | 'period' | 'other' | 'ft';
}

// ---------------------------------------------------------------- league

export type Phase = 'preseason' | 'regular' | 'playin' | 'playoffs' | 'draftLottery' | 'draft' | 'resign' | 'freeAgency';

export interface PlayoffSeries {
  id: string;
  round: number; // 1..4
  conf: 'E' | 'W' | 'F';
  high: number; // tid higher seed
  low: number;
  highSeed: number;
  lowSeed: number;
  highWins: number;
  lowWins: number;
  winner?: number;
}

export interface PlayInGame {
  id: string; // 'E-78', 'E-910', 'E-8'
  conf: 'E' | 'W';
  home: number;
  away: number;
  winner?: number;
  loser?: number;
}

export interface NewsItem {
  id: number;
  season: number;
  day: number;
  kind: 'trade' | 'signing' | 'injury' | 'award' | 'draft' | 'release' | 'milestone' | 'retire' | 'general';
  text: string;
  tids: number[];
  pids: number[];
}

export interface InboxMessage {
  id: number;
  season: number;
  day: number;
  from: string; // 'Assistant Coach', 'Owner', 'Medical Staff', ...
  subject: string;
  body: string;
  read: boolean;
  /** Optional in-app deep link. */
  link?: string;
  tone?: 'good' | 'bad' | 'neutral' | 'alert';
  /** Big news for the GM: long sims pause for it (trade requests, key long-term injuries, owner verdicts). */
  important?: boolean;
}

export interface SeasonAwards {
  season: number;
  champion?: number;
  runnerUp?: number;
  finalsMvp?: number;
  mvp?: number;
  dpoy?: number;
  roy?: number;
  smoy?: number;
  mip?: number;
  coy?: number; // tid
  allNba: number[][]; // 3 teams of 5
  allDefense: number[][];
  allRookie: number[];
  allStars: { E: number[]; W: number[] };
  allStarMvp?: number;
  cupWinner?: number;
  cupRunnerUp?: number;
  cupMvp?: number;
}

export interface Settings {
  difficulty: 'casual' | 'normal' | 'hard';
  injuries: boolean;
  /** Can the owner fire you? */
  jobSecurity: boolean;
  complexity: 'simple' | 'advanced' | 'expert';
  /** Auto-play speed for live game. */
  liveSpeed: number;
  /** First-run guide dismissed. */
  onboarded?: boolean;
  /** Pause long sims for big news (default on). */
  stopOnNews?: boolean;
}

export interface League {
  id: string;
  name: string;
  version: number;
  created: number;
  userTid: number;
  coachName: string;
  season: number;
  phase: Phase;
  /** Day index within the regular season / postseason calendar. */
  day: number;
  settings: Settings;
  teams: Team[];
  players: Record<number, Player>;
  draftPicks: DraftPick[];
  schedule: ScheduledGame[];
  /** Results for the current and previous season (pruned beyond). */
  games: GameResult[];
  playIn: PlayInGame[];
  playoffs: PlayoffSeries[];
  awards: SeasonAwards[];
  news: NewsItem[];
  inbox: InboxMessage[];
  nextPid: number;
  nextGid: number;
  nextDpid: number;
  nextMsgId: number;
  rng: number; // RNG state
  /** Piecewise mapping from raw composite to 40-99 display scale. */
  ovrScale: { raw: number[]; disp: number[] };
  /** League-wide mean of each attribute among rostered players, held steady year to year so the league neither inflates nor deflates. */
  ratingAnchors?: Partial<Record<RatingKey, number>>;
  /** League-wide spread per attribute at creation (anchorRatings keeps it from widening). */
  ratingSpreads?: Partial<Record<RatingKey, number>>;
  /** Days of the regular season (last scheduled day). */
  regularSeasonDays: number;
  tradeDeadlineDay: number;
  allStarDay: number;
  /** Owner standing 0..100 for job security. */
  ownerMood: { wins: number; playoffs: number; money: number; total: number };
  fired?: boolean;
  /** Free-agency day counter (0..30). */
  faDay: number;
  /** User's draft board ordering (pids). */
  draftBoard?: number[];
  /** Season the league was started. */
  startSeason: number;
  /** Real-life league averages from seed data, for context in UI. */
  realAvgs?: Record<string, number>;
  /** Opponent-specific adjustments for the user's next game against that opponent. */
  gamePlan?: GamePlan | null;
  /** First season of the user's current job (owner grace period); defaults to startSeason. */
  tenureStart?: number;
  /** This season's NBA Cup (absent for leagues whose conferences can't split into groups of five). */
  cup?: CupState | null;
}

export interface CupGroup {
  /** 'East A' ... 'West C'. */
  id: string;
  conf: 'E' | 'W';
  tids: number[];
}

export interface CupTie {
  round: 'qf' | 'sf' | 'final';
  /** 'E' / 'W' for the quarter and semifinals, 'F' for the championship. */
  conf: 'E' | 'W' | 'F';
  /** Better seed (hosts the quarter/semifinal; the final is on a neutral floor). */
  high: number;
  low: number;
  highSeed: number;
  lowSeed: number;
  gid: number;
  day: number;
  winner?: number;
  highPts?: number;
  lowPts?: number;
}

/**
 * The NBA Cup: six groups of five play four group games each on Cup nights in November. Group
 * winners and the best runner-up in each conference reach the knockouts in December. Group,
 * quarterfinal and semifinal games count in the standings; the championship doesn't. Teams that
 * don't reach the knockouts (and quarterfinal losers) get their last games on open dates in the
 * knockout window, so everyone still plays 82.
 */
export interface CupState {
  season: number;
  groups: CupGroup[];
  /** Group-stage nights (season days). */
  nights: number[];
  qfDays: [number, number];
  sfDay: number;
  finalDay: number;
  /** Knockout seeds per conference once the group stage is over: three group winners, then the wild card. */
  seeds?: { E: number[]; W: number[] };
  bracket: CupTie[];
  champion?: number;
  mvp?: number;
}

export interface GamePlan {
  oppTid: number;
  items: { id: string; label: string; patch: { offense?: Partial<OffenseTactics>; defense?: Partial<DefenseTactics>; manage?: Partial<GameManagement> } }[];
}

export const FREE_AGENT = -1;
export const DRAFT_PROSPECT = -2;
export const RETIRED = -3;
export const UNDRAFTED = -4;
