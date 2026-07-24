# Session log — Vercel preview build failure: Suspense boundary fix + Neon cold-start hardening (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that started from a failed
> Vercel preview deployment log (branch `dev`, commit `e26de97`) and ended with two shipped
> fixes: a missing `Suspense` boundary around `SearchPageClient` in `src/app/page.tsx` (the
> fatal error that actually aborted the build), and a scoped GraphQL timeout increase for
> build-time-only data calls plus a phase-detected timeout for `getToolBySlug`, hardening the
> build against Neon Postgres cold starts (confirmed via the Neon console's own autosuspend
> setting and monitoring log). In between, the conversation worked through cost-estimating a
> Neon Launch-plan upgrade and mapping the blast radius of the timeout change across every
> GraphQL call site before deciding what to extend and what to leave alone. User prompts and
> the assistant's substantive responses are reproduced verbatim (prompts lightly corrected for
> grammar/spelling per the snapshot request); tool-call activity (reads, greps, bash/curl
> runs, web research) is summarized narratively rather than pasted raw.

---

## 1. Initial request — analyzing the failed Vercel preview build

**User** (with a Vercel preview deployment log attached as a document):

> There are some issues with the latest commit that break the Vercel deployment. Attached as
> context is a deployment log for the preview environment. Analyze it, look into the current
> file versions and determine the possible cause.

The attached log showed two distinct problems during `next build`: `getAllToolSlugs` and
`getFacetOptions` both logging `GraphQL request timed out` during "Collecting page data," then
a fatal `⨯ useSearchParams() should be wrapped in a suspense boundary at page "/"` immediately
before `Error occurred prerendering page "/"` and `Export encountered an error on /page: /,
exiting the build.` (exit code 1).

Read `src/components/search/SearchPageClient.tsx` (a `"use client"` component calling
`useSearchParams()` at the top of the component) and `src/app/page.tsx` (rendering
`<SearchPageClient>` with no `Suspense` wrapper around it) — confirmed the fatal error matched
that shape exactly. Checked git history (`git log --oneline -5` and `git show e26de97 --stat`)
and confirmed the latest commit only touched `lib/graphql/*` refactors, not `page.tsx` or
`SearchPageClient.tsx` — the missing boundary was pre-existing, not a regression from that
commit. For the timeout errors, read `src/lib/graphql/client.ts` (`GRAPHQL_TIMEOUT_MS = 5000`)
and grepped `POSTGRAPHILE_URL` across the docs to confirm it's meant to point at a Railway
PostGraphile service's public URL.

**Assistant** (final analysis):

> ## Analysis
>
> Two independent problems in this log — one fatal, one not.
>
> **1. Fatal — missing Suspense boundary (this is what actually kills the build)**
>
> [SearchPageClient.tsx](src/components/search/SearchPageClient.tsx#L4) is a `"use client"`
> component that calls `useSearchParams()` directly. [page.tsx](src/app/page.tsx#L31) renders
> it with no `<Suspense>` wrapper around it:
>
> ```tsx
> <SearchPageClient areaTree={areaTree} platforms={facets.platforms} languages={facets.languages} />
> ```
>
> Next.js requires `useSearchParams()` to be wrapped in `<Suspense>` when the page can be
> statically rendered — without it, the prerender for `/` throws
> `missing-suspense-with-csr-bailout`, which is exactly the last error before the log's
> `Export encountered an error on /page: /, exiting the build.` → exit code 1.
>
> I checked git history: this has been the shape of the code since the search page was first
> generated (`6a7eb23`) and wasn't touched by the latest commit (`e26de97` only refactored
> `lib/graphql/*` files). So this isn't a regression from the latest commit — it's a
> pre-existing bug in the page structure that this particular build run finally surfaced
> (likely because earlier deploys never got past the timeout-heavy data collection step
> cleanly, or benefited from build cache masking it).
>
> **Fix:** wrap `<SearchPageClient>` in `<Suspense>` in `page.tsx`, with a lightweight fallback
> (e.g. reuse the `loading…` treatment already used inside `SearchPageClient`).
>
> **2. Non-fatal but degrading — GraphQL requests timing out during build**
>
> Both `getAllToolSlugs()` and `getFacetOptions()` hit the 5000ms timeout in
> [client.ts](src/lib/graphql/client.ts#L13) (`GRAPHQL_TIMEOUT_MS`). Both are designed to
> swallow this and fall back to empty data (per the comments in `facets.ts` and `tool.ts`), so
> they don't crash the build — but they mean the deployed preview would have **no static tool
> detail pages and empty search facets** even if issue #1 is fixed.
>
> The fact that both calls ran the full 5s before failing (not an instant error) means
> `POSTGRAPHILE_URL` is pointing at a real host that isn't responding — not an empty/invalid
> URL, which would fail immediately. Per `docs/ci-deploy-setup.md:124-126`, `POSTGRAPHILE_URL`
> is only guaranteed to be set for Production "and Preview if you use preview DBs" — so this is
> likely either:
> - the Railway PostGraphile service being asleep/down/crashed, or
> - `POSTGRAPHILE_URL` not being set (or pointing at the wrong host) for the Preview
>   environment scope in Vercel.
>
> This needs to be checked in the Vercel/Railway dashboards — not something fixable from code.
>
> ---
>
> **Recommendation:** fix #1 (add the `Suspense` boundary) since that's what's actually
> breaking the deploy, and separately verify the Railway backend + Vercel Preview env var for
> #2. Want me to apply the Suspense fix now?

---

## 2. Applying the Suspense fix; first look at the GraphQL timeout

**User:**

> Apply fix for #1 first. As for #2, the POSTGRAPHILE_URL variable is set for both production
> and preview environments. Also, the Railway service is still active. With these in mind,
> what can be the cause for issue #2?

Before editing, read `docs/snapshots/session-2026-07-23-searchparams-suspense-boundary-check.md`
— a prior session that had verified a code-review finding making the identical claim
("`SearchPageClient` needs a `Suspense` boundary") and concluded it did **not** apply, because
`page.tsx` at the time did `await searchParams` in its Server Component, which per the Next.js
docs opts the whole route into dynamic rendering — and the `Suspense` requirement only applies
to the "Prerendering" behavior branch, not "Dynamic Rendering." Re-checked the *current*
`page.tsx`: it no longer takes or awaits a `searchParams` prop at all (that responsibility
moved fully into `SearchPageClient`'s own `useSearchParams()` call at some point after that
snapshot was written), so the route is static again and the old conclusion no longer holds —
this is exactly the scenario the fatal error in the log matches.

Applied the fix: added `import { Suspense } from "react"` and wrapped `<SearchPageClient>` in
`<Suspense fallback={<p className="border border-line p-4 text-center text-dim">loading…</p>}>`
in `src/app/page.tsx`. Ran `npm run lint` (clean) and `npm run build` — build succeeded, with
the route table showing `/` as `○ (Static)` (previously it would bail out/error), confirming
the fix.

For #2, read `db/postgraphile/server.js` and `docs/deployment.md`, confirming the project pairs
Railway (an always-on API container, no cold starts by design) with **Neon** for Postgres —
and Neon's free/default tier autosuspends on idle. `server.js`'s own comment on
`retryOnInitFail: true` — "Retry schema build instead of crashing if the DB isn't reachable yet
on container start (e.g. Neon cold-starting behind Railway)" — only covers schema build at
container start, not a normal request arriving after Neon has since gone idle again.

**Assistant** (final response):

> Fix confirmed — production build now completes cleanly, and the route table shows `/` as
> `○ (Static)` (previously it would bailout/error). Static generation reached the real backend
> too (26 tool detail pages built), which is useful context for question #2.
>
> ## Why #2 can still happen with `POSTGRAPHILE_URL` set correctly and Railway "active"
>
> "Railway service active" only confirms the **PostGraphile Node process is up** — it says
> nothing about the **Postgres database behind it**. Per `docs/deployment.md` this project
> pairs Railway (always-on API container) with **Neon** for Postgres, and Neon's free/default
> tier **autosuspends on idle** and cold-starts its compute on the next query.
> `db/postgraphile/server.js:56-58` even calls this out explicitly:
>
> ```js
> // Retry schema build instead of crashing if the DB isn't reachable yet on
> // container start (e.g. Neon cold-starting behind Railway).
> retryOnInitFail: true,
> ```
>
> That comment only covers schema build *at container start*. It says nothing about what
> happens on a normal request arriving *after* Neon has since gone idle and suspended again —
> which is exactly the scenario here: a Vercel Preview build is triggered by a `git push`,
> likely the first traffic to hit the DB in a while. PostGraphile itself is up and would
> happily serve the request, but the underlying Postgres connection has to wait for Neon to
> wake its compute first — and that wake-up latency isn't bounded by anything in this app;
> it's whatever Neon takes.
>
> That lines up with the log's timing:
> - `getAllToolSlugs` times out at our 5000ms abort — this is likely the request that triggers
>   Neon's wake-up.
> - `getFacetOptions` times out **~5.1s later**, still failing — consistent with a Neon
>   cold-start that took somewhere around 8-10+ seconds total to fully resolve, not the
>   sub-second warm-query latency you'd see once it's awake (which is what my local build just
>   proved happens once the DB is warm — it generated all 26 tool pages well inside the
>   timeout).
>
> **Ranking causes:**
> 1. **Most likely: Neon autosuspend.** The API container being "active" is a red herring —
>    check the Neon dashboard for a suspend/resume event around the build timestamp
>    (08:59-09:00 in the log).
> 2. Less likely but worth a quick check: region mismatch adding latency (Vercel build ran in
>    `iad1`; if Railway/Neon are in a different region, TLS + query round-trip could compound
>    with a semi-cold state).
> 3. Least likely given "still active": Railway's own container going through a
>    redeploy/restart at that moment.
>
> **Mitigation options** (would want your input before picking one):
> - Disable/raise Neon's autosuspend delay for the branch backing Preview + Production, so
>   it's never cold when a deploy build hits it.
> - Add a cheap keep-alive ping (GH Actions cron or similar) to prevent Neon from suspending.
> - Bump `GRAPHQL_TIMEOUT_MS` specifically for build-time calls (`getAllToolSlugs`/
>   `getFacetOptions`) — cheaper fix but only masks the symptom and slows every cold build.
>
> Want me to check the Neon dashboard config or implement one of these, or would you rather
> confirm the cold-start theory first (e.g. by checking Neon's activity log for that time
> window)?

---

## 3. Confirming the cold-start theory — a rejected tool call and a live timing test

**User:**

> We can try confirming the cold-start theory first. If needed, check Neon dashboard config as
> well. Finally, in the Neon console, the branch of the database is set on production (with a
> preview/deployment one not being available) - can this also be a reason?

Called `ToolSearch` (for Neon/Railway tooling) and `Bash` (`where neonctl`/`where railway`) in
parallel — the `Bash` call was rejected by the user, with reason: "There are no Neon and
Railway tools installed locally." With no CLI/dashboard access available, pivoted to an
empirical HTTP-level test: confirmed `.env.local` had `POSTGRAPHILE_URL` set (without printing
its value), then ran a timed `curl` POST against the live endpoint (`{ __typename }` query),
piping the URL through a shell variable so it never appeared in the visible command or output.
Result:

```
HTTP 200 - total time: 1.914236s (connect: 0.125726s, TLS: 0.162212s, TTFB: 0.162392s)
```

Also checked for Railway config files (`railway*.{json,toml,yml,yaml}` glob — none found) and
grepped `docs/ci-deploy-setup.md` for any mention of per-branch/preview Railway environments
(none found) — confirming both Vercel Production and Preview point at the same single Railway
service, which connects to the same single Neon branch.

**Assistant** (final response):

> Baseline result: a warm request completes in **1.9s** total — well under the 5000ms timeout,
> and consistent across DNS/connect/TLS being fast (~0.16s) with the rest being normal query
> processing. So the endpoint itself isn't structurally slow; whatever added the extra seconds
> during the build was state-dependent, not a permanent property of the URL/service. That's
> consistent with (though doesn't yet prove) a cold-start.
>
> I don't have Neon or Railway CLI/dashboard access from here, so I can't pull their activity
> log directly. To actually confirm the cold-start theory, could you check two things in the
> Neon console (for the branch that Railway's `DATABASE_URL` points at — the "production"
> one):
>
> 1. **Settings → Compute → "Suspend compute after inactivity"** — what's it set to?
> 2. **Monitoring/Operations tab** — is there a compute "start"/"activate" event around
>    **08:59:49–09:00:17** on 2026-07-24 (matches both the Vercel log and your commit
>    timestamp, so likely your local time)? A cold-start event landing right in that window
>    would confirm it directly.
>
> Once I know the autosuspend delay, I can also do a live repro here: let the connection sit
> idle past that threshold, then re-run the same timed request and compare it against the 1.9s
> warm baseline above.
>
> **On your branch-topology question — no, that's not the cause.** Each Neon branch has its
> own independent compute endpoint with its own autosuspend timer; there's no "preview
> branches keep production warm" or vice versa relationship. Since there's no separate
> Railway/Vercel Preview wiring in `docs/ci-deploy-setup.md` or a `railway.json`/config file in
> `db/postgraphile/`, both your Vercel Production and Preview deployments' `POSTGRAPHILE_URL`
> point at the **same** Railway service, which points at the **same** single "production" Neon
> branch. That actually *pools* traffic onto one compute rather than splitting it — if
> anything, it's slightly less prone to idling than a dedicated preview branch would be, not
> more.
>
> The real driver is more likely: this project is pre-launch, so that branch only gets
> sporadic traffic (manual testing + CI builds) rather than steady real-user load, so it
> suspends between deploys regardless of what it's named. Adding a dedicated preview branch
> wouldn't fix this — it'd just create a *second* branch that's touched even less often, so
> preview builds would cold-start *more* reliably, not less.

---

## 4. Cold start confirmed

**User:**

> Based on what I gathered from the Neon console, here are the answers for the 2 queries:
> 1. It is set to autosuspend compute after 5 minutes (scale to zero, default setting).
> 2. Based on the Monitor tab metrics, it appears that indeed, during that interval, a start
>    event has taken place (the metrics don't chart the times precisely, last inactive record
>    is 8:59:39 and first active one is 9:00:39, but the interval given by you would be
>    included in the gap between the mentioned values)

**Assistant** (final response):

> Confirmed. The monitoring gap (`8:59:39` inactive → `9:00:39` active) fully brackets the
> build's failure window (`08:59:49`–`09:00:17`), meaning Neon was mid-wake-up for the entire
> "Collecting page data" phase — both `getAllToolSlugs` and `getFacetOptions` were racing a
> cold Postgres compute against a 5000ms client-side abort, and lost. Root cause confirmed:
> **Neon's 5-minute default autosuspend + this being a low-traffic/pre-launch branch means any
> build that lands after ~5 idle minutes hits a cold DB.**
>
> Worth noting: this cold path doesn't fail the build (by design — both calls fall back to
> empty on error), it silently **degrades** it — the deployed site would have gone out with
> empty search facets and zero statically pre-generated `/tools/[slug]` pages, with no loud
> signal that happened. That's arguably worse than the build error we just fixed, since it'd
> ship quietly.
>
> A few ways to address this — not mutually exclusive:
>
> 1. **Neon console (your side, I can't do this):** raise the autosuspend delay on the
>    production branch, or disable it if your plan tier allows always-on compute. Most direct
>    fix, reduces how often a build lands cold at all.
> 2. **Code-level safety net:** give the build-time-only calls (`getAllToolSlugs`,
>    `getFacetOptions`) a longer timeout than the request-time default (build time budget is
>    much cheaper than a live user request's), so a cold start has more room to finish instead
>    of racing a 5s clock. I can implement this.
> 3. **Make the degradation loud instead of silent:** if `getAllToolSlugs`/`getFacetOptions`
>    fall back to empty, fail the build (or at least warn loudly) instead of quietly shipping —
>    so a cold-start-degraded deploy can't go unnoticed. This is more invasive and worth
>    thinking through before I touch it.
>
> Which of these do you want me to act on — just the timeout bump (#2), or #2 plus making the
> fallback failure loud (#3), while you handle #1 on the Neon side?

---

## 5. Researching Neon Launch pricing and the timeout's blast radius

**User:**

> Regarding #1, the current plan (Free) does not provide this option. I could make an upgrade
> to Launch, but I would need some cost estimate statistics first, based on the current
> configuration. For #2, how would bumping the timeout affect already existing flows/
> guardrails? Finally, ignore #3 (DO NOT IMPLEMENT).

Mapped every caller of `fetchGraphql`/`withTimeout`/`GRAPHQL_TIMEOUT_MS` via `Grep`, then read
`popularity.ts`, `toolCount.ts`, `layout.tsx`, `searchTools.ts`, and
`app/api/tools/search/route.ts` to classify each call site by *when* it actually runs
(build-time-only vs. live-request vs. mixed), and read `db/postgraphile/guardrails.js` in full
to characterize the server-side query guardrails (depth limit, page-size cap, field-count cap,
fragment-spread cap) as a separate, unrelated mechanism from the client's timeout.

For the cost estimate, loaded the `WebSearch`/`WebFetch` tools via `ToolSearch` (confirmed back
by the harness with "Tool loaded."). An initial `WebSearch` for Neon Launch pricing returned
numbers sourced from third-party aggregator/blog sites, which were flagged to the user as
unverified before being used. Fetched Neon's own pricing page directly instead
(`neon.tech/pricing` → redirected to `neon.com/pricing`) and Neon's plans documentation
(`neon.com/docs/introduction/plans`) to get authoritative figures.

**Assistant** (final response):

> ## #1 — Neon Launch plan cost estimate
>
> Verified directly against Neon's own pricing/docs pages (not the SEO aggregator blogs a
> plain search surfaces):
>
> - **Compute:** $0.106/CU-hour (1 CU ≈ 1 vCPU + 4 GB RAM), no bundled hours on Launch — pure
>   usage-based, no monthly minimum.
> - **Storage:** $0.35/GB-month, no included allowance.
> - **Autosuspend:** Free plan is fixed at 5 min, no override. Launch lets you either **raise
>   the delay** or **disable it entirely** (always-on).
> - **Egress:** 500 GB/project included free, then $0.10/GB — irrelevant at your current
>   traffic (pre-launch).
> - Free tier currently gives 100 CU-hours/project/month included, for context on what you're
>   about to leave behind.
>
> **Always-on compute cost = CU size × $0.106 × ~730 hrs/month.** A few reference points:
>
> | Compute size | Always-on compute/month |
> |---|---|
> | 0.25 CU | ≈ $19.35 |
> | 0.5 CU | ≈ $38.69 |
> | 1 CU | ≈ $77.38 |
>
> Plus storage at $0.35/GB-month on top.
>
> To turn this into a real number for *your* project, I need two figures from the Neon console
> (Branches → your branch → Compute; and the project's Storage/Usage panel):
> 1. **Current compute size** (fixed CU, or an autoscaling min–max range)
> 2. **Current storage used (GB)**
>
> You also don't have to go straight to fully disabling autosuspend — Launch lets you just
> **raise the delay** (e.g. to 30–60 min) instead of going always-on, which is far cheaper
> since you're billed only for active time, at the cost of not fully eliminating cold starts on
> deploys that land after a longer gap (e.g. overnight). Always-on is the only option that
> guarantees zero cold starts, but it's the most expensive.
>
> Sources: [Neon Pricing](https://neon.com/pricing), [Neon Plans docs](https://neon.com/docs/introduction/plans)
>
> ## #2 — Impact of bumping `GRAPHQL_TIMEOUT_MS`
>
> I mapped every caller of `fetchGraphql`/`withTimeout` and split them by when they actually
> run:
>
> **Build-time only — zero live-user exposure, safe to extend freely:**
> - `getFacetOptions` / `getPopularityChartData` — only called from `app/page.tsx`, which
>   builds as `○ Static`.
> - `getAllToolSlugs` — only called from `generateStaticParams()` in `tools/[slug]/page.tsx`.
>
> **Live, request-time, real user waiting — extending this hurts worst-case UX:**
> - `searchTools()` (+ nested `getAreaOfUseDescendantSlugs`) — the **only** caller is
>   `app/api/tools/search/route.ts`, the one route marked `ƒ Dynamic`. `SearchPageClient`
>   awaits this synchronously on every filter/sort/page change. A longer timeout here means
>   that during a *genuine* outage (not just a cold start), a real visitor sees "loading…" for
>   longer before the existing "Search is temporarily unavailable" fallback kicks in.
>
> **Mixed — the judgment call:**
> - `getToolBySlug` — used both for build-time SSG (safe to extend) *and* live on-demand
>   rendering of a slug that wasn't pre-generated, plus ISR background revalidation after
>   `revalidate = 3600` (a real visitor, extending affects them too). Unlike the others it has
>   **no try/catch fallback** — a timeout here throws straight to `app/error.tsx`.
> - `getToolCount` (Topbar) — technically baked into every static/SSG page at build time same
>   as the others, but would also re-run live during an ISR revalidation.
>
> **Guardrails — completely unaffected either way.** `db/postgraphile/guardrails.js` (depth
> limit, page-size cap, field-count cap, fragment-spread cap) runs server-side on Railway as
> GraphQL validation rules against the request's AST/variables. It has no relationship to
> `GRAPHQL_TIMEOUT_MS` at all — that constant only governs how long the Next.js server is
> willing to wait for a response; it doesn't change what PostGraphile accepts or rejects.
>
> **Bottom line:** a blanket bump to the shared `GRAPHQL_TIMEOUT_MS` constant would quietly
> extend how long a real visitor's search request (and possibly an uncached tool-detail-page
> hit) hangs during any future genuine outage — not just cold starts. The safer version is to
> give only the three unambiguous build-time-only calls (`getFacetOptions`,
> `getPopularityChartData`, `getAllToolSlugs`) a longer timeout via an optional override on
> `fetchGraphql`, leaving the default untouched for `searchTools` and deciding `getToolBySlug`
> separately (leave at 5s and accept it can hit the error page on a cold on-demand render, or
> extend it and accept a slower worst-case for that one live path).
>
> Want me to implement the scoped version (build-time-only calls get a longer timeout, live
> search stays at 5s, `getToolBySlug` left as-is), once you've had a chance to think about
> `getToolBySlug`?

---

## 6. Cost estimate with real numbers; `getToolCount` already has a fallback

**User:**

> For #1, here are the requested values:
> * Autoscaling is on, so CU range is 0.25 - 2.
> * Current storage used is 0.03 GB.
> For #2, wouldn't a try/catch fallback added for getToolCount help the extension process? And
> what about getToolCount, since you no longer mentioned it in the Bottom line.

**Assistant** (final response):

> ## #1 — Cost estimate with your actual numbers
>
> With autoscaling 0.25–2 CU and negligible storage:
>
> - **Storage:** 0.03 GB × $0.35/GB-month ≈ **$0.01/month** — a rounding error, ignore it.
> - **Compute, always-on:** Neon's autoscaler settles to the **floor** of the configured range
>   when there's no active load, and only spikes toward the ceiling during real query bursts.
>   For a pre-launch project with sparse traffic (occasional testing + deploy builds), it'll
>   sit near 0.25 CU almost all the time:
>   - **Floor (realistic case):** 0.25 × $0.106 × ~730 hrs ≈ **$19.35/month**
>   - **Ceiling (theoretical, pinned at 2 CU 24/7 — essentially never happens in practice):** 2
>     × $0.106 × ~730 ≈ $154.76/month
>
> So realistically you're looking at **~$19–25/month** for always-on at your current usage
> profile, not the ceiling number. Given how cheap the floor is here, going fully always-on
> (rather than just raising the autosuspend delay) is a pretty reasonable choice in absolute
> terms — the delay-instead-of-disable option I mentioned earlier is more valuable when the
> floor cost is painful, and at ~$19/month it isn't.
>
> ## #2 — `getToolCount`
>
> Good catch — it already has one. From [toolCount.ts:13-20](src/lib/graphql/toolCount.ts#L13-L20):
>
> ```ts
> export const getToolCount = cache(async (): Promise<number | null> => {
>   try {
>     const result = await fetchGraphql<ToolTotalCountWire>(TOOL_TOTAL_COUNT_QUERY);
>     return result.tools.totalCount;
>   } catch {
>     return null;
>   }
> });
> ```
>
> Nothing to add there. I left it out of the bottom-line bucket for a different reason: it
> isn't crash-risk, it's a **latency-coupling** issue specific to `/tools/[slug]`.
>
> `Topbar` (which calls `getToolCount`) renders via `layout.tsx` on every route, including
> `/tools/[slug]`. On that route's one live-blocking path — a first hit on a slug that wasn't
> in `generateStaticParams`'s list — `Topbar` and the page body (`getToolBySlug`) are sibling
> async Server Components under the same layout, with no `Suspense` boundary between them.
> Next.js won't flush the response until *all* of them resolve. So:
>
> - If `getToolBySlug` fails first (still capped at 5s), the error boundary takes over
>   immediately — `getToolCount`'s longer timeout never matters, no added cost.
> - But if `getToolBySlug` *succeeds* quickly while `getToolCount` is still waiting out its
>   longer timeout, the whole page's response time gets dragged out to match `getToolCount`'s
>   timeout, even though the actual content was ready seconds earlier.
>
> That's the real tradeoff: not "will it break" (it won't — the fallback already covers that),
> but "will a successful page load get slower on that one route because of a component whose
> only job is showing a number in the header."
>
> Given the fallback makes failure cheap and the cost is just a few extra seconds of latency on
> an already-rare path (cold DB + first hit on an ungenerated slug), I'd lean toward including
> it in the extended-timeout bucket alongside the three build-time-only calls — it's a
> reasonable inclusion, I just wanted to name the actual mechanism rather than wave it through.
> Updated bottom line: **`getFacetOptions`, `getPopularityChartData`, `getAllToolSlugs`, and
> `getToolCount`** get the longer timeout; `searchTools` (live search) stays at 5s;
> `getToolBySlug` remains the one open judgment call.
>
> Want me to implement that now?

---

## 7. Why `getToolBySlug` can't use the same fallback pattern

**User:**

> For #2 — Impact of bumping GRAPHQL_TIMEOUT_MS, can a try/catch fallback for getToolBySlug
> help the extension process?

Per CLAUDE.md's standing rule to check the bundled Next.js docs before making claims, grepped
and read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
02-route-segment-config/dynamicParams.md` and `generate-static-params.md`, then
`incremental-static-regeneration.md` specifically for how Next.js handles an error thrown
during ISR background revalidation. Re-read `tool.ts`'s existing comment on `getToolBySlug`
confirming the throw/`null` split is intentional design, not an oversight.

**Assistant** (final response):

> No — not in the same shape as the other four. The important difference: for
> `getFacetOptions`/`getPopularityChartData`/`getAllToolSlugs`/`getToolCount`, "empty" is a
> legitimate, safe rendering state. For `getToolBySlug`, `null` is **already a meaningful,
> distinct signal** — the code's own comment at
> [tool.ts:112-117](src/lib/graphql/tool.ts#L112-L117) is explicit about this:
>
> > "A `null` return means the query succeeded but the slug doesn't exist, so the caller can
> > call `notFound()` instead of showing an error."
>
> If a bare try/catch swallowed a timeout and returned `null`, a cold-start failure would
> become **indistinguishable from a real 404** — the page would falsely tell a visitor (and
> search crawlers, and the ISR cache for the next `revalidate` window) that a tool doesn't
> exist, when it actually does and the API was just slow. That's worse than today's behavior,
> not safer: today's throw-to-`error.tsx` at least signals "something went wrong," rather than
> asserting a falsehood.
>
> That said, your question surfaced a real distinction worth naming — `getToolBySlug` actually
> runs in three different contexts, and they don't all carry the same risk:
>
> 1. **ISR background revalidation** (a `/tools/[slug]` page past its `revalidate = 3600`
>    window) — already safe, no change needed. Per
>    `node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration.md:463`:
>    *"If an error is thrown while attempting to revalidate data, the last successfully
>    generated data will continue to be served from the cache. On the next subsequent request,
>    Next.js will retry."* A cold DB here just means Next quietly keeps serving the stale page
>    and retries later — no visitor ever sees an error.
> 2. **Live on-demand render of a slug not in `generateStaticParams`'s list** (first visitor
>    hit) — today's throw is correct and intentional, matches the code's documented design.
>    Extending the timeout just delays how long before `error.tsx` shows; doesn't change
>    correctness.
> 3. **Initial build-time SSG generation of a *listed* slug** (the `next build` "Generating
>    static pages" loop) — this is the one actually worth worrying about, and it's the same
>    failure class as the Suspense bug we just fixed: a throw here isn't isolated to that one
>    tool's page, it aborts the **entire build**, exit code 1. Concretely: if `getAllToolSlugs`
>    succeeds (DB is reachable enough to list slugs) but the compute is still warming up and
>    one specific tool's data fetch times out during the generation loop, that single tool
>    takes down the whole deployment.
>
> So the fix that would actually help isn't "wrap `getToolBySlug` in try/catch" (that corrupts
> the 404 distinction everywhere, including the two contexts where it's already fine) — it's
> narrower: harden specifically the build-time generation loop so one slug's transient failure
> doesn't abort the whole build, while leaving the live on-demand path throwing to `error.tsx`
> exactly as it does today. That's a distinct, more involved change from the mechanical timeout
> bump on the other four calls (it touches the page/`generateMetadata` error handling, not just
> `client.ts`), and it's debatable whether it's in scope for what you're trying to close out
> right now versus a separate follow-up.
>
> Want me to (a) go ahead with just the four-call timeout bump as previously scoped, leaving
> `getToolBySlug` untouched for now, or (b) also design the build-time-loop hardening for
> `getToolBySlug` as part of this pass?

---

## 8. Implementation — timeout bump + phase-scoped hardening for `getToolBySlug`

**User:**

> In light of all this, go with option (b) - the four-call timeout bump, as previously scoped,
> and the design for the build-time-loop hardening for getToolBySlug.

Researched how to reliably detect "we're inside `next build`'s static-generation loop" from
within a Server Component. Grepped `node_modules/next/dist/build/index.js` and confirmed
`process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD` is set on the parent build process
**before** it spawns the static-page-generation worker pool (`createStaticWorker`) — meaning
the workers doing the actual per-page rendering (the "Generating static pages using N workers"
step in the log) inherit it too, not just the earlier "Collecting page data" step. Confirmed
`PHASE_PRODUCTION_BUILD` is publicly exported from `next/constants` (which just re-exports
`next/dist/shared/lib/constants`), so it's a stable, documented-elsewhere constant rather than
a reach into an internal path. Also re-read `app/error.tsx`, which already anticipates this
exact scenario in its copy: *"Something went wrong loading this data. The API may be
cold-starting."*

Implemented:

- **`src/lib/graphql/client.ts`** — added `BUILD_GRAPHQL_TIMEOUT_MS = 25000` (25s, chosen as a
  generous-but-bounded budget: build time is cheap compared to a live request, and comfortably
  more than the Neon cold-start latencies typically seen, though the monitoring log's 1-minute
  sample granularity meant the exact real duration couldn't be pinned down more precisely).
  Gave `withTimeout` and `fetchGraphql` an optional `timeoutMs` parameter (defaulting to the
  existing `GRAPHQL_TIMEOUT_MS`), so call sites can opt into the longer budget explicitly.
- **`facets.ts`, `popularity.ts`, `toolCount.ts`** — `getFacetOptions`, `getPopularityChartData`,
  and `getToolCount` now pass `BUILD_GRAPHQL_TIMEOUT_MS` explicitly. `toolCount.ts` got a
  comment explaining why the longer timeout is safe there unconditionally (it already fails
  safe to `null`, unlike `getToolBySlug`).
- **`tool.ts`** — `getAllToolSlugs` now passes `BUILD_GRAPHQL_TIMEOUT_MS` unconditionally (it
  only ever runs at build time). `getToolBySlug` computes
  `process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ? BUILD_GRAPHQL_TIMEOUT_MS :
  GRAPHQL_TIMEOUT_MS` and passes that through — extending the budget only during the build's
  static-generation loop, while live on-demand renders and ISR background revalidations keep
  the tight 5s default. Added a comment documenting the reasoning (including the
  `build/index.js` source finding) and explicitly noting the throw/`null` contract is
  unchanged in every context.

`searchTools.ts` and `areas.ts` (the live search path) were deliberately left untouched,
keeping the default `GRAPHQL_TIMEOUT_MS`.

The edits landed through `client.ts`, `facets.ts`, `popularity.ts`, `toolCount.ts`, and the
import line + `getToolBySlug` body of `tool.ts` before the conversation was interrupted —
`getAllToolSlugs` in `tool.ts` had not yet been updated to use the new constant when the
session cut off mid-batch.

---

## 9. Interruption and resume

**User** (with a `PostToolUse:Edit` hook surfacing stale IDE diagnostics — `'PHASE_PRODUCTION_BUILD' is declared but its value is never read`, `'BUILD_GRAPHQL_TIMEOUT_MS' is declared but its value is never read`, `'GRAPHQL_TIMEOUT_MS' is declared but its value is never read`, all against `tool.ts` — as additional context):

> Continue from where you left off.

**Assistant:**

> No response requested.

**User:**

> Continue where you left off last.

Re-read `tool.ts` in full to confirm the exact current state (import line, `getToolBySlug`
body already updated, `getAllToolSlugs` still on the old single-argument `fetchGraphql` call —
the diagnostics from the interruption were stale, just a transient snapshot from between the
two edits, not a real problem). Applied the remaining edit to `getAllToolSlugs`, then ran
`npm run lint`, `npm run typecheck`, and `npm run build` — all clean, 31/31 pages generated,
same route table as before (`/` static, `/tools/[slug]` SSG, `/api/tools/search` dynamic).

**Assistant** (final response):

> All five call sites are updated. Now verifying with lint, typecheck, and a production build
> (the only reliable way to surface this specific error, per the prior session's own finding):
>
> Both parts of the fix are in:
>
> **Timeout bump (four calls):** `getFacetOptions`, `getPopularityChartData`,
> `getAllToolSlugs`, and `getToolCount` now pass `BUILD_GRAPHQL_TIMEOUT_MS` (25s) via a new
> optional third param on `fetchGraphql`/`withTimeout` in
> [client.ts](src/lib/graphql/client.ts). `searchTools`/`getAreaOfUseDescendantSlugs` (the live
> search path) are untouched and still use the 5s default.
>
> **`getToolBySlug` build-time hardening:**
> [tool.ts](src/lib/graphql/tool.ts#L130-L139) now checks
> `process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD` (confirmed against Next's actual build
> source, `build/index.js:1131`, that this is set before the static-generation worker pool
> spawns, so it's reliable there too) and only uses the 25s budget during `next build`. Live
> on-demand renders and ISR background revalidations keep the 5s default — the throw/`null`
> contract is completely unchanged in every context, so the 404-vs-error distinction is
> preserved.
>
> **To test:** `npm run build` reaches the real backend and generates all 31 pages as shown
> above. To actually exercise the cold-start path, you'd need to let Neon autosuspend (5 min
> idle) and then run a build — the build-time calls should now tolerate the wake-up instead of
> falling back to empty/failing.

---

## 10. Final verification pass

**User:**

> As the implementation of the request was interrupted mid-process, perform a final check to
> ensure all agreed-upon changes have been implemented.

Ran `git status --porcelain` and `git diff --stat` — confirmed exactly the six expected files
modified (`src/app/page.tsx`, `src/lib/graphql/client.ts`, `src/lib/graphql/facets.ts`,
`src/lib/graphql/popularity.ts`, `src/lib/graphql/tool.ts`, `src/lib/graphql/toolCount.ts`),
nothing extra. Reviewed the full `git diff` for every one of those files line by line against
what had been agreed, and separately ran `git diff --stat` on `searchTools.ts`/`areas.ts` to
confirm they were still untouched (empty output, exit code 0). Re-ran `npm run lint`,
`npm run typecheck`, and `npm run build` fresh — all clean, same 31/31 pages and route table as
before.

**Assistant** (final response):

> All confirmed. Final checklist against everything agreed in this conversation:
>
> | Change | File | Status |
> |---|---|---|
> | `Suspense` boundary around `SearchPageClient` (fixes the fatal build error) |
> `src/app/page.tsx` | ✅ |
> | `BUILD_GRAPHQL_TIMEOUT_MS` (25s) constant + optional `timeoutMs` param on
> `withTimeout`/`fetchGraphql` | `src/lib/graphql/client.ts` | ✅ |
> | `getFacetOptions` uses build timeout | `src/lib/graphql/facets.ts` | ✅ |
> | `getPopularityChartData` uses build timeout | `src/lib/graphql/popularity.ts` | ✅ |
> | `getToolCount` uses build timeout (safe — already fails to `null`) |
> `src/lib/graphql/toolCount.ts` | ✅ |
> | `getAllToolSlugs` uses build timeout | `src/lib/graphql/tool.ts` | ✅ |
> | `getToolBySlug` uses build timeout **only** when `NEXT_PHASE === PHASE_PRODUCTION_BUILD`;
> live/ISR paths keep the 5s default and the throw/`null` contract is untouched |
> `src/lib/graphql/tool.ts` | ✅ |
> | `searchTools` / `getAreaOfUseDescendantSlugs` (live search path) left at the 5s default |
> `src/lib/search/searchTools.ts`, `src/lib/areas.ts` | ✅ untouched, confirmed via empty diff |
>
> `git status` shows exactly the 6 files expected as modified, nothing extra. Re-ran
> `npm run lint`, `npm run typecheck`, and `npm run build` from scratch just now — all clean,
> `/` still static, `/tools/[slug]` still SSG (31/31 pages generated), `/api/tools/search`
> still the one dynamic route. Nothing was lost in the interruption; the implementation is
> complete and verified.

---

## 11. Snapshot request

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses verbatim
(for prompts, correct any grammar or syntax mistakes present). Preserve the detailed and
explicative responses, and any generated schema or tables exactly. Follow writing conventions
of already existing snapshots inside docs/snapshots. Save the draft in said directory when
finished. If something is unclear, clarify before taking action."

→ This document.

---

## Net code changes

- `src/app/page.tsx` — wrapped `<SearchPageClient>` in `<Suspense fallback={...loading…}>`,
  fixing the fatal `missing-suspense-with-csr-bailout` build error.
- `src/lib/graphql/client.ts` — added `BUILD_GRAPHQL_TIMEOUT_MS = 25000`; `withTimeout` and
  `fetchGraphql` now accept an optional `timeoutMs` override (defaulting to the existing
  `GRAPHQL_TIMEOUT_MS = 5000`).
- `src/lib/graphql/facets.ts` (`getFacetOptions`), `src/lib/graphql/popularity.ts`
  (`getPopularityChartData`), `src/lib/graphql/toolCount.ts` (`getToolCount`), and
  `src/lib/graphql/tool.ts` (`getAllToolSlugs`) — all four now pass `BUILD_GRAPHQL_TIMEOUT_MS`
  explicitly; all four only ever run at build time (or, for `getToolCount`, fail safe to
  `null` even on the one route where it can run live).
- `src/lib/graphql/tool.ts` (`getToolBySlug`) — now computes its timeout as
  `BUILD_GRAPHQL_TIMEOUT_MS` when `process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD` (imported
  from `next/constants`), else the default `GRAPHQL_TIMEOUT_MS`. The throw-on-failure /
  `null`-means-404 contract is unchanged in every context.
- `src/lib/search/searchTools.ts` and `src/lib/areas.ts` (the live search path) — deliberately
  left unchanged, still bounded to the 5s default.

## Lessons worth keeping

1. **A prior "verified, not applicable" finding can go stale as the surrounding code changes.**
   `docs/snapshots/session-2026-07-23-searchparams-suspense-boundary-check.md` correctly ruled
   out a `Suspense`-boundary requirement because `page.tsx` awaited `searchParams` at the time,
   opting the route into dynamic rendering. Once that `await searchParams` was later removed
   (search state moved fully into the client component), the route went back to static and the
   old conclusion silently stopped holding — the fatal error in this session's deployment log
   is exactly the case that snapshot had ruled out. A conclusion tied to a specific code shape
   needs re-verification once that shape changes, not just a citation.
2. **"The service is active" only proves the process is up, not that everything behind it is
   warm.** Railway's always-on PostGraphile container gave no signal about Neon's independent
   autosuspend state; the two had to be reasoned about (and ultimately confirmed) separately.
3. **When the finding site's own numbers don't fit the story, that's a clue.** Cross-checking
   Neon Launch pricing against the official `neon.com/pricing`/`neon.com/docs` pages (via
   `WebFetch`) rather than trusting the first `WebSearch` results (sourced from SEO
   aggregator/blog sites) avoided basing a real cost estimate on secondhand, potentially stale
   numbers.
4. **A "safe fallback" pattern isn't transferable by default — check what the sentinel value
   already means.** `null` was a safe fallback for `getFacetOptions`/`getToolCount` because
   "empty" is a legitimate render state; for `getToolBySlug`, `null` is already the app's
   designated signal for "genuinely doesn't exist," so reusing it for "the request failed"
   would have silently turned transient cold-start failures into false 404s — worse than the
   original throw-to-`error.tsx` behavior it would have replaced.
5. **A single Next.js internal env var, checked against the actual build source rather than
   assumed, can cleanly separate "build time" from "live request" inside a Server Component.**
   `process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD` (from `next/constants`) let
   `getToolBySlug` get a build-appropriate timeout without touching its live-request behavior —
   confirmed reliable across Next's static-generation worker pool by reading
   `node_modules/next/dist/build/index.js` directly rather than assuming env vars propagate to
   worker processes.
6. **Scoping a fix per call site, not per shared constant, avoided a live-UX regression.**
   Mapping every `fetchGraphql` caller by *when* it actually runs (build-only vs. live-request
   vs. mixed) before touching `GRAPHQL_TIMEOUT_MS` caught that a blanket bump would have quietly
   made the live search route (and an uncached tool-detail-page hit) tolerate slower responses
   during any future genuine outage, not just cold starts.
