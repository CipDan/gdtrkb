"use client";

import { useRef, useState } from "react";

const DEBOUNCE_MS = 300;

// Command bar (app-spec §7.1 / phosphor-hifi-mock.html .cmdbar). Debounced
// as you type; Enter or the run button submits immediately.
export default function SearchBar({
  value,
  onSubmit,
}: {
  value: string;
  onSubmit: (q: string) => void;
}) {
  const [text, setText] = useState(value);
  // Resync local text when `value` changes externally (e.g. clear filters),
  // without an Effect — React's documented "adjusting state on prop change"
  // pattern (setState during render is safe/expected here).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSubmit(next: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onSubmit(next), DEBOUNCE_MS);
  }

  function submitNow() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onSubmit(text);
  }

  return (
    <form
      className="flex items-center border border-line"
      onSubmit={(event) => {
        event.preventDefault();
        submitNow();
      }}
    >
      <span className="py-0 pl-3 pr-1.5 text-bright">&gt;</span>
      <input
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          scheduleSubmit(event.target.value);
        }}
        placeholder="search tools by name or summary"
        aria-label="Search tools by name or summary"
        className="flex-1 bg-transparent px-1.5 py-2 text-[19px] text-ink placeholder:text-dim focus-visible:outline-none"
      />
      <span className="hidden border-l border-line px-2.5 text-[15px] text-dim sm:inline">
        name + summary
      </span>
      <button
        type="submit"
        className="border-l border-line px-4 py-2 text-bright hover:bg-line/40"
      >
        {"> run"}
      </button>
    </form>
  );
}
