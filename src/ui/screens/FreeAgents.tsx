import { useMemo, useState } from 'react';
import { CalendarDays, FastForward, Lock, Newspaper, SkipForward } from 'lucide-react';
import type { Player, Pos } from '../../core/types';
import { FREE_AGENT, POSITIONS } from '../../core/types';
import { CAP, seasonLabel } from '../../core/constants';
import { CAP_FOR, TWO_WAY_MAX, freeAgents, payroll, playerName, rosterMaxNow, standardRoster, twoWayRoster } from '../../core/league/helpers';
import { MLE_PCT, MLE_YEARS, askingContract, mleRoom, signingRoute, teamAppeal, twoWaySalary, twoWayYears, valueScore, wantsTwoWay } from '../../core/league/contracts';
import { capPayroll, signingClosedReason, userTwoWayOffer } from '../../core/league/freeAgency';
import { faAdvance } from '../../core/league/season';
import { playerAge } from '../../core/playerGen';
import { useLeague, useStore, useVersion } from '../../state/store';
import { Bar, Card, Chips, Empty, Help, Kpi, PageHeader, Segmented, Sheet } from '../components/ui';
import { Callout, OvrPot, appealInfo, capSeason, fmtM, playerMeta } from '../office/common';
import { ContractSheet } from '../office/ContractSheet';

type SortKey = 'value' | 'ovr' | 'pot' | 'ask' | 'age';

export default function FreeAgents() {
  const league = useLeague();
  const v = useVersion();
  const tid = league.userTid;
  const s = capSeason(league);
  const cap = CAP_FOR(league, s);
  const pay = payroll(league, tid, s);
  // until free agency opens, the user's own expiring players hold cap room (as on the Office cap sheet)
  const holds = capPayroll(league, tid, s) - pay;
  const space = cap.salaryCap - pay - holds;
  const mle = mleRoom(league, tid, s);
  // two-way players don't use one of the 15 standard spots; the offseason allows 21 until opening night
  const n = standardRoster(league, tid).length;
  const max = rosterMaxNow(league);
  const tw = twoWayRoster(league, tid).length;
  const closed = signingClosedReason(league);
  const [pos, setPos] = useState<'all' | Pos>('all');
  const [minOvr, setMinOvr] = useState(0);
  const [sort, setSort] = useState<SortKey>('value');
  const [onlySignable, setOnlySignable] = useState(false);
  const [twoWayMode, setTwoWayMode] = useState(false);
  const [limit, setLimit] = useState(40);
  const [sel, setSel] = useState<number | null>(null);
  const [twoWaySel, setTwoWaySel] = useState<number | null>(null);
  const fa = league.phase === 'freeAgency';

  const all = useMemo(
    () =>
      freeAgents(league).map((p) => {
        const ask = askingContract(league, p, tid);
        return {
          p,
          ask,
          appeal: teamAppeal(league, tid, p),
          val: valueScore(league, p),
          age: playerAge(p, league.season),
          route: signingRoute(league, tid, ask.amount, s),
          twoWay: wantsTwoWay(league, p, tid),
        };
      }),
    [league, v, tid, s],
  );

  // what the user could actually do today: the window is open and there's a spot to fill
  const canAdd = !closed && (twoWayMode ? tw < TWO_WAY_MAX : n < max);
  const rows = all
    .filter((r) => (pos === 'all' || r.p.pos === pos) && r.p.ovr >= minOvr && (!twoWayMode || r.twoWay) && (!onlySignable || (canAdd && (twoWayMode || r.route))))
    .sort((a, b) => {
      switch (sort) {
        case 'ovr':
          return b.p.ovr - a.p.ovr || b.val - a.val;
        case 'pot':
          return b.p.pot - a.p.pot || b.val - a.val;
        case 'ask':
          return b.ask.amount - a.ask.amount;
        case 'age':
          return a.age - b.age || b.val - a.val;
        default:
          return b.val - a.val;
      }
    });

  const advance = (days: number) => {
    const before = freeAgents(league).map((p) => p.pid);
    useStore.getState().mutate((l) => faAdvance(l, days));
    const l = useStore.getState().league!;
    const signed = before
      .map((pid) => l.players[pid])
      .filter((p) => p && p.tid >= 0 && p.tid !== l.userTid)
      .sort((a, b) => b.ovr - a.ovr);
    const day = Math.min(30, l.faDay + 1);
    useStore.getState().toast(
      signed.length
        ? `Day ${day}: ${signed.length} signing${signed.length > 1 ? 's' : ''}. ${signed
            .slice(0, 2)
            .map((p) => `${p.lastName} (${p.ovr}) → ${l.teams[p.tid].abbrev}`)
            .join(', ')}${signed.length > 2 ? '…' : ''}`
        : `Day ${day}: a quiet day on the market.`,
      'neutral',
    );
  };

  const recent = fa
    ? league.news
        .filter((x) => x.kind === 'signing' && x.season === league.season)
        .slice(-4)
        .reverse()
    : [];

  return (
    <main className="page">
      <PageHeader
        title="Free Agents"
        sub={`${all.length} available · contracts start ${seasonLabel(s)}`}
        back
        right={
          <Help title="How free agency works">
            <p style={{ margin: 0 }}>
              <b>Cap space.</b> You can sign anyone whose contract fits under the {fmtM(cap.salaryCap)} cap. You have <b>{fmtM(Math.max(0, space))}</b> of room for {seasonLabel(s)}
              .
            </p>
            <p style={{ margin: 0 }}>
              <b>Minimum deals.</b> Over the cap, you can still sign players for the minimum (up to {fmtM(cap.vetMin, 2)}). A minimum deal signed for the coming season isn't
              guaranteed until opening night.
            </p>
            <p style={{ margin: 0 }}>
              <b>Mid-level exception.</b> Once a season, if the signing keeps you under the tax line ({fmtM(cap.luxuryTax)}), you can sign one player over the cap for up to{' '}
              {fmtM(cap.salaryCap * MLE_PCT)}, for up to {MLE_YEARS} years; for the rest of that season, trades can't take you past the tax line.{' '}
              {mle > 0 ? `You can use up to ${fmtM(mle)} now.` : "You can't use it right now (used this season, or it would take you over the tax)."}
            </p>
            <p style={{ margin: 0 }}>
              <b>Asking price.</b> Offers at or above a player's ask are accepted on the spot. Interest in your team (winning, hype, market, playing time) moves his price.
            </p>
            <p style={{ margin: 0 }}>
              <b>Timing.</b> The summer market lasts 30 days. AI teams sign players every day, and stars go fast. Unsigned players cut their price every few days, and during the
              season they are still available.
            </p>
            <p style={{ margin: 0 }}>
              <b>Roster.</b> Up to 21 players in the offseason, {CAP.rosterMax} from opening night, plus up to {TWO_WAY_MAX} on two-way deals.
            </p>
            <p style={{ margin: 0 }}>
              <b>Two-way deals.</b> Players with three seasons or fewer who'd sign for the minimum can take a two-way slot at {fmtM(twoWaySalary(league, s), 2)}. They don't use a
              roster spot or count against the cap, and sit at the end of the bench unless you run short.
            </p>
            <p style={{ margin: 0 }}>
              <b>Window.</b> Signings are open in the preseason, through the end of the regular season, and in free agency.
            </p>
          </Help>
        }
      />

      {closed && (
        <Callout tone="warn" icon={<Lock size={16} />}>
          {closed}
        </Callout>
      )}

      <div className="grid3">
        <Kpi
          k="Cap space"
          v={fmtM(space)}
          color={space > 0 ? 'var(--good)' : 'var(--warn)'}
          sub={holds > 0 ? 'after cap holds' : space > 0 ? 'to spend' : mle > 0 ? 'min or mid-level' : 'min deals only'}
        />
        <Kpi
          k="Roster"
          v={`${n}/${max}`}
          color={n >= max ? 'var(--bad)' : n > CAP.rosterMax ? 'var(--warn)' : undefined}
          sub={`${n >= max ? 'full' : n > CAP.rosterMax ? `${CAP.rosterMax} by opening night` : `${max - n} open`} · two-way ${tw}/${TWO_WAY_MAX}`}
        />
        <Kpi
          k="Mid-level"
          v={mle > 0 ? fmtM(mle) : '—'}
          color={mle > 0 ? 'var(--good)' : undefined}
          sub={mle > 0 ? `once · min ${fmtM(cap.vetMin, 2)} always` : `min ${fmtM(cap.vetMin, 2)} always`}
        />
      </div>

      {fa && (
        <Card accent className="fo-hero">
          <div className="row between">
            <div className="row" style={{ gap: 8 }}>
              <CalendarDays size={18} />
              <span className="fo-mid">Day {Math.min(30, league.faDay + 1)} of 30</span>
            </div>
            <span className="tiny dim upper bold">Free agency</span>
          </div>
          <div style={{ margin: '10px 0' }}>
            <Bar value={Math.min(30, league.faDay)} max={30} />
          </div>
          {league.faDay >= 30 ? (
            <div className="small dim2">The market is winding down. Start the new season from the Play button when your roster is set.</div>
          ) : (
            <div className="small dim2">Every day AI teams make offers. Players who wait too long may lower their price.</div>
          )}
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn sm grow" onClick={() => advance(1)}>
              <SkipForward size={16} /> Next day
            </button>
            <button className="btn sm grow" onClick={() => advance(7)}>
              <FastForward size={16} /> Advance a week
            </button>
          </div>
          {recent.length > 0 && (
            <div className="col" style={{ gap: 4, marginTop: 12 }}>
              <div className="row tiny dim upper bold" style={{ gap: 6 }}>
                <Newspaper size={13} /> Latest signings
              </div>
              {recent.map((x) => (
                <div key={x.id} className="small dim2">
                  {x.text}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="col" style={{ gap: 8 }}>
        <Chips value={pos} onChange={(x) => (setPos(x), setLimit(40))} options={[{ id: 'all' as const, label: 'All' }, ...POSITIONS.map((p) => ({ id: p, label: p }))]} />
        <div className="row wrap" style={{ gap: 6 }}>
          <Chips
            value={minOvr}
            onChange={(x) => (setMinOvr(x), setLimit(40))}
            options={[
              { id: 0, label: 'Any OVR' },
              { id: 60, label: '60+' },
              { id: 65, label: '65+' },
              { id: 70, label: '70+' },
              { id: 75, label: '75+' },
            ]}
          />
          <button className={`chip ${onlySignable ? 'on' : ''}`} onClick={() => setOnlySignable(!onlySignable)}>
            Can sign now
          </button>
          <button className={`chip ${twoWayMode ? 'on' : ''}`} onClick={() => (setTwoWayMode(!twoWayMode), setLimit(40))}>
            Two-way offers ({tw}/{TWO_WAY_MAX})
          </button>
        </div>
        {onlySignable && !canAdd && (
          <div className="small warn">
            {closed ?? (twoWayMode ? `All ${TWO_WAY_MAX} two-way slots are taken.` : `Your roster is full (${max}). Release or trade someone to sign a free agent.`)}
          </div>
        )}
        {twoWayMode && (
          <div className="tiny dim">Players with three seasons or fewer who'd sign for the minimum. Two-way deals pay {fmtM(twoWaySalary(league, s), 2)} outside the cap.</div>
        )}
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { id: 'value', label: 'Best' },
            { id: 'ovr', label: 'OVR' },
            { id: 'pot', label: 'POT' },
            { id: 'ask', label: 'Ask' },
            { id: 'age', label: 'Age' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Empty>{all.length === 0 ? 'No free agents on the market right now.' : 'No free agents match these filters.'}</Empty>
      ) : (
        <Card className="flush">
          <div className="list wide2">
            {rows.slice(0, limit).map(({ p, ask, appeal, route }) => {
              const ai = appealInfo(appeal);
              return (
                <button key={p.pid} className="fo-prow" onClick={() => (twoWayMode ? setTwoWaySel(p.pid) : setSel(p.pid))}>
                  <OvrPot p={p} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="fo-name">{playerName(p)}</span>
                      {p.injury && <span className="tag bad">INJ</span>}
                    </div>
                    <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
                    <div className="row" style={{ gap: 8, marginTop: 3 }}>
                      <span className="tiny" style={{ color: ai.color, fontWeight: 650 }}>
                        <span className="fo-dot" style={{ background: ai.color }} />
                        {ai.label}
                      </span>
                      {twoWayMode ? (
                        <span className="tiny good">Two-way</span>
                      ) : route === 'min' ? (
                        <span className="tiny good">Min deal</span>
                      ) : route === 'space' ? (
                        <span className="tiny good">Fits your space</span>
                      ) : route === 'mle' ? (
                        <span className="tiny good">Mid-level</span>
                      ) : space > 0 ? (
                        <span className="tiny warn">More than your space</span>
                      ) : (
                        <span className="tiny dim">Needs cap space</span>
                      )}
                    </div>
                  </div>
                  {twoWayMode ? (
                    <div className="fo-money">
                      <div className="a">{fmtM(twoWaySalary(league, s), 2)}</div>
                      <div className="b">
                        two-way · {twoWayYears(p)} yr{twoWayYears(p) > 1 ? 's' : ''}
                      </div>
                    </div>
                  ) : (
                    <div className="fo-money">
                      <div className="a">{fmtM(ask.amount)}</div>
                      <div className="b">
                        {ask.years} yr{ask.years > 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {rows.length > limit && (
            <button className="btn ghost block" style={{ borderRadius: 0, borderInline: 0, borderBottom: 0 }} onClick={() => setLimit(limit + 40)}>
              Show more ({rows.length - limit} left)
            </button>
          )}
        </Card>
      )}

      <ContractSheet pid={sel} mode="fa" onClose={() => setSel(null)} />
      <TwoWaySheet p={twoWaySel !== null ? league.players[twoWaySel] : undefined} onClose={() => setTwoWaySel(null)} />
    </main>
  );
}

/** Fixed-terms two-way offer: no negotiation, he takes it if he's a minimum-level player. */
function TwoWaySheet({ p, onClose }: { p: Player | undefined; onClose: () => void }) {
  const league = useLeague();
  const open = !!p && p.tid === FREE_AGENT;
  const s = capSeason(league);
  const used = twoWayRoster(league, league.userTid).length;
  const blocked = !p
    ? null
    : (signingClosedReason(league) ??
      (used >= TWO_WAY_MAX ? `All ${TWO_WAY_MAX} two-way slots are taken.` : !wantsTwoWay(league, p, league.userTid) ? `${p.lastName} wants a standard contract.` : null));
  const offer = () => {
    if (!p) return;
    let res = { ok: false, reason: '' };
    useStore.getState().mutate((l) => {
      res = userTwoWayOffer(l, p.pid);
    });
    useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
    if (res.ok) onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Two-way offer">
      {open && p && (
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="fo-name">{playerName(p)}</div>
              <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
            </div>
            <OvrPot p={p} />
          </div>
          <div className="small dim2">
            {fmtM(twoWaySalary(league, s), 2)} per season for {twoWayYears(p)} season{twoWayYears(p) > 1 ? 's' : ''}, starting {seasonLabel(s)}. No roster spot or cap room needed;
            he sits at the end of the bench unless you run short, and can be converted to a standard minimum deal later when a roster spot is open.
          </div>
          <div className="small">
            Two-way slots used:{' '}
            <b>
              {used}/{TWO_WAY_MAX}
            </b>
          </div>
          {blocked && <div className="small warn">{blocked}</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary grow" disabled={!!blocked} onClick={offer}>
              Offer two-way deal
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
