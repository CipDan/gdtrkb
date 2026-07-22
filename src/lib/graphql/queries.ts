import "server-only";
import { gql } from "graphql-request";

// Matches docs/app-spec.md §4 and docs/schema-spec.md §5.2c/§5.2d.
export const TOOLS_SEARCH_QUERY = gql`
  query ToolsSearch(
    $filter: ToolFilter
    $orderBy: [ToolsOrderBy!]
    $first: Int
    $after: Cursor
  ) {
    tools(filter: $filter, orderBy: $orderBy, first: $first, after: $after) {
      nodes {
        slug
        name
        type
        summary
        licensingModel
        logoImageUrl
        hasBuiltInEditor
        confirmedCommercialTitlesCount
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;
