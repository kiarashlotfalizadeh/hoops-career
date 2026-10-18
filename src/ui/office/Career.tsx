// Your career (Office → Career): your record as a head coach and your jobs, the teams that want you
// (take the job or turn it down), and taking over any other team. A fired coach lands here: the
// agenda's "Find a new job" and the flow both point to it, and the league waits until he takes one.
// (This replaces the job-market sheet that used to open from Settings, "Switch team".)
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { curTeamSeason, payroll } from '../../core/league/helpers';
import { coachCareer, userCoach, type CoachCareer } from '../../core/league/coaches';
import { seasonsInCharge } from '../../core/league/owner';
import { agenda } from '../../core/league/agenda';
import type { JobOffer } from '../../core/league/jobs';
import { useLeague, useLeagueMemo } from '../../state/store';
import { takeTeam, turnDownJob, useBusy } from '../../state/actions/office';
import { AgendaRow } from '../components/Agenda';
import { TeamLogo } from '../components/TeamLogo';
import { More, PageHeader, Section, Segmented, Statline } from '../components/ui';
import { slabVars } from '../teamColors';
import { STRATEGY_META, capSeason, fmtM, shortSeason } from './common';
import '../screens/start.css';
import './office.css';

const pct = (w: number, l: number) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '—');
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export default function Career() {
  const league = useLeague();
  const nav = useNavigate();
  const me = userCoach(league);
  const k = useLeagueMemo(() => (me ? coachCareer(league, me) : null), [league, me]);
  const fired = useMemo(() => agenda(league).find((i) => i.kind === 'fired'), [league]);
  const offers = league.jobOffers?.season === league.season ? league.jobOffers.offers : [];
  const team = league.teams[league.userTid];
  const seasonsIn = seasonsInCharge(league);
  const done = (ok: boolean) => ok && nav('/');

  return (
    <main className="page fo-page fo-career">
      <PageHeader title="Career" sub={league.coachName} back backTo="/office" />

      {/* (its own screen is this one: the row doesn't link) */}
      {fired && (
        <div className="card flush ag-list" role="alert">
          <AgendaRow item={{ ...fired, to: undefined }} />
        </div>
      )}

      <section className="slab fo-career-slab" aria-label="Your record">
        <span className="slab-mark">
          <TeamLogo tid={team.tid} size={150} decorative />
        </span>
        <div className="row between">
          <span className="over">{league.fired ? `Last job: the ${team.name}` : seasonsIn < 1 ? `${team.name} · from next season` : `${team.name} · season ${seasonsIn}`}</span>
          {me && k && k.seasons > 0 && (
            <Link to={`/league/history?view=coaches&coach=${me.id}`} className="card-link">
              Season by season
            </Link>
          )}
        </div>
        {k && <CareerLine k={k} />}
      </section>

      {offers.length > 0 && (
        <Section title={league.fired ? 'Teams that want you' : 'Teams calling'} right={<span className="tiny dim">Until the draft</span>}>
          <div className="card flush list">
            {offers.map((o) => (
              <OfferRow key={o.tid} league={league} o={o} onTake={() => done(takeTeam(league, o.tid))} onTurnDown={() => turnDownJob(league, o.tid)} />
            ))}
          </div>
        </Section>
      )}

      {k && k.stints.length > 1 && (
        <Section title="Your jobs">
          <div className="card flush list">
            {[...k.stints].reverse().map((j, i) => {
              const first = j.lines[0]?.season ?? j.stint.from;
              const last = j.lines[j.lines.length - 1]?.season ?? first;
              return (
                <div key={i} className="listrow">
                  <TeamLogo tid={j.stint.tid} size={30} decorative />
                  <div className="grow fo-min0">
                    <div className="lr-name ellipsis">
                      {league.teams[j.stint.tid].region} {league.teams[j.stint.tid].name}
                    </div>
                    <div className="lr-meta">
                      {!j.stint.to ? `since ${seasonLabel(first)}` : first === last ? seasonLabel(first) : `${shortSeason(first)} to ${shortSeason(last)}`}
                      {j.titles ? ` · ${plural(j.titles, 'title')}` : j.playoffs ? ` · ${plural(j.playoffs, 'playoff run')}` : ''}
                    </div>
                  </div>
                  <span className="num bold">
                    {j.won}-{j.lost}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <TakeOver league={league} onTaken={() => nav('/')} />
    </main>
  );
}

/** A career's figures in a row: seasons, record (with its win %), playoff runs and titles. */
function CareerLine({ k }: { k: CoachCareer }) {
  return (
    <Statline
      items={[
        { k: 'Seasons', v: k.seasons },
        { k: 'Record', v: `${k.won}-${k.lost}`, s: pct(k.won, k.lost) },
        { k: 'Playoffs', v: k.playoffs },
        { k: 'Titles', v: k.titles, s: k.coy.length ? `COY ×${k.coy.length}` : undefined },
      ]}
    />
  );
}

/** One team's offer: who they are and where they stand, the job, and Take / Turn down. */
function OfferRow({ league, o, onTake, onTurnDown }: { league: League; o: JobOffer; onTake: () => void; onTurnDown: () => void }) {
  const t = league.teams[o.tid];
  const busy = useBusy();
  const ts = curTeamSeason(league, t.tid);
  const books = capSeason(league);
  return (
    <div className="ag-row tone-good">
      <div className="ag-head">
        <TeamLogo tid={t.tid} size={34} decorative />
        <div className="grow">
          <div className="ag-title">
            {t.region} {t.name}
          </div>
          <div className="ag-line">
            <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>{' '}
            <span className="num">
              {ts.won}-{ts.lost} · {fmtM(payroll(league, t.tid, books))} payroll{books > league.season ? ` ${shortSeason(books)}` : ''}
            </span>
          </div>
        </div>
      </div>
      <div className="small dim2">{o.note}</div>
      <div className="ag-acts">
        <button className="btn xs primary" disabled={busy} onClick={onTake}>
          Take the job
        </button>
        <button className="btn xs" disabled={busy} onClick={onTurnDown}>
          Turn down
        </button>
      </div>
    </div>
  );
}

/** Any team in the league: by conference, each with its record; the pick's strategy and books, and the move. */
function TakeOver({ league, onTaken }: { league: League; onTaken: () => void }) {
  const cur = league.teams[league.userTid];
  const [conf, setConf] = useState<'E' | 'W'>(cur.conf);
  const [pick, setPick] = useState<number | null>(null);
  const busy = useBusy();
  const t = pick !== null && pick !== league.userTid ? league.teams[pick] : null;
  const books = capSeason(league);
  return (
    <Section title={league.fired ? 'Take over a team' : 'Take over another team'}>
      <div className="small dim2">
        {league.fired ? 'Any team will have you.' : `The ${cur.name} go back to the AI staff.`}{' '}
        <More label="What carries over">
          <div className="small dim2">
            Your owner standing resets and the new owner sets his goals: in season from that day (in the playoffs, the next round), otherwise on opening night. Your coaching
            ratings come with you; the season, finances and league history carry on.
          </div>
        </More>
      </div>
      <Segmented
        value={conf}
        onChange={setConf}
        label="Conference"
        options={[
          { id: 'E', label: 'East' },
          { id: 'W', label: 'West' },
        ]}
      />
      <div className="nl-grid">
        {league.teams
          .filter((x) => x.conf === conf)
          .map((x) => {
            const ts = curTeamSeason(league, x.tid);
            const me = x.tid === league.userTid;
            const on = pick === x.tid && !me;
            return (
              <button
                key={x.tid}
                className={`nl-team ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={me}
                style={on ? slabVars(x.colors) : me ? { opacity: 0.45 } : undefined}
                onClick={() => setPick(x.tid)}
              >
                <TeamLogo tid={x.tid} size={38} decorative />
                <span className="nl-team-name">{x.name}</span>
                <span className="nl-team-sub num">{me ? (league.fired ? 'Fired' : 'Yours') : `${ts.won}-${ts.lost}`}</span>
              </button>
            );
          })}
      </div>
      {t && (
        <div className="dockbar fo-career-dock" role="region" aria-label="Take over">
          <TeamLogo tid={t.tid} size={34} decorative />
          <div className="grow fo-min0">
            <div className="bold ellipsis">
              {t.region} {t.name}
            </div>
            <div className="tiny dim ellipsis">
              <span className={`tag ${STRATEGY_META[t.strategy].tone}`}>{STRATEGY_META[t.strategy].label}</span>{' '}
              {/* the books he'd inherit: next season's after this one ends, as on the Office cap sheet */}
              <span className="num">
                {fmtM(payroll(league, t.tid, books))}
                {books > league.season ? ` in ${shortSeason(books)}` : ''}
              </span>
            </div>
          </div>
          <button className="btn primary" disabled={busy} onClick={() => takeTeam(league, t.tid) && onTaken()}>
            Take over {t.abbrev}
          </button>
        </div>
      )}
    </Section>
  );
}
