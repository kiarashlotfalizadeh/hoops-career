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
  /** A two-way deal converted to a standard one: the same contract, not a new signing. */
  converted?: boolean;
  /**
   * A signed extension: salaries from the season after this deal's last one. `salaryFor` and
   * `contractExp` count it; at that season's start it becomes the contract (see newSeason).
   */
  next?: { salaries: number[] };
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
  /** Full ratings: only the latest two snapshots keep them (the Ratings tab compares them). */
  r?: Ratings;
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
  /** Hidden development tendency (-1..1): shifts how good his summers are on average (most through 25) and his potential before 26. */
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
  /** The team that last traded him away, and when (`also`: the others that traded him away that season): he can't go back to them that season. */
  tradedFrom?: { tid: number; season: number; also?: number[] };
  /** Signed as a free agent or re-signed: he can't be traded before this season day (NBA: December 15, or three months after signing). */
  tradeLock?: { season: number; day: number };
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
  /** Free-agency days left until his next price cut (see faDay). */
  faDays?: number;
  /** Released in season with guaranteed money left: other teams can claim his contract until `until` (a season day). See resolveWaivers. */
  waivers?: Waivers;
}

export interface Waivers {
  /** The team that released him. */
  from: number;
  /** Season day he clears waivers (and becomes a free agent) unless claimed. */
  until: number;
  /** The contract a claiming team takes over. */
  contract: Contract;
  /** The dead money the release left his old team, which a claim takes off its books. */
  dead: { season: number; amount: number }[];
  /** The user has put in a claim. */
  claim?: boolean;
}

/** The user's offer to a top free agent in the summer: he weighs it against other teams' on `decideDay` (a faDay). See userBid. */
export interface FaBid {
  pid: number;
  amount: number;
  years: number;
  /** faDay it was made (a raised offer keeps the first one's day and decision day). */
  day: number;
  decideDay: number;
  /** How it is paid for: cap space is held for it, the mid-level is reserved for it. */
  route?: 'space' | 'mle' | 'min';
  /** Salary the user signed over the cap (minimum and mid-level deals) while it was pending: those could have come after it, so they don't count against it. */
  slack?: number;
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
  /** Crunch-time go-to player (pid): in the last two minutes of a close fourth quarter or overtime the ball finds him more. */
  goTo?: number | null;
  /** After-timeout play: the first action of the next half-court trip after one of your timeouts. */
  ato?: ActionType | null;
  /** Hack-a-player targets (opponent pids, for game plans): fouled intentionally while on the floor, whatever their free-throw percentage. */
  hackTargets?: number[];
  /** Quarter hack-a-player starts in, by threshold or target (default 1; overtime counts as the 4th). */
  hackFromQ?: number;
  /** The assistant adjusts at breaks in simmed games, as AI coaches do. */
  assistantAdjusts?: boolean;
}

/** When a situational plan applies: every condition given must hold. Overtime counts as the 4th quarter. */
export interface SituationTrigger {
  fromQ?: number;
  untilQ?: number;
  /** At most this many seconds left in the period. */
  maxClock?: number;
  /** The team's lead (negative when trailing) is at least / at most this. */
  minLead?: number;
  maxLead?: number;
  /** Only while the second unit plays: three or more of the five on the floor didn't start. */
  benchUnit?: boolean;
}

/** A change of plan for a game situation ("protect a lead", "second unit"), applied on top of the base tactics. */
export interface SituationalPlan {
  id: string;
  label: string;
  enabled: boolean;
  when: SituationTrigger;
  patch: TacticsPatch;
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
  /** The saved playbook (League.playbooks) these tactics were loaded from or saved as, if any. */
  playbook?: { id: string; name: string } | null;
  /** Situational plans (at most four): the first enabled one whose trigger matches is played on top of the rest. */
  situations?: SituationalPlan[];
}

/**
 * One of the coach's saved playbooks (League.playbooks, see src/core/sim/playbooks.ts): his tactics
 * without the game-specific parts (matchups, the star target). Roles, shot freedom and screeners
 * are kept by player and only come back for players still on the roster.
 */
export interface SavedPlaybook {
  id: string;
  name: string;
  /** When it was saved or last overwritten. */
  saved: { season: number; day: number };
  offense: Omit<OffenseTactics, 'roles' | 'freedom' | 'screeners'>;
  defense: Omit<DefenseTactics, 'matchups' | 'starTarget'>;
  manage: GameManagement;
  offPreset: string;
  defPreset: string;
  roles?: Record<number, OffRole>;
  freedom?: Record<number, ShotFreedom>;
  screeners?: number[];
  /** Other parts of the tactics (features newer than this type), kept as they were saved. */
  extra?: Record<string, unknown>;
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
  playoffRound: number; // -1 missed (play-in losers too), 0 still in the play-in, 1.. round reached, 5 champion
  seed: number | null;
  revenue: number;
  expenses: number;
  payroll: number;
  attendance: number;
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
  /** Players whose jersey numbers were settled at the team's last game: they keep them over arrivals. */
  numbered?: number[];
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
  /** The team that last traded it away, and when (`also`: the others that traded it away that season): it can't go back to them that season. */
  tradedFrom?: { tid: number; season: number; also?: number[] };
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
  /** Coaches' in-game adjustments (user games only). */
  adjustments?: GameAdjustment[];
  /** Player of the game. */
  pog?: number;
  att?: number;
  /** The user's regular-season games: where his team stood in its conference going in and coming out. */
  stakes?: { tid: number; before: StandingLine; after: StandingLine };
}

/** A team's place in its conference: rank, games behind the leader, and a clinch mark (x playoffs, p play-in, e eliminated). */
export interface StandingLine {
  rank: number;
  gb: number;
  clinched?: 'x' | 'p' | 'e';
}

/** A coach's in-game change of plan (at a break or a timeout). */
export interface GameAdjustment {
  /** Team that adjusted: 0 home, 1 away. */
  t: 0 | 1;
  q: number;
  /** Seconds left in the period. */
  clock: number;
  /** What changed, e.g. 'hedges ball screens instead of dropping'. */
  text: string;
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
  /** 'rumor': who is listening on a player before the trade deadline, and who has called. */
  kind: 'trade' | 'signing' | 'injury' | 'award' | 'draft' | 'release' | 'milestone' | 'retire' | 'general' | 'rumor';
  text: string;
  tids: number[];
  pids: number[];
}

/** A kind of roster move in the transaction log. */
export type TxnKind = 'trade' | 'sign' | 'resign' | 'extend' | 'release' | 'waive' | 'claim' | 'buyout' | 'twoWay' | 'convert' | 'renounce' | 'option' | 'draft';

/** What one team sent in a trade, as it was: names and pick labels at the time. */
export interface TxnSide {
  tid: number;
  players: { pid: number; name: string }[];
  picks: string[];
}

/**
 * One roster move in the transaction log (see src/core/league/transactions.ts). Names and pick
 * labels are frozen when it happens, so it reads the same after the player retires and his record
 * is compacted away, or the pick becomes a player.
 */
export interface Txn {
  id: number;
  season: number;
  day: number;
  phase: Phase;
  kind: TxnKind;
  /** The teams in it: the one that made the move first (a waiver claim: the claiming team, then the one that waived him). */
  tids: number[];
  /** Trades only: what each team sent. */
  sides?: TxnSide[];
  pid?: number;
  name?: string;
  /**
   * $K: the first-year salary of a signing, re-signing, extension, two-way deal, conversion or
   * claim (this season's); the dead money a release leaves; what a buyout gave back; the salary of
   * an option year.
   */
  amount?: number;
  years?: number;
  /** An option: 'exercised' / 'declined' (team option) or 'opted in' / 'opted out' (player option); a draft pick: its overall number ('#5'). */
  note?: string;
  /** The user's team was in it: kept for good, even after he moves on to another team. */
  user?: true;
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
  /** The AI trade offer (Proposal id) this message carries: the inbox offers Accept and Review while it stands. */
  proposal?: number;
}

/**
 * A trade an AI team offers the user. Side a of `offer` is the user's team, side b the AI team.
 * 'buy': it wants one of the user's players; 'sell': a rebuilder offers a veteran; 'dump': a
 * taxpayer attaches picks to a contract it wants off its books; 'pick': it wants the user's pick
 * on draft night. The AI accepted it when it was made; it stands until `expires` (a day of
 * `season`) or until it stops being valid.
 */
export interface Proposal {
  id: number;
  tid: number;
  offer: { a: { tid: number; pids: number[]; dpids: number[] }; b: { tid: number; pids: number[]; dpids: number[] } };
  kind: 'buy' | 'sell' | 'dump' | 'pick';
  /** The AI GM's pitch. */
  note: string;
  season: number;
  day: number;
  expires: number;
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
  /** The Coach of the Year by name, as he was when he won it (coaches change teams). */
  coyCoach?: string;
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
  /** Where a live game stops for a break with a period report (default 'quarters'). */
  liveBreaks?: 'quarters' | 'half' | 'off';
  /** Live games only draw the key plays, fast-forwarding the rest (default off). */
  liveKeyPlays?: boolean;
  /** First-run guide dismissed. */
  onboarded?: boolean;
  /** Pause long sims for big news (default on). */
  stopOnNews?: boolean;
  /** Home's Watch & coach opens the pre-game screen first (default on). */
  pregame?: boolean;
  /** Draft night stops before every AI pick, so picks can be traded for on the clock (default off). */
  draftPause?: boolean;
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
  /** The user's pending offers to top free agents (summer free agency only). */
  faBids?: FaBid[];
  /** User's draft board ordering (pids). */
  draftBoard?: number[];
  /** Season the league was started. */
  startSeason: number;
  /** The user's game plans by opponent tid (opponent-specific adjustments, see GamePlan). */
  gamePlans?: Record<number, GamePlan>;
  /** The coach's saved playbooks (at most 12, names unique): his, so they go with him to another team. */
  playbooks?: SavedPlaybook[];
  /** First season of the user's current job (owner grace period); defaults to startSeason. */
  tenureStart?: number;
  /** This season's NBA Cup (absent for leagues whose conferences can't split into groups of five). */
  cup?: CupState | null;
  /** The user's latest post-game press conference: the game and the answer he gave (one per game). */
  press?: { gid: number; choice: PressChoice };
  /** AI trade offers to the user that are still open. */
  proposals?: Proposal[];
  nextProposalId?: number;
  /** The user's players AI teams don't ask for (in offers, "what would make this work?" or counters). */
  untouchable?: number[];
  /** The transaction log, oldest first: every trade and the user's moves for good, other teams' moves for two seasons (see pruneTransactions). */
  transactions?: Txn[];
  /** Id of the next transaction logged. */
  nextTxnId?: number;
}

/** Post-game press conference answers: credit the group, praise the player of the game, challenge the effort (after a loss). */
export type PressChoice = 'group' | 'pog' | 'challenge';

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

/**
 * A change to a team's tactics: fixed values (action weights one by one, so two patches that boost
 * different actions both apply) and `nudge`, relative changes clamped to 0..100 and applied after
 * them, so a counter like "more pick-and-roll" builds on whatever playbook it is applied to.
 */
export interface TacticsPatch {
  offense?: Partial<Omit<OffenseTactics, 'actions'>> & { actions?: Partial<Record<ActionType, number>> };
  defense?: Partial<DefenseTactics>;
  manage?: Partial<GameManagement>;
  nudge?: {
    offense?: Partial<Record<'pace' | 'transition' | 'threePoint' | 'rimAttack' | 'crashBoards', number>>;
    actions?: Partial<Record<ActionType, number>>;
    defense?: Partial<Record<'help' | 'pressure' | 'getBack' | 'physicality', number>>;
  };
}

export interface GamePlanItem {
  id: string;
  label: string;
  /** Items in the same group replace each other (one ball-screen coverage, one star plan...); defaults to the id. */
  group?: string;
  patch: TacticsPatch;
  /** Why it's in the plan, from the scouting numbers. */
  evidence?: string;
}

/** How long a game plan lasts: the next game against that opponent, the current playoff series, or the rest of the season. */
export type PlanScope = 'next' | 'series' | 'season';

/** The user's plan for one opponent (see src/core/league/gamePlans.ts). */
export interface GamePlan {
  oppTid: number;
  items: GamePlanItem[];
  /** Defaults to 'next'. */
  scope?: PlanScope;
  /** The playoff series a 'series' plan was made for. */
  seriesId?: string;
  /** Planned matchups against this opponent: their pid -> my defender pid. */
  matchups?: Record<number, number>;
  note?: string;
}

export const FREE_AGENT = -1;
export const DRAFT_PROSPECT = -2;
export const RETIRED = -3;
