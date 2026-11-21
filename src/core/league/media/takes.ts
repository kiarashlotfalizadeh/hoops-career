// The talking heads: four television personalities who react to the league beside the beat writers,
// loudly and not always rightly. A winning streak is a parade or a fraud depending on who has the
// microphone; a scorer on a tear is the best alive or a product of soft defense; a slumping favourite
// should be blown up by Friday. Each has a manner and a lean, and keeps them. Their takes are news
// of their own kind ('take', with a byline), at most one every couple of days, the user's team first
// in line. At the season's end the press reads their calls back to them (the receipts).
//
// They follow the calendar. In the regular season: streaks, surprises, favourites in the mud, a scorer
// on a tear, a prospect worth losing for. At the trade deadline: the blockbuster somebody panicked
// into, and the contender that sat on its hands. In the playoffs, after a game: a favourite down 0-2,
// a Game 7, a blown 2-0 or 3-1 lead, a star swept, a low seed's upset. When the Finals end: what the
// title makes of the player who won it. In free agency: the summer's biggest contract, and the team
// that let him walk.
//
// Nothing here moves the game: a take is somebody's opinion, never a mood or a rating. Read from the
// league as it stands, phrased on the world's own stream (see world.ts).
import type { BoxLine, GameResult, League, Player, PlayoffSeries, ScheduledGame, Txn } from '../../types';
import { worldRng } from '../world';
import type { MediaState } from '../media';
import { Voice, aGrade, f1, last, name, nick, perGame, poss, publish, recOf, rosters, tsOf } from './voice';
import { isGenerational } from '../legends';
import { CAP_FOR, prospects } from '../helpers';
import { fmtHeight } from '../../ratings';
import { gradeTrade } from './grades';
import { marketSalary } from '../contracts';
import { playerAge } from '../../playerGen';
import { money } from '../../format';
import { seriesLabel } from '../playoffs';
import { titleLine } from './history';

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

/** A take as each pundit would give it: headline, the line under it, the body ('' for one with nothing to say). */
type Texts = Record<Pundit, [string, string, string[]]>;
const SILENT: [string, string, string[]] = ['', '', []];

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
            `${name(p)} is averaging ${A} over his last five games. Read that again.`,
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
    out.push(...deadlineTakes(league, who));
  }
  if (league.phase === 'freeAgency') out.push(...signingTakes(league, who));
  return out.filter((t) => t.head).sort((a, b) => Number(b.user) - Number(a.user) || b.weight - a.weight);
}

// ---------------------------------------------------------------- the trade deadline

/** Days up to the deadline whose trades the talking heads argue about, and the day after it they notice who did nothing. */
const DEADLINE_WEEK = 6;

/** This season's trades made in the deadline's last week, newest first. */
function deadlineDeals(league: League): Txn[] {
  const out: Txn[] = [];
  const log = league.transactions ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const t = log[i];
    if (t.season !== league.season || t.day < league.tradeDeadlineDay - DEADLINE_WEEK) break;
    if (t.kind === 'trade' && t.day <= league.tradeDeadlineDay) out.push(t);
  }
  return out;
}

/**
 * Deadline week: the blockbuster (a player of 84 or better moved, or an 80 for two firsts; one of
 * the user's deals from 78), argued as a panic buy or a heist; and, the morning after the deadline,
 * the contender that made no move while the teams around it did.
 */
function deadlineTakes(league: League, who: (list: Pundit[]) => Pundit): Take[] {
  const left = league.tradeDeadlineDay - league.day;
  if (left > DEADLINE_WEEK || left < -2) return [];
  const out: Take[] = [];
  const u = league.userTid;
  const N = (tid: number) => nick(league, tid);
  const deals = deadlineDeals(league);
  for (const t of deals) {
    const g = gradeTrade(league, t);
    if (!g) continue;
    // the side that got the best player is the buyer
    const [buyer, seller] = [...g].sort((a, b) => (b.got.players[0]?.ovr ?? 0) - (a.got.players[0]?.ovr ?? 0));
    const star = buyer.got.players.slice().sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)[0];
    if (!star) continue;
    const firsts = seller.got.picks.filter((d) => d.round === 1).length;
    const mine = t.tids.includes(u);
    if (!(star.ovr >= 84 || (star.ovr >= 80 && firsts >= 2) || (mine && star.ovr >= 78))) continue;
    const L = last(league, star);
    const B = N(buyer.tid);
    const S = N(seller.tid);
    const price =
      firsts >= 2
        ? `${firsts} first-round picks`
        : firsts === 1
          ? 'a first-round pick'
          : seller.got.players.length
            ? `${last(league, seller.got.players[0])} and change`
            : 'not much';
    const by = who(['rex', 'dee', 'marv', 'lila']);
    const texts: Texts = {
      rex: [
        `The ${B} just panicked`,
        `${name(star)} to the ${B} for ${price}. ${PUNDITS.rex.name} calls it a panic trade.`,
        [
          `You know what that is? That's a front office that looked at the standings and got scared.`,
          `${L} is a fine player. He is not a ${price} player, and in two years everybody will pretend they knew that.`,
          `The ${S} picked up the phone at the right time. That's the whole trade.`,
        ],
      ],
      dee: [
        `The ${B} just won the deadline`,
        `${PUNDITS.dee.name} on the ${L} trade: this is how you tell a locker room you believe in it.`,
        [
          `I've been on a team that stood pat in February. You feel it. Everybody feels it.`,
          `The ${B} went and got ${L}. Every player in that room just found another gear.`,
          `Picks are for teams that aren't close. The ${B} are close.`,
        ],
      ],
      marv: [
        `You can't buy a team in February`,
        `${PUNDITS.marv.name} on ${L} to the ${B}: chemistry doesn't come in the mail.`,
        [
          `In my day you built a team in October and you lived with it. Now it's a new roster every Thursday.`,
          `${L} has had ${t.day >= league.tradeDeadlineDay ? 'one practice' : 'a week'} with these guys. He doesn't know the plays. He barely knows the trainer.`,
          `Maybe it works. It usually doesn't.`,
        ],
      ],
      lila: [
        `The price of ${L}, itemized`,
        `${PUNDITS.lila.name} grades the deadline's biggest deal: ${B} ${buyer.grade}, ${S} ${seller.grade}.`,
        [
          `The ${B} gave up ${price}. I have it as ${aGrade(buyer.grade)} for them and ${aGrade(seller.grade)} for the ${S}.`,
          buyer.score < seller.score
            ? `Deadline deals nearly always cost the buyer more than a summer one would. This one did.`
            : `Buyers usually overpay in February. This time the seller blinked first.`,
          `What matters is whether ${L} moves their odds in May. A little. Less than the price says.`,
        ],
      ],
    };
    const [head, dek, body] = texts[by];
    out.push({
      key: `deal:${t.id}`,
      by,
      head,
      dek,
      body,
      tids: [buyer.tid, seller.tid],
      pids: [star.pid],
      user: mine,
      weight: 2,
      ...(by === 'rex' || by === 'dee' ? { call: { tid: buyer.tid, buy: by === 'dee' } } : {}),
    });
  }
  // the morning after: a contender that made no move this week (the user's team first, then the best record)
  if (left === -1) {
    const dealt = new Set(deals.flatMap((t) => t.tids));
    const quiet = league.teams
      .filter((t) => !dealt.has(t.tid) && (t.strategy === 'contend' || t.tid === u))
      .map((t) => ({ t, ts: tsOf(league, t.tid) }))
      .filter((x) => x.ts.won + x.ts.lost >= 20 && x.ts.won / (x.ts.won + x.ts.lost) >= (x.t.tid === u ? 0.5 : 0.6))
      .sort((a, b) => Number(b.t.tid === u) - Number(a.t.tid === u) || b.ts.won / (b.ts.won + b.ts.lost) - a.ts.won / (a.ts.won + a.ts.lost) || a.t.tid - b.t.tid)[0];
    if (quiet && deals.length >= 2) {
      const tid = quiet.t.tid;
      const R = recOf(quiet.ts);
      const by = who(['rex', 'dee', 'marv', 'lila']);
      const texts: Texts = {
        rex: [
          `The ${N(tid)} did nothing. Nothing!`,
          `${deals.length} trades in the deadline's last week, none of them the ${poss(N(tid))}. ${PUNDITS.rex.name} is appalled.`,
          [`Everybody around them got better this week. They got a nice lunch.`, `${R} and they think they're finished? Call me in May when they're one player short.`],
        ],
        dee: [
          `The ${N(tid)} needed one more guy`,
          `${PUNDITS.dee.name} on the contender that sat out the deadline.`,
          [`The players know. Trust me. They watched the phones all week too.`, `One more defender, one more shooter, anything. That room wanted a signal and didn't get one.`],
        ],
        marv: [
          `Good for the ${N(tid)}`,
          `${PUNDITS.marv.name} salutes the one team that kept its hands in its pockets.`,
          [`They're ${R}. They like each other. They left it alone. I could cry.`, `The rest of the league is learning names this weekend. The ${N(tid)} are practicing.`],
        ],
        lila: [
          `Doing nothing was a move, and for the ${N(tid)} the right one`,
          `${PUNDITS.lila.name} on standing pat at ${R}.`,
          [
            `The best trade at most deadlines is the one you don't make. The prices this week were buyer-beware.`,
            `They kept their picks and a team that was already winning. I'd have done the same.`,
          ],
        ],
      };
      const [head, dek, body] = texts[by];
      out.push({ key: `quiet:${tid}`, by, head, dek, body, tids: [tid], pids: [], user: tid === u, weight: tid === u ? 2 : 1, call: { tid, buy: by === 'marv' || by === 'lila' } });
    }
  }
  return out;
}

// ---------------------------------------------------------------- free agency

/** A signing's share of the cap from which the talking heads take it up (the user's from half that). */
const BIG_DEAL = 0.2;

/** The team he played for last, when it isn't the one that just signed him. */
function leftTeam(league: League, p: Player, now: number): number | null {
  for (let i = p.stats.length - 1; i >= 0; i--) {
    const st = p.stats[i];
    if (st.playoffs || st.tid < 0) continue;
    return st.tid !== now && league.teams[st.tid] ? st.tid : null;
  }
  return null;
}

/** The summer's big contracts, the last two days': an overpay or a coup, and the team he walked out on. */
function signingTakes(league: League, who: (list: Pundit[]) => Pundit): Take[] {
  const out: Take[] = [];
  const u = league.userTid;
  const N = (tid: number) => nick(league, tid);
  const log = league.transactions ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const t = log[i];
    if (t.season !== league.season || t.day < league.day - 2) break;
    if (t.kind !== 'sign' || t.pid === undefined || t.amount === undefined) continue;
    const p = league.players[t.pid];
    const tid = t.tids[0];
    if (!p || p.tid !== tid) continue;
    const mine = tid === u;
    const share = t.amount / CAP_FOR(league, p.contract.start).salaryCap;
    if (share < (mine ? BIG_DEAL / 2 : BIG_DEAL)) continue;
    const L = last(league, p);
    const yrs = t.years ?? 1;
    const deal = `${money(t.amount)} a season for ${yrs === 1 ? 'one year' : `${yrs} years`}`;
    const ratio = t.amount / Math.max(1, marketSalary(league, p));
    const age = playerAge(p, league.season);
    const from = leftTeam(league, p, tid);
    const by = who(from !== null ? ['rex', 'dee', 'marv', 'lila'] : ['rex', 'dee', 'lila']);
    const texts: Texts = {
      rex: [
        ratio >= 1.05 ? `The ${N(tid)} just set ${money(t.amount * yrs)} on fire` : `What does ${L} know that we don't?`,
        `${name(p)} to the ${N(tid)}, ${deal}. ${PUNDITS.rex.name} has questions.`,
        ratio >= 1.05
          ? [`${deal}. For ${L}. Say it out loud and listen to yourself.`, `Somebody in that front office wanted to win the press conference. Congratulations. You won July.`]
          : [
              `He took less than he could have had. Players don't do that. So what's wrong with him?`,
              `I'm not saying there's a problem. I'm saying nobody leaves money on the table for the weather.`,
            ],
      ],
      dee: [
        `${L} picked the ${N(tid)}, and players noticed`,
        `${PUNDITS.dee.name} on what the summer's big signing says about the ${N(tid)}.`,
        [
          `Free agents talk to each other. When a guy like ${L} picks you, the next one takes your call.`,
          `Forget the money. He had choices and he chose that locker room. That's the story.`,
        ],
      ],
      marv:
        from !== null
          ? [
              `Nobody stays anywhere anymore`,
              `${L} leaves the ${N(from)} for the ${N(tid)}. ${PUNDITS.marv.name} remembers when that meant something.`,
              [
                `The ${N(from)} raised him, paid him and put his face on the building. He left for ${deal}.`,
                `In my day you finished what you started. Now you finish wherever the check clears.`,
              ],
            ]
          : SILENT,
      lila: [
        `${poss(L)} contract, and how it ages`,
        `${deal} at ${age}. ${PUNDITS.lila.name} ran it forward.`,
        [
          age >= 30
            ? `He's ${age}. The last ${yrs > 2 ? 'two years' : 'year'} of this deal will be paid to a player who no longer exists.`
            : `He's ${age}, so the deal covers his best years. That's the part teams usually get wrong, and this one got it right.`,
          ratio >= 1.05
            ? `The price is over what his play says he's worth. Not by a scandal. By enough to matter in year three.`
            : `The price is about what his play says he's worth. That's rarer in July than you'd think.`,
        ],
      ],
    };
    const [head, dek, body] = texts[by];
    out.push({ key: `sign:${t.id}`, by, head, dek, body, tids: from !== null ? [tid, from] : [tid], pids: [p.pid], user: mine || from === u, weight: 2 });
  }
  return out;
}

/** The kinds of take that are about one thing that happened (a trade, a signing, a series): each is said once, and they don't wait on each other. */
const ONE_OFF = new Set(['deal', 'quiet', 'sign', 'p02', 'g7', 'choke', 'swept', 'upset', 'title']);

/** Put a take on the air and remember it. */
function air(league: League, s: TakeState, t: Take) {
  const kind = t.key.split(':')[0];
  s.last = league.day;
  s.by = t.by;
  s.seen[t.key] = league.day;
  if (!ONE_OFF.has(kind)) s.seen[kind] = league.day;
  if (t.call && league.phase === 'regular') s.calls.push({ by: t.by, tid: t.call.tid, buy: t.call.buy, day: league.day, rec: recOf(tsOf(league, t.call.tid)) });
  publish(league, { kind: 'take', head: t.head, dek: t.dek, body: t.body, tids: t.tids, pids: t.pids, weight: t.weight }).by = byline(t.by);
}

/**
 * A day's take, if there is one worth the airtime (see GAP, AGAIN): through the regular season, its
 * deadline week (a trade is taken up the day after it's made, whatever was said yesterday) and the
 * summer's free agency (one a day at most).
 */
export function hotTakes(league: League, m: MediaState) {
  if (league.phase !== 'regular' && league.phase !== 'freeAgency') return;
  const s = stateOf(league, m);
  const since = league.day - s.last;
  // (outside deadline week and the summer nothing is said two days running)
  const oneOffs = league.phase === 'freeAgency' || Math.abs(league.tradeDeadlineDay - league.day) <= DEADLINE_WEEK;
  if (since < (oneOffs ? 1 : Math.ceil(GAP / 2))) return;
  const v = new Voice(worldRng(league, 'take', league.season, league.day), m);
  const kind = (key: string) => key.split(':')[0];
  const fresh = candidates(league, m, v).filter((t) =>
    ONE_OFF.has(kind(t.key)) ? s.seen[t.key] === undefined : (s.seen[t.key] ?? -99) + AGAIN <= league.day && (s.seen[kind(t.key)] ?? -99) + KIND_REST <= league.day,
  );
  const now = (t: Take) => ONE_OFF.has(kind(t.key));
  const t = fresh.find((x) => x.user && (now(x) || since >= Math.ceil(GAP / 2))) ?? fresh.find(now) ?? (since >= GAP ? fresh[0] : undefined);
  if (t) air(league, s, t);
}

// ---------------------------------------------------------------- the playoffs

/** The winners of a series' games so far, in order (from the results on record). */
function seriesWins(league: League, s: PlayoffSeries): number[] {
  return league.games
    .filter((g) => g.season === league.season && g.type === 'playoffs' && g.seriesId === s.id)
    .sort((a, b) => a.day - b.day || a.gid - b.gid)
    .map((g) => (g.home.pts > g.away.pts ? g.home.tid : g.away.tid));
}

/** The biggest lead a team held in a series it lost: [its wins, the other side's] at that point, or null if it never led by two. */
function blownLead(wins: number[], loser: number): [number, number] | null {
  let a = 0;
  let b = 0;
  let best: [number, number] | null = null;
  for (const w of wins) {
    if (w === loser) a++;
    else b++;
    if (a - b >= 2 && (!best || a - b > best[0] - best[1] || a > best[0])) best = [a, b];
  }
  return best;
}

/**
 * After a playoff game (the press's mediaGame calls it): the take the series has earned, one a day
 * across the league at most, the user's series first. A favourite (a top-three seed) down 0-2; a
 * Game 7; and when it ends, a blown 2-0, 3-0 or 3-1 lead, a star swept, or a low seed's upset.
 */
export function playoffTakes(league: League, m: MediaState, g: ScheduledGame) {
  if (g.type !== 'playoffs' || league.phase !== 'playoffs') return;
  const ps = league.playoffs.find((x) => x.id === g.seriesId);
  if (!ps) return;
  const s = stateOf(league, m);
  const u = league.userTid;
  const mine = ps.high === u || ps.low === u;
  if (s.last === league.day && !mine) return;
  const v = new Voice(worldRng(league, 'ptake', league.season, g.gid), m);
  const spoke = s.by;
  const who = (list: Pundit[]) => v.pick(list.length > 1 ? list.filter((p) => p !== spoke) : list);
  const N = (tid: number) => nick(league, tid);
  const wins = seriesWins(league, ps);
  const round = seriesLabel(ps);
  const [hw, lw] = [ps.highWins, ps.lowWins];
  let take: Take | null = null;
  const make = (key: string, by: Pundit, texts: Texts, tids: number[], pids: number[] = []) => {
    const [head, dek, body] = texts[by];
    if (head) take = { key: `${key}:${league.season}:${ps.id}`, by, head, dek, body, tids, pids, user: mine, weight: 2 };
  };
  if (ps.winner !== undefined) {
    const W = ps.winner;
    const Lo = W === ps.high ? ps.low : ps.high;
    const led = blownLead(wins, Lo);
    const games = hw + lw;
    const star = rosters(league)[Lo][0];
    if (led) {
      const lead = `${led[0]}-${led[1]}`;
      make(
        'choke',
        who(['rex', 'dee', 'marv', 'lila']),
        {
          rex: [
            `The ${N(Lo)} just choked away a ${lead} lead`,
            `Up ${lead} in the ${round}, out in ${games}. ${PUNDITS.rex.name} wants names.`,
            [
              `${lead}. They had it. They had it wrapped, and they handed it back.`,
              `Somebody has to answer for this, and it can't just be the last guy on the bench.`,
              `I don't want to hear about injuries or whistles. You were up ${lead}.`,
            ],
          ],
          dee: [
            `What happened in the ${poss(N(Lo))} locker room?`,
            `${PUNDITS.dee.name} on a ${lead} lead that became a summer vacation.`,
            [
              `I've been up in a series and felt it start to slip. It's the quietest room you'll ever sit in.`,
              `The ${N(W)} never believed they were out of it. The ${N(Lo)} started believing they'd already won. That's the whole series.`,
            ],
          ],
          marv: [
            `The ${N(Lo)} were up ${lead} and went home`,
            `${PUNDITS.marv.name} has a word for it, and it isn't "unlucky."`,
            [`In my day a team up ${lead} put its foot on a throat. This one put its feet up.`, `Give the ${N(W)} credit. They kept showing up. Showing up is most of it.`],
          ],
          lila: [
            `How rare was the ${poss(N(Lo))} collapse?`,
            `Up ${lead}, out in ${games}. ${PUNDITS.lila.name} on what the odds said, and when they turned.`,
            [
              `Teams up ${lead} win the series nearly every time. "Nearly" is carrying a great deal today.`,
              `It wasn't one bad night. The ${N(W)} were the better team from the middle of the series on. The lead hid it.`,
            ],
          ],
        },
        [Lo, W],
      );
    } else if (games === 4 && star && star.ovr >= 86) {
      const S = last(league, star);
      make(
        'swept',
        who(['rex', 'dee', 'marv', 'lila']),
        {
          rex: [
            `${S} got swept. Can you win with him?`,
            `Four games and out for the ${N(Lo)}. ${PUNDITS.rex.name} is asking the question.`,
            [
              `Great players don't get swept. I said what I said.`,
              `Four games. Not one win. At some point the numbers in January stop mattering.`,
              `If I'm the ${N(Lo)} I'm at least taking the calls.`,
            ],
          ],
          dee: [
            `Don't put the sweep on ${S}`,
            `${PUNDITS.dee.name} on a star who needed help and didn't get any.`,
            [`I watched every minute. He was doubled every trip and nobody else made a shot.`, `You want to blame somebody, blame whoever built a roster with one guy on it.`],
          ],
          marv: [
            `Swept. With ${S}. Imagine.`,
            `${PUNDITS.marv.name} on four straight losses for the ${N(Lo)}.`,
            [`Stars used to drag bad teams to a Game 6 out of spite.`, `The ${N(W)} played five-man basketball. It still works. Somebody tell the kids.`],
          ],
          lila: [
            `The ${N(Lo)} were swept, and it wasn't close`,
            `${PUNDITS.lila.name} on what four games say about a team built around ${S}.`,
            [`One star gets you into the playoffs. It takes about three good players to stay there.`, `He was fine. The minutes he sat were the series.`],
          ],
        },
        [Lo, W],
        [star.pid],
      );
    } else if (W === ps.low && ps.lowSeed - ps.highSeed >= 4) {
      make(
        'upset',
        who(['rex', 'dee', 'lila']),
        {
          rex: [
            `I told you the ${N(Lo)} were frauds`,
            `A ${ps.highSeed} seed out to a ${ps.lowSeed} seed. ${PUNDITS.rex.name} would like the credit.`,
            [
              `${recOf(tsOf(league, Lo))} in the regular season. Lovely. They don't hang banners for that.`,
              `The ${N(W)} weren't scared for one second. That tells you what the league really thought of the ${N(Lo)}.`,
            ],
          ],
          dee: [
            `The ${N(W)} just grew up in front of us`,
            `${PUNDITS.dee.name} on the upset of the ${round}.`,
            [`Nobody gave them a chance. I love a team nobody gave a chance.`, `Win one series like that and a young group never thinks the same way again. Watch out for them.`],
          ],
          marv: SILENT,
          lila: [
            `The ${ps.lowSeed} seed was better than its seed`,
            `${PUNDITS.lila.name} on why the ${N(W)} over the ${N(Lo)} wasn't the shock it looks.`,
            [
              `Seeds are records. Records are schedules and injuries and close games. The ${N(W)} were healthier in April than their record.`,
              `It's an upset by the bracket. It was a coin flip by the numbers.`,
            ],
          ],
        },
        [W, Lo],
      );
    }
  } else if (hw === 3 && lw === 3) {
    const led = blownLead(wins, ps.high) ?? blownLead(wins, ps.low);
    // (whoever let a lead go is the one with everything to lose)
    const onIt = blownLead(wins, ps.high) ? ps.high : blownLead(wins, ps.low) ? ps.low : ps.high;
    const star = rosters(league)[onIt][0];
    const S = star ? last(league, star) : `the ${N(onIt)}`;
    make(
      'g7',
      who(['rex', 'dee', 'marv', 'lila']),
      {
        rex: [
          `Game 7 decides what we say about ${S} forever`,
          `${N(ps.high)} and ${N(ps.low)}, one game. ${PUNDITS.rex.name} has both columns written.`,
          [
            led ? `They were up ${led[0]}-${led[1]}. Lose this and that's the only thing anybody remembers.` : `Win and he's a legend. Lose and he's a question. That's the job.`,
            `No pressure.`,
          ],
        ],
        dee: [
          `There is nothing like a Game 7`,
          `${PUNDITS.dee.name} played in two. She remembers every possession.`,
          [`You don't sleep the night before. You don't want to.`, `Forget the first six. Whoever wants the ball in the last four minutes wins this. I think that's ${S}.`],
        ],
        marv: [
          `Seven games. That's a series.`,
          `${PUNDITS.marv.name} finally found something he likes.`,
          [
            `Two teams that have hit each other for two weeks and still won't go away. This is the sport.`,
            `Rebound, defend, and don't foul a jump shooter. That's all a Game 7 has ever been.`,
          ],
        ],
        lila: [
          `Game 7 is closer to a coin flip than anyone will admit`,
          `${PUNDITS.lila.name} on the ${N(ps.high)}, the ${N(ps.low)} and one game.`,
          [
            `Home teams win most Game 7s. Most, not all, and the six games before it say these two are level.`,
            `Whoever loses will be called a choker by Thursday. They'll have lost a coin flip.`,
          ],
        ],
      },
      [ps.high, ps.low],
      star ? [star.pid] : [],
    );
  } else if (hw === 0 && lw === 2 && ps.highSeed <= 3) {
    const F = ps.high;
    make(
      'p02',
      who(['rex', 'dee', 'marv', 'lila']),
      {
        rex: [
          `It's over for the ${N(F)}`,
          `Down 0-2 at home in the ${round}. ${PUNDITS.rex.name} has seen enough.`,
          [`You lose two at home, you don't deserve the home court.`, `Eighty-two games to earn those two nights and they gave both away. Start the autopsy.`],
        ],
        dee: [
          `The ${N(F)} aren't dead. They're embarrassed.`,
          `${PUNDITS.dee.name} on a ${ps.highSeed} seed down 0-2.`,
          [
            `A series doesn't start until somebody wins on the road. Well, somebody has. Twice.`,
            `Embarrassed is useful. I'd take the ${N(F)} in Game 3, and then we'll see who's nervous.`,
          ],
        ],
        marv: [
          `The ${N(F)} got punched and didn't punch back`,
          `${PUNDITS.marv.name} on two home losses to open the ${round}.`,
          [`The ${N(ps.low)} came in and took their lunch. Twice.`, `There's no adjustment for that. You either get mad or you get swept.`],
        ],
        lila: [
          `Down 0-2: how bad is it for the ${N(F)}?`,
          `${PUNDITS.lila.name} has the history, and it isn't kind.`,
          [
            `Teams that lose the first two at home rarely come back. The ones that do are usually the better team having two bad nights.`,
            `The ${N(F)} might be that. They have one game to show it.`,
          ],
        ],
      },
      [F, ps.low],
    );
  }
  const t = take as Take | null;
  if (t && s.seen[t.key] === undefined) air(league, s, t);
}

/**
 * The night the Finals end (the press's mediaSeasonEnd calls it, before the receipts): what the
 * title makes of the player who won it, and of the team that lost it.
 */
export function finalsTake(league: League, m: MediaState) {
  const aw = league.awards.find((a) => a.season === league.season);
  if (!aw || aw.champion === undefined || aw.runnerUp === undefined) return;
  const s = stateOf(league, m);
  const key = `title:${league.season}`;
  if (s.seen[key] !== undefined) return;
  const v = new Voice(worldRng(league, 'title-take', league.season), m);
  const C = aw.champion;
  const R = aw.runnerUp;
  const N = (tid: number) => nick(league, tid);
  const mvp = aw.finalsMvp !== undefined ? league.players[aw.finalsMvp] : rosters(league)[C][0];
  if (!mvp) return;
  const M = last(league, mvp);
  const rings = mvp.awards.filter((a) => a.type === 'Champion').length;
  const nth = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][rings] ?? `${rings}th`;
  const what = titleLine(league, C, league.season);
  const loser = rosters(league)[R][0];
  const by = v.pick((['rex', 'dee', 'marv', 'lila'] as Pundit[]).filter((p) => p !== s.by));
  const texts: Texts = {
    rex: [
      rings >= 3 ? `Put ${M} on the mountain` : rings === 1 ? `One ring doesn't make ${M} an all-timer` : `${M} has ${rings} now. Start the argument.`,
      `The ${N(C)} are champions. ${PUNDITS.rex.name} is already arguing about what it means.`,
      rings >= 3
        ? [`${rings} titles. I'm done with the debate. If you still have him outside your top handful, turn in your vote.`, `The ${N(R)} were good. They ran into history.`]
        : [
            `Congratulations. Truly. Now do it again.`,
            `One title is a great season. The names people remember did it over and over, with everybody coming for them.`,
            loser ? `And ${last(league, loser)}? Another June, another long flight home. That's a legacy too.` : `The ${N(R)} will hear about this one for a while.`,
          ],
    ],
    dee: [
      `${M} just changed how he'll be remembered`,
      `${PUNDITS.dee.name} on the ${poss(N(C))} title and the player who carried it.`,
      [
        `There's who you are before you win one and who you are after. Ask anybody who has.`,
        rings > 1
          ? `That's his ${nth}. At some point you stop calling it a run and start calling it an era.`
          : `Nobody can ever say he didn't again. You have no idea how much lighter that makes a career.`,
      ],
    ],
    marv: [
      `The ${N(C)} won it the hard way, and I approve`,
      `${PUNDITS.marv.name} tips his cap. Briefly.`,
      [`Four rounds. Two months. Nobody handed them a thing.`, `${M} took every hit the ${N(R)} had and kept coming. That's a champion in any decade, including mine.`],
    ],
    lila: [
      `The best team won. That's rarer than you'd think.`,
      `${PUNDITS.lila.name} on the ${N(C)}${what ? `, ${what}` : ''}.`,
      [
        `The playoffs are short enough that the best team often doesn't win. This time it did.`,
        `${M} was the best player in the series, and the ${N(C)} were better in the minutes he sat too. That second part is what wins titles.`,
      ],
    ],
  };
  const [head, dek, body] = texts[by];
  air(league, s, { key, by, head, dek, body, tids: [C, R], pids: [mvp.pid], user: C === league.userTid || R === league.userTid, weight: 2 });
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
