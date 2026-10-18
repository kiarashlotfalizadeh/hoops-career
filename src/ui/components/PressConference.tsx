// The press conference after one of the user's games: what was said, then his own answer (his latest
// game only, once), each answer showing what it does to the locker room before it's given.
import { useState } from 'react';
import type { GameResult, League, PressChoice } from '../../core/types';
import { holdPress, isLatestUserGame, pressEffects, pressOpen, pressOptions, pressSummary, type postGameQuotes, type PressEffect } from '../../core/analysis/quotes';
import { act } from '../../state/actions';
import { useStore } from '../../state/store';
import { Help, Section } from './ui';
import './gameday.css';

/**
 * What was said after the game, and the user's own answer (his latest game only, once): each answer
 * shows what it does to the locker room before it's given (see the press conference in quotes.ts).
 */
export function PressConference({ league, res, quotes }: { league: League; res: GameResult; quotes: ReturnType<typeof postGameQuotes> }) {
  const simming = useStore((s) => !!s.sim);
  const [given, setGiven] = useState<PressEffect[] | null>(null);
  const tid = league.userTid;
  const press = isLatestUserGame(league, res) ? pressOptions(league, res) : [];
  const open = pressOpen(league, res);
  const held = league.press?.gid === res.gid ? league.press.choice : undefined;
  const answer = (choice: PressChoice) => {
    let fx: PressEffect[] | null = null;
    if (
      !act('Press conference', (l) => {
        const g = l.games.find((x) => x.gid === res.gid);
        if (g) fx = holdPress(l, g, choice);
      })
    )
      return;
    setGiven(fx);
  };
  const answering = press.length > 0 && (open || held);
  if (!quotes.length && !answering) return null;
  return (
    <Section
      title="Press conference"
      right={
        answering && !held ? (
          <Help title="Press conference">
            <p>
              One answer after your latest game, if you want to give one. It moves your players&apos; mood, which lifts or drags how they play a little and fades over the weeks.
            </p>
            <p>
              Praise lifts the player of the game most, but the teammate he outshone and a starter who had a poor night cool a little. Crediting the group lifts everyone after a
              win; after a loss it reads as soft.
            </p>
            <p>
              After a loss, challenging the team fires up players in a good mood and stings unhappy ones; calling out the player who struggled most is a big swing: a veteran in a
              good mood takes it as a challenge, anyone else takes it badly.
            </p>
          </Help>
        ) : undefined
      }
    >
      {quotes.length > 0 && (
        <div className="gd-quotes">
          {quotes.map((q, i) => (
            <blockquote key={i} className={`gd-quote ${q.tid === tid ? 'mine' : ''}`}>
              <p>“{q.text}”</p>
              <footer>
                {q.who}, {q.role}
              </footer>
            </blockquote>
          ))}
        </div>
      )}
      {answering &&
        (held ? (
          <div className="gd-press-done small">
            <span className="dim2">You: {press.find((o) => o.id === held)?.label ?? 'Answered'}.</span>{' '}
            <span className="bold">{pressSummary(given ?? pressEffects(league, res, held))}</span>
          </div>
        ) : (
          <div className="card flush list gd-press" role="group" aria-label="Your answer">
            {press.map((o) => (
              <button key={o.id} className="gd-press-opt" disabled={simming} onClick={() => answer(o.id)} aria-label={`${o.label}: ${o.hint}`}>
                <span className="gd-press-l">{o.label}</span>
                <span className="gd-press-h">
                  {/* (whose mood it lifts, ↑, or cools, ↓) */}
                  {o.hint.split(' · ').map((part, i) => (
                    <span key={part}>
                      {i > 0 && ' · '}
                      <span className={part.endsWith('↑') ? 'good' : part.endsWith('↓') ? 'bad' : undefined}>{part}</span>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        ))}
    </Section>
  );
}
