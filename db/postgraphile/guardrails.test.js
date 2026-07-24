// Regression tests for guardrails.js's hand-rolled validation rules.
// Run directly: node db/postgraphile/guardrails.test.js
//
// No schema is needed here — none of these rules touch schema type info,
// only context.getDocument()/reportError(), so a minimal fake
// ValidationContext plus graphql's own visit() exercises the real logic.
const assert = require("node:assert");
const { parse, visit } = require("graphql");
const guardrails = require("./guardrails");

function collectErrors(query, variables) {
  const documentAST = parse(query);
  const errors = [];
  const context = {
    getDocument: () => documentAST,
    reportError: (error) => errors.push(error),
  };
  const [rule] = guardrails["postgraphile:validationRules"]([], {
    variables,
  });
  visit(documentAST, rule(context));
  return errors;
}

// Static rules (depthLimit, maxQueryCostRule) don't all follow the
// visitor-object shape: graphql-depth-limit runs its own traversal
// synchronously inside the call and returns the same context it was given,
// rather than a visitor map for us to drive. Detect that by identity so
// either rule shape works here.
function collectStaticErrors(query) {
  const documentAST = parse(query);
  const errors = [];
  const context = {
    getDocument: () => documentAST,
    reportError: (error) => errors.push(error),
  };
  for (const rule of guardrails["postgraphile:validationRules:static"]([])) {
    const result = rule(context);
    if (result && result !== context) {
      visit(documentAST, result);
    }
  }
  return errors;
}

// Two named operations sharing a variable name ($first), one with a
// literal default and one without. Neither the request's variables nor the
// AST supplies a value for either operation's $first, isolating exactly
// what the fix is about: per-operation default resolution.
const query = `
  query WithoutDefault($first: Int) {
    tools(first: $first) {
      nodes { id }
    }
  }

  query WithDefault($first: Int = 10) {
    tools(first: $first) {
      nodes { id }
    }
  }
`;

const errors = collectErrors(query, {});

// WithDefault's own $first default (10) is under MAX_PAGE_SIZE, so it must
// produce no error. WithoutDefault has no default and no supplied value, so
// it must be rejected — if the fix regressed to a flat/shared defaults map,
// it would wrongly borrow WithDefault's 10 and this would be 0 errors.
assert.strictEqual(
  errors.length,
  1,
  `expected exactly 1 error (from WithoutDefault), got ${errors.length}: ${errors.map((e) => e.message).join("; ")}`,
);
assert.match(errors[0].message, /must resolve to a finite number/);

// Alias-batching: a document that stays shallow (depth 1, under
// MAX_QUERY_DEPTH) and has no connections (so maxPageSizeRule never fires)
// but replicates a field hundreds of times under distinct aliases. Neither
// depth-limit nor the per-connection page-size rule catches this; only the
// total field-count budget should.
function buildAliasBatchQuery(aliasCount) {
  const fields = Array.from(
    { length: aliasCount },
    (_, i) => `a${i}: field`,
  ).join("\n");
  return `query ManyAliases {\n${fields}\n}`;
}

const underBudgetErrors = collectStaticErrors(buildAliasBatchQuery(5));
assert.strictEqual(
  underBudgetErrors.length,
  0,
  `expected no errors for a 5-field operation, got: ${underBudgetErrors.map((e) => e.message).join("; ")}`,
);

const overBudgetErrors = collectStaticErrors(
  buildAliasBatchQuery(guardrails.MAX_QUERY_COST + 50),
);
assert.strictEqual(
  overBudgetErrors.length,
  1,
  `expected exactly 1 error for an over-budget operation, got ${overBudgetErrors.length}: ${overBudgetErrors.map((e) => e.message).join("; ")}`,
);
assert.match(overBudgetErrors[0].message, /exceeding the maximum/);

// Exponential fragment-spread blowup: a chain of N fragments where each
// spreads the previous one twice. Un-memoized, evaluating the outermost
// fragment costs O(2^N) traversal work; memoized by fragment name it's
// O(N). Asserts both correctness (the true, exponential field count is
// still detected and rejected) and speed (completes well under a second
// even for N=60, where an un-memoized traversal would never return).
function buildFragmentChainQuery(chainLength) {
  let fragments = "fragment F0 on Query { x }\n";
  for (let i = 1; i <= chainLength; i++) {
    fragments += `fragment F${i} on Query { ...F${i - 1} ...F${i - 1} }\n`;
  }
  return fragments + `query Deep { ...F${chainLength} }`;
}

// Exercises maxQueryCostRule only, not the full static-rules pipeline:
// "postgraphile:validationRules:static" also wires in the third-party
// graphql-depth-limit package (rules[0]), whose own fragment-spread
// traversal (determineDepth in graphql-depth-limit/index.js) is separately
// non-memoized and would dominate this timing, masking whether *this*
// fix works. rules[1] is maxQueryCostRule() — see the static-rules array
// in guardrails.js's module.exports.
function collectCostRuleErrors(query) {
  const documentAST = parse(query);
  const errors = [];
  const context = {
    getDocument: () => documentAST,
    reportError: (error) => errors.push(error),
  };
  const rules = guardrails["postgraphile:validationRules:static"]([]);
  visit(documentAST, rules[1](context));
  return errors;
}

const chainLength = 60;
const fragmentChainStart = Date.now();
const fragmentChainErrors = collectCostRuleErrors(
  buildFragmentChainQuery(chainLength),
);
const fragmentChainElapsedMs = Date.now() - fragmentChainStart;

assert.ok(
  fragmentChainElapsedMs < 1000,
  `expected memoized traversal to finish in under 1s, took ${fragmentChainElapsedMs}ms`,
);
assert.strictEqual(
  fragmentChainErrors.length,
  1,
  `expected exactly 1 error for a ${chainLength}-deep fragment chain, got ${fragmentChainErrors.length}`,
);
assert.match(fragmentChainErrors[0].message, /exceeding the maximum/);

// guardedDepthLimit: caps total FRAGMENT_SPREAD occurrences in the raw
// document before ever calling the third-party graphql-depth-limit
// package, whose own fragment expansion (determineDepth) has the same
// unmemoized-recursion problem as this file's own two functions above, just
// living in a dependency this file doesn't control. These check three
// things: a document with exactly MAX_FRAGMENT_SPREADS spreads still
// passes, one over the cap is rejected, and — the important regression
// guard — a plain over-depth query with no fragments at all is still
// caught by the real depthLimit, proving the wrapper delegates rather than
// silently disabling depth-limiting for ordinary documents.
function buildLinearFragmentChain(levels) {
  let fragments = "fragment F0 on Query { x }\n";
  for (let i = 1; i <= levels; i++) {
    fragments += `fragment F${i} on Query { ...F${i - 1} }\n`;
  }
  return fragments + `query Chain { ...F${levels} }`;
}

assert.strictEqual(
  collectStaticErrors(buildLinearFragmentChain(guardrails.MAX_FRAGMENT_SPREADS - 1))
    .length,
  0,
  "expected a document with exactly MAX_FRAGMENT_SPREADS spreads to pass",
);

const overSpreadCapErrors = collectStaticErrors(
  buildLinearFragmentChain(guardrails.MAX_FRAGMENT_SPREADS),
);
assert.strictEqual(
  overSpreadCapErrors.length,
  1,
  `expected exactly 1 error for a document one spread over the cap, got ${overSpreadCapErrors.length}`,
);
assert.match(
  overSpreadCapErrors[0].message,
  /fragment spreads, exceeding the maximum/,
);

function buildDeepNoFragmentsQuery(depth) {
  let inner = "leaf";
  for (let i = 0; i < depth; i++) inner = `field { ${inner} }`;
  return `query TooDeep { ${inner} }`;
}

const overDepthErrors = collectStaticErrors(
  buildDeepNoFragmentsQuery(guardrails.MAX_QUERY_DEPTH + 2),
);
assert.strictEqual(
  overDepthErrors.length,
  1,
  `expected the real depthLimit to still reject a plain over-depth query, got ${overDepthErrors.length}: ${overDepthErrors.map((e) => e.message).join("; ")}`,
);
assert.match(overDepthErrors[0].message, /exceeds maximum operation depth/);

assert.strictEqual(
  collectStaticErrors(
    buildDeepNoFragmentsQuery(guardrails.MAX_QUERY_DEPTH - 2),
  ).length,
  0,
  "expected a plain under-depth query with no fragments to pass",
);

// Full pipeline, not just maxQueryCostRule in isolation: confirms
// guardedDepthLimit itself resolves the attack chain fast (rather than
// falling through to the vulnerable depthLimit) and reports its own
// fragment-spread-cap error alongside maxQueryCostRule's.
const attackChainStart = Date.now();
const attackChainErrors = collectStaticErrors(
  buildFragmentChainQuery(chainLength),
);
const attackChainElapsedMs = Date.now() - attackChainStart;

assert.ok(
  attackChainElapsedMs < 1000,
  `expected guardedDepthLimit to reject the attack chain fast, took ${attackChainElapsedMs}ms`,
);
assert.ok(
  attackChainErrors.some((e) =>
    /fragment spreads, exceeding the maximum/.test(e.message),
  ),
  `expected a fragment-spread-cap error among: ${attackChainErrors.map((e) => e.message).join("; ")}`,
);

// --- maxPageSizeRule: exact MAX_PAGE_SIZE boundary (source condition is
// `value > MAX_PAGE_SIZE`, so the limit itself must pass and one over must
// fail) — the two-operation-default case above never exercises this. ---
assert.strictEqual(
  collectErrors(
    `query AtLimit { tools(first: ${guardrails.MAX_PAGE_SIZE}) { nodes { id } } }`,
    {},
  ).length,
  0,
  "expected first: MAX_PAGE_SIZE to pass",
);
const overLimitErrors = collectErrors(
  `query OverLimit { tools(first: ${guardrails.MAX_PAGE_SIZE + 1}) { nodes { id } } }`,
  {},
);
assert.strictEqual(
  overLimitErrors.length,
  1,
  `expected first: MAX_PAGE_SIZE+1 to fail, got ${overLimitErrors.length}`,
);
assert.match(overLimitErrors[0].message, /must not exceed/);

// A connection selection with neither `first` nor `last` falls through to
// PostGraphile's default of returning every row — the same unbounded-response
// risk as an oversized `first`, just spelled by omission — so it must be
// rejected too.
const noArgErrors = collectErrors(`query NoArg { tools { nodes { id } } }`, {});
assert.strictEqual(
  noArgErrors.length,
  1,
  "expected a connection with no first/last to be rejected",
);
assert.match(noArgErrors[0].message, /must specify a "first" or "last" argument/);

// `last` is checked the same way as `first` — both branches of the
// `for (const argNode of [firstArg, lastArg])` loop.
assert.strictEqual(
  collectErrors(
    `query LastOk { tools(last: ${guardrails.MAX_PAGE_SIZE}) { nodes { id } } }`,
    {},
  ).length,
  0,
  "expected last: MAX_PAGE_SIZE to pass",
);
assert.strictEqual(
  collectErrors(
    `query LastTooBig { tools(last: ${guardrails.MAX_PAGE_SIZE + 1}) { nodes { id } } }`,
    {},
  ).length,
  1,
  "expected last: MAX_PAGE_SIZE+1 to fail",
);

// A field whose selection set has neither `nodes` nor `edges` isn't
// connection-shaped (e.g. a `{ totalCount }`-only selection, matching
// POPULARITY_CHART_QUERY's `missing` field) and needs no first/last cap.
assert.strictEqual(
  collectErrors(`query CountOnly { tools { totalCount } } `, {}).length,
  0,
  "expected a non-connection (totalCount-only) selection to need no first/last",
);

// A connection reached only through a fragment spread must still be capped —
// selectionSetHasConnectionShape looks through `...Fields` rather than only
// direct `nodes`/`edges` children.
const fragmentWrappedErrors = collectErrors(
  `query WithFragment { tools { ...ConnFields } }
   fragment ConnFields on ToolsConnection { nodes { id } }`,
  {},
);
assert.strictEqual(
  fragmentWrappedErrors.length,
  1,
  "expected a fragment-wrapped connection with no first/last to be rejected",
);

// Nested/relation connections are checked independently at every level: the
// outer connection can be within bounds while an inner relation connection
// (e.g. a facet's toolAreaOfUses sub-connection) is left uncapped.
const nestedErrors = collectErrors(
  `query Nested { tools(first: 10) { nodes { toolAreaOfUses { nodes { id } } } } }`,
  {},
);
assert.strictEqual(
  nestedErrors.length,
  1,
  `expected only the uncapped inner connection to be rejected, got ${nestedErrors.length}`,
);
assert.match(nestedErrors[0].message, /"toolAreaOfUses"/);

// A variable-*supplied* (not just default-supplied) value is resolved from
// the request's actual variables — the two-operation-default test above only
// exercises the literalDefaults fallback path, never a real supplied value.
assert.strictEqual(
  collectErrors(`query ByVar($n: Int) { tools(first: $n) { nodes { id } } }`, {
    n: guardrails.MAX_PAGE_SIZE,
  }).length,
  0,
  "expected an in-bounds variable-supplied first to pass",
);
assert.strictEqual(
  collectErrors(`query ByVar($n: Int) { tools(first: $n) { nodes { id } } }`, {
    n: guardrails.MAX_PAGE_SIZE + 1,
  }).length,
  1,
  "expected an out-of-bounds variable-supplied first to fail",
);

// --- maxQueryCostRule: exact MAX_QUERY_COST boundary (source condition is
// `cost > MAX_QUERY_COST`) — the under/over-budget cases above use generous
// margins (5 and +50) and never exercise the limit itself. ---
assert.strictEqual(
  collectStaticErrors(buildAliasBatchQuery(guardrails.MAX_QUERY_COST)).length,
  0,
  "expected exactly MAX_QUERY_COST fields to pass",
);
const oneOverCostErrors = collectStaticErrors(
  buildAliasBatchQuery(guardrails.MAX_QUERY_COST + 1),
);
assert.strictEqual(
  oneOverCostErrors.length,
  1,
  `expected MAX_QUERY_COST + 1 fields to fail, got ${oneOverCostErrors.length}`,
);

// --- guardedDepthLimit: exact MAX_QUERY_DEPTH boundary, independent of the
// fragment-spread cap covered above. buildDeepNoFragmentsQuery(N) checks
// depthSoFar values 0..N against maxDepth (traced through
// graphql-depth-limit's determineDepth), so N == MAX_QUERY_DEPTH is the last
// value that passes and N == MAX_QUERY_DEPTH + 1 is the first that fails —
// the existing +2/-2 cases above never pin down the exact edge. ---
assert.strictEqual(
  collectStaticErrors(buildDeepNoFragmentsQuery(guardrails.MAX_QUERY_DEPTH))
    .length,
  0,
  "expected exactly MAX_QUERY_DEPTH levels to pass",
);
assert.strictEqual(
  collectStaticErrors(buildDeepNoFragmentsQuery(guardrails.MAX_QUERY_DEPTH + 1))
    .length,
  1,
  "expected MAX_QUERY_DEPTH + 1 levels to fail",
);

console.log("guardrails.test.js: ok");
