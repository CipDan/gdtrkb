import Link from "next/link";
import type { PopularityChartData } from "@/lib/graphql/types";

// Popularity bar chart (app-spec §6/§8.8 / phosphor-hifi-mock.html .chart).
// Hand-built HTML/CSS bars rather than a chart library: the mock's chart is
// a plain filled-track bar per row, which a library like Recharts would be
// harder to match pixel-for-pixel than to just build directly.
export default function PopularityChart({ data }: { data: PopularityChartData }) {
  const { topTools, missingCount } = data;
  const max = topTools.length > 0 ? topTools[0].confirmedCommercialTitlesCount : 0;

  return (
    <div className="mt-6 border border-line">
      <div className="border-b border-dotted border-line px-3 py-1.5 text-[16px] uppercase tracking-wide text-bright">
        {"// popularity — confirmed titles"}
      </div>
      <div className="p-3">
        {topTools.length === 0 ? (
          <p className="text-[16px] text-dim">No confirmed-title figures yet.</p>
        ) : (
          topTools.map((tool, index) => {
            const width = max > 0 ? Math.round((tool.confirmedCommercialTitlesCount / max) * 100) : 0;
            return (
              <div
                key={tool.slug}
                className="grid items-center gap-3 py-1"
                style={{ gridTemplateColumns: "150px 1fr 64px" }}
              >
                <Link href={`/tools/${tool.slug}`} className="truncate text-[17px] text-ink hover:underline">
                  {tool.name}
                </Link>
                <span className="relative block h-4 border border-line">
                  <span
                    className={`absolute inset-y-0 left-0 ${index === 0 ? "bg-pale" : "bg-ink"}`}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="text-right text-[17px] text-pale">
                  {tool.confirmedCommercialTitlesCount}
                </span>
              </div>
            );
          })
        )}
        {missingCount > 0 && (
          <p className="mt-2.5 text-[14px] text-dim">
            {missingCount} tool{missingCount === 1 ? "" : "s"} have no confirmed-title figure and
            are omitted from the chart.
          </p>
        )}
      </div>
    </div>
  );
}
