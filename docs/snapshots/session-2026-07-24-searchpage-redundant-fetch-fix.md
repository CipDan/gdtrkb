# Session log — remove redundant server-side `searchTools` call from `SearchPage` (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that removed a redundant
> server-side `searchTools(filterState)` call from `src/app/page.tsx` and made
> `SearchPageClient` the single fetch path for search results (initial load and every
> later filter/sort/pagination change), fixing a `react-hooks/set-state-in-effect` lint
> failure that surfaced along the way. User prompts and the assistant's final reported
> answer are reproduced verbatim; tool-call output (file reads, greps, doc lookups, lint/
> typecheck runs, the dev-server smoke test) is summarized narratively.

---

## 1. Finding: `SearchPage` and `SearchPageClient` both fetch search results

**User (code-review finding, applied to `src/app/page.tsx:40-51`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest
> with a brief reason, keep changes minimal, and validate.
>
> In @src/app/page.tsx around lines 40 - 51, The SearchPage flow currently fetches
> searchTools(filterState) while SearchPageClient refetches the same query after
> navigation. Remove the redundant server-side searchTools call from SearchPage, adjust
> the Promise.all/result handling and props so the client remains the single fetch path
> for filter, sort, and pagination changes, while preserving facet and popularity loading.

The harness had already attached a full `Read` of `src/app/page.tsx` as context: an async
Server Component that parses `filterState` from `searchParams`, runs
`Promise.all([searchTools(filterState).catch(() => null), getFacetOptions(),
getPopularityChartData()])`, and passes the result down to `SearchPageClient` as
`initialResults`/`initialError`.

---

## 2. Verifying the finding against current code

Read `SearchPageClient.tsx` in full. Found an `isFirstRender` ref guard inside the fetch
`useEffect`: on mount it skips calling `runSearch()` entirely and just renders
`initialResults` as-is; only on later renders (triggered by `requestParams` changing) does
it call `runSearch()`, which hits `/api/tools/search`. Read
`src/app/api/tools/search/route.ts` and confirmed it calls the exact same
`searchTools(filterState)` the server component does.

The open question was whether the redundancy the finding describes is real at runtime, or
only a theoretical double-definition. Since `useState(initialResults)` only consumes its
initial value once and never re-syncs from later prop updates, a fresh `searchResult`
computed server-side on a later render would be silently discarded by
`SearchPageClient` — *unless* Next.js never actually re-executes the server component on a
filter/sort/page change in the first place. That turns on how `router.replace()`
navigations interact with a Server Component reading `searchParams`.

Per CLAUDE.md's standing rule to read the Next.js docs under `node_modules/next/dist/docs/`
before any Next.js work, read
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`. Line
119 settles it: "`searchParams` is a **Request-time API** whose values cannot be known
ahead of time. Using it will opt the page into **dynamic rendering** at request time."
Since `app/page.tsx` awaits `searchParams` unconditionally, the whole route is dynamic —
every `router.replace()`-driven navigation re-renders the Server Component tree, re-running
`searchTools()`, `getFacetOptions()`, and `getPopularityChartData()` server-side, in
addition to `SearchPageClient`'s own client-side fetch to the same endpoint. The
server-computed `searchResult` is thrown away every time except on the very first mount.
Confirmed the finding is valid, not just theoretical.

Before applying the literal fix, checked whether removing the SSR `searchTools()` call
entirely would conflict with `docs/app-spec.md`. §6's route table lists `/` as
"**Client-interactive over server-provided initial data**," which reads as an explicit
requirement that the *initial* load be server-rendered, not client-fetched. Weighed this
against §7.9 ("the search view's first request after idle can be slow — show a loading
indicator, don't hang") and §5 item 2 (`/api/tools/search` is "the only request-time API
path in the MVP") — a brief loading state on first paint is already an accepted UX here,
and facets/popularity (the other server-provided pieces §154 names) stay SSR'd either way,
so removing only the *search results* half of the initial SSR data was judged a reasonable,
spec-compatible reading rather than a violation.

Also read `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`,
whose "Native History API" section explicitly recommends `window.history.pushState`/
`replaceState` over `router.push`/`replace` for exactly this "sync filter/sort state into
the URL without a server round-trip" case — a more surgical alternative that would avoid
re-running `getFacetOptions()`/`getPopularityChartData()` on every navigation too. Noted as
a stronger fix worth considering later, but out of scope for what was asked (which
specifically targets removing the `searchTools` call and unifying to the client fetch
path, not rearchitecting how `pushUrl` updates the URL) — went with the literal, smaller
fix per CLAUDE.md's "build the smallest useful version" and "don't add abstractions beyond
what the task requires" principles.

Grepped the codebase for other consumers of `initialResults`/`initialError`/
`SearchPageClient`/`EMPTY_RESULTS` and for any `src/**/*.test.*` files — found none, so no
other call sites or tests needed updating.

---

## 3. Fix applied

- **`src/app/page.tsx`** — removed the `searchTools` import, the `EMPTY_RESULTS` constant,
  and the `Promise.all` slot for `searchResult`; `Promise.all` now only fetches
  `getFacetOptions()`/`getPopularityChartData()`. Since `filterState` was no longer used
  for anything once `searchTools` was gone, removed the now-dead
  `parseFilterState`/`toSearchParams`/`RawSearchParams` plumbing and the `searchParams`
  prop entirely, rather than leaving an unused parse call around. `SearchPageClient` no
  longer receives `initialResults`/`initialError` props. Updated the header comment to
  describe the new division of labor (facets/popularity server-side, search results
  client-side via the BFF route).
- **`src/components/search/SearchPageClient.tsx`** — removed the `initialResults`/
  `initialError` props and the `isFirstRender` skip, so the effect now runs on mount too,
  making `/api/tools/search` the single fetch path for the initial load and every later
  filter/sort/page change.

Running `npm run typecheck` passed clean. `npm run lint` did not: it flagged a new error,

```
114:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
  react-hooks/set-state-in-effect
```

on the now-unconditional `runSearch();` call inside the effect. Ran `git stash && npm run
lint; git stash pop` to confirm this was newly introduced by the edit rather than
pre-existing — lint was clean on the stashed (pre-edit) tree, confirming the guard removal
caused it.

Traced the rule's implementation in
`node_modules/eslint-plugin-react-hooks/cjs/eslint-plugin-react-hooks.development.js`
(`validateNoSetStateInEffects`/`getSetStateCall`) and found
`enableAllowSetStateFromRefsInEffects: default(true)` — the rule has a built-in exemption
for setState calls dominated by a check on a `useRef().current` value. The original
`isFirstRender` guard (`if (isFirstRender.current) { ...; return; } runSearch();`) was
exactly that pattern, and had been keeping the component lint-clean via this exemption
without anyone having designed it for that purpose. Since the fetch now needs to run
unconditionally (no more "skip on first render"), that escape hatch no longer applied.

Refactored `SearchPageClient.tsx` to satisfy the rule properly rather than reintroduce a
dead ref-gated `if` just to game the linter:

- Replaced the `data`/`loading`/`error` `useState` triad, the `runSearch` `useCallback`,
  and the `requestIdRef` staleness guard with:
  - `retryTick` (`useState`, bumped by the retry button) combined with `requestParams`
    into a single `requestKey` string.
  - `result` (`useState<{ data: ToolsConnection; error: string | null }>`), set only
    inside the fetch's `.then()`/`.catch()` callbacks.
  - `resolvedKey` (`useState<string | null>`), also set only inside those callbacks.
  - `loading` derived as `resolvedKey !== requestKey` — no explicit `setLoading(true)`
    call anywhere, synchronous or otherwise.
- The effect now does a plain `fetch` with a closure-scoped `ignore` flag (the standard
  React-docs stale-response guard) and depends on `[requestParams, requestKey]`. Every
  `setState` call it makes lives inside `.then()`/`.catch()`, which is exactly the pattern
  the rule's own diagnostic text endorses ("Subscribe for updates from some external
  system, calling setState in a callback function when external state changes").
- The retry button's `onClick` now calls a `retry()` function that bumps `retryTick`
  (forcing a fresh `requestKey` even when `requestParams` hasn't changed), instead of
  calling `runSearch` directly.

Re-ran `npm run typecheck` and `npm run lint` — both clean.

---

## 4. Validating end to end

No browser-automation tool is installed in this environment (per existing project
preference, not reinstalled without asking). `.env.local` already points
`POSTGRAPHILE_URL` at a live backend, so validated against that directly:

1. Started the dev server in the background (`npm run dev -- -p 3100`).
2. `curl`'d `/` — `HTTP 200`, the `<h1>` markup present, no `Application error`/`digest`
   error markers, and `popularity` chart markup present — confirming the trimmed server
   component (facets + popularity only, no more `searchTools`) renders cleanly.
3. `curl`'d `/api/tools/search?sort=name` directly — got back real tool JSON (Substance
   Painter, Aseprite, Bevy, Blender, Construct 3, …) from the live PostGraphile backend,
   confirming the BFF route search path — now the *only* path serving results — still
   works end to end.
4. Stopped the background dev server via `TaskStop`.

Reported to the user, preserved here verbatim:

> ## Summary
>
> **Finding verified as valid**, with one caveat: applying it literally (just deleting
> `searchTools` from `page.tsx`'s `Promise.all`) would have silently broken the strict
> `react-hooks/set-state-in-effect` ESLint rule this repo runs, so the fix required
> touching `SearchPageClient.tsx`'s fetch logic too.
>
> **What changed:**
> - [page.tsx](src/app/page.tsx) — removed the server-side `searchTools()` call (and the
>   now-dead `parseFilterState`/`toSearchParams`/`RawSearchParams` machinery that existed
>   only to feed it). The server component now only fetches facets + popularity, both
>   still SSR'd as before.
> - [SearchPageClient.tsx](src/components/search/SearchPageClient.tsx) — dropped the
>   `initialResults`/`initialError` props and the `isFirstRender` skip, so the client
>   fetches on mount too, making `/api/tools/search` the single fetch path for every load
>   and every filter/sort/page change. Since the effect now always fires, I had to
>   restructure `loading`/`error`/`data` to be derived from a `requestKey`/`resolvedKey`
>   comparison rather than set synchronously inside the effect — the old code's
>   synchronous `setLoading(true)` was only lint-clean because it was gated behind the
>   `isFirstRender` ref check (a recognized escape hatch in that rule); once the fetch
>   runs unconditionally, that guard no longer applies. All `setState` calls now happen
>   inside the `.then()`/`.catch()` callbacks, which is the pattern the rule endorses. The
>   retry button now bumps a `retryTick` counter to force a re-fetch of the same params.
>
> **Why the previous code was actually redundant:** `page.tsx` reads `searchParams`,
> which Next.js's own docs say opts the route into request-time dynamic rendering — so
> every `router.replace()` from a filter/sort/page change re-executed the whole server
> component (including `searchTools`) *in addition to* the client's own fetch. That
> server-side result was thrown away every time except on the very first mount, since
> `useState(initialResults)` doesn't re-init from new props.
>
> **Validated:** `npm run typecheck` and `npm run lint` both pass clean. Started the dev
> server and confirmed the search page renders SSR content (facets/popularity, no error
> markers) and `GET /api/tools/search` returns live results from the real backend.

---

## 5. Wrap-up

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses
verbatim. Ideally, preserve the more detailed and explicative responses exactly. Follow
writing conventions of already existing snapshots inside docs/snapshots. Save the draft in
said directory when finished."

→ This document.

---

## Net code changes

- `src/app/page.tsx` — removed the server-side `searchTools()` call, the `EMPTY_RESULTS`
  constant, and the now-unused `parseFilterState`/`toSearchParams`/`RawSearchParams`
  URL-parsing plumbing; `Promise.all` now only fetches `getFacetOptions()`/
  `getPopularityChartData()`; `SearchPageClient` no longer receives `initialResults`/
  `initialError` props.
- `src/components/search/SearchPageClient.tsx` — dropped the `initialResults`/
  `initialError` props and the `isFirstRender`-guarded skip so the client fetches on
  mount as well as on every later filter/sort/page/retry change; replaced the
  `data`/`loading`/`error` state triad, the `runSearch` `useCallback`, and the
  `requestIdRef` staleness guard with a `result`/`resolvedKey`/`retryTick` design where
  `loading` is derived (`resolvedKey !== requestKey`) instead of set synchronously in the
  effect, keeping every `setState` call inside the fetch's `.then()`/`.catch()`
  callbacks; the retry button now calls a `retry()` that bumps `retryTick`.

## Lessons worth keeping

1. **A Server Component reading `searchParams` re-executes on every `router.replace()`-
   driven navigation, not just the first load** — per Next.js's own `page.md` docs,
   `searchParams` is "a Request-time API... [that] will opt the page into dynamic
   rendering at request time." A server-side fetch meant only to seed the *initial*
   render (like the old `searchTools()` call here) silently re-runs and gets discarded on
   every subsequent filter/sort/page change, because `useState(initialProp)` only
   consumes its initial value once and never re-syncs from later prop updates.
2. **Next.js documents an alternative to this exact class of problem**:
   `window.history.pushState`/`replaceState` instead of the router (see
   `04-linking-and-navigating.md`'s "Native History API" section), which avoids the
   server round-trip entirely for URL-only-state changes like filters/sort/pagination.
   Not applied here (out of scope for the literal ask, and `getFacetOptions`/
   `getPopularityChartData` re-fetching on every nav was explicitly left alone), but worth
   revisiting if that re-fetching ever becomes its own problem.
3. **`react-hooks/set-state-in-effect` (bundled via `eslint-config-next`'s React Compiler
   rules) has a default-on exemption for setState calls dominated by a
   `useRef().current` check** (`enableAllowSetStateFromRefsInEffects: default(true)`). The
   original `isFirstRender` guard here was relying on that exemption to stay lint-clean
   without anyone having designed it that way on purpose — removing a ref-gated
   "skip on first render" pattern can silently trip this rule even when the underlying
   fetch-in-effect pattern is otherwise completely standard React, and the fix is to
   derive `loading` from a comparable "key" rather than set it synchronously, not to
   reintroduce a dead ref-gated `if` just to satisfy the linter.
4. **Confirming a lint error is *new*, not pre-existing, is cheap and worth doing before
   chasing it**: `git stash && npm run lint; git stash pop` re-ran the exact same command
   against the pre-edit tree in seconds and settled the question directly.
5. **Without browser automation available, curling the SSR'd HTML plus hitting the BFF
   route directly is still a real end-to-end check against the live backend** — not just
   a typecheck/lint pass — since `.env.local` already pointed at a reachable
   `POSTGRAPHILE_URL`.
