import { describe, expect, it } from "vitest";
import { buildOrderBy, buildToolFilter } from "@/lib/search/buildFilter";
import { DEFAULT_FILTER_STATE } from "@/lib/search/filterState";
import type { FilterState } from "@/lib/search/filterState";

function state(patch: Partial<FilterState>): FilterState {
  return { ...DEFAULT_FILTER_STATE, ...patch };
}

describe("buildToolFilter", () => {
  it("returns undefined when no facet or search text is active", () => {
    expect(buildToolFilter(DEFAULT_FILTER_STATE, null)).toBeUndefined();
  });

  it("adds a name/summary OR clause for a trimmed search string", () => {
    const filter = buildToolFilter(state({ q: "  godot  " }), null);
    expect(filter).toEqual({
      and: [
        {
          or: [
            { name: { includesInsensitive: "godot" } },
            { summary: { includesInsensitive: "godot" } },
          ],
        },
      ],
    });
  });

  it("omits the search clause for a blank/whitespace-only query", () => {
    expect(buildToolFilter(state({ q: "   " }), null)).toBeUndefined();
  });

  it("maps type/licensing to uppercase GraphQL enum equalTo clauses", () => {
    const filter = buildToolFilter(
      state({ type: "game_engine", licensing: "free_open_source" }),
      null,
    );
    expect(filter).toEqual({
      and: [
        { type: { equalTo: "GAME_ENGINE" } },
        { licensingModel: { equalTo: "FREE_OPEN_SOURCE" } },
      ],
    });
  });

  it("adds hasBuiltInEditor only when explicitly true or false, not null", () => {
    expect(buildToolFilter(state({ hasBuiltInEditor: true }), null)).toEqual({
      and: [{ hasBuiltInEditor: { equalTo: true } }],
    });
    expect(buildToolFilter(state({ hasBuiltInEditor: false }), null)).toEqual({
      and: [{ hasBuiltInEditor: { equalTo: false } }],
    });
    expect(buildToolFilter(state({ hasBuiltInEditor: null }), null)).toBeUndefined();
  });

  it("filters hostOs/target via toolPlatforms with the matching role", () => {
    expect(buildToolFilter(state({ hostOs: "windows" }), null)).toEqual({
      and: [
        {
          toolPlatforms: {
            some: { role: { equalTo: "HOST_OS" }, platform: { slug: { equalTo: "windows" } } },
          },
        },
      ],
    });
    expect(buildToolFilter(state({ target: "nintendo-switch" }), null)).toEqual({
      and: [
        {
          toolPlatforms: {
            some: {
              role: { equalTo: "TARGET" },
              platform: { slug: { equalTo: "nintendo-switch" } },
            },
          },
        },
      ],
    });
  });

  it("keeps hostOs and target as independent clauses when both are selected", () => {
    // Both facets key off the same `toolPlatforms` relation with a different
    // `role`, so this guards against one clause accidentally overwriting the
    // other instead of both appearing as separate `and` entries.
    const filter = buildToolFilter(state({ hostOs: "windows", target: "web" }), null);
    expect(filter).toEqual({
      and: [
        {
          toolPlatforms: {
            some: { role: { equalTo: "HOST_OS" }, platform: { slug: { equalTo: "windows" } } },
          },
        },
        {
          toolPlatforms: {
            some: { role: { equalTo: "TARGET" }, platform: { slug: { equalTo: "web" } } },
          },
        },
      ],
    });
  });

  it("expands a selected area to the resolved descendant slug set", () => {
    const filter = buildToolFilter(
      state({ area: "asset_creation" }),
      ["asset_creation", "3d_modelling", "2d_art"],
    );
    expect(filter).toEqual({
      and: [
        {
          toolAreaOfUses: {
            some: { areaOfUse: { slug: { in: ["asset_creation", "3d_modelling", "2d_art"] } } },
          },
        },
      ],
    });
  });

  it("falls back to an empty slug set when area is selected but descendants are null", () => {
    const filter = buildToolFilter(state({ area: "asset_creation" }), null);
    expect(filter).toEqual({
      and: [{ toolAreaOfUses: { some: { areaOfUse: { slug: { in: [] } } } } }],
    });
  });

  it("filters language via toolLanguages equalTo", () => {
    expect(buildToolFilter(state({ language: "csharp" }), null)).toEqual({
      and: [{ toolLanguages: { some: { language: { slug: { equalTo: "csharp" } } } } }],
    });
  });

  it("combines every active facet with AND, in the documented order", () => {
    const filter = buildToolFilter(
      state({
        q: "engine",
        type: "game_engine",
        hostOs: "windows",
        language: "csharp",
      }),
      null,
    );
    expect(filter).toEqual({
      and: [
        {
          or: [
            { name: { includesInsensitive: "engine" } },
            { summary: { includesInsensitive: "engine" } },
          ],
        },
        { type: { equalTo: "GAME_ENGINE" } },
        {
          toolPlatforms: {
            some: { role: { equalTo: "HOST_OS" }, platform: { slug: { equalTo: "windows" } } },
          },
        },
        { toolLanguages: { some: { language: { slug: { equalTo: "csharp" } } } } },
      ],
    });
  });
});

describe("buildOrderBy", () => {
  it("orders by popularity (with a stable id tiebreaker) for the popularity sort key", () => {
    expect(buildOrderBy("popularity")).toEqual(["CONFIRMED_COMMERCIAL_TITLES_COUNT_DESC", "ID_ASC"]);
  });

  it("orders by name (with a stable id tiebreaker) for the name sort key", () => {
    expect(buildOrderBy("name")).toEqual(["NAME_ASC", "ID_ASC"]);
  });
});
