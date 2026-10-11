// Positions. Basketball Reference's current roster pages only say G / F / C (or G-F, F-C),
// so prefer the five-position label from the player's box-score rows (the team he played the
// most minutes for in his latest season), then last season's roster page, and only infer
// from size and skills when neither exists (mostly rookies).
import type { Pos, Ratings } from '../../src/core/types';

const FIVE = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
const COMBINED = /^(TOT|\dTM)$/;

export interface PosRow {
  season: number;
  team: string;
  pos: string;
  g: number;
  mp: number;
}

/** Position from box-score rows: latest season, team with the most minutes. */
export function statsPosition(rows: PosRow[]): Pos | null {
  const real = rows.filter((r) => FIVE.has(r.pos));
  if (!real.length) return null;
  const latest = Math.max(...real.map((r) => r.season));
  const cand = real.filter((r) => r.season === latest);
  const teamRows = cand.filter((r) => !COMBINED.test(r.team));
  const pool = teamRows.length ? teamRows : cand;
  pool.sort((a, b) => b.g * b.mp - a.g * a.mp);
  return pool[0].pos as Pos;
}

/** Position when we only have G / F / C (raw roster label, e.g. "G-F"), height and ratings. */
export function inferPosition(raw: string, heightIn: number, r: Ratings): Pos {
  const label = (raw || '').toUpperCase();
  if (FIVE.has(label)) return label as Pos;
  const first = label.split('-')[0];
  const reb = (r.oreb + r.dreb) / 2;
  // fitted on players with both labels: a guard who handles and passes like a lead guard for his size is a PG
  const pgScore = r.pas - 60 + 0.5 * (r.hnd - 60) - 4 * (heightIn - 76);
  if (label === 'G-F' || label === 'F-G') return heightIn <= 77 ? (pgScore > -2 ? 'PG' : 'SG') : 'SF';
  if (label === 'F-C' || label === 'C-F') return heightIn >= 81 ? 'C' : 'PF';
  if (first === 'G') return pgScore > -2 ? 'PG' : 'SG';
  // wings handle and pass more, and rebound less, than power forwards of the same size
  if (first === 'F') return heightIn >= 83 && reb >= 50 ? 'C' : reb < 46 || (r.hnd + r.pas) / 2 >= 56 ? 'SF' : 'PF';
  if (first === 'C') return 'C';
  // no label at all: size and skills
  if (heightIn >= 83) return 'C';
  if (heightIn >= 80) return reb < 46 ? 'SF' : 'PF';
  if (heightIn >= 78) return 'SF';
  return pgScore > -2 ? 'PG' : 'SG';
}
