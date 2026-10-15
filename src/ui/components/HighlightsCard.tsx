// The night's highlights in a game report: the reel the save keeps for the user's latest live game
// (League.reel), played on the court as the live game drew them, with the running call of each play.
import { useMemo, useState } from 'react';
import { Clapperboard, SkipBack, SkipForward, Square } from 'lucide-react';
import type { GameResult, League } from '../../core/types';
import { composites } from '../../core/ratings';
import { buildScript, captionAt, type Script } from '../live/choreo';
import { Court } from '../live/Court';
import { jerseyColors } from '../teamColors';
import { fmtClock, periodLabel, rosterNames } from '../stats';
import { teamPlayers } from '../../core/league/helpers';
import { Card } from './ui';

export function HighlightsCard({ league, res }: { league: League; res: GameResult }) {
  const reel = league.reel?.gid === res.gid ? league.reel : undefined;
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  const colors = useMemo(() => jerseyColors(home.colors, away.colors), [home, away]);
  // names as the box score had them (players since traded or retired keep theirs)
  const nameOf = useMemo(() => {
    const per = [res.home, res.away].map((b) => {
      const ps = b.players.map((l) => league.players[l.pid] ?? { pid: l.pid, firstName: '', lastName: l.name });
      return rosterNames(ps.length ? ps : teamPlayers(league, b.tid));
    });
    const side = new Map<number, number>();
    res.home.players.forEach((l) => side.set(l.pid, 0));
    res.away.players.forEach((l) => side.set(l.pid, 1));
    return (pid: number) => per[side.get(pid) ?? 0](pid);
  }, [league, res]);
  const scripts = useMemo(() => {
    if (!reel) return [];
    const info = (pid: number) => {
      const p = league.players[pid];
      const c = p ? composites(p.ratings) : null;
      return { pid, hgt: p?.ratings.hgt ?? 50, shoot: c?.c3 ?? 50, handle: c?.pnrHandle ?? 50 };
    };
    return reel.plays.map((p) => buildScript(p.log, info, p.before, [home.abbrev, away.abbrev], nameOf));
  }, [reel, league, home, away, nameOf]);
  // the play on the court (a fresh copy each time: the court remembers how far each one it drew got)
  const [cur, setCur] = useState<{ i: number; sc: Script } | null>(null);
  const [beat, setBeat] = useState(0);
  if (!reel || !scripts.length) return null;
  const i = cur?.i ?? null;
  const sc = cur?.sc ?? null;
  const at = (k: number) => {
    const l = reel.plays[k].log;
    return `${periodLabel(l.q)} ${fmtClock(l.clockEnd)} · ${away.abbrev} ${l.score[1]}, ${home.abbrev} ${l.score[0]}`;
  };
  const go = (k: number | null) => {
    setBeat(0);
    setCur(k === null ? null : { i: k, sc: { ...scripts[k] } });
  };
  return (
    <Card
      title={
        <h3>
          <Clapperboard size={14} style={{ verticalAlign: -2 }} /> Highlights
        </h3>
      }
      right={<span className="tiny dim">{scripts.length} plays</span>}
    >
      <div className="col" style={{ gap: 8 }}>
        <div style={{ position: 'relative', maxWidth: 520, width: '100%', margin: '0 auto' }}>
          <Court
            script={sc}
            speed={league.settings.liveSpeed || 1}
            paused={sc === null}
            colors={colors}
            jersey={(pid) => league.players[pid]?.jersey || '0'}
            onDone={() => go(i !== null && i + 1 < scripts.length ? i + 1 : null)}
            onBeat={setBeat}
            names={nameOf}
            abbrevs={[home.abbrev, away.abbrev]}
            label={sc ? `Highlight ${i! + 1} of ${scripts.length}: ${sc.label}.` : 'Highlights: press play.'}
          />
          {sc === null && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'rgba(6,8,12,0.55)' }}>
              <button className="btn primary sm" onClick={() => go(0)}>
                <Clapperboard size={15} /> Play the highlights
              </button>
            </div>
          )}
        </div>
        {sc && i !== null && (
          <>
            <div className="row small" style={{ gap: 8 }}>
              <span className="tag info" style={{ flex: 'none' }}>
                {i + 1}/{scripts.length}
              </span>
              <span className="grow">{captionAt(sc, beat)}</span>
            </div>
            <div className="row between" style={{ gap: 8 }}>
              <span className="tiny dim num">{at(i)}</span>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn xs" aria-label="Previous play" disabled={i === 0} onClick={() => go(i - 1)}>
                  <SkipBack size={14} />
                </button>
                <button className="btn xs" aria-label="Stop the highlights" onClick={() => go(null)}>
                  <Square size={14} />
                </button>
                <button className="btn xs" aria-label="Next play" disabled={i + 1 >= scripts.length} onClick={() => go(i + 1)}>
                  <SkipForward size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
