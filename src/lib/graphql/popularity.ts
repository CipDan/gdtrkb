import "server-only";
import { cache } from "react";
import { graphqlClient } from "@/lib/graphql/client";
import { POPULARITY_CHART_QUERY } from "@/lib/graphql/queries";
import type { PopularityChartData, PopularityToolNode } from "@/lib/graphql/types";

const CHART_SIZE = 10;

interface PopularityChartWire {
  topTools: { nodes: PopularityToolNode[] };
  missing: { totalCount: number };
}

export const getPopularityChartData = cache(
  async (): Promise<PopularityChartData> => {
    const result = await graphqlClient.request<PopularityChartWire>(
      POPULARITY_CHART_QUERY,
      { first: CHART_SIZE },
    );

    return {
      topTools: result.topTools.nodes,
      missingCount: result.missing.totalCount,
    };
  },
);
