// The Office hub: the GM's desk. Its poster is the cap position in your colours (the payroll as one
// giant figure over its bar against the cap and the tax line, the room and the tax under it) that
// opens the full cap sheet (the roster, the mid-level exception, the seasons ahead, the rules); then
// what the desk is doing
// now (the phase's headline and its action), the decisions waiting on it, and the desks as one list,
// each with a line of live status. The contracts table lives on Team → Roster → Contracts; the owner
// on his own desk.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP, TAX_BRACKET_PCT, TAX_RATES } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, fmtDate, freeAgents, payroll, playerName, prospects, shortName, teamPlayers, teamCity } from '../../core/league/helpers';
import { EXCEPTIONS, exceptionAmount, exceptionUsedReason, extensionBlockedReason } from '../../core/league/contracts';
import { bidOnException, expiringPlayers, signedThisSummer, signingClosedReason, userExceptionRoom } from '../../core/league/freeAgency';
import { draftOrder, nextPick } from '../../core/league/draft';
import { FA_DAYS, faDayNumber, faOver } from '../../core/league/season';
import { TAX_SHARE_TO_NON_TAXPAYERS, teamTaxBill } from '../../core/league/finances';
import { openProposals } from '../../core/league/proposals';
import { agenda, type AgendaKind } from '../../core/league/agenda';
import { seasonsInCharge } from '../../core/league/owner';
import { marketOpen } from '../../core/league/jobs';
import { useLeague, useLeagueMemo } from '../../state/store';
import { useBusy } from '../../state/actions/office';
import { Bar, CountUp, Section, Sheet, Statline } from '../components/ui';
import { AgendaRow, runAgenda } from '../components/Agenda';
import { AssistantCards } from '../components/Assistant';
import { Term } from '../components/Glossary';
import { CapBar, HelpSheet, capRoomFig, capSeason, contractsUp, floorText, payStatus, rosterFig, rosterSpots, shortSeason, taxFig } from '../office/common';
import { overallPick, pickProjection } from '../league/shared';
import { lotterySeen, picksText } from '../draft/common';
import { useFlowRunner } from '../useFlow';
import { seatOf } from '../office/seat';
import { money, moneyExact, plural } from '../../core/format';

/** The decisions the desk settles (the owner's and the job market's show on their desks' lines; the pick on the phase card). */
const OFFICE_AGENDA: AgendaKind[] = ['cuts', 'signings', 'tradeOffer'];

export default function Office() {
  const league = useLeague();
  const items = useLeagueMemo(() => agenda(league).filter((i) => OFFICE_AGENDA.includes(i.kind)), [league]);
  return (
    <main className="page fo-page fo-hub">
      {/* (the tab bar names the screen: the desk's state is its title) */}
      <h1 className="sr-only">Office</h1>
      {/* a decision the league waits on comes first, and so do offers to settle: the phase card's action steps down */}
      <CapCard league={league} />
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
  calm = false,
  children,
}: {
  over: ReactNode;
  live?: boolean;
  title: ReactNode;
  sub?: ReactNode;
  action?: Action;
  second?: Action;
  /** Nothing waits on it (a look ahead): its action is a plain button, the Continue bar stays the focus. */
  calm?: boolean;
  children?: ReactNode;
}) {
  const nav = useNavigate();
  const busy = useBusy();
  const quiet = useContext(Quiet) || calm;
  const button = (a: Action, primary: boolean, block: boolean) => (
    <button className={`btn ${block ? 'block' : ''} ${primary ? 'primary' : ''}`} disabled={!!a.run && busy} onClick={() => (a.run ? a.run() : nav(a.to!))}>
      {a.label}
    </button>
  );
  const single = !!action && !second;
  return (
    <section className={`fo-now fo-now-lead ${action && !quiet ? 'on' : ''}`} aria-label="Now">
      <div className="fo-now-main">
        <div className="grow">
          <div className="fo-now-over">
            <span className={live ? 'fo-live' : ''}>{over}</span>
          </div>
          <h2 className="fo-now-t">{title}</h2>
          {sub && <p className="fo-now-s">{sub}</p>}
          {children}
        </div>
        {single && button(action, !quiet, false)}
      </div>
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
    case 'preseason': {
      // the move that fits the roster: an open spot to fill, else a deal to extend, else a trade
      const open = CAP.rosterMax - rosterSpots(league).signed;
      const extendable = teamPlayers(league, tid).some((p) => !extensionBlockedReason(league, p));
      const action =
        open > 0
          ? { label: 'Sign free agents', to: '/office/free-agents' }
          : extendable
            ? { label: 'Extend players', to: '/office/resign' }
            : { label: 'Make a trade', to: '/office/trade' };
      return (
        <Now
          over="Preseason"
          title="Opening night is next"
          sub={`Signings, trades and extensions are open.${open > 0 ? ` ${plural(open, 'roster spot')} open.` : ''}`}
          action={action}
        />
      );
    }
    case 'regular': {
      const d = league.tradeDeadlineDay - league.day;
      if (d < 0)
        return (
          <Now
            over="Trade deadline passed"
            title="Trades locked"
            sub="Signings stay open to the end of the season."
            action={{ label: 'Sign free agents', to: '/office/free-agents' }}
            calm
          />
        );
      return (
        <Now
          over={d === 0 ? 'Trade deadline' : `Trade deadline · ${fmtDate(league.season, league.tradeDeadlineDay)}`}
          title={d === 0 ? 'Last day to trade' : `${plural(d, 'day')} left`}
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
          calm
        />
      );
    }
    case 'draftLottery': {
      const mine = draftOrder(league).filter((d) => d.tid === tid);
      return (
        <Now
          over="Draft lottery"
          title={mine.length ? `${plural(mine.length, 'pick')} this year` : 'No picks this year'}
          // (until the lottery's reveal has played on the Draft desk, where the user picks is its to tell)
          sub={!lotterySeen(league) ? 'The lottery is in: see where you pick.' : mine.length ? `${picksText(league, mine)}. Draft night is next.` : 'Draft night is next.'}
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

/** Where the payroll stands for the season new deals count against: the cap and the tax line. */
function capPosition(league: League) {
  const s0 = capSeason(league);
  const cap = CAP_FOR(league, s0);
  const pay = payroll(league, league.userTid, s0);
  return { s0, cap, pay, space: cap.salaryCap - pay, status: payStatus(pay, cap) };
}

/**
 * The cap position at a glance: the payroll as the desk's one big figure, the bar against the cap
 * and the tax line, and the room in a line. The whole sheet (figures, the mid-level, the seasons
 * ahead, the rules) is one tap down.
 */
function CapCard({ league }: { league: League }) {
  const [open, setOpen] = useState(false);
  const { s0, cap, pay, space, status } = capPosition(league);
  const bill = teamTaxBill(league, league.userTid, pay, s0);
  return (
    <>
      {/* the desk's poster: the payroll in your colours, as big as it fits; the whole sheet one tap down */}
      <button className="slab fo-capslab" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="fo-capslab-top">
          <span className="over">{shortSeason(s0)} payroll</span>
          <span className="fo-capslab-go">
            Cap sheet <ChevronRight size={15} aria-hidden="true" />
          </span>
        </span>
        <span className="fo-capslab-v num">
          <CountUp value={money(pay)} ms={700} />
        </span>
        <span className="fo-capslab-status">{status.label}</span>
        <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} legend={false} />
        <span className="statline fo-capslab-figs">
          <span>
            <span className="k">{space >= 0 ? 'Cap space' : 'Over the cap'}</span>
            <span className="v">
              <CountUp value={money(Math.abs(space))} />
            </span>
          </span>
          {pay > cap.luxuryTax ? (
            <span>
              <span className="k">Tax bill</span>
              <span className="v">
                <CountUp value={money(bill)} />
              </span>
            </span>
          ) : (
            <span>
              <span className="k">Under the tax</span>
              <span className="v">
                <CountUp value={money(cap.luxuryTax - pay)} />
              </span>
            </span>
          )}
        </span>
        {/* (under the salary floor the difference is paid at the season's end anyway) */}
        {floorText(pay, cap) && <span className="fo-capslab-floor">{floorText(pay, cap)}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${shortSeason(s0)} cap sheet`}>
        <CapSheet league={league} />
      </Sheet>
    </>
  );
}

/** The cap sheet in full: the bar with its lines named, the room, the tax and the roster, the mid-level, the seasons ahead. */
function CapSheet({ league }: { league: League }) {
  const tid = league.userTid;
  const team = league.teams[tid];
  const { s0, cap, pay, space, status } = capPosition(league);
  const dead = team.deadMoney.filter((d) => d.season === s0).reduce((a, d) => a + d.amount, 0);
  return (
    <div className="fo-capsheet fo-statement">
      <div className="fo-pay">
        <div className="grow">
          <div className="over">Payroll{dead > 0 ? ` · incl. ${money(dead)} dead money` : ''}</div>
          {/* (the figure as it stands, no count-up: two payrolls caught mid-count read as two different payrolls) */}
          <div className="fo-pay-v num">{money(pay)}</div>
        </div>
        <span className={`tag ${status.tone}`}>{status.label}</span>
      </div>
      <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} legend="lines" />
      <Statline
        items={[
          capRoomFig(space),
          taxFig(pay, cap.luxuryTax, teamTaxBill(league, tid, pay, s0)),
          // on the season the money is about: signed for it, the expiring deals beside them
          rosterFig(league),
        ]}
      />
      <MidLevel league={league} season={s0} />
      <SeasonsAhead league={league} from={s0 + 1} />
      <div className="fo-capsheet-foot">
        <Link to="/team?view=contracts" className="card-link">
          Contracts <ChevronRight size={14} />
        </Link>
        <span className="row fo-capsheet-help">
          How the cap works <CapHelp league={league} season={s0} />
        </span>
      </div>
    </div>
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
          <Term id="cap">Cap</Term>
        </span>
      </div>
      {[from, from + 1, from + 2].map((s) => {
        const pay = payroll(league, tid, s);
        const room = CAP_FOR(league, s).salaryCap - pay;
        return (
          <div key={s} className="fo-next-row" role="row">
            <span className="dim2" role="cell">
              {shortSeason(s)}
            </span>
            <span className="num" role="cell">
              {money(pay)}
            </span>
            {/* never a negative room: over by, or the space left */}
            <span role="cell">
              <span className="fo-next-k">{room >= 0 ? 'space' : 'over'}</span> <b className={`num ${room >= 0 ? 'good' : 'warn'}`}>{money(Math.abs(room))}</b>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The mid-level exception: what it pays now, or in a few words why it's gone (used, or held for a pending offer). */
function MidLevel({ league, season }: { league: League; season: number }) {
  const room = userExceptionRoom(league, 'mle', season);
  const bid = bidOnException(league, 'mle');
  const why = exceptionUsedReason(league, league.userTid, season) ? 'used this season' : bid ? `held for your offer to ${playerName(league.players[bid.pid])}` : null;
  return (
    <div className="fo-exc">
      <div className="fo-exc-row">
        <span className="over">
          <Term id="mle">Mid-level</Term>
        </span>
        {why ? <span className="dim2">{why}</span> : <span className="num bold good">{money(room)}</span>}
      </div>
    </div>
  );
}

/** The cap rules in full, behind the cap sheet's "?". */
function CapHelp({ league, season }: { league: League; season: number }) {
  const cap = CAP_FOR(league, season);
  return (
    <HelpSheet title="How the cap works">
      <p>
        <b>Soft cap · {money(cap.salaryCap)}.</b> Sign free agents with cap space, or over the cap for the minimum. Minimum deals run up to {moneyExact(cap.vetMin)}. The cap sheet
        shows the season new deals count against. From the draft lottery on, that is next season.
      </p>
      <p>
        <b>Mid-level.</b> Once a season, sign one free agent even over the cap. He gets up to {money(exceptionAmount(league, 'mle', season))} for {EXCEPTIONS.mle.years} years.
      </p>
      <p>
        <b>Bird rights.</b> Re-sign your own players in the re-sign period, even over the cap. After three seasons with you, he can get his max for five years with 8% raises. A
        trade keeps his clock. After two seasons, Early Bird: up to 175% of his salary or 105% of the league average. After one, up to 120% of his salary. Anyone else signs for
        four years at most, with 5% raises.
      </p>
      <p>
        <b>The max.</b> 25% of the cap up to six seasons in the league, 30% for seven to nine, 35% from ten. All-League, MVP or Defensive Player of the Year honors raise it with
        his own team.
      </p>
      <p>
        <b>Luxury tax · {money(cap.luxuryTax)}.</b> Paid at the end of the regular season, by brackets of {money(cap.salaryCap * TAX_BRACKET_PCT)} over the line. The rates run{' '}
        {TAX_RATES.join('×, ')}×, then 0.5 more for each bracket after. A repeater pays 1 more on every bracket. A repeater paid the tax in three of the last four seasons.{' '}
        {Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}% of the pot goes to the teams under the line.
      </p>
      <p>
        <b>Trades.</b> A team under the cap after a trade takes back any salary. Over it, up to {Math.round(CAP.tradeMatch * 100)}% of the salary it sends, plus{' '}
        {money(cap.salaryCap * CAP.tradeMatchBufferPct)}.
      </p>
      <p>
        <b>Releases.</b> A released player is a free agent at once. What he is still owed stays on your payroll as dead money.
      </p>
      <p>
        <b>Rosters.</b> {CAP.rosterMin}-{CAP.rosterMax} players in season, up to {OFFSEASON_ROSTER_MAX} in the offseason. Minimum deals for the coming season aren&apos;t guaranteed
        until opening night. First-round picks sign rookie-scale deals: 4 years, a team option on the last.
      </p>
      <p>The cap, tax line and minimums grow 6% a season.</p>
    </HelpSheet>
  );
}

// ------------------------------------------------------------------ the desks

interface Desk {
  to: string;
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
  // the contracts the Re-sign desk lists
  const up = contractsUp(league);
  const expiring = up.players.length;
  const jobOffers = league.jobOffers?.season === league.season ? league.jobOffers.offers.length : 0;
  // openings that rate him level with their hire: his to ask about until the draft (Career → Jobs)
  const jobAsks = marketOpen(league) ? league.jobMarket!.openings.filter((o) => o.status === 'listen').length : 0;
  const seasonsIn = seasonsInCharge(league);

  const desks: Desk[] = [
    {
      to: '/office/trade',
      title: 'Trade',
      // the offers themselves are the decisions above: this line points at them
      sub: inPost ? 'Frozen in the postseason' : pastDeadline ? 'Locked until the lottery' : offers ? `${plural(offers, 'offer')} waiting` : 'No offers waiting',
      muted: inPost || pastDeadline,
    },
    {
      to: '/office/free-agents',
      title: 'Free agents',
      sub: signingClosed ? `${market.length} on the market · signings closed` : `${market.length} on the market${market.length ? ` · best ${best} OVR` : ''}`,
      hot: league.phase === 'freeAgency',
      muted: signingClosed,
    },
    {
      to: '/office/resign',
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
      title: 'Draft',
      sub: after
        ? drafted.length
          ? `You drafted ${drafted.map((p) => shortName(league, p)).join(', ')}`
          : 'No picks this year'
        : league.phase === 'draftLottery' && !lotterySeen(league)
          ? 'The lottery is in'
          : [
              league.phase === 'draft' ? 'Draft night' : '',
              !thisDraft.length
                ? 'No picks this year'
                : thisDraft.every((d) => !d.pick && proj(d) === undefined)
                  ? `${plural(thisDraft.length, 'pick')} this year`
                  : `${draftNight ? 'You pick' : thisDraft.some((d) => !d.pick) ? 'Your picks project' : 'Your picks:'} ${picksText(league, thisDraft, proj)}`,
              // (the picks say enough when there are some: the prospects count stands in when there aren't)
              draftNight || thisDraft.some((d) => d.pick || proj(d) !== undefined) ? '' : `${prospectsN} prospects`,
            ]
              .filter(Boolean)
              .join(' · '),
      hot: draftNight,
    },
    {
      to: '/office/assets',
      title: 'Picks & moves',
      // (the moves themselves are its second tab)
      sub: `${plural(myPicks.length, 'pick')} · ${firsts} in the 1st round`,
    },
    {
      to: '/office/owner',
      title: 'Owner',
      sub: js.off ? 'Job security off' : js.ultimatum ? `Ultimatum: ${js.ultimatum.text.toLowerCase()}` : `Job security ${js.score}/100 · ${js.label.toLowerCase()}`,
      tone: js.off ? undefined : js.ultimatum || js.heat === 'hot' ? 'bad' : js.heat === 'warm' ? 'warn' : undefined,
    },
    {
      to: jobAsks && !jobOffers ? '/office/career?tab=jobs' : '/office/career',
      title: 'Career',
      sub: jobOffers
        ? `${plural(jobOffers, 'job offer')} · lapse${jobOffers === 1 ? 's' : ''} at the draft`
        : jobAsks
          ? `${plural(jobAsks, 'opening')} would hear you out · until the draft`
          : seasonsIn < 1
            ? `Your ${teamCity(league, team)} tenure starts next season`
            : `Season ${seasonsIn} with ${teamCity(league, team)}`,
      tone: jobOffers ? 'good' : undefined,
      hot: jobOffers > 0,
    },
  ];

  return (
    <Section title="Desks">
      <nav className="card flush fo-desks m-stagger" aria-label="Desks">
        {desks.map((d) => (
          <Link key={d.to} to={d.to} className={`fo-dept ${d.hot ? 'hot' : ''} ${d.muted ? 'muted' : ''}`}>
            <span className="grow">
              <span className="fo-dept-t">{d.title}</span>
              <span className={`fo-dept-s ${d.tone ?? ''}`}>{d.sub}</span>
            </span>
            <ChevronRight size={18} className="fo-dept-go" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </Section>
  );
}
