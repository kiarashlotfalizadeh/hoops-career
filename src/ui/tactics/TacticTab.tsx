// Tactics → Tactic, where the screen opens: the tactics board (your five where the shape and the
// scheme put them, each with his role, how he suits it and how well he knows it, the formation picker
// with each choice's fit and familiarity), then your saved playbooks. The style and the assistant's
// switch are the hero's; the mentality is an instruction (Instructions); the bench's roles are on
// Players.
import type { Player } from '../../core/types';
import { useLeague } from '../../state/store';
import { MyPlaybooksCard } from './MyPlaybooks';
import { Board, type BoardSide } from './Board';
import { useFam } from './useFam';

export function TacticTab({ players, side, setSide, onPlayers }: { players: Player[]; side: BoardSide; setSide: (s: BoardSide) => void; onPlayers: () => void }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const fam = useFam();
  return (
    <div className="tx-tactic">
      <div className="tx-tactic-main">
        <Board t={t} players={players} fam={fam} side={side} setSide={setSide} onPlayers={onPlayers} />
      </div>
      <div className="tx-tactic-side">
        <MyPlaybooksCard />
      </div>
    </div>
  );
}
