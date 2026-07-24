# Session log — search facet filter diagnosis + `connectionFilterRelations` fix (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that diagnosed why
> the search page's "runs on" / "exports to" / "area of use" / "language" facet
> filters were broken against the deployed PostGraphile API, fixed it by moving
> `db/postgraphile`'s container from a CLI invocation to a library-mode
> `server.js` with `connectionFilterRelations: true`, hardened `app/page.tsx`
> against the same class of failure, and updated the CLAUDE.md-linked docs to
> match. User prompts and the assistant's final reported answers are reproduced
> verbatim; tool-call output (file reads, greps, web fetches) is summarized
> narratively rather than pasted raw.

---

## 1. Diagnosis: which parts of search are actually broken

**User:**

> Read CLAUDE.md and follow it strictly
>
> Read the .log file from docs folder. Analyze existing implementation for the
> home/search page, reading any of the files from docs and other supplements
> that can help, and determine the areas that need to be fixed so that the
> search functionality is fully functional and testable.

Read `docs/railway_deploy_logs1784811125746.log` and the two pre-existing session
snapshots in `docs/` (`session-2026-07-23-cursor-pagination-url-fix.md`,
`session-2026-07-23-graphql-timeout-hardening.md`) for context on work already
done that day. In the Railway log, every `ToolsSearch` request logged "0
error(s)" and took ~1000ms+ (real DB round-trip time) — except the very last
entry, which fired right after an `AreaOfUseDescendants` query (i.e., the "area
of use" facet was applied) and failed in **1.29ms** with "1 error(s)".
Sub-millisecond failure on a GraphQL request is the signature of an
argument-validation error rejected before the database is ever touched, not a
data/runtime error.

Read the actual search code path to find the matching cause:
`src/lib/search/buildFilter.ts`, `src/lib/graphql/queries.ts`,
`src/lib/search/searchTools.ts`, `src/lib/areas.ts`, `src/app/api/tools/search/route.ts`,
`src/app/page.tsx`, `src/components/search/SearchPageClient.tsx`, and
`src/components/search/FacetPanel.tsx`. Found that `buildToolFilter()` builds
**relation-based** filter clauses for four of the six facets — "runs on"
(`toolPlatforms.some.platform`), "exports to" (same shape, different `role`),
"area of use" (`toolAreaOfUses.some.areaOfUse.slug`), and "language"
(`toolLanguages.some.language`) — all requiring
`postgraphile-plugin-connection-filter`'s `connectionFilterRelations` build
option, which defaults to `false`.

Cross-checked `db/postgraphile/Dockerfile` (the separate Railway-deployed API
container) and `docs/schema-spec.md §6.1`: the Dockerfile starts PostGraphile as
a bare CLI invocation, and neither the CLI invocation nor schema-spec.md's own
reference examples (CLI or "library mode" Express snippet) ever set
`connectionFilterRelations`. Verified via `WebFetch`/`WebSearch` against the
connection-filter plugin's own README and PostGraphile's CLI docs that this
option (a) defaults to `false`, opt-in only, and (b) has **no CLI flag** — it
can only be set via `graphileBuildOptions` in library/programmatic mode (a
`.postgraphilerc.js` config file was considered and ruled out, since that file
only covers the same option set as the CLI flags). Confirmed via
`db/01_schema.sql` and `docs/schema-spec.md` that all four affected facets are
genuinely reachable through `FacetPanel.tsx`'s UI, not just theoretical.

Reported to the user (verbatim):

> ## Findings
>
> I read the Railway log, both prior session docs, `docs/app-spec.md` /
> `schema-spec.md` / `ci-deploy-setup.md`, and the actual search code path
> (`buildFilter.ts`, `searchTools.ts`, `queries.ts`, `route.ts`, `page.tsx`,
> `SearchPageClient.tsx`, `FacetPanel.tsx`, `db/postgraphile/Dockerfile`).
>
> ### The blocking bug: 4 of 6 filter facets are broken against the deployed API
>
> `buildToolFilter()` ([buildFilter.ts:38-67](src/lib/search/buildFilter.ts#L38-L67))
> builds **relation-based** filter clauses for "runs on"
> (`toolPlatforms.some.platform`), "exports to" (same, different `role`), "area
> of use" (`toolAreaOfUses.some.areaOfUse.slug`), and "language"
> (`toolLanguages.some.language`). All four require
> `postgraphile-plugin-connection-filter`'s `connectionFilterRelations` option —
> **default `false`**, opt-in only.
>
> It's never turned on anywhere:
> - [db/postgraphile/Dockerfile:52-58](db/postgraphile/Dockerfile#L52-L58)
>   starts PostGraphile as a bare CLI invocation (`npx postgraphile
>   --append-plugins ...`) with no such option.
> - I confirmed against the plugin's own docs and PostGraphile's CLI docs that
>   this option can **only** be set via `graphileBuildOptions` in
>   library/programmatic mode (or a `.postgraphilerc.js` config file) — there
>   is no CLI flag for it. So the current container genuinely cannot satisfy
>   these filters, no matter how the query is worded.
> - Even `docs/schema-spec.md §6.1`'s own reference snippets (both the CLI
>   example and the "library mode" Express example) omit it — the gap is in
>   the spec, not just an implementation slip.
>
> **Evidence in the log**: every `ToolsSearch` call succeeds until the very
> last one, which fires right after an `AreaOfUseDescendants` query (i.e., the
> "area of use" facet was applied) and fails in **1.29ms** — vs. ~1000ms+ for
> the successful calls. Sub-millisecond failure is the signature of a GraphQL
> argument-validation error (rejected before touching the DB), not a data
> error — consistent with `toolAreaOfUses.some.areaOfUse` not existing on the
> generated `ToolFilter` input type. `hostOs`/`target`/`language` share the
> identical relational-filter shape, so they're presumably equally broken,
> though the log only directly evidences the area facet (PostGraphile's
> request logger doesn't log variables, only the query document).
>
> **Fix location**: `db/postgraphile/Dockerfile`, in the separate
> Railway-deployed service — not the Next.js app. It needs to move from the
> bare CLI `CMD` to a small library-mode Node script (the pattern already
> sketched in schema-spec.md §6.1) so
> `graphileBuildOptions: { connectionFilterRelations: true }` can actually be
> passed.
>
> ### Secondary issues
>
> 1. **No graceful degradation on the SSR path.**
>    [page.tsx:35-39](src/app/page.tsx#L35-L39)'s `Promise.all` doesn't wrap
>    `searchTools()` — any deep-link/shared URL with an area/hostOs/target/language
>    filter crashes straight to `app/error.tsx` (full error page) instead of a
>    scoped message. The client-side re-fetch path (`SearchPageClient.tsx` →
>    `route.ts`) does degrade correctly to a retry-able "Search is temporarily
>    unavailable" banner, so that part's fine as designed — but it masks the
>    real cause, since the schema error only reaches `console.error` in
>    `route.ts`.
> 2. **Testability gap**: the project's established test method (mock GraphQL
>    over plain Node `http`, per your no-Playwright preference) would happily
>    accept any filter shape a hand-rolled mock defines — it can't catch this
>    class of bug, since it doesn't enforce the real PostGraphile-generated
>    schema. Verifying the fix needs the actual corrected container (or a
>    local PostGraphile pointed at a real Postgres with the same plugin
>    config), not the existing mock.
>
> ### What works today
> Free-text search (`q`), `type`, `licensing`, `hasBuiltInEditor` (all direct
> scalar-column filters), sort, and cursor pagination all use plain scalar
> filters/args — unaffected by this gap.
>
> ---
>
> Want me to implement the Dockerfile fix (switch to library mode, enable
> `connectionFilterRelations`) and the `page.tsx` error-handling hardening
> now? The first touches the separate PostGraphile service's deploy config,
> so flagging it before touching it.

---

## 2. Implementing the two fixes

**User:**

> Implement the page.tsx error-handling hardening and the Dockerfile fix. You
> also mentioned the need of a .postgraphilerc.js config file, would that
> still be required after the Dockerfile fix?

Answered the `.postgraphilerc.js` question directly, then implemented both
fixes:

- **`src/components/search/SearchPageClient.tsx`**: added an optional
  `initialError` prop, defaulting to `null`, used to seed the component's
  existing `error` state instead of always starting at `null`.
- **`src/app/page.tsx`**: `searchTools(filterState)` inside the SSR
  `Promise.all` now has `.catch(() => null)`; on failure, `SearchPageClient`
  receives a new `EMPTY_RESULTS` constant (`{ nodes: [], pageInfo: {
  hasNextPage: false, endCursor: null }, totalCount: 0 }`) plus
  `initialError` set to the same "Search is temporarily unavailable..."
  message the client-side retry banner already uses. `getFacetOptions()` /
  `getPopularityChartData()` were left unwrapped (unchanged, out of scope for
  this finding).
- **`db/postgraphile/server.js`** (new file): runs PostGraphile via its
  library API — plain `http.createServer(postgraphile(...))`, no Express,
  matching the existing dependency footprint (`package-lock.json` confirmed to
  have no Express) — with `appendPlugins: [ConnectionFilterPlugin,
  SimplifyInflectorPlugin]`, `disableDefaultMutations: true`, `graphiql:
  true`, and `graphileBuildOptions: { connectionFilterRelations: true }`.
- **`db/postgraphile/Dockerfile`**: `CMD` changed from the bare `npx
  postgraphile ...` invocation to `["node", "server.js"]`; added `COPY
  server.js ./`; rewrote the numbered header notes ([4]/[5]) and the
  "production hardening notes" footer to match (GraphiQL now toggled via
  `graphiql: false` in `server.js`, not a CLI flag), and added a new note [6]
  explaining why library mode is required at all.
- **`eslint.config.mjs`**: `npm run lint` failed on `server.js` with
  `@typescript-eslint/no-require-imports`, since the root ESLint config (meant
  for the Next.js app) was reaching into `db/postgraphile`, a separate
  deployable with its own `package.json` that correctly uses CommonJS
  `require()` (matching PostGraphile's own library-mode docs and
  schema-spec.md's existing example). Added `db/**` to `globalIgnores` rather
  than forcing ESM onto an unrelated Docker container script.

`npm run typecheck` and `npm run lint` both passed clean after the fix (one
`EMPTY_RESULTS is declared but its value is never read` IDE diagnostic fired
between the two sequential edits to `page.tsx` and was confirmed stale once
both edits had landed).

Reported to the user (verbatim):

> Both make sense — let me implement them. First, quick answer to your
> question: **no**, a `.postgraphilerc.js` won't be needed after the
> Dockerfile fix. That file is only for the CLI to read config from; once
> PostGraphile runs via the library API (a plain Node script calling
> `postgraphile(...)` directly), `graphileBuildOptions` is just a field in the
> options object passed straight to that function call — no separate config
> file involved.
>
> Now implementing both fixes.

*(implementation, verified via `Read`/`Edit`/`Bash` as summarized above)*

> ## Summary
>
> **`page.tsx` hardening**: `searchTools(filterState)` in the SSR
> `Promise.all` now has `.catch(() => null)`. On failure, `SearchPageClient`
> gets an empty result set plus `initialError`, which seeds its existing
> `error` state — so a deep-link/SSR request that the upstream rejects shows
> the same retry banner a failed client-side fetch already shows, instead of
> crashing to `app/error.tsx`. `getFacetOptions()`/`getPopularityChartData()`
> are unchanged and still propagate (out of scope for this finding).
>
> **Dockerfile fix**: `db/postgraphile/Dockerfile` now runs `node server.js`
> instead of the bare `npx postgraphile ...` CLI. The new
> `db/postgraphile/server.js` calls the PostGraphile library function
> directly (plain `http.createServer`, no new dependency — matches
> schema-spec.md's own library-mode example) with `graphileBuildOptions: {
> connectionFilterRelations: true }`, which is what actually enables the
> `some`/`every`/`none` relation filters (`toolPlatforms`, `toolAreaOfUses`,
> `toolLanguages`) the frontend sends for the "runs on," "exports to," "area
> of use," and "language" facets. Everything else (connection string,
> schema, plugins, `disableDefaultMutations`, GraphiQL-on-by-default) is
> preserved 1:1 from the old CLI flags.
>
> One incidental fix: linting `server.js` against the root
> `eslint.config.mjs` failed on `no-require-imports`, since that config is
> scoped to the Next.js app and CommonJS is the correct/expected style for
> this standalone Node container script. Added `db/**` to the global ignores
> so the frontend's ESLint config doesn't reach into the separate
> PostGraphile deployable.
>
> **To test**: `npm run typecheck` and `npm run lint` both pass. The
> Dockerfile/`server.js` change only takes effect on the next Railway deploy
> of `db/postgraphile` — once live, exercise all four relation-based facets
> (runs on, exports to, area of use, language) plus a combination of them,
> and confirm the Railway log shows real DB-timed `ToolsSearch` responses
> (not sub-millisecond validation failures) for each. For `page.tsx`, the
> easiest repro without redeploying is the existing mock-GraphQL-server
> convention: point a temp dev server at a mock that 500s (or omits
> `toolAreaOfUses`) for `ToolsSearch` and load `/` with an
> `area=`/`hostOs=`/`target=`/`language=` param in the URL — it should
> render the retry banner, not the `app/error.tsx` page.

---

## 3. Syncing the docs

**User:**

> Please make the necessary changes to the schema-spec.md to include the new
> workflow. Update any other docs linked in CLAUDE.md accordingly. Apply
> changes only when required, preserving otherwise.

Re-read CLAUDE.md's reference map to scope the doc set precisely to
`app-spec.md`, `architecture.md`, `schema-spec.md`, `deployment.md`, and
`ci-deploy-setup.md` (the two prior session-log snapshots and the `.log` file
are not part of that map, so left untouched). Grepped all five for
PostGraphile/CLI/Dockerfile/`connectionFilterRelations` references and read
the matched sections in full before editing, rather than editing blind.

Changes made:

- **`docs/schema-spec.md`**: §6 "Filtering" bullet now states the
  `connectionFilterRelations` requirement for relation filters, defaulting
  to `false` with no CLI flag. §6.1: the CLI example is relabeled "quickest —
  exploration only" with a new limitation callout (including that
  `.postgraphilerc.js` isn't a workaround, since it only covers the same
  option set as the CLI flags); the "library mode" example was rewritten
  from Express to plain `http.createServer` with
  `graphileBuildOptions.connectionFilterRelations: true`, and now points at
  the real `db/postgraphile/server.js` as the canonical implementation.
- **`docs/app-spec.md`** §4: now states PostGraphile runs "library mode, not
  the CLI — see that section for why," and the bullet list spells out
  `graphileBuildOptions.connectionFilterRelations: true` explicitly instead
  of just `--append-plugins`.
- **`docs/ci-deploy-setup.md`**: added a note that the container runs `node
  server.js` (library mode), not the CLI, and why. Also fixed the adjacent
  "Dockerfile hardening TODO" list, which had gone stale independent of
  today's change: the `npm install` → `package.json`/`package-lock.json` +
  `npm ci --omit=dev` item was already done in the Dockerfile before this
  session but the doc still listed it as outstanding; and
  `--disable-graphiql`/`--retry-on-init-fail` are CLI-only flags with no
  direct library-mode equivalent, so the text now points at `graphiql: false`
  in `server.js` instead and notes the retry-on-init-fail behavior would need
  manual reimplementation if wanted.
- **`docs/deployment.md`**: one-line addition to the "Filtering" capability
  table row noting that area/platform/language filtering specifically needs
  `connectionFilterRelations: true` via library mode, regardless of which
  hosting pattern (A–G) is chosen.
- **`docs/architecture.md`**: checked but left unchanged — its PostGraphile
  mentions are file-path/topology level only (folder tree entry, Railway
  deploy-flow paragraph) and remain accurate; no CLI-flag-specific claims to
  fix.

`git diff --stat` confirmed `architecture.md` had zero changes, matching the
"apply changes only when required" instruction.

Reported to the user (verbatim):

> This all reads cleanly and each change is scoped to the workflow shift.
> `architecture.md` needed no edits — its PostGraphile references are
> file-path/topology level only, still accurate.
>
> ## Summary
>
> Updated the CLAUDE.md-linked docs to reflect the library-mode +
> `connectionFilterRelations` fix:
>
> - **`schema-spec.md`** (source of truth) — §6 "Filtering" bullet now
>   states the `connectionFilterRelations` requirement for relation filters;
>   §6.1 relabels the CLI example "exploration only" with an explicit
>   limitation callout (including that `.postgraphilerc.js` isn't a
>   workaround), and rewrites the "library mode" example to match what's
>   actually deployed: plain `http.createServer` (no Express),
>   `graphileBuildOptions.connectionFilterRelations: true`, with a pointer to
>   the real `db/postgraphile/server.js`.
> - **`app-spec.md`** §4 — now says PostGraphile runs "library mode, not the
>   CLI" and spells out `connectionFilterRelations` in the bullet list.
> - **`ci-deploy-setup.md`** — added a note that the container runs `node
>   server.js`, not the CLI, and why; fixed the Dockerfile "hardening TODO"
>   list, which had gone stale (the `npm ci --omit=dev` item was already done
>   before this session; `--disable-graphiql`/`--retry-on-init-fail` are
>   CLI-only flags that no longer apply verbatim).
> - **`deployment.md`** — one-line clarification on the filtering capability
>   row that area/platform/language filtering needs library mode, applicable
>   regardless of hosting pattern chosen.
> - **`architecture.md`** — left untouched; its PostGraphile mentions are
>   file/topology-level only and stay accurate.
>
> No code changes here, docs only.

---

## 4. Wrap-up

**User:** "Now draft a snapshot of the conversation, for logging purposes.
Preserve prompts and answers verbatim. Store the snapshot in the docs folder."

→ This document.

---

## Net code changes

- `src/components/search/SearchPageClient.tsx` — added optional
  `initialError` prop, used to seed `error` state.
- `src/app/page.tsx` — `searchTools()` now `.catch(() => null)`'d in the SSR
  `Promise.all`; added `EMPTY_RESULTS` fallback and passes `initialError` to
  `SearchPageClient`.
- `db/postgraphile/server.js` (new) — PostGraphile in library mode, plain
  `http.createServer`, `graphileBuildOptions.connectionFilterRelations: true`.
- `db/postgraphile/Dockerfile` — `CMD` switched from CLI invocation to `node
  server.js`; header/footer notes updated to match.
- `eslint.config.mjs` — added `db/**` to `globalIgnores`.
- `docs/schema-spec.md`, `docs/app-spec.md`, `docs/ci-deploy-setup.md`,
  `docs/deployment.md` — updated to describe the library-mode workflow and
  the `connectionFilterRelations` requirement; `docs/architecture.md`
  checked, left unchanged.

## Lessons worth keeping

1. **Sub-millisecond GraphQL error timing is a validation-error signature.**
   In a request log that doesn't capture variables, comparing error latency
   against known-good latency (~1ms vs ~1000ms+) can localize a schema/argument
   mismatch to a specific query shape even without seeing the payload.
2. **`postgraphile-plugin-connection-filter`'s `connectionFilterRelations`
   defaults to `false` and has no CLI flag** — any project whose filters
   reach through a foreign-key relation (`some`/`every`/`none` on a related
   table's fields) needs PostGraphile running in library/programmatic mode,
   not the bare CLI, to enable it. A `.postgraphilerc.js` does not help,
   since it only surfaces the same option set the CLI flags already cover.
3. **PostGraphile's library-mode return value is a plain Node request
   handler** — it works directly with `http.createServer(...)`, no
   Express/Connect dependency required, which matters for keeping a small
   container's dependency footprint unchanged when migrating off the CLI.
4. **A doc's own reference examples can encode the same bug as the
   implementation.** `schema-spec.md §6.1`'s "library mode" snippet was
   already missing `connectionFilterRelations` before this session — the gap
   wasn't just a one-off implementation slip, so fixing the code without
   fixing the spec would have left the same mistake ready to be copied again.
