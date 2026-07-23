import "server-only";
import { gql } from "graphql-request";
import { GRAPHQL_TIMEOUT_MS, graphqlClient, withTimeout } from "@/lib/graphql/client";
import type { AreaOfUseOption } from "@/lib/graphql/types";

export interface AreaOfUseTreeNode extends AreaOfUseOption {
  children: AreaOfUseOption[];
}

// Groups the flat facet option list into the 2-level tree the filter panel
// renders (app-spec §7.2). Areas with no parent are top-level domains.
export function buildAreaOfUseTree(areas: AreaOfUseOption[]): AreaOfUseTreeNode[] {
  const parents = areas.filter((area) => area.parentSlug === null);
  return parents.map((parent) => ({
    ...parent,
    children: areas.filter((area) => area.parentSlug === parent.slug),
  }));
}

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
  const result = await withTimeout(
    graphqlClient.request<AreaOfUseDescendantsResult>({
      document: AREA_DESCENDANTS_QUERY,
      variables: { rootSlug },
      signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
    }),
  );

  return result.areaOfUseDescendants.nodes.map((node) => node.slug);
}
