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

console.log("guardrails.test.js: ok");
