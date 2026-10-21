// Keys to the game on screen (see core/analysis/keys.ts), as the matchup preview sets them: tracked
// live at the breaks and in the huddle, and graded with the result.
import { Check, X } from 'lucide-react';
import type { GameResult, KeyGrade } from '../../core/types';
import { isRate, keyState, keyValue, type GameKey, type KeyState } from '../../core/analysis/keys';

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

/**
 * The keys as the game stands: each one's number so far and whether it's on track (on pace for a
 * full game at the rate so far), done or gone. `box` is the game as drawn.
 */
export function KeysLive({ keys, box, side, share, compact }: { keys: GameKey[]; box: Pick<GameResult, 'home' | 'away'>; side: 0 | 1; share: number; compact?: boolean }) {
  return (
    <div className={`gd-keys-live${compact ? ' compact' : ''}`}>
      <div className="over">Keys to the game</div>
      {keys.map((k) => {
        const v = keyValue(k, box, side);
        const st = keyState(k, v, share, false);
        const tag = STATE_TAG[st];
        const rate = isRate(k.stat);
        // a share of the misses has no pace: it is what it is so far
        const pace = !rate && v !== null && share > 0.05 && share < 1 && st !== 'met' && st !== 'missed' ? Math.round(v / share) : null;
        const u = rate ? '%' : '';
        return (
          <div key={k.id} className="gd-kl">
            <div className="grow">
              <div className="gd-kl-t">{k.title}</div>
              <div className="gd-kl-n num">
                {v ?? 0}
                {u} so far{pace ? ` · on pace for ${pace}` : ''} · goal {k.dir === 'max' ? '≤' : '≥'} {k.target}
                {u}
              </div>
            </div>
            <span className={`tag ${tag.tone}`}>{tag.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** "2 of 3 met": how the keys went, in a line. */
export function keysMetText(keys: KeyGrade[]): string {
  const counted = keys.filter((k) => k.met !== null);
  return `${counted.filter((k) => k.met).length} of ${counted.length} met`;
}

/** How the keys went, from the result (`bare`: the rows alone, for a group that already names them). */
export function KeysGraded({ keys, bare }: { keys: KeyGrade[]; bare?: boolean }) {
  const counted = keys.filter((k) => k.met !== null);
  const met = counted.filter((k) => k.met).length;
  const rows = keys.map((k) => (
    <div key={k.id} className="gd-key">
      <span className={`gd-key-mark ${k.met === null ? 'void' : k.met ? 'met' : 'missed'}`} role="img" aria-label={k.met === null ? 'Did not apply' : k.met ? 'Met' : 'Missed'}>
        {k.met === null ? '—' : k.met ? <Check size={15} /> : <X size={15} />}
      </span>
      <div className="grow">
        <div className="gd-key-t">{k.title}</div>
        <div className="gd-key-g">{k.goal}</div>
      </div>
      <span className="gd-key-v num">{k.value === null ? 'Sat out' : `${k.value}${k.pct ? '%' : ''}`}</span>
    </div>
  ));
  if (bare) return <div className="list">{rows}</div>;
  return (
    <section className="sec">
      <div className="sec-h">
        <h3>Keys to the game</h3>
        <span className={`tag ${met === counted.length && met > 0 ? 'good' : met === 0 ? 'bad' : ''}`}>
          {met} of {counted.length}
        </span>
      </div>
      <div className="card flush list">{rows}</div>
    </section>
  );
}
