import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type LucideIcon, ArrowLeftRight, ChevronRight, History as HistoryIcon, ListOrdered, PenLine, PiggyBank, Timer, TriangleAlert, UserMinus, UserPlus } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { CAP, PHASE_LABEL, seasonLabel } from '../../core/constants';
import { CAP_FOR, curTeamSeason, fmtDate, freeAgents, payroll, playerName, rosterMaxNow, teamPlayers, standardRoster, twoWayRoster } from '../../core/league/helpers';
import { MLE_PCT, askingContract, mleRoom, nonGuaranteed, releaseBlockedReason, releaseDeadMoney, releasePlayer, signingRoute, valueScore } from '../../core/league/contracts';
import { capHolds, expiringPlayers } from '../../core/league/freeAgency';
import { draftOrder, nextPick } from '../../core/league/draft';
import { untradeableReason } from '../../core/league/trades';
import { contractExp, salaryFor } from '../../core/playerGen';
import { useLeague, useStore, useVersion } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Card, Help, Kpi, Ovr, PageHeader, Sheet, activateOnKey } from '../components/ui';
import { CapBar, CenterBar, Gauge, SecTitle, capSeason, contractYearsLabel, fmtM, isOffseason, ownerVerdict, playerMeta, shortSeason } from '../office/common';
import { rosterNames } from '../stats';

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
  const v = useVersion();
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
  const mle = mleRoom(league, tid, s0);
  const inSeasonNow = rosterMaxNow(league) === CAP.rosterMax;
  const [sel, setSel] = useState<number | null>(null);

  const faCount = useMemo(() => freeAgents(league).length, [league, v]);
  const myPicks = league.draftPicks.filter((d) => d.tid === tid);
  const expiring = league.phase === 'resign' ? expiringPlayers(league, tid) : [];
  const inPost = league.phase === 'playin' || league.phase === 'playoffs';
  const pastDeadline = league.phase === 'regular' && league.day > league.tradeDeadlineDay;
  const daysToDeadline = league.tradeDeadlineDay - league.day;
  const tradeSub = inPost
    ? 'Frozen during the postseason'
    : pastDeadline
      ? 'Deadline passed'
      : league.phase === 'regular'
        ? daysToDeadline === 0
          ? 'Deadline today'
          : `Deadline in ${daysToDeadline} day${daysToDeadline === 1 ? '' : 's'}`
        : 'Open for business';
  const thisDraftPicks = myPicks.filter((d) => d.season === league.season && d.pick).sort((a, b) => a.round - b.round || a.pick! - b.pick!);

  const tiles: Tile[] = [
    { to: '/trade', icon: ArrowLeftRight, title: 'Trade', sub: tradeSub, color: 'var(--info)', muted: inPost || pastDeadline },
    {
      to: '/free-agents',
      icon: UserPlus,
      title: 'Free Agents',
      sub:
        league.phase === 'freeAgency'
          ? `Day ${Math.min(30, league.faDay + 1)} of 30 · ${faCount} left`
          : `${faCount} available · ${space > 0 ? `${fmtM(space)} space` : mle > 0 ? `${fmtM(mle)} mid-level` : 'min deals only'}`,
      color: 'var(--good)',
      hot: league.phase === 'freeAgency',
    },
    {
      to: '/resign',
      icon: PenLine,
      title: 'Re-sign',
      sub: league.phase === 'resign' ? `${expiring.length} expiring · negotiate now` : league.phase === 'freeAgency' ? 'Closed until next summer' : 'Opens after the draft',
      color: 'var(--warn)',
      hot: league.phase === 'resign' && expiring.length > 0,
      muted: league.phase !== 'resign',
    },
    {
      to: '/draft',
      icon: ListOrdered,
      title: 'Draft',
      sub: thisDraftPicks.length
        ? `You pick ${thisDraftPicks.map((d) => `#${(d.round - 1) * 30 + d.pick!}`).join(', ')}`
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
              <b>Mid-level exception.</b> Once a season, a team that stays under the tax line can sign one free agent for up to {fmtM(cap.salaryCap * MLE_PCT)} (
              {Math.round(MLE_PCT * 1000) / 10}% of the cap), even over the cap. For the rest of that season, trades can't take its payroll past the tax line.
            </p>
            <p style={{ margin: 0 }}>
              <b>Bird rights.</b> Your own expiring players can be re-signed for any amount during the re-sign phase, even over the cap. Until free agency opens (or you renounce
              them), each one holds cap room at about his asking price.
            </p>
            <p style={{ margin: 0 }}>
              <b>Luxury tax ({fmtM(cap.luxuryTax)}).</b> Every dollar of payroll above the tax line costs {CAP.taxRate}× in tax at the end of the regular season. The pot is shared
              by non-taxpaying teams.
            </p>
            <p style={{ margin: 0 }}>
              <b>Trades.</b> A team that is over the cap after a trade can take back at most 125% of the salary it sends out, plus $0.1M.
            </p>
            <p style={{ margin: 0 }}>
              <b>Rosters.</b> {CAP.rosterMin} to {CAP.rosterMax} players in season, up to 21 in the offseason. Minimum deals signed for the coming season aren't guaranteed until
              opening night: cutting one before then leaves no dead money. First-round picks sign rookie-scale deals (4 years, team option on the last).
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
          <span className={`tag ${pay > cap.luxuryTax ? 'bad' : pay > cap.salaryCap ? 'warn' : 'good'}`}>
            {pay > cap.luxuryTax ? 'Taxpayer' : pay > cap.salaryCap ? 'Over the cap' : 'Under the cap'}
          </span>
        </div>
        <div style={{ marginTop: 6 }}>
          <CapBar pay={pay} cap={cap.salaryCap} tax={cap.luxuryTax} add={holds} legend={false} />
        </div>
        {holds > 0 && (
          <div className="tiny dim" style={{ marginTop: 4 }}>
            Striped: {fmtM(holds)} in cap holds for your expiring players.
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
                  : mle > 0
                    ? `Min deals or the ${fmtM(mle)} mid-level`
                    : `Min deals only (${fmtM(cap.vetMin, 2)})`
            }
          />
          <Kpi
            k={isOffseason(league) ? `Roster ${shortSeason(s0)}` : 'Roster'}
            v={`${signedN}/${CAP.rosterMax}`}
            color={signedN > rosterMaxNow(league) ? 'var(--bad)' : signedN > CAP.rosterMax || signedN < CAP.rosterMin ? 'var(--warn)' : undefined}
            sub={
              (expiringN > 0
                ? `+${expiringN} expiring`
                : signedN > CAP.rosterMax
                  ? inSeasonNow
                    ? `${signedN - CAP.rosterMax} over the limit`
                    : `${signedN - CAP.rosterMax} to cut by opening night`
                  : signedN < CAP.rosterMin
                    ? `Need ${CAP.rosterMin - signedN} more`
                    : `${CAP.rosterMax - signedN} open spot${CAP.rosterMax - signedN === 1 ? '' : 's'}`) + (twoWays ? ` · ${twoWays} two-way` : '')
            }
          />
          <Kpi
            k={pay > cap.luxuryTax ? 'Tax bill (est.)' : 'Room under tax'}
            v={pay > cap.luxuryTax ? fmtM(tax) : fmtM(cap.luxuryTax - pay)}
            color={pay > cap.luxuryTax ? 'var(--bad)' : undefined}
            sub={`Tax line ${fmtM(cap.luxuryTax)}`}
          />
          <Kpi k="Cash" v={fmtM(team.cash)} color={team.cash < 0 ? 'var(--bad)' : undefined} sub={`${ts.won}-${ts.lost} · ${seasonLabel(league.season)}`} />
        </div>
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
              ] as const
            ).map(([k, val]) => (
              <div key={k} className="row" style={{ gap: 8 }}>
                <span className="tiny dim upper bold" style={{ width: 58 }}>
                  {k}
                </span>
                <div className="grow">
                  <CenterBar value={val} />
                </div>
              </div>
            ))}
          </div>
          <ChevronRight size={18} className="dim" />
        </div>
      </Link>

      <ContractsTable league={league} onPick={setSel} />

      <PlayerContractSheet pid={sel} onClose={() => setSel(null)} />
    </main>
  );
}

// ------------------------------------------------------------------ phase spotlight

function Spotlight({ league }: { league: League }) {
  const nav = useNavigate();
  const tid = league.userTid;
  const v = useVersion();
  const s0 = capSeason(league);
  const space = CAP_FOR(league, s0).salaryCap - payroll(league, tid, s0);
  const mle = mleRoom(league, tid, s0);
  const roster = standardRoster(league, tid).length;
  const full = roster >= rosterMaxNow(league);
  // only players the team can actually pay: cap space, the mid-level or the minimum
  const topFAs = useMemo(
    () =>
      league.phase === 'freeAgency' || league.phase === 'preseason'
        ? freeAgents(league)
            .filter((p) => signingRoute(league, tid, askingContract(league, p, tid).amount, s0))
            .sort((a, b) => valueScore(league, b) - valueScore(league, a))
            .slice(0, league.phase === 'preseason' ? 3 : 5)
        : [],
    [league, v, tid, s0],
  );

  switch (league.phase) {
    case 'draftLottery':
    case 'draft': {
      const np = nextPick(league);
      const onClock = league.phase === 'draft' && np?.tid === tid;
      const mine = draftOrder(league).filter((d) => d.tid === tid);
      return (
        <Card className={`fo-hero ${onClock ? 'fo-clock' : ''}`} accent={!onClock}>
          {onClock ? <div className="fo-live">You're on the clock</div> : <div className="fo-eyebrow">{league.phase === 'draft' ? 'Draft night' : 'Lottery results are in'}</div>}
          <div className="row" style={{ marginTop: 8, gap: 12 }}>
            {np && league.phase === 'draft' ? <TeamLogo tid={np.tid} size={46} /> : <ListOrdered size={34} />}
            <div className="grow">
              <div className="fo-mid">
                {league.phase === 'draft' && np
                  ? onClock
                    ? `Pick #${(np.round - 1) * 30 + np.pick!} is yours`
                    : `${league.teams[np.tid].abbrev} pick #${(np.round - 1) * 30 + np.pick!}`
                  : league.phase === 'draft'
                    ? 'Draft complete'
                    : `${league.season} NBA Draft`}
              </div>
              <div className="small dim2">
                {mine.length ? `Your picks: ${mine.map((d) => `#${(d.round - 1) * 30 + d.pick!}`).join(', ')}` : 'You have no picks left this year.'}
              </div>
            </div>
          </div>
          <button className={`btn block ${onClock ? 'good' : 'primary'}`} style={{ marginTop: 12 }} onClick={() => nav('/draft')}>
            {onClock ? 'Make your pick' : 'Open the draft board'}
          </button>
        </Card>
      );
    }
    case 'resign': {
      const exp = expiringPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
      return (
        <Card accent className="fo-hero">
          <div className="fo-eyebrow">Re-signing window</div>
          <div className="fo-mid" style={{ marginTop: 6 }}>
            {exp.length ? `${exp.length} contract${exp.length > 1 ? 's' : ''} expiring` : 'No expiring contracts'}
          </div>
          <div className="small dim2">Re-sign your own players before free agency opens. Bird rights let you exceed the cap to keep them.</div>
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
      return (
        <Card accent className="fo-hero">
          <div className="row between">
            <div className="fo-eyebrow">{fa ? `Free agency · Day ${Math.min(30, league.faDay + 1)} of 30` : 'Preseason'}</div>
            <span className="tag">{space > 0 ? `${fmtM(space)} space` : mle > 0 ? `Mid-level ${fmtM(mle)}` : 'Min deals only'}</span>
          </div>
          {full && (
            <div className="small bad" style={{ marginTop: 6 }}>
              Your roster is full ({roster}). Release or trade someone before signing anyone.
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
                `Roster set at ${roster}. Best players you can still afford:`
              )}
            </div>
          )}
          {fa && space <= 0 && (
            <div className="small dim2" style={{ marginTop: 6 }}>
              {mle > 0
                ? 'Over the cap: the best players you can sign for the minimum or with your mid-level exception.'
                : 'Over the cap: the best players who would sign for the minimum.'}
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
                    to="/free-agents"
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
              Rosters are locked to trades until the offseason. You can still sign free agents: with cap space, or on minimum deals ({fmtM(CAP_FOR(league).vetMin, 2)}).
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

const m1 = (k: number) => (k / 1000).toFixed(1);

function ContractsTable({ league, onPick }: { league: League; onPick: (pid: number) => void }) {
  const tid = league.userTid;
  const team = league.teams[tid];
  const s0 = capSeason(league);
  const seasons = [s0, s0 + 1, s0 + 2, s0 + 3];
  const roster = teamPlayers(league, tid).sort((a, b) => salaryFor(b, s0) - salaryFor(a, s0) || contractExp(b.contract) - contractExp(a.contract) || b.ovr - a.ovr);
  const nameOf = rosterNames(roster, { initial: true });
  const dead = new Map<number, { name: string; by: Record<number, number> }>();
  for (const d of team.deadMoney) {
    if (d.season < s0 || d.season > s0 + 3) continue;
    const e = dead.get(d.pid) ?? { name: d.name, by: {} };
    e.by[d.season] = (e.by[d.season] ?? 0) + d.amount;
    dead.set(d.pid, e);
  }
  const totals = seasons.map((s) => payroll(league, tid, s));
  const caps = seasons.map((s) => CAP_FOR(league, s).salaryCap);
  return (
    <>
      <SecTitle
        right={
          <Help title="Contracts">
            <p style={{ margin: 0 }}>Salaries for the next four seasons. Contracts rise 5% per year.</p>
            <p style={{ margin: 0 }}>
              <span className="fo-opt">PO</span> player option and <span className="fo-opt team">TO</span> team option apply to the final season.{' '}
              <span className="tag info">R</span> marks a rookie-scale deal.
            </p>
            <p style={{ margin: 0 }}>
              <span className="tag">2W</span> two-way deals are paid outside the cap and the tax, so they're left out of the totals.
            </p>
            <p style={{ margin: 0 }}>Dead money is salary still owed to players you released. It counts against the cap until it runs out.</p>
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
              const anySalary = seasons.some((s) => salaryFor(p, s) > 0);
              return (
                <tr key={p.pid} className="clickable" tabIndex={0} onClick={() => onPick(p.pid)} onKeyDown={activateOnKey(() => onPick(p.pid))}>
                  <td className="l sticky">
                    <div className="row" style={{ gap: 5 }}>
                      <span className="fo-name small" style={{ maxWidth: 96 }}>
                        {nameOf(p.pid)}
                      </span>
                      {p.contract.rookie && (
                        <span className="tag info" style={{ height: 16, padding: '0 4px', fontSize: 10 }}>
                          R
                        </span>
                      )}
                      {p.contract.twoWay && (
                        <span className="tag" style={{ height: 16, padding: '0 4px', fontSize: 10 }}>
                          2W
                        </span>
                      )}
                      {p.injury && (
                        <span className="tag bad" style={{ height: 16, padding: '0 4px', fontSize: 10 }}>
                          INJ
                        </span>
                      )}
                    </div>
                    <div className="tiny dim">
                      {p.pos} · {league.season - p.bornYear}
                    </div>
                  </td>
                  <td>
                    <Ovr v={p.ovr} size="sm" />
                  </td>
                  {!anySalary ? (
                    <td colSpan={4} className="l">
                      <span className="tag warn">Expiring</span> <span className="tiny dim">{league.phase === 'resign' ? 'Re-sign or he walks' : 'Free agent this summer'}</span>
                    </td>
                  ) : (
                    seasons.map((s) => {
                      const amt = salaryFor(p, s);
                      return (
                        <td key={s} className={amt && !p.contract.twoWay ? '' : 'dim'}>
                          {amt ? m1(amt) : '—'}
                          {amt > 0 && s === exp && p.contract.option && (
                            <span className={`fo-opt ${p.contract.option === 'team' ? 'team' : ''}`}>{p.contract.option === 'team' ? 'TO' : 'PO'}</span>
                          )}
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
                  <span className="fo-name small" style={{ maxWidth: 120, display: 'inline-block' }}>
                    {d.name}
                  </span>
                  <div className="tiny">dead money</div>
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
            <tr className="total">
              <td className="l sticky">Cap space</td>
              <td />
              {totals.map((t, i) => (
                <td key={i}>
                  <div style={{ color: caps[i] - t >= 0 ? 'var(--good)' : 'var(--text-dim)' }}>{m1(caps[i] - t)}</div>
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

function PlayerContractSheet({ pid, onClose }: { pid: number | null; onClose: () => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  const open = !!p && p.tid === league.userTid;
  return (
    <Sheet open={open} onClose={onClose}>
      {open && p && <PlayerContractBody key={p.pid} p={p} onClose={onClose} />}
    </Sheet>
  );
}

function PlayerContractBody({ p, onClose }: { p: Player; onClose: () => void }) {
  const league = useLeague();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const exp = contractExp(p.contract);
  const remaining = releaseDeadMoney(league, p);
  const camp = nonGuaranteed(league, p);
  const owed = remaining.reduce((a, r) => a + r.amount, 0);
  const n = standardRoster(league, league.userTid).length;
  const blocked = releaseBlockedReason(league, p);
  const tooFew = !!blocked;
  const expiringNow = isOffseason(league) && exp <= league.season;
  const noTrade = expiringNow ? null : untradeableReason(league, p);
  const s0 = capSeason(league);

  const release = () => {
    const name = playerName(p);
    useStore.getState().mutate((l) => releasePlayer(l, l.players[p.pid]));
    useStore.getState().toast(`${name} released. ${owed > 0 ? `${fmtM(owed)} stays on your books.` : ''}`, 'neutral');
    onClose();
  };

  if (confirm) {
    return (
      <div className="col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <UserMinus className="bad" />
          <h2 className="grow">Release {p.lastName}?</h2>
        </div>
        <p className="dim2" style={{ margin: 0 }}>
          {playerName(p)} becomes a free agent immediately and can sign with any team.{' '}
          {p.contract.twoWay ? (
            'Two-way pay sits outside the cap, so there is no dead money.'
          ) : camp ? (
            "His minimum deal isn't guaranteed until opening night, so there is no dead money."
          ) : (
            <>
              <b>His remaining salary stays on your books</b> as dead money and counts against the cap and your payroll until it runs out.
            </>
          )}
        </p>
        {remaining.length > 0 && (
          <div className="card tight">
            {remaining.map((r) => (
              <div key={r.season} className="row between small" style={{ padding: '3px 0' }}>
                <span className="dim2">{seasonLabel(r.season)}</span>
                <span className="num bold">{fmtM(r.amount)}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="row between small">
              <span className="bold">Dead money</span>
              <span className="num bold bad">{fmtM(owed)}</span>
            </div>
          </div>
        )}
        {!p.contract.twoWay && n - 1 < CAP.rosterMin && !tooFew && (
          <div className="fo-callout warn">
            <TriangleAlert size={18} className="warn" />
            <div>
              You'll have {n - 1} players. Rosters need at least {CAP.rosterMin} to start the season.
            </div>
          </div>
        )}
        <div className="row">
          <button className="btn grow" onClick={() => setConfirm(false)}>
            Keep him
          </button>
          <button className="btn danger grow" onClick={release}>
            Release
          </button>
        </div>
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
        <span className="tag">{contractYearsLabel(p, s0)}</span>
        {p.contract.rookie && <span className="tag info">Rookie scale</span>}
        {p.contract.option && (
          <span className={`tag ${p.contract.option === 'team' ? 'warn' : 'info'}`}>
            {p.contract.option === 'team' ? 'Team' : 'Player'} option {seasonLabel(exp)}
          </span>
        )}
        {p.mood.tradeRequest && <span className="tag bad">Wants a trade</span>}
      </div>
      <div className="card tight">
        {p.contract.salaries.map((amt, i) => {
          const s = p.contract.start + i;
          return (
            <div key={s} className="row between small" style={{ padding: '3px 0', opacity: s < league.season ? 0.5 : 1 }}>
              <span className="dim2">
                {seasonLabel(s)}
                {s === exp && p.contract.option ? (
                  <span className={`fo-opt ${p.contract.option === 'team' ? 'team' : ''}`}>{p.contract.option === 'team' ? 'TO' : 'PO'}</span>
                ) : null}
              </span>
              <span className="num bold">{fmtM(amt, 2)}</span>
            </div>
          );
        })}
      </div>
      {expiringNow ? (
        <div className="fo-callout warn">
          <TriangleAlert size={18} className="warn" />
          <div>
            His contract is up.{' '}
            {league.phase === 'resign'
              ? 'Re-sign him now or he becomes a free agent.'
              : 'You hold his rights until free agency opens: re-sign him in the re-signing period after the draft.'}
          </div>
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
      {blocked && <div className="tiny dim">{blocked}</div>}
      {noTrade && <div className="tiny dim">{noTrade}</div>}
    </div>
  );
}
