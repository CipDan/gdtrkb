import { licensingLongLabel, licensingShortLabel } from "@/lib/format";
import type { LicensingModel } from "@/types";

// Licensing tag (design-tokens-3-phosphor.md §1/§4): bracketed text in
// --ink, never a colored pill — licensing meaning is carried by the label,
// not by color, to keep the monochrome discipline. `long` renders the full
// label (detail-page header, phosphor-hifi-mock.html .detail-sub .lic)
// instead of the card grid's abbreviated form.
export default function LicensingTag({
  model,
  long = false,
}: {
  model: LicensingModel;
  long?: boolean;
}) {
  return (
    <span className="text-[15px] text-ink">
      [{long ? licensingLongLabel(model) : licensingShortLabel(model)}]
    </span>
  );
}
