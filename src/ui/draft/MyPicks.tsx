// Your picks in this draft (and yours that other teams hold), and after the draft its results: the
// class in review (your haul graded, the best value and the biggest reach), then every pick by round.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { DraftPick, League, Player } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { ordinal, plural } from '../../core/format';
import { TeamLogo } from '../components/TeamLogo';
import { OvrPot } from '../office/common';
import { useLeagueMemo } from '../../state/store';
import { Empty, Help, Section, Segmented } from '../components/ui';
import { pickProjection } from '../league/shared';
import { PickRow } from '../league/PicksList';
import { PICK_RANGE_NOTE, draftedThisYear, gradeTone, lotteryHidden, pickGrade, pickOrder, pickSlot, picksText, projectedSlot, type PickGrade } from './common';
import { SelectionRow } from './rows';

/**
 * The draft desk's poster until the lottery: this year's first pick of yours as big as it fits
 * (its projection from the standings, or its slot), the rest of your picks under it in mono.
 */
export function PicksPoster({ league }: { league: League }) {
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  const mine = league.draftPicks.filter((d) => d.tid === league.userTid && d.season === league.season).sort(pickOrder(league, proj));
  const first = mine[0];
  const slot = first ? pickSlot(league, first, proj) : undefined;
  const rest = mine.slice(1);
  return (
    <section className="slab dn-poster" aria-label={`The ${league.season} draft`}>
      <span className="over">{league.season} draft</span>
      {!first ? (
        <h2 className="dn-poster-h">No picks this year</h2>
      ) : slot !== undefined ? (
        <>
          <span className="dn-poster-n num">#{slot}</span>
          <span className="dn-poster-k">{first.pick ? 'Your first pick' : 'Your first pick, as of today'}</span>
        </>
      ) : (
        <>
          <span className="dn-poster-n num">{mine.length}</span>
          <span className="dn-poster-k">{mine.length === 1 ? 'pick this year' : 'picks this year'}</span>
        </>
      )}
      {first && slot !== undefined && rest.length > 0 && <span className="dn-poster-s">Then {picksText(league, rest, proj)}</span>}
    </section>
  );
}

export function MyPicks({ league }: { league: League }) {
  const user = league.userTid;
  // picks without a slot yet, projected as on the team page (see pickProjText)
  const projected = useLeagueMemo(() => projectedSlot(league), [league]);
  // until the lottery's reveal has been watched, the picks show without their slots (and in no order that gives them away)
  const hidden = lotteryHidden(league);
  const proj = hidden ? () => undefined : projected;
  const view = (d: DraftPick): DraftPick => (hidden ? { ...d, pick: undefined } : d);
  // this draft's picks in the order every pick list uses (the later ones live with the moves log: Office → Picks & moves)
  const order = pickOrder(league, proj);
  const owned = league.draftPicks
    .filter((d) => d.tid === user && d.season === league.season)
    .map(view)
    .sort(order);
  const owed = league.draftPicks
    .filter((d) => d.originalTid === user && d.tid !== user && d.season === league.season)
    .map(view)
    .sort(order);
  const drafted = draftedThisYear(league).filter((p) => p.draft.tid === user);
  return (
    <>
      {drafted.length > 0 && (
        <Section title="Drafted this year">
          <div className="card flush list">
            {drafted.map((p) => (
              <SelectionRow key={p.pid} league={league} p={p} />
            ))}
          </div>
        </Section>
      )}
      <Section
        title={`Your ${league.season} picks · ${owned.length}`}
        right={
          <Link to="/office/assets" className="card-link">
            Future picks <ChevronRight size={14} />
          </Link>
        }
      >
        {owned.length === 0 ? (
          <Empty>No picks left in this draft.</Empty>
        ) : (
          <div className="card flush list">
            {owned.map((d) => (
              <PickRow key={d.dpid} league={league} d={d} hidden={hidden} />
            ))}
          </div>
        )}
        {hidden ? (
          <div className="tiny dim">Where they land shows once you reveal the lottery.</div>
        ) : (
          owned.some((d) => proj(d) !== undefined) && (
            <div className="tiny dim row">
              Ranges hold three times in five. <Help title="Projected picks">{PICK_RANGE_NOTE}</Help>
            </div>
          )
        )}
      </Section>
      {owed.length > 0 && (
        <Section title={`Owed to others · ${owed.length}`}>
          <div className="card flush list">
            {owed.map((d) => (
              <PickRow key={d.dpid} league={league} d={d} hidden={hidden} owner />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ results (after the draft)

/**
 * The class in review, by the big board: your haul with each pick's grade and a verdict on the
 * night, the best value and the biggest reach around the league, and the No. 1 pick.
 */
function DraftRecap({ league, list }: { league: League; list: Player[] }) {
  const graded = list.map((p) => ({ p, g: pickGrade(league, p) })).filter((x): x is { p: Player; g: PickGrade } => !!x.g);
  const mine = graded.filter((x) => x.p.draft.tid === league.userTid);
  const others = graded.filter((x) => x.p.draft.round === 1 || x.g.overall <= 45);
  const value = [...others].sort((a, b) => b.g.by - a.g.by)[0];
  const reach = [...others].filter((x) => x.p.draft.round === 1).sort((a, b) => a.g.by - b.g.by)[0];
  const steals = mine.filter((x) => x.g.label === 'Steal' || x.g.label === 'Value').length;
  const reaches = mine.filter((x) => x.g.label === 'Reach' || x.g.label === 'Big reach').length;
  const verdict = !mine.length
    ? 'No picks this year.'
    : reaches === 0 && steals
      ? `${plural(steals, 'pick')} went well after where the board had ${steals > 1 ? 'them' : 'him'}. A night the scouts will like.`
      : reaches > steals
        ? `Off the board ${reaches > 1 ? `${reaches} times` : 'once'}. Your scouts saw something the consensus didn't.`
        : 'A night that went to the board, more or less.';
  const first = list.find((p) => p.draft.round === 1 && p.draft.pick === 1);
  const row = (label: string, x: { p: Player; g: PickGrade }) => (
    <Link key={label} to={`/player/${x.p.pid}`} className="listrow fo-sel">
      <span className="fo-rank">{x.g.overall}</span>
      <TeamLogo tid={x.p.draft.tid ?? 0} size={28} decorative />
      <div className="grow">
        <div className="fo-meta">{label}</div>
        <div className="fo-name">{playerName(x.p)}</div>
        <div className="dn-grade">
          <span className={`tag ${gradeTone(x.g)}`}>
            {x.g.label} · ranked {ordinal(x.g.rank)}
          </span>
        </div>
      </div>
      <OvrPot p={x.p} />
    </Link>
  );
  return (
    <>
      <Section title="Your haul">
        <div className="card flush list">
          {mine.map((x) => (
            <SelectionRow key={x.p.pid} league={league} p={x.p} />
          ))}
          <div className="dn-verdict">{verdict}</div>
        </div>
      </Section>
      <Section title="Around the league">
        <div className="card flush list">
          {first && row('The No. 1 pick', { p: first, g: pickGrade(league, first) ?? { label: 'Fair', by: 0, rank: 1, overall: 1 } })}
          {value && value.g.by > 0 && row('Best value', value)}
          {reach && reach.g.by < 0 && row('Biggest reach', reach)}
        </div>
      </Section>
    </>
  );
}

export function Results({ league }: { league: League }) {
  const list = useLeagueMemo(() => draftedThisYear(league), [league]);
  const [round, setRound] = useState<1 | 2>(1);
  if (!list.length) return <Empty>No draft results yet.</Empty>;
  return (
    <>
      <DraftRecap league={league} list={list} />
      <Segmented
        label="Round"
        value={String(round) as '1' | '2'}
        onChange={(x) => setRound(Number(x) as 1 | 2)}
        options={[
          { id: '1', label: '1st round' },
          { id: '2', label: '2nd round' },
        ]}
      />
      <div className="card flush list">
        {list
          .filter((p) => p.draft.round === round)
          .map((p) => (
            <SelectionRow key={p.pid} league={league} p={p} />
          ))}
      </div>
    </>
  );
}
