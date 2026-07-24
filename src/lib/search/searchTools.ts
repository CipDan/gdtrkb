import "server-only";
import { graphqlClient, withTimeout } from "@/lib/graphql/client";
import { TOOLS_SEARCH_QUERY } from "@/lib/graphql/queries";
import type { ToolsConnection, ToolsConnectionWire } from "@/lib/graphql/types";
import { fromGraphqlEnum } from "@/lib/graphql/enumCasing";
import { getAreaOfUseDescendantSlugs } from "@/lib/areas";
import { buildOrderBy, buildToolFilter } from "@/lib/search/buildFilter";
import { PAGE_SIZE } from "@/lib/search/constants";
import type { FilterState } from "@/lib/search/filterState";
import type { LicensingModel, ToolType } from "@/types";

interface ToolsSearchWire {
  tools: ToolsConnectionWire;
}

// Shared by both app/page.tsx (initial SSR data) and the BFF route handler
// (app/api/tools/search/route.ts) so there is exactly one search code path.
export async function searchTools(state: FilterState): Promise<ToolsConnection> {
  const areaSlugs = state.area
    ? await getAreaOfUseDescendantSlugs(state.area)
    : null;

  const filter = buildToolFilter(state, areaSlugs);
  const orderBy = buildOrderBy(state.sort);

  const result = await withTimeout((signal) =>
    graphqlClient.request<ToolsSearchWire>({
      document: TOOLS_SEARCH_QUERY,
      variables: {
        filter,
        orderBy,
        first: PAGE_SIZE,
        after: state.cursor,
      },
      signal,
    }),
  );

  return {
    ...result.tools,
    nodes: result.tools.nodes.map((node) => ({
      ...node,
      type: fromGraphqlEnum<ToolType>(node.type),
      licensingModel: fromGraphqlEnum<LicensingModel>(node.licensingModel),
      areasOfUse: node.toolAreaOfUses.nodes.map((n) => n.areaOfUse),
    })),
  };
}
