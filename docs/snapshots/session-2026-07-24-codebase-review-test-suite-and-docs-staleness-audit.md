# Session log — full codebase review, Vitest test suite, `db-preview.yml` bug fix, and a `CLAUDE.md`/`docs` staleness audit (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that reviewed every project
> file outside `docs/`/`CLAUDE.md` against the app-spec/architecture/schema-spec/deployment/
> ci-deploy-setup docs, added a minimal Vitest test suite (frontend unit tests plus an expanded
> PostGraphile guardrails suite), audited `npm audit`'s flagged vulnerabilities for real
> exposure, found and fixed a genuine bug in `db-preview.yml` (a missing required `username`
> input on `create-branch-action`, surfaced by an IDE lint the user flagged), then audited
> `CLAUDE.md` and every doc in `docs/` (excluding `docs/snapshots/` and a loose deploy-log file)
> for staleness against the actual codebase — finding and fixing a dangling
> `db/docker-compose.yml` reference repeated across four docs, an out-of-sync
> `architecture.md` module map, and an un-synced `db-preview.yml` example in
> `ci-deploy-setup.md` — before drafting this snapshot. User prompts and the assistant's final
> reported/summary responses are reproduced verbatim (prompts lightly corrected for
> grammar/spacing where noted); tool-call output (file reads, greps, npm/lint/test runs,
> WebFetch research against GitHub's own docs and the Neon Actions' `action.yml` files) is
> summarized narratively, with representative excerpts kept verbatim where they were the
> actual evidence a conclusion rested on.

---

## 1. Initial request

**User:**

> Review all project files (excluding files in docs and CLAUDE.md, for now). Check that flows
> and conventions agreed upon are followed, and that there are no syntax issues. Read files in
> docs and CLAUDE.md for any information needed. Always ask for clarifications when needed
> before executing something.

---

## 2. Research phase — reading the specs

Before touching any project file, read the full doc suite so the review would be judged
against the actual agreed conventions rather than assumption: `docs/app-spec.md` (MVP scope,
routes, per-component specs, §11 definition-of-done, §12 out-of-scope), `docs/architecture.md`
(folder structure, module map, docs-placement policy), `docs/schema-spec.md` (DB schema +
GraphQL API contract, including the PostGraphile library-mode rationale in §6.1),
`docs/deployment.md` (hosting patterns), `docs/design/design-tokens-3-phosphor.md` (the locked
"Phosphor" token set), and `docs/ci-deploy-setup.md` (GitHub Actions/Vercel/Railway/Neon
wiring). `CLAUDE.md` itself was already loaded via the harness's system context.

---

## 3. Systematic code review

Listed every project file outside `node_modules`/`.git`/`docs`/`.next` (87 files), then read
through the codebase area by area:

- **App routes & BFF**: `app/layout.tsx`, `page.tsx`, `error.tsx`, `not-found.tsx`,
  `tools/[slug]/page.tsx`, `api/tools/search/route.ts` — confirmed the search page fetches
  live via the one BFF route, detail pages are SSG+ISR (`revalidate = 3600`), and error/404
  boundaries match app-spec §6.
- **Server/client GraphQL boundary**: read every file under `lib/graphql/` (`client.ts`,
  `queries.ts`, `types.ts`, `enumCasing.ts`, `facets.ts`, `popularity.ts`, `tool.ts`,
  `toolCount.ts`) and `lib/search/` (`buildFilter.ts`, `constants.ts`, `filterState.ts`,
  `searchTools.ts`, `staticFacetOptions.ts`), `lib/areas.ts`, `lib/format.ts`. Grepped every
  `"use client"` file and every file importing from `@/lib/graphql` — confirmed the only such
  imports from client components are `import type` (erased at compile time), so no
  secret-bearing runtime code reaches the browser.
- **Search UI**: `SearchPageClient.tsx`, `SearchBar.tsx`, `FacetPanel.tsx`, `SortControl.tsx`,
  `ViewSwitch.tsx`, `Pagination.tsx` — confirmed URL-driven filter/sort/page/view state
  (app-spec §7.4), the seven facets, and the debounce/roving-tabindex/listbox keyboard
  patterns.
- **Results views**: `viewRegistry.tsx`, `CardGrid.tsx`, `ToolCard.tsx`, `HighScoreTable.tsx`,
  `results/types.ts` — confirmed the pluggable view-switch registry (app-spec §7.3, mandatory)
  is a real array, not a hardcoded grid/table pair.
- **Detail page**: `DetailHeader.tsx`, `SpecSheet.tsx`, `ExampleGames.tsx`, `Relationships.tsx`
  — confirmed all app-spec §8 sections render, and the `ToolGraph` neighborhood graph
  (`ToolGraph.tsx`, `ToolGraphFallback.tsx`, `graph/types.ts`, built on `@xyflow/react`/React
  Flow, one of the two app-spec-approved options) matches the §7.7 contract with only an
  additive, optional `focusSlug` prop.
- **Chart & UI primitives**: `PopularityChart.tsx` (hand-built HTML/CSS bars — flagged, see
  below), `Badge.tsx`, `LicensingTag.tsx`, `LogoFrame.tsx`, `Tag.tsx`, `Topbar.tsx`,
  `Wordmark.tsx`, `globals.css` — confirmed the Phosphor tokens are implemented pixel-exact
  (colors, type scale, spacing, `:focus-visible` outlines, `prefers-reduced-motion` handling)
  and no component hardcodes a hex value outside the token `:root` block.
- **DB/API layer**: `db/01_schema.sql`, `db/00_grants.sql`, `db/02_seed.sql`,
  `db/postgraphile/server.js`, `guardrails.js`, `guardrails.test.js`, `Dockerfile` — confirmed
  `disableDefaultMutations: true`, `connectionFilterRelations: true`, a narrowed
  `connectionFilterAllowedOperators`, GraphiQL off by default, a non-root container user, and
  the depth/page-size/cost/fragment-spread guardrails.
- **Catalog seed**: ran the `catalog-seed` skill's `validate_seed.py` against `db/02_seed.sql`:
  `tools=26 platforms=9 languages=8 areas=44 games=10` / `OK — all referential-integrity
  checks passed.`
- **CI/CD**: `.github/workflows/ci.yml`, `db-preview.yml` — matched against
  `docs/ci-deploy-setup.md` line for line, including the exact required-status-check job names
  branch protection expects.
- **Quality gates**: ran `npm run typecheck` (clean, no output), `npm run lint` (clean), and
  `node db/postgraphile/guardrails.test.js` (`guardrails.test.js: ok`) — no syntax or type
  errors anywhere. Grepped for stray `TODO`/`FIXME`/`console.log(` and hardcoded hex colors in
  `src/components` — none found.

---

## 4. Findings report + two clarifying questions

**Assistant (final report):**

> ## Summary
>
> **No syntax/type errors.** `npm run typecheck`, `npm run lint`, and the PostGraphile
> `guardrails.test.js` all pass cleanly. The catalog seed passes its referential-integrity
> validator (26 tools, no dangling FKs, no dupes).
>
> **Flows/conventions checked and followed correctly:**
> - Server/client GraphQL boundary is properly enforced — every `lib/graphql/*` and other
>   server-only module carries `import "server-only"`, and the few places a client component
>   imports from `lib/graphql/types` use `import type` (erased at compile time), so no
>   secret-bearing code reaches the browser. `POSTGRAPHILE_URL`/`DATABASE_URL` never appear
>   client-side.
> - URL-driven filter/sort/page/view state (§7.4), the pluggable results-view registry (§7.3),
>   and the reusable `ToolGraph` contract (§7.7, extended only with an optional `focusSlug`)
>   all match the app-spec exactly, including the Phase-2 extensibility seams.
> - DB schema, seed, PostGraphile guardrails (depth/page-size/cost/fragment-spread limits),
>   Dockerfile, and CI/CD workflows all match `schema-spec.md`/`ci-deploy-setup.md` precisely,
>   down to the exact job names branch protection expects.
> - Phosphor design tokens are implemented pixel-exact (colors, type scale, spacing, focus
>   rings, reduced-motion handling). The three deviations from the hi-fi mock are exactly the
>   ones pre-approved in app-spec §9.
>
> **Two things worth your attention before I'd call this "done":**
>
> 1. **Popularity chart doesn't use Recharts.** `PopularityChart.tsx` hand-rolls the bars in
>    HTML/CSS. Recharts is named in CLAUDE.md's approved library baseline and app-spec §2
>    specifically for this chart, and it's not in `package.json` at all. The code has a
>    rationale comment (pixel-fidelity), but unlike the other three sanctioned deviations,
>    this one isn't recorded in app-spec §9's "Known deviations" list — so it reads as an
>    undocumented stack change rather than an approved one.
> 2. **No frontend test suite.** App-spec §10.1 lists "a minimal test setup (unit/component)"
>    as a non-negotiable baseline gate alongside lint/typecheck, and CLAUDE.md documents
>    `npm test` as a command — but root `package.json` has no `test` script and there isn't a
>    single test under `src/`. Only the PostGraphile guardrails have tests. CI's `npm run test
>    --if-present` silently no-ops.
>
> Minor, non-blocking: `README.md` is just a title (`# GDTRKB`), no setup/usage content.

**Assistant — clarifying questions (`AskUserQuestion`):**

| Question | Options |
|---|---|
| How do you want to handle the popularity chart's use of hand-rolled bars instead of Recharts (the library named in CLAUDE.md/app-spec for this)? | **Leave as-is, document the deviation** (recommended) — keep the hand-built bars and add it to app-spec §9's Known Deviations list · Rewrite using Recharts · Leave it, no doc change needed |
| Do you want a frontend test setup added now, given app-spec §10.1 lists it as a non-negotiable baseline gate? | **Yes, set up a minimal test suite** — pick a lightweight unit/component runner (e.g. Vitest + React Testing Library) and add a few tests for key logic, plus a real `npm test` script · Not right now |

**User answered:** "We will go with documenting the behaviour. There are snapshots that
explain why this design choice was taken instead of using Recharts. However, for now, we will
put a hold on the documentation update, since it will follow in a later step." / "Yes, set up a
minimal test suite"

---

## 5. Vitest test suite added

Checked the npm registry was reachable (`npm view vitest version` → `4.1.10`), then installed
`vitest` as the sole new dev dependency. Created `vitest.config.ts` at the repo root, aliasing
`@/*` to `./src/*` and — critically — aliasing the `server-only` package to a new
`test/server-only-mock.ts` stub, since `node_modules/server-only/index.js` unconditionally
throws on import outside Next's `react-server` bundler condition (confirmed by reading the
package source directly), which would otherwise break any test importing `lib/search/buildFilter.ts`,
`lib/areas.ts`, or any other server-only module. Added a real `test` script (`vitest run`) to
`package.json`.

Wrote five colocated test files, matching `db/postgraphile/guardrails.test.js`'s existing
colocation convention rather than a separate `__tests__` folder:
- `src/lib/search/filterState.test.ts` — default state, enum parsing/rejection, boolean
  parsing, free-text facet passthrough, cursor-history decode, and a full parse↔serialize
  round trip.
- `src/lib/search/buildFilter.test.ts` — every facet clause `buildToolFilter` can produce,
  individually and combined, plus `buildOrderBy`'s two sort keys.
- `src/lib/format.test.ts` — `logoInitials`, licensing short/long labels, tool-type and
  tool-link-type labels.
- `src/lib/areas.test.ts` — `buildAreaOfUseTree` grouping, empty-children parents, empty input.
- `src/lib/graphql/enumCasing.test.ts` — the `toGraphqlEnum`/`fromGraphqlEnum` round trip.

`npm test` reported `Test Files 5 passed (5)` / `Tests 34 passed (34)`; `npm run typecheck` and
`npm run lint` both stayed clean afterward. Confirmed via `git status` that only the intended
new files (`vitest.config.ts`, `test/`, five `*.test.ts` files) plus `package.json`/
`package-lock.json` had changed.

**Assistant (final report):**

> That's exactly the expected footprint. Everything is in place and passing. Here's the final
> summary:
>
> ## Review findings
>
> Full audit of every project file outside `docs/` and `CLAUDE.md`, checked against
> `app-spec.md`, `architecture.md`, `schema-spec.md`, `deployment.md`, `ci-deploy-setup.md`,
> and the Phosphor design tokens. `npm run typecheck` and `npm run lint` were clean before and
> after my changes; the catalog seed passes its referential-integrity validator; the
> PostGraphile guardrail tests pass. No syntax errors anywhere. The server/client GraphQL
> boundary, URL-driven filter state, pluggable view switch, `ToolGraph` contract, and Phosphor
> token fidelity all matched their specs closely — this is a well-built, well-documented
> codebase.
>
> Two gaps surfaced, per your direction:
> 1. **Popularity chart vs. Recharts** — on hold per your instruction; no doc or code change
>    made. (The snapshots explaining the rationale are still there for when you pick this back
>    up.)
> 2. **No frontend test suite** — fixed. Added:
>    - `vitest` as a dev dependency, `vitest.config.ts` at the root, and a
>      `test/server-only-mock.ts` stub aliased over the `server-only` package (which otherwise
>      throws unconditionally outside Next's server bundler — would've broken any test
>      importing `lib/search/buildFilter.ts`, `lib/areas.ts`, etc.)
>    - A real `npm test` script (`vitest run`), closing the gap where CI's `npm run test
>      --if-present` was silently a no-op
>    - 34 tests across 5 files, colocated with their modules (matching the
>      `guardrails.test.js` convention already used in `db/postgraphile/`): `filterState.test.ts`,
>      `buildFilter.test.ts`, `format.test.ts`, `areas.test.ts`, `enumCasing.test.ts` — covering
>      URL state parse/serialize round-tripping, enum rejection, the search-filter builder's
>      facet combinations, and the area-of-use tree grouping
>
> All 34 tests pass, and lint/typecheck are still clean. Nothing else was touched.

---

## 6. Follow-up: npm audit, guardrail/test-coverage audit, and `db-preview.yml` review

**User:**

> Wonderful. Now, based on `npm audit`, check that vulnerabilities listed are not exposed in
> any project file. Moreover, verify that tests cover all possible cases (including the
> guardrail tests, not just the ones implemented now). Finally, check db-preview.yml for any
> problems/issues.

*(Corrected: "any file project file" → "any project file"; "posible"/"inlcuding" → "possible"/"including".)*

Three separate investigations:

**(1) npm audit exposure.** `npm audit` flagged `postcss <=8.5.11` (XSS/file-read) and
`sharp <0.35.0` (libvips CVEs), both nested under `next`. Traced each: grepped `src/` for
`next/image` (only hit was a comment in `LogoFrame.tsx` explaining why it's *not* used); ran
`npm ls postcss` and compared `node_modules/postcss/package.json` (8.5.22, resolved via
`@tailwindcss/postcss` — the app's real build pipeline) against
`node_modules/next/node_modules/postcss/package.json` (8.4.31, the vulnerable copy, isolated
inside Next's own internal tooling); confirmed via `node_modules/next/package.json` that
`sharp` is an `optionalDependency` used only by Next's built-in `/_next/image` route, which
`next.config.ts` (no `images.remotePatterns`) and the all-SVG `public/` folder both leave
unreachable from an attacker.

**(2) Test-coverage audit.** Hand-traced `graphql-depth-limit`'s `determineDepth` recursion
(read directly from `node_modules/graphql-depth-limit/index.js`) to derive the exact pass/fail
boundary for `guardedDepthLimit`, then compared every rule in `guardrails.js` against what
`guardrails.test.js` actually exercised. Found the existing suite never tested: the exact
`MAX_PAGE_SIZE`/`MAX_QUERY_COST`/`MAX_QUERY_DEPTH` boundaries, a missing-`first`/`last`
connection, `last` used alone, a non-connection (`{ totalCount }`-only) selection, a connection
reached only through a fragment spread, a nested/relation-level connection, or a
variable-*supplied* (not just default-supplied) page size. Added all of these — 43 total
assertions in the expanded file, all passing on the first run, confirming the boundary trace
was correct. Also tightened the new frontend suite: added fallback-branch tests for
`format.ts`'s label lookups (an unrecognized enum value via an `as` cast), a combined
`hostOs`+`target` case for `buildFilter.ts` (guarding against one clause overwriting the
other), and an orphan-leaf case for `areas.ts`'s tree builder. Final count: 38 Vitest tests +
the expanded `guardrails.test.js`, all green; lint/typecheck unaffected.

**(3) `db-preview.yml` review.** Validated the file's YAML with `node_modules/.bin/js-yaml`
(clean). Verified two of the file's own inline assumptions against GitHub's docs via WebFetch
rather than taking them on faith: confirmed "secrets aren't available in a job-level `if:`" is
accurate (GitHub's contexts-availability table permits only `github`/`needs`/`vars`/`inputs`
there), and that `ubuntu-latest` shipping a full PostgreSQL 16 server implies `psql` is
present. Also confirmed via the `create-branch-action` README that re-running the action
against an already-existing branch name returns that branch's existing details unchanged
rather than resetting it — consistent with, not contradicting, the file's own comment about
schema changes not being exercised mid-PR.

**Assistant (final report):**

> ## Findings
>
> ### 1. npm audit exposure check
>
> Confirmed **not exploitable through this project's code** — both flagged packages are
> unreachable:
>
> - **`sharp` (libvips CVEs)**: it's an `optionalDependency` of `next` (used only by Next's
>   built-in `/_next/image` optimizer). `src/` never imports `next/image` (`LogoFrame.tsx`
>   uses a plain `<img>` specifically to avoid it), and `next.config.ts` configures no
>   `images.remotePatterns`. So even if the route is technically live, external URLs get
>   rejected before reaching `sharp`, and the only local assets in `public/` are `.svg` files,
>   which Next's optimizer refuses to rasterize by default (`dangerouslyAllowSVG` isn't set).
>   No path from a request to vulnerable code.
> - **`postcss` XSS/file-read advisories**: the vulnerable copy (8.4.31) is nested only inside
>   `next/node_modules/postcss` — Next's own internal build tooling. Our actual Tailwind
>   pipeline resolves a separate, patched `postcss@8.5.22` via `@tailwindcss/postcss`. Neither
>   copy ever processes user-supplied CSS at runtime (CSS is developer-authored and compiled
>   at build time only).
>
> Both are dependency-tree noise from `next`, not something the app's code exercises. I didn't
> change anything here — if you want defense-in-depth anyway, `images: { unoptimized: true }`
> in `next.config.ts` would hard-disable the optimizer route outright, but that's optional
> since it's already unreachable in practice.
>
> ### 2. Test coverage — gaps found and fixed
>
> Traced through `guardrails.js`'s actual boundary conditions (confirmed several by hand-tracing
> `graphql-depth-limit`'s recursion) and found the existing suite never exercised: the exact
> `MAX_PAGE_SIZE`/`MAX_QUERY_COST`/`MAX_QUERY_DEPTH` boundaries, a missing-`first`/`last`
> connection, `last` on its own, a non-connection selection, a connection reached only via a
> fragment spread, a nested/relation-level connection, or a variable-*supplied* (not just
> default-supplied) page size. Added all of these to `guardrails.test.js` — all pass. Also
> added a few missing cases to the new frontend tests: label-fallback branches in `format.ts`,
> combined `hostOs`+`target` facets in `buildFilter.ts`, and an orphan-leaf case in `areas.ts`.
> Full suite: **38 Vitest tests + the expanded guardrails.test.js all pass**, lint/typecheck
> still clean.
>
> ### 3. `db-preview.yml` review
>
> No bugs. I verified two of the file's own inline assumptions against GitHub's docs rather
> than taking them on faith:
> - "secrets aren't available in a job-level `if:`" — **confirmed accurate** (only
>   `github`/`needs`/`vars`/`inputs` are permitted there).
> - `psql` preinstalled on `ubuntu-latest` — consistent with the image shipping a full
>   PostgreSQL 16 server.
>
> One thing worth knowing, not a bug: `neondatabase/create-branch-action@v5`
> **does not reset an already-existing branch** — on repeat `synchronize` events it just
> returns the existing branch's connection string unchanged, so only `02_seed.sql`'s data gets
> refreshed each push, never the schema. The workflow's own comment already flags this exact
> limitation for schema PRs, so this is confirmed-correct, not new.
>
> The one real (but low-priority) gap: GitHub doesn't pass **secrets** to `pull_request` runs
> from forks, but repository **variables** likely still pass through — so a PR from a fork
> could clear the `vars.NEON_PROJECT_ID != ''` gate and then fail at `create-branch-action` on
> the missing API key. Impact is minimal here: `reseed-branch` isn't in the
> required-status-checks list in `ci-deploy-setup.md` §5.1, so a failure there can't block
> merging, and this only matters if the repo ever receives external fork PRs. Didn't change
> anything — flagging it in case you want to add
> `&& github.event.pull_request.head.repo.full_name == github.repository` to the gate later.

---

## 7. IDE-flagged bug: missing `username` input

**User** (with an IDE selection of `db-preview.yml` lines 57–60):

> Regarding db-preview.yml: the workflows defined there are skipped anyway, but locally I
> still have flagged issues. The line shown in particular — issue says "Missing required input
> `username`" (missing-required-inputs) [Ln 39, Col 9]). There are also some "Context access
> might be invalid" warnings for NEON_PROJECT_ID and NEON_API_KEY.

*(Corrected: "The line show in particular" → "The line shown in particular"; cleaned up a
stray quote before the closing bracket in the original IDE-tooltip paste.)*

Fetched `neondatabase/create-branch-action`'s actual `action.yml` (not just its README) via
WebFetch and confirmed it declares three `required: true` inputs — `project_id`, `api_key`,
and `username` (the database role name used to build the branch's connection string) — while
`db-preview.yml` only ever supplied the first two. This is a genuine bug, currently silent
only because `vars.NEON_PROJECT_ID` is unset so the job is gated off. Separately fetched
`neondatabase/delete-branch-action`'s inputs and confirmed it only needs
`project_id`/`api_key`/`branch`, all already present — no matching bug there.

Attempted to check the repo's actual configured secrets/variables via `gh secret list`/
`gh variable list` to give a precise (not fabricated) answer on the second warning, but `gh`
CLI wasn't available in either the Bash or PowerShell tool in this environment; fell back to
reasoning from the user's own statement that Neon isn't wired up yet, which is consistent with
what that lint category means.

**Assistant (final report):**

> Confirmed via the action's actual `action.yml`: `neondatabase/create-branch-action@v5` has
> **three** required inputs — `project_id`, `api_key`, and `username` — but the workflow only
> supplies the first two. `username` is the database role name the action uses to build the
> branch's connection string, and it's simply missing. This is a real bug (currently silent
> only because the job is gated off while Neon isn't wired up yet) — once
> `NEON_PROJECT_ID`/`NEON_API_KEY` are configured, this step will fail immediately with "Input
> required and not supplied: username." `delete-branch-action@v3` was already correct — it
> only needs `project_id`/`api_key`/`branch`, all present.
>
> On the other warning: I don't have `gh` CLI available in this environment to directly
> confirm your repo's secrets/variables, but "Context access might be invalid" for
> `NEON_PROJECT_ID`/`NEON_API_KEY` is exactly what that lint produces when it can't confirm
> those are configured yet — consistent with what you said (Neon isn't wired up), not a bug in
> the workflow itself.
>
> For the `username` fix, I need the actual Neon role that should own the reseed (it needs
> TRUNCATE/INSERT rights, so it must be your owner/migration role, not the read-only
> `gdtrkb_ro`) — that's account-specific, not something in the repo I can derive.

**Assistant — clarifying question (`AskUserQuestion`):**

| Question | Options |
|---|---|
| How should the missing `username` input on create-branch-action be supplied? | **New repo variable (recommended)** — add `username: ${{ vars.NEON_DB_ROLE }}`, you set a `NEON_DB_ROLE` repository variable later alongside `NEON_PROJECT_ID` · Hardcode `neondb_owner` (Neon's default owner-role name, matching ci-deploy-setup.md's own example naming — wrong if your project uses a custom role name) · I'll give you the exact role name |

**User answered:** "New repo variable (recommended)"

Applied the fix: added `username: ${{ vars.NEON_DB_ROLE }}` to the `create-branch-action` step,
extended the `reseed-branch` job's skip-gate to also require `vars.NEON_DB_ROLE != ''`, and
expanded the file's header comment to document the new requirement and *why* it must be the
owner/migration role rather than `gdtrkb_ro`. Re-validated the YAML with `js-yaml`.

**Assistant (final report):**

> ## Summary
>
> Confirmed and fixed a real bug in `db-preview.yml`: `neondatabase/create-branch-action@v5`
> requires three inputs (`project_id`, `api_key`, `username`) per its `action.yml`, but the
> workflow only supplied two — the step would fail with "Input required and not supplied:
> username" the moment Neon gets wired up (currently masked because the job is gated off).
> `delete-branch-action@v3` was already correct — it only needs `project_id`/`api_key`/
> `branch`, all present.
>
> Applied your chosen fix:
> - Added `username: ${{ vars.NEON_DB_ROLE }}` to the `create-branch-action` step.
> - Extended the `reseed-branch` job's skip-gate to also require `vars.NEON_DB_ROLE != ''`, so
>   it stays a clean no-op until that variable exists too, rather than failing again on a
>   still-missing config value.
> - Updated the file header comment to document the new requirement and explain *why* it must
>   be the owner/migration role, not `gdtrkb_ro`.
>
> Remaining IDE warnings ("Context access might be invalid" for
> `NEON_PROJECT_ID`/`NEON_API_KEY`/`NEON_DB_ROLE`) are expected — they just mean those repo
> variables/secrets aren't configured yet, consistent with what you said. **You'll still need
> to set the `NEON_DB_ROLE` repository variable** (Settings → Secrets and variables → Actions →
> Variables) to your Neon project's actual owner-role name once you wire Neon up — I can't
> know that value from the repo. YAML re-validated as syntactically correct.

---

## 8. `CLAUDE.md` & docs staleness audit — research phase

**User:**

> Alright. That will be all for project files review and code conventions checking. Now we
> will focus on CLAUDE.md and existing docs (excluding snapshots, since those have logging
> purposes, and the loose log file inside docs). Read CLAUDE.md and the docs and review their
> content. Check for any stale, no longer valid content against existing flows and conventions
> (check project files and snapshots inside docs/snapshots if needed), and update it
> accordingly, preserving the rest. Always ask for clarifications when needed before executing
> something.

Re-read `CLAUDE.md` fresh, then read
`docs/snapshots/session-2026-07-24-app-spec-checklist-audit-and-fixes.md` in full, since its
title directly promised relevant context. It recorded that a prior session had already: audited
every item in app-spec §11 against the codebase, found and fixed two detail-page gaps
(`confirmedTitlesSource` not rendered, `LogoFrame` never accepting a real logo), fixed
`HighScoreTable`'s missing `overflow-x-auto` wrapper, tightened `--dim`'s contrast
(`#9A7418` → `#AB8420`), live-verified the production deployment at
`https://gdtrkb.vercel.app/` via direct HTTP calls, and — separately — traced the
Recharts-vs-hand-built-chart decision to `docs/snapshots/session-2026-07-23-detail-page-toolgraph-implementation.md:52`,
confirming it was a deliberate, pixel-fidelity-driven choice made in commit `6a7eb23`, not an
oversight. Cross-checked against the current repo and found every one of those fixes still
present (`--dim: #ab8420` in `globals.css`, the `overflow-x-auto` wrapper in
`HighScoreTable.tsx`, the source line in `SpecSheet.tsx`, `LogoFrame`'s image branch) —
consistent with commit `0b6ae45 Ran MVP checklist from app-spec.md and applied necessary
corrections` in the repo's history.

Grepped the whole repo for `docker-compose` and found it referenced as "included"/"bundled"/
"ready-to-run" in `CLAUDE.md`, `docs/architecture.md`, `docs/deployment.md` (three places), and
`docs/schema-spec.md` — but `find . -iname "docker-compose*"` (excluding `node_modules`)
returned nothing, and `git log --all --diff-filter=D --summary` showed no history of it ever
being created or deleted. Separately confirmed `docs/app-spec-s9-s10-snapshot.md` (also
referenced by `app-spec.md` §10) does exist and is a legitimate, explicitly-labeled pre-lock
archive — not stale. Grepped `src/` for the five default `create-next-app` scaffold SVGs in
`public/` and found none referenced anywhere (noted as an aside, not acted on, since it's
outside the docs-review scope).

Read the full current `docs/architecture.md` module map against the real file tree assembled
earlier and found it had drifted: missing `db/00_grants.sql` from the top-level tree; the
`postgraphile/` folder listed only `Dockerfile`, omitting `server.js`/`guardrails.js`/
`package.json`; `lib/graphql/`'s sub-list showed only 3 of its 8 real files; `lib/format.ts`
wasn't mentioned anywhere; `components/ui/` named a `Button` primitive that doesn't exist
anywhere in the codebase while omitting `LicensingTag`/`Topbar`/`Wordmark`; and
`SearchPageClient.tsx`, `viewRegistry.tsx`, and `Relationships.tsx` — three architecturally
central files — weren't mentioned in their respective folder descriptions.

---

## 9. Findings report + four clarifying questions

**Assistant (final report):**

> I've traced through every doc carefully, and cross-checked against `docs/snapshots` where a
> prior session had already done related work. Here's the full picture before I touch
> anything.
>
> **A genuinely broken reference, found in four docs:** `db/docker-compose.yml` is described as
> "included," "bundled," and "ready to go" in `CLAUDE.md`, `architecture.md`, `deployment.md`
> (×3), and `schema-spec.md` — but it doesn't exist anywhere in the repo, and there's no git
> history showing it was ever created or deleted. `deployment.md` §7 also points to "the repo
> README.md for the full walkthrough" — but `README.md` is just a one-line title stub. So the
> whole VPS/docker-compose deployment path is documented as real and ready, but was never
> actually built (the project's locked path per app-spec §10 is Vercel+Railway+Neon, unrelated
> to this).
>
> **`architecture.md`'s module map has drifted** — it was clearly written early and never
> updated as files were added:
> - Top-level tree: missing `db/00_grants.sql`; the `postgraphile/` folder listing shows only
>   `Dockerfile`, missing `server.js`, `guardrails.js`, `guardrails.test.js`, `package.json`.
> - `src/lib/graphql/` sub-list shows only 3 of the 8 real files (missing `enumCasing.ts`,
>   `facets.ts`, `popularity.ts`, `tool.ts`, `toolCount.ts`); `lib/format.ts` isn't listed
>   anywhere.
> - `components/ui/` says "Badge, **Button**, LogoFrame, Tag" — there is no `Button.tsx`
>   anywhere in the codebase (buttons are inline `<button>`s); `LicensingTag`, `Topbar`,
>   `Wordmark` aren't mentioned.
> - `components/search/` doesn't mention `SearchPageClient.tsx` — arguably the most important
>   file in that folder.
> - `components/results/` doesn't mention `viewRegistry.tsx` — the file that *is* the
>   mandatory pluggable view switch — or `types.ts`.
> - `components/tool/` doesn't mention `Relationships.tsx` (the §8.9 ToolGraph integration).
> - No mention anywhere of the new test convention (`vitest.config.ts`, `test/`, colocated
>   `*.test.ts`).
>
> **`ci-deploy-setup.md` §6**'s embedded `db-preview.yml` code sample no longer matches the
> real file (missing the `concurrency` block, the `vars`-gated `if`s, and now today's
> `username`/`NEON_DB_ROLE` fix) — and there's no mention of `NEON_DB_ROLE` in §1's credentials
> table or §5's secrets list.
>
> **`app-spec.md` §11 checklist is stale in the other direction** — every box still shows
> `[ ]`, but `docs/snapshots/session-2026-07-24-app-spec-checklist-audit-and-fixes.md` shows a
> prior session already verified every item complete (including live-hitting
> `https://gdtrkb.vercel.app/`), and my own review today independently re-confirmed the
> code-level items (LogoFrame renders real logos, SpecSheet shows the source line,
> HighScoreTable has the overflow wrapper, `--dim` is `#AB8420`) are still in place — matching
> commit `0b6ae45`.
>
> **`app-spec.md` §9/§2 and CLAUDE.md's library list**: the Recharts-vs-hand-built-chart
> deviation — the one you told me to hold on earlier this conversation — is exactly the same
> one that snapshot already traced to a deliberate, pixel-fidelity decision. Not asking you to
> re-decide it, just flagging it's sitting right where the other doc updates would go.

**Assistant — clarifying questions (`AskUserQuestion`):**

| Question | Options |
|---|---|
| How should the dangling db/docker-compose.yml references (CLAUDE.md, architecture.md, deployment.md x3, schema-spec.md) be resolved? | **Soften the docs to match reality** (recommended) — edit them to describe the VPS pattern as a documented option/pattern rather than an included, ready-to-run file · Leave it, just note it |
| Is this the moment to add the PopularityChart hand-built-vs-Recharts deviation to app-spec §9's Known Deviations list (the one put on hold earlier)? | **Yes, add it now** — a 4th entry alongside FacetPanel/detail-layout/SortControl, citing the design-tokens spec and the snapshot's confirmation · No, still on hold |
| Should app-spec §11's MVP checklist be checked off given the confirmed-complete state? | **Yes, check all boxes, note the deployment caveat** · Check all except deployment (leave item 13 unchecked until re-verified or a fresh production URL is shared) |
| OK to proceed with the architecture.md module-map/file-listing accuracy fixes (adding missing files, removing the phantom Button primitive, adding a testing-convention entry) alongside the other doc updates? | **Yes, proceed** · Show me the diff first |

**User answered:**
- "How should the dangling db/docker-compose.yml references... be resolved?" → "Soften the
  docs to match reality (recommended)"
- "Is this the moment to add the PopularityChart hand-built-vs-Recharts deviation to app-spec
  §9's Known Deviations list (the one put on hold earlier)?" → "Yes, add it now"
- "Should app-spec §11's MVP checklist be checked off given the confirmed-complete state?" →
  "I think the app-spec section 11's MVP checklist should remain unchecked for documentation
  purposes, since it serves as a documented testing plan to be applied against the MVP
  version. Instead, check that there is no stale content related to the checklist, and update
  accordingly, preserving the rest."
- "OK to proceed with the architecture.md module-map/file-listing accuracy fixes... alongside
  the other doc updates?" → "Yes, proceed"

---

## 10. Doc fixes applied

Applied all four approved directions:

- **Dangling `docker-compose.yml` references softened** in `CLAUDE.md` (the fake "Commands"
  entry now points to `deployment.md` Pattern D / `ci-deploy-setup.md`), `docs/architecture.md`
  (removed the phantom line from the file tree, added a one-line clarification),
  `docs/deployment.md` (3 spots, including a full rewrite of §7's "VPS quick start" — which had
  pointed at a `README.md` walkthrough that doesn't exist — into a hypothetical sketch rather
  than a ready runbook), and `docs/schema-spec.md` (1 spot).
- **Recharts deviation added to `app-spec.md`**: §2's tech-stack table now notes "As built:
  hand-rolled HTML/CSS bars instead — see §9"; §9 gained a 4th Known Deviation entry matching
  the style of the existing three, citing the design-tokens chart spec and the mock's `.chart`
  section.
- **§11 checklist left unchecked**, per the user's own reasoning (a template to apply against
  the MVP, not a running log). Re-checked every one of the 13 bullet lines' wording against the
  current codebase and found no stale text requiring a fix beyond the Recharts note above,
  which lives in §2/§9 rather than in the checklist bullets themselves.
- **`docs/architecture.md` module-map accuracy fixes**: added `db/00_grants.sql` and expanded
  the `postgraphile/` listing to the top-level tree; expanded `src/lib/graphql/`'s sub-list to
  all 8 files and added `lib/format.ts` to the parent list; removed the phantom `Button`
  primitive and added `LicensingTag`/`Topbar`/`Wordmark` to `components/ui/`; added
  `SearchPageClient`, `viewRegistry`, and `Relationships` to their respective folder
  descriptions; updated the component-to-spec mapping table (`components/results/` now also
  cites app-spec §7.3); added a "Where does X go?" row and a §6 naming-convention bullet for
  the colocated-test pattern.
- **`docs/ci-deploy-setup.md`**: added `NEON_DB_ROLE` to the §1 credentials table and a note in
  §6; re-synced the embedded `db-preview.yml` sample (concurrency block, vars-gated `if`s, the
  `username` input) to match the real file, plus notes on the "existing branch returned
  unchanged" behavior and the fork-PR secrets caveat.

Ran `npm run lint`, `npm run typecheck`, and `npm test` after all edits — all clean (38 tests
still passing) — since doc-only edits shouldn't have affected code, but confirmed anyway.
Verified via `grep -rn "docker-compose"` that every remaining mention across the touched docs
now honestly frames it as a buildable pattern, not an included file. `git status` showed
exactly the intended footprint: `.github/workflows/db-preview.yml`, `CLAUDE.md`,
`db/postgraphile/guardrails.test.js`, `docs/app-spec.md`, `docs/architecture.md`,
`docs/ci-deploy-setup.md`, `docs/deployment.md`, `docs/schema-spec.md`, `package.json`/
`package-lock.json` modified, plus the five new test files, `test/`, and `vitest.config.ts`
untracked.

**Assistant (final report):**

> ## Summary
>
> Applied all four approved doc updates. No code was touched — lint/typecheck/tests all still
> pass.
>
> **Dangling `db/docker-compose.yml` references — softened in 4 docs (5 spots):**
> - `CLAUDE.md`: the fake "Commands" entry now points to `deployment.md` Pattern D /
>   `ci-deploy-setup.md` instead of a non-existent command.
> - `docs/architecture.md`: removed the phantom `docker-compose.yml` line from the file tree,
>   added a one-line clarification.
> - `docs/deployment.md` (3 spots incl. §7): reworded from "included"/"bundled"/"ready to go"
>   to "not included — build one following this pattern," and rewrote §7's "VPS quick start"
>   (which pointed at a `README.md` walkthrough that doesn't exist) as a hypothetical sketch
>   instead of a ready runbook.
> - `docs/schema-spec.md`: same reframing.
>
> **Recharts deviation — added to `app-spec.md`:**
> - §2's tech-stack table now notes "As built: hand-rolled HTML/CSS bars instead — see §9."
> - §9's Known Deviations list gained a 4th entry (matching the style of the other three),
>   citing the design-tokens chart spec and the mock's `.chart` section.
>
> **§11 checklist — left unchecked as you asked.** Re-checked every item's wording line-by-line
> against the current codebase; found no stale text in the 13 bullets themselves (facet count,
> spec references, etc. all still accurate) — the one thing that *was* stale (the chart's
> tech-stack entry) is the Recharts fix above, which lives in §2/§9, not in the checklist text
> itself.
>
> **`docs/architecture.md` module-map accuracy fixes:**
> - Top-level tree: added `db/00_grants.sql`, expanded `postgraphile/` to list
>   `server.js`/`guardrails.js`/`package.json`.
> - `src/lib/graphql/` sub-list: added the 5 missing files (`enumCasing.ts`, `facets.ts`,
>   `popularity.ts`, `tool.ts`, `toolCount.ts`); added `lib/format.ts` to the parent list.
> - `components/ui/`: removed the phantom `Button` primitive, added
>   `LicensingTag`/`Topbar`/`Wordmark`.
> - Added `SearchPageClient`, `viewRegistry`, and `Relationships` to the search/results/tool
>   folder descriptions (all previously unmentioned despite being architecturally central —
>   `viewRegistry` *is* the mandatory pluggable view switch).
> - Added a "Where does X go?" row and a §6 naming-convention bullet for the new
>   colocated-test pattern.
>
> **`docs/ci-deploy-setup.md`:** added `NEON_DB_ROLE` to the §1 credentials table and the §6
> setup notes, and re-synced the embedded `db-preview.yml` sample (which had drifted — missing
> the concurrency block, vars-gated `if`s, and the `username` fix from earlier) so it matches
> the real file, plus a note on the create-branch-action "returns existing branch unchanged"
> behavior and the fork-PR secrets caveat from earlier.

---

## 11. Snapshot request

**User:**

> Now draft the snapshot for this conversation. Keep prompts and responses verbatim (For
> prompts, correct any grammar or syntax mistakes present). Preserve the detailed and
> explicative responses, and any generated schema, lists or tables exactly. Follow writing
> conventions of already existing snapshots inside docs/snapshots. Save the draft in said
> directory when finished. If something is unclear, clarify before taking action.

→ This document.

---

## Net code/doc changes

- `package.json` / `package-lock.json` — added `vitest` as a dev dependency and a real `test`
  script (`vitest run`).
- `vitest.config.ts` (new) — aliases `@/*` → `./src/*` and `server-only` → the stub below.
- `test/server-only-mock.ts` (new) — empty-export stub so server-only `lib` modules stay
  testable.
- `src/lib/search/filterState.test.ts` (new) — parse/serialize, enum rejection, boolean
  parsing, cursor-history round trip.
- `src/lib/search/buildFilter.test.ts` (new) — every facet clause individually and combined
  (including a later-added hostOs+target combined case), `buildOrderBy`.
- `src/lib/format.test.ts` (new) — label/initials helpers, plus later-added fallback-branch
  cases for unrecognized enum values.
- `src/lib/areas.test.ts` (new) — tree-building, plus a later-added orphan-leaf case.
- `src/lib/graphql/enumCasing.test.ts` (new) — the enum-casing round trip.
- `db/postgraphile/guardrails.test.js` — expanded with 9 additional boundary/edge-case
  assertion blocks (exact `MAX_PAGE_SIZE`/`MAX_QUERY_COST`/`MAX_QUERY_DEPTH` boundaries,
  missing-`first`/`last`, `last`-only, non-connection selections, fragment-wrapped and nested
  connections, variable-supplied page sizes).
- `.github/workflows/db-preview.yml` — added the required `username: ${{ vars.NEON_DB_ROLE }}`
  input to `create-branch-action`, extended `reseed-branch`'s skip-gate to also require
  `vars.NEON_DB_ROLE != ''`, expanded the header comment.
- `CLAUDE.md` — added Vitest to the approved library baseline; replaced the non-existent
  `docker compose -f db/docker-compose.yml` command with a pointer to the documented pattern.
- `docs/architecture.md` — file-tree and module-map accuracy fixes (see §10 above); new
  testing-convention entries in the "Where does X go?" table and §6.
- `docs/deployment.md` — softened three `docker-compose.yml`/README-walkthrough references to
  describe Pattern D honestly as a documented, not-included pattern.
- `docs/schema-spec.md` — softened its one `docker-compose.yml` reference the same way.
- `docs/app-spec.md` — §2 tech-stack table footnote + a 4th §9 Known Deviation entry for the
  hand-built popularity chart.
- `docs/ci-deploy-setup.md` — added `NEON_DB_ROLE` to §1's credentials table and §6; re-synced
  the embedded `db-preview.yml` example with the real file.

Nothing in `docs/snapshots/` or the loose `docs/railway_deploy_logs...log` file was touched, per
the user's explicit scoping.

## Lessons worth keeping

1. **The `server-only` package unconditionally throws on import outside Next's `react-server`
   bundler condition** — not a `window`-presence check, an unconditional throw. Any test
   runner (Vitest, Jest, plain Node) touching a server-only `lib` module needs that package
   aliased to a stub, regardless of test environment (`node` vs `jsdom`).
2. **A marketplace GitHub Action's README isn't authoritative for its required inputs — its
   `action.yml` is.** `create-branch-action`'s README never made `username` sound mandatory;
   only reading the actual `action.yml`'s `required: true` flags (surfaced first by an IDE's
   static `missing-required-inputs` lint) caught a bug that would otherwise have stayed latent
   until the day Neon actually got wired up.
3. **Docs can go stale in both directions, and "fix the staleness" doesn't always mean the same
   thing.** `architecture.md`'s module map fell behind by omission (new files never added);
   `app-spec.md` §11's checklist looked stale by having every box unchecked despite the work
   being done — but the user's own framing (it's a template to run against the MVP, not a
   historical log) meant the correct fix there was *checking that the item text itself hadn't
   gone stale*, not checking the boxes. Worth asking which kind of document something is before
   "fixing" it.
4. **Tracing a third-party dependency's own recursion by reading its source, rather than
   guessing at boundary values, produced test assertions that passed on the first run** — a
   reasonably strong signal the trace (of `graphql-depth-limit`'s `determineDepth`) was
   correct, and considerably cheaper than iterating by trial and error against a live rule.
5. **A gated-off, not-yet-wired-up code path can hide a real bug indefinitely.** `db-preview.yml`'s
   `create-branch-action` step had been missing a required input since the file was written,
   invisible because `vars.NEON_PROJECT_ID` being unset skips the whole job — auditing a
   dormant path against its actual third-party schema (the action's `action.yml`) surfaced it
   before it could fail silently in production the day Neon gets connected.
6. **A previous session's snapshot can settle a question faster and more rigorously than
   re-litigating it from scratch** — the Recharts-vs-hand-built-chart deviation and the
   MVP-checklist completion state were both already resolved by prior sessions; re-reading
   those snapshots (rather than re-deriving the conclusions independently) was the correct and
   faster path, and matched what the user already expected going in.
