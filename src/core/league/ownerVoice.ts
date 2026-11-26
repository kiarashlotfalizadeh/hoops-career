// An owner's own words at the moments that decide a job: his verdict on the season, the warning
// under it, the ultimatum at the break and what he says when it is met, the sack, and the note on a
// title. Each of the eight quirks (voices.ts) says them his way; what he says never changes what he
// decides (owner.ts and jobSecurity.ts do that, on the same grades whoever owns the team). The facts
// a line has to carry (what the ultimatum asked, how deep the books closed) are handed in, so every
// quirk's line still says them. How they talk is part of who they are: the hothead, the showman, the
// gambler, the meddler and the sentimental owner talk in contractions, the accountant, the absentee
// and the traditionalist never do.

import type { League } from '../types';
import { hashString, mix32 } from '../random';
import { ownerQuirk, type OwnerQuirk } from './voices';

/** How the season left him: by its own grade (owner.ts), or by his standing where it had no goals to grade. */
export type Verdict = 'thrilled' | 'pleased' | 'patient' | 'concerned';

/**
 * A grade (the season's, or his standing) in a word. His verdict is on the season he is reviewing:
 * read off the standing, which each season moves by less than half, a showman said "We were fine"
 * after a season graded −19 and again after one graded +25.
 */
export const verdictOf = (total: number): Verdict => (total > 0.4 ? 'thrilled' : total > 0.1 ? 'pleased' : total > -0.2 ? 'patient' : 'concerned');

interface OwnerWords {
  /** His verdict's first line, by how the season left him: a few of each, so a long career doesn't hear one twice running (verdictSaid). */
  verdict: Record<Verdict, string[]>;
  /** Under a poor verdict, when the next review can fire the coach. */
  warning: string;
  /** The ultimatum at the break: `ask` is what he wants ("Win 40 games from here"), as a sentence start. */
  ultimatum: (ask: string) => string;
  /** At the review, when the ultimatum was met. */
  answered: string;
  /** The sack: for the results, for a missed ultimatum (`ask` mid-sentence, "reach the play-in"), for the books (`red`: how deep they closed). */
  fired: { results: string; ultimatum: (ask: string) => string; books: (red: string) => string };
  /** The note the night of a title. */
  title: string;
}

export const OWNER_WORDS: Record<OwnerQuirk, OwnerWords> = {
  meddler: {
    verdict: {
      thrilled: [
        'A wonderful season. I like to think my notes helped.',
        "What a year. I've framed the lineup card, and my notes beside it.",
        "Everything I suggested worked. I'm almost sure it was what I suggested.",
      ],
      pleased: [
        "A good season. I've got a few pages of thoughts for the next one.",
        'Good work. I only called you twice a week, so you know I mean it.',
        "I liked most of it. The rest is in a folder I'm sending over.",
      ],
      patient: [
        "An ordinary season. I'll be more involved next year. You're welcome.",
        "Not bad, not good. I've started a list. It's a long list.",
        'Middling. I think you and I should talk more. Daily, maybe.',
      ],
      concerned: [
        "A poor season. I should've spoken up more, and next year I will.",
        'That was hard to watch, and I watched all of it. With a notepad.',
        'I kept quiet this year, mostly. Look where that got us.',
      ],
    },
    warning: 'One more like it and I stop suggesting and start deciding.',
    ultimatum: (ask) => `I've watched every game and I've run out of suggestions. ${ask}, or I pick the next coach myself.`,
    answered: 'You did what I asked at the break. See how well that works?',
    fired: {
      results: "I gave you a season of notes and the results never changed. I'm going to find a coach who reads them.",
      ultimatum: (ask) => `I told you at the break: ${ask}. It didn't happen. I'll be choosing the next coach myself.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I told you what that meant. I'm making a change.`,
    },
    title: "Champions. I knew that lineup would work. Enjoy the parade. Then I've got a few ideas for next year.",
  },
  showman: {
    verdict: {
      thrilled: [
        "Nobody could get a ticket and nobody stopped talking about us. That's a season.",
        "Sold out since November, and my phone hasn't stopped. Do it again.",
        "We were the best show in the league. I'd buy the team all over again.",
      ],
      pleased: [
        'A good show. Not a great one yet. I want the great one.',
        'People noticed us this year. Next year I want them unable to look away.',
        'Good crowds, good nights. Now give me a finale.',
      ],
      patient: [
        'We were fine. Nobody buys a jersey for fine.',
        "It was a season. I can't remember one night of it, and that's the problem.",
        "We didn't embarrass anybody and we didn't thrill anybody. I sell thrills.",
      ],
      concerned: [
        'We lost and we were dull doing it. I can forgive one of those.',
        'I had empty seats on a Saturday. A Saturday.',
        "Nobody's talking about us, and when they do, they're laughing.",
      ],
    },
    warning: 'One more like it and the next headline is about the coach.',
    ultimatum: (ask) => `People are laughing at us, and I don't get laughed at. ${ask}, or the summer's big announcement is your replacement.`,
    answered: 'You answered the ultimatum with the whole city watching. I enjoyed that.',
    fired: {
      results: 'We lost, and worse, nobody cared. I need a team this city talks about, and a new coach to build it.',
      ultimatum: (ask) => `I told you at the break: ${ask}. It didn't happen, and everybody saw it. I'm making a change.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. A show that loses money closes. I'm making a change.`,
    },
    title: "Champions. The whole country's watching our parade. This is exactly what I bought the team for.",
  },
  hothead: {
    verdict: {
      thrilled: [
        "I didn't throw one thing all spring. Best season of my life.",
        "I've got nothing to complain about. I checked. Twice.",
        'Great year. I yelled anyway, out of habit. Ignore it.',
      ],
      pleased: [
        "Good. I only lost my temper a handful of times. That's progress for both of us.",
        'A good year. The TV survived it. So did you.',
        "I liked it. Don't tell anybody I said that.",
      ],
      patient: [
        "I'm calm. I've been told to say that I'm calm.",
        "It wasn't a disaster. I'm told that's the nice way to put it.",
        "It was fine. I've been saying fine through my teeth all year.",
      ],
      concerned: [
        "I watched this season through my fingers. Don't make me do that again.",
        "I'm not going to yell. I did all my yelling in March.",
        'That season took years off my life. I want them back.',
      ],
    },
    warning: "One more like it and I won't be this polite.",
    ultimatum: (ask) => `I've been patient. Ask anyone. ${ask}, or you're gone this summer.`,
    answered: 'You answered my ultimatum. I had the letter written. I tore it up.',
    fired: {
      results: "I've had enough. I'd had enough in January. Clear out your office.",
      ultimatum: (ask) => `I told you at the break: ${ask}. It didn't happen. We're done here.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I warned you once, calmly. You're done.`,
    },
    title: "Champions. I've got nothing to yell about and I don't know what to do with myself. Thank you.",
  },
  sentimental: {
    verdict: {
      thrilled: [
        "I'll remember this group for the rest of my life. Thank you.",
        "I didn't want this season to end. That's the best thing I can say about one.",
        "These players made a lot of people happy this year. I'm one of them.",
      ],
      pleased: ["I'm proud of them. Tell them I said so.", "A good year with good people. I'm grateful for it.", 'They grew up a little this season. I loved watching it.'],
      patient: [
        'They tried, and I love them for it. Trying will have to turn into winning.',
        "I still believe in this group. I'd like the standings to believe too.",
        "It wasn't the year we hoped for. They'll be better for it. So will we.",
      ],
      concerned: [
        'It hurt to watch them lose this much. They deserve better from us.',
        "They kept their heads up through all of it. I'm not sure I did.",
        "I hate seeing this group go home this early. It isn't who they are.",
      ],
    },
    warning: "One more like it and I'll have to do something I don't want to do.",
    ultimatum: (ask) => `I hate writing this, and I'm writing it anyway. ${ask}, or I have to make a change this summer.`,
    answered: 'You answered my ultimatum. I never wanted to send it.',
    fired: {
      results: "This is the worst part of owning a team. The results weren't good enough, and I have to let you go.",
      ultimatum: (ask) => `I told you at the break: ${ask}. It didn't happen. I'm sorry. I have to make a change.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I told you what that meant, and it gives me no pleasure. I have to let you go.`,
    },
    title: "Champions. I cried at the buzzer and I'm not ashamed of it. I'll never forget this group.",
  },
  gambler: {
    verdict: {
      thrilled: [
        "We pushed our chips in and it paid. Now let's raise.",
        "That's what a hot hand looks like. Don't you dare cool off.",
        'I bet big on this year and it came in. Double it.',
      ],
      pleased: [
        'A winning hand. Not the jackpot. I still want the jackpot.',
        "We left the table up. I don't leave tables, though. Let's play on.",
        "Good year. We're ahead. Ahead isn't rich.",
      ],
      patient: [
        'We broke even. I never sat down at a table to break even.',
        'A push. Nobody gets a story out of a push.',
        "We didn't lose much and we didn't win much. That's the worst night there is.",
      ],
      concerned: [
        "A losing year. I can take losing. I can't take losing small.",
        "We got cleaned out this year. I've been there. I didn't like it then either.",
        'Bad cards all year, and we played them badly too.',
      ],
    },
    warning: 'One more like it and I change the dealer.',
    ultimatum: (ask) => `Here's the bet, and it's your job on the table. ${ask}, or I cash you out this summer.`,
    answered: 'I bet against you at the break, and you made me lose. Well played.',
    fired: {
      results: "I backed you and I lost. It happens. I'm cashing out and finding another coach.",
      ultimatum: (ask) => `The bet at the break was simple: ${ask}. You lost it. I'm changing coaches.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I gamble with my own money, not you with mine. I'm changing coaches.`,
    },
    title: "Champions. The biggest pot there is, and it's ours. Enjoy it. Then we go again.",
  },
  // (the accountant, the absentee and the traditionalist keep their full words: stiff is who they are)
  accountant: {
    verdict: {
      thrilled: [
        'The standings and the ledger agree, for once. I have framed both.',
        'Every column came in over projection. I checked them three times, for pleasure.',
        'An excellent return. I do not use that word about a season often.',
      ],
      pleased: [
        'A sound return on the season. I checked the figures twice.',
        'The season finished in the black, on the floor and off it. Good.',
        'Modestly ahead of plan. I am a modest man, and I am pleased.',
      ],
      patient: [
        'We got roughly what we paid for. I would like more than that.',
        'The season came in on budget and on forecast. Neither is a compliment.',
        'A flat year. Flat years compound into nothing.',
      ],
      concerned: [
        'By any column I read, this season was a poor investment.',
        'The season closed under plan on every line that matters.',
        'I have had the year audited. The losses were ours, all of them.',
      ],
    },
    warning: 'One more like it and I write this job off.',
    ultimatum: (ask) => `I have run the season forward and I do not like the total. ${ask}, or I close this account in the summer.`,
    answered: 'You met the ultimatum. I have moved you back to the asset column.',
    fired: {
      results: 'I have totaled the seasons and the return is not there. I am making a change.',
      ultimatum: (ask) => `I told you at the break: ${ask}. The final figure came in under it. I am making a change.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I told you what that meant, and no banner balances it. I am making a change.`,
    },
    title: 'Champions. For once I did not look at the cost first. I looked at it second. Worth it.',
  },
  ghost: {
    verdict: {
      thrilled: [
        'I am told it was a marvelous season. I am sorry I missed it.',
        'The news was so good I had it read to me twice.',
        'Somebody sent me a photograph of the standings. I have kept it.',
      ],
      pleased: [
        'Good news travels, even to where I was. Well done.',
        'I heard about the season at a dinner, from a stranger. He was impressed.',
        'The reports that reached me were short and good. The best kind.',
      ],
      patient: [
        'Someone sent me the standings. I have seen worse. I have seen better.',
        'I asked how the season went and nobody had much to say. That tells me enough.',
        'Nothing about this season reached me. I take that as a middling sign.',
      ],
      concerned: [
        'I came home to a pile of messages, none of them good. Explain the season to me.',
        'The standings found me on holiday. They ruined a perfectly good lunch.',
        'When people write me long letters, the season went badly. I got long letters.',
      ],
    },
    warning: 'One more like it and I will have to start showing up. Neither of us wants that.',
    ultimatum: (ask) => `When news reaches me out here, it is bad news. ${ask}, or I come home this summer and make a change.`,
    answered: 'I am told I gave you an ultimatum, and that you met it. Good.',
    fired: {
      results: 'I came back to see for myself. It was as bad as they told me. I am making a change.',
      ultimatum: (ask) => `I sent word at the break: ${ask}. It did not happen. I am home now, and I am making a change.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. Even I read that letter. I am making a change.`,
    },
    title: 'Champions. I flew back for the last game and I am glad I did. Well done.',
  },
  traditionalist: {
    verdict: {
      thrilled: [
        'We defended, we rebounded, we won. That is how it is supposed to look.',
        'A hard team that played the right way all year. I could not ask for more.',
        'They earned every win of it. That is the only kind I count.',
      ],
      pleased: [
        'An honest season from an honest team. I can build on that.',
        'They competed every night. Most nights it was enough.',
        'Good habits, good season. The two are not a coincidence.',
      ],
      patient: [
        'Too soft too often. But there is a team in there somewhere.',
        'Some nights they played my kind of basketball. I want every night.',
        'An average season from a team that practiced like an average one.',
      ],
      concerned: [
        'We were pushed around all year. That is not a team I recognize.',
        'They were outworked, and no team of mine should ever be outworked.',
        'No defense, no toughness, no excuses. A bad year.',
      ],
    },
    warning: 'One more like it and I find someone who will make them run.',
    ultimatum: (ask) => `This is not how one of my teams plays. ${ask}, or I find a coach who can make it.`,
    answered: 'I drew a line and you got over it. That is all I ever ask.',
    fired: {
      results: 'My teams defend and they compete. This one did neither often enough. I am making a change.',
      ultimatum: (ask) => `I told you at the break: ${ask}. It did not happen. I gave my word on it, and I keep my word. I am making a change.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. You do not spend what you do not have. I am making a change.`,
    },
    title: 'Champions. We earned it on the defensive end, the way titles have always been won. Well done.',
  },
};

/** The words of the owner of team `tid` (the user's by default). */
export const ownerWords = (league: Pick<League, 'id' | 'userTid'>, tid = league.userTid): OwnerWords => OWNER_WORDS[ownerQuirk(league, tid)];

/**
 * His verdict's first line for the season under review: one of his lines for how it left him
 * (`x`: the season's grade, or his standing), the same for the same season, and never the line he
 * opened his last review with.
 */
export function verdictSaid(league: Pick<League, 'id' | 'userTid' | 'season' | 'ownerReviews'>, x: number): string {
  const lines = ownerWords(league).verdict[verdictOf(x)];
  const i = mix32(hashString(`${league.id}:${league.season}:verdict`)) % lines.length;
  const last = league.ownerReviews?.filter((r) => r.season < league.season).at(-1)?.said;
  return lines[i] === last ? lines[(i + 1) % lines.length] : lines[i];
}

/** A goal's wording mid-sentence: "Reach the play-in" → "reach the play-in" (a name keeps its capital: "Win 40 games"). */
const mid = (ask: string) => `${ask.charAt(0).toLowerCase()}${ask.slice(1)}`;

/** The ultimatum as he puts it, for the mail and the card that announce it. */
export const ultimatumSaid = (league: Pick<League, 'id' | 'userTid'>, ask: string) => ownerWords(league).ultimatum(ask);

/** Why he fired the coach, in his words. */
export function firingSaid(league: Pick<League, 'id' | 'userTid'>, why: { ultimatum: string } | { books: string } | 'results'): string {
  const f = ownerWords(league).fired;
  return why === 'results' ? f.results : 'ultimatum' in why ? f.ultimatum(mid(why.ultimatum)) : f.books(why.books);
}
