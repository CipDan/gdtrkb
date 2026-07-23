import SearchPageClient from "@/components/search/SearchPageClient";
import PopularityChart from "@/components/chart/PopularityChart";
import { parseFilterState } from "@/lib/search/filterState";
import { searchTools } from "@/lib/search/searchTools";
import { getFacetOptions } from "@/lib/graphql/facets";
import { getPopularityChartData } from "@/lib/graphql/popularity";
import { buildAreaOfUseTree } from "@/lib/areas";
import type { ToolsConnection } from "@/lib/graphql/types";

const EMPTY_RESULTS: ToolsConnection = {
  nodes: [],
  pageInfo: { hasNextPage: false, endCursor: null },
  totalCount: 0,
};

type RawSearchParams = { [key: string]: string | string[] | undefined };

function toSearchParams(raw: RawSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  return params;
}

// Search page (app-spec §6/§7): default route, shows the full catalog
// paginated in the card grid, sorted by name, when there's no query/facets.
// Data-fetching (results + facet options + popularity chart) runs
// server-side; facet-options/popularity failures still propagate to
// app/error.tsx per §7.9. The search itself is caught below instead, so a
// deep-linked/shared URL whose filters the upstream rejects (or any other
// search-specific failure) degrades to the same retry banner the client-side
// re-fetch already shows, rather than crashing the whole page.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filterState = parseFilterState(toSearchParams(await searchParams));

  const [searchResult, facets, popularity] = await Promise.all([
    searchTools(filterState).catch(() => null),
    getFacetOptions(),
    getPopularityChartData(),
  ]);

  const areaTree = buildAreaOfUseTree(facets.areas);

  return (
    <div>
      <h1 className="mb-4 text-[16px] font-normal text-dim">
        Game Development Tools &amp; Resources Knowledge Bank
      </h1>

      <SearchPageClient
        initialResults={searchResult ?? EMPTY_RESULTS}
        initialError={
          searchResult === null
            ? "Search is temporarily unavailable. The API may be cold-starting."
            : null
        }
        areaTree={areaTree}
        platforms={facets.platforms}
        languages={facets.languages}
      />

      <PopularityChart data={popularity} />
    </div>
  );
}
