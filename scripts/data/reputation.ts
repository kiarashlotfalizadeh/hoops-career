// Ratings fans believe: the OVR target the weights are fitted to (ovrFit.ts), and a reputation
// regression on a seeded league (real-check.ts prints it; seed.test.ts fails on it). Each anchor is
// something any fan knows (Curry is the best shooter alive; Kennard is not an All-Star) checked
// against the ratings the seed gives, so a rebuild or a change to the derivation that makes the
// ratings contradict the box score is caught before it ships.
import type { League, Player, RatingKey } from '../../src/core/types';
import { attrDisplay, tierLabel } from '../../src/core/ratings';
import { marketSalary, tradeValue } from '../../src/core/league/contracts';
import { CAP_FOR } from '../../src/core/league/helpers';

/** A player's row in a build's report (build-seed.ts with HC_REPORT). */
export interface ReportRow {
  id: string;
  name: string;
  team: string | null;
  rawMin: number;
  mpg: number;
  per36: Record<string, number> | null;
  proj: { off: number; def: number; tot: number; mpg: number } | null;
  ratings: Record<RatingKey, number>;
}

/**
 * What OVR measures, as weights on three z-scores over regulars: his projected impact (points per 100
 * his team gains with him on the floor), his production (box creation per 36) and his role (the minutes
 * coaches gave him: their read of everything the box misses). Impact alone ranked efficient
 * low-usage shooters over high-usage stars; production alone would rank empty volume over defense.
 */
export const OVR_TARGET = { impact: 0.38, production: 0.42, role: 0.2, minMinutes: 1000 };

/** Box creation per 36: points, assists, boards and stocks, less turnovers. */
export const production36 = (p: Record<string, number>) => p.pts + 0.7 * p.ast + 0.3 * (p.orb + p.drb) + 0.6 * (p.stl + p.blk) - 0.7 * p.tov;

/** Each row's OVR target (a z-score, see OVR_TARGET). */
export function ovrTarget(rows: ReportRow[]): Map<string, number> {
  const z = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
    return xs.map((x) => (x - m) / s);
  };
  const imp = z(rows.map((p) => p.proj!.tot));
  // (per game, as fans read a line: a 20-minute player's per-36 rate is not his production)
  const prod = z(rows.map((p) => (production36(p.per36!) * p.mpg) / 36));
  const role = z(rows.map((p) => p.mpg));
  return new Map(rows.map((p, i) => [p.id, OVR_TARGET.impact * imp[i] + OVR_TARGET.production * prod[i] + OVR_TARGET.role * role[i]]));
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface Anchor {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * The reputation anchors on a freshly created seeded league (before any games): each a fan's
 * certainty, checked against the ratings and the market the seed gives.
 */
export function reputationCheck(league: League): Anchor[] {
  const all = Object.values(league.players);
  const byName = new Map(all.map((p) => [plain(`${p.firstName} ${p.lastName}`), p]));
  const P = (n: string) => {
    const p = byName.get(n);
    if (!p) throw new Error(`reputation anchor: no player named ${n}`);
    return p;
  };
  const rostered = all.filter((p) => p.tid >= 0);
  const pool = all.filter((p) => p.tid >= -1);
  const nm = (p: Player) => `${p.firstName} ${p.lastName}`;
  const d = (p: Player, k: RatingKey) => attrDisplay(p.ratings[k]);
  const rankOf = (p: Player, k: RatingKey) => 1 + pool.filter((q) => q.ratings[k] > p.ratings[k]).length;
  const ovrRank = (p: Player) => 1 + rostered.filter((q) => q.ovr > p.ovr).length;
  // his real regular season before the seed's, per game
  const real = (p: Player) => {
    const rows = p.stats.filter((s) => s.real && s.season === league.season - 1 && !s.playoffs);
    const gp = rows.reduce((a, s) => a + s.gp, 0);
    const per = (k: 'min' | 'pts' | 'tpm' | 'fta' | 'blk' | 'midA' | 'rimA') => rows.reduce((a, s) => a + s[k], 0) / Math.max(1, gp);
    return { gp, mpg: per('min'), ppg: per('pts'), tpm: per('tpm'), fta: per('fta'), blk: per('blk'), midA: per('midA'), rimA: per('rimA') };
  };
  // his mid-range attempts a game over the three seasons the ratings read
  const mid3 = (p: Player) => {
    const rows = p.stats.filter((s) => s.real && s.season >= league.season - 3 && !s.playoffs);
    return (
      rows.reduce((a, s) => a + s.midA, 0) /
      Math.max(
        1,
        rows.reduce((a, s) => a + s.gp, 0),
      )
    );
  };
  // (thresholds sit a few points inside what a fan would accept: a rebuild on a retuned engine moves a top
  // shooter's or scorer's rating by up to four, since the engine's make rate is nearly flat at the top)
  const out: Anchor[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const list = (ps: Player[], f: (p: Player) => string | number) => ps.map((p) => `${nm(p)} ${f(p)}`).join(', ');

  // ---- shooting
  const curry = P('Stephen Curry');
  // (90, not 95: the engine has no usage-efficiency trade-off of its own, so each point of volume credit
  // the ratings give is a point of percentage he outshoots his line by: 95 had him at 44% and 5.5 a game)
  check('Curry is the best three-point shooter, 90+', rankOf(curry, 'tp') === 1 && d(curry, 'tp') >= 90, `3P ${d(curry, 'tp')}, #${rankOf(curry, 'tp')}`);
  const regulars = rostered.filter((p) => real(p).gp >= 50);
  const top3pm = [...regulars].sort((a, b) => real(b).tpm - real(a).tpm).slice(0, 8);
  check(
    'the eight who made the most threes a game rate 77+ from three (strong)',
    top3pm.every((p) => d(p, 'tp') >= 77),
    list(top3pm, (p) => d(p, 'tp')),
  );
  // (Jerome shoots like them but his line is a bench creator's: 20 points a game in his 15 games last season,
  // a scorer's usage before that; he is held to below All-NBA, not below All-Star, see below)
  const shooters = ['Luke Kennard', 'Cam Spencer', 'Isaiah Joe'].map(P);
  const jerome = P('Ty Jerome');
  check(
    'role shooters rate below Curry from three',
    [...shooters, jerome].every((p) => p.ratings.tp < curry.ratings.tp - 3),
    list([...shooters, jerome], (p) => d(p, 'tp')),
  );
  const bigsMid = rostered.filter((p) => p.pos === 'C' && real(p).gp >= 20 && mid3(p) < 1);
  const midBad = bigsMid.filter((p) => d(p, 'mid') > 75);
  check(
    'no center without a mid-range game (under one a game over three seasons) rates above 75 from mid-range',
    midBad.length === 0,
    midBad.length ? list(midBad, (p) => d(p, 'mid')) : `${bigsMid.length} centers`,
  );
  const midTop = ['DeMar DeRozan', 'Kevin Durant', 'Shai Gilgeous-Alexander', 'Devin Booker'].map(P);
  check(
    'the mid-range masters rate 82+ from mid-range',
    midTop.every((p) => d(p, 'mid') >= 82),
    list(midTop, (p) => d(p, 'mid')),
  );

  // ---- finishing and the line
  const giannis = P('Giannis Antetokounmpo');
  // (85, not 90: the engine gives every shot at the rim its foul rate, so most of his trips to the line come
  // with his shots there; a 90 would have him at the line a tenth more than he gets there)
  check('Giannis draws fouls at 85+, top 15', d(giannis, 'drw') >= 85 && rankOf(giannis, 'drw') <= 15, `DRW ${d(giannis, 'drw')}, #${rankOf(giannis, 'drw')}`);
  const ftaTop = [...regulars].sort((a, b) => real(b).fta - real(a).fta).slice(0, 8);
  check(
    'the eight who got to the line most rate 77+ at drawing fouls',
    ftaTop.every((p) => d(p, 'drw') >= 77),
    list(ftaTop, (p) => d(p, 'drw')),
  );
  const zion = P('Zion Williamson');
  // (Zion's strength and spring carry part of his finishing in the engine, so his rating is lower than his reputation)
  check('Giannis finishes at 90+ and Zion at 75+', d(giannis, 'ins') >= 90 && d(zion, 'ins') >= 75, `Giannis ${d(giannis, 'ins')}, Zion ${d(zion, 'ins')}`);
  const unbacked = rostered.filter((p) => {
    if (p.ovr >= 65) return false;
    const r = real(p);
    // a 95+ his line backs: a real top-tier rate of the skill (or no sample to say otherwise)
    const backs: Partial<Record<RatingKey, boolean>> = { tp: r.tpm >= 2.5, mid: r.midA >= 3, ins: r.rimA >= 5, drw: r.fta >= 5, blk: r.blk >= 1.5 };
    return (['tp', 'mid', 'ins', 'drw', 'blk'] as RatingKey[]).some((k) => d(p, k) >= 95 && r.gp >= 10 && !backs[k]);
  });
  check('no sub-65 player has a 95+ scoring or shot-blocking rating his line does not back', unbacked.length === 0, unbacked.length ? list(unbacked, (p) => p.ovr) : 'none');

  // ---- defense
  const wemby = P('Victor Wembanyama');
  check('Wembanyama is a top-3 shot blocker', rankOf(wemby, 'blk') <= 3, `BLK ${d(wemby, 'blk')}, #${rankOf(wemby, 'blk')}`);
  const blockers = ['Victor Wembanyama', 'Walker Kessler', 'Chet Holmgren', 'Rudy Gobert', 'Evan Mobley'].map(P);
  check(
    'the known rim protectors rate 82+ at blocking',
    blockers.every((p) => d(p, 'blk') >= 82),
    list(blockers, (p) => d(p, 'blk')),
  );

  // ---- overall
  const mvp = ['Nikola Jokic', 'Shai Gilgeous-Alexander', 'Giannis Antetokounmpo', 'Luka Doncic', 'Victor Wembanyama'].map(P);
  check(
    'the MVP field is in the top 10',
    mvp.every((p) => ovrRank(p) <= 10),
    list(mvp, (p) => `${p.ovr} #${ovrRank(p)}`),
  );
  const stars = ['Jayson Tatum', 'Anthony Edwards', 'Jalen Brunson', 'Donovan Mitchell', 'Cade Cunningham', 'Stephen Curry'].map(P);
  check(
    'the next stars rate 86+ (All-Star level)',
    stars.every((p) => p.ovr >= 86),
    list(stars, (p) => `${p.ovr} #${ovrRank(p)}`),
  );
  const allStars = ['Jaylen Brown', 'Devin Booker', 'Kevin Durant'].map(P);
  check(
    'the 25-point All-Stars rate 86+',
    allStars.every((p) => p.ovr >= 86),
    list(allStars, (p) => p.ovr),
  );
  const vets = ['LeBron James', 'Evan Mobley'].map(P);
  check(
    'LeBron at 41 and Mobley rate as quality starters or better (82+)',
    vets.every((p) => p.ovr >= 82),
    list(vets, (p) => p.ovr),
  );
  check(
    'role shooters are not All-Star tier, and Jerome not All-NBA',
    shooters.every((p) => p.ovr < 86) && jerome.ovr < 89,
    list([...shooters, jerome], (p) => p.ovr),
  );
  const scorers = regulars.filter((p) => real(p).ppg >= 25 && real(p).mpg >= 33);
  check(
    'every 25-point scorer (33+ minutes) is 86+',
    scorers.every((p) => p.ovr >= 86),
    list(scorers, (p) => p.ovr),
  );
  const tiers: Record<string, number> = {};
  for (const p of rostered) tiers[tierLabel(p.ovr)] = (tiers[tierLabel(p.ovr)] ?? 0) + 1;
  const sup = tiers.Superstar ?? 0;
  const nba = sup + (tiers['All-NBA'] ?? 0);
  const as = nba + (tiers['All-Star'] ?? 0);
  // (All-Star starts at 86, where the checks above put every 25-point scorer: the All-Star tier
  // itself holds about the NBA's 24, and with the All-NBA tiers above it about 40)
  check(
    'tiers are NBA-sized: 4-9 superstars, 14-22 All-NBA or better, 18-30 All-Stars, 32-44 All-Stars or better',
    sup >= 4 && sup <= 9 && nba >= 14 && nba <= 22 && as - nba >= 18 && as - nba <= 30 && as >= 32 && as <= 44,
    `${sup} / ${nba} / ${as - nba} / ${as}`,
  );

  // ---- the market follows
  const brunson = P('Jalen Brunson');
  const booker = P('Devin Booker');
  const lead = Math.min(tradeValue(league, brunson), tradeValue(league, booker));
  check(
    'cheap role shooters are worth less in trades than Brunson or Booker',
    shooters.every((p) => tradeValue(league, p) < lead),
    list(shooters, (p) => tradeValue(league, p).toFixed(0)) + ` (Brunson ${tradeValue(league, brunson).toFixed(0)}, Booker ${tradeValue(league, booker).toFixed(0)})`,
  );
  const cap = CAP_FOR(league, league.season).salaryCap;
  check(
    'a role shooter is not worth star money (20% of the cap)',
    [...shooters, jerome].every((p) => marketSalary(league, p) < 0.2 * cap),
    list([...shooters, jerome], (p) => `$${(marketSalary(league, p) / 1000).toFixed(1)}M`),
  );
  return out;
}
