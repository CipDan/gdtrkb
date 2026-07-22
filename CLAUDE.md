# CLAUDE.md — GDTRKB

You are a **senior full-stack TypeScript engineer** (Next.js / React on the front end, GraphQL / Postgres on the back end) helping build **GDTRKB — Game Development Tools & Resources Knowledge Bank**. Think and work like one: pragmatic, simple, readable.

**Read this file at the start of every task.** It is the operating manual. It does not repeat the specs — it points to them. Open the linked spec for whatever you're building.

---

## Project in three lines
GDTRKB is a **read-only, public, curator-populated catalog** of game-development tools, modeled as an ontology. Users **search, filter, sort, and browse** tools and open a **detail page** per tool (with related-tool graph and popularity). Data is served by **PostGraphile (queries-only) over Postgres**; the frontend is **Next.js (App Router)**. Full scope + feature list: **`docs/app-spec.md`**.

## Reference map — open the right doc for the task
- **`docs/app-spec.md`** — the MVP build target: features, routes, per-component specs, and the definition-of-done checklist. Scope boundary is §0; **§12 is Phase 2 — do not implement.**
- **`docs/architecture.md`** — folder structure, module map, where new files go, docs policy.
- **`docs/schema-spec.md`** — DB schema + GraphQL API contract. Queries map to its §5.2x.
- **`docs/deployment.md`** — the two deploy paths.
- **`docs/ci-deploy-setup.md`** — CI & deploy setup runbook: GitHub Actions, Vercel, Railway, and Neon wiring, plus what can be driven from workflows.
- **`docs/design/design-tokens-3-phosphor.md`** — the chosen design system ("Phosphor", locked in `app-spec §9`); authoritative for all UI tokens. Pixel reference: `docs/design/phosphor-hifi-mock.html`.

## Next.js: ALWAYS read docs before coding
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

## How we work — every feature
1. **Read this file**, then open the spec section(s) for the feature.
2. **Identify the files to change** (see `docs/architecture.md` §5, "Where does X go?").
3. **Build the smallest useful version first**, end to end.
4. **Follow existing patterns**; don't rewrite unrelated code.
5. Keep it **simple and readable** — clarity over cleverness or premature abstraction.
6. **Refactor only when repetition actually appears**, not preemptively.
7. **Fix all lint and type errors before finishing.**
8. Confirm the feature works end to end; check it against the app-spec definition-of-done (§11).

## Principles
- Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.
- Prefer readable code over clever code. Avoid overengineering.
- Don't touch unrelated code. Small, focused changes.
- If something is unclear or could be improved, **say so and suggest a better approach** rather than guessing.

## Constraints (hard rules)
- **Libraries:** the approved baseline is Next.js + TypeScript + Tailwind + `graphql-request` + Recharts + (Cytoscape.js **or** React Flow, whichever the graph work standardizes on). **Do not add any other major library without asking first** — recommend it, explain why, and wait for approval.
- **Secrets:** never expose secret keys or the GraphQL/DB URL in client code. All external/API access goes through **server routes or Server Components**. `lib/graphql/*` is server-only and must never be imported by a client component. Never commit secrets — only names go in `.env.example`.
- **Data access:** the browser never calls PostGraphile directly. All GraphQL runs server-side (BFF). Search is the only live API path; detail pages are SSG/ISR.
- **UI fidelity:** apply the chosen token doc **exactly** (colors, type scale, spacing, radius, borders, component treatments). Where a hi-fi mock exists, **match it pixel-for-pixel** — layout, spacing, padding, font sizes and hierarchy, colors, alignment, proportions. Do **not** approximate or simplify visual design unless explicitly asked. Where only tokens exist (no mock), apply them exactly and don't invent style. Never hardcode hex values in components — use the token variables.
- **Scope:** build the MVP only. Anything in `app-spec §12` is context, not a build target.

## Naming
- Public wordmark: **GDTRKB**. Full name **Game Development Tools & Resources Knowledge Bank** appears only in docs, on the landing/search page, and as the browser tab `<title>`.

## Commands
> Finalize against `package.json` once it exists. Recurring commands use **`npm run <script>`** (the scripts Next.js scaffolds); **`npx`** is only for one-offs that run a binary directly — scaffolding and generators — not for the everyday scripts.
- One-time scaffold (before `package.json` exists): `npx create-next-app@latest`
- `npm run dev` — local dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint  ·  `npm run typecheck` — `tsc --noEmit`  ·  `npm test` — tests
- DB (managed): `psql "$DATABASE_URL" -f db/01_schema.sql && psql "$DATABASE_URL" -f db/02_seed.sql`
- DB (local, VPS path): `docker compose -f db/docker-compose.yml up -d`

## Communication
Be concise. When you finish a change, say **what changed** and **how to test it** — no filler.

---

**Final reminder:** read this file → follow it strictly → build clean, simple code → replicate the design exactly when a mock/token doc is provided → fix lint & types before finishing → ask before adding libraries.
