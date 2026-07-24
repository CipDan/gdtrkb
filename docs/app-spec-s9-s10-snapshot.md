# Snapshot log — `gamedev-tools-app-spec.md` §9 & §10

> Captured 2026-07-22, **before** locking the design direction (§9) and **before** choosing a deployment path (§10). Preserved verbatim for logging. The live spec has since been updated.

---

## 9. Design system — "retro accent, modern bones"

The design system follows the **"retro accent, modern bones"** frame (an arcade-inspired display face used sparingly over clean, readable structure). The concrete token set — color, typography, spacing, component treatments — is defined in a **separate design-token document**, chosen from three parallel options.

**► SELECT ONE AT BUILD TIME.** The chosen file is **authoritative** for all color, type, spacing, and component tokens; implement its tokens exactly. Fill in the marker below before building:

```
CHOSEN DESIGN SYSTEM: <design-tokens-1-cartridge.md | design-tokens-2-attract-mode.md | design-tokens-3-phosphor.md>
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

---

## 10. Deployment

**Select ONE path at build time.** The implementing model should be told which by the developer; both are documented here so the choice is a one-line switch, not a rewrite. Full trade-offs are in `deployment.md`. All three parts (frontend, API, DB) deploy independently in both paths.

### Path 1 — $0 managed stack (default for a portfolio/demo MVP)
- **Frontend:** Vercel (Hobby). Detail pages via SSG/ISR; CDN-served.
- **Database:** Neon (Free) — Postgres, scale-to-zero, ample for this dataset.
- **API:** PostGraphile container on **Google Cloud Run** — scales to zero, generous always-free request allowance, faster cold starts than spin-down PaaS.
- **Trade-off:** the API may **cold-start after idle** (a few seconds on Cloud Run) — acceptable for a demo, and hidden for most visits because detail pages are static and don't hit the live API. Only the live search path can feel it.

### Path 2 — always-on API (removes cold starts, ~$7/mo)
- Identical to Path 1, but the PostGraphile server runs on **one always-on small instance** (e.g. Render Starter / small Fly.io machine / Railway) instead of scale-to-zero. Frontend on Vercel and DB on Neon are unchanged.
- **Trade-off:** ~$7/month for the API instance; no cold starts.

**Environment variables (both paths):**
- `DATABASE_URL` — Postgres connection (used by PostGraphile; **server/API only**).
- `POSTGRAPHILE_URL` — the GraphQL endpoint URL (**server-only** in Next.js; never exposed to the browser).
- Any ISR revalidation interval as config.

**Data load:** run `01_schema.sql` then `02_seed.sql` against the database before first deploy. A simple **GitHub Actions** workflow can run these migrations on push and trigger the Vercel/Cloud Run deploys (optional, but a clean CI/CD touch).

### 10.1 Developer workflow & CI (recommended)
This is *how the app is built*, not part of its runtime stack — but it's a clean fit for the project's DevOps goals, and it matters here because much of the code is AI-agent-generated and won't otherwise get line-by-line human review.

- **Source control + CI:** GitHub repo; GitHub Actions running, on every PR/push: lint, type-check, tests, the SQL migration run, and deploy triggers for Vercel and the API host.
- **Baseline quality gates (non-negotiable):** TypeScript strict mode, ESLint + Prettier, and a minimal test setup (unit/component). An AI reviewer complements these — it does not replace them.
- **AI code review — CodeRabbit (recommended):** an automated reviewer on every pull request. As of mid-2026 its Free tier is permanent and needs no credit card, giving AI PR summaries and review comments on unlimited public and private repos (rate-limited to roughly four PR reviews per hour — ample for a solo MVP); a public/portfolio repo gets the full paid feature set for free. It is review-only, so keep the lint/type/test gates above. Comparable alternatives if you want to evaluate: Sourcery (also free on public repos), Greptile, the self-hostable PR-Agent, or GitHub Copilot's built-in PR review. Verify current terms before committing — these change often.
