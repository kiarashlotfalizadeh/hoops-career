// Collapses the NBA.com profile into one recency-weighted record per Basketball Reference id,
// ready for rating derivation and calibration targets.
import type { NbaProfile } from './build';
import { ZONES, type PlayerPbp, type Zone } from './pbp';
import { crosswalk, type BbrefRow, type NbaPerson } from './crosswalk';

/** Same recency weights as the box-score aggregation. */
const W: Record<number, number> = { 2026: 1, 2025: 0.6, 2024: 0.3 };

export interface PbpAgg {
  nbaId: number;
  mins: number; // weighted minutes
  fga: Record<Zone, number>;
  fgm: Record<Zone, number>;
  astFgm: number;
  pullup: number;
  pullup3: number;
  drive: number;
  cut: number;
  putback: number;
  post: number;
  trans: number;
  dunk: number;
  lob: number;
  fta: number;
  sfDrawn: number;
  ast: number;
  astRim: number;
  ast3: number;
  tov: number;
  tovBadPass: number;
  tovLostBall: number;
  orb: number;
  drb: number;
  orbChances: number;
  drbChances: number;
  stl: number;
  blk: number;
  blkRim: number;
  pf: number;
  chargesDrawn: number;
  offPoss: number;
  defPoss: number;
  oppFga: number;
  oppRimA: number;
  oppRimM: number;
  teamFga: number;
  /** Matchup defense: points saved per 100 partial possessions guarded (regressed), and volume. */
  mdSaved: number;
  mdPoss: number;
  /** RAPM, points per 100 possessions (offense added, defense prevented), and weighted possessions. */
  rapmO: number;
  rapmD: number;
  rapmPoss: number;
}

const ZERO_Z = (): Record<Zone, number> => ({ rim: 0, paint: 0, mid: 0, c3: 0, ab3: 0 });

export function profilesByBbref(prof: NbaProfile, bbref: BbrefRow[], log = console.log): Map<string, PbpAgg> {
  const people = new Map<number, NbaPerson>();
  prof.seasons.forEach((s, i) => {
    for (const p of Object.values(prof.players[i])) {
      if (p.secs <= 0) continue;
      const e = people.get(p.id) ?? { pid: p.id, name: prof.names[p.id] ?? p.nameI, teams: {} };
      e.teams[s] = prof.teams[s]?.[p.id] ?? Object.keys(p.teams)[0];
      people.set(p.id, e);
    }
  });
  const { map, unmatched } = crosswalk([...people.values()], bbref);
  log(
    `  crosswalk: ${map.size} of ${people.size} NBA.com players matched${
      unmatched.length
        ? ` (unmatched: ${unmatched
            .slice(0, 8)
            .map((p) => p.name)
            .join(', ')})`
        : ''
    }`,
  );
  const out = new Map<string, PbpAgg>();
  for (const [pid, bid] of map) {
    const a: PbpAgg = {
      nbaId: pid,
      mins: 0,
      fga: ZERO_Z(),
      fgm: ZERO_Z(),
      astFgm: 0,
      pullup: 0,
      pullup3: 0,
      drive: 0,
      cut: 0,
      putback: 0,
      post: 0,
      trans: 0,
      dunk: 0,
      lob: 0,
      fta: 0,
      sfDrawn: 0,
      ast: 0,
      astRim: 0,
      ast3: 0,
      tov: 0,
      tovBadPass: 0,
      tovLostBall: 0,
      orb: 0,
      drb: 0,
      orbChances: 0,
      drbChances: 0,
      stl: 0,
      blk: 0,
      blkRim: 0,
      pf: 0,
      chargesDrawn: 0,
      offPoss: 0,
      defPoss: 0,
      oppFga: 0,
      oppRimA: 0,
      oppRimM: 0,
      teamFga: 0,
      mdSaved: 0,
      mdPoss: 0,
      rapmO: prof.rapm.off[pid] ?? 0,
      rapmD: prof.rapm.def[pid] ?? 0,
      rapmPoss: prof.rapm.poss[pid] ?? 0,
    };
    let mdSaved = 0;
    let mdPoss = 0;
    prof.seasons.forEach((s, i) => {
      const w = W[s] ?? 0.2;
      const p: PlayerPbp | undefined = prof.players[i][pid];
      if (p) {
        a.mins += (p.secs / 60) * w;
        for (const z of ZONES) {
          a.fga[z] += p.fga[z] * w;
          a.fgm[z] += p.fgm[z] * w;
          a.astRim += (z === 'rim' ? p.astZone[z] : 0) * w;
          a.ast3 += (z === 'c3' || z === 'ab3' ? p.astZone[z] : 0) * w;
        }
        a.astFgm += (p.astFgm2 + p.astFgm3) * w;
        a.pullup += p.pullup * w;
        a.pullup3 += p.pullup3 * w;
        a.drive += p.drive * w;
        a.cut += p.cut * w;
        a.putback += p.putback * w;
        a.post += p.post * w;
        a.trans += p.trans * w;
        a.dunk += (p.dunk ?? 0) * w;
        a.lob += p.lob * w;
        a.fta += p.fta * w;
        a.sfDrawn += p.sfDrawn * w;
        a.ast += p.ast * w;
        a.tov += p.tov * w;
        a.tovBadPass += p.tovBadPass * w;
        a.tovLostBall += p.tovLostBall * w;
        a.orb += p.orb * w;
        a.drb += p.drb * w;
        a.orbChances += p.orbChances * w;
        a.drbChances += p.drbChances * w;
        a.stl += p.stl * w;
        a.blk += p.blk * w;
        a.blkRim += p.blkZone.rim * w;
        a.pf += p.pf * w;
        a.chargesDrawn += p.chargesDrawn * w;
        a.offPoss += p.offPoss * w;
        a.defPoss += p.defPoss * w;
        a.oppFga += p.oppFga * w;
        a.oppRimA += p.oppRimA * w;
        a.oppRimM += p.oppRimM * w;
        a.teamFga += p.teamFga * w;
      }
      const d = prof.matchups[i]?.[pid];
      if (d) {
        mdSaved += (d.ptsExpected - d.ptsAllowed) * w;
        mdPoss += d.partialPoss * w;
      }
    });
    // regress matchup defense toward zero with 600 weighted partial possessions of prior
    a.mdSaved = (100 * mdSaved) / (mdPoss + 600);
    a.mdPoss = mdPoss;
    out.set(bid, a);
  }
  return out;
}
