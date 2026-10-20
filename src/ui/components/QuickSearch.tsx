// The top bar's search: any player, team, screen or glossary word, a few letters away. Arrow keys
// and Enter work from the box; Ctrl/⌘ K or "/" opens it from anywhere (App's TopBar).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, LayoutGrid, Search } from 'lucide-react';
import { useLeague, useLeagueMemo } from '../../state/store';
import { loadRecent, saveRecent, search, searchIndex, type SearchEntry, type SearchKind } from '../search';
import { TeamLogo } from './TeamLogo';
import { Ovr, Sheet } from './ui';
import './search.css';

const KIND_LABEL: Record<SearchKind, string> = { player: 'Player', team: 'Team', screen: 'Screen', term: 'Glossary' };
/** Before anything's been searched: the screens players reach for most, the season's own first. */
const JUMP_TO = ['s:/league/standings', 's:/team/tactics', 's:/team/rotation', 's:/office/trade', 's:/office/free-agents', 's:/league/stats'];
const JUMP_PHASE: Partial<Record<string, string>> = {
  playin: 's:/league/playoffs',
  playoffs: 's:/league/playoffs',
  draftLottery: 's:/office/draft',
  draft: 's:/office/draft',
  resign: 's:/office/resign',
  freeAgency: 's:/office/free-agents',
};

export function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const league = useLeague();
  const nav = useNavigate();
  const index = useLeagueMemo(() => searchIndex(league), [league]);
  const byId = useMemo(() => new Map(index.map((e) => [e.id, e])), [index]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [term, setTerm] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const recent = useMemo(
    () => (open ? loadRecent(league.id).flatMap((id) => byId.get(id) ?? []) : []),
    // read again each time it opens
    [open, league.id, byId],
  );
  const jump = useMemo(() => {
    const first = JUMP_PHASE[league.phase];
    const ids = first ? [first, ...JUMP_TO.filter((id) => id !== first)].slice(0, JUMP_TO.length) : JUMP_TO;
    return ids.flatMap((id) => byId.get(id) ?? []);
  }, [byId, league.phase]);
  const hits = useMemo(() => (q.trim() ? search(index, q) : recent.length ? recent : jump), [index, q, recent, jump]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
    setTerm(null);
    // the sheet focuses itself as it opens: the box takes it right after
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (e: SearchEntry, to = e.to) => {
    saveRecent(league.id, e.id);
    if (e.kind === 'term') {
      setTerm((t) => (t === e.id ? null : e.id));
      return;
    }
    onClose();
    if (to) nav(to);
  };
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const n = hits.length;
      if (n) setActive((a) => (a + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (ev.key === 'Enter' && hits[active]) {
      ev.preventDefault();
      go(hits[active]);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Search">
      <div className="qs-box">
        <Search size={18} className="dim" aria-hidden="true" />
        <input
          ref={input}
          className="input qs-input"
          type="search"
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          placeholder="Players, teams, screens, terms"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="qs-results"
          aria-activedescendant={hits[active] ? `qs-${hits[active].id}` : undefined}
          aria-label="Search the league"
        />
      </div>
      {!q.trim() && <div className="qs-over over">{recent.length ? 'Recent' : 'Jump to'}</div>}
      <div ref={list} id="qs-results" className="qs-list" role="listbox" aria-label="Results">
        {hits.map((e, i) => (
          <div key={e.id} className="qs-item">
            <div className={`qs-row ${i === active ? 'on' : ''}`} data-i={i}>
              <button type="button" id={`qs-${e.id}`} role="option" aria-selected={i === active} className="qs-main" onMouseMove={() => setActive(i)} onClick={() => go(e)}>
                <span className="qs-ico" aria-hidden="true">
                  {e.kind === 'player' && e.ovr !== undefined ? (
                    <Ovr v={e.ovr} size="sm" />
                  ) : e.kind === 'team' ? (
                    <TeamLogo tid={Number(e.id.slice(2))} size={26} decorative />
                  ) : e.kind === 'term' ? (
                    <BookOpen size={17} />
                  ) : e.kind === 'screen' ? (
                    <LayoutGrid size={17} />
                  ) : null}
                </span>
                <span className="grow">
                  <span className="qs-t ellipsis">{e.title}</span>
                  <span className={`qs-m ${term === e.id ? '' : 'ellipsis'}`}>
                    <span className="sr-only">{KIND_LABEL[e.kind]}: </span>
                    {e.meta}
                  </span>
                </span>
                {e.kind !== 'term' && <ChevronRight size={16} className="dim" aria-hidden="true" />}
              </button>
              {e.alt && (
                <button type="button" className="btn xs qs-alt" onClick={() => go(e, e.alt!.to)} aria-label={`${e.alt.label}: ${e.title}`}>
                  {e.alt.label}
                </button>
              )}
            </div>
          </div>
        ))}
        {q.trim() && !hits.length && <div className="empty small">Nothing matches “{q.trim()}”.</div>}
      </div>
    </Sheet>
  );
}
