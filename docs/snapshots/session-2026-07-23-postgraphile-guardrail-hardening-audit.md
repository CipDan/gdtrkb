# Session log — PostGraphile guardrail scoping fix, alias-cost guardrail, and a loophole audit leading to a DB-level statement_timeout (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that fixed a cross-operation
> variable-default leak in `maxPageSizeRule`, added a missing alias/field-count guardrail
> (`maxQueryCostRule`) to `db/postgraphile/guardrails.js`, then audited the whole PostGraphile
> stack (`Dockerfile`, `server.js`, `guardrails.js`) for further loopholes — leading to a
> `statement_timeout` addition in `db/00_grants.sql` and a decoupled `apply_grants` dispatch
> input in `.github/workflows/ci.yml`. Kept for context on *why* those specific choices were
> made, particularly the reasoning behind preferring a DB-level backstop over a full
> weighted/multiplicative query-cost rule. User and assistant turns are reproduced verbatim;
> the more detailed/explicative assistant responses are preserved exactly rather than
> summarized. Tool-call investigation (reads, greps) is summarized narratively rather than
> pasted raw.

---

## 1. Fix: cross-operation variable-default leak in `maxPageSizeRule`

**User (code-review finding, applied to `db/postgraphile/guardrails.js:88-104`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with a
> brief reason, keep changes minimal, and validate.
>
> In @db/postgraphile/guardrails.js around lines 88 - 104, Scope literal variable defaults by
> operation instead of storing them in the document-wide literalDefaults object. In the rule's
> field validation logic, resolve defaults from the operation definition containing the current
> field, preserving independent variable scopes for multiple named operations; add a regression
> test covering one operation without $first and another with $first: Int = 10.

The harness had already attached a `Read` of the full `guardrails.js` as context.

### Verifying the finding

**Assistant:**

> Confirmed: the finding is valid and still present in the current code. `literalDefaults`
> (guardrails.js:88) is a single flat object keyed by variable name, built by iterating over
> *all* operation definitions in the document. If a document contains two named operations that
> both use a variable called `$first`, but only one declares a default, the flat map lets that
> default leak into the other operation's scope. Concretely:
>
> ```graphql
> query WithoutDefault($first: Int)      { tools(first: $first) { nodes { id } } }
> query WithDefault($first: Int = 10)    { tools(first: $first) { nodes { id } } }
> ```
>
> With `variables: {}`, `WithoutDefault`'s `$first` should resolve to `undefined` (no value, no
> default → guardrail should reject with "must resolve to a finite number"), but the flat map
> lets it inherit `WithDefault`'s default of `10` and silently pass. That's a real guardrail
> bypass since GraphQL validation runs over the whole document, not just the executed operation.
> Fixing it now.

### The fix

Replaced the flat `literalDefaults` object with a `Map` keyed by `OperationDefinition` node
(`literalDefaultsByOperation`), each holding its own per-operation defaults. In the `Field`
visitor, used `visit()`'s standard 5th argument (`ancestors`) — confirmed by reading
`node_modules/graphql/language/visitor.js` directly rather than assuming — to find the nearest
enclosing `OperationDefinition` for the current field, since operation definitions can't nest
inside one another (at most one ancestor will ever match):

```js
Field(node, _key, _parent, _path, ancestors) {
  ...
  const operationAncestor = ancestors.find(
    (ancestor) =>
      !Array.isArray(ancestor) &&
      ancestor.kind === Kind.OPERATION_DEFINITION,
  );
  const literalDefaults = operationAncestor
    ? literalDefaultsByOperation.get(operationAncestor)
    : {};
  ...
}
```

Since the repo had no test runner set up anywhere (no `jest`/`mocha`, no existing test script),
wrote `db/postgraphile/guardrails.test.js` as a plain Node script using the built-in `assert`
module plus the already-available `graphql` package (no new dependency), and wired
`"test": "node guardrails.test.js"` into `db/postgraphile/package.json`. The test builds a
two-operation document (`WithoutDefault($first: Int)` / `WithDefault($first: Int = 10)`),
resolves both with empty runtime variables, and asserts exactly one error (from
`WithoutDefault`).

Validated by temporarily `git stash`-ing `guardrails.js` back to the pre-fix version and
re-running the test: it failed with `0 !== 1` (the bug reproduced — the default leaked and both
operations passed). Restored the fix and re-ran: passed. Also re-required the module afterward
to confirm it still loads cleanly.

**Assistant (final response for this finding):**

> **Fixed**: `db/postgraphile/guardrails.js:88-104` — `literalDefaults` was a single
> document-wide map keyed by variable name. Since GraphQL documents can carry multiple named
> operations (only one executes per request, but the validation rule walks the whole document),
> two operations declaring the same variable name with different defaults (or no default) could
> leak one operation's default into the other's resolution, letting a query bypass the
> page-size guardrail.
>
> Fix: defaults are now scoped per `OperationDefinition` node in a `Map`, and the `Field`
> visitor uses the visitor's `ancestors` array to find the operation the current field actually
> belongs to before resolving its variable defaults.
>
> Added `db/postgraphile/guardrails.test.js` (no test runner existed in the repo, so this is a
> plain Node script using built-in `assert` + the already-available `graphql` package — no new
> dependency) and wired `npm test` in `db/postgraphile/package.json`. It covers exactly the
> reported scenario: one operation with `$first: Int` (no default) and a sibling with
> `$first: Int = 10`, neither given a runtime value — verified it fails against the pre-fix code
> (0 errors, bug reproduced) and passes now (1 error, from the operation with no default).
>
> Test: `cd db/postgraphile && npm test`.

---

## 2. Fix: missing operation-wide query-cost guardrail (alias-batching)

**User (code-review finding, applied to `db/postgraphile/guardrails.js:175-189`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with a
> brief reason, keep changes minimal, and validate.
>
> In @db/postgraphile/guardrails.js around lines 175 - 189, Add an operation-wide query-cost
> validation rule alongside depthLimit and maxPageSizeRule, using a field/alias count or
> weighted budget that rejects operations exceeding the configured limit. Register it in the
> appropriate PostGraphile validation hook so aliases are counted across the entire operation,
> while preserving the existing depth and per-connection page-size checks.

The harness had again attached a full `Read` of `guardrails.js` (post-fix-#1) as context.

### Verifying the finding

**Assistant:**

> The finding is valid: the current file only caps depth (`depthLimit`) and per-connection page
> size (`maxPageSizeRule`) — neither stops a query like 2,000 differently-aliased copies of a
> shallow, small-`first` connection, which individually pass both checks but collectively blow
> up resolver/DB work. I confirmed no query in this codebase uses fragments and the largest
> real query (`TOOLS_SEARCH_QUERY`) is ~19 field selections, so I'll size the budget with the
> same ~10x headroom the file already uses elsewhere.

Dispatched an `Explore` subagent to enumerate every hand-written GraphQL query in the repo
(`src/lib/graphql/queries.ts`, `src/lib/areas.ts`) and estimate field-selection counts. Result:
`TOOLS_SEARCH_QUERY` ≈ 19 fields (the largest), `FACET_OPTIONS_QUERY` ≈ 14,
`POPULARITY_CHART_QUERY` ≈ 8, `TOOL_TOTAL_COUNT_QUERY` ≈ 2, `AREA_DESCENDANTS_QUERY` ≈ 3 — and
confirmed no query anywhere in the codebase uses GraphQL fragments. This set
`MAX_QUERY_COST = 200` (≈10x headroom over 19, matching the existing depth/page-size headroom
convention).

### The fix

Added `countFieldsInSelectionSet` — a fragment-and-inline-fragment-aware recursive field
counter using the same cycle-guard traversal shape as the existing
`selectionSetHasConnectionShape`, but summing rather than short-circuiting, and deliberately
*not* memoizing by fragment name (a fragment spread twice must count its fields twice, since
cost is per occurrence, not per fragment definition). Added `maxQueryCostRule()`, which computes
this count per `OperationDefinition` and rejects if it exceeds `MAX_QUERY_COST`:

```js
function maxQueryCostRule() {
  return (context) => {
    const fragmentsByName = {};
    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragmentsByName[definition.name.value] = definition;
      }
    }
    return {
      OperationDefinition(node) {
        const cost = countFieldsInSelectionSet(
          node.selectionSet && node.selectionSet.selections,
          fragmentsByName,
          new Set(),
        );
        if (cost > MAX_QUERY_COST) {
          const label = node.name ? `"${node.name.value}"` : "(anonymous)";
          context.reportError(new GraphQLError(
            `Operation ${label} selects ${cost} fields, exceeding the maximum of ${MAX_QUERY_COST}.`,
            node,
          ));
        }
      },
    };
  };
}
```

Since this rule only needs the AST (no runtime variables), registered it in the *static* hook
alongside `depthLimit`, not the per-request one `maxPageSizeRule` uses.

Extended `guardrails.test.js` with a `collectStaticErrors` helper (needed because
`graphql-depth-limit`'s rule shape differs from a normal visitor — it runs its own traversal
synchronously and returns the same context it was given, rather than a visitor map, so the
helper detects that by identity) and two new cases: a 5-aliased-field operation (expect 0
errors) and an operation with `MAX_QUERY_COST + 50` aliased fields (expect exactly 1
"exceeding the maximum" error). Verified by temporarily removing `maxQueryCostRule()` from the
static rules array: the over-budget case failed as expected (`0 !== 1`); restored, both cases
passed.

**Assistant (final response for this finding):**

> **Fixed**: verified the gap is real — `depthLimit` bounds nesting and `maxPageSizeRule`
> bounds each connection's `first`/`last`, but neither stops an operation that stays shallow and
> keeps every `first` small while replicating a field hundreds of times under different aliases
> (each aliased copy is a distinct AST node and a real, separate resolver call).
>
> Added `maxQueryCostRule` to [guardrails.js](db/postgraphile/guardrails.js) — a total
> field/alias-count budget (`MAX_QUERY_COST = 200`, sized with the same ~10x headroom the file
> already uses, since the largest real query, `TOOLS_SEARCH_QUERY`, is ~19 field selections)
> computed per `OperationDefinition`, expanding fragment spreads/inline fragments with the same
> cycle-guarded traversal pattern already used by `selectionSetHasConnectionShape`. Since it
> only needs the AST (no variables), it's registered in `postgraphile:validationRules:static`
> alongside `depthLimit`, keeping the existing depth and per-connection page-size checks
> untouched.
>
> Extended `db/postgraphile/guardrails.test.js` with two cases: a 5-field operation (no error)
> and an operation with `MAX_QUERY_COST + 50` aliased fields (exactly one "exceeding the
> maximum" error). Verified the new case fails without the rule wired in and passes with it.
>
> Test: `cd db/postgraphile && npm test`.

---

## 3. Broad audit: loopholes in `Dockerfile` / `server.js` / `guardrails.js`

**User:**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with a
> brief reason, keep changes minimal, and validate.
>
> Based on the curent file versions in the project, the existing documentation and snapshots in
> docs, and CLAUDE.md, verify whether there are any loopholes left in the logic of postgraphile
> (that is, in the Dockerfile, server.js, guardrails.js). If needed, create the necessary tests,
> save them in appropriate files (exactly like guardrails.test.js) and run them for validation.
> If anything is unclear, ask for clarifications.

### 3.1 Investigation

Re-read `guardrails.js`, `server.js`, `Dockerfile`, and `package.json` in full, then read all
four prior session snapshots touching this area (`postgraphile-query-guardrails.md`,
`postgraphile-graphiql-hardening.md`, `graphql-timeout-hardening.md`,
`connection-pagination-guardrail-fix.md`) to understand what had already been decided or
deliberately deferred, so the audit wouldn't re-litigate settled ground (e.g. the GraphiQL/CORS
credential question, already explicitly scoped out in an earlier session).

Grepped `deployment.md`, `schema-spec.md`, and `ci-deploy-setup.md` for every existing mention of
cost/depth/pagination guardrails — found `schema-spec.md:892-896` documents only "two limits"
(depth + page-size) and doesn't yet mention the field-count rule added in §2 above (a doc-drift
note, not a logic bug).

Checked several specific hypotheses against the real installed `postgraphile` package source
rather than assumption:

- **Query batching**: read `createPostGraphileHttpRequestHandler.js` directly — an array request
  body only gets processed if `enableQueryBatching` is set; `server.js` never sets it, so
  array-batched requests get a hard `501`, not silent multi-query processing.
- **Static rule wiring**: confirmed in the same file that `staticValidationRules` (our
  `depthLimit` + `maxQueryCostRule`) really does get passed into a real
  `graphql.validate(gqlSchema, queryDocumentAst, staticValidationRules)` call against the actual
  generated schema, with caching keyed by schema identity + query string (reset on schema
  change) — not merely wired in by name.
- **Simple collections**: traced `pgSimpleCollections` through `postgraphile-core` and
  `graphile-build-pg`'s `PgAllRows.js` — `server.js` never sets `simpleCollections`, and the
  plugin's own default (`table.tags.simpleCollections || pgSimpleCollections`, both undefined)
  evaluates to `hasSimpleCollections = false`. So there's no unpaginated plain-array field
  sitting alongside each Relay connection that could dodge `maxPageSizeRule`'s `nodes`/`edges`
  shape check.
- **Variable-value edge cases**: traced `resolveArgValue` against `null`, a JSON string like
  `"50"`, and `NaN` — all fail `typeof value !== "number"` / `Number.isFinite`, so all fail
  *closed* (rejected), never silently treated as unlimited.
- **Schema shape**: read `db/01_schema.sql` and found `tool_relationship` — a self-referential
  many-to-many table (`source_tool_id`/`target_tool_id`, both `REFERENCES tool(id)`) backing the
  app's "related tool graph" feature. PostGraphile exposes FK relationships bidirectionally, so
  this table lets `Tool → Tool → Tool` nest directly with no join-table ping-ponging needed.
- **DB-level backstop**: grepped the whole `db/` tree for `statement_timeout` — none set
  anywhere (not in `01_schema.sql`, not in `00_grants.sql`, not via `pgSettings` in `server.js`).

### 3.2 Findings reported

**Assistant:**

> I did a full pass over `Dockerfile`, `server.js`, `guardrails.js`, and cross-checked against
> `deployment.md`, `schema-spec.md`, `ci-deploy-setup.md`, and the session snapshots. Ruled out
> several things that looked suspicious but turned out fine, and found two real gaps.
>
> **Checked and confirmed safe (no action needed):**
> - Query batching (`enableQueryBatching`) — off by default, not set in `server.js`, so an
>   array-batched HTTP request gets a hard `501`, not silent processing.
> - Simple collections (`simpleCollections`) — not set, defaults to `omit`, so there's no
>   unpaginated plain-array field sitting alongside each Relay connection that could dodge
>   `maxPageSizeRule`'s `nodes`/`edges` shape check.
> - Confirmed by reading `createPostGraphileHttpRequestHandler.js` directly: our static rules
>   (`depthLimit`, `maxQueryCostRule`) really do run inside PostGraphile's actual
>   `graphql.validate(gqlSchema, ast, staticValidationRules)` call against the real generated
>   schema, with sane caching (keyed by schema + query string, invalidated on schema change) —
>   not just wired in by name only.
> - `maxPageSizeRule` fails *closed* on weird variable values (`null`, a JSON string like
>   `"50"`, `NaN`) — all get rejected as "not a finite number," never silently treated as
>   unlimited.
>
> **Two real gaps found:**
>
> 1. **Multiplicative row-blowup through nested connections isn't bounded.**
>    `db/01_schema.sql` has a self-referential `tool_relationship` table (the "related tool
>    graph" feature) — PostGraphile exposes this bidirectionally, so
>    `tool { toolRelationshipsBySourceToolId { nodes { targetTool {
>    toolRelationshipsBySourceToolId { nodes { targetTool { ... } } } } } } }` nests directly,
>    Tool→Tool→Tool. With `MAX_QUERY_DEPTH=10` that's ~3 hops of nesting, each with its own
>    `first` up to `MAX_PAGE_SIZE=100` — worst case ~10⁶ row-touching join operations from a
>    single query that individually satisfies depth, per-connection page-size, *and* the
>    field-count budget I added last turn (that query only has ~15-20 total field selections,
>    nowhere near the 200 cap — field-count and multiplicative-row-cost are different
>    dimensions). Neither existing guardrail catches this.
>
> 2. **No Postgres-side `statement_timeout` on the `gdtrkb_ro` role** (`db/00_grants.sql`). This
>    is the standard DB-level backstop for exactly problem #1 (and any *future*
>    AST-guardrail gap) — it caps worst-case query runtime unconditionally, independent of how a
>    query got expensive. Currently absent; nothing else in the stack sets it either.
>
> Implementing a real multiplicative/weighted query-cost rule in `guardrails.js` is a
> meaningfully bigger change than what's been done so far (not a small tweak), and the
> `statement_timeout` fix, while a one-line SQL addition, only takes effect once someone runs it
> against the **live** Neon database — that's a production action I can't and shouldn't take
> myself.

**AskUserQuestion — "How should I handle the two gaps (unbounded multiplicative nested-connection
cost, and no DB-level statement_timeout)?"**

| Option | Description |
|---|---|
| **Add statement_timeout to 00_grants.sql (Recommended)** | One line (e.g. `ALTER ROLE gdtrkb_ro SET statement_timeout = '10s'`) added to the grants file. Simple, robust, covers this gap and any future AST-guardrail miss. I'll edit the file; you (or CI) still need to run it against the live Neon DB — I won't do that myself. |
| Implement a weighted/multiplicative query-cost rule in guardrails.js | A real addition to guardrails.js: multiply cost by each nested connection's first/last instead of just counting fields. More code, more edge cases, closes the gap at the GraphQL layer specifically. |
| Just document it as a known, deferred gap | Add a comment/doc note (matching deployment.md's existing "not needed for a private/low-traffic catalog" framing) and take no code action now. |
| Skip both, current guardrails are enough for now | Leave as-is; the existing depth/page-size/field-count limits are judged sufficient for the current traffic level. |

**User answered (free text, not one of the four listed options):**

> Can you elaborate on the two solutions:
> * How the timeout statement affects the querying at the production level, and what needs to
>   be done in addition, given the Neon database is live and populated.
> * How the weighted/multiplicative query-cost rule would encumber the flow and whether it
>   would introduce additional loopholes/edge cases.

### 3.3 Elaboration on both remedies

**Assistant** (reproduced in full — flagged by the user as needing exact preservation):

> ## 1. `statement_timeout` — mechanics and what running it against the live DB actually does
>
> **What it does at the Postgres level:** `ALTER ROLE gdtrkb_ro SET statement_timeout = '10s'`
> sets a **role-level default** for the `statement_timeout` session parameter. Every *new*
> connection that authenticates as `gdtrkb_ro` (i.e. every connection PostGraphile opens through
> the pooled `DATABASE_URL`) picks this up automatically at session start — no client-side code
> changes needed. If any single SQL statement on that connection runs longer than 10s, Postgres
> cancels it server-side and returns `ERROR: canceling statement due to statement timeout`
> (SQLSTATE `57014`). It only kills that one statement, not the connection — `pg`/PostGraphile
> surfaces this as a normal GraphQL error response (an `errors[]` entry, not a server crash).
>
> **Why it wouldn't affect any real traffic:** the frontend already gives up on any GraphQL
> request after 5s (`GRAPHQL_TIMEOUT_MS = 5000` in `src/lib/graphql/client.ts`, from the
> timeout-hardening work). Every query the app actually sends is a small, indexed lookup against
> a modest reference catalog (dozens to low hundreds of rows per table). None of them come close
> to 5s today, let alone 10s. So a 10s `statement_timeout` would never fire for legitimate
> traffic — it exists purely to backstop pathological/crafted queries (including the
> nested-connection case, or anything future guardrail code misses).
>
> **What you'd actually need to do, given Neon is live and populated:**
> 1. I add one line to `db/00_grants.sql` (the file that already creates and grants
>    `gdtrkb_ro` — see the header, it's explicitly designed to be idempotent and re-run safely).
> 2. You (or CI) re-run the exact command the file already documents:
>    `psql "$DATABASE_URL" -v pass="$GDTRKB_RO_PASSWORD" -f db/00_grants.sql` — against the
>    **direct/unpooled** connection, as the owner/migration role (not as `gdtrkb_ro` itself —
>    that role doesn't have rights to alter its own settings; the owner role that already runs
>    `CREATE ROLE gdtrkb_ro` in that same script does).
> 3. That's it — no downtime, no migration, no data touched. `ALTER ROLE ... SET` just writes a
>    default into Postgres's role-settings catalog; every *new* session picks it up immediately.
>    Already-open pooled connections keep their old (unlimited) setting until the pooler cycles
>    them, which happens naturally and quickly under Neon's pooler — nothing you need to manage
>    by hand.
> 4. One thing I can't verify from here: whether your Neon project's owner role has enough
>    privilege to `ALTER ROLE` a role it created (it almost certainly does — Neon's
>    project-owner role typically has `CREATEROLE`-equivalent rights over roles it created — but
>    I have no live DB access to confirm this, so if the `ALTER ROLE` statement itself errors
>    when you run it, that's the reason to check first).
>
> I did **not** touch the file yet — this is just the explanation you asked for.
>
> ## 2. Weighted/multiplicative query-cost rule — what it would actually take, and its own risk
> surface
>
> **What it would need to do differently from what exists today:** instead of a flat field
> count, it'd walk the selection tree top-down carrying an accumulated multiplier (product of
> every ancestor connection's `first`/`last` value), so a field 3 levels deep under
> `tools(first:100) → toolAreaOfUses(first:20) → …` gets weighted ×2000, not counted as "1
> field." That means:
>
> - It has to resolve `first`/`last` **values**, including the variable/default resolution
>   `maxPageSizeRule` already does — so it can no longer be a cheap, cacheable *static* rule
>   (schema+AST only); it needs live request `variables`, same as `maxPageSizeRule`, and would
>   have to be re-run on every request rather than cached by query text.
> - It needs to get sibling-vs-nested branching exactly right: two connections at the *same*
>   level don't multiply each other, only parent→child nesting does. Getting that backwards
>   either false-rejects legitimate sibling queries or silently under-counts a real attack
>   shape.
> - It has to carry the multiplier correctly *through fragment spreads* — the same fragment
>   spread from two different multiplier contexts has two different real costs, so (like the
>   existing fragment-cycle-guard code) it can't memoize cost by fragment name. Getting this
>   subtly wrong is exactly the class of bug this session's earlier fix addressed (the
>   cross-operation default leak) — quiet under-counting, not a crash, so it wouldn't announce
>   itself.
> - It has to decide what to do when a `first`/`last` is bound to a variable with no value and
>   no default (already a hard rejection in `maxPageSizeRule`). If it falls back to "assume
>   cheap" there instead of duplicating that rejection, that fallback becomes a latent bypass
>   the moment anyone independently touches `maxPageSizeRule` later — two rules doing
>   overlapping resolution that have to be kept in lockstep by hand.
> - Sizing the budget is a real guess, not a lookup — "how many fields does a real query have"
>   was easy to eyeball from `queries.ts`; "what's the actual safe worst-case row-touch count
>   for this DB" isn't something I can derive from the repo, only estimate.
>
> **Net effect:** it wouldn't make the endpoint *less* safe than today (it's purely additive on
> top of the existing rules) — but it is meaningfully more code, with the most genuine new-bug
> surface of anything discussed here, and it duplicates/must-stay-in-sync-with logic
> `maxPageSizeRule` already owns.
>
> **A much cheaper partial alternative worth knowing about:** since the worst case comes from
> *depth* enabling ~3 nesting hops at `first:100` each (100³ ≈ 10⁶), simply **lowering
> `MAX_QUERY_DEPTH`** (e.g. 10 → 6 or 7 — still ~1.4x headroom over the app's real depth-5
> query) is a one-line change with zero new logic or edge cases, and it directly shrinks the
> exponent in that worst case (down to maybe 100¹–100² instead of 100³). It's less precise than
> a true weighted-cost rule, but far lower risk.
>
> Let me know how you'd like to proceed — happy to do just the `statement_timeout` line, just
> tighten `MAX_QUERY_DEPTH`, both, the full weighted rule, or nothing right now.

---

## 4. The CI/psql wiring problem

**User:**

> In the case of the statement_timeout mechanic, given that psql is not set up locally in order
> to make a direct call to the Neon database (I would require to run the CI flow setup, as
> detailed in @docs/ci-deploy-setup.md), how would that affect the steps needed to be done?

The harness attached a full `Read` of `docs/ci-deploy-setup.md` as context. Re-read
`.github/workflows/ci.yml` to check exactly how `db/00_grants.sql` gets applied today, and found
both the schema-apply step and the grants step gated by the *same* `apply_schema` boolean input
— a real problem given `01_schema.sql` is non-idempotent and the target DB is already populated.

**Assistant** (reproduced in full — flagged by the user as needing exact preservation):

> Good catch to ask about — I checked `.github/workflows/ci.yml`, and there's a real coupling
> problem that makes the *existing* CI path unsafe for this specific change as-is.
>
> **The problem:** in `ci.yml`, both the schema step and the grants step are gated by the
> **same** `apply_schema` boolean:
>
> ```yaml
> - name: Apply schema (manual, opt-in)
>   if: ${{ inputs.apply_schema }}
>   run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/01_schema.sql
> - name: Create SELECT-only role & grants (manual, opt-in)
>   if: ${{ inputs.apply_schema }}
>   run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pass="$GDTRKB_RO_PASSWORD" -f db/00_grants.sql
> ```
>
> `01_schema.sql` uses `CREATE TYPE`/`CREATE TABLE` with no `IF NOT EXISTS` — its own comment
> says it "expects an empty or freshly reset database." Your Neon DB is live and populated, so
> dispatching the workflow with `apply_schema: true` today would make the **first** step fail
> (tables already exist), and GitHub Actions stops the job on a failed step by default — the
> grants step would **never run**. So the existing dispatch path can't be used as-is just to
> add one line to `db/00_grants.sql`; it would only produce a failed CI run.
>
> **The fix needed first:** split that one boolean into two independent `workflow_dispatch`
> inputs — keep `apply_schema` for the (non-idempotent) DDL, and add a new one, e.g.
> `apply_grants`, gating only the grants step. `db/00_grants.sql` is already documented as
> idempotent and safe to re-run on its own (it only creates the role if missing, never rotates
> the password, and re-grants are no-ops if already granted) — decoupling the two inputs lets
> you re-run *just* the grants file, safely, against the live DB, any time (not just for this
> change — useful again the next time `00_grants.sql` needs a tweak).
>
> **End-to-end steps, once that split exists:**
> 1. I add `ALTER ROLE gdtrkb_ro SET statement_timeout = '10s';` to `db/00_grants.sql`.
> 2. I split `ci.yml`'s dispatch input as above (small, low-risk change to a workflow file —
>    I'd show you the diff before it's part of anything you push).
> 3. You (or I, with your explicit go-ahead, since this dispatches a workflow that touches the
>    live DB) trigger it: GitHub → Actions → CI → "Run workflow" → `apply_schema` left
>    unchecked, new `apply_grants` checked. Equivalent via CLI:
>    `gh workflow run ci.yml -f apply_schema=false -f apply_grants=true`.
> 4. That step re-runs the whole `db/00_grants.sql` against `DATABASE_URL_MIGRATIONS` (the
>    direct/owner secret) — the `CREATE ROLE`/`GRANT` lines are no-ops (already exist), and the
>    new `ALTER ROLE ... SET statement_timeout` line is the one real effect.
> 5. Nothing else needs touching — no Railway/Vercel redeploy, no password rotation.
>    PostGraphile's pooled connections pick up the new session default automatically the next
>    time they connect.
>
> This assumes `DATABASE_URL_MIGRATIONS` and `GDTRKB_RO_PASSWORD` are already set as repo
> secrets, which they should be since the DB is already live per your description — I can check
> they *exist* (not their values) with `gh secret list` if useful.
>
> Want me to go ahead and make the two file changes (the `00_grants.sql` line + the `ci.yml`
> input split)? I won't dispatch the workflow myself without you confirming that step
> separately.

---

## 5. Implementation

**User:** "I can confirm the two repo secrets are already set. In light of the new information,
do go ahead and make the two file changes. Bring up the workflow dispatch topic after
finishing."

Edited `db/00_grants.sql`, appending after the existing `ALTER DEFAULT PRIVILEGES` line:

```sql
-- Bounds worst-case query runtime at the database level — a backstop
-- independent of the GraphQL-layer guardrails in
-- db/postgraphile/guardrails.js (depth/page-size/field-count limits), for
-- any query shape those miss (e.g. deeply nested connections that multiply
-- row counts across levels rather than exceeding any single limit). 10s is
-- well above every real query this app sends today — the frontend's own
-- GraphQL client already gives up after 5s (src/lib/graphql/client.ts) — so
-- this should never fire for legitimate traffic. Role-level setting, so it
-- applies to every new connection PostGraphile opens as gdtrkb_ro; re-running
-- this line is a no-op if already set, same as the grants above.
ALTER ROLE gdtrkb_ro SET statement_timeout = '10s';
```

Edited `.github/workflows/ci.yml`: added a new `apply_grants` `workflow_dispatch` boolean input
(default `false`) alongside the existing `apply_schema`, and changed the grants step's condition
from `if: ${{ inputs.apply_schema }}` to `if: ${{ inputs.apply_schema || inputs.apply_grants }}`
— so `apply_schema: true` still implies both steps run (unchanged behavior), while a new
`apply_grants: true` on its own runs *only* the grants step, leaving `01_schema.sql` untouched.

Validated the YAML directly rather than eyeballing it: `js-yaml` turned out to be available
transitively in `node_modules`, so loaded the file with it and confirmed both
`apply_schema`/`apply_grants` inputs parse correctly. Re-read both final files in full to
confirm the edits landed as intended.

**Assistant (final response for this topic):**

> Both files are done and validated.
>
> **Changes:**
> - **`db/00_grants.sql`** — added `ALTER ROLE gdtrkb_ro SET statement_timeout = '10s';` at the
>   end, with a comment explaining it's a DB-level backstop independent of the GraphQL-layer
>   guardrails, sized to never fire on legitimate traffic (the frontend already gives up after
>   5s).
> - **`.github/workflows/ci.yml`** — split the single `apply_schema` dispatch input into two:
>   `apply_schema` (unchanged behavior — still runs both `01_schema.sql` and the grants step)
>   and a new `apply_grants` (runs only the grants step, safe against your live, populated DB).
>   Validated the YAML parses correctly with both inputs present.
>
> Nothing here touches `db/postgraphile/` — `guardrails.test.js` is unaffected by this change.
>
> ---
>
> **On dispatching the workflow:** once these two files are committed and pushed (they'd need
> to land on `main`, or at least be present on whatever ref you dispatch against —
> `workflow_dispatch` runs the workflow file **as it exists on the selected branch**), the
> actual run would be:
>
> - **GitHub UI**: Actions tab → CI workflow → "Run workflow" → branch = `main` → check
>   `apply_grants`, leave `apply_schema` unchecked → Run.
> - **CLI equivalent**: `gh workflow run ci.yml --ref main -f apply_schema=false -f apply_grants=true`
>
> That executes only the "Create SELECT-only role & grants" step against
> `DATABASE_URL_MIGRATIONS` — the `CREATE ROLE`/`GRANT` statements are no-ops (already applied),
> and the new `ALTER ROLE ... SET statement_timeout` line is the one real effect. The "Apply
> schema" and "Reseed catalog" steps are unaffected (reseed always runs regardless, re-applying
> the idempotent seed — no schema or data change results from this).
>
> I have `gh` CLI access in this environment, but I won't dispatch this myself — it's a
> production-DB-touching action on your live Neon database, so it needs your explicit go-ahead
> each time, not just for this change. Let me know when you've committed/pushed these two files
> and want me to run the dispatch command (or if you'd rather trigger it yourself from the
> GitHub UI).

---

## 6. Snapshot request

**User:** "That is all for this topic. Now draft the snapshot of this conversation. Keep prompts
and responses verbatim. For the more detailed and explicative responses, an exact preservation
is desired. Apply structure criteria followed by existing snapshots inside @docs/snapshots/.
After drafting, store the file inside the snapshots folder."

→ This document.

---

## Net code changes

- `db/postgraphile/guardrails.js` — `maxPageSizeRule`'s variable defaults are now scoped per
  `OperationDefinition` (via a `Map` + the visitor's `ancestors` argument) instead of a single
  document-wide object. Added `countFieldsInSelectionSet` and `maxQueryCostRule`
  (`MAX_QUERY_COST = 200`), registered as a static validation rule alongside `depthLimit`.
- `db/postgraphile/guardrails.test.js` (new) — plain-Node regression tests (no new dependency,
  no test framework) covering: per-operation default scoping (two named operations sharing a
  variable name, one with a default, one without) and the alias/field-count budget (a
  under-budget pass case, an over-budget reject case).
- `db/postgraphile/package.json` — added `"test": "node guardrails.test.js"`.
- `db/00_grants.sql` — added `ALTER ROLE gdtrkb_ro SET statement_timeout = '10s';`, a DB-level
  backstop against any query shape the GraphQL-layer guardrails miss.
- `.github/workflows/ci.yml` — split the `apply_schema` `workflow_dispatch` input into
  `apply_schema` (unchanged: DDL + grants) and a new `apply_grants` (grants only), so the
  idempotent `db/00_grants.sql` can be re-applied to the live, populated Neon DB without
  attempting to re-run the non-idempotent `01_schema.sql`.

## Skipped, with reason

A full weighted/multiplicative query-cost rule in `guardrails.js` (would multiply cost by each
nested connection's `first`/`last` rather than just counting fields). Judged to have
meaningfully more implementation and edge-case risk than a DB-level `statement_timeout` — in
particular, duplicated/must-stay-in-sync variable-default resolution logic already owned by
`maxPageSizeRule`, and fragment-multiplier memoization risk directly analogous to the
cross-operation leak bug fixed in §1. After the elaboration in §3.3, the user chose the
`statement_timeout` route (§5) instead; the weighted-cost rule remains undone, not rejected —
worth reconsidering if traffic or schema shape changes materially.

The dispatch of `ci.yml` with `apply_grants: true` against the live Neon database was
deliberately **not** performed in this session — flagged to the user as a production action
requiring their explicit go-ahead, separate from approving the file changes themselves.

## Lessons worth keeping

1. **A validation rule keyed by a shared flat map, when the document can contain multiple
   independent scopes (here, multiple named operations each with their own variables), will
   leak state across those scopes.** The fix pattern — key by the actual AST node that owns the
   scope (`OperationDefinition`), found via the standard `visit()` `ancestors` argument rather
   than re-deriving it by hand — generalizes to any similar per-scope validation logic.
2. **Depth limits, per-connection page-size limits, and total field-count budgets each bound a
   different dimension of query cost, and none of them substitutes for the others.** A query can
   be shallow (passes depth), have every individual `first` under the cap (passes page-size),
   and have few total field selections (passes field-count) while still being multiplicatively
   expensive through nested nested connections — self-referential FK relationships (like this
   schema's `tool_relationship`) are the most direct way to hit that gap, since they let the
   same expensive shape nest against itself with no join-table indirection needed.
3. **A DB-level `statement_timeout` is a fundamentally different, complementary kind of
   guardrail from AST-level validation rules**: it can't be out-thought by a cleverly-shaped
   query, because it doesn't reason about query shape at all — it just enforces a wall-clock
   deadline unconditionally. When weighing a precise-but-complex AST-level fix against a
   simple-but-blunt DB-level backstop, the backstop is often the better first move, especially
   when the precise fix would duplicate logic another rule already owns.
4. **A GitHub Actions `workflow_dispatch` boolean that gates two operationally-different steps
   (one idempotent, one not) becomes a hazard the moment you only want one of them.** Splitting
   the input *before* attempting the dispatch — rather than discovering the coupling by watching
   a job fail — avoided burning a real CI run (and a needless failure state) against the live
   database.
5. **When a user explicitly asks for elaboration before deciding, that is not yet a decision** —
   the correct response is a thorough, honest answer (including "here's a cheaper alternative
   you didn't ask about") without touching any files, leaving the actual choice for the next
   turn.
