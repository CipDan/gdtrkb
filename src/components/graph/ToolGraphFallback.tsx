import type { ToolGraphEdge, ToolGraphNode } from "@/components/graph/types";

// Plain text/list fallback for ToolGraph (app-spec §7.7/§8.9): accessible
// regardless of whether the graph renders, and always shown alongside it
// (phosphor-hifi-mock.html's <details open> fallback), not just on failure.
export default function ToolGraphFallback({
  nodes,
  edges,
}: {
  nodes: ToolGraphNode[];
  edges: ToolGraphEdge[];
}) {
  const nameBySlug = new Map(nodes.map((node) => [node.slug, node.name]));

  return (
    <details open className="px-3 pb-3">
      <summary className="cursor-pointer text-[16px] text-bright">relationships (text)</summary>
      <ul className="mt-2 list-none p-0 text-[16px] text-ink">
        {edges.map((edge) => (
          <li key={`${edge.source}-${edge.target}-${edge.type}`} className="py-0.5">
            <span className="text-dim">{"› "}</span>
            {nameBySlug.get(edge.source) ?? edge.source} — {edge.type}{" "}
            {edge.mirrored ? "—" : "→"} {nameBySlug.get(edge.target) ?? edge.target}
            {edge.note && <span className="text-dim"> ({edge.note})</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
