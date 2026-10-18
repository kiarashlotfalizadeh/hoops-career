// Restricted free agency on screen (see src/core/league/rfa.ts): the qualifying-offer row on
// Re-sign, the user's restricted free agents in free agency (re-sign, withdraw the offer, or decide
// on an offer sheet), his own pending offer sheets, and the tag a restricted free agent wears in lists.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSignature, PenLine, ShieldCheck } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { FREE_AGENT } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { OFFSEASON_ROSTER_MAX, contractSeason, playerName } from '../../core/league/helpers';
import { askingContract, makeContract, summerRoster, wantsOut } from '../../core/league/contracts';
import {
  MATCH_DAYS,
  deadlineLabel,
  pendingSheets,
  qualifyBlockedReason,
  qualifyingOffer,
  restrictedFreeAgents,
  sheetDecisionBlocked,
  userDecideSheet,
  userQualify,
  userWithdrawQualifying,
} from '../../core/league/rfa';
import { useLeague } from '../../state/store';
import { agenda } from '../../core/league/agenda';
import { AgendaRow } from '../components/Agenda';
import { settle } from '../../state/actions/office';
import { Section, Sheet } from '../components/ui';
import { Callout, OvrPot, fmtM, playerMeta, shortSeason } from './common';

/** Run a core move as one league action and toast its answer. */
const act = (label: string, fn: (l: League) => { ok: boolean; reason: string }, good: 'good' | 'neutral' = 'good') => !!settle(label, fn, good)?.ok;

/** An offer sheet's terms as signed: "4 yrs · $48.2M · $11.0M in 27-28". */
export function sheetTerms(league: League, p: Player): string {
  const s = p.rfa?.sheet;
  if (!s) return '';
  const c = makeContract(league, s.amount, s.years, contractSeason(league), p.experience);
  return `${s.years} yr${s.years > 1 ? 's' : ''} · ${fmtM(c.salaries.reduce((a, x) => a + x, 0))} · ${fmtM(c.salaries[0])} in ${shortSeason(c.start)}`;
}

/** What a list says about a restricted free agent: the user's own, another team's he could sign to an offer sheet, or one who has signed one. */
export function rfaTag(league: League, p: Player): { label: string; tone: 'info' | 'warn' | 'good' } | null {
  const r = p.rfa;
  if (!r || p.tid !== FREE_AGENT) return null;
  const own = league.teams[r.tid].abbrev;
  if (r.sheet) return { label: `Offer sheet · ${league.teams[r.sheet.tid].abbrev} · ${own} decides day ${r.sheet.until + 1}`, tone: 'warn' };
  if (r.tid === league.userTid) return { label: 'Your RFA · Bird rights', tone: 'good' };
  return { label: `RFA · ${own} can match`, tone: 'info' };
}

/**
 * Re-sign period: extend (or withdraw) a qualifying offer to one of the user's expiring players.
 * Nothing for a player who can't be made restricted.
 */
export function QualifyRow({ league, p }: { league: League; p: Player }) {
  const qualified = p.rfa?.tid === league.userTid;
  if (!qualified && qualifyBlockedReason(league, p)) return null;
  const qo = qualified ? p.rfa!.qo : qualifyingOffer(league, p);
  return (
    <div className={`fo-qualify ${qualified ? 'on' : ''}`}>
      <ShieldCheck size={16} className={qualified ? 'good' : 'dim'} />
      <div className="grow small dim2">
        {qualified ? (
          <>
            <b className="good">Qualified</b> · {fmtM(qo)} for 1 yr: you can match any offer sheet.
          </>
        ) : (
          <>
            Qualifying offer <b className="num">{fmtM(qo)}</b> (1 yr) makes him restricted.
          </>
        )}
      </div>
      {qualified ? (
        <button
          className="btn xs ghost"
          aria-label={`Withdraw ${playerName(p)}'s qualifying offer`}
          onClick={() => act('Withdrawing the qualifying offer', (l) => userWithdrawQualifying(l, p.pid), 'neutral')}
        >
          Withdraw
        </button>
      ) : (
        <button className="btn xs" aria-label={`Extend ${playerName(p)} a qualifying offer`} onClick={() => act('The qualifying offer', (l) => userQualify(l, p.pid))}>
          Qualify
        </button>
      )}
    </div>
  );
}

/**
 * An offer sheet another team signed with one of the user's restricted free agents: its terms, the
 * deadline, and Match / Let him go (confirmed first: it can't be undone). Leaving it unanswered past
 * the deadline lets him go.
 */
export function SheetDecision({ league, p }: { league: League; p: Player }) {
  const [letGo, setLetGo] = useState(false);
  const s = p.rfa?.sheet;
  if (!s) return null;
  const t = league.teams[s.tid];
  const blocked = sheetDecisionBlocked(league, p.pid, true);
  return (
    <Callout tone="warn" icon={<FileSignature size={18} className="warn" />}>
      <div>
        <b>
          {t.abbrev} signed {p.lastName} to an offer sheet:
        </b>{' '}
        {sheetTerms(league, p)}.
      </div>
      <div className="small">
        Match by the end of {deadlineLabel(s.until)} to keep him on those terms (a roster spot, not cap room). Let it go, or leave it, and he joins the {t.name}.
      </div>
      {blocked && <div className="small warn">{blocked}</div>}
      <div className="row fo-callout-btns">
        <button className="btn sm grow" onClick={() => setLetGo(true)}>
          Let him go
        </button>
        <button className="btn sm primary grow" disabled={!!blocked} onClick={() => act('Matching the offer sheet', (l) => userDecideSheet(l, p.pid, true))}>
          Match
        </button>
      </div>
      <LetGoSheet league={league} p={p} open={letGo} onClose={() => setLetGo(false)} />
    </Callout>
  );
}

/** The agenda's decision on an offer sheet (Match / Let him go, settled in place), with the sheet's terms. */
export function SheetItem({ league, p }: { league: League; p: Player }) {
  const item = agenda(league).find((i) => i.id === `offerSheet:${p.pid}`);
  if (!item) return <SheetDecision league={league} p={p} />;
  return (
    <div className="fo-sheet-item">
      {/* (its screen is this one: the row doesn't link) */}
      <AgendaRow item={{ ...item, to: undefined, line: `${sheetTerms(league, p)}. Match to keep him on those terms.` }} />
    </div>
  );
}

/** Confirms letting an offer sheet on the user's restricted free agent go unmatched (the Office, Free Agents and the inbox). */
export function LetGoSheet({ league, p, open, onClose }: { league: League; p: Player; open: boolean; onClose: () => void }) {
  const s = p.rfa?.sheet;
  const t = s ? league.teams[s.tid] : undefined;
  return (
    <Sheet open={open && !!t} onClose={onClose} title={`Let ${p.lastName} go?`}>
      {t && (
        <div className="col fo-sheet">
          <p className="fo-lede">
            {playerName(p)} joins the {t.region} {t.name} on the sheet's terms ({sheetTerms(league, p)}) and his cap hold comes off your books. This can't be undone.
          </p>
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Keep deciding
            </button>
            <button className="btn danger grow" onClick={() => (act('Letting him go', (l) => userDecideSheet(l, p.pid, false), 'neutral'), onClose())}>
              Let him go
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/**
 * Free agency: the user's restricted free agents, each with his qualifying offer and cap hold and
 * what's open to him: decide on an offer sheet, or re-sign him (Bird rights) or withdraw the offer.
 */
export function MyRfas({ onResign }: { onResign: (pid: number) => void }) {
  const league = useLeague();
  const [withdraw, setWithdraw] = useState<Player | null>(null);
  const mine = restrictedFreeAgents(league, league.userTid);
  if (league.phase !== 'freeAgency' || !mine.length) return null;
  const full = summerRoster(league, league.userTid) >= OFFSEASON_ROSTER_MAX;
  return (
    <Section title={`Your restricted free agents · ${mine.length}`}>
      <div className="tiny dim">
        Re-sign with Bird rights, or match an offer sheet within {MATCH_DAYS} days. Unsigned at the close, he plays {seasonLabel(league.season + 1)} on his qualifying offer
        {full ? ` (with a roster spot: full at ${OFFSEASON_ROSTER_MAX})` : ''}.
      </div>
      <div className="card flush list">
        {mine.map((p) => {
          const r = p.rfa!;
          const ask = askingContract(league, p, league.userTid);
          return (
            <div key={p.pid} className="fo-rfa">
              <div className="fo-rfa-top">
                <OvrPot p={p} />
                <div className="grow">
                  <Link to={`/player/${p.pid}`} className="fo-name">
                    {playerName(p)}
                  </Link>
                  <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
                </div>
                <div className="fo-money">
                  <div className="a">{fmtM(r.qo)}</div>
                  <div className="b">QO · hold {fmtM(r.hold ?? r.qo)}</div>
                </div>
              </div>
              {r.sheet ? (
                <SheetItem league={league} p={p} />
              ) : (
                <>
                  <div className="small dim2">
                    No offer sheet yet ·{' '}
                    {wantsOut(p) ? (
                      <span className="warn">wants out: won't re-sign, but you can match a sheet</span>
                    ) : (
                      <>
                        asks <b className="num">{fmtM(ask.amount)}</b> × {ask.years} yr{ask.years > 1 ? 's' : ''} to re-sign
                      </>
                    )}
                  </div>
                  <div className="row">
                    <button className="btn sm grow" onClick={() => setWithdraw(p)}>
                      Withdraw offer
                    </button>
                    <button className="btn sm primary grow" disabled={wantsOut(p)} onClick={() => onResign(p.pid)}>
                      <PenLine size={15} /> Re-sign
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <Sheet open={!!withdraw} onClose={() => setWithdraw(null)} title={withdraw ? `Withdraw ${withdraw.lastName}'s qualifying offer?` : undefined}>
        {withdraw && (
          <div className="col fo-sheet">
            <p className="fo-lede">
              {playerName(withdraw)} becomes an unrestricted free agent now: his {fmtM(withdraw.rfa?.hold ?? 0)} cap hold comes off your books and any team can sign him outright.
              To bring him back you'd need cap space like anyone else. This can't be undone.
            </p>
            <div className="row">
              <button className="btn grow" onClick={() => setWithdraw(null)}>
                Keep his rights
              </button>
              <button
                className="btn danger grow"
                onClick={() => (act('Withdrawing the qualifying offer', (l) => userWithdrawQualifying(l, withdraw.pid), 'neutral'), setWithdraw(null))}
              >
                Withdraw
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </Section>
  );
}

/** The offer sheets the user has signed that wait for the other team's decision, for the free-agency card. */
export function MySheets({ onOpen }: { onOpen: (pid: number) => void }) {
  const league = useLeague();
  const mine = pendingSheets(league, league.userTid);
  if (!mine.length) return null;
  return (
    <div className="fo-pending">
      <div className="over">
        <FileSignature size={12} /> Your offer sheets
      </div>
      {mine.map((p) => (
        <button key={p.pid} className="fo-pending-row" aria-haspopup="dialog" onClick={() => onOpen(p.pid)}>
          <b>{playerName(p)}</b> · {sheetTerms(league, p)}
          <span className="dim">
            {' '}
            · {league.teams[p.rfa!.tid].abbrev} can match until the end of {deadlineLabel(p.rfa!.sheet!.until)}
          </span>
        </button>
      ))}
    </div>
  );
}
