import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../../state/store';
import { currentMoments, newMoments, type Moment } from '../moments';
import { TeamLogo } from './TeamLogo';
import { Avatar } from './ui';
import { slabVars } from '../teamColors';
import { haptic } from '../../native';
import './moments.css';

/** What decides whether the moments need reading again: a game, a series, an award, a move, the phase or the team. */
function momentsKey(l: NonNullable<ReturnType<typeof useStore.getState>['league']>): string {
  const won = l.playoffs.map((s) => s.winner ?? '-').join('');
  const aw = l.awards[l.awards.length - 1];
  return [l.id, l.userTid, l.season, l.phase, l.games.length, won, l.awards.length, aw?.champion, aw?.cupWinner, aw?.mvp, l.transactions?.length].join('|');
}

/**
 * Watches the open league for big moments and shows each new one full-screen, once: what's already
 * true when a league opens (or the user takes over another team) counts as seen. They wait for a sim
 * to finish and for the live game to be left, and Settings → Big moments turns them off.
 */
export function Moments() {
  const league = useStore((s) => s.league);
  const v = useStore((s) => s.v);
  const simming = useStore((s) => !!s.sim);
  const { pathname } = useLocation();
  const seen = useRef<{ who: string; keys: Set<string> } | null>(null);
  const last = useRef('');
  const [queue, setQueue] = useState<Moment[]>([]);
  useEffect(() => {
    if (!league) return;
    const key = momentsKey(league);
    if (key === last.current) return;
    last.current = key;
    const now = currentMoments(league);
    const who = `${league.id}:${league.userTid}`;
    if (seen.current?.who !== who) {
      seen.current = { who, keys: new Set(now.map((m) => m.key)) };
      setQueue([]);
      return;
    }
    const fresh = newMoments(now, seen.current.keys);
    if (!fresh.length) return;
    for (const m of fresh) seen.current.keys.add(m.key);
    if (league.settings.moments === false) return;
    // a sim through the playoffs ends on the title: that's the moment, not every series on the way
    const title = fresh.some((m) => m.kind === 'title');
    setQueue((q) => [...q, ...fresh].filter((m) => !title || m.kind !== 'series'));
  }, [league, v]);
  const showing = !simming && pathname !== '/live' && league ? queue[0] : undefined;
  if (!showing || !league) return null;
  return <MomentCard key={showing.key} m={showing} tid={league.userTid} colors={league.teams[league.userTid].colors} onDone={() => setQueue((q) => q.slice(1))} />;
}

const PIECES = 46;

function MomentCard({ m, tid, colors, onDone }: { m: Moment; tid: number; colors: [string, string, string]; onDone: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const p = useStore((s) => (m.pid !== undefined ? s.league?.players[m.pid] : undefined));
  useEffect(() => {
    haptic(m.big ? 'success' : 'tap');
    btn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      // the one control: Tab stays on it
      if (e.key === 'Tab') {
        e.preventDefault();
        btn.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m, onDone]);
  // confetti in the team's colours and the brand's, scattered the same way each time a moment shows
  const confetti = useMemo(
    () =>
      m.big
        ? Array.from({ length: PIECES }, (_, i) => {
            const r = (n: number) => (((Math.sin((i + 1) * n) * 10000) % 1) + 1) % 1;
            return {
              left: `${r(12.9898) * 100}%`,
              background: [colors[0], colors[1], '#ff7a1a', '#ffffff'][i % 4],
              animationDelay: `${(r(78.233) * 1.2).toFixed(2)}s`,
              animationDuration: `${(2.4 + r(37.719) * 1.8).toFixed(2)}s`,
              ['--drift' as string]: `${(r(4.1414) * 120 - 60).toFixed(0)}px`,
              ['--spin' as string]: `${(r(9.17) * 720 - 360).toFixed(0)}deg`,
            } as CSSProperties;
          })
        : [],
    [m.big, colors],
  );
  return (
    <div className={`moment ${m.kind}`} role="dialog" aria-modal="true" aria-labelledby="moment-title" style={slabVars(colors) as CSSProperties} onClick={onDone}>
      <div className="moment-bg" aria-hidden="true" />
      {confetti.length > 0 && (
        <div className="moment-confetti" aria-hidden="true">
          {confetti.map((s, i) => (
            <span key={i} style={s} />
          ))}
        </div>
      )}
      <div className="moment-body">
        {/* three slabs sweep in behind the mark, clear of the words under it on any screen */}
        <div className="moment-hero">
          <div className="moment-stripes" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="moment-mark">{p ? <Avatar p={p} size="lg" /> : <TeamLogo tid={tid} size={132} decorative />}</div>
        </div>
        <div className="moment-over">{m.over}</div>
        <h2 id="moment-title" className="moment-title">
          {m.title}
        </h2>
        <p className="moment-sub">{m.sub}</p>
        <button
          ref={btn}
          className="btn big moment-go"
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
