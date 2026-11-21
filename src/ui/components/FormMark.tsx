// A player's form, when it is worth a word: the tear or the slump the engine is playing him at this
// week or two (league/legends.ts's formStretch). A small flame or snowflake beside his name on a
// roster and a pre-game card; the words themselves on his own page.
import { Flame, Snowflake } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { FORM_ABOUT, FORM_WORD, formStretch } from '../../core/league/legends';

export function FormMark({
  league,
  p,
  day,
  words,
}: {
  league: League;
  p: Pick<Player, 'pid' | 'tid'>;
  /** The day of the game he is shown for (today's form otherwise). */ day?: number;
  /** Say it in words (a tag), not only the icon. */ words?: boolean;
}) {
  const form = formStretch(league, p, day);
  if (!form) return null;
  const Icon = form === 'hot' ? Flame : Snowflake;
  if (words)
    return (
      <span className={`tag form-tag ${form}`} title={FORM_ABOUT[form]}>
        <Icon size={12} aria-hidden="true" />
        {FORM_WORD[form]}
      </span>
    );
  return (
    <span className={`form-mark ${form}`} title={`${FORM_WORD[form]}. ${FORM_ABOUT[form]}`}>
      <Icon size={13} aria-hidden="true" />
      <span className="sr-only">{FORM_WORD[form]}</span>
    </span>
  );
}
