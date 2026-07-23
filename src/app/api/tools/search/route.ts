import { NextRequest, NextResponse } from "next/server";
import { parseFilterState } from "@/lib/search/filterState";
import { searchTools } from "@/lib/search/searchTools";

// The only request-time API path in the MVP (app-spec §5 item 2). The
// browser calls this route; this route (server-side) is the only thing that
// talks to PostGraphile for live search.
export async function GET(request: NextRequest) {
  const filterState = parseFilterState(request.nextUrl.searchParams);

  try {
    const results = await searchTools(filterState);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Tool search failed:", error);
    return NextResponse.json(
      { error: "Search is temporarily unavailable." },
      { status: 502 },
    );
  }
}
