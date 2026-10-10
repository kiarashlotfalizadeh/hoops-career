import { useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import type { FlowAction } from './flow';
import { faAdvance, finishDraftPhase, newSeason, startDraft, startFreeAgency, startRegularSeason } from '../core/league/season';
import { seasonLabel } from '../core/constants';

export function useFlowRunner() {
  const nav = useNavigate();
  return async (a: FlowAction) => {
    const st = useStore.getState();
    if (a.to) {
      nav(a.to);
      return;
    }
    if (a.sim) {
      await st.simulate(a.sim);
      return;
    }
    switch (a.cmd) {
      case 'watchLive':
        nav('/live');
        return;
      case 'quickGame': {
        const before = st.league!.games.length;
        await st.simulate({ kind: 'days', n: 1 });
        const l = useStore.getState().league!;
        const mine = l.games.slice(before).find((g) => g.home.tid === l.userTid || g.away.tid === l.userTid);
        if (mine) nav(`/game/${mine.gid}`);
        return;
      }
      case 'startRegular': {
        let errs: string[] = [];
        st.mutate((l) => {
          errs = startRegularSeason(l);
        });
        if (errs.length) st.toast(errs[0], 'bad');
        else st.toast('The regular season has begun!', 'good');
        return;
      }
      case 'startDraft':
        st.mutate((l) => startDraft(l));
        nav('/draft');
        return;
      case 'finishDraft':
        st.mutate((l) => finishDraftPhase(l));
        nav('/resign');
        return;
      case 'startFA':
        st.mutate((l) => startFreeAgency(l));
        nav('/free-agents');
        return;
      case 'faDay':
        st.mutate((l) => faAdvance(l, 1));
        return;
      case 'faWeek':
        st.mutate((l) => faAdvance(l, 7));
        return;
      case 'newSeason':
        st.mutate((l) => newSeason(l));
        st.toast(`Welcome to the ${seasonLabel(useStore.getState().league!.season)} season. Check the training camp report in your inbox.`, 'good');
        nav('/');
        return;
    }
  };
}
