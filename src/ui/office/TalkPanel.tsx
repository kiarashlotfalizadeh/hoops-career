// Talks with a player's agent on the contract sheet (see src/core/league/negotiation.ts): where they
// stand (talks off, a firm ask, his standing counter with Accept counter), his patience in plain
// words, what a lowball and a breakdown cost, and his last reply. His walk-away price is never shown:
// only his ask, and that he may take a little less.
import { Handshake, MessagesSquare, PhoneOff, TriangleAlert } from 'lucide-react';
import type { Player, TalkTerms } from '../../core/types';
import { LOWBALL, type TalkKind, askFor, breakdownRule, closedLabel, patienceText, talkState } from '../../core/league/negotiation';
import { makeContract } from '../../core/league/contracts';
import { playerName } from '../../core/league/helpers';
import { useLeague } from '../../state/store';
import { Callout, fmtM } from './common';

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
  const name = p.lastName;
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
  return (
    <div className="card tight col" style={{ gap: 8 }}>
      <div className="row between" style={{ gap: 8 }}>
        <div className="row small bold" style={{ gap: 6 }}>
          <MessagesSquare size={15} /> Talks with his agent
        </div>
        <span className="row" style={{ gap: 3 }} role="img" aria-label={patienceText(st.patience)}>
          {Array.from({ length: Math.max(st.patience, 0) }, (_, i) => (
            <i key={i} className="fo-dot" style={{ background: st.patience <= 1 ? 'var(--bad)' : st.patience === 2 ? 'var(--warn)' : 'var(--good)', margin: 0 }} />
          ))}
        </span>
      </div>
      {st.firm ? (
        <div className="small warn">
          He has had enough: he signs only at his ask now, {fmtM(askAt, 2)} for {yrs(years)}
          {option ? ` with a ${option} option` : ''}, for the rest of the re-sign period.
        </div>
      ) : (
        <div className="small dim2">
          His ask for these terms is <b className="num">{fmtM(askAt, 2)}</b>: offer it and he signs on the spot. He may take a little less (how much, he keeps to himself); below
          that he counters.
        </div>
      )}
      {c && (
        <div className="row" style={{ gap: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
          <Handshake size={16} className="good" style={{ flex: 'none' }} />
          <div className="grow small" style={{ minWidth: 0 }}>
            <b>His counter:</b> <span className="num">{fmtM(c.amount, 2)}</span> × {yrs(c.years)}
            <span className="dim"> · {fmtM(cTotal)} total</span>
            {cWhy && <div className="tiny warn">{cWhy}</div>}
          </div>
          <button className="btn xs primary" disabled={!!cWhy} onClick={() => onAcceptCounter(c)}>
            Accept counter
          </button>
        </div>
      )}
      {!st.firm && (
        <div className="tiny dim">
          {patienceText(st.patience)} A lowball (under {Math.round(LOWBALL * 100)}% of his ask) counts twice and costs some of his interest in you. If talks break down,{' '}
          {breakdownRule(league, kind)}.
        </div>
      )}
      {lowball && !st.firm && (
        <div className="row small warn" style={{ gap: 6 }}>
          <TriangleAlert size={14} style={{ flex: 'none' }} /> This offer is under {Math.round(LOWBALL * 100)}% of his ask: {name} will take it as a lowball.
        </div>
      )}
      {reply && (
        <Callout tone={reply.tone} icon={<MessagesSquare size={16} className={reply.tone} />}>
          {reply.text}
        </Callout>
      )}
    </div>
  );
}
