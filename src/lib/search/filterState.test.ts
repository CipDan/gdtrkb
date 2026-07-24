import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER_STATE,
  parseFilterState,
  serializeFilterState,
} from "@/lib/search/filterState";

describe("parseFilterState", () => {
  it("returns the default state for an empty query string", () => {
    expect(parseFilterState(new URLSearchParams())).toEqual(DEFAULT_FILTER_STATE);
  });

  it("parses recognized enum values", () => {
    const state = parseFilterState(
      new URLSearchParams("type=game_engine&licensing=free_open_source&sort=popularity&view=table"),
    );
    expect(state.type).toBe("game_engine");
    expect(state.licensing).toBe("free_open_source");
    expect(state.sort).toBe("popularity");
    expect(state.view).toBe("table");
  });

  it("rejects unrecognized enum values instead of passing them through", () => {
    const state = parseFilterState(
      new URLSearchParams("type=not_a_real_type&sort=alphabetical&view=graph"),
    );
    expect(state.type).toBeNull();
    expect(state.sort).toBe(DEFAULT_FILTER_STATE.sort);
    expect(state.view).toBe(DEFAULT_FILTER_STATE.view);
  });

  it("parses hasBuiltInEditor strictly as true/false, else null", () => {
    expect(parseFilterState(new URLSearchParams("hasBuiltInEditor=true")).hasBuiltInEditor).toBe(true);
    expect(parseFilterState(new URLSearchParams("hasBuiltInEditor=false")).hasBuiltInEditor).toBe(false);
    expect(parseFilterState(new URLSearchParams("hasBuiltInEditor=yes")).hasBuiltInEditor).toBeNull();
    expect(parseFilterState(new URLSearchParams()).hasBuiltInEditor).toBeNull();
  });

  it("reads free-text facet values (area/hostOs/target/language) as-is", () => {
    const state = parseFilterState(
      new URLSearchParams("area=3d_modelling&hostOs=windows&target=nintendo-switch&language=csharp"),
    );
    expect(state.area).toBe("3d_modelling");
    expect(state.hostOs).toBe("windows");
    expect(state.target).toBe("nintendo-switch");
    expect(state.language).toBe("csharp");
  });

  it("decodes cursorHistory from repeated 'back' params, mapping '' to null", () => {
    const state = parseFilterState(new URLSearchParams("back=&back=abc123"));
    expect(state.cursorHistory).toEqual([null, "abc123"]);
  });
});

describe("serializeFilterState", () => {
  it("produces an empty query string for the default state", () => {
    expect(serializeFilterState(DEFAULT_FILTER_STATE).toString()).toBe("");
  });

  it("omits sort/view when they equal the default, includes them otherwise", () => {
    const nameGrid = serializeFilterState({ ...DEFAULT_FILTER_STATE, sort: "name", view: "grid" });
    expect(nameGrid.has("sort")).toBe(false);
    expect(nameGrid.has("view")).toBe(false);

    const popularityTable = serializeFilterState({
      ...DEFAULT_FILTER_STATE,
      sort: "popularity",
      view: "table",
    });
    expect(popularityTable.get("sort")).toBe("popularity");
    expect(popularityTable.get("view")).toBe("table");
  });

  it("round-trips a fully populated state through parse<->serialize", () => {
    const original = {
      ...DEFAULT_FILTER_STATE,
      q: "godot",
      type: "game_engine" as const,
      area: "3d_modelling",
      hostOs: "windows",
      target: "nintendo-switch",
      language: "csharp",
      licensing: "free_open_source" as const,
      hasBuiltInEditor: true,
      sort: "popularity" as const,
      view: "table" as const,
      cursor: "cursor123",
      cursorHistory: [null, "prevCursor"],
    };

    const roundTripped = parseFilterState(serializeFilterState(original));
    expect(roundTripped).toEqual(original);
  });
});
