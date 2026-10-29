// Other teams' nights as the press tells them: the genuinely big ones (a 50-point game, a huge
// comeback, a long streak extended or snapped, a meeting of the top two, a triple-overtime war, a
// Game 7 or an upset) become stories, and each night gets at most one "around the league" brief
// naming its best performances. The user's games are game day's to tell (gameStory.ts), never these.
import type { BoxLine, GameResult, League, NewsItem, ScheduledGame, TeamBox } from '../../types';
import { gameScore } from '../awards';
import { fmtDate } from '../helpers';
import { worldRng } from '../world';
import type { MediaState } from '../media';
import { Voice, confName, last, name, nightLine, nth, perGame, poss, publish, rebOf, rec, recOf, tsOf, type Story } from './voice';

/** A roundup's first words: how its brief is known again (pruned after a fortnight). */
export const ROUNDUP = 'Around the league: ';
/** Stories about other teams' games a night, past which only a front-page night gets in. */
const NIGHT_STORIES = 2;

/** The result of a game just played: the last entry of `league.games` with its gid. */
export function resultOf(league: League, gid: number): GameResult | undefined {
  for (let i = league.games.length - 1; i >= 0; i--) if (league.games[i].gid === gid) return league.games[i];
  return undefined;
}

const isUser = (league: League, g: { home: number; away: number }) => g.home === league.userTid || g.away === league.userTid;

/** The winner's and the loser's boxes. */
function sides(res: GameResult): { w: TeamBox; l: TeamBox } {
  return res.home.pts > res.away.pts ? { w: res.home, l: res.away } : { w: res.away, l: res.home };
}

const score = (res: GameResult) => `${Math.max(res.home.pts, res.away.pts)}-${Math.min(res.home.pts, res.away.pts)}${res.ot ? (res.ot === 1 ? ' (OT)' : ` (${res.ot}OT)`) : ''}`;

/** The box line that led a side in points. */
function topScorer(side: TeamBox): BoxLine | undefined {
  let best: BoxLine | undefined;
  for (const b of side.players) if (!best || b.pts > best.pts || (b.pts === best.pts && b.pid < best.pid)) best = b;
  return best;
}

/** A team's place in its conference by winning percentage (ties by wins, then id): cheap enough for every game. */
function confRank(league: League, tid: number): number {
  const conf = league.teams[tid].conf;
  const pct = (t: number) => {
    const ts = tsOf(league, t);
    return ts.won + ts.lost ? ts.won / (ts.won + ts.lost) : 0;
  };
  const mine = pct(tid);
  let r = 1;
  for (const t of league.teams) if (t.conf === conf && t.tid !== tid && (pct(t.tid) > mine || (pct(t.tid) === mine && tsOf(league, t.tid).won > tsOf(league, tid).won))) r++;
  return r;
}

/** "31-12, 2nd in the East". */
function standing(league: League, tid: number): string {
  return `${recOf(tsOf(league, tid))}, ${nth(confRank(league, tid))} in the ${confName(league.teams[tid].conf)}`;
}

/** Remember each team's streak after every regular-season game: the streak a team carried into a game is what it had after its last. */
function streakMemory(league: League, m: MediaState): number[] {
  if (!m.streaks || m.streaks.season !== league.season || m.streaks.s.length !== league.teams.length)
    m.streaks = { season: league.season, s: league.teams.map((t) => tsOf(league, t.tid).streak) };
  return m.streaks.s;
}

/** Stories about other teams' games already written tonight. */
function storiesTonight(league: League): number {
  let n = 0;
  for (let i = league.news.length - 1; i >= 0; i--) {
    const x = league.news[i];
    if (x.season !== league.season || x.day !== league.day) break;
    if (x.kind === 'game' && x.head && !x.tids.includes(league.userTid)) n++;
  }
  return n;
}

/** A brief already in the news tonight that a story should take the place of (so a night isn't told twice). */
function briefTonight(league: League, pred: (n: NewsItem) => boolean): NewsItem | undefined {
  for (let i = league.news.length - 1; i >= 0; i--) {
    const x = league.news[i];
    if (x.season !== league.season || x.day !== league.day) break;
    if (!x.head && pred(x)) return x;
  }
  return undefined;
}

/** Write a story, or turn tonight's brief about the same thing into it. */
function tell(league: League, s: Story, brief?: NewsItem) {
  if (!brief) {
    publish(league, s);
    return;
  }
  brief.kind = s.kind;
  brief.head = s.head;
  brief.text = s.dek;
  if (s.body?.length) brief.body = s.body.filter(Boolean).join('\n\n');
  brief.tids = [...new Set([...s.tids, ...brief.tids])];
  brief.pids = [...new Set([...s.pids, ...brief.pids])];
  brief.weight = s.weight;
}

interface Candidate {
  weight: 1 | 2 | 3;
  /** Which of tonight's candidates is told (the biggest). */
  size: number;
  write: (v: Voice) => void;
}

/** After every game: other teams' big nights become stories. */
export function pressGame(league: League, g: ScheduledGame, m: MediaState) {
  const res = resultOf(league, g.gid);
  if (!res) return;
  const regular = res.type === 'regular';
  const mem = regular ? streakMemory(league, m) : null;
  const before = mem ? { home: mem[g.home], away: mem[g.away] } : null;
  if (mem) {
    mem[g.home] = tsOf(league, g.home).streak;
    mem[g.away] = tsOf(league, g.away).streak;
  }
  if (isUser(league, g) || (res.type !== 'regular' && res.type !== 'playoffs')) return;
  const { w, l } = sides(res);
  const cands: Candidate[] = [];

  // a 50-point night (the brief games.ts wrote for it becomes the story)
  for (const side of [w, l]) {
    const b = topScorer(side);
    if (b && b.pts >= 50) cands.push({ weight: b.pts >= 55 ? 3 : 2, size: 100 + b.pts, write: (v) => fifty(league, v, res, side, side === w ? l : w, b) });
  }
  // a comeback from 25 down
  if (l.extra.biggestLead >= 25) cands.push({ weight: 2, size: 60 + l.extra.biggestLead, write: (v) => comeback(league, v, res, w, l) });
  if (res.ot >= 3) cands.push({ weight: 2, size: 55 + res.ot, write: (v) => overtime(league, v, res, w, l) });
  if (before) {
    const ws = tsOf(league, w.tid).streak;
    if (ws >= 10 && (ws === 10 || ws % 5 === 0)) cands.push({ weight: ws >= 15 ? 3 : 2, size: 50 + ws, write: (v) => winRun(league, v, res, w, l, ws) });
    const lost = l.tid === g.home ? before.home : before.away;
    if (lost >= 9) cands.push({ weight: lost >= 14 ? 3 : 2, size: 50 + lost, write: (v) => snapped(league, v, res, w, l, lost) });
    const ls = -tsOf(league, l.tid).streak;
    if (ls === 12 || ls === 16 || ls === 20 || ls === 25) cands.push({ weight: 1, size: 20 + ls, write: (v) => skid(league, v, res, w, l, ls) });
    const was = w.tid === g.home ? before.home : before.away;
    if (was <= -12) cands.push({ weight: 1, size: 20 - was, write: (v) => skidOver(league, v, res, w, l, -was) });
    // the conference's top two, once the table means something
    const gp = (t: number) => tsOf(league, t).won + tsOf(league, t).lost;
    if (league.teams[w.tid].conf === league.teams[l.tid].conf && gp(w.tid) >= 20 && gp(l.tid) >= 20) {
      const rw = confRank(league, w.tid);
      const rl = confRank(league, l.tid);
      if (rw <= 2 && rl <= 2) cands.push({ weight: 2, size: 45, write: (v) => clash(league, v, res, w, l) });
    }
  }
  if (res.type === 'playoffs') {
    const s = league.playoffs.find((x) => x.id === res.seriesId);
    if (s?.winner !== undefined && s.round < 4) {
      const games = s.highWins + s.lowWins;
      const upset = s.winner === s.low && s.lowSeed - s.highSeed >= 3;
      if (games === 7 || upset)
        cands.push({ weight: s.round >= 3 || (games === 7 && upset) ? 3 : 2, size: 70 + s.round, write: (v) => seriesOver(league, v, res, s, games === 7, upset) });
    }
  }
  if (!cands.length) return;
  cands.sort((a, b) => b.weight - a.weight || b.size - a.size);
  const top = cands[0];
  if (top.weight < 3 && storiesTonight(league) >= NIGHT_STORIES) return;
  top.write(new Voice(worldRng(league, 'night', league.season, g.gid), m));
}

// ---------------------------------------------------------------- the stories

function fifty(league: League, v: Voice, res: GameResult, side: TeamBox, opp: TeamBox, b: BoxLine) {
  const p = league.players[b.pid];
  if (!p) return;
  const L = last(league, p);
  const N = league.teams[side.tid].name;
  const O = league.teams[opp.tid].name;
  const won = side.pts > opp.pts;
  const head = v.say('fifty', [
    `${L} scores ${b.pts} ${won ? `as the ${N} beat the ${O}` : `in a loss to the ${O}`}`,
    `${b.pts} for ${L}${won ? '' : ', and the ' + N + ' still lose'}`,
    `${L} drops ${b.pts} on the ${O}`,
    `${poss(L)} ${b.pts}-point night ${won ? `sinks the ${O}` : `isn't enough against the ${O}`}`,
    `${L} goes for ${b.pts}${won ? '' : ' in a losing cause'}`,
  ]);
  const shooting = `${b.fgm}-${b.fga} from the field`;
  // the rest of his shooting, a sentence of its own
  const rest = [b.tpa ? `${b.tpm}-${b.tpa} from three` : '', b.fta ? `${b.ftm}-${b.fta} at the line` : ''].filter(Boolean).join(' and ');
  const dek = `${name(p)} went ${shooting} in the ${poss(N)} ${score(res)} ${won ? 'win over' : 'loss to'} the ${O}.${rest ? ` He was ${rest}.` : ''}`;
  // how rare: the season's 50-point nights so far (read only on such a night)
  let fifties = 0;
  for (const g of league.games) if (g.season === league.season) for (const s of [g.home, g.away]) for (const x of s.players) if (x.pts >= 50) fifties++;
  const pg = perGame(p, league.season);
  const avg = pg && pg.gp > 1 ? (pg.pts * pg.gp - b.pts) / (pg.gp - 1) : null;
  const mate = side.players.filter((x) => x.pid !== b.pid).sort((a, c) => c.pts - a.pts)[0];
  const body = [
    v.say('fifty-b1', [
      `${L} finished with ${nightLine(b)} in ${Math.round(b.min)} minutes.${avg !== null ? ` He came in averaging ${avg.toFixed(1)}.` : ''}`,
      `${avg !== null ? `A ${avg.toFixed(1)}-a-game scorer coming in, ${L}` : L} had ${nightLine(b)}, in ${Math.round(b.min)} minutes.`,
    ]),
    fifties <= 1
      ? `It's the league's first 50-point game of the ${res.type === 'playoffs' ? 'postseason' : 'season'}.`
      : `It's the ${nth(fifties)} 50-point game around the league this season.`,
    won
      ? `${mate && mate.pts >= 15 ? `${league.players[mate.pid] ? last(league, league.players[mate.pid]) : mate.name} added ${mate.pts}. ` : ''}The ${N} are ${standing(league, side.tid)}.`
      : `The rest of the ${N} shot ${side.t.fgm - b.fgm}-${side.t.fga - b.fga}. They are ${standing(league, side.tid)}.`,
  ];
  const brief = briefTonight(league, (n) => n.kind === 'milestone' && n.pids.includes(p.pid));
  // a front page for 55, or for the season's first 50
  const weight = b.pts >= 55 || fifties <= 1 ? 3 : 2;
  tell(league, { kind: 'game', head, dek, body: res.type === 'regular' ? body : body.slice(0, 2), tids: [side.tid, opp.tid], pids: [p.pid], weight }, brief);
}

function comeback(league: League, v: Voice, res: GameResult, w: TeamBox, l: TeamBox) {
  const WN = league.teams[w.tid].name;
  const LN = league.teams[l.tid].name;
  const lead = l.extra.biggestLead;
  const head = v.say('comeback', [
    `The ${WN} rally from ${lead} down to beat the ${LN}`,
    `Down ${lead}, the ${WN} come all the way back`,
    `The ${LN} blow a ${lead}-point lead`,
    `The ${WN} erase a ${lead}-point hole against the ${LN}`,
    `${lead} down, and the ${WN} still win`,
  ]);
  const hero = topScorer(w);
  const p = hero ? league.players[hero.pid] : undefined;
  const dek = `${WN} ${score(res)} ${LN}${p && hero ? `: ${last(league, p)} had ${nightLine(hero)} in the comeback` : ''}.`;
  const half = (s: TeamBox) => (s.quarters[0] ?? 0) + (s.quarters[1] ?? 0);
  const q4 = (s: TeamBox) => s.quarters[3] ?? 0;
  const body = [
    half(l) > half(w) ? `The ${LN} led ${half(l)}-${half(w)} at the half and by as many as ${lead}.` : `The ${LN} were up by as many as ${lead} before it turned.`,
    q4(w) > q4(l) ? `The ${WN} won the fourth quarter ${q4(w)}-${q4(l)}.` : '',
    `The ${WN} are ${standing(league, w.tid)}. The ${LN} are ${recOf(tsOf(league, l.tid))}.`,
  ];
  publish(league, { kind: 'game', head, dek, body: res.type === 'regular' ? body : body.slice(0, 2), tids: [w.tid, l.tid], pids: p ? [p.pid] : [], weight: 2 });
}

function overtime(league: League, v: Voice, res: GameResult, w: TeamBox, l: TeamBox) {
  const WN = league.teams[w.tid].name;
  const LN = league.teams[l.tid].name;
  const ots = res.ot === 3 ? 'triple overtime' : `${res.ot} overtimes`;
  const head = v.say('ot', [`The ${WN} outlast the ${LN} in ${ots}`, `${res.ot === 3 ? 'Three' : res.ot} overtimes, and the ${WN} survive`, `A ${ots} war goes to the ${WN}`]);
  const hero = topScorer(w);
  const p = hero ? league.players[hero.pid] : undefined;
  const dek = `${WN} ${score(res)} ${LN}${p && hero ? `. ${last(league, p)} played ${Math.round(hero.min)} minutes and scored ${hero.pts}` : ''}.`;
  publish(league, { kind: 'game', head, dek, tids: [w.tid, l.tid], pids: p ? [p.pid] : [], weight: 2 });
}

/** A team's last `n` regular-season results, newest first. */
function lastGames(league: League, tid: number, n: number): GameResult[] {
  const out: GameResult[] = [];
  for (let i = league.games.length - 1; i >= 0 && out.length < n; i--) {
    const g = league.games[i];
    if (g.season !== league.season) break;
    if (g.type === 'regular' && (g.home.tid === tid || g.away.tid === tid)) out.push(g);
  }
  return out;
}

/** Over a team's last games: the average margin and its leading scorer's points a game. */
function runFacts(league: League, tid: number, n: number) {
  const games = lastGames(league, tid, n);
  let margin = 0;
  const pts = new Map<number, number>();
  for (const g of games) {
    const [us, them] = g.home.tid === tid ? [g.home, g.away] : [g.away, g.home];
    margin += us.pts - them.pts;
    for (const b of us.players) pts.set(b.pid, (pts.get(b.pid) ?? 0) + b.pts);
  }
  const lead = [...pts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return { margin: games.length ? margin / games.length : 0, leader: lead ? { pid: lead[0], ppg: lead[1] / Math.max(1, games.length) } : null, games };
}

function winRun(league: League, v: Voice, res: GameResult, w: TeamBox, l: TeamBox, n: number) {
  const N = league.teams[w.tid].name;
  const O = league.teams[l.tid].name;
  const head = v.say('run', [
    `The ${N} make it ${n} straight`,
    `${n} in a row for the ${N}`,
    `The ${N} keep rolling: ${n} straight`,
    `No stopping the ${N}: ${n} wins running`,
    `Make it ${n}: the ${N} beat the ${O}`,
  ]);
  const dek = `A ${score(res)} win over the ${O} puts the ${N} at ${standing(league, w.tid)}.`;
  const f = runFacts(league, w.tid, n);
  const lp = f.leader ? league.players[f.leader.pid] : undefined;
  const lastLoss = lastGames(league, w.tid, n + 1)[n];
  const body = [
    `They have won the ${n} by an average of ${f.margin.toFixed(1)} points${lp && f.leader ? `, and ${last(league, lp)} has averaged ${f.leader.ppg.toFixed(1)} over the run` : ''}.`,
    lastLoss
      ? `Their last loss: ${fmtDate(league.season, lastLoss.day, { month: 'short', day: 'numeric' })}, against the ${league.teams[lastLoss.home.tid === w.tid ? lastLoss.away.tid : lastLoss.home.tid].name}.`
      : '',
  ];
  publish(league, { kind: 'game', head, dek, body, tids: [w.tid, l.tid], pids: lp ? [lp.pid] : [], weight: n >= 15 ? 3 : 2 });
}

function snapped(league: League, v: Voice, res: GameResult, w: TeamBox, l: TeamBox, n: number) {
  const N = league.teams[l.tid].name;
  const O = league.teams[w.tid].name;
  const head = v.say('snap', [
    `The ${O} end the ${poss(N)} ${n}-game streak`,
    `The ${poss(N)} run stops at ${n}`,
    `${n} and done: the ${O} stop the ${N}`,
    `The ${O} snap the ${poss(N)} streak at ${n}`,
  ]);
  const hero = topScorer(w);
  const p = hero ? league.players[hero.pid] : undefined;
  const dek = `${O} ${score(res)} ${N}${p && hero ? `: ${last(league, p)} had ${nightLine(hero)}` : ''}.`;
  const body = [`The ${N} had not lost in ${n} games. They are ${standing(league, l.tid)}. The ${O} are ${recOf(tsOf(league, w.tid))}.`];
  publish(league, { kind: 'game', head, dek, body, tids: [l.tid, w.tid], pids: p ? [p.pid] : [], weight: n >= 14 ? 3 : 2 });
}

function skid(league: League, v: Voice, res: GameResult, w: TeamBox, l: TeamBox, n: number) {
  const N = league.teams[l.tid].name;
  const head = v.say('skid', [`The ${N} have lost ${n} straight`, `${n} in a row now for the ${N}`, `No end in sight: the ${N} drop ${n} straight`]);
  const dek = `${league.teams[w.tid].name} ${score(res)} ${N}. The ${N} are ${recOf(tsOf(league, l.tid))}.`;
  publish(league, { kind: 'game', head, dek, tids: [l.tid, w.tid], pids: [], weight: 1 });
}

function skidOver(league: League, v: Voice, res: GameResult, w: TeamBox, l: TeamBox, n: number) {
  const N = league.teams[w.tid].name;
  const head = v.say('skid-over', [
    `The ${N} win at last, ending a ${n}-game skid`,
    `${n} losses, then a win: the ${N} beat the ${league.teams[l.tid].name}`,
    `The ${poss(N)} ${n}-game slide is over`,
  ]);
  const dek = `${N} ${score(res)} ${league.teams[l.tid].name}. The ${N} are ${recOf(tsOf(league, w.tid))}.`;
  publish(league, { kind: 'game', head, dek, tids: [w.tid, l.tid], pids: [], weight: 1 });
}

function clash(league: League, v: Voice, res: GameResult, w: TeamBox, l: TeamBox) {
  const WN = league.teams[w.tid].name;
  const LN = league.teams[l.tid].name;
  const conf = confName(league.teams[w.tid].conf);
  const head = v.say('clash', [
    `The ${WN} beat the ${LN} in a meeting of the ${conf}'s top two`,
    `First place on the line, and the ${WN} take it`,
    `The ${WN} win the ${conf}'s heavyweight bout`,
    `The ${WN} take the measure of the ${LN}`,
  ]);
  const a = topScorer(w);
  const b = topScorer(l);
  const pa = a ? league.players[a.pid] : undefined;
  const pb = b ? league.players[b.pid] : undefined;
  const dek = `${WN} ${score(res)} ${LN}.${pa && a ? ` ${last(league, pa)} had ${nightLine(a)}.` : ''}${pb && b ? ` ${last(league, pb)} scored ${b.pts} for the ${LN}.` : ''}`;
  // the season series between them so far
  let ww = 0;
  let lw = 0;
  for (const g of league.games) {
    if (g.season !== league.season || g.type !== 'regular') continue;
    const ids = [g.home.tid, g.away.tid];
    if (!ids.includes(w.tid) || !ids.includes(l.tid)) continue;
    const winner = g.home.pts > g.away.pts ? g.home.tid : g.away.tid;
    if (winner === w.tid) ww++;
    else lw++;
  }
  const body = [
    `The ${WN} are ${standing(league, w.tid)}. The ${LN} are ${standing(league, l.tid)}.`,
    ww + lw > 1 ? `The ${WN} ${ww > lw ? 'lead' : ww === lw ? 'have evened' : 'trail'} the season series ${rec(Math.max(ww, lw), Math.min(ww, lw))}.` : '',
  ];
  publish(league, { kind: 'game', head, dek, body, tids: [w.tid, l.tid], pids: [pa?.pid, pb?.pid].filter((x): x is number => x !== undefined), weight: 2 });
}

function seriesOver(league: League, v: Voice, res: GameResult, s: League['playoffs'][number], seven: boolean, upset: boolean) {
  const wt = s.winner!;
  const lt = wt === s.high ? s.low : s.high;
  const WN = league.teams[wt].name;
  const LN = league.teams[lt].name;
  const ws = wt === s.high ? s.highSeed : s.lowSeed;
  const ls = wt === s.high ? s.lowSeed : s.highSeed;
  const round = s.round === 1 ? 'first round' : s.round === 2 ? 'second round' : `${confName(s.conf as 'E' | 'W')} finals`;
  const head = seven
    ? v.say('g7', [
        `The ${WN} win Game 7 and end the ${poss(LN)} season`,
        `Game 7 goes to the ${WN}`,
        `The ${WN} survive the ${LN} in seven`,
        `Seven games, and the ${WN} are through`,
      ])
    : v.say('upset', [`No. ${ws} ${WN} knock out No. ${ls} ${LN}`, `Upset: the ${WN} take down the ${LN}`, `The ${LN} are out, beaten by the ${ws}-seed ${WN}`]);
  const hero = topScorer(res.home.tid === wt ? res.home : res.away);
  const p = hero ? league.players[hero.pid] : undefined;
  const dek = `${WN} ${score(res)} ${LN} closes the ${round} ${rec(Math.max(s.highWins, s.lowWins), Math.min(s.highWins, s.lowWins))}.${p && hero ? ` ${last(league, p)} had ${nightLine(hero)}.` : ''}`;
  const brief = briefTonight(league, (n) => n.kind === 'general' && n.tids[0] === wt && n.tids[1] === lt);
  const body = [
    upset ? `The ${LN} won ${tsOf(league, lt).won} games in the regular season, the ${WN} ${tsOf(league, wt).won}.` : '',
    s.round < 3 ? `Next for the ${WN}: the ${s.round === 1 ? 'second round' : `${confName(s.conf as 'E' | 'W')} finals`}.` : `The ${WN} are going to the Finals.`,
  ];
  tell(league, { kind: 'game', head, dek, body, tids: [wt, lt], pids: p ? [p.pid] : [], weight: s.round >= 3 || (seven && upset) ? 3 : 2 }, brief);
}

// ---------------------------------------------------------------- the nightly roundup

/**
 * One brief a night on the best of the rest: the three best lines by game score from other teams'
 * games, a team once, leaving out the players a story or a milestone brief already covered.
 */
export function roundup(league: League, m: MediaState) {
  const lastGame = league.games[league.games.length - 1];
  if (!lastGame || lastGame.season !== league.season || (lastGame.type !== 'regular' && lastGame.type !== 'playoffs')) return;
  const day = lastGame.day;
  const key = league.season * 1000 + day;
  if (m.roundup === key) return;
  m.roundup = key;
  const games: GameResult[] = [];
  for (let i = league.games.length - 1; i >= 0; i--) {
    const g = league.games[i];
    if (g.season !== league.season || g.day !== day) break;
    if ((g.type === 'regular' || g.type === 'playoffs') && !isUser(league, { home: g.home.tid, away: g.away.tid })) games.push(g);
  }
  if (games.length < 2) return;
  const covered = new Set<number>();
  for (let i = league.news.length - 1; i >= 0; i--) {
    const x = league.news[i];
    if (x.season !== league.season || x.day < day) break;
    if (x.kind === 'milestone' || (x.kind === 'game' && x.head)) for (const pid of x.pids) covered.add(pid);
  }
  const cands: { b: BoxLine; g: GameResult; side: TeamBox; opp: TeamBox; gs: number }[] = [];
  for (const g of games.reverse()) {
    for (const [side, opp] of [
      [g.home, g.away],
      [g.away, g.home],
    ] as const) {
      for (const b of side.players) {
        if (covered.has(b.pid) || !league.players[b.pid]) continue;
        const gs = gameScore(b);
        if (gs >= 24 || b.pts >= 35) cands.push({ b, g, side, opp, gs });
      }
    }
  }
  cands.sort((a, b) => b.gs - a.gs || a.b.pid - b.b.pid);
  const picked: typeof cands = [];
  for (const x of cands) {
    if (picked.length >= 3) break;
    if (picked.some((y) => y.side.tid === x.side.tid || y.opp.tid === x.side.tid)) continue;
    picked.push(x);
  }
  if (!picked.length) return;
  const v = new Voice(worldRng(league, 'roundup', league.season, day), m);
  const parts = picked.map(({ b, side, opp }, i) => {
    const p = league.players[b.pid];
    const L = last(league, p);
    const N = league.teams[side.tid].name;
    const O = league.teams[opp.tid].name;
    const won = side.pts > opp.pts;
    const reb = rebOf(b);
    const shape =
      reb >= 10 && b.ast >= 10
        ? `${b.pts}, ${reb} rebounds and ${b.ast} assists`
        : reb >= 10
          ? `${b.pts} and ${reb} rebounds`
          : b.ast >= 10
            ? `${b.pts} and ${b.ast} assists`
            : `${b.pts}`;
    return v.say(`rnd${i}`, [
      `${L} had ${shape} as the ${N} ${won ? 'beat' : 'lost to'} the ${O}`,
      won ? `${poss(L)} ${shape} carried the ${N} past the ${O}` : `${poss(L)} ${shape} weren't enough for the ${N} against the ${O}`,
      `${L} put up ${shape} in the ${poss(N)} ${won ? 'win over' : 'loss to'} the ${O}`,
      won ? `the ${N} beat the ${O} behind ${poss(L)} ${shape}` : `${L} scored ${b.pts} in a ${N} loss to the ${O}`,
    ]);
  });
  // one game a sentence, each short enough to read at a glance
  const lines = parts.map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const text = `${ROUNDUP}${lines.join('. ')}.`;
  publish(league, { kind: 'game', dek: text, tids: picked.map((x) => x.side.tid), pids: picked.map((x) => x.b.pid), weight: 1 });
}
