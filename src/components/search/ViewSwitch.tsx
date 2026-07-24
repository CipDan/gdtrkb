"use client";

import { RESULTS_VIEWS } from "@/components/results/viewRegistry";
import type { ViewMode } from "@/lib/search/filterState";

// View switch (app-spec §7.3, mandatory pluggable switch / phosphor-hifi-mock.html
// .switch). Renders one button per registered view mode.
export default function ViewSwitch({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <span role="group" aria-label="Result view" className="flex gap-1.5">
      {RESULTS_VIEWS.map((view) => {
        const active = value === view.mode;
        return (
          <button
            key={view.mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(view.mode)}
            className={`px-0.5 text-[16px] ${active ? "text-bright" : "text-dim hover:text-ink"}`}
          >
            {active ? `[${view.label}]` : view.label}
          </button>
        );
      })}
    </span>
  );
}
