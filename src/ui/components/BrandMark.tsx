/**
 * The app's mark: a ball drawn in one fine line (its seams as the printed program draws them), in
 * the text's colour, so it sits beside the wordmark like a printer's ornament rather than a sticker.
 */
export function BrandMark({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      style={{ flex: 'none' }}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <circle cx="24" cy="24" r="21" />
      <path d="M3 24h42M24 3v42" />
      <path d="M9.6 8.8C15.2 14.6 15.2 33.4 9.6 39.2M38.4 8.8C32.8 14.6 32.8 33.4 38.4 39.2" />
    </svg>
  );
}
