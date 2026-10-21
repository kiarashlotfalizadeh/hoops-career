// Tactics → Tactic's Partnerships card: the links among your five (who feeds whom, in which action,
// how well it plays and the pair's understanding), the clash with its fix, and the bench's best pair
// in a line. A tap on a link draws it out on the board; the board's lines are its legend.
import { useMemo, useState } from 'react';
import type { Player } from '../../core/types';
import { CLASH_META, GELLED, LINK_META, linkState, type Clash, type Link } from '../../core/sim/links';
import { SHAPE_META, shapeOf } from '../../core/sim/tactics';
import { useLeague } from '../../state/store';
import { Help, Section, Tag } from '../components/ui';
import { Term } from '../components/Glossary';
import { rosterNames } from '../stats';
import { tweak } from './edit';
import { linkKey, linkTone } from './partners';
import './links.css';

/** A link's two players, the passer (or the stopper) first: "Brunson → Towns". */
const pairText = (l: Link, name: (pid: number) => string) => `${name(l.a)} → ${name(l.b)}`;

/** The five's links shown before "more". */
const SHOWN = 4;

export function PartnershipsCard({
  players,
  links,
  clashes,
  bench,
  focus,
  setFocus,
}: {
  players: Player[];
  links: Link[];
  clashes: Clash[];
  /** The bench's best link, if it has one. */
  bench?: Link;
  focus: string | null;
  setFocus: (k: string | null) => void;
}) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const nameOf = useMemo(() => rosterNames(players), [players]);
  const [all, setAll] = useState(false);
  const shown = all ? links : links.slice(0, SHOWN);
  const doublePost = shapeOf(t.offense) === 'twoIn';
  return (
    <Section
      title="Partnerships"
      right={
        <Help title="Partnerships">
          <p>
            Two players whose roles work together on the floor form a <Term id="partnership">partnership</Term>, and the game plays it: a handler and a Rim Runner (two-man game), a
            handler and a Stretch Big (pick-and-pop), a Post Hub and a shooter (inside-out), a Playmaking Hub and a shooter or slasher (handoff chain), a point-of-attack stopper
            and a Rim Anchor (the wall).
          </p>
          <p>
            How much of it they play is what the two bring to it and their <Term id="understanding">understanding</Term>: minutes on the floor together build it, so a pair a trade
            just put together starts low and has it in full at {GELLED}%.
          </p>
          <p>Roles, the shape and who starts make them. Tap one to see it on the board.</p>
        </Help>
      }
    >
      <div className="card flush list tx-links">
        {links.length === 0 && !clashes.length && <div className="tx-empty">None in this five: a handler with a Rim Runner or a Stretch Big makes one.</div>}
        {shown.map((l) => {
          const k = linkKey(l);
          const st = linkState(l);
          const on = focus === k;
          return (
            <button key={k} className={`listrow clickable tx-link-r${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setFocus(on ? null : k)}>
              <span className="grow tx-link-m">
                <span className="tx-link-n ellipsis">{pairText(l, nameOf)}</span>
                <span className="lr-meta ellipsis">
                  {LINK_META[l.id].label} · {st.word === 'Weak' ? st.why.toLowerCase() : `understanding ${Math.round(l.understanding)}%`}
                </span>
              </span>
              <Tag tone={linkTone(l)}>{st.word}</Tag>
            </button>
          );
        })}
        {links.length > shown.length && (
          <button className="tx-links-more" onClick={() => setAll(true)}>
            {links.length - shown.length} more
          </button>
        )}
        {clashes.map((c) => (
          <div key={c.id} className="listrow tx-clash-r">
            <span className="grow tx-link-m">
              <span className="tx-link-n ellipsis">
                <span className="bad">{CLASH_META[c.id].label}</span> · {c.pids.map((pid) => nameOf(pid)).join(', ')}
              </span>
              <span className="lr-meta">Fix: a {SHAPE_META.twoIn.label}, or one of them as a Stretch Big</span>
            </span>
            {!doublePost && (
              <button className="btn xs" onClick={() => tweak((tt) => void (tt.offense.shape = 'twoIn'))}>
                {SHAPE_META.twoIn.label}
              </button>
            )}
          </div>
        ))}
        {bench && (
          <div className="listrow tx-link-bench">
            <span className="grow tx-link-m">
              <span className="tx-link-n ellipsis">{pairText(bench, nameOf)}</span>
              <span className="lr-meta ellipsis">Bench · {LINK_META[bench.id].label}</span>
            </span>
            <span className={`tx-link-w ${linkTone(bench) ?? ''}`}>{linkState(bench).word}</span>
          </div>
        )}
      </div>
    </Section>
  );
}
