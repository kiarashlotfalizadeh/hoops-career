import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  type LucideIcon,
  ArrowLeftRight,
  ChevronRight,
  History as HistoryIcon,
  ListOrdered,
  MessageCircle,
  PenLine,
  PiggyBank,
  TriangleAlert,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type { League, Player } from '../../core/types';
import { CAP, PHASE_LABEL, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, fmtDate, freeAgents, payroll, playerName, rosterMaxNow, teamPlayers, standardRoster, twoWayRoster } from '../../core/league/helpers';
import {
  EXCEPTIONS,
  EXCEPTION_ORDER,
  askingContract,
  buyoutTerms,
  capSpace,
  extensionBlockedReason,
  exceptionAmount,
  exceptionUsedReason,
  nonGuaranteed,
  releaseBlockedReason,
  releaseDeadMoney,
  rookieScaleDeal,
  stretchDeadMoney,
  valueScore,
} from '../../core/league/contracts';
import { bidOnException, capHolds, expiringPlayers, offerRoute, signingClosedReason, userExceptionRoom } from '../../core/league/freeAgency';
import { HARDSHIP_OUT } from '../../core/league/tenDay';
import { draftOrder, nextPick } from '../../core/league/draft';
import { FA_DAYS, faDayNumber } from '../../core/league/season';
import { TAX_SHARE_TO_NON_TAXPAYERS } from '../../core/league/finances';
import { untradeableReason } from '../../core/league/trades';
import { promiseStatus, wantsMeeting } from '../../core/league/morale';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { More, Ovr, PageHeader, Section, Sheet, Statline } from '../components/ui';
import {
  CapBar,
  CenterBar,
  Callout,
  Gauge,
  HelpSheet,
  Line,
  PlayerHead,
  ReleaseConfirm,
  capSeason,
  contractUpNote,
  contractYearsLabel,
  deadlineLabel,
  fmtGrade,
  fmtM,
  isOffseason,
  openOption,
  ownerVerdict,
  playerMeta,
  shortSeason,
  tradeClosedNote,
} from '../office/common';
import { ContractSheet } from '../office/ContractSheet';
import { overallPick } from '../league/shared';
import { UntouchableToggle } from '../office/Untouchable';
import { MeetingPanel } from '../office/PlayerMeeting';
import { SheetDecision } from '../office/RfaPanel';
import { TenDayActions, tenDayLabel, tenDayLine } from '../office/TenDayPanel';
import { pendingSheets, qualifyBlockedReason, restrictedFreeAgents } from '../../core/league/rfa';
import { rosterNames } from '../stats';
import { useFlowRunner } from '../useFlow';

interface Dept {
  to: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  /** Where the work is right now. */
  hot?: boolean;
  /** Closed for now (trading after the deadline, signings out of season). */
  muted?: boolean;
}

export default function Office() {
  const league = useLeague();
  const tid = league.userTid;
  const team = league.teams[tid];
  const s0 = capSeason(league);
  const cap = CAP_FOR(league, s0);
  const pay = payroll(league, tid, s0);
  const roster = standardRoster(league, tid);
  const twoWays = twoWayRoster(league, tid).length;
  // between the season and free agency, own expiring players hold cap room until renounced
  const holds = capHolds(league, tid).reduce((a, h) => a + h.amount, 0);
  const space = cap.salaryCap - pay - holds;
  // in the offseason, count the players actually under contract for next season
  const signedN = isOffseason(league) ? roster.filter((p) => contractExp(p.contract) >= s0).length : roster.length;
  const expiringN = roster.length - signedN;
  const tax = pay > cap.luxuryTax ? Math.round((pay - cap.luxuryTax) * CAP.taxRate) : 0;
  const exc = bestException(league, s0);
  const inSeasonNow = rosterMaxNow(league) === CAP.rosterMax;
  const [sel, setSel] = useState<number | null>(null);
  // the player whose extension is being negotiated (from his contract sheet)
  const [ext, setExt] = useState<number | null>(null);

  const faCount = useLeagueMemo(() => freeAgents(league).length, [league]);
  const signingClosed = !!signingClosedReason(league);
  const myPicks = league.draftPicks.filter((d) => d.tid === tid);
  const expiring = league.phase === 'resign' ? expiringPlayers(league, tid) : [];
  // players in the final season of their deals who can be extended now (see Re-sign)
  const extendable = useLeagueMemo(() => teamPlayers(league, tid).filter((p) => !extensionBlockedReason(league, p)).length, [league, tid]);
  const inPost = league.phase === 'playin' || league.phase === 'playoffs';
  const pastDeadline = league.phase === 'regular' && league.day > league.tradeDeadlineDay;
  const thisDraftPicks = myPicks.filter((d) => d.season === league.season && d.pick).sort((a, b) => a.round - b.round || a.pick! - b.pick!);
  const over = pay > cap.luxuryTax ? 'tax' : pay + holds > cap.salaryCap ? 'cap' : 'under';

  const depts: Dept[] = [
    {
      to: '/trade',
      icon: ArrowLeftRight,
      title: 'Trade',
      sub: inPost ? 'Frozen in the postseason' : pastDeadline ? 'Deadline passed' : (deadlineLabel(league) ?? 'Open for business'),
      muted: inPost || pastDeadline,
    },
    {
      to: '/free-agents',
      icon: UserPlus,
      title: 'Free agents',
      sub:
        league.phase === 'freeAgency'
          ? `Day ${faDayNumber(league)} of ${FA_DAYS} · ${faCount} left`
          : signingClosed
            ? `${faCount} on the market · signings closed`
            : `${faCount} available · ${space > 0 ? `${fmtM(space)} space` : exc ? `${EXCEPTIONS[exc.k].short} ${fmtM(exc.room)}` : 'min deals only'}`,
      hot: league.phase === 'freeAgency',
      muted: signingClosed,
    },
    {
      to: '/resign',
      icon: PenLine,
      title: 'Re-sign',
      sub:
        league.phase === 'resign'
          ? expiring.length
            ? `${expiring.length} expiring · negotiate now`
            : 'Nothing to re-sign'
          : extendable > 0
            ? `${extendable} can be extended now`
            : league.phase === 'freeAgency'
              ? 'Closed until next summer'
              : 'Opens after the draft',
      hot: league.phase === 'resign' && expiring.length > 0,
      muted: league.phase !== 'resign' && !extendable,
    },
    {
      to: '/draft',
      icon: ListOrdered,
      title: 'Draft',
      sub: thisDraftPicks.length
        ? `You pick ${thisDraftPicks.map((d) => `#${overallPick(league, d.round, d.pick!)}`).join(', ')}`
        : `${myPicks.length} pick${myPicks.length === 1 ? '' : 's'} owned`,
      hot: league.phase === 'draft' || league.phase === 'draftLottery',
    },
    { to: '/finances', icon: PiggyBank, title: 'Finances', sub: `Cash ${fmtM(team.cash)} · budget, tickets` },
    { to: '/history', icon: HistoryIcon, title: 'History', sub: 'Seasons, awards and records' },
  ];

  const om = league.ownerMood;
  const verdict = ownerVerdict(om.total);

  return (
    <main className="page fo-page">
      <PageHeader title="Front Office" sub={`${seasonLabel(league.season)} · ${PHASE_LABEL[league.phase]}`} />

      <Spotlight league={league} />

      <Section title={`${seasonLabel(s0)} cap sheet`} right={<CapHelp league={league} season={s0} />}>
        {/* the class the QA scripts look for: the cap sheet is the first .fo-hero after the phase card */}
        <div className="card fo-capsheet fo-hero">
          <div className="fo-pay">
            <div className="grow">
              <div className="over">Payroll</div>
              <div className="fo-pay-v num">{fmtM(pay)}</div>
            </div>
            {/* cap holds count against the cap (trades treat the team as over it), not toward the tax */}
            <span className={`tag ${over === 'tax' ? 'bad' : over === 'cap' ? 'warn' : 'good'}`}>
              {over === 'tax' ? 'Taxpayer' : over === 'cap' ? 'Over the cap' : 'Under the cap'}
            </span>
          </div>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={holds} legend={false} />
          <div className="fo-cap-ends num">
            Cap {fmtM(cap.salaryCap)} · tax line {fmtM(cap.luxuryTax)}
          </div>
          {holds > 0 && (
            <div className="tiny dim">
              Striped: {fmtM(holds)} in cap holds for{' '}
              {league.phase === 'freeAgency'
                ? [restrictedFreeAgents(league, tid).length ? 'restricted free agents' : '', pendingSheets(league, tid).length ? 'offer sheets' : ''].filter(Boolean).join(' and ')
                : 'expiring players'}
              .
            </div>
          )}
          {/* two by two: a phone's width gives each figure its line of detail in full */}
          <div className="fo-figs">
            <Statline
              items={[
                {
                  k: 'Cap space',
                  v: fmtM(space),
                  color: space >= 0 ? 'var(--good)' : 'var(--warn)',
                  s: holds > 0 ? 'after cap holds' : space > 0 ? 'to spend' : exc ? `or the ${EXCEPTIONS[exc.k].short} ${fmtM(exc.room)}` : 'min deals only',
                },
                {
                  k: isOffseason(league) ? `Roster ${shortSeason(s0)}` : 'Roster',
                  v: `${signedN}/${CAP.rosterMax}`,
                  color: signedN > rosterMaxNow(league) ? 'var(--bad)' : signedN > CAP.rosterMax || signedN < CAP.rosterMin ? 'var(--warn)' : undefined,
                  s: [
                    expiringN > 0 ? `+${expiringN} expiring` : '',
                    // too many under contract matters even while some deals are expiring
                    signedN > CAP.rosterMax
                      ? inSeasonNow
                        ? `${signedN - CAP.rosterMax} over`
                        : `${signedN - CAP.rosterMax} to cut`
                      : expiringN > 0
                        ? ''
                        : signedN < CAP.rosterMin
                          ? `need ${CAP.rosterMin - signedN}`
                          : `${CAP.rosterMax - signedN} open`,
                    twoWays ? `${twoWays} two-way` : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                },
              ]}
            />
            <Statline
              items={[
                tax > 0
                  ? { k: 'Tax bill', v: fmtM(tax), color: 'var(--bad)', s: `estimate · ${fmtM(pay - cap.luxuryTax)} over` }
                  : { k: 'Under tax', v: fmtM(cap.luxuryTax - pay), s: 'room to the line' },
                { k: 'Cash', v: fmtM(team.cash), color: team.cash < 0 ? 'var(--bad)' : undefined, s: 'in the bank' },
              ]}
            />
          </div>
          <ExceptionsBlock league={league} season={s0} />
        </div>
      </Section>

      <nav className="card flush" aria-label="Front office">
        <div className="list wide2">
          {depts.map((d) => (
            <Link key={d.to} to={d.to} className={`fo-dept ${d.hot ? 'hot' : ''} ${d.muted ? 'muted' : ''}`}>
              <span className="fo-dept-ic" aria-hidden="true">
                <d.icon size={18} />
              </span>
              <span className="grow">
                <span className="fo-dept-t">{d.title}</span>
                <span className="fo-dept-s">{d.sub}</span>
              </span>
              {d.hot && <span className="tag brand">Now</span>}
              <ChevronRight size={16} className="dim" />
            </Link>
          ))}
        </div>
      </nav>

      <Section title="Owner">
        <Link to="/owner" className="card fo-owner" aria-label={`Owner: ${verdict.label}, standing ${fmtGrade(om.total)}`}>
          <Gauge value={om.total} size={104} />
          <div className="grow fo-owner-bars">
            {(
              [
                ['Wins', om.wins],
                ['Playoffs', om.playoffs],
                ['Money', om.money],
                // the development goals' part, once a season had one
                ...(om.youth !== undefined ? [['Youth', om.youth] as const] : []),
              ] as const
            ).map(([k, val]) => (
              <div key={k} className="fo-owner-row">
                <span className="over">{k}</span>
                <CenterBar value={val} />
                {/* the number, not just the bar's colour */}
                <span className="num">{fmtGrade(val)}</span>
              </div>
            ))}
          </div>
          <ChevronRight size={16} className="dim" />
        </Link>
      </Section>

      <ContractsTable league={league} onPick={setSel} />

      <PlayerContractSheet pid={sel} onClose={() => setSel(null)} onExtend={(pid) => (setSel(null), setExt(pid))} />
      <ContractSheet pid={ext} mode="extend" onClose={() => setExt(null)} />
    </main>
  );
}

/** The cap rules in full, behind the cap sheet's "?". */
function CapHelp({ league, season }: { league: League; season: number }) {
  const cap = CAP_FOR(league, season);
  const pct = (k: keyof typeof EXCEPTIONS) => Math.round(EXCEPTIONS[k].pct * 1000) / 10;
  return (
    <HelpSheet title="How the cap works">
      <p>
        <b>Soft cap ({fmtM(cap.salaryCap)}).</b> Sign free agents with cap space, or for the minimum (up to {fmtM(cap.vetMin, 2)}) over it.
      </p>
      <p>
        <b>Mid-level.</b> Once a season, for a team that stays under the tax line: one free agent up to {fmtM(exceptionAmount(league, 'mle', season))} ({pct('mle')}% of the cap,{' '}
        {EXCEPTIONS.mle.years} years), even over the cap. For the rest of that season, trades can't take its payroll past the tax line.
      </p>
      <p>
        <b>Room exception.</b> Sign a free agent with cap space and the mid-level is gone for the season; this replaces it: one signing up to{' '}
        {fmtM(exceptionAmount(league, 'room', season))} ({pct('room')}%), {EXCEPTIONS.room.years} years.
      </p>
      <p>
        <b>Bi-annual.</b> One signing up to {fmtM(exceptionAmount(league, 'bae', season))} ({pct('bae')}%), {EXCEPTIONS.bae.years} years, for a team under the tax line after it:
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
        <b>Luxury tax ({fmtM(cap.luxuryTax)}).</b> Every dollar over the line costs {CAP.taxRate}× at the end of the regular season; {Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}%
        of the pot goes to the teams under it.
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

/** The largest exception open to the user now (net of his pending offers), or null. */
const bestException = (league: League, season: number) =>
  EXCEPTION_ORDER.map((k) => ({ k, room: userExceptionRoom(league, k, season) }))
    .filter((x) => x.room > 0)
    .sort((a, b) => b.room - a.room)[0] ?? null;

/** The cap sheet's exceptions: what each would pay one free agent now (net of a pending offer that leans on it), or why not. */
function ExceptionsBlock({ league, season }: { league: League; season: number }) {
  const rows = EXCEPTION_ORDER.slice()
    .reverse()
    .map((k) => {
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
      return { k, room, why, capped: room > 0 && room < exceptionAmount(league, k, season) };
    });
  const closed = rows.filter((r) => r.why);
  return (
    <div className="fo-exc">
      <div className="fo-exc-row">
        <span className="over">Exceptions</span>
        {/* none open: one line, the reasons a tap away */}
        {closed.length === rows.length && <span className="dim">None open</span>}
      </div>
      {closed.length < rows.length &&
        rows.map((r) => (
          <div key={r.k} className="fo-exc-row">
            <span>{EXCEPTIONS[r.k].short}</span>
            {r.why ? (
              <span className="dim">{r.why.startsWith('Held') ? 'Held' : 'Not open'}</span>
            ) : (
              <span className="num bold good">
                {fmtM(r.room)} · {EXCEPTIONS[r.k].years} yrs{r.capped ? <span className="tiny dim"> to the tax line</span> : null}
              </span>
            )}
          </div>
        ))}
      {closed.length > 0 && (
        <More label="Why not">
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

// ------------------------------------------------------------------ phase spotlight

/** What the front office should do now: the phase's headline, one line, the best moves and the button. */
function NowCard({
  over,
  live,
  title,
  sub,
  right,
  accent = true,
  children,
}: {
  over: ReactNode;
  live?: boolean;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  accent?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`card fo-now ${accent ? 'accent' : ''} ${live ? 'live' : ''}`} aria-label="What to do now">
      <div className="fo-now-over">
        <span className={live ? 'fo-live' : ''}>{over}</span>
        {right}
      </div>
      <h2 className="fo-now-t">{title}</h2>
      {sub && <p className="fo-now-s">{sub}</p>}
      {children}
    </section>
  );
}

function Spotlight({ league }: { league: League }) {
  const nav = useNavigate();
  const run = useFlowRunner();
  const busy = useStore((st) => !!st.sim);
  const tid = league.userTid;
  const s0 = capSeason(league);
  // (net of what the summer market holds: your restricted free agents' cap holds and your offer sheets)
  const space = capSpace(league, tid, s0);
  const exc = bestException(league, s0);
  const roster = standardRoster(league, tid).length;
  const full = roster >= rosterMaxNow(league);
  // only players the team can actually pay: cap space, an exception or the minimum (your own
  // restricted free agents have their own card, and one who signed an offer sheet waits on it)
  const topFAs = useLeagueMemo(
    () =>
      league.phase === 'freeAgency' || league.phase === 'preseason'
        ? freeAgents(league)
            .filter((p) => p.rfa?.tid !== tid && !p.rfa?.sheet && offerRoute(league, p, askingContract(league, p, tid).amount, s0))
            .sort((a, b) => valueScore(league, b) - valueScore(league, a))
            .slice(0, league.phase === 'preseason' ? 3 : 5)
        : [],
    [league, tid, s0],
  );

  switch (league.phase) {
    case 'draftLottery':
    case 'draft': {
      const np = nextPick(league);
      const onClock = league.phase === 'draft' && np?.tid === tid;
      const mine = draftOrder(league).filter((d) => d.tid === tid);
      // every pick is in: next is re-signing, as on the Draft screen
      const done = league.phase === 'draft' && !np;
      return (
        <NowCard
          live={onClock}
          over={onClock ? "You're on the clock" : league.phase === 'draft' ? (done ? 'Draft night' : 'Draft night · live') : 'Lottery results are in'}
          title={
            league.phase === 'draft' && np
              ? onClock
                ? `Pick #${overallPick(league, np.round, np.pick!)} is yours`
                : `${league.teams[np.tid].abbrev} on the clock · #${overallPick(league, np.round, np.pick!)}`
              : league.phase === 'draft'
                ? 'Draft complete'
                : `${league.season} NBA Draft`
          }
          sub={mine.length ? `Your picks: ${mine.map((d) => `#${overallPick(league, d.round, d.pick!)}`).join(', ')}` : 'No picks left this year.'}
        >
          <button
            className="btn block primary"
            disabled={done && busy}
            onClick={() => (done ? void run({ id: 'finish', label: 'Continue to re-signing', cmd: 'finishDraft' }) : nav('/draft'))}
          >
            {onClock ? 'Make your pick' : done ? 'Continue to re-signing' : 'Open the draft board'}
          </button>
        </NowCard>
      );
    }
    case 'resign': {
      const exp = expiringPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
      // young players who can be made restricted free agents, and those already qualified
      const canQualify = exp.filter((p) => !p.rfa && !qualifyBlockedReason(league, p)).length;
      const qualified = exp.filter((p) => p.rfa).length;
      return (
        <NowCard
          over="Re-sign period"
          title={exp.length ? `${exp.length} contract${exp.length > 1 ? 's' : ''} expiring` : 'No expiring contracts'}
          sub={['Bird rights: keep them over the cap.', canQualify > 0 ? `${canQualify} can be qualified (restricted).` : '', qualified > 0 ? `${qualified} qualified.` : '']
            .filter(Boolean)
            .join(' ')}
        >
          {exp.length > 0 && (
            <div className="list fo-now-list">
              {exp.slice(0, 3).map((p) => (
                <MiniRow key={p.pid} league={league} p={p} right={<span className="fo-money-a num">{fmtM(askingContract(league, p, tid).amount)}</span>} to="/resign" />
              ))}
            </div>
          )}
          <button className="btn primary block" onClick={() => nav('/resign')}>
            Negotiate contracts
          </button>
        </NowCard>
      );
    }
    case 'freeAgency':
    case 'preseason': {
      const fa = league.phase === 'freeAgency';
      const rfas = fa ? restrictedFreeAgents(league, tid) : [];
      const money = space > 0 ? `${fmtM(space)} to spend` : exc ? `${EXCEPTIONS[exc.k].short} up to ${fmtM(exc.room)}` : 'Min deals only';
      return (
        <NowCard
          over={fa ? `Free agency · day ${faDayNumber(league)} of ${FA_DAYS}` : 'Preseason'}
          title={
            fa
              ? money
              : roster < CAP.rosterMin
                ? `Need ${CAP.rosterMin - roster} more players`
                : roster > CAP.rosterMax
                  ? `Cut to ${CAP.rosterMax} by opening night`
                  : `Roster set at ${roster}`
          }
          sub={
            full
              ? `Roster full (${roster}): release or trade someone first.`
              : !fa
                ? `${money}.${topFAs.length ? '' : ' No free agent left fits it.'}`
                : space <= 0
                  ? exc
                    ? 'Over the cap: the minimum or an exception.'
                    : 'Over the cap: minimum deals only.'
                  : undefined
          }
        >
          {rfas.filter((p) => p.rfa!.sheet).length > 0 && (
            <div className="col">
              {rfas
                .filter((p) => p.rfa!.sheet)
                .map((p) => (
                  <SheetDecision key={p.pid} league={league} p={p} />
                ))}
            </div>
          )}
          {rfas.some((p) => !p.rfa!.sheet) && (
            <p className="fo-now-s">
              Your restricted free agents:{' '}
              {rfas
                .filter((p) => !p.rfa!.sheet)
                .map((p) => p.lastName)
                .join(', ')}
              . Re-sign or match from Free agents; unsigned at the close, each plays on his qualifying offer.
            </p>
          )}
          {topFAs.length > 0 && <div className="over">{fa ? 'Best you can afford' : 'Best you can still afford'}</div>}
          {topFAs.length > 0 && (
            <div className="list fo-now-list">
              {topFAs.map((p) => {
                const ask = askingContract(league, p, tid);
                return (
                  <MiniRow
                    key={p.pid}
                    league={league}
                    p={p}
                    to={`/free-agents?offer=${p.pid}`}
                    right={
                      <div className="fo-money">
                        <div className="a">{fmtM(ask.amount)}</div>
                        <div className="b">
                          {ask.years} yr{ask.years > 1 ? 's' : ''}
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
          <button className="btn primary block" onClick={() => nav('/free-agents')}>
            Browse free agents
          </button>
        </NowCard>
      );
    }
    case 'regular': {
      if (league.day > league.tradeDeadlineDay) {
        return (
          <NowCard
            accent={false}
            over="Trade deadline passed"
            title="Trades locked"
            sub={`Free agents still sign: with cap space${exc ? `, the ${EXCEPTIONS[exc.k].name} (up to ${fmtM(exc.room)})` : ''} or the minimum (${fmtM(CAP_FOR(league).vetMin, 2)}). Trading reopens with the draft lottery.`}
          />
        );
      }
      const d = league.tradeDeadlineDay - league.day;
      return (
        <NowCard over="Trade deadline" title={d === 0 ? 'Deadline today' : `${d} day${d === 1 ? '' : 's'} left`} sub={fmtDate(league.season, league.tradeDeadlineDay)}>
          <button className="btn primary block" onClick={() => nav('/trade')}>
            <ArrowLeftRight size={16} /> Make a trade
          </button>
        </NowCard>
      );
    }
    default: {
      const exp = teamPlayers(league, tid).filter((p) => contractExp(p.contract) === league.season);
      return (
        <NowCard
          accent={false}
          over="Postseason"
          title="Trades frozen"
          sub={`Until the season ends. ${exp.length ? `${exp.length} of your contracts expire this summer.` : 'No contracts expire this summer.'}`}
          right={
            exp.length > 0 ? (
              <Link to="/resign" className="card-link">
                Expiring <ChevronRight size={14} />
              </Link>
            ) : undefined
          }
        />
      );
    }
  }
}

function MiniRow({ league, p, right, to }: { league: League; p: Player; right: ReactNode; to: string }) {
  return (
    <Link to={to} className="fo-mini-row">
      <Ovr v={p.ovr} size="sm" />
      <div className="grow">
        <div className="fo-name">{playerName(p)}</div>
        <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
      </div>
      {right}
    </Link>
  );
}

// ------------------------------------------------------------------ contracts

// $M to one decimal, with no "-0.0" for a value that rounds to zero
const m1 = (k: number) => (Math.abs(k) < 50 ? 0 : k / 1000).toFixed(1);

function ContractsTable({ league, onPick }: { league: League; onPick: (pid: number) => void }) {
  const tid = league.userTid;
  const team = league.teams[tid];
  const s0 = capSeason(league);
  const seasons = [s0, s0 + 1, s0 + 2, s0 + 3];
  const roster = teamPlayers(league, tid).sort((a, b) => salaryFor(b, s0) - salaryFor(a, s0) || contractExp(b.contract) - contractExp(a.contract) || b.ovr - a.ovr);
  const nameOf = rosterNames(roster, { initial: true });
  // (a stretched release can run past the table's four seasons: its row says through when)
  const dead = new Map<number, { name: string; by: Record<number, number>; stretched: boolean; last: number }>();
  for (const d of team.deadMoney) {
    if (d.season < s0) continue;
    const e = dead.get(d.pid) ?? { name: d.name, by: {}, stretched: false, last: d.season };
    e.by[d.season] = (e.by[d.season] ?? 0) + d.amount;
    e.stretched ||= !!d.stretched;
    e.last = Math.max(e.last, d.season);
    dead.set(d.pid, e);
  }
  const totals = seasons.map((s) => payroll(league, tid, s));
  const caps = seasons.map((s) => CAP_FOR(league, s).salaryCap);
  // until free agency opens, expiring players hold room on the first season's cap, as on the cap sheet above
  const holds = capHolds(league, tid).reduce((a, h) => a + h.amount, 0);
  const space = totals.map((t, i) => caps[i] - t - (i === 0 ? holds : 0));
  return (
    <Section
      title="Contracts · $M"
      right={
        <HelpSheet title="Contracts">
          <p>Salaries for the next four seasons. New deals rise 5% a year, rookie-scale deals 4.5%.</p>
          <p>
            <span className="fo-opt">PO</span> player option and <span className="fo-opt team">TO</span> team option on the final season. <span className="fo-flag info">R</span> a
            rookie-scale deal, <span className="fo-opt ext">EXT</span> the first season of a signed extension.
          </p>
          <p>
            <span className="fo-flag">2W</span> two-way deals are paid outside the cap and the tax, so the totals leave them out.
          </p>
          <p>Dead money is salary still owed to players you released. It counts against the cap until it runs out; a stretched release spreads it over more seasons.</p>
          <p>
            <span className="fo-flag warn">10D</span> a 10-day contract: its prorated pay counts this season, and it ends by itself.
          </p>
          {holds > 0 && (
            <p>
              Cap holds: until free agency opens, your expiring players hold cap room at about their ask; through free agency, your restricted free agents and pending offer sheets
              do.
            </p>
          )}
        </HelpSheet>
      }
    >
      <div className="tablewrap">
        <table className="stats fo-contracts">
          <thead>
            <tr>
              <th className="l sticky">Player</th>
              <th>OVR</th>
              {seasons.map((s) => (
                <th key={s}>{shortSeason(s)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => {
              const exp = contractExp(p.contract);
              const opt = openOption(league, p);
              const anySalary = seasons.some((s) => salaryFor(p, s) > 0);
              return (
                // the whole row opens the sheet; the name is its keyboard and screen-reader button
                <tr key={p.pid} className="clickable" onClick={() => onPick(p.pid)}>
                  <td className="l sticky">
                    <div className="fo-ct-name">
                      <div className="fo-ct-top">
                        <button type="button" className="fo-name" aria-haspopup="dialog" onClick={(e) => (e.stopPropagation(), onPick(p.pid))}>
                          {nameOf(p.pid)}
                        </button>
                        {rookieScaleDeal(p) && <span className="fo-flag info">R</span>}
                        {p.contract.twoWay && <span className="fo-flag">2W</span>}
                        {p.contract.tenDay && <span className="fo-flag warn">10D</span>}
                        {p.injury && <span className="fo-flag bad">INJ</span>}
                      </div>
                      <div className="fo-ct-meta">
                        {p.pos} · {playerAge(p, league.season)}
                      </div>
                    </div>
                  </td>
                  <td>
                    <Ovr v={p.ovr} size="sm" />
                  </td>
                  {!anySalary ? (
                    <td colSpan={4} className="l">
                      <span className="tag warn">Expiring</span>{' '}
                      <span className="tiny dim">
                        {/* before the re-sign period (lottery, draft) his Bird rights are still yours */}
                        {league.phase === 'resign' ? 'Re-sign or he walks' : 'Re-sign him after the draft'}
                      </span>
                    </td>
                  ) : (
                    seasons.map((s) => {
                      const amt = salaryFor(p, s);
                      return (
                        <td key={s} className={amt && !p.contract.twoWay ? '' : 'dim'}>
                          {amt ? m1(amt) : '—'}
                          {amt > 0 && s === exp && opt && <span className={`fo-opt ${opt === 'team' ? 'team' : ''}`}>{opt === 'team' ? 'TO' : 'PO'}</span>}
                          {amt > 0 && s === extensionStart(p.contract) && <span className="fo-opt ext">EXT</span>}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
            {[...dead.entries()].map(([pid, d]) => (
              <tr key={`dead-${pid}`} className="dead">
                <td className="l sticky">
                  <div className="fo-ct-name">
                    <div className="fo-name">{d.name}</div>
                    <div className="fo-ct-meta">{d.stretched ? `dead money · stretched thru ${shortSeason(d.last)}` : 'dead money'}</div>
                  </div>
                </td>
                <td />
                {seasons.map((s) => (
                  <td key={s}>{d.by[s] ? m1(d.by[s]) : '—'}</td>
                ))}
              </tr>
            ))}
            <tr className="total">
              <td className="l sticky">Total payroll</td>
              <td />
              {totals.map((t, i) => (
                <td key={i} className={t > CAP_FOR(league, seasons[i]).luxuryTax ? 'bad' : t > caps[i] ? 'warn' : ''}>
                  {m1(t)}
                </td>
              ))}
            </tr>
            {holds > 0 && (
              <tr className="total">
                <td className="l sticky">Cap holds</td>
                <td />
                {seasons.map((s, i) => (
                  <td key={s} className={i === 0 ? '' : 'dim'}>
                    {i === 0 ? m1(holds) : '—'}
                  </td>
                ))}
              </tr>
            )}
            <tr className="total">
              <td className="l sticky">Cap space</td>
              <td />
              {space.map((x, i) => (
                <td key={i}>
                  <div className={x >= 0 ? 'good' : 'dim'}>{m1(x)}</div>
                  <div className="fo-ct-cap">cap {m1(caps[i])}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="tiny dim">
        {roster.some((p) => p.contract.twoWay) ? 'Dimmed: two-way pay, outside the cap and the totals. ' : ''}Tap a player to extend, trade or release him.
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ player contract sheet + release

function PlayerContractSheet({ pid, onClose, onExtend }: { pid: number | null; onClose: () => void; onExtend: (pid: number) => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  const open = !!p && p.tid === league.userTid;
  return (
    <Sheet open={open} onClose={onClose} label={p ? `${playerName(p)}: contract` : undefined}>
      {open && p && <PlayerContractBody key={p.pid} p={p} onClose={onClose} onExtend={onExtend} />}
    </Sheet>
  );
}

function PlayerContractBody({ p, onClose, onExtend }: { p: Player; onClose: () => void; onExtend: (pid: number) => void }) {
  const league = useLeague();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  // meeting him (he asked out, or he's unhappy), in place of the contract
  const [meet, setMeet] = useState(false);
  const exp = contractExp(p.contract);
  const remaining = releaseDeadMoney(league, p);
  const camp = nonGuaranteed(league, p);
  const owed = remaining.reduce((a, r) => a + r.amount, 0);
  // the stretch provision's version of the same dead money (see ReleaseConfirm)
  const stretch = stretchDeadMoney(league, remaining);
  const stretched = stretch?.filter((d) => d.stretched) ?? [];
  const blocked = releaseBlockedReason(league, p);
  // a veteran with guaranteed money left can be bought out instead (the Release confirmation offers it)
  const buyout = buyoutTerms(league, p);
  const upNote = contractUpNote(league, p);
  const expiringNow = !!upNote;
  // after the deadline and in the postseason, say so here rather than on the Trade screen
  const noTrade = expiringNow ? null : (tradeClosedNote(league) ?? untradeableReason(league, p));
  const opt = openOption(league, p);
  const s0 = capSeason(league);
  const extStart = extensionStart(p.contract);
  // in the final season of a standard deal: extend him, or why not yet
  const finalSeason = !p.contract.twoWay && !extStart && exp === s0;
  const extWhy = finalSeason ? extensionBlockedReason(league, p) : null;

  if (confirm) {
    return (
      <div className="col fo-sheet">
        <div className="fo-sheet-h">
          <UserMinus className="bad" />
          <h2 className="grow">Release {p.lastName}?</h2>
        </div>
        <ReleaseConfirm league={league} p={p} onKeep={() => setConfirm(false)} onDone={onClose} />
      </div>
    );
  }
  if (meet) {
    return (
      <div className="col fo-sheet">
        <div className="fo-sheet-h">
          <MessageCircle className="dim" />
          <h2 className="grow">Meet {p.lastName}</h2>
          <button className="btn xs ghost" onClick={() => setMeet(false)}>
            Back
          </button>
        </div>
        <MeetingPanel league={league} p={p} />
      </div>
    );
  }

  return (
    <div className="col fo-sheet">
      <PlayerHead league={league} p={p} />
      <div className="chips">
        <span className="tag">{contractYearsLabel(league, p, s0)}</span>
        {rookieScaleDeal(p) && <span className="tag info">Rookie scale</span>}
        {opt && (
          <span className={`tag ${opt === 'team' ? 'warn' : 'info'}`}>
            {opt === 'team' ? 'Team' : 'Player'} option {seasonLabel(exp)}
          </span>
        )}
        {p.mood.tradeRequest && <span className="tag bad">Wants a trade</span>}
        {extStart !== null && <span className="tag good">Extended through {seasonLabel(exp)}</span>}
        {tenDayLabel(league, p) && <span className="tag warn">{tenDayLabel(league, p)}</span>}
      </div>
      {p.contract.tenDay && (
        <div className="col">
          <div className="small dim2">{tenDayLine(league, p)}</div>
          <TenDayActions league={league} p={p} />
        </div>
      )}
      {/* he asked out or he's unhappy: what you promised him, or a meeting */}
      {(p.promise || wantsMeeting(p)) && (
        <div className="row">
          <span className="small dim2 grow">{promiseStatus(league, p) ?? (p.mood.tradeRequest ? 'He wants a trade.' : "He's unhappy.")}</span>
          {!p.promise && (
            <button className="btn xs" onClick={() => setMeet(true)}>
              <MessageCircle size={14} /> Meet
            </button>
          )}
        </div>
      )}
      <div className="fo-lines">
        {/* every season he's signed for, a signed extension's included */}
        {Array.from({ length: exp - p.contract.start + 1 }, (_, i) => p.contract.start + i).map((s) => (
          <Line
            key={s}
            className={s < league.season ? 'past' : ''}
            k={
              <>
                {seasonLabel(s)}
                {s === exp && opt ? <span className={`fo-opt ${opt === 'team' ? 'team' : ''}`}>{opt === 'team' ? 'TO' : 'PO'}</span> : null}
                {extStart !== null && s >= extStart && <span className="fo-opt ext">EXT</span>}
              </>
            }
          >
            {fmtM(salaryFor(p, s), 2)}
          </Line>
        ))}
      </div>
      {finalSeason && (
        <>
          <button className="btn block" disabled={!!extWhy} onClick={() => onExtend(p.pid)}>
            <PenLine size={16} /> Extend {p.lastName}
          </button>
          {extWhy && <div className="tiny dim">{extWhy}</div>}
        </>
      )}
      {upNote && (
        <Callout tone="warn" icon={<TriangleAlert size={18} className="warn" />}>
          {upNote}
        </Callout>
      )}
      <div className="grid3">
        <button className="btn" onClick={() => (onClose(), nav(`/player/${p.pid}`))}>
          Profile
        </button>
        <button className="btn" disabled={expiringNow || !!noTrade} onClick={() => (onClose(), nav(`/trade?give=${p.pid}`))}>
          Trade
        </button>
        {league.phase === 'resign' && expiringNow ? (
          <button className="btn primary" onClick={() => (onClose(), nav('/resign'))}>
            Re-sign
          </button>
        ) : (
          <button className="btn danger" disabled={!!blocked || expiringNow} onClick={() => setConfirm(true)}>
            Release
          </button>
        )}
      </div>
      {blocked ? (
        <div className="tiny dim">{blocked}</div>
      ) : (
        !expiringNow && (
          <div className="tiny dim">
            {owed > 0
              ? `Release: ${fmtM(owed)} dead money through ${seasonLabel(remaining[remaining.length - 1].season)}${league.phase === 'regular' ? ' unless he is claimed' : ''}.${stretched.length ? ` Stretched: ${fmtM(stretched[0].amount)} a season${stretched.length < (stretch?.length ?? 0) ? ' after this one' : ''} through ${seasonLabel(stretched[stretched.length - 1].season)}.` : ''}${buyout ? ` Buyout: ${fmtM(buyout.dead)}.` : ''}`
              : p.contract.twoWay
                ? 'Release: free, two-way pay is off the cap.'
                : p.contract.tenDay
                  ? 'Release: no dead money, his 10-day pay was paid when he signed.'
                  : camp
                    ? "Release: free, his minimum deal isn't guaranteed until opening night."
                    : 'Release: no dead money.'}
          </div>
        )
      )}
      {noTrade && <div className="tiny dim">{noTrade}</div>}
      {!expiringNow && <UntouchableToggle league={league} p={p} />}
    </div>
  );
}
