# Session log — stop view-only changes from refetching in SearchPageClient (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that fixed a
> CodeRabbit-flagged bug in `src/components/search/SearchPageClient.tsx`: switching
> `ViewSwitch` (grid/list/etc.) updated the URL and re-triggered the BFF search fetch,
> replacing existing results with a loading state even though `view` isn't read
> server-side. User prompts and the assistant's final reported answers are reproduced
> verbatim; tool-call output (file reads, greps) is summarized narratively.

---

## 1. CodeRabbit finding: view changes shouldn't refetch

**User:**

> Verify each finding against current code. Fix only still-valid issues, skip the rest
> with a brief reason, keep changes minimal, and validate.
>
> In @src/components/search/SearchPageClient.tsx at line 70, Update the request-driving
> filter state in SearchPageClient by deriving the value passed to the BFF fetch from
> searchParams without the local view selection. Keep view available for the
> RESULTS_VIEWS rendering logic, but exclude it from the memoized request key so
> changing only view does not refetch or replace existing results with a loading state.
>
> Refer to the CodeRabbit comment from below as well:
>
> ---BEGIN COMMENT---
> CodeRabbit
> Avoid refetching when only the view changes.
>
> view only selects RESULTS_VIEWS locally (Line 154), but changing it updates
> searchParams and triggers a BFF request, replacing the current results with a loading
> state. Derive the request key without view.
>
>  const filters = useMemo(() => parseFilterState(searchParams), [searchParams]);
> +const requestParams = useMemo(() => {
> +  const params = new URLSearchParams(searchParams.toString());
> +  params.delete("view");
> +  return params.toString();
> +}, [searchParams]);
>
> -    fetch(`/api/tools/search?${searchParams.toString()}`)
> +    fetch(`/api/tools/search?${requestParams}`)
> ...
> -  }, [searchParams]);
> +  }, [requestParams]);
> ...
> -  }, [searchParams]);
> +  }, [runSearch]);
> Also applies to: 81-116, 127-129
> ---END COMMENT---

Read `SearchPageClient.tsx` in full. Confirmed the shape of the bug matches the
comment: `filters.view` only selects which `RESULTS_VIEWS` component renders
(line 154), but `handleViewChange` still calls `pushUrl({ ...filters, view })`,
which writes `view` into the URL like any other filter. The fetch `useEffect`
depends on `searchParams` as a whole, so a pure view change updates
`searchParams`, re-runs `runSearch`, and briefly replaces `data` with the
`loading` branch — a visible flash for a change that doesn't affect the result
set at all.

Verified `view` really is inert server-side before touching anything:
grepped `filterState.ts` (parses/serializes `view` into `FilterState`, purely
local), read `src/app/api/tools/search/route.ts` (calls `parseFilterState` then
`searchTools(filterState)`), and grepped `searchTools.ts` for `view` — no
match. So the API route never reads `view`; it's UI-only state riding along in
the same `FilterState`/URL object as the real filters.

## 2. Fix applied

- `SearchPageClient.tsx:71-78` — added `requestParams`, a `useMemo` that copies
  `searchParams` into a `URLSearchParams`, deletes `view`, and stringifies it.
- `SearchPageClient.tsx:94` — `runSearch`'s `fetch` now targets
  `/api/tools/search?${requestParams}` instead of `searchParams.toString()`.
- `SearchPageClient.tsx:114` — `runSearch`'s `useCallback` dependency changed
  from `[searchParams]` to `[requestParams]`.
- `SearchPageClient.tsx:116-120` — the fetch-triggering `useEffect` now depends
  on `[runSearch]` instead of `[searchParams]`, which also let the stale
  `// eslint-disable-next-line react-hooks/exhaustive-deps` comment be removed
  since the dependency is now correctly declared rather than suppressed.

Left `handleViewChange` (lines ~127-129) unchanged — it still writes `view`
into the URL via `pushUrl`, which is correct and desired (view stays
shareable/persisted in the URL); the fix only had to keep `view` out of the
*request* key, not out of the URL entirely.

`npx tsc --noEmit -p .` passed clean, and the IDE's live diagnostics (an
"assigned but never used" warning on `requestParams` and a "missing dependency"
warning on the effect, both expected mid-edit artifacts of the multi-step
change) cleared once every edit had landed.

Reported to the user (verbatim):

> This looks correct now. Let me verify no other diagnostics remain and double check
> `handleViewChange` (lines ~127-129, still using `pushUrl` which updates the URL
> including `view` — that's expected/unchanged) and the retry button's
> `onClick={runSearch}` still works fine since `runSearch` returns a cleanup function but
> is also a valid click handler.
>
> Typecheck passed clean, and the earlier ESLint diagnostics (unused var, missing
> dependency) are gone.
>
> **Fix applied** (confirmed valid — `view` is parsed into `filterState` but never read
> by `searchTools.ts`/the API route, so it's purely a local view-selector):
>
> - [SearchPageClient.tsx:71-78](src/components/search/SearchPageClient.tsx#L71-L78):
>   added `requestParams`, a memoized query string derived from `searchParams` with
>   `view` stripped.
> - [SearchPageClient.tsx:94](src/components/search/SearchPageClient.tsx#L94): `runSearch`
>   now fetches `requestParams` instead of the raw `searchParams`.
> - [SearchPageClient.tsx:114](src/components/search/SearchPageClient.tsx#L114):
>   `runSearch`'s `useCallback` deps changed to `[requestParams]`.
> - [SearchPageClient.tsx:120](src/components/search/SearchPageClient.tsx#L120): the fetch
>   `useEffect` now depends on `[runSearch]` (dropped the stale `eslint-disable` comment
>   since the dependency is now correctly declared).
>
> **To test:** open the search page, switch `ViewSwitch` between grid/list/etc. —
> results should re-render instantly from existing data with no loading flash. Changing
> an actual filter/sort/page should still trigger the loading state and a fresh fetch as
> before.

---

## 3. Wrap-up

**User:** "Now draft a snapshot of this conversation. Record prompts and responses
verbatim. Structure using the same format as the other snapshots in the docs folder.
Save the record in docs at the end."

→ This document.

---

## Net code changes

- `src/components/search/SearchPageClient.tsx` — added a `requestParams` memo that
  strips `view` out of the query string used for the BFF fetch; `runSearch`'s `fetch`
  call and `useCallback` deps, plus the triggering `useEffect`'s deps, all switched from
  `searchParams` to `requestParams`/`runSearch` respectively. `handleViewChange` and the
  URL itself are unchanged — `view` still round-trips through the URL for shareability,
  it's just excluded from the value that decides whether to refetch.

## Lessons worth keeping

1. **A single `FilterState`/URL object can mix "real" filters with UI-only state.**
   `view` lives in the same `parseFilterState`/`serializeFilterState` round-trip as `q`,
   `sort`, `area`, etc., but only one of those fields is inert on the server. Any
   `useEffect`/`useCallback` that treats "the whole state object changed" as "refetch" has
   to derive a narrower key when some fields are display-only, rather than assuming every
   field is fetch-relevant just because it's colocated.
2. **Grepping the actual consumer (`searchTools.ts`) is what turns "CodeRabbit says so"
   into a verified finding** — the fix was applied only after confirming `view` has zero
   references in the code that builds the GraphQL filter/query, not merely because the
   review comment asserted it.
