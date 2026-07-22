-- =====================================================================
-- Game Development Tools Knowledge Bank — SCHEMA (DDL)
-- Target: PostgreSQL. Run this file first, then 02_seed.sql.
--   psql "$DATABASE_URL" -f 01_schema.sql
-- Read-only catalog served via PostGraphile (Core). See spec §3–§4.9.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Enumerated types
-- ---------------------------------------------------------------------
CREATE TYPE tool_type AS ENUM (
  'game_engine',
  'framework_library',
  'asset_creator',
  'asset_marketplace',
  'asset_library',
  'middleware',        -- e.g. FMOD, Havok: plug into other tools
  'ide_editor'
);

CREATE TYPE licensing_model AS ENUM (
  'free_open_source',
  'free_proprietary',  -- free to use but closed-source (e.g. itch.io, some free tiers)
  'paid_one_time',
  'subscription',
  'royalty_based',
  'tiered'
);

CREATE TYPE relationship_type AS ENUM (
  'EXPORTS_TO',        -- directional
  'IMPORTS_FROM',      -- directional
  'PLUGIN_FOR',        -- directional
  'EMBEDS',            -- directional
  'BUILDS_ON',         -- directional
  'PAIRS_WELL_WITH'    -- undirected / editorial (was "synergy")
);

CREATE TYPE platform_role AS ENUM (
  'HOST_OS',           -- the tool runs on this OS
  'TARGET'             -- you can ship/export games to this platform
);

CREATE TYPE tool_link_type AS ENUM (
  'WEBSITE',
  'DOCS',
  'SOURCE_REPO',
  'COMMUNITY'
);

-- ---------------------------------------------------------------------
-- 2) Core: tool
-- ---------------------------------------------------------------------
CREATE TABLE tool (
  id                                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                              text NOT NULL UNIQUE,
  name                              text NOT NULL,
  type                              tool_type NOT NULL,
  summary                           text NOT NULL,
  has_built_in_editor               boolean NOT NULL DEFAULT false,

  licensing_model                   licensing_model NOT NULL,
  licensing_note                    text,

  logo_image_url                    text,
  logo_image_source                 text,

  confirmed_commercial_titles_count integer,
  confirmed_titles_as_of            date,
  confirmed_titles_source           text,

  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_type       ON tool (type);
CREATE INDEX idx_tool_licensing  ON tool (licensing_model);
CREATE INDEX idx_tool_popularity ON tool (confirmed_commercial_titles_count DESC NULLS LAST);

-- ---------------------------------------------------------------------
-- 3) Structured links: tool_link
-- ---------------------------------------------------------------------
CREATE TABLE tool_link (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tool_id bigint NOT NULL REFERENCES tool(id) ON DELETE CASCADE,
  type    tool_link_type NOT NULL,
  url     text NOT NULL,
  label   text,
  UNIQUE (tool_id, type, url)
);
CREATE INDEX idx_tool_link_tool ON tool_link (tool_id);
CREATE INDEX idx_tool_link_type ON tool_link (type);

-- ---------------------------------------------------------------------
-- 4) Areas of use (hierarchical taxonomy)
-- ---------------------------------------------------------------------
CREATE TABLE area_of_use (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug      text NOT NULL UNIQUE,
  name      text NOT NULL,
  parent_id bigint REFERENCES area_of_use(id) ON DELETE SET NULL
);
CREATE INDEX idx_area_parent ON area_of_use (parent_id);

CREATE TABLE tool_area_of_use (
  tool_id        bigint NOT NULL REFERENCES tool(id) ON DELETE CASCADE,
  area_of_use_id bigint NOT NULL REFERENCES area_of_use(id) ON DELETE CASCADE,
  PRIMARY KEY (tool_id, area_of_use_id)
);

-- ---------------------------------------------------------------------
-- 5) Platforms (host OS + target/export). Role lives on the join.
-- ---------------------------------------------------------------------
CREATE TABLE platform (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE tool_platform (
  tool_id     bigint NOT NULL REFERENCES tool(id) ON DELETE CASCADE,
  platform_id bigint NOT NULL REFERENCES platform(id) ON DELETE CASCADE,
  role        platform_role NOT NULL,
  PRIMARY KEY (tool_id, platform_id, role)
);
CREATE INDEX idx_tool_platform_platform ON tool_platform (platform_id, role);

-- ---------------------------------------------------------------------
-- 6) Languages (scripting/authoring)
-- ---------------------------------------------------------------------
CREATE TABLE language (
  id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE tool_language (
  tool_id     bigint NOT NULL REFERENCES tool(id) ON DELETE CASCADE,
  language_id bigint NOT NULL REFERENCES language(id) ON DELETE CASCADE,
  PRIMARY KEY (tool_id, language_id)
);

-- ---------------------------------------------------------------------
-- 7) Games (shared, reusable) + store links + tool link
-- ---------------------------------------------------------------------
CREATE TABLE game (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                text NOT NULL UNIQUE,
  name                text NOT NULL,
  developer           text,
  publisher           text,
  release_year        integer,
  banner_image_url    text,
  banner_image_source text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_store_link (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id     bigint NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  store_label text NOT NULL,
  url         text NOT NULL,
  UNIQUE (game_id, url)
);

CREATE TABLE tool_game (
  tool_id bigint NOT NULL REFERENCES tool(id) ON DELETE CASCADE,
  game_id bigint NOT NULL REFERENCES game(id) ON DELETE CASCADE,
  PRIMARY KEY (tool_id, game_id)
);

-- ---------------------------------------------------------------------
-- 8) Unified tool-to-tool edges + bidirectional view
-- ---------------------------------------------------------------------
CREATE TABLE tool_relationship (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_tool_id bigint NOT NULL REFERENCES tool(id) ON DELETE CASCADE,
  target_tool_id bigint NOT NULL REFERENCES tool(id) ON DELETE CASCADE,
  type           relationship_type NOT NULL,
  note           text,
  CHECK (source_tool_id <> target_tool_id),
  UNIQUE (source_tool_id, target_tool_id, type)
);
CREATE INDEX idx_rel_source ON tool_relationship (source_tool_id);
CREATE INDEX idx_rel_target ON tool_relationship (target_tool_id);
CREATE INDEX idx_rel_type   ON tool_relationship (type);

-- Mirrors PAIRS_WELL_WITH rows so symmetric pairings appear from either node.
-- edge_id is unique across both halves so PostGraphile can expose node identity.
CREATE VIEW tool_relationship_bidirectional AS
  SELECT id AS relationship_id,
         id::text || ':f' AS edge_id,
         source_tool_id, target_tool_id, type, note,
         false AS mirrored
  FROM tool_relationship
UNION ALL
  SELECT id AS relationship_id,
         id::text || ':r' AS edge_id,
         target_tool_id AS source_tool_id,
         source_tool_id AS target_tool_id,
         type, note,
         true AS mirrored
  FROM tool_relationship
  WHERE type = 'PAIRS_WELL_WITH';

-- Smart comments: primary key + FK relations so PostGraphile (Core) exposes
-- the view with node identity and Tool relations.
COMMENT ON VIEW tool_relationship_bidirectional IS
  E'@primaryKey edge_id\n@foreignKey (source_tool_id) references tool (id)\n@foreignKey (target_tool_id) references tool (id)';

-- ---------------------------------------------------------------------
-- 9) Area rollups (recursive descendants)
-- ---------------------------------------------------------------------
-- Returns an area plus all of its descendants (self-inclusive).
CREATE OR REPLACE FUNCTION area_of_use_descendants(root_slug text)
RETURNS SETOF area_of_use AS $$
  WITH RECURSIVE tree AS (
    SELECT a.* FROM area_of_use a WHERE a.slug = root_slug
    UNION ALL
    SELECT child.*
    FROM area_of_use child
    JOIN tree ON child.parent_id = tree.id
  )
  SELECT * FROM tree;
$$ LANGUAGE sql STABLE;

-- Convenience: all tools tagged anywhere under an area subtree (de-duplicated).
CREATE OR REPLACE FUNCTION tools_in_area_tree(root_slug text)
RETURNS SETOF tool AS $$
  WITH RECURSIVE tree AS (
    SELECT a.id FROM area_of_use a WHERE a.slug = root_slug
    UNION ALL
    SELECT child.id
    FROM area_of_use child
    JOIN tree ON child.parent_id = tree.id
  )
  SELECT DISTINCT t.*
  FROM tool t
  JOIN tool_area_of_use tau ON tau.tool_id = t.id
  JOIN tree ON tree.id = tau.area_of_use_id;
$$ LANGUAGE sql STABLE;

COMMIT;
