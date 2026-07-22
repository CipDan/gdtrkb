# GDTRKB — CI & deploy setup runbook

Companion to `.github/workflows/ci.yml`, `db/postgraphile/Dockerfile`, and
app-spec §10. Covers the one-time wiring for GitHub Actions, Vercel, Railway,
and Neon, the extra steps the repo's own files imply, and how far the whole
thing can be driven from workflows.

Topology (locked in app-spec §10): **frontend → Vercel**, **API (PostGraphile)
→ Railway**, **database → Neon**. All three deploy independently.

---

## 1. Credentials — who holds what

There are three distinct database identities. Keeping them separate is the
whole security model, so don't collapse them into one connection string.

| Identity | Endpoint | Used by | Lives in |
|---|---|---|---|
| Neon **owner / migration** role (DDL + INSERT) | Neon **direct** (unpooled) | CI migration / reseed job | GitHub secret `DATABASE_URL_MIGRATIONS` |
| Neon **`SELECT`-only** role | Neon **pooled** (`-pooler` host) | PostGraphile at runtime | Railway variable `DATABASE_URL` |
| PostGraphile public URL (`…/graphql`) | Railway domain | Next.js BFF (server-only) | Vercel env `POSTGRAPHILE_URL` |

The browser never sees any of these; the Next.js server calls PostGraphile
server-to-server, and PostGraphile calls Neon.

---

## 2. Neon (database)

1. Create a project and a database (e.g. `gdtrkb` / `neondb`).
2. From the dashboard, copy both connection strings: the **pooled** one (host
   contains `-pooler`) for runtime, and the **direct** one for migrations. Neon
   DDL is happiest over the direct endpoint.
3. **Create the `SELECT`-only role and its grants.** This is an *additional step
   not covered by the committed SQL* — `01_schema.sql` is pure DDL and never
   creates the role or grants deployment.md §7 calls for. After running the
   schema, run (as the owner):
   ```sql
   CREATE ROLE gdtrkb_ro LOGIN PASSWORD '<secret>';
   GRANT USAGE ON SCHEMA public TO gdtrkb_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO gdtrkb_ro;
   -- so re-created tables keep working without re-granting by hand:
   ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN SCHEMA public
     GRANT SELECT ON TABLES TO gdtrkb_ro;
   ```
   The `ALTER DEFAULT PRIVILEGES` line matters because dropping/recreating the
   schema drops grants with it — this makes the `SELECT`-only role survive a
   future schema rebuild. Keep the grant snippet in the repo (e.g.
   `db/00_grants.sql`) even though the role's password stays a secret.
4. First load: `psql "<direct-url>" -f db/01_schema.sql`, then the grants above,
   then `psql "<direct-url>" -f db/02_seed.sql`. (Or let CI do steps 3–4 once
   the secret is set — see §5.)

---

## 3. Railway (PostGraphile API)

1. New project → **Deploy from GitHub repo** → pick the repo. Railway detects
   the Dockerfile and builds from it.
2. Service **Settings** (these are the monorepo bits that are *dashboard-only*,
   not expressible in `railway.toml`):
   - **Root Directory** = `db/postgraphile` — so Railway only pulls that folder.
   - **Watch Paths** = `db/postgraphile/**` — patterns run from the repo root
     even with a root directory set; this stops unrelated pushes from
     rebuilding the API.
   - If you add a `railway.toml`, set its **Config-file path** to the absolute
     `/db/postgraphile/railway.toml` (the config path does *not* follow the root
     directory).
3. **Variables**: `DATABASE_URL` = the Neon **pooled**, `SELECT`-only string.
   Do **not** set `PORT` — Railway injects it and the Dockerfile binds `$PORT`.
4. **Networking → Generate Domain.** The resulting URL, with `/graphql`
   appended, is what Vercel's `POSTGRAPHILE_URL` points at (PostGraphile serves
   GraphQL at `/graphql` by default).
5. **Settings → enable "Wait for CI."** Railway then holds the deploy in a
   WAITING state until your GitHub Actions checks pass — so a red build never
   ships the API.

Dockerfile hardening the file itself flags as TODO before going public:
- Append `--disable-graphiql` to the CMD (GraphiQL is on by default), and
  optionally `--retry-on-init-fail` so a cold DB at boot doesn't crash-loop.
- Swap the `npm install postgraphile@^4 …` ranges for a copied
  `package.json` + `package-lock.json` and `npm ci --omit=dev`, so builds are
  reproducible.
- Add `USER node` to run non-root.

---

## 4. Vercel (Next.js frontend)

1. **Add New → Project** → import the repo. **Root Directory** = repo root (the
   Next app lives at the root per architecture.md); the Next.js preset is
   auto-detected.
2. **Environment Variables**: `POSTGRAPHILE_URL` = the Railway domain + `/graphql`,
   set for Production (and Preview if you use preview DBs). Leave it **without**
   a `NEXT_PUBLIC_` prefix so it stays server-only.
3. Set the project's **Node version to 20** to match CI and the API image.
4. Git integration: push to `main` → Production, PRs → Preview, out of the box.

Ordering note: by default both Vercel and Railway redeploy on push, so a schema
change could briefly deploy before the migration lands (ISR revalidation heals
detail pages). If you want strict *migrate-then-deploy*, disable Vercel's
auto-build with an `ignoreCommand` in `vercel.json` and deploy from Actions
after the reseed job (see §6), and rely on Railway's "Wait for CI."

---

## 5. GitHub (secrets, variables, protections)

1. **Secrets** (Settings → Secrets and variables → Actions):
   `DATABASE_URL_MIGRATIONS` = Neon **direct** owner/migration string. (Add the
   platform tokens from §6 only if you automate deploys.)
2. **Branch protection** on `main`: require the `checks` and `validate-seed`
   status checks before merge, so nothing reaches the reseed/deploy path
   without passing.
3. `ci.yml` already handles the rest: it validates the seed on every PR/push and
   reseeds Neon on a push to `main` that touches `db/**` (or on manual dispatch,
   which can also apply the schema).

**First-run order:** Neon project + role (§2) → set `DATABASE_URL_MIGRATIONS` →
dispatch the workflow with `apply_schema = true` (applies schema, then reseeds)
→ connect Railway (§3) → connect Vercel (§4). After that, ordinary pushes keep
everything in sync.

---

## 6. Can Vercel / Railway / Neon be driven from GitHub workflows?

Yes — **deploying and syncing are fully automatable**; **first-time provisioning
is mostly code with a couple of dashboard-only gaps.** Summary, then the one
addition actually worth making here.

**Neon — strongest.** Official actions (`create-branch-action@v5`,
`delete-branch-action@v3`, plus reset and schema-diff) and a reusable workflow
create an isolated branch per PR and tear it down on close; the create action
outputs a `db_url` you feed straight into your migration/test step. Full project
/ branch / role provisioning is available via `neonctl` and the Neon Terraform
provider. Only manual bit: make an account and one API key (the GitHub
integration then auto-creates `NEON_API_KEY` / `NEON_PROJECT_ID`).

**Railway.** Deploy from Actions with the Railway CLI (`railway up`) or a
marketplace action using a `RAILWAY_TOKEN`; put build/deploy settings (start
command, healthcheck, restart policy, watch paths) in a committed
`railway.toml`. Gap: **Root Directory and the config-file path are settable only
via the dashboard or a raw GraphQL API mutation**, not `railway.toml`/CLI — so a
from-zero reproducible service needs one API call or dashboard click.

**Vercel.** Deploy from Actions with the CLI —
`vercel pull` → `vercel build [--prod]` → `vercel deploy --prebuilt [--prod]` —
using `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`; disable Vercel's
own auto-build (Ignored Build Step or `ignoreCommand` in `vercel.json`) so
Actions owns the trigger. Full project/env/domain provisioning is available via
the official Vercel Terraform provider. Gap: the first project link / token
creation is a one-time manual step.

### The one addition worth making for GDTRKB

A **Neon preview branch per PR** is the highest-value automation for this
project, because it turns `validate-seed` from a text check into a real load
test against a production-shaped Postgres — with zero risk to prod and automatic
teardown. This is now committed as `.github/workflows/db-preview.yml`; the shape:

```yaml
name: DB preview branch
on:
  pull_request:
    types: [opened, reopened, synchronize, closed]
jobs:
  reseed-branch:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: branch
        uses: neondatabase/create-branch-action@v5
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch_name: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
      # The branch is a copy-on-write clone of production, so it already has the
      # schema — reapply only the (idempotent) seed.
      - name: Reseed the branch
        env:
          DATABASE_URL: ${{ steps.branch.outputs.db_url }}
        run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/02_seed.sql
  delete-branch:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

Everything beyond this (full Railway/Vercel IaC via Terraform) is possible but
more than a small, mostly-static catalog needs; the one-time dashboard setup
above plus the push-based `ci.yml` is the proportionate choice.
