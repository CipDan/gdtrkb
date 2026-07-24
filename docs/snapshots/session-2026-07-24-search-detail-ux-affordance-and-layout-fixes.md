# Session log — search/detail-page UX affordance and layout fixes (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that reviewed and fixed
> three real-data UX regressions against the "Phosphor" design system (`docs/design/design-tokens-3-phosphor.md`,
> `docs/design/phosphor-hifi-mock.html`, `docs/app-spec.md`): an ever-tall, always-expanded
> facet panel; a cramped side-by-side detail-page layout that squeezed the relationship
> graph; and missing hover/cursor affordances across the search page. It also covers three
> follow-up rounds of user feedback (scrollbar/select theming, graph legibility tuning, a
> game-banner parity fix) and a final documentation-sync pass. User prompts and the
> assistant's substantive explanatory/analysis responses are reproduced verbatim (prompts
> lightly grammar-corrected per the user's request); tool-call output (file reads, greps,
> bash commands, edits) is summarized narratively, per this project's established
> convention. Image attachments are noted as bracketed placeholders; large document dumps
> read via the `Read` tool are noted narratively rather than reproduced, per the user's
> explicit choice for this snapshot (see §13).

---

## 1. Initial UX review request

**User:**

> Read CLAUDE.md and follow it strictly.
>
> [Image attached: production search page screenshot, ~25% zoom, showing the fully-expanded
> filter sidebar stretching well past the visible card grid]
> [Image attached: production Unity tool detail page screenshot, showing "GDTRKB_" header,
> spec-sheet readout, and a cramped side-by-side Example Titles / Relationships layout]
> [Image attached: close-up screenshot of a relationship graph excerpt (Godot example),
> showing Blender/FMOD/Spine/Fab nodes and edge labels]
> [Image attached: mobile mock screenshot showing Example Titles and Relationships panels
> stacked vertically, full width]
>
> The images attached are screenshots with the current production version of the UI, and a
> view of the mocked detail page on a mobile screen. The current UI follows the agreed-upon
> conventions detailed in `docs/design/design-tokens-3-phosphor.md`, `docs/design/phosphor-hifi-mock.html`,
> and `docs/app-spec.md`, but based on current Neon database tables and entries, there are a
> few issues with said design:
> * The filter section is rendered with all the options displayed, which increases the
>   height of the page. The attached screenshot was taken at 25% zoom and still could not
>   capture the bottom of the page (the popularity table). For a better user experience, it
>   would be ideal to set the filter section to account for the height value of the current
>   grid/table/graph view, so that the page is not unnecessarily stretched vertically. This
>   can be done either by pulling the filter section into a new, floating window, or by
>   adapting the filter section content. However, these are suggestions, and you need to
>   devise appropriate strategies and present them accordingly.
> * For the detail page, the design system and mocks show the example title and
>   relationship sections side by side. However, unlike the mock, the production UI shrinks
>   both sections, with the graph being especially affected. A suggested solution would be
>   to render these two sections one under the other, not side-by-side, as can be seen in
>   the detail-page-ui-look-mobile-mock image. This is a suggestion, however, and you need
>   to analyze the issue, devise appropriate strategies and present them.
>
> Special mention: in the current production UI, for the search page, there are clickable
> elements that the user does not receive any visual cue for. These are: the filter options
> (neither the tick nor the name), the page selection buttons, the clear filters button, the
> grid/table view selection and the sort selection. They can be interacted with and
> functionality-wise they work adequately, but a user cannot figure out, based on the
> current implementation, whether they can be interacted with (since no highlight/cursor
> change on hover occurs). Review all components of the search page that are interactable
> but have no highlight, and apply the appropriate fix. For thoroughness, check the other
> pages (e.g. detail, not found, error) for similar issues and fix accordingly.
>
> Ask for clarifications before executing.

Before responding, the assistant read `CLAUDE.md`, `docs/architecture.md`,
`docs/design/design-tokens-3-phosphor.md`, `docs/design/phosphor-hifi-mock.html`, and
`docs/app-spec.md` in full to establish current project conventions (per §13 below, these
large reads are summarized rather than reproduced here).

---

## 2. Investigating the three issues

Read every component touching the search and detail pages to find the actual cause of each
symptom: `FacetPanel.tsx`, `SearchPageClient.tsx`, `SortControl.tsx`, `ViewSwitch.tsx`,
`Pagination.tsx`, `ToolCard.tsx`, `HighScoreTable.tsx`, the detail page (`app/tools/[slug]/page.tsx`),
`DetailHeader.tsx`, `SpecSheet.tsx`, `ExampleGames.tsx`, `Relationships.tsx`, `ToolGraph.tsx`,
`ToolGraphFallback.tsx`, `Topbar.tsx`, `SearchBar.tsx`, `not-found.tsx`, `error.tsx`, and
`globals.css`.

**Assistant:**

> I've reviewed the three components involved. Here's what's actually causing each issue,
> and the strategy options for the two that have real design trade-offs.
>
> **1. Filter panel height** — `FacetPanel.tsx` renders every facet (type, area-of-use tree,
> host OS, target platform, language, licensing, editor toggle) fully expanded in a plain
> static `<aside>`, with no independent scroll or collapse. The hi-fi mock only ever showed
> ~6 tiny facet lists; against the real Neon-backed option counts (especially the
> area-of-use tree and platform lists) that same "show everything" layout just grows very
> tall, and since it sits in the same grid row as the results column
> (`SearchPageClient.tsx:179`), it stretches the whole page.
>
> **2. Cramped detail-page graph** — `page.tsx:51` splits Example Titles / Relationships
> 50/50 via `md:grid-cols-2` at 768px, matching the mock's `.cols`. But `ToolGraph.tsx` draws
> a fixed 260px-tall canvas whose radial layout radius grows with neighbor count
> (`Math.max(130, 70 + ring.length * 22)`, `ToolGraph.tsx:133`) while the column width
> doesn't — React Flow's `fitView` then scales the whole diagram down to fit, shrinking node
> boxes and edge labels. Real tools with more relationships than the mock's 3-node example
> make this worse.
>
> **3. Missing hover/cursor affordances** — none of the `<button>`, `role="radio"`,
> `role="checkbox"`, or `<select>` elements set `cursor: pointer` (browsers only default
> that to `<a>`, not form controls), and several also lack any hover color change. Confirmed
> missing on: every FacetPanel option row + the clear-filters button, SortControl's
> `<select>`, ViewSwitch's grid/table buttons, Pagination's prev/next buttons, and the
> ToolGraph node boxes (clickable via `onNodeClick` but give zero visual cue). `not-found.tsx`,
> `error.tsx`, `ToolCard`, `HighScoreTable`, and the detail-page links already have adequate
> treatment. My plan: add one small global rule (enabled buttons/radios/checkboxes/selects
> get `cursor: pointer`) plus a matching hover state on each of the five components above,
> following the hover patterns already used elsewhere (`text-ink→text-bright`,
> `border-line→border-ink`). This is mechanical, so I'll proceed with it alongside whichever
> options you pick below unless you'd rather I hold off.

**Assistant — clarifying questions, round 1 (`AskUserQuestion`):**

| Question | Options |
|---|---|
| How should the filter panel's height be handled on the search page? | **Sticky, self-scrolling sidebar** (recommended) — aside gets `position: sticky` with a max-height capped to the viewport and its own overflow-y scroll; page height follows the results column instead of the filter list · **Collapsible facet groups (accordion)** — each facet group becomes a collapsible `<details>` section, collapsed by default; genuinely shortens the panel but changes its visual density from the mock · **Both combined** — sticky + self-scrolling sidebar that also contains collapsible groups inside it; most flexible, most code churn |
| How should the detail page's Example Titles / Relationships layout be fixed so the graph isn't squeezed? | **Stack always, single column** — remove the side-by-side split entirely; simplest, but gives up the hi-fi mock's desktop side-by-side layout · **Keep side-by-side, fix the root cause** (recommended) — keep two columns on desktop but raise the breakpoint, give the graph column more width, and make `ToolGraph`'s canvas adapt to its actual container width instead of a fixed 260px/fixed radius · **Two columns only on large screens** — raise the stacking breakpoint from `md` (768px) to `lg` (1024px) or `xl`; doesn't address `ToolGraph`'s internal scaling |

**User answered:** "Both combined" / "I think the stack always, single column option would be
the best, based on this reasoning: in the future, if the game entries have image/banner
links included, it would be ideal to embed them similarly, using the same logic as for tool
logos. Nevertheless, if it can further help with the problem, also fix the root cause. Ask
for clarifications/confirmations before starting work on this."

---

## 3. Clarifying questions, round 2 (graph sizing depth + hover-fix go-ahead)

**Assistant:**

> Noted — no game-banner image work in this task; that was just context for why you prefer
> stacking (mirrors how tool logos already get a consistent frame, per `ExampleGames.tsx`).
> Two follow-ups before I touch anything:

| Question | Options |
|---|---|
| Now that Example Titles / Relationships will stack into one full-width column, should I also change how `ToolGraph` sizes its canvas (currently a fixed 260px-tall box with a neighbor-count-based radius that isn't aware of the container's actual width)? | **Full width only, no ToolGraph changes first** (recommended) — stacking roughly doubles the graph's available width immediately; revisit only if still cramped after visual testing · **Also scale canvas height with neighbor count** — in addition to stacking, grow the fixed 260px height for tools with many relationships · **Make the canvas fully container-aware now (width + height)** — most robust long-term since `ToolGraph` is a reusable component slated for reuse unchanged in Phase 2's graph view (app-spec §7.7); more implementation work up front |
| For the missing hover/cursor-affordance fix (FacetPanel options + clear-filters button, SortControl's select, ViewSwitch buttons, Pagination buttons, ToolGraph node boxes) — proceed with a global `cursor: pointer` base rule plus matching per-component hover states? | **Yes, proceed as described** (recommended) — apply the global cursor rule plus per-component hover states to all six spots listed, matching existing hover patterns in the codebase · **Let me review the list first** — hold off, specify adjustments before any code changes |

**User answered:** "Make the canvas fully container-aware now (width + height)" / "Yes,
proceed as described (Recommended)"

---

## 4. Implementing round 1

With both rounds of questions answered, the assistant implemented, in order:

- **`src/styles/globals.css`** — a global rule giving every enabled `<button>`/`<select>`
  `cursor: pointer` (native `<a>` already gets this; form controls don't by default).
- **`src/components/search/FacetPanel.tsx`** — converted each facet group (`type`, `area of
  use`, `runs on`, `exports to`, `language`, `licensing`) into a collapsible
  `<details>`/`<summary>` block (`[+]`/`[-]` glyphs matching the existing `[ ]`/`[x]`
  bracket aesthetic), with local `useState` seeded once from whether that facet is
  currently active (so a later unrelated filter change doesn't snap a manually-toggled
  group back closed). The `<aside>` itself became `md:sticky` with a `max-h-[calc(100vh-2rem)]`
  cap and its own `overflow-y-auto` body, so the page's height now follows the results
  column instead of the filter list. Added hover states to option rows and the
  clear-filters button.
- **`src/components/search/SortControl.tsx`**, **`ViewSwitch.tsx`**, **`Pagination.tsx`** —
  added hover states (`hover:text-bright` / `hover:border-ink`, matching existing patterns).
- **`src/app/tools/[slug]/page.tsx`** — replaced `grid gap-4 md:grid-cols-2 md:items-start`
  with a plain `flex flex-col gap-4`, so Example Titles and Relationships always stack.
- **`src/components/graph/ToolGraph.tsx`** — added a `ResizeObserver`-backed
  `useContainerWidth` hook; the ring radius is now `Math.min(countRadius, containerWidth
  cap)` and the canvas height is derived from that radius (`clamp(220, radius*1.7+120,
  480)`) instead of a fixed `260`. `ReactFlow` remounts on a bucketed width change (rounded
  to 40px) so `fitView` re-runs against the corrected layout. Node boxes got `cursor-pointer`
  plus `hover:border-bright hover:text-bright`.

Verified with `npm run typecheck` and `npm run lint` (both clean), started the dev server
(`npm run dev`, background), and cross-checked the change via SSR HTML inspection with
`curl` — confirmed the `<details>`/`<summary>` markup rendered, `md:grid-cols-2` was gone
from the detail page, and the Godot detail page's computed canvas height responded to its
real neighbor count (4 neighbors → ~389px, vs the old fixed 260px).

**Assistant (final response):**

> `npm run typecheck` and `npm run lint` both pass. Changed files:
>
> - `globals.css` — global `cursor: pointer` for enabled buttons/selects
> - `FacetPanel.tsx` — each facet group is now a `<details>`/`<summary>` (`[+]`/`[-]`),
>   collapsed by default and auto-expanded only for facets with an active selection; the
>   `<aside>` is `md:sticky` with its own capped/scrollable height on desktop; added hover
>   states to option rows and the clear-filters button
> - `SortControl.tsx`, `ViewSwitch.tsx`, `Pagination.tsx` — hover states added
> - `page.tsx` — Example Titles / Relationships now always stack in one column
> - `ToolGraph.tsx` — canvas now measures its real container width (`ResizeObserver`) and
>   sizes both width-capped radius and height off it, so the ring layout scales with content
>   instead of being crammed into a fixed 260px box; graph nodes got `cursor-pointer` +
>   hover border/text
>
> I confirmed via SSR HTML inspection that the `<details>`/`<summary>` groups render, the
> detail page has no more `md:grid-cols-2`, and the Godot detail page graph's computed
> canvas height responded correctly to its actual neighbor count (4 neighbors → ~389px, vs
> the old fixed 260px).
>
> I don't have browser automation available (per your earlier preference, no
> Playwright/chromium-cli), so I haven't visually eyeballed this — the dev server is
> running at **http://localhost:3000**. Worth checking manually:
> 1. Search page — facet groups collapse/expand, sidebar stays put while results scroll on
>    a tall filtered list, and every interactive element (facet rows, clear filters, sort,
>    grid/table switch, pager) shows a hand cursor + visible hover.
> 2. A tool with several relationships (e.g. `/tools/unity`) — confirm the graph reads
>    clearly now that it's full-width and sized to its content, and that clicking a graph
>    node still navigates correctly.
>
> Let me know if anything needs adjusting once you've looked at it.

---

## 5. User feedback, round 2

**User:**

> I have reviewed the changes visually. Some notes:
> * The search page interactable components now behave correctly. However, the sort
>   dropdown selector element background and the filter section scroll bar are not themed
>   to the Phosphor design. Is it possible to make them follow the same design system as
>   the rest, or are these two elements not customizable?
> * In the details page, the graph is now more readable. However, perhaps a zoom in-out
>   functionality should be added, so that viewing it may be easier (especially for tools
>   with many neighbour relations, like Unity). I want to discuss this topic with you
>   further.
> * Similar to the logo fix for the tools, implement the same logic for the banner/logo of
>   the example games.

---

## 6. Snapshot cross-check for the game-banner change

The assistant's first action was to attempt an `Edit` on `LogoFrame.tsx` directly (adding
`width`/`height`/`imageFit` props to reuse it for game banners). The user rejected that
tool call:

**User (tool-call rejection reason):** "Make sure this change does not conflict with
existing workflows or reasoning. Also look into docs/snapshots for information as well."

**Assistant:** "Good call — let me check what I find and report back before touching
anything."

Searched `docs/snapshots/` for `LogoFrame|bannerImageUrl|ExampleGames|banner` and read the
matching passages in `session-2026-07-23-detail-page-toolgraph-implementation.md` and
`session-2026-07-24-app-spec-checklist-audit-and-fixes.md`.

**Assistant:**

> Checked — no conflict. `docs/snapshots/session-2026-07-24-app-spec-checklist-audit-and-fixes.md`
> documents exactly the "logo fix" you're referencing: `LogoFrame` gained an optional
> `logoImageUrl` prop that renders the real image when present, falling back to
> `logoInitials(name)` otherwise, keeping `aria-hidden="true"` because the name already
> renders as separate visible text. `ExampleGames.tsx`'s current `"[img]"` placeholder
> predates that fix — the earlier snapshot notes it was hardcoded simply because no seed
> data populated `bannerImageUrl` yet, not as a deliberate design split from `LogoFrame`.
> Extending the same image-or-initials pattern to game banners is consistent with that
> reasoning and with `game.name` already rendering separately in `ExampleGames.tsx`, so
> I'll proceed.

---

## 7. Implementing round 2 (game banners, scrollbar, select)

- **`src/components/ui/LogoFrame.tsx`** — generalized to accept optional `width`/`height`
  (defaulting to the existing `size`) and an `imageFit` prop (`"contain"` default, `"cover"`
  opt-in), so it can render either a square tool logo or a rectangular game banner while
  keeping the same image-or-initials fallback logic and `aria-hidden="true"` treatment.
- **`src/components/tool/ExampleGames.tsx`** — replaced the ad-hoc `[img]` placeholder
  `<span>` with `<LogoFrame name={game.name} logoImageUrl={game.bannerImageUrl} width={72}
  height={44} imageFit="cover" />`.
- **`src/styles/globals.css`** — added `.phosphor-scrollbar` (Firefox `scrollbar-width`/
  `scrollbar-color`, WebKit `::-webkit-scrollbar-*` pseudo-elements: `--line` thumb,
  transparent track, `--dim` on hover) plus `color-scheme: dark` and explicit
  `background-color`/`color` on `select`/`option` as a partial fix for the native dropdown
  popup.
- **`src/components/search/FacetPanel.tsx`** — applied the new `.phosphor-scrollbar` class
  to the facet panel's scrollable body.

Verified with `npm run typecheck` / `npm run lint` (clean) and `curl` against the running
dev server — confirmed `phosphor-scrollbar` and the "BR" (Brotato) initials fallback both
render in the SSR HTML.

**Assistant (final response for this round):**

> Scrollbar and select-popup theming, plus the game-banner fallback, are done and verified
> against the running dev server (typecheck/lint clean too):
>
> - **Scrollbar** — themed via `.phosphor-scrollbar` (Firefox `scrollbar-color`, WebKit
>   `::-webkit-scrollbar-*`) applied to the facet panel's scroll container: `--line` thumb,
>   transparent track, `--dim` on hover.
> - **Sort `<select>`** — added `color-scheme: dark` plus explicit `background-color`/`color`
>   on `select`/`option`. This is a real limitation, not an oversight: the closed select box
>   was already fully themed (it's just a styled `<div>`-like box), but the *open dropdown
>   popup* is OS/browser-rendered chrome. `color-scheme: dark` + explicit colors gets
>   Chromium and Firefox most of the way there (dark background, amber text), but padding,
>   hover highlight color, and corners inside that popup stay outside CSS's reach — full
>   pixel fidelity (bracket-row hover states, zero OS chrome) would mean replacing `<select>`
>   with a custom listbox built the same way `FacetPanel`'s options are. Left as native for
>   now since the partial fix covers the visible complaint (white popup); say the word if
>   you want the full custom version.
> - **Game banners** — `ExampleGames` now reuses `LogoFrame` (72×44, `imageFit="cover"`)
>   instead of the literal `"[img]"` placeholder, so a missing banner falls back to the
>   game's initials exactly like a missing tool logo does. Verified in the rendered HTML —
>   Brotato renders "BR".
>
> **On graph zoom** — worth talking through before I touch `ToolGraph.tsx`. Right now it's
> deliberately static: `zoomOnScroll`, `zoomOnPinch`, `panOnDrag`, `panOnScroll`, and
> `nodesDraggable` are all off, matching the mock's plain-diagram intent and — importantly —
> avoiding the classic embedded-canvas problem where scrolling the page while your cursor
> happens to be over the graph gets captured as a zoom instead. A few directions, not
> mutually exclusive:
>
> 1. **+/- buttons only** (React Flow ships a `<Controls />` you can restyle, or hand-rolled
>    `[+]`/`[-]` buttons matching the bracket aesthetic). Predictable, keyboard-operable, no
>    scroll-hijack risk — but zooming in without panning just crops the view, so this needs
>    drag-to-pan enabled alongside it, plus a "reset/fit" control so users don't get stuck
>    zoomed into a corner.
> 2. **Scroll/pinch-to-zoom gated behind a modifier** (Ctrl+scroll, React Flow's
>    `zoomActivationKeyCode`), so plain scroll still scrolls the page. Feels native to
>    anyone used to maps/Figma, but it's not discoverable without a visible hint, and it's
>    awkward for touch/keyboard-only use.
> 3. **"Expand" into a larger overlay** — leave the inline graph exactly as it is today
>    (clean, static, matches the mock), and add a small control that opens the same graph
>    full-size in a modal with zoom/pan turned on there. Keeps the default page minimal and
>    sidesteps the scroll-trap problem entirely; costs an extra click and a new modal
>    pattern the app doesn't have yet.
> 4. **Simpler complementary step regardless of the above**: right now I capped the canvas
>    at 480px tall (`MAX_CANVAS_HEIGHT`). For genuinely crowded tools like Unity, just
>    raising that ceiling (or making it uncapped up to some larger limit) might reduce how
>    often anyone *needs* to zoom in the first place.
>
> Given the graph already has a complete accessible text fallback (`ToolGraphFallback`),
> zoom here is purely a visual convenience, not a correctness/accessibility requirement,
> which is why I don't think this needs to be elaborate. My instinct leans toward **1 + 4
> together** (raise the height ceiling some, add restrained +/- and reset buttons, enable
> pan only once zoomed) — but I'd like your take, especially on how much interactive chrome
> you're comfortable adding to an otherwise chrome-free design, and whether Unity-scale
> graphs (7-8 neighbors) are the common case or the outlier here.

---

## 8. User's zoom recommendation request

**User:**

> Regarding your findings:
> * For the sort `<select>`, if the custom listbox is implementable, proceed with that one.
> * For the graph zoom: Unity at the moment is an outlier, however, the size issue appears
>   for all tool entries with at least two neighbour relations, which, in this case, are
>   quite a few. Indeed, were it not for this, the mock's plain diagram intent would have
>   sufficed. However, adding full functionality is also not in the current scope.
>   Therefore, a simpler, albeit temporary, fix is ideal. What are your recommendations in
>   that regard?

---

## 9. Researching the real fix, then implementing it

Rather than guess at tuning numbers, the assistant grepped the installed `@xyflow/react`/
`@xyflow/system` packages directly for their default `fitView` padding and instance
`minZoom`/`maxZoom` values.

**Assistant:**

> Good — I confirmed the actual library defaults rather than guessing: React Flow's
> `fitView` defaults to `padding: 0.1` and the instance defaults to `maxZoom: 2`.
> `ToolGraph.tsx` currently overrides that to `padding: 0.35` — more than 3x the library
> default margin — which shrinks every rendered graph (not just Unity's) regardless of
> neighbor count. That's a much better-evidenced explanation for "the issue shows up
> starting at 2 neighbors" than anything about the canvas-height math.
>
> My recommendation for a simple, reversible, no-new-UI fix:
>
> 1. **Drop `fitViewOptions.padding` from 0.35 to ~0.15** — still leaves room for edge
>    labels near the border, but stops reserving over a third of the canvas as empty
>    margin. This alone should visibly enlarge every graph, big or small.
> 2. **Raise `MAX_CANVAS_HEIGHT` from 480 to ~600** — gives genuinely crowded tools
>    (Unity-scale) more vertical room before the ceiling forces `fitView` to compress
>    again, without ballooning the page for typical 2-4-neighbor tools (which don't hit that
>    ceiling anyway).
>
> No new controls, no library changes, no layout algorithm changes — just correcting a
> margin value back closer to the library's own default plus a bit more headroom on the
> ceiling. I'll implement both now; since I can't screenshot the result myself, I'd ask you
> to eyeball it afterward and we can nudge the numbers from there.

Implemented both, plus the custom sort listbox the user approved:

- **`src/components/graph/ToolGraph.tsx`** — `fitViewOptions.padding` 0.35 → 0.15;
  `MAX_CANVAS_HEIGHT` 480 → 600.
- **`src/components/search/SortControl.tsx`** — rewritten from a native `<select>` to a
  hand-built accessible listbox: a trigger button (`aria-haspopup="listbox"`,
  `aria-expanded`) opening a `role="listbox"` popup styled with the same `border-line`/
  `bg-line`/bracket conventions as the rest of the app; Arrow/Home/End keys navigate and
  select immediately, Escape/Tab/outside-click/blur close it and return focus to the
  trigger.
- **`src/styles/globals.css`** — removed the now-dead native-`<select>` CSS (nothing in the
  app uses `<select>` anymore) and tightened the cursor rule to just `button:not(:disabled)`.

Verified with `npm run typecheck` / `npm run lint` (clean) and `curl` against the dev
server — confirmed `aria-haspopup="listbox"` renders and no `<select>` element remains.

**Assistant (final response):**

> Both done, `npm run typecheck`/`npm run lint` clean, dev server confirms the markup:
>
> - **Sort control** — replaced the native `<select>` with a hand-built Phosphor-styled
>   listbox button: `border-line` popup frame, `bg-line`/`text-bright` highlight on the
>   selected row, hover states matching the rest of the app, full keyboard support
>   (Arrow/Home/End to navigate-and-select, Escape/Tab/outside-click/blur to close, focus
>   returns to the trigger). Removed the now-dead native-`<select>` CSS from `globals.css`
>   since nothing uses `<select>` anymore.
> - **Graph legibility** — `fitViewOptions.padding` 0.35 → 0.15 (library default is 0.1; the
>   old value was reserving over a third of the canvas as empty margin on every graph, not
>   just crowded ones), and `MAX_CANVAS_HEIGHT` 480 → 600 for more headroom on well-connected
>   tools before the ceiling kicks back in.
>
> The padding change is a runtime zoom computation, not something visible in the static
> HTML I can curl, so I couldn't verify the visual effect myself this round — worth a look
> on both a sparse tool and Unity to see if 0.15/600 land well or need another nudge.

---

## 10. Scrollbar rounded-corner bug reports and fixes

**User:** "Everything is OK now, and the design style is propagated. The graph is more
readable now, even for the Unity entry, so no other changes are required there. For the
filter scrollbar, the bar's corners should not be rounded, to keep in line with the
terminal aesthetic."

Added `border-radius: 0` to `.phosphor-scrollbar::-webkit-scrollbar-thumb` in `globals.css`.

**Assistant:** "Fixed — added an explicit `border-radius: 0` to
`.phosphor-scrollbar::-webkit-scrollbar-thumb` in globals.css, since Chromium's default
(and newer 'fluent' scrollbar style on Windows) renders scrollbar thumbs as pills unless
overridden. Lint's clean; the dev server is still running at `localhost:3000` if you want
to give it a quick look."

**User:** "I have just tested, but it is still rendered as a pill, with rounded corners."

**Assistant:**

> Found it — this is a known Chromium behavior, not a CSS mistake on my part. Recent
> Chromium (~121+) added native support for the *standard* `scrollbar-color`/`scrollbar-width`
> properties, and when both those and the legacy `::-webkit-scrollbar-*` pseudo-elements are
> declared on the same element, Chromium renders via its own native implementation of the
> standard properties — which is a fixed, non-configurable rounded/pill shape — instead of
> respecting the pseudo-element overrides. That's why `border-radius: 0` had no visible
> effect: that rule wasn't the one being rendered at all.
>
> Fix: scope the standard properties to browsers that don't support the WebKit
> pseudo-elements (Firefox), so Chromium/Edge/Safari fall through purely to the
> fully-customizable `::-webkit-scrollbar-thumb` path.

Wrapped the `scrollbar-width`/`scrollbar-color` declarations in
`@supports not selector(::-webkit-scrollbar) { ... }`, trimmed a now-redundant inline
comment on the `border-radius: 0` line, and re-ran `npm run lint` (clean).

**Assistant (final response):** "Lint's clean. The dev server (still running) should pick
up the CSS change via hot reload — no restart needed. Root cause was Chromium's native
`scrollbar-color` rendering (fixed rounded shape) competing with and winning over the
`::-webkit-scrollbar-thumb` override; scoping `scrollbar-color`/`scrollbar-width` to only
apply where the WebKit pseudo-elements aren't supported (`@supports not
selector(::-webkit-scrollbar)`) keeps Chromium fully on the customizable, square-corner
path. Give it another look when you get a chance."

---

## 11. Final audit and documentation sync

**User:** "Now everything is as expected. Make a final check across all modified files and
check whether there are no conflicts with already existing flows and conventions. Refer to
docs/snapshots for additional info. Update documentation (excluding snapshots) so that it
reflects the current changes and functionality. Preserve otherwise, and ask for
clarification before executing."

Ran `git status`/`git diff --stat` (9 files changed), re-checked `LogoFrame`/`ExampleGames`
against the same prior snapshot as §6, and read
`session-2026-07-24-toolgraph-relationship-label-mock-fidelity-check.md` — a prior session
that rejected a code-review finding specifically because `phosphor-hifi-mock.html` is
treated as literal pixel-fidelity truth throughout this project's history. Also read all
six `src/components/*/README.md` stubs, and grepped `app-spec.md` for `select|dropdown|
listbox|scrollbar|sticky|collapsible|column` to confirm its prose never mandated the
specific implementation details that had changed.

**Assistant:**

> I ran the full audit before touching anything. Summary:
>
> **All 9 changed files, cross-checked against `docs/snapshots/`:** No conflicts. The
> `LogoFrame`/`ExampleGames` change was already verified against
> `session-2026-07-24-app-spec-checklist-audit-and-fixes.md` earlier in this conversation. I
> additionally checked `session-2026-07-24-toolgraph-relationship-label-mock-fidelity-check.md`,
> which established just how strictly this project treats `phosphor-hifi-mock.html` as the
> pixel-fidelity source of truth (a prior code-review finding was *rejected* specifically
> because the mock deliberately showed raw enum labels) — which is exactly why this audit
> matters here.
>
> **Where the real conflict is:** `docs/app-spec.md`'s prose never mandated the specific
> implementation details I changed (it doesn't say facets must be fully expanded, doesn't
> say the detail page must be two-column, doesn't say sort must be a native `<select>`) —
> those specifics only ever lived in `phosphor-hifi-mock.html`. Three places in that mock
> now visually contradict the current, approved implementation:
> 1. `.layout`/`.panel` — mock shows every facet always expanded, no scroll/sticky behavior.
> 2. `.cols` — mock shows Example Titles / Relationships side-by-side on desktop.
> 3. `.ctl` — mock implies a plain label + native-style dropdown, not the custom listbox now
>    in place.
>
> Everything else — `architecture.md`, `schema-spec.md`, `deployment.md`,
> `ci-deploy-setup.md`, `design-tokens-3-phosphor.md`, and all six `src/components/*/README.md`
> stubs — I checked and none of them assert anything my changes contradict, so per "preserve
> otherwise" I'd leave those untouched.
>
> Given how much weight this project puts on the mock as literal pixel truth, leaving it
> as-is risks a future pass "fixing" the code back to match it. Two questions on how far to
> go fixing that:

**Assistant — clarifying questions, round 3 (`AskUserQuestion`):**

| Question | Options |
|---|---|
| `docs/design/phosphor-hifi-mock.html` now visually contradicts the app in 3 places (facet panel, detail-page columns, sort control). How should it be brought up to date? | **Annotate only** (recommended) — add clear HTML comments at each of the 3 diverging sections noting it's superseded and why, without redrawing the mock's markup/CSS itself · **Redraw the mock to match** — actually update the mock's HTML/CSS for these 3 areas so it stays a literal pixel-accurate reference; more work, can't be visually verified without browser tooling · **Both** — add the comments now, treat the full redraw as a separate follow-up |
| Should `docs/app-spec.md` §9 (design system) also get a short callout listing these same 3 intentional mock deviations and their rationale? | **Yes, add the callout** (recommended) — app-spec.md is the primary operating manual, so the exception is visible before anyone opens the mock file · **No, mock-file annotation is enough** — skip touching app-spec.md |

**User answered:** "Annotate only" / "Yes, add the callout (Recommended)"

Added `SUPERSEDED` HTML comments at the three diverging sections in
`docs/design/phosphor-hifi-mock.html` (facet panel, `.cols`, `.ctl`), each explaining what
changed and why without altering the mock's actual visual markup/CSS, and added a "Known
deviations from `phosphor-hifi-mock.html`" callout to `docs/app-spec.md` §9 listing the same
three items with rationale. Verified comment-tag balance (17 open / 17 close) and confirmed
`git status` showed exactly the 11 files touched across the whole conversation.

**Assistant (final response):**

> Documentation is now up to date. Summary of what changed in this pass:
>
> - **`docs/design/phosphor-hifi-mock.html`** — added `SUPERSEDED` HTML comments at the
>   three now-inaccurate sections (facet panel, `.cols` detail layout, `.ctl` sort control),
>   each explaining what changed and why, without touching the mock's actual visual
>   markup/CSS. Comment tags are balanced (17 open/17 close).
> - **`docs/app-spec.md` §9** — added a "Known deviations from `phosphor-hifi-mock.html`"
>   callout listing the same three items with rationale, so it's visible from the primary
>   spec doc without needing to open the mock.
>
> Everything else — `architecture.md`, `schema-spec.md`, `deployment.md`,
> `ci-deploy-setup.md`, `design-tokens-3-phosphor.md`, and the six component `README.md`
> stubs — was checked and left untouched; none of them asserted anything the code changes
> contradicted.
>
> That closes out the full round of fixes from this conversation: search-page hover/cursor
> affordances, the sticky/collapsible facet panel, the stacked detail-page layout with a
> container-aware `ToolGraph`, the tuned graph legibility, the custom-themed sort listbox
> and scrollbar, the game-banner/logo parity fix, and now the docs brought back in sync.
> Nothing is committed — say the word if you'd like these changes committed or pushed.

---

## 12. Snapshot request

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses
verbatim (for prompts, correct any grammar or syntax mistakes present). Preserve the
detailed and explicative responses, and any generated schema, tables or lists exactly.
Follow writing conventions of already existing snapshots inside docs/snapshots. Save the
draft in said directory when finished. If something is unclear, clarify before taking
action."

## 13. Clarifying the snapshot's own conventions

Two structural points weren't covered by precedent in any existing snapshot, so the
assistant asked before drafting:

**Assistant:** "Two structural points aren't covered by precedent in the existing
snapshots, so I want to check before drafting rather than guess on something that'd reshape
the whole document:"

| Question | Options |
|---|---|
| Your first message included 4 screenshots (production search page, Unity detail page, a graph close-up, and the mobile mock). No existing snapshot includes images — how should these be represented? | **Brief bracketed placeholder** (recommended) — e.g. "[Image attached: production search-page screenshot, ~25% zoom]" at the point each was sent, consistent with the "[Omitted long context line]" placeholder pattern already used in `session-2026-07-24-app-spec-checklist-audit-and-fixes.md` · **Detailed prose description** — write out what each screenshot actually showed in a few sentences · **Omit entirely** — don't reference the images at all |
| The conversation start also had several full-document dumps injected as context (CLAUDE.md, the Phosphor design-tokens doc, phosphor-hifi-mock.html, app-spec.md — each hundreds of lines) from the initial `Read` calls. How should these be handled in the snapshot? | **Narrative summary** (recommended) — one line noting which docs were read in full before responding, matching the "tool-call output... summarized narratively" convention already stated in existing snapshots · **Full verbatim reproduction** — include the complete text of each document inline; would make this snapshot several times longer than any existing one |

**User answered:** "Brief bracketed placeholder (Recommended)" / "Narrative summary
(Recommended)"

→ This document.

---

## Net code changes

**Application code:**
- `src/styles/globals.css` — global `cursor: pointer` rule for enabled buttons; themed
  `.phosphor-scrollbar` (Firefox `scrollbar-color`/`-width` scoped via `@supports not
  selector(::-webkit-scrollbar)`, WebKit `::-webkit-scrollbar-*` with `border-radius: 0`).
- `src/components/search/FacetPanel.tsx` — collapsible `<details>`/`<summary>` facet groups
  (auto-expanded when active), sticky/self-scrolling `<aside>`, hover states, the
  `.phosphor-scrollbar` class.
- `src/components/search/SortControl.tsx` — rewritten from a native `<select>` to a
  hand-built, fully keyboard-accessible Phosphor-styled listbox button + popup.
- `src/components/search/ViewSwitch.tsx`, `Pagination.tsx` — hover states.
- `src/app/tools/[slug]/page.tsx` — Example Titles / Relationships now always stack in a
  single column instead of `md:grid-cols-2`.
- `src/components/graph/ToolGraph.tsx` — `ResizeObserver`-backed container-width-aware
  radius and height, remount-on-resize-bucket to re-run `fitView`, `fitViewOptions.padding`
  0.35 → 0.15, `MAX_CANVAS_HEIGHT` 480 → 600, node `cursor-pointer` + hover state.
- `src/components/ui/LogoFrame.tsx` — generalized with optional `width`/`height`/`imageFit`
  so it can render rectangular game banners, not just square tool logos.
- `src/components/tool/ExampleGames.tsx` — reuses `LogoFrame` instead of a literal `"[img]"`
  placeholder.

**Documentation:**
- `docs/design/phosphor-hifi-mock.html` — three `SUPERSEDED` annotation comments (facet
  panel, `.cols`, `.ctl`), no visual/markup changes.
- `docs/app-spec.md` — §9 gained a "Known deviations from `phosphor-hifi-mock.html`"
  callout.

No files were committed or pushed during this conversation.

## Lessons worth keeping

1. **Checking `docs/snapshots/` before applying a "seems obviously right" change is worth
   doing by default, even when it turns out there's no conflict** — the game-banner/`LogoFrame`
   change was ultimately fine, but the check surfaced the *exact* established pattern
   (image-or-initials fallback, `aria-hidden` reasoning) to replicate precisely rather than
   reinvent slightly differently.
2. **A CSS fix can visibly do nothing even when the property and value are correct** — the
   first `border-radius: 0` attempt on the scrollbar thumb was reasonable but ineffective
   because modern Chromium's native `scrollbar-color` implementation was rendering instead
   of the `::-webkit-scrollbar-thumb` pseudo-elements entirely. A user report of "no change"
   warranted investigating *why the rule might not apply*, not just re-asserting it harder.
3. **Verifying tuning recommendations against the actual installed library's source (not
   assumption or memory) produced a much better-targeted fix** — grepping `node_modules`
   for React Flow's real default `fitView` padding (0.1) revealed the existing code's `0.35`
   was already a 3x-larger-than-default margin, which explained the reported symptom far
   better than guessing at new numbers would have.
4. **When a hi-fi mock has a project history of being treated as literal pixel-fidelity
   truth** (established here by `session-2026-07-24-toolgraph-relationship-label-mock-fidelity-check.md`,
   where a code-review finding was rejected specifically because the mock showed the
   "wrong-looking" thing on purpose), **a deliberate, approved departure from it needs to be
   recorded somewhere authoritative** — both inline in the mock and in the primary spec doc —
   or a future pass is liable to "fix" the code back to match a now-stale reference.
