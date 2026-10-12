// TEST UTILITY ONLY: writes Basketball-Reference-shaped HTML for a simulated fictional league
// so the seed pipeline (parse → derive → calibrate) can be exercised end to end offline.
// Usage: tsx scripts/data/test/make-fixture.ts <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLeague, defaultSettings } from '../../../src/core/league/create';
import { GameSim } from '../../../src/core/sim/engine';
import { Rng } from '../../../src/core/random';
import { teamPlayers } from '../../../src/core/league/helpers';
import { FRANCHISES } from '../../../src/core/teams';
import { contractExp, salaryFor } from '../../../src/core/playerGen';

const out = process.argv[2];
if (!out) {
  console.error('Usage: tsx scripts/data/test/make-fixture.ts <outDir>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const league = createLeague({ name: 'fx', userTid: 0, coachName: 'x', settings: { ...defaultSettings(), injuries: false }, seed: null, rngSeed: 5 });
const id = (pid: number) => `fx${String(pid).padStart(5, '0')}01`;
const cell = (stat: string, v: string | number, extra = '') => `<td data-stat="${stat}"${extra}>${v}</td>`;
const wrap = (tableId: string, rows: string[]) =>
  `<html><body>${'x'.repeat(6000)}<!-- <table id="${tableId}"><thead><tr><th data-stat="ranker">Rk</th></tr></thead><tbody>${rows.join('')}</tbody></table> --></body></html>`;
for (const season of [2024, 2025, 2026]) {
  const rng = new Rng(season);
  const acc = new Map<number, Record<string, number>>();
  const rosters = league.teams.map((t) => teamPlayers(league, t.tid));
  for (let g = 0; g < 450; g++) {
    const h = g % 30;
    const a = (h + 1 + Math.floor(rng.next() * 29)) % 30;
    const sim = new GameSim({ team: league.teams[h], players: rosters[h] }, { team: league.teams[a], players: rosters[a] }, { rng, type: 'regular', injuries: false });
    sim.simToEnd();
    for (const rb of sim.rawBoxes()) {
      if (rb.b.sec <= 0) continue;
      const e = acc.get(rb.pid) ?? { g: 0, sec: 0, fg: 0, fga: 0, fg3: 0, fg3a: 0, ft: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0, tUse: 0 };
      const b = rb.b;
      e.g++;
      e.sec += b.sec;
      e.fg += b.fgm;
      e.fga += b.fga;
      e.fg3 += b.tpm;
      e.fg3a += b.tpa;
      e.ft += b.ftm;
      e.fta += b.fta;
      e.orb += b.orb;
      e.drb += b.drb;
      e.ast += b.ast;
      e.stl += b.stl;
      e.blk += b.blk;
      e.tov += b.tov;
      e.pf += b.pf;
      e.pts += b.pts;
      e.tUse += b.tFga + 0.44 * b.tFta + b.tTov;
      acc.set(rb.pid, e);
    }
  }
  const pg: string[] = [];
  const adv: string[] = [];
  for (const [pid, e] of acc) {
    const p = league.players[pid];
    const team = FRANCHISES[p.tid].bbref;
    const per = (v: number) => (v / e.g).toFixed(1);
    const name = `<td data-stat="name_display" data-append-csv="${id(pid)}"><a href="/players/f/${id(pid)}.html">${p.firstName} ${p.lastName}</a></td>`;
    pg.push(
      `<tr><th data-stat="ranker">1</th>${name}${cell('age', season - p.bornYear)}${cell('team_name_abbr', team)}${cell('pos', p.pos)}${cell('games', e.g)}${cell('games_started', 0)}${cell('mp_per_g', (e.sec / 60 / e.g).toFixed(1))}${cell('fg_per_g', per(e.fg))}${cell('fga_per_g', per(e.fga))}${cell('fg3_per_g', per(e.fg3))}${cell('fg3a_per_g', per(e.fg3a))}${cell('fg2_per_g', per(e.fg - e.fg3))}${cell('fg2a_per_g', per(e.fga - e.fg3a))}${cell('ft_per_g', per(e.ft))}${cell('fta_per_g', per(e.fta))}${cell('orb_per_g', per(e.orb))}${cell('drb_per_g', per(e.drb))}${cell('ast_per_g', per(e.ast))}${cell('stl_per_g', per(e.stl))}${cell('blk_per_g', per(e.blk))}${cell('tov_per_g', per(e.tov))}${cell('pf_per_g', per(e.pf))}${cell('pts_per_g', per(e.pts))}</tr>`,
    );
    const mins = e.sec / 60;
    const usg = ((e.fga + 0.44 * e.fta + e.tov) / Math.max(1, e.tUse)) * 100;
    adv.push(
      `<tr>${name}${cell('team_name_abbr', team)}${cell('games', e.g)}${cell('mp', Math.round(mins))}${cell('per', 15)}${cell('ts_pct', (e.pts / (2 * (e.fga + 0.44 * e.fta) || 1)).toFixed(3))}${cell('usg_pct', usg.toFixed(1))}${cell('ast_pct', ((e.ast / mins) * 48 * 2.4).toFixed(1))}${cell('orb_pct', ((e.orb / mins) * 48 * 0.9).toFixed(1))}${cell('drb_pct', ((e.drb / mins) * 48 * 0.75).toFixed(1))}${cell('stl_pct', ((e.stl / mins) * 48 * 1.0).toFixed(1))}${cell('blk_pct', ((e.blk / mins) * 48 * 1.6).toFixed(1))}${cell('tov_pct', ((e.tov / Math.max(1, e.fga + 0.44 * e.fta + e.tov)) * 100).toFixed(1))}${cell('obpm', ((p.ovr - 72) / 4).toFixed(1))}${cell('dbpm', ((p.ratings.diq - 50) / 15).toFixed(1))}${cell('bpm', ((p.ovr - 72) / 3).toFixed(1))}${cell('ws', 2)}${cell('ws_per_48', 0.1)}${cell('vorp', ((p.ovr - 70) / 6).toFixed(1))}</tr>`,
    );
  }
  pg.push(`<tr class="norank"><th data-stat="ranker"></th><td data-stat="name_display">League Average</td>${cell('fga_per_g', 88)}</tr>`);
  writeFileSync(join(out, `per_game_${season}.html`), wrap('per_game_stats', pg));
  writeFileSync(join(out, `advanced_${season}.html`), wrap('advanced', adv));
}
const cr: string[] = [];
for (const p of Object.values(league.players)) {
  if (p.tid < 0) continue;
  const ys: string[] = [];
  for (let i = 0; i < contractExp(p.contract) - 2027 + 1 && i < 6; i++)
    ys.push(cell(`y${i + 1}`, `$${(salaryFor(p, 2027 + i) * 1000).toLocaleString('en-US')}`, i === contractExp(p.contract) - 2027 ? ' class="right salary-pl"' : ''));
  cr.push(
    `<tr><th data-stat="ranker">1</th><td data-stat="player" data-append-csv="${id(p.pid)}"><a href="/players/f/${id(p.pid)}.html">${p.firstName} ${p.lastName}</a></td>${cell('team_id', FRANCHISES[p.tid].bbref)}${ys.join('')}</tr>`,
  );
}
writeFileSync(
  join(out, 'contracts.html'),
  `<html><body>${'x'.repeat(6000)}<table id="player-contracts"><thead><tr></tr><tr><th data-stat="y1">2026-27</th></tr></thead><tbody>${cr.join('')}</tbody></table></body></html>`,
);
for (const t of league.teams) {
  const rows = teamPlayers(league, t.tid).map(
    (p) =>
      `<tr>${cell('number', p.jersey)}<td data-stat="player" data-append-csv="${id(p.pid)}"><a href="/players/f/${id(p.pid)}.html">${p.firstName} ${p.lastName}</a></td>${cell('pos', p.pos)}${cell('height', `${Math.floor(p.heightIn / 12)}-${p.heightIn % 12}`)}${cell('weight', p.weightLb)}<td data-stat="birth_date" csk="${p.bornYear - 1}0815">x</td>${cell('flag', 'us')}${cell('years_experience', p.experience || 'R')}${cell('college', p.college)}</tr>`,
  );
  writeFileSync(join(out, `roster_${FRANCHISES[t.tid].bbref}_2027.html`), wrap('roster', rows));
}
// draft pages; every fourth player has no row, like an undrafted one (his class comes from his experience)
const draftRows = new Map<number, string[]>();
for (const p of Object.values(league.players)) {
  if (p.tid < 0 || p.pid % 4 === 0 || !p.draft.round) continue;
  const row = `<tr>${cell('pick_overall', (p.draft.round - 1) * 30 + p.draft.pick)}<td data-stat="player" data-append-csv="${id(p.pid)}"><a href="/players/f/${id(p.pid)}.html">${p.firstName} ${p.lastName}</a></td>${cell('team_id', FRANCHISES[p.tid].bbref)}${cell('college_name', p.college)}</tr>`;
  draftRows.set(p.draft.year, [...(draftRows.get(p.draft.year) ?? []), row]);
}
for (const [year, rows] of draftRows) writeFileSync(join(out, `draft_${year}.html`), wrap('stats', rows));
console.log('fixture written to', out);
