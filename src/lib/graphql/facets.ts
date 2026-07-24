import "server-only";
import { cache } from "react";
import { graphqlClient, withTimeout } from "@/lib/graphql/client";
import { FACET_OPTIONS_QUERY } from "@/lib/graphql/queries";
import type { FacetOptions } from "@/lib/graphql/types";

interface FacetOptionsWire {
  platforms: { nodes: { slug: string; name: string }[] };
  languages: { nodes: { slug: string; name: string }[] };
  areaOfUses: { nodes: { slug: string; name: string; parent: { slug: string } | null }[] };
}

// Reference data changes rarely (app-spec §5 item 3); memoize per-request so
// the search page and the search route handler don't both pay for it.
// Never throws — the search page must still render (degrading to empty
// filters) when the API is cold-starting or unreachable (app-spec §7.9).
export const getFacetOptions = cache(async (): Promise<FacetOptions> => {
  try {
    const result = await withTimeout((signal) =>
      graphqlClient.request<FacetOptionsWire>({
        document: FACET_OPTIONS_QUERY,
        signal,
      }),
    );

    return {
      platforms: result.platforms.nodes,
      languages: result.languages.nodes,
      areas: result.areaOfUses.nodes.map((node) => ({
        slug: node.slug,
        name: node.name,
        parentSlug: node.parent?.slug ?? null,
      })),
    };
  } catch {
    return { platforms: [], languages: [], areas: [] };
  }
});
