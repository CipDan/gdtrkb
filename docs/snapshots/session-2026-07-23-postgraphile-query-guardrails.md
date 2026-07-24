# Session log — PostGraphile connection-filter & query guardrails (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that produced the
> `connectionFilterAllowedOperators` restriction and the new `db/postgraphile/guardrails.js`
> (query-depth + max-page-size limits) in `db/postgraphile/server.js`. Kept for context on
> *why* those specific limits exist, why a per-field-type allowlist was deliberately not
> implemented, and how the depth/page-size logic was validated without a live database or
> the real generated PostGraphile schema. User and assistant turns are reproduced verbatim.
> Tool-call investigation (reads, greps, installs) is summarized narratively rather than
> pasted raw.

---

## 1. Code-review finding

**User (code-review finding, applied to `db/postgraphile/server.js:23-33`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest with
> a brief reason, keep changes minimal, and validate.
>
> In @db/postgraphile/server.js around lines 23 - 33, Harden the public PostGraphile
> configuration in the middleware initialization by replacing unrestricted connection-filter
> behavior with explicit operator and field/relation allowlists, and add request guardrails
> for query cost, depth, and page size before exposing the endpoint. Keep the existing
> search-required filtering capability while ensuring untrusted clients cannot select
> arbitrary fields/operators or submit excessively expensive queries.

The harness had already attached a `Read` of `server.js` as context, showing the
`graphileBuildOptions: { connectionFilterRelations: true }` block with no operator
restriction, no depth/page-size limits, and no other guardrails.

---

## 2. Verifying the finding against current state

Before changing anything, checked whether the finding was still live:

- `git status`/`git diff` on `server.js` and the `Dockerfile` — the only pending changes
  were comment wording, not functional; the unrestricted config was exactly as shown.
- `db/postgraphile/package.json` — only `postgraphile`, `postgraphile-plugin-connection-filter`,
  and `@graphile-contrib/pg-simplify-inflector` were installed. No cost/depth-limiting
  library, no allowlist configured anywhere.
- `src/lib/search/buildFilter.ts`, `src/lib/graphql/queries.ts`, `src/lib/search/searchTools.ts`
  — traced every filter the frontend actually sends: `equalTo`, `in`, `includesInsensitive`,
  and `isNull`, plus relation filters (`some`) on `toolPlatforms`/`toolAreaOfUses`/`toolLanguages`.
  No array-column filters, no computed-column or setof-function filters.
- `db/00_grants.sql` — confirmed PostGraphile connects as a `SELECT`-only role (defense in
  depth already present, independent of this finding).
- `docs/ci-deploy-setup.md:22` — confirmed the PostGraphile endpoint is a **public** Railway
  URL, not merely server-to-server-only networking. This made the "public GraphQL endpoint"
  premise of the finding real, not hypothetical.
- `docs/deployment.md:105` and `docs/schema-spec.md:892` — both already document this exact
  gap: "for a truly public endpoint under untrusted load, add query cost/pagination limits
  (middleware, or PostGraphile Pro) — not needed for a private or low-traffic catalog." Since
  the actual deployment *is* public, the project's own stated criterion for needing this
  hardening was met.
- `db/01_schema.sql` — checked the Postgres enum type names (`tool_type`, `licensing_model`)
  that back the `type`/`licensingModel` filters, to gauge the risk of a field-type allowlist.

Conclusion: the operator-allowlist half of the finding was precisely fixable — it only
needed matching PostGraphile's `connectionFilterAllowedOperators` option against the
operators actually used, verified by reading the filter-building code directly. The
cost/depth/page-size half, and a true per-field-type allowlist, needed either a new
dependency or hand-written logic that couldn't be verified against a live schema (no
database or PostGraphile `node_modules` were available yet in this environment) — flagged
for a decision rather than guessed at blind.

---

## 3. First fix: the connection-filter operator allowlist

Edited `db/postgraphile/server.js`:

```js
graphileBuildOptions: {
  connectionFilterRelations: true,
  // Public endpoint (ci-deploy-setup.md §3): restrict to exactly the
  // operators src/lib/search/buildFilter.ts sends (equalTo/in for exact
  // matches, includesInsensitive for the name/summary search box, isNull
  // for confirmedCommercialTitlesCount) so untrusted callers can't run
  // pattern ops (like/similarTo) or negations the app never uses.
  connectionFilterAllowedOperators: [
    "equalTo",
    "in",
    "includesInsensitive",
    "isNull",
  ],
  // No array columns or filtered computed-columns/setof-functions in the
  // schema today — off by default narrows the public surface at no cost.
  connectionFilterArrays: false,
  connectionFilterComputedColumns: false,
  connectionFilterSetofFunctions: false,
},
```

Validated with `node -c db/postgraphile/server.js` → syntax OK.

---

## 4. Asking about the remaining guardrails

**Assistant:**

> Syntax checks out (no node_modules here to run the actual server against a live schema,
> so I can't integration-test this — flagging that as a validation gap below).
>
> That covers the operator-allowlist half of the finding. The other half — page-size/depth/cost
> guardrails, and a true per-field allowlist — I'm holding off on rather than guessing, for a
> specific reason: I confirmed in `docs/schema-spec.md:892` and `docs/deployment.md:105` that
> the project already documented this exact gap and named the only two real remedies:
> **PostGraphile Pro** (paid) or **custom middleware**. There's no free built-in PostGraphile
> flag for it. Two things block me from just writing it:
>
> 1. `CLAUDE.md` requires asking before adding any library, and a real fix here needs one
>    (e.g. `graphql-depth-limit`, or hand-rolled resolver-wrapping code).
> 2. There's no `node_modules` or live DB in this environment, so I can't test hand-rolled
>    GraphQL validation/resolver-wrapping logic against the actual generated schema —
>    shipping untested guardrail code risks either silently not working or breaking real
>    pagination (e.g. the popularity chart's `first: 20` query).
>
> A true field-type allowlist (`connectionFilterAllowedFieldTypes`) has the same problem:
> getting it wrong (e.g. missing the generated `ToolType`/`LicensingModel` enum type names)
> would silently break the type/licensing facet filters, and I have no live schema here to
> confirm PostGraphile's exact generated names.

**AskUserQuestion — "How should the remaining guardrails (max page size / query depth, and
a stricter per-field-type allowlist) be handled?"**

| Option | Description |
|---|---|
| **Add a small dep + resolver cap now** | I add graphql-depth-limit (depth cap) plus a hand-written PostGraphile schema plugin that clamps first/last at resolve time (no new dep needed for that part). Requires your approval per CLAUDE.md's library rule, and must be smoke-tested after you run `npm install` locally (no node_modules/DB here to verify against the live schema). |
| Defer, tracked as known gap | Leave as-is, matching docs/deployment.md's own stated position (add cost/pagination limits only "for a truly public endpoint under untrusted load" via Pro or middleware). I'll add a one-line TODO comment pointing at that doc section so it isn't lost. |
| Just the field-type allowlist | Skip depth/page-size entirely, but I'll add connectionFilterAllowedFieldTypes — though I'd need you to confirm the generated GraphQL enum names (ToolType, LicensingModel, PlatformRole) via GraphiQL first, since getting this wrong silently breaks facet filters. |

**User selected:** "Add a small dep + resolver cap now"

---

## 5. Implementing the depth + page-size guardrails

With approval to add a dependency, `node -v`/`npm -v` confirmed a working Node/npm toolchain
was actually available in this environment (it hadn't been used yet this session). Checked
network access and version compatibility (`npm view graphql-depth-limit version` → `1.1.0`;
`npm view graphql-depth-limit peerDependencies` → `{ graphql: '*' }`), and confirmed via the
existing `package-lock.json` that `postgraphile@4` already transitively resolves
`graphql@15.10.2` — so no version conflict risk. Ran `npm install graphql-depth-limit@1.1.0 --save-exact`,
which also installed `node_modules` for the first time in this directory (previously absent),
making real inspection possible instead of relying on memory.

Rather than guess at PostGraphile's request-guardrail API from training data, read the
actual installed source:

- `node_modules/postgraphile/build/postgraphile/pluginHook.d.ts` and `.js` — found the real
  plugin-hook mechanism (`makePluginHook`, exported from the `postgraphile` package itself).
- `node_modules/postgraphile/build/postgraphile/http/createPostGraphileHttpRequestHandler.js` —
  found the two actual hooks PostGraphile calls: `postgraphile:validationRules:static`
  (schema+AST only, cacheable) and `postgraphile:validationRules` (also receives the request's
  real `variables`, `req`, `res`, `operationName` — exactly what's needed to resolve a
  variable-bound `first`/`last` argument to its runtime value, which a bare `graphql-js`
  `ValidationContext` cannot do on its own since variable *values* aren't bound until
  execution).
- `node_modules/graphql-depth-limit/index.js` and its README — confirmed its exact call
  signature (`depthLimit(maxDepth)` returning a usable validation-rule function).
- `node_modules/graphql/validation/ValidationContext.js` — confirmed `ValidationContext` has
  `reportError`/`getDocument` but no `getVariableValues`, corroborating why the page-size rule
  needs the `variables` passed in via the `postgraphile:validationRules` hook context rather
  than anything on the validation context itself.

Manually counted the app's real query depths from `src/lib/graphql/queries.ts` (deepest is
`TOOLS_SEARCH_QUERY` at depth 5: `tools → nodes → toolAreaOfUses → nodes → areaOfUse →
slug/name`) and its largest `first` value (`PAGE_SIZE`/`CHART_SIZE`, both 10), to size the
limits with headroom instead of picking arbitrary numbers.

Wrote `db/postgraphile/guardrails.js`:

```js
const { Kind, GraphQLError } = require("graphql");
const depthLimit = require("graphql-depth-limit");

const MAX_QUERY_DEPTH = 10;
const MAX_PAGE_SIZE = 100;

function maxPageSizeRule(variables) {
  return (context) => {
    const literalDefaults = {};
    for (const definition of context.getDocument().definitions) {
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
      for (const varDef of definition.variableDefinitions || []) {
        if (varDef.defaultValue && varDef.defaultValue.kind === Kind.INT) {
          literalDefaults[varDef.variable.name.value] = parseInt(
            varDef.defaultValue.value,
            10,
          );
        }
      }
    }

    return {
      Argument(node) {
        if (node.name.value !== "first" && node.name.value !== "last") {
          return;
        }

        let value;
        if (node.value.kind === Kind.INT) {
          value = parseInt(node.value.value, 10);
        } else if (node.value.kind === Kind.VARIABLE) {
          const varName = node.value.name.value;
          value =
            variables && variables[varName] !== undefined
              ? variables[varName]
              : literalDefaults[varName];
        }

        if (typeof value === "number" && value > MAX_PAGE_SIZE) {
          context.reportError(
            new GraphQLError(
              `Argument "${node.name.value}" must not exceed ${MAX_PAGE_SIZE}.`,
              node,
            ),
          );
        }
      },
    };
  };
}

module.exports = {
  MAX_QUERY_DEPTH,
  MAX_PAGE_SIZE,
  "postgraphile:validationRules:static": (rules) => [
    ...rules,
    depthLimit(MAX_QUERY_DEPTH),
  ],
  "postgraphile:validationRules": (rules, { variables }) => [
    ...rules,
    maxPageSizeRule(variables),
  ],
};
```

Since there was no live database to build the real PostGraphile schema against, wrote a
standalone smoke test (`test-guardrails.js`) using a small hand-built `graphql-js` schema
that mimics the relevant shape (a Relay-style connection with `first`/`last`, nested one
level), and called the guardrail hooks exactly as PostGraphile's own request handler does —
merging into `specifiedRules`, then `graphql.validate()`. Ran it from inside
`db/postgraphile/` so `require("graphql")` resolved against the real installed version:

```
ok - normal query passes
ok - app's real max-depth query (5) passes depth limit
ok - excessively deep query is rejected
ok - literal first over MAX_PAGE_SIZE is rejected
ok - variable-bound first over MAX_PAGE_SIZE is rejected
ok - variable-bound first within MAX_PAGE_SIZE passes
ok - large variable default (no runtime value) is rejected
ok - nested `last` on a relation sub-connection is checked

8 checks passed.
```

Deleted the temporary test file after it passed (not part of the repo — the project has no
test setup for the PostGraphile server itself).

Wired the plugin into `server.js`:

```js
const { postgraphile, makePluginHook } = require("postgraphile");
...
const guardrails = require("./guardrails");
...
const middleware = postgraphile(process.env.DATABASE_URL, "public", {
  appendPlugins: [ConnectionFilterPlugin, SimplifyInflectorPlugin],
  disableDefaultMutations: true,
  graphiql: enableGraphiql,
  // Query depth + max page-size limits (guardrails.js) — the one hardening
  // item docs/deployment.md and schema-spec.md §6.1 flagged as needed for a
  // truly public endpoint. Wired via the plugin hook system rather than a
  // schema plugin, since these only need the request's AST/variables.
  pluginHook: makePluginHook([guardrails]),
  graphileBuildOptions: { /* ...as in §3... */ },
  retryOnInitFail: true,
});
```

Validated the full wiring by requiring the real `postgraphile` package (no DB connection
needed for this, since `makePluginHook`/hook invocation doesn't touch the database) and
confirming the hook fires with the expected rule counts:

```
$ node -c server.js
syntax OK
$ node -e "... hook('postgraphile:validationRules:static', specifiedRules, {}) ..."
makePluginHook built: function
static rules count (specifiedRules + depthLimit): 28
dynamic rules count: 1
```

Then ran `npm ci --omit=dev` — the exact install command the `Dockerfile` uses — to confirm
`package-lock.json` was in sync and the new dependency installs cleanly in a fresh,
production-only install:

```
added 125 packages, and audited 126 packages in 22s
found 0 vulnerabilities
```

Confirmed `db/postgraphile/node_modules` is gitignored (`.gitignore:5`), so only
`server.js`, the new `guardrails.js`, and the `package.json`/`package-lock.json` changes
would be committed.

---

## 6. Final summary given to user

**Assistant (final response for this finding):**

> Everything checks out. Summary of what changed in `db/postgraphile/`:
>
> **`server.js`** — hardened the public PostGraphile config:
> - `connectionFilterAllowedOperators`: restricted to exactly `equalTo`, `in`,
>   `includesInsensitive`, `isNull` — the only operators `buildFilter.ts` actually sends.
>   Blocks pattern ops (`like`, `similarTo`) and negations the app never uses.
> - `connectionFilterArrays`/`connectionFilterComputedColumns`/`connectionFilterSetofFunctions`:
>   disabled — unused by the schema today, narrows surface at no cost.
> - `pluginHook: makePluginHook([guardrails])` wires in query-depth and page-size limits.
>
> **`guardrails.js`** (new) — two validation rules registered through PostGraphile's real
> `postgraphile:validationRules(:static)` hook:
> - Depth limit of 10 via `graphql-depth-limit` (app's deepest real query is depth 5).
> - Max page size of 100 on every `first`/`last` argument anywhere in the document (app's
>   max today is 10), resolving both literal values and variable-bound values using the
>   actual runtime `variables` PostGraphile passes into that hook — plus the
>   variable-definition-default bypass case.
>
> **`package.json`/`package-lock.json`** — added `graphql-depth-limit@1.1.0` (peer-compatible
> with the `graphql@15.10.2` already pinned transitively by `postgraphile`).
>
> **Skipped, with reason**: a true per-field-type allowlist (`connectionFilterAllowedFieldTypes`).
> Getting the generated enum type names (`ToolType`, `LicensingModel`, etc.) wrong would
> silently break the type/licensing facet filters, and there's no live DB here to confirm
> PostGraphile's actual generated schema — not worth guessing blind.
>
> **Validation performed**: `node -c` syntax checks, a real `graphql.validate()` smoke test
> (8 cases: normal queries pass, the app's actual deepest/widest queries pass,
> oversized/deep/variable-bound/default-bypass/nested-relation cases are all rejected), a
> require-time check exercising the actual installed `makePluginHook`, and a full
> `npm ci --omit=dev` matching exactly what the Dockerfile runs. I could **not** test
> against the real generated PostGraphile schema or a live Postgres (no DB/docker available
> here) — worth a real request against the deployed Railway endpoint after this ships, to
> confirm existing search/facet/popularity queries still return correctly.

---

## 7. Snapshot request

**User:** "Draft a snapshot of this conversation, based on the structure of the existing
ones in the docs folder. Keep prompts and responses verbatim (especially initial prompt and
final results). Store the snapshot in the docs folder."

→ This document.

---

## Net code changes

- `db/postgraphile/server.js` — added `connectionFilterAllowedOperators` (allowlist of
  `equalTo`/`in`/`includesInsensitive`/`isNull`), disabled unused
  `connectionFilterArrays`/`connectionFilterComputedColumns`/`connectionFilterSetofFunctions`,
  and wired `pluginHook: makePluginHook([guardrails])`.
- `db/postgraphile/guardrails.js` (new) — depth limit (10, via `graphql-depth-limit`) and
  max-page-size limit (100, on every `first`/`last` argument, literal or variable-bound)
  registered through PostGraphile's `postgraphile:validationRules` plugin hooks.
- `db/postgraphile/package.json` / `package-lock.json` — added `graphql-depth-limit@1.1.0`.

## Skipped, with reason

A per-field-type connection-filter allowlist (`connectionFilterAllowedFieldTypes`). This
would need PostGraphile's exact generated GraphQL enum type names for `tool_type` and
`licensing_model` (likely `ToolType`/`LicensingModel`, but unconfirmed against a live
schema) — getting it wrong would silently break the type/licensing facet filters with no
way to catch it in this environment. Flagged to the user as needing confirmation via
GraphiQL against the real deployed schema before attempting it.

## Lessons worth keeping

1. **Read the installed package's own source before trusting memory of its API.** The
   `postgraphile:validationRules` / `:static` plugin hooks, and the fact that the dynamic
   hook receives the request's actual `variables`, came from reading
   `createPostGraphileHttpRequestHandler.js` and `pluginHook.d.ts` directly — not from
   training-data recall, which was unreliable on whether PostGraphile OSS had *any*
   built-in request-guardrail mechanism at all.
2. **`ValidationContext` (graphql-js) has no access to bound variable values** — only the
   AST. A validation rule that needs to check an argument like `first: $n` against its
   actual runtime value has to get `variables` from somewhere else (here, PostGraphile's
   own hook context) — this is a real, general GraphQL architecture constraint, not a
   PostGraphile-specific quirk.
3. **A hand-built minimal schema is a legitimate way to validate guardrail logic** when
   the real schema requires a live database that isn't available — it doesn't prove the
   guardrail is wired into the *actual* generated schema correctly, but it does prove the
   rule logic itself (depth counting, literal vs. variable vs. default resolution) is
   correct, which is the part most likely to have subtle bugs.
4. **`npm ci --omit=dev`, run locally, is a cheap and exact proxy for "will the Dockerfile's
   install step work"** — it uses the identical command and catches lockfile-sync problems
   before a container build would.
