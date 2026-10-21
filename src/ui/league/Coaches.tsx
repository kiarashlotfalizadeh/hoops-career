// History → Coaches: the user's résumé, every head coach in charge now and the league's former coaches,
// each with his career record read from the coach registry (League.coaches, see coaches.ts); a tap
// opens his jobs season by season.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';
import { coachCareer, coachStatus, coyWinners, type CoachCareer, type CoachRecord, type CoachSeason, type CoachTotals, type CoachStint } from '../../core/league/coaches';
import { TeamLogo } from '../components/TeamLogo';
import { Section, Sheet, Statline } from '../components/ui';
import { OutcomeTag, PosterSlab, ordinal, seasonOutcome, teamPath, useQueryParam } from './shared';
import { plural } from '../../core/format';

interface Row {
  r: CoachRecord;
  k: CoachCareer;
  status: ReturnType<typeof coachStatus>;
}

/** ".579": a record's winning percentage the way standings print it. */
export const winPctLabel = (won: number, lost: number) => (won + lost ? (won / (won + lost)).toFixed(3).replace(/^0/, '') : '—');

/** "2026-27 – 2029-30", one season alone, or "since 2027-28" while it's still his. */
export function seasonRange(first: number, last: number, open: boolean) {
  if (open) return `since ${seasonLabel(first)}`;
  return first === last ? seasonLabel(first) : `${seasonLabel(first)} – ${seasonLabel(last)}`;
}

/** A job's span: from its first season coached (or the season it starts, before he has coached a game) to its last. */
function jobSpan(league: League, j: CoachTotals & { stint: CoachStint }) {
  const first = j.lines[0]?.season ?? j.stint.from;
  if (!j.stint.to) return first > league.season ? `from ${seasonLabel(first)}` : seasonRange(first, first, true);
  return seasonRange(first, j.lines[j.lines.length - 1]?.season ?? first, false);
}

/** A career's figures in a row: seasons, record (with its win %), playoff runs and titles. */
function CareerLine({ k }: { k: CoachCareer }) {
  // (the record gets the room a long career's needs, as a franchise's does)
  return (
    <div className="lg-frfig">
      <Statline
        items={[
          { k: 'Seasons', v: k.seasons },
          { k: 'Record', v: `${k.won}-${k.lost}`, s: winPctLabel(k.won, k.lost) },
          { k: 'Playoffs', v: k.playoffs },
          { k: 'Titles', v: k.titles, color: k.titles ? 'var(--tier-elite)' : undefined },
        ]}
      />
    </div>
  );
}

export function CoachesView({ league }: { league: League }) {
  const [open, setOpen] = useQueryParam<string>('coach', '');
  const [limit, setLimit] = useState(25);
  const rows = useLeagueMemo(() => {
    const coy = coyWinners(league);
    return (league.coaches ?? []).map((r): Row => ({ r, k: coachCareer(league, r, coy), status: coachStatus(league, r) }));
  }, [league]);
  const me = rows.find((x) => x.r.user);
  const tenure = (x: Row) => x.k.stints.find((s) => !s.stint.to)?.lines.length ?? 0;
  const active = rows.filter((x) => x.status === 'active').sort((a, b) => tenure(b) - tenure(a) || b.k.won - a.k.won || a.r.id - b.r.id);
  const lastSeason = (x: Row) => x.k.lines[x.k.lines.length - 1]?.season ?? 0;
  const former = rows.filter((x) => x.status !== 'active').sort((a, b) => lastSeason(b) - lastSeason(a) || b.k.won - a.k.won || a.r.id - b.r.id);
  const shown = rows.find((x) => String(x.r.id) === open);
  if (!rows.length) return <div className="card empty">No coaching history in this league yet.</div>;
  return (
    <>
      {me && (
        <PosterSlab
          colors={league.teams[league.userTid].colors}
          over={`Your career · ${plural(me.k.stints.length, 'job')}`}
          mark={<TeamLogo tid={league.userTid} size={44} decorative />}
          region={`${league.teams[league.userTid].region} ${league.teams[league.userTid].name}`}
          name={league.coachName}
          fig={`${me.k.won}-${me.k.lost}`}
          figLabel={`${winPctLabel(me.k.won, me.k.lost)} · ${plural(me.k.seasons, 'season')} · ${plural(me.k.playoffs, 'playoff run')} · ${plural(me.k.titles, 'title')}`}
        />
      )}
      {me && (
        <Section title="Your jobs">
          <div className="card flush">
            <div className="list lg-jobs">
              {[...me.k.stints].reverse().map((j, i) => (
                <JobRow key={i} league={league} j={j} />
              ))}
            </div>
            <button className="lg-more" onClick={() => setOpen(String(me.r.id))}>
              Season by season <ChevronRight size={15} />
            </button>
          </div>
        </Section>
      )}
      <Section title="Head coaches" right={<span className="lg-sec-meta">{active.length}</span>}>
        <div className="card flush list">
          {active.map((x) => (
            <CoachRow key={x.r.id} league={league} x={x} onOpen={() => setOpen(String(x.r.id))} />
          ))}
        </div>
      </Section>
      <Section title="Former coaches" right={<span className="lg-sec-meta">{former.length}</span>}>
        {former.length === 0 ? (
          <div className="card empty">Coaches who lose their jobs land here.</div>
        ) : (
          <>
            <div className="card flush list">
              {former.slice(0, limit).map((x) => (
                <CoachRow key={x.r.id} league={league} x={x} onOpen={() => setOpen(String(x.r.id))} />
              ))}
            </div>
            {former.length > limit && (
              <button className="btn sm ghost lg-showmore" onClick={() => setLimit(limit + 25)}>
                <ChevronDown size={15} /> Show more ({former.length - limit})
              </button>
            )}
          </>
        )}
      </Section>
      <CoachSheet league={league} x={shown} onClose={() => setOpen('')} />
    </>
  );
}

/** A coach in a list: his team (the last one, for a former coach), his tenure or span and honours, his career record. */
function CoachRow({ league, x, onOpen }: { league: League; x: Row; onOpen: () => void }) {
  const { r, k, status } = x;
  const cur = k.stints.find((s) => !s.stint.to);
  const tid = cur?.stint.tid ?? k.stints[k.stints.length - 1]?.stint.tid ?? 0;
  const team = league.teams[tid];
  const sub =
    status === 'active'
      ? cur && cur.lines.length
        ? `${plural(cur.lines.length, 'season')} with ${team.abbrev}`
        : `${team.abbrev} · from ${seasonLabel(cur?.stint.from ?? league.season)}`
      : `${k.lines.length ? seasonRange(k.lines[0].season, k.lines[k.lines.length - 1].season, false) : '—'} · ${status === 'available' ? 'available' : 'retired'}`;
  return (
    <button className={`lg-coach-row ${r.user ? 'me' : ''}`} onClick={onOpen}>
      <TeamLogo tid={tid} size={26} />
      <span className="lg-coach-t">
        <span className="nm">
          <span className="ellipsis">{r.name}</span>
          {r.user && <span className="tag">You</span>}
        </span>
        <span className="sub ellipsis">
          {sub}
          {k.titles ? ` · ${plural(k.titles, 'title')}` : ''}
          {k.coy.length ? ` · COY${k.coy.length > 1 ? ` ×${k.coy.length}` : ''}` : ''}
        </span>
      </span>
      <span className="rec">
        <span className="num">
          {k.won}-{k.lost}
        </span>
        <span className="pct num">{winPctLabel(k.won, k.lost)}</span>
      </span>
    </button>
  );
}

/** One job: the team, its span and length, its titles (or playoff runs) and the record. */
function JobRow({ league, j }: { league: League; j: CoachTotals & { stint: CoachStint } }) {
  const team = league.teams[j.stint.tid];
  const best = j.titles ? plural(j.titles, 'title') : j.playoffs ? plural(j.playoffs, 'playoff run') : '';
  return (
    <div className="lg-job">
      <TeamLogo tid={team.tid} size={24} decorative />
      <span className="lg-coach-t">
        <Link to={teamPath(team.tid)} className="nm ellipsis">
          {team.region} {team.name}
        </Link>
        <span className="sub ellipsis">
          {jobSpan(league, j)}
          {j.lines.length ? ` · ${plural(j.lines.length, 'season')}` : ''}
          {best ? ` · ${best}` : ''}
        </span>
      </span>
      <span className="num bold">{j.won + j.lost ? `${j.won}-${j.lost}` : '—'}</span>
    </div>
  );
}

/** A coach's sheet: his profile, career numbers, Coach of the Year seasons and every job season by season. */
function CoachSheet({ league, x, onClose }: { league: League; x?: Row; onClose: () => void }) {
  if (!x) return null;
  const { r, k, status } = x;
  const cur = k.stints.find((s) => !s.stint.to);
  const off = OFF_PRESETS.find((p) => p.id === r.off)?.name ?? r.off;
  const def = DEF_PRESETS.find((p) => p.id === r.def)?.name ?? r.def;
  const last = k.lines[k.lines.length - 1];
  const where = cur
    ? `Head coach of the ${league.teams[cur.stint.tid].region} ${league.teams[cur.stint.tid].name}${r.user ? ' (you)' : ''}`
    : `${status === 'available' ? 'Out of work, available to hire' : 'Retired'}${last ? `: last coached ${league.teams[last.tid].abbrev} in ${seasonLabel(last.season)}` : ''}`;
  return (
    <Sheet open onClose={onClose} title={r.name}>
      <div className="col lg-sheet">
        <div>
          <div className="lg-coach-where">{where}</div>
          <div className="lg-note">
            {off} · {def} · Development {r.dev} · Adjustments {r.tac}
          </div>
        </div>
        <div className="card lg-strip">
          <CareerLine k={k} />
        </div>
        {k.coy.length > 0 && (
          <div className="lg-coy">
            <span className="over">Coach of the Year</span>
            {k.coy.map((s) => (
              <span key={s} className="tag lg-gold">
                {seasonLabel(s)}
              </span>
            ))}
          </div>
        )}
        {[...k.stints].reverse().map((j, i) => (
          <div key={i} className="card flush">
            <JobRow league={league} j={j} />
            {[...j.lines].reverse().map((l) => (
              <SeasonLine key={l.season} league={league} l={l} />
            ))}
          </div>
        ))}
        {k.stints.every((j) => !j.lines.length) && (
          <div className="lg-note">
            <ClipboardList size={14} aria-hidden="true" /> No games coached yet.
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** A season of a job: the year, his record, a part season's games (or the seed), and how it ended when the run was his. */
function SeasonLine({ league, l }: { league: League; l: CoachSeason }) {
  const ts = league.teams[l.tid].seasons.find((s) => s.season === l.season);
  const note = l.part ? (l.won + l.lost ? `${plural(l.won + l.lost, 'game')}` : 'Playoffs only') : ts?.seed ? `${ordinal(ts.seed)} seed` : '';
  return (
    <div className="lg-season">
      <span className="yr">{seasonLabel(l.season)}</span>
      <span className="rec">
        {l.won}-{l.lost}
      </span>
      <span className="sd ellipsis">{note}</span>
      {ts && l.round !== undefined ? <OutcomeTag o={seasonOutcome(league, l.tid, ts)} /> : <span className="tag">Left</span>}
    </div>
  );
}
