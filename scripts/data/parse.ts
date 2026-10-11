// Parsers for Basketball Reference tables, keyed by `data-stat` attributes so column
// order changes don't matter. Handles tables hidden inside HTML comments and both the
// current (name_display / team_name_abbr) and older (player / team_id) column names.
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

export interface RawRow {
  [stat: string]: string;
}

export function load(html: string): CheerioAPI {
  // BBRef hides many tables inside comments; unwrap them.
  return cheerio.load(html.replace(/<!--/g, '').replace(/-->/g, ''));
}

/** Extract rows of a table by id; returns cell text keyed by data-stat plus a few extras. */
export function tableRows($: CheerioAPI, ids: string[]): RawRow[] {
  let table = null as ReturnType<CheerioAPI> | null;
  for (const id of ids) {
    const t = $(`table#${id}`);
    if (t.length) {
      table = t.first();
      break;
    }
  }
  if (!table) return [];
  const rows: RawRow[] = [];
  table.find('tbody > tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('thead') || $tr.hasClass('over_header') || $tr.find('th[scope="col"]').length > 1) return;
    const row: RawRow = {};
    $tr.children('th, td').each((__, cell) => {
      const $c = $(cell);
      const stat = $c.attr('data-stat');
      if (!stat) return;
      row[stat] = $c.text().trim();
      const id = $c.attr('data-append-csv');
      if (id) row[`${stat}__id`] = id;
      const csk = $c.attr('csk');
      if (csk) row[`${stat}__csk`] = csk;
      const cls = $c.attr('class');
      if (cls) row[`${stat}__class`] = cls;
      const href = $c.find('a').attr('href');
      if (href) row[`${stat}__href`] = href;
    });
    if (Object.keys(row).length) rows.push(row);
  });
  return rows;
}

const num = (s: string | undefined) => {
  if (s === undefined || s === '') return 0;
  const v = Number(s.replace(/[$,%]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

function playerId(r: RawRow): string | null {
  const id = r.name_display__id ?? r.player__id;
  if (id) return id;
  const href = r.name_display__href ?? r.player__href;
  const m = href?.match(/\/players\/\w\/(\w+)\.html/);
  return m ? m[1] : null;
}

function playerName(r: RawRow): string {
  return (r.name_display ?? r.player ?? '').replace(/\*$/, '').trim();
}

export interface PerGameRow {
  id: string;
  name: string;
  season: number;
  age: number;
  team: string; // BBRef abbrev, or '2TM'/'TOT' for combined rows
  pos: string;
  g: number;
  gs: number;
  mp: number;
  fg: number;
  fga: number;
  fg3: number;
  fg3a: number;
  fg2: number;
  fg2a: number;
  ft: number;
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

export function parsePerGame(html: string, season: number): { rows: PerGameRow[]; league?: PerGameRow } {
  const $ = load(html);
  const raw = tableRows($, ['per_game_stats', 'per_game']);
  const rows: PerGameRow[] = [];
  let league: PerGameRow | undefined;
  for (const r of raw) {
    const name = playerName(r);
    const row: PerGameRow = {
      id: playerId(r) ?? '',
      name,
      season,
      age: num(r.age),
      team: r.team_name_abbr ?? r.team_id ?? '',
      pos: (r.pos ?? '').split('-')[0],
      g: num(r.games ?? r.g),
      gs: num(r.games_started ?? r.gs),
      mp: num(r.mp_per_g),
      fg: num(r.fg_per_g),
      fga: num(r.fga_per_g),
      fg3: num(r.fg3_per_g),
      fg3a: num(r.fg3a_per_g),
      fg2: num(r.fg2_per_g),
      fg2a: num(r.fg2a_per_g),
      ft: num(r.ft_per_g),
      fta: num(r.fta_per_g),
      orb: num(r.orb_per_g),
      drb: num(r.drb_per_g),
      ast: num(r.ast_per_g),
      stl: num(r.stl_per_g),
      blk: num(r.blk_per_g),
      tov: num(r.tov_per_g),
      pf: num(r.pf_per_g),
      pts: num(r.pts_per_g),
    };
    if (/league average/i.test(name)) {
      league = row;
      continue;
    }
    if (!row.id || !name) continue;
    rows.push(row);
  }
  return { rows, league };
}

export interface AdvRow {
  id: string;
  season: number;
  team: string;
  g: number;
  mpTotal: number;
  per: number;
  ts: number;
  tpar: number;
  ftr: number;
  orbPct: number;
  drbPct: number;
  trbPct: number;
  astPct: number;
  stlPct: number;
  blkPct: number;
  tovPct: number;
  usgPct: number;
  ows: number;
  dws: number;
  ws: number;
  ws48: number;
  obpm: number;
  dbpm: number;
  bpm: number;
  vorp: number;
}

export function parseAdvanced(html: string, season: number): AdvRow[] {
  const $ = load(html);
  const raw = tableRows($, ['advanced', 'advanced_stats']);
  const out: AdvRow[] = [];
  for (const r of raw) {
    const id = playerId(r);
    if (!id) continue;
    out.push({
      id,
      season,
      team: r.team_name_abbr ?? r.team_id ?? '',
      g: num(r.games ?? r.g),
      mpTotal: num(r.mp),
      per: num(r.per),
      ts: num(r.ts_pct),
      tpar: num(r.fg3a_per_fga_pct),
      ftr: num(r.fta_per_fga_pct),
      orbPct: num(r.orb_pct),
      drbPct: num(r.drb_pct),
      trbPct: num(r.trb_pct),
      astPct: num(r.ast_pct),
      stlPct: num(r.stl_pct),
      blkPct: num(r.blk_pct),
      tovPct: num(r.tov_pct),
      usgPct: num(r.usg_pct),
      ows: num(r.ows),
      dws: num(r.dws),
      ws: num(r.ws),
      ws48: num(r.ws_per_48),
      obpm: num(r.obpm),
      dbpm: num(r.dbpm),
      bpm: num(r.bpm),
      vorp: num(r.vorp),
    });
  }
  return out;
}

export interface ContractRow {
  id: string;
  name: string;
  team: string;
  /** Salaries in $K for consecutive seasons starting with the first column (2026-27). */
  salaries: number[];
  /** Option type for each salary year, if any. */
  options: ('player' | 'team' | 'et' | null)[];
  guaranteed: number;
  firstSeasonLabel: string;
}

export function parseContracts(html: string): ContractRow[] {
  const $ = load(html);
  const table = $('table#player-contracts').first();
  // header labels for y1..y6 ("2026-27" ...)
  const firstSeasonLabel = table.find('thead tr').last().find('th[data-stat="y1"]').text().trim();
  const raw = tableRows($, ['player-contracts']);
  const out: ContractRow[] = [];
  for (const r of raw) {
    const id = playerId(r);
    const name = playerName(r);
    if (!id || !name) continue;
    const salaries: number[] = [];
    const options: ContractRow['options'] = [];
    for (let y = 1; y <= 6; y++) {
      const v = r[`y${y}`];
      if (!v) break;
      const amt = Math.round(num(v) / 1000);
      if (amt <= 0) break;
      salaries.push(amt);
      const cls = r[`y${y}__class`] ?? '';
      options.push(/salary-pl/.test(cls) ? 'player' : /salary-tm/.test(cls) ? 'team' : /salary-et/.test(cls) ? 'et' : null);
    }
    out.push({ id, name, team: r.team_id ?? r.team_name_abbr ?? '', salaries, options, guaranteed: Math.round(num(r.remain_gtd) / 1000), firstSeasonLabel });
  }
  return out;
}

export interface RosterRow {
  id: string;
  name: string;
  team: string;
  season: number;
  jersey: string;
  pos: string;
  /** Full label as listed ("G-F"): current-season pages only give G / F / C. */
  posRaw: string;
  heightIn: number;
  weightLb: number;
  birthDate: string; // YYYYMMDD
  country: string;
  exp: number; // 0 = rookie
  college: string;
}

export function parseRoster(html: string, team: string, season: number): RosterRow[] {
  const $ = load(html);
  const raw = tableRows($, ['roster']);
  const out: RosterRow[] = [];
  for (const r of raw) {
    const id = playerId(r);
    const name = playerName(r);
    if (!id || !name) continue;
    const [ft, inch] = (r.height ?? '').split('-').map(Number);
    out.push({
      id,
      name: name.replace(/\s*\(TW\)\s*$/, ''),
      team,
      season,
      jersey: r.number ?? r.uniform_number ?? '',
      pos: (r.pos ?? '').split('-')[0],
      posRaw: (r.pos ?? '').trim(),
      heightIn: ft ? ft * 12 + (inch || 0) : 0,
      weightLb: num(r.weight),
      birthDate: r.birth_date__csk ?? '',
      // the cell holds a flag icon plus the code ("us us"): keep one code
      country: (r.flag ?? r.birth_country ?? '').trim().split(/\s+/)[0].toUpperCase(),
      exp: r.years_experience === 'R' ? 0 : num(r.years_experience),
      college: (r.college ?? '').trim(),
    });
  }
  return out;
}

export interface DraftRow {
  id: string;
  name: string;
  year: number;
  pick: number;
  round: number;
  team: string;
  college: string;
}

export function parseDraft(html: string, year: number): DraftRow[] {
  const $ = load(html);
  const raw = tableRows($, ['stats']);
  const out: DraftRow[] = [];
  for (const r of raw) {
    const id = playerId(r);
    const name = playerName(r);
    const pick = num(r.pick_overall);
    if (!id || !name || !pick) continue;
    out.push({ id, name, year, pick, round: pick <= 30 ? 1 : 2, team: r.team_id ?? r.team_name_abbr ?? '', college: r.college_name ?? '' });
  }
  return out;
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'USA',
  CA: 'Canada',
  FR: 'France',
  RS: 'Serbia',
  ES: 'Spain',
  AU: 'Australia',
  DE: 'Germany',
  NG: 'Nigeria',
  LT: 'Lithuania',
  GR: 'Greece',
  TR: 'Turkey',
  JP: 'Japan',
  BR: 'Brazil',
  CM: 'Cameroon',
  SN: 'Senegal',
  SI: 'Slovenia',
  HR: 'Croatia',
  IT: 'Italy',
  LV: 'Latvia',
  GB: 'United Kingdom',
  CD: 'DR Congo',
  SS: 'South Sudan',
  NZ: 'New Zealand',
  FI: 'Finland',
  CH: 'Switzerland',
  AT: 'Austria',
  BA: 'Bosnia',
  ME: 'Montenegro',
  GE: 'Georgia',
  IL: 'Israel',
  DO: 'Dominican Rep.',
  PR: 'Puerto Rico',
  BS: 'Bahamas',
  JM: 'Jamaica',
  CZ: 'Czechia',
  PL: 'Poland',
  UA: 'Ukraine',
  RU: 'Russia',
  SE: 'Sweden',
  DK: 'Denmark',
  NL: 'Netherlands',
  BE: 'Belgium',
  GN: 'Guinea',
  ML: 'Mali',
  CN: 'China',
  PH: 'Philippines',
  AR: 'Argentina',
  VE: 'Venezuela',
  MX: 'Mexico',
  LC: 'Saint Lucia',
  HT: 'Haiti',
  AO: 'Angola',
  TZ: 'Tanzania',
  EG: 'Egypt',
  SD: 'Sudan',
};
