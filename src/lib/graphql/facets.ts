import "server-only";
import { cache } from "react";
import { graphqlClient } from "@/lib/graphql/client";
import { FACET_OPTIONS_QUERY } from "@/lib/graphql/queries";
import type { FacetOptions } from "@/lib/graphql/types";

interface FacetOptionsWire {
  platforms: { nodes: { slug: string; name: string }[] };
  languages: { nodes: { slug: string; name: string }[] };
  areaOfUses: { nodes: { slug: string; name: string; parent: { slug: string } | null }[] };
}

// Reference data changes rarely (app-spec §5 item 3); memoize per-request so
// the search page and the search route handler don't both pay for it.
export const getFacetOptions = cache(async (): Promise<FacetOptions> => {
  const result = await graphqlClient.request<FacetOptionsWire>(FACET_OPTIONS_QUERY);

  return {
    platforms: result.platforms.nodes,
    languages: result.languages.nodes,
    areas: result.areaOfUses.nodes.map((node) => ({
      slug: node.slug,
      name: node.name,
      parentSlug: node.parent?.slug ?? null,
    })),
  };
});
