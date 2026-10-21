// "While you were away": what the latest sim of more than a day did, in one sheet that opens by itself
// once the sim is done (after any big moment, and never over the live game): the record over the
// stretch with each result's headline, the stories about the user's team, where he stands now,
// who got hurt, new mail and the league's biggest stories. Each line opens its own page. Closing it
// keeps it a tap away on Today until the next sim.
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { ordinal } from '../../core/format';
import { Sheet } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { curTeamSeason } from '../../core/league/helpers';
import { storyLink } from './front';
import { senderOf } from './senders';
import { isImportant } from './messages';
import './today.css';
import type { Digest, DigestStory } from './digest';

/** The most results listed; the rest are a tap away on the schedule. */
const RESULTS_SHOWN = 6;

/** Mounted once in the shell: the digest's sheet, opened by the store when a sim ends (or from Today). */
export function DigestHost() {
  const digest = useStore((s) => s.digest);
  const open = useStore((s) => s.digestOpen);
  const blocked = useStore((s) => !!s.sim || s.momentUp);
  const { pathname } = useLocation();
  const league = useStore((s) => s.league);
  const show = open && !blocked && pathname !== '/live' && !!digest && !!league && digest.leagueId === league.id;
  return (
    <Sheet open={show} onClose={() => useStore.getState().showDigest(false)} title="While you were away">
      {digest && league && <DigestBody d={digest} />}
    </Sheet>
  );
}

function DigestBody({ d }: { d: Digest }) {
  const league = useLeague();
  const nav = useNavigate();
  const close = () => useStore.getState().showDigest(false);
  const go = (to: string) => {
    close();
    nav(to);
  };
  const ts = curTeamSeason(league, league.userTid);
  const mail = d.mail.map((id) => league.inbox.find((m) => m.id === id)).filter((m) => !!m);
  return (
    <div className="dg col">
      <div className="dg-span">{d.span}</div>
      {(d.record || d.seed || d.power) && (
        <div className="dg-top">
          {d.record && (
            <div className="dg-rec">
              <span className={`num dg-rec-v ${d.record.w > d.record.l ? 'good' : d.record.w < d.record.l ? 'bad' : ''}`}>
                {d.record.w}-{d.record.l}
              </span>
              <span className="dg-rec-k">in the stretch · now {`${ts.won}-${ts.lost}`}</span>
            </div>
          )}
          <div className="dg-moves">
            {d.seed && <Move label={`${d.seed.conf === 'E' ? 'East' : 'West'}`} before={d.seed.before} after={d.seed.after} />}
            {d.power && <Move label="Power rankings" before={d.power.before} after={d.power.after} />}
          </div>
        </div>
      )}

      {d.results.length > 0 && (
        <DigestSection title="Results" more={d.results.length > RESULTS_SHOWN ? { label: `All ${d.results.length}`, to: '/games' } : undefined} go={go}>
          {d.results.slice(0, RESULTS_SHOWN).map((r) => (
            <button key={r.gid} type="button" className="dg-res" onClick={() => go(`/game/${r.gid}`)}>
              <span className={`td-wl ${r.won ? 'w' : 'l'}`}>
                <span aria-hidden="true">{r.won ? 'W' : 'L'}</span>
                <span className="sr-only">{r.won ? 'Won' : 'Lost'}</span>
              </span>
              <span className="grow dg-res-t">
                <span className="dg-res-s">
                  <span className="num">{r.score}</span> <span className="dim">{r.home ? 'vs' : '@'}</span> <TeamLogo tid={r.opp} size={18} decorative />{' '}
                  {league.teams[r.opp].abbrev}
                </span>
                {r.head && <span className="dg-res-h">{r.head}</span>}
              </span>
              <ChevronRight size={16} className="dim" aria-hidden="true" />
            </button>
          ))}
        </DigestSection>
      )}

      {d.stories.length > 0 && (
        <DigestSection title={`The ${league.teams[league.userTid].name} in the news`} go={go}>
          {d.stories.map((s) => (
            <StoryRow key={s.id} s={s} go={go} />
          ))}
        </DigestSection>
      )}

      {(d.injuries.length > 0 || d.back.length > 0) && (
        <DigestSection title="Injuries" more={{ label: 'Roster', to: '/team' }} go={go}>
          {d.injuries.map((x) => (
            <div key={x} className="dg-line bad">
              {x}
            </div>
          ))}
          {d.back.length > 0 && <div className="dg-line good">Back: {d.back.join(', ')}</div>}
        </DigestSection>
      )}

      {mail.length > 0 && (
        <DigestSection title="New mail" more={{ label: 'Inbox', to: '/inbox' }} go={go}>
          {mail.slice(0, 5).map((m) => (
            <button key={m.id} type="button" className={`dg-mail ${m.read ? '' : 'unread'}`} onClick={() => go(`/inbox?m=${m.id}`)}>
              <span className="grow">
                <span className="dg-mail-s">
                  {m.subject}
                  {isImportant(m) && !m.read && <span className="tag bad">Important</span>}
                </span>
                <span className="dg-mail-f">{senderOf(league, m).name}</span>
              </span>
              <ChevronRight size={16} className="dim" aria-hidden="true" />
            </button>
          ))}
          {mail.length > 5 && <div className="dg-line dim">and {mail.length - 5} more</div>}
        </DigestSection>
      )}

      {d.around.length > 0 && (
        <DigestSection title="Around the league" more={{ label: 'News', to: '/league/news' }} go={go}>
          {d.around.map((s) => (
            <StoryRow key={s.id} s={s} go={go} />
          ))}
        </DigestSection>
      )}

      <button type="button" className="btn block primary dg-done" onClick={close}>
        Done
      </button>
    </div>
  );
}

/** A rank then and now: "East 6th → 4th", up in green. */
function Move({ label, before, after }: { label: string; before?: number; after: number }) {
  const up = before !== undefined && after < before;
  const down = before !== undefined && after > before;
  return (
    <span className="dg-move">
      <span className="dg-move-k">{label}</span>
      <span className={`num dg-move-v ${up ? 'good' : down ? 'bad' : ''}`}>
        {before !== undefined && before !== after && (
          <>
            {ordinal(before)} <span aria-label="to">→</span>{' '}
          </>
        )}
        {ordinal(after)}
      </span>
    </span>
  );
}

function DigestSection({ title, more, go, children }: { title: string; more?: { label: string; to: string }; go: (to: string) => void; children: ReactNode }) {
  return (
    <section className="dg-sec">
      <div className="dg-sec-h">
        <h3 className="over">{title}</h3>
        {more && (
          <button type="button" className="card-link" onClick={() => go(more.to)}>
            {more.label} <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="dg-list">{children}</div>
    </section>
  );
}

function StoryRow({ s, go }: { s: DigestStory; go: (to: string) => void }) {
  return (
    <button type="button" className={`dg-story w${s.weight}`} onClick={() => go(storyLink(s.id))}>
      <span className="grow">
        <span className="dg-story-h">{s.head}</span>
        {s.dek && <span className="dg-story-d">{s.dek}</span>}
      </span>
      <ChevronRight size={16} className="dim" aria-hidden="true" />
    </button>
  );
}
