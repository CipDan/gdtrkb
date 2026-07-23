import { licensingShortLabel } from "@/lib/format";
import type { LicensingModel } from "@/types";

// Licensing tag (design-tokens-3-phosphor.md §1/§4): bracketed text in
// --ink, never a colored pill — licensing meaning is carried by the label,
// not by color, to keep the monochrome discipline.
export default function LicensingTag({ model }: { model: LicensingModel }) {
  return <span className="text-[15px] text-ink">[{licensingShortLabel(model)}]</span>;
}
