// History → Coaches: the user's résumé, every head coach in charge now and the league's former coaches,
// each with his career record read from the coach registry (League.coaches, see coaches.ts); a tap
// opens his jobs season by season.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ClipboardList } from 'lucide-react';
import type { League } from '../../core/types';
import { useLeagueMemo } from '../../state/store';
import { seasonLabel } from '../../core/constants';
import { DEF_PRESETS, OFF_PRESETS } from '../../core/sim/tactics';
import { coachCareer, coachStatus, coyWinners, type CoachCareer, type CoachRecord, type CoachSeason, type CoachTotals, type CoachStint } from '../../core/league/coaches';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Empty, Kpi, Sheet } from '../components/ui';
import { OutcomeTag, SectionLabel, ordinal, seasonOutcome, useQueryParam } from './shared';

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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A career record in a tile: it stays on one line at phone width (as the Franchise view's does). */
function RecordKpi({ k }: { k: CoachTotals }) {
  const rec = `${k.won}-${k.lost}`;
  return <Kpi k="Record" v={<span style={{ fontSize: rec.length > 7 ? 15 : rec.length > 5 ? 17 : 20, whiteSpace: 'nowrap' }}>{rec}</span>} sub={winPctLabel(k.won, k.lost)} />;
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
  if (!rows.length)
    return (
      <Card>
        <Empty>No coaching history in this league yet.</Empty>
      </Card>
    );
  return (
    <>
      {me && (
        <>
          <SectionLabel right={<span className="tiny dim">{plural(me.k.stints.length, 'job')}</span>}>Your career</SectionLabel>
          <Card>
            <div className="grid4 lg-coach-kpis">
              <Kpi k="Seasons" v={me.k.seasons} />
              <RecordKpi k={me.k} />
              <Kpi k="Playoffs" v={me.k.playoffs} />
              <Kpi k="Titles" v={me.k.titles} color={me.k.titles ? 'var(--tier-elite)' : undefined} />
            </div>
            <div className="lg-team5" style={{ marginTop: 8 }}>
              {[...me.k.stints].reverse().map((j, i) => (
                <JobRow key={i} league={league} j={j} />
              ))}
            </div>
            <button className="btn sm ghost block" style={{ marginTop: 6 }} onClick={() => setOpen(String(me.r.id))}>
              Season by season
            </button>
          </Card>
        </>
      )}
      <SectionLabel right={<span className="tiny dim">{active.length}</span>}>Head coaches</SectionLabel>
      <Card className="flush lg-flat">
        {active.map((x) => (
          <CoachRow key={x.r.id} league={league} x={x} onOpen={() => setOpen(String(x.r.id))} />
        ))}
      </Card>
      <SectionLabel right={<span className="tiny dim">{former.length}</span>}>Former coaches</SectionLabel>
      {former.length === 0 ? (
        <Card>
          <Empty>Coaches let go after the playoffs land here, out of work until someone hires them (retired after five seasons without a job), with their records.</Empty>
        </Card>
      ) : (
        <>
          <Card className="flush lg-flat">
            {former.slice(0, limit).map((x) => (
              <CoachRow key={x.r.id} league={league} x={x} onOpen={() => setOpen(String(x.r.id))} />
            ))}
          </Card>
          {former.length > limit && (
            <button className="btn sm ghost" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + 25)}>
              <ChevronDown size={15} /> Show more ({former.length - limit})
            </button>
          )}
        </>
      )}
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
    <button className="lg-coach-row" onClick={onOpen}>
      <TeamLogo tid={tid} size={26} />
      <span className="col" style={{ minWidth: 0, gap: 2 }}>
        <span className="row" style={{ gap: 6, minWidth: 0 }}>
          <span className="bold ellipsis">{r.name}</span>
          {r.user && <span className="tag info">You</span>}
        </span>
        <span className="tiny dim ellipsis">
          {sub}
          {k.titles ? ` · ${plural(k.titles, 'title')}` : ''}
          {k.coy.length ? ` · COY${k.coy.length > 1 ? ` ×${k.coy.length}` : ''}` : ''}
        </span>
      </span>
      <span className="rec">
        <span className="num">
          {k.won}-{k.lost}
        </span>
        <span className="tiny dim num">{winPctLabel(k.won, k.lost)}</span>
      </span>
    </button>
  );
}

/** One job: the team, its span and length, its titles (or playoff runs) and the record. */
function JobRow({ league, j }: { league: League; j: CoachTotals & { stint: CoachStint } }) {
  const team = league.teams[j.stint.tid];
  const best = j.titles ? plural(j.titles, 'title') : j.playoffs ? plural(j.playoffs, 'playoff run') : '';
  return (
    <div className="row5" style={{ gridTemplateColumns: '24px minmax(0, 1fr) auto', minHeight: 44 }}>
      <TeamLogo tid={team.tid} size={22} decorative />
      <span className="col" style={{ minWidth: 0, gap: 1 }}>
        <Link to={`/team/${team.tid}`} className="bold ellipsis">
          {team.region} {team.name}
        </Link>
        <span className="tiny dim ellipsis">
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
      <div className="col" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 2 }}>
          <div className="small dim2">{where}</div>
          <div className="tiny dim">
            {off} · {def} · Development {r.dev} · Adjustments {r.tac}
          </div>
        </div>
        <div className="grid4 lg-coach-kpis">
          <Kpi k="Seasons" v={k.seasons} />
          <RecordKpi k={k} />
          <Kpi k="Playoffs" v={k.playoffs} />
          <Kpi k="Titles" v={k.titles} color={k.titles ? 'var(--tier-elite)' : undefined} />
        </div>
        {k.coy.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tiny dim upper bold">Coach of the Year</span>
            {k.coy.map((s) => (
              <span key={s} className="tag lg-gold">
                {seasonLabel(s)}
              </span>
            ))}
          </div>
        )}
        {[...k.stints].reverse().map((j, i) => (
          <Card key={i} className="flush lg-flat">
            <div className="lg-team5" style={{ padding: '2px 12px', borderBottom: j.lines.length ? '1px solid var(--line)' : undefined }}>
              <JobRow league={league} j={j} />
            </div>
            {[...j.lines].reverse().map((l) => (
              <SeasonLine key={l.season} league={league} l={l} />
            ))}
          </Card>
        ))}
        {k.stints.every((j) => !j.lines.length) && (
          <div className="small dim">
            <ClipboardList size={14} style={{ verticalAlign: -2 }} /> No games coached yet.
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
      <span className="tiny dim ellipsis">{note}</span>
      {ts && l.round !== undefined ? <OutcomeTag o={seasonOutcome(league, l.tid, ts)} /> : <span className="tag">Left</span>}
    </div>
  );
}
