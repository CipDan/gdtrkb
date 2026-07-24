# Game Development Tools Knowledge Bank — Application Build Specification (MVP)

> **Purpose of this document.** This is the **application build spec** for the web app that sits on top of the Game Dev Tools Knowledge Bank. It defines the **frontend**, the **backend wiring**, the **database usage**, and the **deployment** for a shippable **MVP**, plus a prioritized feature list. It is written to be handed to an implementing model or developer.
>
> **Companion documents (authoritative, do not re-derive):**
> - `schema-spec.md` — the data model, full relational schema (DDL), and GraphQL API surface. **This document does not redefine the schema; it consumes it.** Section references below (e.g. §5.2a) point into that file.
> - `deployment.md` — hosting patterns and trade-offs.
> - `01_schema.sql`, `02_seed.sql` — runnable DDL + sample seed.
>
> **How to read this document.** Everything in sections 1–10 is the **MVP build target — build all of it.** Nothing outside the MVP appears in the build steps. The single **§11 "Out of scope / Phase 2"** appendix at the end is **context only — do not implement it.**

---

## 0. Scope boundary (read this first)

The MVP is a **read-only, public, curator-populated catalog** with search, faceted filtering, sorting, pagination, per-tool detail pages, a popularity chart, and a per-tool relationship graph. There is **no authentication, no user accounts, no write/submission path, and no admin UI** — data is populated by the curator via SQL seed scripts (see the schema spec).

| Area | In scope (MVP — build this) | Out of scope (Phase 2 — §11, do **not** build) |
|---|---|---|
| Search | Search bar over tool name + summary | Fuzzy/typo-tolerant search, full-text ranking |
| Filtering | Faceted filters: type, area of use, host OS, target platform, language, licensing, has-built-in-editor | Saved filters, filter presets |
| Results views | Card grid (default) + sortable "high-score" table (toggle) | **Graph view** of the current result set |
| Sorting | Name (A–Z), popularity (confirmed-titles count) | Multi-column / custom sort keys |
| Detail page | All schema sections for one tool | — |
| Visualizations | (a) Popularity **bar chart**; (b) per-tool **neighborhood graph** (1-hop) on the detail page | **Global/query-scoped graph** on the search page |
| Data entry | SQL seed only (curator) | Any in-app admin/editor UI |
| Auth | None (fully public, read-only) | Any accounts/roles |

Two MVP requirements exist specifically so Phase 2 slots in without a rewrite. They are **mandatory MVP requirements**, not previews: the **pluggable results view switch** (§7.3) and **URL-based filter state** (§7.4), plus the **reusable `ToolGraph` component** (§7.7). Build them now.

---

## 1. System overview

Three moving parts, each hosted separately (see §9):

1. **Frontend** — Next.js (App Router) web app. Serves the search page and the per-tool detail pages, and owns all UI.
2. **API** — PostGraphile (Core) exposing a queries-only GraphQL endpoint over Postgres. Defined entirely by the schema spec.
3. **Database** — PostgreSQL, loaded from `01_schema.sql` + `02_seed.sql`.

**Key architectural decisions (fixed for the MVP):**

- The **Next.js server layer is a thin BFF**: the browser never talks to the GraphQL endpoint directly. All GraphQL calls are made server-side (Server Components, Route Handlers). The PostGraphile URL is a server-only secret. This avoids CORS/exposure concerns and keeps responses cacheable.
- **Detail pages are statically generated** (SSG with incremental revalidation / ISR). The catalog is read-only and changes rarely, so detail pages are built from the API and served from the CDN; a viewer loading a detail page normally does **not** hit the live API.
- **Search is live.** The search/filter/sort/pagination path queries PostGraphile at request time through a BFF route handler. (This preserves the project's explicit requirement for server-side search rather than shipping the whole dataset to the browser.)

```
Browser ──▶ Next.js (Vercel)
              ├─ Server Components / generateStaticParams ──(build/ISR)──▶ PostGraphile ──▶ Postgres
              └─ Route Handler /api/tools/search ──(request time)────────▶ PostGraphile ──▶ Postgres
```

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (App Router), TypeScript** | React Server Components; SSG/ISR for detail pages. |
| Styling | **Tailwind CSS** + a small design-token layer (§8) | Tokens encode the retro theme; utilities for layout. |
| GraphQL client (server-side) | **`graphql-request`** (or `urql` core) | Lightweight; used only in server code. Do not ship a heavy client to the browser. |
| Charts | A React chart lib (e.g. **Recharts**) | For the popularity bar chart only. |
| Graph rendering | **Cytoscape.js** *or* **React Flow** | One choice, used by the reusable `ToolGraph` (§7.7). |
| API engine | **PostGraphile Core (V4, MIT)** + `postgraphile-plugin-connection-filter` | Queries-only. Defined by the schema spec. |
| Database | **PostgreSQL** | Schema + seed from the companion SQL files. |

No component in the MVP requires PostGraphile Pro or any paid plugin.

---

## 3. Database (usage, not (re)definition)

The database is **fully specified** in `schema-spec.md` and the two SQL files. This app **consumes** it as-is.

- Provision Postgres, then run `psql "$DATABASE_URL" -f 01_schema.sql && psql "$DATABASE_URL" -f 02_seed.sql`.
- The app connects **only through PostGraphile** — no direct SQL from the frontend/BFF.
- PostGraphile should connect as a **`SELECT`-only role** (defense in depth beyond `--disable-default-mutations`).
- Reference data used to build facet options (all `platform`, `language`, `area_of_use`, and the `tool_type` / `licensing_model` enum values) is read through the API like everything else.

The app **assumes no schema changes**. If a field is needed that the schema doesn't expose, that is a schema-spec change, not an app change.

---

## 4. Backend / API wiring

PostGraphile is run exactly as described in the schema spec §6.1 (library mode, not the CLI — see that section for why), with:

- `disableDefaultMutations: true` (queries-only public surface),
- `postgraphile-plugin-connection-filter` appended, with `graphileBuildOptions.connectionFilterRelations: true` (enables the `filter:` arguments the search page uses, including the platform/area/language relation filters — the CLI-only setup cannot express that last option),
- connection (Relay cursor) pagination and `orderBy` enabled (default).

The app uses these API capabilities (all already defined in the schema spec — do not invent new ones):

| App feature | GraphQL query it uses | Schema-spec ref |
|---|---|---|
| Detail page (one tool, everything nested) | `toolBySlug(slug:)` with nested platforms/languages/areas/games/relationships | §5.2a |
| Detail-page neighborhood graph | `toolRelationshipBidirectionals(filter: { sourceTool: { slug: … } })` | §5.2f |
| Search results (filter + sort + paginate) | `tools(filter:, orderBy:, first:, after:)` connection | §5.2c, §5.2d |
| Popularity chart | `tools(orderBy: CONFIRMED_COMMERCIAL_TITLES_COUNT_DESC, first:)` | §5.2d |
| Facet option lists | collection queries on `platforms`, `languages`, `areaOfUses` | §5.1 |

**Search filter shape.** The search bar matches **name OR summary**, combined (AND) with the active facets. Conceptually:

```graphql
tools(
  filter: {
    and: [
      { or: [
        { name:    { includesInsensitive: $q } }
        { summary: { includesInsensitive: $q } }
      ] }
      # facet clauses, each added only when selected:
      { type:           { equalTo: $type } }
      { licensingModel:  { equalTo: $licensing } }
      { hasBuiltInEditor:{ equalTo: $hasEditor } }
      { toolPlatforms: { some: { role: { equalTo: HOST_OS }, platform: { slug: { equalTo: $hostOs } } } } }
      { toolPlatforms: { some: { role: { equalTo: TARGET },  platform: { slug: { equalTo: $target } } } } }
      { toolAreaOfUses:{ some: { areaOfUse: { slug: { equalTo: $area } } } } }
      { toolLanguages: { some: { language:  { slug: { equalTo: $lang } } } } }
    ]
  }
  orderBy: $orderBy       # NAME_ASC | CONFIRMED_COMMERCIAL_TITLES_COUNT_DESC
  first: $pageSize
  after: $cursor
) {
  nodes { slug name type summary licensingModel logoImageUrl hasBuiltInEditor
          confirmedCommercialTitlesCount }
  pageInfo { hasNextPage endCursor }
  totalCount
}
```

An empty search string omits the `or:` name/summary clause. Facet clauses are included only for the facets the user has actually selected.

---

## 5. Backend-for-frontend (BFF) endpoints

All GraphQL access is server-side. Expose exactly these internal surfaces:

1. **`generateStaticParams` + a Server Component fetch** for `/tools/[slug]` — runs `toolBySlug` **and** the neighborhood-edges query at build/revalidate time, embedding both into the statically generated page. Set an ISR revalidation window (e.g. hourly; tune later).
2. **`GET /api/tools/search`** (Route Handler) — accepts the search/filter/sort/page params, builds the `tools(...)` connection query, returns `{ nodes, pageInfo, totalCount }`. This is the only request-time API path in the MVP.
3. **Facet options** — fetched server-side (build/ISR) and passed to the search page as props (`platforms`, `languages`, `areas`, plus the static enum lists for `type` and `licensing`). Reference data changes rarely, so it does not need a live endpoint.
4. **Popularity chart data** — fetched server-side (build/ISR), embedded into whichever page hosts the chart.

The PostGraphile endpoint URL and DB credentials are **server-only environment variables**; they are never sent to the browser.

---

## 6. Routes / pages

| Route | Rendering | Purpose |
|---|---|---|
| `/` (search) | Client-interactive over server-provided initial data | Main page: search bar, facets, sort, results (grid/table), pagination, popularity chart |
| `/tools/[slug]` | **SSG + ISR** | Per-tool detail page (all sections + neighborhood graph) |
| `/not-found`, error boundaries | Standard | 404 for unknown slug, graceful API-error states |

The search page's default state (no query, no facets) shows the full catalog paginated in the card grid, sorted by name.

---

## 7. Frontend — search page & shared behavior

### 7.1 Search bar
A single prominent text input. Matches **name + summary** (case-insensitive, substring). Debounced (~250–300 ms). Empty input = no text constraint.

### 7.2 Facet panel
Faceted filters, AND-combined with each other and with the search text:

- **Tool type** — from the `tool_type` enum. **Single-select** for the MVP.
- **Area of use** — from `area_of_use`, shown as the 2-level hierarchy (parents group their leaves). **Selecting a parent includes all of its child leaves** (parent-includes-children rollup): resolve the selected area to *itself plus its descendants* via the schema spec's `area_of_use_descendants(root_slug)` function (§4.9), then match any tool tagged with an area in that set. Selecting a leaf matches only that leaf. (Practically: expand the selected slug to a slug set server-side in the BFF, then filter `toolAreaOfUses: { some: { areaOfUse: { slug: { in: $slugSet } } } }`.)
- **Host OS** — platforms filtered by role `HOST_OS`.
- **Target platform** — platforms filtered by role `TARGET`.
- **Language** — from `language`.
- **Licensing model** — from the `licensing_model` enum.
- **Has built-in editor** — a boolean toggle.

Each facet reflects the current selection and can be cleared. A global "clear all" resets to default.

### 7.3 Results area — pluggable view switch (mandatory)
The results area is a **view switch**, not a hardcoded grid/table pair. Implement it as a set of registered view modes with a shared props contract (the current result nodes + loading/error state):

- `grid` — **default.** Card grid of tools.
- `table` — sortable "high-score board" table (§7.6).
- *(a third mode slot, `graph`, is added in Phase 2 — see §11. Do not implement it now, but do not design the switch so that adding a third mode requires refactoring the switch itself.)*

### 7.4 Filter/sort/view state lives in the URL (mandatory)
All of search text, every active facet, the sort key, the current page cursor, and the selected view mode are encoded in the **URL query string** (e.g. `/?q=godot&type=game_engine&target=nintendo-switch&sort=popularity&view=table`). Component state derives from the URL, not the reverse. This makes searches shareable/bookmarkable and lets any current or future results view read the same filters.

### 7.5 Card grid (default view)
Each card ("cartridge") shows: tool logo (in a consistent frame), name, type badge, licensing badge, a one-line summary, and small area-of-use tags. The whole card links to `/tools/[slug]`. Responsive column count (desktop-first: more columns on wide screens, collapsing to 1–2 on mobile).

### 7.6 High-score table (toggle view)
A sortable data table framed as an arcade high-score board: rank, tool name, type, licensing, and the confirmed-titles count (the "score"). Sortable by name and by score. Same underlying result set as the grid.

### 7.7 Reusable `ToolGraph` component (mandatory)
Build **one** graph component used for the detail-page neighborhood graph now, and reused unchanged by the Phase 2 results graph later. Contract:

```
ToolGraph({
  nodes:  { slug, name, type, logoImageUrl }[],
  edges:  { source, target, type, note, mirrored }[],
  onNodeClick: (slug) => void
})
```

It renders nodes + typed edges, labels edges by relationship type, and calls `onNodeClick` (used to navigate to a tool's detail page). It must **not** fetch data itself — data is passed in. In the MVP it is only mounted on the detail page.

### 7.8 Pagination
Use the connection's cursor pagination (`first` / `after`) with a page size (e.g. 24 for the grid). Never load the whole dataset at once. Show "next / previous" or "load more"; expose `totalCount` for context.

### 7.9 Loading, empty, error states
Every data view has: a loading state, an empty state ("no tools match"), and an error state (API/cold-start failure) with a retry. Because the API may cold-start on the free tier (§9), the search view's first request after idle can be slow — show a loading indicator, don't hang.

---

## 8. Frontend — detail page (`/tools/[slug]`)

Statically generated. Renders **all** sections the schema carries for a tool:

1. **Header** — logo (framed), name, type badge, licensing badge (+ licensing note), built-in-editor indicator.
2. **Summary.**
3. **Links** — website / docs / source repo / community (by `tool_link` type).
4. **Areas of use** — leaf tags, grouped under their parent domain.
5. **Platforms** — two labeled groups: **Runs on** (HOST_OS) and **Exports to** (TARGET).
6. **Languages** — the scripting/authoring languages.
7. **Example games** — the 2–3 highlighted titles: banner/thumbnail (framed, with attribution from `*_image_source`), name, developer, release year, and store links.
8. **Popularity figure** — the confirmed-titles count with its `as_of` date and source (distinct from the count of example games).
9. **Relationships — neighborhood graph** — the `ToolGraph` (§7.7) rendered from this tool + its 1-hop neighbors, fed by the bidirectional-edges data already fetched for the page (§5.2f). Directional edges labeled by type (EXPORTS_TO, PLUGIN_FOR, EMBEDS, BUILDS_ON, IMPORTS_FROM); symmetric PAIRS_WELL_WITH shown undirected. Clicking a neighbor navigates to its detail page. Provide a plain **text/list fallback** of the same relationships for accessibility and for when the graph can't render.

Image fields are **references with attribution**, never re-hosted copyrighted assets — display the attribution note.

---

## 9. Design system — "retro accent, modern bones"

The design system follows the **"retro accent, modern bones"** frame (an arcade-inspired display face used sparingly over clean, readable structure). The concrete token set — color, typography, spacing, component treatments — is defined in a **separate design-token document**, chosen from three parallel options.

**► LOCKED: Phosphor.** The chosen file is **authoritative** for all color, type, spacing, and component tokens; implement its tokens exactly:

```
CHOSEN DESIGN SYSTEM: design-tokens-3-phosphor.md   ("Phosphor")
```

The three options (see `gamedev-tools-style-directions.html` for the visual comparison):
- `design-tokens-1-cartridge.md` — "Cartridge": light cartridge-label cards on a deep purple shelf (Silkscreen + Inter).
- `design-tokens-2-attract-mode.md` — "Attract Mode": arcade-cabinet neon, cyan + magenta + gold, high-score board as hero (Press Start 2P + Inter).
- `design-tokens-3-phosphor.md` — "Phosphor": monochrome amber terminal, most minimal (VT323).

**Invariants (hold regardless of which is chosen — do not override):**
- The pixel/display face is used only for the wordmark, headings, small labels, and the score column — **never** for body or long-form reading text.
- Body/reading text meets **WCAG AA** contrast and comfortable sizing.
- All interactive elements have **visible keyboard focus** states; `prefers-reduced-motion` is respected.
- The neighborhood graph has the §8.9 text fallback, and meaning is never conveyed by color alone.
- **Excluded from the MVP** (deferred to full 16-bit in Phase 2): custom sprite art, CRT/scanline shaders, and bespoke per-tool pixel icons — use each tool's real logo inside a consistent frame instead.

**Known deviations from `phosphor-hifi-mock.html`** (intentional, approved against real catalog data — the mock is annotated at each spot; don't "fix" the code back to literal pixel match without asking first):
- **Facet panel** (§7.2) — the mock shows every facet always expanded in a static list; the real `FacetPanel` is a sticky, self-scrolling sidebar (`md:sticky` + capped height) whose facet groups are collapsible `<details>`/`<summary>` blocks, auto-expanded only when that facet is active. Real facet cardinality (the area-of-use tree, platforms, languages) is far larger than the mock's six-facet demo; the always-expanded layout stretched the page well past the results below it.
- **Detail-page layout** (§8) — the mock's `.cols` puts Example Titles and Relationships side-by-side on desktop; the real page stacks both in a single full-width column at every viewport width. Real relationship graphs have more neighbors than the mock's 3-node example, and a 50%-width column was squeezing `ToolGraph`'s layout and labels; the graph's canvas also now sizes itself off its own neighbor count (§7.7), which needs the full column width to do well.
- **Sort control** — the mock's `.ctl` implies a plain label with a native-style dropdown; the real `SortControl` (§7.2) is a hand-built listbox button + popup, since a native `<select>`'s open dropdown is OS-rendered chrome that can't be fully themed to Phosphor (no border-line frame, no bracket hover rows). The closed-state look still matches the mock.

---

## 10. Deployment

**Locked: Railway (always-on API).** The API runs as one always-on **PostGraphile** instance on **Railway** — no cold starts. The frontend is on **Vercel** and the database on **Neon**; all three deploy independently. *(The earlier $0 Cloud Run path and the Fly.io / Render always-on alternatives are preserved in `app-spec-s9-s10-snapshot.md`. All are the same Docker image, so changing host is a redeploy, not a rewrite.)*

**Topology**
- **Frontend — Vercel (Hobby, $0):** SSG/ISR detail pages, CDN-served.
- **Database — Neon (Free, $0):** Postgres; run the migrations below against it. PostGraphile connects as a **`SELECT`-only role** (defense in depth beyond `--disable-default-mutations`).
- **API — Railway (Hobby, ~$5/mo):** the PostGraphile container (`db/postgraphile/Dockerfile`), always-on.

**Sizing (why it's cheap).** PostGraphile is a **stateless** Node server and the data lives on Neon, so the API host needs **no persistent storage/volume** — only a little compute. **256 MB RAM** is enough (512 MB comfortable), shared/fractional CPU is fine for a low-traffic read-only catalog, and the platform's managed HTTPS endpoint means **no dedicated IP**. Railway's Hobby plan is $5/mo including $5 of usage, and a 256 MB always-on service lands within that credit — so the effective cost is **~$5/mo**. Because Vercel and Neon stay free, **~$5/mo is the whole runtime bill.** (Prices drift — verify current rates before committing.)

**Deploy flow (Railway).** Railway is container-native and **builds the Dockerfile straight from the GitHub repo on push** — no manual image build/push, no cold starts. Point a Railway service at the repo (service root `db/postgraphile/`), set the env vars below, and it builds and runs the API; its public URL becomes the frontend's `POSTGRAPHILE_URL`.

**Environment variables:**
- `DATABASE_URL` — Neon **pooled** connection string, using the `SELECT`-only role (**API/server only**; set it in Railway → *Variables*, never committed).
- `POSTGRAPHILE_URL` — the Railway service's public GraphQL URL (**server-only** in Next.js; never exposed to the browser).
- `PORT` — injected by Railway at runtime; the container binds to it (do not hardcode a fixed port).
- ISR revalidation interval — config on Vercel.

**Data load:** run `db/01_schema.sql` then `db/02_seed.sql` against the Neon database before first deploy. A **GitHub Actions** workflow can run these migrations on push and trigger the Vercel + Railway deploys (a clean CI/CD touch).

### 10.1 Developer workflow & CI (recommended)
This is *how the app is built*, not part of its runtime stack — but it's a clean fit for the project's DevOps goals, and it matters here because much of the code is AI-agent-generated and won't otherwise get line-by-line human review.

- **Source control + CI:** GitHub repo; GitHub Actions running, on every PR/push: lint, type-check, tests, the SQL migration run, and deploy triggers for Vercel and the API host.
- **Baseline quality gates (non-negotiable):** TypeScript strict mode, ESLint + Prettier, and a minimal test setup (unit/component). An AI reviewer complements these — it does not replace them.
- **AI code review — CodeRabbit (recommended):** an automated reviewer on every pull request. As of mid-2026 its Free tier is permanent and needs no credit card, giving AI PR summaries and review comments on unlimited public and private repos (rate-limited to roughly four PR reviews per hour — ample for a solo MVP); a public/portfolio repo gets the full paid feature set for free. It is review-only, so keep the lint/type/test gates above. Comparable alternatives if you want to evaluate: Sourcery (also free on public repos), Greptile, the self-hostable PR-Agent, or GitHub Copilot's built-in PR review. Verify current terms before committing — these change often.

---

## 11. MVP feature checklist (definition of done)

- [ ] Postgres provisioned; `01_schema.sql` + `02_seed.sql` loaded; PostGraphile running queries-only with the connection-filter plugin, as a `SELECT`-only role.
- [ ] Next.js app with server-side GraphQL access only (BFF); PostGraphile URL not exposed to the browser.
- [ ] Search page: search bar (name + summary), all seven facets, sort (name / popularity), pagination.
- [ ] Results area is a **pluggable view switch** with **grid (default)** and **table** modes.
- [ ] Filter/sort/page/view state encoded in the **URL**.
- [ ] Card grid and high-score table both render the current result set.
- [ ] Popularity **bar chart**.
- [ ] Detail page (`/tools/[slug]`), SSG/ISR, rendering all sections in §8.
- [ ] **Neighborhood graph** on the detail page via the reusable **`ToolGraph`**, with a text fallback.
- [ ] "Retro accent, modern bones" design system applied; WCAG AA body text; visible focus states.
- [ ] Loading / empty / error states on every data view (including graceful API cold-start handling).
- [ ] Fully responsive, desktop-first.
- [ ] Deployed according to §10: Vercel frontend, Railway PostGraphile API, and Neon database.

---

```
╔══════════════════════════════════════════════════════════════════════╗
║  §12 — OUT OF SCOPE / PHASE 2 — CONTEXT ONLY. DO NOT IMPLEMENT.        ║
║  Nothing below is part of the MVP build. It exists so the MVP is      ║
║  built in a shape that accommodates it later. Do not build any of it. ║
╚══════════════════════════════════════════════════════════════════════╝
```

## 12. Out of scope / Phase 2 (do not implement)

These are recorded so the mandatory MVP seams (§7.3 view switch, §7.4 URL state, §7.7 `ToolGraph`) make sense — **not** as build targets.

- **Query-scoped global graph on the search page.** A **third results view** (`graph`) alongside grid and table, rendering the tools matching the **current filters** as nodes with the edges among them. It reuses the §7.7 `ToolGraph` and the §7.4 URL filter state. Its data-fetch differs from the grid/table: instead of a paginated page, it fetches the matching set (capped, with a "narrow your search" nudge when large) **plus the relationships whose endpoints are both in that set** — which is why it is deferred.
- **Full 16-bit aesthetic.** Custom sprite art, CRT/scanline shaders, bespoke per-tool pixel icons — an upgrade over the §9 "retro accent" system.
- **Nice-to-haves:** fuzzy/typo-tolerant or full-text-ranked search; multi-select facets with counts; saved/preset filters; analytics; any admin/editor UI (data stays curator-SQL-only).

*End of specification.*
