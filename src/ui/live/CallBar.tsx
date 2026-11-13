// The call bar: one ink strip between the scorebug and the court, always the same height, saying one
// thing at a time. Nothing sits over the court during play (the basket in view can be at either end),
// so everything the broadcast says goes here, by priority: playback when the user asked for it, an
// offer (clutch time at 1×, a decided game's final), the one banner (an injury, a foul-out, their
// adjustment, the staff's word), the callout for a big moment in its team's colour, a graphic, the
// crowd's line, and under them all the running call of the play. At a break, in a huddle and before
// the tip it reads the stop's name (`title`); only a banner goes over that.
// A change of state wipes in from the left like a lower third, the running call ticks to its next
// line, and the play's result (+3, Miss, Steal) lands at the line's end; the strip never changes
// height, so the court never moves.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, FastForward, Flame, Lightbulb, Pause, Play, X, Zap } from 'lucide-react';
import { LIVE_SPEEDS } from '../settingsOptions';
import type { MatchKit } from '../teamColors';
import type { AtmoEvent } from './atmosphere';
import { captionAt, type Script } from './choreo';
import type { Graphic } from './graphics';
import type { Beat } from './ticker';

/** Something the bar says for a moment: an injury, a foul-out, the other coach's change, or the assistant's word. */
export interface BannerItem {
  id: string;
  tone: 'bad' | 'warn' | 'info';
  /** "Injury", "Fouled out", "Adjustment", "Staff". */
  kicker: string;
  title: string;
  line?: string;
}

/** Clutch time at speed: watch the finish at 1× (now, or every close finish from here on). */
export interface ClutchOfferActions {
  onSlow: () => void;
  onAlways: () => void;
  /** Turned down, or left alone until it went away. */
  onClose: () => void;
}

/** A game decided in the fourth quarter: the rest at once. */
export interface FinalOfferActions {
  onSim: () => void;
  onClose: () => void;
}

/** How long playback stays up after a tap while the game plays. */
const SHOW_MS = 3000;
/** How long an offer stays up before it's taken as turned down (real time it's on the bar). */
const OFFER_MS = 9000;

export interface CallBarProps {
  /** The possession the court is drawing (its running call is the bar's default line). */
  script: Script | null;
  /** Key plays: on to the next one without drawing this one. */
  ffing: boolean;
  /** The frame the court has reached (a store: only the call's line re-renders). */
  beat: Beat;
  /** Tonight's kits, [home, away]. */
  kits: [MatchKit, MatchKit];
  /**
   * The stop's name ("Halftime", "End of Q1", "Timeout", "Tip-off"): at a break, in a huddle, before the
   * tip. While it's set the bar shows it (or the banner) and no playback: the stop has its own button.
   */
  title?: string;
  graphic?: Graphic | null;
  banner?: BannerItem;
  onDropBanner: () => void;
  /** A big moment (a run, a big play, clutch time). */
  call?: AtmoEvent | null;
  crowdLine?: AtmoEvent | null;
  /** The crowd, 0 (hushed) .. 4 (on its feet), for the crowd line's meter. */
  crowd?: number;
  /** Set while the offer is open. */
  clutchOffer?: ClutchOfferActions;
  /** Set while the offer is open (clutch time's goes first). */
  finalOffer?: FinalOfferActions;
  paused: boolean;
  speed: number;
  keyPlays: boolean;
  /** Bumped to bring playback up for a moment (the opening tip, a resume). */
  reveal: number;
  /** Bumped at a tap on the court: playback comes up (or, up and playing, goes away). */
  tap: number;
  onPause: () => void;
  onSpeed: (to: number) => void;
  onKeyPlays: () => void;
  onSkip: () => void;
  /** Clutch time: the bar wears its edge (the page's `.clutch` class does the same). */
  clutch?: boolean;
}

type State = 'title' | 'transport' | 'clutch' | 'final' | 'banner' | 'call' | 'graphic' | 'crowd' | 'play' | 'ff' | 'idle';

export function CallBar(p: CallBarProps) {
  const { script, ffing, beat, kits, title, graphic, banner, call, crowdLine, clutchOffer, finalOffer, paused, speed, keyPlays, reveal, tap } = p;
  const root = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  // playback is up for a moment after a tap (and for as long as the game is paused)
  const [up, setUp] = useState(false);
  const timer = useRef(0);
  const show = useCallback(() => {
    setUp(true);
    clearTimeout(timer.current);
    const wait = () => {
      // (a keyboard on one of its buttons keeps it up)
      const at = document.activeElement;
      if (at && root.current?.contains(at) && at.matches(':focus-visible')) timer.current = window.setTimeout(wait, SHOW_MS);
      else setUp(false);
    };
    timer.current = window.setTimeout(wait, SHOW_MS);
  }, []);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setUp(false);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // a tap on the court: up, or away again if it was up while the game plays
  const seen = useRef({ tap, reveal, paused });
  useEffect(() => {
    const was = seen.current;
    seen.current = { tap, reveal, paused };
    if (tap !== was.tap) {
      if (up && !paused) hide();
      else show();
    } else if (reveal !== was.reveal || (was.paused && !paused)) show();
    // (only the three signals: `up` is read as it stands when one arrives)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap, reveal, paused]);

  const state: State = title
    ? banner
      ? 'banner'
      : 'title'
    : paused || up
      ? 'transport'
      : clutchOffer
        ? 'clutch'
        : finalOffer
          ? 'final'
          : banner
            ? 'banner'
            : call
              ? 'call'
              : graphic
                ? 'graphic'
                : crowdLine
                  ? 'crowd'
                  : script
                    ? 'play'
                    : ffing
                      ? 'ff'
                      : 'idle';

  // an offer left alone goes away (the time it's on the bar: playback over it starts it again)
  const closeOffer = useRef<() => void>(() => {});
  closeOffer.current = state === 'clutch' ? clutchOffer!.onClose : state === 'final' ? finalOffer!.onClose : () => {};
  const offerUp = state === 'clutch' || state === 'final' ? state : null;
  useEffect(() => {
    if (!offerUp) return;
    const t = setTimeout(() => closeOffer.current(), OFFER_MS);
    return () => clearTimeout(t);
  }, [offerUp]);

  // a banner has the bar for a while, then the running call comes back (it waits while the game is
  // paused in play: a stop for a hurt starter keeps his line up until the coach has dealt with it;
  // at a break or in a huddle it gives the bar back to the stop's name)
  const dropBanner = useRef(p.onDropBanner);
  dropBanner.current = p.onDropBanner;
  const bannerUp = state === 'banner' && (!paused || !!title) ? banner!.id : null;
  const bannerMs = banner?.tone === 'bad' ? 9000 : 6500;
  useEffect(() => {
    if (!bannerUp) return;
    const t = setTimeout(() => dropBanner.current(), bannerMs);
    return () => clearTimeout(t);
  }, [bannerUp, bannerMs]);

  // the bar's own pause button: the game pauses and playback takes the bar, the focus with it
  const toFocus = useRef(false);
  const pauseFromBar = () => {
    toFocus.current = true;
    p.onPause();
    show();
  };
  useEffect(() => {
    if (state !== 'transport' || !toFocus.current) return;
    toFocus.current = false;
    primary.current?.focus();
  }, [state]);

  const pauseBtn = (
    <button type="button" className="lv-cb-pause" onClick={pauseFromBar} aria-label="Pause: playback controls">
      <Pause size={16} fill="currentColor" aria-hidden="true" />
    </button>
  );

  let key: string = state;
  let cls = '';
  let style: CSSProperties | undefined;
  let body: ReactNode;
  if (state === 'transport') {
    const i = LIVE_SPEEDS.findIndex((x) => x.id === speed);
    const next = LIVE_SPEEDS[(i + 1) % LIVE_SPEEDS.length];
    // (a press keeps it up)
    const act = (fn: () => void) => () => {
      fn();
      show();
    };
    body = (
      <div className="lv-cb-row lv-cb-tp" role="group" aria-label="Playback" onFocus={show}>
        <button ref={primary} type="button" className="lv-cb-btn go" onClick={act(p.onPause)} aria-label={paused ? 'Resume' : 'Pause'}>
          {paused ? <Play size={16} fill="currentColor" aria-hidden="true" /> : <Pause size={16} fill="currentColor" aria-hidden="true" />}
          <span className="lv-cb-btn-t">{paused ? 'Resume' : 'Pause'}</span>
        </button>
        <button type="button" className="lv-cb-btn fig" onClick={act(() => p.onSpeed(next.id))} aria-label={`Speed ${speed}×: change to ${next.label}`}>
          {speed}×
        </button>
        <button type="button" className={`lv-cb-btn${keyPlays ? ' on' : ''}`} aria-pressed={keyPlays} aria-label="Key plays" onClick={act(p.onKeyPlays)}>
          <Zap size={15} aria-hidden="true" />
          <span className="lv-cb-btn-t">Key plays</span>
        </button>
        <button type="button" className="lv-cb-btn end" onClick={act(p.onSkip)} aria-label="Skip ahead" aria-haspopup="dialog">
          <FastForward size={16} aria-hidden="true" />
          <span className="lv-cb-btn-t">Skip</span>
        </button>
      </div>
    );
  } else if (state === 'clutch') {
    body = (
      <div className="lv-cb-row lv-cb-offer" role="group" aria-label="Clutch time">
        <Flame size={16} className="lv-cb-ic warn" aria-hidden="true" />
        <span className="lv-cb-t one grow">Clutch time</span>
        <button type="button" className="lv-cb-btn sm on" onClick={clutchOffer!.onSlow}>
          Watch at 1×
        </button>
        <button type="button" className="lv-cb-btn sm" onClick={clutchOffer!.onAlways} title="Slow to 1× for every close finish">
          Always
        </button>
        <button type="button" className="lv-cb-x" onClick={clutchOffer!.onClose} aria-label="Keep the speed">
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    );
  } else if (state === 'final') {
    body = (
      <div className="lv-cb-row lv-cb-offer" role="group" aria-label="The game is decided">
        <span className="lv-cb-t one grow">Game decided</span>
        <button type="button" className="lv-cb-btn sm on" onClick={finalOffer!.onSim}>
          <FastForward size={15} aria-hidden="true" /> Sim to the end
        </button>
        <button type="button" className="lv-cb-x" onClick={finalOffer!.onClose} aria-label="Keep watching">
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    );
  } else if (state === 'banner' && banner) {
    const Icon = banner.tone === 'info' ? Lightbulb : AlertTriangle;
    key = `banner-${banner.id}`;
    cls = ` tone-${banner.tone}`;
    body = (
      <div className="lv-cb-row" role="status">
        <Icon size={17} className="lv-cb-ic tone" aria-hidden="true" />
        <div className="lv-cb-txt grow">
          <div className={`lv-cb-t${banner.line ? ' one' : ''}`}>
            <span className="lv-cb-k">{banner.kicker}</span> {banner.title}
          </div>
          {banner.line && <div className="lv-cb-l">{banner.line}</div>}
        </div>
        <button type="button" className="lv-cb-x" onClick={p.onDropBanner} aria-label="Hide">
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    );
  } else if (state === 'call' && call) {
    // the bar takes the team's colour for its moment (a moment that's nobody's stays ink)
    const kit = call.side === -1 ? undefined : kits[call.side];
    key = `call-${call.id}`;
    cls = `${kit ? ' kit' : ' open'}${call.weight === 3 ? ' big' : ''}`;
    style = kit ? ({ '--cb-c': kit.color, '--cb-trim': kit.trim } as CSSProperties) : undefined;
    body = (
      <div className="lv-cb-row" role="status">
        <div className="lv-cb-txt grow">
          <div className="lv-cb-head">{call.title}</div>
          <div className="lv-cb-l strong">
            <span className="lv-cb-k">{call.kicker}</span>
            {call.line ? ` · ${call.line}` : ''}
          </div>
        </div>
        {pauseBtn}
      </div>
    );
  } else if (state === 'graphic' && graphic) {
    const kit = kits[graphic.side];
    key = `gfx-${graphic.id}`;
    cls = ' edge';
    style = { '--cb-c': kit.color, '--cb-night': kit.night } as CSSProperties;
    body = (
      <div className="lv-cb-row" role="status">
        <div className="lv-cb-t grow">
          <span className="lv-cb-tag">{graphic.tag}</span> {graphic.text}
        </div>
        {pauseBtn}
      </div>
    );
  } else if (state === 'crowd' && crowdLine) {
    const level = p.crowd ?? 2;
    key = `crowd-${crowdLine.id}`;
    body = (
      <div className="lv-cb-row" role="status">
        <span className={`lv-cb-meter${crowdLine.pri < 0 ? ' hush' : ''}`} aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <i key={n} className={n < level ? 'on' : ''} />
          ))}
        </span>
        <div className="lv-cb-t quiet grow">{crowdLine.title}</div>
        {pauseBtn}
      </div>
    );
  } else if (state === 'title') {
    body = (
      <div className="lv-cb-row">
        <div className="lv-cb-head grow">{title}</div>
      </div>
    );
  } else {
    // the running call: screen readers get the announce region instead (the pause button stays theirs)
    style = script ? ({ '--cb-night': kits[script.off].night } as CSSProperties) : undefined;
    body = (
      <div className="lv-cb-row">
        {script ? (
          <>
            <span className="lv-cb-dot" aria-hidden="true" />
            <div className="lv-cb-t grow" aria-hidden="true">
              <Caption script={script} beat={beat} />
            </div>
            <Result script={script} beat={beat} />
          </>
        ) : state === 'ff' ? (
          <div className="lv-cb-t quiet one grow" aria-hidden="true">
            <FastForward size={14} className="lv-cb-ff" aria-hidden="true" /> Key plays: on to the next one
          </div>
        ) : (
          <span className="grow" />
        )}
        {pauseBtn}
      </div>
    );
  }

  return (
    <div ref={root} className={`lv-cb is-${state}${p.clutch ? ' clutch' : ''}`}>
      <div key={key} className={`lv-cb-state${cls}`} style={style}>
        {body}
      </div>
    </div>
  );
}

/** The running call of the possession the court is drawing ("Holmgren screens for Mitchell"), from the frame it has reached. */
function Caption({ script, beat }: { script: Script; beat: Beat }) {
  const i = useSyncExternalStore(beat.subscribe, beat.get);
  const text = captionAt(script, i);
  // (keyed by its words: a new line ticks in, the same line carried over a frame stays put)
  return (
    <span key={text} className="lv-cb-cap">
      {text}
    </span>
  );
}

/** How the play came out, once the court has drawn it: the court's own word for it (+3, Miss, Steal), landing at the line's end. */
function Result({ script, beat }: { script: Script; beat: Beat }) {
  const i = useSyncExternalStore(beat.subscribe, beat.get);
  let at = -1;
  for (let j = Math.min(i, script.frames.length - 1); j >= 0; j--) {
    const f = script.frames[j].flash;
    if (f && f.kind !== 'info') {
      at = j;
      break;
    }
  }
  if (at < 0) return null;
  const f = script.frames[at].flash!;
  return (
    <span key={at} className={`lv-cb-res ${f.kind}`} aria-hidden="true">
      {f.text}
    </span>
  );
}
