import { NextRequest, NextResponse } from "next/server";
import type { ToolsConnection } from "@/lib/graphql/types";

export async function GET(request: NextRequest) {
  void request;

  const empty: ToolsConnection = {
    nodes: [],
    pageInfo: { hasNextPage: false, endCursor: null },
    totalCount: 0,
  };

  return NextResponse.json(empty);
}
