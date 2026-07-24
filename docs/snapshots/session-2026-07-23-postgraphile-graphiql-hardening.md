# Session log — PostGraphile GraphiQL hardening (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that produced the
> `ENABLE_GRAPHIQL` env-gate in `db/postgraphile/server.js` and the matching doc updates
> in the Dockerfile and `docs/ci-deploy-setup.md`. Kept for context on *why* GraphiQL is
> off by default and why the server-to-server-credential half of the originating finding
> was deliberately not implemented. User and assistant turns are reproduced verbatim.
> Tool-call investigation (reads, greps) is summarized narratively rather than pasted raw.

---

## 1. Code-review finding

**User (code-review finding, applied to `db/postgraphile/server.js:17-28`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest
> with a brief reason, keep changes minimal, and validate.
>
> In @db/postgraphile/server.js around lines 17 - 28, Protect the PostGraphile
> middleware created in the server setup from unauthenticated public requests by
> validating a server-to-server credential or enforcing the configured private
> networking/API gateway before forwarding requests. Apply the same protection to
> GraphiQL, or disable the graphiql option for public deployments, while preserving
> legitimate BFF access and the existing GraphQL behavior.

The harness had already attached a `Read` of `server.js` as context, showing
`graphiql: true, // TODO: flip to false before going public (Dockerfile note [4])` at
line 20.

---

## 2. Verifying the finding against current state

Before changing anything, checked whether the finding was still live or already
addressed:

- `docs/deployment.md` — confirms the architecture: browser never calls PostGraphile
  directly, only the Next.js BFF does, over a **public** Railway URL (Vercel and
  Railway are separate platforms, so true private networking isn't available between
  them). Hardening notes there scope endpoint protection to a `SELECT`-only DB role,
  `disableDefaultMutations`, and — only "for a truly public endpoint under untrusted
  load" — optional query-cost/pagination limits, explicitly marked "not needed for a
  private or low-traffic catalog."
- `db/postgraphile/Dockerfile` note `[4]` and its "Production hardening notes" footer
  both flag the same open TODO: "Before going public: set `graphiql: false` in
  `server.js`."
- `docs/ci-deploy-setup.md` §3 repeats the identical TODO under "Dockerfile hardening
  the file itself flags as TODO before going public."
- `docs/railway_deploy_logs1784811125746.log` — an actual production boot log from
  today, showing PostGraphile already live on Railway with
  `GraphiQL GUI/IDE: http://0.0.0.0:8080/graphiql` printed at startup and real search
  queries flowing through it. This confirmed the TODO had **not** been done before
  the service went live — the finding was real and current, not stale.
- `.env.example` confirmed the only frontend-side GraphQL env var is
  `POSTGRAPHILE_URL` (the public Railway URL) — no existing credential-passing
  convention to extend.

Conclusion: the finding was valid for the GraphiQL half. The
credential/private-networking half was judged out of scope for this pass — the catalog
is intentionally public read-only data (per `app-spec` §0), mutations are already
blocked two independent ways (`disableDefaultMutations` + `SELECT`-only Neon role), and
none of the project's own deployment docs call for request authentication — only for
GraphiQL being off and, optionally at higher traffic, query-cost limits.

---

## 3. The fix

Edited `db/postgraphile/server.js` to make GraphiQL opt-in instead of opt-out, so a
forgotten manual flip can no longer ship it to production:

```js
const port = process.env.PORT || 5000;

// Safe by default: GraphiQL stays off unless explicitly opted into (local/dev
// testing). Requires ENABLE_GRAPHIQL=true rather than defaulting on, since the
// prior default-on behavior shipped to the public Railway deployment
// unflipped (Dockerfile note [4]).
const enableGraphiql = process.env.ENABLE_GRAPHIQL === "true";

const middleware = postgraphile(process.env.DATABASE_URL, "public", {
  appendPlugins: [ConnectionFilterPlugin, SimplifyInflectorPlugin],
  disableDefaultMutations: true,
  graphiql: enableGraphiql,
  graphileBuildOptions: {
    connectionFilterRelations: true,
  },
  retryOnInitFail: true,
});
```

**Assistant, mid-edit:**

> That hint is pre-existing and unrelated (CommonJS module, not an issue). Now
> updating the Dockerfile and deploy docs that reference the old manual-flip TODO so
> they stay accurate.

Updated `db/postgraphile/Dockerfile` note `[4]`:

```diff
-#   [4] GraphiQL      — enabled by default in server.js (handy while testing).
-#                      For a public production endpoint, flip `graphiql: false`
-#                      in server.js.
+#   [4] GraphiQL      — off by default (server.js). Set env var
+#                      ENABLE_GRAPHIQL=true to turn it on for local/dev testing;
+#                      leave unset in Railway → Variables for production.
```

and its "Production hardening notes" footer:

```diff
-#  • Before going public: set `graphiql: false` in server.js (see note [4]).
+#  • GraphiQL: DONE — off unless ENABLE_GRAPHIQL=true is set (see note [4]).
```

**Assistant:**

> Now the matching section in the deploy runbook:

Updated `docs/ci-deploy-setup.md` §3 to match:

```diff
 Dockerfile hardening the file itself flags as TODO before going public:
-- Set `graphiql: false` in `server.js` (GraphiQL is on by default). A cold
-  DB at boot crash-looping (the CLI's `--retry-on-init-fail`) has no library-mode
-  equivalent yet — would need manual retry logic in `server.js` if wanted.
+- GraphiQL: DONE — `server.js` defaults it off; it only turns on if
+  `ENABLE_GRAPHIQL=true` is set (e.g. for local/dev testing). Leave that
+  variable unset in Railway.
 - Add `USER node` to run non-root.
```

(The removed sentence about `--retry-on-init-fail` having "no library-mode equivalent
yet" was already stale on its own — `server.js` had `retryOnInitFail: true` set since
before this session — so it was corrected in passing rather than left inaccurate.)

Re-read `docs/ci-deploy-setup.md` §3's Railway setup steps to check whether
`ENABLE_GRAPHIQL` needed adding to the documented Railway Variables list; concluded no
— the whole point of the new default is that production needs no variable set at all,
so nothing to add there.

---

## 4. Validation

Re-read the final `server.js` to confirm the edit was correct, then ran a syntax check
since the file has no build step of its own:

```
$ node --check server.js
OK
```

**Assistant (final response for this finding):**

> ## Summary
>
> **Fixed:** GraphiQL was live on the public Railway deployment (confirmed via
> `docs/railway_deploy_logs...log` — `graphiql: true` had shipped unflipped, contrary
> to the file's own TODO). Changed `server.js` to default GraphiQL **off**, opt-in only
> via `ENABLE_GRAPHIQL=true` (for local/dev), so production is safe without relying on
> someone remembering to flip a hardcoded boolean. Updated the matching notes in
> `Dockerfile` and `docs/ci-deploy-setup.md` so they no longer describe the old
> manual-flip TODO.
>
> **Skipped:** the server-to-server credential / private-networking gate on the
> GraphQL endpoint itself. Reasoning:
> - The catalog is intentionally a public, read-only dataset (`app-spec` §0) — there's
>   no confidentiality boundary on the data itself.
> - Mutations are already blocked two ways: `disableDefaultMutations: true` plus a
>   `SELECT`-only Neon role, per `docs/ci-deploy-setup.md` and the Dockerfile's own
>   hardening notes.
> - The project's deployment docs explicitly scope endpoint hardening to disabling
>   GraphiQL, with query-cost/pagination limits called out as optional and "not needed
>   for a private or low-traffic catalog" (`docs/deployment.md:105`).
> - Vercel and Railway are separate platforms, so true private networking isn't
>   available; a shared-secret header would work but is a cross-platform architectural
>   addition (new env var on both Railway and Vercel, client changes in
>   `src/lib/graphql/client.ts`) that neither the code's own TODO nor the deployment
>   runbook calls for. Flagging it as worth a deliberate decision rather than folding
>   into this triage pass.
>
> **To test:** `ENABLE_GRAPHIQL=true node db/postgraphile/server.js` locally →
> GraphiQL at `/graphiql`. Without the var set (or `=false`), `/graphiql` should not
> render the IDE while `/graphql` continues serving queries normally. Before the next
> Railway deploy, confirm `ENABLE_GRAPHIQL` is *not* set in Railway → Variables.

---

## 5. Snapshot request

**User:** "Draft a snapshot of this conversation. Keep prompts and responses verbatim.
Store snapshot in the docs folder."

→ This document.

---

## Net code changes

- `db/postgraphile/server.js` — GraphiQL now gated behind `ENABLE_GRAPHIQL=true`
  (default off) instead of hardcoded `true`.
- `db/postgraphile/Dockerfile` — note `[4]` and the hardening-notes footer updated to
  describe the env-gate instead of the old manual-flip TODO.
- `docs/ci-deploy-setup.md` — §3's TODO list updated to match; the stale
  `retryOnInitFail` aside removed.

## Open decision, deliberately not made here

Whether to add a shared-secret / server-to-server credential between the Vercel BFF
and the public Railway PostGraphile URL, as an extra layer beyond "GraphiQL off +
mutations disabled + `SELECT`-only role." Not implemented in this session — flagged to
the user as a cross-platform architectural addition, not a drop-in fix, and out of
scope for a minimal-change triage pass.
