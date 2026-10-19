import { useEffect, useRef, useState } from 'react';
import { FastForward, Pause, Play, Zap } from 'lucide-react';
import { LIVE_SPEEDS } from '../settingsOptions';

/** How long the controls stay up after a tap while the game plays. */
const SHOW_MS = 2800;

/**
 * Playback, over the court like a video player's: tap the court and the controls come up (pause or
 * play, skip ahead, the speed and key plays only), then fade while the game
 * plays; paused, they stay. One place for all of them. They stay in reach of a keyboard and a
 * screen reader (focusing one brings them up).
 */
export function Playback({
  paused,
  speed,
  keyPlays,
  playLabel,
  reveal,
  onPause,
  onSpeed,
  onKeyPlays,
  onSkip,
}: {
  paused: boolean;
  speed: number;
  keyPlays: boolean;
  /** What the play button does while paused ("Resume", "Start Q3"). */
  playLabel: string;
  /** Bumped to bring the controls up for a moment (the opening tip, a resume). */
  reveal: number;
  onPause: () => void;
  onSpeed: (to: number) => void;
  onKeyPlays: () => void;
  onSkip: () => void;
}) {
  const [up, setUp] = useState(false);
  const timer = useRef(0);
  const bump = () => {
    setUp(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setUp(false), SHOW_MS);
  };
  useEffect(() => {
    if (reveal) bump();
  }, [reveal]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // paused: they stay up; playing again, they fade after a moment
  useEffect(() => {
    if (!paused && up) bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
  const shown = up || paused;
  const i = LIVE_SPEEDS.findIndex((x) => x.id === speed);
  const nextSpeed = LIVE_SPEEDS[(i + 1) % LIVE_SPEEDS.length];
  // a tap on a control keeps them up; a tap anywhere else toggles them
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
    bump();
  };
  return (
    <div
      className={`lv-pb${shown ? ' up' : ''}`}
      onClick={() => {
        if (shown && !paused) {
          clearTimeout(timer.current);
          setUp(false);
        } else bump();
      }}
      onFocus={bump}
    >
      <div className="lv-pb-scrim" aria-hidden="true" />
      <div className="lv-pb-top" role="group" aria-label="Playback settings">
        <button className={`lv-pb-chip${keyPlays ? ' on' : ''}`} aria-pressed={keyPlays} onClick={act(onKeyPlays)}>
          <Zap size={14} aria-hidden="true" /> Key plays
        </button>
        <button className="lv-pb-chip num" onClick={act(() => onSpeed(nextSpeed.id))} aria-label={`Speed ${speed}×: tap for ${nextSpeed.label}`}>
          {speed}×
        </button>
      </div>
      <div className="lv-pb-mid" role="group" aria-label="Playback">
        <button className="lv-pb-btn big" onClick={act(onPause)} aria-label={paused ? playLabel : 'Pause'}>
          {paused ? <Play size={28} fill="currentColor" /> : <Pause size={28} fill="currentColor" />}
        </button>
        <button className="lv-pb-btn" onClick={act(onSkip)} aria-label="Skip ahead" aria-haspopup="dialog">
          <FastForward size={20} />
        </button>
      </div>
    </div>
  );
}
