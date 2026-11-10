// The digest: reads whichever of a run's levers.json, coverage.json and league.json exist and writes
// summary.md beside them. Each part refreshes it when it finishes; run.ts writes it at the end.
// Usage: npx tsx scripts/tactics-lab/summary.ts <label>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fix, isMain, mdTable, outDir, parseArgs, pct, readJson, sign } from './common';
import type { LeversOut, SideStats } from './levers';
import type { CoverageOut } from './coverage';
import type { LeagueOut } from './league';

const PT_ORDER = ['transition', 'iso', 'pnrBH', 'pnrRoll', 'post', 'spotup', 'handoff', 'offscreen', 'cut', 'putback', 'misc'];
const PT_SHORT: Record<string, string> = {
  transition: 'trans',
  iso: 'iso',
  pnrBH: 'pnrBH',
  pnrRoll: 'roll',
  post: 'post',
  spotup: 'spot',
  handoff: 'hand',
  offscreen: 'offscr',
  cut: 'cut',
  putback: 'putb',
  misc: 'misc',
};
const SYN_SHORT: Record<string, string> = {
  isolation: 'iso',
  transition: 'trans',
  pnrBH: 'pnrBH',
  pnrRoll: 'roll',
  post: 'post',
  spotup: 'spot',
  handoff: 'hand',
  offscreen: 'offscr',
  cut: 'cut',
  putback: 'putb',
};

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN;
};

const ptKinds = (xs: Record<string, number>[]) => {
  const seen = new Set(xs.flatMap((x) => Object.keys(x)));
  return [...PT_ORDER.filter((k) => seen.has(k)), ...[...seen].filter((k) => !PT_ORDER.includes(k)).sort()];
};

/** A side's change: possessions a game, then rates in percentage points. */
const statCells = (s: SideStats | undefined) =>
  s
    ? [sign(s.poss, 1), sign(s.threeRate * 100, 1), sign(s.rimRate * 100, 1), sign(s.ftRate * 100, 1), sign(s.tov * 100, 1), sign(s.orb * 100, 1), sign(s.efg * 100, 1)]
    : Array(7).fill('');

function leversSection(lv: LeversOut): string {
  const out: string[] = [];
  const b = lv.base;
  out.push('## Part 1: levers');
  out.push('');
  out.push(
    `${lv.params.games} paired games in each of ${lv.params.matchups.length} matchups (side A first; seeds ${lv.params.matchups.map((m) => `${m.a}-${m.b} ${m.seed}`).join(', ')}). Net is side A's change in points per 100 possessions against its own settings, the mean of the six paired deltas; ± is that mean's standard error. "+/6": matchups where it came out positive. "Inert": matchups where the patched games were exactly the base games (the setting changed nothing there). The other columns are mean changes: possessions a game, rates in percentage points (3PA rate, rim share and FT rate per FGA, TOV per possession, ORB%, eFG).`,
  );
  out.push('');
  out.push(
    `Base (six matchups averaged): side A net ${sign(b.net)}, ${fix(b.pace, 1)} possessions. Side A: 3PA rate ${fix(b.own.threeRate, 3)}, rim ${fix(b.own.rimRate, 3)}, FT rate ${fix(b.own.ftRate, 3)}, TOV ${fix(b.own.tov, 3)}, ORB ${fix(b.own.orb, 3)}, eFG ${fix(b.own.efg, 3)}. Opponents: 3PA rate ${fix(b.opp.threeRate, 3)}, rim ${fix(b.opp.rimRate, 3)}, FT rate ${fix(b.opp.ftRate, 3)}, TOV ${fix(b.opp.tov, 3)}, ORB ${fix(b.opp.orb, 3)}, eFG ${fix(b.opp.efg, 3)}.`,
  );
  out.push('');
  out.push(
    `The teams' own settings (offensive/defensive preset, scheme, coverage): ${lv.sides.map((s) => `${s.abbrev} ${s.offPreset}/${s.defPreset} (${String(s.defense.scheme)}, ${String(s.defense.pnr)})`).join('; ')}.`,
  );
  out.push('');
  const ok = lv.rows.filter((r) => r.status === 'ok');
  const medSE = median(ok.map((r) => r.se!));
  out.push(
    `Reading across runs: two runs (other seeds, or another engine) don't share their games, so a setting's net differs between them by about √2 × its SE by chance alone (here ${fix(Math.SQRT2 * medSE)} for the median SE): differences under about ${fix(2 * Math.SQRT2 * medSE, 1)} per 100 are noise.`,
  );
  out.push('');
  const statHead = ['poss', '3PAr', 'rim', 'FTr', 'TOV', 'ORB', 'eFG'];
  out.push(
    mdTable(
      ['Setting', 'Net/100', '+/6', 'Inert', ...statHead.map((h) => `A ${h}`), ...statHead.map((h) => `Opp ${h}`)],
      ok.map((r) => [
        r.name,
        `${sign(r.net!)} ± ${fix(r.se!)}`,
        `${r.positive}/${r.perMatchup!.length}`,
        r.inert!.length ? r.inert!.join(' ') : '',
        ...statCells(r.own),
        ...statCells(r.opp),
      ]),
    ),
  );
  out.push('');
  out.push('Per matchup (net per 100, side A):');
  out.push('');
  out.push(
    mdTable(
      ['Setting', ...lv.params.matchups.map((m) => `${m.a}-${m.b}`)],
      ok.map((r) => [r.name, ...r.perMatchup!.map((m) => (m.inert ? 'inert' : sign(m.delta)))]),
    ),
  );
  for (const who of ['own', 'opp'] as const) {
    const kinds = ptKinds([b[who].playTypes]);
    out.push('');
    out.push(who === 'own' ? "Side A's play-type shares (base, %), and each setting's change (pp):" : "The opponents' play-type shares (base, %), and each setting's change (pp):");
    out.push('');
    out.push(
      mdTable(
        ['Setting', ...kinds.map((k) => PT_SHORT[k] ?? k)],
        [['base', ...kinds.map((k) => pct(b[who].playTypes[k]))], ...ok.map((r) => [r.name, ...kinds.map((k) => sign((r[who]!.playTypes[k] ?? 0) * 100, 1))])],
      ),
    );
  }
  const off = lv.rows.filter((r) => r.status !== 'ok');
  if (off.length) {
    out.push('');
    out.push('Not measured:');
    out.push('');
    for (const r of off) out.push(`- ${r.name}: ${r.status} (${r.reason})`);
  }
  if (!lv.params.schema) {
    out.push('');
    out.push("(The engine's TacticsPatch type couldn't be read, so no setting was checked against it before running.)");
  }
  return out.join('\n');
}

function coverageSection(cv: CoverageOut): string {
  const out: string[] = [];
  const choices = cv.params.choices.slice(1);
  out.push('## Part 2: defensive choices by opponent');
  out.push('');
  out.push(
    `Defenses ${cv.params.defenses.join(', ')} (patched, side A) against nine offenses, ${cv.params.games} paired games a cell. Each cell: the defense's net per 100 with the choice against drop coverage (positive: better for the defense), averaged over the three defenses; ± is that mean's standard error. Drop, hedge, ice and blitz are played without off-ball switches, switch with them.`,
  );
  out.push('');
  out.push(
    `The defenses' own settings: ${cv.defenses.map((s) => `${s.abbrev} ${s.defPreset} (${String(s.defense.scheme)}, ${String(s.defense.pnr)}, switchOffBall ${String(s.defense.switchOffBall)})`).join('; ')}.`,
  );
  if (cv.cells.some((c) => c.manGuard))
    out.push(`Played in man by adding scheme 'man' (their own scheme is a zone): ${[...new Set(cv.cells.filter((c) => c.manGuard).map((c) => c.def))].join(', ')}.`);
  const rowSE = median(cv.byOffense.flatMap((r) => Object.values(r.choices).map((c) => c.se)));
  const allSE = median(Object.values(cv.overall).map((c) => c.se));
  out.push(
    `Across runs (other seeds or another engine), differences under about ${fix(2 * Math.SQRT2 * rowSE, 1)} per 100 in a row, or ${fix(2 * Math.SQRT2 * allSE, 1)} in the 27-cell average, are noise.`,
  );
  out.push('');
  out.push(
    mdTable(
      ['Offense', ...choices],
      [
        ...cv.byOffense.map((r) => [r.off, ...choices.map((c) => (r.choices[c] ? `${sign(r.choices[c].net)} ± ${fix(r.choices[c].se)}` : 'n/a'))]),
        ['**All 27 cells**', ...choices.map((c) => (cv.overall[c] ? `**${sign(cv.overall[c].net)} ± ${fix(cv.overall[c].se)}**` : 'n/a'))],
        ['cells positive', ...choices.map((c) => (cv.overall[c] ? `${cv.overall[c].positive}/${cv.overall[c].cells}` : ''))],
      ],
    ),
  );
  if (cv.params.skipped.length) {
    out.push('');
    out.push(`Not measured: ${cv.params.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}.`);
  }
  if (cv.errors.length) {
    out.push('');
    out.push(`Errors: ${cv.errors.join('; ')}.`);
  }
  return out.join('\n');
}

function leagueSection(lg: LeagueOut): string {
  const out: string[] = [];
  out.push('## Part 3: the AI league as it plays');
  out.push('');
  const user = lg.samples[0] ? lg.samples[0].userTid : lg.params.userTid;
  out.push(
    `The real league on rngSeed ${lg.params.rngSeed}, ${lg.params.seasons} season(s) through the season runner, every team on automatic tactics (the user's team, tid ${user}, run by its staff). Sampled twice a season (day ${lg.params.earlyDay}, and the day after the All-Star Game): every team ${lg.params.perTeam} games against random opponents, built as the season builds them, nothing written back; ${lg.adjustments.games} sampled games in all. Season simulation ${lg.timing.map((t) => `${t.season} ${t.simSeconds}s`).join(', ')}; sampling ${lg.timing.map((t) => `${t.sampleSeconds}s`).join(', ')}.`,
  );
  // (b)
  out.push('');
  out.push('### Ball-screen coverage and schemes');
  out.push('');
  const covKeys = [...new Set([...Object.keys(lg.coverage.overall.shares)])].sort((a, b) => (lg.coverage.overall.shares[b] ?? 0) - (lg.coverage.overall.shares[a] ?? 0));
  out.push('Share of trips with a ball screen, by the coverage on it (%):');
  out.push('');
  out.push(
    mdTable(
      ['Seasons', 'trips', ...covKeys],
      [
        ...lg.coverage.bySeason.map((s) => [String(s.season), s.trips, ...covKeys.map((k) => fix(s.shares[k] ?? 0, 1))]),
        ['all', lg.coverage.overall.trips, ...covKeys.map((k) => fix(lg.coverage.overall.shares[k] ?? 0, 1))],
      ],
    ),
  );
  const schKeys = Object.keys(lg.coverage.overall.schemeShares).sort((a, b) => lg.coverage.overall.schemeShares[b] - lg.coverage.overall.schemeShares[a]);
  out.push('');
  out.push('Share of half-court trips by the defense played (%):');
  out.push('');
  out.push(
    mdTable(
      ['Seasons', 'trips', ...schKeys],
      [
        ...lg.coverage.bySeason.map((s) => [String(s.season), s.halfTrips, ...schKeys.map((k) => fix(s.schemeShares[k] ?? 0, 2))]),
        ['all', lg.coverage.overall.halfTrips, ...schKeys.map((k) => fix(lg.coverage.overall.schemeShares[k] ?? 0, 2))],
      ],
    ),
  );
  // (c)
  out.push('');
  out.push('### In-game adjustments');
  out.push('');
  out.push(
    `${fix(lg.adjustments.perGame)} a game (both teams; ${fix(lg.adjustments.perTeamGame)} a team-game), ${lg.adjustments.total} in ${lg.adjustments.games} games${lg.adjustments.bySeason.length > 1 ? ` (by season: ${lg.adjustments.bySeason.map((s) => `${s.season} ${fix(s.perGame)}`).join(', ')})` : ''}.`,
  );
  out.push('');
  out.push(
    mdTable(
      ['Adjustment', 'count', 'share'],
      Object.entries(lg.adjustments.byText).map(([k, v]) => [k, v, `${fix((v / Math.max(1, lg.adjustments.total)) * 100, 1)}%`]),
    ),
  );
  // (d)
  out.push('');
  out.push("### Team stats from the seasons' results (30 teams)");
  out.push('');
  const st = ['pace', 'threeRate', 'orb', 'tov', 'ftRate', 'oppTov'] as const;
  const stName: Record<string, string> = { pace: 'pace (poss/g)', threeRate: '3PA rate', orb: 'ORB%', tov: 'TOV/poss', ftRate: 'FT rate', oppTov: 'opp TOV/poss' };
  out.push(
    mdTable(
      ['Season', ...st.map((k) => `${stName[k]} mean (SD)`)],
      lg.teamStats.map((s) => [
        String(s.season),
        ...st.map((k) => (k === 'pace' ? `${fix(s.summary[k].mean, 1)} (${fix(s.summary[k].sd, 2)})` : `${fix(s.summary[k].mean, 3)} (${fix(s.summary[k].sd, 3)})`)),
      ]),
    ),
  );
  // (e)
  out.push('');
  out.push('### Presets and the glass');
  out.push('');
  out.push(
    `Offensive presets over the samples (team-samples): ${Object.entries(lg.presets.offPresets)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}. Defensive: ${Object.entries(lg.presets.defPresets)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}.`,
  );
  out.push('');
  out.push(
    `Correlation across teams of crashBoards with the opponents' transition share (Synergy finish): ${lg.presets.corrCrashOppTransition.map((c) => `${c.season} ${c.point} ${sign(c.r)}`).join(', ')}; pooled ${sign(lg.presets.pooled.r)} (n ${lg.presets.pooled.n}). With the opponents' run-outs (the log's transition trips): pooled ${sign(lg.presets.pooled.rRunouts)}. getBack with the opponents' transition share: pooled ${sign(lg.presets.pooled.rGetBack)}.`,
  );
  const first = lg.presets.samples[0];
  if (first) {
    out.push('');
    out.push(
      `By team at the first sample (${first.season} ${first.point}); the opponents' transition share is that sample's; the last column lists the presets at every sample in order, when they changed:`,
    );
    out.push('');
    const history = (tid: number) => {
      const seq = lg.presets.samples.map((s) => `${String(s.teams[tid].offPreset)}/${String(s.teams[tid].defPreset)}`);
      const runs = seq.filter((x, i) => i === 0 || x !== seq[i - 1]);
      return runs.length > 1 ? runs.join(' → ') : 'same';
    };
    out.push(
      mdTable(
        ['Team', 'off preset', 'def preset', 'scheme', 'pnr', 'pace', 'crash', 'getBack', 'opp trans %', 'presets over the samples'],
        first.teams.map((t) => [
          t.abbrev,
          String(t.offPreset),
          String(t.defPreset),
          String(t.scheme),
          String(t.pnr),
          String(t.pace),
          String(t.crashBoards),
          String(t.getBack),
          fix(t.oppTransition, 1),
          history(t.tid),
        ]),
      ),
    );
  }
  out.push('');
  out.push('Coverage by team over every sample (% of its defensive trips with a ball screen; non-man: % of its half-court trips in a zone or junk defense):');
  out.push('');
  out.push(
    mdTable(
      ['Team', 'trips', ...covKeys, 'non-man'],
      lg.coverage.teams.map((t) => [t.abbrev, t.trips, ...covKeys.map((k) => fix(t.shares[k] ?? 0, 1)), fix(100 - (t.schemeShares.man ?? 100), 1)]),
    ),
  );
  // (a) + (f)
  out.push('');
  out.push('### Play types against real NBA Synergy data');
  out.push('');
  if (lg.synergy.kinds.length) {
    out.push(
      `Shares of the ten Synergy kinds, percent: the sim's possessions by their last finish as each game result tallies them (the box score's and the lab's play types), its misc left out; NBA.com's plays, renormalised to the ten. Real: ${lg.synergy.file}. r = correlation across the 30 teams; "sim1" is the first simulated season (${lg.playTypes[0]?.season}). The sim counts possessions, Synergy plays (an offensive board starts a new one): compare order and spread, not exact levels.`,
    );
    out.push('');
    out.push(
      mdTable(
        [
          'Kind',
          'sim1 mean',
          'real 25-26',
          'real 24-25',
          'sim1 SD',
          'real SD 25-26',
          'real SD 24-25',
          'r sim1~real 25-26',
          'r sim1~real 24-25',
          'r real 24-25~25-26',
          'r sim1~sim2',
          'r sim2~sim3',
          'sim PPP',
          'real PPP 25-26',
        ],
        lg.synergy.kinds.map((k) => [
          k.kind,
          fix(k.simMean, 1),
          fix(k.real26Mean, 1),
          fix(k.real25Mean, 1),
          fix(k.simSD, 2),
          fix(k.real26SD, 2),
          fix(k.real25SD, 2),
          sign(k.corrSim1Real26),
          sign(k.corrSim1Real25),
          sign(k.corrReal25Real26),
          sign(k.corrSim1Sim2),
          sign(k.corrSim2Sim3),
          fix(k.simPPP, 3),
          fix(k.real26PPP, 3),
        ]),
      ),
    );
  }
  if (lg.synergy.note) {
    out.push('');
    out.push(`(${lg.synergy.note})`);
  }
  const pt1 = lg.playTypes[0];
  if (pt1) {
    const kinds = Object.keys(pt1.league.shares);
    out.push('');
    out.push(`Play-type shares by team, ${pt1.season} (percent of the ten kinds; misc as a share of all possessions):`);
    out.push('');
    out.push(
      mdTable(
        ['Team', ...kinds.map((k) => SYN_SHORT[k] ?? k), 'misc', 'poss'],
        [...pt1.teams, pt1.league].map((t) => [t.abbrev, ...kinds.map((k) => fix(t.shares[k], 1)), fix(t.miscShare, 1), t.poss]),
      ),
    );
    out.push('');
    out.push(
      `Points per possession by kind, ${pt1.season}, league: ${Object.entries(pt1.league.ppp)
        .map(([k, v]) => `${SYN_SHORT[k] ?? k} ${fix(v, 3)}`)
        .join(', ')}.`,
    );
  }
  if (lg.logFinishShares && Object.keys(lg.logFinishShares).length) {
    out.push('');
    out.push(
      `The possession log's own finish field is the first shot's play type (a putback is never first), so the play types above come from the game results. By the log's field, all samples (% of possessions): ${Object.entries(
        lg.logFinishShares,
      )
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${fix(v, 1)}`)
        .join(', ')}.`,
    );
  }
  if (Object.keys(lg.unmapped).length) {
    out.push('');
    out.push(
      `Finish types with no Synergy kind (counted as misc): ${Object.entries(lg.unmapped)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}.`,
    );
  }
  return out.join('\n');
}

export function writeSummary(label: string): string {
  const lv = readJson<LeversOut>(label, 'levers.json');
  const cv = readJson<CoverageOut>(label, 'coverage.json');
  const lg = readJson<LeagueOut>(label, 'league.json');
  const run = readJson<{ seconds: number; started: string; workers: number; serial: boolean }>(label, 'run.json');
  const metas = [lv?.meta, cv?.meta, lg?.meta].filter((m): m is NonNullable<typeof m> => !!m);
  const quick = !!(lv?.params.quick || cv?.params.quick || lg?.params.quick);
  const head: string[] = [`# Tactics lab: ${label}`, ''];
  if (metas.length) {
    const m = metas[0];
    const times = [
      lv ? `levers ${lv.meta.seconds}s` : '',
      cv ? `coverage ${cv.meta.seconds}s` : '',
      lg ? `league ${lg.meta.seconds}s` : '',
      run ? `whole run ${run.seconds}s (${run.workers} workers${run.serial ? ', parts in series' : ', league part beside the lab parts'})` : '',
    ];
    head.push(
      `Engine commit ${m.commit}${metas.some((x) => x.srcDirty) ? ' (with uncommitted changes under src/)' : ''}, node ${m.node}. Runtimes: ${times.filter(Boolean).join(', ')}. Started ${metas.map((x) => x.started).sort()[0]}.${quick ? ' Quick sizes (--quick).' : ''}`,
    );
    head.push('');
    head.push(`Re-run: \`npx tsx scripts/tactics-lab/run.ts <label>\` (all three parts; \`levers.ts\`, \`coverage.ts\`, \`league.ts\` alone; \`--quick\` for small sizes).`);
  } else head.push('No results yet.');
  const parts = [head.join('\n'), lv ? leversSection(lv) : '', cv ? coverageSection(cv) : '', lg ? leagueSection(lg) : ''].filter(Boolean);
  const file = join(outDir(label), 'summary.md');
  writeFileSync(file, parts.join('\n\n') + '\n');
  console.log(`[summary] ${file}`);
  return file;
}

if (isMain(import.meta.url)) writeSummary(parseArgs().label);
