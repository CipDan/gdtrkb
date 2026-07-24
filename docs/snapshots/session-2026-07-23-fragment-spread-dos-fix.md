# Session log — memoize fragment-spread traversal in guardrails.js, then close the same exponential blowup in graphql-depth-limit (2026-07-23)

> Not a spec. This is a snapshot of the Claude Code conversation that fixed a CodeRabbit-flagged
> exponential-blowup DoS in `db/postgraphile/guardrails.js`'s own fragment-traversal helpers
> (`selectionSetHasConnectionShape` / `countFieldsInSelectionSet`), then — while validating that
> fix by actually timing it — discovered the identical unmemoized-recursion bug lives one call
> earlier in the pipeline, inside the third-party `graphql-depth-limit` package guardrails.js also
> wires in. That second finding led to a follow-up fix: a `guardedDepthLimit` wrapper that caps
> total fragment-spread occurrences before ever handing a document to the vulnerable dependency.
> User prompts and the assistant's substantive/final responses are reproduced verbatim; tool-call
> investigation (file reads, greps, timing scripts) is summarized narratively rather than pasted
> raw.

---

## 1. Fix: memoize fragment-spread traversal (CodeRabbit finding)

**User (code-review finding, applied to `db/postgraphile/guardrails.js:31-138`):**

> In @db/postgraphile/guardrails.js around lines 31 - 138, Memoize fragment traversal results in
> selectionSetHasConnectionShape and countFieldsInSelectionSet by fragment name, caching each
> fragment definition's connection-shape result or field count and reusing it for repeated
> spreads. Preserve the existing per-path cycle guard for cyclic fragments, while ensuring
> repeated non-cyclic spreads no longer recursively expand the same fragment.
>
> Refer to the CodeRabbit comment below as well:

CodeRabbit comment quoted verbatim in the prompt:

```diff
CodeRabbit
Unmemoized fragment-spread expansion enables an exponential-blowup DoS in the guardrails themselves.

selectionSetHasConnectionShape and countFieldsInSelectionSet re-expand every FRAGMENT_SPREAD occurrence from scratch, guarded only by a per-path cycle set, not memoized by fragment name. A client can send a small, shallow (low-depth) document defining a chain of fragments where each fragment spreads the previous one twice; evaluating the outermost fragment forces O(2^n) traversal work for just n fragment definitions. This runs synchronously inside the validation-rule callback, before any limit check can reject the query, and can pin the single Node.js event-loop thread — turning the anti-DoS guardrail into the DoS vector for a public, unauthenticated endpoint.

Memoize per-fragment-definition results (count / has-connection-shape) instead of re-expanding on every spread occurrence, since a fragment's own field count/shape is invariant across where it's spread.

-function countFieldsInSelectionSet(
-  selections,
-  fragmentsByName,
-  visitedFragmentNames,
-) {
+function countFieldsInSelectionSet(
+  selections,
+  fragmentsByName,
+  visitedFragmentNames,
+  memo = new Map(),
+) {
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
+          memo,
         );
     } else if (selection.kind === Kind.INLINE_FRAGMENT) {
       count += countFieldsInSelectionSet(
         selection.selectionSet && selection.selectionSet.selections,
         fragmentsByName,
         visitedFragmentNames,
+        memo,
       );
     } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
       const fragmentName = selection.name.value;
+      if (memo.has(fragmentName)) {
+        count += memo.get(fragmentName);
+        continue;
+      }
       const fragment = fragmentsByName[fragmentName];
       if (!fragment || visitedFragmentNames.has(fragmentName)) continue;
       visitedFragmentNames.add(fragmentName);
-      count += countFieldsInSelectionSet(
+      const fragmentCount = countFieldsInSelectionSet(
         fragment.selectionSet && fragment.selectionSet.selections,
         fragmentsByName,
         visitedFragmentNames,
+        memo,
       );
       visitedFragmentNames.delete(fragmentName);
+      memo.set(fragmentName, fragmentCount);
+      count += fragmentCount;
     }
   }
   return count;
 }
The same pattern (memoize by fragment name, add cached value on repeat spreads) applies to selectionSetHasConnectionShape.
```

The harness had already attached a full `Read` of `guardrails.js` as context, plus a listing of
the deferred-tool/agent/skill roster.

### Verifying the finding

**Assistant:**

> I'll verify this against the current file, which I've already read in full — the finding
> matches the code exactly: both `selectionSetHasConnectionShape` and `countFieldsInSelectionSet`
> re-expand every fragment spread from scratch with only a per-path cycle guard, no memoization
> by fragment name. This is a valid, confirmed issue. I'll apply the fix to both functions.

### The fix

Applied the memoization pattern from the diff to both functions (not just `countFieldsInSelectionSet`
as literally diffed — `selectionSetHasConnectionShape` got the identical treatment, per the
comment's closing note): both now take a `memo = new Map()` parameter threaded through every
recursive call, checked/populated at each `FRAGMENT_SPREAD` branch, while `visitedFragmentNames`
(the per-path cycle guard) is untouched.

### Validation — and an unplanned discovery

**Assistant:**

> Now let's check for existing tests covering guardrails, and run them plus a lint/syntax check.

Found `db/postgraphile/guardrails.test.js` (a plain Node script, not a Jest suite — `npx jest`
against it correctly failed with "must contain at least one test"). `node --check` passed and
`node db/postgraphile/guardrails.test.js` printed `ok`.

**Assistant:**

> Let me validate the fix actually neutralizes the exponential blowup with a quick timing check
> before deciding whether to add a permanent regression test.

Built a 40-fragment doubling chain (`fragment F_i on Query { ...F_(i-1) ...F_(i-1) }`) and ran it
through the full `postgraphile:validationRules:static` pipeline. The command blew past its
2-minute timeout and was moved to the background.

**Assistant:**

> That command's hanging past 2 minutes — before assuming my fix is broken, let me isolate
> whether the culprit is `maxQueryCostRule` (my fix) or the third-party `depthLimit` rule, which
> runs in the same static-rules array and might have its own unmemoized fragment expansion.

Stopped the hung background task and timed `depthLimit` alone (from `graphql-depth-limit`, the
npm package `guardrails.js` wires in for `MAX_QUERY_DEPTH`) in isolation across chain lengths:
N=10 → 3ms, N=15 → 24ms, N=20 → 454ms, N=25 → 12,657ms. Read
`db/postgraphile/node_modules/graphql-depth-limit/index.js` directly and found `determineDepth`'s
`FRAGMENT_SPREAD` case re-expands `fragments[node.name.value]` from scratch every time, with zero
memoization — the identical bug shape, living in a dependency, and (worse) fragment spreads don't
even increment `depthSoFar`, so the attack payload stays "shallow" by depth-limit's own metric.

Separately timed the actual patched functions (`maxQueryCostRule` alone, and
`selectionSetHasConnectionShape` via `maxPageSizeRule`) against chains up to N=60: both completed
in 1-3ms and produced correct results — `maxQueryCostRule` correctly computed and rejected the
true (astronomically large) field count in O(n) time rather than hanging.

Added a permanent regression test to `guardrails.test.js`: a 60-fragment doubling chain run
through `maxQueryCostRule` in isolation (explicitly bypassing `depthLimit`, with a comment
explaining why), asserting it finishes under 1 second and still reports the correct
"exceeding the maximum" rejection.

Reported both findings via the review tool: the memoization fix as `CONFIRMED` / `outcome: fixed`;
the `graphql-depth-limit` issue as a second `CONFIRMED` finding with `outcome: skipped` (out of
scope of the literal CodeRabbit comment, and not something to patch in a third-party package
unprompted).

**Assistant (final response for this finding):**

> ## Summary
>
> **Fixed** — `selectionSetHasConnectionShape` and `countFieldsInSelectionSet` in
> [guardrails.js](db/postgraphile/guardrails.js) now memoize each fragment's result by name (a
> `Map` threaded through the recursion, defaulted at the top-level call), so a fragment's
> shape/count is computed once and reused on every subsequent spread instead of re-expanded. The
> per-path cycle guard (`visitedFragmentNames`) is untouched. Added a regression test in
> [guardrails.test.js](db/postgraphile/guardrails.test.js) that builds a 60-fragment chain (each
> spreading the previous one twice — would be 2^60 un-memoized) and asserts it resolves in under a
> second with the correct (still-exponential, still-rejected) field count.
>
> **Important — found a related, unfixed issue while validating:** the same exact vulnerability
> exists in the third-party `graphql-depth-limit` package, which guardrails.js also wires in (as
> `depthLimit(MAX_QUERY_DEPTH)`, running *before* `maxQueryCostRule` in the static-rules array).
> Its `determineDepth` function re-expands every fragment spread with no memoization — and
> fragment spreads don't even count toward depth, so the payload stays "shallow" by its own
> metric. I measured a 25-fragment chain taking ~12.6s in `depthLimit` alone; 40 fragments
> effectively hangs. So the exact DoS this task was meant to close still fires, one call earlier
> in the pipeline, entirely inside a vendored dependency — my fix doesn't reach it. This wasn't
> part of the original CodeRabbit comment, so I left it alone rather than patching a third-party
> package unprompted, but you'll likely want to address it (options: vendor a patched copy,
> wrap/pre-filter fragment count before calling `depthLimit`, or swap dependencies).
>
> **To validate:** `node db/postgraphile/guardrails.test.js` — passes in ~1s.

---

## 2. Exploratory question: what would wrapping/pre-filtering entail?

**User:** "What would wrapping/pre-filtereing the fragment count entail?"

**Assistant:**

> Two variants, differing in effort and thoroughness:
>
> 1. **Pre-filter (cheap, coarse)** — before `depthLimit` runs, count `FRAGMENT_DEFINITION` nodes
> directly off `context.getDocument().definitions` (already a flat array, no traversal needed) and
> reject the document if it exceeds a small cap, e.g. 20-30. This works because the exponential
> blowup needs *many* chained fragment definitions to get dangerous — real app queries use at most
> a handful — so bounding the definition count bounds `2^n` to something trivial before
> `depthLimit` ever touches it. It doesn't fix `depthLimit` itself, just denies it the input that
> makes it slow.
>
> 2. **Wrap/replace `depthLimit`** — reimplement `determineDepth`'s logic ourselves with the same
> memoize-by-fragment-name approach we just applied to `guardrails.js`'s own functions, and stop
> calling the vulnerable library function. This actually fixes the root cause rather than capping
> the blast radius, but means forking and maintaining depth-computation logic that currently lives
> in a dependency.
>
> My recommendation: option 1 — it's a few lines, doesn't require understanding or maintaining a
> fork of `graphql-depth-limit`'s internals, and the fragment-count cap is a reasonable guardrail
> on its own merits (a document with 30+ named fragments is already suspicious for this app's
> query shapes). Want me to implement it?

---

## 3. Implementation: a fragment-spread cap gating `depthLimit`

**User:** "Please do so. After implementation, check that performed changes have not altered
existing workflow across files. If anything is unclear, ask for clarifications."

### 3.1 A gap found in the proposed approach, before writing any code

Grepped the app for existing fragment usage (`fragment\s+\w+\s+on\s+\w+`, plus a check of
`src/lib/graphql/*` for any `gql`/`graphql` tagged fragments) — confirmed the app sends zero
fragments today, matching guardrails.js's own header comment about today's query shapes.

Before implementing the "count fragment definitions" idea as pitched, worked through why it's
insufficient on its own: capping only the number of fragment *definitions* doesn't bound
per-fragment *fan-out*. A document with as few as 10 fragment definitions, each spreading the
previous one 100 times, blows up just as badly (100^10) as a long thin chain — and wouldn't be
caught by a definition-count cap of even 20 or 30. The real driver of cost is total spread
*occurrences*, not definition count.

Verified this empirically against the real `graphql-depth-limit` package rather than trusting the
theory alone, timing `depthLimit` across different fan-out shapes at matched total spread budgets:

| fanout | levels | total spreads | elapsed |
|---|---|---|---|
| 2 | 15 | 31 | 24ms |
| 3 | 10 | 31 | 32ms |
| 4 | 8 | 33 | 14ms |
| 2 | 20 | 41 | 340ms |
| 3 | 13 | 40 | 471ms |
| 4 | 10 | 41 | 277ms |

Timing tracked total spread count almost independent of shape (all ~14-32ms at ~31-33 spreads;
all ~277-471ms at ~40-41), confirming total `FRAGMENT_SPREAD` occurrences — not fragment
definition count — is the right metric, and settled on **30** as the cap: comfortably in the
tens-of-milliseconds range for any shape, with generous headroom over today's zero-fragment
baseline.

### 3.2 The fix

Added to `db/postgraphile/guardrails.js`:

```js
const { Kind, GraphQLError, visit } = require("graphql");
const depthLimit = require("graphql-depth-limit");

// ... (MAX_QUERY_DEPTH, MAX_PAGE_SIZE, MAX_QUERY_COST unchanged) ...

const MAX_FRAGMENT_SPREADS = 30;

function countFragmentSpreads(documentAST) {
  let count = 0;
  visit(documentAST, {
    FragmentSpread() {
      count++;
    },
  });
  return count;
}

function guardedDepthLimit(maxDepth) {
  const depthLimitRule = depthLimit(maxDepth);
  return (context) => {
    const spreadCount = countFragmentSpreads(context.getDocument());
    if (spreadCount > MAX_FRAGMENT_SPREADS) {
      context.reportError(
        new GraphQLError(
          `Document contains ${spreadCount} fragment spreads, exceeding the maximum of ${MAX_FRAGMENT_SPREADS}.`,
        ),
      );
      return {};
    }
    return depthLimitRule(context);
  };
}
```

Swapped `depthLimit(MAX_QUERY_DEPTH)` for `guardedDepthLimit(MAX_QUERY_DEPTH)` in the
`postgraphile:validationRules:static` export, and added `MAX_FRAGMENT_SPREADS` to `module.exports`
alongside the other constants.

### 3.3 Validation

Ran a targeted verification script (not committed) covering four cases through the full static
rules pipeline: a legit shallow query with no fragments (0 errors); a plain 12-deep nested query
with no fragments (still correctly rejected by the real `depthLimit` — `"'Deep' exceeds maximum
operation depth of 10"`, proving the wrapper delegates rather than disabling depth-limiting); a
small, legitimate 2-fragment reuse chain (0 errors); and the original 60-level doubling attack
chain (121 total spreads), now rejected in **7ms** with two errors — the new spread-count cap
*and* the (already-fixed) `maxQueryCostRule` both firing, since GraphQL validation collects all
rule errors rather than short-circuiting.

Verified the exact cap boundary: a 29-level linear chain (30 total spreads, at the cap) produces
0 errors; a 30-level chain (31 spreads) produces exactly 1 error,
`"Document contains 31 fragment spreads, exceeding the maximum of 30."` Also verified
`MAX_QUERY_DEPTH ± 2` boundaries on a plain fragment-free query to confirm the real depth check
still fires correctly on both sides.

Added all of the above as permanent tests in `guardrails.test.js` (cap-boundary pass/fail, real
over-depth detection surviving the wrapper, and the full-pipeline attack-chain timing/error
assertions), then ran the complete suite via `node db/postgraphile/guardrails.test.js` and via
`npm test` in `db/postgraphile` — both passed in about a second.

Checked every other file in the repo referencing `guardrails.js` — `db/postgraphile/server.js`
(`makePluginHook([guardrails])`, unaffected: both hook keys and their function signatures are
unchanged), `src/lib/graphql/queries.ts` (only a comment reference to `MAX_PAGE_SIZE`, unaffected),
`db/postgraphile/package.json` (`"test": "node guardrails.test.js"`, unaffected), and
`db/postgraphile/Dockerfile` (`COPY server.js guardrails.js ./`, unaffected) — confirmed `git
status --short` shows only the two intended files modified.

**Assistant (final response for this finding):**

> ## Summary
>
> Implemented the pre-filter, refined from what I originally pitched: while measuring worst-case
> timings I found that capping just the *fragment definition count* would leave a gap (few
> fragments with high fan-out per fragment can blow up just as badly as a long thin chain with the
> same total edge count — confirmed empirically, since timing tracks total spread occurrences
> almost independent of shape). So the guard caps **total `FRAGMENT_SPREAD` occurrences in the raw
> document** instead.
>
> **Changes in [guardrails.js](db/postgraphile/guardrails.js):**
> - `MAX_FRAGMENT_SPREADS = 30`, with a `countFragmentSpreads()` helper that does one linear
> `visit()` pass over the *unexpanded* AST (can't itself blow up — it never follows a spread to
> its definition).
> - `guardedDepthLimit(maxDepth)` wraps the third-party `depthLimit`: checks the spread count
> first, and only delegates to the real (vulnerable) `depthLimit` call when it's within bounds;
> otherwise reports an error and skips the expensive call entirely.
> - Swapped `depthLimit(MAX_QUERY_DEPTH)` → `guardedDepthLimit(MAX_QUERY_DEPTH)` in the exported
> static rules array. Also exported `MAX_FRAGMENT_SPREADS`.
>
> **Verified no regressions:**
> - Ran the full existing test suite (`npm test` in `db/postgraphile`) — all prior assertions
> still pass unchanged.
> - Confirmed real depth-limiting still works: a plain, fragment-free over-depth query is still
> rejected by the actual `depthLimit` (the wrapper delegates, doesn't disable it).
> - Confirmed legitimate/shallow fragment reuse under the cap produces no false positives.
> - Checked every other file referencing `guardrails.js`
> ([server.js](db/postgraphile/server.js), [queries.ts](src/lib/graphql/queries.ts),
> `package.json`, `Dockerfile`) — none depend on anything I changed; the two PostGraphile hook
> keys and their function signatures are untouched.
> - Added permanent regression tests to [guardrails.test.js](db/postgraphile/guardrails.test.js)
> covering the cap boundary (30 passes, 31 rejected), real over-depth detection surviving the
> wrapper, and the original 60-fragment attack chain now resolving in milliseconds through the
> full pipeline instead of hanging.
>
> **To test:** `cd db/postgraphile && npm test` — passes in about a second.

---

## 4. Snapshot request

**User:** "Now draft a snapshot of this conversation. Keep prompts and responses verbatim. Follow
structure conventions applied to existing snapshots in the docs/snapshots folder. Save the draft
in said folder when done."

→ This document.

---

## Net code changes

- `db/postgraphile/guardrails.js`:
  - `selectionSetHasConnectionShape` and `countFieldsInSelectionSet` now take a `memo = new Map()`
    parameter, populated per fragment name on first evaluation and reused on every later spread of
    the same fragment, instead of re-expanding the fragment's whole subtree from scratch each
    time. The existing per-path cycle guard (`visitedFragmentNames`) is unchanged.
  - Added `MAX_FRAGMENT_SPREADS = 30`, `countFragmentSpreads()`, and `guardedDepthLimit()` — a
    wrapper around the third-party `depthLimit` (from `graphql-depth-limit`) that rejects a
    document outright once it contains more than 30 total `FRAGMENT_SPREAD` occurrences, before
    ever handing it to that package's own unmemoized, exponentially-recursive `determineDepth`.
  - `postgraphile:validationRules:static` now registers `guardedDepthLimit(MAX_QUERY_DEPTH)`
    instead of calling `depthLimit(MAX_QUERY_DEPTH)` directly. `MAX_FRAGMENT_SPREADS` is now
    exported alongside the other constants.
- `db/postgraphile/guardrails.test.js`:
  - Added a 60-fragment doubling-chain regression test isolating `maxQueryCostRule`, asserting it
    resolves in under a second and still correctly rejects the (astronomically large) true field
    count.
  - Added regression tests for `guardedDepthLimit`: exactly-at-the-cap and one-over-the-cap
    fragment-spread counts, a plain fragment-free query on both sides of `MAX_QUERY_DEPTH` (proving
    the wrapper still delegates to real depth-limiting), and the full static-rules pipeline run
    against the original attack chain, asserting it resolves in under a second.

## Lessons worth keeping

1. **Memoizing a recursive per-fragment computation fixes the traversal you own, not the same
   computation performed by a dependency.** `graphql-depth-limit`'s `determineDepth` has the
   identical unmemoized-recursion shape as the two functions fixed in §1 — but it's third-party
   code, so the fix in this file didn't (and couldn't) reach it. Finding it required actually
   timing the fix against the same adversarial payload, not just checking correctness.
2. **GraphQL's `validate()` calls every rule function to collect its visitor before any traversal
   happens, and it doesn't short-circuit on an earlier rule's error.** Reordering rules in the
   static-rules array would not have skipped `depthLimit`'s expensive call — the only way to skip
   it is to gate the call itself (`guardedDepthLimit`), not merely to sequence it after a cheaper
   rule.
3. **A cap chosen by the wrong metric leaves a hole a motivated attacker can walk through.**
   "Count fragment definitions" (the first idea, before implementation) sounds like it bounds the
   same exponential blowup, but a document with few definitions and high per-fragment fan-out
   reaches the same cost — the metric that actually drives runtime is total spread *occurrences*,
   verified empirically across several fan-out shapes at matched totals before trusting it enough
   to pick a threshold.
4. **When a proposed fix turns out to have a gap discovered mid-implementation, saying so and
   explaining the refinement is part of doing the task, not a detour from it** — the user's own
   instruction ("if anything is unclear, ask for clarifications") was satisfied by narrating the
   refinement and its empirical justification, not by silently shipping the originally-pitched,
   less-precise version.
