// Why a playbook's fit is what it is, in its sheet: the fit and its place among the others, then
// the start it has before the roster moves it and each roster quality's part (on the row's scale, so
// they add up to the fit), with the players behind each, and what would raise it.
import { fitScale, type FitTerm, type ProfileKey, type RosterProfile } from '../../core/ai/coachAI';
import type { DefPreset, OffPreset } from '../../core/sim/tactics';
import { ordinal } from '../stats';
import { FitScore } from './FitScore';
import { fitTone, shownFit } from './fit';

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

const signedInt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;

export function PresetFit({
  id,
  presets,
  terms,
  fits,
  pr,
  name,
  kind,
}: {
  id: string;
  presets: (OffPreset | DefPreset)[];
  terms: FitTerm[];
  fits: Record<string, number>;
  pr: RosterProfile;
  name: (pid: number) => string;
  kind: 'off' | 'def';
}) {
  const scale = fitScale(fits);
  const f = shownFit(id, terms, fits);
  const best = presets.reduce((a, p) => (fits[p.id] > fits[a.id] ? p : a), presets[0]);
  const parts = [...f.parts].sort((a, b) => b.v - a.v);
  // what raises it: more of a quality this playbook rewards, in shown fit for five rating points more
  const levers = terms
    .filter((t) => t.key !== 'base' && t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((t) => ({ t, gain: fitScale({ ...fits, [id]: fits[id] + 5 * t.weight })(id) - f.shown }));
  return (
    <div className="col tx-why">
      <div className="tx-why-head">
        <FitScore v={f.shown} tone={fitTone(f.shown)} />
        <span className="grow">
          <span className="tx-why-rank">
            {ordinal(f.rank)} of {presets.length} {kind === 'off' ? 'offenses' : 'defenses'} for your roster
          </span>
          <span className="tx-term-s">{best.id === id ? 'Your best fit: it shows as 100, your worst as 45.' : `Best: ${best.name} (${scale(best.id)}). Worst shows as 45.`}</span>
        </span>
      </div>
      <div className="tx-terms">
        <div className="tx-term">
          <span className="tx-term-v num dim2">{f.start}</span>
          <span className="grow tx-term-l">Its starting score</span>
        </div>
        {parts.map(({ term, v }) => {
          const who = behind(term, pr, name);
          return (
            <div key={term.key} className="tx-term">
              <span className={`tx-term-v num ${v > 0 ? 'good' : 'bad'}`}>{signedInt(v)}</span>
              <span className="grow">
                <span className="tx-term-l">{QUALITY[term.key as ProfileKey].label}</span>
                {who && <span className="tx-term-s">{who}</span>}
              </span>
            </div>
          );
        })}
        {!parts.length && <div className="small dim2">It doesn&apos;t lean on any one quality, so it scores the same for every roster.</div>}
      </div>
      {levers.length > 0 && best.id !== id && (
        <div className="tx-terms">
          <div className="over">What would raise it</div>
          {levers.map(({ t, gain }) => (
            <div key={t.key} className="tx-term">
              <span className="grow tx-term-l">{QUALITY[t.key as ProfileKey].more}</span>
              <span className="tiny dim num nowrap">{gain > 0 ? `+${gain} for 5 rating points` : 'little change'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
