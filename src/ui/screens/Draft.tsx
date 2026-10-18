import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeftRight, ArrowUp, Bot, FastForward, Play, Scale, SkipForward, Ticket } from 'lucide-react';
import type { CombineResults, DraftPick, League, Player } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { curTeamSeason, playerName, prospects, teamName, withRng } from '../../core/league/helpers';
import { draftOrder, draftUntilUser, lotteryOdds, nextPick } from '../../core/league/draft';
import { pickLabel, pickTermsNote, tradingClosedReason } from '../../core/league/trades';
import { draftNextPick } from '../../core/league/season';
import { draftProposals } from '../../core/league/proposals';
import { leagueMock, mockAvailable, userNextSlot, type MockDraft, type MockSlot } from '../../core/league/mockDraft';
import { fmtHeight } from '../../core/ratings';
import { playerAge } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act, edit } from '../../state/actions';
import { draftPick, useBusy } from '../../state/actions/office';
import { runAgenda } from '../components/Agenda';
import { TeamLogo } from '../components/TeamLogo';
import { Avatar, Empty, Ovr, PageHeader, Section, Segmented, Sheet, StatTable, Toggle, type Col } from '../components/ui';
import { slabVars } from '../teamColors';
import { HelpSheet, OvrPot } from '../office/common';
import { PickTradeSheet } from '../office/PickTradeSheet';
import { blockOffers } from '../office/tradeBlock';
import { PROJECTION_NOTE, overallPick, pickProjection } from '../league/shared';
import { boardNeighbors, compareHref } from '../compare';

type View = 'live' | 'lottery' | 'board' | 'combine' | 'mock' | 'mine' | 'results';

function fmtIn(x: number | undefined) {
  if (x === undefined || !isFinite(x)) return '—';
  const ft = Math.floor(x / 12);
  const inches = x - ft * 12;
  const whole = Math.floor(inches + 1e-6);
  const q = Math.round((inches - whole) * 4);
  const frac = q === 1 ? '¼' : q === 2 ? '½' : q === 3 ? '¾' : '';
  return `${ft}'${q === 4 ? whole + 1 : whole}${q === 4 ? '' : frac}"`;
}

function defaultView(league: League): View {
  switch (league.phase) {
    case 'draft':
      return 'live';
    case 'draftLottery':
      return 'lottery';
    case 'resign':
    case 'freeAgency':
      return 'results';
    default:
      return 'board';
  }
}

export default function Draft() {
  const league = useLeague();
  const nav = useNavigate();
  const [view, setView] = useState<View>(() => defaultView(league));
  const [detail, setDetail] = useState<number | null>(null);
  const [confirmPick, setConfirmPick] = useState<number | null>(null);
  const [confirmSim, setConfirmSim] = useState(false);
  // the pick a trade sheet is open for
  const [tradePick, setTradePick] = useState<number | null>(null);
  useEffect(() => setView(defaultView(league)), [league.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const user = league.userTid;
  const cls = useLeagueMemo(() => prospects(league, league.season).sort((a, b) => (a.prospect?.rank ?? 99) - (b.prospect?.rank ?? 99)), [league]);
  const np = league.phase === 'draft' ? nextPick(league) : undefined;
  const onClock = !!np && np.tid === user;
  const after = league.phase === 'resign' || league.phase === 'freeAgency';

  const views: { id: View; label: string }[] = [];
  if (league.phase === 'draft') views.push({ id: 'live', label: 'Live' });
  if (league.phase === 'draftLottery') views.push({ id: 'lottery', label: 'Lottery' });
  if (after) views.push({ id: 'results', label: 'Results' });
  if (!after) views.push({ id: 'board', label: 'Big board' }, { id: 'combine', label: 'Combine' });
  if (!after && mockAvailable(league)) views.push({ id: 'mock', label: 'Mock' });
  views.push({ id: 'mine', label: 'Your picks' });
  // the mock draft (src/core/league/mockDraft.ts): its projections show on the board too
  const mock = useLeagueMemo(() => (after ? null : leagueMock(league)), [league, after]);

  const draft = (pid: number) => {
    if (np) draftPick(league, pid, overallPick(league, np.round, np.pick!));
    setConfirmPick(null);
    setDetail(null);
  };

  // the staff's pick: the agenda's suggestion when you're on the clock
  const autoPick = () => runAgenda("You're on the clock", { kind: 'autoPick' });

  const simToMine = () =>
    act('Sim to your pick', (l) => {
      withRng(l, (rng) => draftUntilUser(l, rng));
      // teams that want the pick call
      draftProposals(l);
    });

  // the team on the clock makes its pick, and the draft stops again
  const nextOne = () => {
    let name = '';
    const ok = act('The next pick', (l) => {
      const dp = nextPick(l);
      if (!dp || !draftNextPick(l)) return;
      const p = Object.values(l.players).find((x) => x.draft.year === l.season && x.draft.round === dp.round && x.draft.pick === dp.pick && x.tid >= 0);
      if (p) name = `#${overallPick(l, dp.round, dp.pick!)}: ${l.teams[p.tid].abbrev} select ${playerName(p)}.`;
    });
    if (ok && name) useStore.getState().toast(name, 'neutral');
  };

  const setPause = (on: boolean) => edit((l) => void (l.settings.draftPause = on));
  // draft-day trades: before the draft and on the night (not once it's over)
  const canTrade = (league.phase === 'draftLottery' || league.phase === 'draft') && !tradingClosedReason(league) && !league.fired;

  // phase changes run behind the progress bar, as from the Play menu: a second tap is a no-op and an error changes nothing
  const busy = useBusy();
  // the rest of the picks (the scouts make yours), then re-signing: the Play menu's "Auto-draft the rest"
  const finish = async () => {
    setConfirmSim(false);
    if (!(await useStore.getState().task('Finishing the draft', { kind: 'finishDraft' }))?.done) return;
    useStore.getState().toast('The draft is complete. Time to re-sign your players.', 'good');
    nav('/office/resign');
  };

  const myRemaining = league.phase === 'draft' ? draftOrder(league).filter((d) => d.tid === user) : [];

  return (
    <main className="page fo-page">
      <PageHeader
        title="Draft"
        sub={
          after || (league.phase === 'draft' && !np)
            ? 'Complete'
            : league.phase === 'draft'
              ? 'Live'
              : league.phase === 'draftLottery'
                ? 'The lottery is in'
                : `${cls.length} prospects`
        }
        back
        right={
          <HelpSheet title="How the draft works">
            <p>
              <b>Lottery.</b> The 14 non-playoff teams draw for the top 4 picks; the worst three records have the best odds (14% each). Everyone else picks in reverse order of
              record.
            </p>
            <p>
              <b>Rookie scale.</b> First-round picks sign 4-year rookie-scale deals (team option on year 4), cheaper the later the pick. Second-rounders get 2-year minimum deals,
              not guaranteed until opening night; AI teams with full rosters sign theirs to two-way deals.
            </p>
            <p>
              <b>Big board.</b> The consensus ranking mixes potential and current ability. OVR is what they can do now; ▲POT is the ceiling scouts see.
            </p>
            <p>Undrafted prospects with promise become free agents after the draft.</p>
          </HelpSheet>
        }
      />

      {league.phase === 'draft' && (
        <OnTheClock
          league={league}
          hasPicks={myRemaining.length > 0}
          busy={busy}
          canTrade={canTrade}
          onAuto={autoPick}
          onNext={nextOne}
          onTrade={setTradePick}
          onSimToMine={simToMine}
          onSimToEnd={() => (myRemaining.length ? setConfirmSim(true) : void finish())}
          onFinish={() => void finish()}
        />
      )}

      {(league.phase === 'draftLottery' || (league.phase === 'draft' && nextPick(league))) && (
        <div className="card tight">
          <Toggle
            on={!!league.settings.draftPause}
            onChange={setPause}
            label="Stop before every pick"
            help="Off, it runs to your next pick. On, it waits before each team's, so you can trade for the pick on the clock."
          />
        </div>
      )}

      {views.length > 1 && <Segmented tabs value={view} onChange={setView} options={views} label="Draft sections" />}

      {view === 'live' && league.phase === 'draft' && (
        <LiveView league={league} cls={cls} mock={mock} onClock={onClock} onOpen={setDetail} onDraft={setConfirmPick} onTrade={canTrade ? setTradePick : undefined} />
      )}
      {view === 'lottery' && <LotteryView league={league} onTrade={canTrade ? setTradePick : undefined} />}
      {view === 'board' && <BoardList league={league} list={cls} mock={mock} onOpen={setDetail} onDraft={onClock ? setConfirmPick : undefined} />}
      {view === 'mock' && <MockView league={league} mock={mock} onOpen={setDetail} />}
      {view === 'combine' && <CombineView league={league} list={cls} onOpen={setDetail} />}
      {view === 'mine' && <MyPicks league={league} />}
      {view === 'results' && <Results league={league} />}

      <ProspectSheet pid={detail} onClose={() => setDetail(null)} canDraft={onClock} onDraft={(pid) => setConfirmPick(pid)} />
      <PickTradeSheet dpid={tradePick} onClose={() => setTradePick(null)} />

      <Sheet open={confirmPick !== null} onClose={() => setConfirmPick(null)} title="Make the pick?">
        {confirmPick !== null && league.players[confirmPick] && np && (
          <div className="col fo-sheet">
            <div className="fo-phead">
              <Avatar p={league.players[confirmPick]} />
              <div className="grow">
                <h2 className="ellipsis">{playerName(league.players[confirmPick])}</h2>
                <div className="fo-meta">
                  {league.players[confirmPick].pos} · {league.players[confirmPick].archetype} · Big board #{league.players[confirmPick].prospect?.rank ?? '—'}
                </div>
              </div>
              <OvrPot p={league.players[confirmPick]} />
            </div>
            <p className="fo-lede">
              Pick #{overallPick(league, np.round, np.pick!)}: {np.round === 1 ? 'first round, a 4-year rookie-scale deal' : 'second round, a 2-year minimum deal'}.
            </p>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmPick(null)}>
                Cancel
              </button>
              <button className="btn primary grow" onClick={() => draft(confirmPick)}>
                Draft him
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={confirmSim} onClose={() => setConfirmSim(false)} title="Auto-draft the rest?">
        <div className="col fo-sheet">
          <p className="fo-lede">
            Your staff make your {myRemaining.length > 1 ? `${myRemaining.length} picks` : 'pick'} ({myRemaining.map((d) => `#${overallPick(league, d.round, d.pick!)}`).join(', ')}
            ), then re-signing opens.
          </p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirmSim(false)}>
              Cancel
            </button>
            <button className="btn primary grow" disabled={busy} onClick={() => void finish()}>
              Auto-draft the rest
            </button>
          </div>
        </div>
      </Sheet>
    </main>
  );
}

// ------------------------------------------------------------------ live draft

function OnTheClock({
  league,
  hasPicks,
  busy,
  canTrade,
  onAuto,
  onNext,
  onTrade,
  onSimToMine,
  onSimToEnd,
  onFinish,
}: {
  league: League;
  hasPicks: boolean;
  busy: boolean;
  canTrade: boolean;
  onAuto: () => void;
  onNext: () => void;
  onTrade: (dpid: number) => void;
  onSimToMine: () => void;
  onSimToEnd: () => void;
  onFinish: () => void;
}) {
  const np = nextPick(league);
  const user = league.userTid;
  // on the clock: how many teams would trade up into the pick (each one's best package)
  const onClock = np?.tid === user;
  const clockPick = np?.dpid;
  const offers = useLeagueMemo(
    () => (onClock && canTrade && clockPick !== undefined ? blockOffers(league, { pids: [], dpids: [clockPick] }).length : 0),
    [league, onClock, canTrade, clockPick],
  );
  if (!np) {
    return (
      <section className="card accent fo-now" aria-label="Draft complete">
        <div className="fo-now-over">Draft complete</div>
        <h2 className="fo-now-t">All picks are in</h2>
        <p className="fo-now-s">Next: re-sign your own players.</p>
        <button className="btn primary block" disabled={busy} onClick={onFinish}>
          Continue to re-signing
        </button>
      </section>
    );
  }
  const mine = np.tid === user;
  const t = league.teams[np.tid];
  const n = overallPick(league, np.round, np.pick!);
  return (
    // the team on the clock, in its colours
    <section className="slab fo-clock" style={slabVars(t.colors)} aria-label={`On the clock: pick ${n}`}>
      <span className="slab-mark">
        <TeamLogo tid={np.tid} size={170} decorative />
      </span>
      <div className="fo-clock-over">
        <span className="fo-live">On the clock</span>
        <span>
          Round {np.round} · Pick {np.pick}
        </span>
      </div>
      <div className="fo-clock-main">
        <span className="fo-clock-n num">#{n}</span>
        <div className="grow">
          <div className="fo-clock-team">{mine ? "You're up" : t.name}</div>
          <div className="fo-clock-sub">
            {mine ? `${t.region} ${t.name}` : t.region}
            {np.originalTid !== np.tid && ` · via ${league.teams[np.originalTid].abbrev}`}
          </div>
        </div>
        <TeamLogo tid={np.tid} size={52} decorative />
      </div>
      {mine ? (
        <>
          <p className="fo-clock-s">Draft from the board below, or take the staff's pick.</p>
          <div className="fo-clock-btns">
            <button className="btn sm primary" disabled={busy} onClick={onAuto}>
              <Bot size={16} /> Take the staff's pick
            </button>
            {canTrade && (
              <button className="btn sm" disabled={!offers || busy} onClick={() => onTrade(np.dpid)}>
                <ArrowLeftRight size={15} /> Offers ({offers})
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="fo-clock-btns">
          <button className="btn sm primary" disabled={busy} onClick={onNext}>
            <SkipForward size={15} /> Next pick
          </button>
          {hasPicks && (
            <button className="btn sm" disabled={busy} onClick={onSimToMine}>
              <Play size={15} fill="currentColor" /> Sim to my pick
            </button>
          )}
          {canTrade && (
            <button className="btn sm" disabled={busy} onClick={() => onTrade(np.dpid)}>
              <ArrowLeftRight size={15} /> Trade for #{n}
            </button>
          )}
          <button className="btn sm" disabled={busy} onClick={onSimToEnd}>
            <FastForward size={16} /> Auto-draft the rest
          </button>
        </div>
      )}
    </section>
  );
}

function draftedThisYear(league: League): Player[] {
  return Object.values(league.players)
    .filter((p) => p.draft.year === league.season && p.draft.round > 0)
    .sort((a, b) => overallPick(league, a.draft.round, a.draft.pick) - overallPick(league, b.draft.round, b.draft.pick));
}

function LiveView({
  league,
  cls,
  mock,
  onClock,
  onOpen,
  onDraft,
  onTrade,
}: {
  league: League;
  cls: Player[];
  mock: MockDraft | null;
  onClock: boolean;
  onOpen: (pid: number) => void;
  onDraft: (pid: number) => void;
  /** Open the trade sheet for a pick (absent when trading is closed). */
  onTrade?: (dpid: number) => void;
}) {
  const [all, setAll] = useState(false);
  const order = draftOrder(league);
  const picks = useLeagueMemo(() => draftedThisYear(league).reverse(), [league]);
  return (
    <>
      {order.length > 1 && (
        <Section title="Up next" right={onTrade ? <span className="tiny dim">Tap a pick to trade for it</span> : undefined}>
          <div className="hscroll">
            {order.slice(1, 13).map((d) => {
              const n = overallPick(league, d.round, d.pick!);
              const body = (
                <>
                  <span className="n num">#{n}</span>
                  <TeamLogo tid={d.tid} size={26} decorative />
                  <span className="ab">{league.teams[d.tid].abbrev}</span>
                </>
              );
              return onTrade ? (
                <button
                  key={d.dpid}
                  className={`fo-pickchip ${d.tid === league.userTid ? 'me' : ''}`}
                  aria-label={d.tid === league.userTid ? `Offers for your pick #${n}` : `Trade for #${n} (${league.teams[d.tid].abbrev})`}
                  onClick={() => onTrade(d.dpid)}
                >
                  {body}
                </button>
              ) : (
                <div key={d.dpid} className={`fo-pickchip ${d.tid === league.userTid ? 'me' : ''}`}>
                  {body}
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Section title={onClock ? 'Best available · your pick' : 'Best available'} right={<span className="tiny dim">{cls.length} left</span>}>
        <BoardList league={league} list={cls.slice(0, 30)} mock={mock} onOpen={onOpen} onDraft={onClock ? onDraft : undefined} />
      </Section>
      {picks.length > 0 && (
        <Section title="Selections">
          <div className="card flush">
            <div className="list wide2">
              {(all ? picks : picks.slice(0, 8)).map((p) => (
                <SelectionRow key={p.pid} league={league} p={p} />
              ))}
            </div>
            {picks.length > 8 && (
              <button className="btn ghost block fo-more-btn" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show all ${picks.length} picks`}
              </button>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

function SelectionRow({ league, p }: { league: League; p: Player }) {
  const mine = p.draft.tid === league.userTid;
  return (
    <Link to={`/player/${p.pid}`} className={`listrow fo-sel ${mine ? 'me' : ''}`}>
      <span className="fo-rank">{overallPick(league, p.draft.round, p.draft.pick)}</span>
      <TeamLogo tid={p.draft.tid ?? 0} size={28} decorative />
      <div className="grow">
        <div className="fo-name">{playerName(p)}</div>
        <div className="fo-meta">
          {league.teams[p.draft.tid ?? 0]?.abbrev} · {p.pos} · {fmtHeight(p.heightIn)} · {p.college || p.country}
        </div>
      </div>
      <OvrPot p={p} />
    </Link>
  );
}

// ------------------------------------------------------------------ big board

function BoardList({
  league,
  list,
  mock,
  onOpen,
  onDraft,
}: {
  league: League;
  list: Player[];
  mock?: MockDraft | null;
  onOpen: (pid: number) => void;
  onDraft?: (pid: number) => void;
}) {
  const [limit, setLimit] = useState(30);
  if (!list.length) return <Empty>No prospects left on the board.</Empty>;
  // the mock's read of where each goes, and whether he'll still be there at the user's next pick
  const mine = mock ? userNextSlot(league, mock) : undefined;
  const projection = (p: Player) => {
    const r = mock?.range.get(p.pid);
    if (!mock || !r) return null;
    const where = r.med > 2 * league.teams.length ? 'Undrafted in most mocks' : r.lo === r.hi ? `Proj. #${r.med}` : `Proj. #${r.lo}-${r.hi > 2 * league.teams.length ? '' : r.hi}`;
    const gone = mine ? mock.goneBefore(p.pid, mine.overall) : null;
    return { where: where.replace(/-$/, '+'), gone: gone !== null && gone >= 0.05 && gone <= 0.95 ? `gone before your #${mine!.overall}: ${Math.round(gone * 100)}%` : null };
  };
  return (
    <div className="card flush">
      <div className="list wide2">
        {list.slice(0, limit).map((p) => {
          const pr = projection(p);
          return (
            // the scouting report and the Draft button sit side by side: a button inside a button is announced as one
            <div key={p.pid} className={`fo-board-row ${onDraft ? 'can' : ''}`}>
              <button className="fo-prow grow" onClick={() => onOpen(p.pid)}>
                <span className="fo-rank">{p.prospect?.rank ?? '—'}</span>
                <Avatar p={p} />
                <div className="grow">
                  <div className="fo-name">{playerName(p)}</div>
                  <div className="fo-meta">
                    {p.pos} · {playerAge(p, league.season)} · {fmtHeight(p.heightIn)} · {p.college || p.country}
                  </div>
                  {/* wraps on a phone rather than cut off the chance he's gone before your pick */}
                  <div className="fo-board-proj">
                    {p.archetype}
                    {pr ? <span className="fo-proj"> · {pr.where}</span> : null}
                    {pr?.gone ? <span className="warn"> · {pr.gone}</span> : null}
                  </div>
                </div>
                <OvrPot p={p} />
              </button>
              {onDraft && (
                <button className="btn sm good" aria-label={`Draft ${playerName(p)}`} onClick={() => onDraft(p.pid)}>
                  Draft
                </button>
              )}
            </div>
          );
        })}
      </div>
      {list.length > limit && (
        <button className="btn ghost block fo-more-btn" onClick={() => setLimit(limit + 30)}>
          Show more ({list.length - limit} left)
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ mock draft

/** The mock draft, slot by slot: the likeliest pick and the next ones, the user's picks lit. */
function MockView({ league, mock, onOpen }: { league: League; mock: MockDraft | null; onOpen: (pid: number) => void }) {
  const [round2, setRound2] = useState(false);
  if (!mock || !mock.slots.length) return <Empty>The mock draft starts once games are played.</Empty>;
  const projected = mock.slots[0].projected;
  const shown = mock.slots.filter((s) => round2 || s.round === 1);
  return (
    <Section
      title={projected ? 'Mock · order by record' : 'Mock · draft order'}
      right={
        <HelpSheet title="Mock draft">
          <p>
            The draft played out {mock.runs} times the way AI teams pick: potential and talent, a nudge toward what the roster lacks, and their usual unpredictability on the night.
            Your picks go to the top player left on your big board, or to your staff&apos;s choice.
          </p>
          <p>
            Each pick shows the likeliest player not already named above it and how often he was the pick there, then the next likeliest. On the big board, each prospect&apos;s
            range is where he went in four of five mocks.
          </p>
          {projected && <p>Until the lottery the order is by record: the lottery still decides the top four.</p>}
        </HelpSheet>
      }
    >
      <div className="card flush">
        <div className="list">
          {shown.map((s) => (
            <MockRow key={`${s.round}-${s.pick}`} league={league} s={s} onOpen={onOpen} />
          ))}
        </div>
        {mock.slots.some((s) => s.round === 2) && (
          <button className="btn ghost block fo-more-btn" onClick={() => setRound2(!round2)}>
            {round2 ? 'First round only' : 'Show the second round'}
          </button>
        )}
      </div>
    </Section>
  );
}

function MockRow({ league, s, onOpen }: { league: League; s: MockSlot; onOpen: (pid: number) => void }) {
  const [top, ...alts] = s.options;
  const p = top && league.players[top.pid];
  const mine = s.tid === league.userTid;
  const name = (pid: number) => {
    const x = league.players[pid];
    return x ? `${x.firstName[0]}.\u00a0${x.lastName}` : '?';
  };
  if (!p) return null;
  const via = s.orig !== s.tid ? ` · via ${league.teams[s.orig].abbrev}` : '';
  return (
    <button className={`listrow fo-sel ${mine ? 'me' : ''}`} onClick={() => onOpen(p.pid)}>
      <span className="fo-rank">{s.overall}</span>
      <TeamLogo tid={s.tid} size={28} decorative />
      <div className="grow">
        <div className="fo-name">
          <span className="dim2">{league.teams[s.tid].abbrev}</span> {playerName(p)}
        </div>
        <div className="fo-meta">
          {p.pos} · {Math.round(top.p * 100)}% of mocks{via}
        </div>
        {/* the other names on a line of their own, wrapping: at the end of the line above they were cut off */}
        {alts.length > 0 && <div className="fo-board-proj">or {alts.map((a) => `${name(a.pid)}\u00a0${Math.round(a.p * 100)}%`).join(', ')}</div>}
      </div>
      <OvrPot p={p} />
    </button>
  );
}

// ------------------------------------------------------------------ combine

function CombineView({ league, list, onOpen }: { league: League; list: Player[]; onOpen: (pid: number) => void }) {
  const c = (p: Player): Partial<CombineResults> => p.prospect?.combine ?? {};
  // a missing result sorts last either way, also in the columns where lower is better
  const num = (x: number | undefined) => (x === undefined ? NaN : x);
  const fmt = (show: (v: number) => string) => (v: number | string) => (Number.isFinite(v) ? show(Number(v)) : '—');
  const cols: Col<Player>[] = [
    { key: 'name', label: 'Prospect', left: true, sticky: true, get: (p) => p.lastName, fmt: (_v, p) => <span className="bold">{`${p.firstName[0]}. ${p.lastName}`}</span> },
    { key: 'rk', label: 'Rk', asc: true, get: (p) => p.prospect?.rank ?? 99 },
    { key: 'pos', label: 'Pos', get: (p) => p.pos },
    { key: 'ovr', label: 'OVR', get: (p) => p.ovr, fmt: (v) => <Ovr v={Number(v)} size="sm" /> },
    { key: 'hgt', label: 'Height', help: 'Height without shoes', get: (p) => num(c(p).heightNoShoes), fmt: (_v, p) => fmtIn(c(p).heightNoShoes) },
    { key: 'wing', label: 'Wingspan', get: (p) => num(c(p).wingspan), fmt: (_v, p) => fmtIn(c(p).wingspan) },
    { key: 'reach', label: 'Reach', help: 'Standing reach', get: (p) => num(c(p).standingReach), fmt: (_v, p) => fmtIn(c(p).standingReach) },
    { key: 'wt', label: 'Wt', help: 'Weight (lb)', get: (p) => num(c(p).weight) },
    { key: 'vert', label: 'Vert', help: 'Max vertical (in)', get: (p) => num(c(p).maxVert), fmt: fmt((v) => `${v.toFixed(1)}"`) },
    { key: 'lane', label: 'Lane', help: 'Lane agility (s, lower is better)', asc: true, get: (p) => num(c(p).laneAgility), fmt: fmt((v) => v.toFixed(2)) },
    { key: 'sprint', label: '¾ Sprint', help: '3/4 court sprint (s, lower is better)', asc: true, get: (p) => num(c(p).sprint), fmt: fmt((v) => v.toFixed(2)) },
    { key: 'shoot', label: 'Shoot', help: 'Shooting drill makes out of 25', get: (p) => num(c(p).shootingDrill), fmt: fmt((v) => `${v}/25`) },
  ];
  if (!list.length) return <Empty>No combine results for this class.</Empty>;
  return (
    <Section title={`${league.season} combine · ${list.length} invitees`} right={<span className="tiny dim">Lane, sprint: lower is better</span>}>
      <StatTable rows={list} cols={cols} rowKey={(p) => p.pid} onRow={(p) => onOpen(p.pid)} maxHeight={560} />
      <div className="tiny dim">Tap a column to sort, a row for his scouting report.</div>
    </Section>
  );
}

// ------------------------------------------------------------------ lottery

function LotteryView({ league, onTrade }: { league: League; onTrade?: (dpid: number) => void }) {
  const order = draftOrder(league).filter((d) => d.round === 1 && (d.pick ?? 99) <= 14);
  if (!order.length) return <Empty>Lottery results appear here after the playoffs.</Empty>;
  // the same pre-lottery order and chances the lottery used (tied teams split theirs)
  const pre = new Map(lotteryOdds(league).map((x) => [x.tid, x]));
  return (
    // (the rows' percentages need their caption while trading is open too)
    <Section title="Lottery order" right={<span className="tiny dim">Odds for #1{onTrade ? ' · tap a pick to trade' : ''}</span>}>
      <div className="card flush list">
        {order.map((d) => {
          const p0 = pre.get(d.originalTid)?.pre ?? d.pick!;
          const move = p0 - d.pick!;
          const ts = curTeamSeason(league, d.originalTid);
          const odds = (pre.get(d.originalTid)?.w ?? 0) / 10;
          const mine = d.tid === league.userTid;
          // a row opens the trade sheet for its pick while trading is open
          const Row = onTrade ? 'button' : 'div';
          return (
            <Row key={d.dpid} className={`listrow fo-sel ${mine ? 'me' : ''}`} onClick={onTrade ? () => onTrade(d.dpid) : undefined}>
              <span className="fo-rank">{d.pick}</span>
              <TeamLogo tid={d.tid} size={30} decorative />
              <div className="grow">
                <div className="fo-name">
                  {league.teams[d.tid].region} {league.teams[d.tid].name}
                </div>
                <div className="fo-meta">
                  {ts.won}-{ts.lost}
                  {d.originalTid !== d.tid ? ` · via ${league.teams[d.originalTid].abbrev}` : ''} · {odds.toFixed(1)}%
                </div>
              </div>
              <span className={`fo-move ${move > 0 ? 'good' : move < 0 ? 'bad' : 'dim'}`}>
                {move > 0 ? <ArrowUp size={14} /> : move < 0 ? <ArrowDown size={14} /> : null}
                {move !== 0 ? Math.abs(move) : '—'}
                {move !== 0 && <span className="sr-only">{move > 0 ? ' places up' : ' places down'}</span>}
              </span>
            </Row>
          );
        })}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------ my picks

function MyPicks({ league }: { league: League }) {
  const user = league.userTid;
  // picks without a slot yet, projected as on the team page
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  // this season's picks in draft order: by their slot once it is set, by the projection until then
  const slot = (d: DraftPick) => (d.pick ? overallPick(league, d.round, d.pick) : (proj(d) ?? 99));
  const owned = league.draftPicks.filter((d) => d.tid === user).sort((a, b) => a.season - b.season || a.round - b.round || slot(a) - slot(b));
  const owed = league.draftPicks.filter((d) => d.originalTid === user && d.tid !== user).sort((a, b) => a.season - b.season || a.round - b.round);
  const drafted = draftedThisYear(league).filter((p) => p.draft.tid === user);
  return (
    <>
      {drafted.length > 0 && (
        <Section title="Drafted this year">
          <div className="card flush list">
            {drafted.map((p) => (
              <SelectionRow key={p.pid} league={league} p={p} />
            ))}
          </div>
        </Section>
      )}
      <Section title={`Picks you own · ${owned.length}`}>
        {owned.length === 0 ? (
          <Empty>You don't own any draft picks.</Empty>
        ) : (
          <div className="card flush list">
            {owned.map((d) => (
              <div key={d.dpid} className="listrow">
                <TeamLogo tid={d.originalTid} size={30} decorative />
                <div className="grow fo-min0">
                  <div className="fo-name">{pickLabel(league, d)}</div>
                  <div className="fo-meta fo-wrap">
                    {d.originalTid === user ? 'Own pick' : `From the ${teamName(league.teams[d.originalTid])}`} · drafted after {seasonLabel(d.season)}
                    {/* its protection and any swap on it, in words */}
                    {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                  </div>
                </div>
                {/* the label carries the overall number once the order is set */}
                {proj(d) !== undefined ? (
                  <span className="tag">Proj. #{proj(d)}</span>
                ) : (
                  <span className={`tag ${d.pick ? 'info' : ''}`}>
                    <Ticket size={11} /> R{d.round}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {owned.some((d) => proj(d) !== undefined) && <div className="tiny dim">{PROJECTION_NOTE}</div>}
      </Section>
      {owed.length > 0 && (
        <Section title={`Owed to other teams · ${owed.length}`}>
          <div className="card flush list">
            {owed.map((d) => (
              <div key={d.dpid} className="listrow">
                <TeamLogo tid={d.tid} size={30} decorative />
                <div className="grow fo-min0">
                  <div className="fo-name">{pickLabel(league, d)}</div>
                  <div className="fo-meta fo-wrap">
                    Owned by the {teamName(league.teams[d.tid])}
                    {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                  </div>
                </div>
                <span className={`tag ${d.round === 1 ? 'info' : ''}`}>R{d.round}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ results (after the draft)

function Results({ league }: { league: League }) {
  const list = useLeagueMemo(() => draftedThisYear(league), [league]);
  const [round, setRound] = useState<1 | 2>(1);
  if (!list.length) return <Empty>No draft results yet.</Empty>;
  return (
    <>
      <Segmented
        label="Round"
        value={String(round) as '1' | '2'}
        onChange={(x) => setRound(Number(x) as 1 | 2)}
        options={[
          { id: '1', label: 'Round 1' },
          { id: '2', label: 'Round 2' },
        ]}
      />
      <div className="card flush list">
        {list
          .filter((p) => p.draft.round === round)
          .map((p) => (
            <SelectionRow key={p.pid} league={league} p={p} />
          ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ prospect detail

function ProspectSheet({ pid, onClose, canDraft, onDraft }: { pid: number | null; onClose: () => void; canDraft: boolean; onDraft: (pid: number) => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  const c = p?.prospect?.combine;
  const fig = (k: string, val: string) => (
    <div>
      <div className="k">{k}</div>
      <div className="v num">{val}</div>
    </div>
  );
  return (
    <Sheet open={!!p} onClose={onClose} label={p ? playerName(p) : undefined}>
      {p && (
        <div className="col fo-sheet">
          <div className="fo-prospect-h">
            <Avatar p={p} size="lg" />
            <div className="grow">
              <div className="over">Big board #{p.prospect?.rank ?? '—'}</div>
              <div className="fo-prospect-first">{p.firstName}</div>
              <h2 className="fo-prospect-last">{p.lastName}</h2>
            </div>
            <div className="fo-prospect-r">
              <Ovr v={p.ovr} size="lg" />
              <span className="pot">POT {p.pot}</span>
            </div>
          </div>
          <div className="fo-meta fo-wrap">
            {p.pos} · {playerAge(p, league.season)} · {fmtHeight(p.heightIn)} · {p.weightLb} lb · {p.college ? `${p.college} · ${p.country}` : p.country}
          </div>
          <div className="chips">
            <span className="tag info">{p.archetype}</span>
            {p.tid >= 0 && (
              <span className="tag good">
                Drafted #{overallPick(league, p.draft.round, p.draft.pick)} by {league.teams[p.tid].abbrev}
              </span>
            )}
            {/* side by side with the prospect ranked next to him (either can be changed there) */}
            <Link to={compareHref(p.pid, boardNeighbors(league, p, 1)[0]?.pid)} className="btn xs fo-push" onClick={onClose}>
              <Scale size={13} /> Compare
            </Link>
          </div>
          {p.prospect?.blurb && <p className="fo-lede">{p.prospect.blurb}</p>}
          {c && (
            <Section title="Combine">
              <div className="fo-combine">
                {fig('Height', fmtIn(c.heightNoShoes))}
                {fig('Wingspan', fmtIn(c.wingspan))}
                {fig('Reach', fmtIn(c.standingReach))}
                {fig('Weight', `${c.weight} lb`)}
                {fig('Vert', `${c.maxVert.toFixed(1)}"`)}
                {fig('Lane', `${c.laneAgility.toFixed(2)}s`)}
                {fig('Sprint', `${c.sprint.toFixed(2)}s`)}
                {fig('Shooting', `${c.shootingDrill}/25`)}
              </div>
              <div className="tiny dim">
                Wingspan {c.wingspan - c.heightNoShoes >= 0 ? '+' : '−'}
                {Math.abs(c.wingspan - c.heightNoShoes)
                  .toFixed(2)
                  .replace(/\.?0+$/, '')}
                " vs height{c.wingspan - c.heightNoShoes >= 4 ? ': plus length' : c.wingspan - c.heightNoShoes < 1 ? ': short arms for his size' : ''}.
              </div>
            </Section>
          )}
          <div className="row">
            <Link to={`/player/${p.pid}`} className="btn grow" onClick={onClose}>
              Full profile
            </Link>
            {canDraft && p.tid < 0 && (
              <button className="btn primary grow" onClick={() => onDraft(p.pid)}>
                Draft him
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
