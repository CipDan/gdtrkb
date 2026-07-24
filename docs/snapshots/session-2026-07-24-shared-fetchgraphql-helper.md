# Session log — shared `fetchGraphql` helper across GraphQL call sites (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that fixed a CodeRabbit
> finding on `src/lib/graphql/toolCount.ts`: the `withTimeout(() => graphqlClient.request({
> document, variables?, signal }))` boilerplate was repeated near-verbatim across every
> GraphQL call site, and CodeRabbit suggested collapsing it into one shared `fetchGraphql`
> helper in `client.ts`. The task instruction scoped the fix to five named files
> (`toolCount.ts`, `areas.ts`, `facets.ts`, `popularity.ts`, `tool.ts`); verification turned
> up a sixth call site with the identical pattern (`src/lib/search/searchTools.ts`) that
> neither CodeRabbit nor the task instruction named. The first attempt scoped the fix to
> just the five named files and left `searchTools.ts` alone — the user rejected that edit
> and asked for `searchTools.ts` to be covered too, so the fix was redone across all six.
> User prompts, the tool-rejection reason, and the assistant's final reported answer are
> reproduced verbatim; tool-call output (reads, greps, diagnostics, typecheck/lint runs) is
> summarized narratively.

---

## 1. Code-review finding

**User (code-review finding, applied to `src/lib/graphql/toolCount.ts:13-25`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with
> a brief reason, keep changes minimal, and validate.
>
> In @src/lib/graphql/toolCount.ts around lines 13 - 25, Introduce a shared fetchGraphql
> helper alongside the existing GraphQL client and withTimeout utilities, accepting a
> document and optional variables while forwarding the timeout signal to
> graphqlClient.request. Update getToolCount and the corresponding GraphQL call sites in
> areas.ts, facets.ts, popularity.ts, and tool.ts to use this helper, preserving each
> caller's existing result handling and error behavior.
>
> Refer to the CodeRabbit comment below as well:
>
> ---BEGIN COMMENT---
> CodeRabbit
> Consider a shared fetchGraphql helper.
>
> The withTimeout(() => graphqlClient.request({ document, variables?, signal }))
> boilerplate is repeated near-verbatim across areas.ts, facets.ts, popularity.ts, tool.ts,
> and this file. A small shared wrapper (optionally including the logging suggested above)
> would remove the duplication across all five call sites in one place.
>
> // e.g. in src/lib/graphql/client.ts
> export function fetchGraphql<T>(
>   document: string,
>   variables?: Record<string, unknown>,
> ): Promise<T> {
>   return withTimeout((signal) =>
>     graphqlClient.request<T>({ document, variables, signal }),
>   );
> }
> ---END COMMENT---

The harness had already attached a full `Read` of `toolCount.ts` as context, showing the
current `getToolCount` implementation with the inline
`withTimeout((signal) => graphqlClient.request<ToolTotalCountWire>({ document, signal }))`
call the finding described.

---

## 2. Verifying the finding against current code

Read `client.ts` (confirmed `graphqlClient` and `withTimeout` exports, no `fetchGraphql`
yet) and globbed `src/lib/graphql/*.ts` — `areas.ts` was not among the results, unlike what
both the task instruction and the CodeRabbit comment implied by listing it alongside the
other `graphql/`-directory files.

Grepped `src` for `withTimeout` to find every real call site: `tool.ts`, `toolCount.ts`,
`searchTools.ts`, `facets.ts`, `popularity.ts`, and `client.ts` itself, plus a `Glob` hit
confirming the actual location of the file CodeRabbit called `areas.ts` — `src/lib/areas.ts`,
not `src/lib/graphql/areas.ts`. Read all five consumer files in full
(`areas.ts`, `facets.ts`, `popularity.ts`, `tool.ts`, `searchTools.ts`). Every one matched
the described pattern exactly, e.g. `tool.ts`'s `getToolBySlug`:

```ts
const result = await withTimeout((signal) =>
  graphqlClient.request<ToolBySlugResult>({
    document: TOOL_BY_SLUG_QUERY,
    variables: { slug },
    signal,
  }),
);
```

`tool.ts` has two call sites (`getToolBySlug` and `getAllToolSlugs`), so the duplication
count matches CodeRabbit's "all five call sites" when counted by file (five files named,
one with two usages) — plus `toolCount.ts` itself, for six usages total across six files.
`searchTools.ts` (`src/lib/search/searchTools.ts`) carried the identical pattern but was
named by neither the task instruction nor the CodeRabbit comment.

---

## 3. Scoping decision — an edit rejected and reconsidered

**Assistant:**

> Confirmed valid — the duplicated `withTimeout(() => graphqlClient.request(...))` pattern
> appears in `toolCount.ts`, `areas.ts`, `facets.ts`, `popularity.ts`, and `tool.ts`
> (twice). I'll add the shared helper and update those five files, matching the task scope
> (leaving `searchTools.ts`, which has the same pattern but wasn't named in the review,
> untouched).

Attempted an `Edit` on `client.ts` to add the `fetchGraphql` helper. The user rejected the
tool call, with reason:

> If searchTools.ts has the same pattern and the fix can be safely applied there without
> breaking existing logic, add the shared helper to it as well.

---

## 4. Applying the fix across six files

Re-applied the `client.ts` edit, adding the helper CodeRabbit's suggested diff described:

```ts
// Shared by every GraphQL call site to avoid repeating the
// withTimeout(() => graphqlClient.request(...)) boilerplate.
export function fetchGraphql<T>(
  document: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return withTimeout((signal) =>
    graphqlClient.request<T>({ document, variables, signal }),
  );
}
```

Then updated every call site to the same shape — replace the `graphqlClient, withTimeout`
import with `fetchGraphql`, and collapse the `withTimeout((signal) => graphqlClient.request(...))`
block into a single `fetchGraphql<T>(QUERY, variables?)` call, keeping each function's
existing `try`/`catch`, result-shaping, and `cache()`/throw behavior untouched:

- **`toolCount.ts`** (`getToolCount`) — `fetchGraphql<ToolTotalCountWire>(TOOL_TOTAL_COUNT_QUERY)`,
  still inside the existing `try { ... } catch { return null }`.
- **`areas.ts`** (`getAreaOfUseDescendantSlugs`) —
  `fetchGraphql<AreaOfUseDescendantsResult>(AREA_DESCENDANTS_QUERY, { rootSlug })`.
- **`facets.ts`** (`getFacetOptions`) — `fetchGraphql<FacetOptionsWire>(FACET_OPTIONS_QUERY)`,
  still inside its never-throwing `try`/`catch`.
- **`popularity.ts`** (`getPopularityChartData`) —
  `fetchGraphql<PopularityChartWire>(POPULARITY_CHART_QUERY, { first: CHART_SIZE })`.
- **`tool.ts`** — `getToolBySlug` now reads
  `fetchGraphql<ToolBySlugResult>(TOOL_BY_SLUG_QUERY, { slug })` (still throws on failure,
  unlike the others, per its existing comment about the route's error boundary);
  `getAllToolSlugs` now reads `fetchGraphql<ToolSlugsResult>(TOOL_SLUGS_QUERY)` inside its
  own `try`/`catch` that logs and falls back to `[]`.
- **`searchTools.ts`** (`searchTools`) —
  `fetchGraphql<ToolsSearchWire>(TOOLS_SEARCH_QUERY, { filter, orderBy, first: PAGE_SIZE, after: state.cursor })`.

---

## 5. Transient IDE diagnostics

Between the paired edits landing in each file (import line changed, call site changed
right after, within the same batched tool-call response), the PostToolUse hook surfaced
diagnostics like `Cannot find name 'withTimeout'` / `Cannot find name 'graphqlClient'` for
`areas.ts`, `facets.ts`, `popularity.ts`, and `tool.ts` — the same class of transient
mid-batch state already documented in
`session-2026-07-24-withtimeout-abort-controller-fix.md`. Re-read all six touched files
(plus `client.ts`) in full afterward and confirmed every one reflected the final,
consistent state with no leftover `graphqlClient`/`withTimeout` references.

---

## 6. Validation

Ran `npm run typecheck` — clean, no output. Ran `npm run lint` — clean, no output. Called
`ReportFindings` with one finding, `verdict: CONFIRMED`, `outcome: fixed`.

---

## 7. Final report

**Assistant (final response):**

> Added `fetchGraphql<T>(document, variables?)` in
> [client.ts](src/lib/graphql/client.ts#L49-L56), wrapping `withTimeout` +
> `graphqlClient.request` in one place. Updated all six call sites — `toolCount.ts`,
> `areas.ts`, `facets.ts`, `popularity.ts`, `tool.ts` (both `getToolBySlug` and
> `getAllToolSlugs`), and `searchTools.ts` — to use it, preserving each caller's try/catch
> and result-shaping logic unchanged. `npm run typecheck` and `npm run lint` both pass
> clean.

---

## 8. Snapshot request

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses
verbatim. Follow writing conventions of already existing snapshots inside docs/snapshots.
Save the draft in said directory when finished."

→ This document.

---

## Net code changes

- `src/lib/graphql/client.ts` — added `fetchGraphql<T>(document, variables?)`, wrapping
  `withTimeout((signal) => graphqlClient.request<T>({ document, variables, signal }))` in
  one shared function.
- `src/lib/graphql/toolCount.ts` (`getToolCount`), `src/lib/areas.ts`
  (`getAreaOfUseDescendantSlugs`), `src/lib/graphql/facets.ts` (`getFacetOptions`),
  `src/lib/graphql/popularity.ts` (`getPopularityChartData`), `src/lib/graphql/tool.ts`
  (`getToolBySlug`, `getAllToolSlugs`), and `src/lib/search/searchTools.ts` (`searchTools`)
  — all six/seven call sites now call `fetchGraphql(...)` instead of
  `withTimeout((signal) => graphqlClient.request(...))`; dropped the now-unused
  `graphqlClient`/`withTimeout` imports (or `graphqlClient, withTimeout` → `fetchGraphql`)
  from each. Each caller's own `try`/`catch`, throw-vs-swallow behavior, and result mapping
  is unchanged.

## Lessons worth keeping

1. **A task instruction that names specific files can still miss a real duplicate** — the
   review comment and the task both listed five files, but grepping for the actual pattern
   (`withTimeout` + `graphqlClient.request`) turned up a sixth, identical call site in
   `searchTools.ts` that neither mentioned. Surfacing that discrepancy in the response
   before choosing a scope (rather than silently narrowing to the named list, or silently
   expanding past it) is what let the user correct the scope with one line instead of
   having to notice the gap themselves later.
2. **A file path named in a review comment is a claim about where the file lives, not a
   guarantee** — CodeRabbit and the task instruction both implied `areas.ts` sits in
   `src/lib/graphql/`, alongside the other four files; it's actually at `src/lib/areas.ts`.
   `Glob`/`Grep` caught the mismatch before it caused an edit to the wrong (non-existent)
   path.
3. **Batched multi-edit tool calls still produce transient IDE diagnostics mid-batch** —
   the same phenomenon from `session-2026-07-24-withtimeout-abort-controller-fix.md`
   recurred here across four files simultaneously; re-reading each file's final state
   after the batch settled (rather than reacting to the intermediate hook output) confirmed
   there was nothing to fix.
