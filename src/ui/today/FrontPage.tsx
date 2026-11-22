// Today's pieces under the queue: his season as one compact strip of figures (the postseason odds,
// the last five, the owner's pulse, the Cup while it's on) and the way back to "While you were
// away". The numbers behind each are one tap down (the standings, Office → Owner).
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeagueMemo, useStore } from '../../state/store';
import { confStandings } from '../../core/league/standings';
import { goalChance, goalWord } from '../../core/league/ownerGoals';
import { Section } from '../components/ui';
import { cupTables } from '../../core/league/cup';
import { TrendMark, usePulse } from '../office/Pulse';
import { useForecast } from '../useForecast';
import { lastResults, runOf, scoreText } from './front';
import { digestLine } from './digest';
import { useChanged } from '../motion';
import '../league/legacy.css';

const MOOD_WORD = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** A cell's word or figure: when a sim changes it, the new one ticks in. */
function CellValue({ v, className = '' }: { v: string; className?: string }) {
  const c = useChanged(v);
  return (
    <span key={c.key} className={`td-cell-v ${className} ${c.changed ? 'td-tick' : ''}`}>
      {v}
    </span>
  );
}

/**
 * His season in one strip, each cell opening where it lives in full: his chance at the postseason goal
 * in a word (the standings), the last five results (the schedule), the owner's and the fans' mood (Office →
 * Owner). Where he stands and his record are on the top bar.
 */
export function YourSeason({ league }: { league: League }) {
  const me = league.userTid;
  const conf = league.teams[me].conf;
  const results = useLeagueMemo(() => lastResults(league, 5), [league]);
  const row = useLeagueMemo(() => (league.phase === 'regular' ? confStandings(league, conf).find((r) => r.tid === me) : undefined), [league, conf, me]);
  const fc = useForecast(league);
  const odds = fc?.teams[me];
  const chance = odds ? goalChance(league, odds) : null;
  const pulse = usePulse(league);
  const cup = useCupCell(league);
  const played = !!row && row.won + row.lost > 0;
  const run = runOf(results);
  return (
    <Section title="Your season">
      <div className="td-strip">
        {played && odds && chance && (
          // (the chance at the owner's postseason goal while he has one, named by it: "Play-in: In reach")
          <Link to="/league" className="td-cell" aria-label={odds.out ? 'Out of the postseason. Standings' : `${chance.label}: ${goalWord(chance.p, chance.sure)}. Standings`}>
            <span className="td-cell-k">{chance.label}</span>
            <CellValue v={odds.out ? 'Out' : goalWord(chance.p, chance.sure)} className={`td-word ${odds.out ? 'bad' : ''}`} />
          </Link>
        )}
        {results.length > 0 && (
          <Link
            to="/games"
            className="td-cell"
            aria-label={`Last ${results.length}, oldest first: ${[...results]
              .reverse()
              .map((r) => `${r.won ? 'won' : 'lost'} ${scoreText(r)} ${r.home ? 'versus' : 'at'} ${league.teams[r.opp].abbrev}`)
              .join(', ')}${run && run.n >= 2 ? `. ${run.won ? 'Won' : 'Lost'} ${run.n} straight` : ''}. Schedule`}
          >
            <span className="td-cell-k">Last {results.length}</span>
            <span className="td-cell-v td-form" aria-hidden="true">
              {[...results].reverse().map((r) => (
                <span key={r.gid} className={r.won ? 'w' : 'l'}>
                  {r.won ? 'W' : 'L'}
                </span>
              ))}
            </span>
          </Link>
        )}
        {!league.fired && (
          <>
            <Link to="/office/owner" className="td-cell" aria-label={`Owner: ${pulse.owner.word}. Owner`}>
              <span className="td-cell-k">
                Owner <TrendMark trend={pulse.owner.trend} />
              </span>
              <CellValue v={MOOD_WORD(pulse.owner.word)} className={`td-word tone-${pulse.owner.tone}`} />
            </Link>
            {/* while the Cup runs, its cell takes the fans' place (they're on Office → Owner) */}
            {cup ? (
              <Link to="/league/cup" className="td-cell" aria-label={`${cup.label}. The Cup`}>
                <span className="td-cell-k">Cup</span>
                <CellValue v={cup.v} />
              </Link>
            ) : (
              <Link to="/office/owner" className="td-cell" aria-label={`The fans are ${pulse.fans.word}. Owner`}>
                <span className="td-cell-k">
                  Fans <TrendMark trend={pulse.fans.trend} />
                </span>
                <CellValue v={MOOD_WORD(pulse.fans.word)} className={`td-word tone-${pulse.fans.tone}`} />
              </Link>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

/** The way back to the latest "While you were away", until the next sim: a row in Today's More. */
export function DigestRow() {
  const digest = useStore((s) => s.digest);
  const open = useStore((s) => s.showDigest);
  if (!digest) return null;
  return (
    <button type="button" className="td-mrow" aria-haspopup="dialog" onClick={() => open(true)}>
      <span className="grow">
        <span className="td-mrow-k">While you were away</span>
        <span className="td-mrow-m">
          {digest.span} · {digestLine(digest)}
        </span>
      </span>
      <ChevronRight size={18} className="dim" aria-hidden="true" />
    </button>
  );
}

/** The In-Season Cup as a cell of the season's strip while it runs: his group record and place, then his knockout round. */
export function useCupCell(league: League): { v: string; label: string } | null {
  return useLeagueMemo(() => {
    const cup = league.cup;
    const me = league.userTid;
    if (!cup || cup.season !== league.season || cup.champion !== undefined || league.phase !== 'regular') return null;
    if (cup.seeds) {
      const alive = cup.bracket.filter((t) => t.high === me || t.low === me);
      const live = alive.find((t) => t.winner === undefined);
      if (!live) return null;
      const round = live.round === 'final' ? 'Final' : live.round === 'sf' ? 'Semis' : 'QF';
      return { v: round, label: `In-Season Cup: in the ${live.round === 'final' ? 'final' : live.round === 'sf' ? 'semifinals' : 'quarterfinals'}` };
    }
    const t = cupTables(league).find((x) => x.group.tids.includes(me));
    const row = t?.rows.find((r) => r.tid === me);
    if (!t || !row) return null;
    return { v: `${row.won}-${row.lost}`, label: `In-Season Cup group ${t.group.id}: ${row.won}-${row.lost}, ${row.rank} of ${t.rows.length}` };
  }, [league]);
}
