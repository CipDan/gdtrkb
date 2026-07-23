import Link from "next/link";

// Wordmark (design-tokens-3-phosphor.md §4): VT323 --ink, trailing --bright
// blinking cursor. The blink is gated on prefers-reduced-motion via the
// `.wordmark-cursor` class in globals.css.
export default function Wordmark() {
  return (
    <Link
      href="/"
      className="font-[family-name:var(--font-display)] text-[34px] leading-none tracking-wide text-ink no-underline"
    >
      GDTRKB
      <span className="wordmark-cursor text-bright" aria-hidden="true">
        _
      </span>
    </Link>
  );
}
