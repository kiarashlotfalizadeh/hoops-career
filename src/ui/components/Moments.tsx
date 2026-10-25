import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../state/store';
import { MUST_SEE, currentMoments, newMoments, pickMoments, type Moment } from '../moments';
import { TeamLogo } from './TeamLogo';
import { Avatar } from './ui';
import { slabVars } from '../teamColors';
import { haptic } from '../../native';
import './moments.css';

/** What decides whether the moments need reading again: a game, a series, an award, a move, the phase or the team. */
function momentsKey(l: NonNullable<ReturnType<typeof useStore.getState>['league']>): string {
  const won = l.playoffs.map((s) => s.winner ?? '-').join('');
  const aw = l.awards[l.awards.length - 1];
  return [l.id, l.userTid, l.season, l.phase, l.games.length, won, l.awards.length, aw?.champion, aw?.cupWinner, aw?.mvp, l.transactions?.length, l.nextMsgId].join('|');
}

/**
 * Watches the open league for big moments and shows each new one full-screen, once: what's already
 * true when a league opens (or the user takes over another team: all but the new job itself) counts
 * as seen. They wait for a sim to finish and for the live game to be left, and Settings → Big moments
 * turns them off (all but the ultimatum and the sack: see MUST_SEE). Of the moments that come out
 * together, only the biggest shows with the job's own (pickMoments), and a front-page story not at
 * all when the digest opens with it after a long sim; the story of a game the user has just watched
 * live is his already, and on a game report (where a quick sim lands, on the result) game stories
 * are dropped.
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
      // a new job in the same league is a moment of its own: everything else about the new team is old news
      const took = seen.current?.who.startsWith(`${league.id}:`);
      seen.current = { who, keys: new Set(now.filter((m) => !(took && m.kind === 'hired')).map((m) => m.key)) };
      setQueue([]);
      if (!took) return;
    }
    const all = newMoments(now, seen.current.keys);
    if (!all.length) return;
    for (const m of all) seen.current.keys.add(m.key);
    const fresh = league.settings.moments === false ? all.filter((m) => MUST_SEE.has(m.kind)) : all;
    if (!fresh.length) return;
    const onLive = window.location.hash.startsWith('#/live');
    // after a long sim the digest opens and leads with the stories: they don't take the screen as well
    const digest = useStore.getState().digestOpen;
    setQueue((q) => pickMoments([...q, ...fresh].filter((m) => !(onLive && m.news === 'game') && !(digest && m.kind === 'story'))));
  }, [league, v]);
  // a new digest leads with the stories queued while its sim ran: they're dropped here
  const digest = useStore((s) => s.digest);
  useEffect(() => {
    if (digest) setQueue((q) => (q.some((m) => m.kind === 'story') ? q.filter((m) => m.kind !== 'story') : q));
  }, [digest]);
  // a game's story doesn't take the screen on a game report, which opens on the result already (a
  // quick sim lands there): it's dropped
  const onReport = pathname.startsWith('/game/');
  useEffect(() => {
    if (onReport && queue.some((m) => m.news === 'game')) setQueue((q) => q.filter((m) => m.news !== 'game'));
  }, [onReport, queue]);
  const showing = !simming && pathname !== '/live' && league ? queue.find((m) => !(onReport && m.news === 'game')) : undefined;
  // the digest waits while a moment has the screen
  const up = !!showing;
  useEffect(() => {
    if (useStore.getState().momentUp !== up) useStore.setState({ momentUp: up });
  }, [up]);
  if (!showing || !league) return null;
  return (
    <MomentCard key={showing.key} m={showing} tid={league.userTid} colors={league.teams[league.userTid].colors} onDone={() => setQueue((q) => q.filter((m) => m !== showing))} />
  );
}

const PIECES = 46;

function MomentCard({ m, tid, colors, onDone }: { m: Moment; tid: number; colors: [string, string, string]; onDone: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const nav = useNavigate();
  const p = useStore((s) => (m.pid !== undefined ? s.league?.players[m.pid] : undefined));
  useEffect(() => {
    haptic(m.big ? 'success' : 'tap');
    btn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      // Tab stays on the card's buttons (Continue, and its link when there's one)
      if (e.key === 'Tab') {
        e.preventDefault();
        const all = [...(btn.current?.parentElement?.querySelectorAll('button') ?? [])];
        const at = all.indexOf(document.activeElement as HTMLButtonElement);
        (all[(at + (e.shiftKey ? all.length - 1 : 1)) % all.length] ?? btn.current)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m, onDone]);
  // confetti in the team's colours and white, scattered the same way each time a moment shows
  const confetti = useMemo(
    () =>
      m.big
        ? Array.from({ length: PIECES }, (_, i) => {
            const r = (n: number) => (((Math.sin((i + 1) * n) * 10000) % 1) + 1) % 1;
            return {
              left: `${r(12.9898) * 100}%`,
              background: [colors[0], colors[1], '#ffffff'][i % 3],
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
        <div className="moment-mark">{p ? <Avatar p={p} size="lg" /> : <TeamLogo tid={tid} size={112} decorative />}</div>
        <div className="moment-over">{m.over}</div>
        <h2 id="moment-title" className="moment-title">
          {m.title}
        </h2>
        {m.sub && <p className="moment-sub">{m.sub}</p>}
        {m.lines && m.lines.length > 0 && (
          <ul className="moment-lines">
            {m.lines.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <div className="moment-acts">
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
          {m.link && (
            <button
              className="btn big moment-read"
              onClick={(e) => {
                e.stopPropagation();
                onDone();
                nav(m.link!);
              }}
            >
              {m.linkLabel ?? 'Read the story'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
