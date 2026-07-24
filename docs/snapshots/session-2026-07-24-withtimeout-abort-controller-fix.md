# Session log — `withTimeout` owns its `AbortController` (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that fixed a CodeRabbit
> finding on `src/lib/graphql/client.ts`'s `withTimeout` helper: the timer rejected the
> wrapper promise but never aborted the underlying request, so a caller's
> `AbortSignal.timeout(GRAPHQL_TIMEOUT_MS)` was the only thing standing between a stalled
> upstream and an unbounded network request — and that signal was already known (from
> `session-2026-07-23-graphql-timeout-hardening.md`) not to reliably fire under Next's
> dev-mode fetch patch. Also covers a follow-up question about whether the fix conflicts
> with any existing app/API flow. User prompts and the assistant's final reported answers
> are reproduced verbatim, with the second answer preserved in full per explicit
> instruction; tool-call output (reads, greps, diagnostics, typecheck/lint runs) is
> summarized narratively.

---

## 1. Code-review finding

**User (code-review finding, applied to `src/lib/graphql/client.ts:13-41`):**

> In @src/lib/graphql/client.ts around lines 13 - 41, Update withTimeout to accept a
> request factory receiving an AbortSignal, create its own AbortController, and abort it
> when the timeout fires before rejecting the wrapper promise. Update all six withTimeout
> call sites to pass request callbacks and use the provided signal, removing their
> duplicated AbortSignal.timeout configuration while preserving existing error
> normalization and cleanup.
>
> Refer to the CodeRabbit comment below as well:
>
> ---BEGIN COMMENT---
> CodeRabbit
> withTimeout doesn't actually cancel the request when it "times out."
>
> The setTimeout only rejects the wrapper promise; it never calls .abort() on anything.
> The real cancellation depends entirely on the per-call AbortSignal.timeout(GRAPHQL_TIMEOUT_MS)
> passed by every caller — and the comment on Line 18 itself says that signal "doesn't
> reliably" fire in Next's dev-mode fetch patch. In that exact scenario, callers give up
> on the promise while the real network request keeps running unbounded, which is a
> resource-leak/hazard risk especially under the "API cold-starting" conditions this
> module is designed to tolerate.
>
> Consider having withTimeout own the AbortController and abort it from its own timer,
> which also removes the need to duplicate AbortSignal.timeout(GRAPHQL_TIMEOUT_MS) at
> every one of the 6 call sites.
>
> [suggested diff turning `withTimeout<T>(request: Promise<T>)` into
> `withTimeout<T>(makeRequest: (signal: AbortSignal) => Promise<T>)`, owning a new
> `AbortController` and calling `controller.abort()` inside the timeout callback before
> rejecting, with call sites becoming
> `withTimeout((signal) => graphqlClient.request<T>({ document, variables, signal }))`]
> ---END COMMENT---

The harness had already attached a full `Read` of `client.ts` as context, showing the
current `withTimeout<T>(request: Promise<T>)` — a `setTimeout` that only called
`reject(new Error("GraphQL request timed out"))`, with no `AbortController` anywhere in
the function.

---

## 2. Verifying the finding and the six call sites

Grepped `src` for `withTimeout` — confirmed 7 files: `client.ts` itself plus six
consumers (`tool.ts`, `areas.ts`, `popularity.ts`, `facets.ts`, `searchTools.ts`,
`toolCount.ts`). Read all six in full. Every one matched the pattern the finding
described exactly:

```ts
const result = await withTimeout(
  graphqlClient.request<SomeWire>({
    document: SOME_QUERY,
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  }),
);
```

(`tool.ts` has two call sites — `getToolBySlug` and `getAllToolSlugs` — so six call sites
across five other files, plus `client.ts` itself, matches the finding's "all six" count.)

Checked `package.json` — `graphql-request@7.4.0`, confirming the object-style
`request({ document, variables, signal })` call shape (already in use) supports a
`signal` field, so swapping its source from a static `AbortSignal.timeout()` to a
controller-owned signal is a drop-in change.

Confirmed CONFIRMED: the finding matched current code exactly, with no drift from
whatever CodeRabbit originally reviewed.

---

## 3. Applying the fix

Rewrote `withTimeout` in `client.ts` to own an `AbortController` and abort it inside the
timeout callback, before rejecting:

```ts
// Bounds a GraphQL request so a stalled upstream can't hang the caller
// (e.g. an SSR render with no error boundary) indefinitely. Owns the
// AbortController itself and aborts it on timeout — relying solely on a
// caller-supplied `AbortSignal.timeout(...)` isn't enough because Next's
// dev-mode fetch patch doesn't reliably honor the signal alone, which would
// leave the real network request running unbounded after callers give up.
export function withTimeout<T>(
  makeRequest: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("GraphQL request timed out"));
    }, GRAPHQL_TIMEOUT_MS);
    makeRequest(controller.signal)
      .then(resolve, (err: unknown) =>
        reject(
          err instanceof DOMException
            ? new Error(err.message, { cause: err })
            : err,
        ),
      )
      .finally(() => clearTimeout(timer));
  });
}
```

The `DOMException`-normalization branch (from the prior session's fix) was left
untouched, as instructed.

Updated all six call sites to the same shape — drop the `GRAPHQL_TIMEOUT_MS` import
(no longer needed at call sites), pass a `(signal) => ...` callback, and use `signal`
in place of `AbortSignal.timeout(GRAPHQL_TIMEOUT_MS)`:

```ts
const result = await withTimeout((signal) =>
  graphqlClient.request<SomeWire>({
    document: SOME_QUERY,
    signal,
  }),
);
```

Applied to `tool.ts` (`getToolBySlug`, `getAllToolSlugs`), `areas.ts`
(`getAreaOfUseDescendantSlugs`), `popularity.ts` (`getPopularityChartData`), `facets.ts`
(`getFacetOptions`), `searchTools.ts` (`searchTools`), and `toolCount.ts`
(`getToolCount`) — each got an import-line edit (dropping `GRAPHQL_TIMEOUT_MS`) and a
call-site edit.

Each file briefly surfaced IDE diagnostics between the two edits landing (e.g.
`Cannot find name 'GRAPHQL_TIMEOUT_MS'` right after the import was trimmed but before the
call site was updated, or the reverse) — these were transient mid-edit states from the
two edits per file being applied in sequence within one batched tool call, not real
errors. Re-reading `tool.ts` after both its edits landed confirmed the final state was
correct.

---

## 4. Validation

Ran `npm run typecheck` — clean, no output. Ran `npm run lint` — clean, no output. Called
`ReportFindings` with one finding, `verdict: CONFIRMED`, `outcome: fixed`.

**Assistant (final response):**

> **Fixed.** `withTimeout` now owns an `AbortController` and calls `.abort()` on it when
> the timer fires, before rejecting — so a stalled request is actually cancelled instead
> of merely being abandoned by the caller. It takes a `(signal) => Promise<T>` factory
> instead of a bare promise; all six call sites (`tool.ts` ×2, `areas.ts`, `popularity.ts`,
> `facets.ts`, `searchTools.ts`, `toolCount.ts`) were updated to pass a callback using the
> provided `signal`, dropping their duplicated `AbortSignal.timeout(GRAPHQL_TIMEOUT_MS)`
> (and now-unused `GRAPHQL_TIMEOUT_MS` imports). Error normalization and `finally`-based
> cleanup are unchanged.
>
> Verified with `npm run typecheck` and `npm run lint` — both clean.

---

## 5. Follow-up: conflict check against existing app/API flows

**User:** "Are the applied fixes in conflict with any of the existing app/API flows?"

Re-grepped `src` for `GRAPHQL_TIMEOUT_MS|withTimeout|AbortSignal` — confirmed no stale
imports or leftover `AbortSignal.timeout()` usages anywhere. Grepped for
`AbortError|DOMException|getToolBySlug|getAllToolSlugs|getFacetOptions|
getPopularityChartData|getToolCount|searchTools\(|getAreaOfUseDescendantSlugs` to find
every consumer of the six changed functions — 11 files, including the five `src/lib`
files just edited plus `app/tools/[slug]/page.tsx`, `app/api/tools/search/route.ts`,
`app/page.tsx`, and `components/ui/Topbar.tsx`. Read the route handler and the tool
detail page in full; grepped the other two for the relevant call sites. Also checked for
test files referencing `withTimeout` or `GRAPHQL_TIMEOUT_MS` — none exist.

**Assistant (final response, preserved in full per instruction):**

> No conflicts. I checked every consumer of the six changed functions:
>
> - **`app/api/tools/search/route.ts`** (via `searchTools`) and
>   **`app/tools/[slug]/page.tsx`** (via `getToolBySlug`, which throws to
>   `app/error.tsx`) only do `error instanceof Error` / `.message` checks — they don't
>   inspect `error.name` or `DOMException`-specific fields, so the (unchanged)
>   error-normalization path still satisfies them.
> - **`app/page.tsx`** (`getFacetOptions`, `getPopularityChartData`) and `Topbar.tsx`
>   (`getToolCount`) call functions that already catch internally and never throw —
>   untouched by this change.
> - No test files reference `withTimeout` or `GRAPHQL_TIMEOUT_MS`, so nothing to update
>   there.
>
> On the mechanics: the timeout still settles the outer promise with the same
> `Error("GraphQL request timed out")` as before (that `reject` fires synchronously in
> the timer callback, before the now-aborted request's own rejection arrives), so every
> caller sees the identical error shape and message it did previously — the only
> behavioral change is that the in-flight network request is now actually cancelled
> instead of left running. Each call gets its own `AbortController`, and `graphqlClient`
> is stateless per call, so concurrent requests (e.g. `Promise.all` in `page.tsx`) don't
> share or interfere with each other's abort signal. `graphql-request`'s
> `{ document, variables, signal }` shape is unchanged — only the signal's source moved
> from a static `AbortSignal.timeout()` to a controller `withTimeout` owns.
>
> No stale `GRAPHQL_TIMEOUT_MS` imports remain, and typecheck/lint are already clean
> from the prior fix.

---

## 6. Snapshot request

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses
verbatim. Preserve detailed and explicative responses exactly. Follow writing conventions
of already existing snapshots inside docs/snapshots. Save the draft in said directory
when finished."

→ This document.

---

## Net code changes

- `src/lib/graphql/client.ts` — `withTimeout<T>` changed signature from
  `(request: Promise<T>)` to `(makeRequest: (signal: AbortSignal) => Promise<T>)`; now
  creates its own `AbortController` and calls `controller.abort()` inside the timeout
  callback before rejecting. `DOMException` error-normalization and `finally`-based
  timer cleanup unchanged.
- `src/lib/graphql/tool.ts` (`getToolBySlug`, `getAllToolSlugs`), `src/lib/areas.ts`
  (`getAreaOfUseDescendantSlugs`), `src/lib/graphql/popularity.ts`
  (`getPopularityChartData`), `src/lib/graphql/facets.ts` (`getFacetOptions`),
  `src/lib/search/searchTools.ts` (`searchTools`), `src/lib/graphql/toolCount.ts`
  (`getToolCount`) — all six call sites now pass `withTimeout((signal) => ...)` and use
  the provided `signal` instead of their own `AbortSignal.timeout(GRAPHQL_TIMEOUT_MS)`;
  dropped the now-unused `GRAPHQL_TIMEOUT_MS` import from each.

## Lessons worth keeping

1. **A timer that only rejects a wrapper promise doesn't cancel anything** — the actual
   network request keeps running until whatever signal *it* was given fires (or its
   transport's own default timeout does). Whichever function imposes the deadline should
   own the `AbortController` it aborts, rather than trusting every caller to separately
   wire up an equivalent signal — this is the same class of gap the prior day's session
   documented for the pre-`withTimeout` code (see
   `session-2026-07-23-graphql-timeout-hardening.md`), recurring one layer up.
2. **Batched multi-edit tool calls can surface transient IDE diagnostics mid-batch** —
   editing a file's import line and its call site as two separate `Edit` calls within one
   response produces a real (but momentary) "cannot find name" state between them; the
   fix is to check the diagnostics against the *final* file state, not react to every
   intermediate one.
3. **Verifying "no conflict" after a signature change means walking every caller, not
   just re-running typecheck** — `tsc`/`eslint` confirm the types line up, but confirming
   behavioral compatibility (same error shape, no shared mutable state across concurrent
   calls, no test coverage silently invalidated) needed grepping for and reading each of
   the four downstream consumers (`route.ts`, `page.tsx` ×2, `Topbar.tsx`) individually.
