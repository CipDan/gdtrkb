// GDTRKB — PostGraphile query guardrails (public-endpoint hardening)
//
// docs/deployment.md and docs/schema-spec.md §6.1 both flag query
// cost/pagination limits as the one hardening item this project deferred,
// naming only two remedies: PostGraphile Pro (paid) or custom middleware.
// This is that middleware, wired into server.js via the plugin hook system
// (postgraphile:validationRules / :static — see
// node_modules/postgraphile/build/postgraphile/pluginHook.d.ts) rather than
// a graphile-build schema plugin, since it only needs the request's parsed
// AST and variables, not schema-building internals.
//
// Deepest query any app code sends today is TOOLS_SEARCH_QUERY at depth 5
// (tools > nodes > toolAreaOfUses > nodes > areaOfUse > slug/name); largest
// `first` is PAGE_SIZE/CHART_SIZE at 10. Both limits below give ~10x
// headroom over that for legitimate future queries while still rejecting
// the deeply-nested-relation or huge-page-size requests a public,
// unauthenticated GraphQL endpoint is otherwise wide open to.
const { Kind, GraphQLError } = require("graphql");
const depthLimit = require("graphql-depth-limit");

const MAX_QUERY_DEPTH = 10;
const MAX_PAGE_SIZE = 100;

// Walks every connection selection in the document (at any nesting level,
// so a facet's relation sub-connection is covered too, not just the root
// `tools` connection) — a field whose selection set contains `nodes` or
// `edges` — and rejects it unless it carries a `first`/`last` argument that
// resolves to a finite number no greater than MAX_PAGE_SIZE. Without this,
// a connection selection with no `first`/`last` at all falls through to
// PostGraphile's default of returning every row, which is the same
// unbounded-response risk as an oversized `first` — just spelled by
// omission instead of a huge literal.
// Resolves both literal values (`first: 5000`) and variable references
// (`first: $n`), the latter via the `variables` object PostGraphile's
// `postgraphile:validationRules` hook passes in from the actual parsed
// request body — not available on GraphQL's ValidationContext itself, which
// only sees the AST (variable *values* aren't bound until execution).
function maxPageSizeRule(variables) {
  return (context) => {
    const literalDefaults = {};
    for (const definition of context.getDocument().definitions) {
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
      for (const varDef of definition.variableDefinitions || []) {
        if (varDef.defaultValue && varDef.defaultValue.kind === Kind.INT) {
          literalDefaults[varDef.variable.name.value] = parseInt(
            varDef.defaultValue.value,
            10,
          );
        }
      }
    }

    function resolveArgValue(argNode) {
      if (!argNode) return undefined;
      if (argNode.value.kind === Kind.INT) {
        return parseInt(argNode.value.value, 10);
      }
      if (argNode.value.kind === Kind.VARIABLE) {
        const varName = argNode.value.name.value;
        return variables && variables[varName] !== undefined
          ? variables[varName]
          : literalDefaults[varName];
      }
      return undefined;
    }

    return {
      Field(node) {
        // Only connection-shaped selections (`{ nodes { ... } }` /
        // `{ edges { ... } }`) can return unbounded row sets — plain
        // scalar/object fields and `{ totalCount }`-only selections (e.g.
        // POPULARITY_CHART_QUERY's `missing` count) don't fetch rows and
        // need no cap.
        const selections = node.selectionSet && node.selectionSet.selections;
        const isConnectionSelection =
          selections &&
          selections.some(
            (selection) =>
              selection.kind === Kind.FIELD &&
              (selection.name.value === "nodes" ||
                selection.name.value === "edges"),
          );
        if (!isConnectionSelection) return;

        const args = node.arguments || [];
        const firstArg = args.find((arg) => arg.name.value === "first");
        const lastArg = args.find((arg) => arg.name.value === "last");

        if (!firstArg && !lastArg) {
          context.reportError(
            new GraphQLError(
              `Connection field "${node.name.value}" must specify a "first" or "last" argument (max ${MAX_PAGE_SIZE}).`,
              node,
            ),
          );
          return;
        }

        for (const argNode of [firstArg, lastArg]) {
          if (!argNode) continue;
          const value = resolveArgValue(argNode);

          if (typeof value !== "number" || !Number.isFinite(value)) {
            context.reportError(
              new GraphQLError(
                `Argument "${argNode.name.value}" on "${node.name.value}" must resolve to a finite number (max ${MAX_PAGE_SIZE}).`,
                argNode,
              ),
            );
          } else if (value > MAX_PAGE_SIZE) {
            context.reportError(
              new GraphQLError(
                `Argument "${argNode.name.value}" must not exceed ${MAX_PAGE_SIZE}.`,
                argNode,
              ),
            );
          }
        }
      },
    };
  };
}

module.exports = {
  MAX_QUERY_DEPTH,
  MAX_PAGE_SIZE,
  // Static rules (schema + AST only) run on every request, cacheable by
  // PostGraphile's query cache — this is the hook PostGraphile's own docs
  // recommend when a rule doesn't need per-request data.
  "postgraphile:validationRules:static": (rules) => [
    ...rules,
    depthLimit(MAX_QUERY_DEPTH),
  ],
  // Needs the request's actual variables, so it can't be static/cached.
  "postgraphile:validationRules": (rules, { variables }) => [
    ...rules,
    maxPageSizeRule(variables),
  ],
};
