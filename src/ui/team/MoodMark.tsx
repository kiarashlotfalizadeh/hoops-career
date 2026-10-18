// The mark a player's row carries when his mood matters (he asked for a trade, or he's unhappy):
// on the roster, the rotation and his page. Nothing for a player whose mood doesn't.
import type { Player } from '../../core/types';
import { moodMarker } from '../../core/league/moraleView';
import '../screens/team.css';

export function MoodMark({ p }: { p: Player }) {
  const m = moodMarker(p);
  if (!m) return null;
  return <span className={`tm-moodmark ${m.tone}`}>{m.label}</span>;
}
