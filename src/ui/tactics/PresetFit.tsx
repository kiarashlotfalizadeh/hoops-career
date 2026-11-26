// What a playbook asks of this roster, in its sheet: what suits the roster and what works against it,
// with the players behind each, and what would raise it. The reasons, in words; no verdict on the
// playbook against the one in use (see ./fit.ts): weighing them is the coach's part.
import type { FitTerm, ProfileKey, RosterProfile } from '../../core/ai/coachAI';
import { fitParts, type FitParts } from './fit';

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

/** One group of a fit's parts under its heading, each a quality and the players behind it. */
function Parts({ title, parts, pr, name }: { title: string; parts: FitParts; pr: RosterProfile; name: (pid: number) => string }) {
  if (!parts.length) return null;
  return (
    <div className="tx-terms">
      <div className="over">{title}</div>
      {parts.map(({ term }) => {
        const who = behind(term, pr, name);
        return (
          <div key={term.key} className="tx-term">
            <span className="grow">
              <span className="tx-term-l">{QUALITY[term.key as ProfileKey].label}</span>
              {who && <span className="tx-term-s">{who}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PresetFit({ terms, pr, name }: { terms: FitTerm[]; pr: RosterProfile; name: (pid: number) => string }) {
  const parts = fitParts(terms);
  const suits = parts.filter((p) => p.v > 0).sort((a, b) => b.v - a.v);
  const against = parts.filter((p) => p.v < 0).sort((a, b) => a.v - b.v);
  // what raises it: more of a quality this playbook rewards
  const levers = terms
    .filter((t) => t.key !== 'base' && t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  return (
    <div className="col tx-why">
      <Parts title="Suits your roster" parts={suits} pr={pr} name={name} />
      <Parts title="Works against it" parts={against} pr={pr} name={name} />
      {!parts.length && <div className="small dim2">It leans on no one quality, so it reads the same for most rosters.</div>}
      {levers.length > 0 && (
        <div className="tx-terms">
          <div className="over">What it rewards</div>
          {levers.map((t) => (
            <div key={t.key} className="tx-term">
              <span className="grow tx-term-l">{QUALITY[t.key as ProfileKey].more}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
