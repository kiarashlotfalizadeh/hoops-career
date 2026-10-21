// God mode's new player: a name (or a random one), position, age, height, OVR and development, and
// where he starts (free agency or a team). His page opens once he's made.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Player, Pos } from '../../core/types';
import { FREE_AGENT, POSITIONS } from '../../core/types';
import { checkNewPlayer, createPlayer, type NewPlayer } from '../../core/league/godMode';
import { playerName } from '../../core/league/helpers';
import { useLeague, useStore } from '../../state/store';
import { Chips, Sheet, Slider } from '../components/ui';
import { Field, Foot, HEIGHTS, Select, applyEdit, teamOptions, useEditBlock, whole } from './common';

export function CreatePlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Create a player">
      {open && <Form onClose={onClose} />}
    </Sheet>
  );
}

function Form({ onClose }: { onClose: () => void }) {
  const league = useLeague();
  const nav = useNavigate();
  const block = useEditBlock(league);
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [pos, setPos] = useState<Pos | 'auto'>('auto');
  const [age, setAge] = useState('22');
  const [heightIn, setHeight] = useState(79);
  const [ovr, setOvr] = useState(75);
  const [growth, setGrowth] = useState(0);
  const [tid, setTid] = useState(FREE_AGENT);
  const o: NewPlayer = { firstName, lastName, age: whole(age), heightIn, ovr, growth, tid, ...(pos === 'auto' ? {} : { pos }) };
  const check = checkNewPlayer(league, o);
  const create = () => {
    const made: { p?: Player } = {};
    if (!applyEdit((l) => void (made.p = createPlayer(l, o))) || !made.p) return;
    useStore.getState().toast(`${playerName(made.p)} is in the league.`, 'good');
    onClose();
    nav(`/player/${made.p.pid}`);
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="god-grid">
        <Field label="First name">
          <input className="input" value={firstName} maxLength={30} placeholder="Random" onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className="input" value={lastName} maxLength={30} placeholder="Random" onChange={(e) => setLast(e.target.value)} />
        </Field>
        <Field label="Age">
          <input className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
        </Field>
        <Select label="Height" value={heightIn} options={HEIGHTS} onChange={setHeight} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="over">Position</span>
        <Chips label="Position" value={pos} options={[{ id: 'auto' as const, label: 'From his skills' }, ...POSITIONS.map((id) => ({ id, label: id }))]} onChange={setPos} />
      </div>
      <Slider label="OVR" min={40} max={99} value={ovr} onChange={setOvr} />
      <Slider
        label="Development"
        min={-1}
        max={1}
        step={0.05}
        value={growth}
        onChange={setGrowth}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
        left="Slow"
        right="Fast"
        help="How good his summers will be (most through 25), and his potential before 26."
      />
      <Select label="Starts with" value={tid} options={teamOptions(league)} onChange={setTid} />
      <div className="tiny dim">{tid === FREE_AGENT ? 'A free agent at his asking price, for anyone to sign.' : 'He joins on his asking deal.'}</div>
      <Foot check={check} block={block} onCancel={onClose} onSave={create} saveLabel="Create" />
    </div>
  );
}
