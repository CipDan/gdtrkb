# Session log — sanitize search-route error logging and fix `hasBuiltInEditor` boolean parsing (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that verified and fixed two
> code-review findings against `src/app/api/tools/search/route.ts` and
> `src/lib/search/filterState.ts`: a `console.error(...)` call in the search route's catch
> block that logged the full `graphql-request` error object (risking leakage of the query
> and user-supplied search/filter variables into server logs), and a `hasBuiltInEditor`
> boolean query-param parser that silently coerced any non-`"true"` present value —
> including typos or garbage — into an active `false` filter instead of treating it as
> absent. User prompts and the assistant's responses are reproduced verbatim; tool-call
> output (file reads, greps, the typecheck/lint runs) is summarized narratively.

---

## 1. Finding #1: unsanitized error logging in the search route's catch block

**User (code-review finding, applied to `src/app/api/tools/search/route.ts:14-15`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with
> a brief reason, keep changes minimal, and validate.
>
> In @src/app/api/tools/search/route.ts around lines 14 - 15, Update the catch block in the
> tool search route to stop passing the full error object to console.error, as
> graphql-request errors may expose request details and user-supplied query variables. Log
> only a sanitized, non-sensitive message or an available correlation ID while preserving
> the existing failure handling.

The harness had already attached a full `Read` of `route.ts` (lines 1-21) as context: the
`GET` handler parses `filterState`, calls `searchTools(filterState)` inside a try/catch, and
the catch block ran `console.error("Tool search failed:", error)` before returning a generic
502.

---

## 2. Verifying finding #1 against current code

**Assistant:** "I'll check the surrounding code to confirm what kind of errors `searchTools`
can throw before deciding how to sanitize the log."

Read `src/lib/search/searchTools.ts` and `src/lib/graphql/client.ts`. Confirmed:

- `searchTools` calls `graphqlClient.request<ToolsSearchWire>({ document, variables, signal
  })`, where `variables` (`filter`, `orderBy`, `first`, `after`) are built directly from the
  request's own search/filter/pagination state.
- `graphqlClient` is a `graphql-request` `GraphQLClient`, which throws a `ClientError` on
  failure — its properties include `.request` (the document plus those variables) and
  `.response` (the raw upstream body).
- Grepped for any existing correlation-ID convention (`correlationId`, `requestId`,
  `x-request-id`, `randomUUID`) across `src` — none exists.

**Assistant:** "Confirmed still valid: `searchTools` uses `graphqlClient.request` from
`graphql-request`, which throws a `ClientError` containing `.request` (the full query +
variables — built from user-supplied search/filter params) and `.response` (raw upstream
body). Logging the whole `error` object as currently written would dump that into server
logs. No correlation-ID infra exists in this codebase, so I'll log just the error message
instead."

---

## 3. Fix #1: log only `error.message`

Edited `src/app/api/tools/search/route.ts`:

```ts
  } catch (error) {
    console.error(
      "Tool search failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Search is temporarily unavailable." },
      { status: 502 },
    );
  }
```

No correlation-ID plumbing exists to attach instead, so the fix logs a plain string rather
than the `ClientError`'s `.request`/`.response` payload. The 502 failure response is
unchanged.

---

## 4. Validating fix #1

Ran `npm run typecheck && npm run lint` — both clean.

**Assistant (final response for finding #1):** "Fixed. The catch block now logs only
`error.message` instead of the full error object, avoiding leakage of `graphql-request`'s
`ClientError.request` (query + user filter variables) and `.response` into server logs.
Typecheck and lint both pass."

---

## 5. Finding #2: `hasBuiltInEditor` boolean parsing coerces malformed values to `false`

**User (code-review finding, applied to `src/app/api/tools/search/route.ts:9`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with
> a brief reason, keep changes minimal, and validate.
>
> In @src/app/api/tools/search/route.ts at line 9, Update parseFilterState, used by the
> search route, to accept boolean filter parameters only when their values are exactly
> "true" or "false". Treat any other present value as null/absent, or reject the request
> with a 400 response, and ensure malformed values do not become false filters.

---

## 6. Verifying finding #2 against current code

Grepped `src/lib/search/filterState.ts` for the boolean parsing and read the file in full.
Confirmed the code still read:

```ts
hasBuiltInEditor: params.has("hasBuiltInEditor")
  ? params.get("hasBuiltInEditor") === "true"
  : null,
```

Any present-but-non-`"true"` value (e.g. `?hasBuiltInEditor=banana`) makes the `=== "true"`
comparison evaluate to `false`, so it's applied as a real filter — excluding tools that do
have a built-in editor — rather than being treated as absent. Noted the existing `parseEnum`
helper a few lines above already treats unrecognized `type`/`licensing` values as `null`
instead of erroring (from the same-day `filter-state-enum-validation-fix` session).

**Assistant:** "Confirmed: `hasBuiltInEditor` is parsed as `params.get(...) === "true"` —
any present-but-not-\"true\" value (e.g. `?hasBuiltInEditor=banana`) silently becomes
`false`, applying an unintended filter instead of being treated as absent. This matches the
existing `parseEnum` pattern used for `type`/`licensing`, which treats unrecognized values as
`null` rather than erroring — I'll follow that same convention for consistency."

---

## 7. Fix #2: add a strict `parseBoolean` helper

Edited `src/lib/search/filterState.ts`:

```ts
// Only "true"/"false" are valid; anything else (missing, malformed, or
// mistyped) is treated as absent instead of silently becoming `false`.
function parseBoolean(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}
```

```ts
    hasBuiltInEditor: parseBoolean(params.get("hasBuiltInEditor")),
```

An IDE diagnostic fired between the two sequential edits ("'parseBoolean' is declared but
its value is never read" — true only in the moment between adding the helper and wiring it
into `parseFilterState`).

**Assistant:** "That diagnostic is stale — it ran between my two edits, before
`parseBoolean` was wired in. Let me confirm the final state and validate."

Re-read the file and confirmed `parseBoolean` was in fact called from `parseFilterState`.

**Assistant:** "Confirmed correct — `parseBoolean` is now used at line 74 (`hasBuiltInEditor`
field). Let's validate with typecheck/lint."

---

## 8. Validating fix #2

Ran `npm run typecheck && npm run lint` — both clean.

**Assistant:** "Both pass. Let me also check `serializeFilterState` and any UI callers still
round-trip correctly with this change."

Grepped for other `hasBuiltInEditor` references (`SearchPageClient.tsx`,
`DetailHeader.tsx`, `buildFilter.ts`, `FacetPanel.tsx`, `types/index.ts`, the GraphQL layer).
All set or consume it as an actual `boolean | null`; `serializeFilterState` already
serializes it via `String(state.hasBuiltInEditor)`, which only ever produces `"true"` or
`"false"` — so no other call site needed changes.

**Assistant (final response for finding #2):** "Fixed. Added a `parseBoolean` helper
(mirroring the existing `parseEnum` convention) so `hasBuiltInEditor` only becomes
`true`/`false` on exact string matches — any other value (missing, typo, garbage) now parses
to `null`/absent instead of silently becoming a `false` filter. Typecheck and lint both
pass."

---

## 9. Wrap-up

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses
verbatim. Follow writing conventions of already existing snapshots inside docs/snapshots.
Save the draft in said directory when finished."

→ This document.

---

## Net code changes

- `src/app/api/tools/search/route.ts` — catch block now logs
  `error instanceof Error ? error.message : "Unknown error"` instead of the raw `error`
  object.
- `src/lib/search/filterState.ts` — added a `parseBoolean` helper; `hasBuiltInEditor` in
  `parseFilterState` now goes through `parseBoolean(...)` instead of
  `params.has(...) ? params.get(...) === "true" : null`.

## Lessons worth keeping

1. **A generic `console.error("...", error)` on a `graphql-request` failure is a
   logging-side info-exposure risk, not just noise** — `ClientError` carries `.request`
   (query + variables, which here are built straight from user search/filter input) and
   `.response` (raw upstream body). Absent an existing correlation-ID convention, logging
   `error.message` alone is the minimal safe default.
2. **The `=== "true"` boolean-param pattern silently treats "malformed" as "false"**, which
   is a real filtering bug reachable by a simple typo, not just a style nit — any
   non-`"true"` present value (including garbage) becomes an active filter rather than
   being ignored. The fix mirrors the codebase's own existing convention for enum params
   (`parseEnum`, from the same-day `filter-state-enum-validation-fix` session) rather than
   introducing a new 400-rejection code path — checking that the convention already existed
   settled which of the finding's two suggested remediations ("null" vs. "400") to take.
3. **A stale "declared but never read" diagnostic can fire between two sequential `Edit`
   calls in the same turn** — re-reading the file after both edits landed confirmed it was
   transient, the same pattern noted in the `filter-state-enum-validation-fix` and
   `search-facet-filter-fix` sessions.
