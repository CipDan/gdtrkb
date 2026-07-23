import SearchPageClient from "@/components/search/SearchPageClient";
import PopularityChart from "@/components/chart/PopularityChart";
import { parseFilterState } from "@/lib/search/filterState";
import { searchTools } from "@/lib/search/searchTools";
import { getFacetOptions } from "@/lib/graphql/facets";
import { getPopularityChartData } from "@/lib/graphql/popularity";
import { buildAreaOfUseTree } from "@/lib/areas";

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
// server-side; failures propagate to app/error.tsx per §7.9.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filterState = parseFilterState(toSearchParams(await searchParams));

  const [results, facets, popularity] = await Promise.all([
    searchTools(filterState),
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
        initialResults={results}
        areaTree={areaTree}
        platforms={facets.platforms}
        languages={facets.languages}
      />

      <PopularityChart data={popularity} />
    </div>
  );
}
