import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeftRight, ArrowUp, Bot, FastForward, Gavel, Play, SkipForward, Ticket } from 'lucide-react';
import type { CombineResults, DraftPick, League, Player } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { curTeamSeason, playerName, prospects, teamName, withRng } from '../../core/league/helpers';
import { aiChoose, draftOrder, draftUntilUser, lotteryOdds, nextPick } from '../../core/league/draft';
import { pickLabel, pickTermsNote, tradingClosedReason } from '../../core/league/trades';
import { draftNextPick, finishDraftPhase, startDraft, userDraftPick } from '../../core/league/season';
import { draftProposals } from '../../core/league/proposals';
import { fmtHeight } from '../../core/ratings';
import { playerAge } from '../../core/playerGen';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Empty, Help, Ovr, PageHeader, Segmented, Sheet, StatTable, Toggle, type Col } from '../components/ui';
import { OvrPot, SecTitle, ordinal } from '../office/common';
import { PickTradeSheet } from '../office/PickTradeSheet';
import { blockOffers } from '../office/tradeBlock';
import { PROJECTION_NOTE, overallPick, pickProjection } from '../league/shared';

type View = 'live' | 'lottery' | 'board' | 'combine' | 'mine' | 'results';

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
  views.push({ id: 'mine', label: 'Your picks' });

  const draft = (pid: number) => {
    const name = playerName(league.players[pid]);
    const n = np ? overallPick(league, np.round, np.pick!) : 0;
    let err: string | null = null;
    useStore.getState().mutate((l) => {
      err = userDraftPick(l, pid);
    });
    if (err) useStore.getState().toast(err, 'bad');
    else useStore.getState().toast(`With the ${ordinal(n)} pick, you select ${name}!`, 'good');
    setConfirmPick(null);
    setDetail(null);
  };

  const autoPick = () => {
    let name = '';
    let err: string | null = null;
    useStore.getState().mutate((l) => {
      const dp = nextPick(l);
      if (!dp || dp.tid !== l.userTid) return;
      // pick the way the AI would, then let the AI run to our next pick
      const choice = withRng(l, (rng) => aiChoose(l, l.userTid, rng));
      if (!choice) return;
      name = playerName(choice);
      err = userDraftPick(l, choice.pid);
    });
    if (err) useStore.getState().toast(err, 'bad');
    else if (name) useStore.getState().toast(`Auto-pick: you select ${name}.`, 'good');
  };

  const simToMine = () => {
    useStore.getState().mutate((l) => {
      withRng(l, (rng) => draftUntilUser(l, rng));
      // teams that want the pick call
      draftProposals(l);
    });
  };

  // the team on the clock makes its pick, and the draft stops again
  const nextOne = () => {
    let name = '';
    useStore.getState().mutate((l) => {
      const dp = nextPick(l);
      if (!dp || !draftNextPick(l)) return;
      const p = Object.values(l.players).find((x) => x.draft.year === l.season && x.draft.round === dp.round && x.draft.pick === dp.pick && x.tid >= 0);
      if (p) name = `#${overallPick(l, dp.round, dp.pick!)}: ${l.teams[p.tid].abbrev} select ${playerName(p)}.`;
    });
    if (name) useStore.getState().toast(name, 'neutral');
  };

  const setPause = (on: boolean) => useStore.getState().mutate((l) => void (l.settings.draftPause = on));
  // draft-day trades: before the draft and on the night (not once it's over)
  const canTrade = (league.phase === 'draftLottery' || league.phase === 'draft') && !tradingClosedReason(league) && !league.fired;

  // the rest of the picks (the scouts make yours): the draft stays open until "Continue to re-signing"
  const simToEnd = () => {
    setConfirmSim(false);
    useStore.getState().mutate((l) => {
      withRng(l, (rng) => draftUntilUser(l, rng, true));
    });
  };

  // phase changes run behind the progress bar, as from the Play menu: a second tap is a no-op and an error changes nothing
  const busy = useStore((s) => !!s.sim);
  const finish = async () => {
    let done = false;
    if (!(await useStore.getState().task('Finishing the draft', (l) => void (done = finishDraftPhase(l)))) || !done) return;
    useStore.getState().toast('The draft is complete. Time to re-sign your players.', 'good');
    nav('/resign');
  };

  const begin = async () => {
    let done = false;
    if ((await useStore.getState().task('Draft night', (l) => void (done = startDraft(l)))) && done) setView('live');
  };

  const myRemaining = league.phase === 'draft' ? draftOrder(league).filter((d) => d.tid === user) : [];

  return (
    <main className="page">
      <PageHeader
        title="Draft"
        sub={`${league.season} NBA Draft · ${after ? 'complete' : league.phase === 'draft' ? 'in progress' : league.phase === 'draftLottery' ? 'lottery complete' : `${cls.length} prospects`}`}
        back
        right={
          <Help title="How the draft works">
            <p style={{ margin: 0 }}>
              <b>Lottery.</b> The 14 non-playoff teams are entered in a lottery for the top 4 picks. The worst three records have the best odds (14% each). Everyone else picks in
              reverse order of record.
            </p>
            <p style={{ margin: 0 }}>
              <b>Rookie scale.</b> First-round picks sign 4-year rookie-scale deals (team option on year 4), cheaper the later the pick. Second-rounders get 2-year minimum deals,
              not guaranteed until opening night; AI teams with full rosters sign theirs to two-way deals.
            </p>
            <p style={{ margin: 0 }}>
              <b>Big board.</b> The consensus ranking mixes potential and current ability. OVR is what they can do now; ▲POT is the ceiling scouts see.
            </p>
            <p style={{ margin: 0 }}>Undrafted prospects with promise become free agents after the draft.</p>
          </Help>
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
          onSimToEnd={() => (myRemaining.length ? setConfirmSim(true) : simToEnd())}
          onFinish={() => void finish()}
        />
      )}

      {league.phase === 'draftLottery' && (
        <Card accent className="fo-hero">
          <div className="row" style={{ gap: 12 }}>
            <Gavel size={28} />
            <div className="grow">
              <div className="fo-mid">The lottery is done</div>
              <div className="small dim2">Study the board, then head to the draft.</div>
            </div>
          </div>
          <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={() => void begin()}>
            <Play size={16} fill="currentColor" /> Start the draft
          </button>
        </Card>
      )}

      {(league.phase === 'draftLottery' || (league.phase === 'draft' && nextPick(league))) && (
        <Card className="tight">
          <Toggle
            on={!!league.settings.draftPause}
            onChange={setPause}
            label="Stop before every pick"
            help="The draft waits before each team's pick, so you can trade for the pick on the clock. Off, it runs on to your next pick."
          />
        </Card>
      )}

      {views.length > 1 && <Segmented value={view} onChange={setView} options={views} label="Draft sections" />}

      {view === 'live' && league.phase === 'draft' && (
        <LiveView league={league} cls={cls} onClock={onClock} onOpen={setDetail} onDraft={setConfirmPick} onTrade={canTrade ? setTradePick : undefined} />
      )}
      {view === 'lottery' && <LotteryView league={league} onTrade={canTrade ? setTradePick : undefined} />}
      {view === 'board' && <BoardList league={league} list={cls} onOpen={setDetail} onDraft={onClock ? setConfirmPick : undefined} />}
      {view === 'combine' && <CombineView league={league} list={cls} onOpen={setDetail} />}
      {view === 'mine' && <MyPicks league={league} />}
      {view === 'results' && <Results league={league} />}

      <ProspectSheet pid={detail} onClose={() => setDetail(null)} canDraft={onClock} onDraft={(pid) => setConfirmPick(pid)} />
      <PickTradeSheet dpid={tradePick} onClose={() => setTradePick(null)} />

      <Sheet open={confirmPick !== null} onClose={() => setConfirmPick(null)} title="Make the pick?">
        {confirmPick !== null && league.players[confirmPick] && np && (
          <div className="col" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <OvrPot p={league.players[confirmPick]} />
              <div className="grow">
                <div className="bold">{playerName(league.players[confirmPick])}</div>
                <div className="small dim">
                  {league.players[confirmPick].pos} · {league.players[confirmPick].archetype} · Big board #{league.players[confirmPick].prospect?.rank ?? '—'}
                </div>
              </div>
            </div>
            <div className="small dim2">
              Pick #{overallPick(league, np.round, np.pick!)} ({np.round === 1 ? 'first round, 4-year rookie scale deal' : 'second round, 2-year minimum deal'}).
            </div>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmPick(null)}>
                Cancel
              </button>
              <button className="btn good grow" onClick={() => draft(confirmPick)}>
                Draft him
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={confirmSim} onClose={() => setConfirmSim(false)} title="Sim to the end?">
        <div className="col" style={{ gap: 12 }}>
          <div className="dim2">
            You still hold {myRemaining.length} pick{myRemaining.length > 1 ? 's' : ''} ({myRemaining.map((d) => `#${overallPick(league, d.round, d.pick!)}`).join(', ')}). Your
            scouts will make {myRemaining.length > 1 ? 'those selections' : 'that selection'} for you.
          </div>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirmSim(false)}>
              Cancel
            </button>
            <button className="btn primary grow" onClick={simToEnd}>
              Sim the draft
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
      <Card accent className="fo-hero">
        <div className="fo-eyebrow">Draft complete</div>
        <div className="fo-mid" style={{ marginTop: 4 }}>
          All picks are in
        </div>
        <div className="small dim2">Undrafted prospects become free agents. Next up: re-signing your own players.</div>
        <button className="btn primary block" style={{ marginTop: 12 }} disabled={busy} onClick={onFinish}>
          Continue to re-signing
        </button>
      </Card>
    );
  }
  const mine = np.tid === user;
  const t = league.teams[np.tid];
  return (
    <Card className={`fo-hero ${mine ? 'fo-clock' : ''}`} accent={!mine}>
      <div className="row between">
        <span className="fo-live">On the clock</span>
        <span className="tiny dim upper bold">
          Round {np.round} · Pick {np.pick}
        </span>
      </div>
      <div className="row" style={{ gap: 12, marginTop: 10 }}>
        <TeamLogo tid={np.tid} size={54} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="fo-big">#{overallPick(league, np.round, np.pick!)}</div>
          <div className="bold ellipsis">
            {mine ? "You're up" : `${t.region} ${t.name}`}
            {np.originalTid !== np.tid && <span className="dim small"> · via {league.teams[np.originalTid].abbrev}</span>}
          </div>
        </div>
      </div>
      {mine ? (
        <>
          <div className="small dim2" style={{ marginTop: 10 }}>
            Tap <b>Draft</b> on a prospect below, or let your scouts choose.
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn sm grow" onClick={onAuto}>
              <Bot size={16} /> Auto-pick for me
            </button>
            <button className="btn sm grow ghost" onClick={onSimToEnd}>
              <FastForward size={16} /> Sim to end
            </button>
          </div>
          {canTrade && (
            <button className="btn sm block" style={{ marginTop: 8 }} disabled={!offers} onClick={() => onTrade(np.dpid)}>
              <ArrowLeftRight size={15} /> Offers for this pick ({offers})
            </button>
          )}
        </>
      ) : (
        <>
          <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn sm grow primary" onClick={onNext}>
              <SkipForward size={15} /> Next pick
            </button>
            {hasPicks && (
              <button className="btn sm grow" onClick={onSimToMine}>
                <Play size={15} fill="currentColor" /> Sim to my pick
              </button>
            )}
          </div>
          <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
            {canTrade && (
              <button className="btn sm grow" onClick={() => onTrade(np.dpid)}>
                <ArrowLeftRight size={15} /> Trade for #{overallPick(league, np.round, np.pick!)}
              </button>
            )}
            <button className="btn sm grow ghost" onClick={onSimToEnd}>
              <FastForward size={16} /> Sim to end of draft
            </button>
          </div>
        </>
      )}
    </Card>
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
  onClock,
  onOpen,
  onDraft,
  onTrade,
}: {
  league: League;
  cls: Player[];
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
        <>
          <SecTitle right={onTrade ? <span className="tiny dim">Tap a pick to trade for it</span> : undefined}>Up next</SecTitle>
          <div className="hscroll">
            {order.slice(1, 13).map((d) => {
              const n = overallPick(league, d.round, d.pick!);
              const body = (
                <>
                  <span className="n">#{n}</span>
                  <TeamLogo tid={d.tid} size={26} />
                  <span className="tiny bold">{league.teams[d.tid].abbrev}</span>
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
        </>
      )}
      <SecTitle right={<span className="tiny dim">{cls.length} left</span>}>{onClock ? 'Best available · your pick' : 'Best available'}</SecTitle>
      <BoardList league={league} list={cls.slice(0, 30)} onOpen={onOpen} onDraft={onClock ? onDraft : undefined} />
      {picks.length > 0 && (
        <>
          <SecTitle>Selections</SecTitle>
          <Card className="flush">
            <div className="list wide2">
              {(all ? picks : picks.slice(0, 8)).map((p) => (
                <SelectionRow key={p.pid} league={league} p={p} />
              ))}
            </div>
            {picks.length > 8 && (
              <button className="btn ghost block" style={{ borderRadius: 0, borderInline: 0, borderBottom: 0 }} onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show all ${picks.length} picks`}
              </button>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function SelectionRow({ league, p }: { league: League; p: Player }) {
  const mine = p.draft.tid === league.userTid;
  return (
    <Link to={`/player/${p.pid}`} className="listrow" style={{ background: mine ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}>
      <span className="fo-rank" style={{ fontSize: 16 }}>
        {overallPick(league, p.draft.round, p.draft.pick)}
      </span>
      <TeamLogo tid={p.draft.tid ?? 0} size={28} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="fo-name small">{playerName(p)}</div>
        <div className="fo-meta tiny">
          {p.pos} · {fmtHeight(p.heightIn)} · {p.college || p.country}
        </div>
      </div>
      <OvrPot p={p} />
    </Link>
  );
}

// ------------------------------------------------------------------ big board

function BoardList({ league, list, onOpen, onDraft }: { league: League; list: Player[]; onOpen: (pid: number) => void; onDraft?: (pid: number) => void }) {
  const [limit, setLimit] = useState(30);
  if (!list.length) return <Empty>No prospects left on the board.</Empty>;
  return (
    <Card className="flush">
      <div className="list wide2">
        {list.slice(0, limit).map((p) => (
          // the scouting report and the Draft button sit side by side: a button inside a button is announced as one
          <div key={p.pid} className="row" style={{ gap: 0, paddingRight: onDraft ? 12 : 0 }}>
            <button className="fo-prow grow" onClick={() => onOpen(p.pid)}>
              <span className="fo-rank">{p.prospect?.rank ?? '—'}</span>
              <OvrPot p={p} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="fo-name">{playerName(p)}</div>
                <div className="fo-meta">
                  {p.pos} · {playerAge(p, league.season)} · {fmtHeight(p.heightIn)} · {p.college || p.country}
                </div>
                <div className="fo-meta tiny">{p.archetype}</div>
              </div>
            </button>
            {onDraft && (
              <button className="btn sm good" aria-label={`Draft ${playerName(p)}`} onClick={() => onDraft(p.pid)}>
                Draft
              </button>
            )}
          </div>
        ))}
      </div>
      {list.length > limit && (
        <button className="btn ghost block" style={{ borderRadius: 0, borderInline: 0, borderBottom: 0 }} onClick={() => setLimit(limit + 30)}>
          Show more ({list.length - limit})
        </button>
      )}
    </Card>
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
    <>
      <div className="tiny dim">Tap a column to sort; tap a row for the full scouting report. Lane agility and sprint: lower is better.</div>
      <StatTable rows={list} cols={cols} rowKey={(p) => p.pid} onRow={(p) => onOpen(p.pid)} maxHeight={560} />
      <div className="tiny dim" style={{ marginTop: -6 }}>
        {league.season} draft combine · {list.length} invitees
      </div>
    </>
  );
}

// ------------------------------------------------------------------ lottery

function LotteryView({ league, onTrade }: { league: League; onTrade?: (dpid: number) => void }) {
  const order = draftOrder(league).filter((d) => d.round === 1 && (d.pick ?? 99) <= 14);
  if (!order.length) return <Empty>Lottery results will appear here after the playoffs.</Empty>;
  // the same pre-lottery order and chances the lottery used (tied teams split theirs)
  const pre = new Map(lotteryOdds(league).map((x) => [x.tid, x]));
  return (
    <Card className="flush">
      <div className="row between" style={{ padding: '12px 12px 6px' }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-2)' }}>Lottery order</h3>
        <span className="tiny dim">{onTrade ? 'Tap a pick to trade for it' : 'Pre-lottery odds for #1'}</span>
      </div>
      <div className="list">
        {order.map((d) => {
          const p0 = pre.get(d.originalTid)?.pre ?? d.pick!;
          const move = p0 - d.pick!;
          const ts = curTeamSeason(league, d.originalTid);
          const odds = (pre.get(d.originalTid)?.w ?? 0) / 10;
          const mine = d.tid === league.userTid;
          // a row opens the trade sheet for its pick while trading is open
          const Row = onTrade ? 'button' : 'div';
          return (
            <Row
              key={d.dpid}
              className="listrow"
              style={{ background: mine ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined, width: '100%', textAlign: 'left' }}
              onClick={onTrade ? () => onTrade(d.dpid) : undefined}
            >
              <span className="fo-rank">{d.pick}</span>
              <TeamLogo tid={d.tid} size={32} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="bold ellipsis">
                  {league.teams[d.tid].region} {league.teams[d.tid].name}
                </div>
                <div className="tiny dim">
                  {ts.won}-{ts.lost}
                  {d.originalTid !== d.tid ? ` · via ${league.teams[d.originalTid].abbrev}` : ''} · {odds.toFixed(1)}%
                </div>
              </div>
              <span className="fo-move" style={{ color: move > 0 ? 'var(--good)' : move < 0 ? 'var(--bad)' : 'var(--text-dim)' }}>
                {move > 0 ? <ArrowUp size={14} /> : move < 0 ? <ArrowDown size={14} /> : null}
                {move !== 0 ? Math.abs(move) : '—'}
              </span>
            </Row>
          );
        })}
      </div>
    </Card>
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
        <>
          <SecTitle>Drafted this year</SecTitle>
          <Card className="flush">
            <div className="list">
              {drafted.map((p) => (
                <SelectionRow key={p.pid} league={league} p={p} />
              ))}
            </div>
          </Card>
        </>
      )}
      <SecTitle right={<span className="tiny dim">{owned.length} total</span>}>Picks you own</SecTitle>
      {owned.length === 0 ? (
        <Empty>You don't own any draft picks.</Empty>
      ) : (
        <Card className="flush">
          <div className="list">
            {owned.map((d) => (
              <div key={d.dpid} className="listrow">
                <TeamLogo tid={d.originalTid} size={30} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="bold ellipsis">{pickLabel(league, d)}</div>
                  <div className="tiny dim">
                    {d.originalTid === user ? 'Own pick' : `Acquired from the ${teamName(league.teams[d.originalTid])}`} · drafted after {seasonLabel(d.season)}
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
        </Card>
      )}
      {owed.length > 0 && (
        <>
          <SecTitle>Owed to other teams</SecTitle>
          <Card className="flush">
            <div className="list">
              {owed.map((d) => (
                <div key={d.dpid} className="listrow">
                  <TeamLogo tid={d.tid} size={30} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="bold ellipsis">{pickLabel(league, d)}</div>
                    <div className="tiny dim">
                      Owned by the {teamName(league.teams[d.tid])}
                      {pickTermsNote(league, d) ? `. ${pickTermsNote(league, d)}` : ''}
                    </div>
                  </div>
                  <span className={`tag ${d.round === 1 ? 'info' : ''}`}>R{d.round}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
      {owned.some((d) => proj(d) !== undefined) && <div className="tiny dim">{PROJECTION_NOTE}</div>}
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
      <Card className="flush">
        <div className="list">
          {list
            .filter((p) => p.draft.round === round)
            .map((p) => (
              <SelectionRow key={p.pid} league={league} p={p} />
            ))}
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ prospect detail

function ProspectSheet({ pid, onClose, canDraft, onDraft }: { pid: number | null; onClose: () => void; canDraft: boolean; onDraft: (pid: number) => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  const c = p?.prospect?.combine;
  const stat = (k: string, val: string) => (
    <div className="kpi" style={{ padding: 8 }}>
      <span className="k">{k}</span>
      <span className="v" style={{ fontSize: 18 }}>
        {val}
      </span>
    </div>
  );
  return (
    <Sheet open={!!p} onClose={onClose} label={p ? playerName(p) : undefined}>
      {p && (
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <span className="fo-rank" style={{ fontSize: 28, width: 40 }}>
              {p.prospect?.rank ?? '—'}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <h2 className="ellipsis" style={{ fontSize: 22 }}>
                {playerName(p)}
              </h2>
              <div className="fo-meta">
                {p.pos} · {playerAge(p, league.season)} · {fmtHeight(p.heightIn)} · {p.weightLb} lb
              </div>
              <div className="fo-meta">{p.college ? `${p.college} · ${p.country}` : p.country}</div>
            </div>
            <OvrPot p={p} />
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tag info">{p.archetype}</span>
            {p.tid >= 0 && (
              <span className="tag good">
                Drafted #{overallPick(league, p.draft.round, p.draft.pick)} by {league.teams[p.tid].abbrev}
              </span>
            )}
          </div>
          {p.prospect?.blurb && (
            <div className="dim2" style={{ lineHeight: 1.45 }}>
              {p.prospect.blurb}
            </div>
          )}
          {c && (
            <>
              <div className="fo-sec">Combine</div>
              <div className="grid4">
                {stat('Height', fmtIn(c.heightNoShoes))}
                {stat('Wingspan', fmtIn(c.wingspan))}
                {stat('Reach', fmtIn(c.standingReach))}
                {stat('Weight', `${c.weight} lb`)}
                {stat('Vert', `${c.maxVert.toFixed(1)}"`)}
                {stat('Lane', `${c.laneAgility.toFixed(2)}s`)}
                {stat('Sprint', `${c.sprint.toFixed(2)}s`)}
                {stat('Shooting', `${c.shootingDrill}/25`)}
              </div>
              <div className="tiny dim">
                Wingspan {c.wingspan - c.heightNoShoes >= 0 ? '+' : '−'}
                {Math.abs(c.wingspan - c.heightNoShoes)
                  .toFixed(2)
                  .replace(/\.?0+$/, '')}
                " vs height{c.wingspan - c.heightNoShoes >= 4 ? ': plus length' : c.wingspan - c.heightNoShoes < 1 ? ': short arms for his size' : ''}.
              </div>
            </>
          )}
          <div className="row" style={{ gap: 8 }}>
            <Link to={`/player/${p.pid}`} className="btn grow" onClick={onClose}>
              Full profile
            </Link>
            {canDraft && p.tid < 0 && (
              <button className="btn good grow" onClick={() => onDraft(p.pid)}>
                Draft him
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
