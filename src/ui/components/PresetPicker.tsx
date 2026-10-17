// The Tactics screen's playbook pickers: each preset as a row with its fit for the roster and its
// hook, the description and what it's best for in a sheet, and behind the fit score, "Why fit 72":
// the pluses and minuses it is made of, the players behind them, and what would raise it.
import { useMemo, useState } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, type DefPreset, type OffPreset } from '../../core/sim/tactics';
import { presetMatches } from '../../core/sim/playbooks';
import {
  defPresetFit,
  defPresetTerms,
  fitRoster,
  fitScale,
  offPresetFit,
  offPresetTerms,
  rosterProfile,
  type FitTerm,
  type ProfileKey,
  type RosterProfile,
} from '../../core/ai/coachAI';
import { rosterSorted } from '../../core/league/helpers';
import { rosterNames } from '../stats';
import { Sheet, Statline, Tag } from './ui';
import '../screens/tactics.css';

function FitTag({ v }: { v: number }) {
  const tone = v >= 88 ? 'good' : v >= 70 ? 'info' : v >= 58 ? 'warn' : 'bad';
  return <Tag tone={tone}>Fit {v}</Tag>;
}

/** Each roster quality as the fit explanation names it, and what having more of it means. */
const QUALITY: Record<ProfileKey, { label: string; more: string }> = {
  starCreator: { label: 'Lead creator', more: 'A better lead creator' },
  creatorGap: { label: 'A clear first option', more: 'A clearer first option over the second creator' },
  shooting: { label: 'Shooting', more: 'More shooting in the top eight' },
  passing: { label: 'Passing', more: 'Better passing in the top eight' },
  bigPassing: { label: 'Passing big', more: 'A big who passes better' },
  postScoring: { label: 'Post scoring', more: 'A better post scorer' },
  rimProtection: { label: 'Rim protection', more: 'A better rim protector' },
  athleticism: { label: 'Speed and athleticism', more: 'More speed and athleticism in the top eight' },
  size: { label: 'Size', more: 'More size in the top eight' },
  perimeterD: { label: 'Perimeter defense', more: 'Better perimeter defenders' },
  depth: { label: 'Depth', more: 'A better 8th man' },
  steals: { label: 'Quick hands', more: 'Quicker hands in the top eight' },
  bigMobility: { label: 'A mobile big', more: 'A quicker big' },
};

/** Qualities that are the top eight's average (the rest are the best one player brings). */
const AVERAGES = new Set<ProfileKey>(['shooting', 'passing', 'athleticism', 'size', 'perimeterD', 'steals']);

/** Who is behind a term: the best (or weakest) at it, as the term goes. */
function behind(t: FitTerm, pr: RosterProfile, name: (pid: number) => string): string {
  if (t.key === 'base') return '';
  const d = pr.drivers[t.key];
  if (!d.length) return t.key === 'bigPassing' || t.key === 'bigMobility' ? 'no big in the top eight' : '';
  // the quality is above the level this playbook wants when its term points the same way as its weight
  const high = t.value > 0 === t.weight > 0;
  if (t.key === 'creatorGap') return d.length > 1 ? `${name(d[0])} ahead of ${name(d[1])}` : name(d[0]);
  if (t.key === 'depth') return `8th man: ${name(d[0])}`;
  if (AVERAGES.has(t.key)) return high ? `best: ${d.slice(0, 2).map(name).join(', ')}` : `weakest: ${d.slice(-2).reverse().map(name).join(', ')}`;
  return high ? name(d[0]) : `best you have: ${name(d[0])}`;
}

function FitWhy({
  id,
  presets,
  terms,
  fits,
  pr,
  name,
}: {
  id: string;
  presets: (OffPreset | DefPreset)[];
  terms: FitTerm[];
  fits: Record<string, number>;
  pr: RosterProfile;
  name: (pid: number) => string;
}) {
  const shown = fitScale(fits);
  const ranked = Object.entries(fits).sort((a, b) => b[1] - a[1]);
  const label = (k: string) => presets.find((p) => p.id === k)?.name ?? k;
  const base = terms.find((t) => t.key === 'base');
  const parts = terms.filter((t) => t.key !== 'base' && Math.abs(t.value) >= 0.05);
  const plus = parts.filter((t) => t.value > 0).sort((a, b) => b.value - a.value);
  const minus = parts.filter((t) => t.value < 0).sort((a, b) => a.value - b.value);
  const best = ranked[0][0] === id;
  const least = ranked[ranked.length - 1];
  // what raises it: more of a quality this playbook rewards, in shown fit for five points more
  const levers = terms
    .filter((t) => t.key !== 'base' && t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((t) => ({ t, gain: fitScale({ ...fits, [id]: fits[id] + 5 * t.weight })(id) - shown(id) }));
  const row = (t: FitTerm) => {
    const who = behind(t, pr, name);
    return (
      <div key={t.key} className="tx-term">
        <span className={`tx-term-v num ${t.value > 0 ? 'good' : 'bad'}`}>
          {t.value > 0 ? '+' : '−'}
          {Math.abs(t.value).toFixed(1)}
        </span>
        <span className="grow">
          <span className="tx-term-l">{t.key === 'base' ? 'Starting score' : QUALITY[t.key].label}</span>
          {who && <span className="tx-term-s">{who}</span>}
        </span>
      </div>
    );
  };
  return (
    <div className="col tx-why">
      <div className="card tx-why-fig">
        <Statline
          items={[
            { k: 'Fit points', v: fits[id].toFixed(1), s: base ? `from a starting ${base.value}` : label(id) },
            { k: 'Best', v: ranked[0][1].toFixed(1), s: label(ranked[0][0]) },
            { k: 'Least', v: least[1].toFixed(1), s: label(least[0]) },
          ]}
        />
      </div>
      <div className="small dim2">
        Fit ranks the playbooks against each other for your roster: the best shows as 100, the least as 45. <b>{label(id)}</b> shows as {shown(id)}.
      </div>
      {!parts.length && <div className="small">It doesn&apos;t lean on any one quality, so it scores the same for every roster.</div>}
      {plus.length > 0 && (
        <div className="tx-terms">
          <div className="over">Pluses</div>
          {plus.map(row)}
        </div>
      )}
      {minus.length > 0 && (
        <div className="tx-terms">
          <div className="over">Minuses</div>
          {minus.map(row)}
        </div>
      )}
      {levers.length > 0 && (
        <div className="tx-terms">
          <div className="over">What would raise it</div>
          {best ? (
            <div className="small dim2">Nothing needs to: it is already the best fit for this roster.</div>
          ) : (
            levers.map(({ t, gain }) => (
              <div key={t.key} className="tx-term">
                <span className="grow tx-term-l">{QUALITY[t.key as ProfileKey].more}</span>
                <span className="tiny dim num nowrap">{gain > 0 ? `+${gain} fit per 5 points` : 'little change'}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** The offensive or defensive presets, each with its fit; tapping a fit explains it. */
export function PresetPicker({ kind }: { kind: 'off' | 'def' }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const players = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  // the roster as the assistant judges it (rankedPresets): a knock of five games or fewer doesn't swing the fits
  const healthy = useMemo(() => fitRoster(players), [players]);
  const prof = useMemo(() => rosterProfile(healthy), [healthy]);
  const terms = useMemo(() => (kind === 'off' ? offPresetTerms(prof) : defPresetTerms(prof)), [prof, kind]);
  const fits = useMemo(() => (kind === 'off' ? offPresetFit(prof) : defPresetFit(prof)), [prof, kind]);
  const shown = useMemo(() => fitScale(fits), [fits]);
  const name = useMemo(() => rosterNames(healthy, { initial: true }), [healthy]);
  const [why, setWhy] = useState<string | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const presets: (OffPreset | DefPreset)[] = kind === 'off' ? OFF_PRESETS : DEF_PRESETS;
  const cur = kind === 'off' ? t.offPreset : t.defPreset;
  const pick = (id: string) =>
    useStore.getState().mutate((l) => {
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
  const isCustom = (p: OffPreset | DefPreset) => cur === p.id && !presetMatches(kind === 'off' ? t.offense : t.defense, p);
  const whyPreset = presets.find((p) => p.id === why);
  const aboutPreset = presets.find((p) => p.id === about);
  const aboutOn = aboutPreset?.id === cur;
  const aboutCustom = !!aboutPreset && isCustom(aboutPreset);
  return (
    <>
      <div className="card flush list wide2 tx-presets">
        {presets.map((p) => {
          const on = cur === p.id;
          const custom = isCustom(p);
          return (
            <div key={p.id} className={`tx-preset ${on ? 'on' : ''}`}>
              <button className="tx-preset-pick" aria-pressed={on} onClick={() => pick(p.id)}>
                <span className="tx-radio" aria-hidden="true" />
                <span className="grow">
                  <span className="tx-preset-n">
                    <span className="ellipsis">{p.name}</span>
                    {custom && <Tag>Custom</Tag>}
                  </span>
                  <span className={`tx-preset-t ${custom ? 'accent-text' : ''}`}>{custom ? 'Settings moved: tap to put them back' : p.tagline}</span>
                </span>
              </button>
              <button className="tx-fit" aria-label={`Fit ${shown(p.id)}: why, for ${p.name}`} aria-haspopup="dialog" onClick={() => setWhy(p.id)}>
                <FitTag v={shown(p.id)} />
              </button>
              <button className="iconbtn tx-about" aria-label={`About ${p.name}`} aria-haspopup="dialog" onClick={() => setAbout(p.id)}>
                <Info size={18} />
              </button>
            </div>
          );
        })}
      </div>
      <Sheet open={!!aboutPreset} onClose={() => setAbout(null)} title={aboutPreset?.name}>
        {aboutPreset && (
          <div className="col tx-about-body">
            <p className="tx-lead">{aboutPreset.tagline}</p>
            <p>{aboutPreset.description}</p>
            <div className="tx-dl">
              <span className="over">Best for</span>
              <span>{aboutPreset.bestFor}</span>
            </div>
            <button
              className="tx-fitrow"
              aria-haspopup="dialog"
              onClick={() => {
                setAbout(null);
                setWhy(aboutPreset.id);
              }}
            >
              <FitTag v={shown(aboutPreset.id)} />
              <span className="grow">Why this fit</span>
              <ChevronRight size={16} className="dim" aria-hidden="true" />
            </button>
            <button
              className="btn primary block"
              disabled={aboutOn && !aboutCustom}
              onClick={() => {
                pick(aboutPreset.id);
                setAbout(null);
              }}
            >
              {aboutOn ? (aboutCustom ? 'Put its settings back' : 'In use') : `Use ${aboutPreset.name}`}
            </button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!whyPreset} onClose={() => setWhy(null)} title={whyPreset ? `Why fit ${shown(whyPreset.id)}` : ''}>
        {whyPreset && <FitWhy id={whyPreset.id} presets={presets} terms={terms[whyPreset.id]} fits={fits} pr={prof} name={name} />}
        <button className="btn block tx-gotit" onClick={() => setWhy(null)}>
          Got it
        </button>
      </Sheet>
    </>
  );
}
