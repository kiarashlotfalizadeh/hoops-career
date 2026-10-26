// The style sheet's playbook pickers: the offensive playbooks or the defensive identities, best fit for the
// roster first, each a row to pick it by with how well the team knows its least-known part (the coverage,
// the scheme, the shape..., as the staff's familiarity card names it) and, in a column, the staff's read of
// what it's worth a game against the one in use (coachAI's fits, calibrated against the engine: the same
// unit a change is measured in once it's made). The user's own staff picks the top one (StaffFor); in
// season it keeps the one it runs until another reads STICK better, and says so above the list. Its read
// or ⓘ opens one sheet: what it is, who it's for, the read broken into its parts, what would raise it,
// what learning it costs (measured), and Use.
import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { edit } from '../../state/actions';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, cloneTactics, type DefPreset, type OffPreset } from '../../core/sim/tactics';
import { FAM_DIMS, FLUID, famLabel, type FamDim } from '../../core/sim/familiarity';
import { systemFamiliarity } from '../../core/league/practice';
import { presetMatches } from '../../core/sim/playbooks';
import { STICK, defPresetFit, defPresetTerms, fitRoster, offPresetFit, offPresetTerms, rosterProfile, staffPick } from '../../core/ai/coachAI';
import { inSeason, rosterSorted } from '../../core/league/helpers';
import { rosterNames } from '../stats';
import { Sheet, Tag } from '../components/ui';
import { PresetFit } from './PresetFit';
import { byFit, fitTone, readText, shownFit } from './fit';
import type { Tactics } from '../../core/types';
import { famTone } from './formation';
import { learnText, useLearnCost } from './learnCost';
import '../screens/tactics.css';

/** Each end's parts a playbook sets (its players' roles are the staff's, whichever it is). */
const PARTS = { off: FAM_DIMS.filter((d) => d.end === 'off' && d.id !== 'roles'), def: FAM_DIMS.filter((d) => d.end === 'def') };
/** A part's name in a row ("Coverage 45%"), as Analysis → Familiarity names it, cut to a word. */
const PART_SHORT: Record<FamDim, string> = { shape: 'Shape', actions: 'Actions', tempo: 'Tempo', roles: 'Roles', scheme: 'Scheme', coverage: 'Coverage', pressure: 'Pressure' };

/** The tactics with preset `id` loaded at end `kind` (a copy). */
function withPreset(t: Tactics, kind: 'off' | 'def', id: string): Tactics {
  const tt = cloneTactics(t);
  if (kind === 'off') tt.offense = applyOffPreset(tt.offense, id);
  else tt.defense = applyDefPreset(tt.defense, id);
  return tt;
}

type Preset = OffPreset | DefPreset;

/** The offensive or defensive presets, each with its fit; its fit or ⓘ explains it. */
export function PresetPicker({ kind }: { kind: 'off' | 'def' }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  // the roster as the assistant judges it (rankedPresets): a knock of five games or fewer doesn't swing the fits
  const healthy = useMemo(() => fitRoster(players), [players]);
  const prof = useMemo(() => rosterProfile(healthy), [healthy]);
  const terms = useMemo(() => (kind === 'off' ? offPresetTerms(prof) : defPresetTerms(prof)), [prof, kind]);
  const fits = useMemo(() => (kind === 'off' ? offPresetFit(prof) : defPresetFit(prof)), [prof, kind]);
  const name = useMemo(() => rosterNames(healthy, { initial: true }), [healthy]);
  const [open, setOpen] = useState<string | null>(null);
  const presets = useMemo(() => byFit<Preset>(kind === 'off' ? OFF_PRESETS : DEF_PRESETS, fits), [kind, fits]);
  const cur = kind === 'off' ? t.offPreset : t.defPreset;
  // how well the team knows each one's least-known part at this end (the staff's card names the same
  // part when it's new to them): what a switch is played a step slow in until it's drilled
  // (none before training camp: camp drills whichever the team plays, and the sheet says so)
  const known = useLeagueMemo(() => {
    const out: Record<string, { id: FamDim; v: number }> = {};
    if (!league.teams[league.userTid].fam) return out;
    for (const p of presets) {
      const dims = systemFamiliarity(league, league.userTid, withPreset(t, kind, p.id)).dims;
      const w = PARTS[kind].reduce((a, d) => (dims[d.id] < dims[a.id] ? d : a));
      out[p.id] = { id: w.id, v: dims[w.id] };
    }
    return out;
  }, [league, kind, presets, t]);
  // in season the staff keeps the playbook it runs until another reads clearly better (STICK): said, not hidden
  const top = presets[0]?.id;
  const held = !t.manual && inSeason(league) && cur !== undefined && top !== cur && staffPick(fits, cur, true) === cur ? presets[0] : null;
  const pick = (id: string) =>
    edit((l) => {
      const tt = l.teams[l.userTid].tactics;
      if (kind === 'off') {
        tt.offense = applyOffPreset(tt.offense, id);
        tt.offPreset = id;
      } else {
        tt.defense = applyDefPreset(tt.defense, id);
        tt.defPreset = id;
      }
      tt.manual = true;
    });
  // the settings have moved since this preset was picked: picking it again puts them back
  const isCustom = (p: Preset) => cur === p.id && !presetMatches(kind === 'off' ? t.offense : t.defense, p);
  const sheet = presets.find((p) => p.id === open);
  const sheetOn = sheet?.id === cur;
  const sheetCustom = !!sheet && isCustom(sheet);
  // what learning the one in the sheet costs, measured on the next game
  const sheetWant = useMemo(() => (sheet && !sheetOn ? withPreset(t, kind, sheet.id) : null), [sheet, sheetOn, t, kind]);
  const learn = useLearnCost(t, sheetWant);
  const learnLine = learn ? learnText(learn) : '';
  return (
    <>
      {held && (
        <p className="small dim2 tx-held">
          The staff keeps {presets.find((p) => p.id === cur)?.name} while the team knows it: in season they change once another reads {readText(STICK.preset / 10)} a game better (
          {held.name}: {readText(shownFit(held.id, terms[held.id], fits, cur!).vs)}).
        </p>
      )}
      <div className="card flush list wide2 tx-presets">
        <div className="list-divider list-h tx-fith" aria-hidden="true">
          <span>Best for your roster first</span>
          <span>Staff&apos;s read, a game</span>
        </div>
        {presets.map((p) => {
          const on = cur === p.id;
          const custom = isCustom(p);
          const v = shownFit(p.id, terms[p.id], fits, cur).vs;
          return (
            <div key={p.id} className={`tx-preset ${on ? 'on' : ''}`}>
              <button className="tx-preset-pick" aria-pressed={on} onClick={() => pick(p.id)}>
                <span className="tx-radio" aria-hidden="true" />
                <span className="grow">
                  <span className="tx-preset-n">
                    <span className="ellipsis">{p.name}</span>
                    {custom && <Tag>Custom</Tag>}
                  </span>
                  <span className={`tx-preset-t ${custom ? 'accent-text' : ''}`}>
                    {/* (how well it's known first: a long tagline is cut short, not the figure) */}
                    {!on && known[p.id] && (
                      <>
                        <span className={famTone(known[p.id].v)}>
                          {known[p.id].v >= FLUID ? famLabel(known[p.id].v) : `${PART_SHORT[known[p.id].id]} ${Math.round(known[p.id].v)}%`}
                        </span>
                        {' · '}
                      </>
                    )}
                    {custom ? 'Settings moved: tap to put them back' : p.tagline}
                  </span>
                </span>
              </button>
              <button
                className="tx-fit"
                aria-label={on ? `${p.name} is in use: why` : `The staff's read: ${readText(v)} a game against yours: why, for ${p.name}`}
                aria-haspopup="dialog"
                onClick={() => setOpen(p.id)}
              >
                <span className={`tx-fitv tx-read ${on ? '' : fitTone(v)}`}>{on ? 'Yours' : readText(v)}</span>
              </button>
              <button className="iconbtn tx-about" aria-label={`About ${p.name}`} aria-haspopup="dialog" onClick={() => setOpen(p.id)}>
                <Info size={18} />
              </button>
            </div>
          );
        })}
      </div>
      <Sheet open={!!sheet} onClose={() => setOpen(null)} title={sheet?.name}>
        {sheet && (
          <div className="col tx-about-body">
            <p className="tx-lead sm">{sheet.tagline}</p>
            <p>{sheet.description}</p>
            <div className="tx-dl">
              <span className="over">Best for</span>
              <span>{sheet.bestFor}</span>
            </div>
            <PresetFit id={sheet.id} cur={cur} presets={presets} terms={terms[sheet.id]} fits={fits} pr={prof} name={name} kind={kind} />
            {learnLine && (
              <p className="small dim2">
                {learnLine}
                {learn?.worth || learn?.skip ? '.' : ''}
              </p>
            )}
            <button
              className="btn primary block"
              disabled={sheetOn && !sheetCustom}
              onClick={() => {
                pick(sheet.id);
                setOpen(null);
              }}
            >
              {sheetOn ? (sheetCustom ? 'Put its settings back' : 'In use') : `Use ${sheet.name}`}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
