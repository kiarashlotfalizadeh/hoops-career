// The bottom line under the live scorebug: the night's other games, one at a time, the ones that
// matter to the user first; a game that matters going final comes up straight away. Tapping it
// opens every score (see scoreboard.ts for how each one stands at a moment of the user's game).
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { League } from '../../core/types';
import { fmtClock, periodLabel } from '../stats';
import { scoreAt, tipLabel, tipMinute, type OtherGame, type TickerScore } from './scoreboard';

/** How long each game stays on the bottom line. */
const ROTATE_MS = 4200;

/** "Q3 4:12", "Half", "End Q1", "Final/OT", "8:00 PM". */
export function statusText(league: League, o: OtherGame, s: TickerScore): string {
  if (s.state === 'pre') return tipLabel(tipMinute(league, o.res.home.tid, o.res.gid));
  if (s.state === 'break') return s.q === 2 ? 'Half' : `End ${periodLabel(s.q)}`;
  if (s.state === 'final') return s.ot ? `Final/${s.ot > 1 ? `${s.ot}OT` : 'OT'}` : 'Final';
  return `${periodLabel(s.q)} ${fmtClock(s.clock)}`;
}

export const ScoreTicker = memo(function ScoreTicker({
  league,
  games,
  elapsed,
  done,
  onOpen,
}: {
  league: League;
  games: OtherGame[];
  /** The user's game: game seconds played, as drawn. */
  elapsed: number;
  done: boolean;
  onOpen: () => void;
}) {
  const [i, setI] = useState(0);
  const states = useMemo(() => games.map((o) => scoreAt(o, elapsed, done)), [games, elapsed, done]);
  // a game that matters going final comes up next
  const finals = useRef<Set<number> | null>(null);
  useEffect(() => {
    const now = new Set(games.filter((_, k) => states[k].state === 'final').map((o) => o.res.gid));
    const was = finals.current;
    finals.current = now;
    if (!was) return;
    const k = games.findIndex((o) => o.why && now.has(o.res.gid) && !was.has(o.res.gid));
    if (k >= 0) setI(k);
  }, [games, states]);
  useEffect(() => {
    if (games.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % games.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [games.length]);
  if (!games.length) return null;
  const k = i % games.length;
  const o = games[k];
  const s = states[k];
  const [h, a] = [league.teams[o.res.home.tid], league.teams[o.res.away.tid]];
  const lead = s.state === 'pre' ? -1 : s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : -1;
  return (
    <button
      className="live-ticker"
      onClick={onOpen}
      aria-label={`Around the league: ${a.abbrev} ${s.score[1]}, ${h.abbrev} ${s.score[0]}, ${statusText(league, o, s)}. All scores`}
    >
      <span className="live-ticker-tag">{o.why ? '★' : 'NBA'}</span>
      <span key={o.res.gid} className="live-ticker-game fade-in">
        <span className={lead === 1 ? 'bold' : 'dim2'}>{a.abbrev}</span>
        {s.state !== 'pre' && <b className="num">{s.score[1]}</b>}
        <span className="dim">{s.state === 'pre' ? '@' : '·'}</span>
        <span className={lead === 0 ? 'bold' : 'dim2'}>{h.abbrev}</span>
        {s.state !== 'pre' && <b className="num">{s.score[0]}</b>}
        <span className={`live-ticker-st${s.state === 'final' ? ' final' : ''}`}>{statusText(league, o, s)}</span>
        {o.why && <span className="live-ticker-why ellipsis">{o.why}</span>}
      </span>
      <span className="live-ticker-n num">
        {k + 1}/{games.length}
      </span>
    </button>
  );
});

/** Every score of the night as it stands: the ones that matter to the user first. */
export function ScoresSheet({ league, games, elapsed, done }: { league: League; games: OtherGame[]; elapsed: number; done: boolean }) {
  const rows = games.map((o) => ({ o, s: scoreAt(o, elapsed, done) }));
  const groups = [
    { title: 'Matters to you', rows: rows.filter((r) => r.o.why) },
    { title: 'Around the league', rows: rows.filter((r) => !r.o.why) },
  ].filter((g) => g.rows.length);
  return (
    <div className="col" style={{ gap: 14 }}>
      {groups.map((g) => (
        <div key={g.title} className="col" style={{ gap: 6 }}>
          <div className="tiny dim upper bold">{g.title}</div>
          {g.rows.map(({ o, s }) => {
            const [h, a] = [league.teams[o.res.home.tid], league.teams[o.res.away.tid]];
            const lead = s.state === 'pre' ? -1 : s.score[0] > s.score[1] ? 0 : s.score[1] > s.score[0] ? 1 : -1;
            return (
              <div key={o.res.gid} className="card tight live-score-row">
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  {(
                    [
                      [a, s.score[1], lead === 1],
                      [h, s.score[0], lead === 0],
                    ] as const
                  ).map(([t, pts, ahead]) => (
                    <div key={t.tid} className="row small" style={{ gap: 8 }}>
                      <span className={`grow ${ahead ? 'bold' : 'dim2'}`}>
                        {t.region} {t.name}
                      </span>
                      <span className={`num ${ahead ? 'bold' : 'dim2'}`}>{s.state === 'pre' ? '' : pts}</span>
                    </div>
                  ))}
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 2, flex: 'none', minWidth: 74 }}>
                  <span className={`small bold ${s.state === 'final' ? '' : s.state === 'pre' ? 'dim' : 'warn'}`}>{statusText(league, o, s)}</span>
                  {o.why && <span className="tag info">{o.why}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="tiny dim">
        Games tip at the home team&apos;s local 7:00 or 7:30 and run on your game&apos;s clock, so the late ones out West are still to come when an early one ends. Final scores are
        in once your game is.
      </div>
    </div>
  );
}
