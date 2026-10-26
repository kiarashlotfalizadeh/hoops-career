// How the game writes its figures, the same way on every screen and in every message: money,
// counts with their nouns, ranks, shooting lines, injuries. Amounts are stored in thousands of
// dollars ($K) throughout the league.

/** Money in $K → "$12.3M" (`d` decimals; a value that rounds to zero has no minus sign). */
export function money(k: number, d = 1): string {
  const m = (Math.abs(k) / 1000).toFixed(d);
  return `${k < 0 && Number(m) !== 0 ? '-' : ''}$${m}M`;
}

/** Money with its sign: "+$1.2M", "-$3.4M" (a value that rounds to zero reads "+$0.0M"). */
export function moneySigned(k: number, d = 1): string {
  const m = (Math.abs(k) / 1000).toFixed(d);
  return `${k < 0 && Number(m) !== 0 ? '-' : '+'}$${m}M`;
}

/** Small amounts to the $10K when they aren't a round $0.1M (minimums, two-ways, cash): "$1.27M", "$2.5M". */
export const moneyExact = (k: number) => money(k, Math.round(k) % 100 ? 2 : 1);

/** A count with its noun: "1 game", "5 games", "2 second-rounders" (`many` for irregular plurals). */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 101st, 111th. */
export const ordinalSuffix = (n: number) => {
  const v = Math.abs(n) % 100;
  return v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th');
};
export const ordinal = (n: number) => `${n}${ordinalSuffix(n)}`;

/** A rank with the field it's out of: "7th of 30". */
export const rankOf = (n: number, of: number) => `${ordinal(n)} of ${of}`;

/** Made-attempted, as a box score writes it, in tables and sentences alike: "34-90". */
export const madeAtt = (made: number, att: number) => `${made}-${att}`;

/**
 * Text for the screen with its figures kept whole: a record, a series or a made-attempted ("48-5",
 * "1-0", "11-16") never breaks at its hyphen on a narrow line (an invisible word joiner after it).
 * For display only: compare and store the plain string.
 */
export const keepFigures = (s: string) => s.replace(/(\d)-(?=\d)/g, '$1-⁠');

/** An injury's name in sentence case, acronyms and names kept: "Torn Meniscus" and "torn meniscus" → "Torn meniscus", "MCL Sprain" → "MCL sprain", "ruptured achilles" → "Ruptured Achilles". */
export function injuryName(name: string): string {
  const keep = (w: string) => /^[A-Z]{2,}$/.test(w) || /^achilles$/i.test(w);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return name
    .trim()
    .split(/\s+/)
    .map((w, i) => (/^[A-Z]{2,}$/.test(w) ? w : keep(w) ? cap(w) : i === 0 ? cap(w) : w.toLowerCase()))
    .join(' ');
}

/** How long an injury keeps him out: "out 1 game", "out 8 games"; past a whole season's 82, "out over a season". */
export const outFor = (games: number) => (games > 82 ? 'out over a season' : `out ${plural(games, 'game')}`);

/**
 * A moment of a game in a sentence or a list: "Q4 5:03", "Q4 0:35.0", "OT 2:06", "2OT 0:00.4". (The
 * scorebug's clock reads "35.0" under a minute, as a broadcast's does; in a line of text "Q4 35.0"
 * would read as thirty-five minutes.)
 */
export function gameTime(q: number, sec: number): string {
  const period = q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`;
  // (to the tenth, as the scorebug rounds: a hair added so a stored 24.3 that reads 24.2999… stays 24.3)
  const s = Math.floor(Math.max(0, sec) * 10 + 1e-6) / 10;
  const clock = s < 60 ? `0:${s.toFixed(1).padStart(4, '0')}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return `${period} ${clock}`;
}
