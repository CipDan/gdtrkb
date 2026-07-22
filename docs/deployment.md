# Deployment Guide — Game Dev Tools Knowledge Bank

> Companion to `schema-spec.md`. This document covers **where and how to run** the Postgres + PostGraphile API so an app can query it live. It only lists options that support the app's requirements: **search, filtering, ordering, and pagination through the API**, with results paged rather than dumped all at once.

---

## 1. The one fact that drives everything

PostGraphile is a **long-running Node server** that holds a pool of Postgres connections. Always-on hosting runs it as a persistent process with no cold starts and the ordinary request/response model just works; serverless platforms run code on-demand, which is great for stateless frontends but awkward for a backend that wants persistent DB connections.

Think of the app as **three moving parts**, which can live in different places:

- **Frontend** — the web UI (React/Next/Svelte/…).
- **API** — PostGraphile (or an equivalent GraphQL engine).
- **Database** — Postgres.

## 2. Search / filter / order / pagination are API-engine features, not hosting features

All four capabilities come from the **API engine**, not the platform you host it on. PostGraphile provides them out of the box:

| Requirement | How PostGraphile delivers it |
|---|---|
| **Filtering** | `postgraphile-plugin-connection-filter` — filter by `type`, `licensingModel`, `hasBuiltInEditor`, or related area/platform/language. |
| **Ordering** | `orderBy` on columns, e.g. `CONFIRMED_COMMERCIAL_TITLES_COUNT_DESC` or `NAME_ASC`. |
| **Pagination** | Relay cursor connections (`first` / `after`) or classic offset — never all rows at once. |
| **Search** | Postgres `ilike` predicates via the filter plugin, or full-text search exposed as a computed field/function. |

Because the capability lives in the engine, **any host that can run PostGraphile supports all four.** The choice below is therefore about **operations and cost**, not features.

## 3. Not suitable if you need a live query API

Two architectures from earlier discussion are **excluded** here because they have no live query API:

- **Static data snapshot on a CDN** — prebuilt files can't cover every filter × sort × search × page combination; you'd end up shipping the whole dataset and filtering in the browser, which bypasses the API and loads everything at once.
- **Browser-side SQLite (sql.js / HTTP range requests)** — supports full SQL query semantics, but the browser queries the file directly; there is no API in the loop.

Both remain excellent if you ever drop the "through the API" requirement. Everything below keeps a live API.

---

## 4. Deployment patterns (all support live querying)

Each pattern is tagged for ops effort. **Live querying: yes** applies to all of them.

### Pattern A — Split: frontend on Vercel/Netlify, API always-on, managed Postgres
**Ops: low.** The frontend deploys to Vercel or Netlify (their strength: edge-served static/SSR). It calls a PostGraphile endpoint hosted on an always-on platform (Render/Railway/Fly.io), with Postgres on a managed service (Neon/Supabase). Nothing fights the architecture; the API keeps its warm pool. **The clean default for most apps.**

### Pattern B — All-in-one PaaS (Render / Railway / Fly.io)
**Ops: low.** Put the PostGraphile container and a managed Postgres on the *same* platform, wired in one dashboard. Render and Railway have free/hobby tiers; Fly.io helps if you want the API near users in multiple regions. Deploy via PostGraphile's Docker image with the read-only flags.

### Pattern C — Container-serverless (Cloud Run / AWS App Runner / Azure Container Apps)
**Ops: low–medium.** Runs your PostGraphile *container*, scales to zero when idle (pay ~nothing), yet keeps a warm instance during traffic so connection reuse works far better than per-request functions. Pair with Neon / Cloud SQL / RDS (through a pooler). Serverless economics without the worst serverless connection problems.

### Pattern D — VPS, self-managed (Hostinger VPS / DigitalOcean Droplet)  ← see `docker-compose.yml`
**Ops: high.** Rent a Linux box and run Postgres + PostGraphile + a TLS proxy yourself. The included `docker-compose.yml` does exactly this (Postgres, PostGraphile with the filter plugin, and Caddy for automatic HTTPS). Most control and cheapest at scale, but you own patching, backups, and TLS renewal. Optionally add a self-hosted PaaS layer (**Coolify / Dokku / CapRover**) for push-to-deploy convenience on the same box. Note: use a **VPS**, not shared hosting — a persistent Node server needs it.

### Pattern E — Managed Node platform (Hostinger managed Node.js / Cloudways)
**Ops: medium.** Push-to-deploy a persistent Node app without hand-configuring PM2 and Nginx; the platform handles deploys, backups, SSL. Point it at a managed Postgres. A middle ground between a raw VPS (D) and a PaaS (B).

### Pattern F — Serverless functions (Vercel / Netlify) + pooler
**Ops: medium.** Run PostGraphile inside a serverless function so API and frontend share one project. Same four query features, **but** add a connection pooler or the platform's warm-instance feature so functions don't exhaust Postgres (Neon/Supabase pooler or PgBouncer; on Vercel, Fluid Compute reuses connections; on Netlify, an HTTP-based driver like Neon's). Convenient, at the cost of cold starts and pooling config.

### Pattern G — Home server + Cloudflare Tunnel
**Ops: medium.** Run the stack on a spare PC / Raspberry Pi and expose it through a Cloudflare Tunnel — no public IP, no port forwarding, free TLS. Cheapest possible, dependent on your home uptime.

---

## 5. Zero-server alternatives that still support all four (engine swap)

These replace PostGraphile with a hosted GraphQL engine, so you run **no server at all** — but the spec's PostGraphile-specific pieces (the bidirectional view exposure, the `SETOF` rollup functions) would be re-expressed in the new engine's conventions.

- **Hasura Cloud** — arguably the strongest fit for these four needs: `where` filtering, `order_by`, `limit/offset` + cursor pagination, and search predicates, fully managed. Point it at your Postgres; re-express custom pieces as tracked functions / computed fields.
- **Supabase** — managed Postgres with built-in GraphQL (`pg_graphql`) supporting filter/order/pagination/search natively, plus auth/storage/edge functions if the app grows.
- **Cloudflare Workers + Hyperdrive** (edge-native) — a real API supporting all four, with Hyperdrive pooling Postgres for the edge; you implement the query layer yourself rather than auto-generating it.

---

## 6. Recommended default for this project

The catalog is **read-only and rarely changes**, so it's extremely cacheable and read-heavy. Best value-per-effort:

1. **Database:** managed Postgres free tier (Neon or Supabase).
2. **API:** PostGraphile on **Cloud Run** (Pattern C) for scale-to-zero, or a small **Render/Railway** instance (Pattern B) for a flat, predictable cost. All four query features come free.
3. **Frontend:** Vercel or Netlify.
4. **Caching:** lean on GraphQL cursor pagination + an HTTP cache/CDN in front of the endpoint, since data changes rarely — most reads never hit the database.

Prefer to run **no** server? **Hasura Cloud** is the strongest zero-ops alternative that still nails search/order/filter/pagination — accepting the engine swap.

Want full control / lowest long-run cost and don't mind ops? The **VPS route (Pattern D)** with the bundled `docker-compose.yml` is ready to go.

---

## 7. VPS quick start (Pattern D)

See the repo `README.md` for the full walkthrough. In short, on a fresh VPS with Docker installed and DNS pointed at it:

```bash
cp .env.example .env      # then edit: DB password, DOMAIN, ACME_EMAIL
# place 01_schema.sql and 02_seed.sql next to docker-compose.yml
docker compose up -d --build
```

Postgres runs `01_schema.sql` then `02_seed.sql` on first boot, PostGraphile comes up read-only with filtering enabled, and Caddy provisions HTTPS for your domain. GraphiQL is then available at `https://<DOMAIN>/graphiql`.

**Hardening notes:** create a dedicated `SELECT`-only Postgres role for PostGraphile to connect as (defense in depth beyond `--disable-default-mutations`); take regular `pg_dump` backups; and for a truly public endpoint under untrusted load, add query cost/pagination limits (middleware, or PostGraphile Pro) — not needed for a private or low-traffic catalog.
