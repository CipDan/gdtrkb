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
// Largest query any app code sends today is TOOLS_SEARCH_QUERY at ~19 field
// selections; 200 gives ~10x headroom for legitimate future queries while
// still rejecting alias-batching documents — e.g. hundreds of differently
// aliased copies of the same shallow, small-`first` connection, each of
// which individually satisfies MAX_QUERY_DEPTH and MAX_PAGE_SIZE but which
// collectively multiply resolver/DB work far beyond either check's reach.
const MAX_QUERY_COST = 200;

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
// Resolves whether a selection set exposes a `nodes`/`edges` field, looking
// through named-fragment spreads and inline fragments (not just direct
// fields) so a connection wrapped in `...ToolConnectionFields` can't skip
// the page-size check. `visitedFragmentNames` guards against fragment
// cycles — invalid GraphQL that the built-in NoFragmentCyclesRule also
// rejects, but rule execution order isn't guaranteed, so this rule must not
// infinitely recurse on a maliciously cyclic document first.
function selectionSetHasConnectionShape(
  selections,
  fragmentsByName,
  visitedFragmentNames,
) {
  if (!selections) return false;
  for (const selection of selections) {
    if (
      selection.kind === Kind.FIELD &&
      (selection.name.value === "nodes" || selection.name.value === "edges")
    ) {
      return true;
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (
        selectionSetHasConnectionShape(
          selection.selectionSet && selection.selectionSet.selections,
          fragmentsByName,
          visitedFragmentNames,
        )
      ) {
        return true;
      }
    }
    if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentName = selection.name.value;
      const fragment = fragmentsByName[fragmentName];
      if (!fragment || visitedFragmentNames.has(fragmentName)) continue;
      visitedFragmentNames.add(fragmentName);
      const found = selectionSetHasConnectionShape(
        fragment.selectionSet && fragment.selectionSet.selections,
        fragmentsByName,
        visitedFragmentNames,
      );
      visitedFragmentNames.delete(fragmentName);
      if (found) return true;
    }
  }
  return false;
}

// Total number of field selections reachable from `selections`, expanding
// fragment spreads and inline fragments in place (so a fragment spread
// twice in the same operation counts its fields twice — no memoization by
// fragment name, since the cost is per occurrence, not per fragment
// definition). This is the same traversal shape as
// selectionSetHasConnectionShape, reused here for a different purpose:
// counting rather than shape-detection. `visitedFragmentNames` is a guard
// against cycles along the current path only (pushed/popped per branch),
// not a memo, matching that function's cycle-safety approach.
function countFieldsInSelectionSet(
  selections,
  fragmentsByName,
  visitedFragmentNames,
) {
  if (!selections) return 0;
  let count = 0;
  for (const selection of selections) {
    if (selection.kind === Kind.FIELD) {
      count +=
        1 +
        countFieldsInSelectionSet(
          selection.selectionSet && selection.selectionSet.selections,
          fragmentsByName,
          visitedFragmentNames,
        );
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      count += countFieldsInSelectionSet(
        selection.selectionSet && selection.selectionSet.selections,
        fragmentsByName,
        visitedFragmentNames,
      );
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragmentName = selection.name.value;
      const fragment = fragmentsByName[fragmentName];
      if (!fragment || visitedFragmentNames.has(fragmentName)) continue;
      visitedFragmentNames.add(fragmentName);
      count += countFieldsInSelectionSet(
        fragment.selectionSet && fragment.selectionSet.selections,
        fragmentsByName,
        visitedFragmentNames,
      );
      visitedFragmentNames.delete(fragmentName);
    }
  }
  return count;
}

// Caps total field/alias count per operation. Depth-limit and the
// per-connection page-size rule each bound one dimension of a query, but
// neither stops a document that stays shallow and keeps every individual
// `first` under MAX_PAGE_SIZE while replicating a field hundreds of times
// under different aliases — GraphQL has no rule against selecting the same
// field twice with different aliases, and each aliased copy is a real,
// separate resolver call. AST/schema-only (no variables needed to count
// selections), so this runs as a static rule alongside depthLimit.
function maxQueryCostRule() {
  return (context) => {
    const fragmentsByName = {};
    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragmentsByName[definition.name.value] = definition;
      }
    }

    return {
      OperationDefinition(node) {
        const cost = countFieldsInSelectionSet(
          node.selectionSet && node.selectionSet.selections,
          fragmentsByName,
          new Set(),
        );
        if (cost > MAX_QUERY_COST) {
          const label = node.name ? `"${node.name.value}"` : "(anonymous)";
          context.reportError(
            new GraphQLError(
              `Operation ${label} selects ${cost} fields, exceeding the maximum of ${MAX_QUERY_COST}.`,
              node,
            ),
          );
        }
      },
    };
  };
}

function maxPageSizeRule(variables) {
  return (context) => {
    // Keyed by OperationDefinition node, not variable name: a document can
    // contain several named operations (only one of which actually executes,
    // per the request's operationName), and each has its own independent
    // variable scope. Two operations are free to declare a same-named
    // variable with different defaults (or no default at all) — a single
    // flat, document-wide map would let one operation's default leak into
    // another's resolution and mask a missing default as a safe one.
    const literalDefaultsByOperation = new Map();
    const fragmentsByName = {};
    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragmentsByName[definition.name.value] = definition;
        continue;
      }
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
      const defaults = {};
      for (const varDef of definition.variableDefinitions || []) {
        if (varDef.defaultValue && varDef.defaultValue.kind === Kind.INT) {
          defaults[varDef.variable.name.value] = parseInt(
            varDef.defaultValue.value,
            10,
          );
        }
      }
      literalDefaultsByOperation.set(definition, defaults);
    }

    function resolveArgValue(argNode, literalDefaults) {
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
      // `ancestors` (the visitor's 5th arg, standard for graphql-js's
      // `visit()`) lets us find the OperationDefinition this field is
      // actually nested in, so its defaults don't bleed into a sibling
      // operation's fields. Operation definitions can't nest inside one
      // another, so at most one ancestor will ever match.
      Field(node, _key, _parent, _path, ancestors) {
        // Only connection-shaped selections (`{ nodes { ... } }` /
        // `{ edges { ... } }`) can return unbounded row sets — plain
        // scalar/object fields and `{ totalCount }`-only selections (e.g.
        // POPULARITY_CHART_QUERY's `missing` count) don't fetch rows and
        // need no cap. Looks through fragment spreads/inline fragments too,
        // not just direct fields.
        const selections = node.selectionSet && node.selectionSet.selections;
        const isConnectionSelection = selectionSetHasConnectionShape(
          selections,
          fragmentsByName,
          new Set(),
        );
        if (!isConnectionSelection) return;

        const operationAncestor = ancestors.find(
          (ancestor) =>
            !Array.isArray(ancestor) &&
            ancestor.kind === Kind.OPERATION_DEFINITION,
        );
        const literalDefaults = operationAncestor
          ? literalDefaultsByOperation.get(operationAncestor)
          : {};

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
          const value = resolveArgValue(argNode, literalDefaults);

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
  MAX_QUERY_COST,
  // Static rules (schema + AST only) run on every request, cacheable by
  // PostGraphile's query cache — this is the hook PostGraphile's own docs
  // recommend when a rule doesn't need per-request data.
  "postgraphile:validationRules:static": (rules) => [
    ...rules,
    depthLimit(MAX_QUERY_DEPTH),
    maxQueryCostRule(),
  ],
  // Needs the request's actual variables, so it can't be static/cached.
  "postgraphile:validationRules": (rules, { variables }) => [
    ...rules,
    maxPageSizeRule(variables),
  ],
};
