// League-wide constants. Money is in thousands of dollars.

export const START_SEASON = 2027; // 2026-27 season (named by end year, like Basketball Reference)

/**
 * The real seasons a seeded league has for everyone in it: the last three before it starts, which
 * the players' ratings come from. A seed's careers can go back further, for its players alone.
 */
export const RATED_SEASONS = 3;

/**
 * Format of the league record. Bump it, with a step in migrate() (src/state/persistence.ts), when
 * that format changes.
 * 4: the redesign (difficulty presets, no coaching depth, the agenda, the owner's hot seat, the
 *    assistant's feed). Saves from before it can't be opened: migrate() turns them away.
 * 5: no player morale or press conference (players have no mood, promise or meetings, the league no
 *    press): migrate() strips them from a version-4 save, and a build from before refuses a
 *    version-5 one instead of reading a player without a mood.
 */
export const SAVE_VERSION = 5;
/** The oldest save format this build opens (a version-4 save loses its morale on the way in). */
export const MIN_SAVE_VERSION = 4;

export const CAP = {
  salaryCap: 165_000,
  luxuryTax: 201_000,
  /**
   * The aprons above the tax line (the 2023 CBA's), at the 2025-26 ratios to the cap: the first
   * 1.267× the cap, the second 1.344×. Teams over them lose tools (see contracts.ts and trades.ts).
   */
  firstApron: 209_100,
  secondApron: 221_800,
  /** The tax on the first bracket over the line; each bracket is TAX_BRACKET_PCT of the cap (see luxuryTaxBill). */
  taxRate: 1.5,
  minPayroll: 148_500, // 90% of cap
  minContract: 1_300,
  vetMinContract: 2_400,
  /** Max contract as a fraction of the cap by years of experience. */
  maxPct: (exp: number) => (exp >= 10 ? 0.35 : exp >= 7 ? 0.3 : 0.25),
  /** Annual cap growth applied each offseason. */
  growth: 0.06,
  rosterMax: 15,
  rosterMin: 13,
  /** Trade matching's buffer as a share of the cap ($0.25M at the 2025-26 cap): see tradeMatchLimit. */
  tradeMatchBufferPct: 0.0016,
};

/**
 * Luxury tax brackets: each this share of the cap over the line, taxed at the next rate (see
 * luxuryTaxBill). The CBA's brackets grow with the cap: $5M on 2023-24's, $5.168M on 2024-25's.
 */
export const TAX_BRACKET_PCT = 0.0368;
/** Tax rates by bracket over the line; past the last, each further bracket adds TAX_RATE_STEP. A repeater pays REPEATER_EXTRA more on every bracket. */
export const TAX_RATES = [1.5, 1.75, 2.5, 3.25];
export const TAX_RATE_STEP = 0.5;
export const REPEATER_EXTRA = 1;

/**
 * Trade salary matching for a team over the cap after the trade (the 2023 CBA's tiers, as shares of
 * the cap): up to 4.85% of the cap sent, it may take back 200% of it plus the buffer; up to 18.75%,
 * what it sends plus 4.85% of the cap; above that, 125% plus the buffer.
 */
export const MATCH_SMALL_PCT = 0.0485;
export const MATCH_MID_PCT = 0.1875;

/** First-round rookie scale (year-1 salary in $K) by pick, for the 2026-27 cap. */
export const ROOKIE_SCALE: number[] = [
  12_900, 11_550, 10_370, 9_350, 8_480, 7_700, 7_030, 6_430, 5_910, 5_600, 5_320, 5_050, 4_800, 4_560, 4_330, 4_160, 3_990, 3_830, 3_660, 3_480, 3_340, 3_210, 3_080, 2_960, 2_850,
  2_770, 2_700, 2_690, 2_670, 2_650,
];

export const GAME = {
  quarterSec: 720,
  otSec: 300,
  shotClock: 24,
  timeouts: 7,
  foulOut: 6,
  bonusFouls: 5,
};

/** 2025-26 league-average targets used to calibrate the engine (per team per game). */
export const TARGETS = {
  pace: 99.6,
  ortg: 114.8,
  fga: 88.8,
  tpa: 37.5,
  tpPct: 0.359,
  fgPct: 0.471,
  fta: 21.8,
  ftPct: 0.784,
  orb: 10.8,
  drb: 33.0,
  ast: 26.6,
  stl: 8.2,
  blk: 5.0,
  tov: 13.9,
  pf: 19.4,
  pts: 114.4,
  /** Game-to-game shape: SD of the final margin, share of games decided by 20+, overtime rate, correlation of the two scores. */
  marginSd: 13,
  blowout20: 0.17,
  otRate: 0.055,
  scoreCorr: 0.3,
};

export const PHASE_LABEL: Record<string, string> = {
  preseason: 'Preseason',
  regular: 'Regular Season',
  playin: 'Play-In Tournament',
  playoffs: 'Playoffs',
  draftLottery: 'Draft Lottery',
  draft: 'NBA Draft',
  resign: 'Re-sign Period',
  freeAgency: 'Free Agency',
};

export const seasonLabel = (season: number) => `${season - 1}-${String(season % 100).padStart(2, '0')}`;
