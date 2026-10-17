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
  Timer,
  TriangleAlert,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type { League, Player } from '../../core/types';
import { CAP, PHASE_LABEL, seasonLabel } from '../../core/constants';
import {
  CAP_FOR,
  OFFSEASON_ROSTER_MAX,
  curTeamSeason,
  fmtDate,
  freeAgents,
  payroll,
  playerName,
  rosterMaxNow,
  teamPlayers,
  standardRoster,
  twoWayRoster,
} from '../../core/league/helpers';
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
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Card, Help, Kpi, Ovr, PageHeader, Sheet } from '../components/ui';
import {
  CapBar,
  CenterBar,
  Gauge,
  ReleaseConfirm,
  SecTitle,
  capSeason,
  contractUpNote,
  contractYearsLabel,
  deadlineLabel,
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

interface Tile {
  to: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  color: string;
  hot?: boolean;
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
  const ts = curTeamSeason(league, tid);
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
  const tradeSub = inPost ? 'Frozen during the postseason' : pastDeadline ? 'Deadline passed' : (deadlineLabel(league) ?? 'Open for business');
  const thisDraftPicks = myPicks.filter((d) => d.season === league.season && d.pick).sort((a, b) => a.round - b.round || a.pick! - b.pick!);

  const tiles: Tile[] = [
    { to: '/trade', icon: ArrowLeftRight, title: 'Trade', sub: tradeSub, color: 'var(--info)', muted: inPost || pastDeadline },
    {
      to: '/free-agents',
      icon: UserPlus,
      title: 'Free Agents',
      sub:
        league.phase === 'freeAgency'
          ? `Day ${faDayNumber(league)} of ${FA_DAYS} · ${faCount} left`
          : signingClosed
            ? `${faCount} on the market · signings reopen in free agency`
            : `${faCount} available · ${space > 0 ? `${fmtM(space)} space` : exc ? `${fmtM(exc.room)} ${EXCEPTIONS[exc.k].short.toLowerCase()}` : 'min deals only'}`,
      color: 'var(--good)',
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
      color: 'var(--warn)',
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
      color: 'var(--tier-star)',
      hot: league.phase === 'draft' || league.phase === 'draftLottery',
    },
    { to: '/finances', icon: PiggyBank, title: 'Finances', sub: `Cash ${fmtM(team.cash)}`, color: 'var(--tier-elite)' },
    { to: '/history', icon: HistoryIcon, title: 'History', sub: 'Seasons, awards & records', color: 'var(--tier-good)' },
  ];

  const om = league.ownerMood;
  const verdict = ownerVerdict(om.total);

  return (
    <main className="page">
      <PageHeader title="Front Office" sub={`${team.region} ${team.name} · ${seasonLabel(league.season)} · ${PHASE_LABEL[league.phase]}`} />

      <Spotlight league={league} />

      <Card
        className="fo-hero"
        title={<h3>{seasonLabel(s0)} cap sheet</h3>}
        right={
          <Help title="How the cap works">
            <p style={{ margin: 0 }}>
              <b>Soft cap ({fmtM(cap.salaryCap)}).</b> You can sign free agents with cap space, or for the minimum (up to {fmtM(cap.vetMin, 2)}) when you're over it.
            </p>
            <p style={{ margin: 0 }}>
              <b>Mid-level exception.</b> Once a season, a team that stays under the tax line can sign one free agent for up to {fmtM(exceptionAmount(league, 'mle', s0))} (
              {Math.round(EXCEPTIONS.mle.pct * 1000) / 10}% of the cap, {EXCEPTIONS.mle.years} years), even over the cap. For the rest of that season, trades can't take its payroll
              past the tax line.
            </p>
            <p style={{ margin: 0 }}>
              <b>Room exception.</b> A team that signs a free agent with cap space loses the mid-level for that season and gets this instead: one signing up to{' '}
              {fmtM(exceptionAmount(league, 'room', s0))} ({Math.round(EXCEPTIONS.room.pct * 1000) / 10}%), {EXCEPTIONS.room.years} years.
            </p>
            <p style={{ margin: 0 }}>
              <b>Bi-annual exception.</b> One signing up to {fmtM(exceptionAmount(league, 'bae', s0))} ({Math.round(EXCEPTIONS.bae.pct * 1000) / 10}%), {EXCEPTIONS.bae.years}{' '}
              years, for a team that stays under the tax line after it: not two seasons running, and not in a season the team uses the room exception. Like the mid-level, it keeps
              trades from taking the payroll past the tax line that season.
            </p>
            <p style={{ margin: 0 }}>
              <b>Stretch provision.</b> Releasing a player, you can spread his dead money evenly over twice the seasons left plus one: in season this season's salary is paid as
              usual and the rest is stretched; in the summer all of it is. Less dead money a season, for longer. A waiver claim still wipes it.
            </p>
            <p style={{ margin: 0 }}>
              <b>10-day contracts.</b> From January 5 to the end of the regular season: the minimum prorated for 10 days, ending by itself with no dead money, two at most per
              player and team. With {HARDSHIP_OUT}+ players out for 3+ games, the hardship exception allows 10-day players beyond {CAP.rosterMax}.
            </p>
            <p style={{ margin: 0 }}>
              <b>Bird rights.</b> Your own expiring players can be re-signed for any amount during the re-sign period, even over the cap. Until free agency opens (or you renounce
              them), each one holds cap room at about his asking price.
            </p>
            <p style={{ margin: 0 }}>
              <b>Restricted free agents.</b> A young player you extend a qualifying offer can still be re-signed in free agency, and you can match any offer sheet he signs. His cap
              hold (the larger of the offer and his ask) stays on through free agency until he signs or you withdraw the offer; an offer sheet you sign holds its room until his
              team decides.
            </p>
            <p style={{ margin: 0 }}>
              <b>Luxury tax ({fmtM(cap.luxuryTax)}).</b> Every dollar of payroll above the tax line costs {CAP.taxRate}× in tax at the end of the regular season.{' '}
              {Math.round(TAX_SHARE_TO_NON_TAXPAYERS * 100)}% of the pot is shared among the teams under the line.
            </p>
            <p style={{ margin: 0 }}>
              <b>Trades.</b> A team that is over the cap after a trade can take back at most 125% of the salary it sends out, plus $0.1M.
            </p>
            <p style={{ margin: 0 }}>
              <b>Rosters.</b> {CAP.rosterMin} to {CAP.rosterMax} players in season, up to {OFFSEASON_ROSTER_MAX} in the offseason. Minimum deals signed for the coming season aren't
              guaranteed until opening night: cutting one before then leaves no dead money. First-round picks sign rookie-scale deals (4 years, team option on the last).
            </p>
            <p style={{ margin: 0 }}>The cap, tax line and minimums grow 6% every season.</p>
          </Help>
        }
      >
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="tiny dim upper bold">Payroll</div>
            <div className="fo-big">{fmtM(pay)}</div>
          </div>
          {/* cap holds count against the cap (trades treat the team as over it), not toward the tax */}
          <span className={`tag ${pay > cap.luxuryTax ? 'bad' : pay + holds > cap.salaryCap ? 'warn' : 'good'}`}>
            {pay > cap.luxuryTax ? 'Taxpayer' : pay + holds > cap.salaryCap ? 'Over the cap' : 'Under the cap'}
          </span>
        </div>
        <div style={{ marginTop: 6 }}>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={holds} legend={false} />
        </div>
        {holds > 0 && (
          <div className="tiny dim" style={{ marginTop: 4 }}>
            Striped: {fmtM(holds)} in cap holds for your{' '}
            {league.phase === 'freeAgency'
              ? [restrictedFreeAgents(league, tid).length ? 'restricted free agents' : '', pendingSheets(league, tid).length ? 'offer sheets' : ''].filter(Boolean).join(' and ')
              : 'expiring players'}
            .
          </div>
        )}
        <div className="grid2" style={{ marginTop: 12 }}>
          <Kpi
            k="Cap space"
            v={fmtM(space)}
            color={space >= 0 ? 'var(--good)' : 'var(--warn)'}
            sub={
              holds > 0
                ? `After ${fmtM(holds)} in cap holds`
                : space > 0
                  ? 'Room to sign free agents'
                  : exc
                    ? `Min deals or the ${fmtM(exc.room)} ${EXCEPTIONS[exc.k].short.toLowerCase()}`
                    : `Min deals only (${fmtM(cap.vetMin, 2)})`
            }
          />
          <Kpi
            k={isOffseason(league) ? `Roster ${shortSeason(s0)}` : 'Roster'}
            v={`${signedN}/${CAP.rosterMax}`}
            color={signedN > rosterMaxNow(league) ? 'var(--bad)' : signedN > CAP.rosterMax || signedN < CAP.rosterMin ? 'var(--warn)' : undefined}
            sub={[
              expiringN > 0 ? `+${expiringN} expiring` : '',
              // too many under contract matters even while some deals are expiring
              signedN > CAP.rosterMax
                ? inSeasonNow
                  ? `${signedN - CAP.rosterMax} over the limit`
                  : `${signedN - CAP.rosterMax} to cut by opening night`
                : expiringN > 0
                  ? ''
                  : signedN < CAP.rosterMin
                    ? `Need ${CAP.rosterMin - signedN} more`
                    : `${CAP.rosterMax - signedN} open spot${CAP.rosterMax - signedN === 1 ? '' : 's'}`,
              twoWays ? `${twoWays} two-way` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Kpi
            k={pay > cap.luxuryTax ? 'Tax bill (est.)' : 'Room under tax'}
            v={pay > cap.luxuryTax ? fmtM(tax) : fmtM(cap.luxuryTax - pay)}
            color={pay > cap.luxuryTax ? 'var(--bad)' : undefined}
            sub={`Tax line ${fmtM(cap.luxuryTax)}`}
          />
          <Kpi k="Cash" v={fmtM(team.cash)} color={team.cash < 0 ? 'var(--bad)' : undefined} sub={`${ts.won}-${ts.lost} · ${seasonLabel(league.season)}`} />
        </div>
        <ExceptionsBlock league={league} season={s0} />
      </Card>

      <div className="fo-tiles">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className={`fo-tile ${t.hot ? 'hot' : ''} ${t.muted ? 'muted' : ''}`} style={{ ['--tile' as string]: t.color }}>
            <span className="ic">
              <t.icon size={19} />
            </span>
            <span className="t">{t.title}</span>
            <span className="s">{t.sub}</span>
          </Link>
        ))}
      </div>

      <Link to="/owner" className="card clickable" style={{ display: 'block' }}>
        <div className="row" style={{ gap: 12 }}>
          <Gauge value={om.total} size={112} />
          <div className="grow col" style={{ gap: 7 }}>
            <div className="row between">
              <h3 style={{ fontSize: 14, color: 'var(--text-2)' }}>Owner</h3>
              <span className="small bold" style={{ color: verdict.color }}>
                {om.total >= 0 ? '+' : ''}
                {Math.round(om.total * 100)}
              </span>
            </div>
            {(
              [
                ['Wins', om.wins],
                ['Playoffs', om.playoffs],
                ['Finances', om.money],
                // the development goals' part, once a season had one
                ...(om.youth !== undefined ? [['Youth', om.youth] as const] : []),
              ] as const
            ).map(([k, val]) => (
              <div key={k} className="row" style={{ gap: 8 }}>
                <span className="tiny dim upper bold" style={{ width: 58 }}>
                  {k}
                </span>
                <div className="grow">
                  <CenterBar value={val} />
                </div>
                {/* the number, not just the bar's colour */}
                <span className="tiny num bold dim2" style={{ width: 28, textAlign: 'right' }}>
                  {val >= 0 ? '+' : ''}
                  {Math.round(val * 100)}
                </span>
              </div>
            ))}
          </div>
          <ChevronRight size={18} className="dim" />
        </div>
      </Link>

      <ContractsTable league={league} onPick={setSel} />

      <PlayerContractSheet pid={sel} onClose={() => setSel(null)} onExtend={(pid) => (setSel(null), setExt(pid))} />
      <ContractSheet pid={ext} mode="extend" onClose={() => setExt(null)} />
    </main>
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
  return (
    <div className="col" style={{ gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
      <div className="tiny dim upper bold">Exceptions over the cap</div>
      {rows.map((r) => (
        <div key={r.k} className="row between small" style={{ gap: 10, alignItems: 'flex-start' }}>
          <span className="dim2" style={{ flex: 'none' }}>
            {EXCEPTIONS[r.k].short}
          </span>
          {r.why ? (
            <span className="tiny dim" style={{ textAlign: 'right', minWidth: 0 }}>
              {r.why}
            </span>
          ) : (
            <span className="num bold good" style={{ textAlign: 'right' }}>
              {fmtM(r.room)} · {EXCEPTIONS[r.k].years} yrs{r.capped ? <span className="tiny dim"> (to the tax line)</span> : null}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ phase spotlight

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
        <Card className={`fo-hero ${onClock ? 'fo-clock' : ''}`} accent={!onClock}>
          {onClock ? <div className="fo-live">You're on the clock</div> : <div className="fo-eyebrow">{league.phase === 'draft' ? 'Draft night' : 'Lottery results are in'}</div>}
          <div className="row" style={{ marginTop: 8, gap: 12 }}>
            {np && league.phase === 'draft' ? <TeamLogo tid={np.tid} size={46} /> : <ListOrdered size={34} />}
            <div className="grow">
              <div className="fo-mid">
                {league.phase === 'draft' && np
                  ? onClock
                    ? `Pick #${overallPick(league, np.round, np.pick!)} is yours`
                    : `${league.teams[np.tid].abbrev} pick #${overallPick(league, np.round, np.pick!)}`
                  : league.phase === 'draft'
                    ? 'Draft complete'
                    : `${league.season} NBA Draft`}
              </div>
              <div className="small dim2">
                {mine.length ? `Your picks: ${mine.map((d) => `#${overallPick(league, d.round, d.pick!)}`).join(', ')}` : 'You have no picks left this year.'}
              </div>
            </div>
          </div>
          <button
            className={`btn block ${onClock ? 'good' : 'primary'}`}
            style={{ marginTop: 12 }}
            disabled={done && busy}
            onClick={() => (done ? void run({ id: 'finish', label: 'Continue to re-signing', cmd: 'finishDraft' }) : nav('/draft'))}
          >
            {onClock ? 'Make your pick' : done ? 'Continue to re-signing' : 'Open the draft board'}
          </button>
        </Card>
      );
    }
    case 'resign': {
      const exp = expiringPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
      // young players who can be made restricted free agents, and those already qualified
      const canQualify = exp.filter((p) => !p.rfa && !qualifyBlockedReason(league, p)).length;
      const qualified = exp.filter((p) => p.rfa).length;
      return (
        <Card accent className="fo-hero">
          <div className="fo-eyebrow">Re-sign period</div>
          <div className="fo-mid" style={{ marginTop: 6 }}>
            {exp.length ? `${exp.length} contract${exp.length > 1 ? 's' : ''} expiring` : 'No expiring contracts'}
          </div>
          <div className="small dim2">
            Re-sign your own players before free agency opens. Bird rights let you exceed the cap to keep them.
            {canQualify > 0
              ? ` ${canQualify === 1 ? 'One young player' : `${canQualify} young players`} can get a qualifying offer, so you can match any offer sheet for ${canQualify === 1 ? 'him' : 'them'} in free agency.`
              : ''}
            {qualified > 0 ? ` ${qualified} qualified: restricted when the market opens.` : ''}
          </div>
          {exp.length > 0 && (
            <div className="list" style={{ margin: '10px -14px 0' }}>
              {exp.slice(0, 3).map((p) => (
                <MiniRow key={p.pid} league={league} p={p} right={<span className="small bold num">{fmtM(askingContract(league, p, tid).amount)}</span>} to="/resign" />
              ))}
            </div>
          )}
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => nav('/resign')}>
            Negotiate contracts
          </button>
        </Card>
      );
    }
    case 'freeAgency':
    case 'preseason': {
      const fa = league.phase === 'freeAgency';
      const rfas = fa ? restrictedFreeAgents(league, tid) : [];
      return (
        <Card accent className="fo-hero">
          <div className="row between">
            <div className="fo-eyebrow">{fa ? `Free agency · Day ${faDayNumber(league)} of ${FA_DAYS}` : 'Preseason'}</div>
            <span className="tag">{space > 0 ? `${fmtM(space)} space` : exc ? `${EXCEPTIONS[exc.k].short} ${fmtM(exc.room)}` : 'Min deals only'}</span>
          </div>
          {full && (
            <div className="small bad" style={{ marginTop: 6 }}>
              Your roster is full ({roster}). Release or trade someone before signing anyone.
            </div>
          )}
          {fa && rfas.length > 0 && (
            <div className="col" style={{ gap: 8, marginTop: 8 }}>
              {rfas
                .filter((p) => p.rfa!.sheet)
                .map((p) => (
                  <SheetDecision key={p.pid} league={league} p={p} />
                ))}
              {rfas.some((p) => !p.rfa!.sheet) && (
                <div className="small dim2">
                  Restricted free agents:{' '}
                  {rfas
                    .filter((p) => !p.rfa!.sheet)
                    .map((p) => p.lastName)
                    .join(', ')}
                  . Re-sign or match from Free Agents; unsigned at the close, each takes his qualifying offer.
                </div>
              )}
            </div>
          )}
          {!fa && (
            <div className="small dim2" style={{ marginTop: 6 }}>
              {roster < CAP.rosterMin ? (
                <span className="bad">
                  You need at least {CAP.rosterMin} players to start the season ({roster} now).
                </span>
              ) : roster > CAP.rosterMax ? (
                <span className="bad">
                  Cut down to {CAP.rosterMax} players before opening night ({roster} now).
                </span>
              ) : (
                `Roster set at ${roster}.${topFAs.length ? ' Best players you can still afford:' : ' No free agent left fits your cap space, an exception or the minimum.'}`
              )}
            </div>
          )}
          {fa && space <= 0 && (
            <div className="small dim2" style={{ marginTop: 6 }}>
              {exc ? 'Over the cap: the best players you can sign for the minimum or with an exception.' : 'Over the cap: the best players who would sign for the minimum.'}
            </div>
          )}
          {topFAs.length > 0 && (
            <div className="list" style={{ margin: '10px -14px 0' }}>
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
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => nav('/free-agents')}>
            Browse free agents
          </button>
        </Card>
      );
    }
    case 'regular': {
      if (league.day > league.tradeDeadlineDay) {
        return (
          <Card className="fo-hero">
            <div className="fo-eyebrow">Trade deadline passed</div>
            <div className="small dim2" style={{ marginTop: 6 }}>
              Rosters are locked to trades until the offseason. You can still sign free agents: with cap space,{' '}
              {exc ? `with your ${EXCEPTIONS[exc.k].name} (up to ${fmtM(exc.room)}), ` : ''}or on minimum deals ({fmtM(CAP_FOR(league).vetMin, 2)}).
            </div>
          </Card>
        );
      }
      const d = league.tradeDeadlineDay - league.day;
      return (
        <Card accent className="fo-hero">
          <div className="row" style={{ gap: 12 }}>
            <Timer size={30} />
            <div className="grow">
              <div className="fo-eyebrow">Trade deadline</div>
              <div className="fo-mid">
                {d === 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'} left`} <span className="dim small">· {fmtDate(league.season, league.tradeDeadlineDay)}</span>
              </div>
            </div>
            <button className="btn sm primary" onClick={() => nav('/trade')}>
              Trade
            </button>
          </div>
        </Card>
      );
    }
    default: {
      const exp = teamPlayers(league, tid).filter((p) => contractExp(p.contract) === league.season);
      return (
        <Card className="fo-hero">
          <div className="fo-eyebrow">Postseason</div>
          <div className="small dim2" style={{ marginTop: 6 }}>
            Trades are frozen until the season ends. {exp.length ? `${exp.length} of your contracts expire this summer.` : 'None of your contracts expire this summer.'}
          </div>
          {exp.length > 0 && (
            <Link to="/resign" className="small bold" style={{ color: 'var(--accent-text)', display: 'inline-block', marginTop: 8 }}>
              Preview expiring contracts →
            </Link>
          )}
        </Card>
      );
    }
  }
}

function MiniRow({ league, p, right, to }: { league: League; p: Player; right: ReactNode; to: string }) {
  return (
    <Link to={to} className="listrow" style={{ minHeight: 48, padding: '7px 14px' }}>
      <Ovr v={p.ovr} size="sm" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="fo-name small">{playerName(p)}</div>
        <div className="fo-meta tiny">{playerMeta(league, p, p.archetype)}</div>
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
    <>
      <SecTitle
        right={
          <Help title="Contracts">
            <p style={{ margin: 0 }}>Salaries for the next four seasons. New deals rise 5% a year, rookie-scale deals 4.5%.</p>
            <p style={{ margin: 0 }}>
              <span className="fo-opt">PO</span> player option and <span className="fo-opt team">TO</span> team option apply to the final season.{' '}
              <span className="tag info">R</span> marks a rookie-scale deal, <span className="fo-opt ext">EXT</span> the first season of a signed extension.
            </p>
            <p style={{ margin: 0 }}>
              <span className="tag">2W</span> two-way deals are paid outside the cap and the tax, so they're left out of the totals.
            </p>
            <p style={{ margin: 0 }}>
              Dead money is salary still owed to players you released. It counts against the cap until it runs out; a stretched release spreads it over more seasons.
            </p>
            <p style={{ margin: 0 }}>
              <span className="tag warn">10D</span> a 10-day contract: its prorated pay counts this season, and it ends by itself.
            </p>
            {holds > 0 && (
              <p style={{ margin: 0 }}>
                Cap holds: until free agency opens, your expiring players hold cap room at about their asking price; through free agency, your restricted free agents and your
                pending offer sheets do.
              </p>
            )}
          </Help>
        }
      >
        Contracts · $M
      </SecTitle>
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
                      <div className="row" style={{ gap: 5 }}>
                        <button type="button" className="fo-name small" style={{ textAlign: 'left' }} aria-haspopup="dialog" onClick={(e) => (e.stopPropagation(), onPick(p.pid))}>
                          {nameOf(p.pid)}
                        </button>
                        {rookieScaleDeal(p) && (
                          <span className="tag info" style={{ height: 16, padding: '0 4px', fontSize: 10 }}>
                            R
                          </span>
                        )}
                        {p.contract.twoWay && (
                          <span className="tag" style={{ height: 16, padding: '0 4px', fontSize: 10 }}>
                            2W
                          </span>
                        )}
                        {p.contract.tenDay && (
                          <span className="tag warn" style={{ height: 16, padding: '0 4px', fontSize: 10 }}>
                            10D
                          </span>
                        )}
                        {p.injury && (
                          <span className="tag bad" style={{ height: 16, padding: '0 4px', fontSize: 10 }}>
                            INJ
                          </span>
                        )}
                      </div>
                      <div className="tiny dim">
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
                    <div className="fo-name small">{d.name}</div>
                    <div className="tiny">{d.stretched ? `dead money · stretched thru ${shortSeason(d.last)}` : 'dead money'}</div>
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
                <td key={i} style={{ color: t > CAP_FOR(league, seasons[i]).luxuryTax ? 'var(--bad)' : t > caps[i] ? 'var(--warn)' : undefined }}>
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
                  <div style={{ color: x >= 0 ? 'var(--good)' : 'var(--text-dim)' }}>{m1(x)}</div>
                  <div className="tiny dim">cap {m1(caps[i])}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="tiny dim" style={{ marginTop: -6 }}>
        {roster.some((p) => p.contract.twoWay) ? 'Dimmed: two-way pay, outside the cap and not in the totals. ' : ''}Tap a player for contract details, trade or release.
      </div>
    </>
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
  const tooFew = !!blocked;
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
      <div className="col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <UserMinus className="bad" />
          <h2 className="grow">Release {p.lastName}?</h2>
        </div>
        <ReleaseConfirm league={league} p={p} onKeep={() => setConfirm(false)} onDone={onClose} />
      </div>
    );
  }
  if (meet) {
    return (
      <div className="col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <MessageCircle className="dim" />
          <h2 className="grow">Meet with {p.lastName}</h2>
          <button className="btn xs ghost" onClick={() => setMeet(false)}>
            Back
          </button>
        </div>
        <MeetingPanel league={league} p={p} />
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 12 }}>
        <Avatar p={p} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="ellipsis" style={{ fontSize: 22 }}>
            {playerName(p)}
          </h2>
          <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
        </div>
        <Ovr v={p.ovr} />
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
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
        <div className="col" style={{ gap: 8 }}>
          <div className="small dim2">{tenDayLine(league, p)}</div>
          <TenDayActions league={league} p={p} />
        </div>
      )}
      {/* he asked out or he's unhappy: what you promised him, or a meeting */}
      {(p.promise || wantsMeeting(p)) && (
        <div className="row" style={{ gap: 8 }}>
          <span className="small dim2 grow">{promiseStatus(league, p) ?? (p.mood.tradeRequest ? 'He wants a trade.' : "He's unhappy.")}</span>
          {!p.promise && (
            <button className="btn xs" onClick={() => setMeet(true)}>
              <MessageCircle size={14} /> Meet
            </button>
          )}
        </div>
      )}
      <div className="card tight">
        {/* every season he's signed for, a signed extension's included */}
        {Array.from({ length: exp - p.contract.start + 1 }, (_, i) => p.contract.start + i).map((s) => (
          <div key={s} className="row between small" style={{ padding: '3px 0', opacity: s < league.season ? 0.5 : 1 }}>
            <span className="dim2">
              {seasonLabel(s)}
              {s === exp && opt ? <span className={`fo-opt ${opt === 'team' ? 'team' : ''}`}>{opt === 'team' ? 'TO' : 'PO'}</span> : null}
              {extStart !== null && s >= extStart && <span className="fo-opt ext">EXT</span>}
            </span>
            <span className="num bold">{fmtM(salaryFor(p, s), 2)}</span>
          </div>
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
      {upNote ? (
        <div className="fo-callout warn">
          <TriangleAlert size={18} className="warn" />
          <div>{upNote}</div>
        </div>
      ) : null}
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
          <button className="btn danger" disabled={tooFew || expiringNow} onClick={() => setConfirm(true)}>
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
              ? `Releasing him leaves ${fmtM(owed)} in dead money through ${seasonLabel(remaining[remaining.length - 1].season)}${league.phase === 'regular' ? ', unless a team claims him off waivers' : ''}.${stretched.length ? ` Stretched, ${fmtM(stretched[0].amount)} a season${stretched.length < (stretch?.length ?? 0) ? ' after this one' : ''} through ${seasonLabel(stretched[stretched.length - 1].season)}.` : ''}${buyout ? ` A buyout would cut it to ${fmtM(buyout.dead)}.` : ''}`
              : p.contract.twoWay
                ? 'Releasing him costs nothing: two-way pay sits outside the cap.'
                : p.contract.tenDay
                  ? 'Releasing him leaves no dead money: his 10-day pay was paid when he signed.'
                  : camp
                    ? "Releasing him costs nothing: his minimum deal isn't guaranteed until opening night."
                    : 'Releasing him leaves no dead money.'}
          </div>
        )
      )}
      {noTrade && <div className="tiny dim">{noTrade}</div>}
      {!expiringNow && <UntouchableToggle league={league} p={p} />}
    </div>
  );
}
