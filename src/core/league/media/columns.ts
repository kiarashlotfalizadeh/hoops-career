// The columnists: a grade for every trade, takes on the big free-agent signings, the early
// "surprises and disappointments" (against opening night's predictions), the midseason report
// card at the All-Star break, a preview when each playoff round starts and one for the Finals, and
// the season's wrap. The user's team leads wherever it is part of the story.
import type { League, PlayoffSeries, Txn } from '../../types';
import { marketSalary } from '../contracts';
import { money } from '../../format';
import { playerAge } from '../../playerGen';
import { seasonLabel } from '../../constants';
import { CAP_FOR, playerName } from '../helpers';
import { standings } from '../standings';
import { txnTotal } from '../transactions';
import { worldRng } from '../world';
import type { MediaState } from '../media';
import { gradeReason, gradeTrade, type SideGrade } from './grades';
import { strengths, seriesOdds } from './strength';
import { Voice, aGrade, confName, f1, gradeFor, last, list, netOf, nth, perGame, poss, publish, rec, recOf, rosters, signed, tsOf, type Grade } from './voice';

/** Whether a column has run this season, and mark it run. */
function once(league: League, m: MediaState, key: string): boolean {
  if (!m.done || m.done.season !== league.season) m.done = { season: league.season, keys: [] };
  if (m.done.keys.includes(key)) return false;
  m.done.keys.push(key);
  return true;
}

// ---------------------------------------------------------------- the moves

/** The transaction log since the columns last read it (on first sight of a save, nothing before now). */
function newMoves(league: League, m: MediaState): Txn[] {
  const log = league.transactions ?? [];
  const lastId = log.length ? log[log.length - 1].id : 0;
  if (m.txn === undefined) {
    m.txn = lastId;
    return [];
  }
  const from = m.txn;
  m.txn = Math.max(from, lastId);
  const out: Txn[] = [];
  for (let i = log.length - 1; i >= 0 && log[i].id > from; i--) out.push(log[i]);
  return out.reverse();
}

/** Every day: the trades and big signings since yesterday get their columns. */
export function moveColumns(league: League, m: MediaState) {
  const moves = newMoves(league, m);
  if (!moves.length) return;
  const trades = moves.filter((t) => t.kind === 'trade');
  if (trades.length) tradeColumns(league, m, trades);
  const signings = moves.filter((t) => (t.kind === 'sign' || t.kind === 'resign') && t.pid !== undefined && t.amount !== undefined);
  if (signings.length) signingColumn(league, m, signings);
}

function tradeColumns(league: League, m: MediaState, trades: Txn[]) {
  const graded = trades.flatMap((t) => {
    const g = gradeTrade(league, t);
    if (!g) return [];
    const best = Math.max(0, ...g.flatMap((s) => s.got.players.map((p) => p.ovr)));
    const firsts = g.reduce((a, s) => a + s.got.picks.filter((d) => d.round === 1).length, 0);
    const user = t.tids.includes(league.userTid);
    return [{ t, g, size: (user ? 1000 : 0) + best + 4 * firsts, best, firsts, user }];
  });
  for (const x of graded) tradeColumn(league, m, x.t, x.g, x.best >= 80 || x.firsts >= 2 ? (x.user ? 3 : 2) : x.user ? 2 : 1);
}

function tradeColumn(league: League, m: MediaState, t: Txn, g: [SideGrade, SideGrade], weight: 1 | 2 | 3) {
  const v = new Voice(worldRng(league, 'grade', t.id), m);
  // the user's side first
  const [a, b] = g[1].tid === league.userTid ? [g[1], g[0]] : g;
  const NA = league.teams[a.tid].name;
  const NB = league.teams[b.tid].name;
  const star = [...a.got.players, ...b.got.players].sort((x, y) => y.ovr - x.ovr || x.pid - y.pid)[0];
  const L = star ? last(league, star) : null;
  const head =
    a.tid === league.userTid
      ? v.say('grade-u', [
          `Grading the ${poss(NA)} trade with the ${NB}: ${aGrade(a.grade)}`,
          `The ${NA} get ${aGrade(a.grade)} for the ${L ? `${L} ` : ''}deal`,
          `Trade grades: ${NA} ${a.grade}, ${NB} ${b.grade}`,
          `${a.grade} for the ${NA}: the trade with the ${NB}, graded`,
        ])
      : weight >= 2 && L
        ? v.say('grade-big', [
            `Trade grades: ${NA} ${a.grade}, ${NB} ${b.grade}`,
            `Who won the ${L} trade? Grading the ${NA} and ${NB}`,
            `The ${L} deal, graded`,
            `${L} moves: the ${NA} get ${aGrade(a.grade)}, the ${NB} ${aGrade(b.grade)}`,
          ])
        : `Trade grades: ${NA} ${a.grade}, ${NB} ${b.grade}`;
  const sentTo = star ? (a.got.players.includes(star) ? a.tid : b.tid) : null;
  const dek =
    star && sentTo !== null
      ? `${playerName(star)} goes to the ${league.teams[sentTo].name}. The ${NA} get ${aGrade(a.grade)}, the ${NB} ${aGrade(b.grade)}.`
      : `The ${NA} get ${aGrade(a.grade)}, the ${NB} ${aGrade(b.grade)}.`;
  const say = (opts: string[]) => v.pick(opts);
  const body = [`${NA}: ${a.grade}. ${gradeReason(league, a, say)}`, `${NB}: ${b.grade}. ${gradeReason(league, b, say)}`];
  // the trade's own news item becomes its graded story (its line stays the dek): one item a trade
  const item = tradeItem(league, t);
  if (item) {
    item.head = head;
    item.body = body.join('\n\n');
    item.weight = weight;
    return;
  }
  publish(league, { kind: 'column', head, dek, body, tids: [a.tid, b.tid], pids: [...a.got.players, ...b.got.players].map((p) => p.pid), weight });
}

/** The news item executeTrade wrote for a trade ("Trade: ..."), if it's still in the news. */
function tradeItem(league: League, t: Txn) {
  for (let i = league.news.length - 1; i >= 0; i--) {
    const n = league.news[i];
    if (n.season < t.season || (n.season === t.season && n.day < t.day)) break;
    if (n.kind === 'trade' && !n.head && n.season === t.season && n.day === t.day && n.text.startsWith('Trade: ') && t.tids.every((x) => n.tids.includes(x))) return n;
  }
  return undefined;
}

/** Big signings get a take: the deal against what the market says he's worth, his age and the team's plan. The user's always. */
function signingColumn(league: League, m: MediaState, txns: Txn[]) {
  const takes = txns
    .map((t) => {
      const p = league.players[t.pid!];
      if (!p || p.tid < 0) return null;
      const cap = CAP_FOR(league, p.contract.start).salaryCap;
      const share = t.amount! / cap;
      const user = t.tids[0] === league.userTid;
      if (share < (user ? 0.06 : 0.14)) return null;
      return { t, p, share, user, market: marketSalary(league, p) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => Number(b.user) - Number(a.user) || b.share - a.share || a.p.pid - b.p.pid)
    .slice(0, 3);
  if (!takes.length) return;
  const v = new Voice(worldRng(league, 'signings', league.season, league.phase, league.day, league.faDay), m);
  const lines = takes.map(({ t, p, market }) => {
    const tid = t.tids[0];
    const N = league.teams[tid].name;
    const L = last(league, p);
    const yrs = t.years ?? 1;
    const age = playerAge(p, league.season);
    const ratio = t.amount! / Math.max(1, market);
    const deal = `${yrs} year${yrs === 1 ? '' : 's'}, ${money(txnTotal(t.amount!, yrs))}`;
    const verdict =
      ratio >= 1.25
        ? v.pick([
            `That's an overpay: the market had him nearer ${money(market)} a year.`,
            `Too much. He's worth something like ${money(market)} a season.`,
            `The ${N} paid a premium: about ${money(t.amount! - market)} a year over his value.`,
          ])
        : ratio <= 0.85
          ? v.pick([
              `A bargain: he's worth closer to ${money(market)} a season.`,
              `Good business. That's well under the ${money(market)} he could command.`,
              `The ${N} got a discount.`,
            ])
          : v.pick([`Fair money for what he is.`, `About what the market said.`, `A market-rate deal.`]);
    const risk =
      yrs >= 3 && age + yrs >= 35
        ? ` The worry is the back end: he's ${age}.`
        : league.teams[tid].strategy === 'rebuild' && age >= 30
          ? ` An odd fit for a rebuilding team.`
          : age <= 24 && p.pot - p.ovr >= 6
            ? ` At ${age}, there's room to grow into it.`
            : '';
    // (in the summer the season on record is the one just finished)
    const pg = perGame(p, league.season);
    const when = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs' ? 'This season' : 'Last season';
    return {
      t,
      p,
      N,
      L,
      deal,
      text: `${playerName(p)} to the ${N} (${deal}${t.kind === 'resign' ? ', re-signed' : ''}). ${verdict}${risk}${pg && pg.gp >= 20 ? ` ${when}: ${f1(pg.pts)} points a game.` : ''}`,
      ratio,
    };
  });
  const lead = lines[0];
  const word = (r: number) => (r >= 1.25 ? 'an overpay' : r <= 0.85 ? 'a bargain' : 'fair money');
  const head =
    lines.length === 1
      ? v.say('sign-1', [
          `The ${lead.N} land ${lead.L}: ${word(lead.ratio)}?`,
          `${lead.L} to the ${lead.N}, and the verdict`,
          `The ${lead.N} pay ${lead.L}`,
          `${lead.L}'s new deal: ${word(lead.ratio)}`,
        ])
      : v.say('sign-n', [
          `Free agency takes: ${list(lines.map((x) => x.L))}`,
          `Signings, judged: ${list(lines.map((x) => x.L))}`,
          `The day's big deals: ${list(lines.map((x) => x.L))}`,
        ]);
  const dek = `${playerName(lead.p)} signs with the ${lead.N} for ${lead.deal}: ${word(lead.ratio)}${lines.length > 1 ? `, and ${lines.length - 1} more` : ''}.`;
  const weight = lead.t.tids[0] === league.userTid ? (takes[0].share >= 0.25 ? 3 : 2) : takes[0].share >= 0.25 ? 2 : 1;
  publish(league, { kind: 'column', head, dek, body: lines.map((x) => x.text), tids: lines.map((x) => x.t.tids[0]), pids: lines.map((x) => x.p.pid), weight });
}

// ---------------------------------------------------------------- the season

/** Wins on pace for an 82-game season. */
const pace = (w: number, l: number) => (w + l ? Math.round((w / (w + l)) * 82) : 41);

/** Three weeks in: the teams furthest above and below their opening-night projection. */
export function surprisesColumn(league: League, m: MediaState) {
  const pre = m.preseason;
  if (!pre || pre.season !== league.season || !once(league, m, 'surprises')) return;
  const v = new Voice(worldRng(league, 'surprises', league.season), m);
  const rows = league.teams.map((t) => {
    const ts = tsOf(league, t.tid);
    const p = pace(ts.won, ts.lost);
    return { tid: t.tid, ts, proj: pre.rows[t.tid]?.wins ?? 41, p, d: p - (pre.rows[t.tid]?.wins ?? 41) };
  });
  const up = rows
    .filter((r) => r.d >= 7)
    .sort((a, b) => b.d - a.d || a.tid - b.tid)
    .slice(0, 2);
  const down = rows
    .filter((r) => r.d <= -7)
    .sort((a, b) => a.d - b.d || a.tid - b.tid)
    .slice(0, 2);
  if (!up.length && !down.length) return;
  const rost = rosters(league);
  const u = rows[league.userTid];
  const N = (tid: number) => league.teams[tid].name;
  const why = (r: (typeof rows)[number]) => {
    const hurt = rost[r.tid].slice(0, 3).find((p) => p.injury && p.injury.gamesRemaining > 0);
    const star = rost[r.tid][0];
    const pg = star ? perGame(star, league.season) : null;
    if (r.d < 0 && hurt) return `${last(league, hurt)} has been hurt.`;
    if (r.d > 0 && pg && pg.gp >= 5) return `${last(league, star)} is averaging ${f1(pg.pts)}.`;
    return `Their net rating is ${signed(netOf(r.ts))}.`;
  };
  const line = (r: (typeof rows)[number]) => `The ${N(r.tid)} (${recOf(r.ts)}) were picked for ${r.proj} wins and are on pace for ${r.p}. ${why(r)}`;
  const userTop = up[0]?.tid === league.userTid || down[0]?.tid === league.userTid;
  const head = userTop
    ? up[0]?.tid === league.userTid
      ? v.say('sur-u-up', [`Three weeks in, the ${N(u.tid)} are the surprise of the season`, `Nobody saw the ${N(u.tid)} coming`, `The ${N(u.tid)} are ahead of every projection`])
      : v.say('sur-u-down', [
          `Three weeks in, the ${N(u.tid)} are the season's big disappointment`,
          `What's wrong with the ${N(u.tid)}?`,
          `The ${N(u.tid)} are well short of the projections`,
        ])
    : up[0] && down[0]
      ? v.say('sur', [
          `Three weeks in: the ${N(up[0].tid)} surprise, the ${N(down[0].tid)} disappoint`,
          `Early verdicts: ${N(up[0].tid)} up, ${N(down[0].tid)} down`,
          `Surprises and disappointments: the ${N(up[0].tid)} and the ${N(down[0].tid)}`,
        ])
      : up[0]
        ? `Three weeks in, the ${N(up[0].tid)} are the surprise`
        : `Three weeks in, the ${N(down[0].tid)} are the disappointment`;
  const dek =
    `${up.length ? `Ahead of the projections: ${list(up.map((r) => `the ${N(r.tid)}`))}. ` : ''}${down.length ? `Behind them: ${list(down.map((r) => `the ${N(r.tid)}`))}.` : ''}`.trim();
  const inIt = up.concat(down).some((r) => r.tid === league.userTid);
  const body = [
    up.length ? `The surprises. ${up.map(line).join(' ')}` : '',
    down.length ? `The disappointments. ${down.map(line).join(' ')}` : '',
    inIt
      ? ''
      : `And the ${N(u.tid)}: picked for ${u.proj}, on pace for ${u.p}${Math.abs(u.d) <= 3 ? ', right where they were expected' : u.d > 0 ? ', ahead of schedule' : ', behind it'}.`,
  ];
  publish(league, { kind: 'column', head, dek, body, tids: [...up, ...down].map((r) => r.tid).concat(league.userTid), pids: [], weight: userTop ? 3 : 2 });
}

/** At the All-Star break: a grade for every team, by its record and against its projection; the user's team first. */
export function midseasonColumn(league: League, m: MediaState) {
  if (!once(league, m, 'midseason')) return;
  const pre = m.preseason?.season === league.season ? m.preseason : undefined;
  const v = new Voice(worldRng(league, 'midseason', league.season), m);
  const rows = league.teams.map((t) => {
    const ts = tsOf(league, t.tid);
    const gp = ts.won + ts.lost;
    const pct = gp ? ts.won / gp : 0.5;
    const proj = pre?.rows[t.tid]?.wins;
    const p = pace(ts.won, ts.lost);
    const score = (pct - 0.5) * 1.4 + (proj !== undefined ? (p - proj) / 20 : 0);
    return { tid: t.tid, ts, proj, p, grade: gradeFor(score) as Grade, score };
  });
  const order = [...rows].sort((a, b) => b.score - a.score || a.tid - b.tid);
  const u = rows[league.userTid];
  const N = (tid: number) => league.teams[tid].name;
  const rost = rosters(league);
  const star = rost[u.tid][0];
  const pg = star ? perGame(star, league.season) : null;
  const head = v.say('mid', [
    `Midseason report card: the ${N(u.tid)} get ${aGrade(u.grade)}`,
    `Grading all 30 at the break: ${N(u.tid)} ${u.grade}`,
    `The ${N(u.tid)} at the break: ${aGrade(u.grade)}`,
  ]);
  const dek = `Top of the class: the ${N(order[0].tid)} (${order[0].grade}). The ${N(u.tid)}: ${recOf(u.ts)}${u.proj !== undefined ? `, against a projection of ${u.proj} wins` : ''}.`;
  const verdict = u.grade.startsWith('A')
    ? v.pick(['Better than anyone expected.', 'Everything is going to plan, and then some.'])
    : u.grade.startsWith('B')
      ? v.pick(['Solid, with room to be more.', 'About what was asked of them.'])
      : u.grade.startsWith('C')
        ? v.pick(['Middling. The second half has to be better.', 'Not bad, not good.'])
        : v.pick(['A long way short.', 'Something has to change.']);
  const short = (r: (typeof rows)[number]) => `the ${N(r.tid)} (${r.grade}, ${recOf(r.ts)})`;
  const body = [
    `${N(u.tid)}: ${u.grade}. ${recOf(u.ts)}, on pace for ${u.p} wins${u.proj !== undefined ? ` after a projection of ${u.proj}` : ''}. ${verdict}${pg && star ? ` ${last(league, star)} is averaging ${f1(pg.pts)} points.` : ''}`,
    `Top of the class: ${list(order.slice(0, 3).map(short))}.`,
    `See me after class: ${list(order.slice(-3).reverse().map(short))}.`,
    order.map((r) => `${league.teams[r.tid].abbrev} ${r.grade}`).join(' · '),
  ];
  publish(league, { kind: 'column', head, dek, body, tids: [u.tid, order[0].tid], pids: star ? [star.pid] : [], weight: 2 });
}

// ---------------------------------------------------------------- the playoffs

const ROUND: Record<number, string> = { 1: 'First round', 2: 'Second round', 3: 'Conference finals', 4: 'The Finals' };

/** The season series between two teams: wins each. */
function seasonSeries(league: League, a: number, b: number): [number, number] {
  let wa = 0;
  let wb = 0;
  for (const g of league.games) {
    if (g.season !== league.season || g.type !== 'regular') continue;
    if (!((g.home.tid === a && g.away.tid === b) || (g.home.tid === b && g.away.tid === a))) continue;
    const winner = g.home.pts > g.away.pts ? g.home.tid : g.away.tid;
    if (winner === a) wa++;
    else wb++;
  }
  return [wa, wb];
}

/** When a playoff round's series are all set: a preview of each, the pick and in how many; the Finals get their own. */
export function playoffPreviews(league: League, m: MediaState) {
  if (league.phase !== 'playoffs') return;
  const want: Record<number, number> = { 1: 8, 2: 4, 3: 2, 4: 1 };
  for (const round of [1, 2, 3, 4]) {
    const rs = league.playoffs.filter((s) => s.round === round);
    if (rs.length !== want[round] || rs.some((s) => s.winner !== undefined)) continue;
    if (!once(league, m, `r${round}`)) continue;
    roundPreview(league, m, round, rs);
  }
}

function roundPreview(league: League, m: MediaState, round: number, rs: PlayoffSeries[]) {
  const v = new Voice(worldRng(league, 'round', league.season, round), m);
  const rost = rosters(league);
  const str = strengths(league, rost);
  const N = (tid: number) => league.teams[tid].name;
  const mine = rs.find((s) => s.high === league.userTid || s.low === league.userTid);
  const ordered = mine ? [mine, ...rs.filter((s) => s !== mine)] : rs;
  const preview = ordered.map((s) => {
    const { p, games } = seriesOdds(str[s.high] - str[s.low], s.highWins, s.lowWins);
    const pick = p >= 0.5 ? s.high : s.low;
    const other = pick === s.high ? s.low : s.high;
    const [hw, lw] = seasonSeries(league, s.high, s.low);
    const hurt = [s.high, s.low].flatMap((tid) =>
      rost[tid]
        .slice(0, 3)
        .filter((x) => x.injury && x.injury.gamesRemaining > 2)
        .map((x) => ({ tid, x })),
    )[0];
    const facts = [
      hw + lw ? `${hw === lw ? 'They split the season series' : `The ${N(hw > lw ? s.high : s.low)} won the season series ${rec(Math.max(hw, lw), Math.min(hw, lw))}`}.` : '',
      `Net ratings: ${N(s.high)} ${signed(netOf(tsOf(league, s.high)))}, ${N(s.low)} ${signed(netOf(tsOf(league, s.low)))}.`,
      hurt ? `${N(hurt.tid)} without ${last(league, hurt.x)} (out ${hurt.x.injury!.gamesRemaining} more games).` : '',
    ].filter(Boolean);
    const conf = s.conf === 'F' ? '' : `${confName(s.conf)} `;
    const match = `(${s.highSeed}) ${N(s.high)} vs. (${s.lowSeed}) ${N(s.low)}`;
    const close = Math.max(p, 1 - p) < 0.6;
    return {
      s,
      pick,
      games,
      p: Math.max(p, 1 - p),
      match,
      text: `${conf}${match}. ${facts.join(' ')} Pick: ${N(pick)} in ${games}.${close ? ` A coin flip; the ${N(other)} can win it.` : ''}`,
    };
  });
  const lead = preview[0];
  const userIn = !!mine;
  if (round === 4) {
    const s = lead.s;
    const pre = m.preseason?.season === league.season ? m.preseason : undefined;
    const path = (tid: number) => {
      const won = league.playoffs.filter((x) => x.round < 4 && x.winner === tid).sort((a, b) => a.round - b.round);
      return won.map((x) => `the ${N(x.high === tid ? x.low : x.high)} in ${x.highWins + x.lowWins}`).join(', ');
    };
    const star = (tid: number) => {
      const p = rost[tid][0];
      return p ? `${playerName(p)} (${playerAge(p, league.season)})` : '';
    };
    const head = v.say('finals', [
      `Finals preview: the ${N(s.high)} vs. the ${N(s.low)}`,
      `The Finals: the pick is the ${N(lead.pick)} in ${lead.games}`,
      `${N(s.high)}-${N(s.low)}: the Finals, previewed`,
    ]);
    const dek = `The ${N(s.high)} have home court. Pick: ${N(lead.pick)} in ${lead.games}.`;
    const body = [
      `The ${N(s.high)} beat ${path(s.high)}; the ${N(s.low)} beat ${path(s.low)}.`,
      `The stars: ${star(s.high)} for the ${N(s.high)}, ${star(s.low)} for the ${N(s.low)}.`,
      lead.text,
      pre?.champ !== undefined
        ? pre.champ === s.high || pre.champ === s.low
          ? `The ${N(pre.champ)} were opening night's pick to win it all.`
          : `Opening night's pick, the ${N(pre.champ)}, didn't make it.`
        : '',
    ];
    publish(league, { kind: 'preview', head, dek, body, tids: [s.high, s.low], pids: [rost[s.high][0], rost[s.low][0]].filter(Boolean).map((p) => p.pid), weight: 3 });
    return;
  }
  const label = ROUND[round];
  const UN = league.teams[league.userTid].name;
  const head = userIn
    ? lead.pick === league.userTid
      ? v.say('rnd-u-fav', [
          `${label} preview: the ${UN} in ${lead.games} over the ${N(lead.pick === lead.s.high ? lead.s.low : lead.s.high)}`,
          `${label}: the ${UN} are the pick`,
          `The ${UN} should get through, says the ${label.toLowerCase()} preview`,
        ])
      : v.say('rnd-u-dog', [
          `${label} preview: the ${N(lead.pick)} over the ${UN} in ${lead.games}`,
          `${label}: the ${UN} are the underdogs`,
          `The ${UN} have work to do against the ${N(lead.pick)}`,
        ])
    : v.say('rnd', [`${label} preview: every series, and the picks`, `${label}: the picks are in`, `Previewing the ${label.toLowerCase()}`]);
  const closest = [...preview].sort((a, b) => a.p - b.p)[0];
  const dek = userIn ? `${lead.match}: the pick is the ${N(lead.pick)} in ${lead.games}.` : `The closest call: ${closest.match}, the ${N(closest.pick)} in ${closest.games}.`;
  publish(league, {
    kind: 'preview',
    head,
    dek,
    body: preview.map((x) => x.text),
    tids: rs.flatMap((s) => [s.high, s.low]),
    pids: [],
    // the user's own series is a front page from the conference finals on (the Finals' preview always is)
    weight: userIn && round >= 3 ? 3 : 2,
  });
}

// ---------------------------------------------------------------- the wrap

/** When the Finals end: the champion, how opening night's picks fared, the awards, and the user's season against its projection. */
export function seasonWrap(league: League, m: MediaState) {
  const aw = league.awards.find((a) => a.season === league.season);
  if (!aw || aw.champion === undefined || !once(league, m, 'wrap')) return;
  const v = new Voice(worldRng(league, 'wrap', league.season), m);
  const N = (tid: number) => league.teams[tid].name;
  const C = aw.champion;
  const R = aw.runnerUp;
  const pre = m.preseason?.season === league.season ? m.preseason : undefined;
  const u = league.userTid;
  const uts = tsOf(league, u);
  const userChamp = C === u;
  const head = userChamp
    ? v.say('wrap-u', [`Season wrap: the ${N(u)}, champions`, `The ${poss(N(u))} year: a title`, `${seasonLabel(league.season)} belongs to the ${N(u)}`])
    : v.say('wrap', [
        `Season wrap: the ${poss(N(C))} year`,
        `The ${N(C)} close out ${seasonLabel(league.season)} as champions`,
        `${seasonLabel(league.season)}, wrapped: the ${N(C)} on top`,
      ]);
  const fmvp = aw.finalsMvp !== undefined ? league.players[aw.finalsMvp] : undefined;
  const mvp = aw.mvp !== undefined ? league.players[aw.mvp] : undefined;
  const dek = `The ${N(C)} beat the ${R !== undefined ? N(R) : 'field'} in the Finals${fmvp ? `; ${playerName(fmvp)} was Finals MVP` : ''}.${mvp ? ` ${playerName(mvp)} was the MVP.` : ''}`;
  const final = standings(league);
  const vs = league.teams.map((t) => ({ tid: t.tid, d: tsOf(league, t.tid).won - (pre?.rows[t.tid]?.wins ?? tsOf(league, t.tid).won) }));
  const over = [...vs].sort((a, b) => b.d - a.d || a.tid - b.tid)[0];
  const under = [...vs].sort((a, b) => a.d - b.d || a.tid - b.tid)[0];
  const round = uts.playoffRound;
  const reached =
    round >= 5
      ? 'won the title'
      : round >= 1
        ? `went out in the ${['', 'first round', 'second round', 'conference finals', 'Finals'][round]}`
        : round === 0
          ? 'went out in the play-in'
          : 'missed the postseason';
  const urow = final.find((r) => r.tid === u);
  const body = [
    pre?.champ !== undefined
      ? pre.champ === C
        ? `Opening night's pick was the ${N(C)}, and they delivered.`
        : `Opening night's pick was the ${N(pre.champ)}; the ${N(C)} had other ideas.`
      : '',
    pre && over && over.d >= 6 ? `The season's overachievers: the ${N(over.tid)}, ${over.d} wins better than projected.` : '',
    pre && under && under.d <= -6 ? `The biggest letdown: the ${N(under.tid)}, ${-under.d} wins short.` : '',
    `The ${N(u)} finished ${recOf(uts)}${urow ? `, ${nth(urow.confRank)} in the ${confName(urow.conf)}` : ''}, and ${reached}.${
      pre ? ` They were picked for ${pre.rows[u].wins} wins${uts.won - pre.rows[u].wins >= 4 ? ': a step ahead' : uts.won - pre.rows[u].wins <= -4 ? ': a step short' : ''}.` : ''
    }`,
  ];
  publish(league, {
    kind: 'column',
    head,
    dek,
    body,
    tids: [C, ...(R !== undefined ? [R] : []), u],
    pids: [fmvp?.pid, mvp?.pid].filter((x): x is number => x !== undefined),
    weight: userChamp ? 3 : 2,
  });
}
