import "server-only";
import type { Tool } from "@/types";

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
  areasOfUse: { slug: string; name: string }[];
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
