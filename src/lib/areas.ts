import "server-only";
import { gql } from "graphql-request";
import { graphqlClient } from "@/lib/graphql/client";

// Resolves a selected area-of-use slug to itself + all descendants, so
// selecting a parent rolls up its children (docs/app-spec.md §7.2,
// docs/schema-spec.md §4.9's area_of_use_descendants(root_slug) function).
const AREA_DESCENDANTS_QUERY = gql`
  query AreaOfUseDescendants($rootSlug: String!) {
    areaOfUseDescendants(rootSlug: $rootSlug) {
      nodes {
        slug
      }
    }
  }
`;

interface AreaOfUseDescendantsResult {
  areaOfUseDescendants: { nodes: { slug: string }[] };
}

export async function getAreaOfUseDescendantSlugs(
  rootSlug: string,
): Promise<string[]> {
  const result = await graphqlClient.request<AreaOfUseDescendantsResult>(
    AREA_DESCENDANTS_QUERY,
    { rootSlug },
  );

  return result.areaOfUseDescendants.nodes.map((node) => node.slug);
}
