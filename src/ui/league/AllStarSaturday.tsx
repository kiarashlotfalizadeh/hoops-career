// All-Star Saturday on the Awards tab: the Three-Point Contest (each shooter's first round and the
// final) and the Slam Dunk Contest (every dunk with its score and what it was). Names and teams are
// as they were that day; a player still in the save links to his page.
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Dunk, Dunker, League, SeasonAwards, ThreeShooter } from '../../core/types';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Section } from '../components/ui';

/** "Kon Knueppel" → "K. Knueppel", from the name as it was. */
const short = (name: string) => {
  const i = name.indexOf(' ');
  return i > 0 ? `${name[0]}. ${name.slice(i + 1)}` : name;
};

function Who({ league, e, win }: { league: League; e: { pid: number; name: string; tid: number }; win?: boolean }) {
  const label = <span className={`bold ellipsis ${win ? 'lg-sat-win' : ''}`}>{short(e.name)}</span>;
  return (
    <span className="lg-sat-name">
      <TeamLogo tid={e.tid} size={16} />
      {league.players[e.pid] ? (
        // the link's ::after takes taps across the row's height (league.css .lg-sat-who)
        <Link to={`/player/${e.pid}`} className="lg-sat-who">
          {label}
        </Link>
      ) : (
        label
      )}
    </span>
  );
}

function Head() {
  return (
    <div className="lg-sat-row head" aria-hidden>
      <span />
      <span />
      <span>R1</span>
      <span>Final</span>
    </div>
  );
}

/** "I. Joe 5 · G. Allen 3": who was in a shoot-off and what each scored in it, rack by rack ("5, 4" for two). */
function tiebreak(rows: ThreeShooter[], offs: (r: ThreeShooter) => number[] | undefined): string {
  return rows
    .filter((r) => offs(r)?.length)
    .map((r) => `${short(r.name)} ${offs(r)!.join(', ')}`)
    .join(' · ');
}

function Note({ children }: { children: ReactNode }) {
  return <div className="lg-sat-note">{children}</div>;
}

function ThreeCard({ league, three }: { league: League; three: ThreeShooter[] }) {
  const r1Off = tiebreak(three, (e) => e.r1Off);
  const finalOff = tiebreak(three, (e) => e.finalOff);
  return (
    <Section
      title="Three-Point Contest"
      right={
        <Help title="Three-Point Contest">
          <p className="lg-p">Each round is 27 balls, worth 40 points at most.</p>
          <p className="lg-p">Four racks hold four balls and a money ball. One rack is all money balls. Two deep threes finish it.</p>
          <p className="lg-p">The top three go to the final.</p>
        </Help>
      }
    >
      <div className="card lg-sat">
        <Head />
        {three.map((e, i) => (
          <div key={e.pid} className="lg-sat-row">
            <span className={`lg-sat-rk ${i === 0 ? 'lg-sat-win' : ''}`}>{i + 1}</span>
            <Who league={league} e={e} win={i === 0} />
            <span className={`num ${e.final === undefined ? 'bold' : 'dim'}`}>{e.r1}</span>
            <span className="num bold">{e.final ?? ''}</span>
          </div>
        ))}
        {(r1Off || finalOff) && (
          <div className="lg-sat-notes">
            {r1Off && <Note>Shoot-off for the final: {r1Off}</Note>}
            {finalOff && <Note>Shoot-off for the title: {finalOff}</Note>}
          </div>
        )}
      </div>
    </Section>
  );
}

const total = (ds: Dunk[] | undefined) => (ds ?? []).reduce((a, d) => a + d.score, 0);

function DunkList({ label, dunks }: { label: string; dunks?: Dunk[] }) {
  if (!dunks?.length) return null;
  return (
    <>
      {dunks.map((d, i) => (
        <Fragment key={i}>
          <span className="lg-sat-lb">{i === 0 ? label : ''}</span>
          <span className={`num bold ${d.score === 50 ? 'lg-sat-win' : ''}`}>{d.score}</span>
          <span className="dim2">
            {d.text}
            {d.miss && <span className="lg-sat-miss"> · couldn&apos;t finish it</span>}
          </span>
        </Fragment>
      ))}
    </>
  );
}

function DunkCard({ league, dunk }: { league: League; dunk: Dunker[] }) {
  return (
    <Section
      title="Slam Dunk Contest"
      right={
        <Help title="Slam Dunk Contest">
          <p className="lg-p">Five judges score each dunk from 6 to 10. Each round is two dunks.</p>
          <p className="lg-p">The top two go to the final. A tie goes to a dunk-off.</p>
        </Help>
      }
    >
      <div className="card lg-sat">
        <Head />
        {dunk.map((e, i) => (
          <div key={e.pid} className="lg-sat-dunker">
            <div className="lg-sat-row">
              <span className={`lg-sat-rk ${i === 0 ? 'lg-sat-win' : ''}`}>{i + 1}</span>
              <Who league={league} e={e} win={i === 0} />
              <span className={`num ${e.final ? 'dim' : 'bold'}`}>{total(e.r1)}</span>
              <span className="num bold">{e.final ? total(e.final) : ''}</span>
            </div>
            <div className="lg-sat-dunks">
              <DunkList label="R1" dunks={e.r1} />
              <DunkList label="Off" dunks={e.r1Off} />
              <DunkList label="Final" dunks={e.final} />
              <DunkList label="Off" dunks={e.finalOff} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The day's two contests, side by side on a wide screen. */
export function AllStarSaturday({ league, aw }: { league: League; aw: SeasonAwards }) {
  const sat = aw.saturday;
  if (!sat || (!sat.three.length && !sat.dunk.length)) return null;
  return (
    <div className="md-grid2">
      {sat.three.length > 0 && <ThreeCard league={league} three={sat.three} />}
      {sat.dunk.length > 0 && <DunkCard league={league} dunk={sat.dunk} />}
    </div>
  );
}
