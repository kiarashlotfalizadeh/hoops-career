// Season hash: plays full seasons and their offseasons of a real-roster league from a fixed seed and
// hashes the whole league after each, so a change to the league code that should not change what
// happens (a speed-up, a refactor) can be proven not to. The engine fingerprint covers three weeks of
// a season; this covers the AI's trades and offers, the deadline, the playoffs, the draft, free agency
// and the next season's start. Prints each phase's time too.
// Usage: npx tsx scripts/season-hash.ts [seasons]   (1 season: about 10 s)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { freeAgents, standardRoster } from '../src/core/league/helpers';
import { askingContract, releasePlayer } from '../src/core/league/contracts';
import { userOffer } from '../src/core/league/freeAgency';
import { nextPick } from '../src/core/league/draft';
import { takeJob } from '../src/core/league/jobs';
import { standings } from '../src/core/league/standings';
import { CAP } from '../src/core/constants';

const seasons = Number(process.argv[2] ?? 1);
const seed = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
const L = createLeague({ name: 'Hash', userTid: 19, coachName: 'C', settings: defaultSettings(), seed, rngSeed: 42 });
// (a fixed id and creation time: the lottery draws ties from the id, and the clock would move the hash)
L.id = 'season_hash';
L.created = 0;
const hash = () => createHash('sha256').update(JSON.stringify(L)).digest('hex').slice(0, 16);
const times: Record<string, number> = {};
const time = (k: string, f: () => void) => {
  const t = performance.now();
  f();
  times[k] = (times[k] ?? 0) + performance.now() - t;
};
for (let s = 0; s < seasons; s++) {
  // the user's roster kept legal the simplest way: cut the worst down to 15, sign the best free agents up to 13
  const worst = standardRoster(L, L.userTid).sort((a, b) => a.ovr - b.ovr);
  while (standardRoster(L, L.userTid).length > CAP.rosterMax) releasePlayer(L, worst.shift()!, { news: false });
  for (const p of freeAgents(L).sort((a, b) => b.ovr - a.ovr)) {
    if (standardRoster(L, L.userTid).length >= CAP.rosterMin) break;
    userOffer(L, p.pid, askingContract(L, p, L.userTid).amount, 1);
  }
  const errs = startRegularSeason(L);
  if (errs.length) throw new Error(errs.join('; '));
  time('regular', () => {
    for (let g = 0; L.phase === 'regular' && g < 400; g++) simDay(L);
  });
  time('postseason', () => {
    for (let g = 0; (L.phase === 'playin' || L.phase === 'playoffs') && g < 200; g++) simDay(L);
  });
  console.log(`${hash()}  after season ${s + 1}`);
  // a fired coach takes the best job on offer (or the worst team's) so the league can go on
  if (L.fired) {
    const to = L.jobOffers?.offers[0]?.tid ?? [...standings(L).slice(0, 30)].sort((a, b) => a.pct - b.pct).find((r) => r.tid !== L.userTid)!.tid;
    takeJob(L, to);
  }
  time('offseason', () => {
    startDraft(L);
    for (let g = 0; nextPick(L) && g < 100; g++) autoDraftUserPick(L);
    finishDraftPhase(L);
    startFreeAgency(L);
    newSeason(L);
  });
}
console.log(
  Object.entries(times)
    .map(([k, v]) => `${k} ${(v / 1000).toFixed(2)} s`)
    .join(', '),
);
console.log(`season ${hash()}`);
