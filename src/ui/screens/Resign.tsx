import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CircleCheck, DoorOpen, PenLine, ShieldCheck } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, OFFSEASON_ROSTER_MAX, payroll, playerName, standardRoster, teamPlayers } from '../../core/league/helpers';
import {
  askingContract,
  decideTeamOption,
  extensionAsk,
  extensionBlockedReason,
  extensionRefusal,
  pendingTeamOptions,
  rookieScaleDeal,
  teamOptionWorth,
  wantsOut,
} from '../../core/league/contracts';
import { capHolds, expiringPlayers, renouncePlayer, signedThisSummer } from '../../core/league/freeAgency';
import { contractExp, extensionStart, playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { Avatar, PageHeader, Section, Sheet, Statline } from '../components/ui';
import { f1, latestLine, p1, playerSeason } from '../stats';
import { CapBar, Callout, HelpSheet, MoodTag, OvrPot, capSeason, fmtM, playerMeta, shortSeason } from '../office/common';
import { ContractSheet } from '../office/ContractSheet';
import { QualifyRow } from '../office/RfaPanel';
import { MATCH_DAYS, RFA_MAX_SERVICE, restrictedFreeAgents } from '../../core/league/rfa';
import { FIRM_BUMP, talkAsk, talkState } from '../../core/league/negotiation';

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
      <span className="over">{shortSeason(line.season)}</span>
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

/** A player in a Re-sign list: his jersey, name (to his page), line of detail and rating. */
function PlayerTop({ league, p, pot = true }: { league: League; p: Player; pot?: boolean }) {
  return (
    <div className="fo-rs-top">
      <Avatar p={p} />
      <div className="grow">
        <Link to={`/player/${p.pid}`} className="fo-name">
          {playerName(p)}
        </Link>
        <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
      </div>
      <OvrPot p={p} showPot={pot} />
    </div>
  );
}

function ResignPhase() {
  const league = useLeague();
  const nav = useNavigate();
  const tid = league.userTid;
  const next = league.season + 1;
  const cap = CAP_FOR(league, next);
  const [sel, setSel] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [renounce, setRenounce] = useState<Player | null>(null);
  const [decline, setDecline] = useState<Player | null>(null);
  const expiring = useLeagueMemo(() => expiringPlayers(league, tid).sort((a, b) => b.ovr - a.ovr), [league, tid]);
  // (his ask in your talks: up after they broke down)
  const asks = useMemo(() => new Map(expiring.map((p) => [p.pid, talkAsk(league, p, 'resign')])), [expiring, league]);
  const committed = payroll(league, tid, next);
  // the players who hold cap room until free agency: two-way pay sits outside the cap, and a player who wants out won't re-sign
  const holders = capHolds(league, tid);
  const holds = holders.reduce((a, h) => a + h.amount, 0);
  const ifAll = committed + holds;
  const resigned = signedThisSummer(league).sort((a, b) => b.ovr - a.ovr);
  const options = useLeagueMemo(() => pendingTeamOptions(league, tid).sort((a, b) => b.ovr - a.ovr), [league, tid]);
  // in the final season of their deals next season (a rookie whose option was just exercised among them)
  const extendable = useLeagueMemo(() => extendablePlayers(league), [league]);
  const [ext, setExt] = useState<number | null>(null);
  // standard roster spots only: two-way deals sit outside the 15
  const rosterNext = standardRoster(league, tid).length - expiring.filter((p) => !p.contract.twoWay).length;
  // who leaves as a restricted free agent (qualified) and who unrestricted when the market opens
  const qualified = expiring.filter((p) => p.rfa).length;
  const unrestricted = expiring.length - qualified;
  const space = cap.salaryCap - committed - holds;

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
    if (!(await useStore.getState().task('Opening free agency', { kind: 'startFA' }))) return;
    useStore.getState().toast('Free agency is open!', 'good');
    nav('/free-agents');
  };

  return (
    <main className="page fo-page">
      <PageHeader
        title="Re-sign"
        sub={`Deals from ${seasonLabel(next)} · before free agency`}
        back
        right={
          <HelpSheet title="Re-signing your players">
            <p>
              <b>Bird rights.</b> Re-sign your own players for any amount, even over the cap. In free agency, a team over the cap only adds players on minimum deals or with an
              exception (the mid-level, bi-annual or room exception).
            </p>
            <p>
              <b>Asking price.</b> About his market value, moved by how much he likes playing for you. Pay the ask (for his preferred length) and he signs on the spot. He'd take a
              little less, how much he keeps to himself; below that he counters, and he only hears so many offers. Run out his patience and his ask goes up{' '}
              {Math.round((FIRM_BUMP - 1) * 100)}%, and he takes nothing less for the rest of the re-sign period.
            </p>
            <p>
              <b>Options on new deals.</b> On two years or more you can add an option on the last season: a player option (his call) takes about 4% off his price, a team option
              (yours) adds about 6%.
            </p>
            <p>
              <b>Luxury tax.</b> Payroll above {fmtM(cap.luxuryTax)} costs {CAP.taxRate}× in tax at the end of the season.
            </p>
            <p>Anyone you don't re-sign or qualify becomes an unrestricted free agent when free agency opens, and other teams may sign him.</p>
            <p>
              <b>Restricted free agents.</b> A first-round pick finishing his rookie-scale deal, or a player with {RFA_MAX_SERVICE} seasons or fewer, can get a{' '}
              <b>qualifying offer</b>: one season at 125% of his last salary (a rookie-scale pick: 130% for #1 up to 150% for #30), at least the minimum plus $0.2M. In free agency
              you can still re-sign him, and when another team signs him to an offer sheet (2 to 5 years) you have {MATCH_DAYS} days to match it on exactly its terms. Unsigned when
              the market closes, he plays a season on the qualifying offer and is unrestricted after it. You can withdraw the offer until he signs a sheet.
            </p>
            <p>
              <b>Cap holds.</b> Until then each expiring player counts against next season's cap at about his ask, so you can't spend the same room twice (say, on salary taken back
              in a trade). Renounce a player to clear his hold: he leaves for free agency. A qualified player holds the larger of his offer and his ask, through free agency too,
              until he signs or you withdraw the offer.
            </p>
            <p>
              <b>This summer's options.</b> Players with a player option on next season have decided: those who opted out are in the expiring list. Team options (rookie-scale
              fourth years included) are yours: exercise to keep him at that salary, or decline and he joins the expiring list. Undecided ones get the staff's call when free agency
              opens.
            </p>
          </HelpSheet>
        }
      />

      <Section title={`${seasonLabel(next)} payroll`} right={<span className="tag info">Bird rights</span>}>
        <div className="card fo-capsheet fo-hero">
          <div className="fo-pay">
            <div className="grow">
              <div className="over">Committed</div>
              <div className="fo-pay-v num">{fmtM(committed)}</div>
            </div>
            <div className="right">
              <div className="over">Keep everyone</div>
              <div className={`fo-pay-v2 num ${ifAll > cap.luxuryTax ? 'bad' : ifAll > cap.salaryCap ? 'warn' : 'good'}`}>{fmtM(ifAll)}</div>
            </div>
          </div>
          <CapBar pay={committed} cap={cap.salaryCap} tax={cap.luxuryTax} add={ifAll - committed} legend={false} />
          <div className="fo-cap-ends num">
            Cap {fmtM(cap.salaryCap)} · tax line {fmtM(cap.luxuryTax)}
            {holders.length > 0 ? ` · striped: ${holders.length} cap hold${holders.length === 1 ? '' : 's'} at their asks` : ''}
          </div>
          <div className="fo-figs">
            <Statline
              items={[
                { k: 'Cap space', v: fmtM(space), color: space > 0 ? 'var(--good)' : 'var(--warn)', s: holds > 0 ? 'after cap holds' : 'for free agency' },
                { k: 'Cap holds', v: fmtM(holds), s: holds > 0 ? 'renounce to clear' : 'none' },
              ]}
            />
            <Statline
              items={[
                { k: 'Under tax', v: fmtM(cap.luxuryTax - committed), color: cap.luxuryTax - committed < 0 ? 'var(--bad)' : undefined, s: 'committed only' },
                {
                  k: 'Roster',
                  v: `${rosterNext}/${CAP.rosterMax}`,
                  s: rosterNext > CAP.rosterMax ? `${rosterNext - CAP.rosterMax} to cut by opening night` : 'under contract',
                  color: rosterNext > CAP.rosterMax || rosterNext < CAP.rosterMin ? 'var(--warn)' : undefined,
                },
              ]}
            />
          </div>
          {rosterNext > CAP.rosterMax && (
            <div className="small warn">
              Up to {OFFSEASON_ROSTER_MAX} in the offseason, {CAP.rosterMax} on opening night: trade or release before then.
            </div>
          )}
          {holders.length > 0 && (
            <div className="tiny dim">
              Holds stay until free agency opens unless you renounce (a qualified player's through free agency). What's left after re-signing is yours to spend.
            </div>
          )}
        </div>
      </Section>

      {options.length > 0 && (
        <Section title={`Team options · ${options.length}`}>
          <div className="card flush list">
            {options.map((p) => {
              const sal = salaryFor(p, next);
              const worth = teamOptionWorth(league, p);
              return (
                <div key={p.pid} className="fo-rs">
                  <PlayerTop league={league} p={p} />
                  <div className="fo-rs-act">
                    <div className="grow">
                      <div className="fo-rs-ask">
                        <b className="num">{fmtM(sal)}</b> <span className="dim">{shortSeason(next)} option</span>
                      </div>
                      <div className="tiny">
                        {rookieScaleDeal(p) ? <span className="dim">Rookie scale · </span> : null}
                        <span className={worth ? 'good' : 'warn'}>staff: {worth ? 'exercise' : 'decline'}</span>
                      </div>
                    </div>
                    <button className="btn sm" aria-label={`Decline ${playerName(p)}'s option`} onClick={() => setDecline(p)}>
                      Decline
                    </button>
                    <button className="btn sm primary" aria-label={`Exercise ${playerName(p)}'s option`} onClick={() => decide(p, true)}>
                      Exercise
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tiny dim">Declined players join the expiring list with Bird rights. Open options get the staff's call when free agency opens.</div>
        </Section>
      )}

      <Section title={`Expiring contracts · ${expiring.length}`}>
        {expiring.length === 0 ? (
          <div className="card fo-done">
            <CircleCheck className="good" />
            <span className="small dim2">Nobody left to re-sign. Open free agency when you're ready.</span>
          </div>
        ) : (
          <div className="card flush list">
            {expiring.map((p) => {
              const ask = asks.get(p.pid)!;
              return (
                <div key={p.pid} className="fo-rs">
                  <PlayerTop league={league} p={p} />
                  <MoodTag p={p} withNotes />
                  <StatLine league={league} p={p} />
                  <div className="fo-rs-act">
                    <div className="grow">
                      {wantsOut(p) ? (
                        <span className="small bad bold">{p.mood.tradeRequest ? "Wants a trade: won't re-sign" : "Asked for a trade: on hold, won't re-sign"}</span>
                      ) : (
                        <>
                          <div className="fo-rs-ask">
                            <span className="dim">Asks </span>
                            <b className="num">{fmtM(ask.amount)}</b>
                            <span className="dim">
                              {' '}
                              × {ask.years} yr{ask.years > 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="tiny dim">
                            {playerAge(p, next)} next season{talkState(league, p, 'resign').firm ? <b className="warn"> · firm</b> : null}
                          </div>
                        </>
                      )}
                    </div>
                    <button className="btn sm ghost" aria-label={`Renounce ${playerName(p)}`} onClick={() => setRenounce(p)}>
                      Renounce
                    </button>
                    <button className="btn sm primary" aria-label={`Negotiate with ${playerName(p)}`} disabled={wantsOut(p)} onClick={() => setSel(p.pid)}>
                      <PenLine size={15} /> Negotiate
                    </button>
                  </div>
                  <QualifyRow league={league} p={p} />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {resigned.length > 0 && (
        <Section title="Signed this summer">
          <div className="card flush list">
            {resigned.map((p) => (
              <div key={p.pid} className="listrow">
                <OvrPot p={p} showPot={false} />
                <div className="grow fo-min0">
                  <div className="fo-name">{playerName(p)}</div>
                  <div className="fo-meta">
                    {p.pos} · {playerAge(p, next)} next season
                  </div>
                </div>
                <div className="fo-money">
                  <div className="a">{fmtM(salaryFor(p, next))}</div>
                  <div className="b">thru {shortSeason(contractExp(p.contract))}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {extendable.length > 0 && (
        <Section title={`Up after ${shortSeason(next)} · extend now`}>
          <div className="card flush list">
            {extendable.map((p) => (
              <ExtendRow key={p.pid} league={league} p={p} onExtend={setExt} />
            ))}
          </div>
          <div className="tiny dim">Signed through next season. An extension starts the season after, any time until the end of the regular season.</div>
        </Section>
      )}

      <div className="fo-dock fo-dock-go">
        <button className="btn primary block big" disabled={busy} onClick={() => (expiring.length || options.length ? setConfirm(true) : void openFA())}>
          <DoorOpen size={20} /> Done — open free agency
        </button>
      </div>

      <ContractSheet pid={sel} mode="resign" onClose={() => setSel(null)} />
      <ContractSheet pid={ext} mode="extend" onClose={() => setExt(null)} />

      <Sheet open={!!renounce} onClose={() => setRenounce(null)} title={renounce ? `Renounce ${renounce.lastName}?` : undefined}>
        {renounce && (
          <div className="col fo-sheet">
            <p className="fo-lede">
              You give up {playerName(renounce)}'s Bird rights{renounce.rfa ? ' and withdraw his qualifying offer' : ''}: he's an unrestricted free agent when the market opens
              {renounce.contract.twoWay || (wantsOut(renounce) && !renounce.rfa)
                ? ''
                : `, and his ${fmtM(holders.find((h) => h.p.pid === renounce.pid)?.amount ?? 0)} cap hold comes off your books now`}
              . To bring him back you'd have to outbid other teams with cap space.
            </p>
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

      <Sheet open={!!decline} onClose={() => setDecline(null)} title={decline ? `Decline ${decline.lastName}'s option?` : undefined}>
        {decline && (
          <div className="col fo-sheet">
            <p className="fo-lede">
              His {seasonLabel(next)} season ({fmtM(salaryFor(decline, next))}) comes off his contract and he joins the expiring list: re-sign him before free agency, at about{' '}
              {fmtM(askingContract(league, decline, tid).amount)}, or he becomes a free agent. This can't be undone.
            </p>
            <div className="row">
              <button className="btn grow" onClick={() => setDecline(null)}>
                Keep the option
              </button>
              <button className="btn danger grow" onClick={() => (decide(decline, false), setDecline(null))}>
                Decline
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Open free agency?">
        <div className="col fo-sheet">
          {unrestricted > 0 && (
            <p className="fo-lede">
              {unrestricted} player{unrestricted > 1 ? 's' : ''} become{unrestricted > 1 ? '' : 's'} unrestricted: other teams can sign {unrestricted > 1 ? 'them' : 'him'} on day
              one, and you'd compete with cap space like everyone else.
            </p>
          )}
          {qualified > 0 && (
            <p className="fo-lede">
              {qualified === 1 ? 'One qualified player becomes restricted' : `${qualified} qualified players become restricted`}: you can still re-sign{' '}
              {qualified === 1 ? 'him' : 'them'} and match any offer sheet within {MATCH_DAYS} days. {qualified === 1 ? 'His' : 'Their'} cap hold
              {qualified === 1 ? ' stays' : 's stay'} on your books until {qualified === 1 ? 'he signs' : 'they sign'}.
            </p>
          )}
          {options.length > 0 && (
            <p className="fo-lede">
              Open team option{options.length > 1 ? 's' : ''}: the staff will{' '}
              {options.map((p) => `${teamOptionWorth(league, p) ? 'exercise' : 'decline'} ${p.lastName}'s`).join(', ')}.
            </p>
          )}
          {expiring.length > 0 && (
            <div className="card flush list">
              {expiring.map((p) => (
                <div key={p.pid} className="fo-confirm-row">
                  <OvrPot p={p} showPot={false} />
                  <span className="grow ellipsis bold">{playerName(p)}</span>
                  {p.rfa && <span className="tag good">RFA</span>}
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

/** The user's players who can be extended right now (in the final season of their deals), best first. */
const extendablePlayers = (league: League) =>
  teamPlayers(league, league.userTid)
    .filter((p) => !extensionBlockedReason(league, p))
    .sort((a, b) => b.ovr - a.ovr);

/** A player who can be extended now: his salary, what an extension would cost (or that he won't talk), and the button. */
function ExtendRow({ league, p, onExtend }: { league: League; p: Player; onExtend: (pid: number) => void }) {
  const exp = contractExp(p.contract);
  const ask = extensionAsk(league, p);
  return (
    <div className="fo-rs">
      <div className="fo-rs-top">
        <Avatar p={p} />
        <div className="grow">
          <Link to={`/player/${p.pid}`} className="fo-name">
            {playerName(p)}
          </Link>
          <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
        </div>
        <div className="fo-money">
          <div className="a">{fmtM(salaryFor(p, exp))}</div>
          <div className="b">thru {shortSeason(exp)}</div>
        </div>
      </div>
      <div className="fo-rs-act">
        <div className="grow">
          <MoodTag p={p} />
          <div className="small dim2 fo-rs-ext">
            {extensionRefusal(league, p) ? (
              <span className="warn">Won't extend now</span>
            ) : (
              <>
                Extension: asks <b className="num">{fmtM(ask.amount)}</b> × {ask.years} yr{ask.years > 1 ? 's' : ''}
              </>
            )}
          </div>
        </div>
        <button className="btn sm primary" aria-label={`Extend ${playerName(p)}`} onClick={() => onExtend(p.pid)}>
          <PenLine size={15} /> Extend
        </button>
      </div>
    </div>
  );
}

function OffPhase({ league }: { league: League }) {
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
              { k: `Expiring ${shortSeason(s)}`, v: String(list.length), s: `${fmtM(freed)} off the books` },
              {
                k: `${shortSeason(s + 1)} committed`,
                v: fmtM(after),
                s: after <= cap.salaryCap ? `${fmtM(cap.salaryCap - after)} under projected cap` : `${fmtM(after - cap.salaryCap)} over projected cap`,
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
          <Link to="/free-agents" className="bold accent-text">
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
                    <div className="a">{fmtM(salaryFor(p, s))}</div>
                    <div className="b">would ask ~{fmtM(ask.amount)}</div>
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
                  <div className="a">{fmtM(salaryFor(p, s + 1))}</div>
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
