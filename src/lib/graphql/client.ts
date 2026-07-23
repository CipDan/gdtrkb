import "server-only";
import { GraphQLClient } from "graphql-request";

// Deliberately does not throw when unset: a missing/unreachable endpoint
// must surface as a request-time failure so callers hit the app's normal
// loading/error states (app-spec §7.9), not an unrecoverable crash — a
// module-load throw here would take down the root layout, which has no
// error boundary above it.
const endpoint = process.env.POSTGRAPHILE_URL ?? "";

export const graphqlClient = new GraphQLClient(endpoint);

export const GRAPHQL_TIMEOUT_MS = 5000;

// Bounds a GraphQL request so a stalled upstream can't hang the caller
// (e.g. an SSR render with no error boundary) indefinitely. Pass
// `signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS)` on the request too —
// Next's dev-mode fetch patch doesn't reliably honor the signal alone, so
// this timer is the actual bound.
export function withTimeout<T>(request: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("GraphQL request timed out")),
      GRAPHQL_TIMEOUT_MS,
    );
    request
      .then(resolve, (err: unknown) =>
        // Normalize: an aborted signal rejects with a DOMException — its
        // `message` is an inherited getter-only accessor (unlike a plain
        // Error's own writable property), which breaks Next's server error
        // normalization. DOMException is `instanceof Error` in Node, so
        // that check alone can't distinguish it.
        reject(
          err instanceof DOMException
            ? new Error(err.message, { cause: err })
            : err,
        ),
      )
      .finally(() => clearTimeout(timer));
  });
}
