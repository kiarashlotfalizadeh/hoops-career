// The Re-sign desk outside the re-sign period: when it opens, who is up after this season and what
// he'd ask, the players you can extend now, and the ones already extended.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import type { League } from '../../core/types';
import { CAP_FOR, payroll, playerName, shortName, teamPlayers } from '../../core/league/helpers';
import { askingContract, extensionBlockedReason } from '../../core/league/contracts';
import { capHolds } from '../../core/league/freeAgency';
import { extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { PageHeader, Section, Statline } from '../components/ui';
import { Callout, OvrPot, capRoomFig, contractEnd, contractsUp, forYears, playerMeta, salaryText, shortSeason } from './common';
import { ContractSheet } from './ContractSheet';
import { restrictedFreeAgents } from '../../core/league/rfa';
import { money } from '../../core/format';
import { ExtendRow, extendablePlayers } from './resignRows';

export function ResignClosed({ league }: { league: League }) {
  const tid = league.userTid;
  const [ext, setExt] = useState<number | null>(null);
  // during the lottery and the draft, the contracts up are this season's: the ones the coming re-sign period is for
  const { season: s, players: up } = useLeagueMemo(() => contractsUp(league, tid), [league, tid]);
  const list = [...up].sort((a, b) => b.ovr - a.ovr);
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
  // from the lottery on, the expiring players hold room against it (their cap holds), as on the Office's cap sheet
  const holds = s + 1 === league.season + 1 ? capHolds(league, tid).reduce((a, h) => a + h.amount, 0) : 0;
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
      <PageHeader title="Re-sign" sub={`Contracts up after ${shortSeason(s)}`} back />
      <section className="fo-capsheet fo-statement" aria-label="Re-sign period">
        <div className="small dim2">
          <b className="fo-closed-t">The re-sign period {title.charAt(0).toLowerCase() + title.slice(1)}.</b> {when}
        </div>
        <Statline
          items={[
            // (the same cap figure as the Office's cap sheet, holds said; the season they're about once)
            { ...capRoomFig(cap.salaryCap - after - holds), s: holds > 0 ? `after ${money(holds)} in holds` : shortSeason(s + 1) },
            { k: 'Committed', v: money(after), s: holds > 0 ? shortSeason(s + 1) : undefined },
            { k: 'Expiring', v: String(list.length), s: `frees ${money(freed)}` },
          ]}
        />
      </section>

      {rfas.length > 0 && (
        <Callout icon={<ShieldCheck size={16} className="dim" />}>
          Your restricted free agent{rfas.length > 1 ? 's' : ''} ({rfas.map((p) => shortName(league, p)).join(', ')}) can still re-sign with Bird rights until{' '}
          {rfas.length > 1 ? 'they sign' : 'he signs'} an offer sheet, and you can match any sheet.{' '}
          <Link to="/office/free-agents" className="bold accent-text">
            Free agents
          </Link>
        </Callout>
      )}

      <Section title={`Up after ${shortSeason(s)}`}>
        {list.length === 0 ? (
          <div className="card small dim">No contracts expire after {shortSeason(s)}.</div>
        ) : (
          <div className="card flush list">
            {list.map((p) => {
              if (canExtend.has(p.pid)) return <ExtendRow key={p.pid} league={league} p={p} onExtend={setExt} />;
              const ask = askingContract(league, p, tid);
              // why he can't be extended now (a two-way, a deal signed this season), unless it's the calendar's reason for everyone
              const why = extensionBlockedReason(league, p);
              const own = why && !/^(Extensions reopen|No extensions during)/.test(why) ? why : null;
              return (
                <Link key={p.pid} to={`/player/${p.pid}`} className="fo-prow">
                  <OvrPot p={p} />
                  <div className="grow">
                    <div className="fo-name">{playerName(p)}</div>
                    <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
                    {own && <div className="tiny dim fo-why">{own}</div>}
                  </div>
                  <div className="fo-money">
                    <div className="a">{salaryText(league, salaryFor(p, s))}</div>
                    <div className="b">
                      asks ~{salaryText(league, ask.amount)} {forYears(ask.years)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <div className="tiny dim">
          Asks use today's ratings, which change by the summer.
          {canExtend.size > 0 ? ` An extension's ask is from ${shortSeason(s + 1)}, the season after his deal ends.` : ''}
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
                  <div className="a">{salaryText(league, salaryFor(p, s + 1))}</div>
                  <div className="b">{contractEnd(league, p, s)}</div>
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
