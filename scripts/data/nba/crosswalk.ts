// NBA.com person id ↔ Basketball Reference id. Names differ between the two (accents,
// suffixes, nicknames), so matching goes: exact normalized name → same team & season with
// matching surname and first initial → small edit distance → a short alias list.
import { teamByCode } from '../extra/teams';

export function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Known name differences (normalized NBA.com name → normalized Basketball Reference name). */
const ALIASES: Record<string, string> = {
  'alex sarr': 'alexandre sarr',
  'nic claxton': 'nicolas claxton',
  'herb jones': 'herbert jones',
  'cam thomas': 'cameron thomas',
  'gg jackson': 'gregory jackson',
  'carlton carrington': 'bub carrington',
  'nah shon hyland': 'bones hyland',
  'ron holland': 'ronald holland',
  'mohamed bamba': 'mo bamba',
  'kenyon martin': 'kj martin',
  'hansen yang': 'yang hansen',
};

export interface BbrefRow {
  id: string;
  name: string;
  season: number;
  team: string; // Basketball Reference code
}

export interface NbaPerson {
  pid: number;
  name: string;
  /** season -> NBA tricode */
  teams: Record<number, string>;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function crosswalk(nba: NbaPerson[], bbref: BbrefRow[]): { map: Map<number, string>; unmatched: NbaPerson[] } {
  const byName = new Map<string, Set<string>>();
  const seasonTeam = new Map<string, { id: string; norm: string }[]>(); // `${season}|${team}`
  const idName = new Map<string, string>();
  for (const r of bbref) {
    const n = normName(r.name);
    idName.set(r.id, n);
    (byName.get(n) ?? byName.set(n, new Set()).get(n)!).add(r.id);
    const k = `${r.season}|${r.team}`;
    (seasonTeam.get(k) ?? seasonTeam.set(k, []).get(k)!).push({ id: r.id, norm: n });
  }
  const teamOk = (id: string, p: NbaPerson) => Object.entries(p.teams).some(([s, tri]) => (seasonTeam.get(`${s}|${teamByCode(tri) ?? tri}`) ?? []).some((x) => x.id === id));
  const map = new Map<number, string>();
  const used = new Set<string>();
  const key = (p: NbaPerson) => {
    const n = normName(p.name);
    return ALIASES[n] ?? n;
  };
  const claim = (p: NbaPerson, id: string | undefined) => {
    if (!id || used.has(id)) return false;
    map.set(p.pid, id);
    used.add(id);
    return true;
  };
  // exact names first, so a near-miss spelling ("Jeff Green" for a missing row) can't take the id
  // of a teammate whose name matches exactly ("Jalen Green") just because it came first
  const rest: NbaPerson[] = [];
  for (const p of nba) {
    const exact = [...(byName.get(key(p)) ?? [])];
    if (!claim(p, exact.length === 1 ? exact[0] : exact.find((x) => teamOk(x, p)))) rest.push(p);
  }
  const unmatched: NbaPerson[] = [];
  for (const p of rest) {
    const n = key(p);
    let id: string | undefined;
    // same team and season: surname and first initial
    const parts = n.split(' ');
    const last = parts[parts.length - 1];
    const cands = new Set<string>();
    for (const [s, tri] of Object.entries(p.teams))
      for (const x of seasonTeam.get(`${s}|${teamByCode(tri) ?? tri}`) ?? []) {
        if (used.has(x.id)) continue;
        const xp = x.norm.split(' ');
        if (xp[xp.length - 1] === last && xp[0][0] === parts[0][0]) cands.add(x.id);
        else if (lev(x.norm, n) <= 2) cands.add(x.id);
      }
    if (cands.size === 1) id = [...cands][0];
    if (!id) {
      // anywhere, close spelling
      let best: string | undefined;
      let bd = 3;
      for (const [nm, ids] of byName) {
        if (Math.abs(nm.length - n.length) > 2) continue;
        const d = lev(nm, n);
        if (d < bd && ids.size === 1 && !used.has([...ids][0])) {
          bd = d;
          best = [...ids][0];
        }
      }
      if (best && bd <= 2) id = best;
    }
    if (!claim(p, id)) unmatched.push(p);
  }
  return { map, unmatched };
}
