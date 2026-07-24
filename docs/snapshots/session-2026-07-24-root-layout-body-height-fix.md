# Session log — `body` gets a definite height in the root layout (2026-07-24)

> Not a spec. This is a snapshot of the Claude Code conversation that fixed a code-review
> finding on `src/app/layout.tsx` (lines 25-33): the root layout's `body` only set
> `min-h-full` while the inner flex container relied on `min-h-full` too, leaving no
> element in the `html` → `body` → `div` chain with an explicit `height` for the
> percentage-based `min-height` to resolve against, so the sticky-footer layout could
> silently fail to reach the viewport on short pages. User prompts and the assistant's
> final reported answer are reproduced verbatim; tool-call output (the harness-attached
> file read and the lint run) is summarized narratively.

---

## 1. Code-review finding

**User (code-review finding, applied to `src/app/layout.tsx:25-33`):**

> Verify each finding against current code. Fix only still-valid issues, skip the rest
> with a brief reason, keep changes minimal, and validate.
>
> In @src/app/layout.tsx around lines 25 - 33, Update the layout shell around the body and
> inner flex container so it has a definite viewport height, using either h-full on body
> or min-h-screen on the inner shell. Preserve the existing flex-column structure and main
> content behavior.

The harness had already attached a full `Read` of `layout.tsx` as context, showing the
current structure: `<html className="... h-full">` wrapping `<body className="min-h-full">`,
which wraps a `<div className="mx-auto flex min-h-full max-w-[1180px] flex-col ...">`
containing `Topbar`, a `main` with `flex-1 flex-col`, and a `footer`.

---

## 2. Verifying the finding against current code

**Assistant:**

> The finding is valid: `html` sets `h-full` (definite), but `body` only sets `min-h-full`.
> Per CSS spec, a child's percentage `height`/`min-height` only resolves against an
> ancestor whose `height` (not `min-height`) is explicitly set — so the container `div`'s
> `min-h-full` currently resolves to `auto` and does nothing, breaking the sticky-footer
> layout on short pages.
>
> Fix: give `body` a definite height (`h-full`) so the percentage chain (`html` → `body` →
> `div`) resolves correctly, keeping the existing flex-column/sticky-footer structure
> intact.

The reasoning: `html` has `h-full`, and since the `html` element's containing block is the
initial containing block (the viewport, which always has a definite height), `html`'s
computed height is definite. `body`'s `min-h-full` (`min-height: 100%`) would need `html`'s
*height* — not `min-height` — to be explicit for that percentage to resolve, which it is,
so `body`'s min-height resolves fine. But the inner `div`'s `min-h-full` needs `body` to
have an explicit `height`, and `body` only had `min-height` set — per spec, a percentage
height against a containing block whose height is not explicitly specified computes as
`auto`, i.e., the `div`'s minimum height silently did nothing. Chose to fix this by
changing `body` from `min-h-full` to `h-full`, keeping the fix on the `body` element (one
of the two options the finding named) and preserving the div's existing `min-h-full` and
the whole flex-column/sticky-footer structure unchanged.

---

## 3. Applying the fix

Edited `src/app/layout.tsx`:

```diff
-      <body className="min-h-full">
+      <body className="h-full">
```

No other lines changed — the inner `div`'s `min-h-full`, the flex-column structure, `main`,
and `footer` were left exactly as they were.

---

## 4. Validation

Ran `npm run lint -- --quiet` — clean, no output.

**Assistant (final response):**

> Lint passes clean.
>
> **Change:** [layout.tsx:25](src/app/layout.tsx#L25) — `body` now uses `h-full` instead of
> `min-h-full`. Previously the percentage-height chain broke at `body`: CSS only resolves a
> child's percentage height/min-height against an ancestor with an explicit `height`, not
> `min-height`, so the inner `div`'s `min-h-full` was silently resolving to `auto` —
> meaning short pages wouldn't stretch to the viewport and the footer wouldn't stick to the
> bottom. With `body` now at a definite `h-full`, the `html → body → div` chain resolves
> correctly and the sticky-footer flex layout works as intended.
>
> **To test:** `npm run dev`, open a page with little content (e.g. an empty search
> result) and confirm the footer sits at the bottom of the viewport instead of riding up
> under the content.

---

## 5. Snapshot request

**User:** "Now draft the snapshot for this conversation. Keep prompts and responses
verbatim. Follow writing conventions of already existing snapshots inside docs/snapshots.
Save the draft in said directory when finished."

→ This document.

---

## Net code changes

- `src/app/layout.tsx` — `body`'s className changed from `min-h-full` to `h-full` (line
  25), giving it a definite height so the inner flex container's `min-h-full` (line 26)
  resolves against a real value instead of `auto`. No other markup, classes, or structure
  changed.

## Lessons worth keeping

1. **A percentage `min-height` only resolves against an ancestor's explicit `height`, not
   the ancestor's own `min-height`** — this is the classic gap in "100%-height flex shell"
   layouts: setting `min-h-full` at every level looks consistent but silently breaks the
   chain at whichever ancestor only has `min-height` set, because CSS treats that
   ancestor's height as `auto` for percentage-resolution purposes. At least one link in the
   chain (here, `body`) needs a real `height`.
2. **`html`'s `h-full` was already correct and didn't need touching** — the root element's
   containing block is the initial containing block (the viewport), which always has a
   definite height, so `height: 100%` on `html` was never the broken link; the fix only
   needed to happen one level down, at `body`.
3. **When a finding offers two equally valid fixes (`h-full` on `body` vs. `min-h-screen`
   on the inner shell), picking the one that keeps the existing percentage-chain pattern
   (rather than switching a single element to viewport units) is the smaller, more
   consistent diff** — one class changed, everything else (including the div's own
   `min-h-full`) stayed load-bearing and untouched.
