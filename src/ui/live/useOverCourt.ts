// What goes up over the live court, and when: the banners (an injury, a foul-out, the other coach's
// adjustment, the staff's word), one at a time and each once a night, and the broadcast graphics,
// each once and one every two game minutes. useLiveGame feeds it the drawn game; the screen draws
// what's up (live/Overlays.tsx).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BannerItem } from './Banner';
import type { Graphic } from './graphics';
import type { LiveAlert } from './alerts';
import { GRAPHIC_MS } from './LowerThird';
import { EVENT_MS, WORD_MS, bannerKey } from './session';

export function useOverCourt({ paused, atBreak }: { paused: boolean; atBreak: boolean }) {
  /** What's waiting to go up over the court, one at a time (the first is up). */
  const [banners, setBanners] = useState<BannerItem[]>([]);
  /** The banners said so far tonight (see bannerKey), and whether the alerts up now are to be taken as already said (the game was picked up, or skipped ahead). */
  const bannered = useRef({ said: new Set<string>(), seed: true });
  /** The broadcast graphic up now (see graphics.ts). */
  const [graphic, setGraphic] = useState<Graphic | null>(null);
  // graphics shown so far tonight, when the last went up, and whether this game was picked up part-way
  const gfx = useRef({ shown: new Set<string>(), last: null as number | null, seed: false });

  /** Put something up over the court (each once a night). */
  const queueBanner = useCallback((items: BannerItem[]) => {
    const said = bannered.current.said;
    const fresh = items.filter((b) => !said.has(bannerKey(b.id)));
    if (!fresh.length) return;
    for (const b of fresh) said.add(bannerKey(b.id));
    // (a pile-up keeps the latest few)
    setBanners((q) => [...q, ...fresh].slice(-3));
  }, []);

  /** Take banners as said without putting them up (along a skip: what happened waits in the alerts and the play-by-play). */
  const markSaid = useCallback((items: BannerItem[]) => {
    for (const b of items) bannered.current.said.add(bannerKey(b.id));
  }, []);

  /**
   * A game picked up part-way (the app was closed, or this screen left and opened again): what the
   * court already showed when it was picked up (`due`) went up then, or had its moment, so only what
   * happens from here gets a graphic.
   */
  const seedGraphics = useCallback((due: () => Graphic[]) => {
    if (!gfx.current.seed) return;
    gfx.current.seed = false;
    for (const g of due()) gfx.current.shown.add(g.id);
  }, []);

  /** Put a broadcast graphic up, `elapsed` game seconds in. */
  const showGraphic = useCallback((g: Graphic, elapsed: number) => {
    gfx.current.shown.add(g.id);
    // a break's team number doesn't hold up the next one
    if (g.kind !== 'team') gfx.current.last = elapsed;
    setGraphic(g);
  }, []);

  /** A new game (or none): nothing up and nothing said yet; one `pickedUp` part-way seeds its graphics (see seedGraphics). */
  const reset = useCallback((pickedUp: boolean) => {
    setBanners([]);
    bannered.current = { said: new Set(), seed: true };
    gfx.current = { shown: new Set(), last: null, seed: pickedUp };
    setGraphic(null);
  }, []);

  /** After a skip: nothing waits to go up, and the alerts up now are taken as said. */
  const afterSkip = useCallback(() => {
    bannered.current.seed = true;
    setBanners([]);
  }, []);

  /**
   * The staff's word goes up over the court once; what was up when the game was picked up (or
   * skipped through) is taken as said, and his word on something that's over (he's been subbed out,
   * the run has ended) comes down.
   */
  const sayStaff = useCallback(
    (alerts: LiveAlert[]) => {
      const b = bannered.current;
      if (b.seed) {
        b.seed = false;
        for (const a of alerts) b.said.add(bannerKey(a.id));
        return;
      }
      queueBanner(alerts.map((a) => ({ id: a.id, tone: a.tone, kicker: 'Staff', title: a.title, line: a.text || undefined })));
      const up = new Set(alerts.map((a) => bannerKey(a.id)));
      setBanners((q) => (q.some((x) => x.kicker === 'Staff' && !up.has(bannerKey(x.id))) ? q.filter((x) => x.kicker !== 'Staff' || up.has(bannerKey(x.id))) : q));
    },
    [queueBanner],
  );

  // one banner at a time, for a few seconds of play (it waits out a pause)
  const banner = banners[0];
  useEffect(() => {
    if (!banner || paused) return;
    const t = setTimeout(() => setBanners((b) => b.slice(1)), banner.kicker === 'Staff' ? WORD_MS : EVENT_MS);
    return () => clearTimeout(t);
  }, [banner, paused]);
  // a graphic stays up a few seconds of play (it waits out a break, and a banner: the court shows one or the other)
  const graphicId = graphic?.id;
  const bannerUp = !!banner;
  useEffect(() => {
    if (!graphicId || atBreak || bannerUp) return;
    const t = setTimeout(() => setGraphic(null), GRAPHIC_MS);
    return () => clearTimeout(t);
  }, [graphicId, atBreak, bannerUp]);

  /** Take down the banner up now. */
  const dropBanner = useCallback(() => setBanners((b) => b.slice(1)), []);

  return {
    banner,
    /** The graphic up now: none while a banner is up (it waits for it, then has its few seconds). */
    graphic: banner ? null : graphic,
    /** The graphics shown so far tonight and when the last went up, as the graphics read them. */
    gfx,
    queueBanner,
    markSaid,
    seedGraphics,
    showGraphic,
    reset,
    afterSkip,
    sayStaff,
    dropBanner,
  };
}
