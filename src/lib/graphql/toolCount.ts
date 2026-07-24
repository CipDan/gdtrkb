import "server-only";
import { cache } from "react";
import { BUILD_GRAPHQL_TIMEOUT_MS, fetchGraphql } from "@/lib/graphql/client";
import { TOOL_TOTAL_COUNT_QUERY } from "@/lib/graphql/queries";

interface ToolTotalCountWire {
  tools: { totalCount: number };
}

// Used by the root layout's persistent header status line. Never throws —
// the header must still render (and the API-down error state must still be
// reachable) when the API is cold-starting or unreachable. Uses the
// build-time timeout unconditionally: even on the one route where this can
// run at request time (an on-demand /tools/[slug] render), it fails safe to
// `null` rather than blocking the page like getToolBySlug does, so the
// longer timeout only ever costs extra wait time, never correctness.
export const getToolCount = cache(async (): Promise<number | null> => {
  try {
    const result = await fetchGraphql<ToolTotalCountWire>(
      TOOL_TOTAL_COUNT_QUERY,
      undefined,
      BUILD_GRAPHQL_TIMEOUT_MS,
    );
    return result.tools.totalCount;
  } catch {
    return null;
  }
});
