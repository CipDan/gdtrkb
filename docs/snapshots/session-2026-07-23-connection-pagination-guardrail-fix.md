# Session log — require first/last on every connection selection in guardrails.js (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that closed a gap in
> `db/postgraphile/guardrails.js`'s `maxPageSizeRule`: it validated `first`/`last` when
> supplied but did nothing when a connection selection omitted them entirely, letting
> PostGraphile fall through to returning every row. User prompts and the assistant's
> final reported answers are reproduced verbatim; tool-call output (file reads, greps,
> the validation test run) is summarized narratively.

---

## 1. Code-review finding

**User (code-review finding, applied to `db/postgraphile/guardrails.js:47-73`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with
> a brief reason, keep changes minimal, and validate.
>
> In @db/postgraphile/guardrails.js around lines 47 - 73, Update maxPageSizeRule to reject
> connection nodes/edges selections that lack a finite first or last argument, while
> preserving the existing MAX_PAGE_SIZE validation for supplied values. Identify the
> affected connection selections in the rule's AST traversal and ensure the application's
> unpaginated facet queries provide explicit page-size caps.

The harness had already attached a `Read` of `guardrails.js` as context, showing the
`Argument(node)` visitor that only fires — and only rejects — when a `first`/`last`
argument node is actually present in the document and its resolved value exceeds
`MAX_PAGE_SIZE`.

---

## 2. Verifying the finding against current state

Confirmed the gap was real by tracing every connection selection the app actually sends,
across `src/lib/graphql/queries.ts`, `src/lib/areas.ts`, `src/lib/search/searchTools.ts`,
and `src/lib/graphql/popularity.ts`:

- `TOOLS_SEARCH_QUERY`'s root `tools(...)` already carried `first: $first` — fine.
- `TOOLS_SEARCH_QUERY`'s nested `toolAreaOfUses { nodes { areaOfUse { slug name } } }` —
  **no `first`/`last` at all.**
- `FACET_OPTIONS_QUERY`'s `platforms { nodes {...} }`, `languages { nodes {...} }`, and
  `areaOfUses { nodes {...} }` — **all three unpaginated.**
- `AREA_DESCENDANTS_QUERY`'s `areaOfUseDescendants(rootSlug: $rootSlug) { nodes { slug } }`
  — **unpaginated** (a SETOF-returning function auto-exposed as a connection, per
  `docs/schema-spec.md:638`).
- `POPULARITY_CHART_QUERY`'s `topTools` already carried `first: $first`; its `missing`
  sub-query only selects `{ totalCount }` — no `nodes`/`edges`, so it was never at risk
  and needs no cap.
- `TOOL_TOTAL_COUNT_QUERY`'s `tools { totalCount }` — same as above, count-only, no rows
  fetched.

Checked `db/postgraphile/server.js` for any other default row limit (e.g. a
`pgDefaultRowLimit`-style option) that might already bound unpaginated connections —
none configured. PostGraphile's own default behavior for a connection field queried
without `first`/`last` is to return every matching row, so the five unpaginated
selections above were a genuine unbounded-response gap on a public, unauthenticated
endpoint, not a hypothetical one.

Checked `docs/schema-spec.md` for expected row counts on the reference tables
(`platform`, `language`, `area_of_use`) to size a sane cap rather than picking an
arbitrary number — the seed data showed roughly a dozen platforms/languages and under
forty areas of use, comfortably inside the existing `MAX_PAGE_SIZE` of 100.

Conclusion: the finding was fully valid and directly fixable — both the guardrail rule
itself and the five call sites it now correctly flags.

---

## 3. Fix: require a finite first/last on every connection selection

Rewrote the rule's traversal in `db/postgraphile/guardrails.js` from an `Argument`
visitor (which only ever looks at arguments that exist) to a `Field` visitor that
detects connection-shaped selections — any field whose selection set contains a
`nodes` or `edges` sub-field — and requires a `first`/`last` argument that resolves to
a finite number no greater than `MAX_PAGE_SIZE`:

```js
return {
  Field(node) {
    const selections = node.selectionSet && node.selectionSet.selections;
    const isConnectionSelection =
      selections &&
      selections.some(
        (selection) =>
          selection.kind === Kind.FIELD &&
          (selection.name.value === "nodes" ||
            selection.name.value === "edges"),
      );
    if (!isConnectionSelection) return;

    const args = node.arguments || [];
    const firstArg = args.find((arg) => arg.name.value === "first");
    const lastArg = args.find((arg) => arg.name.value === "last");

    if (!firstArg && !lastArg) {
      context.reportError(
        new GraphQLError(
          `Connection field "${node.name.value}" must specify a "first" or "last" argument (max ${MAX_PAGE_SIZE}).`,
          node,
        ),
      );
      return;
    }

    for (const argNode of [firstArg, lastArg]) {
      if (!argNode) continue;
      const value = resolveArgValue(argNode);

      if (typeof value !== "number" || !Number.isFinite(value)) {
        context.reportError(
          new GraphQLError(
            `Argument "${argNode.name.value}" on "${node.name.value}" must resolve to a finite number (max ${MAX_PAGE_SIZE}).`,
            argNode,
          ),
        );
      } else if (value > MAX_PAGE_SIZE) {
        context.reportError(
          new GraphQLError(
            `Argument "${argNode.name.value}" must not exceed ${MAX_PAGE_SIZE}.`,
            argNode,
          ),
        );
      }
    }
  },
};
```

`resolveArgValue` is the same literal/variable/variable-default resolution the old rule
used, factored out unchanged. Fields that only select `{ totalCount }` — like
`POPULARITY_CHART_QUERY`'s `missing` and `TOOL_TOTAL_COUNT_QUERY`'s `tools` — have no
`nodes`/`edges` in their selection set, so `isConnectionSelection` is false and they're
correctly left uncapped.

---

## 4. Fix: add explicit caps to the app's unpaginated facet queries

- `src/lib/graphql/queries.ts` — `toolAreaOfUses(first: 20)` on the per-tool nested
  connection inside `TOOLS_SEARCH_QUERY`; `platforms(first: 100)`,
  `languages(first: 100)`, `areaOfUses(first: 100)` in `FACET_OPTIONS_QUERY`.
- `src/lib/areas.ts` — `areaOfUseDescendants(rootSlug: $rootSlug, first: 100)` in
  `AREA_DESCENDANTS_QUERY`.

All five caps are comment-flagged as guardrail headroom, not real limits — the
reference tables involved hold far fewer rows than the caps allow.

---

## 5. Validation

No live database or generated PostGraphile schema was available in this environment
(same constraint noted in the original guardrails session), so validation used the same
approach as that session: a hand-built minimal `graphql-js` schema plus
`graphql.validate()`, invoking the guardrail hooks exactly as PostGraphile's own request
handler does. Two temporary scripts, deleted after passing (not part of the repo):

**Edge-case coverage** (8 cases — missing arg, over-limit literal, unresolvable
variable, nested unpaginated/paginated connections, `totalCount`-only selection):

```
PASS - missing first/last on connection -> should fail
PASS - explicit first within limit -> should pass
PASS - explicit first over limit -> should fail
PASS - variable first resolved from variables, within limit -> should pass
PASS - variable first with no value and no default -> should fail
PASS - totalCount-only selection, no first/last -> should pass
PASS - nested unpaginated connection -> should fail
PASS - nested paginated connection -> should pass

ALL GOOD
```

**Real app queries** (the exact query text now in `queries.ts`/`areas.ts`, run through
the same rule):

```
PASS - TOOLS_SEARCH_QUERY -> errors: []
PASS - FACET_OPTIONS_QUERY -> errors: []
PASS - POPULARITY_CHART_QUERY -> errors: []
PASS - TOOL_TOTAL_COUNT_QUERY -> errors: []
PASS - AREA_DESCENDANTS_QUERY -> errors: []

ALL APP QUERIES PASS GUARDRAILS
```

Also ran `npm run typecheck` (clean) and `eslint` against all three touched files
(`db/postgraphile/guardrails.js`, `src/lib/graphql/queries.ts`, `src/lib/areas.ts` —
clean, no output), and `git status --short` on the same three paths to confirm no
unrelated files were touched.

---

## 6. Final summary given to user

**Assistant (final response for this finding):**

> **Fixed.** `maxPageSizeRule` in [guardrails.js](db/postgraphile/guardrails.js#L47)
> previously only checked `first`/`last` when present — a connection selection with
> neither argument sailed through and PostGraphile would return every row. Confirmed
> this was live in the app: `FACET_OPTIONS_QUERY`'s `platforms`/`languages`/`areaOfUses`,
> `AREA_DESCENDANTS_QUERY`'s `areaOfUseDescendants`, and the nested `toolAreaOfUses`
> inside `TOOLS_SEARCH_QUERY` all omitted a page-size cap.
>
> Changes:
> - **guardrails.js** — switched the traversal from an `Argument` visitor to a `Field`
>   visitor that detects connection-shaped selections (selection set containing
>   `nodes`/`edges`) and rejects them unless a `first`/`last` argument resolves to a
>   finite number ≤ `MAX_PAGE_SIZE`. Non-connection selections like `{ totalCount }` are
>   untouched.
> - **queries.ts** / **areas.ts** — added explicit caps to the previously-unpaginated
>   queries: `first: 100` on `platforms`, `languages`, `areaOfUses`, and
>   `areaOfUseDescendants` (all small reference tables), and `first: 20` on the nested
>   `toolAreaOfUses`.
>
> Validated with a standalone script running graphql-js `validate()` against the new
> rule: 8 hand-crafted edge cases (missing arg, over-limit, unresolvable variable, nested
> connections, totalCount-only) all behaved as expected, and all 5 real app queries now
> pass cleanly. `npm run typecheck` and `eslint` are clean on all three touched files.

Reported the single finding via the review tool as `CONFIRMED` / `outcome: fixed`.

---

## 7. Snapshot request

**User:** "Draft a snapshot of this conversation. Record prompts and responses verbatim.
Follow the style and structure of existing snapshots in docs. Create a new folder under
docs called 'snapshots' for the records. Move existing snapshots into the newly created
folder. Finally, save the created snapshot into the new folder under docs. If something
is unclear, clarify before executing."

Judgment call made without asking, since none of the open questions blocked execution:
the seven existing `docs/session-2026-07-23-*.md` files were untracked by git, so
`mv` was used instead of `git mv` (there was no history to preserve). One of those
moved files (`session-2026-07-23-postgraphilerc-doc-correction.md`) contains prose
referencing sibling session logs by their old `docs/session-2026-07-23-*.md` path —
left those references unedited, consistent with that same document's own stated
principle that historical session-log transcripts stay as verbatim records of what was
said at the time rather than being rewritten after the fact.

→ This document.

---

## Net code changes

- `db/postgraphile/guardrails.js` — `maxPageSizeRule` now walks `Field` nodes instead of
  `Argument` nodes: any connection-shaped selection (selection set containing `nodes` or
  `edges`) must carry a `first`/`last` argument that resolves to a finite number, and
  that number is still capped at `MAX_PAGE_SIZE` exactly as before.
- `src/lib/graphql/queries.ts` — added `first: 20` to `toolAreaOfUses` inside
  `TOOLS_SEARCH_QUERY`, and `first: 100` to `platforms`/`languages`/`areaOfUses` inside
  `FACET_OPTIONS_QUERY`.
- `src/lib/areas.ts` — added `first: 100` to `areaOfUseDescendants` inside
  `AREA_DESCENDANTS_QUERY`.
- `docs/snapshots/` (new folder) — the seven pre-existing `docs/session-2026-07-23-*.md`
  files moved here unchanged, plus this new snapshot.

## Lessons worth keeping

1. **A guardrail that validates supplied values isn't the same as a guardrail that
   requires them.** The original `maxPageSizeRule` was correct on every case it checked
   — the bug was entirely in what it never looked at (absence), not in any wrong
   comparison. Reviewing a validation rule means asking what happens when the thing
   being validated isn't there at all, not just whether the present-case logic is right.
2. **A connection-shaped selection is identified structurally (`nodes`/`edges` in the
   selection set), not by field name** — this is what let one `Field` visitor cover the
   root `tools` connection, a custom SETOF-function connection
   (`areaOfUseDescendants`), and a nested relation connection (`toolAreaOfUses`) with the
   same check, while correctly leaving `{ totalCount }`-only selections uncapped.
3. **Sizing a new cap from the actual seed data** (platform/language/area_of_use row
   counts in `docs/schema-spec.md`/`db/02_seed.sql`) rather than picking a round number
   avoids two failure modes at once: too tight (breaks legitimate facet loading as the
   catalog grows) or too loose (defeats the point of the guardrail).
4. **When a housekeeping request (moving files) touches a document that is itself a
   verbatim historical record, the record's own stated policy governs** — the
   `postgraphilerc-doc-correction.md` snapshot already states that old session logs
   shouldn't be rewritten after the fact, which extended naturally to leaving its
   internal path references stale rather than "fixing" them post-move.
