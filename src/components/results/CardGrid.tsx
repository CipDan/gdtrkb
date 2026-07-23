import ToolCard from "@/components/results/ToolCard";
import type { ResultsViewProps } from "@/components/results/types";

// Default results view (app-spec §7.5 / phosphor-hifi-mock.html .cardgrid).
export default function CardGrid({ nodes, loading, error }: ResultsViewProps) {
  if (error) return null;
  if (!loading && nodes.length === 0) return null;

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}
      aria-busy={loading}
    >
      {nodes.map((tool) => (
        <ToolCard key={tool.slug} tool={tool} />
      ))}
    </div>
  );
}
