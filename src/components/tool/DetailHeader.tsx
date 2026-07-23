import Link from "next/link";
import LogoFrame from "@/components/ui/LogoFrame";
import Badge from "@/components/ui/Badge";
import LicensingTag from "@/components/ui/LicensingTag";
import { toolTypeLabel } from "@/lib/format";
import type { ToolDetail } from "@/lib/graphql/types";

// Detail page header (app-spec §8 item 1 / phosphor-hifi-mock.html
// .crumb + .detail-head).
export default function DetailHeader({ tool }: { tool: ToolDetail }) {
  return (
    <>
      <p className="mb-4 text-[16px] text-dim">
        <Link href="/" className="text-bright hover:underline">
          <span aria-hidden="true">{"‹ "}</span>back to index
        </Link>
        {"  ·  GDTRKB / "}
        {tool.slug}
      </p>

      <div className="flex flex-wrap items-start gap-4">
        <LogoFrame name={tool.name} size={64} />
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[34px] leading-[1.1] text-pale">
            {tool.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>{toolTypeLabel(tool.type)}</Badge>
            <LicensingTag model={tool.licensingModel} long />
            <span className="text-[16px] text-ink">
              {"· "}
              {tool.hasBuiltInEditor ? "[✓] built-in editor" : "[ ] no built-in editor"}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
