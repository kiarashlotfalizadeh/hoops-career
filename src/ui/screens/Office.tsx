// The Office hub: the GM's desk. Its poster is the cap position in your colours (the payroll as one
// giant figure over its bar against the cap and the tax line, the room and the tax under it) that
// opens the full cap sheet (the aprons, the roster, the exceptions open and why the others aren't, a
// hard cap, the traded player exceptions, the seasons ahead, the rules); then what the desk is doing
// now (the phase's headline and its action), the decisions waiting on it, and the desks as one list,
// each with a line of live status. The contracts table lives on Team → Roster → Contracts; the owner
// on his own desk.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP, TAX_BRACKET_PCT, TAX_RATES } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, fmtDate, freeAgents, payroll, playerName, prospects, shortName, teamPlayers } from '../../core/league/helpers';
import { EXCEPTIONS, EXCEPTION_ORDER, exceptionAmount, exceptionUsedShort, extensionBlockedReason, hardCapLine } from '../../core/league/contracts';
import { bidOnException, capHolds, expiringPlayers, signedThisSummer, signingClosedReason, userExceptionRoom } from '../../core/league/freeAgency';
import { HARDSHIP_OUT } from '../../core/league/tenDay';
import { draftOrder, nextPick } from '../../core/league/draft';
import { FA_DAYS, faDayNumber, faOver } from '../../core/league/season';
import { TAX_SHARE_TO_NON_TAXPAYERS, profit, teamTaxBill } from '../../core/league/finances';
import { openTpes } from '../../core/league/trades';
import { openProposals } from '../../core/league/proposals';
import { agenda, type AgendaKind } from '../../core/league/agenda';
import { seasonsInCharge } from '../../core/league/owner';
import { useLeague, useLeagueMemo } from '../../state/store';
import { useBusy } from '../../state/actions/office';
import { Bar, Section, Sheet, Statline } from '../components/ui';
import { AgendaRow, runAgenda } from '../components/Agenda';
import { AssistantCards } from '../components/Assistant';
import { Term } from '../components/Glossary';
import { CapBar, HelpSheet, capRoomFig, capSeason, contractsUp, isOffseason, payStatus, rosterFig, rosterSpots, shortSeason, taxFig } from '../office/common';
import { overallPick, pickProjection } from '../league/shared';
import { lotterySeen, picksText } from '../draft/common';
import { useFlowRunner } from '../useFlow';
import { seatOf } from '../office/seat';
import { money, moneyExact, plural } from '../../core/format';

/** The decisions the desk settles (the owner's and the job market's show on their desks' lines; the pick on the phase card). */
const OFFICE_AGENDA: AgendaKind[] = ['cuts', 'signings', 'twoWays', 'offerSheet', 'tenDay', 'tradeOffer'];

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

/** Where the payroll stands for the season new deals count against: the cap, the tax line, the holds. */
function capPosition(league: League) {
  const tid = league.userTid;
  const s0 = capSeason(league);
  const cap = CAP_FOR(league, s0);
  const pay = payroll(league, tid, s0);
  // between the season and free agency, own expiring players hold cap room until renounced
  const holds = capHolds(league, tid).reduce((a, h) => a + h.amount, 0);
  const space = cap.salaryCap - pay - holds;
  // (cap holds count against the cap, not toward the tax or the aprons)
  const status = pay + holds > cap.salaryCap && pay <= cap.salaryCap ? { label: 'Over the cap', tone: 'warn' as const } : payStatus(pay, cap);
  return { s0, cap, pay, holds, space, status };
}

/**
 * The cap position at a glance: the payroll as the desk's one big figure, the bar against the cap
 * and the tax line, and the room in a line. The whole sheet (figures, exceptions, the seasons
 * ahead, the rules) is one tap down.
 */
function CapCard({ league }: { league: League }) {
  const [open, setOpen] = useState(false);
  const { s0, cap, pay, holds, space, status } = capPosition(league);
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
        <span className="fo-capslab-v num">{money(pay)}</span>
        <span className="fo-capslab-status">{status.label}</span>
        <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={holds} legend={false} />
        <span className="statline fo-capslab-figs">
          <span>
            <span className="k">{space >= 0 ? 'Cap space' : 'Over the cap'}</span>
            <span className="v">{money(Math.abs(space))}</span>
          </span>
          {pay > cap.luxuryTax ? (
            <span>
              <span className="k">Tax bill</span>
              <span className="v">{money(bill)}</span>
            </span>
          ) : (
            <span>
              <span className="k">Under the tax</span>
              <span className="v">{money(cap.luxuryTax - pay)}</span>
            </span>
          )}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${shortSeason(s0)} cap sheet`}>
        <CapSheet league={league} />
      </Sheet>
    </>
  );
}

/** The cap sheet in full: the bar with its lines named, the room, the tax and the roster, the exceptions, a hard cap and traded player exceptions, the seasons ahead. */
function CapSheet({ league }: { league: League }) {
  const tid = league.userTid;
  const team = league.teams[tid];
  const { s0, cap, pay, holds, space, status } = capPosition(league);
  const dead = team.deadMoney.filter((d) => d.season === s0).reduce((a, d) => a + d.amount, 0);
  const hard = hardCapLine(league, tid, s0);
  const tpes = openTpes(league, tid);
  return (
    <div className="fo-capsheet fo-statement">
      <div className="fo-pay">
        <div className="grow">
          <div className="over">Payroll{dead > 0 ? ` · incl. ${money(dead)} dead money` : ''}</div>
          <div className="fo-pay-v num">{money(pay)}</div>
        </div>
        {/* cap holds count against the cap (trades treat the team as over it), not toward the tax */}
        <span className={`tag ${status.tone}`}>{status.label}</span>
      </div>
      <CapBar
        pay={pay}
        cap={cap.salaryCap}
        tax={cap.luxuryTax}
        aprons={{ first: cap.firstApron, second: cap.secondApron }}
        add={holds}
        addLabel={<Term id="hold">Cap holds</Term>}
        legend="lines"
      />
      <Statline
        items={[
          { ...capRoomFig(space), s: holds > 0 ? `after ${money(holds)} in holds` : undefined },
          taxFig(pay, cap.luxuryTax, teamTaxBill(league, tid, pay, s0)),
          // on the season the money is about: signed for it, the expiring deals beside them
          rosterFig(league),
        ]}
      />
      <Exceptions league={league} season={s0} />
      {(hard || tpes.length > 0) && (
        <div className="tiny dim">
          {hard ? `Hard-capped at the ${hard.name} (${money(hard.amount)}) for ${shortSeason(s0)}: you used the ${hard.what}.` : ''}
          {hard && tpes.length ? ' ' : ''}
          {tpes.length
            ? `${tpes.length > 1 ? 'Traded player exceptions' : 'Traded player exception'}: ${tpes.map((x) => `${money(x.amount)} until ${fmtDate(x.season + 1, x.day)}`).join(', ')}.`
            : ''}
        </div>
      )}
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
          ? k === 'tmle'
            ? 'over the second apron'
            : 'over the first apron'
          : null);
    return { k, room, why };
  });
  // the taxpayer mid-level only matters once the full one can't pay it (past the first apron)
  const mle = rows.find((r) => r.k === 'mle')!;
  const tmle = rows.find((r) => r.k === 'tmle')!;
  if (!mle.why && mle.room >= tmle.room) tmle.why = null;
  const shown = rows.filter((r) => r.k !== 'tmle' || mle.why || mle.room < tmle.room);
  const open = shown.filter((r) => !r.why).sort((a, b) => b.room - a.room);
  // the room exception's usual state (no cap-space signing yet) says nothing: it's left out
  const closed = shown.filter((r) => r.why && !(r.k === 'room' && r.why === ROOM_IDLE) && !(r.k === 'tmle' && !mle.why));
  // the same reason once, for the exceptions it closes, biggest first: "Mid-level, bi-annual: over the first apron"
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
        <b>Mid-level.</b> Once a season, for a team that stays under the first apron ({money(cap.firstApron)}): one free agent up to {money(exceptionAmount(league, 'mle', season))}{' '}
        ({pct('mle')}% of the cap, {EXCEPTIONS.mle.years} years), even over the cap. It hard-caps the team at the first apron for the season. A team it would take past the first
        apron gets the <b>taxpayer mid-level</b> instead: up to {money(exceptionAmount(league, 'tmle', season))} ({pct('tmle')}%), {EXCEPTIONS.tmle.years} years, under the second
        apron ({money(cap.secondApron)}), hard-capped there.
      </p>
      <p>
        <b>Room exception.</b> Sign a free agent with cap space and the mid-level is gone for the season; this replaces it: one signing up to{' '}
        {money(exceptionAmount(league, 'room', season))} ({pct('room')}%), {EXCEPTIONS.room.years} years.
      </p>
      <p>
        <b>Bi-annual.</b> One signing up to {money(exceptionAmount(league, 'bae', season))} ({pct('bae')}%), {EXCEPTIONS.bae.years} years, for a team under the first apron after
        it: not two seasons running, nor with the room exception. Like the mid-level, it hard-caps the team at the first apron that season.
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
        <b>Bird rights.</b> Re-sign your own players in the re-sign period, even over the cap: after three seasons with you (a trade keeps his clock) up to his max, for up to five
        years with 8% raises; after two (Early Bird) up to 175% of his salary or 105% of the league average; after one, 120% of his salary. Anyone else signs for four years at
        most, with 5% raises. Until free agency opens (or you renounce them), each holds cap room at about his ask: the striped part of the bar.
      </p>
      <p>
        <b>The max.</b> 25% of the cap up to six seasons in the league, 30% for seven to nine, 35% from ten. With All-NBA, MVP or Defensive Player of the Year honors, his own team
        can pay a player off his rookie deal 30%, and one with seven to nine seasons 35% (the supermax). A player worth about the max asks it of every team: where he signs is up to
        how much he likes each.
      </p>
      <p>
        <b>Restricted free agents.</b> A young player you qualify can still be re-signed in free agency, and you can match any offer sheet he signs. His cap hold (the larger of the
        offer and his ask) stays until he signs or you withdraw the offer; an offer sheet you sign holds its room until his team decides.
      </p>
      <p>
        <b>Luxury tax ({money(cap.luxuryTax)}).</b> Paid at the end of the regular season by brackets of {money(cap.salaryCap * TAX_BRACKET_PCT)} over the line:{' '}
        {TAX_RATES.join('×, ')}× and 0.5 more for each after. A repeater (a taxpayer in three of the last four seasons) pays 1 more on every bracket.{' '}
        {Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}% of the pot goes to the teams under it. Cap holds don't count toward it.
      </p>
      <p>
        <b>
          Aprons ({money(cap.firstApron)}, {money(cap.secondApron)}).
        </b>{' '}
        Over the first apron after a deal, a team takes back no more salary than it sends, and has no bi-annual and only the taxpayer mid-level. Over the second it can't combine
        salaries to take back a bigger one, send cash, use a traded player exception or trade its first in the furthest draft on the books, and has no mid-level at all.
      </p>
      <p>
        <b>Trades.</b> A team over the cap after a trade takes back up to 200% of a small salary it sends (up to {money(cap.salaryCap * 0.0485)}) plus{' '}
        {money(cap.salaryCap * CAP.tradeMatchBufferPct)}, what it sends plus {money(cap.salaryCap * 0.0485)} up to {money(cap.salaryCap * 0.1875)}, and 125% plus{' '}
        {money(cap.salaryCap * CAP.tradeMatchBufferPct)} above that. Sending out more than it takes back leaves it a <Term id="tpe">traded player exception</Term> for the
        difference, for a year.
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
      to: '/office/finances',
      title: 'Finances',
      sub: `Cash ${money(team.cash)}${pr !== null ? ` · ${pr >= 0 ? 'profit' : 'loss'} ${money(Math.abs(pr))}${isOffseason(league) ? ` in ${shortSeason(league.season)}` : ' so far'}` : ''}`,
    },
    {
      to: '/office/owner',
      title: 'Owner',
      sub: js.off ? 'Job security off' : js.ultimatum ? `Ultimatum: ${js.ultimatum.text.toLowerCase()}` : `Job security ${js.score}/100 · ${js.label.toLowerCase()}`,
      tone: js.off ? undefined : js.ultimatum || js.heat === 'hot' ? 'bad' : js.heat === 'warm' ? 'warn' : undefined,
    },
    {
      to: '/office/career',
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
    <Section title="Desks">
      <nav className="card flush fo-desks" aria-label="Desks">
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
