// The live screen's measurement: the scorebug's height, which sizes the court on a tablet (live.css
// reads it as --lv-bug-h).
import { useEffect, useState } from 'react';

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
