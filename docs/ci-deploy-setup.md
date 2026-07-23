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
3. **Create the `SELECT`-only role and its grants.** `01_schema.sql` is pure DDL
   and never creates the role or the grants deployment.md §7 calls for; those
   live in their own committed file, `db/00_grants.sql`. Run it (as the owner)
   after the schema, passing the role password as a psql variable so it never
   lands in the file:
   ```sql
   -- db/00_grants.sql (abridged); run with -v pass="$GDTRKB_RO_PASSWORD".
   -- Creates the role WITH its password only if it doesn't already exist —
   -- :'pass' must stay at top level; psql won't expand it inside a $$ ... $$ body.
   SELECT format('CREATE ROLE gdtrkb_ro LOGIN PASSWORD %L', :'pass')
   WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'gdtrkb_ro')
   \gexec
   GRANT USAGE ON SCHEMA public TO gdtrkb_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO gdtrkb_ro;
   -- so re-created tables keep working without re-granting by hand:
   ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
     GRANT SELECT ON TABLES TO gdtrkb_ro;
   ```
   The `ALTER DEFAULT PRIVILEGES` line matters because dropping/recreating the
   schema drops grants with it — this makes the `SELECT`-only role survive a
   future schema rebuild. The file is idempotent, but it sets the password
   **only on first creation**, so re-running it never rotates the password;
   rotate deliberately (see §5.1).

   > **Note:** because `gdtrkb_ro` is created via SQL rather than the Neon
   > console, Neon treats it as *unmanaged* — it won't appear in the console's
   > roles list or connection-string UI, and its password can't be reset from
   > the dashboard. Assemble its pooled string by hand (§3.3) and change its
   > password only via `ALTER ROLE` (§5.1).
4. First load: `psql "<direct-url>" -f db/01_schema.sql`, then the grants —
   `psql "<direct-url>" -v pass="$GDTRKB_RO_PASSWORD" -f db/00_grants.sql` — then
   `psql "<direct-url>" -f db/02_seed.sql`. (Or let CI do steps 3–4 once
   `DATABASE_URL_MIGRATIONS` and `GDTRKB_RO_PASSWORD` are set — see §5.)

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
3. **Variables**: `DATABASE_URL` = the Neon **pooled**, `SELECT`-only string —
   it must authenticate **as** the `gdtrkb_ro` role, i.e. carry that role as its
   *username* as well as the matching password. Since the role is created via
   SQL (`db/00_grants.sql`), not the Neon console, Neon won't generate a string
   for it: take the pooled (`-pooler`) host and substitute the `gdtrkb_ro`
   username and the `GDTRKB_RO_PASSWORD` value (§5.1). If either the username or
   password drifts from what `00_grants.sql` set, PostGraphile can't
   authenticate at runtime. Do **not** set `PORT` — Railway injects it and the
   Dockerfile binds `$PORT`.
4. **Networking → Generate Domain.** The resulting URL, with `/graphql`
   appended, is what Vercel's `POSTGRAPHILE_URL` points at (PostGraphile serves
   GraphQL at `/graphql` by default).
5. **Settings → enable "Wait for CI."** Railway then holds the deploy in a
   WAITING state until your GitHub Actions checks pass — so a red build never
   ships the API.

The container runs PostGraphile in library mode (`db/postgraphile/server.js`,
`node server.js`), not the CLI, so
`graphileBuildOptions.connectionFilterRelations` can be set (schema-spec §6.1)
without depending on `.postgraphilerc.js`, which PostGraphile's own docs mark
deprecated and slated for removal in v5. The CLI's own flags have no
equivalent for this option, and the search page's platform/area/language
facet filters depend on it.

Dockerfile hardening the file itself flags as TODO before going public:
- GraphiQL: DONE — `server.js` defaults it off; it only turns on if
  `ENABLE_GRAPHIQL=true` is set (e.g. for local/dev testing). Leave that
  variable unset in Railway.
- Non-root user: DONE — the Dockerfile runs as `USER node`.
- Startup crash-loop protection: DONE — `server.js` sets `retryOnInitFail: true`,
  so PostGraphile retries the schema build instead of crashing if Neon isn't
  reachable yet at container start (e.g. cold-starting behind Railway).

---

## 4. Vercel (Next.js frontend)

1. **Add New → Project** → import the repo. **Root Directory** = repo root (the
   Next app lives at the root per architecture.md); the Next.js preset is
   auto-detected.
2. **Environment Variables**: `POSTGRAPHILE_URL` = the Railway domain + `/graphql`,
   set for Production (and Preview if you use preview DBs). Leave it **without**
   a `NEXT_PUBLIC_` prefix so it stays server-only.
3. Set the project's **Node version to 22** to match CI and the API image.
4. Git integration: push to `main` → Production, PRs → Preview, out of the box.

Ordering note: by default both Vercel and Railway redeploy on push, so a schema
change could briefly deploy before the migration lands (ISR revalidation heals
detail pages). If you want strict *migrate-then-deploy*, disable Vercel's
auto-build with an `ignoreCommand` in `vercel.json` and deploy from Actions
after the reseed job (see §6), and rely on Railway's "Wait for CI."

---

## 5. GitHub (secrets, variables, protections)

1. **Secrets** (Settings → Secrets and variables → Actions):
   - `DATABASE_URL_MIGRATIONS` = Neon **direct** owner/migration string.
   - `GDTRKB_RO_PASSWORD` = password for the `SELECT`-only `gdtrkb_ro` role.
     Consumed by the grants step (`db/00_grants.sql`, run only on an
     `apply_schema` dispatch) and must equal the password embedded in Railway's
     pooled `DATABASE_URL` (§3.3). `00_grants.sql` sets it **only when the role
     is first created**, so rotate deliberately: update this secret and Railway's
     `DATABASE_URL`, then run a one-off `ALTER ROLE gdtrkb_ro PASSWORD '<new>'`
     against the direct connection.
   - (Add the platform tokens from §6 only if you automate deploys.)
2. **Branch protection**: put a ruleset on `main` — see §5.1 for the exact
   rules and which to enable.
3. `ci.yml` already handles the rest: it validates the seed on every PR/push and
   reseeds Neon on a push to `main` that touches `db/**` (or on manual dispatch,
   which can also apply the schema).

**First-run order:** Neon project + role (§2) → set `DATABASE_URL_MIGRATIONS`
and `GDTRKB_RO_PASSWORD` → dispatch the workflow with `apply_schema = true`
(applies schema, creates the role + grants, then reseeds)
→ connect Railway (§3) → connect Vercel (§4). After that, ordinary pushes keep
everything in sync.

### 5.1 Branch protection — a ruleset on `main`

Use a **repository ruleset** (Settings → Rules → Rulesets → New branch ruleset)
targeting `main`; rulesets are GitHub's current mechanism and stack more cleanly
than a classic branch-protection rule. They're available on Free for public
repos, and on Pro/Team/Enterprise for private ones. Below is the **full set of
rules a branch ruleset offers**, in GitHub's own order, with what to do with each
for GDTRKB.

| Ruleset rule | For GDTRKB |
|---|---|
| **Restrict creations** | Off — not relevant to a single long-lived `main`. |
| **Restrict updates** | Off — that's for locking a branch to bypassers only. |
| **Restrict deletions** | **On** (default) — keep `main` from being deleted. |
| **Require linear history** | Optional — on if you squash/rebase-merge; it blocks merge commits. |
| **Require merge queue** | Off — unnecessary solo/low-traffic, and it needs a `merge_group` workflow trigger. |
| **Require deployments to succeed before merging** | Optional — only worthwhile if you wire GitHub Environments for Vercel/Railway; usually more than this needs. |
| **Require signed commits** | Optional hardening; adds friction (unsigned commits can't be merged on GitHub). |
| **Require a pull request before merging** | **On** — the key rule: forces every change through a PR so CI runs before `main` (and before the reseed). Set **required approvals = 0** if you're solo (you can't approve your own PR); optionally enable **Require conversation resolution** and pick an allowed merge method (e.g. squash). |
| **Require status checks to pass before merging** | **On** — select `checks` and `validate-seed` (add `reseed-branch` from `db-preview.yml` once Neon is wired). **Do not** select `changes` or `reseed` — they don't run on PRs, and a conditionally-skipped job reports "success," so requiring it protects nothing. Tick **Require branches to be up to date** (strict) if you want checks re-run against the latest `main`. |
| **Block force pushes** | **On** (default). |
| **Require code scanning results** | Off unless you enable code scanning. |
| **Require workflows to pass before merging** | N/A here — an org/enterprise-level "ruleset workflows" feature, not a per-repo status check. |
| **Metadata restrictions** (commit-message / author-email / branch-name patterns) | N/A on Free/Pro — a GitHub Enterprise feature. |
| **Restrict file paths / path length / extensions / size** (push rules) | N/A on Free/Pro — Enterprise Cloud push rulesets. |

Two notes. Add yourself to the ruleset's **bypass list** if you work solo, so a
PR-required rule doesn't lock you out of your own repo. And the required status
checks appear in the picker only **after they've run against a PR at least once**,
so open one PR before configuring them.

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
