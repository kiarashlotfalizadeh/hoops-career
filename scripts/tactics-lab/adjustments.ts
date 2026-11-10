// What each kind of in-game adjustment is worth to the AI coach who makes it: paired games in which
// side A's coach may make only that kind (side B never adjusts), against the same games with none,
// over many real matchups. Reports, per kind, how often it was made and the margin change per game it
// was made in (and per 100 possessions over all games). A kind that loses goes in LOSING_ADJUSTMENTS
// (sim/engine/coach.ts).
// Usage: npx tsx scripts/tactics-lab/adjustments.ts [games per matchup] [kinds, comma-separated]
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../../src/core/league/create';
import { ensureRotation } from '../../src/core/league/games';
import { teamPlayers } from '../../src/core/league/helpers';
import { GameSim } from '../../src/core/sim/engine';
import { Rng } from '../../src/core/random';

const KINDS = ['hide', 'man', 'ice', 'unblitz', 'drop', 'pack', 'home', 'backoff', 'getback', 'attackZone', 'foulHunt', 'hunt', 'chase'];
const games = Number(process.argv[2] ?? 150);
const kinds = (process.argv[3] ?? '').split(',').filter(Boolean);
const L = createLeague({ name: 'Adjust', userTid: 0, coachName: 'C', settings: defaultSettings(), seed: JSON.parse(readFileSync('src/data/seed.json', 'utf8')), rngSeed: 11 });
for (const t of L.teams) ensureRotation(L, t.tid);
const side = (tid: number, adjust: boolean) => ({ team: { ...L.teams[tid], seasons: [] }, players: teamPlayers(L, tid).filter((p) => !p.injury), adjust });
const pairs: [number, number][] = [];
for (let a = 1; a < 30; a += 2) pairs.push([a, (a + 7) % 30 || 2]);
const play = (a: number, b: number, g: number, only: string[] | undefined) => {
  const rng = new Rng((9001 + a * 131 + Math.imul(g + 1, 2654435761)) >>> 0);
  const home = g % 2 === 0;
  const A = side(a, true);
  const B = side(b, false);
  const sim = new GameSim(home ? A : B, home ? B : A, { rng, type: 'regular', injuries: false, adjustOnly: only });
  const r = sim.simToEnd();
  const aSide = home ? 0 : 1;
  const margin = home ? r.home.pts - r.away.pts : r.away.pts - r.home.pts;
  const made = sim.adjustments.filter((x) => x.t === aSide).length;
  return { margin, made, poss: (r.home.poss + r.away.poss) / 2, win: margin > 0 ? 1 : 0 };
};
const base: { margin: number; poss: number; win: number }[] = [];
for (const [a, b] of pairs) for (let g = 0; g < games; g++) base.push(play(a, b, g, []));
for (const k of kinds.length ? kinds : KINDS) {
  let i = 0;
  let n = 0;
  let sum = 0;
  let sumMade = 0;
  let sq = 0;
  let sqMade = 0;
  let poss = 0;
  let wins = 0;
  let winsMade = 0;
  const diffs: number[] = [];
  for (const [a, b] of pairs)
    for (let g = 0; g < games; g++) {
      const r = play(a, b, g, [k]);
      const d = r.margin - base[i].margin;
      poss += base[i].poss;
      wins += r.win - base[i].win;
      if (r.made) winsMade += r.win - base[i].win;
      i++;
      diffs.push(d);
      sum += d;
      sq += d * d;
      if (r.made) {
        n++;
        sumMade += d;
        sqMade += d * d;
      }
    }
  const N = diffs.length;
  const mean = sum / N;
  const se = Math.sqrt((sq / N - mean * mean) / N);
  const mMade = n ? sumMade / n : 0;
  const seMade = n > 1 ? Math.sqrt((sqMade / n - mMade * mMade) / n) : 0;
  const per100 = (mean * 100) / (poss / N);
  console.log(
    `${k.padEnd(11)} made in ${((n / N) * 100).toFixed(1)}% of games | per game made ${mMade >= 0 ? '+' : ''}${mMade.toFixed(2)} ± ${seMade.toFixed(2)} | all games ${per100 >= 0 ? '+' : ''}${per100.toFixed(2)}/100 ± ${((se * 100) / (poss / N)).toFixed(2)} | wins +${wins} (${n ? ((winsMade / n) * 100).toFixed(1) : 0} pts of win% where made)`,
  );
}
