// Why the staff reads a playbook as it does, in its sheet: what it's worth a game against the one in
// use and its place among the others, then what it's worth against an average playbook, made of its
// start (for a typical roster) and each roster quality's part, with the players behind each, and what
// would raise it. All in points a game: the staff's read, from fits calibrated against the engine
// (core/ai/coachAI.ts); the change itself is measured when it's made.
import type { FitTerm, ProfileKey, RosterProfile } from '../../core/ai/coachAI';
import type { DefPreset, OffPreset } from '../../core/sim/tactics';
import { ordinal } from '../stats';
import { fitTone, readText, shownFit } from './fit';

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

export function PresetFit({
  id,
  cur,
  presets,
  terms,
  fits,
  pr,
  name,
  kind,
}: {
  id: string;
  /** The playbook in use. */
  cur: string;
  presets: (OffPreset | DefPreset)[];
  terms: FitTerm[];
  fits: Record<string, number>;
  pr: RosterProfile;
  name: (pid: number) => string;
  kind: 'off' | 'def';
}) {
  const f = shownFit(id, terms, fits, cur);
  const best = presets.reduce((a, p) => (fits[p.id] > fits[a.id] ? p : a), presets[0]);
  const curName = presets.find((p) => p.id === cur)?.name ?? 'yours';
  const parts = [...f.parts].sort((a, b) => b.v - a.v);
  // what raises it: more of a quality this playbook rewards, in points a game for five rating points more
  const levers = terms
    .filter((t) => t.key !== 'base' && t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((t) => ({ t, gain: Math.round(5 * t.weight) / 10 }));
  const mine = id === cur;
  return (
    <div className="col tx-why">
      <div className="tx-why-head">
        <span className={`tx-fitv tx-read ${fitTone(mine ? f.total : f.vs)}`}>{readText(mine ? f.total : f.vs)}</span>
        <span className="grow">
          <span className="tx-why-rank">{mine ? 'A game against an average playbook' : `A game against ${curName}`}</span>
          <span className="tx-term-s">
            Staff&apos;s read · {ordinal(f.rank)} of {presets.length} {kind === 'off' ? 'offenses' : 'defenses'} for your roster
            {best.id === id ? '' : `. Best: ${best.name}`}
          </span>
        </span>
      </div>
      <div className="tx-terms">
        <div className="tx-term">
          <span className="tx-term-v num dim2">{readText(f.start)}</span>
          <span className="grow tx-term-l">For a typical roster</span>
        </div>
        {parts.map(({ term, v }) => {
          const who = behind(term, pr, name);
          return (
            <div key={term.key} className="tx-term">
              <span className={`tx-term-v num ${v > 0 ? 'good' : 'bad'}`}>{readText(v)}</span>
              <span className="grow">
                <span className="tx-term-l">{QUALITY[term.key as ProfileKey].label}</span>
                {who && <span className="tx-term-s">{who}</span>}
              </span>
            </div>
          );
        })}
        <div className="tx-term">
          <span className="tx-term-v num bold">{readText(f.total)}</span>
          <span className="grow tx-term-l">Total against an average playbook</span>
        </div>
        {!parts.length && <div className="small dim2">It leans on no one quality, so it reads the same for most rosters.</div>}
      </div>
      {levers.length > 0 && best.id !== id && (
        <div className="tx-terms">
          <div className="over">What would raise it</div>
          {levers.map(({ t, gain }) => (
            <div key={t.key} className="tx-term">
              <span className="grow tx-term-l">{QUALITY[t.key as ProfileKey].more}</span>
              <span className="tiny dim num nowrap">{gain > 0 ? `+${gain.toFixed(1)} a game for 5 rating points` : 'little change'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
