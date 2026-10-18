import { useEffect, useRef, type ReactNode } from 'react';
import { Segmented } from '../components/ui';

export type ClipTab = 'lineup' | 'tactics' | 'calls' | 'box' | 'pbp';

const TABS: { id: ClipTab; label: string }[] = [
  { id: 'lineup', label: 'Lineup' },
  { id: 'tactics', label: 'Tactics' },
  { id: 'calls', label: 'Calls' },
  { id: 'box', label: 'Box' },
  { id: 'pbp', label: 'Play-by-play' },
];

/**
 * The coach's clipboard: every way to coach the game, one tab each (the lineup and its subs, the
 * tactics, the play calls, the box score, the play-by-play). Docked under the court when there's
 * room for it (beside it, held sideways), and open in a sheet from the quick actions: the same
 * clipboard, on the same tab.
 */
export function Clipboard({ tab, onTab, docked, children }: { tab: ClipTab; onTab: (t: ClipTab) => void; docked?: boolean; children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  // a tab opens at its top (docked, the clipboard scrolls; in its sheet, the sheet does)
  useEffect(() => {
    const el = body.current;
    const sc = docked ? el : el?.closest<HTMLElement>('.sheet');
    if (sc && sc.scrollTop > 0) sc.scrollTop = 0;
  }, [tab, docked]);
  return (
    <div className={`lv-clip${docked ? ' docked' : ''}`}>
      <div className="lv-clip-tabs">
        <Segmented tabs value={tab} onChange={onTab} label="Clipboard" options={TABS} />
      </div>
      <div className="lv-clip-body" ref={body}>
        {children}
      </div>
    </div>
  );
}
