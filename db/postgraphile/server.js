// GDTRKB — PostGraphile API server (library mode)
//
// Runs PostGraphile via its library API instead of the CLI so
// graphileBuildOptions.connectionFilterRelations can be set to true — the
// CLI has no flag for it. The frontend's facet filters (runs-on/exports-to
// via toolPlatforms, area-of-use via toolAreaOfUses, language via
// toolLanguages) all filter through a relation with `some`/`every`/`none`,
// which postgraphile-plugin-connection-filter only exposes on ToolFilter
// when this option is enabled (default: false).
const http = require("http");
const { postgraphile } = require("postgraphile");
const ConnectionFilterPlugin = require("postgraphile-plugin-connection-filter");
const SimplifyInflectorPlugin = require("@graphile-contrib/pg-simplify-inflector");

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
  graphileBuildOptions: {
    connectionFilterRelations: true,
  },
  // Retry schema build instead of crashing if the DB isn't reachable yet on
  // container start (e.g. Neon cold-starting behind Railway).
  retryOnInitFail: true,
});

http.createServer(middleware).listen(port, "0.0.0.0", () => {
  console.log(`PostGraphile listening on 0.0.0.0:${port}`);
});
