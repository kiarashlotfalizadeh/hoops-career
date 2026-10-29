// A career mark as a story: the wire's line when a player reaches a round career total (games.ts
// writes it: "Stephen Curry of the Warriors scored his 25,000th career point.") becomes the press's story
// when the mark is a big one or the player is the user's: a headline, the night he got there and
// what it means. The same news item is rewritten in place, so the night is told once.
import type { League, NewsItem, ScheduledGame } from '../../types';
import { playerName } from '../helpers';
import { ordinal } from '../../format';
import { worldRng } from '../world';
import { careerTotals } from '../../analysis/milestones';
import type { MediaState } from '../media';
import { Voice } from './voice';

const MARK = /^(.+) of the .+? (?:scored|grabbed|handed out) his ([\d,]+)th career (point|rebound|assist)\.$/;

/** A career mark the press told as a story (see careerMarks): its moment is the mark's, not the front page's. */
export const isCareerMarkStory = (n: Pick<NewsItem, 'kind' | 'head' | 'text'>) => n.kind === 'milestone' && !!n.head && MARK.test(n.text);
const WORDS: Record<string, string> = { point: 'points', rebound: 'rebounds', assist: 'assists' };

/**
 * Whether a mark is the league's story (weight 2) or the user's front page (3): 20,000 points or
 * 10,000 rebounds or assists for anyone; any mark the wire names (every 5,000 points, every 2,500
 * rebounds or assists past 5,000) for the user's own players, the big ones on the front page.
 */
function weightFor(stat: string, mark: number, mine: boolean): 1 | 2 | 3 {
  const big = stat === 'point' ? mark >= 20000 : mark >= 10000;
  return mine ? (big ? 3 : 2) : big ? 2 : 1;
}

/** After a game: its players' career marks, told as stories when they're big or the user's (see weightFor). */
export function careerMarks(league: League, m: MediaState, g: ScheduledGame) {
  if (g.type !== 'regular') return;
  for (let i = league.news.length - 1; i >= 0; i--) {
    const n = league.news[i];
    if (n.season !== league.season || n.day !== league.day) break;
    if (n.kind !== 'milestone' || n.head || !n.tids.length || !(n.tids.includes(g.home) || n.tids.includes(g.away))) continue;
    const x = MARK.exec(n.text);
    const p = league.players[n.pids[0]];
    if (!x || !p) continue;
    const mark = Number(x[2].replace(/,/g, ''));
    const stat = x[3];
    const mine = p.tid === league.userTid;
    const weight = weightFor(stat, mark, mine);
    if (weight < 2) continue;
    const v = new Voice(worldRng(league, 'mark', p.pid, stat, mark), m);
    const name = playerName(p);
    const fig = `${mark.toLocaleString('en-US')} ${WORDS[stat]}`;
    n.head = v.say(`mark-${stat}`, [`${name} reaches ${fig}`, `${fig} for ${name}`, `${name} passes ${fig} for his career`]);
    const c = careerTotals(p);
    const seasons = new Set(p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season)).size;
    // (the wire's line stays the dek: the story adds the night it came on)
    n.body = `He got there in his ${ordinal(c.gp)} game, in his ${seasons === 1 ? 'first' : ordinal(seasons)} season.`;
    n.weight = weight;
  }
}
