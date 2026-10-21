// The pulse of the job in one line: how the owner and the fans feel about the team right now, and
// which way it's moving. Today shows it; Office → Owner has the whole story (PulseSection: both moods
// through the season, a point a week, and the fans in the city's words). Read from legacyPulse.ts.
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import type { League } from '../../core/types';
import { fanLine, pulseLabels, pulseNow, pulsePoints, type Mood, type Trend } from '../../core/league/legacyPulse';
import { arenaFill } from '../../core/league/legacyPulse';
import { fmtDate } from '../../core/league/helpers';
import { arenaOf } from '../../core/league/legacy';
import { useLeagueMemo } from '../../state/store';
import { Section } from '../components/ui';
import { seatOf } from './seat';
import './pulse.css';

const TREND_WORD: Record<Trend, string> = { up: 'rising', down: 'falling', flat: 'steady' };

/** Which way a mood is moving: an arrow, named for screen readers. */
export function TrendMark({ trend }: { trend: Trend }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : ArrowRight;
  return (
    <span className={`fo-trend ${trend}`} title={TREND_WORD[trend]}>
      <Icon size={14} aria-hidden="true" />
      <span className="sr-only">{TREND_WORD[trend]}</span>
    </span>
  );
}

/** The owner's and the fans' moods now, as the screens read them (the owner's from the meter Office → Owner shows). */
export function usePulse(league: League): { owner: Mood; fans: Mood } {
  const js = useLeagueMemo(() => seatOf(league), [league]);
  return useLeagueMemo(() => pulseNow(league, js.score), [league, js.score]);
}

/** Today's line: "Owner pleased ↗ · Fans buzzing →", to Office → Owner. Nothing for a fired coach. */
export function CoachPulse({ league }: { league: League }) {
  const p = usePulse(league);
  if (league.fired) return null;
  const label = `The owner is ${p.owner.word} (${TREND_WORD[p.owner.trend]}); the fans are ${p.fans.word} (${TREND_WORD[p.fans.trend]})`;
  return (
    <Link to="/office/owner" className="fo-pulse" aria-label={label}>
      <span className="fo-pulse-part">
        <span className="fo-pulse-k">Owner</span>
        <span className={`fo-pulse-v tone-${p.owner.tone}`}>{p.owner.word}</span>
        <TrendMark trend={p.owner.trend} />
      </span>
      <span className="fo-pulse-part">
        <span className="fo-pulse-k">Fans</span>
        <span className={`fo-pulse-v tone-${p.fans.tone}`}>{p.fans.word}</span>
        <TrendMark trend={p.fans.trend} />
      </span>
      <ChevronRight size={16} className="dim" aria-hidden="true" />
    </Link>
  );
}

/** Two lines over the season, 0..100 (the owner's job security and the fans' mood), the firing line marked. */
export function PulseChart({ owner, fans, labels, height = 110 }: { owner: number[]; fans: number[]; labels: string[]; height?: number }) {
  const W = 320;
  const H = height;
  const n = Math.max(owner.length, fans.length);
  if (n < 2) return null;
  const x = (i: number) => 4 + (i / (n - 1)) * (W - 8);
  const y = (v: number) => 6 + (1 - v / 100) * (H - 12);
  const path = (pts: number[]) => pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const desc = `The owner from ${owner[0]} to ${owner[owner.length - 1]}; the fans from ${fans[0]} to ${fans[fans.length - 1]} (out of 100)`;
  return (
    <div className="fo-pulse-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} role="img" aria-label={desc}>
        {/* the firing line (25) and goals met exactly (50) */}
        <line x1={0} x2={W} y1={y(50)} y2={y(50)} stroke="var(--line-2)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={y(25)} y2={y(25)} stroke="color-mix(in srgb, var(--bad) 55%, transparent)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        <path d={path(fans)} fill="none" stroke="var(--tier-good)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.9} />
        <path d={path(owner)} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="fo-pulse-axis tiny dim">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

/**
 * Office → Owner's pulse: the owner's mood and the fans', each with its direction, both through the
 * season, and the fans in a line about the city and the arena with how full it has been.
 */
export function PulseSection({ league }: { league: League }) {
  const p = usePulse(league);
  const pts = useLeagueMemo(() => pulsePoints(league), [league]);
  const line = useLeagueMemo(() => fanLine(league, league.userTid, p.fans.score), [league, p.fans.score]);
  const fill = useLeagueMemo(() => arenaFill(league, league.userTid), [league]);
  if (league.fired) return null;
  const arena = arenaOf(league, league.userTid);
  return (
    <Section title="Pulse" right={<span className="tiny dim">A point a week</span>}>
      <div className="card fo-pulse-card">
        <div className="fo-pulse-moods">
          <MoodFig league={league} k="Owner" m={p.owner} cls="owner" />
          <MoodFig league={league} k="Fans" m={p.fans} cls="fans" />
        </div>
        {pts.length >= 2 && (
          <PulseChart owner={[...pts.map((x) => x[1]).slice(0, -1), p.owner.score]} fans={[...pts.map((x) => x[2]).slice(0, -1), p.fans.score]} labels={pulseLabels(league, pts)} />
        )}
        <p className="fo-pulse-line">
          {line}.
          {fill !== null && (
            <span className="dim">
              {' '}
              {arena} has been {Math.round(fill * 100)}% full this season.
            </span>
          )}
        </p>
      </div>
    </Section>
  );
}

function MoodFig({ league, k, m, cls }: { league: League; k: string; m: Mood; cls: string }) {
  return (
    <div className={`fo-pulse-fig ${cls}`}>
      <span className="over">
        <i aria-hidden="true" /> {k}
      </span>
      <span className="fo-pulse-word">
        <span className={`tone-${m.tone}`}>{m.word}</span> <TrendMark trend={m.trend} />
      </span>
      <span className="tiny dim num">
        {m.score} of 100{m.delta && m.since !== undefined ? ` · ${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)} since ${fmtDate(league.season, m.since)}` : ''}
      </span>
    </div>
  );
}
