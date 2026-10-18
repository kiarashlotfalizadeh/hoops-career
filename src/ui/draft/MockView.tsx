// The mock draft, slot by slot.
import { useState } from 'react';
import type { League } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { type MockDraft, type MockSlot } from '../../core/league/mockDraft';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, Section } from '../components/ui';
import { HelpSheet, OvrPot } from '../office/common';

/** The mock draft, slot by slot: the likeliest pick and the next ones, the user's picks lit. */
export function MockView({ league, mock, onOpen }: { league: League; mock: MockDraft | null; onOpen: (pid: number) => void }) {
  const [round2, setRound2] = useState(false);
  if (!mock || !mock.slots.length) return <Empty>The mock draft starts once games are played.</Empty>;
  const projected = mock.slots[0].projected;
  const shown = mock.slots.filter((s) => round2 || s.round === 1);
  return (
    <Section
      title={projected ? 'Mock · order by record' : 'Mock · draft order'}
      right={
        <HelpSheet title="Mock draft">
          <p>
            The draft played out {mock.runs} times the way AI teams pick: potential and talent, a nudge toward what the roster lacks, and their usual unpredictability on the night.
            Your picks go to the top player left on your big board, or to your staff&apos;s choice.
          </p>
          <p>
            Each pick shows the likeliest player not already named above it and how often he was the pick there, then the next likeliest. On the big board, each prospect&apos;s
            range is where he went in four of five mocks.
          </p>
          {projected && <p>Until the lottery the order is by record: the lottery still decides the top four.</p>}
        </HelpSheet>
      }
    >
      <div className="card flush">
        <div className="list">
          {shown.map((s) => (
            <MockRow key={`${s.round}-${s.pick}`} league={league} s={s} onOpen={onOpen} />
          ))}
        </div>
        {mock.slots.some((s) => s.round === 2) && (
          <button className="btn ghost block fo-more-btn" onClick={() => setRound2(!round2)}>
            {round2 ? 'First round only' : 'Show the second round'}
          </button>
        )}
      </div>
    </Section>
  );
}

function MockRow({ league, s, onOpen }: { league: League; s: MockSlot; onOpen: (pid: number) => void }) {
  const [top, ...alts] = s.options;
  const p = top && league.players[top.pid];
  const mine = s.tid === league.userTid;
  const name = (pid: number) => {
    const x = league.players[pid];
    return x ? `${x.firstName[0]}.\u00a0${x.lastName}` : '?';
  };
  if (!p) return null;
  const via = s.orig !== s.tid ? ` · via ${league.teams[s.orig].abbrev}` : '';
  return (
    <button className={`listrow fo-sel ${mine ? 'me' : ''}`} onClick={() => onOpen(p.pid)}>
      <span className="fo-rank">{s.overall}</span>
      <TeamLogo tid={s.tid} size={28} decorative />
      <div className="grow">
        <div className="fo-name">
          <span className="dim2">{league.teams[s.tid].abbrev}</span> {playerName(p)}
        </div>
        <div className="fo-meta">
          {p.pos} · {Math.round(top.p * 100)}% of mocks{via}
        </div>
        {/* the other names on a line of their own, wrapping: at the end of the line above they were cut off */}
        {alts.length > 0 && <div className="fo-board-proj">or {alts.map((a) => `${name(a.pid)}\u00a0${Math.round(a.p * 100)}%`).join(', ')}</div>}
      </div>
      <OvrPot p={p} />
    </button>
  );
}
