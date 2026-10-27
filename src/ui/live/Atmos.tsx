// The night's atmosphere over the live court (see atmosphere.ts): the crowd's glow around the floor
// in the home team's colour (louder, brighter; hushed, dark), clutch time's tighter frame, the
// callout for a big moment, the crowd's line, clutch time's offer to watch the finish at 1×, and a
// decided game's offer of the final.
// CSS does the moving (opacity only, cheap on a phone); reduced motion keeps it still.
import { useEffect, useState, type CSSProperties } from 'react';
import { FastForward, Flame, X } from 'lucide-react';
import type { AtmoEvent } from './atmosphere';

/** The crowd around the floor: `level` 0 (hushed) .. 4 (on its feet), in `color` (the home team's). */
export function Crowd({ level, color, clutch }: { level: number; color: string; clutch: boolean }) {
  return <div className={`lv-crowd lvl-${level}${clutch ? ' clutch' : ''}`} style={{ '--crowd-c': color } as CSSProperties} aria-hidden="true" />;
}

/** A big moment, called over the court for a moment: its kicker in the team's colour (`kit`), the headline, one line. */
export function CallOut({ ev, kit }: { ev: AtmoEvent; kit?: string }) {
  return (
    <div className="lv-call-wrap">
      <div key={ev.id} className={`lv-call w-${ev.weight}${kit ? '' : ' neutral'}`} role="status" style={kit ? ({ '--call-c': kit } as CSSProperties) : undefined}>
        <span className="lv-call-k">{ev.kicker}</span>
        <span className="lv-call-t">{ev.title}</span>
        {ev.line && <span className="lv-call-l">{ev.line}</span>}
      </div>
    </div>
  );
}

/** The crowd's line, for a moment, at the top of the court. */
export function CrowdLine({ ev, level }: { ev: AtmoEvent; level: number }) {
  return (
    <div key={ev.id} className={`lv-crowd-line${ev.pri < 0 ? ' hush' : ''}`} role="status">
      <span className="lv-crowd-meter" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < level ? 'on' : ''} />
        ))}
      </span>
      {ev.title}
    </div>
  );
}

/** How long the offer to slow down stays up (real time). */
const OFFER_MS = 9000;

/** Clutch time at speed: watch the finish at 1× (now, or every game from here on). */
export function ClutchOffer({ onSlow, onAlways, onClose }: { onSlow: () => void; onAlways: () => void; onClose: () => void }) {
  const [up, setUp] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setUp(false), OFFER_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!up) onClose();
  }, [up, onClose]);
  if (!up) return null;
  return (
    <div className="lv-slow" role="group" aria-label="Clutch time">
      <Flame size={14} aria-hidden="true" className="lv-slow-ic" />
      <span className="lv-slow-t">Clutch time</span>
      <button className="lv-slow-b" onClick={onSlow}>
        Watch at 1×
      </button>
      <button className="lv-slow-b ghost" onClick={onAlways} title="Slow to 1× for every close finish">
        Always
      </button>
      <button className="lv-slow-x" onClick={() => setUp(false)} aria-label="Keep the speed">
        <X size={14} />
      </button>
    </div>
  );
}

/** A game decided in the fourth quarter (skip.ts sealedGame): the rest at once, from the court. */
export function FinalOffer({ onSim, onClose }: { onSim: () => void; onClose: () => void }) {
  const [up, setUp] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setUp(false), OFFER_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!up) onClose();
  }, [up, onClose]);
  if (!up) return null;
  return (
    <div className="lv-slow" role="group" aria-label="The game is decided">
      <span className="lv-slow-t">Decided</span>
      <button className="lv-slow-b" onClick={onSim}>
        <FastForward size={13} aria-hidden="true" className="lv-slow-bi" /> Sim to final
      </button>
      <button className="lv-slow-x" onClick={() => setUp(false)} aria-label="Keep watching">
        <X size={14} />
      </button>
    </div>
  );
}

const SLOW_KEY = 'hoops.live.clutchSlow';

/** Whether this device slows close finishes to 1× by itself (the offer's Always). A setting of the live screen's own, on this device. */
export function clutchSlowAlways(): boolean {
  try {
    return localStorage.getItem(SLOW_KEY) === '1';
  } catch {
    return false;
  }
}

export function setClutchSlowAlways(on: boolean) {
  try {
    if (on) localStorage.setItem(SLOW_KEY, '1');
    else localStorage.removeItem(SLOW_KEY);
  } catch {
    // (private browsing: it's offered again next time)
  }
}
