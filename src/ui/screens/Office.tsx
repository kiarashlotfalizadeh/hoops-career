// The Office hub: the GM's desk. What the desk is doing now (the phase card and its action), the
// decisions waiting on it, the cap sheet in one block (the payroll against the cap and the tax line,
// the room or how far over, the roster, the exceptions open and why the others aren't, the seasons
// ahead), and the desks, each with a line of live status. The contracts table lives on Team → Roster
// → Contracts; the owner on his own desk.
import { createContext, useContext, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type LucideIcon, ArrowLeftRight, ChevronRight, ClipboardList, Crown, ListOrdered, PenLine, PiggyBank, Ticket, UserPlus } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, fmtDate, freeAgents, payroll, playerName, prospects, shortName, teamPlayers } from '../../core/league/helpers';
import { EXCEPTIONS, EXCEPTION_ORDER, exceptionAmount, exceptionUsedShort, extensionBlockedReason } from '../../core/league/contracts';
import { bidOnException, capHolds, expiringPlayers, signedThisSummer, signingClosedReason, userExceptionRoom } from '../../core/league/freeAgency';
import { HARDSHIP_OUT } from '../../core/league/tenDay';
import { draftOrder, nextPick } from '../../core/league/draft';
import { FA_DAYS, faDayNumber, faOver } from '../../core/league/season';
import { TAX_SHARE_TO_NON_TAXPAYERS, profit } from '../../core/league/finances';
import { openProposals } from '../../core/league/proposals';
import { agenda, type AgendaKind } from '../../core/league/agenda';
import { seasonsInCharge } from '../../core/league/owner';
import { teamTxns } from '../../core/league/transactions';
import { useLeague, useLeagueMemo } from '../../state/store';
import { useBusy } from '../../state/actions/office';
import { Bar, PageHeader, Section, Statline } from '../components/ui';
import { AgendaRow, runAgenda } from '../components/Agenda';
import { AssistantCards } from '../components/Assistant';
import { Term } from '../components/Glossary';
import { CapBar, HelpSheet, capRoomFig, capSeason, contractsUp, isOffseason, rosterFig, shortSeason, taxFig } from '../office/common';
import { overallPick, pickProjection } from '../league/shared';
import { picksText } from '../draft/common';
import { useFlowRunner } from '../useFlow';
import { seatOf } from '../office/seat';
import { money, moneyExact, plural } from '../../core/format';

/** The decisions the desk settles (the owner's and the job market's show on their desks' lines; the pick on the phase card). */
const OFFICE_AGENDA: AgendaKind[] = ['cuts', 'signings', 'twoWays', 'offerSheet', 'tenDay', 'tradeOffer'];

export default function Office() {
  const league = useLeague();
  const items = useLeagueMemo(() => agenda(league).filter((i) => OFFICE_AGENDA.includes(i.kind)), [league]);
  return (
    <main className="page fo-page">
      <PageHeader title="Office" />
      {/* a decision the league waits on comes first, and so do offers to settle: the phase card's action steps down */}
      <Quiet.Provider value={items.some((i) => i.required || i.kind === 'tradeOffer')}>
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

/** What the desk is doing now: an overline, a headline, a short line, and its action beside it (two actions go under it). */
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
  const button = (a: Action, primary: boolean, block: boolean) => (
    <button className={`btn ${block ? 'block' : ''} ${primary ? 'primary' : ''}`} disabled={!!a.run && busy} onClick={() => (a.run ? a.run() : nav(a.to!))}>
      {a.label}
    </button>
  );
  const single = !!action && !second;
  return (
    <section className={`card fo-now ${action && !quiet ? 'accent' : ''}`} aria-label="Now">
      <div className="fo-now-main">
        <div className="grow">
          <div className="fo-now-over">
            <span className={live ? 'fo-live' : ''}>{over}</span>
          </div>
          <h2 className="fo-now-t">{title}</h2>
          {sub && <p className="fo-now-s">{sub}</p>}
        </div>
        {single && button(action, !quiet, false)}
      </div>
      {children}
      {!single && (action || second) && (
        <div className="grid2 fo-now-acts">
          {action && button(action, !quiet, true)}
          {second && button(second, false, true)}
        </div>
      )}
    </section>
  );
}

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
          over={`Trade deadline · ${fmtDate(league.season, league.tradeDeadlineDay)}`}
          title={d === 0 ? 'Deadline today' : `${plural(d, 'day')} left`}
          action={{ label: 'Make a trade', to: '/office/trade' }}
        />
      );
    }
    case 'playin':
    case 'playoffs': {
      const exp = contractsUp(league).players.length;
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
          title={mine.length ? `${plural(mine.length, 'pick')} this year` : 'No picks this year'}
          sub={mine.length ? `${picksText(league, mine)}. Draft night is next.` : 'Draft night is next.'}
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
  const status = pay > cap.luxuryTax ? 'tax' : pay + holds > cap.salaryCap ? 'cap' : 'under';
  const dead = team.deadMoney.filter((d) => d.season === s0).reduce((a, d) => a + d.amount, 0);
  return (
    <Section
      title={`${shortSeason(s0)} cap sheet`}
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
            <div className="over">Payroll{dead > 0 ? ` · incl. ${money(dead)} dead money` : ''}</div>
            <div className="fo-pay-v num">{money(pay)}</div>
          </div>
          {/* cap holds count against the cap (trades treat the team as over it), not toward the tax */}
          <span className={`tag ${status === 'tax' ? 'bad' : status === 'cap' ? 'warn' : 'good'}`}>
            {status === 'tax' ? 'Taxpayer' : status === 'cap' ? 'Over the cap' : 'Under the cap'}
          </span>
        </div>
        <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={holds} addLabel={<Term id="hold">Cap holds</Term>} legend="lines" />
        <Statline
          items={[
            { ...capRoomFig(space), s: holds > 0 ? `after ${money(holds)} in holds` : undefined },
            taxFig(pay, cap.luxuryTax),
            // on the season the money is about: signed for it, the expiring deals beside them
            rosterFig(league),
          ]}
        />
        <Exceptions league={league} season={s0} />
        <SeasonsAhead league={league} from={s0 + 1} />
      </div>
    </Section>
  );
}

/** Committed payroll and the cap room it leaves for the three seasons after this one. */
function SeasonsAhead({ league, from }: { league: League; from: number }) {
  const tid = league.userTid;
  return (
    <div className="fo-next" role="table" aria-label="Seasons ahead">
      <div className="fo-next-row fo-next-h" role="row">
        <span className="over" role="columnheader">
          Ahead
        </span>
        <span className="over" role="columnheader">
          Committed
        </span>
        <span className="over" role="columnheader">
          Cap space
        </span>
      </div>
      {[from, from + 1, from + 2].map((s) => {
        const room = CAP_FOR(league, s).salaryCap - payroll(league, tid, s);
        return (
          <div key={s} className="fo-next-row num" role="row">
            <span className="dim2" role="cell">
              {shortSeason(s)}
            </span>
            <span role="cell">{money(payroll(league, tid, s))}</span>
            <span className={room >= 0 ? 'good' : 'warn'} role="cell">
              {room >= 0 ? money(room) : `over by ${money(-room)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The room exception's short reason before any signing with cap space: its usual state. */
const ROOM_IDLE = 'only after a cap-space signing';

/** The exceptions open to a signing now (net of a pending offer that leans on one), and in a few words why the others aren't. */
function Exceptions({ league, season }: { league: League; season: number }) {
  const rows = EXCEPTION_ORDER.map((k) => {
    const room = userExceptionRoom(league, k, season);
    const bid = bidOnException(league, k);
    const why =
      exceptionUsedShort(league, league.userTid, k, season) ??
      (bid
        ? bid.route === k
          ? `held for your offer to ${playerName(league.players[bid.pid])}`
          : 'gone while your offer holds your cap space'
        : room <= 0
          ? 'over the tax line'
          : null);
    return { k, room, why };
  });
  const open = rows.filter((r) => !r.why).sort((a, b) => b.room - a.room);
  // the room exception's usual state (no cap-space signing yet) says nothing: it's left out
  const closed = rows.filter((r) => r.why && !(r.k === 'room' && r.why === ROOM_IDLE));
  // the same reason once, for the exceptions it closes, biggest first: "Mid-level, bi-annual: over the tax line"
  const byWhy = new Map<string, string[]>();
  for (const r of [...closed].reverse()) byWhy.set(r.why!, [...(byWhy.get(r.why!) ?? []), EXCEPTIONS[r.k].short]);
  const whys = [...byWhy].map(([why, names]) => `${names.map((n, i) => (i ? n.toLowerCase() : n)).join(', ')}: ${why}`);
  return (
    <div className="fo-exc">
      <div className="fo-exc-row">
        <span className="over">
          <Term id="exception">Exceptions</Term>
        </span>
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
          <span className="dim2">None open</span>
        )}
      </div>
      {whys.length > 0 && <div className="tiny dim">{whys.join(' · ')}</div>}
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
        <b>Soft cap ({money(cap.salaryCap)}).</b> Sign free agents with cap space, or for the minimum (up to {moneyExact(cap.vetMin)}) over it. The cap sheet shows the season new
        deals count against: next season's from the draft lottery on.
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
        about his ask: the striped part of the bar.
      </p>
      <p>
        <b>Restricted free agents.</b> A young player you qualify can still be re-signed in free agency, and you can match any offer sheet he signs. His cap hold (the larger of the
        offer and his ask) stays until he signs or you withdraw the offer; an offer sheet you sign holds its room until his team decides.
      </p>
      <p>
        <b>Luxury tax ({money(cap.luxuryTax)}).</b> Every dollar over the line costs {CAP.taxRate}× at the end of the regular season; {Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}
        % of the pot goes to the teams under it. Cap holds don't count toward it.
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
  const market = useLeagueMemo(() => freeAgents(league), [league]);
  const best = market.reduce((a, p) => Math.max(a, p.ovr), 0);
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
  // this draft's picks by their slots, or projections until the order is set (before opening night nothing projects: they're counted)
  const thisDraft = myPicks.filter((d) => d.season === league.season);
  const drafted = after ? Object.values(league.players).filter((p) => p.draft.year === league.season && p.draft.tid === tid && p.draft.round > 0) : [];
  // the contracts the Re-sign desk lists, two-ways included
  const up = contractsUp(league);
  const expiring = up.players.length;
  const ts = team.seasons.find((s) => s.season === league.season);
  const pr = ts && ts.won + ts.lost > 0 ? profit(league, tid) : null;
  const jobOffers = league.jobOffers?.season === league.season ? league.jobOffers.offers.length : 0;
  const seasonsIn = seasonsInCharge(league);

  const desks: Desk[] = [
    {
      to: '/office/trade',
      icon: ArrowLeftRight,
      title: 'Trade',
      // the offers themselves are the decisions above: this line points at them
      sub: inPost ? 'Frozen in the postseason' : pastDeadline ? 'Locked until the lottery' : offers ? `${plural(offers, 'offer')} above` : 'No offers waiting',
      muted: inPost || pastDeadline,
    },
    {
      to: '/office/free-agents',
      icon: UserPlus,
      title: 'Free agents',
      sub: `${market.length} on the market${market.length ? `, best ${best} OVR` : ''}${signingClosed ? ' · signings closed' : ''}`,
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
          : [league.phase !== 'freeAgency' && expiring ? `${expiring} expiring after ${shortSeason(up.season)}` : '', extendable > 0 ? `${extendable} can be extended now` : '']
              .filter(Boolean)
              .join(' · ') || (league.phase === 'freeAgency' ? 'Closed until next summer' : 'Opens after the draft'),
      hot: league.phase === 'resign',
      muted: league.phase !== 'resign' && !extendable,
    },
    {
      to: '/office/draft',
      icon: ListOrdered,
      title: 'Draft',
      sub: after
        ? drafted.length
          ? `You drafted ${drafted.map((p) => shortName(league, p)).join(', ')}`
          : 'No picks this year'
        : [
            league.phase === 'draft' ? 'Draft night' : '',
            !thisDraft.length
              ? 'No picks this year'
              : thisDraft.every((d) => !d.pick && proj(d) === undefined)
                ? `${plural(thisDraft.length, 'pick')} this year`
                : `${draftNight ? 'You pick' : thisDraft.some((d) => !d.pick) ? 'Your picks project' : 'Your picks:'} ${picksText(league, thisDraft, proj)}`,
            draftNight ? '' : `${prospectsN} prospects`,
          ]
            .filter(Boolean)
            .join(' · '),
      hot: draftNight,
    },
    {
      to: '/office/assets',
      icon: Ticket,
      title: 'Picks & moves',
      sub: [
        `${plural(myPicks.length, 'pick')} owned, ${firsts} in the 1st round`,
        lastMove ? `last move ${fmtDate(lastMove.season, lastMove.day, { month: 'short', day: 'numeric' })}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      to: '/office/finances',
      icon: PiggyBank,
      title: 'Finances',
      sub: `Cash ${money(team.cash)}${pr !== null ? ` · ${pr >= 0 ? 'profit' : 'loss'} of ${money(Math.abs(pr))} ${isOffseason(league) ? `in ${shortSeason(league.season)}` : 'so far'}` : ''}`,
    },
    {
      to: '/office/owner',
      icon: Crown,
      title: 'Owner',
      sub: js.off ? 'Job security off' : js.ultimatum ? `Ultimatum: ${js.ultimatum.text.toLowerCase()}` : `Job security ${js.score}/100 · ${js.label.toLowerCase()}`,
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
              <d.icon size={17} />
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
