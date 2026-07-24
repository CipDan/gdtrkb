# Session log — `useSearchParams` Suspense boundary finding review (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that verified a
> code-review finding against `src/components/search/SearchPageClient.tsx` and
> `src/app/page.tsx`: the claim that `SearchPageClient` (a Client Component calling
> `useSearchParams()`) needed to be wrapped in a React `Suspense` boundary because search
> params are "unavailable during prerendering." Verification against the Next.js docs
> bundled in `node_modules/next/dist/docs/` and a real production build showed the route
> is never statically prerendered in the first place — `app/page.tsx` already awaits the
> page's `searchParams` prop, which opts it into dynamic (server-request-time) rendering
> — so the Suspense-boundary requirement never applies here. No code was changed. User
> prompts and the assistant's final reported answer are reproduced verbatim; tool-call
> output (file reads, doc reads, the build/lint runs) is summarized narratively.

---

## 1. Code-review finding

**User (code-review finding, applied to `src/components/search/SearchPageClient.tsx:59-122`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest
> with a brief reason, keep changes minimal, and validate.
>
> In @src/components/search/SearchPageClient.tsx around lines 59 - 122, Wrap the
> SearchPageClient usage in src/app/page.tsx with a React Suspense boundary, providing an
> appropriate fallback while search parameters are unavailable during prerendering. Keep
> SearchPageClient's existing behavior unchanged and ensure the boundary covers the
> component that calls useSearchParams().

The harness had already attached a `Read` of the full `SearchPageClient.tsx` as context,
showing the component reading `useSearchParams()` at line 68 (a `"use client"` component,
no existing `Suspense` boundary around it in the file itself).

---

## 2. Verifying the finding against current code

Read `src/app/page.tsx` in full. It's an `async` Server Component that does
`const filterState = parseFilterState(toSearchParams(await searchParams));` at line 45,
then renders `<SearchPageClient ... />` directly — no `Suspense` wrapper around it.

Per CLAUDE.md's standing rule to read the Next.js docs under `node_modules/next/dist/docs/`
before any Next.js work (training data on Next.js internals is treated as unreliable),
read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`
in full. Two behaviors are documented separately:

- **Prerendering**: "If a route is prerendered, calling `useSearchParams` will cause the
  Client Component tree up to the closest `Suspense` boundary to be client-side
  rendered... During production builds, a static page that calls `useSearchParams` from a
  Client Component must be wrapped in a `Suspense` boundary, otherwise the build fails."
- **Dynamic Rendering**: "If a route is dynamically rendered, `useSearchParams` will be
  available on the server during the initial server render of the Client Component" — no
  `Suspense` requirement in this branch.

Which branch applies depends on whether the route is ever statically prerendered. Grepped
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` for
`searchParams` and found the deciding line (119): "`searchParams` is a **Request-time
API** whose values cannot be known ahead of time. Using it will opt the page into
**dynamic rendering** at request time." `app/page.tsx` already does `await searchParams`
at the top of the page — so the route is dynamic before `SearchPageClient` is ever
reached, and the "Prerendering" behavior (and its `Suspense` requirement) doesn't apply.

Verified this empirically rather than resting on doc-reading alone:

- `npm run build` — completed successfully with no "Missing Suspense boundary with
  useSearchParams" error (the exact failure the docs say a violation produces). The route
  table showed `/` marked `ƒ (Dynamic) server-rendered on demand`, not `○ (Static)` or
  `● (SSG)`.
- `npm run lint` — clean, no output (no `missing-suspense-with-csr-bailout` warning
  either).

---

## 3. Verdict: finding not valid — skipped

**Assistant (final response for this finding):**

> Lint and build both pass cleanly, and the build output confirms `/` is rendered as `ƒ`
> (Dynamic) — server-rendered on demand — not prerendered static.
>
> **Verdict: not a real issue here — skipping.**
>
> Reasoning: `app/page.tsx` does `await searchParams` in the page's Server Component
> (line 45), which per Next.js docs is a Request-time API that "will opt the page into
> dynamic rendering at request time." Since the route is never statically prerendered,
> `useSearchParams()` inside the client-side `SearchPageClient` is available during the
> initial server render (per the "Dynamic Rendering" behavior section of the
> `useSearchParams` docs), not the "Prerendering" behavior that requires a `Suspense`
> boundary. A production build (`npm run build`) confirms this: it completes without the
> "Missing Suspense boundary with useSearchParams" error, and `/` is listed as `ƒ
> (Dynamic)`, not prerendered.
>
> Adding a `Suspense` wrapper here would be inert (nothing would ever suspend to show the
> fallback) and would only add unnecessary structure — against the CLAUDE.md principle of
> no premature/unneeded abstraction. No changes made.

---

## 4. Snapshot request

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses
verbatim. Follow writing conventions of already existing snapshots inside docs/snapshots.
Save the draft in said directory when finished."

→ This document.

---

## Net code changes

- None. The finding was verified against current code and current Next.js docs and found
  not applicable (see §2-3); no files were edited.

## Lessons worth keeping

1. **A code-review finding's premise ("unavailable during prerendering") has to be
   checked against whether the route is actually prerendered, not assumed.** The Next.js
   `useSearchParams` docs describe two entirely different behaviors — one requiring a
   `Suspense` boundary (static/prerendered routes), one not (dynamically rendered routes)
   — and a generic review comment can cite the wrong one if it doesn't account for how the
   specific page is already rendered.
2. **`await searchParams` in a page's Server Component (`app/page.tsx:45`) already opts
   the whole route into dynamic rendering**, per the Next.js `page.md` docs ("Using it
   will opt the page into dynamic rendering at request time"). Once that's true, a
   Client Component descendant calling `useSearchParams()` is in the "Dynamic Rendering"
   behavior branch, not "Prerendering" — no `Suspense` boundary is required for it to
   build or render correctly.
3. **A production build is the cheapest way to falsify (or confirm) a Suspense-boundary
   claim.** The exact failure mode the docs describe ("Missing Suspense boundary with
   useSearchParams") only manifests in `npm run build`, not `npm run dev` (the docs note
   dev renders on-demand and won't surface it) — so running the real build, and reading
   its route-type table (`ƒ` vs `○`/`●`), was direct evidence rather than an inference
   from docs text alone.
4. **Adding a `Suspense` boundary that can never actually suspend is dead structure, not
   a safe no-op.** Since the route is always dynamic here, wrapping `SearchPageClient` in
   `Suspense` would add a fallback that's never shown — against CLAUDE.md's "don't add
   abstractions beyond what the task requires" principle, so the correct fix was no fix.
