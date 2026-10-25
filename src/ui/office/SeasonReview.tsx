// The season in review (Office → Career, ?review=<season>): read like a ceremony when the Finals end.
// The season's record and how it ended on a slab, the owner's verdict with each goal's grade (his
// review, owner.ts), the season against what he asked and what the press predicted, its best win,
// best player and breakout, the records and honors (its milestones one tap away), the owner's and the
// fans' pulse through it (one tap down) and what next season should bring. Built once (legacyReview.ts) and kept, so an old
// season reads the same. The sections come in one after another, quickly; reduced motion shows them.
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Award, Crown, Flame, Medal, Star, Trophy } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { fmtDate } from '../../core/league/helpers';
import { legacyOf } from '../../core/league/legacy';
import { endText, gradeWord, vsPress, type SeasonReview } from '../../core/league/legacyReview';
import { ownerWord } from '../../core/league/legacyPulse';
import { resultText } from '../../core/league/ownerGoals';
import { ordinal, plural } from '../../core/format';
import { Avatar, More, PageHeader, Section, Statline } from '../components/ui';
import { slabVars } from '../teamColors';
import { CenterBar, fmtGrade } from './common';
import { PulseChart } from './Pulse';
import './legacy.css';

const gradeTone = (x: number) => (x >= 0.1 ? 'good' : x <= -0.1 ? 'bad' : 'warn');

/** The whole review, or a line saying there's none for that season. */
export function SeasonReviewView({ league, season }: { league: League; season: number }) {
  const r = legacyOf(league).reviews.find((x) => x.season === season);
  if (!r)
    return (
      <main className="page fo-page">
        <PageHeader title={`${seasonLabel(season)} review`} back backTo="/office/career" />
        <div className="card empty">No review was kept for that season: reviews start with the seasons played in this version.</div>
      </main>
    );
  const t = league.teams[r.tid];
  const verdict = league.ownerReviews?.find((x) => x.season === r.season && x.tid === r.tid);
  const milestones = legacyOf(league).milestones.filter((m) => m.season === r.season);
  let i = 0;
  const step = () => ({ '--fo-rv-i': i++ }) as CSSProperties;
  return (
    <main className="page fo-page fo-review">
      <PageHeader title={`${seasonLabel(r.season)} review`} sub={`${t.region} ${t.name}`} back backTo="/office/career" />

      <section className="slab fo-rv-slab fo-rv-in" style={{ ...slabVars(t.colors), ...step() } as CSSProperties} aria-label="The season">
        <span className="over">
          {seasonLabel(r.season)} · {t.name}
        </span>
        <h2 className="fo-rv-head">{r.fired ? 'Fired' : endText(r)}</h2>
        {/* the poster's figure: the season's record, as big as it fits */}
        <span className="fo-rv-rec-v num">
          {r.won}-{r.lost}
        </span>
        {r.round === 5 && (
          <div className="fo-rv-crown">
            <Crown size={18} aria-hidden="true" /> Champions
          </div>
        )}
        <Statline
          items={[
            { k: r.conf === 'E' ? 'East' : 'West', v: r.confRank ? ordinal(r.confRank) : '—', s: r.seed ? `${ordinal(r.seed)} seed` : 'no seed' },
            ...(verdict ? [{ k: 'Owner grade', v: fmtGrade(verdict.grade), s: gradeWord(verdict.grade) }] : []),
          ]}
        />
      </section>

      {verdict && (
        <Section title="The owner's verdict" right={<span className={`fo-rv-grade ${gradeTone(verdict.grade)}`}>{gradeWord(verdict.grade)}</span>}>
          <div className="card flush list fo-rv-in" style={step()}>
            {verdict.goals.length ? (
              verdict.goals.map((g) => (
                <div key={g.kind} className="fo-goal">
                  <div className="fo-goal-h">
                    <span className="bold grow">{g.title}</span>
                    <span className={`fo-goal-v num ${gradeTone(g.grade)}`}>{fmtGrade(g.grade)}</span>
                  </div>
                  <CenterBar value={g.grade} />
                  <div className="tiny dim">
                    {capitalize(resultText(g, g.result))} · weight {Math.round(g.weight * 100)}%
                  </div>
                </div>
              ))
            ) : (
              <div className="fo-goal tiny dim">Graded on wins, the playoffs and profit (a season from before his goals).</div>
            )}
            {/* the season against his ask and the press's prediction, under his grades */}
            <ExpectationRows r={r} />
          </div>
          <div className="tiny dim">
            {verdict.fired ? 'He fired you after this review. ' : ''}Season grade {fmtGrade(verdict.grade)}, standing {fmtGrade(verdict.total)} after it (−100 to +100; 0 is his
            goals met exactly).
          </div>
          {r.pulse && r.pulse.length >= 2 && (
            <More label="Owner and fans through the season">
              <div className="card fo-rv-pulse">
                <PulseChart owner={r.pulse.map((p) => p[1])} fans={r.pulse.map((p) => p[2])} labels={r.pulse.map((p) => fmtDate(r.season, p[0]))} />
                <div className="tiny dim">
                  <span className="fo-rv-key owner" /> The owner{r.owner !== undefined ? `: ${ownerWord(r.owner).word} at the end (${r.owner})` : ''} ·{' '}
                  <span className="fo-rv-key fans" /> The fans
                  {r.fans !== undefined ? ` (${r.fans})` : ''} · out of 100
                </div>
              </div>
            </More>
          )}
        </Section>
      )}

      {!verdict && <Expectations r={r} style={step()} />}

      {(r.best || r.star || r.breakout) && (
        <Section title="The season's best">
          <div className="card flush list fo-rv-in" style={step()}>
            {r.best && (
              <Row icon={<Flame size={18} aria-hidden="true" />} k="Best win" to={`/game/${r.best.gid}`} kept={league.games.some((g) => g.gid === r.best!.gid)}>
                <span className="lr-name">{r.best.line}</span>
                <span className="lr-meta">
                  {fmtDate(r.best.season, r.best.day)}
                  {r.best.p !== undefined ? ` · ${r.best.p}% to win at tip-off` : ''}
                </span>
              </Row>
            )}
            {r.star && (
              <Row icon={<PlayerMark league={league} pid={r.star.pid} tid={r.tid} />} k="Best player" to={`/player/${r.star.pid}`} kept={!!league.players[r.star.pid]}>
                <span className="lr-name">{r.star.name}</span>
                <span className="lr-meta num">{r.star.line}</span>
              </Row>
            )}
            {r.breakout && (
              <Row icon={<PlayerMark league={league} pid={r.breakout.pid} tid={r.tid} />} k="Breakout" to={`/player/${r.breakout.pid}`} kept={!!league.players[r.breakout.pid]}>
                <span className="lr-name">
                  {r.breakout.name}{' '}
                  <span className="num good">
                    OVR {r.breakout.from} → {r.breakout.to}
                  </span>
                </span>
                <span className="lr-meta num">{r.breakout.line}</span>
              </Row>
            )}
          </div>
        </Section>
      )}

      {(r.honors.length > 0 || r.records.length > 0) && (
        <Section
          title="Honors and records"
          right={
            milestones.length > 0 ? (
              <Link to="/office/career?tab=milestones" className="card-link">
                {plural(milestones.length, 'milestone')}
              </Link>
            ) : undefined
          }
        >
          <div className="card flush list fo-rv-in" style={step()}>
            {r.honors.map((h) => (
              <div key={h} className="listrow fo-rv-honor">
                <HonorIcon text={h} />
                <span className="grow">{h}</span>
              </div>
            ))}
            {r.records.map((h) => (
              <div key={h} className="listrow fo-rv-honor">
                <Star size={18} className="fo-rv-rec" aria-hidden="true" />
                <span className="grow">{h}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {r.next && (
        <Section title="Next season">
          <div className="card fo-rv-next fo-rv-in" style={step()}>
            <span className="fo-rv-next-v num">{r.next.wins}</span>
            <div className="grow">
              <div className="bold">wins is his read of this roster as it stands</div>
              <div className="tiny dim">He sets next season&apos;s goals on opening night, from the roster you open with.</div>
            </div>
          </div>
          <Link to="/office/owner" className="card-link">
            Owner
          </Link>
        </Section>
      )}
    </main>
  );
}

/** The season against the owner's ask and the press's prediction: a section of its own when there's no verdict to sit under. */
function Expectations({ r, style }: { r: SeasonReview; style: CSSProperties }) {
  if (r.ownerWins === undefined && !vsPress(r)) return null;
  return (
    <Section title="Against expectations">
      <div className="card flush list fo-rv-in" style={style}>
        <ExpectationRows r={r} />
      </div>
    </Section>
  );
}

function ExpectationRows({ r }: { r: SeasonReview }) {
  const press = vsPress(r);
  const d = r.ownerWins !== undefined ? r.won - r.ownerWins : 0;
  return (
    <>
      {r.ownerWins !== undefined && (
        <div className="listrow">
          <span className="over fo-rv-k">Owner</span>
          <span className="grow">
            Asked for {r.ownerWins} wins, got {r.won}
          </span>
          <span className={`num bold ${d >= 0 ? 'good' : 'bad'}`}>{d === 0 ? '±0' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`}</span>
        </div>
      )}
      {press && r.press && (
        <div className="listrow">
          <span className="over fo-rv-k">Press</span>
          <span className="grow fo-min0 fo-rv-col">
            Picked {r.press.wins} wins{r.press.champ ? ' and the title' : ''}
            <span className="lr-meta">{press}</span>
          </span>
          <span className={`num bold ${r.won >= r.press.wins ? 'good' : 'bad'}`}>
            {r.won === r.press.wins ? '±0' : `${r.won > r.press.wins ? '+' : '−'}${Math.abs(r.won - r.press.wins)}`}
          </span>
        </div>
      )}
    </>
  );
}

function Row({ icon, k, to, kept, children }: { icon: ReactNode; k: string; to: string; kept: boolean; children: ReactNode }) {
  const body = (
    <>
      <span className="fo-rv-icon">{icon}</span>
      <span className="grow fo-min0 fo-rv-col">
        <span className="over">{k}</span>
        {children}
      </span>
    </>
  );
  // (a game pruned from the save, or a player gone from it, has no page to open)
  return kept ? (
    <Link to={to} className="listrow fo-rv-row">
      {body}
    </Link>
  ) : (
    <div className="listrow fo-rv-row">{body}</div>
  );
}

function PlayerMark({ league, pid, tid }: { league: League; pid: number; tid: number }) {
  const p = league.players[pid];
  return p ? <Avatar p={{ ...p, tid }} /> : <Medal size={18} aria-hidden="true" />;
}

function HonorIcon({ text }: { text: string }) {
  if (/champions|Cup/.test(text)) return <Trophy size={18} className="fo-rv-gold" aria-hidden="true" />;
  if (/Coach of the/.test(text)) return <Award size={18} className="fo-rv-star" aria-hidden="true" />;
  return <Medal size={18} className="fo-rv-good" aria-hidden="true" />;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
