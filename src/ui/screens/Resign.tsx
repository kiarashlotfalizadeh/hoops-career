import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CircleCheck, DoorOpen, PenLine } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, payroll, playerName, teamPlayers } from '../../core/league/helpers';
import { askingContract } from '../../core/league/contracts';
import { expiringPlayers } from '../../core/league/freeAgency';
import { startFreeAgency } from '../../core/league/season';
import { contractExp, playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useStore, useVersion } from '../../state/store';
import { Avatar, Card, Help, Kpi, PageHeader, Sheet } from '../components/ui';
import { f1, latestLine, p1, playerSeason } from '../stats';
import { CapBar, Callout, MoodTag, OvrPot, SecTitle, capSeason, fmtM, playerMeta } from '../office/common';
import { ContractSheet } from '../office/ContractSheet';

export default function Resign() {
  const league = useLeague();
  return league.phase === 'resign' ? <ResignPhase /> : <OffPhase league={league} />;
}

function StatLine({ league, p }: { league: League; p: Player }) {
  const pg = playerSeason(p, league.season);
  const line = pg && pg.gp > 0 ? { season: league.season, pg } : latestLine(league, p);
  if (!line) return <div className="tiny dim">No stats yet</div>;
  const s = line.pg;
  return (
    <div className="fo-statline">
      <span className="tiny upper bold">{seasonLabel(line.season)}</span>
      <span>
        <b>{f1(s.pts)}</b> pts
      </span>
      <span>
        <b>{f1(s.reb)}</b> reb
      </span>
      <span>
        <b>{f1(s.ast)}</b> ast
      </span>
      <span>
        <b>{f1(s.min)}</b> min
      </span>
      <span>
        <b>{p1(s.tsPct)}</b> TS
      </span>
      <span>
        <b>{s.gp}</b> gp
      </span>
    </div>
  );
}

function ResignPhase() {
  const league = useLeague();
  const v = useVersion();
  const nav = useNavigate();
  const tid = league.userTid;
  const next = league.season + 1;
  const cap = CAP_FOR(league, next);
  const [sel, setSel] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const expiring = useMemo(() => expiringPlayers(league, tid).sort((a, b) => b.ovr - a.ovr), [league, v, tid]);
  const asks = useMemo(() => new Map(expiring.map((p) => [p.pid, askingContract(league, p, tid)])), [expiring, league, tid]);
  const committed = payroll(league, tid, next);
  const ifAll = committed + expiring.filter((p) => !p.mood.tradeRequest).reduce((a, p) => a + (asks.get(p.pid)?.amount ?? 0), 0);
  const resigned = teamPlayers(league, tid)
    .filter((p) => p.contract.start === next && !p.contract.rookie)
    .sort((a, b) => b.ovr - a.ovr);
  const rosterNext = teamPlayers(league, tid).length - expiring.length;

  const openFA = () => {
    useStore.getState().mutate((l) => startFreeAgency(l));
    useStore.getState().toast('Free agency is open!', 'good');
    nav('/free-agents');
  };

  return (
    <main className="page">
      <PageHeader
        title="Re-sign Players"
        sub={`Contracts start ${seasonLabel(next)} · before free agency`}
        back
        right={
          <Help title="Re-signing your players">
            <p style={{ margin: 0 }}>
              <b>Bird rights.</b> You may re-sign your own players for any amount, even if it takes you over the cap. This is the only time you can exceed the cap for anything other than minimum deals.
            </p>
            <p style={{ margin: 0 }}>
              <b>Asking price.</b> Each player asks for roughly his market value, adjusted by how much he likes playing for you. Pay the ask (for his preferred length) and he signs on the spot.
            </p>
            <p style={{ margin: 0 }}>
              <b>Luxury tax.</b> Payroll above {fmtM(cap.luxuryTax)} costs {CAP.taxRate}× in tax at the end of the season.
            </p>
            <p style={{ margin: 0 }}>Anyone you don't re-sign becomes an unrestricted free agent when free agency opens. Other teams may sign him.</p>
          </Help>
        }
      />

      <Card className="fo-hero" title={<h3>{seasonLabel(next)} payroll</h3>} right={<span className="tag info">Bird rights</span>}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="tiny dim upper bold">Committed</div>
            <div className="fo-big">{fmtM(committed)}</div>
          </div>
          <div className="right">
            <div className="tiny dim upper bold">If you keep everyone</div>
            <div className="fo-mid" style={{ color: ifAll > cap.luxuryTax ? 'var(--bad)' : ifAll > cap.salaryCap ? 'var(--warn)' : 'var(--good)' }}>
              {fmtM(ifAll)}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 4 }}>
          <CapBar pay={committed} cap={cap.salaryCap} tax={cap.luxuryTax} add={ifAll - committed} />
        </div>
        <div className="grid3" style={{ marginTop: 12 }}>
          <Kpi k="Cap space" v={fmtM(cap.salaryCap - committed)} color={cap.salaryCap - committed > 0 ? 'var(--good)' : 'var(--warn)'} />
          <Kpi k="Under tax" v={fmtM(cap.luxuryTax - committed)} color={cap.luxuryTax - committed < 0 ? 'var(--bad)' : undefined} />
          <Kpi k="Roster" v={`${rosterNext}`} sub={`signed for ${seasonLabel(next).slice(-5)}`} color={rosterNext < CAP.rosterMin ? 'var(--warn)' : undefined} />
        </div>
        <div className="tiny dim" style={{ marginTop: 8 }}>
          Striped: what the {expiring.length} expiring player{expiring.length === 1 ? '' : 's'} would add at their current asks. Cap space left after re-signing is what you can use in free agency.
        </div>
      </Card>

      <SecTitle>
        Expiring contracts · {expiring.length}
      </SecTitle>
      {expiring.length === 0 ? (
        <Card>
          <div className="row" style={{ gap: 10 }}>
            <CircleCheck className="good" />
            <div className="small dim2">Nobody left to re-sign. Open free agency when you're ready.</div>
          </div>
        </Card>
      ) : (
        expiring.map((p) => {
          const ask = asks.get(p.pid)!;
          return (
            <Card key={p.pid} className="tight">
              <div className="row" style={{ gap: 10 }}>
                <Avatar p={p} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <Link to={`/player/${p.pid}`} className="fo-name" style={{ display: 'block' }}>
                    {playerName(p)}
                  </Link>
                  <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
                </div>
                <OvrPot p={p} />
              </div>
              <div className="row" style={{ marginTop: 8, gap: 6, minWidth: 0 }}>
                <MoodTag p={p} withNotes />
              </div>
              <div style={{ marginTop: 6 }}>
                <StatLine league={league} p={p} />
              </div>
              <div className="row" style={{ marginTop: 10, gap: 10 }}>
                <div className="grow">
                  {p.mood.tradeRequest ? (
                    <span className="small bad bold">Wants out: won't re-sign</span>
                  ) : (
                    <>
                      <div className="tiny dim upper bold">Asking</div>
                      <div className="small">
                        <b className="num" style={{ fontSize: 16 }}>
                          {fmtM(ask.amount)}
                        </b>
                        <span className="dim">
                          {' '}
                          × {ask.years} yr{ask.years > 1 ? 's' : ''} · age {playerAge(p, next)} next season
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <button className="btn sm primary" disabled={p.mood.tradeRequest} onClick={() => setSel(p.pid)}>
                  <PenLine size={15} /> Negotiate
                </button>
              </div>
            </Card>
          );
        })
      )}

      {resigned.length > 0 && (
        <>
          <SecTitle>Signed this summer</SecTitle>
          <Card className="flush">
            <div className="list">
              {resigned.map((p) => (
                <div key={p.pid} className="listrow">
                  <OvrPot p={p} showPot={false} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="fo-name small">{playerName(p)}</div>
                    <div className="fo-meta tiny">{p.pos} · {playerAge(p, next)} next season</div>
                  </div>
                  <div className="fo-money">
                    <div className="a">{fmtM(salaryFor(p, next))}</div>
                    <div className="b">thru {seasonLabel(contractExp(p.contract)).slice(-5)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <div className="fo-dock">
        <button className="btn primary block big" onClick={() => (expiring.length ? setConfirm(true) : openFA())}>
          <DoorOpen size={20} /> Done — open free agency
        </button>
      </div>

      <ContractSheet pid={sel} mode="resign" onClose={() => setSel(null)} />

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Open free agency?">
        <div className="col" style={{ gap: 12 }}>
          <div className="dim2">
            {expiring.length} player{expiring.length > 1 ? 's' : ''} will become free agent{expiring.length > 1 ? 's' : ''}. Other teams can sign them on day one; you'd have to compete like everyone else, using cap space.
          </div>
          <div className="card tight col" style={{ gap: 6 }}>
            {expiring.map((p) => (
              <div key={p.pid} className="row small" style={{ gap: 8 }}>
                <OvrPot p={p} showPot={false} />
                <span className="grow ellipsis bold">{playerName(p)}</span>
                <span className="dim num">{fmtM(asks.get(p.pid)!.amount)}</span>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(false)}>
              Keep negotiating
            </button>
            <button className="btn primary grow" onClick={() => (setConfirm(false), openFA())}>
              Open free agency
            </button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}

function OffPhase({ league }: { league: League }) {
  const v = useVersion();
  const tid = league.userTid;
  const s = capSeason(league);
  const list = useMemo(
    () =>
      teamPlayers(league, tid)
        .filter((p) => contractExp(p.contract) === s)
        .sort((a, b) => b.ovr - a.ovr),
    [league, v, tid, s],
  );
  const freed = list.reduce((a, p) => a + salaryFor(p, s), 0);
  const cap = CAP_FOR(league, s + 1);
  const after = payroll(league, tid, s + 1);
  const when =
    league.phase === 'freeAgency'
      ? 'The re-sign window for this summer has closed. These contracts run out after next season.'
      : league.phase === 'draft' || league.phase === 'draftLottery'
        ? 'The re-sign window opens right after the draft.'
        : 'The re-sign window opens after the playoffs and the draft. Until then you can review who is up.';
  return (
    <main className="page">
      <PageHeader title="Re-sign Players" sub={`Contracts expiring after ${seasonLabel(s)}`} back />
      <Card className="fo-hero">
        <div className="row top" style={{ gap: 12 }}>
          <CalendarClock size={30} className="dim" />
          <div className="grow">
            <div className="fo-mid">Not the re-signing period</div>
            <div className="small dim2" style={{ marginTop: 4 }}>
              {when} With Bird rights you can then re-sign your own players for any amount, even over the cap.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid2">
        <Kpi k={`Expiring ${seasonLabel(s).slice(-5)}`} v={String(list.length)} sub={`${fmtM(freed)} coming off the books`} />
        <Kpi k={`${seasonLabel(s + 1)} committed`} v={fmtM(after)} sub={`${fmtM(cap.salaryCap - after)} vs projected cap`} color={after < cap.salaryCap ? 'var(--good)' : 'var(--warn)'} />
      </div>

      <SecTitle>Contracts up after {seasonLabel(s)}</SecTitle>
      {list.length === 0 ? (
        <Callout>No contracts expire after {seasonLabel(s)}.</Callout>
      ) : (
        <Card className="flush">
          <div className="list">
            {list.map((p) => {
              const ask = askingContract(league, p, tid);
              return (
                <Link key={p.pid} to={`/player/${p.pid}`} className="fo-prow">
                  <OvrPot p={p} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="fo-name">{playerName(p)}</div>
                    <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
                    <div style={{ marginTop: 4 }}>
                      <MoodTag p={p} />
                    </div>
                  </div>
                  <div className="fo-money">
                    <div className="a">{fmtM(salaryFor(p, s))}</div>
                    <div className="b">would ask ~{fmtM(ask.amount)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
      <div className="tiny dim">Projected asks use today's ratings and mood; both will change by the summer.</div>
    </main>
  );
}
