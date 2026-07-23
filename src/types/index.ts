// Shared domain types — mirrors docs/schema-spec.md §2-4.

export type ToolType =
  | "game_engine"
  | "framework_library"
  | "asset_creator"
  | "asset_marketplace"
  | "asset_library"
  | "middleware"
  | "ide_editor";

export type LicensingModel =
  | "free_open_source"
  | "free_proprietary"
  | "paid_one_time"
  | "subscription"
  | "royalty_based"
  | "tiered";

export type RelationshipType =
  | "EXPORTS_TO"
  | "IMPORTS_FROM"
  | "PLUGIN_FOR"
  | "EMBEDS"
  | "BUILDS_ON"
  | "PAIRS_WELL_WITH";

export type PlatformRole = "HOST_OS" | "TARGET";

export type ToolLinkType = "WEBSITE" | "DOCS" | "SOURCE_REPO" | "COMMUNITY";

export interface Tool {
  slug: string;
  name: string;
  type: ToolType;
  summary: string;
  hasBuiltInEditor: boolean;
  licensingModel: LicensingModel;
  licensingNote: string | null;
  logoImageUrl: string | null;
  logoImageSource: string | null;
  confirmedCommercialTitlesCount: number | null;
  confirmedTitlesAsOf: string | null;
  confirmedTitlesSource: string | null;
}

export interface ToolLink {
  type: ToolLinkType;
  url: string;
  label: string | null;
}

export interface AreaOfUse {
  slug: string;
  name: string;
  parentSlug: string | null;
}

export interface Platform {
  slug: string;
  name: string;
}

export interface Language {
  slug: string;
  name: string;
}

export interface Game {
  slug: string;
  name: string;
  developer: string | null;
  publisher: string | null;
  releaseYear: number | null;
  bannerImageUrl: string | null;
  bannerImageSource: string | null;
}

export interface GameStoreLink {
  storeLabel: string;
  url: string;
}

export interface ToolRelationship {
  sourceSlug: string;
  targetSlug: string;
  type: RelationshipType;
  note: string | null;
  mirrored: boolean;
}
