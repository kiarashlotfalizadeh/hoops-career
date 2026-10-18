// Today's slab: the next game at a glance (who, both records, when, what's at stake, who's out, and
// the way to its Matchup page), or outside the season's games a phase card (where the season stands,
// one line, and the one screen worth opening). The Continue bar carries Watch & coach and the
// phase's next step, so neither is repeated here.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League, ScheduledGame } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { liveInProgress } from '../../state/live';
import { curTeamSeason, fmtDate, standardRoster, teamPlayers } from '../../core/league/helpers';
import { outFor } from '../../core/format';
import { cupLabel } from '../../core/league/cup';
import { matchupPreview, type SidePreview } from '../../core/analysis/preview';
import { draftOrder } from '../../core/league/draft';
import { expiringPlayers } from '../../core/league/freeAgency';
import { FA_DAYS, faDayNumber } from '../../core/league/season';
import { CAP, seasonLabel } from '../../core/constants';
import { TeamLogo } from '../components/TeamLogo';
import { flowActions, stillAlive } from '../flow';
import { rosterNames } from '../stats';
import { picksText } from '../draft/common';

/** The user's next game this season (today's included), if one is on the calendar. */
export function nextGame(league: League): ScheduledGame | undefined {
  if (league.phase !== 'regular' && league.phase !== 'playin' && league.phase !== 'playoffs') return undefined;
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && g.type !== 'allstar' && (g.home === me || g.away === me))
    .sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
}

/** "Today", "Tomorrow", "Sat, Nov 2". */
const whenLabel = (league: League, day: number) =>
  day <= league.day ? 'Today' : day === league.day + 1 ? 'Tomorrow' : fmtDate(league.season, day, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * A side's players who won't play (or might not), three at most, named so teammates can't be
 * confused: "Jal. Williams out 3 games, K. Williams resting +2 more".
 */
function outText(league: League, s: SidePreview): string {
  const names = rosterNames(teamPlayers(league, s.tid));
  const name = (pid: number, fallback: string) => names(pid) || fallback;
  const all = [
    ...s.out.map((p) => `${name(p.pid, p.name)} ${outFor(p.games)}`),
    ...s.resting.map((p) => `${name(p.pid, p.name)} resting`),
    ...s.questionable.filter((p) => !p.cleared).map((p) => `${name(p.pid, p.name)} questionable`),
  ];
  return all.slice(0, 3).join(', ') + (all.length > 3 ? ` +${all.length - 3} more` : '');
}

/** `noPlan`: the staff would say there's no game plan for this opponent yet (a tag here, not a card below). */
export function NextGameSlab({ league, g, noPlan }: { league: League; g: ScheduledGame; noPlan?: boolean }) {
  const me = league.userTid;
  const opp = g.home === me ? g.away : g.home;
  // who's out and the stakes (the preview sets up a throwaway game: once per league change)
  const pv = useLeagueMemo(() => matchupPreview(league, g.gid), [league, g.gid]);
  const live = liveInProgress(league);
  const cup = cupLabel(league, g);
  const ts = curTeamSeason(league, me);
  const kind = pv?.playoff ? pv.playoff.tag : g.type === 'playin' ? 'Play-In' : g.cup && g.cup !== 'group' ? cup : `Game ${ts.won + ts.lost + 1}${cup ? ` · ${cup}` : ''}`;
  const series = pv?.playoff;
  // on the team's colours every tag is the slab's glass; what's at stake is a solid one
  const tags: { text: string; stake?: boolean; to?: string }[] = [];
  if (live?.gid === g.gid) tags.push({ text: `Live · ${live.score[0]}-${live.score[1]}` });
  if (series && series.wins + series.losses > 0)
    tags.push({
      text:
        series.wins === series.losses
          ? `Series tied ${series.wins}-${series.losses}`
          : `${league.teams[series.wins > series.losses ? me : opp].abbrev} leads ${Math.max(series.wins, series.losses)}-${Math.min(series.wins, series.losses)}`,
    });
  if (series?.elimination || pv?.playIn?.elimination) tags.push({ text: 'Elimination game', stake: true });
  else if (series?.clinch) tags.push({ text: 'A win takes the series', stake: true });
  else if (pv?.playIn) tags.push({ text: 'Winner is the 7th seed', stake: true });
  // (the missing plan is a link to the Plan tab: the one tag here with something to do)
  if (noPlan) tags.push({ text: 'No game plan yet', to: `/games/${opp}?tab=plan` });
  const outs = pv ? [pv.us, pv.them].map((s) => ({ tid: s.tid, text: outText(league, s) })).filter((x) => x.text) : [];
  return (
    <section className="slab td-slab" aria-label="Next game">
      <span className="slab-mark">
        <TeamLogo tid={me} size={180} decorative />
      </span>
      <div className="td-over">
        <span>
          {kind} · {whenLabel(league, g.day)}
        </span>
        <Link to={`/games/${opp}`} className="card-link">
          Matchup <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="td-match">
        {[g.away, g.home].map((tid, i) => {
          const r = curTeamSeason(league, tid);
          return (
            <div key={tid} className={`td-side ${i ? 'home' : ''}`}>
              <TeamLogo tid={tid} size={44} decorative />
              <span className="td-side-t">
                <span className="td-ab">{league.teams[tid].abbrev}</span>
                <span className="td-rec num">
                  {r.won}-{r.lost}
                </span>
              </span>
            </div>
          );
        })}
        <span className="td-at" aria-label={g.home === me ? 'versus' : 'at'}>
          {g.home === me ? 'vs' : '@'}
        </span>
      </div>
      {(tags.length > 0 || outs.length > 0) && (
        <div className="td-facts">
          {tags.length > 0 && (
            <div className="chips">
              {tags.map((t) =>
                t.to ? (
                  <Link key={t.text} to={t.to} className="tag td-tag-link">
                    {t.text} <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                ) : (
                  <span key={t.text} className={`tag ${t.stake ? 'td-stake' : ''}`}>
                    {t.text}
                  </span>
                ),
              )}
            </div>
          )}
          {outs.map((o) => (
            <div key={o.tid} className="td-out">
              <span className="td-out-k">{league.teams[o.tid].abbrev}</span>
              <span className="grow">{o.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** What a phase card says: the phase, one line, and the screen worth opening. */
function phaseCard(league: League): { over: string; title: string; line: string; link?: { to: string; label: string } } {
  const me = league.userTid;
  const off = `${league.season} offseason`;
  const picks = draftOrder(league).filter((d) => d.tid === me);
  // "Your picks: #4, #24, #27 and #44.", written as the Office's draft desk writes them
  const pickText = !picks.length ? 'No pick this year.' : `Your pick${picks.length > 1 ? 's' : ''}: ${picksText(league, picks)}.`;
  switch (league.phase) {
    case 'preseason': {
      const g = league.schedule.filter((x) => !x.played && x.type === 'regular' && (x.home === me || x.away === me)).sort((a, b) => a.day - b.day)[0];
      const opp = g ? (g.home === me ? g.away : g.home) : undefined;
      return {
        over: seasonLabel(league.season),
        title: 'Preseason',
        line:
          g && opp !== undefined
            ? `Opening night ${fmtDate(league.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' })}, ${g.home === me ? 'vs' : '@'} ${league.teams[opp].abbrev}.`
            : 'Opening night is set.',
        link: opp !== undefined ? { to: `/games/${opp}`, label: 'Opener' } : undefined,
      };
    }
    case 'regular':
    case 'playin':
    case 'playoffs': {
      const ts = curTeamSeason(league, me);
      const alive = league.phase === 'regular' || stillAlive(league);
      if (league.phase === 'regular')
        // (the standings are right under it)
        return { over: seasonLabel(league.season), title: 'Regular season', line: `Your season is done at ${ts.won}-${ts.lost}. The rest of the league finishes up.` };
      return {
        over: seasonLabel(league.season),
        title: league.phase === 'playin' ? 'Play-In' : 'Playoffs',
        line: !alive
          ? `Your season is over at ${ts.won}-${ts.lost}.`
          : league.phase === 'playin' && ts.playoffRound >= 1
            ? 'You are in. Your first-round opponent comes out of the play-in.'
            : 'Your next game is set once the round before it ends.',
        link: { to: '/league/playoffs', label: 'Bracket' },
      };
    }
    case 'draftLottery':
      return { over: off, title: 'Draft lottery', line: `The lottery is in. ${pickText}`, link: { to: '/office/draft', label: 'Draft board' } };
    case 'draft': {
      // (on the clock, To do says so)
      const ahead = picks.length ? draftOrder(league).findIndex((d) => d.tid === me) : -1;
      return {
        over: off,
        title: 'NBA Draft',
        line: ahead > 0 ? `${pickText} The next is ${ahead} pick${ahead === 1 ? '' : 's'} away.` : picks.length ? pickText : 'Your picks are in.',
        link: { to: '/office/draft', label: 'Draft board' },
      };
    }
    case 'resign': {
      const n = expiringPlayers(league, me).length;
      return {
        over: off,
        title: 'Re-signing',
        line: n ? `${n} contract${n === 1 ? '' : 's'} expiring.` : 'No contracts expiring.',
        link: { to: '/office/resign', label: 'Re-sign players' },
      };
    }
    case 'freeAgency': {
      const n = standardRoster(league, me).length;
      return {
        over: off,
        title: 'Free agency',
        line: `Day ${faDayNumber(league)} of ${FA_DAYS} · ${n} of ${CAP.rosterMax} roster spots filled.`,
        link: { to: '/office/free-agents', label: 'Free agents' },
      };
    }
    default:
      return { over: seasonLabel(league.season), title: '', line: '' };
  }
}

/** `linked`: screens Today already links to (the agenda's), which the card doesn't repeat. */
export function PhaseCard({ league, linked = [] }: { league: League; linked?: (string | undefined)[] }) {
  const card = phaseCard(league);
  // a fired coach's old team isn't his to run: the phase, and To do says what's next
  const c = league.fired ? { ...card, line: 'You are between jobs.', link: undefined } : card;
  // nor the screen the Continue bar opens
  const path = (to?: string) => to?.split('?')[0];
  const taken = new Set([...linked, flowActions(league).find((a) => a.primary)?.to].map(path));
  const link = c.link && !taken.has(path(c.link.to)) ? c.link : undefined;
  return (
    <section className="slab td-slab td-phase" aria-label={c.title}>
      <span className="slab-mark">
        <TeamLogo tid={league.userTid} size={180} decorative />
      </span>
      <div className="td-over">
        <span>{c.over}</span>
        {link && (
          <Link to={link.to} className="card-link">
            {link.label} <ChevronRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      <h2 className="td-phase-t">{c.title}</h2>
      <p className="td-phase-l">{c.line}</p>
    </section>
  );
}
