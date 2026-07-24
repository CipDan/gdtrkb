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
      orderBy: [CONFIRMED_COMMERCIAL_TITLES_COUNT_DESC, ID_ASC]
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

// All tool slugs — feeds generateStaticParams for /tools/[slug] (app-spec §5
// item 1). `first: 100` is the same guardrail-cap convention as
// FACET_OPTIONS_QUERY; the catalog is a few dozen rows.
export const TOOL_SLUGS_QUERY = gql`
  query ToolSlugs {
    tools(first: 100) {
      nodes {
        slug
      }
    }
  }
`;

// Detail page (app-spec §8, schema-spec §5.2a). Relationship edges are
// fetched in both directions — `toolRelationshipBidirectionalsBySourceToolId`
// alone (as schema-spec §5.2f's example filters) misses directional edges
// where this tool is the target (e.g. "Blender EXPORTS_TO Unity" doesn't
// show up on Unity's page from the source-only query) — only the mirrored
// PAIRS_WELL_WITH rows are guaranteed to appear from either side. The two
// connections are merged and deduped by relationshipId in lib/graphql/tool.ts.
export const TOOL_BY_SLUG_QUERY = gql`
  query ToolBySlug($slug: String!) {
    toolBySlug(slug: $slug) {
      slug
      name
      type
      summary
      hasBuiltInEditor
      licensingModel
      licensingNote
      logoImageUrl
      logoImageSource
      confirmedCommercialTitlesCount
      confirmedTitlesAsOf
      confirmedTitlesSource
      toolLinks(first: 20) {
        nodes {
          type
          url
          label
        }
      }
      toolAreaOfUses(first: 20) {
        nodes {
          areaOfUse {
            slug
            name
            parent {
              slug
              name
            }
          }
        }
      }
      toolPlatforms(first: 30) {
        nodes {
          role
          platform {
            slug
            name
          }
        }
      }
      toolLanguages(first: 20) {
        nodes {
          language {
            slug
            name
          }
        }
      }
      toolGames(first: 10) {
        nodes {
          game {
            slug
            name
            developer
            publisher
            releaseYear
            bannerImageUrl
            bannerImageSource
            gameStoreLinks(first: 10) {
              nodes {
                storeLabel
                url
              }
            }
          }
        }
      }
      outEdges: toolRelationshipBidirectionalsBySourceToolId(first: 30) {
        nodes {
          relationshipId
          type
          note
          mirrored
          sourceTool {
            slug
            name
            type
            logoImageUrl
          }
          targetTool {
            slug
            name
            type
            logoImageUrl
          }
        }
      }
      inEdges: toolRelationshipBidirectionalsByTargetToolId(first: 30) {
        nodes {
          relationshipId
          type
          note
          mirrored
          sourceTool {
            slug
            name
            type
            logoImageUrl
          }
          targetTool {
            slug
            name
            type
            logoImageUrl
          }
        }
      }
    }
  }
`;
