// A player's page, Ratings: why his OVR is what it is (the attributes that lift it and hold it
// back), then every rating on the 40-99 scale by group, with last season's change; a tap opens what
// a rating does.
import { Fragment, useState } from 'react';
import type { League, Player, RatingKey } from '../../core/types';
import { RATING_META, attrDisplay, ovrWeights } from '../../core/ratings';
import { ratingMeans } from '../../core/league/progression';
import { Bar, Section } from '../components/ui';
import { Term } from '../components/Glossary';
import { RATING_COLOR, RatingBands, ratingTone } from '../ratingCols';

/** Median OVR of rostered players (the display scale puts the 50th percentile here). */
const AVERAGE_OVR = 74;

const RATING_GROUPS = ['Physical', 'Scoring', 'Playmaking', 'Defense', 'Rebounding'] as const;

/**
 * Where a player's OVR comes from: each attribute's weighted gap to the league average,
 * scaled so the parts add up to his distance from an average player.
 */
function ovrContributions(league: League, p: Player) {
  const means = league.ratingAnchors ?? ratingMeans(league);
  const w = ovrWeights(p.ratings);
  const parts = RATING_META.map((m) => {
    const k = m.key as RatingKey;
    return { key: m.key, label: m.label, raw: w[k] * (p.ratings[k] - (means[k] ?? 50)) };
  });
  const total = parts.reduce((a, x) => a + x.raw, 0);
  const gap = p.ovr - AVERAGE_OVR;
  // display points per raw point: proportional share of the gap when the signs agree
  const k = Math.abs(total) > 0.5 && Math.sign(total) === Math.sign(gap) ? gap / total : 1.6;
  return {
    gap,
    parts: parts.map((x) => ({ ...x, delta: Math.round(x.raw * k) })).sort((a, b) => b.raw - a.raw),
  };
}

export function RatingsTab({ p, league }: { p: Player; league: League }) {
  const [open, setOpen] = useState<string | null>(null);
  const was = p.ratingsHistory.length > 1 ? p.ratingsHistory[p.ratingsHistory.length - 2].r : undefined;
  const contribs = ovrContributions(league, p);
  const pluses = contribs.parts.filter((x) => x.delta > 0).slice(0, 4);
  const minuses = contribs.parts
    .filter((x) => x.delta < 0)
    .slice(-3)
    .reverse();
  return (
    <>
      <Section title={`Why he's a ${p.ovr}`}>
        <div className="card tm-why">
          <div className="tm-why-sum">
            {contribs.gap === 0 ? 'Right at' : `${Math.abs(contribs.gap)} ${contribs.gap > 0 ? 'above' : 'below'}`} an average player ({AVERAGE_OVR} <Term id="ovr">OVR</Term>)
          </div>
          <div className="tm-why-cols">
            {[
              { title: 'Lifts him', list: pluses },
              { title: 'Holds him back', list: minuses },
            ].map((g) => (
              <div key={g.title} className="tm-why-col">
                <div className="over">{g.title}</div>
                {!g.list.length && <div className="tm-why-row dim">Nothing</div>}
                {g.list.map((x) => (
                  <div key={x.key} className="tm-why-row">
                    <span className="ellipsis">{x.label}</span>
                    <span className={`num ${x.delta > 0 ? 'good' : 'bad'}`}>
                      {x.delta > 0 ? '+' : ''}
                      {x.delta}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Section>
      <div className="card flush">
        <div className="list">
          {RATING_GROUPS.map((g) => (
            <Fragment key={g}>
              <div className="list-divider">{g}</div>
              <div className="tm-rt-grid">
                {RATING_META.filter((m) => m.group === g).map((m) => {
                  const val = attrDisplay(p.ratings[m.key as RatingKey]);
                  const before = was?.[m.key as RatingKey];
                  const prev = before === undefined ? null : attrDisplay(before);
                  const on = open === m.key;
                  return (
                    <div key={m.key} className="tm-rt">
                      <button className="tm-rt-row" onClick={() => setOpen(on ? null : m.key)} aria-expanded={on}>
                        <span className="tm-rt-l">{m.label}</span>
                        <Bar value={((val - 40) / 59) * 100} color={RATING_COLOR[ratingTone(val)]} height={3} />
                        <span className="tm-rt-v num">{val}</span>
                        <span className={`tm-rt-d num ${prev !== null && val !== prev ? (val > prev ? 'good' : 'bad') : ''}`}>
                          {prev !== null && val !== prev ? `${val > prev ? '+' : ''}${val - prev}` : ''}
                        </span>
                      </button>
                      {on && <div className="tm-rt-help fade-in">{m.help}</div>}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="tm-foot">
        <RatingBands named />. Changes are since last season; tap a rating for what it does.
      </div>
    </>
  );
}
