// A player's page, Growth: his career arc (OVR season by season, this season's check-ins, his
// potential ahead), what his potential means, what moved this season, the outlook for his age with
// his wear, and (your own player) the staff's development priority and his training focus.
import type { League, Player, RatingKey, TrainingFocus } from '../../core/types';
import { RETIRED } from '../../core/types';
import { RATING_META, ovrColor, tierLabel } from '../../core/ratings';
import { seasonLabel } from '../../core/constants';
import { playerAge } from '../../core/playerGen';
import { FOCUS_META, PRIORITY, priorityCost, priorityEffect, staffPicksPriority, toggleDevPriority } from '../../core/league/progression';
import { baseLabel, devBase, focusChances, histAt, ovrChange, ovrYear, potentialText, priorityPlan, ratingDeltas } from '../../core/league/devWatch';
import { shortName } from '../../core/league/helpers';
import { plural } from '../../core/format';
import { Link } from 'react-router-dom';
import { edit } from '../../state/actions';
import { useStore } from '../../state/store';
import { Chips, Help, Section, Statline, Toggle } from '../components/ui';
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

/**
 * The staff's development priority for one of your players (the one lever on who grows, see
 * progression.ts's PRIORITY): the switch, what a year of it is worth to him and what it costs each of
 * your other young players, both in OVR a year from the sum develop() runs, and what last year's did.
 */
function Priority({ p, league, busy }: { p: Player; league: League; busy: boolean }) {
  const plan = priorityPlan(league);
  const has = plan.picks.some((x) => x.pid === p.pid);
  const young = playerAge(p, league.season) <= PRIORITY.maxAge;
  // last year's, measured as it ran (his preseason snapshot)
  const did = histAt(p, league.season)?.staff ?? 0;
  const last = did ? (
    <div className="small dim">
      {did > 0 ? `Last year it added about ${ovrYear(did)} OVR.` : `Last year the staff's time elsewhere cost him about ${Math.abs(did).toFixed(1)} OVR.`}
    </div>
  ) : null;
  if (!young) return last ? <Section title="Development priority">{last}</Section> : null;
  // the others who pay if he has it: your other players 25 or under without a place
  const others = plan.others.filter((x) => x.pid !== p.pid).map((x) => league.players[x.pid]);
  // what one priority player costs each of them a year (each priority costs the same again)
  const each = others.length ? others.reduce((a, q) => a + priorityCost(league, q, 1), 0) / others.length : 0;
  const now = plan.picks.length && !has ? priorityCost(league, p, plan.picks.length) : 0;
  const names = plan.picks.filter((x) => x.pid !== p.pid);
  const full = !has && plan.open <= 0;
  return (
    <Section
      title="Development priority"
      right={
        <Help title="Development priority">
          <p>
            Your staff have extra time for {PRIORITY.slots} players of {PRIORITY.maxAge} or under. A player with it grows faster, by the figure shown.
          </p>
          <p>
            The time comes from your other players of {PRIORITY.maxAge} or under: each grows a little slower for every priority you set. Players past {PRIORITY.maxAge} are not
            affected.
          </p>
          <p>Until you choose, your staff pick the two with the highest potential. Every other team&apos;s staff do the same.</p>
        </Help>
      }
    >
      <div className="tm-train">
        <Toggle on={has} disabled={busy || full} label="Staff priority" onChange={() => edit((l) => void toggleDevPriority(l, p.pid))} />
        <Statline
          items={[
            { k: has ? 'Adds' : 'Would add', v: ovrYear(priorityEffect(league, p)), s: 'OVR a year', color: 'var(--good)' },
            ...(others.length
              ? [{ k: 'Costs', v: ovrYear(each), s: `a year, each of ${plural(others.length, 'other')} ${PRIORITY.maxAge} or under`, color: 'var(--bad)' }]
              : [{ k: 'Costs', v: '0', s: `nobody else is ${PRIORITY.maxAge} or under` }]),
            { k: 'Places', v: `${plan.picks.length}/${PRIORITY.slots}`, s: plan.chosen ? 'your pick' : "staff's pick" },
          ]}
        />
        {!has && now < 0 && <div className="small dim">Without it he pays for the others: about {ovrYear(now)} OVR a year.</div>}
        {names.length > 0 && (
          <div className="small dim">
            {has ? 'Also has it: ' : full ? 'Both places are taken: ' : 'Has it now: '}
            {names.map((x, i) => (
              <span key={x.pid}>
                {i ? ', ' : ''}
                <Link to={`/player/${x.pid}?tab=dev`}>{shortName(league, league.players[x.pid])}</Link>
              </span>
            ))}
            {full ? '. Free one first.' : '.'}
          </div>
        )}
        {last}
        {plan.chosen && (
          <button className="btn xs ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => edit((l) => staffPicksPriority(l))}>
            Let the staff pick
          </button>
        )}
      </div>
    </Section>
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
              <p>Minutes help: 25 a night or more. So do your staff&apos;s priority and a good summer.</p>
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
            <p>Your staff&apos;s priority, the head coach&apos;s development rating and his training focus all push. So does a growth tendency of his own, hidden from scouts.</p>
            <p>Young players grow with minutes: 15 a night or more gets all of a young player&apos;s growth, 25 adds to it, under 6 costs more than half.</p>
            <p>
              A year moves a player within a band for his age: 22 or under −2 to +8 OVR, 23-26 −3 to +6, 27-31 −4 to +4, 32-35 −5 to +2, 36 or more −7 to +1. An injury&apos;s
              lasting damage comes on top.
            </p>
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
      {mine && p.tid === league.userTid && <Priority p={p} league={league} busy={busy} />}
      {mine && (
        <Section title="Training focus">
          <div className="tm-train">
            <Chips
              label="Training focus"
              value={p.training}
              disabled={busy}
              onChange={(f: TrainingFocus) =>
                edit((l) => {
                  l.players[p.pid].training = f;
                  // (his ratings today: what the focus is read from, not what he did before it)
                  l.players[p.pid].trainingSince = { season: l.season, day: l.day, r: { ...l.players[p.pid].ratings } };
                })
              }
              options={(Object.keys(FOCUS_META) as TrainingFocus[]).map((k) => ({ id: k, label: FOCUS_META[k].label }))}
            />
            <div className="small dim">{FOCUS_META[p.training].help}</div>
            {/* when it next gets to work: development runs at set steps, not day by day */}
            {p.tid >= 0 && <div className="small dim">Next development step: {focusChances(league, p, { season: league.season, day: league.day }).next}.</div>}
          </div>
        </Section>
      )}
    </>
  );
}
