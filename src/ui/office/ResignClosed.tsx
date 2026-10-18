// The Re-sign desk outside the re-sign period: when it opens, who is up after this season and what
// he'd ask, the players you can extend now, and the ones already extended.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { CAP_FOR, payroll, playerName, teamPlayers } from '../../core/league/helpers';
import { askingContract } from '../../core/league/contracts';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { Avatar, PageHeader, Section, Statline } from '../components/ui';
import { Callout, MoodTag, OvrPot, capSeason, playerMeta, shortSeason } from './common';
import { ContractSheet } from './ContractSheet';
import { restrictedFreeAgents } from '../../core/league/rfa';
import { money } from '../../core/format';
import { ExtendRow, extendablePlayers } from './resignRows';

export function ResignClosed({ league }: { league: League }) {
  const tid = league.userTid;
  const [ext, setExt] = useState<number | null>(null);
  // during the lottery and the draft, the contracts up are this season's: the ones the coming re-sign period is for
  const s = league.phase === 'draftLottery' || league.phase === 'draft' ? league.season : capSeason(league);
  const list = useLeagueMemo(
    () =>
      teamPlayers(league, tid)
        .filter((p) => contractExp(p.contract) === s)
        .sort((a, b) => b.ovr - a.ovr),
    [league, tid, s],
  );
  const canExtend = useLeagueMemo(() => new Set(extendablePlayers(league).map((p) => p.pid)), [league]);
  // the ones already extended: their deals end after this season too, but they're staying
  const extended = useLeagueMemo(
    () =>
      teamPlayers(league, tid)
        .filter((p) => extensionStart(p.contract) === s + 1)
        .sort((a, b) => b.ovr - a.ovr),
    [league, tid, s],
  );
  // two-way pay was never on the cap books (the committed figure beside it leaves it out too)
  const freed = list.reduce((a, p) => a + (p.contract.twoWay ? 0 : salaryFor(p, s)), 0);
  // in free agency, last summer's qualified players are re-signed from the Free Agents screen
  const rfas = useLeagueMemo(() => (league.phase === 'freeAgency' ? restrictedFreeAgents(league, tid) : []), [league, tid]);
  const cap = CAP_FOR(league, s + 1);
  const after = payroll(league, tid, s + 1);
  const [title, when] =
    league.phase === 'freeAgency'
      ? ['Closed for this summer', 'These deals run out after next season: extend them now, or re-sign them next summer.']
      : league.phase === 'draft' || league.phase === 'draftLottery'
        ? ['Opens after the draft', 'Then re-sign your own players for any amount, even over the cap.']
        : league.phase === 'preseason' || league.phase === 'regular'
          ? ['Opens after the playoffs', 'Until the end of the regular season you can extend these players instead.']
          : ['Opens after the draft', 'Until then, review who is up.'];
  return (
    <main className="page fo-page">
      <PageHeader title="Re-sign" sub={`Contracts up after ${seasonLabel(s)}`} back />
      <section className="card fo-now" aria-label="Re-sign period">
        <div className="fo-now-over">Re-sign period</div>
        <h2 className="fo-now-t">{title}</h2>
        <p className="fo-now-s">{when}</p>
        <div className="fo-figs">
          <Statline
            items={[
              { k: `Expiring ${shortSeason(s)}`, v: String(list.length), s: `${money(freed)} off the books` },
              {
                k: `${shortSeason(s + 1)} committed`,
                v: money(after),
                s: after <= cap.salaryCap ? `${money(cap.salaryCap - after)} under projected cap` : `${money(after - cap.salaryCap)} over projected cap`,
                color: after < cap.salaryCap ? 'var(--good)' : 'var(--warn)',
              },
            ]}
          />
        </div>
      </section>

      {rfas.length > 0 && (
        <Callout icon={<ShieldCheck size={16} className="dim" />}>
          Your restricted free agent{rfas.length > 1 ? 's' : ''} ({rfas.map((p) => p.lastName).join(', ')}) can still re-sign with Bird rights until{' '}
          {rfas.length > 1 ? 'they sign' : 'he signs'} an offer sheet, and you can match any sheet.{' '}
          <Link to="/office/free-agents" className="bold accent-text">
            Free agents
          </Link>
        </Callout>
      )}

      <Section title={`Up after ${seasonLabel(s)}`}>
        {list.length === 0 ? (
          <div className="card small dim">No contracts expire after {seasonLabel(s)}.</div>
        ) : (
          <div className="card flush list">
            {list.map((p) => {
              if (canExtend.has(p.pid)) return <ExtendRow key={p.pid} league={league} p={p} onExtend={setExt} />;
              const ask = askingContract(league, p, tid);
              return (
                <Link key={p.pid} to={`/player/${p.pid}`} className="fo-prow">
                  <Avatar p={p} />
                  <div className="grow">
                    <div className="fo-name">{playerName(p)}</div>
                    <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
                    <div className="fo-rs-mood">
                      <MoodTag p={p} />
                    </div>
                  </div>
                  <div className="fo-money">
                    <div className="a">{money(salaryFor(p, s))}</div>
                    <div className="b">would ask ~{money(ask.amount)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <div className="tiny dim">
          Asks use today's ratings and mood; both change by the summer.{canExtend.size > 0 ? " An extension's ask is for the season after his deal ends." : ''}
        </div>
      </Section>

      {extended.length > 0 && (
        <Section title="Extended">
          <div className="card flush list">
            {extended.map((p) => (
              <Link key={p.pid} to={`/player/${p.pid}`} className="listrow">
                <OvrPot p={p} showPot={false} />
                <div className="grow fo-min0">
                  <div className="fo-name">{playerName(p)}</div>
                  <div className="fo-meta">
                    {p.pos} · {playerAge(p, s + 1)} in {shortSeason(s + 1)}
                  </div>
                </div>
                <div className="fo-money">
                  <div className="a">{money(salaryFor(p, s + 1))}</div>
                  <div className="b">thru {shortSeason(contractExp(p.contract))}</div>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <ContractSheet pid={ext} mode="extend" onClose={() => setExt(null)} />
    </main>
  );
}
