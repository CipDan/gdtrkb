# Design Tokens — Direction 1: "Cartridge"

> **One of three.** This is the token set for the **Cartridge** style direction. The app-build spec (`app-spec.md`) **§9** will name **exactly one** of the three token documents as the chosen system for the build; the other two are not implemented. This file is self-contained: an implementing model can build the entire UI from it.
>
> **Companions:** `style-directions.html` (visual reference), `app-spec.md` §7–§9 (component list + where these tokens apply). Component names below (tool card, high-score table, etc.) match the app spec.

**Direction intent.** Tool cards are game cartridges — light printed "labels" sitting on a deep console-purple shelf. Warm, collectible, tactile. **Signature element:** the notched cartridge card with a hard offset shadow. Highest visual flavor of the three; highest execution effort.

---

## 1. Color

Semantic roles (raw hex in parentheses). Use the role names in code, not the raw values.

| Role | Value | Use |
|---|---|---|
| `--bg` | `#1B1030` | Page background ("console shelf") |
| `--surface-raised` | `#2A1B47` | Raised dark panels |
| `--surface-inset` | `#12092A` | Inset dark areas (e.g. table body) |
| `--card` | `#F4EFE3` | Cartridge label (card background) |
| `--card-ink` | `#241A12` | Text on card |
| `--card-ink-dim` | `#6B5D49` | Secondary text on card |
| `--ink` | `#EFE8FB` | Primary text on dark bg |
| `--ink-dim` | `#B3A4D6` | Secondary text on dark bg |
| `--border` | `#0C0718` | Chunky near-black borders |
| `--accent-primary` | `#7C5CFF` | Console purple — primary accent, type badges |
| `--accent-secondary` | `#2EC4B6` | Cartridge teal — CTAs, headers |
| `--accent-score` | `#FFB703` | Amber — score/popularity emphasis |
| `--logo-frame-bg` | `#D8E6FF` | Logo frame fill |
| `--logo-frame-ink` | `#274B8F` | Logo frame initials |
| `--tag-bg` | `#EFE3FF` | Area-of-use tag fill |
| `--tag-ink` | `#3A2270` | Area-of-use tag text |
| `--focus-ring` | `#2EC4B6` | Keyboard focus outline |

**Licensing badge colors** (filled pills, `--border` outline; map `licensing_model` enum → fill / text):

| Enum | Fill | Text |
|---|---|---|
| `free_open_source` | `#37D67A` | `#06331A` |
| `free_proprietary` | `#2EC4B6` | `#06251F` |
| `paid_one_time` | `#FFB703` | `#3A2A00` |
| `subscription` | `#C77DFF` | `#2A0A45` |
| `royalty_based` | `#FF8C42` | `#3A1A00` |
| `tiered` | `#9AA5B1` | `#17202A` |

**Neighborhood graph** (§8.9): nodes = mini cartridges — fill `--card`, `--border` border, label `--card-ink`; the focused tool gets a `--accent-score` ring. Edges: directional types solid `--accent-primary`; `PAIRS_WELL_WITH` dashed `--accent-secondary`. Edge labels in `--ink-dim`.

**Popularity bar chart:** bars `--accent-secondary`, the #1 bar `--accent-score`, gridlines `--surface-raised`, axis text `--ink-dim`.

---

## 2. Typography

| Role | Family | Weights | Used for |
|---|---|---|---|
| Display | **Silkscreen** | 400, 700 | Wordmark, section headings, card names, table headers, small UPPERCASE labels |
| Body | **Inter** | 400/500/600/700 | Summaries, paragraphs, tags, table data — all reading text |

**Hard rule:** the display face never sets body or long-form text. Headings, labels, wordmark, and the score column only.

**Type scale**

| Token | Size / line-height | Family |
|---|---|---|
| `display-lg` | 24px / 1.15 | Silkscreen 700 |
| `display-md` | 16px / 1.3 | Silkscreen 700 |
| `display-sm` | 11px / 1.3, letter-spacing .04em | Silkscreen 400 (labels, table headers) |
| `body-lg` | 15px / 1.5 | Inter 400 |
| `body` | 14px / 1.5 | Inter 400 |
| `body-sm` | 13px / 1.45 | Inter 400 |
| `caption` | 11px / 1.4 | Inter 500 |

---

## 3. Spacing, shape, elevation, motion

- **Spacing scale (px):** `4, 8, 12, 16, 22, 32, 40`. Card padding = 18/16; component gap = 22.
- **Radius:** card `6px`; buttons/search `6–8px`; pills `999px`.
- **Border:** `--border` at **3px** on cards/buttons/search/table; **2px** on tags and badges.
- **Elevation (hard shadows, no blur):** `shadow-lg = 6px 6px 0 --border` (cards); `shadow-md = 4px 4px 0 --border` (buttons, search, table).
- **Pressed state:** `transform: translate(4px, 4px)` and shadow removed (button visually "seats").
- **Motion:** minimal. Optional hover lift (`translate(-2px,-2px)`, shadow grows to `8px 8px`). Respect `prefers-reduced-motion` — drop transforms/transitions.

---

## 4. Component specs

**Tool card (§7.5)** — cartridge. `--card` fill, `3px --border`, radius 6, `shadow-lg`. A notch pseudo-element top-right (small `--card` rect, 3px border, no top border, ~46×12px). Padding 18/16. Contains: logo frame + name row, type + licensing badges, summary (`body-sm`, `--card-ink-dim`), area tags. Whole card links to `/tools/[slug]`.

**Logo frame (§8.1):** 46×46, `3px --border`, radius 6, `--logo-frame-bg` fill, initials in Silkscreen `--logo-frame-ink`. Real logos sit inside this frame.

**Type badge:** `--accent-primary` fill, white text, `2px --border`, radius 6, Inter 700 11px, UPPERCASE.

**Licensing badge:** per §1 licensing table, `2px --border`, radius 6, Inter 700 11px.

**Area-of-use tag:** `--tag-bg` fill, `--tag-ink`, `2px --border`, pill radius, `caption`.

**Buttons:**
- Primary: `--accent-secondary` fill, `#06251F` text, `3px --border`, radius 6, `shadow-md`.
- Secondary: transparent fill, `--ink` text + `--ink` border, faint white hard shadow.
- Pressed: primary colors, translated per §3.

**Search bar (§7.1):** `--card` fill, `3px --border`, radius 8, `shadow-md`. Input Inter 14, `--card-ink`; placeholder `--card-ink-dim`. Trailing GO button `--accent-primary`, white, Silkscreen 12.

**High-score table (§7.6):** `--surface-inset` fill, `3px --border`, radius 8. Header row Silkscreen `display-sm` in `--accent-secondary`, bottom `2px --border`. Rank cells Silkscreen in `--accent-score`. Score column right-aligned, tabular numerals, `--accent-score`, weight 700. Row separators `1px --surface-raised`.

---

## 5. Accessibility (required)

- Body/reading text is Inter at ≥14px; the pixel display face is never used for paragraphs.
- Contrast meets WCAG AA: `--card-ink` on `--card` and `--ink` on `--bg` both pass; use `--ink` (not `--ink-dim`) for anything essential to read.
- Every interactive element shows a visible `--focus-ring` outline (3px, 2px offset).
- `prefers-reduced-motion`: remove hover transforms and transitions.

---

## Appendix — CSS custom properties

```css
/* Fonts: <link> Silkscreen (400,700) + Inter from Google Fonts */
:root {
  --bg:#1B1030; --surface-raised:#2A1B47; --surface-inset:#12092A;
  --card:#F4EFE3; --card-ink:#241A12; --card-ink-dim:#6B5D49;
  --ink:#EFE8FB; --ink-dim:#B3A4D6; --border:#0C0718;
  --accent-primary:#7C5CFF; --accent-secondary:#2EC4B6; --accent-score:#FFB703;
  --logo-frame-bg:#D8E6FF; --logo-frame-ink:#274B8F;
  --tag-bg:#EFE3FF; --tag-ink:#3A2270; --focus-ring:#2EC4B6;

  --lic-free-open-source:#37D67A;  --lic-free-open-source-ink:#06331A;
  --lic-free-proprietary:#2EC4B6;  --lic-free-proprietary-ink:#06251F;
  --lic-paid-one-time:#FFB703;     --lic-paid-one-time-ink:#3A2A00;
  --lic-subscription:#C77DFF;      --lic-subscription-ink:#2A0A45;
  --lic-royalty-based:#FF8C42;     --lic-royalty-based-ink:#3A1A00;
  --lic-tiered:#9AA5B1;            --lic-tiered-ink:#17202A;

  --font-display:'Silkscreen', monospace;
  --font-body:'Inter', system-ui, sans-serif;

  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:22px; --space-6:32px; --space-7:40px;
  --radius-card:6px; --radius-btn:6px; --radius-pill:999px;
  --border-w:3px; --border-w-thin:2px;
  --shadow-lg:6px 6px 0 var(--border);
  --shadow-md:4px 4px 0 var(--border);
}
```
