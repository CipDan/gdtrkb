import type { LicensingModel, PlatformRole, ToolType } from "@/types";
import {
  LICENSING_OPTIONS,
  TOOL_TYPE_OPTIONS,
} from "@/lib/search/staticFacetOptions";

// All search/filter/sort/page/view state lives in the URL (docs/app-spec.md §7.4).
export type SortKey = "name" | "popularity";
export type ViewMode = "grid" | "table";

export interface FilterState {
  q: string;
  type: ToolType | null;
  area: string | null;
  hostOs: string | null;
  target: string | null;
  language: string | null;
  licensing: LicensingModel | null;
  hasBuiltInEditor: boolean | null;
  sort: SortKey;
  view: ViewMode;
  cursor: string | null;
  // Stack of prior page cursors (oldest first), so "prev" works after a
  // reload or shared URL landing on page 2+. `null` entries mean "page 1".
  cursorHistory: (string | null)[];
}

export const DEFAULT_FILTER_STATE: FilterState = {
  q: "",
  type: null,
  area: null,
  hostOs: null,
  target: null,
  language: null,
  licensing: null,
  hasBuiltInEditor: null,
  sort: "name",
  view: "grid",
  cursor: null,
  cursorHistory: [],
};

const TOOL_TYPES = TOOL_TYPE_OPTIONS.map((o) => o.value);
const LICENSING_MODELS = LICENSING_OPTIONS.map((o) => o.value);

// Rejects unrecognized values instead of letting them through as an unsafe
// cast, which would otherwise reach GraphQL as an invalid enum (502).
function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  return (allowed as readonly string[]).includes(value ?? "")
    ? (value as T)
    : null;
}

// Only "true"/"false" are valid; anything else (missing, malformed, or
// mistyped) is treated as absent instead of silently becoming `false`.
function parseBoolean(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function parseFilterState(params: URLSearchParams): FilterState {
  return {
    q: params.get("q") ?? DEFAULT_FILTER_STATE.q,
    type: parseEnum(params.get("type"), TOOL_TYPES),
    area: params.get("area"),
    hostOs: params.get("hostOs"),
    target: params.get("target"),
    language: params.get("language"),
    licensing: parseEnum(params.get("licensing"), LICENSING_MODELS),
    hasBuiltInEditor: parseBoolean(params.get("hasBuiltInEditor")),
    sort: (params.get("sort") as SortKey | null) ?? DEFAULT_FILTER_STATE.sort,
    view: (params.get("view") as ViewMode | null) ?? DEFAULT_FILTER_STATE.view,
    cursor: params.get("cursor"),
    cursorHistory: params.getAll("back").map((v) => (v === "" ? null : v)),
  };
}

export function serializeFilterState(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.q) params.set("q", state.q);
  if (state.type) params.set("type", state.type);
  if (state.area) params.set("area", state.area);
  if (state.hostOs) params.set("hostOs", state.hostOs);
  if (state.target) params.set("target", state.target);
  if (state.language) params.set("language", state.language);
  if (state.licensing) params.set("licensing", state.licensing);
  if (state.hasBuiltInEditor !== null)
    params.set("hasBuiltInEditor", String(state.hasBuiltInEditor));
  if (state.sort !== DEFAULT_FILTER_STATE.sort) params.set("sort", state.sort);
  if (state.view !== DEFAULT_FILTER_STATE.view) params.set("view", state.view);
  if (state.cursor) params.set("cursor", state.cursor);
  for (const c of state.cursorHistory) params.append("back", c ?? "");

  return params;
}

// Maps HOST_OS role facet values used by the tool_platform join (docs/schema-spec.md §2).
export const PLATFORM_FACET_ROLES: Record<"hostOs" | "target", PlatformRole> =
  {
    hostOs: "HOST_OS",
    target: "TARGET",
  };
