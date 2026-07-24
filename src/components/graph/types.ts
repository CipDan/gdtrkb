import type { RelationshipType, ToolType } from "@/types";

// Reusable ToolGraph contract (app-spec §7.7) — mounted on the detail page
// now (app-spec §8.9), reused unchanged by the Phase 2 query-scoped graph
// (app-spec §12).
export interface ToolGraphNode {
  slug: string;
  name: string;
  type: ToolType;
  logoImageUrl: string | null;
}

// `source`/`target` are node slugs, matching `onNodeClick`'s slug argument.
export interface ToolGraphEdge {
  source: string;
  target: string;
  type: RelationshipType;
  note: string | null;
  mirrored: boolean;
}

export interface ToolGraphProps {
  nodes: ToolGraphNode[];
  edges: ToolGraphEdge[];
  onNodeClick: (slug: string) => void;
  // Additive beyond §7.7's minimum contract: highlights the node this page
  // is "about" (phosphor-hifi-mock.html's bright-bordered focus node).
  // Optional so a future peer graph with no single focus (Phase 2's
  // whole-result-set view, §12) can omit it and get an even ring of nodes.
  focusSlug?: string;
}
