import type { LicensingModel, ToolType } from "@/types";
import { LICENSING_OPTIONS, TOOL_TYPE_OPTIONS } from "@/lib/search/staticFacetOptions";

// Short bracketed licensing tags per docs/design/design-tokens-3-phosphor.md
// §1/§4 ("[FREE/OSS]", "[PAID]", ...) — kept lowercase to match the mock.
const LICENSING_SHORT_LABELS: Record<LicensingModel, string> = {
  free_open_source: "free/oss",
  free_proprietary: "free/prop",
  paid_one_time: "paid",
  subscription: "sub",
  royalty_based: "royalty",
  tiered: "tiered",
};

export function licensingShortLabel(model: LicensingModel): string {
  return LICENSING_SHORT_LABELS[model];
}

export function licensingLongLabel(model: LicensingModel): string {
  return LICENSING_OPTIONS.find((option) => option.value === model)?.label ?? model;
}

export function toolTypeLabel(type: ToolType): string {
  return TOOL_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function logoInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
