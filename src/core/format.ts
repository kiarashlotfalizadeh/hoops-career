// How the game writes its figures, the same way on every screen and in every message: money,
// counts with their nouns. Amounts are stored in thousands of dollars ($K) throughout the league.

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
