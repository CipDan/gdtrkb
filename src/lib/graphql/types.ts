import "server-only";
import type { Tool } from "@/types";

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export type ToolSearchNode = Pick<
  Tool,
  | "slug"
  | "name"
  | "type"
  | "summary"
  | "licensingModel"
  | "logoImageUrl"
  | "hasBuiltInEditor"
  | "confirmedCommercialTitlesCount"
>;

export interface ToolsConnection {
  nodes: ToolSearchNode[];
  pageInfo: PageInfo;
  totalCount: number;
}
