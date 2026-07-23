"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import ToolGraph from "@/components/graph/ToolGraph";
import ToolGraphFallback from "@/components/graph/ToolGraphFallback";
import type { ToolGraphEdge, ToolGraphNode } from "@/components/graph/types";
import type { ToolDetail } from "@/lib/graphql/types";

// Relationships panel (app-spec §8 item 9 / phosphor-hifi-mock.html
// .graph-wrap + .fallback). Shapes this tool's 1-hop neighborhood
// (tool.relationships) into ToolGraph's generic {nodes, edges} contract —
// that shaping is detail-page-specific, so it lives here rather than in the
// reusable graph/ folder (architecture.md §2).
export default function Relationships({ tool }: { tool: ToolDetail }) {
  const router = useRouter();

  const { nodes, edges } = useMemo(() => {
    const neighbors = new Map<string, ToolGraphNode>();
    for (const rel of tool.relationships) {
      for (const candidate of [rel.sourceTool, rel.targetTool]) {
        if (candidate.slug !== tool.slug) neighbors.set(candidate.slug, candidate);
      }
    }

    const nodes: ToolGraphNode[] = [
      { slug: tool.slug, name: tool.name, type: tool.type, logoImageUrl: tool.logoImageUrl },
      ...neighbors.values(),
    ];
    const edges: ToolGraphEdge[] = tool.relationships.map((rel) => ({
      source: rel.sourceTool.slug,
      target: rel.targetTool.slug,
      type: rel.type,
      note: rel.note,
      mirrored: rel.mirrored,
    }));

    return { nodes, edges };
  }, [tool]);

  return (
    <div className="border border-line">
      <div className="border-b border-dotted border-line px-3 py-1.5 text-[16px] uppercase tracking-wide text-bright">
        {"// relationships"}
      </div>

      {edges.length === 0 ? (
        <p className="p-3 text-[16px] text-dim">No known relationships yet.</p>
      ) : (
        <>
          <div className="p-3">
            <ToolGraph
              nodes={nodes}
              edges={edges}
              focusSlug={tool.slug}
              onNodeClick={(slug) => router.push(`/tools/${slug}`)}
            />
          </div>
          <ToolGraphFallback nodes={nodes} edges={edges} />
        </>
      )}
    </div>
  );
}
