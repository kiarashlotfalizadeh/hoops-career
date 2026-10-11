import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import type { FlowAction } from './flow';
import type { League } from '../core/types';
import { faAdvance, finishDraftPhase, newSeason, startDraft, startFreeAgency, startRegularSeason } from '../core/league/season';
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
    // phase changes run behind the progress bar (buttons disabled); each is also a no-op outside
    // its phase, so a stale dispatch can't skip ahead
    let done = false;
    const task = (label: string, fn: (l: League) => boolean | void) =>
      st.task(label, (l) => {
        done = fn(l) !== false;
      });
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
        // from the Live screen, the box score replaces it: Back shouldn't land on a finished game
        if (mine) nav(`/game/${mine.gid}`, { replace: pathname === '/live' });
        return;
      }
      case 'startRegular': {
        let errs: string[] = [];
        if (!(await task('Opening night', (l) => void (errs = startRegularSeason(l))))) return;
        if (errs.length) st.toast(errs[0], 'bad');
        else st.toast('The regular season has begun!', 'good');
        return;
      }
      case 'startDraft':
        if (await task('Draft night', startDraft)) nav('/draft');
        return;
      case 'finishDraft':
        if (await task('Finishing the draft', finishDraftPhase)) nav('/resign');
        return;
      case 'startFA':
        if (await task('Opening free agency', startFreeAgency)) nav('/free-agents');
        return;
      case 'faDay':
        await task('Free agency', (l) => faAdvance(l, 1));
        return;
      case 'faWeek':
        await task('Free agency', (l) => faAdvance(l, 7));
        return;
      case 'newSeason':
        if (!(await task('Training camp', newSeason))) return;
        if (done) st.toast(`Welcome to the ${seasonLabel(useStore.getState().league!.season)} season. Check the training camp report in your inbox.`, 'good');
        nav('/');
        return;
    }
  };
}
