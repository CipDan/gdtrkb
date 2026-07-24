import "server-only";
import type {
  Game,
  GameStoreLink,
  Language,
  PlatformRole,
  RelationshipType,
  Tool,
  ToolLinkType,
  ToolType,
} from "@/types";

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface ToolSearchNode
  extends Pick<
    Tool,
    | "slug"
    | "name"
    | "type"
    | "summary"
    | "licensingModel"
    | "logoImageUrl"
    | "hasBuiltInEditor"
    | "confirmedCommercialTitlesCount"
  > {
  areasOfUse: { slug: string; name: string }[];
}

export interface ToolsConnection {
  nodes: ToolSearchNode[];
  pageInfo: PageInfo;
  totalCount: number;
}

// Raw GraphQL wire shape for a search result node: `type` / `licensingModel`
// come back as UPPER_SNAKE_CASE enum constants (see lib/graphql/enumCasing.ts).
export interface ToolSearchNodeWire {
  slug: string;
  name: string;
  type: string;
  summary: string;
  licensingModel: string;
  logoImageUrl: string | null;
  hasBuiltInEditor: boolean;
  confirmedCommercialTitlesCount: number | null;
  toolAreaOfUses: { nodes: { areaOfUse: { slug: string; name: string } }[] };
}

export interface ToolsConnectionWire {
  nodes: ToolSearchNodeWire[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface AreaOfUseOption {
  slug: string;
  name: string;
  parentSlug: string | null;
}

export interface FacetOptions {
  platforms: { slug: string; name: string }[];
  languages: { slug: string; name: string }[];
  areas: AreaOfUseOption[];
}

export interface PopularityToolNode {
  slug: string;
  name: string;
  confirmedCommercialTitlesCount: number;
  confirmedTitlesAsOf: string | null;
}

export interface PopularityChartData {
  topTools: PopularityToolNode[];
  missingCount: number;
}

// Detail page (app-spec §8) — the full toolBySlug shape, mapped to domain
// enum casing. `relationships` is the merged/deduped 1-hop neighborhood (see
// lib/graphql/tool.ts) feeding both the ToolGraph and its text fallback.
export interface ToolDetailLink {
  type: ToolLinkType;
  url: string;
  label: string | null;
}

export interface ToolDetailAreaOfUse {
  slug: string;
  name: string;
  parentSlug: string | null;
  parentName: string | null;
}

export interface ToolDetailPlatform {
  role: PlatformRole;
  slug: string;
  name: string;
}

export interface ToolDetailGame extends Game {
  storeLinks: GameStoreLink[];
}

export interface ToolDetailRelationshipNode {
  slug: string;
  name: string;
  type: ToolType;
  logoImageUrl: string | null;
}

export interface ToolDetailRelationship {
  relationshipId: string;
  type: RelationshipType;
  note: string | null;
  mirrored: boolean;
  sourceTool: ToolDetailRelationshipNode;
  targetTool: ToolDetailRelationshipNode;
}

export interface ToolDetail extends Tool {
  links: ToolDetailLink[];
  areasOfUse: ToolDetailAreaOfUse[];
  platforms: ToolDetailPlatform[];
  languages: Language[];
  exampleGames: ToolDetailGame[];
  relationships: ToolDetailRelationship[];
}
