import "server-only";
import { toGraphqlEnum } from "@/lib/graphql/enumCasing";
import { PLATFORM_FACET_ROLES } from "@/lib/search/filterState";
import type { FilterState, SortKey } from "@/lib/search/filterState";

export type ToolFilterInput = { and: Record<string, unknown>[] } | undefined;

// Mirrors the filter shape given verbatim in docs/app-spec.md §4 — facet
// clauses are added only when the corresponding facet is actually selected.
export function buildToolFilter(
  state: FilterState,
  areaSlugs: string[] | null,
): ToolFilterInput {
  const and: Record<string, unknown>[] = [];

  const q = state.q.trim();
  if (q) {
    and.push({
      or: [
        { name: { includesInsensitive: q } },
        { summary: { includesInsensitive: q } },
      ],
    });
  }

  if (state.type) {
    and.push({ type: { equalTo: toGraphqlEnum(state.type) } });
  }

  if (state.licensing) {
    and.push({ licensingModel: { equalTo: toGraphqlEnum(state.licensing) } });
  }

  if (state.hasBuiltInEditor !== null) {
    and.push({ hasBuiltInEditor: { equalTo: state.hasBuiltInEditor } });
  }

  if (state.hostOs) {
    and.push({
      toolPlatforms: {
        some: {
          role: { equalTo: PLATFORM_FACET_ROLES.hostOs },
          platform: { slug: { equalTo: state.hostOs } },
        },
      },
    });
  }

  if (state.target) {
    and.push({
      toolPlatforms: {
        some: {
          role: { equalTo: PLATFORM_FACET_ROLES.target },
          platform: { slug: { equalTo: state.target } },
        },
      },
    });
  }

  // Parent-includes-children rollup: `areaSlugs` is the selected area plus
  // all of its descendants, resolved via area_of_use_descendants (schema-spec
  // §4.9) before this function is called.
  if (state.area && areaSlugs && areaSlugs.length > 0) {
    and.push({
      toolAreaOfUses: { some: { areaOfUse: { slug: { in: areaSlugs } } } },
    });
  }

  if (state.language) {
    and.push({
      toolLanguages: {
        some: { language: { slug: { equalTo: state.language } } },
      },
    });
  }

  return and.length > 0 ? { and } : undefined;
}

export function buildOrderBy(sort: SortKey): string[] {
  return sort === "popularity"
    ? ["CONFIRMED_COMMERCIAL_TITLES_COUNT_DESC"]
    : ["NAME_ASC"];
}
