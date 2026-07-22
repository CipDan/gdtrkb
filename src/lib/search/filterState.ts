import type { LicensingModel, PlatformRole, ToolType } from "@/types";

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
};

export function parseFilterState(params: URLSearchParams): FilterState {
  return {
    q: params.get("q") ?? DEFAULT_FILTER_STATE.q,
    type: (params.get("type") as ToolType | null) ?? null,
    area: params.get("area"),
    hostOs: params.get("hostOs"),
    target: params.get("target"),
    language: params.get("language"),
    licensing: (params.get("licensing") as LicensingModel | null) ?? null,
    hasBuiltInEditor: params.has("hasBuiltInEditor")
      ? params.get("hasBuiltInEditor") === "true"
      : null,
    sort: (params.get("sort") as SortKey | null) ?? DEFAULT_FILTER_STATE.sort,
    view: (params.get("view") as ViewMode | null) ?? DEFAULT_FILTER_STATE.view,
    cursor: params.get("cursor"),
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

  return params;
}

// Maps HOST_OS role facet values used by the tool_platform join (docs/schema-spec.md §2).
export const PLATFORM_FACET_ROLES: Record<"hostOs" | "target", PlatformRole> =
  {
    hostOs: "HOST_OS",
    target: "TARGET",
  };
