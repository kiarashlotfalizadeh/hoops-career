// Talks with a player's agent on the contract sheet (see src/core/league/negotiation.ts): where they
// stand (talks off, a firm ask, his standing counter with Accept counter), his patience in plain
// words, what a lowball and a breakdown cost, and his last reply. His walk-away price is never shown:
// only his ask, and that he may take a little less.
import { Handshake, MessagesSquare, PhoneOff, TriangleAlert } from 'lucide-react';
import type { Player, TalkTerms } from '../../core/types';
import { LOWBALL, type TalkKind, askFor, breakdownRule, closedLabel, patienceText, talkState } from '../../core/league/negotiation';
import { makeContract } from '../../core/league/contracts';
import { playerName, shortName } from '../../core/league/helpers';
import { useLeague } from '../../state/store';
import { More } from '../components/ui';
import { Callout } from './common';
import { money, moneyExact } from '../../core/format';

const yrs = (n: number) => `${n} yr${n === 1 ? '' : 's'}`;

/** His answer to the last offer made from this sheet: a counter or a breakdown. */
export interface Reply {
  text: string;
  tone: 'warn' | 'bad';
}

/** "Player option" / "team option" in running text. */
export const optionLabel = (o?: TalkTerms['option']) => (o ? `${o} option` : 'no option');

export function TalkPanel({
  p,
  kind,
  season,
  amount,
  years,
  option,
  reply,
  counterBlocked,
  onAcceptCounter,
}: {
  p: Player;
  kind: TalkKind;
  /** The first season of the contract talked about (for the counter's total). */
  season: number;
  amount: number;
  years: number;
  option?: TalkTerms['option'];
  reply: Reply | null;
  /** Why his counter can't be signed as it stands (the cap, the roster), or null. */
  counterBlocked: (c: TalkTerms) => string | null;
  onAcceptCounter: (c: TalkTerms) => void;
}) {
  const league = useLeague();
  const st = talkState(league, p, kind);
  const name = shortName(league, p);
  if (st.closed)
    return (
      <Callout tone="bad" icon={<PhoneOff size={18} className="bad" />}>
        <b>Talks are off.</b> {playerName(p)} isn't taking your calls until {closedLabel(league, st.closed)}
        {st.lowballs >= 2 ? ': two lowballs were too many.' : '.'}
      </Callout>
    );
  const askAt = askFor(league, p, kind, years, option);
  const lowball = amount < askAt * LOWBALL;
  const c = st.counter;
  const cWhy = c ? counterBlocked(c) : null;
  const cTotal = c ? makeContract(league, c.amount, c.years, season, p.experience).salaries.reduce((a, x) => a + x, 0) : 0;
  const tone = st.patience <= 1 ? 'bad' : st.patience === 2 ? 'warn' : 'good';
  // his counter shows in its own row: the reply keeps only what it adds (that a lowball stung)
  const replyText = reply && c && reply.tone === 'warn' ? reply.text.replace(/^.*? counters at .*? over \d+ years?\.\s*/, '') : reply?.text;
  return (
    <section className="fo-talk" aria-label="Talks with his agent">
      <div className="fo-talk-h">
        <span className="over grow">Talks with his agent</span>
        <span className={`fo-patience ${tone}`} role="img" aria-label={patienceText(st.patience)}>
          {Array.from({ length: Math.max(st.patience, 0) }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      </div>
      {st.firm ? (
        <div className="small warn">
          He's had enough: only his ask now, {moneyExact(askAt)} for {yrs(years)}
          {option ? ` with a ${option} option` : ''}, for the rest of the re-sign period.
        </div>
      ) : (
        <div className="small dim2">
          Offer his ask (<b className="num">{moneyExact(askAt)}</b> on these terms) and he signs. A little less may do; below that he counters.
        </div>
      )}
      {c && (
        // (keyed: a new counter slides in, his answer arriving)
        <div className="fo-counter-row fo-react-row" key={`${c.amount}:${c.years}`}>
          <Handshake size={16} className="good" />
          <div className="grow">
            <b>His counter:</b> <span className="num">{moneyExact(c.amount)}</span> × {yrs(c.years)}
            <span className="dim"> · {money(cTotal)} total</span>
            {cWhy && <div className="tiny warn">{cWhy}</div>}
          </div>
          <button className="btn xs primary" disabled={!!cWhy} onClick={() => onAcceptCounter(c)}>
            Accept counter
          </button>
        </div>
      )}
      {lowball && !st.firm && (
        <div className="fo-talk-warn">
          <TriangleAlert size={14} /> Under {Math.round(LOWBALL * 100)}% of his ask: {name} takes it as a lowball.
        </div>
      )}
      {reply && replyText && (
        <Callout tone={reply.tone} icon={<MessagesSquare size={16} className={reply.tone} />}>
          {replyText}
        </Callout>
      )}
      {!st.firm && (
        <More label="How talks go">
          <p className="tiny dim">
            {patienceText(st.patience)} A lowball (under {Math.round(LOWBALL * 100)}% of his ask) counts twice and costs some of his interest in you. If talks break down,{' '}
            {breakdownRule(league, kind)}.
          </p>
        </More>
      )}
    </section>
  );
}
