// All-Star Saturday on the Awards tab: the Three-Point Contest (each shooter's first round and the
// final) and the Slam Dunk Contest (every dunk with its score and what it was). Names and teams are
// as they were that day; a player still in the save links to his page.
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Target, Zap } from 'lucide-react';
import type { Dunk, Dunker, League, SeasonAwards, ThreeShooter } from '../../core/types';
import { TeamLogo } from '../components/TeamLogo';
import { Card } from '../components/ui';

/** "Kon Knueppel" → "K. Knueppel", from the name as it was. */
const short = (name: string) => {
  const i = name.indexOf(' ');
  return i > 0 ? `${name[0]}. ${name.slice(i + 1)}` : name;
};

function Who({ league, e, win }: { league: League; e: { pid: number; name: string; tid: number }; win?: boolean }) {
  const label = <span className={`bold ellipsis ${win ? 'lg-sat-win' : ''}`}>{short(e.name)}</span>;
  return (
    <span className="row" style={{ gap: 6, minWidth: 0 }}>
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
  return <div className="tiny dim">{children}</div>;
}

function ThreeCard({ league, three }: { league: League; three: ThreeShooter[] }) {
  const r1Off = tiebreak(three, (e) => e.r1Off);
  const finalOff = tiebreak(three, (e) => e.finalOff);
  return (
    <Card
      title={
        <h3>
          <Target size={15} /> Three-Point Contest
        </h3>
      }
    >
      <Head />
      {three.map((e, i) => (
        <div key={e.pid} className="lg-sat-row">
          <span className={`tiny bold ${i === 0 ? 'lg-sat-win' : 'dim'}`}>{i + 1}</span>
          <Who league={league} e={e} win={i === 0} />
          <span className={`num ${e.final === undefined ? 'bold' : 'dim'}`}>{e.r1}</span>
          <span className="num bold">{e.final ?? ''}</span>
        </div>
      ))}
      <div className="col" style={{ gap: 2, marginTop: 6 }}>
        {r1Off && <Note>Shoot-off for the final: {r1Off}</Note>}
        {finalOff && <Note>Shoot-off for the title: {finalOff}</Note>}
        <Note>27 balls a round, 40 points at most: four racks of four plus a money ball, a rack of money balls, two deep threes.</Note>
      </div>
    </Card>
  );
}

const total = (ds: Dunk[] | undefined) => (ds ?? []).reduce((a, d) => a + d.score, 0);

function DunkList({ label, dunks }: { label: string; dunks?: Dunk[] }) {
  if (!dunks?.length) return null;
  return (
    <>
      {dunks.map((d, i) => (
        <Fragment key={i}>
          <span className="tiny dim upper">{i === 0 ? label : ''}</span>
          <span className={`num bold ${d.score === 50 ? 'lg-sat-win' : ''}`}>{d.score}</span>
          <span className="tiny dim2">
            {d.text}
            {d.miss && <span className="lg-sat-miss"> · couldn't finish it</span>}
          </span>
        </Fragment>
      ))}
    </>
  );
}

function DunkCard({ league, dunk }: { league: League; dunk: Dunker[] }) {
  return (
    <Card
      title={
        <h3>
          <Zap size={15} /> Slam Dunk Contest
        </h3>
      }
    >
      <Head />
      {dunk.map((e, i) => (
        <div key={e.pid} className="lg-sat-dunker">
          <div className="lg-sat-row">
            <span className={`tiny bold ${i === 0 ? 'lg-sat-win' : 'dim'}`}>{i + 1}</span>
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
      <Note>Five judges give each dunk 6-10. Two dunks a round; ties go to a dunk-off.</Note>
    </Card>
  );
}

/** The day's two contests, side by side on a wide screen. */
export function AllStarSaturday({ league, aw }: { league: League; aw: SeasonAwards }) {
  const sat = aw.saturday;
  if (!sat || (!sat.three.length && !sat.dunk.length)) return null;
  return (
    <div className="md-grid2" style={{ display: 'grid', gap: 14 }}>
      {sat.three.length > 0 && <ThreeCard league={league} three={sat.three} />}
      {sat.dunk.length > 0 && <DunkCard league={league} dunk={sat.dunk} />}
    </div>
  );
}
