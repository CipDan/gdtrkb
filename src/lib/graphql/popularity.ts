import "server-only";
import { cache } from "react";
import { GRAPHQL_TIMEOUT_MS, graphqlClient, withTimeout } from "@/lib/graphql/client";
import { POPULARITY_CHART_QUERY } from "@/lib/graphql/queries";
import type { PopularityChartData, PopularityToolNode } from "@/lib/graphql/types";

const CHART_SIZE = 10;

interface PopularityChartWire {
  topTools: { nodes: PopularityToolNode[] };
  missing: { totalCount: number };
}

export const getPopularityChartData = cache(
  async (): Promise<PopularityChartData> => {
    const result = await withTimeout(
      graphqlClient.request<PopularityChartWire>({
        document: POPULARITY_CHART_QUERY,
        variables: { first: CHART_SIZE },
        signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
      }),
    );

    return {
      topTools: result.topTools.nodes,
      missingCount: result.missing.totalCount,
    };
  },
);
