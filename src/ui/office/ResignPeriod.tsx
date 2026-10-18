// The re-sign period (between the draft and free agency): next season's payroll if you keep
// everyone, the team options to decide, the expiring contracts to re-sign, qualify or renounce,
// and Open free agency.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck, DoorOpen, PenLine } from 'lucide-react';
import type { Player } from '../../core/types';
import { CAP } from '../../core/constants';
import { CAP_FOR, payroll, playerName, shortName } from '../../core/league/helpers';
import { askingContract, decideTeamOption, pendingTeamOptions, rookieScaleDeal, teamOptionWorth, wantsOut } from '../../core/league/contracts';
import { capHolds, expiringPlayers, renouncePlayer, signedThisSummer } from '../../core/league/freeAgency';
import { playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { Term } from '../components/Glossary';
import { PageHeader, Section, Sheet, Statline } from '../components/ui';
import { CapBar, HelpSheet, MoodTag, OvrPot, capRoomFig, contractEnd, forYears, rosterFig, salaryText, shortSeason, taxFig } from './common';
import { ContractSheet } from './ContractSheet';
import { QualifyRow } from './RfaPanel';
import { MATCH_DAYS, RFA_MAX_SERVICE } from '../../core/league/rfa';
import { FIRM_BUMP, talkAsk, talkState } from '../../core/league/negotiation';
import { money } from '../../core/format';
import { ExtendRow, PlayerTop, StatLine, extendablePlayers } from './resignRows';

export function ResignPeriod() {
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
  // who leaves as a restricted free agent (qualified) and who unrestricted when the market opens
  const qualified = expiring.filter((p) => p.rfa).length;
  const unrestricted = expiring.length - qualified;
  const space = cap.salaryCap - committed - holds;

  const doRenounce = (p: Player) => {
    settle(`Renouncing ${shortName(league, p)}`, (l) => renouncePlayer(l, p.pid), 'neutral');
    setRenounce(null);
  };

  const decide = (p: Player, exercise: boolean) => settle(exercise ? 'Exercising the option' : 'Declining the option', (l) => decideTeamOption(l, p.pid, exercise));

  const busy = useBusy();
  const openFA = async () => {
    // runs behind the progress bar; a second tap (or a stale screen) is a no-op
    if (!(await useStore.getState().task('Opening free agency', { kind: 'startFA' }))) return;
    useStore.getState().toast('Free agency is open!', 'good');
    nav('/office/free-agents');
  };

  return (
    <main className="page fo-page">
      <PageHeader
        title="Re-sign"
        sub={`Deals from ${shortSeason(next)} · before free agency`}
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
              <b>Luxury tax.</b> Payroll above {money(cap.luxuryTax)} costs {CAP.taxRate}× in tax at the end of the season.
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

      <Section
        title={`${shortSeason(next)} payroll`}
        right={
          <span className="tag info">
            <Term id="bird">Bird rights</Term>
          </span>
        }
      >
        <div className="card fo-capsheet">
          <div className="fo-pay">
            <div className="grow">
              <div className="over">Committed</div>
              <div className="fo-pay-v num">{money(committed)}</div>
            </div>
            {/* every expiring player kept at about his ask (his cap hold) */}
            <div className="right">
              <div className="over">Keep everyone</div>
              <div className={`fo-pay-v2 num ${ifAll > cap.luxuryTax ? 'bad' : ifAll > cap.salaryCap ? 'warn' : 'good'}`}>{money(ifAll)}</div>
              {ifAll > cap.luxuryTax && <div className="tiny bad num">tax ≈ {money(Math.round((ifAll - cap.luxuryTax) * CAP.taxRate))}</div>}
            </div>
          </div>
          <CapBar pay={committed} cap={cap.salaryCap} tax={cap.luxuryTax} add={ifAll - committed} addLabel={<Term id="hold">Cap holds</Term>} legend="lines" />
          <Statline items={[{ ...capRoomFig(space), s: holds > 0 ? `after ${money(holds)} in holds` : undefined }, taxFig(committed, cap.luxuryTax), rosterFig(league)]} />
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
                        <b className="num">{salaryText(league, sal)}</b> <span className="dim">{shortSeason(next)} option</span>
                      </div>
                      <div className="tiny">
                        {rookieScaleDeal(p) ? (
                          <span className="dim">
                            <Term id="rookie">Rookie scale</Term> ·{' '}
                          </span>
                        ) : null}
                        <span className={worth ? 'good' : 'warn'}>staff: {worth ? 'exercise' : 'decline'}</span>
                      </div>
                    </div>
                    <button className="btn sm" aria-label={`Decline ${playerName(p)}'s option`} onClick={() => setDecline(p)}>
                      Decline
                    </button>
                    <button className="btn sm primary" disabled={busy} aria-label={`Exercise ${playerName(p)}'s option`} onClick={() => decide(p, true)}>
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
                        <div className="fo-rs-ask">
                          <b className="num">{salaryText(league, ask.amount)}</b> <span className="dim">{forYears(ask.years)}</span>
                          <div className="tiny dim">
                            his ask{talkState(league, p, 'resign').firm ? <b className="warn"> · firm</b> : null} · was {salaryText(league, salaryFor(p, league.season))}
                          </div>
                        </div>
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
                  <div className="a">{salaryText(league, salaryFor(p, next))}</div>
                  <div className="b">{contractEnd(league, p)}</div>
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
          <DoorOpen size={20} /> Open free agency
        </button>
      </div>

      <ContractSheet pid={sel} mode="resign" onClose={() => setSel(null)} />
      <ContractSheet pid={ext} mode="extend" onClose={() => setExt(null)} />

      <Sheet open={!!renounce} onClose={() => setRenounce(null)} title={renounce ? `Renounce ${shortName(league, renounce)}?` : undefined}>
        {renounce && (
          <div className="col fo-sheet">
            <p className="fo-lede">
              You give up {playerName(renounce)}'s Bird rights{renounce.rfa ? ' and withdraw his qualifying offer' : ''}: he's an unrestricted free agent when the market opens
              {renounce.contract.twoWay || (wantsOut(renounce) && !renounce.rfa)
                ? ''
                : `, and his ${money(holders.find((h) => h.p.pid === renounce.pid)?.amount ?? 0)} cap hold comes off your books now`}
              . To bring him back you'd have to outbid other teams with cap space.
            </p>
            <div className="row">
              <button className="btn grow" onClick={() => setRenounce(null)}>
                Keep his rights
              </button>
              <button className="btn danger grow" disabled={busy} onClick={() => doRenounce(renounce)}>
                Renounce
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!decline} onClose={() => setDecline(null)} title={decline ? `Decline ${shortName(league, decline)}'s option?` : undefined}>
        {decline && (
          <div className="col fo-sheet">
            <p className="fo-lede">
              His {shortSeason(next)} season ({salaryText(league, salaryFor(decline, next))}) comes off his contract and he joins the expiring list: re-sign him before free agency,
              at about {money(askingContract(league, decline, tid).amount)}, or he becomes a free agent. This can't be undone.
            </p>
            <div className="row">
              <button className="btn grow" onClick={() => setDecline(null)}>
                Keep the option
              </button>
              <button className="btn danger grow" disabled={busy} onClick={() => (decide(decline, false), setDecline(null))}>
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
              {options.map((p) => `${teamOptionWorth(league, p) ? 'exercise' : 'decline'} ${shortName(league, p)}'s`).join(', ')}.
            </p>
          )}
          {expiring.length > 0 && (
            <div className="card flush list">
              {expiring.map((p) => (
                <div key={p.pid} className="fo-confirm-row">
                  <OvrPot p={p} showPot={false} />
                  <span className="grow ellipsis bold">{playerName(p)}</span>
                  {p.rfa && <span className="tag good">RFA</span>}
                  <span className="dim num">{salaryText(league, asks.get(p.pid)!.amount)}</span>
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
