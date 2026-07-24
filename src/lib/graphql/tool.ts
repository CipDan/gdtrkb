import "server-only";
import { cache } from "react";
import { graphqlClient, withTimeout } from "@/lib/graphql/client";
import { TOOL_BY_SLUG_QUERY, TOOL_SLUGS_QUERY } from "@/lib/graphql/queries";
import { fromGraphqlEnum } from "@/lib/graphql/enumCasing";
import type { ToolDetail, ToolDetailRelationship } from "@/lib/graphql/types";
import type { LicensingModel, PlatformRole, RelationshipType, ToolLinkType, ToolType } from "@/types";

interface ToolNodeWire {
  slug: string;
  name: string;
  type: string;
  logoImageUrl: string | null;
}

interface RelationshipEdgeWire {
  relationshipId: string;
  type: string;
  note: string | null;
  mirrored: boolean;
  sourceTool: ToolNodeWire;
  targetTool: ToolNodeWire;
}

interface ToolBySlugWire {
  slug: string;
  name: string;
  type: string;
  summary: string;
  hasBuiltInEditor: boolean;
  licensingModel: string;
  licensingNote: string | null;
  logoImageUrl: string | null;
  logoImageSource: string | null;
  confirmedCommercialTitlesCount: number | null;
  confirmedTitlesAsOf: string | null;
  confirmedTitlesSource: string | null;
  toolLinks: { nodes: { type: string; url: string; label: string | null }[] };
  toolAreaOfUses: {
    nodes: {
      areaOfUse: { slug: string; name: string; parent: { slug: string; name: string } | null };
    }[];
  };
  toolPlatforms: { nodes: { role: string; platform: { slug: string; name: string } }[] };
  toolLanguages: { nodes: { language: { slug: string; name: string } }[] };
  toolGames: {
    nodes: {
      game: {
        slug: string;
        name: string;
        developer: string | null;
        publisher: string | null;
        releaseYear: number | null;
        bannerImageUrl: string | null;
        bannerImageSource: string | null;
        gameStoreLinks: { nodes: { storeLabel: string; url: string }[] };
      };
    }[];
  };
  outEdges: { nodes: RelationshipEdgeWire[] };
  inEdges: { nodes: RelationshipEdgeWire[] };
}

interface ToolBySlugResult {
  toolBySlug: ToolBySlugWire | null;
}

interface ToolSlugsResult {
  tools: { nodes: { slug: string }[] };
}

function toRelationshipNode(node: ToolNodeWire) {
  return {
    slug: node.slug,
    name: node.name,
    type: fromGraphqlEnum<ToolType>(node.type),
    logoImageUrl: node.logoImageUrl,
  };
}

// Merges the two directional connections (see TOOL_BY_SLUG_QUERY's comment)
// into one 1-hop neighborhood, deduped by the underlying relationshipId — a
// symmetric PAIRS_WELL_WITH edge appears in both connections (once per
// mirrored view row) and must collapse to a single edge for the graph.
function mergeRelationships(
  outEdges: RelationshipEdgeWire[],
  inEdges: RelationshipEdgeWire[],
): ToolDetailRelationship[] {
  const byRelationshipId = new Map<string, RelationshipEdgeWire>();
  for (const edge of [...outEdges, ...inEdges]) {
    if (!byRelationshipId.has(edge.relationshipId)) {
      byRelationshipId.set(edge.relationshipId, edge);
    }
  }

  return [...byRelationshipId.values()]
    .map((edge) => ({
      relationshipId: edge.relationshipId,
      type: edge.type as RelationshipType,
      note: edge.note,
      mirrored: edge.mirrored,
      sourceTool: toRelationshipNode(edge.sourceTool),
      targetTool: toRelationshipNode(edge.targetTool),
    }))
    .sort(
      (a, b) =>
        a.sourceTool.name.localeCompare(b.sourceTool.name) ||
        a.targetTool.name.localeCompare(b.targetTool.name),
    );
}

// Detail page data (app-spec §8). Unlike the never-throwing facets/popularity
// helpers, this throws on a network/API failure so the route's error
// boundary (app/error.tsx) handles it — the detail page has nothing else to
// render if this fails, unlike search's soft-degrade (app-spec §7.9). A
// `null` return means the query succeeded but the slug doesn't exist, so the
// caller can call notFound() instead of showing an error.
export const getToolBySlug = cache(async (slug: string): Promise<ToolDetail | null> => {
  const result = await withTimeout((signal) =>
    graphqlClient.request<ToolBySlugResult>({
      document: TOOL_BY_SLUG_QUERY,
      variables: { slug },
      signal,
    }),
  );

  const tool = result.toolBySlug;
  if (!tool) return null;

  return {
    slug: tool.slug,
    name: tool.name,
    type: fromGraphqlEnum<ToolType>(tool.type),
    summary: tool.summary,
    hasBuiltInEditor: tool.hasBuiltInEditor,
    licensingModel: fromGraphqlEnum<LicensingModel>(tool.licensingModel),
    licensingNote: tool.licensingNote,
    logoImageUrl: tool.logoImageUrl,
    logoImageSource: tool.logoImageSource,
    confirmedCommercialTitlesCount: tool.confirmedCommercialTitlesCount,
    confirmedTitlesAsOf: tool.confirmedTitlesAsOf,
    confirmedTitlesSource: tool.confirmedTitlesSource,
    links: tool.toolLinks.nodes.map((link) => ({
      type: link.type as ToolLinkType,
      url: link.url,
      label: link.label,
    })),
    areasOfUse: tool.toolAreaOfUses.nodes.map(({ areaOfUse }) => ({
      slug: areaOfUse.slug,
      name: areaOfUse.name,
      parentSlug: areaOfUse.parent?.slug ?? null,
      parentName: areaOfUse.parent?.name ?? null,
    })),
    platforms: tool.toolPlatforms.nodes.map(({ role, platform }) => ({
      role: role as PlatformRole,
      slug: platform.slug,
      name: platform.name,
    })),
    languages: tool.toolLanguages.nodes.map(({ language }) => language),
    exampleGames: tool.toolGames.nodes.map(({ game }) => ({
      slug: game.slug,
      name: game.name,
      developer: game.developer,
      publisher: game.publisher,
      releaseYear: game.releaseYear,
      bannerImageUrl: game.bannerImageUrl,
      bannerImageSource: game.bannerImageSource,
      storeLinks: game.gameStoreLinks.nodes,
    })),
    relationships: mergeRelationships(tool.outEdges.nodes, tool.inEdges.nodes),
  };
});

// Feeds generateStaticParams for /tools/[slug] (app-spec §5 item 1). Never
// throws: an empty return just means no paths are pre-built, and Next falls
// back to on-demand ISR per slug (dynamicParams defaults to true) instead of
// failing the whole build over a transient upstream blip.
export async function getAllToolSlugs(): Promise<string[]> {
  try {
    const result = await withTimeout((signal) =>
      graphqlClient.request<ToolSlugsResult>({
        document: TOOL_SLUGS_QUERY,
        signal,
      }),
    );
    return result.tools.nodes.map((node) => node.slug);
  } catch (err) {
    console.error("getAllToolSlugs failed; falling back to empty slug list", err);
    return [];
  }
}
