// Office → Draft: the draft as the season comes to it. The big board, the combine and the mock until
// the lottery; the lottery's result; draft night (the clock, the board, the selections); after it,
// the results. This module holds the views' switch and the confirm sheets; each view lives in
// src/ui/draft/.
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { League } from '../../core/types';
import { playerName, prospects, withRng } from '../../core/league/helpers';
import { draftOrder, draftUntilUser, nextPick } from '../../core/league/draft';
import { tradingClosedReason } from '../../core/league/trades';
import { draftNextPick } from '../../core/league/season';
import { draftProposals } from '../../core/league/proposals';
import { leagueMock, mockAvailable } from '../../core/league/mockDraft';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act, edit } from '../../state/actions';
import { draftPick, useBusy } from '../../state/actions/office';
import { runAgenda } from '../components/Agenda';
import { Avatar, PageHeader, Sheet, Toggle } from '../components/ui';
import { HelpSheet, OvrPot } from '../office/common';
import { PickTradeSheet } from '../office/PickTradeSheet';
import { TabBar, overallPick } from '../league/shared';
import { BoardList } from '../draft/rows';
import { boardRank, picksText } from '../draft/common';
import { LiveView, OnTheClock } from '../draft/LiveView';
import { MockView } from '../draft/MockView';
import { CombineView } from '../draft/CombineView';
import { LotteryView } from '../draft/LotteryView';
import { MyPicks, PicksPoster, Results } from '../draft/MyPicks';
import { ProspectSheet } from '../draft/ProspectSheet';

type View = 'live' | 'lottery' | 'board' | 'combine' | 'mock' | 'mine' | 'results';

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

  // a short word fits five tabs in a phone's row; the tab's name stays the full one
  const short = (word: string, name: string) => (
    <>
      <span aria-hidden="true">{word}</span>
      <span className="sr-only">{name}</span>
    </>
  );
  const views: { id: View; label: ReactNode }[] = [];
  if (league.phase === 'draft') views.push({ id: 'live', label: 'Live' });
  if (league.phase === 'draftLottery') views.push({ id: 'lottery', label: 'Lottery' });
  if (after) views.push({ id: 'results', label: 'Results' });
  if (!after) views.push({ id: 'board', label: short('Board', 'Big board') }, { id: 'combine', label: 'Combine' });
  if (!after && mockAvailable(league)) views.push({ id: 'mock', label: 'Mock' });
  views.push({ id: 'mine', label: short('Picks', 'Your picks') });
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
              <b>Big board.</b> Rank is the scouts' consensus order of the class, mixing potential and current ability; proj. is where the league's mock drafts have him going, by
              each team's needs, so the two can differ. OVR is what he can do now; POT is the ceiling scouts see.
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

      {/* before the lottery the desk's poster is your first pick; the lottery and draft night bring their own */}
      {league.phase !== 'draft' && league.phase !== 'draftLottery' && !after && <PicksPoster league={league} />}

      {views.length > 1 && <TabBar value={view} onChange={setView} options={views} label="Draft sections" />}

      {view === 'live' && league.phase === 'draft' && (
        <LiveView league={league} cls={cls} mock={mock} onClock={onClock} onOpen={setDetail} onDraft={setConfirmPick} onTrade={canTrade ? setTradePick : undefined} />
      )}
      {view === 'lottery' && <LotteryView league={league} onTrade={canTrade ? setTradePick : undefined} />}
      {view === 'board' && <BoardList league={league} list={cls} mock={mock} onOpen={setDetail} onDraft={onClock ? setConfirmPick : undefined} />}
      {view === 'mock' && <MockView league={league} mock={mock} onOpen={setDetail} />}
      {view === 'combine' && <CombineView league={league} list={cls} onOpen={setDetail} />}
      {view === 'mine' && <MyPicks league={league} />}
      {view === 'results' && <Results league={league} />}

      {/* how draft night runs: with the order (the lottery) and on the night, at the foot of the views that hold them (the poster and the order come first) */}
      {(view === 'lottery' || view === 'live') && (league.phase === 'draftLottery' || (league.phase === 'draft' && nextPick(league))) && (
        <div className="card tight">
          <Toggle
            on={!!league.settings.draftPause}
            onChange={setPause}
            label="Stop before every pick"
            help="Off, it runs to your next pick. On, it waits before each team's, so you can trade for the pick on the clock."
          />
        </div>
      )}

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
                  {league.players[confirmPick].pos} · {league.players[confirmPick].archetype}
                  {boardRank(league, league.players[confirmPick]) ? ` · rank ${boardRank(league, league.players[confirmPick])}` : ''}
                </div>
              </div>
              <OvrPot p={league.players[confirmPick]} />
            </div>
            <p className="fo-lede">
              Pick #{overallPick(league, np.round, np.pick!)}: {np.round === 1 ? '1st round, a 4-year rookie-scale deal' : '2nd round, a 2-year minimum deal'}.
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
            Your staff make your {myRemaining.length > 1 ? `${myRemaining.length} picks` : 'pick'} ({picksText(league, myRemaining)}), then re-signing opens.
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
