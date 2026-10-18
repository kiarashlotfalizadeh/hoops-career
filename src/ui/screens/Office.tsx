// The Office hub: the GM's desk. What the desk is doing now (the phase card and its one action),
// the decisions waiting on it, the cap sheet in one block, and the desks, each with a line of live
// status. The contracts table lives on Team → Roster → Contracts; the owner on his own desk.
import { createContext, useContext, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type LucideIcon, ArrowLeftRight, ChevronRight, ClipboardList, Crown, ListOrdered, PenLine, PiggyBank, Ticket, UserPlus } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import {
  CAP_FOR,
  OFFSEASON_ROSTER_MAX,
  fmtDate,
  freeAgents,
  payroll,
  playerName,
  prospects,
  rosterMaxNow,
  standardRoster,
  teamPlayers,
  twoWayRoster,
} from '../../core/league/helpers';
import { EXCEPTIONS, EXCEPTION_ORDER, exceptionAmount, exceptionUsedReason, extensionBlockedReason } from '../../core/league/contracts';
import { bidOnException, capHolds, expiringPlayers, signedThisSummer, signingClosedReason, userExceptionRoom } from '../../core/league/freeAgency';
import { HARDSHIP_OUT } from '../../core/league/tenDay';
import { draftOrder, nextPick } from '../../core/league/draft';
import { FA_DAYS, faDayNumber, faOver } from '../../core/league/season';
import { TAX_SHARE_TO_NON_TAXPAYERS, profit } from '../../core/league/finances';
import { openProposals } from '../../core/league/proposals';
import { agenda, type AgendaKind } from '../../core/league/agenda';
import { seasonsInCharge } from '../../core/league/owner';
import { teamTxns } from '../../core/league/transactions';
import { contractExp } from '../../core/playerGen';
import { useLeague, useLeagueMemo } from '../../state/store';
import { useBusy } from '../../state/actions/office';
import { Bar, More, PageHeader, Section, Statline } from '../components/ui';
import { AgendaRow, runAgenda } from '../components/Agenda';
import { AssistantCards } from '../components/Assistant';
import { Term } from '../components/Glossary';
import { CapBar, HelpSheet, capSeason, isOffseason, shortSeason } from '../office/common';
import { overallPick, pickProjection } from '../league/shared';
import { useFlowRunner } from '../useFlow';
import { seatOf } from '../office/seat';
import { money, moneySigned } from '../../core/format';

/** The decisions the desk settles (the owner's and the job market's show on their desks' lines; the pick on the phase card). */
const OFFICE_AGENDA: AgendaKind[] = ['cuts', 'signings', 'twoWays', 'offerSheet', 'tenDay', 'tradeOffer'];

export default function Office() {
  const league = useLeague();
  const items = useLeagueMemo(() => agenda(league).filter((i) => OFFICE_AGENDA.includes(i.kind)), [league]);
  return (
    <main className="page fo-page">
      <PageHeader title="Office" />
      {/* a decision the league waits on comes first: the phase card's action steps down */}
      <Quiet.Provider value={items.some((i) => i.required)}>
        <PhaseCard league={league} />
      </Quiet.Provider>
      {items.length > 0 && (
        <div className="card flush ag-list" role="list" aria-label="Decisions">
          {items.map((i) => (
            <div role="listitem" key={i.id}>
              <AgendaRow item={i} />
            </div>
          ))}
        </div>
      )}
      <CapSheet league={league} />
      <Desks league={league} />
      <AssistantCards league={league} areas={['office']} />
    </main>
  );
}

// ------------------------------------------------------------------ the phase card

/** A decision waits on the user: the phase card doesn't compete with it. */
const Quiet = createContext(false);

interface Action {
  label: string;
  to?: string;
  run?: () => void;
}

function Now({
  over,
  live,
  title,
  sub,
  action,
  second,
  children,
}: {
  over: ReactNode;
  live?: boolean;
  title: ReactNode;
  sub?: ReactNode;
  action?: Action;
  second?: Action;
  children?: ReactNode;
}) {
  const nav = useNavigate();
  const busy = useBusy();
  const quiet = useContext(Quiet);
  const button = (a: Action, primary: boolean) => (
    <button className={`btn block ${primary ? 'primary' : ''}`} disabled={!!a.run && busy} onClick={() => (a.run ? a.run() : nav(a.to!))}>
      {a.label}
    </button>
  );
  return (
    <section className={`card fo-now ${action && !quiet ? 'accent' : ''}`} aria-label="Now">
      <div className="fo-now-over">
        <span className={live ? 'fo-live' : ''}>{over}</span>
      </div>
      <h2 className="fo-now-t">{title}</h2>
      {sub && <p className="fo-now-s">{sub}</p>}
      {children}
      {(action || second) && (
        <div className="col fo-now-acts">
          {action && button(action, !quiet)}
          {second && button(second, false)}
        </div>
      )}
    </section>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const picksText = (league: League, picks: { round: number; pick?: number }[]) => picks.map((d) => `#${overallPick(league, d.round, d.pick!)}`).join(', ');

function PhaseCard({ league }: { league: League }) {
  const run = useFlowRunner();
  const tid = league.userTid;
  switch (league.phase) {
    case 'preseason':
      return (
        <Now over="Preseason" title="Opening night is next" sub="Signings, trades and extensions are open." action={{ label: 'Sign free agents', to: '/office/free-agents' }} />
      );
    case 'regular': {
      const d = league.tradeDeadlineDay - league.day;
      if (d < 0)
        return (
          <Now
            over="Trade deadline passed"
            title="Trades locked"
            sub="Signings stay open to the end of the season."
            action={{ label: 'Sign free agents', to: '/office/free-agents' }}
          />
        );
      return (
        <Now
          over="Trade deadline"
          title={d === 0 ? 'Deadline today' : `${plural(d, 'day')} left`}
          sub={fmtDate(league.season, league.tradeDeadlineDay)}
          action={{ label: 'Make a trade', to: '/office/trade' }}
        />
      );
    }
    case 'playin':
    case 'playoffs': {
      const exp = teamPlayers(league, tid).filter((p) => contractExp(p.contract) === league.season).length;
      return (
        <Now
          over="Postseason"
          title="Trades frozen"
          sub={exp ? `${plural(exp, 'contract')} ${exp === 1 ? 'expires' : 'expire'} this summer.` : 'No contracts expire this summer.'}
          action={exp ? { label: 'Expiring deals', to: '/office/resign' } : undefined}
        />
      );
    }
    case 'draftLottery': {
      const mine = draftOrder(league).filter((d) => d.tid === tid);
      return (
        <Now
          over="Draft lottery"
          title={mine.length ? `You pick ${picksText(league, mine.slice(0, 2))}` : 'No picks this year'}
          sub={mine.length > 2 ? `And ${picksText(league, mine.slice(2))}. Draft night is next.` : 'Draft night is next.'}
          action={{ label: 'Scout prospects', to: '/office/draft' }}
        />
      );
    }
    case 'draft': {
      const np = nextPick(league);
      if (!np)
        return (
          <Now
            over="Draft night"
            title="Draft complete"
            sub="Next: re-sign your own players."
            action={{ label: 'Continue to re-signing', run: () => void run({ id: 'finish', label: 'Continue to re-signing', cmd: 'finishDraft' }) }}
          />
        );
      const n = overallPick(league, np.round, np.pick!);
      const rest = draftOrder(league).filter((d) => d.tid === tid && d.dpid !== np.dpid);
      if (np.tid === tid)
        return (
          <Now
            live
            over="You're on the clock"
            title={`Pick #${n} is yours`}
            sub={rest.length ? `Then ${picksText(league, rest)}.` : undefined}
            action={{ label: 'Draft board', to: '/office/draft' }}
            second={{ label: "Take the staff's pick", run: () => runAgenda("You're on the clock", { kind: 'autoPick' }) }}
          />
        );
      return (
        <Now
          live
          over="Draft night"
          title={`${league.teams[np.tid].abbrev} on the clock · #${n}`}
          sub={rest.length ? `Your picks: ${picksText(league, rest)}.` : 'No picks left this year.'}
          action={{ label: 'Draft board', to: '/office/draft' }}
        />
      );
    }
    case 'resign': {
      const exp = expiringPlayers(league, tid).length;
      return (
        <Now
          over="Re-signing"
          title={exp ? `${plural(exp, 'contract')} expiring` : 'Nothing expiring'}
          sub={
            exp ? (
              <>
                <Term id="bird">Bird rights</Term>: keep them, even over the cap.
              </>
            ) : (
              'Open free agency when you are ready.'
            )
          }
          action={{ label: 'Re-sign players', to: '/office/resign' }}
        />
      );
    }
    case 'freeAgency': {
      const day = faDayNumber(league);
      const bids = (league.faBids ?? []).length;
      return (
        <Now
          over="Free agency"
          title={`Day ${day} of ${FA_DAYS}`}
          sub={
            faOver(league)
              ? 'The market is winding down.'
              : bids
                ? `${plural(bids, 'offer')} pending.`
                : day <= 1
                  ? 'You get the first look: AI teams sign from day 2.'
                  : 'Unsigned players lower their price as days pass.'
          }
          action={{ label: 'Free agents', to: '/office/free-agents' }}
        >
          <Bar value={day} max={FA_DAYS} />
        </Now>
      );
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------ the cap sheet

function CapSheet({ league }: { league: League }) {
  const tid = league.userTid;
  const team = league.teams[tid];
  const s0 = capSeason(league);
  const cap = CAP_FOR(league, s0);
  const pay = payroll(league, tid, s0);
  // between the season and free agency, own expiring players hold cap room until renounced
  const holds = capHolds(league, tid).reduce((a, h) => a + h.amount, 0);
  const space = cap.salaryCap - pay - holds;
  const roster = standardRoster(league, tid);
  const tw = twoWayRoster(league, tid).length;
  // in the offseason, count the players actually under contract for next season
  const signedN = isOffseason(league) ? roster.filter((p) => contractExp(p.contract) >= s0).length : roster.length;
  const expiringN = roster.length - signedN;
  const tax = pay > cap.luxuryTax ? Math.round((pay - cap.luxuryTax) * CAP.taxRate) : 0;
  const status = pay > cap.luxuryTax ? 'tax' : pay + holds > cap.salaryCap ? 'cap' : 'under';
  const dead = team.deadMoney.filter((d) => d.season === s0).reduce((a, d) => a + d.amount, 0);
  const max = rosterMaxNow(league);
  return (
    <Section
      title={`${seasonLabel(s0)} cap sheet`}
      right={
        <span className="row fo-sec-links">
          <Link to="/team?view=contracts" className="card-link">
            Contracts <ChevronRight size={14} />
          </Link>
          <CapHelp league={league} season={s0} />
        </span>
      }
    >
      <div className="card fo-capsheet">
        <div className="fo-pay">
          <div className="grow">
            <div className="over">Payroll</div>
            <div className="fo-pay-v num">{money(pay)}</div>
          </div>
          {/* cap holds count against the cap (trades treat the team as over it), not toward the tax */}
          <span className={`tag ${status === 'tax' ? 'bad' : status === 'cap' ? 'warn' : 'good'}`}>
            {status === 'tax' ? 'Taxpayer' : status === 'cap' ? 'Over the cap' : 'Under the cap'}
          </span>
        </div>
        <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={holds} legend={false} />
        <Statline
          items={[
            { k: 'Cap space', v: money(space), color: space >= 0 ? 'var(--good)' : 'var(--warn)', s: `cap ${money(cap.salaryCap)}` },
            tax > 0
              ? { k: 'Tax bill', v: money(tax), color: 'var(--bad)', s: `line ${money(cap.luxuryTax)}` }
              : { k: 'Under tax', v: money(cap.luxuryTax - pay), s: `line ${money(cap.luxuryTax)}` },
            {
              k: isOffseason(league) ? `Roster ${shortSeason(s0)}` : 'Roster',
              v: `${signedN}/${CAP.rosterMax}`,
              color: signedN > max ? 'var(--bad)' : signedN > CAP.rosterMax || signedN < CAP.rosterMin ? 'var(--warn)' : undefined,
              s: expiringN ? `+${expiringN} expiring` : signedN > CAP.rosterMax ? `${signedN - CAP.rosterMax} to cut` : tw ? `+${tw} two-way` : `${CAP.rosterMax - signedN} open`,
            },
          ]}
        />
        <Exceptions league={league} season={s0} />
        {(holds > 0 || dead > 0) && (
          <div className="tiny dim num">{[holds > 0 ? `${money(holds)} in cap holds (striped)` : '', dead > 0 ? `${money(dead)} dead money` : ''].filter(Boolean).join(' · ')}</div>
        )}
        <More label="Next seasons">
          <NextSeasons league={league} from={s0 + 1} />
        </More>
      </div>
    </Section>
  );
}

/** Committed payroll and cap space for the seasons after this one. */
function NextSeasons({ league, from }: { league: League; from: number }) {
  const tid = league.userTid;
  return (
    <div className="fo-next">
      {[from, from + 1, from + 2].map((s) => {
        const pay = payroll(league, tid, s);
        const cap = CAP_FOR(league, s);
        return (
          <div key={s} className="fo-next-row num">
            <span className="dim2">{shortSeason(s)}</span>
            <span>{money(pay)} committed</span>
            <span className={cap.salaryCap - pay >= 0 ? 'good' : 'warn'}>{moneySigned(cap.salaryCap - pay)} vs cap</span>
          </div>
        );
      })}
    </div>
  );
}

/** The exceptions open to a signing now (net of a pending offer that leans on one), on one line; why the rest aren't, behind More. */
function Exceptions({ league, season }: { league: League; season: number }) {
  const rows = EXCEPTION_ORDER.map((k) => {
    const room = userExceptionRoom(league, k, season);
    const bid = bidOnException(league, k);
    const why =
      exceptionUsedReason(league, league.userTid, k, season) ??
      (bid
        ? bid.route === k
          ? `Held for your pending offer to ${playerName(league.players[bid.pid])}.`
          : `Gone while your offer to ${playerName(league.players[bid.pid])} holds your cap space: a team that uses its space gets the room exception instead.`
        : room <= 0
          ? 'Only for a team under the tax line.'
          : null);
    return { k, room, why };
  });
  const open = rows.filter((r) => !r.why).sort((a, b) => b.room - a.room);
  const closed = rows.filter((r) => r.why);
  return (
    <div className="fo-exc">
      <div className="fo-exc-row">
        <span className="over">Exceptions</span>
        {open.length ? (
          <span className="num bold good">
            {open.map((r, i) => (
              <span key={r.k}>
                {i > 0 && ' · '}
                <Term id={r.k}>{EXCEPTIONS[r.k].short}</Term> {money(r.room)}
              </span>
            ))}
          </span>
        ) : (
          <span className="dim">None open</span>
        )}
      </div>
      {closed.length > 0 && (
        <More label={open.length ? 'The others' : 'Why not'}>
          <ul className="fo-why">
            {closed.map((r) => (
              <li key={r.k}>
                <b>{EXCEPTIONS[r.k].short}.</b> {r.why}
              </li>
            ))}
          </ul>
        </More>
      )}
    </div>
  );
}

/** The cap rules in full, behind the cap sheet's "?". */
function CapHelp({ league, season }: { league: League; season: number }) {
  const cap = CAP_FOR(league, season);
  const pct = (k: keyof typeof EXCEPTIONS) => Math.round(EXCEPTIONS[k].pct * 1000) / 10;
  return (
    <HelpSheet title="How the cap works">
      <p>
        <b>Soft cap ({money(cap.salaryCap)}).</b> Sign free agents with cap space, or for the minimum (up to {money(cap.vetMin, 2)}) over it.
      </p>
      <p>
        <b>Mid-level.</b> Once a season, for a team that stays under the tax line: one free agent up to {money(exceptionAmount(league, 'mle', season))} ({pct('mle')}% of the cap,{' '}
        {EXCEPTIONS.mle.years} years), even over the cap. For the rest of that season, trades can't take its payroll past the tax line.
      </p>
      <p>
        <b>Room exception.</b> Sign a free agent with cap space and the mid-level is gone for the season; this replaces it: one signing up to{' '}
        {money(exceptionAmount(league, 'room', season))} ({pct('room')}%), {EXCEPTIONS.room.years} years.
      </p>
      <p>
        <b>Bi-annual.</b> One signing up to {money(exceptionAmount(league, 'bae', season))} ({pct('bae')}%), {EXCEPTIONS.bae.years} years, for a team under the tax line after it:
        not two seasons running, nor with the room exception. Like the mid-level, it keeps trades from taking the payroll past the tax line that season.
      </p>
      <p>
        <b>Stretch.</b> A release can spread its dead money evenly over twice the seasons left plus one (in season, this season's salary is paid as usual). Less a season, for
        longer; a waiver claim still wipes it.
      </p>
      <p>
        <b>10-day contracts.</b> From January 5 to the end of the regular season: the minimum prorated for 10 days, no dead money, two at most per player and team. With{' '}
        {HARDSHIP_OUT}+ players out for 3+ games, the hardship exception allows them beyond {CAP.rosterMax}.
      </p>
      <p>
        <b>Bird rights.</b> Re-sign your own players for any amount in the re-sign period, even over the cap. Until free agency opens (or you renounce them), each holds cap room at
        about his ask.
      </p>
      <p>
        <b>Restricted free agents.</b> A young player you qualify can still be re-signed in free agency, and you can match any offer sheet he signs. His cap hold (the larger of the
        offer and his ask) stays until he signs or you withdraw the offer; an offer sheet you sign holds its room until his team decides.
      </p>
      <p>
        <b>Luxury tax ({money(cap.luxuryTax)}).</b> Every dollar over the line costs {CAP.taxRate}× at the end of the regular season; {Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}
        % of the pot goes to the teams under it.
      </p>
      <p>
        <b>Trades.</b> A team over the cap after a trade takes back at most 125% of the salary it sends, plus $0.1M.
      </p>
      <p>
        <b>Rosters.</b> {CAP.rosterMin}-{CAP.rosterMax} players in season, up to {OFFSEASON_ROSTER_MAX} in the offseason. Minimum deals for the coming season aren't guaranteed
        until opening night. First-round picks sign rookie-scale deals (4 years, team option on the last).
      </p>
      <p>The cap, tax line and minimums grow 6% a season.</p>
    </HelpSheet>
  );
}

// ------------------------------------------------------------------ the desks

interface Desk {
  to: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  /** The work is here right now. */
  hot?: boolean;
  /** Closed for now (trading after the deadline, signings out of season). */
  muted?: boolean;
  /** The status line's tone (the owner's seat, a job offer). */
  tone?: 'good' | 'warn' | 'bad';
}

function Desks({ league }: { league: League }) {
  const tid = league.userTid;
  const team = league.teams[tid];
  const faCount = useLeagueMemo(() => freeAgents(league).length, [league]);
  const extendable = useLeagueMemo(() => teamPlayers(league, tid).filter((p) => !extensionBlockedReason(league, p)).length, [league, tid]);
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  const prospectsN = useLeagueMemo(() => prospects(league, league.season).length, [league]);
  const js = useLeagueMemo(() => seatOf(league), [league]);
  const lastMove = useLeagueMemo(() => teamTxns(league, tid)[0], [league, tid]);
  const offers = openProposals(league).length;
  const inPost = league.phase === 'playin' || league.phase === 'playoffs';
  const pastDeadline = league.phase === 'regular' && league.day > league.tradeDeadlineDay;
  const signingClosed = !!signingClosedReason(league);
  const draftNight = league.phase === 'draft' || league.phase === 'draftLottery';
  const after = league.phase === 'resign' || league.phase === 'freeAgency';
  const myPicks = league.draftPicks.filter((d) => d.tid === tid);
  const firsts = myPicks.filter((d) => d.round === 1).length;
  const thisFirst = myPicks.find((d) => d.season === league.season && d.round === 1);
  const drafted = after ? Object.values(league.players).filter((p) => p.draft.year === league.season && p.draft.tid === tid && p.draft.round > 0) : [];
  const ts = team.seasons.find((s) => s.season === league.season);
  const pr = ts && ts.won + ts.lost > 0 ? profit(league, tid) : null;
  const jobOffers = league.jobOffers?.season === league.season ? league.jobOffers.offers.length : 0;
  const seasonsIn = seasonsInCharge(league);

  const desks: Desk[] = [
    {
      to: '/office/trade',
      icon: ArrowLeftRight,
      title: 'Trade',
      sub: inPost ? 'Frozen in the postseason' : pastDeadline ? 'Locked until the lottery' : offers ? `${plural(offers, 'offer')} waiting` : 'No offers waiting',
      hot: offers > 0 && !inPost && !pastDeadline,
      muted: inPost || pastDeadline,
    },
    {
      to: '/office/free-agents',
      icon: UserPlus,
      title: 'Free agents',
      sub: `${faCount} on the market${signingClosed ? ' · signings closed' : ''}`,
      hot: league.phase === 'freeAgency',
      muted: signingClosed,
    },
    {
      to: '/office/resign',
      icon: PenLine,
      title: 'Re-sign',
      sub:
        league.phase === 'resign'
          ? `Open until free agency · ${signedThisSummer(league).length} re-signed`
          : extendable > 0
            ? `${plural(extendable, 'player')} can be extended`
            : league.phase === 'freeAgency'
              ? 'Closed until next summer'
              : 'Opens after the draft',
      hot: league.phase === 'resign',
      muted: league.phase !== 'resign' && !extendable,
    },
    {
      to: '/office/draft',
      icon: ListOrdered,
      title: 'Draft',
      sub: draftNight
        ? league.phase === 'draft'
          ? 'Draft night'
          : 'The lottery is in'
        : after
          ? drafted.length
            ? `You drafted ${drafted.map((p) => p.lastName).join(', ')}`
            : 'No picks this year'
          : thisFirst && proj(thisFirst) !== undefined
            ? `Your first projects #${proj(thisFirst)} · ${prospectsN} prospects`
            : `${prospectsN} prospects on the board`,
      hot: draftNight,
    },
    {
      to: '/office/assets',
      icon: Ticket,
      title: 'Picks & moves',
      sub: [
        `${plural(firsts, 'first')} · ${plural(myPicks.length - firsts, 'second')}`,
        lastMove ? `last move ${fmtDate(lastMove.season, lastMove.day, { month: 'short', day: 'numeric' })}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      to: '/office/finances',
      icon: PiggyBank,
      title: 'Finances',
      sub: `Cash ${money(team.cash)}${pr !== null ? ` · ${moneySigned(pr)} this season` : ''}`,
    },
    {
      to: '/office/owner',
      icon: Crown,
      title: 'Owner',
      sub: js.off ? 'Job security off' : js.ultimatum ? `Ultimatum: ${js.ultimatum.text.toLowerCase()}` : `${js.label} · ${js.score}/100`,
      tone: js.off ? undefined : js.ultimatum || js.heat === 'hot' ? 'bad' : js.heat === 'warm' ? 'warn' : undefined,
    },
    {
      to: '/office/career',
      icon: ClipboardList,
      title: 'Career',
      sub: jobOffers
        ? `${plural(jobOffers, 'job offer')} · lapse${jobOffers === 1 ? 's' : ''} at the draft`
        : seasonsIn < 1
          ? `Your ${team.name} tenure starts next season`
          : `Season ${seasonsIn} with the ${team.name}`,
      tone: jobOffers ? 'good' : undefined,
      hot: jobOffers > 0,
    },
  ];

  return (
    <nav className="card flush" aria-label="Desks">
      <div className="list">
        {desks.map((d) => (
          <Link key={d.to} to={d.to} className={`fo-dept ${d.hot ? 'hot' : ''} ${d.muted ? 'muted' : ''}`}>
            <span className="fo-dept-ic" aria-hidden="true">
              <d.icon size={18} />
            </span>
            <span className="grow">
              <span className="fo-dept-t">{d.title}</span>
              <span className={`fo-dept-s ${d.tone ?? ''}`}>{d.sub}</span>
            </span>
            <ChevronRight size={16} className="dim" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  );
}
