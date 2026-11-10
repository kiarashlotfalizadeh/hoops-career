// Real NBA team styles, the targets the AI coaches' playing styles are fitted to. For each franchise and
// each of the 2024-25 and 2025-26 regular seasons:
// - its offensive play-type mix, from NBA.com's Synergy team play types (data/raw/synergy/teams.json):
//   the ten kinds' shares of its plays, normalised to sum to 1 (NBA.com's frequencies sum to 93-96%,
//   the rest being "misc"), and its points per play in each;
// - its box-score shape, from the player box scores (data/raw/games/PlayerStatisticsExtended.csv) added
//   up per team and game, regular season only (NBA Cup group and knockout games count, as they do in
//   the standings; the Cup final doesn't): pace, 3PA and FTA per FGA, offensive rebound rate and
//   turnovers per possession, and the same four for its opponents (what its defense allows);
// and a blend of the two seasons (2025-26 counted twice), with the league's mean and team-to-team SD of
// every number. Writes src/data/realStyles.json. Run: npx tsx scripts/data/styles.ts
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { BOX_FILE, GAMES_RAW, gameOf } from './games/sources';
import { splitCsv } from './nba/csv';

const RAW = process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw');
const SYNERGY_FILE = join(RAW, 'synergy', 'teams.json');
const OUT_FILE = join(process.cwd(), 'src', 'data', 'realStyles.json');

/** The seasons (by NBA.com label and by end year, as the box scores' game ids give it) and their weights in the blend. */
const SEASONS = [
  { label: '2024-25', end: 2025, weight: 1 / 3 },
  { label: '2025-26', end: 2026, weight: 2 / 3 },
] as const;
type Season = (typeof SEASONS)[number]['label'];

/** Synergy's offensive play types, as data/raw/synergy/teams.json names them. */
const KINDS = ['isolation', 'transition', 'pnrBH', 'pnrRoll', 'post', 'spotup', 'handoff', 'cut', 'offscreen', 'putback'] as const;
type Kind = (typeof KINDS)[number];

/** The game's franchises: its abbreviation, NBA.com's team id and NBA.com's name for the club (Synergy's spelling). */
const TEAMS: readonly (readonly [abbrev: string, nbaId: number, name: string])[] = [
  ['ATL', 1610612737, 'Atlanta Hawks'],
  ['BOS', 1610612738, 'Boston Celtics'],
  ['BKN', 1610612751, 'Brooklyn Nets'],
  ['CHA', 1610612766, 'Charlotte Hornets'],
  ['CHI', 1610612741, 'Chicago Bulls'],
  ['CLE', 1610612739, 'Cleveland Cavaliers'],
  ['DAL', 1610612742, 'Dallas Mavericks'],
  ['DEN', 1610612743, 'Denver Nuggets'],
  ['DET', 1610612765, 'Detroit Pistons'],
  ['GSW', 1610612744, 'Golden State Warriors'],
  ['HOU', 1610612745, 'Houston Rockets'],
  ['IND', 1610612754, 'Indiana Pacers'],
  ['LAC', 1610612746, 'LA Clippers'],
  ['LAL', 1610612747, 'Los Angeles Lakers'],
  ['MEM', 1610612763, 'Memphis Grizzlies'],
  ['MIA', 1610612748, 'Miami Heat'],
  ['MIL', 1610612749, 'Milwaukee Bucks'],
  ['MIN', 1610612750, 'Minnesota Timberwolves'],
  ['NOP', 1610612740, 'New Orleans Pelicans'],
  ['NYK', 1610612752, 'New York Knicks'],
  ['OKC', 1610612760, 'Oklahoma City Thunder'],
  ['ORL', 1610612753, 'Orlando Magic'],
  ['PHI', 1610612755, 'Philadelphia 76ers'],
  ['PHX', 1610612756, 'Phoenix Suns'],
  ['POR', 1610612757, 'Portland Trail Blazers'],
  ['SAC', 1610612758, 'Sacramento Kings'],
  ['SAS', 1610612759, 'San Antonio Spurs'],
  ['TOR', 1610612761, 'Toronto Raptors'],
  ['UTA', 1610612762, 'Utah Jazz'],
  ['WAS', 1610612764, 'Washington Wizards'],
];
const ABBREVS = TEAMS.map(([a]) => a);
const BY_ID = new Map(TEAMS.map(([a, id]) => [id, a]));
const BY_NAME = new Map<string, string>([...TEAMS.map(([a, , name]): [string, string] => [name.toLowerCase(), a]), ['los angeles clippers', 'LAC'], ['la lakers', 'LAL']]);

/** What a team does, or allows, per shot and per possession. */
interface Rates {
  /** 3PA / FGA */
  tpaRate: number;
  /** FTA / FGA */
  ftaRate: number;
  /** ORB / (ORB + the other side's DRB) */
  orbPct: number;
  /** Turnovers per possession. */
  tovPerPoss: number;
}
/** A team's season, a blend of its seasons, or the league's mean or SD of them. */
interface Style extends Rates {
  share: Record<Kind, number>;
  ppp: Record<Kind, number>;
  /** Possessions per 48 minutes. */
  pace: number;
  /** What its opponents did: what its defense allows. */
  opp: Rates;
}
type Tree = { [k: string]: number | Tree };
const tree = (s: Style) => s as unknown as Tree;

/** Leaf by leaf over trees of one shape. */
function combine(trees: Tree[], f: (vals: number[]) => number): Tree {
  const out: Tree = {};
  for (const [k, v] of Object.entries(trees[0])) {
    const at = trees.map((t) => t[k]);
    out[k] = typeof v === 'number' ? f(at as number[]) : combine(at as Tree[], f);
  }
  return out;
}
const leaf = (t: Tree, path: string): number => path.split('.').reduce<number | Tree>((n, k) => (n as Tree)[k], t) as number;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Population SD: the spread of these 30 teams. */
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const corr = (xs: number[], ys: number[]) => {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};
/** Four significant figures, two decimals at least (100.62, 1.123, 0.4123, 0.01235). */
const sig = (v: number) => (v === 0 ? 0 : Number(v.toFixed(Math.max(2, 3 - Math.floor(Math.log10(Math.abs(v)))))));

// ---------------------------------------------------------------------------------------------------
// Synergy play types

interface PlayType {
  poss: number;
  freq: number;
  ppp: number;
}
type PlayMix = Pick<Style, 'share' | 'ppp'>;

function readSynergy(): Record<Season, Map<string, PlayMix>> {
  if (!existsSync(SYNERGY_FILE)) throw new Error(`No Synergy play types at ${SYNERGY_FILE}`);
  const file = JSON.parse(readFileSync(SYNERGY_FILE, 'utf8')) as Record<string, Record<string, Partial<Record<Kind, PlayType>>>>;
  const out = {} as Record<Season, Map<string, PlayMix>>;
  for (const { label } of SEASONS) {
    const teams = file[label];
    if (!teams) throw new Error(`${SYNERGY_FILE} has no ${label}`);
    const mixes = new Map<string, PlayMix>();
    for (const [name, kinds] of Object.entries(teams)) {
      const abbrev = BY_NAME.get(name.trim().toLowerCase());
      if (!abbrev) throw new Error(`Synergy ${label}: no franchise for "${name}"`);
      const types = KINDS.map((k) => {
        const t = kinds[k];
        if (!t || !Number.isFinite(t.freq) || !Number.isFinite(t.ppp)) throw new Error(`Synergy ${label} ${name}: no ${k}`);
        return t;
      });
      const total = types.reduce((a, t) => a + t.freq, 0);
      if (total < 85 || total > 100) console.warn(`  Synergy ${label} ${name}: the ten kinds add up to ${total.toFixed(1)}% of plays`);
      mixes.set(abbrev, {
        share: Object.fromEntries(KINDS.map((k, i) => [k, types[i].freq / total])) as Record<Kind, number>,
        ppp: Object.fromEntries(KINDS.map((k, i) => [k, types[i].ppp])) as Record<Kind, number>,
      });
    }
    const missing = ABBREVS.filter((a) => !mixes.has(a));
    if (missing.length) throw new Error(`Synergy ${label}: no play types for ${missing.join(', ')}`);
    out[label] = mixes;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Box scores

interface Counts {
  fga: number;
  fta: number;
  tpa: number;
  orb: number;
  drb: number;
  tov: number;
}
const COUNTS: (keyof Counts)[] = ['fga', 'fta', 'tpa', 'orb', 'drb', 'tov'];
const zero = (): Counts => ({ fga: 0, fta: 0, tpa: 0, orb: 0, drb: 0, tov: 0 });

/** One team's game: its players' box scores added up. */
interface Side extends Counts {
  opp: number;
  /** Its players' minutes read as decimal minutes, and as minutes and seconds. */
  minDec: number;
  minMmss: number;
  /** NBA.com's possessions with each player on the floor, added up (five a possession). */
  nbaPoss: number;
}

/**
 * Minutes as written: "34:12", or a number, which 2024-25 and 2025-26 write as minutes and seconds
 * ("38.17" for 38:17, "29.5" for 29:50) and some other seasons as decimal minutes.
 */
function minutesOf(raw: string, mmss: boolean): number {
  const colon = /^(\d+):(\d+)$/.exec(raw);
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60;
  const ms = mmss ? /^(\d+)\.(\d{1,2})$/.exec(raw) : null;
  if (ms && Number(ms[2].padEnd(2, '0')) < 60) return Number(ms[1]) + Number(ms[2].padEnd(2, '0')) / 60;
  return Number(raw) || 0;
}

interface BoxRead {
  games: Map<string, { season: number; sides: Map<number, Side> }>;
  /** By season: whether its minutes are minutes and seconds. */
  mmss: Map<number, boolean>;
}

async function readBox(file: string): Promise<BoxRead> {
  if (!existsSync(file)) throw new Error(`No box scores at ${file}: put the game files in data/raw/games (see scripts/data/games/sources.ts).`);
  const ends = new Set<number>(SEASONS.map((s) => s.end));
  const games: BoxRead['games'] = new Map();
  const format = new Map<number, { rows: number; two: number; past59: number }>();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const c = splitCsv(line);
    if (!idx) {
      idx = Object.fromEntries(c.map((h, i) => [h, i]));
      continue;
    }
    const at = idx;
    const get = (k: string) => c[at[k]] ?? '';
    const n = (k: string) => Number(get(k)) || 0;
    const gameId = get('gameId').replace(/^0+/, '');
    const g = gameOf(gameId);
    if (!g || g.part !== 'reg' || !ends.has(g.season)) continue;
    const teamId = n('playerteamId');
    const oppId = n('opponentteamId');
    const abbrev = BY_ID.get(teamId);
    if (!abbrev || !BY_ID.has(oppId)) throw new Error(`box scores: game ${gameId} has a team id the game doesn't know (${teamId} v ${oppId})`);
    // (a team id mapped to the wrong club would pass silently: its nickname must end NBA.com's name for it)
    const nickname = get('playerteamName').trim();
    if (nickname && !TEAMS.find(([a]) => a === abbrev)![2].endsWith(nickname)) throw new Error(`box scores: team ${teamId} is the ${nickname} here, not ${abbrev}`);
    let game = games.get(gameId);
    if (!game) games.set(gameId, (game = { season: g.season, sides: new Map() }));
    let side = game.sides.get(teamId);
    if (!side) game.sides.set(teamId, (side = { opp: oppId, ...zero(), minDec: 0, minMmss: 0, nbaPoss: 0 }));
    if (side.opp !== oppId) throw new Error(`box scores: game ${gameId} has ${abbrev} playing two opponents`);
    const raw = get('numMinutes').trim();
    if (raw) {
      let f = format.get(g.season);
      if (!f) format.set(g.season, (f = { rows: 0, two: 0, past59: 0 }));
      f.rows++;
      const two = /^\d+\.(\d\d)$/.exec(raw);
      if (two) {
        f.two++;
        if (Number(two[1]) >= 60) f.past59++;
      }
      side.minDec += minutesOf(raw, false);
      side.minMmss += minutesOf(raw, true);
    }
    side.fga += n('fieldGoalsAttempted');
    side.fta += n('freeThrowsAttempted');
    side.tpa += n('threePointersAttempted');
    side.orb += n('reboundsOffensive');
    side.drb += n('reboundsDefensive');
    side.tov += n('turnovers');
    side.nbaPoss += n('possessions');
  }
  // (a season whose two-decimal minutes never pass .59 writes minutes and seconds)
  const mmss = new Map([...format].map(([s, f]): [number, boolean] => [s, f.two > f.rows / 2 && f.past59 < f.two * 0.02]));
  return { games, mmss };
}

/** One team's season, added up from its games. */
interface Acc {
  games: number;
  /** Game minutes (48, and 5 an overtime), possessions (the estimate, both sides averaged) and NBA.com's possessions. */
  mins: number;
  poss: number;
  nbaPoss: number;
  own: Counts;
  opp: Counts;
}

/** The usual estimate: FGA + 0.44·FTA − ORB + TOV. */
const possOf = (c: Counts) => c.fga + 0.44 * c.fta - c.orb + c.tov;

function teamSeasons(box: BoxRead, season: number, log: string[]): Map<string, Acc> {
  const accs = new Map<string, Acc>(ABBREVS.map((a) => [a, { games: 0, mins: 0, poss: 0, nbaPoss: 0, own: zero(), opp: zero() }]));
  const mmss = box.mmss.get(season) ?? false;
  const odd: string[] = [];
  const numbers = new Set<number>();
  const league = zero();
  let ots = 0;
  let cutOff = 0;
  for (const [gameId, game] of box.games) {
    if (game.season !== season) continue;
    numbers.add(Number(gameId.slice(3)));
    const sides = [...game.sides];
    if (sides.length !== 2 || sides[0][1].opp !== sides[1][0] || sides[1][1].opp !== sides[0][0])
      throw new Error(`box scores: game ${gameId} doesn't have two teams facing each other`);
    const mins = sides.map(([, s]) => (mmss ? s.minMmss : s.minDec));
    // its length in player minutes: 240, and 25 an overtime (the longer side's count, in case a row is missing)
    const length = 240 + 25 * Math.max(0, Math.round((Math.max(...mins) - 240) / 25));
    if (length > 240) ots += (length - 240) / 25;
    // (a few games list whole minutes, cut off, and come up a few short: only the length is read from them)
    const off = mins.map((m) => m - length);
    if (off.some((d) => d > 2 || d < -12)) odd.push(`${gameId} (${mins.map((m) => m.toFixed(1)).join(' v ')} of ${length})`);
    else if (off.some((d) => d < -2)) cutOff++;
    for (const k of COUNTS) league[k] += sides[0][1][k] + sides[1][1][k];
    const poss = (possOf(sides[0][1]) + possOf(sides[1][1])) / 2;
    const nbaPoss = (sides[0][1].nbaPoss + sides[1][1].nbaPoss) / 10;
    for (const [i, [teamId, side]] of sides.entries()) {
      const acc = accs.get(BY_ID.get(teamId)!)!;
      const other = sides[1 - i][1];
      acc.games++;
      acc.mins += length / 5;
      acc.poss += poss;
      acc.nbaPoss += nbaPoss;
      for (const k of COUNTS) {
        acc.own[k] += side[k];
        acc.opp[k] += other[k];
      }
    }
  }
  const games = numbers.size;
  const max = Math.max(...numbers);
  const gaps = Array.from({ length: max }, (_, i) => i + 1).filter((x) => !numbers.has(x));
  log.push(
    `  ${seasonLabel(season)}: ${games} regular-season games, ${ots} overtimes (minutes read as ${mmss ? 'minutes and seconds' : 'decimal minutes'}${cutOff ? `; ${cutOff} games list whole minutes` : ''})` +
      (gaps.length ? `; game numbers missing from the box scores: ${gaps.join(', ')}` : '') +
      (odd.length ? `; ${odd.length} games whose minutes don't add up to their length: ${odd.slice(0, 4).join(', ')}` : ''),
  );
  log.push(
    `    a team-game: ${COUNTS.map((k) => `${k.toUpperCase()} ${(league[k] / (2 * games)).toFixed(2)}`).join(', ')}, possessions ${(possOf(league) / (2 * games)).toFixed(2)}`,
  );
  const short = [...accs].filter(([, a]) => a.games !== 82);
  if (short.length) log.push(`    teams without 82 games: ${short.map(([t, a]) => `${t} ${a.games}`).join(', ')}`);
  return accs;
}

const seasonLabel = (end: number) => `${end - 1}-${String(end % 100).padStart(2, '0')}`;

const ratesOf = (own: Counts, opp: Counts, poss: number): Rates => ({
  tpaRate: own.tpa / own.fga,
  ftaRate: own.fta / own.fga,
  orbPct: own.orb / (own.orb + opp.drb),
  tovPerPoss: own.tov / poss,
});

// ---------------------------------------------------------------------------------------------------
// Output

const FIELDS = {
  share: 'share of the team\'s plays by Synergy play type: NBA.com frequencies over these ten kinds, normalised to sum to 1 ("misc" left out)',
  ppp: 'points per play in each play type (NBA.com Synergy)',
  pace: "possessions per 48 minutes: FGA + 0.44*FTA - ORB + TOV, averaged with the opponent's, per game, over game minutes (overtime counted)",
  tpaRate: '3PA / FGA',
  ftaRate: 'FTA / FGA',
  orbPct: 'ORB / (ORB + opponent DRB)',
  tovPerPoss:
    'turnovers credited to players, per possession (the averaged estimate above). Team turnovers (shot clock, 5- and 8-second violations) are not in the player box scores, ' +
    'so they are in neither this nor the possession estimate: per the play-by-play they ran 0.80 a team-game in 2024-25 and 0.71 in 2025-26 (5% of all turnovers, ' +
    'about 0.0073 a possession in the blend, nearly the same for every team); add that to compare with a turnover count that includes them',
  opp: "the same four for the team's opponents, i.e. what its defense allows (opp.orbPct = 1 - its DRB%)",
};
const source = (missing: string) =>
  'share, ppp: NBA.com Synergy team offensive play types (data/raw/synergy/teams.json). pace and the rates: NBA.com player box scores added up per team game ' +
  `(data/raw/games/PlayerStatisticsExtended.csv), regular season only (NBA Cup group and knockout games in, Cup final out)${missing}. blend: 1/3 2024-25 + 2/3 2025-26. ` +
  'league: mean and population SD over the 30 teams (blend: of the blended values). games: the regular-season games counted. Built by scripts/data/styles.ts.';

/** The JSON, one team (or league season) a line. */
function write(styles: Record<string, Record<Season | 'blend', Tree>>, league: Record<Season | 'blend', { mean: Tree; sd: Tree }>, games: Record<Season, Record<string, number>>) {
  const block = (o: Record<string, unknown>) =>
    `{\n${Object.entries(o)
      .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
      .join(',\n')}\n}`;
  // (a season of 30 teams playing 82 games each is 1230 games)
  const missing = SEASONS.map((s) => [s.label, 1230 - Object.values(games[s.label]).reduce((a, g) => a + g, 0) / 2] as const).filter(([, n]) => n > 0);
  const top: [string, string][] = [
    ['source', JSON.stringify(source(missing.map(([label, n]) => `; the box scores lack ${n} of ${label}'s 1230 games`).join('')))],
    ['fields', JSON.stringify(FIELDS)],
    ['kinds', JSON.stringify(KINDS)],
    ['weights', JSON.stringify(Object.fromEntries(SEASONS.map((s) => [s.label, sig(s.weight)])))],
    ['games', JSON.stringify(games)],
    ['league', block(league)],
    ['teams', block(styles)],
  ];
  const text = `{\n${top.map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(',\n')}\n}\n`;
  JSON.parse(text);
  writeFileSync(OUT_FILE, text);
  return text.length;
}

// ---------------------------------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const synergy = readSynergy();
  const box = await readBox(join(GAMES_RAW, BOX_FILE));
  const log: string[] = [];
  const styles: Record<string, Record<Season | 'blend', Tree>> = Object.fromEntries(ABBREVS.map((a) => [a, {} as Record<Season | 'blend', Tree>]));
  const games = {} as Record<Season, Record<string, number>>;
  const nbaPace = {} as Record<Season, number>;
  for (const { label, end } of SEASONS) {
    const accs = teamSeasons(box, end, log);
    games[label] = Object.fromEntries([...accs].map(([a, acc]) => [a, acc.games]));
    nbaPace[label] = mean([...accs.values()].map((a) => (48 * a.nbaPoss) / a.mins));
    for (const [abbrev, acc] of accs) {
      const mix = synergy[label].get(abbrev)!;
      const style: Style = { share: mix.share, ppp: mix.ppp, pace: (48 * acc.poss) / acc.mins, ...ratesOf(acc.own, acc.opp, acc.poss), opp: ratesOf(acc.opp, acc.own, acc.poss) };
      styles[abbrev][label] = tree(style);
    }
  }
  for (const a of ABBREVS) styles[a].blend = combine([styles[a]['2024-25'], styles[a]['2025-26']], ([x, y]) => x * SEASONS[0].weight + y * SEASONS[1].weight);

  const parts = [...SEASONS.map((s) => s.label), 'blend'] as const;
  const all = (part: Season | 'blend') => ABBREVS.map((a) => styles[a][part]);
  const league = Object.fromEntries(parts.map((p) => [p, { mean: combine(all(p), mean), sd: combine(all(p), sd) }])) as Record<Season | 'blend', { mean: Tree; sd: Tree }>;

  // ---- sanity checks
  console.log(`Real team styles (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(log.join('\n'));
  const pad = (s: string, n: number) => s.padStart(n);
  const checks: [path: string, name: string, lo: number, hi: number, digits: number][] = [
    ['pace', 'pace', 98, 101, 2],
    ['tpaRate', '3PA/FGA', 0.4, 0.43, 4],
    ['ftaRate', 'FTA/FGA', 0.25, 0.28, 4],
    ['orbPct', 'ORB%', 0.24, 0.3, 4],
    ['tovPerPoss', 'TOV/poss', 0.13, 0.14, 4],
  ];
  console.log("\nLeague means of the 30 teams (expected range) | team-to-team SD | opponents' mean");
  for (const [path, name, lo, hi, d] of checks) {
    const cells = parts.map((p) => {
      const m = leaf(league[p].mean, path);
      const flag = m < lo || m > hi ? ' OUT' : '';
      const opp = path === 'pace' ? '' : ` opp ${leaf(league[p].mean, `opp.${path}`).toFixed(d)}`;
      return `${p} ${m.toFixed(d)}${flag} sd ${leaf(league[p].sd, path).toFixed(d)}${opp}`;
    });
    console.log(`  ${name.padEnd(9)} (${lo}-${hi})  ${cells.join('  |  ')}`);
  }
  console.log(`  (pace from NBA.com's own possession counts instead: ${SEASONS.map((s) => `${s.label} ${nbaPace[s.label].toFixed(2)}`).join(', ')})`);

  const show = ['DEN', 'GSW', 'MIA', 'CLE', 'BOS'];
  const rank = (part: Season | 'blend', path: string, a: string) => 1 + ABBREVS.filter((b) => leaf(styles[b][part], path) > leaf(styles[a][part], path)).length;
  console.log(`\n2025-26 play-type shares (rank of 30, 1 = most)`);
  console.log(`  ${'kind'.padEnd(11)}${show.map((a) => pad(a, 13)).join('')}${pad('league', 9)}${pad('sd', 8)}`);
  for (const k of KINDS) {
    const p = `share.${k}`;
    console.log(
      `  ${k.padEnd(11)}${show.map((a) => pad(`${leaf(styles[a]['2025-26'], p).toFixed(3)} (${rank('2025-26', p, a)})`, 13)).join('')}${pad(leaf(league['2025-26'].mean, p).toFixed(3), 9)}${pad(leaf(league['2025-26'].sd, p).toFixed(3), 8)}`,
    );
  }
  console.log(`  and their box scores, 2025-26:`);
  for (const a of show) {
    const s = styles[a]['2025-26'];
    console.log(
      `  ${a} pace ${leaf(s, 'pace').toFixed(1)} (${rank('2025-26', 'pace', a)})  3PA/FGA ${leaf(s, 'tpaRate').toFixed(3)} (${rank('2025-26', 'tpaRate', a)})  FTA/FGA ${leaf(s, 'ftaRate').toFixed(3)}  ORB% ${leaf(s, 'orbPct').toFixed(3)}  TOV/poss ${leaf(s, 'tovPerPoss').toFixed(3)}  | opp 3PA/FGA ${leaf(s, 'opp.tpaRate').toFixed(3)} FTA/FGA ${leaf(s, 'opp.ftaRate').toFixed(3)} TOV/poss ${leaf(s, 'opp.tovPerPoss').toFixed(3)} ORB% ${leaf(s, 'opp.orbPct').toFixed(3)}`,
    );
  }

  const across = (part: Season | 'blend', path: string) => ABBREVS.map((a) => leaf(styles[a][part], path));
  console.log('\nSeason-to-season correlation across the 30 teams (2024-25 v 2025-26)');
  console.log(`  share: ${KINDS.map((k) => `${k} ${corr(across('2024-25', `share.${k}`), across('2025-26', `share.${k}`)).toFixed(2)}`).join(', ')}`);
  console.log(`  ppp:   ${KINDS.map((k) => `${k} ${corr(across('2024-25', `ppp.${k}`), across('2025-26', `ppp.${k}`)).toFixed(2)}`).join(', ')}`);
  const boxPaths = ['pace', 'tpaRate', 'ftaRate', 'orbPct', 'tovPerPoss', 'opp.tpaRate', 'opp.ftaRate', 'opp.orbPct', 'opp.tovPerPoss'];
  console.log(`  box:   ${boxPaths.map((p) => `${p} ${corr(across('2024-25', p), across('2025-26', p)).toFixed(2)}`).join(', ')}`);
  console.log('Join check, Synergy against box scores across the 30 teams (each season)');
  for (const [x, y] of [
    ['share.putback', 'orbPct'],
    ['share.spotup', 'tpaRate'],
    ['share.transition', 'pace'],
  ]) {
    console.log(`  ${x} v ${y}: ${SEASONS.map((s) => `${s.label} r = ${corr(across(s.label, x), across(s.label, y)).toFixed(2)}`).join(', ')}`);
  }
  console.log('Blend extremes (top three, bottom three)');
  for (const p of ['pace', ...boxPaths.slice(1)]) {
    const order = [...ABBREVS].sort((a, b) => leaf(styles[b].blend, p) - leaf(styles[a].blend, p));
    const f = (a: string) => `${a} ${leaf(styles[a].blend, p).toFixed(p === 'pace' ? 1 : 3)}`;
    console.log(`  ${p.padEnd(15)} ${order.slice(0, 3).map(f).join(', ')}  ...  ${order.slice(-3).map(f).join(', ')}`);
  }

  // ---- write
  const round = (t: Tree) => combine([t], ([v]) => sig(v));
  const outStyles = Object.fromEntries(ABBREVS.map((a) => [a, Object.fromEntries(parts.map((p) => [p, round(styles[a][p])]))])) as Record<string, Record<Season | 'blend', Tree>>;
  const outLeague = Object.fromEntries(parts.map((p) => [p, { mean: round(league[p].mean), sd: round(league[p].sd) }])) as Record<Season | 'blend', { mean: Tree; sd: Tree }>;
  const size = write(outStyles, outLeague, games);
  console.log(`\nWrote ${OUT_FILE.replace(process.cwd() + '/', '')} (${(size / 1024).toFixed(1)} KB)`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
