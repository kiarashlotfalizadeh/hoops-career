// The news's kinds: each one's label, icon and colour, the same on the wire, the front page and the reader.
import {
  ArrowLeftRight,
  BookOpen,
  ClipboardList,
  Flame,
  HeartPulse,
  Hourglass,
  ListOrdered,
  Medal,
  Megaphone,
  Newspaper,
  PenLine,
  Telescope,
  Trophy,
  UserMinus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { NewsItem } from '../../../core/types';

export type Kind = NewsItem['kind'];

export const NEWS_KIND: Record<Kind, { label: string; icon: LucideIcon; color: string }> = {
  trade: { label: 'Trades', icon: ArrowLeftRight, color: 'var(--info)' },
  rumor: { label: 'Rumors', icon: Megaphone, color: 'var(--warn)' },
  signing: { label: 'Signings', icon: PenLine, color: 'var(--good)' },
  release: { label: 'Releases', icon: UserMinus, color: 'var(--text-2)' },
  injury: { label: 'Injuries', icon: HeartPulse, color: 'var(--bad)' },
  award: { label: 'Awards', icon: Trophy, color: 'var(--tier-elite)' },
  draft: { label: 'Draft', icon: ListOrdered, color: 'var(--tier-star)' },
  milestone: { label: 'Milestones', icon: Flame, color: 'var(--warn)' },
  record: { label: 'Records', icon: BookOpen, color: 'var(--tier-elite)' },
  coach: { label: 'Coaches', icon: ClipboardList, color: 'var(--info)' },
  retire: { label: 'Retirements', icon: Hourglass, color: 'var(--text-2)' },
  general: { label: 'General', icon: Newspaper, color: 'var(--text-2)' },
  game: { label: 'Games', icon: Zap, color: 'var(--accent-text)' },
  power: { label: 'Power rankings', icon: ListOrdered, color: 'var(--info)' },
  honor: { label: 'Honors', icon: Medal, color: 'var(--tier-elite)' },
  column: { label: 'Columns', icon: PenLine, color: 'var(--text-2)' },
  preview: { label: 'Previews', icon: Telescope, color: 'var(--info)' },
};

/** One kind's name for a single story ("Trade", "Power rankings"). */
export const KIND_ONE: Record<Kind, string> = {
  trade: 'Trade',
  rumor: 'Rumor mill',
  signing: 'Signing',
  release: 'Release',
  injury: 'Injury',
  award: 'Awards',
  draft: 'Draft',
  milestone: 'Milestone',
  record: 'Record',
  coach: 'Coaches',
  retire: 'Retirements',
  general: 'League',
  game: 'Game',
  power: 'Power rankings',
  honor: 'Honors',
  column: 'Column',
  preview: 'Preview',
};
