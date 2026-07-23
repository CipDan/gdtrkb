import type { ToolSearchNode } from "@/lib/graphql/types";

// Shared props contract for every registered results view (app-spec §7.3):
// grid and table today, a third `graph` mode slot in Phase 2 — no view
// implementation needs anything beyond this.
export interface ResultsViewProps {
  nodes: ToolSearchNode[];
  loading: boolean;
  error: string | null;
}
