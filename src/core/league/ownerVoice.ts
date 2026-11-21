// An owner's own words at the moments that decide a job: his verdict on the season, the warning
// under it, the ultimatum at the break and what he says when it is met, the sack, and the note on a
// title. Each of the eight quirks (voices.ts) says them his way; what he says never changes what he
// decides (owner.ts and jobSecurity.ts do that, on the same grades whoever owns the team). The facts
// a line has to carry (what the ultimatum asked, how deep the books closed) are handed in, so every
// quirk's line still says them.

import type { League } from '../types';
import { ownerQuirk, type OwnerQuirk } from './voices';

/** How the season left him, by his standing after it (owner.ts). */
export type Verdict = 'thrilled' | 'pleased' | 'patient' | 'concerned';

/** His standing after the review in a word (the same lines owner.ts drew before he had a voice). */
export const verdictOf = (total: number): Verdict => (total > 0.4 ? 'thrilled' : total > 0.1 ? 'pleased' : total > -0.2 ? 'patient' : 'concerned');

interface OwnerWords {
  /** His verdict's first line, by how the season left him. */
  verdict: Record<Verdict, string>;
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
      thrilled: 'A wonderful season. I like to think my notes helped.',
      pleased: 'A good season. I have a few pages of thoughts for the next one.',
      patient: 'An ordinary season. I will be more involved next year. You are welcome.',
      concerned: 'A poor season. I should have spoken up more, and next year I will.',
    },
    warning: 'One more like it and I stop suggesting and start deciding.',
    ultimatum: (ask) => `I have watched every game and I have run out of suggestions. ${ask}, or I pick the next coach myself.`,
    answered: 'You did what I asked at the break. See how well that works?',
    fired: {
      results: 'I gave you a season of notes and the results never changed. I am going to find a coach who reads them.',
      ultimatum: (ask) => `I told you at the break: ${ask}. It did not happen. I will be choosing the next coach myself.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I told you what that meant. I am making a change.`,
    },
    title: 'Champions. I knew that lineup would work. Enjoy the parade. Then I have a few ideas for next year.',
  },
  showman: {
    verdict: {
      thrilled: 'Nobody could get a ticket and nobody stopped talking about us. That is a season.',
      pleased: 'A good show. Not a great one yet. I want the great one.',
      patient: 'We were fine. Nobody buys a jersey for fine.',
      concerned: 'We lost and we were dull doing it. I can forgive one of those.',
    },
    warning: 'One more like it and the next headline is about the coach.',
    ultimatum: (ask) => `People are laughing at us, and I do not get laughed at. ${ask}, or the summer's big announcement is your replacement.`,
    answered: 'You answered the ultimatum with the whole city watching. I enjoyed that.',
    fired: {
      results: 'We lost, and worse, nobody cared. I need a team this city talks about, and a new coach to build it.',
      ultimatum: (ask) => `I told you at the break: ${ask}. It did not happen, and everybody saw it. I am making a change.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. A show that loses money closes. I am making a change.`,
    },
    title: 'Champions. The whole country is watching our parade. This is exactly what I bought the team for.',
  },
  hothead: {
    verdict: {
      thrilled: 'I did not throw one thing all spring. Best season of my life.',
      pleased: 'Good. I lost my temper only a handful of times. That is progress for both of us.',
      patient: 'I am calm. I have been told to say that I am calm.',
      concerned: 'I watched this season through my fingers. Do not make me do that again.',
    },
    warning: 'One more like it and I will not be this polite.',
    ultimatum: (ask) => `I have been patient. Ask anyone. ${ask}, or you are gone this summer.`,
    answered: 'You answered my ultimatum. I had the letter written. I tore it up.',
    fired: {
      results: 'I have had enough. I had enough in January. Clear out your office.',
      ultimatum: (ask) => `I told you at the break: ${ask}. It did not happen. We are done here.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I warned you once, calmly. You are done.`,
    },
    title: 'Champions. I have nothing to yell about and I do not know what to do with myself. Thank you.',
  },
  sentimental: {
    verdict: {
      thrilled: 'I will remember this group for the rest of my life. Thank you.',
      pleased: 'I am proud of them. Tell them I said so.',
      patient: 'They tried, and I love them for it. Trying will have to turn into winning.',
      concerned: 'It hurt to watch them lose this much. They deserve better from us.',
    },
    warning: 'One more like it and I will have to do something I do not want to do.',
    ultimatum: (ask) => `I hate writing this, and I am writing it anyway. ${ask}, or I have to make a change this summer.`,
    answered: 'You answered my ultimatum. I never wanted to send it.',
    fired: {
      results: 'This is the worst part of owning a team. The results were not good enough, and I have to let you go.',
      ultimatum: (ask) => `I told you at the break: ${ask}. It did not happen. I am sorry. I have to make a change.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I told you what that meant, and it gives me no pleasure. I have to let you go.`,
    },
    title: 'Champions. I cried at the buzzer and I am not ashamed of it. I will never forget this group.',
  },
  gambler: {
    verdict: {
      thrilled: 'We pushed our chips in and it paid. Now let us raise.',
      pleased: 'A winning hand. Not the jackpot. I still want the jackpot.',
      patient: 'We broke even. I never sat down at a table to break even.',
      concerned: 'A losing year. I can take losing. I cannot take losing small.',
    },
    warning: 'One more like it and I change the dealer.',
    ultimatum: (ask) => `Here is the bet, and it is your job on the table. ${ask}, or I cash you out this summer.`,
    answered: 'I bet against you at the break, and you made me lose. Well played.',
    fired: {
      results: 'I backed you and I lost. It happens. I am cashing out and finding another coach.',
      ultimatum: (ask) => `The bet at the break was simple: ${ask}. You lost it. I am changing coaches.`,
      books: (red) => `The books closed ${red} in the red, deeper again under the freeze. I gamble with my own money, not you with mine. I am changing coaches.`,
    },
    title: 'Champions. The biggest pot there is, and it is ours. Enjoy it. Then we go again.',
  },
  accountant: {
    verdict: {
      thrilled: 'The standings and the ledger agree, for once. I have framed both.',
      pleased: 'A sound return on the season. I checked the figures twice.',
      patient: 'We got roughly what we paid for. I would like more than that.',
      concerned: 'By any column I read, this season was a poor investment.',
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
      thrilled: 'I am told it was a marvelous season. I am sorry I missed it.',
      pleased: 'Good news travels, even to where I was. Well done.',
      patient: 'Someone sent me the standings. I have seen worse. I have seen better.',
      concerned: 'I came home to a pile of messages, none of them good. Explain the season to me.',
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
      thrilled: 'We defended, we rebounded, we won. That is how it is supposed to look.',
      pleased: 'An honest season from an honest team. I can build on that.',
      patient: 'Too soft too often. But there is a team in there somewhere.',
      concerned: 'We were pushed around all year. That is not a team I recognize.',
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

/** A goal's wording mid-sentence: "Reach the play-in" → "reach the play-in" (a name keeps its capital: "Win 40 games"). */
const mid = (ask: string) => `${ask.charAt(0).toLowerCase()}${ask.slice(1)}`;

/** The ultimatum as he puts it, for the mail and the card that announce it. */
export const ultimatumSaid = (league: Pick<League, 'id' | 'userTid'>, ask: string) => ownerWords(league).ultimatum(ask);

/** Why he fired the coach, in his words. */
export function firingSaid(league: Pick<League, 'id' | 'userTid'>, why: { ultimatum: string } | { books: string } | 'results'): string {
  const f = ownerWords(league).fired;
  return why === 'results' ? f.results : 'ultimatum' in why ? f.ultimatum(mid(why.ultimatum)) : f.books(why.books);
}
