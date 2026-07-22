# Design Tokens — Direction 2: "Attract Mode"

> **One of three.** This is the token set for the **Attract Mode** style direction. The app-build spec (`app-spec.md`) **§9** will name **exactly one** of the three token documents as the chosen system for the build; the other two are not implemented. This file is self-contained: an implementing model can build the entire UI from it.
>
> **Companions:** `style-directions.html` (visual reference), `app-spec.md` §7–§9. Component names below match the app spec.

**Direction intent.** An arcade cabinet's attract screen: black cabinet, dual neon (cyan + magenta), gold scores, with the high-score board as the hero. **Signature element:** a neon-glow wordmark — the one place the glow is spent. Boldest of the three; highest execution effort.

---

## 1. Color

| Role | Value | Use |
|---|---|---|
| `--bg` | `#06060C` | Cabinet background. Optional hero radial: `radial-gradient(120% 100% at 50% -10%, #101430, #06060C 60%)` |
| `--surface` | `#0F1020` | Cards, table, search |
| `--surface-2` | `#14152B` | Secondary panels |
| `--ink` | `#EAF6FF` | Primary text |
| `--ink-dim` | `#8892B0` | Secondary text |
| `--border` | `#232544` | Hairline borders |
| `--accent-primary` | `#21E6FF` | Cyan — primary accent, CTAs, table frame |
| `--accent-secondary` | `#FF3FB4` | Magenta — secondary accent |
| `--accent-score` | `#FFD23F` | Gold — scores/popularity |
| `--logo-frame-bg` | `#0B1030` | Logo frame fill |

**Glow tokens** (neon is created with `text-shadow` / `box-shadow`, used sparingly):

| Token | Value |
|---|---|
| `--glow-cyan` | `0 0 6px #21E6FF, 0 0 14px rgba(33,230,255,.55)` |
| `--glow-magenta` | `0 0 6px #FF3FB4, 0 0 14px rgba(255,63,180,.5)` |
| `--glow-btn` | `0 0 14px rgba(33,230,255,.45)` |
| `--glow-panel` | `0 0 22px rgba(33,230,255,.12)` |
| `--elev` | `0 10px 30px rgba(0,0,0,.5)` (dark drop shadow for depth) |

**Licensing badges** are **outline** style (transparent fill, 1px border, text = the color):

| Enum | Color |
|---|---|
| `free_open_source` | `#37D67A` |
| `free_proprietary` | `#2EC4B6` |
| `paid_one_time` | `#FFB703` |
| `subscription` | `#C77DFF` |
| `royalty_based` | `#FF8C42` |
| `tiered` | `#8892B0` |

**Neighborhood graph** (§8.9): nodes = `--surface` fill, 1px accent border, label `--ink`; focused tool gets `--glow-cyan`. Edges: directional solid `--accent-primary`; `PAIRS_WELL_WITH` dashed `--accent-secondary`. Labels `--ink-dim`.

**Popularity bar chart:** bars `--accent-primary`, #1 bar `--accent-score`, gridlines `--border`, axis text `--ink-dim`.

---

## 2. Typography

| Role | Family | Used for |
|---|---|---|
| Display | **Press Start 2P** | Wordmark, headings, card names, table headers, ranks — set **small and sparse** |
| Body | **Inter** (400/500/600/700) | All reading text |

**Hard rule:** Press Start 2P is near-unreadable in paragraphs — never use it for body or long strings. Because each glyph is large, keep display sizes small.

**Type scale**

| Token | Size / line-height | Family |
|---|---|---|
| `display-lg` | 20px / 1.4 | Press Start 2P (wordmark, page heading) |
| `display-md` | 16px / 1.5 | Press Start 2P (section headings) |
| `display-card` | 12px / 1.4 | Press Start 2P (card names) |
| `display-xs` | 9px / 1.4, letter-spacing .04em | Press Start 2P (table headers, GO) |
| `body-lg` | 15px / 1.5 | Inter |
| `body` | 14px / 1.5 | Inter |
| `body-sm` | 13px / 1.45 | Inter |

---

## 3. Spacing, shape, elevation, motion

- **Spacing scale (px):** `4, 8, 12, 16, 22, 32`. Card padding 18/16; component gap 22.
- **Radius:** small — cards/table/search `4px`; buttons `3px`; pills `999px`.
- **Border:** `1px` hairline. Base borders `--border`; hero elements (primary button, high-score frame) use an accent-colored 1px border.
- **Elevation:** depth via `--elev` (dark drop shadow) + subtle `--glow-panel`; **not** hard offset shadows.
- **Motion:** the neon is **static** (no animated flicker — animated glow reads as AI-generated). Hover: slight brightness increase only. Respect `prefers-reduced-motion`.

---

## 4. Component specs

**Tool card (§7.5):** `--surface` fill, `1px --border`, radius 4, `--elev` + faint cyan inner ring (`0 0 0 1px rgba(33,230,255,.06)`). Logo frame + name row, badges, summary (`--ink-dim`), tags. Whole card links out.

**Logo frame (§8.1):** 46×46, `1px --accent-primary`, radius 4, `--logo-frame-bg` fill, Press Start 2P initials in `--accent-primary`.

**Type badge:** outline — transparent fill, `1px --accent-primary`, `--accent-primary` text, radius 4.

**Licensing badge:** outline per §1 licensing table (1px border + text in the color).

**Area-of-use tag:** transparent, `1px --border`, `--accent-primary` text, pill radius, `body-sm`.

**Buttons:**
- Primary: `--accent-primary` fill, `#04121A` text, `1px --accent-primary`, `--glow-btn`, `display-xs`.
- Secondary: transparent, `--accent-secondary` text + border.
- Pressed: darker cyan fill (`#0A5F6E`), `#CFFCFF` text, glow removed.

**Search bar (§7.1):** `--surface` fill, `1px --border`, radius 4. Input Inter 14, `--ink`; placeholder `--ink-dim`. GO button `--accent-primary`, dark text, Press Start 2P 9px.

**High-score table (§7.6) — the hero:** `--surface` fill, `1px --accent-primary` border, `--glow-panel`. Caption in `--accent-secondary` Press Start 2P 10px. Header row Press Start 2P `display-xs` in `--accent-primary`. Rank cells Press Start 2P in `--accent-score`. Score column right-aligned, tabular numerals, `--accent-score`, weight 700. Row separators `1px #191A30`.

**Wordmark:** Press Start 2P; first part `#FFF` with `--glow-cyan`, accent part `--accent-secondary` with `--glow-magenta`. This is the single glow splurge — do not add glow elsewhere.

---

## 5. Accessibility (required)

- Reading text is Inter; Press Start 2P is never used for paragraphs.
- Use `--ink` (`#EAF6FF`) for essential reading text — reserve `--ink-dim` for genuinely secondary content, and verify it meets AA at the size used.
- Neon effects are decorative: never rely on glow to convey meaning; the underlying color/label carries it.
- Every interactive element shows a visible `--accent-primary` focus outline (3px, 2px offset).
- `prefers-reduced-motion`: remove hover transitions.

---

## Appendix — CSS custom properties

```css
/* Fonts: <link> Press Start 2P + Inter from Google Fonts */
:root {
  --bg:#06060C; --surface:#0F1020; --surface-2:#14152B;
  --ink:#EAF6FF; --ink-dim:#8892B0; --border:#232544;
  --accent-primary:#21E6FF; --accent-secondary:#FF3FB4; --accent-score:#FFD23F;
  --logo-frame-bg:#0B1030;

  --glow-cyan:0 0 6px #21E6FF, 0 0 14px rgba(33,230,255,.55);
  --glow-magenta:0 0 6px #FF3FB4, 0 0 14px rgba(255,63,180,.5);
  --glow-btn:0 0 14px rgba(33,230,255,.45);
  --glow-panel:0 0 22px rgba(33,230,255,.12);
  --elev:0 10px 30px rgba(0,0,0,.5);

  --lic-free-open-source:#37D67A; --lic-free-proprietary:#2EC4B6;
  --lic-paid-one-time:#FFB703;    --lic-subscription:#C77DFF;
  --lic-royalty-based:#FF8C42;    --lic-tiered:#8892B0;

  --font-display:'Press Start 2P', monospace;
  --font-body:'Inter', system-ui, sans-serif;

  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:22px; --space-6:32px;
  --radius-card:4px; --radius-btn:3px; --radius-pill:999px;
  --border-w:1px;
}
```
