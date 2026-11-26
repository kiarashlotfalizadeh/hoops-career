// The re-sign period (between the draft and free agency): next season's payroll if you keep
// everyone, the team options to decide, the expiring contracts to re-sign, and Open free agency.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CircleCheck, DoorOpen, PenLine } from 'lucide-react';
import type { Player } from '../../core/types';
import { CAP } from '../../core/constants';
import { CAP_FOR, payroll, playerName, shortName } from '../../core/league/helpers';
import { birdTier, decideTeamOption, optionDeclined, pendingTeamOptions, resignLimit, rookieScaleDeal, teamOptionWorth } from '../../core/league/contracts';
import { expiringPlayers, signedThisSummer, walkRisks } from '../../core/league/freeAgency';
import { playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { Term } from '../components/Glossary';
import { PageHeader, Section, Sheet, Statline } from '../components/ui';
import { CapBar, HelpSheet, OvrPot, capRoomFig, contractEnd, forYears, rosterFig, salaryText, shortSeason, taxFig } from './common';
import { ContractSheet } from './ContractSheet';
import { FIRM_BUMP, PLAYER_OPTION, TEAM_OPTION, talkAsk, talkState } from '../../core/league/negotiation';
import { money } from '../../core/format';
import { teamTaxBill } from '../../core/league/finances';
import { ExtendRow, PlayerTop, StatLine, extendablePlayers } from './resignRows';
import { Fig, Tick } from './motion';

export function ResignPeriod() {
  const league = useLeague();
  const nav = useNavigate();
  const tid = league.userTid;
  const next = league.season + 1;
  const cap = CAP_FOR(league, next);
  const [sel, setSel] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  // (the Play menu's "Open free agency" lands here with the confirm up when players would walk: flow.ts)
  const [params, setParams] = useSearchParams();
  const asked = params.get('open') === 'fa';
  useEffect(() => {
    if (!asked) return;
    setConfirm(true);
    setParams({}, { replace: true });
  }, [asked, setParams]);
  const [decline, setDecline] = useState<Player | null>(null);
  const expiring = useLeagueMemo(() => expiringPlayers(league, tid).sort((a, b) => b.ovr - a.ovr), [league, tid]);
  // (his ask in your talks: up after they broke down)
  const asks = useMemo(() => new Map(expiring.map((p) => [p.pid, talkAsk(league, p, 'resign')])), [expiring, league]);
  const committed = payroll(league, tid, next);
  // what keeping every expiring player at his ask would add
  const askedPay = expiring.reduce((a, p) => a + asks.get(p.pid)!.amount, 0);
  const ifAll = committed + askedPay;
  const resigned = signedThisSummer(league).sort((a, b) => b.ovr - a.ovr);
  // the ones signed before the screen opened: a deal made while it's up lands with a flash
  const signedBefore = useRef(new Set(resigned.map((p) => p.pid)));
  const options = useLeagueMemo(() => pendingTeamOptions(league, tid).sort((a, b) => b.ovr - a.ovr), [league, tid]);
  // the expiring list in the order the screen opened with: a player re-signed since stays in his row
  const opened = useRef<number[] | null>(null);
  opened.current ??= expiring.map((p) => p.pid);
  const rows = [
    ...opened.current.flatMap((pid) => {
      const p = league.players[pid];
      return p && (asks.has(pid) || (p.tid === tid && !signedBefore.current.has(pid) && resigned.some((r) => r.pid === pid))) ? [p] : [];
    }),
    ...expiring.filter((p) => !opened.current!.includes(p.pid)),
  ];
  // in the final season of their deals next season (a rookie whose option was just exercised among them)
  const extendable = useLeagueMemo(() => extendablePlayers(league), [league]);
  const [ext, setExt] = useState<number | null>(null);
  const space = cap.salaryCap - committed;
  // who walks if the market opens now, and why re-signing can't keep some of them
  const risks = useLeagueMemo(() => walkRisks(league), [league]);
  const riskOf = new Map(risks.map((r) => [r.pid, r]));
  const keyRisks = risks.filter((r) => r.key);

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
        sub={`${shortSeason(next)} deals · before free agency`}
        back
        right={
          <HelpSheet title="Re-signing your players">
            <p>
              <b>Bird rights.</b> Re-sign your own players for any amount, even over the cap. In free agency, a team over the cap adds players only on minimum deals or with its
              mid-level.
            </p>
            <p>
              After three seasons with you, he can get up to his max for five years with 8% raises. A trade keeps his clock. After two, Early Bird pays up to 175% of his salary or
              105% of the league average. After one, 120% of his salary. A player who wants more goes to the market.
            </p>
            <p>
              <b>Asking price.</b> About his market value, moved by how much he likes playing for you. Pay the ask at his preferred length and he signs on the spot.
            </p>
            <p>
              He&apos;d take a little less, but keeps how much to himself. Below that he counters, and he only hears so many offers. Run out his patience and his ask goes up{' '}
              {Math.round((FIRM_BUMP - 1) * 100)}%. Then it&apos;s firm for the rest of the re-sign period.
            </p>
            <p>
              <b>Options on new deals.</b> On two years or more, add an option on the last season. A player option, his call, takes {Math.round(PLAYER_OPTION * 100)}% off his
              price. A team option, yours, adds {Math.round(TEAM_OPTION * 100)}%.
            </p>
            <p>
              <b>Luxury tax.</b> Payroll above {money(cap.luxuryTax)} pays tax at the end of the season. It starts at {CAP.taxRate}× on the first bracket, more on each after. The
              cap sheet&apos;s &quot;?&quot; has the rest.
            </p>
            <p>Anyone you don&apos;t re-sign becomes a free agent when free agency opens.</p>
            <p>
              <b>This summer&apos;s options.</b> Players with a player option on next season have decided. Those who opted out are in the expiring list. Team options are yours,
              rookie-scale fourth years included. Exercise one to keep him at that salary, or decline and he joins the expiring list. The staff decide any left when free agency
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
        <div className="fo-capsheet fo-statement">
          <div className="fo-pay">
            <div className="grow">
              <div className="over">Committed</div>
              <div className="fo-pay-v num">
                <Fig value={committed} text={money(committed)} />
              </div>
              {/* (an open team option is counted as if exercised: exercising it leaves this figure where it is, declining takes it off) */}
              {options.length > 0 && <div className="tiny dim num">incl. {money(options.reduce((a, p) => a + salaryFor(p, next), 0))} in open options</div>}
            </div>
            {/* every expiring player kept at his ask */}
            <div className="right">
              <div className="over">Keep everyone</div>
              <div className={`fo-pay-v2 num ${ifAll > cap.luxuryTax ? 'bad' : ifAll > cap.salaryCap ? 'warn' : 'good'}`}>
                <Tick value={ifAll}>{money(ifAll)}</Tick>
              </div>
              {ifAll > cap.luxuryTax && <div className="tiny bad num">tax ≈ {money(teamTaxBill(league, tid, ifAll, next))}</div>}
            </div>
          </div>
          <CapBar pay={committed} cap={cap.salaryCap} tax={cap.luxuryTax} add={askedPay} addLabel="Their asks" legend="lines" />
          <Statline items={[capRoomFig(space), taxFig(committed, cap.luxuryTax, teamTaxBill(league, tid, committed, next)), rosterFig(league)]} />
        </div>
      </Section>

      {keyRisks.length > 0 && (
        // the rotation players who leave when the market opens, said before it does
        <div className="card tight fo-walk" role="status">
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} className="warn" style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
            <div className="grow small">
              <b>
                {keyRisks.length === 1 ? 'A rotation player walks' : `${keyRisks.length} rotation players walk`} when free agency opens, unless you re-sign{' '}
                {keyRisks.length === 1 ? 'him' : 'them'} first.
              </b>
              <ul className="fo-walk-l">
                {keyRisks.map((r) => {
                  const p = league.players[r.pid];
                  return (
                    <li key={r.pid}>
                      <b>
                        {shortName(league, p)} ({p.ovr})
                      </b>
                      {': '}
                      {r.declined
                        ? 'you declined his option, so he goes to the market. Bid there with cap room or an exception.'
                        : r.over
                          ? `asks ${money(r.ask)}, and ${birdTier(league, p) === 'early' ? 'Early Bird rights' : 'his rights'} let you pay ${money(r.limit)} at most. Re-signing can't keep him: you'd need ${money(Math.max(0, r.ask - space))} more cap room to bid on the market.`
                          : `unsigned. His ask is ${money(r.ask)}.`}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

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
                    <button className="btn sm text" aria-label={`Decline ${playerName(p)}'s option`} onClick={() => setDecline(p)}>
                      Decline
                    </button>
                    <button className="btn sm" disabled={busy} aria-label={`Exercise ${playerName(p)}'s option`} onClick={() => decide(p, true)}>
                      Exercise
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tiny dim">
            A player whose option you decline goes to the market: he can&apos;t be re-signed before it opens. Open options get the staff&apos;s call when free agency opens.
          </div>
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
            {rows.map((p) => {
              // one signed since the screen opened keeps his place, marked: the rows under him don't
              // shift up under a finger on its way to the next Negotiate (the playtest's misdeal)
              if (!asks.has(p.pid))
                return (
                  <div key={p.pid} className="fo-rs m-flash">
                    <PlayerTop league={league} p={p} />
                    <div className="fo-rs-act">
                      <div className="grow small good">
                        <CircleCheck size={14} /> Re-signed: {salaryText(league, salaryFor(p, next))}
                      </div>
                    </div>
                  </div>
                );
              const ask = asks.get(p.pid)!;
              // (his option declined: he hears the league's offers, not yours alone)
              if (optionDeclined(league, p))
                return (
                  <div key={p.pid} className="fo-rs">
                    <PlayerTop league={league} p={p} />
                    <div className="fo-rs-act">
                      <div className="grow small dim2">
                        Option declined: he goes to the market when free agency opens. His ask there is about <b className="num">{salaryText(league, ask.amount)}</b>.
                      </div>
                    </div>
                  </div>
                );
              return (
                <div key={p.pid} className="fo-rs">
                  <PlayerTop league={league} p={p} />
                  <StatLine league={league} p={p} />
                  <div className="fo-rs-act">
                    <div className="grow">
                      <div className="fo-rs-ask">
                        <b className="num">{salaryText(league, ask.amount)}</b> <span className="dim">{forYears(ask.years)}</span>
                        <div className="tiny dim">
                          ask{talkState(league, p, 'resign').firm ? <b className="warn"> · firm</b> : null} · was {salaryText(league, salaryFor(p, league.season))}
                        </div>
                        {/* without full Bird rights the team can only pay him so much: past it he goes to the market */}
                        {ask.amount > resignLimit(league, p, tid) && (
                          <div className="tiny warn">
                            {birdTier(league, p) === 'early' ? 'Early Bird' : 'No Bird rights'}: up to {salaryText(league, resignLimit(league, p, tid))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button className="btn sm" aria-label={`Negotiate with ${playerName(p)}`} onClick={() => setSel(p.pid)}>
                      <PenLine size={15} /> Negotiate
                    </button>
                  </div>
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
              <div key={p.pid} className={`listrow ${signedBefore.current.has(p.pid) ? '' : 'm-flash'}`}>
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
          <div className="tiny dim">
            Signed through {shortSeason(next)}. An extension starts in {shortSeason(next + 1)}. Sign one any time before the regular season ends.
          </div>
        </Section>
      )}

      <div className="fo-dock fo-dock-go">
        <button className="btn primary block big" disabled={busy} onClick={() => (expiring.length || options.length ? setConfirm(true) : void openFA())}>
          <DoorOpen size={20} /> Open free agency
        </button>
      </div>

      <ContractSheet pid={sel} mode="resign" onClose={() => setSel(null)} />
      <ContractSheet pid={ext} mode="extend" onClose={() => setExt(null)} />

      <Sheet open={!!decline} onClose={() => setDecline(null)} title={decline ? `Decline ${shortName(league, decline)}'s option?` : undefined}>
        {decline && (
          <div className="col fo-sheet">
            <p className="fo-lede">
              His {shortSeason(next)} season at {salaryText(league, salaryFor(decline, next))} comes off his contract and he goes to the market when free agency opens. You
              can&apos;t re-sign him before then. To bring him back you bid against the league, with cap room or an exception. This can&apos;t be undone.
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
          {keyRisks.length > 0 && (
            <p className="fo-lede bad" role="alert">
              <b>
                {keyRisks.length === 1 ? 'A rotation player is' : `${keyRisks.length} rotation players are`} unsigned:{' '}
                {keyRisks.map((r) => `${shortName(league, league.players[r.pid])} (${league.players[r.pid].ovr})`).join(', ')}.
              </b>
            </p>
          )}
          {expiring.length > 0 && (
            <p className="fo-lede">
              {expiring.length === 1 ? '1 player becomes a free agent.' : `${expiring.length} players become free agents.`} Other teams can sign{' '}
              {expiring.length > 1 ? 'them' : 'him'} on day one. You&apos;d compete with cap space like everyone else.
            </p>
          )}
          {options.length > 0 && (
            <p className="fo-lede">
              {options.length > 1 ? 'Open team options' : 'Open team option'}: the staff will{' '}
              {options.map((p) => `${teamOptionWorth(league, p) ? 'exercise' : 'decline'} ${shortName(league, p)}'s`).join(', ')}.
            </p>
          )}
          {expiring.length > 0 && (
            <div className="card flush list">
              {expiring.map((p) => (
                <div key={p.pid} className="fo-confirm-row">
                  <OvrPot p={p} showPot={false} />
                  <span className="grow ellipsis bold">{playerName(p)}</span>
                  {riskOf.get(p.pid)?.declined ? (
                    <span className="tiny dim">option declined</span>
                  ) : riskOf.get(p.pid)?.over ? (
                    <span className="tiny warn">over your limit</span>
                  ) : null}
                  <span className="dim num">{salaryText(league, asks.get(p.pid)!.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(false)}>
              Keep negotiating
            </button>
            {/* (its own words: the page's button reads "Open free agency" too, and a second tap on the same label read as nothing happening) */}
            <button className={`btn grow ${keyRisks.length ? 'danger' : 'primary'}`} disabled={busy} onClick={() => (setConfirm(false), void openFA())}>
              {expiring.length ? (expiring.length === 1 ? 'Let him go and open' : 'Let them go and open') : 'Open the market'}
            </button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}
