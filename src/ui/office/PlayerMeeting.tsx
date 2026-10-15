// Meeting one of your players who asked for a trade or is unhappy (see meetPlayer in
// core/league/morale.ts): what's eating him, what each promise does and how likely it is to work,
// and the promise itself. On the player page (a sheet) and in the Front Office's contract sheet.
import { Link } from 'react-router-dom';
import { Clock, Handshake, Hourglass, TrendingUp } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { fmtDate, seasonTotals } from '../../core/league/helpers';
import { MEET_DAYS, PATIENCE_GAMES, ROLE_GAMES, complaints, meetBlockedReason, meetPlayer, patienceOdds, promiseStatus, type MeetChoice } from '../../core/league/morale';
import { archetype } from '../../core/ratings';
import { liveInProgress } from '../../state/live';
import { useStore } from '../../state/store';
import { Callout } from './common';

const ICON = { role: TrendingUp, trade: Handshake, patience: Hourglass } as const;

/** What a promise would do, in plain words, and the button that makes it. */
function options(league: League, p: Player): { choice: MeetChoice; title: string; body: string; foot?: string; button: string }[] {
  const asked = p.mood.tradeRequest;
  const st = seasonTotals(p, league.season);
  const mpg = st?.gp ? st.min / st.gp : 0;
  const planned = league.teams[p.tid].rotation.minutes[p.pid] ?? 0;
  const creator = archetype(p.ratings).role === 'creator';
  const before = league.phase === 'preseason' || (league.phase === 'regular' && league.day <= league.tradeDeadlineDay);
  const odds = patienceOdds(league, p);
  const list = [
    {
      choice: 'role' as const,
      title: 'Promise a bigger role',
      body: `He ${asked ? 'puts his trade request on hold' : 'holds off'} while you play him about ${p.mood.expectedMin} minutes a night${creator ? ' with the ball in his hands (not as a spot-up shooter, roller or glue guy)' : ''} over his next ${ROLE_GAMES} games. Games he misses hurt or rested don't count. Keep it and ${asked ? 'he drops the request and' : 'he'} cheers up; break it and ${asked ? 'he wants out again, angrier,' : "he's angrier,"} and won't take your word again this season.`,
      foot: `It's up to you: ${st?.gp ? `${mpg.toFixed(1)} minutes a night so far this season, ` : ''}${planned} planned in your rotation.`,
      button: 'Promise it',
    },
    {
      choice: 'trade' as const,
      title: "I'll find you a trade",
      body: `The request stands, but while he waits he weighs on the locker room half as much. If he isn't traded ${before ? `by the deadline (${fmtDate(league.season, league.tradeDeadlineDay)})` : 'by next opening night'}, his mood drops, he goes public, and he won't take your word again this season.`,
      button: 'Promise a trade',
    },
    {
      choice: 'patience' as const,
      title: 'Ask for patience',
      body: `${asked ? 'He puts the request on hold' : 'He holds off'} for ${PATIENCE_GAMES} games if he agrees${asked ? ", then drops it if he's happier by then or asks again" : ''}. If he says no, he's angrier for being asked.`,
      foot: `About ${Math.round(odds.chance * 100)}% he agrees${odds.reasons.length ? `: ${odds.reasons.map((r) => `${r.text} (${r.up ? '+' : '−'})`).join(', ')}` : ''}.`,
      button: 'Ask him',
    },
  ];
  // only a player who asked out can be promised a trade
  return list.filter((o) => o.choice !== 'trade' || asked);
}

export function MeetingPanel({ league, p, onDone }: { league: League; p: Player; onDone?: () => void }) {
  const live = liveInProgress(league) ? 'Finish your live game first.' : null;
  const blocked = live ?? meetBlockedReason(league, p);
  const gripes = complaints(p);
  const meet = (choice: MeetChoice) => {
    let r: ReturnType<typeof meetPlayer> = { ok: false, text: '' };
    useStore.getState().mutate((l) => void (r = meetPlayer(l, p.pid, choice)));
    useStore.getState().toast(r.text, r.ok && r.agreed !== false ? 'good' : r.ok ? 'neutral' : 'bad');
    if (r.ok) onDone?.();
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="small dim2">
        {p.mood.tradeRequest ? `${p.lastName} has asked for a trade.` : p.promise?.request ? `${p.lastName} has put his trade request on hold.` : `${p.lastName} is unhappy.`}{' '}
        {gripes.length ? `${gripes.join('. ')}.` : ''}
        {p.mood.expectedMin > 0 ? ` He expects about ${p.mood.expectedMin} minutes a night.` : ''}
      </div>
      {p.promise ? (
        <Callout icon={<Clock size={18} className="dim" />}>{promiseStatus(league, p)}</Callout>
      ) : blocked ? (
        <Callout tone="warn">{blocked}</Callout>
      ) : (
        options(league, p).map((o) => {
          const Icon = ICON[o.choice];
          return (
            <section key={o.choice} className="card tight">
              <div className="row" style={{ gap: 8 }}>
                <Icon size={16} className="dim" aria-hidden style={{ flex: 'none' }} />
                <h3 className="grow" style={{ fontSize: 14 }}>
                  {o.title}
                </h3>
              </div>
              <div className="small dim2" style={{ marginTop: 6 }}>
                {o.body}
              </div>
              {o.foot && (
                <div className="tiny dim" style={{ marginTop: 6 }}>
                  {o.foot}
                  {o.choice === 'role' && (
                    <>
                      {' '}
                      <Link to="/rotation" className="bold" style={{ color: 'var(--accent-text)' }}>
                        Rotation
                      </Link>
                    </>
                  )}
                </div>
              )}
              <button className="btn sm block" style={{ marginTop: 8 }} onClick={() => meet(o.choice)}>
                {o.button}
              </button>
            </section>
          );
        })
      )}
      <div className="tiny dim">One meeting every {MEET_DAYS} days, and none while a promise to him is open.</div>
    </div>
  );
}
