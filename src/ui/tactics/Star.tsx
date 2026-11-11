// The fit star: one drawn mark (not the font's ★ glyph, which sits low and prints thin), sized by
// the text around it and in its colour. Used by the board's plates, the bench, a player's role list
// and his highlights.
import './star.css';

export function Star({ dim, className = '' }: { dim?: boolean; className?: string }) {
  return (
    <svg className={`tx-star${dim ? ' dim' : ''} ${className}`} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 1.6l2.47 5.2 5.68.75-4.15 3.96 1.04 5.65L10 14.4l-5.04 2.76L6 11.51 1.85 7.55l5.68-.75z" />
    </svg>
  );
}
