// The talking heads: four television personalities who react to the league beside the beat writers,
// loudly and not always rightly. A winning streak is a parade or a fraud depending on who has the
// microphone; a scorer on a tear is the best alive or a product of soft defense; a slumping favourite
// should be blown up by Friday. Each has a manner and a lean, and keeps them. Their takes are news
// of their own kind ('take', with a byline), at most one every couple of days, the user's team first
// in line. At the season's end the press reads their calls back to them (the receipts).
//
// Nothing here moves the game: a take is somebody's opinion, never a mood or a rating. Read from the
// league as it stands, phrased on the world's own stream (see world.ts).
import type { BoxLine, GameResult, League, Player } from '../../types';
import { worldRng } from '../world';
import type { MediaState } from '../media';
import { Voice, f1, last, name, nick, perGame, poss, publish, recOf, tsOf } from './voice';
import { nickName } from '../voices';
import { isGenerational } from '../legends';
import { prospects } from '../helpers';
import { fmtHeight } from '../../ratings';

type Pundit = 'rex' | 'dee' | 'marv' | 'lila';

/** The four: invented for the game. */
export const PUNDITS: Record<Pundit, { name: string; show: string; about: string; they: [string, string] }> = {
  rex: { name: 'Rex Calloway', show: 'The Morning Tip', about: 'Takes the other side of whatever everyone thinks. Loudly.', they: ['he', 'His'] },
  dee: { name: 'Dee Okafor', show: 'Courtside Confidential', about: 'Twelve seasons in the league. Loves a star, loves a storyline.', they: ['she', 'Her'] },
  marv: { name: 'Marv Stetson', show: 'Back in My Day', about: 'Has not enjoyed a basketball game since hand-checking left.', they: ['he', 'His'] },
  lila: { name: 'Lila Brandt', show: 'The Spreadsheet', about: 'Believes in point differential and almost nothing else.', they: ['she', 'Her'] },
};

const byline = (p: Pundit) => `${PUNDITS[p].name}, ${PUNDITS[p].show}`;

/** Days between takes (the user's team's news jumps the queue at half of it), before the same subject comes up again, and before the same kind of take does (a tear, a streak) about someone else. */
const GAP = 3;
const AGAIN = 24;
const KIND_REST = 9;

/** A call a pundit made on a team, kept for the receipts: he bought or sold it, and its record that day. */
export interface TakeCall {
  by: Pundit;
  tid: number;
  buy: boolean;
  day: number;
  rec: string;
}

/** The takes' memory, on the media state. */
export interface TakeState {
  season: number;
  /** The day of the last take, and who had the microphone. */
  last: number;
  by?: Pundit;
  /** Subjects taken up, and when: `${topic}:${id}` → day. */
  seen: Record<string, number>;
  calls: TakeCall[];
}

function stateOf(league: League, m: MediaState): TakeState {
  if (!m.takes || m.takes.season !== league.season) m.takes = { season: league.season, last: -99, seen: {}, calls: [] };
  return m.takes;
}

interface Take {
  key: string;
  by: Pundit;
  head: string;
  dek: string;
  body: string[];
  tids: number[];
  pids: number[];
  /** The user's team is the subject. */
  user: boolean;
  weight: 1 | 2;
  call?: { tid: number; buy: boolean };
}

/** A player's last `n` games this season, newest first (his box lines, from the results on record). */
function lastGames(league: League, p: Player, n: number): BoxLine[] {
  const out: BoxLine[] = [];
  for (let i = league.games.length - 1; i >= 0 && out.length < n; i--) {
    const g: GameResult = league.games[i];
    if (g.season !== league.season || g.type === 'allstar') continue;
    const side = g.home.tid === p.tid ? g.home : g.away.tid === p.tid ? g.away : null;
    const b = side?.players.find((x) => x.pid === p.pid);
    if (b && b.min > 0) out.push(b);
  }
  return out;
}

/** Every take there is to make today, the best first. */
function candidates(league: League, m: MediaState, v: Voice): Take[] {
  const out: Take[] = [];
  const u = league.userTid;
  const N = (tid: number) => nick(league, tid);
  const pre = m.preseason?.season === league.season ? m.preseason : undefined;
  // (whoever spoke last sits this one out, where someone else has a view)
  const spoke = m.takes?.season === league.season ? m.takes.by : undefined;
  const who = (list: Pundit[]) => v.pick(list.length > 1 ? list.filter((p) => p !== spoke) : list);

  if (league.phase === 'regular') {
    for (const t of league.teams) {
      const ts = tsOf(league, t.tid);
      const gp = ts.won + ts.lost;
      const mine = t.tid === u;
      const picked = pre?.rows.find((r) => r.tid === t.tid);
      const R = recOf(ts);
      // ---- a winning streak: a parade, or a fraud
      if (ts.streak >= (mine ? 5 : 7)) {
        const by = who(['rex', 'dee', 'marv', 'lila']);
        const n = ts.streak;
        const texts: Record<Pundit, [string, string, string[]]> = {
          rex: [
            `I'm not buying the ${N(t.tid)}. Not for a second.`,
            `${n} straight for the ${N(t.tid)}, and ${PUNDITS.rex.name} wants to see the schedule.`,
            [
              `${n} in a row. Wonderful. Against who? Go look. I'll wait.`,
              `Everybody wants to hand them a trophy in ${league.day < 90 ? 'the first half of the season' : 'the regular season'}. I've seen this movie. It ends in the second round.`,
              `Call me when they beat a real team in a real series.`,
            ],
          ],
          dee: [
            `Book it: the ${N(t.tid)} are for real`,
            `${n} straight. ${PUNDITS.dee.name} has seen enough.`,
            [
              `I played on a team that won ${n} in a row once. You know what it feels like? It feels like nobody can touch you.`,
              `That locker room believes right now, and belief travels. The ${N(t.tid)} are a problem for everybody.`,
              `${R}. I'm all the way in.`,
            ],
          ],
          marv: [
            `The ${N(t.tid)} have won ${n} straight and I'm still not impressed`,
            `${PUNDITS.marv.name} would like to see somebody take a charge.`,
            [
              `${n} straight. In my day you needed twenty before anybody called a parade route.`,
              `They shoot a lot of threes and they make a lot of threes. Wake me when the shots stop falling in May.`,
              `Defense wins in the spring. We'll find out if they have one.`,
            ],
          ],
          lila: [
            `The ${poss(N(t.tid))} streak, and what the numbers say comes next`,
            `${n} wins in a row. ${PUNDITS.lila.name} checked the shooting luck.`,
            [
              `Streaks like this are part skill and part the other team missing open shots. I know which part comes back.`,
              `At ${R} they're good. They are not ${n}-straight good. Nobody is.`,
              `Enjoy it. Then expect a week that looks ordinary. That's not a collapse, it's arithmetic.`,
            ],
          ],
        };
        const [head, dek, body] = texts[by];
        out.push({ key: `streakW:${t.tid}`, by, head, dek, body, tids: [t.tid], pids: [], user: mine, weight: mine ? 2 : 1, call: { tid: t.tid, buy: by === 'dee' } });
      }
      // ---- a losing streak: blow it up
      if (ts.streak <= (mine ? -4 : -7)) {
        const by = who(['rex', 'dee', 'marv', 'lila']);
        const n = -ts.streak;
        const good = !!picked && picked.confRank <= 6;
        const texts: Record<Pundit, [string, string, string[]]> = {
          rex: [
            `Blow up the ${N(t.tid)}. Today.`,
            `${n} straight losses, and ${PUNDITS.rex.name} has seen enough.`,
            [
              `${n} in a row. This isn't a slump, it's a verdict.`,
              good ? `They were supposed to contend. Supposed to. Trade everybody who isn't nailed down.` : `Nobody expected much, and they've delivered less. Sell.`,
              `The front office can do it now or do it later for less. Those are the choices.`,
            ],
          ],
          dee: [
            `The ${N(t.tid)} are one move away, and they need to make it`,
            `${PUNDITS.dee.name} on ${n} straight losses: go get a star.`,
            [
              `I've been in a locker room on a streak like this. You stop looking each other in the eye.`,
              `They don't need a speech. They need a guy who wants the ball at the end. Go get one.`,
              `Whatever it costs. Picks don't dive for loose balls.`,
            ],
          ],
          marv: [
            `The ${N(t.tid)} are soft. There, I said it.`,
            `${n} losses in a row. ${PUNDITS.marv.name} blames the practices.`,
            [
              `${n} straight. You know what fixes that? Running. Lots of running.`,
              `Nobody on that roster has been yelled at since high school, and it shows.`,
              `Somebody get on the floor for a loose ball. Just once. For me.`,
            ],
          ],
          lila: [
            `Don't panic about the ${N(t.tid)}. Yet.`,
            `${n} straight losses. ${PUNDITS.lila.name} says look at the margins first.`,
            [
              `Losing streaks get loud. Most of them are four bad shooting nights and a schedule.`,
              `At ${R} the record is ugly. The underlying numbers are less ugly than the talk shows will tell you.`,
              `If it's still going in two weeks, I'll bring the shovel myself.`,
            ],
          ],
        };
        const [head, dek, body] = texts[by];
        out.push({ key: `streakL:${t.tid}`, by, head, dek, body, tids: [t.tid], pids: [], user: mine, weight: mine ? 2 : 1, call: { tid: t.tid, buy: by === 'lila' } });
      }
      // ---- nobody picked them, and here they are: frauds, or the real thing
      if (picked && gp >= 22 && gp <= 50 && ts.won / gp >= 0.66 && picked.wins <= 40) {
        const by = who(['rex', 'lila', 'dee']);
        const texts: Record<Pundit, [string, string, string[]]> = {
          rex: [
            `The ${N(t.tid)} are the biggest frauds in basketball`,
            `${R}, picked for ${picked.wins} wins. ${PUNDITS.rex.name} isn't moved.`,
            [
              `I picked them to be bad. They are ${R}. So one of us is wrong, and I've been doing this a long time.`,
              `Show me in April. Show me in a Game 5 on the road. Then we'll talk.`,
            ],
          ],
          lila: [
            `The ${N(t.tid)} are ${R}. Half of it is real.`,
            `${PUNDITS.lila.name} splits the difference on the season's surprise.`,
            [
              `They were picked for ${picked.wins} wins and they're on pace to blow past it. Some of that is a roster that fits. Some of it is close games going their way.`,
              `Close games stop going your way. They'll still beat the pick by plenty.`,
            ],
          ],
          dee: [
            `Apologize to the ${N(t.tid)}`,
            `Picked for ${picked.wins} wins. ${R}. ${PUNDITS.dee.name} wants the apologies in writing.`,
            [
              `Everybody had them in the basement. Everybody. I've got the clips.`,
              `That's a team that plays for each other, and you can't put that in a preseason ranking. I'm a believer.`,
            ],
          ],
          marv: ['', '', []],
        };
        const [head, dek, body] = texts[by];
        out.push({ key: `fraud:${t.tid}`, by, head, dek, body, tids: [t.tid], pids: [], user: mine, weight: mine ? 2 : 1, call: { tid: t.tid, buy: by !== 'rex' } });
      }
      // ---- a favourite in the mud
      if (picked && gp >= 25 && gp <= 55 && picked.confRank <= 3 && ts.won / gp <= 0.45) {
        const by = who(['rex', 'marv', 'lila']);
        const texts: Record<Pundit, [string, string, string[]]> = {
          rex: [
            `It's over for the ${N(t.tid)}`,
            `A preseason favourite at ${R}. ${PUNDITS.rex.name} is reading the eulogy.`,
            [`They were picked to win ${picked.wins}. Look at them now.`, `This group has had its chance. Break it up before the deadline does it for you.`],
          ],
          marv: [
            `The ${N(t.tid)} believed their own press clippings`,
            `${R} for a team picked ${picked.confRank === 1 ? 'first' : 'near the top'}. ${PUNDITS.marv.name} saw it coming.`,
            [`You get told you're great all summer, you show up in October already tired of working.`, `Nobody fears them. That used to matter.`],
          ],
          lila: [
            `The ${N(t.tid)} are better than ${R}. Probably.`,
            `${PUNDITS.lila.name} on a slow start that the numbers half forgive.`,
            [
              `A team picked for ${picked.wins} wins doesn't forget how to play. It does get hurt, get unlucky and get old.`,
              `I'd hold. I'd also start checking which one of those it is.`,
            ],
          ],
          dee: ['', '', []],
        };
        const [head, dek, body] = texts[by];
        out.push({ key: `bust:${t.tid}`, by, head, dek, body, tids: [t.tid], pids: [], user: mine, weight: mine ? 2 : 1, call: { tid: t.tid, buy: by === 'lila' } });
      }
    }

    // ---- a scorer on a tear (the league's top handful by points a game, their last five)
    const scorers = Object.values(league.players)
      .filter((p) => p.tid >= 0)
      .map((p) => ({ p, pg: perGame(p, league.season) }))
      .filter((x) => x.pg && x.pg.gp >= 10)
      .sort((a, b) => b.pg!.pts - a.pg!.pts || a.p.pid - b.p.pid)
      .slice(0, 8);
    for (const { p, pg } of scorers) {
      const five = lastGames(league, p, 5);
      if (five.length < 5) continue;
      const avg = five.reduce((a, b) => a + b.pts, 0) / 5;
      if (avg < 36 && !(avg >= 33 && avg >= pg!.pts + 7)) continue;
      const by = who(['rex', 'dee', 'marv', 'lila']);
      const L = last(league, p);
      const A = f1(avg);
      const texts: Record<Pundit, [string, string, string[]]> = {
        rex: [
          `${L} is the best player alive and it isn't close`,
          `${A} a game over his last five. ${PUNDITS.rex.name} is ready to crown him.`,
          [
            `${nickName(p)} is averaging ${A} over his last five games. Read that again.`,
            `I don't want to hear about anybody else. Not this week. Maybe not this year.`,
            `If you have a vote and you're not using it on him, hand in the vote.`,
          ],
        ],
        dee: [
          `I guarded great scorers. ${L} is one.`,
          `${PUNDITS.dee.name} on what it's like on the other side of a tear like this.`,
          [
            `${A} a night for five games. You know what the scouting report says for a guy like that? It says "good luck."`,
            `When a scorer's in that place the rim is a swimming pool. You just try to make him take the hard ones and then he makes those too.`,
          ],
        ],
        marv: [
          `${L} is scoring ${A} a night because nobody guards anybody`,
          `${PUNDITS.marv.name} would like to see one hard foul.`,
          [
            `Very nice numbers. In my day he'd have been on the floor twice by the second quarter and we'd see how the jumper felt after that.`,
            `He's a wonderful player. The defense he's seeing is not wonderful defense.`,
          ],
        ],
        lila: [
          `${poss(L)} tear, and when it ends`,
          `${A} a game over five. ${PUNDITS.lila.name} has the shot chart.`,
          [
            `He's at ${f1(pg!.pts)} for the season and ${A} over his last five. One of those numbers is who he is.`,
            `Tears end. He'll still be very good on the other side of it. Sell the hot hand, keep the player.`,
          ],
        ],
      };
      const [head, dek, body] = texts[by];
      out.push({ key: `tear:${p.pid}`, by, head, dek, body, tids: [p.tid], pids: [p.pid], user: p.tid === u, weight: 2 });
    }

    // ---- a generational prospect in this year's class: lose on purpose
    if (league.day >= 20 && league.day <= 120) {
      const gen = prospects(league, league.season).find((p) => isGenerational(p) && (p.prospect?.rank ?? 99) <= 3);
      if (gen) {
        const by = who(['rex', 'dee', 'lila']);
        const G = name(gen);
        const size = fmtHeight(gen.heightIn);
        const texts: Record<Pundit, [string, string, string[]]> = {
          rex: [
            `Half this league should be losing on purpose for ${last(league, gen)}`,
            `${PUNDITS.rex.name} on the prospect at the top of every board.`,
            [
              `${G}. ${size}. Have you watched him? I mean actually watched him?`,
              `If your team is under .500 in January and still trying, your front office is committing malpractice.`,
            ],
          ],
          dee: [
            `${G} is the real thing`,
            `${PUNDITS.dee.name} went to see the top prospect in person.`,
            [
              `I've been around this game a long time. Players like this come along maybe once in ten years.`,
              `${size}, and he moves like that? Whoever gets him changes their franchise for fifteen years.`,
            ],
          ],
          lila: [
            `The case for ${G}, and the base rates against him`,
            `${PUNDITS.lila.name} on the draft's can't-miss prospect.`,
            [
              `Every few years somebody is called a sure thing. Sure things have been wrong about a third of the time.`,
              `He's the best prospect I have a file on. I'd still want the pick, not the hype.`,
            ],
          ],
          marv: ['', '', []],
        };
        const [head, dek, body] = texts[by];
        out.push({ key: `gen:${gen.pid}`, by, head, dek, body, tids: [], pids: [gen.pid], user: false, weight: 2 });
      }
    }
  }
  return out.filter((t) => t.head).sort((a, b) => Number(b.user) - Number(a.user) || b.weight - a.weight);
}

/** A day's take, if there is one worth the airtime (see GAP, AGAIN). */
export function hotTakes(league: League, m: MediaState) {
  if (league.phase !== 'regular') return;
  const s = stateOf(league, m);
  const since = league.day - s.last;
  if (since < Math.ceil(GAP / 2)) return;
  const v = new Voice(worldRng(league, 'take', league.season, league.day), m);
  const kind = (key: string) => key.split(':')[0];
  const fresh = candidates(league, m, v).filter((t) => (s.seen[t.key] ?? -99) + AGAIN <= league.day && (s.seen[kind(t.key)] ?? -99) + KIND_REST <= league.day);
  const t = fresh.find((x) => x.user) ?? (since >= GAP ? fresh[0] : undefined);
  if (!t) return;
  s.last = league.day;
  s.by = t.by;
  s.seen[t.key] = league.day;
  s.seen[kind(t.key)] = league.day;
  if (t.call) s.calls.push({ by: t.by, tid: t.call.tid, buy: t.call.buy, day: league.day, rec: recOf(tsOf(league, t.call.tid)) });
  publish(league, { kind: 'take', head: t.head, dek: t.dek, body: t.body, tids: t.tids, pids: t.pids, weight: t.weight }).by = byline(t.by);
}

/**
 * The receipts, when the season ends: the talking heads' calls on teams read back against how those
 * teams finished. A buy is right if the team won a playoff round, a sell if it didn't. Each pundit's
 * best and worst call of the year; nothing when they made too few.
 */
export function receipts(league: League, m: MediaState) {
  const s = m.takes;
  if (!s || s.season !== league.season || s.calls.length < 3) return;
  const lines: string[] = [];
  let right = 0;
  const tids = new Set<number>();
  for (const by of Object.keys(PUNDITS) as Pundit[]) {
    const mine = s.calls.filter((c) => c.by === by);
    if (!mine.length) continue;
    const graded = mine.map((c) => {
      const ts = tsOf(league, c.tid);
      return { c, ok: ts.playoffRound >= 2 === c.buy, ts };
    });
    right += graded.filter((g) => g.ok).length;
    // (the loudest miss first: the call whose team did the opposite most thoroughly)
    const worst = graded.filter((g) => !g.ok).sort((a, b) => (a.c.buy ? a.ts.won - b.ts.won : b.ts.won - a.ts.won))[0];
    const best = graded.filter((g) => g.ok).sort((a, b) => (a.c.buy ? b.ts.won - a.ts.won : a.ts.won - b.ts.won))[0];
    const tell = (g: (typeof graded)[number]) => {
      tids.add(g.c.tid);
      const N = nick(league, g.c.tid);
      const how =
        g.ts.playoffRound >= 5 ? 'won the title' : g.ts.playoffRound >= 2 ? 'won a playoff round' : g.ts.playoffRound >= 1 ? 'went out in the first round' : 'missed the playoffs';
      return `${g.c.buy ? 'bought' : 'sold'} the ${N} at ${g.c.rec}. They finished ${recOf(g.ts)} and ${how}.`;
    };
    const [they, their] = PUNDITS[by].they;
    const parts = [`${PUNDITS[by].name} went ${graded.filter((g) => g.ok).length} for ${graded.length}.`];
    if (worst) parts.push(`The one ${they}'d like back: ${they} ${tell(worst)}`);
    else if (best) parts.push(`${their} best: ${they} ${tell(best)}`);
    lines.push(parts.join(' '));
  }
  if (!lines.length) return;
  const v = new Voice(worldRng(league, 'receipts', league.season), m);
  const total = s.calls.length;
  publish(league, {
    kind: 'take',
    head: v.say('receipts', [
      `The receipts: the talking heads went ${right} for ${total}`,
      `Freezing cold takes: the season's calls, checked`,
      `${right} for ${total}: the year in hot takes`,
    ]),
    dek: `The season's loudest calls on ${total === 1 ? 'one team' : `${tids.size} teams`}, read back against how it ended.`,
    body: lines,
    tids: [...tids],
    pids: [],
    weight: 2,
  }).by = 'The receipts desk';
}
