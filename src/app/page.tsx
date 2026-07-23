import SearchPageClient from "@/components/search/SearchPageClient";
import PopularityChart from "@/components/chart/PopularityChart";
import { getFacetOptions } from "@/lib/graphql/facets";
import { getPopularityChartData } from "@/lib/graphql/popularity";
import { buildAreaOfUseTree } from "@/lib/areas";

// Search page (app-spec §6/§7): default route, shows the full catalog
// paginated in the card grid, sorted by name, when there's no query/facets.
// Facet options + popularity chart are fetched server-side (they never
// throw; both degrade to empty data on failure, per §7.9's cold-start
// handling). Search results themselves are fetched client-side by
// SearchPageClient via the /api/tools/search BFF route — the only
// request-time API path (app-spec §5 item 2) — so there's a single fetch
// path for the initial load and every later filter/sort/pagination change,
// instead of a server-side searchTools() call whose result gets discarded
// the moment the client re-fetches after a URL change.
export default async function SearchPage() {
  const [facets, popularity] = await Promise.all([
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
        areaTree={areaTree}
        platforms={facets.platforms}
        languages={facets.languages}
      />

      <PopularityChart data={popularity} />
    </div>
  );
}
