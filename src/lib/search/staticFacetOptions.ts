import type { LicensingModel, ToolType } from "@/types";

// Static enum-backed facet option lists (app-spec §5 item 3: "the static
// enum lists for type and licensing"). Values mirror schema-spec.md §3.
export const TOOL_TYPE_OPTIONS: { value: ToolType; label: string }[] = [
  { value: "game_engine", label: "game engine" },
  { value: "framework_library", label: "framework / library" },
  { value: "asset_creator", label: "asset creator" },
  { value: "asset_marketplace", label: "asset marketplace" },
  { value: "asset_library", label: "asset library" },
  { value: "middleware", label: "middleware" },
  { value: "ide_editor", label: "ide / editor" },
];

export const LICENSING_OPTIONS: { value: LicensingModel; label: string }[] = [
  { value: "free_open_source", label: "free / open source" },
  { value: "free_proprietary", label: "free / proprietary" },
  { value: "paid_one_time", label: "paid" },
  { value: "subscription", label: "subscription" },
  { value: "royalty_based", label: "royalty-based" },
  { value: "tiered", label: "tiered" },
];
