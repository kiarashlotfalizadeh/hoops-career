// Keys to the game on screen (see core/analysis/keys.ts): set on the pre-game screen, tracked live
// at the breaks and in the huddle, and graded with the result.
import { Check, KeyRound, X } from 'lucide-react';
import type { GameResult, KeyGrade } from '../../core/types';
import { keyState, keyValue, type GameKey, type KeyState } from '../../core/analysis/keys';

const STATE_TAG: Record<KeyState, { text: string; tone: string }> = {
  met: { text: 'Done', tone: 'good' },
  missed: { text: 'Missed', tone: 'bad' },
  on: { text: 'On track', tone: 'good' },
  behind: { text: 'Behind', tone: 'warn' },
  void: { text: 'Sat out', tone: '' },
};

/** The part of the game played (overtimes lengthen it): how far a number is from its pace. */
export function gameShare(elapsed: number, q: number): number {
  const total = 2880 + 300 * Math.max(0, q - 4);
  return Math.min(1, Math.max(0, elapsed / total));
}

/** The three keys before the game: what to do, the number, and why. */
export function KeysList({ keys }: { keys: GameKey[] }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      {keys.map((k, i) => (
        <div key={k.id} className="row top" style={{ gap: 10 }}>
          <span className="gd-key-n num" aria-hidden="true">
            {i + 1}
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small bold">{k.title}</div>
            <div className="small">{k.goal}</div>
            <div className="tiny dim">{k.why}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The keys as the game stands: each one's number so far and whether it's on track (on pace for a
 * full game at the rate so far), done or gone. `box` is the game as drawn.
 */
export function KeysLive({ keys, box, side, share, compact }: { keys: GameKey[]; box: Pick<GameResult, 'home' | 'away'>; side: 0 | 1; share: number; compact?: boolean }) {
  return (
    <div className="col" style={{ gap: compact ? 6 : 8 }}>
      <div className="tiny dim upper bold">Keys to the game</div>
      {keys.map((k) => {
        const v = keyValue(k, box, side);
        const st = keyState(k, v, share, false);
        const tag = STATE_TAG[st];
        const pace = v !== null && share > 0.05 && share < 1 && st !== 'met' && st !== 'missed' ? Math.round(v / share) : null;
        return (
          <div key={k.id} className="row top small" style={{ gap: 8 }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{k.title}</b>{' '}
              <span className="dim2">
                {v ?? 0} so far{pace !== null ? `, on pace for ${pace}` : ''} · {k.dir === 'max' ? '≤' : '≥'} {k.target}
              </span>
            </div>
            <span className={`tag ${tag.tone}`} style={{ flex: 'none' }}>
              {tag.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** How the keys went, from the result. */
export function KeysGraded({ keys }: { keys: KeyGrade[] }) {
  const counted = keys.filter((k) => k.met !== null);
  const met = counted.filter((k) => k.met).length;
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="row tiny dim upper bold" style={{ gap: 6 }}>
          <KeyRound size={13} aria-hidden="true" /> Keys to the game
        </span>
        <span className={`tag ${met === counted.length && met > 0 ? 'good' : met === 0 ? 'bad' : ''}`}>
          {met} of {counted.length}
        </span>
      </div>
      {keys.map((k) => (
        <div key={k.id} className="row top small" style={{ gap: 8 }}>
          <span
            className={k.met === null ? 'dim' : k.met ? 'good' : 'bad'}
            style={{ flex: 'none', marginTop: 1 }}
            aria-label={k.met === null ? 'Did not apply' : k.met ? 'Met' : 'Missed'}
          >
            {k.met === null ? '—' : k.met ? <Check size={15} /> : <X size={15} />}
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div>
              <b>{k.title}</b> <span className="dim2">· {k.goal.replace(/^./, (c) => c.toLowerCase())}</span>
            </div>
            <div className="tiny dim">{k.value === null ? 'He sat out.' : `${k.value} on the night.`}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
