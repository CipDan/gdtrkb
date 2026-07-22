---
name: catalog-seed
description: >-
  Conventions for safely adding, editing, or removing entries in the GDTRKB
  catalog seed (db/02_seed.sql) — game engines, frameworks, asset creators,
  asset marketplaces, audio middleware, and example games. Use this whenever you
  touch 02_seed.sql, add or update a tool / game / area / platform / language in
  the knowledge bank, hand-write seed INSERTs, or verify catalog data. It covers
  the id-agnostic slug-subquery FK pattern, the enum and area-tagging rules,
  licensing verification against primary sources, apostrophe / transaction
  correctness, and a referential-integrity check to run before committing.
  Apply it even when the user just says "add <tool> to the catalog", "seed a few
  more entries", or "update the seed" without naming any of these conventions.
---

# GDTRKB catalog seed authoring

This skill encodes the house rules for `db/02_seed.sql` — the curator-owned seed
for the Game Development Tools & Resources Knowledge Bank. Follow it any time you
create or modify seed rows so the script stays valid, re-runnable, and honest.

## Sources of truth (read these, don't restate them)

- **`db/01_schema.sql`** — the authoritative enum values, tables, and
  constraints. When in doubt about an allowed value, grep this file; it wins over
  anything written here.
- **`docs/schema-spec.md`** — the field-by-field rationale and the seed-taxonomy
  design rules (§4.3, §4.8).

This skill captures *conventions*, not the schema. If the schema and this file
ever disagree, the schema is correct — flag the drift.

## The non-negotiables

1. **One transaction.** The whole file runs inside a single `BEGIN; … COMMIT;`.
   Don't add stray semicolons that split it — semicolons *inside* string literals
   are fine, but a bare `;` ends the statement.

2. **Id-agnostic FKs via slug subqueries.** Never hardcode a numeric id. Resolve
   every foreign key by slug so the script is order-independent and re-runnable:
   ```sql
   (SELECT id FROM tool WHERE slug='godot')
   ```
   This is why slugs must be stable and unique.

3. **Insert order matters.** Reference tables first, then tools, then the join /
   edge rows, then games:
   `area_of_use` → `platform` / `language` → `tool` → `tool_link` →
   `tool_area_of_use` / `tool_platform` / `tool_language` →
   `tool_relationship` → `game` / `game_store_link` / `tool_game`.

4. **Escape apostrophes by doubling them.** `'Ren''Py'`, `'Epic''s marketplace'`.
   A single unescaped `'` breaks the whole transaction.

5. **Enums must match `01_schema.sql` exactly.** For convenience (verify against
   the schema before relying on these):
   - `tool.type`: `game_engine`, `framework_library`, `asset_creator`,
     `asset_marketplace`, `asset_library`, `middleware`, `ide_editor`
   - `tool.licensing_model`: `free_open_source`, `free_proprietary`,
     `paid_one_time`, `subscription`, `royalty_based`, `tiered`
   - `tool_relationship.type`: `EXPORTS_TO`, `IMPORTS_FROM`, `PLUGIN_FOR`,
     `EMBEDS`, `BUILDS_ON` (all directional), `PAIRS_WELL_WITH` (symmetric)
   - `tool_platform.role`: `HOST_OS` (runs on), `TARGET` (exports to)
   - `tool_link.type`: `WEBSITE`, `DOCS`, `SOURCE_REPO`, `COMMUNITY`

## Content rules

### Area-of-use tagging
- **Tag the most specific leaf that applies**, never a parent and its own child
  on the same tool. Rollup queries recover the parent, so tagging leaves loses
  nothing. (Blender → `3d_modelling`, not `asset_creation`.)
- A general engine with no natural leaf may carry the top-level `development`
  bucket.
- It is fine to leave a tool **untagged** when nothing fits — e.g. asset
  marketplaces, for which the taxonomy has no "asset acquisition" leaf. Don't
  force a wrong tag.

### Platforms
Give each tool the `HOST_OS` rows it runs on and the `TARGET` rows it can ship
to. A tool can (and usually will) appear with both roles for the same platform.
Desktop DCC / editor apps (Blender, Aseprite, an audio authoring tool) typically
get `HOST_OS` rows only.

### Popularity counts
`confirmed_commercial_titles_count` values are **illustrative placeholders** the
curator replaces with sourced figures. Whenever you set a count:
- also set `confirmed_titles_as_of` (a date) and `confirmed_titles_source`;
- use `'illustrative placeholder'` as the source until a real one exists;
- leave all three `NULL` when you have no figure.

### Licensing — verify, don't remember
Licensing terms drift, and the big engines have all changed recently (Unity
dropped the Runtime Fee back to seat-based tiers; Unreal is royalty-based with an
Epic-Store/Fab exemption; GameMaker moved to free-non-commercial + one-time
Pro). **Before writing `licensing_model` + `licensing_note`, check the vendor's
current pricing/license page** rather than relying on training data. Keep
`licensing_note` short and factual.

### Relationships
- Directional edges (`EXPORTS_TO`, `PLUGIN_FOR`, `BUILDS_ON`, …) point from the
  producer/plugin to the consumer/host.
- `PAIRS_WELL_WITH` is symmetric and editorial — store it **once**; the
  `tool_relationship_bidirectional` view exposes it both ways.
- No self-loops (`source <> target`) and no duplicate `(source, target, type)`.
- Model marketplace variants as **separate tools** from their engine and link
  them (e.g. Unity Asset Store `PAIRS_WELL_WITH` Unity), rather than folding them
  into the engine row.

### Games
Use real, correctly-attributed titles (developer / publisher / year). Add a
`game_store_link` only with a **verified** store id/URL — don't invent app ids.
Wire each title to the tool(s) that made it via `tool_game`.

## Before you finish: validate

Reason through (or script) these checks against the file you just wrote:
- every `slug='…'` referenced in a subquery resolves to a row **defined** in
  this file (tool / platform / language / area / game);
- no duplicate or self-referential `tool_relationship` rows;
- no tool tagged both a parent area and its child;
- no duplicate `(tool, platform, role)` rows;
- single quotes balanced (remember `''` escaping), `BEGIN;`/`COMMIT;` present.

A quick way to check referential integrity is a small quote-aware parser (split
statements only on semicolons **outside** string literals, collect defined slugs
per table, then diff the referenced slugs against them). If you write one, keep
it in `scripts/` next to this file.

## Minimal worked example (one tool, end to end)

```sql
-- tool
INSERT INTO tool (slug, name, type, summary, has_built_in_editor,
                  licensing_model, licensing_note,
                  confirmed_commercial_titles_count, confirmed_titles_as_of,
                  confirmed_titles_source)
VALUES
  ('defold','Defold','game_engine',
   'Free, cross-platform 2D/3D engine scripted in Lua, with a small runtime.',
   true,'free_open_source','Defold License (modified Apache 2.0)',
   NULL,NULL,NULL);

-- links
INSERT INTO tool_link (tool_id, type, url) VALUES
  ((SELECT id FROM tool WHERE slug='defold'),'WEBSITE','https://defold.com'),
  ((SELECT id FROM tool WHERE slug='defold'),'SOURCE_REPO','https://github.com/defold/defold');

-- area (leaf, plus the general bucket for an engine)
INSERT INTO tool_area_of_use (tool_id, area_of_use_id) VALUES
  ((SELECT id FROM tool WHERE slug='defold'),(SELECT id FROM area_of_use WHERE slug='development')),
  ((SELECT id FROM tool WHERE slug='defold'),(SELECT id FROM area_of_use WHERE slug='gameplay_scripting'));

-- platforms (host + a few targets)
INSERT INTO tool_platform (tool_id, platform_id, role) VALUES
  ((SELECT id FROM tool WHERE slug='defold'),(SELECT id FROM platform WHERE slug='windows'),'HOST_OS'),
  ((SELECT id FROM tool WHERE slug='defold'),(SELECT id FROM platform WHERE slug='windows'),'TARGET'),
  ((SELECT id FROM tool WHERE slug='defold'),(SELECT id FROM platform WHERE slug='web'),'TARGET');

-- language
INSERT INTO tool_language (tool_id, language_id) VALUES
  ((SELECT id FROM tool WHERE slug='defold'),(SELECT id FROM language WHERE slug='lua'));
```

Add any new `platform` / `language` / `area_of_use` rows in their own sections
(near the top) *before* referencing them.
