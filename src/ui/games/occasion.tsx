// The pieces every screen around a game shares: a team's form guide (its last five as W/L pills),
// a row that opens, a game screen's top, and whether a result is being shown for the first time (its
// score counts up once).
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import type { League, ScheduledGame } from '../../core/types';
import { useBack } from '../nav';
import '../components/gameday.css';
import { teamCity } from '../../core/league/helpers';

/**
 * A row in a group that opens on the rest (a game's After the game, the Preview's More about
 * tonight): its name and a one-line peek at what it holds.
 */
export function Fold({ title, peek, help, children }: { title: ReactNode; peek?: string; help?: ReactNode; children: ReactNode }) {
  return (
    <details className="gd-fold">
      <summary>
        <span className="grow gd-fold-t">
          <span className="lr-name">{title}</span>
          {peek && <span className="lr-meta ellipsis">{peek}</span>}
        </span>
        <ChevronDown size={16} className="gd-fold-c" aria-hidden="true" />
      </summary>
      <div className="gd-fold-b">
        {help && <div className="gd-fold-help">{help}</div>}
        {children}
      </div>
    </details>
  );
}

/**
 * The top of a game screen whose board names it (a matchup, a report): Back, the screen's name in
 * small (its h1 for screen readers too), and a link on the right.
 */
export function GameTop({ title, backTo, right }: { title: string; backTo: string; right?: ReactNode }) {
  const goBack = useBack(backTo);
  return (
    <div className="gd-top">
      <button className="iconbtn" onClick={goBack} aria-label="Back">
        <ChevronLeft size={24} />
      </button>
      <h1 className="gd-top-t grow">{title}</h1>
      {right}
    </div>
  );
}

/**
 * The last results, oldest first, as W/L pills (`label`: whose they are, for screen readers).
 * (`page`: on the page's ground rather than a slab.)
 */
export function FormPills({ results, label, page }: { results: boolean[]; label: string; page?: boolean }) {
  if (!results.length) return null;
  return (
    <span className={`gd-form${page ? ' on-page' : ''}`} role="img" aria-label={`${label}, last ${results.length}: ${results.map((w) => (w ? 'W' : 'L')).join(' ')}`}>
      {results.map((w, i) => (
        <i key={i} className={w ? 'w' : 'l'} aria-hidden="true">
          {w ? 'W' : 'L'}
        </i>
      ))}
    </span>
  );
}

/**
 * A game's headline: "Toronto in town", "At Denver",
 * "Against Boston" (a neutral floor).
 */
export function nightTitle(league: League, g: ScheduledGame, neutral: boolean): string {
  const me = league.userTid;
  const t = teamCity(league, g.home === me ? g.away : g.home);
  return neutral ? `Against ${t}` : g.home === me ? `${t} in town` : `At ${t}`;
}

const SEEN_KEY = 'hc-results-seen';

/**
 * Whether a result (`id`: the league's and the game's) is on screen for the first time on this device (the result moment: its score
 * counts up, its headline rises in), remembered for the latest few. Browser storage can be missing
 * (a private window): then every showing is a first, which only replays a short animation.
 */
export function useFirstShowing(id: string | undefined): boolean {
  // (read once, written after: React may call an initializer twice)
  const [first] = useState(() => {
    if (id === undefined) return false;
    try {
      return !(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]).includes(id);
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (id === undefined || !first) return;
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
      if (!seen.includes(id)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id].slice(-30)));
    } catch {
      // (no storage: nothing to remember)
    }
  }, [id, first]);
  return first;
}
