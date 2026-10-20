// A franchise's history, in one place for both of its doors: League → History → Teams (any team,
// the user's included) and another team's page (its History tab). Its all-time figures, its
// banners (titles and retired numbers), every season and its leaders.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { League, Player } from '../../core/types';
import { RETIRED } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { Section, Statline } from '../components/ui';
import { rosterNames } from '../stats';
import { RetiredBanners } from './RetiredBanners';
import { winPctLabel } from './Coaches';
import { OutcomeTag, careerTotals, ordinal, seasonOutcome } from './shared';
import { plural } from '../../core/format';

/** The franchise's all-time figures in this league: seasons, record, playoff runs, titles. */
export function FranchiseFigures({ league, tid }: { league: League; tid: number }) {
  // (a season not yet begun isn't one of its seasons yet)
  const seasons = league.teams[tid].seasons.filter((s) => s.season < league.season || s.won + s.lost > 0 || league.phase !== 'preseason');
  const finished = seasons.filter((s) => s.season < league.season || !['preseason', 'regular'].includes(league.phase));
  const w = seasons.reduce((a, s) => a + s.won, 0);
  const l = seasons.reduce((a, s) => a + s.lost, 0);
  const titles = seasons.filter((s) => s.playoffRound === 5).length;
  return (
    <div className="lg-frfig">
      <Statline
        items={[
          // (what they count: this league's seasons; the leaders below count real ones before it too)
          { k: 'Seasons', v: seasons.length, s: 'in this save' },
          { k: 'Record', v: `${w}-${l}`, s: w + l ? winPctLabel(w, l) : undefined },
          { k: 'Playoffs', v: finished.filter((s) => s.playoffRound >= 1).length },
          { k: 'Titles', v: titles, color: titles ? 'var(--tier-elite)' : undefined },
        ]}
      />
    </div>
  );
}

type LeaderKey = 'pts' | 'reb' | 'ast' | 'gp';
const LEADER_LABEL: Record<LeaderKey, string> = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', gp: 'Games' };

/** The franchise's banners, its seasons one line each, and its all-time leaders. */
export function FranchiseHistory({ league, tid }: { league: League; tid: number }) {
  const team = league.teams[tid];
  const seasons = [...team.seasons].sort((a, b) => b.season - a.season);
  const titles = seasons.filter((s) => s.playoffRound === 5);
  return (
    <>
      {(titles.length > 0 || (team.retired?.length ?? 0) > 0) && (
        <Section title="Banners">
          {titles.length > 0 && (
            <div className="chips">
              {titles.map((s) => (
                <span key={s.season} className="tag lg-gold lg-title-yr">
                  {seasonLabel(s.season)} champions
                </span>
              ))}
            </div>
          )}
          <RetiredBanners league={league} tid={tid} />
        </Section>
      )}
      <Section title="Season by season">
        <div className="card flush list">
          {seasons.map((s) => (
            <div key={s.season} className="lg-season">
              <span className="yr">{seasonLabel(s.season)}</span>
              <span className="rec">
                {s.won}-{s.lost}
              </span>
              <span className="sd ellipsis">{s.seed ? `${ordinal(s.seed)} seed` : ''}</span>
              {/* a season not yet begun is next, not in progress */}
              <OutcomeTag
                o={
                  s.season === league.season && league.phase === 'preseason' && s.won + s.lost === 0
                    ? { label: 'Not started yet', short: 'Up next' }
                    : seasonOutcome(league, tid, s)
                }
              />
            </div>
          ))}
        </div>
      </Section>
      <FranchiseLeaders league={league} tid={tid} />
    </>
  );
}

function FranchiseLeaders({ league, tid }: { league: League; tid: number }) {
  const [cat, setCat] = useState<LeaderKey>('pts');
  const leaders = useLeagueMemo(() => {
    const rows: { p: Player; pts: number; reb: number; ast: number; gp: number; seasons: number }[] = [];
    for (const p of Object.values(league.players)) {
      const t = careerTotals(p, tid);
      if (t.gp === 0) continue;
      rows.push({ p, pts: t.pts, reb: t.reb, ast: t.ast, gp: t.gp, seasons: t.seasons.size });
    }
    return rows;
  }, [league, tid]);
  const top = [...leaders].sort((a, b) => b[cat] - a[cat]).slice(0, 8);
  // imported seasons count with this franchise too: the figures above are this league's alone
  const real = top.some((r) => r.p.stats.some((s) => s.real && s.tid === tid && !s.playoffs));
  // teammates who share a last name read "Jal. Williams" / "Jay. Williams", as on the roster
  const name = rosterNames(
    top.map((r) => r.p),
    { initial: true },
  );
  return (
    <Section
      title="Franchise leaders"
      right={
        <select className="lg-select sm" value={cat} onChange={(e) => setCat(e.target.value as LeaderKey)} aria-label="Franchise leaders in">
          {(Object.keys(LEADER_LABEL) as LeaderKey[]).map((k) => (
            <option key={k} value={k}>
              {LEADER_LABEL[k]}
            </option>
          ))}
        </select>
      }
    >
      {top.length === 0 ? (
        <div className="card empty">No games yet.</div>
      ) : (
        <div className="card flush list">
          {top.map((r, i) => (
            <Link key={r.p.pid} to={`/player/${r.p.pid}`} className="lg-book-row">
              <span className="rk">{i + 1}</span>
              <span className="who">
                <span className="nm">{name(r.p.pid)}</span>
                <span className="sub">
                  {plural(r.seasons, 'season')} here
                  {r.p.tid === tid ? ' · active' : r.p.tid === RETIRED ? ' · retired' : ''}
                </span>
              </span>
              <span className="v num">{Math.round(r[cat]).toLocaleString()}</span>
            </Link>
          ))}
        </div>
      )}
      {real && top.length > 0 && (
        <div className="lg-note">Leaders count the real seasons before {seasonLabel(league.startSeason)} too; the figures above, this league&apos;s seasons only.</div>
      )}
    </Section>
  );
}
