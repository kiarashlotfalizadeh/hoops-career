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
import { useLeague, useStore } from '../../state/store';
import { Sheet } from '../components/ui';
import { Callout, OvrPot, SecTitle, fmtM, playerMeta, shortSeason } from './common';

/** Run a core action on the league and toast its answer. */
function act(fn: (l: League) => { ok: boolean; reason: string }, good: 'good' | 'neutral' = 'good') {
  let res = { ok: false, reason: '' };
  useStore.getState().mutate((l) => {
    res = fn(l);
  });
  useStore.getState().toast(res.reason, res.ok ? good : 'bad');
  return res.ok;
}

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
    <div className="row" style={{ gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
      <ShieldCheck size={16} className={qualified ? 'good' : 'dim'} style={{ flex: 'none' }} />
      <div className="grow small dim2" style={{ minWidth: 0 }}>
        {qualified ? (
          <>
            <b className="good">Qualifying offer</b> · {fmtM(qo)} for 1 yr. He'll be restricted: you can match any offer sheet.
          </>
        ) : (
          <>
            Qualifying offer <b className="num">{fmtM(qo)}</b> (1 yr) would make him a restricted free agent.
          </>
        )}
      </div>
      {qualified ? (
        <button className="btn xs ghost" aria-label={`Withdraw ${playerName(p)}'s qualifying offer`} onClick={() => act((l) => userWithdrawQualifying(l, p.pid), 'neutral')}>
          Withdraw
        </button>
      ) : (
        <button className="btn xs" aria-label={`Extend ${playerName(p)} a qualifying offer`} onClick={() => act((l) => userQualify(l, p.pid))}>
          Qualify
        </button>
      )}
    </div>
  );
}

/**
 * An offer sheet another team signed with one of the user's restricted free agents: its terms, the
 * deadline, and Match / Let him go. Leaving it unanswered past the deadline lets him go.
 */
export function SheetDecision({ league, p }: { league: League; p: Player }) {
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
      <div className="small dim2" style={{ marginTop: 4 }}>
        Match it by the end of {deadlineLabel(s.until)} and he stays on exactly those terms. Let it go, or leave it unanswered until then, and he joins the {t.name}. Matching needs
        a roster spot, not cap room.
      </div>
      {blocked && (
        <div className="small warn" style={{ marginTop: 4 }}>
          {blocked}
        </div>
      )}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn sm grow" onClick={() => act((l) => userDecideSheet(l, p.pid, false), 'neutral')}>
          Let him go
        </button>
        <button className="btn sm primary grow" disabled={!!blocked} onClick={() => act((l) => userDecideSheet(l, p.pid, true))}>
          Match
        </button>
      </div>
    </Callout>
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
    <>
      <SecTitle>Your restricted free agents · {mine.length}</SecTitle>
      <div className="tiny dim">
        Re-sign them with Bird rights any time before an offer sheet comes in; when one does, you have {MATCH_DAYS} days to match it. Unsigned when free agency closes, each takes
        his qualifying offer for {seasonLabel(league.season + 1)}
        {full ? `, if you have a roster spot (yours is full at ${OFFSEASON_ROSTER_MAX})` : ''}.
      </div>
      {mine.map((p) => {
        const r = p.rfa!;
        const ask = askingContract(league, p, league.userTid);
        return (
          <div key={p.pid} className="card tight col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <OvrPot p={p} />
              <div className="grow" style={{ minWidth: 0 }}>
                <Link to={`/player/${p.pid}`} className="fo-name" style={{ display: 'block' }}>
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
              <SheetDecision league={league} p={p} />
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
                <div className="row" style={{ gap: 8 }}>
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
      <Sheet open={!!withdraw} onClose={() => setWithdraw(null)} title={withdraw ? `Withdraw ${withdraw.lastName}'s qualifying offer?` : undefined}>
        {withdraw && (
          <div className="col" style={{ gap: 12 }}>
            <div className="dim2">
              {playerName(withdraw)} becomes an unrestricted free agent at once: his {fmtM(withdraw.rfa?.hold ?? 0)} cap hold comes off your books, any team can sign him outright,
              and to bring him back you'd have to sign him like any other free agent, with cap space. This can't be undone.
            </div>
            <div className="row">
              <button className="btn grow" onClick={() => setWithdraw(null)}>
                Keep his rights
              </button>
              <button className="btn danger grow" onClick={() => (act((l) => userWithdrawQualifying(l, withdraw.pid), 'neutral'), setWithdraw(null))}>
                Withdraw
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** The offer sheets the user has signed that wait for the other team's decision, for the free-agency card. */
export function MySheets({ onOpen }: { onOpen: (pid: number) => void }) {
  const league = useLeague();
  const mine = pendingSheets(league, league.userTid);
  if (!mine.length) return null;
  return (
    <div className="col" style={{ gap: 6, marginBottom: 10 }}>
      <div className="row tiny dim upper bold" style={{ gap: 6 }}>
        <FileSignature size={13} /> Your offer sheets
      </div>
      {mine.map((p) => (
        <button key={p.pid} className="small" style={{ textAlign: 'left', minWidth: 0 }} aria-haspopup="dialog" onClick={() => onOpen(p.pid)}>
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
