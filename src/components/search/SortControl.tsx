"use client";

import { useEffect, useRef, useState } from "react";
import type { SortKey } from "@/lib/search/filterState";

// React.KeyboardEvent / React.FocusEvent below need no import: @types/react
// declares `export as namespace React` — same pattern as FacetPanel.tsx.

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "name a–z" },
  { value: "popularity", label: "popularity" },
];

// Sort control (app-spec §7.2 / phosphor-hifi-mock.html .ctl). A hand-built
// listbox button rather than a native <select>: the closed box themes fully
// via Tailwind, but a <select>'s open dropdown popup is OS-rendered chrome
// that can't be fully restyled to the Phosphor system (no border-line frame,
// no bracket hover rows). Follows the same "focus moves into the popup,
// arrow keys select immediately, Escape/outside-click closes" pattern
// FacetPanel's radiogroups already use for keyboard nav.
export default function SortControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeLabel = SORT_OPTIONS.find((opt) => opt.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function select(next: SortKey) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") buttonRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const currentIndex = SORT_OPTIONS.findIndex((opt) => opt.value === value);
    let nextIndex = currentIndex;
    if (e.key === "ArrowDown") nextIndex = (currentIndex + 1) % SORT_OPTIONS.length;
    if (e.key === "ArrowUp") nextIndex = (currentIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length;
    if (e.key === "Home") nextIndex = 0;
    if (e.key === "End") nextIndex = SORT_OPTIONS.length - 1;
    select(SORT_OPTIONS[nextIndex].value);
  }

  // Closing on blur (Tab away, or any focus move outside the widget) covers
  // cases the pointerdown-outside listener doesn't, e.g. keyboard Tab.
  function onRootBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  }

  return (
    <div ref={rootRef} onBlur={onRootBlur} className="relative flex items-center gap-1 text-[16px] text-dim">
      sort:
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-ink hover:text-bright"
      >
        <b className="font-normal text-ink">{activeLabel}</b>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Sort results"
          aria-activedescendant={`sort-option-${value}`}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute top-full left-0 z-10 mt-1 min-w-full border border-line bg-bg"
        >
          {SORT_OPTIONS.map((opt) => {
            const selected = opt.value === value;
            return (
              <li
                key={opt.value}
                id={`sort-option-${opt.value}`}
                role="option"
                aria-selected={selected}
                onClick={() => select(opt.value)}
                className={`cursor-pointer px-3 py-1 whitespace-nowrap ${
                  selected ? "bg-line text-bright" : "text-ink hover:text-bright"
                }`}
              >
                {selected ? "› " : ""}
                {opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
