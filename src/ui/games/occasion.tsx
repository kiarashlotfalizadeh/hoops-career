// Game day as an occasion, the pieces every screen around a game shares: a team's form guide (its
// last five as W/L pills), a game's billing as a line ("Rivalry · An old division rivalry; 1-0 this
// season"), and whether a result is being shown for the first time (its score counts up once).
import { useEffect, useState } from 'react';
import type { League, ScheduledGame } from '../../core/types';
import { billingsFor, formGuide, type Billing } from '../../core/analysis/gameStory';
import { useLeagueMemo } from '../../state/store';
import '../components/gameday.css';

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

/** A team's form guide this season: its last five. */
export function TeamForm({ league, tid, n = 5, page }: { league: League; tid: number; n?: number; page?: boolean }) {
  const results = formGuide(league, tid, n);
  return <FormPills results={results} label={league.teams[tid].abbrev} page={page} />;
}

/** The billing of the user's game `g`, biggest first (empty for an ordinary night): once per league change. */
export function useBillings(league: League, g: ScheduledGame | undefined): Billing[] {
  return useLeagueMemo(() => (g ? billingsFor(league, g) : []), [league, g]);
}

/**
 * The billing as a broadcast opens with it: "Rivalry night at Madison Square Garden", "Game 7",
 * "Christmas Day in Boston". `at`: where ("at Madison Square Garden").
 */
export function billingTitle(b: Billing, at?: string): string {
  const night: Record<string, string> = { Rivalry: 'Rivalry night', 'Revenge game': 'Revenge night', 'Streak on the line': 'A streak on the line', Showdown: 'Showdown' };
  const t = night[b.tag] ?? b.tag;
  return at ? `${t} ${at}` : t;
}

/** The billing's line on a slab: the biggest night first, its reason after it, and the rest as tags. */
export function BillingLine({ billings, className = '' }: { billings: Billing[]; className?: string }) {
  if (!billings.length) return null;
  const [top] = billings;
  return (
    <div className={`gd-bill w${top.weight} ${className}`}>
      <span className="gd-bill-tag">{top.tag}</span>
      <span className="gd-bill-line">{top.line}</span>
    </div>
  );
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
