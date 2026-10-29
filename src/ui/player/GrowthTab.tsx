// A player's page, Growth: his career arc (OVR season by season, this season's check-ins, his
// potential ahead), what his potential means, what moved this season, the outlook for his age with
// his wear, and (your own player) his training focus.
import type { League, Player, RatingKey, TrainingFocus } from '../../core/types';
import { RETIRED } from '../../core/types';
import { RATING_META, ovrColor, tierLabel } from '../../core/ratings';
import { seasonLabel } from '../../core/constants';
import { playerAge } from '../../core/playerGen';
import { FOCUS_META } from '../../core/league/progression';
import { baseLabel, devBase, ovrChange, potentialText, ratingDeltas } from '../../core/league/devWatch';
import { edit } from '../../state/actions';
import { useStore } from '../../state/store';
import { Chips, Help, Section, Statline } from '../components/ui';
import { ArcChart } from './ArcChart';
import { DevDelta, signedInt } from './dev';

const LABEL = new Map(RATING_META.map((m) => [m.key as RatingKey, m.label]));

/** Where he is against the ceiling scouts see: a bar of what he has, the rest of the way in a quieter tone. */
function Climb({ p }: { p: Player }) {
  // the scale runs from 40 (the bottom of the display scale) to 99
  const at = (v: number) => `${((v - 40) / 59) * 100}%`;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="dv-climb" role="img" aria-label={`OVR ${p.ovr} of a potential ${p.pot}`}>
        <span className="room" style={{ width: at(p.pot) }} />
        <span className="now" style={{ width: at(p.ovr) }} />
      </div>
      <div className="dv-climb-key">
        <span>Now {p.ovr}</span>
        <span>Potential {p.pot}</span>
      </div>
    </div>
  );
}

export function GrowthTab({ p, league, mine }: { p: Player; league: League; mine: boolean }) {
  const hist = p.ratingsHistory;
  const age = playerAge(p, league.season);
  const busy = useStore((s) => !!s.sim);
  const base = devBase(league, p);
  const since = baseLabel(base);
  const change = ovrChange(league, p);
  const deltas = Object.entries(ratingDeltas(league, p)) as [RatingKey, number][];
  const ups = deltas.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const downs = deltas.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const room = p.pot - p.ovr;
  return (
    <>
      {/* his arc once there is a change to draw (a check-in or next preseason); until then no block
          stands in for it: his OVR and potential are on the slab and under Potential */}
      {(hist.length > 1 || (hist.length === 1 && change !== 0)) && (
        <Section title="Career arc">
          <div className="dv-arc-wrap">
            <ArcChart league={league} p={p} />
          </div>
        </Section>
      )}

      {p.tid !== RETIRED && (
        <Section
          title="Potential"
          right={
            <Help title="Potential">
              <p>POT is the scouts&apos; read of where his growth should take him. It comes from his age and how he has developed so far.</p>
              <p>Every young player also has a course scouting can&apos;t see. Some beat their potential and some fall short.</p>
              <p>Minutes help: 25 a night or more. So do coaching, practice and a good summer.</p>
            </Help>
          }
        >
          <div className="dv-pot">
            <div className="dv-pot-top">
              <span className="dv-pot-fig num" style={{ color: ovrColor(p.pot) }}>
                {p.pot}
              </span>
              <div className="dv-pot-l">
                <span className="dv-pot-k">{room > 0 ? `Ceiling · ${signedInt(room)} to go` : 'Ceiling reached'}</span>
                <span className="dv-pot-tier">{tierLabel(p.pot)}</span>
              </div>
            </div>
            {/* (at his ceiling, its head says so: no sentence repeating it) */}
            {room > 0 && <Climb p={p} />}
            {room > 0 && <p className="dv-pot-text">{potentialText(p)}</p>}
          </div>
        </Section>
      )}

      {(ups.length > 0 || downs.length > 0) && (
        <Section title={`What moved ${since}`}>
          <div className="dv-moved">
            <div className="dv-moved-ovr">
              <span className="small dim">OVR</span>
              <b className="num">{p.ovr}</b>
              {change ? <DevDelta d={change} since={since} size="md" /> : <span className="small dim">no change</span>}
            </div>
            {ups.length > 0 && (
              <div className="dv-moves" aria-label="Up">
                {ups.slice(0, 8).map(([k, v]) => (
                  <span key={k} className="tag">
                    {LABEL.get(k)} <DevDelta d={v} />
                  </span>
                ))}
              </div>
            )}
            {downs.length > 0 && (
              <div className="dv-moves" aria-label="Down">
                {downs.slice(0, 6).map(([k, v]) => (
                  <span key={k} className="tag">
                    {LABEL.get(k)} <DevDelta d={v} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      <Section
        title="Outlook"
        right={
          <Help title="How players develop">
            <p>Skills and IQ improve into the late 20s. Speed and explosiveness peak around 24-27, then decline.</p>
            <p>Most of a year&apos;s change comes over the summer. Players 26 and under also move a little at the staff&apos;s three check-ins.</p>
            <p>Coaching, the coaching budget, practice intensity and his training focus all push. So does a growth tendency of his own, hidden from scouts.</p>
            <p>Young players grow with minutes: 25 a night helps, under 6 hurts.</p>
          </Help>
        }
      >
        <div className="tm-outlook">
          <div className="tm-outlook-l">
            {p.tid === RETIRED
              ? `Retired${p.retiredSeason ? ` after the ${seasonLabel(p.retiredSeason)} season` : ''}.`
              : // (where his career stands is on the slab: here what his age means for his growth)
                age <= 22
                ? 'Big jumps come with minutes and good coaching.'
                : age <= 26
                  ? 'Still improving, especially skills and decisions.'
                  : age <= 30
                    ? 'Skill gains offset the early athletic decline.'
                    : age <= 33
                      ? 'Athleticism fades; IQ and shooting hold up.'
                      : 'Conditioning work slows the decline.'}
          </div>
          <Statline
            items={[
              { k: 'Age', v: age },
              ...(p.tid !== RETIRED
                ? [{ k: 'Change', v: change ? signedInt(change) : '0', s: 'this season', color: change > 0 ? 'var(--good)' : change < 0 ? 'var(--bad)' : undefined }]
                : []),
              ...(p.tid >= 0 ? [{ k: 'Wear', v: `${Math.round(p.wear)}/100`, s: p.wear >= 55 ? 'needs rest' : 'fresh', color: p.wear >= 55 ? 'var(--warn)' : undefined }] : []),
            ]}
          />
        </div>
      </Section>
      {mine && (
        <Section title="Training focus">
          <div className="tm-train">
            <Chips
              label="Training focus"
              value={p.training}
              disabled={busy}
              onChange={(f: TrainingFocus) => edit((l) => void (l.players[p.pid].training = f))}
              options={(Object.keys(FOCUS_META) as TrainingFocus[]).map((k) => ({ id: k, label: FOCUS_META[k].label }))}
            />
            <div className="small dim">{FOCUS_META[p.training].help}</div>
          </div>
        </Section>
      )}
    </>
  );
}
