import "server-only";
import { cache } from "react";
import { graphqlClient, withTimeout } from "@/lib/graphql/client";
import { TOOL_TOTAL_COUNT_QUERY } from "@/lib/graphql/queries";

interface ToolTotalCountWire {
  tools: { totalCount: number };
}

// Used by the root layout's persistent header status line. Never throws —
// the header must still render (and the API-down error state must still be
// reachable) when the API is cold-starting or unreachable.
export const getToolCount = cache(async (): Promise<number | null> => {
  try {
    const result = await withTimeout((signal) =>
      graphqlClient.request<ToolTotalCountWire>({
        document: TOOL_TOTAL_COUNT_QUERY,
        signal,
      }),
    );
    return result.tools.totalCount;
  } catch {
    return null;
  }
});
