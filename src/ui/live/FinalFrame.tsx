// The buzzer: the final score over the frozen court, for a beat before the final card. A light scrim
// on the floor, an ink plate with the word, each team's block in its kit colour with its score slamming
// in (away, then home), the winner's the heavier with its mark, the loser's still white on its block;
// then on to the game report, by the button or by itself.
import { useEffect, useRef, type CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Team } from '../../core/types';
import type { MatchKit } from '../teamColors';

/** How long the frame holds before it moves on by itself. */
const HOLD_MS = 3500;

export function FinalFrame({
  teams,
  kits,
  score,
  label,
  won,
  onDone,
}: {
  /** [home, away]. */
  teams: [Team, Team];
  /** Tonight's kits, [home, away]. */
  kits: [MatchKit, MatchKit];
  /** [home, away]. */
  score: [number, number];
  /** "Final", "Final · OT". */
  label: string;
  /** The user's result (null: not his game). */
  won: boolean | null;
  /** On to the final card: the button, or the frame by itself after a beat. */
  onDone: () => void;
}) {
  // (once: the button and the timer can't both move on)
  const done = useRef(false);
  const latest = useRef(onDone);
  useEffect(() => {
    latest.current = onDone;
  }, [onDone]);
  const go = () => {
    if (done.current) return;
    done.current = true;
    latest.current();
  };
  useEffect(() => {
    const t = setTimeout(go, HOLD_MS);
    return () => clearTimeout(t);
    // (the frame's one timer, from when it goes up)
  }, []);
  const by = Math.abs(score[0] - score[1]);
  const result = won === null ? `${teams[score[0] > score[1] ? 0 : 1].abbrev} by ${by}` : `${won ? 'Won' : 'Lost'} by ${by}`;
  // away on the left, home on the right, as the scorebug has them
  const block = (i: 0 | 1) => {
    const winner = score[i] > score[1 - i];
    return (
      <div className={`lv-ff-team${i === 0 ? ' home' : ''}${winner ? ' winner' : ''}`} style={{ '--ff-c': kits[i].color, '--ff-t': kits[i].trim } as CSSProperties}>
        <span className="lv-ff-ab">
          {teams[i].abbrev}
          {winner && <span className="lv-ff-mark" />}
        </span>
        <span className="lv-ff-pts num">{score[i]}</span>
      </div>
    );
  };
  return (
    <div className="lv-ff">
      <div className="lv-ff-plate">
        {/* (said once, as a sentence; the blocks are the picture of it) */}
        <div role="status" className="sr-only">
          {label}: {teams[1].region} {teams[1].name} {score[1]}, {teams[0].region} {teams[0].name} {score[0]}.{won !== null && ` You ${won ? 'won' : 'lost'} by ${by}.`}
        </div>
        <div className="lv-ff-head" aria-hidden="true">
          <span className="lv-ff-word">{label}</span>
          <span className={`lv-ff-res${won === false ? ' l' : ''}`}>{result}</span>
        </div>
        <div className="lv-ff-row" aria-hidden="true">
          {block(1)}
          {block(0)}
        </div>
        <button type="button" className="lv-ff-go" onClick={go}>
          Game report <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
