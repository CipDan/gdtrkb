import "server-only";
import { cache } from "react";
import { graphqlClient, withTimeout } from "@/lib/graphql/client";
import { POPULARITY_CHART_QUERY } from "@/lib/graphql/queries";
import type { PopularityChartData, PopularityToolNode } from "@/lib/graphql/types";

const CHART_SIZE = 10;

interface PopularityChartWire {
  topTools: { nodes: PopularityToolNode[] };
  missing: { totalCount: number };
}

// Never throws — the search page must still render (degrading to an empty
// chart) when the API is cold-starting or unreachable (app-spec §7.9).
export const getPopularityChartData = cache(
  async (): Promise<PopularityChartData> => {
    try {
      const result = await withTimeout((signal) =>
        graphqlClient.request<PopularityChartWire>({
          document: POPULARITY_CHART_QUERY,
          variables: { first: CHART_SIZE },
          signal,
        }),
      );

      return {
        topTools: result.topTools.nodes,
        missingCount: result.missing.totalCount,
      };
    } catch {
      return { topTools: [], missingCount: 0 };
    }
  },
);
