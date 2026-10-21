// In possession's set package: up to four named sets the half court mixes in now and then, each for
// the player on the floor who fits it best (when one fits it well enough: SET_K.fit). On the page, one
// row: the sets in it and who they're for. Its sheet lists every set with who on the roster fits it
// best and how well; a set's ⓘ shows its look, what beats it and what it costs.
import { useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Info } from 'lucide-react';
import type { Player, SetId, Tactics } from '../../core/types';
import { MAX_SETS, SETS, SET_IDS, SET_K, bestFor, fitPlayer, setFit, setPackage } from '../../core/sim/sets';
import { Help, Section, Sheet } from '../components/ui';
import { rosterNames } from '../stats';
import { FitScore } from './FitScore';
import '../screens/tactics.css';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SetPackageCard({ t, edit, players }: { t: Tactics; edit: (fn: (t: Tactics) => void) => void; players: Player[] }) {
  const names = rosterNames(players);
  const pkg = setPackage(t);
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState<SetId | null>(null);
  // the rotation's top nine, healthy, as the sets weigh them with your roles
  const pool = players
    .filter((p) => !p.injury)
    .slice(0, 9)
    .map((p) => fitPlayer(p, t));
  const toggle = (id: SetId) =>
    edit((tt) => {
      const cur = setPackage(tt);
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX_SETS ? [...cur, id] : cur;
      if (next.length) tt.offense.sets = next;
      else delete tt.offense.sets;
    });
  const pctEach = Math.round(SET_K.rate * 100);
  const fitOf = (id: SetId) => {
    const best = bestFor(id, pool);
    return best ? { pid: best.pid, fit: Math.round(setFit(id, best)) } : null;
  };
  const s = about ? SETS[about] : null;
  const sOn = !!about && pkg.includes(about);
  const sBest = about ? fitOf(about) : null;
  return (
    <Section
      title="Set package"
      right={
        <Help title="Set package">
          <p>
            A set gets the ball to the player it&apos;s for and goes for its look. It has edges against some defenses and none against others, and it takes a second or two more of
            the shot clock than your usual offense. Nothing in it makes anyone shoot better.
          </p>
          <p>
            Defenses read sets: every time one is run in a game, its look is a little less open the next time and its passes get jumped a little more often (sooner against a coach
            who rates high at tactics). A set is at its best the first time or two, and run over and over it costs you.
          </p>
          <p>
            From your package the half court runs one on about {pctEach} trips in 100 for each set in it (favoring the ones run least so far), never in a late-game situation (a
            last shot, a 2-for-1, a lead to run out, a deficit to chase), after an offensive rebound or with under 14 seconds to play with, and only for a player on the floor who
            fits it well (fit {SET_K.fit} or more). Your staff stops running a set once their defense is on it; you can still call it yourself. In live games you can call any set
            yourself (Plays), and on Match one can be your after-timeout play.
          </p>
        </Help>
      }
    >
      <button className="card tx-pkg" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="grow">
          <span className="lr-name">{pkg.length ? pkg.map((id) => SETS[id].name).join(', ') : 'No sets'}</span>
          <span className="lr-meta">
            {pkg.length
              ? pkg
                  .map((id) => fitOf(id))
                  .map((b) => (b && b.fit >= SET_K.fit ? names(b.pid) : 'nobody fits'))
                  .join(' · ')
              : 'Your offense runs no sets on its own'}
          </span>
        </span>
        <span className="tiny dim num">
          {pkg.length}/{MAX_SETS}
        </span>
        <ChevronRight size={16} className="dim" aria-hidden="true" />
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setAbout(null);
        }}
        title={s ? s.name : 'Set package'}
      >
        {s && about ? (
          <div className="col tx-about-body">
            <p className="tx-lead sm">{s.what}</p>
            <div className="tx-dl">
              <span className="over">The look</span>
              <span>{cap(s.look)}.</span>
            </div>
            <div className="tx-dl">
              <span className="over">Works against</span>
              <span>{cap(s.beats)}.</span>
            </div>
            <div className="tx-dl">
              <span className="over">Not against</span>
              <span>{cap(s.killedBy)}.</span>
            </div>
            <div className="tx-dl">
              <span className="over">Costs</span>
              <span>
                {s.time} s more of the shot clock.{s.note ? ` ${s.note}` : ''}
              </span>
            </div>
            <div className="tx-dl">
              <span className="over">Who it&apos;s for</span>
              <span>
                {cap(s.forWho)}.{sBest ? ` Best fit on your roster: ${names(sBest.pid)} (fit ${sBest.fit}).` : ''}
              </span>
            </div>
            <button
              className={`btn block ${sOn ? '' : 'primary'}`}
              disabled={!sOn && pkg.length >= MAX_SETS}
              onClick={() => {
                toggle(about);
                setAbout(null);
              }}
            >
              {sOn ? 'Take it out of the package' : pkg.length >= MAX_SETS ? `Package full (${MAX_SETS})` : 'Add to the package'}
            </button>
            <button className="btn ghost block" onClick={() => setAbout(null)}>
              <ArrowLeft size={16} aria-hidden="true" /> All sets
            </button>
          </div>
        ) : (
          <>
            <div className="card flush list wide2">
              <div className="list-divider list-h tx-fith" aria-hidden="true">
                <span className="ellipsis">Best fit first · runs at {SET_K.fit}+</span>
                <span>Fit</span>
              </div>
              {[...SET_IDS]
                .map((id) => ({ id, best: fitOf(id) }))
                .sort((a, b) => (b.best?.fit ?? -1) - (a.best?.fit ?? -1))
                .map(({ id, best }) => {
                  const on = pkg.includes(id);
                  const full = !on && pkg.length >= MAX_SETS;
                  return (
                    <div key={id} className={`tx-set ${on ? 'on' : ''}`}>
                      <button className="tx-set-pick" aria-pressed={on} disabled={full} onClick={() => toggle(id)}>
                        <span className="tx-check" aria-hidden="true">
                          {on && <Check size={14} strokeWidth={3} />}
                        </span>
                        <span className="grow">
                          <span className="lr-name">{SETS[id].name}</span>
                          <span className="lr-meta">{best ? (best.fit >= SET_K.fit ? `For ${names(best.pid)}` : `${names(best.pid)} · won't run`) : 'Nobody fits it'}</span>
                        </span>
                      </button>
                      {best && (
                        <span className="tx-fit" aria-label={`Fit ${best.fit}${best.fit >= SET_K.fit ? '' : `, under ${SET_K.fit}: not run`}`}>
                          <FitScore v={best.fit} tone={best.fit >= SET_K.fit ? 'good' : ''} />
                        </span>
                      )}
                      <button className="iconbtn tx-about" aria-label={`About ${SETS[id].name}`} onClick={() => setAbout(id)}>
                        <Info size={18} />
                      </button>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </Sheet>
    </Section>
  );
}
