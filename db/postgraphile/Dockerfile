# ============================================================================
#  GDTRKB — PostGraphile API container
#  Repo path: db/postgraphile/Dockerfile
#  Target: Railway (always-on). The SAME image also runs locally, on Fly.io,
#  or on Render — nothing here is Railway-specific.
#
#  ── REPLACE demo values with production/deployment ones ────────────────────
#   [1] DATABASE_URL  — never hardcode; provided at runtime as an env var/secret.
#         demo/local : a local Postgres URL (e.g. postgres://postgres:postgres@host:5432/gdtrkb)
#         PRODUCTION : the Neon *pooled* connection string, connecting as a
#                      SELECT-only role (NOT the owner/superuser).
#                      Set it in Railway → Variables. Do not commit it.
#   [2] PORT          — Railway injects $PORT at runtime. The ENV below is only a
#                      local fallback; do not rely on a fixed port in production.
#   [3] Package pins  — dependencies are pinned by package.json + the committed
#                      package-lock.json and installed with `npm ci` (below), so
#                      the WHOLE tree is reproducible, not just the two top-level
#                      packages. Bump a version by editing package.json and
#                      regenerating the lockfile (`npm install`), then commit it.
#   [4] GraphiQL      — served by default (handy while testing). For a public
#                      production endpoint, add --disable-graphiql (see CMD note).
#   [5] Schema        — 'public' is assumed; change --schema if you use another.
#  ---------------------------------------------------------------------------
#  NODE VERSION: pinned to 22 (Active/Maintenance LTS) to match ci.yml's
#  setup-node and Vercel's project Node version. Node 20 reached end-of-life on
#  2026-04-30, so keep all three (CI, frontend, this image) on the same LTS.
#  ---------------------------------------------------------------------------
#  NOTE: CORS is intentionally NOT enabled. In this architecture the browser
#  never calls PostGraphile directly — the Next.js server (BFF) calls it
#  server-to-server — so no browser CORS is required. Keep it disabled.
# ============================================================================

FROM node:22-slim

WORKDIR /app

# [3] Reproducible install: the full dependency tree is locked by the committed
# package-lock.json. Copy manifests first so this layer stays cached until a
# dependency actually changes. `npm ci` fails fast if the lockfile is missing or
# out of sync with package.json — regenerate it with `npm install` and commit.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# [2] Local fallback only — Railway overrides PORT at runtime.
ENV PORT=5000
EXPOSE 5000

# DATABASE_URL and PORT are read from the environment at runtime (never baked in).
# [4] Production hardening: append  --disable-graphiql  to the flags below.
#     Resilience (optional): append  --retry-on-init-fail  so the container
#     survives the DB not being ready at the exact moment it boots.
CMD ["sh", "-c", "exec npx postgraphile \
  --connection \"$DATABASE_URL\" \
  --schema public \
  --host 0.0.0.0 \
  --port \"$PORT\" \
  --disable-default-mutations \
  --append-plugins postgraphile-plugin-connection-filter,@graphile-contrib/pg-simplify-inflector"]

# ── Production hardening notes (optional, recommended) ──────────────────────
#  • Run as non-root: add `USER node` (and ensure /app is readable by it).
#  • Reproducible installs: DONE — see the `npm ci` step above. Regenerate and
#    re-commit package-lock.json whenever you change a version in package.json.
#  • The SELECT-only DB role (in DATABASE_URL) is the primary write guard;
#    --disable-default-mutations is the second layer. Keep both.
