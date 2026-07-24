import { describe, expect, it } from "vitest";
import { buildAreaOfUseTree } from "@/lib/areas";
import type { AreaOfUseOption } from "@/lib/graphql/types";

describe("buildAreaOfUseTree", () => {
  it("groups leaves under their parent and preserves parent order", () => {
    const areas: AreaOfUseOption[] = [
      { slug: "asset_creation", name: "Asset Creation", parentSlug: null },
      { slug: "audio", name: "Audio", parentSlug: null },
      { slug: "3d_modelling", name: "3D Modelling", parentSlug: "asset_creation" },
      { slug: "sound_design", name: "Sound Design", parentSlug: "audio" },
      { slug: "2d_art", name: "2D Art", parentSlug: "asset_creation" },
    ];

    const tree = buildAreaOfUseTree(areas);

    expect(tree.map((node) => node.slug)).toEqual(["asset_creation", "audio"]);
    expect(tree.find((node) => node.slug === "asset_creation")?.children.map((c) => c.slug)).toEqual([
      "3d_modelling",
      "2d_art",
    ]);
    expect(tree.find((node) => node.slug === "audio")?.children.map((c) => c.slug)).toEqual([
      "sound_design",
    ]);
  });

  it("gives a top-level domain with no leaves an empty children array", () => {
    const areas: AreaOfUseOption[] = [{ slug: "development", name: "Development", parentSlug: null }];
    expect(buildAreaOfUseTree(areas)).toEqual([
      { slug: "development", name: "Development", parentSlug: null, children: [] },
    ]);
  });

  it("returns an empty tree for an empty option list", () => {
    expect(buildAreaOfUseTree([])).toEqual([]);
  });

  it("silently drops a leaf whose parentSlug matches no defined parent", () => {
    // Documents current behavior rather than asserting a requirement: the API
    // always returns a parent for every child (schema-spec §4.3's FK), so this
    // is a defensive case, not one the app is expected to hit in practice.
    const areas: AreaOfUseOption[] = [
      { slug: "asset_creation", name: "Asset Creation", parentSlug: null },
      { slug: "orphan_leaf", name: "Orphan Leaf", parentSlug: "no_such_parent" },
    ];

    const tree = buildAreaOfUseTree(areas);

    expect(tree).toEqual([
      { slug: "asset_creation", name: "Asset Creation", parentSlug: null, children: [] },
    ]);
  });
});
