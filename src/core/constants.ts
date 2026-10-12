// League-wide constants. Money is in thousands of dollars.

export const START_SEASON = 2027; // 2026-27 season (named by end year, like Basketball Reference)

export const CAP = {
  salaryCap: 165_000,
  luxuryTax: 201_000,
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
  /** Trade matching when over the cap after the trade. */
  tradeMatchPct: 1.25,
  tradeMatchBuffer: 100,
};

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

/** Calendar: day 0 of the regular season. */
export const SEASON_START = { month: 9, day: 20 }; // Oct 20 (month is 0-based)

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

export const money = (k: number, digits = 1) => {
  const sign = k < 0 ? '-' : '';
  const m = Math.abs(k) / 1000;
  if (m >= 1) return `${sign}$${m.toFixed(digits)}M`;
  return `${sign}$${Math.round(Math.abs(k))}K`;
};
