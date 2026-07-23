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
        toolAreaOfUses(first: 20) {
          nodes {
            areaOfUse {
              slug
              name
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

// Facet reference data — app-spec §5 item 3, schema-spec §5.1 collection
// queries. `first: 100` is a guardrail cap (db/postgraphile/guardrails.js),
// not a real limit — these reference tables hold a few dozen rows each.
export const FACET_OPTIONS_QUERY = gql`
  query FacetOptions {
    platforms(first: 100) {
      nodes {
        slug
        name
      }
    }
    languages(first: 100) {
      nodes {
        slug
        name
      }
    }
    areaOfUses(first: 100) {
      nodes {
        slug
        name
        parent {
          slug
        }
      }
    }
  }
`;

// Popularity chart data — app-spec §4/§5 item 4, schema-spec §5.2d.
export const POPULARITY_CHART_QUERY = gql`
  query PopularityChart($first: Int!) {
    topTools: tools(
      orderBy: CONFIRMED_COMMERCIAL_TITLES_COUNT_DESC
      first: $first
      filter: { confirmedCommercialTitlesCount: { isNull: false } }
    ) {
      nodes {
        slug
        name
        confirmedCommercialTitlesCount
        confirmedTitlesAsOf
      }
    }
    missing: tools(filter: { confirmedCommercialTitlesCount: { isNull: true } }) {
      totalCount
    }
  }
`;

// Total catalog size — used by the persistent header status line.
export const TOOL_TOTAL_COUNT_QUERY = gql`
  query ToolTotalCount {
    tools {
      totalCount
    }
  }
`;
