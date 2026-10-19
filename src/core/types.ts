// Core league data model. Everything here is plain, structured-clone-safe data so
// the whole league can be persisted to IndexedDB and shipped to web workers.
import type { OppPlan } from './ai/opponentPlan';
import type { CoachRecord } from './league/coaches';
import type { JobOffer } from './league/jobs';
import type { GuideStep } from './league/agenda';
import type { OwnerGoals, OwnerReview } from './league/ownerGoals';
import type { HighRow, RecStat, RecordBook } from './league/records';
import type { PossLog } from './sim/log';

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
  /** A qualifying offer he took at the close of free agency: when it runs out he is unrestricted (see rfa.ts). */
  qualifying?: boolean;
  /**
   * A 10-day contract (see tenDay.ts): its one salary is the minimum prorated for its days, paid when
   * he signs; it ends by itself when season day `until` begins. `hardship`: signed beyond 15 players
   * under the hardship exception.
   */
  tenDay?: { until: number; hardship?: boolean };
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
    /** Dunks & Threes EPM (offense, defense, total), the season's across his teams, for seeds built with it. */
    oepm?: number;
    depm?: number;
    epm?: number;
  };
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
  training: TrainingFocus;
  awards: AwardRecord[];
  /** Season he joined current team. */
  joinedSeason: number;
  /**
   * The first season of his Bird clock with his team: his first there as a free agent signing, a
   * draftee or a claim (a trade keeps it). Absent, joinedSeason stands in (see birdSeasons).
   */
  birdSince?: number;
  /** The team that last released (waived or bought out) him, and the season: it can't sign him again that season. */
  released?: { tid: number; season: number };
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
  /** Restricted free agency: his team extended a qualifying offer as his deal ran out, so it can match any offer sheet he signs (see rfa.ts). */
  rfa?: Rfa;
  /** His contract talks with the user's team (see negotiation.ts): cleared when he signs anywhere. */
  talks?: Talks;
  /** The 10-day contracts he has signed this season, by team (tid -> count): two at most with each (see tenDay.ts). */
  tenDays?: { season: number; by: Record<number, number> };
  /** His regular-season career highs in this league (see records.ts): the whole career's when it's all on record. */
  highs?: Partial<Record<RecStat, HighRow>>;
  /** The number he last wore for each team that numbered him (tid -> number), so a franchise retiring it after he moved on knows which (see jerseys.ts); dropped when he retires. */
  jerseys?: Record<number, string>;
}

/** A contract offer in talks with a player: first-season salary ($K), length, and an option on the final season. */
export interface TalkTerms {
  amount: number;
  years: number;
  option?: 'player' | 'team';
}

/**
 * The user's contract talks with one player (see src/core/league/negotiation.ts): his ask is open,
 * his walk-away price isn't. Offers below it get a counter and cost patience; out of patience, talks
 * break down for a while (in the re-sign period his ask goes up instead).
 */
export interface Talks {
  /** The user's team when they started. */
  tid: number;
  /** The contract season they're about (next season's from the draft through free agency). */
  season: number;
  /** A contract as a free agent or an offer sheet ('fa'), re-signing his own player ('resign'), or an extension ('extend'). */
  kind: 'fa' | 'resign' | 'extend';
  /** The stretch of the calendar they're in: patience and his counter start over in the next one. */
  period: 'resign' | 'fa' | 'season';
  /** Offers below his price he'll still hear before he breaks off talks. */
  patience: number;
  /** His standing counter-offer: an offer on exactly these terms, for at least this much, signs him. */
  counter?: TalkTerms;
  /** Lowballs he has heard (offers under 85% of his ask for the terms). */
  lowballs?: number;
  /** Interest in the team lost to lowballs: comes off his appeal (see teamAppeal) for the season. */
  sour?: number;
  /** Talks broke down: he hears no offer before this season and day (the next season's day 0: the rest of the summer). */
  closed?: { season: number; day: number };
  /** Re-sign period, talks broke down: his ask went up by this factor and he takes nothing less. */
  firm?: number;
}

/**
 * A restricted free agent's rights (see src/core/league/rfa.ts). Set when his team extends the
 * qualifying offer in the re-sign period (he is still on its roster then); from the day free
 * agency opens he is a free agent until he re-signs, signs an offer sheet that isn't matched, or
 * takes the qualifying offer as the market closes.
 */
export interface Rfa {
  /** The team holding his rights: it can re-sign him with Bird rights or match an offer sheet. */
  tid: number;
  /** The qualifying offer: one season at this salary ($K, next season's money). */
  qo: number;
  /** His cap hold on that team from the day the market opens (the larger of the QO and his asking price then) until he signs or the QO is withdrawn. */
  hold?: number;
  /** An offer sheet he signed with another team, waiting for his team's decision. */
  sheet?: OfferSheet;
}

/** Another team's offer sheet for a restricted free agent: his team matches it and keeps him on exactly these terms, or he joins that team on them. */
export interface OfferSheet {
  /** The team that signed him to it. */
  tid: number;
  /** First-season salary ($K, next season's money; the usual 5% raises follow) and length: 2-5 seasons, no options. */
  amount: number;
  years: number;
  /** How the offering team pays for it: its cap space or exception stays held for it until his team decides. */
  route: SigningRoute;
  /** The free-agency day (faDay) it was signed on, and the last one his team can match on: unmatched at the end of that day, he joins the other team. */
  day: number;
  until: number;
}

export interface Waivers {
  /** The team that released him. */
  from: number;
  /** Season day he clears waivers (and becomes a free agent) unless claimed. */
  until: number;
  /** The contract a claiming team takes over. */
  contract: Contract;
  /** The dead money the release left his old team (stretched or not), which a claim takes off its books. */
  dead: { season: number; amount: number; stretched?: true }[];
  /** The user has put in a claim. */
  claim?: boolean;
  /** His trade lock when he was waived: a claiming team takes it over with the contract. */
  lock?: { season: number; day: number };
}

/**
 * How a team pays a free agent: his minimum, cap space, or an exception over the cap: the mid-level
 * (the taxpayer mid-level for a team it takes past the first apron), the room exception (instead of
 * the mid-level, once a team has used cap space that season) or the bi-annual (see contracts.ts).
 */
export type SigningRoute = 'min' | 'space' | 'mle' | 'tmle' | 'room' | 'bae';

/** The user's offer to a top free agent in the summer: he weighs it against other teams' on `decideDay` (a faDay). See userBid. */
export interface FaBid {
  pid: number;
  amount: number;
  years: number;
  /** faDay it was made (a raised offer keeps the first one's day and decision day). */
  day: number;
  decideDay: number;
  /** How it is paid for: cap space is held for it, an exception (mid-level, room or bi-annual) is reserved for it. */
  route?: SigningRoute;
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
/** Man-to-man, the zones, and the junk defenses: box-and-one (four in a 2-2 zone, one chaser) and triangle-and-two (three in a zone, two chasers). */
export type DefScheme = 'man' | 'zone23' | 'zone32' | 'box1' | 'tri2';
export type PressMode = 'none' | 'afterMade' | 'always';
export type StarPlan = 'none' | 'deny' | 'double';
/**
 * A scouting-report instruction for guarding one opponent: go under screens on him, run him off
 * the line (top-lock), sag off him into the paint, or get physical with him.
 */
export type PlayerDefense = 'under' | 'tight' | 'sag' | 'body';
export const PLAYER_DEFENSES: PlayerDefense[] = ['under', 'tight', 'sag', 'body'];

/**
 * A named offensive set (see src/core/sim/sets.ts): a specific way of running one of the engine's
 * actions for one player and one look. The clear-out isolation is the isolation call, not one of these.
 */
export type SetId = 'spain' | 'horns' | 'floppy' | 'elevator' | 'hammer' | 'chicago' | 'postSplit';
export const SET_IDS: SetId[] = ['spain', 'horns', 'floppy', 'elevator', 'hammer', 'chicago', 'postSplit'];

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
  /**
   * Attack one of tonight's opponents (pid, game-specific): while he's on the floor the offense runs
   * its isolations, post-ups and ball screens at the player he guards, at some cost in ball movement.
   */
  huntTarget?: number | null;
  /** Feed whoever is hot. */
  hotHand: boolean;
  roles: Record<number, OffRole>;
  freedom: Record<number, ShotFreedom>;
  /** Preferred PnR screeners, in order (empty = auto). */
  screeners: number[];
  /**
   * The set package (the user's only, at most four): the half court mixes these sets in now and then
   * when the players on the floor fit them. AI coaches run none.
   */
  sets?: SetId[];
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
  /**
   * Junk defenses: the opponents the chasers face-guard, in order (game-specific). A box-and-one
   * chases the first, a triangle-and-two the first two; anyone missing (none named, or on the bench)
   * is their main creator on the floor, picked as the star plan picks one.
   */
  chase?: number[];
  /** Scouting-report instructions by opponent pid (game-specific). */
  playerD?: Record<number, PlayerDefense>;
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
  /** After-timeout play: the first action (or a set) of the next half-court trip after one of your timeouts. */
  ato?: ActionType | SetId | null;
  /** The player the after-timeout set (or isolation) is run for; absent or off the floor: the best fit there. */
  atoPid?: number | null;
  /** Hack-a-player targets (opponent pids, for game plans): fouled intentionally while on the floor, whatever their free-throw percentage. */
  hackTargets?: number[];
  /** Quarter hack-a-player starts in, by threshold or target (default 1; overtime counts as the 4th). */
  hackFromQ?: number;
  /** The assistant adjusts at breaks in simmed games, as AI coaches do. */
  assistantAdjusts?: boolean;
  /**
   * Foul to give: when they have the ball for a period's last shot (3 to 8 seconds left; in the 4th
   * quarter and overtime only when tied or up by three or less) and a foul won't put them in the
   * bonus, foul at once so they inbound with less time. Off unless the coach turns it on.
   */
  foulToGive?: boolean;
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
  offense: Omit<OffenseTactics, 'roles' | 'freedom' | 'screeners' | 'huntTarget'>;
  defense: Omit<DefenseTactics, 'matchups' | 'starTarget' | 'chase' | 'playerD'>;
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
  /** Cash received in trades this season ($K): booked as revenue, but not local revenue that revenue sharing evens out. */
  cashIn?: number;
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
  /** Dead money from released players: season -> amount (`stretched`: spread by the stretch provision, see stretchDeadMoney). */
  deadMoney: { pid: number; name: string; season: number; amount: number; stretched?: true }[];
  /** Contract season the team last used its mid-level exception. */
  mleSeason?: number;
  /** Contract season the team last signed a free agent with cap space: no mid-level that season, the room exception instead. */
  spaceSeason?: number;
  /** Contract season the team last used its room exception. */
  roomSeason?: number;
  /** Contract season the team last used its bi-annual exception (not two seasons running). */
  baeSeason?: number;
  /** Contract season the team used the taxpayer mid-level exception (instead of the mid-level: one or the other). */
  taxMleSeason?: number;
  /**
   * Traded player exceptions (see executeTrade): salary it sent out over the cap beyond what it took
   * back, which it can absorb salary into for a year from the trade (`season` and `day`: when).
   */
  tpes?: { amount: number; season: number; day: number }[];
  /** Players whose jersey numbers were settled at the team's last game or arrival (see numberTeam): they keep them over arrivals. */
  numbered?: number[];
  /**
   * Numbers the franchise retired for its legends, oldest first (see jerseys.ts): nobody who joins
   * it wears one again. The name is frozen, so a banner reads the same after his record is gone.
   */
  retired?: RetiredNumber[];
  practice: 'light' | 'normal' | 'intense';
  timeoutsUsedThisGame?: number;
  /** Cash sent and received in trades in one contract season ($K), each held to CASH_PCT of the cap (see cashRoom). */
  cashTrades?: { season: number; sent: number; received: number };
}

/** A number a franchise retired: the legend who wore it there and the season he retired. */
export interface RetiredNumber {
  jersey: string;
  pid: number;
  name: string;
  season: number;
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
  /**
   * A swap right riding on this first: the dpid of another team's first in the same draft that its
   * holder may take instead, if that one lands higher (that pick is "subject to a swap"). It goes
   * with this pick when it's traded and is settled when the lottery sets the order (see resolveSwaps).
   */
  swap?: number;
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
  /** Game seconds played at each flow sample (games kept in detail; absent in older saves): the win-probability chart's clock. */
  flowT?: number[];
  /** The side (0 home, 1 away) with the first possession of each period, in flowPeriods order: possessions alternate within a period. */
  flowPoss?: (0 | 1)[];
  /** The user's games: the projected home margin at tip-off (the preview's projection, home court included), which win probability starts from. */
  edge?: number;
  /** Compact play-by-play for detailed (user) games. */
  pbp?: PbpEntry[];
  /** Coaches' in-game adjustments (user games only). */
  adjustments?: GameAdjustment[];
  /** The other coach's game plan against the user's team, when he brought one (user games only): what he changed at tip-off, e.g. 'hedges ball screens'. */
  oppPlan?: string[];
  /** Player of the game. */
  pog?: number;
  /** The sets each side ran (and clear-out isolations called), when any were: only the user's team runs them. */
  sets?: SetStat[];
  att?: number;
  /** The user's regular-season games: where his team stood in its conference going in and coming out. */
  stakes?: { tid: number; before: StandingLine; after: StandingLine };
  /** The user's games: the keys to the game set before it (see analysis/keys.ts) and how each went. */
  keys?: KeyGrade[];
  /**
   * The user's games, for the recap's quotes (see recapFacts): his players hurt in it (empty: none),
   * and the winner's lowest chance once it was under way, when that fell below his chance at tip-off.
   * Older results have neither (the quotes read the play-by-play and the flow then).
   */
  hurt?: number[];
  wpLow?: number;
  /** The user's live games: his tactics changes, substitutions and timeouts, and the scoring around each (see analysis/moves.ts). */
  moves?: CoachMove[];
}

/** Trips and points for each side over a stretch of a game, and for what a move was aimed at. */
export interface MoveTally {
  us: { poss: number; pts: number };
  them: { poss: number; pts: number };
  /** The play types or the one player of theirs a move was aimed at. */
  focus?: { poss: number; pts: number };
}

/** One of the coach's moves in a live game, and the scoring while it was in effect against the stretch before it. */
export interface CoachMove {
  kind: 'tactics' | 'sub' | 'timeout';
  q: number;
  /** Seconds left in the period. */
  clock: number;
  /** "Pick-and-roll coverage: Drop → Hedge", "Caruso in for Mitchell", "Timeout". */
  text: string;
  /** The end of the floor it's about. */
  end: 'def' | 'off' | 'both';
  /** The staff made it. */
  by?: 'staff';
  /** One of theirs it was aimed at. */
  pid?: number;
  /** The play it was aimed at, a few words ("pick-and-roll", "transition"). */
  aim?: string;
  before: MoveTally;
  after: MoveTally;
}

/** A number a key to the game is about (see analysis/keys.ts): a team's, or one player's points. */
export type KeyStat = 'orb' | 'tov' | 'tpm' | 'fta' | 'fastBreak' | 'paint' | 'ast' | 'pts';

/** One key to the game as it went (GameResult.keys). */
export interface KeyGrade {
  id: string;
  /** "Keep them off the glass". */
  title: string;
  /** "Hold BOS to 10 offensive rebounds or fewer". */
  goal: string;
  dir: 'max' | 'min';
  target: number;
  /** The number on the night (null: the player it was about didn't play). */
  value: number | null;
  /** Null when it didn't apply. */
  met: boolean | null;
  /** The number is a percentage (a share of the misses on the offensive glass). */
  pct?: true;
}

/** One set's night (GameResult.sets): how often a side ran it, the points those possessions scored, and the run the defense was on it by. */
export interface SetStat {
  /** 0 home, 1 away. */
  t: 0 | 1;
  /** A set, or 'iso' for clear-out isolations called for a player. */
  id: SetId | 'iso';
  runs: number;
  pts: number;
  /** The run on which the defense's read had taken a real share of its look away (see READ_ON_IT in sets.ts), if it got there. */
  readAt?: number;
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
  /** 'rumor': who is listening on a player before the trade deadline, and who has called. 'coach': a head coach fired or hired (see coaches.ts). */
  kind: 'trade' | 'signing' | 'injury' | 'award' | 'draft' | 'release' | 'milestone' | 'retire' | 'general' | 'rumor' | 'record' | 'coach';
  text: string;
  tids: number[];
  pids: number[];
}

/**
 * A kind of roster move in the transaction log. 'swap': a pick swap exercised when the lottery set
 * the order. Restricted free agency: 'qualify' (a qualifying offer extended, withdrawn or taken),
 * 'offerSheet' (signed with another team) and 'match' (his team matched it, or declined and he
 * joined the other team). 'tenDay': a 10-day contract signed (or, for the user's team, ended).
 */
export type TxnKind =
  | 'trade'
  | 'swap'
  | 'sign'
  | 'resign'
  | 'extend'
  | 'release'
  | 'waive'
  | 'claim'
  | 'buyout'
  | 'twoWay'
  | 'convert'
  | 'renounce'
  | 'option'
  | 'draft'
  | 'qualify'
  | 'offerSheet'
  | 'match'
  | 'tenDay';

/** What one team sent in a trade (or gave up in an exercised swap), as it was: names and pick labels at the time. */
export interface TxnSide {
  tid: number;
  players: { pid: number; name: string }[];
  picks: string[];
  /** Drafts in which it gave the other team the right to swap first-round picks. */
  swaps?: number[];
  /** Cash it sent ($K). */
  cash?: number;
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
   * $K: the first-year salary of a signing, re-signing, extension, two-way deal, conversion,
   * claim, offer sheet or match (this season's); the dead money a release leaves; what a buyout
   * gave back; the salary of an option year or a qualifying offer.
   */
  amount?: number;
  years?: number;
  /**
   * An option: 'exercised' / 'declined' (team option) or 'opted in' / 'opted out' (player option);
   * a draft pick: its overall number ('#5'); a qualifying offer: 'extended' / 'withdrawn' /
   * 'accepted'; a match (tids: his team, then the offering team): 'matched' / 'declined'; a
   * release, waiver or buyout: 'stretched' (`years`: the seasons its dead money is spread over); a
   * 10-day contract: 'second' (his second with the team), 'hardship', 'ended'.
   */
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
  /** What an AI trade pitch is about ("sell:812", "dump:14"), so the same pitch rests a while and replaces its earlier mail. */
  pitch?: string;
  /** The user's restricted free agent (pid) whose offer sheet this message is about: the inbox offers Match and Let him go while it stands. */
  sheet?: number;
  /** The user's player (pid) whose 10-day contract is ending: the inbox offers a second 10-day, the rest of the season or letting him go while it runs. */
  tenDay?: number;
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
  /** All-Star Saturday's contests (see allStarSaturday.ts), each field in its final order: the winner first. */
  saturday?: { three: ThreeShooter[]; dunk: Dunker[] };
  cupWinner?: number;
  cupRunnerUp?: number;
  cupMvp?: number;
}

/** A Three-Point Contest shooter's day: his name and team as they were, and his scores (0-40 a round). */
export interface ThreeShooter {
  pid: number;
  name: string;
  tid: number;
  r1: number;
  /** The final's score, for the three who reached it. */
  final?: number;
  /** Shoot-off racks (0-6 each) that broke a tie for a place in the final, or for the title. */
  r1Off?: number[];
  finalOff?: number[];
}

/** One dunk: five judges' 6-10s added up (30-50), what it was, and whether he finished it in his tries. */
export interface Dunk {
  score: number;
  text: string;
  miss?: true;
}

/** A Slam Dunk Contest dunker's day: two dunks in the first round, two more for the two who reached the final, and any dunk-offs. */
export interface Dunker {
  pid: number;
  name: string;
  tid: number;
  r1: Dunk[];
  final?: Dunk[];
  r1Off?: Dunk[];
  finalOff?: Dunk[];
}

export interface Settings {
  difficulty: 'easy' | 'normal' | 'hard';
  injuries: boolean;
  /** Can the owner fire you? */
  jobSecurity: boolean;
  /** Auto-play speed for live game. */
  liveSpeed: number;
  /** Where a live game stops for a break with a period report (default 'quarters'). */
  liveBreaks?: 'quarters' | 'half' | 'off';
  /** Live games only draw the key plays, fast-forwarding the rest (default off). */
  liveKeyPlays?: boolean;
  /** Pause long sims for big news (default on). */
  stopOnNews?: boolean;
  /** Watch & coach (the Continue bar on game day) opens the pre-game screen first (default on). */
  pregame?: boolean;
  /** Big moments (a clinch, a title, your draft pick, a big signing, an award) take the screen for a moment (default on). */
  moments?: boolean;
  /** Draft night stops before every AI pick, so picks can be traded for on the clock (default off). */
  draftPause?: boolean;
  /** Live games show win probability: on the scorebug, in the box score's Flow tab and the period report (default on). */
  liveWinProb?: boolean;
  /**
   * Live games: whether the staff makes its in-game tactics changes itself ('auto') or brings each one
   * to you ('ask', the default). Subs and timeouts stay yours either way.
   */
  liveStaff?: 'ask' | 'auto';
  /** Live games on a phone held upright: the court at full size ('court') or smaller, for more of the bench under it ('bench'). */
  liveView?: 'court' | 'bench';
  /** Live games open with the starting lineups on the court before the tip (default on). */
  liveIntro?: boolean;
  /** Live games show the night's other scores as they go (default on). */
  liveScores?: boolean;
  /** Teaching for new coaches: the first-week guide on Today, its welcome mail and Today's glossary link (default on; every "?" and glossary word stays). */
  teaching?: boolean;
  /** God mode: the in-game editor for players and teams, created players and forced trades (default off; see godMode.ts). */
  godMode?: boolean;
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
  /**
   * The owner's standing for job security (−1..1, shown ×100): `total` is the running average of the
   * seasons' grades (see ownerEvaluation), the others the running averages of the goals behind it (wins,
   * the postseason, money, and `youth`, the development goals, since a season had one).
   */
  ownerMood: { wins: number; playoffs: number; money: number; total: number; youth?: number };
  /** The owner's goals for the user's season, set on opening night (or from the day he took over mid-season): see ownerGoals.ts. */
  ownerGoals?: OwnerGoals;
  /** The owner's reviews of the user's last seasons, oldest first (at most REVIEWS_KEPT). */
  ownerReviews?: OwnerReview[];
  fired?: boolean;
  /** Free-agency day counter (0..30). */
  faDay: number;
  /** The user's pending offers to top free agents (summer free agency only). */
  faBids?: FaBid[];
  /** User's draft board ordering (pids). */
  draftBoard?: number[];
  /** Season the league was started. */
  startSeason: number;
  /**
   * A real league whose seed carried every real regular season from this one on (SeedData.careersFrom):
   * a real veteran's whole NBA career is on record. Absent for a fictional league and for one seeded
   * with only the three seasons his ratings come from.
   */
  careersFrom?: number;
  /** The user's game plans by opponent tid (opponent-specific adjustments, see GamePlan). */
  gamePlans?: Record<number, GamePlan>;
  /** The coach's saved playbooks (at most 12, names unique): his, so they go with him to another team. */
  playbooks?: SavedPlaybook[];
  /** First season of the user's current job (owner grace period); defaults to startSeason. */
  tenureStart?: number;
  /** This season's NBA Cup (absent for leagues whose conferences can't split into groups of five). */
  cup?: CupState | null;
  /** AI trade offers to the user that are still open. */
  proposals?: Proposal[];
  nextProposalId?: number;
  /** The user's players AI teams don't ask for (in offers, "what would make this work?" or counters). */
  untouchable?: number[];
  /** The transaction log, oldest first: every trade and the user's moves for good, other teams' moves for two seasons (see pruneTransactions). */
  transactions?: Txn[];
  /** Id of the next transaction logged. */
  nextTxnId?: number;
  /** The user's live game in progress, journaled as it's played so it survives the app being closed. */
  live?: LiveJournal;
  /**
   * The highlights of the user's latest live game (`gid`): the possessions the reel shows, with the
   * score each started from, kept so its game report can play them; the next live game replaces them.
   */
  reel?: { gid: number; plays: { log: PossLog; before: [number, number] }[] };
  /**
   * Game-time decisions for the user's next game (`gid`): questionable players he cleared to play
   * (see isQuestionable). Cleared when that game is played or its day has passed.
   */
  gameTime?: { gid: number; play: number[] };
  /** The record book: the best single-game performances since the league began, the league's and each franchise's (see records.ts). */
  records?: RecordBook;
  /** Every head coach the league has had, the user among them, with his jobs (see coaches.ts): the coaching carousel and coach histories. */
  coaches?: CoachRecord[];
  /**
   * The user's team's playoff and title odds this regular season, a point a week (see recordTrail in
   * analysis/odds.ts): [day, playoffs, title], the chances in tenths of a percent. A new season or
   * team starts it again.
   */
  oddsTrail?: { season: number; tid: number; pts: [number, number, number][] };
  /** Teams that want the user as head coach this summer (see jobs.ts): from the carousel's openings after the playoffs until the draft. */
  jobOffers?: { season: number; offers: JobOffer[] };
  /** The guided first week (see agenda.ts): the steps done, or the guide put away. */
  onboarding?: { done: GuideStep[]; hidden?: boolean };
  /** Changes made in god mode (see godMode.ts), counted so the league says it has been edited. */
  godEdits?: number;
}

/**
 * A live game in progress (League.live): enough to play it again exactly to where it was after the
 * app was closed. The engine draws each possession from the game's seed and the possession counts,
 * so the same start and the same coaching moves after the same number of possessions replay the
 * same game. Everything here was read at tip-off: changes made since (to the rotation, the game
 * plan, Settings) wait for the next game, as they do while the game stays open.
 */
export interface LiveJournal {
  gid: number;
  /** The user's team at tip-off. */
  tid: number;
  /** Seed of the game's random stream. */
  seed: number;
  /** Whether in-game injuries were on. */
  injuries: boolean;
  /** The user's side as the engine took it: tactics (with tonight's game plan), rotation, form, who rests, injury risk, and the questionable players cleared to play. */
  user: { tactics: Tactics; rotation: Rotation; perf: Record<number, number>; rest: number[]; injuryMult: number; play?: number[] };
  /** The projected home margin at tip-off (see GameResult.edge): absent in journals from before win probability. */
  edge?: number;
  /**
   * The other side's tactics as the engine took them, with its coach's game plan for tonight: a
   * replay plays them as they were, whatever changed since (the difficulty, or the league's id on a
   * backup imported as a copy).
   */
  opp?: { tactics: Tactics; plan?: OppPlan };
  /** Possessions played (engine steps) at the last checkpoint, and the period, clock and score (home, away) then: a replay must land on them. */
  steps: number;
  q: number;
  clock: number;
  score: [number, number];
  /** The user's coaching moves in order, each made after `at` possessions. */
  ops: LiveOp[];
  /** "Keep changes after this game" is on: the saved tactics as they were when it was turned on. */
  keep?: Tactics;
  /** Hashes of the user's tactics and rotation as the Live screen last saw them, to spot edits made away from it. */
  seen?: [number, number];
}

/** A coaching move in a live game, on the user's side (see LiveJournal). */
export type LiveOp = { at: number } & (
  | { op: 'sub'; args: { out: number; in: number } }
  /**
   * `plan`: the new tactics are also what "Reset to game plan" goes back to (edits made away from the
   * Live screen). `staff`: the staff made it (with the bench handed to it), and why.
   */
  | { op: 'tactics'; args: { tactics: Tactics; plan?: boolean; staff?: string } }
  | { op: 'timeout'; args: { reason?: string } }
  | { op: 'manualSubs'; args: { on: boolean } }
);

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
  /** How to guard their players: their pid -> a scouting-report instruction. */
  playerD?: Record<number, PlayerDefense>;
  note?: string;
}

export const FREE_AGENT = -1;
export const DRAFT_PROSPECT = -2;
export const RETIRED = -3;
