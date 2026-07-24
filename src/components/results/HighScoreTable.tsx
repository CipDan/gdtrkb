import Link from "next/link";
import LicensingTag from "@/components/ui/LicensingTag";
import { toolTypeLabel } from "@/lib/format";
import type { ResultsViewProps } from "@/components/results/types";

// "High-score board" table view (app-spec §7.6 / phosphor-hifi-mock.html .hsb).
// Rendered in whatever order the current sort (name / popularity) produced —
// rank is this page's row position, not a global catalog rank.
export default function HighScoreTable({ nodes, loading, error }: ResultsViewProps) {
  if (error) return null;
  if (!loading && nodes.length === 0) return null;

  return (
    // The 5 columns' unbreakable words (e.g. "marketplace", "Substance") don't
    // fit a phone-width viewport at once; scope the scroll to the table
    // itself instead of letting it force the whole page to scroll sideways.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-line" aria-busy={loading}>
        <caption className="px-2.5 py-1.5 text-left text-[16px] text-dim">
          {"// high scores"}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-9 border-b border-line px-3 py-1.5 text-left text-[17px] font-normal text-bright">
              #
            </th>
            <th scope="col" className="border-b border-line px-3 py-1.5 text-left text-[17px] font-normal text-bright">
              tool
            </th>
            <th scope="col" className="border-b border-line px-3 py-1.5 text-left text-[17px] font-normal text-bright">
              type
            </th>
            <th scope="col" className="border-b border-line px-3 py-1.5 text-left text-[17px] font-normal text-bright">
              licensing
            </th>
            <th scope="col" className="border-b border-line px-3 py-1.5 text-right text-[17px] font-normal text-bright">
              titles
            </th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((tool, index) => (
            <tr key={tool.slug}>
              <td className="border-b border-dotted border-line px-3 py-1.5 text-[17px] text-bright">
                {index + 1}
              </td>
              <td className="border-b border-dotted border-line px-3 py-1.5 text-[17px] text-pale">
                <Link href={`/tools/${tool.slug}`} className="hover:underline">
                  {tool.name}
                </Link>
              </td>
              <td className="border-b border-dotted border-line px-3 py-1.5 text-[17px] text-ink">
                {toolTypeLabel(tool.type)}
              </td>
              <td className="border-b border-dotted border-line px-3 py-1.5 text-[17px]">
                <LicensingTag model={tool.licensingModel} />
              </td>
              <td className="border-b border-dotted border-line px-3 py-1.5 text-right text-[17px] text-pale">
                {tool.confirmedCommercialTitlesCount ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
