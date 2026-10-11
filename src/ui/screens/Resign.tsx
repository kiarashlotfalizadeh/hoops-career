import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CircleCheck, DoorOpen, PenLine } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, payroll, playerName, standardRoster, teamPlayers } from '../../core/league/helpers';
import { askingContract, decideTeamOption, pendingTeamOptions, teamOptionWorth } from '../../core/league/contracts';
import { capHolds, expiringPlayers, renouncePlayer } from '../../core/league/freeAgency';
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
  const [renounce, setRenounce] = useState<Player | null>(null);
  const expiring = useMemo(() => expiringPlayers(league, tid).sort((a, b) => b.ovr - a.ovr), [league, v, tid]);
  const asks = useMemo(() => new Map(expiring.map((p) => [p.pid, askingContract(league, p, tid)])), [expiring, league, tid]);
  const committed = payroll(league, tid, next);
  const holds = capHolds(league, tid).reduce((a, h) => a + h.amount, 0);
  const ifAll = committed + expiring.filter((p) => !p.mood.tradeRequest).reduce((a, p) => a + (asks.get(p.pid)?.amount ?? 0), 0);
  const resigned = teamPlayers(league, tid)
    .filter((p) => p.contract.start === next && !p.contract.rookie)
    .sort((a, b) => b.ovr - a.ovr);
  const options = useMemo(() => pendingTeamOptions(league, tid).sort((a, b) => b.ovr - a.ovr), [league, v, tid]);
  // standard roster spots only: two-way deals sit outside the 15
  const rosterNext = standardRoster(league, tid).length - expiring.filter((p) => !p.contract.twoWay).length;

  const doRenounce = (p: Player) => {
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = renouncePlayer(l, p.pid);
    });
    useStore.getState().toast(res.reason, res.ok ? 'neutral' : 'bad');
    setRenounce(null);
  };

  const decide = (p: Player, exercise: boolean) => {
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = decideTeamOption(l, p.pid, exercise);
    });
    useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
  };

  const busy = useStore((s) => !!s.sim);
  const openFA = async () => {
    // runs behind the progress bar; a second tap (or a stale screen) is a no-op
    if (!(await useStore.getState().task('Opening free agency', (l) => void startFreeAgency(l)))) return;
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
            <p style={{ margin: 0 }}>
              <b>Cap holds.</b> Until then, each expiring player counts against next season's cap at about his asking price, so you can't spend the same room twice (say, on salary taken back in a trade). Renounce a player to clear his hold: he leaves for free agency.
            </p>
            <p style={{ margin: 0 }}>
              <b>Options.</b> Players with a player option on next season have already decided: those who opted out are in the expiring list. Team options (including rookie-scale fourth years) are your call: exercise to keep him at that salary, or decline and he joins the expiring list. Undecided options get the staff's call when free agency opens.
            </p>
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
          <Kpi k="Cap space" v={fmtM(cap.salaryCap - committed - holds)} color={cap.salaryCap - committed - holds > 0 ? 'var(--good)' : 'var(--warn)'} sub={holds > 0 ? 'after holds' : undefined} />
          <Kpi k="Under tax" v={fmtM(cap.luxuryTax - committed)} color={cap.luxuryTax - committed < 0 ? 'var(--bad)' : undefined} />
          <Kpi k="Roster" v={`${rosterNext}/${CAP.rosterMax}`} sub={rosterNext > CAP.rosterMax ? `${rosterNext - CAP.rosterMax} to cut` : 'under contract'} color={rosterNext > CAP.rosterMax || rosterNext < CAP.rosterMin ? 'var(--warn)' : undefined} />
        </div>
        {rosterNext > CAP.rosterMax && (
          <div className="small warn" style={{ marginTop: 8 }}>
            You already have {rosterNext} players under contract for {seasonLabel(next)}. The offseason allows {OFFSEASON_ROSTER_MAX}, but only {CAP.rosterMax} make opening night: trade or release before then.
          </div>
        )}
        <div className="tiny dim" style={{ marginTop: 8 }}>
          Striped: what the {expiring.length} expiring player{expiring.length === 1 ? '' : 's'} would add at their current asks. Until free agency opens they hold that cap room ({fmtM(holds)} in cap holds, {fmtM(cap.salaryCap - committed)} of space without them) unless you renounce them; what's left after re-signing is yours to use in free agency.
        </div>
      </Card>

      {options.length > 0 && (
        <>
          <SecTitle>Team options · {options.length}</SecTitle>
          {options.map((p) => {
            const sal = salaryFor(p, next);
            const worth = teamOptionWorth(league, p);
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
                <div className="row" style={{ marginTop: 10, gap: 10 }}>
                  <div className="grow">
                    <div className="tiny dim upper bold">{seasonLabel(next)} option{p.contract.rookie ? ' · rookie scale' : ''}</div>
                    <div className="small">
                      <b className="num" style={{ fontSize: 16 }}>
                        {fmtM(sal)}
                      </b>
                      <span className={worth ? 'good' : 'warn'}> · staff: {worth ? 'exercise' : 'decline'}</span>
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => decide(p, false)}>
                    Decline
                  </button>
                  <button className="btn sm primary" onClick={() => decide(p, true)}>
                    Exercise
                  </button>
                </div>
              </Card>
            );
          })}
          <div className="tiny dim">Declined players join the expiring list below with Bird rights. Options left open get the staff's call when free agency opens.</div>
        </>
      )}

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
                          × {ask.years} yr{ask.years > 1 ? 's' : ''} · {playerAge(p, next)} next season
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <button className="btn sm ghost" onClick={() => setRenounce(p)}>
                  Renounce
                </button>
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
        <button className="btn primary block big" disabled={busy} onClick={() => (expiring.length || options.length ? setConfirm(true) : void openFA())}>
          <DoorOpen size={20} /> Done — open free agency
        </button>
      </div>

      <ContractSheet pid={sel} mode="resign" onClose={() => setSel(null)} />

      <Sheet open={!!renounce} onClose={() => setRenounce(null)} title={renounce ? `Renounce ${renounce.lastName}?` : undefined}>
        {renounce && (
          <div className="col" style={{ gap: 12 }}>
            <div className="dim2">
              You give up {playerName(renounce)}'s Bird rights: he becomes a free agent when the market opens{renounce.mood.tradeRequest ? '' : `, and his ${fmtM(asks.get(renounce.pid)?.amount ?? 0)} cap hold comes off your books now`}. To bring him back you'd have to outbid other teams with cap space.
            </div>
            <div className="row">
              <button className="btn grow" onClick={() => setRenounce(null)}>
                Keep his rights
              </button>
              <button className="btn danger grow" onClick={() => doRenounce(renounce)}>
                Renounce
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Open free agency?">
        <div className="col" style={{ gap: 12 }}>
          {expiring.length > 0 && (
            <div className="dim2">
              {expiring.length} player{expiring.length > 1 ? 's' : ''} will become free agent{expiring.length > 1 ? 's' : ''}. Other teams can sign them on day one; you'd have to compete like everyone else, using cap space.
            </div>
          )}
          {options.length > 0 && (
            <div className="dim2">
              Open team option{options.length > 1 ? 's' : ''}: the staff will {options.map((p) => `${teamOptionWorth(league, p) ? 'exercise' : 'decline'} ${p.lastName}'s`).join(', ')}.
            </div>
          )}
          {expiring.length > 0 && (
            <div className="card tight col" style={{ gap: 6 }}>
              {expiring.map((p) => (
                <div key={p.pid} className="row small" style={{ gap: 8 }}>
                  <OvrPot p={p} showPot={false} />
                  <span className="grow ellipsis bold">{playerName(p)}</span>
                  <span className="dim num">{fmtM(asks.get(p.pid)!.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(false)}>
              Keep negotiating
            </button>
            <button className="btn primary grow" disabled={busy} onClick={() => (setConfirm(false), void openFA())}>
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
        <Kpi k={`${seasonLabel(s + 1)} committed`} v={fmtM(after)} sub={after <= cap.salaryCap ? `${fmtM(cap.salaryCap - after)} under projected cap` : `${fmtM(after - cap.salaryCap)} over projected cap`} color={after < cap.salaryCap ? 'var(--good)' : 'var(--warn)'} />
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
