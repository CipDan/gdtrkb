import "server-only";
import { GraphQLClient } from "graphql-request";

// Deliberately does not throw when unset: a missing/unreachable endpoint
// must surface as a request-time failure so callers hit the app's normal
// loading/error states (app-spec §7.9), not an unrecoverable crash — a
// module-load throw here would take down the root layout, which has no
// error boundary above it.
const endpoint = process.env.POSTGRAPHILE_URL ?? "";

export const graphqlClient = new GraphQLClient(endpoint);
