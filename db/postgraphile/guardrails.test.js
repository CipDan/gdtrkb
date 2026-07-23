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

console.log("guardrails.test.js: ok");
