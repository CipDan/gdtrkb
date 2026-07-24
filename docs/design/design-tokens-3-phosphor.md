# Design Tokens — Direction 3: "Phosphor"

> **One of three.** This is the token set for the **Phosphor** style direction. The app-build spec (`app-spec.md`) **§9** will name **exactly one** of the three token documents as the chosen system for the build; the other two are not implemented. This file is self-contained: an implementing model can build the entire UI from it.
>
> **Companions:** `style-directions.html` (visual reference), `app-spec.md` §7–§9. Component names below match the app spec.

**Direction intent.** A single-hue amber terminal readout. Type does almost everything; chrome is near-zero. **Signature element:** text-mode framing (`>` prompts, `[ ]` brackets, dotted rules) and a blinking cursor. Most minimal of the three and the cheapest to build — the restraint *is* the style, so precision in spacing and type is what makes it land.

---

## 1. Color

Deliberately **monochrome** — one amber phosphor hue in a few values. Meaning is carried by type, line-style, and labels, **not** by color, so there are no per-category colors.

| Role | Value | Use |
|---|---|---|
| `--bg` | `#0A0A06` | Screen background |
| `--surface` | `#12100A` | Optional subtle panel fill (mostly transparent) |
| `--ink` | `#FFB000` | Primary amber text/lines |
| `--bright` | `#FFCE5C` | Emphasis (headers, ranks, prompt, cursor, focus) |
| `--pale` | `#FFF1C9` | Highest emphasis (card names, scores) |
| `--dim` | `#AB8420` | Secondary text, labels |
| `--line` | `#3A2C08` | Borders / dividers |

**Licensing** is shown as **bracketed text tags** in `--ink` (e.g. `[FREE/OSS]`, `[PAID]`), **not** colored pills — keeping the monochrome discipline. The `licensing_model` enum maps to a short label, not a color.

**Neighborhood graph** (§8.9): nodes = 1px `--line` boxes, label `--ink`; focused tool label in `--bright`. Edge types are distinguished by **line style + text label**, not color: directional = solid `--ink` line with its type label; `PAIRS_WELL_WITH` = dotted `--ink` line. (This is the one direction where the graph must lean on line-style, since there's no accent palette.)

**Popularity bar chart:** bars filled `--ink`, #1 bar `--pale`, gridlines `--line`, axis text `--dim`. Monochrome.

---

## 2. Typography

| Role | Family | Used for |
|---|---|---|
| Display | **VT323** | Wordmark, headings, card names, table |
| Body | **VT323** (larger size) | Reading text — one family throughout |

Single-family system: VT323 at two+ sizes. Fallback stack: `'VT323', ui-monospace, Menlo, monospace`. VT323 is condensed with a low x-height, so **set everything larger than you would a normal font** (see scale).

**Readability note (honest trade-off):** using a pixel/terminal font for body is this direction's cost. Keep body ≥17px. If usability testing shows the body is hard to read, swap **body only** to a standard monospace (e.g. system `ui-monospace`) and keep VT323 for display — the look survives, the reading improves.

**Type scale**

| Token | Size / line-height | Family |
|---|---|---|
| `display-lg` | 34px / 1.1 | VT323 (wordmark, page heading) |
| `display-md` | 30px / 1.15 | VT323 (section headings) |
| `card-name` | 24px / 1.2 | VT323 |
| `body` | 18px / 1.45 | VT323 |
| `body-sm` | 16px / 1.4 | VT323 (labels, tags, table) |

---

## 3. Spacing, shape, elevation, motion

- **Spacing scale (px):** `4, 8, 12, 16, 24`. Card padding 16; component gap 16–22.
- **Radius:** `0` everywhere. No rounded corners.
- **Border:** `1px solid --line`. Dividers may be `1px dotted --line`.
- **Elevation:** none — no shadows, no glow. Depth comes from framing lines only.
- **Motion:** a single blinking cursor (`_`) on the wordmark, `1.1s steps(1)` blink. **Gate it on `prefers-reduced-motion: reduce`** (no blink when reduced). No other animation.

---

## 4. Component specs

**Tool card (§7.5):** transparent (or `--surface`) fill, `1px --line`, radius 0, padding 16. Logo frame + name row, badges, summary (`body`, `--dim`), area tags. Whole card links out.

**Logo frame (§8.1):** 46×46, `1px --line`, radius 0, VT323 initials in `--ink`.

**Type badge:** no fill, VT323 `body-sm`, `--bright` text; optionally `1px --line`.

**Licensing tag:** bracketed text — `[LABEL]` in `--ink` (brackets via `::before`/`::after` or literal).

**Area-of-use tag:** `1px --line`, `--ink` text, prefixed with `› ` (via `::before` in `--dim`).

**Buttons:** all prefixed with `> `.
- Primary: `--ink` fill, `#0A0A06` text, `1px --ink`.
- Secondary: transparent, `--ink` text + border.
- Pressed: `--bright` fill, dark text, `--bright` border.

**Search bar (§7.1):** `1px --line`, radius 0. Leading `>` prompt in `--bright`. Input VT323 `body`, `--ink`; placeholder `--dim`. Trailing RUN button, `1px --line` left divider, `--bright` text.

**High-score table (§7.6):** `1px --line` frame. Caption `--dim` (e.g. `// popularity`). Header cells `--bright`, bottom `1px --line`. Rank cells `--bright`. Score column right-aligned, `--pale`. Row separators `1px dotted --line`.

**Wordmark:** VT323 `--ink`, followed by a `--bright` blinking `_` cursor (reduced-motion aware per §3).

---

## 5. Accessibility (required)

- Amber-on-near-black is high-contrast and passes AA comfortably; keep body ≥17px and honor the §2 readability fallback if testing warrants it.
- Because the palette is monochrome, **never encode meaning in color alone** — use labels and line-styles (already the default here: licensing is text, graph edges differ by line style).
- Every interactive element shows a visible `--bright` focus outline (3px, 2px offset).
- `prefers-reduced-motion: reduce` disables the cursor blink and any transitions.

---

## Appendix — CSS custom properties

```css
/* Fonts: <link> VT323 from Google Fonts */
:root {
  --bg:#0A0A06; --surface:#12100A;
  --ink:#FFB000; --bright:#FFCE5C; --pale:#FFF1C9; --dim:#AB8420; --line:#3A2C08;

  --font-display:'VT323', ui-monospace, Menlo, monospace;
  --font-body:'VT323', ui-monospace, Menlo, monospace;

  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px;
  --radius:0; --border-w:1px;
}

@keyframes cursor-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .wordmark-cursor { animation: none; }
}
```
