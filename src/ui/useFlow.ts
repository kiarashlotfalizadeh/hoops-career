import { useLocation, useNavigate } from 'react-router-dom';
import { useStore, type TaskOp } from '../state/store';
import type { FlowAction } from './flow';
import { newSeasonBlockedReason } from '../core/league/season';
import { seasonLabel } from '../core/constants';

export function useFlowRunner() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return async (a: FlowAction) => {
    const st = useStore.getState();
    if (a.to) {
      nav(a.to);
      return;
    }
    // a sim or a phase change is already running: ignore double taps
    if (st.sim) return;
    if (a.sim) {
      await st.simulate(a.sim);
      return;
    }
    // phase changes run in the worker behind the progress bar (buttons disabled); each is also a
    // no-op outside its phase, so a stale dispatch can't skip ahead
    const task = (label: string, op: TaskOp) => st.task(label, op);
    switch (a.cmd) {
      case 'watchLive':
        nav('/live');
        return;
      case 'quickGame': {
        // also finishes a live game in progress (simulate picks it up from its current score)
        const before = st.league!.games.length;
        await st.simulate({ kind: 'days', n: 1 });
        const l = useStore.getState().league;
        const mine = l?.games.slice(before).find((g) => g.home.tid === l.userTid || g.away.tid === l.userTid);
        if (!mine || !l) return;
        // from the Live screen, the report replaces it (Back shouldn't land on a finished game);
        // anywhere else the result is a toast that opens it, and the screen stays put
        if (pathname === '/live') {
          nav(`/game/${mine.gid}`, { replace: true });
          return;
        }
        const home = mine.home.tid === l.userTid;
        const [us, them] = home ? [mine.home.pts, mine.away.pts] : [mine.away.pts, mine.home.pts];
        const opp = l.teams[home ? mine.away.tid : mine.home.tid].abbrev;
        st.toast(`${us > them ? 'W' : 'L'} ${us}-${them} ${home ? 'vs' : '@'} ${opp} · Report`, us > them ? 'good' : 'bad', `/game/${mine.gid}`);
        return;
      }
      case 'startRegular': {
        const r = await task('Opening night', { kind: 'startRegular' });
        if (!r) return;
        const errs = r.errors ?? [];
        if (errs.length) st.toast(errs[0], 'bad');
        else st.toast('The regular season has begun!', 'good');
        return;
      }
      case 'startDraft':
        if (await task('Draft night', { kind: 'startDraft' })) nav('/office/draft');
        return;
      case 'finishDraft':
        if (await task('Finishing the draft', { kind: 'finishDraft' })) nav('/office/resign');
        return;
      case 'startFA':
        if (await task('Opening free agency', { kind: 'startFA' })) nav('/office/free-agents');
        return;
      case 'faDay':
        await task('Free agency', { kind: 'faAdvance', days: 1 });
        return;
      case 'faWeek':
        await task('Free agency', { kind: 'faAdvance', days: 7 });
        return;
      case 'newSeason': {
        const r = await task('Training camp', { kind: 'newSeason' });
        if (!r) return;
        const done = !!r.done;
        // finishing the market stops for an offer sheet on one of the user's restricted free agents
        const blocked = !done && newSeasonBlockedReason(useStore.getState().league!);
        if (blocked) {
          st.toast(`Free agency stopped: ${blocked}`, 'bad');
          nav('/office/free-agents');
          return;
        }
        if (done) st.toast(`Welcome to the ${seasonLabel(useStore.getState().league!.season)} season. Check the training camp report in your inbox.`, 'good');
        nav('/');
        return;
      }
    }
  };
}
