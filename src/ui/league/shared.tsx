// Shared helpers for the league hub, team pages, history and inbox screens.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import type { DraftPick, GameResult, League, Player, PlayerStats, Team, TeamSeason } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { curTeamSeason, seasonTotals } from '../../core/league/helpers';
import { draftStandings } from '../../core/league/draft';
import { RATED_SEASONS } from '../../core/constants';
import { Fit, Segmented, Sheet, keep, scrollBehavior } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { slabVars } from '../teamColors';
import { HONOR_AWARDS } from '../../core/league/media/honors';
import './league.css';

/** A string state value persisted in the URL query (replace, so tabs don't pile up history). */
export function useQueryParam<T extends string>(key: string, def: T, allowed?: readonly T[], keepDefault = false): [T, (v: T) => void] {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get(key);
  const value = (raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? raw : def) as T;
  const set = useCallback(
    (v: T) => {
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          if (v === def && !keepDefault) n.delete(key);
          else n.set(key, v);
          return n;
        },
        { replace: true },
      );
    },
    [key, def, keepDefault, setSp],
  );
  return [value, set];
}

/** Several query values in one step (two setters in a row would each start from the same URL); null removes one. */
export function useSetParams() {
  const [, setSp] = useSearchParams();
  return useCallback(
    (vals: Record<string, string | null>) =>
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(vals)) {
            if (v === null) n.delete(k);
            else n.set(k, v);
          }
          return n;
        },
        { replace: true },
      ),
    [setSp],
  );
}

/**
 * A screen's own sections: underlined page tabs that stick under the top bar and scroll sideways,
 * keeping the active one in view. When they run past an edge, that edge fades and carries a chevron
 * that pages the row along (a swipe does the same; keyboard users move with the arrow keys).
 */
export function TabBar<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // fade hints on whichever edge has more tabs to scroll to
  useEffect(() => {
    const wrap = ref.current;
    const seg = wrap?.querySelector<HTMLElement>('.seg');
    if (!wrap || !seg) return;
    const update = () => {
      wrap.classList.toggle('fl', seg.scrollLeft > 4);
      wrap.classList.toggle('fr', seg.scrollLeft + seg.clientWidth < seg.scrollWidth - 4);
    };
    update();
    seg.addEventListener('scroll', update, { passive: true });
    // the tabs' widths settle once the web font is in, and a tab can come or go (the Cup)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(seg);
    if (seg.firstElementChild) ro?.observe(seg.firstElementChild);
    window.addEventListener('resize', update);
    return () => {
      seg.removeEventListener('scroll', update);
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [options.length]);
  const page = (dir: 1 | -1) => {
    const seg = ref.current?.querySelector<HTMLElement>('.seg');
    seg?.scrollBy({ left: dir * seg.clientWidth * 0.6, behavior: scrollBehavior() });
  };
  return (
    <div className="lg-tabs" ref={ref}>
      <Segmented value={value} options={options} onChange={onChange} label={label} tabs />
      {/* pointer-only: the tabs themselves are reachable by keyboard */}
      <button type="button" className="lg-tabs-more l" tabIndex={-1} aria-hidden="true" onClick={() => page(-1)}>
        <ChevronLeft size={16} />
      </button>
      <button type="button" className="lg-tabs-more r" tabIndex={-1} aria-hidden="true" onClick={() => page(1)}>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function useGamesByGid(league: League): Map<number, GameResult> {
  return useLeagueMemo(() => {
    const m = new Map<number, GameResult>();
    for (const g of league.games) m.set(g.gid, g);
    return m;
  }, [league]);
}

export { ordinal } from '../stats';

export const confName = (c: 'E' | 'W' | 'F') => (c === 'E' ? 'East' : c === 'W' ? 'West' : 'Finals');

/**
 * The two conferences, the one a phone shows first: the other stays in the page, hidden there (a
 * tablet puts them side by side, East on the left, with CSS order).
 */
export const confOrder = (first: 'E' | 'W'): ('E' | 'W')[] => (first === 'E' ? ['E', 'W'] : ['W', 'E']);

export const shortName = (p: Pick<Player, 'firstName' | 'lastName'>) => (p.firstName ? `${p.firstName[0]}. ${p.lastName}` : p.lastName);

/** Team id of a stats row, or null for multi-team/unknown rows from imported data. */
export function statTid(league: League, s: PlayerStats | null | undefined): number | null {
  if (!s) return null;
  const t = s.tid as unknown;
  return typeof t === 'number' && t >= 0 && league.teams[t] ? t : null;
}

/** Team a player played for in a season (last stats row), falling back to his current team. */
export function seasonTeam(league: League, p: Player, season: number): number | null {
  const t = statTid(league, seasonTotals(p, season, false));
  if (t !== null) return t;
  return p.tid >= 0 ? p.tid : null;
}

export function teamAbbrev(league: League, tid: number | null | undefined) {
  if (tid === null || tid === undefined) return 'TOT';
  return league.teams[tid]?.abbrev ?? '—';
}

/**
 * All seasons with any player stats, newest first, plus the current season. Of the real seasons
 * before the league, the ones it has for everyone (RATED_SEASONS): the earlier ones on record are
 * only the careers of the players it began with, no league to rank. `post`: a real season with
 * playoff lines (a seed from the game files has them; one from before, only regular seasons).
 */
export function statSeasons(league: League): { season: number; real: boolean; post?: true }[] {
  const real = new Map<number, boolean>();
  const post = new Set<number>();
  real.set(league.season, false);
  for (const p of Object.values(league.players)) {
    for (const s of p.stats) {
      if (s.real && s.season < league.startSeason - RATED_SEASONS) continue;
      if (s.real && s.playoffs) post.add(s.season);
      const prev = real.get(s.season);
      if (prev === undefined) real.set(s.season, !!s.real);
      else if (s.real && !prev) real.set(s.season, true);
    }
  }
  return [...real.entries()].map(([season, r]) => ({ season, real: r, ...(r && post.has(season) ? { post: true as const } : {}) })).sort((a, b) => b.season - a.season);
}

export interface Outcome {
  label: string;
  short: string;
  tone?: 'good' | 'bad' | 'warn' | 'info';
  gold?: boolean;
}

const ROUND_FULL = ['Play-In', 'First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
const ROUND_SHORT = ['Play-In', '1st Round', '2nd Round', 'Conf. Finals', 'Finals'];

/** A playoff round's name (1-4; 0 is the play-in), in full or short for tight spots. Core's seriesLabel adds the conference ("East Semifinals"). */
export const roundName = (round: number, short = false) => (short ? ROUND_SHORT : ROUND_FULL)[round] ?? 'Playoffs';

/** Human label for how a team season ended (or where it stands now). */
export function seasonOutcome(league: League, tid: number, ts: TeamSeason): Outcome {
  const r = ts.playoffRound;
  if (ts.season === league.season) {
    if (league.phase === 'preseason' || league.phase === 'regular') return { label: 'In progress', short: 'In progress' };
    if (r === 5) return { label: 'Champion', short: 'Champion', tone: 'good', gold: true };
    // still in it: in a series, or through to a round that isn't drawn until the other series end
    const out = league.playoffs.some((s) => s.winner !== undefined && s.winner !== tid && (s.high === tid || s.low === tid));
    if (league.phase === 'playoffs' && r >= 1 && !out) return { label: `Playing in the ${roundName(r)}`, short: `In ${roundName(r, true)}`, tone: 'info' };
    if (league.phase === 'playin') {
      if (r >= 1) return { label: 'Qualified for the playoffs', short: 'Qualified', tone: 'good' };
      if (r === 0) return { label: 'In the play-in', short: 'Play-In', tone: 'info' };
    }
  }
  if (r === 5) return { label: 'Won the championship', short: 'Champion', tone: 'good', gold: true };
  if (r >= 1 && r <= 4) return { label: `Lost in the ${roundName(r)}`, short: `Lost ${roundName(r, true)}`, tone: r === 4 ? 'good' : 'info' };
  // a play-in loser's round drops to -1: the play-in flag tells it apart from a lottery team
  if (r === 0 || ts.playIn) return { label: 'Lost in the play-in', short: 'Lost Play-In', tone: 'warn' };
  return { label: 'Missed the playoffs', short: 'Missed' };
}

export function OutcomeTag({ o }: { o: Outcome }) {
  return (
    <span className={`tag ${o.tone ?? ''} ${o.gold ? 'lg-gold' : ''}`} title={o.label}>
      {o.short}
    </span>
  );
}

/** AI front-office strategies: one label and colour everywhere they appear (team pages, trades, settings). */
export const STRATEGY_META: Record<Team['strategy'], { label: string; tone: 'good' | 'warn' | 'info'; help: string }> = {
  contend: { label: 'Contending', tone: 'good', help: 'Wants proven players who help now. Discounts draft picks.' },
  retool: { label: 'Retooling', tone: 'warn', help: 'Values players and picks at face value.' },
  rebuild: { label: 'Rebuilding', tone: 'info', help: 'Pays extra for young players and draft picks, marks down veterans 29+.' },
};

export function StrategyTag({ team }: { team: Team }) {
  const m = STRATEGY_META[team.strategy];
  return <span className={`tag ${m.tone}`}>{m.label}</span>;
}

/** Overall number of a draft slot: the second round continues from 31. */
export const overallPick = (league: League, round: number, pick: number) => (round - 1) * league.teams.length + pick;

/** The note under projected picks (team pages and the Draft screen). */
export const PROJECTION_NOTE = 'Projected slots follow the current standings, worst record first, until the lottery reshuffles the top 14.';

/**
 * Where this season's picks would land if the season ended today, until the lottery sets the
 * order: the lottery's own pre-lottery order (worst record first, ties drawn as it draws them),
 * playoff teams after the rest in the first round. Undefined before games are played, for a pick
 * that has its slot, and for later drafts.
 */
export function pickProjection(league: League): (d: DraftPick) => number | undefined {
  const played = league.teams.some((t) => curTeamSeason(league, t.tid).won + curTeamSeason(league, t.tid).lost > 0);
  const recs = draftStandings(league);
  const order = { 1: [...recs.filter((r) => !r.playoff), ...recs.filter((r) => r.playoff)], 2: draftStandings(league, 2) };
  return (d) => (!played || d.pick || d.season !== league.season ? undefined : overallPick(league, d.round, order[d.round].findIndex((r) => r.tid === d.originalTid) + 1));
}

/**
 * A saved link in today's form: the League hub's sections have paths (/league/awards), so a link
 * from before (/league?tab=awards&aseason=2027) moves its section into the path.
 */
export function normalizeLink(link: string): string {
  const m = /^\/league\/?\?(.*)$/.exec(link);
  const sp = m ? new URLSearchParams(m[1]) : null;
  const tab = sp?.get('tab');
  if (!sp || !tab) return link;
  sp.delete('tab');
  const qs = sp.toString();
  return `/league/${tab.toLowerCase()}${qs ? `?${qs}` : ''}`;
}

/** Another team's page (the user's own redirects to the Team tab). */
export const teamPath = (tid: number) => `/teams/${tid}`;

export function streakLabel(n: number) {
  if (!n) return '—';
  return n > 0 ? `W${n}` : `L${-n}`;
}

/** Sum of a player's regular-season rows (all seasons, optionally one team). */
export function careerTotals(p: Player, tid?: number) {
  const t = { gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, seasons: new Set<number>() };
  for (const s of p.stats) {
    if (s.playoffs) continue;
    if (tid !== undefined && s.tid !== tid) continue;
    t.gp += s.gp;
    t.min += s.min;
    t.pts += s.pts;
    t.reb += s.orb + s.drb;
    t.ast += s.ast;
    t.stl += s.stl;
    t.blk += s.blk;
    if (s.gp > 0) t.seasons.add(s.season);
  }
  return t;
}

/** Accolade counts such as "2× MVP", ordered by prestige. */
export function accolades(p: Pick<Player, 'awards'>): { label: string; n: number; gold?: boolean }[] {
  const count = (pred: (t: string) => boolean) => p.awards.filter((a) => pred(a.type)).length;
  const out: { label: string; n: number; gold?: boolean }[] = [
    { label: 'Champion', n: count((t) => t === 'Champion'), gold: true },
    { label: 'MVP', n: count((t) => t === 'MVP'), gold: true },
    { label: 'Finals MVP', n: count((t) => t === 'Finals MVP'), gold: true },
    { label: 'DPOY', n: count((t) => t === 'Defensive Player of the Year') },
    { label: 'NBA Cup', n: count((t) => t === 'NBA Cup') },
    { label: 'Cup MVP', n: count((t) => t === 'NBA Cup MVP') },
    { label: 'All-NBA', n: count((t) => t.startsWith('All-NBA')) },
    { label: 'All-Star', n: count((t) => t === 'All-Star') },
    { label: 'All-Star MVP', n: count((t) => t === 'All-Star MVP') },
    { label: 'Three-Point Contest', n: count((t) => t === 'Three-Point Contest') },
    { label: 'Dunk Contest', n: count((t) => t === 'Slam Dunk Contest') },
    { label: 'All-Defense', n: count((t) => t.startsWith('All-Defensive')) },
    { label: 'ROY', n: count((t) => t === 'Rookie of the Year') },
    { label: '6MOY', n: count((t) => t === 'Sixth Man of the Year') },
    { label: 'MIP', n: count((t) => t === 'Most Improved Player') },
    { label: 'All-Rookie', n: count((t) => t.startsWith('All-Rookie')) },
    { label: 'Player of the Month', n: count((t) => t === 'Player of the Month') },
    { label: 'Rookie of the Month', n: count((t) => t === 'Rookie of the Month') },
    { label: 'Player of the Week', n: count((t) => t === 'Player of the Week') },
  ];
  return out.filter((x) => x.n > 0);
}

/** All-Star Saturday's contests: a token in a career's honours, never a reason on its own to remember one (see careerValue in History). */
const CONTEST_AWARDS = new Set(['Three-Point Contest', 'Slam Dunk Contest']);

export function accoladeScore(p: Player) {
  return p.awards.reduce(
    (s, a) =>
      s +
      (a.type === 'MVP'
        ? 12
        : a.type === 'Finals MVP'
          ? 6
          : a.type.startsWith('All-NBA')
            ? 4
            : a.type === 'Defensive Player of the Year'
              ? 4
              : a.type === 'All-Star'
                ? 2
                : a.type === 'Champion'
                  ? 1.5
                  : a.type === 'NBA Cup MVP'
                    ? 1
                    : a.type === 'Hall of Fame' || HONOR_AWARDS.has(a.type)
                      ? 0
                      : CONTEST_AWARDS.has(a.type)
                        ? 0.25
                        : 0.5),
    0,
  );
}

export function AccoladeChips({ p, max = 6 }: { p: Player; max?: number }) {
  const list = accolades(p).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="lg-accolades">
      {list.map((a) => (
        <span key={a.label} className={`tag ${a.gold ? 'lg-gold' : ''}`}>
          {a.n > 1 ? `${a.n}× ` : ''}
          {a.label}
        </span>
      ))}
    </div>
  );
}

/**
 * A section's poster: a mono kicker, the black expanded headline and at most one line under it, with
 * one big figure on its right when the headline is about a number. Printed on the paper: the hero of
 * a League section that isn't about one team.
 */
export function Poster({ over, head, dek, fig, children }: { over: ReactNode; head: ReactNode; dek?: ReactNode; fig?: { v: ReactNode; k: ReactNode }; children?: ReactNode }) {
  return (
    <header className={`lg-poster ${fig ? 'has-fig' : ''}`}>
      <div className="lg-poster-t">
        <p className="over">{over}</p>
        <Fit as="h2" className="lg-poster-h" min={16}>
          {typeof head === 'string' ? keep(head) : head}
        </Fit>
        {dek && <p className="lg-poster-dek">{keep(dek)}</p>}
        {children}
      </div>
      {fig && (
        <div className="lg-poster-fig">
          <span className="v">{fig.v}</span>
          <span className="k">{fig.k}</span>
        </div>
      )}
    </header>
  );
}

/**
 * A slab in a team's colours (the court's lines under it): a mono kicker with the mark on its right,
 * a name in the headline cut, then one giant figure with its label beside it. The screen's one slab.
 */
export function PosterSlab({
  colors,
  over,
  mark,
  region,
  name,
  fig,
  figLabel,
  children,
  className = '',
}: {
  colors: [string, string, string];
  over: ReactNode;
  mark?: ReactNode;
  region?: ReactNode;
  name: ReactNode;
  fig?: ReactNode;
  figLabel?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`slab lg-title ${className}`} style={slabVars(colors) as CSSProperties}>
      <div className="lg-title-top">
        <p className="over lg-title-over">{over}</p>
        {mark}
      </div>
      <div className="lg-title-id">
        {region && <div className="lg-title-region">{region}</div>}
        <Fit className="lg-title-name" min={18}>
          {typeof name === 'string' ? keep(name) : name}
        </Fit>
      </div>
      {fig !== undefined && (
        <div className="lg-title-figrow">
          <span className="lg-title-fig">{fig}</span>
          {figLabel && <span className="lg-title-figl">{figLabel}</span>}
        </div>
      )}
      {children && <div className="lg-title-sub">{children}</div>}
    </section>
  );
}

/**
 * A title won, in the winner's colours: the season's champions (Playoffs), the NBA Cup's winners
 * (NBA Cup) or a franchise's banners. The screen's one slab, at its top; `fig` is the final's score
 * or the series ("4-2"), `figLabel` what it was.
 */
export function TitleSlab({
  league,
  tid,
  over,
  fig,
  figLabel,
  children,
}: {
  league: League;
  tid: number;
  over: ReactNode;
  fig?: ReactNode;
  figLabel?: ReactNode;
  children?: ReactNode;
}) {
  const t = league.teams[tid];
  return (
    <PosterSlab colors={t.colors} over={over} mark={<TeamLogo tid={tid} size={48} decorative />} region={t.region} name={t.name} fig={fig} figLabel={figLabel}>
      {children}
    </PosterSlab>
  );
}

/**
 * A list's filters behind one button ("Filters 2": how many differ from the defaults), in a sheet:
 * the list keeps its room, and the controls are a tap away.
 */
export function FiltersButton({ count, title = 'Filters', children }: { count: number; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn sm lg-filters ${count ? 'on' : ''}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={15} aria-hidden="true" /> {title}
        {count > 0 && <span className="lg-count num">{count}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="col lg-filter-body">{children}</div>
        <button className="btn primary block lg-filter-done" onClick={() => setOpen(false)}>
          Done
        </button>
      </Sheet>
    </>
  );
}

/** A filter in the sheet: its name over its control. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lg-filter">
      <span className="over">{label}</span>
      {children}
    </div>
  );
}
