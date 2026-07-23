import type { ComponentType } from "react";
import CardGrid from "@/components/results/CardGrid";
import HighScoreTable from "@/components/results/HighScoreTable";
import type { ResultsViewProps } from "@/components/results/types";
import type { ViewMode } from "@/lib/search/filterState";

export interface ResultsViewDefinition {
  mode: ViewMode;
  label: string;
  Component: ComponentType<ResultsViewProps>;
}

// The results area is a *set of registered view modes*, not a hardcoded
// grid/table pair (app-spec §7.3, mandatory). Adding the Phase 2 `graph`
// mode later means adding one entry here — nothing that reads this registry
// (ViewSwitch, the results area) needs to change.
export const RESULTS_VIEWS: ResultsViewDefinition[] = [
  { mode: "grid", label: "grid", Component: CardGrid },
  { mode: "table", label: "table", Component: HighScoreTable },
];
