"use client";

import type { SortKey } from "@/lib/search/filterState";

const SORT_LABELS: Record<SortKey, string> = {
  name: "name a–z",
  popularity: "popularity",
};

// Sort control (app-spec §7.2 / phosphor-hifi-mock.html .ctl). A native
// <select> for real keyboard/a11y support; the "▾" is decorative only.
export default function SortControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[16px] text-dim">
      sort:
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SortKey)}
        className="border-0 bg-transparent text-ink"
        aria-label="Sort results"
      >
        <option value="name">{SORT_LABELS.name}</option>
        <option value="popularity">{SORT_LABELS.popularity}</option>
      </select>
      <span aria-hidden="true">▾</span>
    </label>
  );
}
