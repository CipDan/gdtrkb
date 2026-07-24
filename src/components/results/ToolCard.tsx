import Link from "next/link";
import LogoFrame from "@/components/ui/LogoFrame";
import Badge from "@/components/ui/Badge";
import LicensingTag from "@/components/ui/LicensingTag";
import Tag from "@/components/ui/Tag";
import { toolTypeLabel } from "@/lib/format";
import type { ToolSearchNode } from "@/lib/graphql/types";

// Card grid item ("cartridge", app-spec §7.5 / phosphor-hifi-mock.html .card).
export default function ToolCard({ tool }: { tool: ToolSearchNode }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      aria-label={tool.name}
      className="block border border-line p-3 text-ink no-underline hover:border-ink"
    >
      <div className="flex items-center gap-2.5">
        <LogoFrame name={tool.name} logoImageUrl={tool.logoImageUrl} size={44} />
        <span className="text-[22px] leading-[1.1] text-pale">{tool.name}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge>{toolTypeLabel(tool.type)}</Badge>
        <LicensingTag model={tool.licensingModel} />
      </div>
      <p className="my-2.5 text-[16px] text-dim">{tool.summary}</p>
      {tool.areasOfUse.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {tool.areasOfUse.map((area) => (
            <Tag key={area.slug}>{area.name}</Tag>
          ))}
        </div>
      )}
    </Link>
  );
}
