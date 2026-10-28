// God mode's player editor: his ratings (with the OVR, potential and archetype they'd give him),
// bio, health and team, and his contract, in one sheet. Only what changed is saved, whole or
// not at all; what would stop it, or what rule it bends, shows above Save.
import { useState } from 'react';
import type { League, Player, Pos, RatingKey, Ratings } from '../../core/types';
import { POSITIONS, RETIRED } from '../../core/types';
import { RATING_META, archetype, attrDisplay, heightToRating, ovrRaw, potential, shiftToOvr, toDisplay } from '../../core/ratings';
import { clamp } from '../../core/random';
import { seasonLabel } from '../../core/constants';
import { contractSeason, playerName } from '../../core/league/helpers';
import { askingContract } from '../../core/league/contracts';
import { INJURY_TYPES } from '../../core/league/injuries';
import { checkPlayerEdit, editPlayer, movable, yearsLeft, type ContractEdit, type PlayerEdit } from '../../core/league/godMode';
import { contractExp, playerAge, salaryFor } from '../../core/playerGen';
import { useLeague, useStore } from '../../state/store';
import { Chips, Ovr, Segmented, Sheet, Slider, Toggle } from '../components/ui';

import { Field, Foot, HEIGHTS, Select, applyEdit, teamOptions, useEditBlock, whole } from './common';
import { money } from '../../core/format';
import { RATING_COLOR, ratingTone } from '../ratingCols';

type Tab = 'ratings' | 'bio' | 'status' | 'contract';
const GROUPS = ['Physical', 'Scoring', 'Playmaking', 'Defense', 'Rebounding'] as const;

/** The stored 0-100 value an attribute shown on the 40-99 scale stands for (see attrDisplay). */
const fromDisplay = (d: number) => Math.round(((d - 40) / 0.59) * 10) / 10;
/** The lowest an attribute shows: ratings are stored 1-100, and 1 reads 41. */
const ATTR_MIN = attrDisplay(1);
const signed = (v: number, d = 0) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;
/** Whether he has a deal for the contract season: it goes with him if he moves, as in a trade (without one, a team he joins signs him to his asking deal). */
const underContract = (league: League, p: Player) => p.tid >= 0 && salaryFor(p, contractSeason(league)) > 0;

interface Form {
  firstName: string;
  lastName: string;
  pos: Pos;
  jersey: string;
  age: string;
  heightIn: number;
  weightLb: string;
  country: string;
  college: string;
  ratings: Ratings;
  growth: number;
  injuryProne: number;
  wear: number;
  injury: { type: string; games: string } | null;
  tid: number;
  /** $M, as typed. */
  amount: string;
  years: number;
  option: 'none' | 'player' | 'team';
  twoWay: boolean;
  /** The contract fields the user changed: the rest stay as they are (a free agent who joins a team signs his asking deal). */
  touched: Partial<Record<keyof ContractEdit, true>>;
}

export function formOf(league: League, p: Player): Form {
  const cs = contractSeason(league);
  const ask = salaryFor(p, cs) > 0 ? null : askingContract(league, p);
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    pos: p.pos,
    jersey: p.jersey,
    age: String(playerAge(p, league.season)),
    heightIn: p.heightIn,
    weightLb: String(p.weightLb),
    country: p.country,
    college: p.college,
    ratings: { ...p.ratings },
    growth: p.growth,
    injuryProne: p.injuryProne,
    wear: p.wear,
    injury: p.injury ? { type: p.injury.type, games: String(p.injury.gamesRemaining) } : null,
    tid: p.tid,
    amount: ((ask?.amount ?? salaryFor(p, cs)) / 1000).toFixed(1),
    years: ask?.years ?? Math.max(1, yearsLeft(league, p)),
    option: p.contract.option ?? 'none',
    twoWay: !!p.contract.twoWay,
    touched: {},
  };
}

const moved = (a: number, b: number) => Math.abs(a - b) > 1e-6;

/**
 * The edit: only what differs from the form as it opened, `base` (a field that doesn't parse goes
 * in, for the checks to name). Not from him as he is now: a sim running while the sheet is open
 * moves his wear, health or team, and saving mustn't put those back.
 */
export function editOf(base: Form, f: Form): PlayerEdit {
  const e: PlayerEdit = {};
  if (f.firstName.trim() !== base.firstName) e.firstName = f.firstName;
  if (f.lastName.trim() !== base.lastName) e.lastName = f.lastName;
  if (f.country.trim() !== base.country) e.country = f.country;
  if (f.college.trim() !== base.college) e.college = f.college;
  if (f.pos !== base.pos) e.pos = f.pos;
  if (f.jersey.trim() !== base.jersey) e.jersey = f.jersey.trim();
  if (f.age.trim() !== base.age) e.age = whole(f.age);
  if (f.heightIn !== base.heightIn) e.heightIn = f.heightIn;
  if (f.weightLb.trim() !== base.weightLb) e.weightLb = whole(f.weightLb);
  const r = Object.fromEntries(RATING_META.filter((m) => moved(f.ratings[m.key], base.ratings[m.key])).map((m) => [m.key, f.ratings[m.key]]));
  if (Object.keys(r).length) e.ratings = r;
  if (moved(f.growth, base.growth)) e.growth = f.growth;
  if (moved(f.injuryProne, base.injuryProne)) e.injuryProne = f.injuryProne;
  if (moved(f.wear, base.wear)) e.wear = f.wear;
  const hurt = (x: Form['injury']) => (x ? `${x.type}|${x.games.trim()}` : '');
  if (hurt(f.injury) !== hurt(base.injury)) e.injury = f.injury && { type: f.injury.type, games: whole(f.injury.games) };
  if (f.tid !== base.tid) e.tid = f.tid;
  if (f.tid >= 0) {
    const c: ContractEdit = {};
    // $M as typed to $K in $10K steps (an empty or unreadable amount is NaN: the checks say so)
    if (f.touched.amount) c.amount = f.amount.trim() ? Math.round(Number(f.amount) * 100) * 10 : NaN;
    // a new salary runs for the seasons shown (left to itself, a deal that's up would get one)
    if (f.touched.years || f.touched.amount) c.years = f.years;
    if (f.touched.option) c.option = f.option === 'none' ? null : f.option;
    if (f.touched.twoWay) c.twoWay = f.twoWay;
    if (Object.keys(c).length) e.contract = c;
  }
  return e;
}

/** The editor for one player, in its own sheet; closed when `pid` is null. */
export function PlayerEditor({ pid, onClose }: { pid: number | null; onClose: () => void }) {
  const league = useLeague();
  const p = pid !== null ? league.players[pid] : undefined;
  return (
    <Sheet open={!!p} onClose={onClose} title={p ? 'Edit player' : undefined}>
      {p && <Editor key={p.pid} league={league} p={p} onClose={onClose} />}
    </Sheet>
  );
}

function Editor({ league, p, onClose }: { league: League; p: Player; onClose: () => void }) {
  const [base] = useState(() => formOf(league, p));
  const [f, setF] = useState(base);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const tabs: Tab[] = movable(p) ? ['ratings', 'bio', 'status', 'contract'] : p.tid === RETIRED ? ['bio'] : ['ratings', 'bio'];
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const block = useEditBlock(league);
  const edit = editOf(base, f);
  const check = checkPlayerEdit(league, p, edit);
  // what the new ratings make him
  const ovr = toDisplay(ovrRaw(f.ratings), league.ovrScale);
  const age = whole(f.age);
  const pot = potential(ovr, Number.isFinite(age) ? age : playerAge(p, league.season), f.growth);
  const save = () => {
    if (!applyEdit((l) => editPlayer(l, p.pid, edit))) return;
    useStore.getState().toast(`${playerName(p)} is saved.`, 'good');
    onClose();
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="god-preview">
        <Ovr v={ovr} size="lg" />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis">
            {f.firstName.trim() || p.firstName} {f.lastName.trim() || p.lastName}
          </div>
          <div className="small dim2">
            POT {pot} · {archetype(f.ratings).label}
          </div>
          {(ovr !== p.ovr || pot !== p.pot) && (
            <div className="tiny dim">
              Now {p.ovr} OVR · POT {p.pot}
            </div>
          )}
        </div>
      </div>
      {tabs.length > 1 && (
        <Segmented
          label="Edit"
          value={tab}
          onChange={setTab}
          options={tabs.map((id) => ({ id, label: { ratings: 'Ratings', bio: 'Bio', status: 'Status', contract: 'Contract' }[id] }))}
        />
      )}
      {tab === 'ratings' && <RatingsTab league={league} f={f} set={set} was={base.ratings} ovr={ovr} pot={pot} />}
      {tab === 'bio' && <BioTab f={f} set={set} />}
      {tab === 'status' && <StatusTab league={league} p={p} f={f} set={set} />}
      {tab === 'contract' && <ContractTab league={league} p={p} f={f} set={set} />}
      <Foot check={check} block={block} onCancel={onClose} onSave={save} dirty={Object.keys(edit).length > 0} />
    </div>
  );
}

type TabProps = { f: Form; set: (patch: Partial<Form>) => void };

function RatingsTab({ league, f, set, was, ovr, pot }: TabProps & { league: League; was: Ratings; ovr: number; pot: number }) {
  const [target, setTarget] = useState(ovr);
  // dragged back to the value it showed, a rating is his exact one again (not the scale's step), so nothing changes
  const rate = (k: RatingKey, d: number) => set({ ratings: { ...f.ratings, [k]: d === attrDisplay(was[k]) ? was[k] : clamp(fromDisplay(d), 1, 100) } });
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
        <div className="grow">
          <Slider label="Set OVR" min={40} max={99} value={target} onChange={setTarget} />
        </div>
        <button className="btn sm" disabled={target === ovr} onClick={() => set({ ratings: shiftToOvr(f.ratings, target, league.ovrScale) })}>
          Apply
        </button>
      </div>
      <div className="tiny dim" style={{ marginTop: -8 }}>
        Moves all his skills together until he's a {target}; his size and athleticism stay as they are.
      </div>
      <Slider
        label="Development"
        min={-1}
        max={1}
        step={0.05}
        value={f.growth}
        onChange={(growth) => set({ growth })}
        format={(v) => `${signed(v, 2)} · POT ${pot}`}
        left="Slow"
        right="Fast"
        help="How good his summers are on average (most through 25), and his potential before 26."
      />
      {GROUPS.map((g) => (
        <div key={g} className="col" style={{ gap: 10 }}>
          <div className="over god-sec">{g}</div>
          <div className="god-sliders">
            {RATING_META.filter((m) => m.group === g).map((m) => {
              const v = attrDisplay(f.ratings[m.key]);
              // (the value in its rating band's colour, as in every ratings table)
              return (
                <div key={m.key} className="god-rating" style={{ ['--rating' as string]: RATING_COLOR[ratingTone(v)] }}>
                  <Slider label={m.label} min={ATTR_MIN} max={99} value={v} onChange={(d) => rate(m.key, d)} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BioTab({ f, set }: TabProps) {
  // his size rating moves with his height, as it was drawn from it
  const height = (heightIn: number) => set({ heightIn, ratings: { ...f.ratings, hgt: clamp(f.ratings.hgt + heightToRating(heightIn) - heightToRating(f.heightIn), 1, 100) } });
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="god-grid">
        <Field label="First name">
          <input className="input" value={f.firstName} maxLength={30} onChange={(e) => set({ firstName: e.target.value })} />
        </Field>
        <Field label="Last name">
          <input className="input" value={f.lastName} maxLength={30} onChange={(e) => set({ lastName: e.target.value })} />
        </Field>
        <Field label="Age">
          <input className="input" inputMode="numeric" value={f.age} onChange={(e) => set({ age: e.target.value })} />
        </Field>
        {f.tid >= 0 ? (
          <Field label="Jersey">
            <input className="input" inputMode="numeric" value={f.jersey} maxLength={2} onChange={(e) => set({ jersey: e.target.value })} />
          </Field>
        ) : (
          <span />
        )}
        <Select label="Height" value={f.heightIn} options={HEIGHTS} onChange={height} />
        <Field label="Weight (lb)">
          <input className="input" inputMode="numeric" value={f.weightLb} onChange={(e) => set({ weightLb: e.target.value })} />
        </Field>
        <Field label="Country">
          <input className="input" value={f.country} maxLength={30} onChange={(e) => set({ country: e.target.value })} />
        </Field>
        <Field label="College">
          <input className="input" value={f.college} maxLength={60} onChange={(e) => set({ college: e.target.value })} />
        </Field>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="over">Position</span>
        <Chips label="Position" value={f.pos} options={POSITIONS.map((id) => ({ id, label: id }))} onChange={(pos) => set({ pos })} />
      </div>
      <div className="tiny dim">A new height moves his size rating with it.</div>
    </div>
  );
}

function StatusTab({ league, p, f, set }: TabProps & { league: League; p: Player }) {
  const types = INJURY_TYPES.map((t) => ({ id: t.name, label: t.name }));
  if (f.injury && !types.some((t) => t.id === f.injury!.type)) types.unshift({ id: f.injury.type, label: f.injury.type });
  const joining = f.tid >= 0 && f.tid !== p.tid;
  const hasDeal = underContract(league, p);
  return (
    <div className="col" style={{ gap: 14 }}>
      <Select label="Team" value={f.tid} options={teamOptions(league)} onChange={(tid) => set({ tid })} />
      {joining && !hasDeal && !f.touched.amount && !f.touched.years && <div className="tiny dim">He signs his asking deal with them (see Contract to set another).</div>}
      {joining && hasDeal && <div className="tiny dim">His contract goes with him, as in a trade; nothing stays on the books of the team he leaves.</div>}
      {f.tid < 0 && p.tid >= 0 && <div className="tiny dim">Released to free agency with no dead money left behind.</div>}
      <div className="divider" />
      {f.injury ? (
        <div className="col" style={{ gap: 8 }}>
          <div className="god-grid">
            <Select label="Injury" value={f.injury.type} options={types} onChange={(type) => set({ injury: { ...f.injury!, type } })} />
            <Field label="Games out">
              <input className="input" inputMode="numeric" value={f.injury.games} onChange={(e) => set({ injury: { ...f.injury!, games: e.target.value } })} />
            </Field>
          </div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ injury: null })}>
            Heal him
          </button>
        </div>
      ) : (
        <div className="row between" style={{ gap: 10 }}>
          <span className="small dim2">Healthy.</span>
          <button className="btn sm" onClick={() => set({ injury: { type: INJURY_TYPES[0].name, games: '5' } })}>
            Injure him
          </button>
        </div>
      )}
      <Slider label="Wear" min={0} max={100} value={f.wear} onChange={(wear) => set({ wear })} format={(v) => String(Math.round(v))} left="Fresh" right="Worn down" />
      <Slider
        label="Injury proneness"
        min={0}
        max={100}
        value={Math.round(f.injuryProne * 100)}
        onChange={(v) => set({ injuryProne: v / 100 })}
        format={(v) => `${Math.round(v)}%`}
        left="Durable"
        right="Fragile"
      />
    </div>
  );
}

function ContractTab({ league, p, f, set }: TabProps & { league: League; p: Player }) {
  if (f.tid < 0) return <div className="empty">A free agent has no contract: he signs one when he joins a team.</div>;
  const cs = contractSeason(league);
  const hasDeal = underContract(league, p);
  // joining a team without a deal, he signs what he asks of that team (its appeal counts): that's the salary shown until one is typed
  const ask = !hasDeal && f.tid !== p.tid ? askingContract(league, p, f.tid) : null;
  const amount = ask && !f.touched.amount ? (ask.amount / 1000).toFixed(1) : f.amount;
  const touch = (k: keyof ContractEdit, patch: Partial<Form>) => set({ ...patch, touched: { ...f.touched, [k]: true } });
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="small dim2">
        {hasDeal
          ? `Now ${money(salaryFor(p, cs))} in ${seasonLabel(cs)}, signed through ${seasonLabel(contractExp(p.contract))}${p.contract.option ? ` (${p.contract.option} option)` : ''}.`
          : ask
            ? 'He signs his asking deal unless you set one here.'
            : `His deal is up: set one here to sign him from ${seasonLabel(cs)}.`}
      </div>
      <Field label={`Salary in ${seasonLabel(cs)} ($M)`} hint="Later seasons get 5% raises; seasons already under way keep what they paid.">
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => touch('amount', { amount: e.target.value })} />
      </Field>
      <div className="col" style={{ gap: 6 }}>
        <span className="over">Seasons</span>
        {/* a one-season deal can't carry an option: it goes, and stays gone if the deal is made longer again */}
        <Chips
          label="Seasons"
          value={f.years}
          options={[1, 2, 3, 4, 5].map((id) => ({ id, label: String(id) }))}
          onChange={(years) => set(years < 2 ? { years, option: 'none', touched: { ...f.touched, years: true, option: true } } : { years, touched: { ...f.touched, years: true } })}
        />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span className="over">Option on the last season</span>
        <Chips
          label="Option on the last season"
          disabled={f.years < 2}
          value={f.option}
          options={[
            { id: 'none', label: 'None' },
            { id: 'player', label: 'Player' },
            { id: 'team', label: 'Team' },
          ]}
          onChange={(option) => touch('option', { option })}
        />
        {f.years < 2 && <span className="tiny dim">A one-season deal has no option.</span>}
      </div>
      <Toggle
        on={f.twoWay}
        onChange={(twoWay) => touch('twoWay', { twoWay })}
        label="Two-way contract"
        help="Outside the 15 roster spots and the cap and tax; each team has three two-way slots."
      />
    </div>
  );
}
