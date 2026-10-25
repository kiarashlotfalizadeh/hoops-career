// The style sheet's playbook pickers: the offensive playbooks or the defensive identities, best fit for the
// roster first, each a row to pick it by with how well the team knows it (what a switch costs) and, in a
// column, the staff's read of what it's worth a game against the one in use (coachAI's fits, calibrated
// against the engine: the same unit a change is measured in once it's made). Its read or ⓘ opens one
// sheet: what it is, who it's for, the read broken into its parts, what would raise it, and Use.
import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { edit } from '../../state/actions';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, cloneTactics, type DefPreset, type OffPreset } from '../../core/sim/tactics';
import { famLabel } from '../../core/sim/familiarity';
import { systemFamiliarity } from '../../core/league/practice';
import { presetMatches } from '../../core/sim/playbooks';
import { defPresetFit, defPresetTerms, fitRoster, offPresetFit, offPresetTerms, rosterProfile } from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { rosterNames } from '../stats';
import { Sheet, Tag } from '../components/ui';
import { PresetFit } from './PresetFit';
import { byFit, fitTone, readText, shownFit } from './fit';
import { famTone } from './formation';
import '../screens/tactics.css';

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
  // how well the team knows each at this end: what a switch costs before it's drilled
  const known = useLeagueMemo(() => {
    const out: Record<string, number> = {};
    for (const p of presets) {
      const tt = cloneTactics(t);
      if (kind === 'off') tt.offense = applyOffPreset(tt.offense, p.id);
      else tt.defense = applyDefPreset(tt.defense, p.id);
      out[p.id] = systemFamiliarity(league, league.userTid, tt)[kind];
    }
    return out;
  }, [league, kind, presets, t]);
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
  return (
    <>
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
                    {custom ? 'Settings moved: tap to put them back' : p.tagline}
                    {!on && known[p.id] !== undefined && (
                      <>
                        {' · '}
                        <span className={famTone(known[p.id])}>
                          {Math.round(known[p.id])}% {famLabel(known[p.id]).toLowerCase()}
                        </span>
                      </>
                    )}
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
