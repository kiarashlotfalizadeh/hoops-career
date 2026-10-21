// A story's text with the players and teams it names as links, and the path that opens a story.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { League, NewsItem } from '../../../core/types';
import { fmtDate, playerName } from '../../../core/league/helpers';
import { teamPath } from '../shared';

/** The story reader's deep link (other screens link here too). */
export const storyPath = (id: number) => `/league/news?story=${id}`;

/** A story's date as the news writes it: "Wed, Feb 11", the year outside this season. */
export const newsDate = (league: League, n: Pick<NewsItem, 'season' | 'day'>, weekday = true) =>
  fmtDate(n.season, n.day, { ...(weekday ? { weekday: 'short' as const } : {}), month: 'short', day: 'numeric', ...(n.season !== league.season ? { year: 'numeric' } : {}) });

/** Where a name sits in a story's text, and where its link goes. */
export interface Mention {
  at: number;
  end: number;
  to: string;
  /** The player or team it names (each linked once). */
  id: string;
}

/** Every place the text names one of the story's players or teams (as a whole word), each player and team linked at its first mention (`linked` carries over between paragraphs). */
export function mentions(league: League, text: string, pids: number[], tids: number[], linked = new Set<string>()): Mention[] {
  const names: { name: string; to: string; id: string }[] = [];
  for (const pid of pids) {
    const p = league.players[pid];
    // his full name, or the last name a story calls him by after it
    if (p) for (const name of [playerName(p), p.lastName.length >= 4 ? p.lastName : '']) names.push({ name, to: `/player/${pid}`, id: `p${pid}` });
  }
  for (const tid of tids) {
    const t = league.teams[tid];
    if (!t) continue;
    for (const name of [`${t.region} ${t.name}`, t.name, t.abbrev]) names.push({ name, to: teamPath(tid), id: `t${tid}` });
  }
  const word = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
  const found: Mention[] = [];
  for (const m of names) {
    if (!m.name) continue;
    for (let at = text.indexOf(m.name); at >= 0; at = text.indexOf(m.name, at + 1)) {
      const end = at + m.name.length;
      if (!word(text[at - 1]) && !word(text[end])) found.push({ at, end, to: m.to, id: m.id });
    }
  }
  // the longest name wins where two overlap ("Los Angeles Lakers" over "Lakers"); then each one once
  found.sort((a, b) => a.at - b.at || b.end - a.end);
  const out: Mention[] = [];
  for (const m of found) {
    if (out.length && m.at < out[out.length - 1].end) continue;
    if (linked.has(m.id)) continue;
    linked.add(m.id);
    out.push(m);
  }
  return out;
}

/** Text with its mentions as links. */
export function linkedText(text: string, ms: Mention[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let from = 0;
  for (const m of ms) {
    if (m.at > from) parts.push(text.slice(from, m.at));
    parts.push(
      <Link key={m.at} to={m.to} className="lg-news-link">
        {text.slice(m.at, m.end)}
      </Link>,
    );
    from = m.end;
  }
  parts.push(text.slice(from));
  return parts;
}
