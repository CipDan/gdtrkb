// GDTRKB — PostGraphile API server (library mode)
//
// Runs PostGraphile via its library API instead of the CLI so
// graphileBuildOptions.connectionFilterRelations can be set to true. The CLI
// itself has no flag for it; a .postgraphilerc.js file can also pass it
// through (the CLI spreads that file's whole `options` object into the same
// call this library API uses), but PostGraphile's own docs mark
// .postgraphilerc.js deprecated and slated for removal in v5, so this project
// uses the library API directly instead of relying on it. The frontend's
// facet filters (runs-on/exports-to via toolPlatforms, area-of-use via
// toolAreaOfUses, language via toolLanguages) all filter through a relation
// with `some`/`every`/`none`, which postgraphile-plugin-connection-filter
// only exposes on ToolFilter when this option is enabled (default: false).
const http = require("http");
const { postgraphile, makePluginHook } = require("postgraphile");
const ConnectionFilterPlugin = require("postgraphile-plugin-connection-filter");
const SimplifyInflectorPlugin = require("@graphile-contrib/pg-simplify-inflector");
const guardrails = require("./guardrails");

const port = process.env.PORT || 5000;

// Safe by default: GraphiQL stays off unless explicitly opted into (local/dev
// testing). Requires ENABLE_GRAPHIQL=true rather than defaulting on, since the
// prior default-on behavior shipped to the public Railway deployment
// unflipped (Dockerfile note [4]).
const enableGraphiql = process.env.ENABLE_GRAPHIQL === "true";

const middleware = postgraphile(process.env.DATABASE_URL, "public", {
  appendPlugins: [ConnectionFilterPlugin, SimplifyInflectorPlugin],
  disableDefaultMutations: true,
  graphiql: enableGraphiql,
  // Query depth + max page-size limits (guardrails.js) — the one hardening
  // item docs/deployment.md and schema-spec.md §6.1 flagged as needed for a
  // truly public endpoint. Wired via the plugin hook system rather than a
  // schema plugin, since these only need the request's AST/variables.
  pluginHook: makePluginHook([guardrails]),
  graphileBuildOptions: {
    connectionFilterRelations: true,
    // Public endpoint (ci-deploy-setup.md §3): restrict to exactly the
    // operators src/lib/search/buildFilter.ts sends (equalTo/in for exact
    // matches, includesInsensitive for the name/summary search box, isNull
    // for confirmedCommercialTitlesCount) so untrusted callers can't run
    // pattern ops (like/similarTo) or negations the app never uses.
    connectionFilterAllowedOperators: [
      "equalTo",
      "in",
      "includesInsensitive",
      "isNull",
    ],
    // No array columns or filtered computed-columns/setof-functions in the
    // schema today — off by default narrows the public surface at no cost.
    connectionFilterArrays: false,
    connectionFilterComputedColumns: false,
    connectionFilterSetofFunctions: false,
  },
  // Retry schema build instead of crashing if the DB isn't reachable yet on
  // container start (e.g. Neon cold-starting behind Railway).
  retryOnInitFail: true,
});

http.createServer(middleware).listen(port, "0.0.0.0", () => {
  console.log(`PostGraphile listening on 0.0.0.0:${port}`);
});
