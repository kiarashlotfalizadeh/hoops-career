// "While you were away": what the latest sim of more than a day did, in one sheet that opens by itself
// once the sim is done (after any big moment, and never over the live game): the record over the
// stretch with each result's headline, the stories about the user's team, where he stands now,
// who got hurt, new mail and the league's biggest stories. Each line opens its own page. Closing it
// keeps it a tap away on Today until the next sim, and marks the mail it listed read (what still
// needs him stays unread: a decision open, big news).
import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { agenda, CALL_KINDS } from '../../core/league/agenda';
import { keepFigures, ordinal } from '../../core/format';
import { Avatar, Sheet } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { curTeamSeason } from '../../core/league/helpers';
import { storyLink } from './front';
import { senderOf } from './senders';
import { isImportant, needsYou } from './messages';
import { OpenCalls } from './NeedsList';
import './today.css';
import { shownResults, toldMail, type Digest, type DigestMoment, type DigestStory } from './digest';
import { touch } from '../../state/actions';

/** The most mail listed; the rest are a tap away in the inbox. */
const MAIL_SHOWN = 3;

/** Mounted once in the shell: the digest's sheet, opened by the store when a sim ends (or from Today). */
export function DigestHost() {
  const digest = useStore((s) => s.digest);
  const open = useStore((s) => s.digestOpen);
  const blocked = useStore((s) => !!s.sim || s.momentUp);
  const { pathname } = useLocation();
  const league = useStore((s) => s.league);
  const show = open && !blocked && pathname !== '/live' && !!digest && !!league && digest.leagueId === league.id;
  // once it has been read, the mail it listed is read too, but for what still needs him
  const was = useRef(false);
  useEffect(() => {
    const wasShown = was.current;
    was.current = show;
    if (!wasShown || show || !digest) return;
    const now = useStore.getState().league;
    if (!now || now.id !== digest.leagueId) return;
    // (the few it listed, and the notes its other blocks told in full: see toldMail)
    const open = new Map(agenda(now).map((i) => [i.id, i]));
    const kept = { ...digest, mail: digest.mail.filter((id) => now.inbox.some((m) => m.id === id)) };
    const ids = new Set(
      toldMail(kept, now, MAIL_SHOWN, (id) =>
        needsYou(
          now.inbox.find((m) => m.id === id)!,
          open,
          now,
        ),
      ),
    );
    if (ids.size)
      touch((l) => {
        for (const m of l.inbox) if (ids.has(m.id)) m.read = true;
      });
  }, [show, digest]);
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
  // a long stretch: its newest results and its biggest nights
  const shown = shownResults(d.results);
  // the staff's calls open now, each with its one-tap answer: what a sim stops for is answered here
  const calls = useLeagueMemo(() => agenda(league).filter((i) => CALL_KINDS.has(i.kind)), [league]);
  return (
    <div className="dg col">
      <div className="dg-span">{d.span}</div>
      {d.moment && <MomentRow m={d.moment} go={go} />}
      {d.stop && !(d.stop.call && calls.length) && (
        <button type="button" className={`dg-stop ${d.stop.tone}`} onClick={() => go(d.stop!.to)}>
          <span className="grow">{d.stop.text}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
      <OpenCalls calls={calls} picks={d.picks} />
      {(d.record || d.seed || d.power) && (
        <div className="dg-top">
          {d.record && (
            <div className="dg-rec">
              <span className={`num dg-rec-v ${d.record.w > d.record.l ? 'good' : d.record.w < d.record.l ? 'bad' : ''}`}>
                {d.record.w}-{d.record.l}
              </span>
              <span className="dg-rec-k">in the stretch · now {keepFigures(`${ts.won}-${ts.lost}`)}</span>
            </div>
          )}
          <div className="dg-moves">
            {d.seed && <Move label={`${d.seed.conf === 'E' ? 'East' : 'West'}`} before={d.seed.before} after={d.seed.after} />}
            {d.power && <Move label="Power rankings" before={d.power.before} after={d.power.after} />}
          </div>
        </div>
      )}

      {d.results.length > 0 && (
        <DigestSection title="Results" more={d.results.length > shown.length ? { label: `All ${d.results.length}`, to: '/games' } : undefined} go={go}>
          {shown.map((r) => (
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
          {mail.slice(0, MAIL_SHOWN).map((m) => (
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
          {mail.length > MAIL_SHOWN && <div className="dg-line dim">and {mail.length - MAIL_SHOWN} more</div>}
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
        <h3 className="dg-h">{title}</h3>
        {more && (
          <button type="button" className="card-link" onClick={() => go(more.to)}>
            {more.label} <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="card flush dg-list">{children}</div>
    </section>
  );
}

/** The moment of the stretch: its one big story, the headline set large on the paper, with his player's jersey. */
function MomentRow({ m, go }: { m: DigestMoment; go: (to: string) => void }) {
  const league = useLeague();
  const p = m.pid !== undefined ? league.players[m.pid] : undefined;
  return (
    <button type="button" className={`dg-moment w${m.weight}`} onClick={() => go(m.to)}>
      <span className="dg-moment-over over">
        <span>The moment of the stretch · {m.over}</span>
        <ChevronRight size={14} aria-hidden="true" />
      </span>
      <span className="dg-moment-head">{m.head}</span>
      {(m.dek || p) && (
        <span className="dg-moment-by">
          {p && <Avatar p={p} />}
          {m.dek && <span className="dg-moment-dek">{m.dek}</span>}
        </span>
      )}
    </button>
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
