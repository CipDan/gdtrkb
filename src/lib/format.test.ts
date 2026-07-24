import { describe, expect, it } from "vitest";
import {
  licensingLongLabel,
  licensingShortLabel,
  logoInitials,
  toolLinkTypeLabel,
  toolTypeLabel,
} from "@/lib/format";
import type { LicensingModel, ToolType } from "@/types";

describe("logoInitials", () => {
  it("returns an empty string for empty/whitespace-only input", () => {
    expect(logoInitials("")).toBe("");
    expect(logoInitials("   ")).toBe("");
  });

  it("uses the first two letters of a single-word name", () => {
    expect(logoInitials("Blender")).toBe("BL");
  });

  it("uses the first letter of each of the first two words for multi-word names", () => {
    expect(logoInitials("Godot Engine")).toBe("GE");
    expect(logoInitials("Adobe Substance 3D Painter")).toBe("AS");
  });
});

describe("licensing labels", () => {
  it("maps every LicensingModel value to a short bracketed label", () => {
    expect(licensingShortLabel("free_open_source")).toBe("free/oss");
    expect(licensingShortLabel("tiered")).toBe("tiered");
  });

  it("maps every LicensingModel value to its long label", () => {
    expect(licensingLongLabel("free_open_source")).toBe("free / open source");
    expect(licensingLongLabel("royalty_based")).toBe("royalty-based");
  });

  it("falls back to the raw value for a model outside the known list", () => {
    // Defensive branch: guards a future DB enum value (schema-spec §8) that
    // reaches the frontend before staticFacetOptions.ts is updated for it.
    const unknown = "future_model" as LicensingModel;
    expect(licensingLongLabel(unknown)).toBe("future_model");
  });
});

describe("toolTypeLabel", () => {
  it("maps a known ToolType to its display label", () => {
    expect(toolTypeLabel("game_engine")).toBe("game engine");
    expect(toolTypeLabel("asset_marketplace")).toBe("asset marketplace");
  });

  it("falls back to the raw value for a type outside the known list", () => {
    const unknown = "future_type" as ToolType;
    expect(toolTypeLabel(unknown)).toBe("future_type");
  });
});

describe("toolLinkTypeLabel", () => {
  it("maps every ToolLinkType to a lowercase display label", () => {
    expect(toolLinkTypeLabel("WEBSITE")).toBe("website");
    expect(toolLinkTypeLabel("SOURCE_REPO")).toBe("source repo");
  });
});