// The style sheet's playbook pickers: the offensive playbooks or the defensive identities, better fits
// first, each a row to pick it by with, in a column, the staff's read against the one in use in a word
// (coachAI's fits, calibrated against the engine; the figures stay under the hood). The user's own staff
// picks the best one (StaffFor); in season it keeps the one it runs until another reads clearly better,
// and says so above the list. Its read opens one sheet: what it is, who it's for, what suits the roster
// and what works against it, what would raise it, and Use.
import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { edit } from '../../state/actions';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, type DefPreset, type OffPreset } from '../../core/sim/tactics';
import { presetMatches } from '../../core/sim/playbooks';
import { defPresetFit, defPresetTerms, fitRoster, offPresetFit, offPresetTerms, rosterProfile, staffPick } from '../../core/ai/coachAI';
import { inSeason, rosterSorted } from '../../core/league/helpers';
import { rosterNames } from '../stats';
import { FIT, leanTone } from '../../core/analysis/staffWords';
import { Sheet, Tag } from '../components/ui';
import { PresetFit } from './PresetFit';
import { bestFit, byFit, shownFit } from './fit';
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
  const cur = kind === 'off' ? t.offPreset : t.defPreset;
  const presets = useMemo(() => byFit<Preset>(kind === 'off' ? OFF_PRESETS : DEF_PRESETS, fits, cur), [kind, fits, cur]);
  const best = bestFit<Preset>(presets, fits);
  // in season the staff keeps the playbook it runs until another reads clearly better (STICK): said, not hidden
  const held = !t.manual && inSeason(league) && cur !== undefined && best.id !== cur && staffPick(fits, cur, true) === cur;
  const curName = presets.find((p) => p.id === cur)?.name;
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
      {held && <p className="small dim2 tx-held">In season the staff keeps {curName} until another fits clearly better.</p>}
      <div className="card flush list wide2 tx-presets">
        <div className="list-divider list-h tx-fith" aria-hidden="true">
          <span>Best fit first</span>
          <span>Staff&apos;s read</span>
        </div>
        {presets.map((p) => {
          const on = cur === p.id;
          const custom = isCustom(p);
          const { lean } = shownFit(p.id, terms[p.id], fits, cur);
          const tone = leanTone(lean);
          return (
            <div key={p.id} className={`tx-preset ${on ? 'on' : ''}`}>
              <button className="tx-preset-pick" aria-pressed={on} onClick={() => pick(p.id)}>
                <span className="tx-radio" aria-hidden="true" />
                <span className="grow">
                  <span className="tx-preset-n">
                    <span className="ellipsis">{p.name}</span>
                    {custom && <Tag>Custom</Tag>}
                  </span>
                  <span className={`tx-preset-t ${custom ? 'accent-text' : ''}`}>{custom ? 'Settings moved. Tap to put them back.' : p.tagline}</span>
                </span>
              </button>
              <button
                className="tx-fit"
                aria-label={on ? `About ${p.name}, in use` : `About ${p.name}, the staff's read: ${FIT[lean]}`}
                aria-haspopup="dialog"
                onClick={() => setOpen(p.id)}
              >
                {on ? <Tag>Yours</Tag> : <Tag tone={tone || undefined}>{FIT[lean]}</Tag>}
                <ChevronRight size={16} className="dim" aria-hidden="true" />
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
            <PresetFit id={sheet.id} cur={cur} curName={curName ?? 'yours'} best={best.id === sheet.id} terms={terms[sheet.id]} fits={fits} pr={prof} name={name} />
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
