// Future draft-pick ownership: RealGM's pick table (via nba-roster-builder's daily scrape)
// mapped onto the game's model, where every (season, round, original team) pick has exactly one
// owner and at most a simple top-N protection.
//
// RealGM rows are *possible* assets, written from each team's point of view: plain picks
// ("teamFrom"), protected picks ("3-30 to Charlotte"), swap rights, and free-text pools
// ("More favorable of (i) ATL and (ii) less favorable of UTH and CLE then least favorable of
// all to CLE"). Conditional chains produce several rows for one pick, and some rows repeat.
//
// Resolution, per (season, round):
//  1. Every row becomes weighted claims "team X ends up with team O's pick". Pools and swaps are
//     evaluated on a projected draft order (team strength from the seed's ratings, regressed to
//     the middle for later years), so "less favorable of MIL and NOP" names a concrete pick.
//  2. Range conditions ("3-30", "PHL 9-30") weigh a claim by the chance the pick lands there;
//     conditions on other picks ("if DAL conveys its 2027 1st", "if not already settled") are
//     evaluated against the picks already resolved (first rounds before second rounds, years in
//     order).
//  3. Each pick goes to its highest-scoring claimant (its original team holds a small default
//     claim). When the winner's claim is a range "a-30" (or "a-60" in round two), the pick is
//     stored with `protection: a - 1`: if it lands in the top a-1 it stays with its original
//     team that year and the obligation ends (no roll-over).
// Swap rights are resolved the same way: the holder gets the projected better pick. Forfeited
// picks stay with their original team (the game has no forfeits).
import { ALL_TEAMS, teamByCode, teamByName } from './teams';

export interface RawPickRow {
  teamOwner: string;
  year: number;
  round: string;
  teamFrom: string | null;
  swapOwner: string | null;
  swapOption: string | null;
  protections: string | null;
  pickNumber?: number | null;
  pickPool: string | null;
  rank: string | null;
}

export interface ResolvedPick {
  season: number;
  round: 1 | 2;
  original: string; // BBRef code
  owner: string; // BBRef code
  /** Top-N protection: the pick stays with `original` if it lands in the first N of its round. */
  protection?: number;
}

export interface PickProjection {
  /** Expected slot within the round (1 = most favorable). */
  slot(team: string, season: number): number;
  /** Chance the team's pick lands in slots lo..hi of its round. */
  prob(team: string, season: number, lo: number, hi: number): number;
}

function erf(x: number) {
  // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const ncdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Projected draft order from team strength (higher = better team = later pick). */
export function projectionFromStrength(strength: Record<string, number>, firstSeason: number): PickProjection {
  const order = [...ALL_TEAMS].sort((a, b) => (strength[a] ?? 0) - (strength[b] ?? 0) || a.localeCompare(b));
  const base = new Map(order.map((t, i) => [t, i + 1]));
  const slot = (t: string, s: number) => {
    const w = Math.pow(0.75, Math.max(0, s - firstSeason));
    return (base.get(t) ?? 15.5) * w + 15.5 * (1 - w);
  };
  const prob = (t: string, s: number, lo: number, hi: number) => {
    const m = slot(t, s);
    const sd = 4 + 2.5 * Math.max(0, s - firstSeason);
    const c = (x: number) => ncdf((x - m) / sd);
    const tot = c(30.5) - c(0.5);
    const p = (c(Math.min(30, hi) + 0.5) - c(Math.max(1, lo) - 0.5)) / tot;
    return Math.max(0, Math.min(1, p));
  };
  return { slot, prob };
}

// ------------------------------------------------------------------ text helpers

const MARKER = /^\((?:i|ii|iii|iv|v|a|b|c|d)\)$/;

/** Drop "(via ...)", "(cannot be 1-5)" and other asides, "[...]" notes and footnote stars. */
export function cleanPickText(t: string): string {
  let out = '';
  let depth = 0;
  let group = '';
  for (const ch of t) {
    if (ch === '(') {
      depth++;
      group += ch;
    } else if (ch === ')' && depth > 0) {
      depth--;
      group += ch;
      if (depth === 0) {
        out += MARKER.test(group) ? group : ' ';
        group = '';
      }
    } else if (depth > 0) group += ch;
    else out += ch;
  }
  return out
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .trim()
    .replace(/[;,\s]+$/, '');
}

/** "31-55" in round two → slots 1-25 of the round. */
function slotRange(lo: number, hi: number): [number, number] {
  return [lo > 30 ? lo - 30 : lo, hi > 30 ? hi - 30 : hi];
}

type Sel = (n: number) => number[];

export function parseSel(s: string): Sel | null {
  const k = s
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
  switch (k) {
    case 'most':
    case 'more':
    case 'most/more':
      return (n) => (n ? [0] : []);
    case 'least':
    case 'less':
    case 'least/less':
      return (n) => (n ? [n - 1] : []);
    case 'second most':
      return (n) => (n > 1 ? [1] : []);
    case 'third most':
      return (n) => (n > 2 ? [2] : []);
    case 'two most':
    case 'most/two most':
    case 'two most/more':
      return (n) => (n >= 3 ? [0, 1] : n ? [0] : []);
    case 'two least':
      return (n) => (n >= 3 ? [n - 2, n - 1] : n ? [n - 1] : []);
    case 'most and least':
      return (n) => (n >= 2 ? [0, n - 1] : n ? [0] : []);
    case 'most and third most':
      return (n) => (n >= 3 ? [0, 2] : n ? [0] : []);
  }
  return null;
}

export type PickExpr = { leaf: string; lo?: number; hi?: number } | { sel: Sel; items: PickExpr[] };

function parseLeaf(t: string): PickExpr | null {
  const m = t.trim().match(/^([A-Z]{3})(?:\s+(\d+)(?:-(\d+))?)?(?:\s+if\b.*)?$/);
  if (!m) return null;
  const team = teamByCode(m[1]);
  if (!team) return null;
  if (!m[2]) return { leaf: team };
  const [lo, hi] = slotRange(Number(m[2]), Number(m[3] ?? m[2]));
  return { leaf: team, lo, hi };
}

function parseList(t: string): PickExpr[] {
  const text = t.trim();
  const roman = /\s*\((?:iv|v|i{1,3})\)\s*/;
  const letter = /\s*\((?:a|b|c|d)\)\s*/;
  const splitter = roman.test(text) ? new RegExp(roman.source, 'g') : letter.test(text) ? new RegExp(letter.source, 'g') : null;
  const parts = splitter ? text.split(splitter) : text.split(/\s*,\s*(?:and\s+)?|\s+and\s+/);
  const out: PickExpr[] = [];
  for (let p of parts) {
    p = p
      .trim()
      .replace(/^(?:and\s+)/, '')
      .replace(/[,\s]+$/, '')
      .replace(/\s+and$/, '')
      .trim();
    if (!p) continue;
    const e = parseExpr(p);
    if (e) out.push(e);
  }
  return out;
}

export function parseExpr(t: string): PickExpr | null {
  // ("of" is sometimes missing: "less favorable MIL and POR")
  const m = t.trim().match(/^(.+?) favorable (?:of )?(.+)$/i);
  if (m) {
    const sel = parseSel(m[1]);
    const items = parseList(m[2]);
    return sel && items.length ? { sel, items } : null;
  }
  return parseLeaf(t);
}

// ------------------------------------------------------------------ resolution

/**
 * Claim weights. Plain rows ("own pick", "DAL 3-30") weigh 3. A pool names exactly which pick a
 * team ends up with after the swaps, so it outranks the plain "possible asset" rows of the same
 * pick, and a nested pool (a swap of swap results) outranks the pools it is built from.
 */
const PLAIN_W = 3;
const SWAP_W = 3.5;
const poolWeight = (e: PickExpr | null) => 3.5 + Math.max(0, depth(e) - 1);
function depth(e: PickExpr | null): number {
  if (!e || 'leaf' in e) return 0;
  return 1 + Math.max(0, ...e.items.map(depth));
}

interface Claim {
  to: string;
  origin: string;
  w: number;
  lo?: number;
  hi?: number;
  /** "if not already settled": discounted by the chance an earlier pick already conveyed. */
  chain?: boolean;
  src: string;
}

interface Ctx {
  proj: PickProjection;
  season: number;
  round: 1 | 2;
  /** Already-resolved picks, for conditions that reference them. */
  done: Map<string, ResolvedPick>;
  firstSeason: number;
}

const pkey = (season: number, round: number, original: string) => `${season}:${round}:${original}`;

/** Chance team's first-rounder of `season` leaves it (per the picks resolved so far). */
function conveys(ctx: Ctx, team: string, season: number, round: 1 | 2 = 1): number {
  const r = ctx.done.get(pkey(season, round, team));
  if (!r) return 0.5;
  if (r.owner === team) return 0;
  return r.protection ? 1 - ctx.proj.prob(team, season, 1, r.protection) : 1;
}

function evalCond(text: string, ctx: Ctx): { p: number | null; chain: boolean } {
  let p: number | null = null;
  const mul = (x: number) => {
    p = (p ?? 1) * x;
  };
  const chain = /not already settled/i.test(text);
  let m: RegExpMatchArray | null;
  if ((m = text.match(/\b([A-Z]{3}) (?:does not|doesn't) convey .*?(?:in|by) (\d{4})/))) mul(1 - conveys(ctx, teamByCode(m[1]) ?? m[1], Number(m[2])));
  else if ((m = text.match(/\b([A-Z]{3}) conveys .*?(?:in|by) (\d{4})/))) mul(conveys(ctx, teamByCode(m[1]) ?? m[1], Number(m[2])));
  if ((m = text.match(/\b([A-Z]{3}) has (not )?conveyed .*?by (\d{4})/))) {
    const team = teamByCode(m[1]) ?? m[1];
    let stay = 1;
    for (let y = ctx.firstSeason; y <= Number(m[3]); y++) stay *= 1 - conveys(ctx, team, y);
    mul(m[2] ? stay : 1 - stay);
  }
  if ((m = text.match(/\b([A-Z]{3}) (\d+)(?:-(\d+))? in (\d{4})/))) {
    const [lo, hi] = slotRange(Number(m[2]), Number(m[3] ?? m[2]));
    mul(ctx.proj.prob(teamByCode(m[1]) ?? m[1], Number(m[4]), lo, hi));
  }
  return { p, chain };
}

function evalOne(e: PickExpr, ctx: Ctx): string[] {
  if ('leaf' in e) {
    if (e.lo !== undefined && e.hi !== undefined) {
      const s = ctx.proj.slot(e.leaf, ctx.season);
      if (s < e.lo - 0.5 || s > e.hi + 0.5) return [];
    }
    return [e.leaf];
  }
  const vals = [...new Set(e.items.map((it) => evalOne(it, ctx)[0]).filter((x): x is string => !!x))];
  vals.sort((a, b) => ctx.proj.slot(a, ctx.season) - ctx.proj.slot(b, ctx.season));
  return e
    .sel(vals.length)
    .map((i) => vals[i])
    .filter((x) => x !== undefined);
}

function leavesOf(e: PickExpr, ctx: Ctx): PickExpr[] {
  if ('leaf' in e) return evalOne(e, ctx).length ? [e] : [];
  return e.items.flatMap((it) => leavesOf(it, ctx));
}

function leafRange(e: PickExpr | undefined, team: string): { lo?: number; hi?: number } {
  if (!e) return {};
  if ('leaf' in e) return e.leaf === team ? { lo: e.lo, hi: e.hi } : {};
  for (const it of e.items) {
    const r = leafRange(it, team);
    if (r.lo !== undefined) return r;
  }
  return {};
}

/** Claims from a free-text pool row ("rank"). */
function poolClaims(row: RawPickRow, owner: string, ctx: Ctx, notes: string[]): Claim[] {
  const raw = row.rank ?? '';
  const text = cleanPickText(raw);
  const src = `${owner} ${row.year} R${ctx.round}: ${raw}`;
  if (!text || text === '---') return [];
  if (/^forfeited/i.test(text)) {
    notes.push(`forfeited (kept by its original team): ${src}`);
    return [];
  }
  if (/^(?:1 )?own\b/i.test(text)) return [{ to: owner, origin: owner, w: PLAIN_W, src }];
  const out: { c: Claim; def: boolean }[] = [];
  let base: PickExpr | null = null;
  const assigned = new Set<string>();
  const give = (to: string, picks: string[], w: number, def: boolean, range: { lo?: number; hi?: number }, condP: number | null, chain: boolean) => {
    for (const origin of picks) {
      const r = range.lo !== undefined ? range : leafRange(base ?? undefined, origin);
      out.push({ c: { to, origin, w: w * (condP ?? 1), lo: r.lo, hi: r.hi, chain, src }, def });
      assigned.add(origin);
    }
  };
  for (let clause of text.split(/;|\bthen\b/i)) {
    clause = clause
      .trim()
      .replace(/^or\s+/i, '')
      .replace(/,$/, '');
    if (!clause) continue;
    const def = /in all other scenarios/i.test(clause);
    clause = clause.replace(/\s*in all other scenarios\s*/i, ' ').trim();
    if (/^if\b/i.test(clause)) {
      // "If (i) ... of BRK, PHL 9-30, PHX and NYK," sets up the pool for the branches that follow
      const m = clause.match(/favorable of ([^()]+?),?$/i);
      if (m && !base) base = { sel: () => [], items: parseList(m[1]) };
      continue;
    }
    // trailing condition on the whole clause (not inside a (ii)/(iii) list item)
    let range: { lo?: number; hi?: number } = {};
    let condP: number | null = null;
    let chain = false;
    const ifAt = clause.search(/\s+if\s/i);
    if (ifAt >= 0 && !/\((?:ii|iii|iv|b|c)\)/.test(clause.slice(ifAt))) {
      const cond = clause.slice(ifAt).trim();
      clause = clause.slice(0, ifAt).trim();
      const r = cond.match(/^if (\d+)-(\d+)$/i);
      if (r) {
        const [lo, hi] = slotRange(Number(r[1]), Number(r[2]));
        range = { lo, hi };
      } else {
        const c = evalCond(cond, ctx);
        condP = c.p;
        chain = c.chain;
      }
    }
    // "second most favorable to UTH and least favorable to PHX": continuations of the base pool
    if (!/ favorable of /i.test(clause) && / favorable to [A-Z]{3}/.test(clause)) {
      for (const part of clause.split(/(?<=favorable to [A-Z]{3})\s+and\s+/)) {
        const m = part.match(/^(.+?) favorable to ([A-Z]{3})$/i);
        const sel = m && parseSel(m[1]);
        const to = m && teamByCode(m[2]);
        if (!sel || !to || !base) {
          notes.push(`unparsed clause "${part}" in ${src}`);
          continue;
        }
        const leaves = leavesOf(base, ctx).map((l) => evalOne(l, ctx)[0]);
        leaves.sort((a, b) => ctx.proj.slot(a, ctx.season) - ctx.proj.slot(b, ctx.season));
        give(
          to,
          sel(leaves.length).map((i) => leaves[i]),
          poolWeight(base),
          def,
          range,
          condP,
          chain,
        );
      }
      continue;
    }
    let to = owner;
    const tm = clause.match(/\s+to ([A-Z]{3})$/);
    if (tm) {
      to = teamByCode(tm[1]) ?? owner;
      clause = clause.slice(0, tm.index).trim();
    }
    let m: RegExpMatchArray | null;
    if ((m = clause.match(/^others? ?$/i)) || (m = clause.match(/^others?$/i))) {
      if (base)
        give(
          to,
          leavesOf(base, ctx)
            .map((l) => evalOne(l, ctx)[0])
            .filter((o) => !assigned.has(o)),
          poolWeight(base),
          def,
          range,
          condP,
          chain,
        );
      continue;
    }
    if ((m = clause.match(/^(.+?) favorable of (.+)$/i))) {
      const sel = parseSel(m[1]);
      const listText = m[2].trim();
      let items: PickExpr[] = [];
      if (/^all$/i.test(listText)) items = base ? leavesOf(base, ctx) : [];
      else if (/^\(i\) and \(ii\)$/i.test(listText)) items = base && 'items' in base ? base.items : [];
      else {
        items = parseList(listText);
        if (!base && sel) base = { sel, items };
      }
      if (!sel || !items.length) {
        notes.push(`unparsed clause "${clause}" in ${src}`);
        continue;
      }
      give(to, evalOne({ sel, items }, ctx), poolWeight({ sel, items }), def, range, condP, chain);
      continue;
    }
    const leaf = parseLeaf(clause);
    if (leaf && 'leaf' in leaf) {
      const inc = evalOne(leaf, ctx);
      give(to, inc, 1.5, def, { lo: leaf.lo, hi: leaf.hi }, condP, chain);
      continue;
    }
    notes.push(`unparsed clause "${clause}" in ${src}`);
  }
  // "...; or <other branch> in all other scenarios": the default branch wins for that team
  const defaults = new Set(out.filter((x) => x.def).map((x) => x.c.to));
  return out.filter((x) => x.def || !defaults.has(x.c.to)).map((x) => x.c);
}

function swapClaims(holder: string, other: string, otherRange: [number, number] | null, ctx: Ctx, src: string): Claim[] {
  const s = (t: string) => ctx.proj.slot(t, ctx.season);
  const ok = !otherRange || (s(other) >= otherRange[0] - 0.5 && s(other) <= otherRange[1] + 0.5);
  if (!ok || holder === other)
    return [
      { to: holder, origin: holder, w: SWAP_W, src },
      { to: other, origin: other, w: SWAP_W, src },
    ];
  const better = s(holder) <= s(other) ? holder : other;
  const worse = better === holder ? other : holder;
  return [
    { to: holder, origin: better, w: SWAP_W, src },
    { to: other, origin: worse, w: SWAP_W, src },
  ];
}

function rowClaims(row: RawPickRow, ctx: Ctx, notes: string[]): Claim[] {
  const owner = teamByName(row.teamOwner);
  if (!owner) {
    notes.push(`unknown team "${row.teamOwner}"`);
    return [];
  }
  const src = `${owner} ${row.year} R${ctx.round}`;
  if (row.rank || row.pickPool) return poolClaims(row, owner, ctx, notes);
  const from = row.teamFrom ? teamByName(row.teamFrom) : owner;
  if (!from) {
    notes.push(`unknown team "${row.teamFrom}" in ${src}`);
    return [];
  }
  const prot = (row.protections ?? '').trim();
  const pr = prot.match(/^(\d+)-(\d+)$/);
  if (row.swapOwner && !row.teamFrom) {
    const holders = row.swapOwner.split(/,\s*/).map(teamByName);
    // the range is where the swap applies ("2-30"), or the owner's protected range ("1-3")
    let r = pr ? slotRange(Number(pr[1]), Number(pr[2])) : null;
    if (r && r[0] <= 1 && r[1] < 30) r = [r[1] + 1, 30];
    if (holders.length === 1 && holders[0]) return swapClaims(holders[0], owner, r, ctx, `${src} swap`);
    return [{ to: owner, origin: owner, w: PLAIN_W, src }];
  }
  if (row.swapOption && !row.teamFrom) {
    const other = teamByName(row.swapOption);
    if (other) return swapClaims(owner, other, null, ctx, `${src} swap`);
  }
  if (!prot || /^frozen/i.test(prot)) return [{ to: owner, origin: from, w: PLAIN_W, src }];
  if (pr) {
    const [lo, hi] = slotRange(Number(pr[1]), Number(pr[2]));
    return [{ to: owner, origin: from, w: PLAIN_W, lo, hi, src: `${src} ${prot}` }];
  }
  let m = prot.match(/^(\d+)-(\d+) to (.+)$/);
  const complement = (lo: number, hi: number): [number, number] | null => (lo <= 1 ? (hi >= 30 ? null : [hi + 1, 30]) : hi >= 30 ? [1, lo - 1] : null);
  if (m) {
    const to = teamByName(m[3]);
    const [lo, hi] = slotRange(Number(m[1]), Number(m[2]));
    const comp = complement(lo, hi);
    const out: Claim[] = [];
    if (to) out.push({ to, origin: from, w: PLAIN_W, lo, hi, src: `${src} ${prot}` });
    if (comp) out.push({ to: owner, origin: from, w: PLAIN_W, lo: comp[0], hi: comp[1], src: `${src} ${prot}` });
    return out;
  }
  m = prot.match(/^([A-Z]{3}) (\d+)-(\d+) to ([A-Z]{3})(.*)$/);
  if (m) {
    // "LAC 17-30 to BOS or [via swap from BOS] more favorable of ...": the other branch is a
    // swap that the same team most likely wins, so it simply gets the pick
    const to = teamByCode(m[4]);
    const [lo, hi] = slotRange(Number(m[2]), Number(m[3]));
    if (/^\s*or\b/.test(m[5])) return to ? [{ to, origin: from, w: PLAIN_W, src: `${src} ${prot}` }] : [];
    const comp = complement(lo, hi);
    const out: Claim[] = [];
    if (to) out.push({ to, origin: from, w: PLAIN_W, lo, hi, src: `${src} ${prot}` });
    if (comp) out.push({ to: owner, origin: from, w: PLAIN_W, lo: comp[0], hi: comp[1], src: `${src} ${prot}` });
    return out;
  }
  m = prot.match(/^([A-Z]{3})(?: (\d+)-(\d+))? if (.+)$/);
  if (m) {
    const c = evalCond(m[4], ctx);
    const r = m[2] ? slotRange(Number(m[2]), Number(m[3])) : null;
    return [{ to: owner, origin: from, w: PLAIN_W * (c.p ?? 0.3), lo: r?.[0], hi: r?.[1], chain: c.chain, src: `${src} ${prot}` }];
  }
  notes.push(`unparsed protection "${prot}" in ${src}`);
  return [{ to: owner, origin: from, w: 1, src }];
}

export interface PickResolution {
  picks: ResolvedPick[];
  notes: string[];
}

/**
 * Resolve RealGM rows into one owner per pick for seasons first..last (both rounds).
 * Picks with no claim stay with their original team.
 */
export function resolvePicks(rows: RawPickRow[], proj: PickProjection, first: number, last: number): PickResolution {
  const notes: string[] = [];
  const seen = new Set<string>();
  const uniq = rows.filter((r) => {
    const k = JSON.stringify([r.teamOwner, r.year, r.round, r.teamFrom, r.swapOwner, r.swapOption, r.protections, r.pickPool, r.rank]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const done = new Map<string, ResolvedPick>();
  for (const round of [1, 2] as const) {
    for (let season = first; season <= last; season++) {
      const ctx: Ctx = { proj, season, round, done, firstSeason: first };
      const claims = uniq.filter((r) => r.year === season && (round === 1 ? /first/i : /second/i).test(r.round)).flatMap((r) => rowClaims(r, ctx, notes));
      // "if not already settled": discount by the chance an earlier pick of that team conveyed
      const settled = (origin: string) => {
        let stay = 1;
        for (let y = first; y < season; y++) stay *= 1 - conveys(ctx, origin, y, round);
        return stay;
      };
      const chained = new Set(claims.filter((c) => c.chain).map((c) => `${c.to}>${c.origin}`));
      for (const c of claims) if (chained.has(`${c.to}>${c.origin}`)) c.w *= settled(c.origin);
      for (const origin of ALL_TEAMS) {
        const score = new Map<string, number>([[origin, 0.25]]);
        const mine = claims.filter((c) => c.origin === origin);
        // the same claim stated from several teams' points of view counts once
        const best = new Map<string, Claim>();
        for (const c of mine) {
          const k = `${c.to}|${c.lo ?? ''}|${c.hi ?? ''}`;
          if (!best.has(k) || best.get(k)!.w < c.w) best.set(k, c);
        }
        for (const c of best.values()) {
          const p = c.lo !== undefined && c.hi !== undefined ? proj.prob(origin, season, c.lo, c.hi) : 1;
          score.set(c.to, (score.get(c.to) ?? 0) + c.w * p);
        }
        let owner = origin;
        for (const [t, s] of score) if (s > (score.get(owner) ?? 0) + 1e-9) owner = t;
        if (process.env.HC_PICK_DEBUG === pkey(season, round, origin)) {
          for (const c of mine) console.log('  claim', c.to, c.w.toFixed(2), c.lo ?? '', c.hi ?? '', c.chain ? 'chain' : '', c.src);
          console.log('  score', [...score].map(([t, s]) => `${t}:${s.toFixed(2)}`).join(' '), '->', owner);
        }
        const res: ResolvedPick = { season, round, original: origin, owner };
        if (owner !== origin) {
          // a range "a-30" claim is a top-(a-1) protection: below it, the pick stays home
          const los = mine.filter((c) => c.to === owner && c.lo !== undefined && c.hi === 30 && c.lo > 1).map((c) => c.lo!);
          const plain = mine.some((c) => c.to === owner && c.lo === undefined);
          if (los.length && !plain) res.protection = Math.min(...los) - 1;
        }
        done.set(pkey(season, round, origin), res);
      }
    }
  }
  const picks = [...done.values()].sort((a, b) => a.season - b.season || a.round - b.round || a.original.localeCompare(b.original));
  return { picks, notes };
}

// ------------------------------------------------------------------ cross-check

/**
 * LD Sport's table (tobeyhirsch/nba-draft-pick-grader): per team and year, the picks it may own,
 * e.g. "MIL/NO (Less Favorable) 1st (If #5-30), ATL 2nd". Returns, per team and season, the
 * number of picks in the round it surely owns (no "If") and may own (all listed).
 */
export function parseLdSport(py: string, round: 1 | 2 = 1): Map<string, { sure: number; max: number }> {
  const out = new Map<string, { sure: number; max: number }>();
  const tag = round === 1 ? /\b1st\b/ : /\b2nd\b/;
  let team: string | undefined;
  for (const line of py.split('\n')) {
    const t = line.match(/^\s*"([^"]+)": \{\s*$/);
    if (t) {
      team = teamByName(t[1]);
      continue;
    }
    const y = line.match(/^\s*(\d{4}): "(.*)",?\s*$/);
    if (!y || !team) continue;
    const items: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of y[2]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        items.push(cur);
        cur = '';
      } else cur += ch;
    }
    items.push(cur);
    // the round is the last word once trailing "(If ...)" notes are dropped
    const firsts = items.filter((i) =>
      tag.test(
        i
          .replace(/(\s*\((?:[^()]|\([^()]*\))*\))+\s*$/, '')
          .trim()
          .split(/\s+/)
          .pop() ?? '',
      ),
    );
    out.set(`${team}:${y[1]}`, { sure: firsts.filter((i) => !/\(If /.test(i)).length, max: firsts.length });
  }
  return out;
}
