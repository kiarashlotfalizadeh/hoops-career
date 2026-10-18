// Opening-night injuries from ESPN's injury report (BenoParadise/nba-injuries hourly mirror,
// or sportsdataverse's injury history as a backup). Players listed "Out", or expected back
// after opening night, start the season injured; the time out is counted in their team's real
// games before the expected return date.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { parquetReadObjects } from 'hyparquet';
import type { Injury } from '../../../src/core/types';
import type { SeedInjury, SeedPlayer, SeedSchedule } from '../../../src/core/league/create';
import { INJURY_TYPES } from '../../../src/core/league/injuries';
import { injuryName } from '../../../src/core/format';
import { normName } from '../nba/crosswalk';
import { compressors } from '../nba/college';
import { dayOf } from './schedule';
import { teamByName, tricodeOf } from './teams';

export interface RawInjury {
  team: string; // BBRef code
  name: string;
  status: string;
  detail: string;
  returnDate: string | null; // YYYY-MM-DD
}

export function parseEspnMirror(json: unknown): RawInjury[] {
  const teams = (json as { teams?: { name: string; players: { name: string; status: string; detail?: string; returnDate?: string | null }[] }[] }).teams ?? [];
  const out: RawInjury[] = [];
  for (const t of teams) {
    const team = teamByName(t.name);
    if (!team) continue;
    for (const p of t.players) out.push({ team, name: p.name, status: p.status, detail: p.detail ?? '', returnDate: p.returnDate ? p.returnDate.slice(0, 10) : null });
  }
  return out;
}

/** sportsdataverse's ESPN injury history: the latest snapshot. */
export async function parseSdvParquet(file: string): Promise<RawInjury[]> {
  const buf = readFileSync(file);
  const rows = (await parquetReadObjects({ file: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), compressors })) as Record<string, unknown>[];
  const str = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v));
  const latest = rows.reduce((m, r) => (str(r.as_of_date) > m ? str(r.as_of_date) : m), '');
  const out: RawInjury[] = [];
  for (const r of rows) {
    if (str(r.as_of_date) !== latest) continue;
    const team = teamByName(str(r.team_display_name));
    if (!team) continue;
    const ret = str(r.detail_return_date).slice(0, 10);
    out.push({ team, name: str(r.athlete_display_name), status: str(r.status), detail: `${str(r.detail_type)} — ${str(r.short_comment)}`, returnDate: ret || null });
  }
  return out;
}

export async function loadInjuries(jsonFile: string, parquetFile: string): Promise<{ rows: RawInjury[]; source: string; asOf: string } | null> {
  if (existsSync(jsonFile)) {
    const json = JSON.parse(readFileSync(jsonFile, 'utf8')) as { fetchedAt?: number };
    const asOf = new Date(json.fetchedAt ?? statSync(jsonFile).mtimeMs).toISOString().slice(0, 10);
    return { rows: parseEspnMirror(json), source: 'ESPN via BenoParadise/nba-injuries', asOf };
  }
  if (existsSync(parquetFile))
    return { rows: await parseSdvParquet(parquetFile), source: 'ESPN via sportsdataverse', asOf: new Date(statSync(parquetFile).mtimeMs).toISOString().slice(0, 10) };
  return null;
}

const NUM: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, couple: 2, few: 3 };

/** Days out a note implies ("re-evaluated in two weeks", "miss four-to-six weeks"), if it says. */
export function daysFromNote(detail: string): number | null {
  const m = detail.match(
    /\b(a|one|two|three|four|five|six|seven|eight|nine|ten|twelve|couple|few|\d+)(?:(?: of)?\s*(?:to|-|or)\s*(one|two|three|four|five|six|seven|eight|nine|ten|twelve|\d+))?\s+(week|month)s?\b/i,
  );
  if (!m) return null;
  const n = (w?: string) => (w ? (NUM[w.toLowerCase()] ?? Number(w)) : NaN);
  const k = Math.max(n(m[1]), Number.isFinite(n(m[2])) ? n(m[2]) : 0);
  return Number.isFinite(k) ? k * (m[3].toLowerCase() === 'month' ? 30 : 7) : null;
}

/** Keyword → injury type (the game's names where one fits, else a descriptive name). */
const TYPE_RULES: [RegExp, string][] = [
  [/\bacl\b/i, 'Torn ACL'],
  [/partial(ly)? torn achilles|achilles.*partial/i, 'Partially Torn Achilles'],
  [/(rupture|torn|tear).{0,30}achilles|achilles.{0,30}(rupture|torn|tear)|season-ending.*achilles/i, 'Ruptured Achilles'],
  [/patella/i, 'Ruptured Patellar Tendon'],
  [/meniscus/i, 'Torn Meniscus'],
  [/\bmcl\b/i, 'MCL Sprain'],
  [/plantar fasci/i, 'Plantar Fasciitis'],
  [/plantar plate/i, 'Plantar Plate Tear'],
  [/labrum/i, 'Torn Labrum'],
  [/rotator cuff/i, 'Torn Rotator Cuff'],
  [/(fracture|broken).{0,40}(foot|toe)|(foot|toe).{0,40}(fracture|broken)/i, 'Foot Stress Fracture'],
  [/(fracture|broken).{0,40}(hand|finger|wrist)|(hand|wrist).{0,40}(fracture|broken)/i, 'Broken Hand'],
  [/concussion/i, 'Concussion'],
  [/illness/i, 'Illness'],
];

/** Body part (ESPN's leading word) → the game's name for a typical injury there. */
const PART_TYPES: Record<string, string> = {
  ankle: 'Sprained Ankle',
  knee: 'Knee Soreness',
  back: 'Back Spasms',
  hip: 'Hip Contusion',
  finger: 'Sprained Finger',
  hamstring: 'Hamstring Strain',
  calf: 'Calf Strain',
  groin: 'Groin Strain',
  shoulder: 'Sprained Shoulder',
};

function severityFor(games: number): Injury['severity'] {
  return games >= 60 ? 'severe' : games >= 20 ? 'major' : games >= 5 ? 'moderate' : 'minor';
}

/** Map ESPN's description to an injury type; the generic part name is used only if the time out fits it. */
export function injuryType(detail: string, games: number | null): { type: string; severity: Injury['severity'] } {
  // names as the game writes them (sentence case, acronyms kept), so they match INJURY_TYPES
  const known = (name: string) => INJURY_TYPES.find((x) => x.name === injuryName(name));
  for (const [re, type] of TYPE_RULES) {
    if (re.test(detail)) {
      const t = known(type);
      return { type: injuryName(type), severity: t && (games === null || games <= t.max * 1.5) ? t.severity : severityFor(games ?? 10) };
    }
  }
  const part = detail.split(/\s+[—-]\s+/)[0].trim();
  if (/achilles/i.test(part) && (games ?? 0) >= 40) return { type: injuryName('Ruptured Achilles'), severity: 'severe' };
  const generic = PART_TYPES[part.toLowerCase()];
  const t = generic ? known(generic) : undefined;
  if (t && (games === null || games <= t.max * 1.5)) return { type: t.name, severity: t.severity };
  const name = part && part.length < 25 ? injuryName(`${part} injury`) : 'Injury';
  return { type: name, severity: severityFor(games ?? 10) };
}

export interface InjuryResult {
  applied: { id: string; name: string; team: string; injury: SeedInjury }[];
  unmatched: string[];
}

/**
 * Attach opening-night injuries to seed players (`asOf`: date of the report, YYYY-MM-DD).
 * Players expected back before the opener (day-to-day preseason knocks) are skipped.
 */
export function attachInjuries(players: SeedPlayer[], rows: RawInjury[], schedule: SeedSchedule | null, season: number, asOf?: string): InjuryResult {
  const res: InjuryResult = { applied: [], unmatched: [] };
  for (const p of players) delete p.injury;
  const byName = new Map<string, SeedPlayer[]>();
  for (const p of players) {
    const k = normName(`${p.first} ${p.last}`);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  // team games per day from the real schedule
  const teamDays = new Map<string, number[]>();
  for (const g of schedule?.games ?? []) {
    const m = g.match(/^(\d+):(\w+)@(\w+)$/);
    if (!m) continue;
    for (const t of [m[2], m[3]]) teamDays.set(t, [...(teamDays.get(t) ?? []), Number(m[1])]);
  }
  const lastDay = Math.max(0, ...[...teamDays.values()].flat());
  for (const r of rows) {
    let returnDay = r.returnDate ? dayOf(season, r.returnDate) : null;
    // ESPN dates day-to-day players "the day after the opener" by default; a note that names a
    // timeline ("re-evaluated in two weeks") is the better guess then
    const noted = asOf ? daysFromNote(r.detail) : null;
    if (asOf && noted !== null && (returnDay === null || returnDay <= 2)) returnDay = Math.max(returnDay ?? 0, dayOf(season, asOf) + noted);
    const out = /^out$/i.test(r.status) || (returnDay !== null && returnDay > 0);
    if (!out) continue;
    const cands = byName.get(normName(r.name)) ?? [];
    const p = cands.find((c) => c.team === r.team) ?? (cands.length === 1 ? cands[0] : undefined);
    if (!p || !p.team) {
      res.unmatched.push(`${r.name} (${r.team})`);
      continue;
    }
    const days = teamDays.get(tricodeOf(p.team)) ?? [];
    let games: number | null = null;
    if (returnDay !== null && days.length) {
      // a full season's worth when he's back after the regular season (the game adds playoffs)
      games = returnDay > lastDay ? 82 : Math.round((days.filter((d) => d < returnDay).length * 82) / Math.max(1, days.length));
    }
    const kind = injuryType(r.detail, games);
    if (games === null) {
      // no date: a typical absence for the type
      const t = INJURY_TYPES.find((x) => x.name === kind.type);
      games = t ? Math.round((t.min + t.max) / 2) : kind.severity === 'severe' ? 82 : kind.severity === 'major' ? 30 : 10;
    }
    if (games <= 0) continue;
    const detail = r.detail.replace(/\s+/g, ' ').slice(0, 160);
    const injury: SeedInjury = { type: kind.type, severity: kind.severity, returnDay, games, detail };
    p.injury = injury;
    res.applied.push({ id: p.id, name: `${p.first} ${p.last}`, team: p.team, injury });
  }
  return res;
}
