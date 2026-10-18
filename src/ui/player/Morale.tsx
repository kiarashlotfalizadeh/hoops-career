// A rostered player's morale on his page's Overview: how he feels, what it does to his play (the
// engine's own multipliers), what pulls his mood up or down, and for your own player a promise
// that's running or a meeting to have.
import { Clock, MessageCircle } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { meetBlockedReason, promiseStatus, wantsMeeting } from '../../core/league/morale';
import { effectLine, moodMeta, moodReasons, moraleEffect, roomLine } from '../../core/league/moraleView';
import { Help, Section } from '../components/ui';

export function Morale({ league, p, mine, busyWhy, onMeet }: { league: League; p: Player; mine: boolean; busyWhy: string | null; onMeet: () => void }) {
  const meta = moodMeta(p);
  const e = moraleEffect(league, p);
  const reasons = moodReasons(p);
  const room = roomLine(e);
  const meetWhy = busyWhy ?? meetBlockedReason(league, p);
  const minutesReason = reasons.some((r) => r.key === 'minutes' && r.v < 0);
  return (
    <Section
      title="Morale"
      right={
        <Help title="Morale">
          <p>
            His mood moves each week toward the sum of what pulls on it: his minutes against what he expects, winning, his role and his pay. The figures are each pull, from about
            −4 to +3.
          </p>
          <p>
            Mood changes how well he plays, from about 3% below his best when he&apos;s furious to 2% above it when he&apos;s ecstatic. Each teammate who has asked for a trade
            costs the others 0.6% (two at most). Mood also decides whether he re-signs, and an unhappy star can ask for a trade.
          </p>
          <p>Meet a player who is unhappy or has asked out: promise him a bigger role, a trade, or ask for patience.</p>
        </Help>
      }
    >
      <div className="card tm-morale">
        <div className="tm-morale-head" style={{ color: meta.color }}>
          <span className="tm-morale-ic" aria-hidden="true">
            {meta.emoji}
          </span>
          <span className="tm-morale-l">{p.mood.tradeRequest ? 'Wants a trade' : meta.label}</span>
        </div>
        <div className={`tm-morale-fx ${e.total < -0.0025 ? 'bad' : e.total > 0.0025 ? 'good' : ''}`}>
          {effectLine(e)}
          {room && <span className="dim"> · {room}</span>}
        </div>
        {reasons.length > 0 && (
          <ul className="tm-reasons" aria-label="What moves his mood">
            {reasons.map((r) => (
              <li key={r.key}>
                <span className="grow">{r.text}</span>
                <span className={`num ${r.v < 0 ? 'bad' : 'good'}`}>
                  {r.v > 0 ? '+' : '−'}
                  {Math.abs(r.v).toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!minutesReason && p.mood.expectedMin > 0 && <div className="tm-why-line">Expects about {p.mood.expectedMin} minutes a night.</div>}
        {mine && p.promise && (
          <div className="tm-promise">
            <Clock size={15} aria-hidden="true" />
            <span className="grow">{promiseStatus(league, p)}</span>
          </div>
        )}
        {mine && !p.promise && wantsMeeting(p) && (
          <div className="row wrap tm-acts">
            <button className="btn sm primary" disabled={!!meetWhy} onClick={onMeet}>
              <MessageCircle size={15} /> Meet with him
            </button>
            {meetWhy && <span className="tm-why-line">{meetWhy}</span>}
          </div>
        )}
      </div>
    </Section>
  );
}
