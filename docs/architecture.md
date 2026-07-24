# Architecture — GDTRKB

> **Repo home:** `docs/architecture.md`. This document defines the **folder structure**, the **module map** (what each folder owns), and the **docs-placement policy**. It's linked from the root `CLAUDE.md`; open it when you need to know *where* something goes. It describes structure only — the *what* (features, schema, design) lives in the other `/docs` specs.

GDTRKB (**Game Development Tools & Resources Knowledge Bank**) is a single-repo Next.js App Router + Tailwind app. The database and API-engine assets live beside it, kept deliberately simple (no monorepo tooling). Three runtime parts — frontend (Next.js), API (PostGraphile), database (Postgres) — deploy independently; see `docs/deployment.md`.

---

## 1. Top-level layout

```
gdtrkb/
├─ CLAUDE.md                   # agent operating manual (lean) → links into /docs
├─ README.md                   # human-facing project readme
├─ .env.example                # env var NAMES only (no secrets committed)
├─ .github/
│  └─ workflows/
│     ├─ ci.yml                # checks (lint·typecheck·test) · seed validation · idempotent reseed
│     └─ db-preview.yml        # Neon branch per PR: reseed it, delete on close
├─ .claude/
│  └─ skills/
│     └─ catalog-seed/         # project skill: seed-authoring conventions (auto-loads on seed work)
│        ├─ SKILL.md
│        └─ scripts/
│           └─ validate_seed.py # referential-integrity checker (CI gate + local)
├─ docs/                       # project-level specs — source of truth (see §4)
│  ├─ architecture.md          #   this file
│  ├─ app-spec.md              #   MVP application build spec (the WHAT)
│  ├─ app-spec-s9-s10-snapshot.md #   pre-lock archive of §9/§10, referenced by app-spec.md §10 — logging only, not current
│  ├─ schema-spec.md           #   DB schema + GraphQL API contract
│  ├─ deployment.md            #   hosting patterns + the two deploy paths
│  ├─ ci-deploy-setup.md       #   CI + deploy runbook (GitHub · Vercel · Railway · Neon)
│  └─ design/
│     ├─ design-tokens-3-phosphor.md # the CHOSEN token doc — "Phosphor" (authoritative for UI)
│     ├─ design-tokens-*.md          # alternate directions, kept for reference
│     ├─ style-directions.html       # visual comparison of the three
│     └─ phosphor-hifi-mock.html     # pixel reference for the chosen direction
├─ db/                         # database + API-engine assets
│  ├─ 01_schema.sql            # DDL + bidirectional view + rollup functions
│  ├─ 00_grants.sql            # SELECT-only `gdtrkb_ro` role + grants (deployment concern, run after 01_schema.sql)
│  ├─ 02_seed.sql              # catalog seed (curator-owned; re-runnable via a leading TRUNCATE)
│  └─ postgraphile/            # the PostGraphile container (Railway / always-on)
│     ├─ Dockerfile
│     ├─ server.js             # library-mode PostGraphile entrypoint
│     ├─ guardrails.js         # query depth/page-size/cost guardrails (+ guardrails.test.js)
│     └─ package.json
├─ public/                     # static assets, self-hosted fonts, logo frames
└─ src/                        # the Next.js application (see §2)
```

The `docs/`, `db/`, and `src/` folders are siblings. Vercel builds from the repo root (the Next app); the PostGraphile container builds from `db/postgraphile/`. `deployment.md`'s Pattern D (self-managed VPS via Docker Compose) is documented there as an option, not an included file — this repo only carries the Vercel + Railway + Neon path actually locked in `app-spec.md` §10.

---

## 2. Application module map (`src/`)

```
src/
├─ app/                        # Next App Router (routing + rendering)
│  ├─ layout.tsx               # root layout: fonts, theme, <title> = full name
│  ├─ page.tsx                 # SEARCH page (main)
│  ├─ tools/[slug]/page.tsx    # DETAIL page — SSG/ISR + generateStaticParams
│  ├─ api/tools/search/route.ts# BFF route handler — the ONLY live API path
│  ├─ not-found.tsx            # unknown-slug 404
│  └─ error.tsx               # error boundary (API/cold-start failures)
├─ components/
│  ├─ search/                  # SearchPageClient (URL-state orchestrator), SearchBar, FacetPanel, SortControl, ViewSwitch, Pagination
│  ├─ results/                 # CardGrid, ToolCard, HighScoreTable, viewRegistry (the pluggable view-switch registry)
│  ├─ tool/                    # detail sections: DetailHeader, SpecSheet, ExampleGames, Relationships
│  ├─ graph/                   # ToolGraph (reusable) + graph text fallback
│  ├─ chart/                   # PopularityChart
│  └─ ui/                      # primitives: Badge, LicensingTag, LogoFrame, Tag, Topbar, Wordmark
├─ lib/
│  ├─ graphql/                 # SERVER-ONLY GraphQL access
│  │  ├─ client.ts             #   graphql-request client + fetchGraphql/withTimeout (never imported by client components)
│  │  ├─ queries.ts            #   query documents — map to schema-spec §5.2x
│  │  ├─ types.ts              #   typed query results (domain + wire shapes)
│  │  ├─ enumCasing.ts         #   lower_snake_case ⇄ UPPER_SNAKE_CASE enum boundary
│  │  ├─ facets.ts             #   facet reference-data fetch (platforms/languages/areas)
│  │  ├─ popularity.ts         #   popularity chart data fetch
│  │  ├─ tool.ts               #   detail-page fetch + relationship merge/dedupe
│  │  └─ toolCount.ts          #   header status-line total-count fetch
│  ├─ search/                  # buildFilter(), URL ⇄ filter-state helpers
│  ├─ areas.ts                 # parent→descendants rollup for the area facet
│  └─ format.ts                 # label/initials formatting helpers
├─ styles/
│  └─ globals.css              # :root CSS variables from the chosen token doc
└─ types/                      # shared domain types (Tool, Platform, Game, …)
```

Tests are colocated `*.test.ts` files next to the module they cover (e.g. `lib/search/buildFilter.test.ts`), matching `db/postgraphile/guardrails.test.js`'s existing convention — see §5 and §6.

**Component-to-spec mapping** (so the agent knows which spec section drives each folder):

| Folder | Builds | Spec ref |
|---|---|---|
| `components/search/` | search bar, facets, sort, view switch, pagination | app-spec §7.1–7.4, §7.8 |
| `components/results/` | pluggable view registry, card grid (default), high-score table (toggle) | app-spec §7.3, §7.5, §7.6 |
| `components/tool/` | detail-page sections | app-spec §8 |
| `components/graph/` | reusable `ToolGraph` + text fallback | app-spec §7.7, §8.9 |
| `components/chart/` | popularity bar chart | app-spec §6, §8.8 |
| `lib/graphql/` | server-side queries | schema-spec §5.2, app-spec §4–5 |

---

## 3. Data flow (recap — full detail in app-spec §1 & §5)

- **Detail pages** are statically generated (SSG + ISR): `generateStaticParams` + a Server Component fetch `lib/graphql` at build/revalidate time and embed the result (including neighborhood-graph edges). Viewers normally don't hit the live API.
- **Search** is the one live path: a client component calls `app/api/tools/search/route.ts`, which builds the connection query in `lib/graphql` and returns `{ nodes, pageInfo, totalCount }`.
- **The browser never calls PostGraphile directly.** All GraphQL runs server-side; `POSTGRAPHILE_URL` and DB creds are server-only. `lib/graphql/*` must never be imported into a client component.
- **Reference/facet data** (platforms, languages, areas, enums) is fetched server-side at build/ISR and passed as props.

---

## 4. Docs-placement policy (hybrid)

**Cross-cutting project specs live in `/docs` and are the single source of truth.** These documents span multiple layers (the app spec covers FE+BE+DB+deploy; the schema spec is both the DB contract and the frontend's data contract; token docs are design specs consumed by frontend code). Filing them into any one code folder would be arbitrary and would make `CLAUDE.md`'s links brittle, so they stay in `/docs` with stable paths.

**Module-level notes may be co-located** as short `README.md` files inside a `src/` folder when that folder benefits from local guidance (e.g. `components/graph/README.md` describing the `ToolGraph` contract). Rules for these:
- They cover *only* that module's local how-to.
- They **point back to `/docs`** for anything cross-cutting — never duplicate spec content.
- If a local note and a `/docs` spec ever disagree, the `/docs` spec wins.

**Docs describe; code implements.** The chosen design-token *document* stays in `docs/design/`; its *implementation* is the `:root` variables in `src/styles/globals.css` and the Tailwind theme. Keep the two from competing: change the token doc when the design decision changes, change `globals.css` when implementing it.

---

## 5. Where does X go? (quick reference)

| New thing | Goes in |
|---|---|
| A new UI primitive (badge, tag…) | `src/components/ui/` |
| A new detail-page section | `src/components/tool/` |
| A new GraphQL query | `src/lib/graphql/queries.ts` (server-only) |
| Filter/URL-state logic | `src/lib/search/` |
| A new route/page | `src/app/…` |
| A new test | colocated `<module>.test.ts` beside the module it covers; run via `npm test` (Vitest — `vitest.config.ts` aliases `server-only` to a stub so server-only modules stay testable) |
| A design token change | `docs/design/<chosen>.md` (decision) → `src/styles/globals.css` (impl) |
| A DB schema change | `db/01_schema.sql` **and** update `docs/schema-spec.md` |
| A catalog / seed data change | `db/02_seed.sql` (conventions enforced by the `catalog-seed` skill) |
| A new agent skill | `.claude/skills/<name>/SKILL.md` (auto-discovered by its description) |
| A CI or deploy-pipeline change | `.github/workflows/` (setup steps in `docs/ci-deploy-setup.md`) |
| A whole-project spec/decision | `docs/…` |
| A note about one module | co-located `README.md` in that folder, linking back to `/docs` |

---

## 6. Naming & structure conventions

- Components: `PascalCase.tsx`, one component per file, default export the component.
- Utilities/hooks: `camelCase.ts`; hooks prefixed `use`.
- Server-only modules (`lib/graphql/*`) carry a `import 'server-only'` guard.
- Styling via Tailwind utilities + the token CSS variables; no ad-hoc hex values in components — reference the tokens.
- Keep components presentational where possible; data-fetching lives in Server Components / route handlers / `lib`.
- Tests: colocated `<module>.test.ts` beside the module under test (e.g. `src/lib/search/buildFilter.test.ts`), run via Vitest (`npm test`). `vitest.config.ts` aliases the `server-only` package to a stub, since it unconditionally throws outside Next's server bundler — this lets tests import server-only `lib` modules without pulling in a real GraphQL client or a schema.
