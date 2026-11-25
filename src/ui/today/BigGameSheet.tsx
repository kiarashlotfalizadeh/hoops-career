// The decisive playoff game's question, on its own sheet (bigGame.ts): coach it live, sim it, or not
// yet. Mounted once in the shell.
import { useNavigate } from 'react-router-dom';
import { Eye, FastForward } from 'lucide-react';
import { useStore } from '../../state/store';
import { Sheet } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { useFlowRunner } from '../useFlow';
import { closeBigGame, useBigGameAsk } from './bigGame';

export function BigGameHost() {
  const ask = useBigGameAsk();
  const league = useStore((s) => s.league);
  const simming = useStore((s) => !!s.sim);
  const nav = useNavigate();
  const run = useFlowRunner();
  const show = !!ask && !!league && !simming;
  const coach = () => {
    if (!ask) return;
    closeBigGame(league, true);
    // (the pre-game screen first: the plan and the matchup are a tap from tip-off there)
    nav(`/games/${ask.big.opp}`);
  };
  const sim = () => {
    if (!ask) return;
    const then = ask.then;
    closeBigGame(league, true);
    void run(then ?? { id: 'quick', label: 'Sim this game', cmd: 'quickGame' });
  };
  return (
    <Sheet open={show} onClose={() => closeBigGame(league, false)} title={ask?.big.title}>
      {ask && league && (
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <TeamLogo tid={ask.big.opp} size={44} decorative />
            <p className="grow" style={{ margin: 0 }}>
              {ask.big.line}
            </p>
          </div>
          <p className="small dim2" style={{ margin: 0 }}>
            Coach it yourself, or let the staff run it{ask.then && ask.then.id !== 'quick' ? ` and carry on with “${ask.then.label}”` : ''}.
          </p>
          <button type="button" className="btn primary big block" onClick={coach}>
            <Eye size={18} aria-hidden="true" /> Coach it live
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn grow" onClick={() => closeBigGame(league, false)}>
              Not yet
            </button>
            <button type="button" className="btn grow" onClick={sim}>
              <FastForward size={15} aria-hidden="true" /> Sim it
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
