"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SearchBar from "@/components/search/SearchBar";
import FacetPanel from "@/components/search/FacetPanel";
import SortControl from "@/components/search/SortControl";
import ViewSwitch from "@/components/search/ViewSwitch";
import Pagination from "@/components/search/Pagination";
import { RESULTS_VIEWS } from "@/components/results/viewRegistry";
import { parseFilterState, serializeFilterState } from "@/lib/search/filterState";
import type { FilterState, ViewMode } from "@/lib/search/filterState";
import { PAGE_SIZE } from "@/lib/search/constants";
import { licensingLongLabel, toolTypeLabel } from "@/lib/format";
import type { ToolsConnection } from "@/lib/graphql/types";
import type { AreaOfUseTreeNode } from "@/lib/areas";

interface SearchPageClientProps {
  initialResults: ToolsConnection;
  areaTree: AreaOfUseTreeNode[];
  platforms: { slug: string; name: string }[];
  languages: { slug: string; name: string }[];
}

function describeActiveFilters(
  filters: FilterState,
  areaTree: AreaOfUseTreeNode[],
  platforms: { slug: string; name: string }[],
  languages: { slug: string; name: string }[],
): string | null {
  const parts: string[] = [];
  if (filters.q.trim()) parts.push(`"${filters.q.trim()}"`);
  if (filters.type) parts.push(`type: ${toolTypeLabel(filters.type)}`);
  if (filters.area) {
    const allAreas = areaTree.flatMap((parent) => [parent, ...parent.children]);
    parts.push(`area: ${allAreas.find((a) => a.slug === filters.area)?.name ?? filters.area}`);
  }
  if (filters.hostOs) {
    parts.push(`runs on: ${platforms.find((p) => p.slug === filters.hostOs)?.name ?? filters.hostOs}`);
  }
  if (filters.target) {
    parts.push(`exports to: ${platforms.find((p) => p.slug === filters.target)?.name ?? filters.target}`);
  }
  if (filters.language) {
    parts.push(`language: ${languages.find((l) => l.slug === filters.language)?.name ?? filters.language}`);
  }
  if (filters.licensing) parts.push(`licensing: ${licensingLongLabel(filters.licensing)}`);
  if (filters.hasBuiltInEditor) parts.push("built-in editor only");
  return parts.length > 0 ? parts.join(", ") : null;
}

// Orchestrates the interactive search page: URL is the single source of
// truth for filter/sort/page/view state (app-spec §7.4, mandatory); this
// component only mirrors it into fetches against the BFF route.
export default function SearchPageClient({
  initialResults,
  areaTree,
  platforms,
  languages,
}: SearchPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseFilterState(searchParams), [searchParams]);

  const [data, setData] = useState<ToolsConnection>(initialResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cursor stack lives in the URL (see filters.cursorHistory), not local
  // state, so a reload or shared link on page 2+ still supports "prev".
  const cursorHistory = filters.cursorHistory;

  const isFirstRender = useRef(true);

  const runSearch = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/tools/search?${searchParams.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("search failed");
        return res.json() as Promise<ToolsConnection>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Search is temporarily unavailable. The API may be cold-starting.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    return runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function pushUrl(next: FilterState) {
    const qs = serializeFilterState(next).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function applyFilters(patch: Partial<FilterState>) {
    pushUrl({ ...filters, ...patch, cursor: null, cursorHistory: [] });
  }

  function handleViewChange(view: ViewMode) {
    pushUrl({ ...filters, view });
  }

  function handleClear() {
    router.replace(pathname, { scroll: false });
  }

  function handleNext() {
    if (!data.pageInfo.hasNextPage || !data.pageInfo.endCursor) return;
    pushUrl({
      ...filters,
      cursor: data.pageInfo.endCursor,
      cursorHistory: [...cursorHistory, filters.cursor],
    });
  }

  function handlePrev() {
    if (cursorHistory.length === 0) return;
    const target = cursorHistory[cursorHistory.length - 1];
    pushUrl({
      ...filters,
      cursor: target,
      cursorHistory: cursorHistory.slice(0, -1),
    });
  }

  const activeView = RESULTS_VIEWS.find((v) => v.mode === filters.view) ?? RESULTS_VIEWS[0];
  const ActiveViewComponent = activeView.Component;
  const filterSummary = describeActiveFilters(filters, areaTree, platforms, languages);
  const totalPages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));
  const currentPage = cursorHistory.length + 1;

  return (
    <div>
      <SearchBar value={filters.q} onSubmit={(q) => applyFilters({ q })} />

      <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr] md:items-start">
        <FacetPanel
          filters={filters}
          areaTree={areaTree}
          platforms={platforms}
          languages={languages}
          onChange={applyFilters}
          onClear={handleClear}
        />

        <div>
          <div className="mb-3 flex flex-wrap items-baseline gap-4">
            <span className="text-[16px] text-dim">
              {data.totalCount} tool{data.totalCount === 1 ? "" : "s"}
              {filterSummary ? ` · filtered by ${filterSummary}` : ""}
            </span>
            <div className="ml-auto flex items-center gap-4">
              <SortControl value={filters.sort} onChange={(sort) => applyFilters({ sort })} />
              <ViewSwitch value={filters.view} onChange={handleViewChange} />
            </div>
          </div>

          {error ? (
            <div className="border border-line p-4 text-center">
              <p className="text-dim">{error}</p>
              <button
                type="button"
                onClick={runSearch}
                className="mt-2 border border-line px-3 py-1 text-ink hover:text-bright"
              >
                {"> retry"}
              </button>
            </div>
          ) : loading ? (
            <p className="border border-line p-4 text-center text-dim">loading…</p>
          ) : data.nodes.length === 0 ? (
            <p className="border border-line p-4 text-center text-dim">no tools match.</p>
          ) : (
            <ActiveViewComponent nodes={data.nodes} loading={loading} error={error} />
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            hasPrev={!error && cursorHistory.length > 0}
            hasNext={!error && data.pageInfo.hasNextPage}
            loading={loading}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        </div>
      </div>
    </div>
  );
}
