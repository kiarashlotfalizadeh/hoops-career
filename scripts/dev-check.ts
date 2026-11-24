// Development check: plays several leagues for N seasons (one per spec, each in its own process, the
// user's team auto-managed as in star-check) and measures what a fan sees of player development from
// one preseason to the next: the league's mean OVR change each summer (the first against the later
// ones: a league must not step down after its first summer), the counts of 80+/85+/90+ players, the
// one-year swings by age band against the bands progression.ts holds (YEAR_BANDS), how much of a big
// drop came from an injury's lasting damage (injuries.ts: the one change to a rating outside
// development), how draft picks grow in their first four summers by where they were picked, and the
// scouting: how often the staff's draft-night ranges hold the truth, and how far picks end from the
// POT the room read (the figures the draft screen quotes, prospects.ts's OUTCOME_MISS).
// Fails (exit 1) when the first summer steps away from the later ones, when a swing past the bands
// isn't explained by an injury, when top-ten picks don't grow or second-rounders jump too often, or
// when the scouting's stated accuracy isn't the measured one (see the gates below).
// Usage: npx tsx scripts/dev-check.ts [seasons] [spec,...]   spec: rngSeed[f][:TEAM]  ('f': a
//   generated league in place of the real one; TEAM: the user's team, star-check's default else)
import { readFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { standardRoster, freeAgents } from '../src/core/league/helpers';
import { CAP } from '../src/core/constants';
import { standings } from '../src/core/league/standings';
import { nextPick } from '../src/core/league/draft';
import { expiringPlayers, userOffer, userResign } from '../src/core/league/freeAgency';
import { askingContract, releasePlayer } from '../src/core/league/contracts';
import { takeJob } from '../src/core/league/jobs';
import { playerAge } from '../src/core/playerGen';
import { YEAR_BANDS, yearBand } from '../src/core/league/progression';
import { OUTCOME_MISS, OUTCOME_SEASONS, PICK_TIERS, readCheck, seenRange, tierOfSlot } from '../src/core/league/prospects';
import { prospects } from '../src/core/league/helpers';
import { FRANCHISES } from '../src/core/teams';
import type { League } from '../src/core/types';

/**
 * The leagues the check plays: three from the real opening night and three generated ones. Six
 * seasons each, so a class has its first four summers and a league five summers to compare.
 */
const DEFAULT_SPECS = ['42', '7', '2026', '42f', '7f', '11f'];
const DEFAULT_SEASONS = 6;

/**
 * The gates. The first summer's mean OVR change within FIRST_STEP of the later summers' (per kind of
 * league: -1.60 against -0.68 on the real one before its anchors were set on opening night's league,
 * progression.ts's setAnchors), the 85+ count after the first summer within STARS_STEP of opening
 * night's (48 to 40 then; an opening night's old stars still fade together, 48 to 43), no one-year
 * swing past the bands but an injury's (BAND_SLACK: the point a slip at the season's check-ins can add
 * to a summer at its floor), top-ten picks gaining at least TOP_TEN_GAIN a summer through 23 and no
 * more than TOP_TEN_BACK of them lower after their first three summers than on draft night, and at
 * most LATE_JUMPS years of +5 by a class's second-rounders over all its summers (the rare story: two
 * or three such years a class, where there were ten).
 */
const FIRST_STEP = 0.5;
const STARS_STEP = 0.2;
const BAND_SLACK = 1;
const TOP_TEN_GAIN = 1.3;
const TOP_TEN_BACK = 0.12;
const LATE_JUMPS = 3.5;
/**
 * ...and the scouting: the staff's ranges on draft night hold the truth RANGE_HOLD of the time, give
 * or take RANGE_SLACK (they say four times in five), and the outcome figures the draft screen quotes
 * before a league has its own (prospects.ts's OUTCOME_MISS) are within OUTCOME_SLACK of what the
 * leagues here measure.
 */
const RANGE_HOLD = 0.8;
const RANGE_SLACK = 0.08;
const OUTCOME_SLACK = 1;

/** One player's year, preseason to preseason (a draftee's first: draft night to his first preseason). */
interface Year {
  /** The summer's number in the league (1: its first) and the new season. */
  summer: number;
  pid: number;
  age: number;
  from: number;
  d: number;
  dPot: number;
  /** OVR his injuries' lasting damage took in the season before (applyInjury), 0 for nearly everyone. */
  hurt: number;
  /** Draft slot overall (1-60), 0 undrafted or from before the league; summers since his draft (1 = his first). */
  slot: number;
  since: number;
  /** A generational player (legends.ts): his climb has no ceiling. */
  legend: boolean;
  /** Whether the league generated him (a real league's own players never were prospects here). */
  drafted: boolean;
}

/** One preseason's league: the rostered players' mean OVR and the counts at 80+, 85+ and 90+, and the season before's points a team game. */
interface Shape {
  season: number;
  n: number;
  mean: number;
  c80: number;
  c85: number;
  c90: number;
  ppg: number;
}

/** A pick against the room's read of him on draft night (prospects.ts readCheck), as the league ended. */
interface Outcome {
  slot: number;
  seasons: number;
  miss: number;
  ovr: number;
}

interface Report {
  spec: string;
  fictional: boolean;
  years: Year[];
  shapes: Shape[];
  /** The staff's ranges on draft night against the truth: how many held, of how many (OVR, POT). */
  held: { ovr: number; pot: number; n: number };
  outcomes: Outcome[];
}

const seasons = Number(process.argv[2] ?? DEFAULT_SEASONS);
const specs = process.argv[3] ? process.argv[3].split(',') : DEFAULT_SPECS;
if (!Number.isInteger(seasons) || seasons < 2 || specs.some((s) => !/^\d+f?(:[A-Za-z]{3})?$/.test(s))) throw new Error('Usage: dev-check [seasons >= 2] [rngSeed[f][:TEAM],...]');

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
const signed = (x: number, digits = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;
const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : 0);

function shapeOf(league: League, ppg: number): Shape {
  const ovrs = Object.values(league.players)
    .filter((p) => p.tid >= 0)
    .map((p) => p.ovr);
  return {
    season: league.season,
    n: ovrs.length,
    mean: mean(ovrs),
    c80: ovrs.filter((o) => o >= 80).length,
    c85: ovrs.filter((o) => o >= 85).length,
    c90: ovrs.filter((o) => o >= 90).length,
    ppg,
  };
}

/** One league, start to finish. */
function playLeague(spec: string): Report {
  const [head, team] = spec.split(':');
  const fictional = head.endsWith('f');
  const rngSeed = Number(fictional ? head.slice(0, -1) : head);
  const seed: SeedData | null = fictional ? null : JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
  const userTid = team ? FRANCHISES.findIndex((f) => f.abbrev === team.toUpperCase()) : 19;
  if (userTid < 0) throw new Error(`${team} is no team`);
  const league = createLeague({ name: 'Dev', userTid, coachName: 'Check', settings: defaultSettings(), seed, rngSeed });
  league.id = `dev_check_${head}`;
  const years: Year[] = [];
  const shapes: Shape[] = [shapeOf(league, 0)];
  // every player's OVR and POT at the last preseason (a draftee's: on draft night)
  let last = new Map(Object.values(league.players).map((p) => [p.pid, { ovr: p.ovr, pot: p.pot }]));
  const made = new Set<number>();
  const held = { ovr: 0, pot: 0, n: 0 };
  for (let s = 0; s < seasons - 1; s++) {
    if (startRegularSeason(league).length) {
      // auto-manage the user roster: cut extras, sign minimum deals to reach the minimum
      const roster = standardRoster(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
      while (standardRoster(league, league.userTid).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
      for (const p of freeAgents(league).sort((a, b) => b.ovr - a.ovr)) {
        if (standardRoster(league, league.userTid).length >= CAP.rosterMin) break;
        userOffer(league, p.pid, askingContract(league, p, league.userTid).amount, 1);
      }
      const errs = startRegularSeason(league);
      if (errs.length) throw new Error(errs.join('; '));
    }
    // an injury's lasting damage shows on his OVR the day it happens: the drop that day is the injury's
    const hurt = new Map<number, number>();
    const seen = new Map(Object.values(league.players).map((p) => [p.pid, { injury: p.injury, ovr: p.ovr }]));
    let guard = 0;
    while ((league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') && guard++ < 600) {
      simDay(league);
      for (const p of Object.values(league.players)) {
        const was = seen.get(p.pid);
        if (was && p.injury && p.injury !== was.injury && p.ovr < was.ovr) hurt.set(p.pid, (hurt.get(p.pid) ?? 0) + was.ovr - p.ovr);
        seen.set(p.pid, { injury: p.injury, ovr: p.ovr });
      }
    }
    const games = league.games.filter((g) => g.season === league.season && g.type === 'regular');
    const ppg = mean(games.flatMap((g) => [g.home.pts, g.away.pts]));
    if (league.fired) takeJob(league, league.jobOffers?.offers[0]?.tid ?? standings(league).find((r) => r.tid !== league.userTid)!.tid);
    startDraft(league);
    // the staff's read of every prospect tonight against what he is
    for (const p of prospects(league, league.season)) {
      const r = seenRange(league, p);
      held.n++;
      if (p.ovr >= r.ovrLo && p.ovr <= r.ovrHi) held.ovr++;
      if (p.pot >= r.potLo && p.pot <= r.potHi) held.pot++;
    }
    let picks = 0;
    while (nextPick(league) && picks++ < 100) autoDraftUserPick(league);
    finishDraftPhase(league);
    for (const p of Object.values(league.players)) {
      if (p.draft.year !== league.season || p.tid < -1) continue;
      made.add(p.pid);
      last.set(p.pid, { ovr: p.ovr, pot: p.pot });
    }
    for (const p of expiringPlayers(league, league.userTid)) {
      const ask = askingContract(league, p, league.userTid);
      if (p.ovr >= 72) userResign(league, p.pid, ask.amount, ask.years);
    }
    startFreeAgency(league);
    newSeason(league);
    if (league.phase !== 'preseason') throw new Error(`The new season didn't start (phase ${league.phase})`);
    for (const p of Object.values(league.players)) {
      const was = last.get(p.pid);
      // (the players in the league both preseasons: on a team or on the market)
      if (!was || p.tid < -1) continue;
      years.push({
        summer: s + 1,
        pid: p.pid,
        age: playerAge(p, league.season),
        from: was.ovr,
        d: p.ovr - was.ovr,
        dPot: p.pot - was.pot,
        hurt: hurt.get(p.pid) ?? 0,
        slot: p.draft.round ? (p.draft.round - 1) * 30 + p.draft.pick : 0,
        since: league.season - p.draft.year,
        drafted: made.has(p.pid),
        legend: !!p.peak,
      });
    }
    last = new Map(Object.values(league.players).map((p) => [p.pid, { ovr: p.ovr, pot: p.pot }]));
    shapes.push(shapeOf(league, ppg));
  }
  const outcomes: Outcome[] = [];
  for (const p of Object.values(league.players)) {
    const c = made.has(p.pid) ? readCheck(league, p, false) : null;
    if (c) outcomes.push({ slot: c.slot, seasons: c.seasons, miss: c.miss, ovr: p.ovr });
  }
  return { spec, fictional, years, shapes, held, outcomes };
}

const AGE_BANDS: [string, (a: number) => boolean][] = YEAR_BANDS.map((b, i) => [
  i === 0 ? `<=${b.to}` : b.to === Infinity ? `${YEAR_BANDS[i - 1].to + 1}+` : `${YEAR_BANDS[i - 1].to + 1}-${b.to}`,
  (a: number) => yearBand(a) === b,
]);

const PICK_GROUPS: [string, (y: Year) => boolean][] = [
  ['picks 1-10', (y) => y.slot >= 1 && y.slot <= 10],
  ['picks 11-30', (y) => y.slot >= 11 && y.slot <= 30],
  ['second round', (y) => y.slot > 30],
];

function printLeague(r: Report) {
  console.log(`\n--- ${r.spec} (${r.fictional ? 'generated' : 'real'} league)`);
  for (let i = 0; i < r.shapes.length; i++) {
    const sh = r.shapes[i];
    const ys = r.years.filter((y) => y.summer === i);
    const bands = AGE_BANDS.map(([name, is]) => `${name} ${signed(mean(ys.filter((y) => is(y.age)).map((y) => y.d)))}`).join(', ');
    console.log(
      `${sh.season}: ${sh.n} rostered, mean ${sh.mean.toFixed(2)}, 80+ ${sh.c80}, 85+ ${sh.c85}, 90+ ${sh.c90}${
        i ? ` · points ${sh.ppg.toFixed(1)} · year's change ${signed(mean(ys.map((y) => y.d)))} over ${ys.length} (${bands})` : ''
      }`,
    );
  }
}

/** Every measure over a set of leagues; returns the failures. */
function verdict(reports: Report[], label: string): string[] {
  const failures: string[] = [];
  const years = reports.flatMap((r) => r.years.map((y) => ({ ...y, spec: r.spec })));
  if (!years.length) return failures;
  console.log(`\n=== ${label}: ${reports.length} league${reports.length === 1 ? '' : 's'}`);
  // the first summer against the later ones
  const first = years.filter((y) => y.summer === 1);
  const later = years.filter((y) => y.summer > 1);
  const step = mean(first.map((y) => y.d)) - mean(later.map((y) => y.d));
  console.log(
    `Mean OVR change a year: first summer ${signed(mean(first.map((y) => y.d)))} (${first.length}), later summers ${signed(mean(later.map((y) => y.d)))} (${later.length}); step ${signed(step)}`,
  );
  for (const [name, is] of AGE_BANDS) {
    const a = first.filter((y) => is(y.age)).map((y) => y.d);
    const b = later.filter((y) => is(y.age)).map((y) => y.d);
    console.log(`  ${name.padEnd(6)} first ${signed(mean(a))} (${a.length}), later ${signed(mean(b))} (${b.length})`);
  }
  if (later.length && Math.abs(step) > FIRST_STEP) failures.push(`${label}: the first summer's mean change is ${signed(step)} off the later summers' (limit ±${FIRST_STEP})`);
  const count = (i: number, k: 'c80' | 'c85' | 'c90') => mean(reports.filter((r) => r.shapes[i]).map((r) => r.shapes[i][k]));
  const counts = (k: 'c80' | 'c85' | 'c90') =>
    Array.from({ length: Math.max(...reports.map((r) => r.shapes.length)) }, (_, i) => mean(reports.filter((r) => r.shapes[i]).map((r) => r.shapes[i][k])).toFixed(1)).join(' ');
  console.log(`  mean count by preseason: 80+ ${counts('c80')} · 85+ ${counts('c85')} · 90+ ${counts('c90')}`);
  console.log(
    `  points a team game by season: ${Array.from({ length: Math.max(...reports.map((r) => r.shapes.length)) - 1 }, (_, i) => mean(reports.filter((r) => r.shapes[i + 1]).map((r) => r.shapes[i + 1].ppg)).toFixed(1)).join(' ')}`,
  );
  const stars = count(1, 'c85') / Math.max(1e-9, count(0, 'c85')) - 1;
  if (Math.abs(stars) > STARS_STEP) failures.push(`${label}: the 85+ players went ${signed(100 * stars, 0)}% over the first summer (limit ±${100 * STARS_STEP}%)`);

  // one-year swings by age band, against the bands the summer holds
  console.log('One-year swings (OVR, preseason to preseason; injuries: the season before cost him a rating):');
  for (const [i, [name, is]] of AGE_BANDS.entries()) {
    const band = YEAR_BANDS[i];
    const ys = years.filter((y) => is(y.age));
    const ds = ys.map((y) => y.d).sort((a, b) => a - b);
    const out = ys.filter((y) => y.d < band.down - BAND_SLACK || (y.d > band.up + BAND_SLACK && !y.legend));
    const unexplained = out.filter((y) => !(y.d < 0 && y.d + y.hurt >= band.down - BAND_SLACK));
    const pots = ys.filter((y) => Math.abs(y.dPot) > Math.abs(y.d) + 2);
    console.log(
      `  ${name.padEnd(6)} band ${band.down}..+${band.up}: n ${ds.length}, mean ${signed(mean(ds))}, min ${ds[0] ?? 0}, 1% ${quantile(ds, 0.01)}, 5% ${quantile(ds, 0.05)}, median ${quantile(ds, 0.5)}, 95% ${signed(quantile(ds, 0.95), 0)}, 99% ${signed(quantile(ds, 0.99), 0)}, max ${signed(ds[ds.length - 1] ?? 0, 0)} · past the band ${out.length} (${out.length - unexplained.length} an injury's) · POT moved 3+ more than OVR ${pots.length}`,
    );
    for (const y of unexplained.slice(0, 5))
      console.log(`      ${y.spec} summer ${y.summer}: pid ${y.pid}, ${y.age}, ${y.from} -> ${y.from + y.d} (${signed(y.d, 0)}; injuries ${y.hurt})`);
    if (unexplained.length)
      failures.push(`${label}: ${unexplained.length} one-year swing${unexplained.length === 1 ? '' : 's'} at ${name} past ${band.down}..+${band.up} without an injury`);
  }
  const hurtBig = years.filter((y) => y.hurt >= 3);
  console.log(
    `  injuries' lasting damage: ${years.filter((y) => y.hurt > 0).length} player-years lost OVR to one (mean ${mean(years.filter((y) => y.hurt > 0).map((y) => y.hurt)).toFixed(1)}), ${hurtBig.length} lost 3 or more (the most ${Math.max(0, ...years.map((y) => y.hurt))})`,
  );
  const kids = years.filter((y) => y.age <= 22);
  console.log(`  22 and under: OVR ${signed(mean(kids.map((y) => y.d)))} a year, POT ${signed(mean(kids.map((y) => y.dPot)))} (${kids.length})`);

  // draft picks' first four summers, by where they were picked (the league's own classes)
  const picks = years.filter((y) => y.drafted && y.since >= 1 && y.since <= 4);
  if (picks.length) {
    console.log('Draft picks, mean OVR change by summer since the draft (1 = the summer he was picked):');
    for (const [name, is] of PICK_GROUPS) {
      const g = picks.filter(is);
      const by = [1, 2, 3, 4].map((k) => {
        const ds = g.filter((y) => y.since === k).map((y) => y.d);
        return `${signed(mean(ds))} (${ds.length})`;
      });
      const to23 = g.filter((y) => y.age <= 23).map((y) => y.d);
      const jumps = g.filter((y) => y.d >= 5).length;
      const down = g.filter((y) => y.d < 0).length;
      console.log(
        `  ${name.padEnd(13)} ${by.join(' · ')} · through 23: ${signed(mean(to23))} a summer (${to23.length}) · years of +5 or more ${((100 * jumps) / Math.max(1, g.length)).toFixed(0)}%, years down ${((100 * down) / Math.max(1, g.length)).toFixed(0)}%`,
      );
    }
    const top = picks.filter(PICK_GROUPS[0][1]);
    const gain = mean(top.filter((y) => y.age <= 23).map((y) => y.d));
    if (gain < TOP_TEN_GAIN) failures.push(`${label}: picks 1-10 gain ${signed(gain)} a summer through 23 (at least +${TOP_TEN_GAIN})`);
    // a top-ten pick lower after three summers than on draft night
    const careers = new Map<string, Year[]>();
    for (const y of top) careers.set(`${y.spec}:${y.pid}`, [...(careers.get(`${y.spec}:${y.pid}`) ?? []), y]);
    const three = [...careers.values()].filter((c) => c.length >= 3);
    const back = three.filter((c) => c.slice(0, 3).reduce((a, y) => a + y.d, 0) < 0);
    const allDown = three.filter((c) => c.slice(0, 3).every((y) => y.d < 0));
    console.log(`  picks 1-10 with three summers: ${three.length}; lower than on draft night after them ${back.length}; down all three ${allDown.length}`);
    if (three.length >= 20 && back.length / three.length > TOP_TEN_BACK)
      failures.push(`${label}: ${back.length} of ${three.length} top-ten picks were lower after three summers than on draft night (at most ${100 * TOP_TEN_BACK}%)`);
    // second-rounders' years of +5, a class (over all of its summers so far)
    const late = picks.filter((y) => y.slot > 30 && y.d >= 5);
    const classes = new Set(picks.filter((y) => y.slot > 30).map((y) => `${y.spec}:${y.summer - y.since}`)).size;
    console.log(
      `  second-rounders' years of +5 or more: ${late.length} over ${classes} classes (${(late.length / Math.max(1, classes)).toFixed(1)} a class, all their summers so far)`,
    );
    if (classes && late.length / classes > LATE_JUMPS) failures.push(`${label}: ${(late.length / classes).toFixed(1)} second-round years of +5 a class (at most ${LATE_JUMPS})`);
    // where the classes with four summers stand (the design's tails: a top-three pick can miss, a late pick can hit)
    const four = reports.flatMap((r) => r.outcomes.filter((o) => o.seasons >= 4));
    const of = (from: number, to: number) => four.filter((o) => o.slot >= from && o.slot <= to);
    const lvl = (xs: Outcome[]) => mean(xs.map((o) => o.ovr)).toFixed(1);
    console.log(
      `  four seasons on: picks 1-3 at ${lvl(of(1, 3))} (${of(1, 3).filter((o) => o.ovr < 76).length} of ${of(1, 3).length} under 76), picks 1-10 at ${lvl(of(1, 10))}, picks 11-30 at ${lvl(of(11, 30))} (${of(11, 30).filter((o) => o.ovr >= 82).length} of ${of(11, 30).length} at 82+), second-rounders still in the league at ${lvl(of(31, 60))} (${of(31, 60).filter((o) => o.ovr >= 78).length} of ${of(31, 60).length} at 78+)`,
    );
  }
  // the scouting: the staff's ranges on draft night, and how far picks end from the room's read of their POT
  const held = reports.reduce((a, r) => ({ ovr: a.ovr + r.held.ovr, pot: a.pot + r.held.pot, n: a.n + r.held.n }), { ovr: 0, pot: 0, n: 0 });
  if (held.n) {
    console.log(
      `Scouting: the staff's ranges on draft night held his OVR ${((100 * held.ovr) / held.n).toFixed(0)}% and his POT ${((100 * held.pot) / held.n).toFixed(0)}% of the time (${held.n} reads; they say ${100 * RANGE_HOLD}%)`,
    );
    for (const k of ['ovr', 'pot'] as const)
      if (Math.abs(held[k] / held.n - RANGE_HOLD) > RANGE_SLACK)
        failures.push(`${label}: the staff's ${k.toUpperCase()} ranges held ${((100 * held[k]) / held.n).toFixed(0)}% of the time (${100 * RANGE_HOLD}% ± ${100 * RANGE_SLACK})`);
  }
  const judged = reports.flatMap((r) => r.outcomes.filter((o) => o.seasons >= OUTCOME_SEASONS));
  for (const t of PICK_TIERS) {
    const xs = judged.filter((o) => tierOfSlot(o.slot) === t).map((o) => o.miss);
    if (!xs.length) continue;
    const abs = xs.map(Math.abs).sort((a, b) => a - b);
    const med = quantile(abs, 0.5);
    console.log(
      `  ${t.label.padEnd(13)} ${xs.length} picks ${OUTCOME_SEASONS}+ seasons on: median miss of the room's POT read ${med} (mean ${signed(mean(xs))}, 80% within ${quantile(abs, 0.8)}); the screen's figure ${OUTCOME_MISS[t.id]}`,
    );
    if (Math.abs(med - OUTCOME_MISS[t.id]) > OUTCOME_SLACK)
      failures.push(`${label}: ${t.label} miss the room's POT read by a median ${med}; prospects.ts OUTCOME_MISS says ${OUTCOME_MISS[t.id]}`);
  }
  return failures;
}

/** Every league in its own process, as many at once as there are cores. */
async function playLeagues() {
  const t0 = performance.now();
  const self = fileURLToPath(import.meta.url);
  const all: Report[] = [];
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < specs.length) {
      const spec = specs[next++];
      const child = fork(self, [String(seasons), spec], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
      let out = '';
      child.stdout!.on('data', (d) => (out += d));
      const report = await new Promise<Report>((resolve, reject) => {
        let got: Report | null = null;
        child.on('message', (m) => (got = m as Report));
        child.on('exit', (code) => (got ? resolve(got) : reject(new Error(`League ${spec} stopped (exit ${code}):\n${out}`))));
      });
      all.push(report);
    }
  };
  await Promise.all(Array.from({ length: Math.min(specs.length, Math.max(1, availableParallelism())) }, run));
  finish(specs.map((s) => all.find((r) => r.spec === s)!));
  console.log(`${specs.length} leagues of ${seasons} seasons in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
}

function finish(all: Report[]) {
  for (const r of all) printLeague(r);
  const failures = [
    ...verdict(
      all.filter((r) => !r.fictional),
      'Real leagues',
    ),
    ...verdict(
      all.filter((r) => r.fictional),
      'Generated leagues',
    ),
  ];
  console.log(failures.length ? `\nFAIL\n${failures.map((f) => `  ${f}`).join('\n')}` : '\nPASS');
  process.exitCode = failures.length ? 1 : 0;
}

if (specs.length === 1 && process.send) process.send(playLeague(specs[0]));
else if (specs.length === 1) finish([playLeague(specs[0])]);
else void playLeagues();
