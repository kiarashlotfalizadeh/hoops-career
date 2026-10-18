// The live screen's measurements: the room under the court for the docked Clipboard, and the
// scorebug's height, which sizes the court on a tablet (live.css reads it as --lv-bug-h).
import { useEffect, useState } from 'react';

/** The height of the element given to the returned ref (the dock under the court). */
export function useDockHeight() {
  const [dockEl, setDockEl] = useState<HTMLDivElement | null>(null);
  const [dockH, setDockH] = useState(0);
  useEffect(() => {
    if (!dockEl) return;
    const ro = new ResizeObserver(() => setDockH(dockEl.clientHeight));
    ro.observe(dockEl);
    return () => ro.disconnect();
  }, [dockEl]);
  return [setDockEl, dockH] as const;
}

/** Keeps the page's --lv-bug-h at the height of the element given to the returned ref (the scorebug). */
export function useBugHeight() {
  const [bugEl, setBugEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const page = bugEl?.closest<HTMLElement>('.lv');
    if (!bugEl || !page) return;
    const ro = new ResizeObserver(() => page.style.setProperty('--lv-bug-h', `${bugEl.offsetHeight}px`));
    ro.observe(bugEl);
    return () => {
      ro.disconnect();
      page.style.removeProperty('--lv-bug-h');
    };
  }, [bugEl]);
  return setBugEl;
}
